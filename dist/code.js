"use strict";
const UI_WIDTH = 440;
const UI_HEIGHT = 720;
const COMPONENT_SEGMENT = "component";
const MATCHABLE_NODE_TYPES = new Set(["COMPONENT", "COMPONENT_SET"]);
const PROPERTY_ALIASES = {
    "fills.color": ["bg", "fill", "color", "background"],
    "strokes.color": ["border", "stroke", "stroke-color"],
    strokeWeight: ["stroke-weight", "border-width"],
    opacity: ["opacity"],
    width: ["width"],
    height: ["height"],
    topLeftRadius: ["top-left-radius", "radius", "border-radius"],
    topRightRadius: ["top-right-radius", "radius", "border-radius"],
    bottomLeftRadius: ["bottom-left-radius", "radius", "border-radius"],
    bottomRightRadius: ["bottom-right-radius", "radius", "border-radius"],
    paddingTop: ["padding-top", "padding"],
    paddingRight: ["padding-right", "padding"],
    paddingBottom: ["padding-bottom", "padding"],
    paddingLeft: ["padding-left", "padding"],
    itemSpacing: ["gap", "item-spacing", "spacing"],
    fontSize: ["font-size", "text-size"],
    fontFamily: ["font-family"],
    fontWeight: ["font-weight"]
};
const analysisState = new Map();
figma.showUI(__html__, { width: UI_WIDTH, height: UI_HEIGHT, themeColors: true });
void initialize();
async function initialize() {
    try {
        const analysis = await analyzeSelection();
        figma.ui.postMessage(analysis);
    }
    catch (error) {
        figma.ui.postMessage({
            type: "summary",
            bound: 0,
            skipped: 0,
            errors: [formatError(error)]
        });
    }
}
figma.on("selectionchange", () => {
    void initialize();
});
figma.ui.onmessage = async (message) => {
    if (message.type !== "confirm-bind") {
        return;
    }
    try {
        const result = await executeBindings(message);
        figma.ui.postMessage(result);
    }
    catch (error) {
        figma.ui.postMessage({
            type: "summary",
            bound: 0,
            skipped: 0,
            errors: [formatError(error)]
        });
    }
};
async function analyzeSelection() {
    analysisState.clear();
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const variables = await figma.variables.getLocalVariablesAsync();
    const collectionById = new Map(collections.map((collection) => [collection.id, collection]));
    const variableIndex = buildVariableIndex(variables, collectionById);
    seedBaseColorNames(variableIndex, collectionById);
    const preparedComponents = prepareSelection(figma.currentPage.selection);
    if (preparedComponents.length === 0) {
        return {
            type: "analysis",
            ready: [],
            unmatched: [],
            skippedBound: 0,
            selectionSummary: "Select at least one component or component set."
        };
    }
    const matches = await collectMatches(preparedComponents, variableIndex);
    for (const match of matches) {
        analysisState.set(match.id, match);
    }
    return {
        type: "analysis",
        ready: matches
            .filter((match) => match.matched)
            .map((match) => {
            var _a;
            return ({
                id: match.id,
                label: `${match.nodeName} · ${match.property}`,
                path: (_a = match.matchedVariablePath) !== null && _a !== void 0 ? _a : "",
                checked: true
            });
        }),
        unmatched: matches
            .filter((match) => !match.matched && !match.skippedBecauseBound)
            .map((match) => ({
            id: match.id,
            label: `${match.nodeName} · ${match.property}`,
            collectionKind: match.collectionKind,
            rawValue: rawValueToDisplay(match.rawValue),
            basePath: match.proposedBasePath,
            semanticPath: match.proposedSemanticPath,
            componentPath: match.proposedComponentPath,
            variantProperties: match.variantProperties,
            selectedVariantProperties: [...match.variantProperties]
        })),
        skippedBound: matches.filter((match) => match.skippedBecauseBound).length,
        selectionSummary: `Prepared ${preparedComponents.length} component${preparedComponents.length === 1 ? "" : "s"} for binding.`
    };
}
function buildVariableIndex(variables, collectionById) {
    const index = new Map();
    for (const variable of variables) {
        const collection = collectionById.get(variable.variableCollectionId);
        if (!collection) {
            continue;
        }
        insertVariableIntoIndex(index, variable, collection);
    }
    return index;
}
function insertVariableIntoIndex(index, variable, collection) {
    var _a;
    const fullPath = `${collection.name}/${variable.name}`;
    const normalizedPath = normalizeTokenPath(fullPath);
    const entry = {
        key: normalizedPath,
        collectionId: collection.id,
        collectionName: collection.name,
        variable,
        variablePath: fullPath,
        normalizedPath
    };
    const existing = (_a = index.get(normalizedPath)) !== null && _a !== void 0 ? _a : [];
    existing.push(entry);
    index.set(normalizedPath, existing);
}
function prepareSelection(selection) {
    const prepared = [];
    for (const node of selection) {
        if (!MATCHABLE_NODE_TYPES.has(node.type)) {
            continue;
        }
        if (node.type === "COMPONENT_SET") {
            for (const child of node.children) {
                if (child.type !== "COMPONENT") {
                    continue;
                }
                prepared.push({
                    node: child,
                    componentName: node.name,
                    variantSegments: extractVariantSegments(child, node)
                });
            }
            continue;
        }
        const componentNode = node;
        const parent = componentNode.parent;
        const variantSegments = parent && parent.type === "COMPONENT_SET" ? extractVariantSegments(componentNode, parent) : [];
        const componentName = parent && parent.type === "COMPONENT_SET" ? parent.name : componentNode.name;
        prepared.push({
            node: componentNode,
            componentName,
            variantSegments
        });
    }
    return prepared;
}
function extractVariantSegments(componentNode, componentSet) {
    const variantProperties = componentNode.variantProperties;
    if (variantProperties) {
        const segments = Object.entries(variantProperties).map(([property, value]) => ({
            property,
            value
        }));
        if (segments.length > 0) {
            return segments;
        }
    }
    const parsed = parseVariantSegments(componentNode.name);
    if (parsed.length > 0) {
        return parsed;
    }
    const variantPropertyNames = getVariantPropertyNames(componentSet);
    if (componentSet) {
        const rawParts = componentNode.name
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean);
        if (rawParts.length === variantPropertyNames.length && rawParts.every((part) => !part.includes("="))) {
            return rawParts.map((value, index) => ({
                property: variantPropertyNames[index],
                value
            }));
        }
    }
    if (variantPropertyNames.length === 1) {
        return [
            {
                property: variantPropertyNames[0],
                value: componentNode.name
            }
        ];
    }
    if (componentSet) {
        return [
            {
                property: "variant",
                value: componentNode.name
            }
        ];
    }
    return [];
}
function getVariantPropertyNames(componentSet) {
    var _a;
    if (!componentSet) {
        return [];
    }
    const groupPropertyNames = Object.keys((_a = componentSet.variantGroupProperties) !== null && _a !== void 0 ? _a : {});
    if (groupPropertyNames.length > 0) {
        return groupPropertyNames;
    }
    return Object.entries(componentSet.componentPropertyDefinitions)
        .filter(([, definition]) => definition.type === "VARIANT")
        .map(([propertyName]) => propertyName);
}
function parseVariantSegments(variantName) {
    return variantName
        .split(",")
        .map((segment) => segment.trim())
        .filter(Boolean)
        .map((segment) => {
        const [property, value] = segment.split("=").map((part) => part.trim());
        return property && value ? { property, value } : null;
    })
        .filter((segment) => segment !== null);
}
async function collectMatches(components, variableIndex) {
    const matches = [];
    const sharedPropertyIndex = buildSharedPropertyIndex(components);
    for (const component of components) {
        const nodes = walkNodes(component.node);
        for (const node of nodes) {
            const bindables = await inspectNodeBindings(node, component, variableIndex, sharedPropertyIndex);
            matches.push(...bindables);
        }
    }
    return matches;
}
function walkNodes(root) {
    if (root.type === "INSTANCE") {
        return [];
    }
    const nodes = [root];
    if ("children" in root) {
        for (const child of root.children) {
            if (child.type === "INSTANCE") {
                continue;
            }
            nodes.push(...walkNodes(child));
        }
    }
    return nodes;
}
async function inspectNodeBindings(node, component, variableIndex, sharedPropertyIndex) {
    var _a;
    const candidates = [];
    const bindables = extractBindableFields(node);
    for (const bindable of bindables) {
        const pathContext = getPathContext(node, component, bindable.property, bindable.rawValue, bindable.resolvedType, sharedPropertyIndex);
        const proposedChain = buildProposedChain(pathContext, node, bindable.property, bindable.rawValue);
        const existingBinding = await getExistingBindingName(node, bindable.property);
        if (existingBinding) {
            candidates.push({
                id: `${node.id}:${bindable.property}`,
                nodeId: node.id,
                nodeName: node.name,
                property: bindable.property,
                resolvedType: bindable.resolvedType,
                rawValue: bindable.rawValue,
                collectionKind: proposedChain.collectionKind,
                matched: false,
                proposedBasePath: proposedChain.basePath,
                proposedSemanticPath: proposedChain.semanticPath,
                proposedComponentPath: proposedChain.componentPath,
                candidatePaths: [],
                variantSegments: component.variantSegments,
                variantProperties: component.variantSegments.map((segment) => segment.property),
                pathComponentName: pathContext.componentName,
                pathVariantSegments: pathContext.variantSegments,
                skippedBecauseBound: true,
                existingBindingName: existingBinding
            });
            continue;
        }
        const match = findVariableMatch(node, bindable.property, pathContext, variableIndex);
        candidates.push({
            id: `${node.id}:${bindable.property}`,
            nodeId: node.id,
            nodeName: node.name,
            property: bindable.property,
            resolvedType: bindable.resolvedType,
            rawValue: bindable.rawValue,
            collectionKind: proposedChain.collectionKind,
            matched: Boolean(match),
            matchedVariableId: match === null || match === void 0 ? void 0 : match.variable.id,
            matchedVariablePath: match === null || match === void 0 ? void 0 : match.variablePath,
            proposedBasePath: proposedChain.basePath,
            proposedSemanticPath: proposedChain.semanticPath,
            proposedComponentPath: (_a = match === null || match === void 0 ? void 0 : match.variablePath) !== null && _a !== void 0 ? _a : proposedChain.componentPath,
            candidatePaths: buildCandidatePaths(proposedChain.collectionKind, pathContext, node, bindable.property),
            variantSegments: component.variantSegments,
            variantProperties: component.variantSegments.map((segment) => segment.property),
            pathComponentName: pathContext.componentName,
            pathVariantSegments: pathContext.variantSegments,
            skippedBecauseBound: false
        });
    }
    return candidates;
}
function extractBindableFields(node) {
    const items = [];
    const anyNode = node;
    if ("fills" in anyNode && Array.isArray(anyNode.fills)) {
        const fill = anyNode.fills.find((paint) => paint.type === "SOLID");
        if (fill) {
            items.push({ property: "fills.color", rawValue: solidPaintToRgba(fill), resolvedType: "COLOR" });
        }
    }
    if ("strokes" in anyNode && Array.isArray(anyNode.strokes)) {
        const stroke = anyNode.strokes.find((paint) => paint.type === "SOLID");
        if (stroke) {
            items.push({ property: "strokes.color", rawValue: solidPaintToRgba(stroke), resolvedType: "COLOR" });
            if (typeof anyNode.strokeWeight === "number") {
                items.push({ property: "strokeWeight", rawValue: anyNode.strokeWeight, resolvedType: "FLOAT" });
            }
        }
    }
    const numericFields = [
        "width",
        "height",
        "opacity",
        "topLeftRadius",
        "topRightRadius",
        "bottomLeftRadius",
        "bottomRightRadius",
        "paddingTop",
        "paddingRight",
        "paddingBottom",
        "paddingLeft",
        "itemSpacing"
    ];
    for (const field of numericFields) {
        if (typeof anyNode[field] === "number") {
            if (field === "width" && isHugDimension(node, "horizontal")) {
                continue;
            }
            if (field === "height" && isHugDimension(node, "vertical")) {
                continue;
            }
            if (field === "opacity" && isFullOpacity(anyNode[field])) {
                continue;
            }
            items.push({ property: field, rawValue: anyNode[field], resolvedType: "FLOAT" });
        }
    }
    if (node.type === "TEXT") {
        if (node.characters.length > 0) {
            items.push({ property: "fontSize", rawValue: numberOrZero(node.fontSize), resolvedType: "FLOAT" });
            if (node.fontName !== figma.mixed) {
                const fontName = node.fontName;
                items.push({
                    property: "fontFamily",
                    rawValue: fontName.family,
                    resolvedType: "STRING"
                });
            }
            if (typeof node.fontWeight === "number") {
                items.push({ property: "fontWeight", rawValue: node.fontWeight, resolvedType: "FLOAT" });
            }
        }
    }
    return items;
}
async function getExistingBindingName(node, property) {
    const binding = extractExistingBinding(node, property);
    if (!binding) {
        return null;
    }
    const variable = await figma.variables.getVariableByIdAsync(binding.id);
    return variable ? variable.name : binding.id;
}
function extractExistingBinding(node, property) {
    const anyNode = node;
    const bound = anyNode.boundVariables;
    if (!bound) {
        return null;
    }
    if (property === "fills.color") {
        const paints = bound.fills;
        if (Array.isArray(paints)) {
            for (const entry of paints) {
                if (!entry || typeof entry !== "object") {
                    continue;
                }
                const paintBinding = entry;
                if (paintBinding.color) {
                    return paintBinding.color;
                }
            }
        }
    }
    if (property === "strokes.color") {
        const paints = bound.strokes;
        if (Array.isArray(paints)) {
            for (const entry of paints) {
                if (!entry || typeof entry !== "object") {
                    continue;
                }
                const paintBinding = entry;
                if (paintBinding.color) {
                    return paintBinding.color;
                }
            }
        }
    }
    const directKey = property;
    const directBinding = bound[directKey];
    if (directBinding && !Array.isArray(directBinding) && "id" in directBinding) {
        return directBinding;
    }
    return null;
}
function findVariableMatch(node, property, pathContext, variableIndex) {
    const candidatePaths = buildCandidatePaths(getCollectionKind(property), pathContext, node, property);
    for (const candidatePath of candidatePaths) {
        const exact = variableIndex.get(candidatePath);
        if (exact === null || exact === void 0 ? void 0 : exact.length) {
            return exact[0];
        }
    }
    return null;
}
function buildCandidatePaths(collectionKind, pathContext, node, property) {
    return [buildComponentPath(collectionKind, pathContext, node, property)];
}
function buildComponentPath(collectionKind, pathContext, node, property) {
    const componentLeaf = getComponentLeaf(node, {
        node: null,
        componentName: pathContext.componentName,
        variantSegments: pathContext.variantSegments
    }, property);
    return [
        collectionKind,
        COMPONENT_SEGMENT,
        pathContext.componentName,
        ...pathContext.variantSegments.map((segment) => segment.value),
        componentLeaf
    ]
        .map((segment) => normalizeSegment(segment))
        .join("/");
}
function buildProposedChain(pathContext, node, property, rawValue) {
    const collectionKind = getCollectionKind(property);
    return {
        collectionKind,
        basePath: buildBasePath(collectionKind, property, rawValue),
        semanticPath: buildSemanticPath(collectionKind, pathContext, node, property, rawValue),
        componentPath: buildComponentPath(collectionKind, pathContext, node, property)
    };
}
function buildSemanticPath(collectionKind, pathContext, node, property, rawValue) {
    if (collectionKind === "colors") {
        return [
            "colors",
            "semantic",
            getSemanticColorRole(node, property),
            getSemanticDomain(pathContext.componentName),
            ...getSemanticSubtypeSegments(pathContext.componentName),
            ...pathContext.variantSegments.map((segment) => segment.value)
        ]
            .map((segment) => normalizeSegment(segment))
            .join("/");
    }
    if (collectionKind === "typography") {
        return ["typography", "semantic", normalizeSegment(node.name) || "text", getTypographyLeaf(property)]
            .map((segment) => normalizeSegment(segment))
            .join("/");
    }
    return ["device", "semantic", getDeviceBucket(property), formatNumberish(rawValue)]
        .map((segment) => normalizeSegment(segment))
        .join("/");
}
function buildScopedSemanticPath(collectionKind, pathContext, node, property, rawValue) {
    if (collectionKind === "colors") {
        return [
            "colors",
            "semantic",
            getSemanticColorRole(node, property),
            getSemanticDomain(pathContext.componentName),
            ...getSemanticSubtypeSegments(pathContext.componentName),
            ...pathContext.variantSegments.map((segment) => segment.value)
        ]
            .map((segment) => normalizeSegment(segment))
            .join("/");
    }
    if (collectionKind === "typography") {
        return ["typography", "semantic", pathContext.componentName, normalizeSegment(node.name) || "text", getTypographyLeaf(property)]
            .map((segment) => normalizeSegment(segment))
            .join("/");
    }
    return ["device", "semantic", pathContext.componentName, getDeviceBucket(property), formatNumberish(rawValue)]
        .map((segment) => normalizeSegment(segment))
        .join("/");
}
function buildBasePath(collectionKind, property, rawValue) {
    if (collectionKind === "colors") {
        const color = rawValue;
        return ["colors", "base", getBaseColorName(color), String(colorAlphaPercent(color))]
            .map((segment) => normalizeSegment(segment))
            .join("/");
    }
    if (collectionKind === "typography") {
        return ["typography", "base", getTypographyLeaf(property), formatNumberish(rawValue)]
            .map((segment) => normalizeSegment(segment))
            .join("/");
    }
    return ["device", "base", "size", formatNumberish(rawValue)]
        .map((segment) => normalizeSegment(segment))
        .join("/");
}
function getCollectionKind(property) {
    if (property === "fills.color" || property === "strokes.color") {
        return "colors";
    }
    if (property === "fontSize" || property === "fontFamily" || property === "fontWeight") {
        return "typography";
    }
    return "device";
}
function getComponentLeaf(node, component, property) {
    var _a;
    const collectionKind = getCollectionKind(property);
    if (collectionKind === "colors") {
        return getTokenLeaf(node, component, property);
    }
    if (collectionKind === "typography") {
        return `${normalizeSegment(node.name) || "text"}/${getTypographyLeaf(property)}`;
    }
    const groupedAlias = getGroupedAlias(node, property);
    if (groupedAlias) {
        return groupedAlias;
    }
    if (shouldUsePropertyAliasLeaf(node, component, property)) {
        return normalizeSegment((_a = PROPERTY_ALIASES[property][0]) !== null && _a !== void 0 ? _a : property);
    }
    const nodeName = normalizeSegment(node.name);
    const bucket = getDeviceBucket(property);
    return nodeName && component.node && node.id !== component.node.id ? `${nodeName}/${bucket}` : bucket;
}
function getSemanticColorRole(node, property) {
    if (property === "strokes.color") {
        return "border";
    }
    const nodeName = normalizeSegment(node.name);
    if (nodeName && !looksLikeVariantNodeName(node.name)) {
        return nodeName;
    }
    return "bg";
}
function getSemanticDomain(componentName) {
    var _a;
    const family = normalizeSegment((_a = componentName.split("/")[0]) !== null && _a !== void 0 ? _a : componentName);
    if (family === "button") {
        return "action";
    }
    return family || "surface";
}
function getSemanticSubtypeSegments(componentName) {
    const segments = componentName.split("/").map((segment) => normalizeSegment(segment)).filter(Boolean);
    return segments.slice(1);
}
function getTypographyLeaf(property) {
    if (property === "fontSize") {
        return "font-size";
    }
    if (property === "fontFamily") {
        return "font-family";
    }
    return "font-weight";
}
function getDeviceBucket(property) {
    var _a;
    switch (property) {
        case "itemSpacing":
            return "gap";
        case "paddingTop":
        case "paddingRight":
        case "paddingBottom":
        case "paddingLeft":
            return "spacing";
        case "topLeftRadius":
        case "topRightRadius":
        case "bottomLeftRadius":
        case "bottomRightRadius":
            return "radius";
        case "strokeWeight":
            return "stroke";
        case "width":
            return "width";
        case "height":
            return "height";
        case "opacity":
            return "opacity";
        default:
            return normalizeSegment((_a = PROPERTY_ALIASES[property][0]) !== null && _a !== void 0 ? _a : property);
    }
}
function formatNumberish(rawValue) {
    if (typeof rawValue === "number") {
        return String(rawValue);
    }
    if (typeof rawValue === "string") {
        return rawValue;
    }
    if (typeof rawValue === "object" && "family" in rawValue && "style" in rawValue) {
        return normalizeSegment(rawValue.family);
    }
    return rawValueToDisplay(rawValue);
}
function colorAlphaPercent(color) {
    const alpha = "a" in color ? color.a : 1;
    return Math.round(alpha * 100);
}
const baseColorNames = new Map();
function getBaseColorName(color) {
    const rgbKey = rgbaToHex({ r: color.r, g: color.g, b: color.b });
    const existing = baseColorNames.get(rgbKey);
    if (existing) {
        return existing;
    }
    const next = `color${baseColorNames.size + 1}`;
    baseColorNames.set(rgbKey, next);
    return next;
}
function seedBaseColorNames(variableIndex, collectionById) {
    var _a;
    baseColorNames.clear();
    for (const entry of [...variableIndex.values()].flat()) {
        const parts = entry.normalizedPath.split("/");
        if (parts[0] !== "colors" || parts[1] !== "base" || !((_a = parts[2]) === null || _a === void 0 ? void 0 : _a.startsWith("color"))) {
            continue;
        }
        const collection = collectionById.get(entry.collectionId);
        if (!collection) {
            continue;
        }
        const modeId = getDefaultModeId(collection);
        const value = entry.variable.valuesByMode[modeId];
        if (value && typeof value === "object" && "r" in value && "g" in value && "b" in value) {
            baseColorNames.set(rgbaToHex({ r: value.r, g: value.g, b: value.b }), parts[2]);
        }
    }
}
async function executeBindings(message) {
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const variables = await figma.variables.getLocalVariablesAsync();
    const collectionById = new Map(collections.map((collection) => [collection.id, collection]));
    const variableIndex = buildVariableIndex(variables, collectionById);
    seedBaseColorNames(variableIndex, collectionById);
    let bound = 0;
    let skipped = 0;
    const errors = [];
    for (const readyId of message.readyIds) {
        const candidate = analysisState.get(readyId);
        if (!candidate || !candidate.matchedVariableId) {
            skipped += 1;
            continue;
        }
        try {
            const variable = await figma.variables.getVariableByIdAsync(candidate.matchedVariableId);
            if (!variable) {
                throw new Error(`Missing variable for ${candidate.matchedVariablePath}`);
            }
            const node = await figma.getNodeByIdAsync(candidate.nodeId);
            if (!node) {
                throw new Error(`Missing node ${candidate.nodeName}`);
            }
            await bindVariableToNode(node, candidate.property, variable);
            bound += 1;
        }
        catch (error) {
            errors.push(`${candidate.nodeName} · ${candidate.property}: ${formatError(error)}`);
        }
    }
    for (const unmatched of message.unmatched) {
        const candidate = analysisState.get(unmatched.id);
        if (!candidate || unmatched.skip) {
            skipped += 1;
            continue;
        }
        try {
            const node = await figma.getNodeByIdAsync(candidate.nodeId);
            if (!node) {
                throw new Error(`Missing node ${candidate.nodeName}`);
            }
            const variable = await ensureVariableForCandidate(candidate, {
                createBaseVariables: message.createBaseVariables,
                basePath: unmatched.basePath,
                semanticPath: unmatched.semanticPath,
                componentPath: unmatched.componentPath,
                variantProperties: unmatched.variantProperties
            }, collections, variableIndex);
            await bindVariableToNode(node, candidate.property, variable);
            bound += 1;
        }
        catch (error) {
            errors.push(`${candidate.nodeName} · ${candidate.property}: ${formatError(error)}`);
        }
    }
    return {
        type: "summary",
        bound,
        skipped,
        errors
    };
}
async function ensureVariableForCandidate(candidate, options, collections, variableIndex) {
    const selectedVariantSegments = candidate.pathVariantSegments.filter((segment) => options.variantProperties.includes(segment.property));
    const pathContext = {
        componentName: candidate.pathComponentName,
        variantSegments: selectedVariantSegments
    };
    const componentPath = normalizeTokenPath(options.componentPath || buildComponentPath(candidate.collectionKind, pathContext, {
        id: candidate.nodeId,
        name: candidate.nodeName
    }, candidate.property));
    const semanticPath = normalizeTokenPath(options.semanticPath || buildSemanticPath(candidate.collectionKind, pathContext, {
        id: candidate.nodeId,
        name: candidate.nodeName
    }, candidate.property, candidate.rawValue));
    const basePath = normalizeTokenPath(options.basePath || buildBasePath(candidate.collectionKind, candidate.property, candidate.rawValue));
    let baseVariable = null;
    if (options.createBaseVariables) {
        baseVariable = await ensureChainVariable(basePath, candidate, collections, variableIndex, {
            kind: "base",
            rawValue: candidate.rawValue
        });
        await ensureGlobalColorBaseLadder(candidate, collections, variableIndex);
    }
    let resolvedSemanticPath = semanticPath;
    let semanticVariable;
    try {
        semanticVariable = await ensureChainVariable(semanticPath, candidate, collections, variableIndex, {
            kind: "semantic",
            rawValue: candidate.rawValue,
            aliasTarget: baseVariable
        });
    }
    catch (error) {
        if (!(error instanceof Error) || !error.message.startsWith("Conflict at")) {
            throw error;
        }
        resolvedSemanticPath = buildScopedSemanticPath(candidate.collectionKind, pathContext, {
            id: candidate.nodeId,
            name: candidate.nodeName
        }, candidate.property, candidate.rawValue);
        semanticVariable = await ensureChainVariable(resolvedSemanticPath, candidate, collections, variableIndex, {
            kind: "semantic",
            rawValue: candidate.rawValue,
            aliasTarget: baseVariable
        });
    }
    const componentVariable = await ensureChainVariable(componentPath, candidate, collections, variableIndex, {
        kind: "component",
        rawValue: candidate.rawValue,
        aliasTarget: semanticVariable
    });
    candidate.proposedBasePath = basePath;
    candidate.proposedSemanticPath = resolvedSemanticPath;
    candidate.proposedComponentPath = componentPath;
    return componentVariable;
}
async function ensureChainVariable(fullPath, candidate, collections, variableIndex, options) {
    var _a;
    const normalizedPath = normalizeTokenPath(fullPath);
    const existingByPath = (_a = variableIndex.get(normalizedPath)) === null || _a === void 0 ? void 0 : _a[0];
    if (existingByPath) {
        validateExistingVariableFit(existingByPath.variable, candidate, collections, options);
        return existingByPath.variable;
    }
    const segments = normalizedPath.split("/").filter(Boolean);
    if (segments.length < 3) {
        throw new Error(`Invalid variable path: ${fullPath}`);
    }
    const collection = getOrCreateCollection(collections, segments[0]);
    if (options.kind === "base") {
        const reused = findBaseVariableByExactValue(collection.name, candidate.resolvedType, options.rawValue, collection, variableIndex);
        if (reused) {
            insertVariableIntoIndex(variableIndex, reused, collection);
            return reused;
        }
    }
    const variable = figma.variables.createVariable(segments.slice(1).join("/"), collection, candidate.resolvedType);
    insertVariableIntoIndex(variableIndex, variable, collection);
    const modeId = getDefaultModeId(collection);
    if (options.aliasTarget) {
        variable.setValueForMode(modeId, figma.variables.createVariableAlias(options.aliasTarget));
    }
    else {
        variable.setValueForMode(modeId, toVariableValue(options.rawValue, candidate.resolvedType));
    }
    return variable;
}
function validateExistingVariableFit(variable, candidate, collections, options) {
    const collection = collections.find((item) => item.id === variable.variableCollectionId);
    if (!collection) {
        return;
    }
    const modeId = getDefaultModeId(collection);
    const currentValue = variable.valuesByMode[modeId];
    if (options.aliasTarget) {
        if (!currentValue || typeof currentValue !== "object" || !("id" in currentValue) || currentValue.id !== options.aliasTarget.id) {
            throw new Error(`Conflict at ${collection.name}/${variable.name}: existing alias does not match expected chain`);
        }
        return;
    }
    if (getComparableVariableValue(currentValue, candidate.resolvedType) !==
        getComparableVariableValue(options.rawValue, candidate.resolvedType)) {
        throw new Error(`Conflict at ${collection.name}/${variable.name}: existing value does not match new value`);
    }
}
function getOrCreateCollection(collections, collectionName) {
    const existing = collections.find((collection) => normalizeSegment(collection.name) === normalizeSegment(collectionName));
    if (existing) {
        return existing;
    }
    const created = figma.variables.createVariableCollection(collectionName);
    collections.push(created);
    return created;
}
function getDefaultModeId(collection) {
    var _a, _b;
    const modeId = (_a = collection.defaultModeId) !== null && _a !== void 0 ? _a : (_b = collection.modes[0]) === null || _b === void 0 ? void 0 : _b.modeId;
    if (!modeId) {
        throw new Error(`Collection ${collection.name} has no writable mode.`);
    }
    return modeId;
}
function findBaseVariableByExactValue(collectionName, resolvedType, rawValue, collection, variableIndex) {
    const expectedPrefix = `${normalizeSegment(collectionName)}/base/`;
    const expectedValue = getComparableVariableValue(rawValue, resolvedType);
    for (const entry of [...variableIndex.values()].flat()) {
        if (normalizeSegment(entry.collectionName) !== normalizeSegment(collectionName)) {
            continue;
        }
        if (!entry.normalizedPath.startsWith(expectedPrefix)) {
            continue;
        }
        if (entry.variable.resolvedType !== resolvedType) {
            continue;
        }
        const modeId = getDefaultModeId(collection);
        const currentValue = entry.variable.valuesByMode[modeId];
        if (getComparableVariableValue(currentValue, resolvedType) === expectedValue) {
            return entry.variable;
        }
    }
    return null;
}
function getComparableVariableValue(rawValue, resolvedType) {
    if (resolvedType === "COLOR") {
        return rgbaToHex(rawValue);
    }
    if (typeof rawValue === "number") {
        return String(rawValue);
    }
    if (typeof rawValue === "string") {
        return rawValue;
    }
    if (typeof rawValue === "object" && "family" in rawValue && "style" in rawValue) {
        return `${rawValue.family}/${rawValue.style}`;
    }
    return JSON.stringify(rawValue);
}
async function ensureGlobalColorBaseLadder(candidate, collections, variableIndex) {
    var _a;
    if (candidate.collectionKind !== "colors") {
        return;
    }
    const ladder = collectBaseColorAlphaLadder(variableIndex);
    ladder.add(colorAlphaPercent(candidate.rawValue));
    const colorEntries = collectBaseColorEntries(variableIndex);
    for (const [colorName, rgbHex] of colorEntries.entries()) {
        const rgb = hexToRgb(rgbHex);
        for (const alpha of ladder) {
            const ladderPath = ["colors", "base", colorName, String(alpha)]
                .map((segment) => normalizeSegment(segment))
                .join("/");
            if ((_a = variableIndex.get(ladderPath)) === null || _a === void 0 ? void 0 : _a.length) {
                continue;
            }
            const colorValue = {
                r: rgb.r,
                g: rgb.g,
                b: rgb.b,
                a: alpha / 100
            };
            await ensureChainVariable(ladderPath, candidate, collections, variableIndex, {
                kind: "base",
                rawValue: colorValue
            });
        }
    }
}
function collectBaseColorAlphaLadder(variableIndex) {
    const ladder = new Set([100, 80, 60, 40, 20, 10, 0]);
    for (const entry of [...variableIndex.values()].flat()) {
        const parts = entry.normalizedPath.split("/");
        if (parts[0] !== "colors" || parts[1] !== "base" || !parts[3]) {
            continue;
        }
        const alpha = Number(parts[3]);
        if (!Number.isNaN(alpha)) {
            ladder.add(alpha);
        }
    }
    return ladder;
}
function collectBaseColorEntries(variableIndex) {
    const entries = new Map();
    for (const entry of [...variableIndex.values()].flat()) {
        const parts = entry.normalizedPath.split("/");
        if (parts[0] !== "colors" || parts[1] !== "base" || !parts[2]) {
            continue;
        }
        const firstModeValue = Object.values(entry.variable.valuesByMode)[0];
        const value = firstModeValue;
        if (value && typeof value === "object" && "r" in value && "g" in value && "b" in value) {
            entries.set(parts[2], rgbaToHex({ r: value.r, g: value.g, b: value.b }));
        }
    }
    for (const [rgbHex, colorName] of baseColorNames.entries()) {
        entries.set(colorName, rgbHex);
    }
    return entries;
}
function hexToRgb(hex) {
    const clean = hex.replace("#", "").slice(0, 6);
    return {
        r: parseInt(clean.slice(0, 2), 16) / 255,
        g: parseInt(clean.slice(2, 4), 16) / 255,
        b: parseInt(clean.slice(4, 6), 16) / 255
    };
}
function buildSharedPropertyIndex(components) {
    var _a, _b, _c;
    const observations = new Map();
    for (const component of components) {
        for (const node of walkNodes(component.node)) {
            const bindables = extractBindableFields(node);
            for (const bindable of bindables) {
                const leaf = getSharedLeaf(node, component, bindable.property);
                const key = `${leaf}|${bindable.property}`;
                const componentValues = (_a = observations.get(key)) !== null && _a !== void 0 ? _a : new Map();
                const observation = (_b = componentValues.get(component.componentName)) !== null && _b !== void 0 ? _b : {
                    values: new Set(),
                    count: 0
                };
                observation.values.add(getComparableRawValue(bindable.rawValue, bindable.resolvedType));
                observation.count += 1;
                componentValues.set(component.componentName, observation);
                observations.set(key, componentValues);
            }
        }
    }
    const sharedIndex = new Map();
    for (const [key, componentValues] of observations.entries()) {
        const componentsByValue = new Map();
        for (const [componentName, observation] of componentValues.entries()) {
            if (observation.values.size !== 1) {
                continue;
            }
            const [value] = [...observation.values];
            const names = (_c = componentsByValue.get(value)) !== null && _c !== void 0 ? _c : [];
            names.push(componentName);
            componentsByValue.set(value, names);
        }
        for (const [value, componentNames] of componentsByValue.entries()) {
            const repeatedWithinOneComponent = componentNames.some((componentName) => {
                const observation = componentValues.get(componentName);
                return observation ? observation.count > 1 && observation.values.has(value) : false;
            });
            if (componentNames.length < 2 && !repeatedWithinOneComponent) {
                continue;
            }
            const commonPrefix = findCommonComponentPrefix(componentNames);
            if (!commonPrefix) {
                continue;
            }
            sharedIndex.set(key, commonPrefix);
        }
    }
    return sharedIndex;
}
function getPathContext(node, component, property, rawValue, resolvedType, sharedPropertyIndex) {
    const leaf = getSharedLeaf(node, component, property);
    const sharedKey = `${leaf}|${property}`;
    const sharedComponentName = sharedPropertyIndex.get(sharedKey);
    if (sharedComponentName &&
        isComponentWithinSharedPrefix(component.componentName, sharedComponentName) &&
        hasMatchingSharedValue(component, node, property, rawValue, resolvedType, sharedComponentName)) {
        return {
            componentName: sharedComponentName,
            variantSegments: []
        };
    }
    return {
        componentName: component.componentName,
        variantSegments: component.variantSegments
    };
}
function getSharedLeaf(node, component, property) {
    return getCollectionKind(property) === "device"
        ? getComponentLeaf(node, component, property)
        : getTokenLeaf(node, component, property);
}
function getComparableRawValue(rawValue, resolvedType) {
    if (resolvedType === "COLOR") {
        return rgbaToHex(rawValue);
    }
    if (typeof rawValue === "number") {
        return String(rawValue);
    }
    if (typeof rawValue === "string") {
        return rawValue;
    }
    if (typeof rawValue === "object" && "family" in rawValue && "style" in rawValue) {
        return `${rawValue.family}/${rawValue.style}`;
    }
    return JSON.stringify(rawValue);
}
function findCommonComponentPrefix(componentNames) {
    if (componentNames.length === 0) {
        return "";
    }
    const splitNames = componentNames.map((name) => name.split("/").map((part) => part.trim()).filter(Boolean));
    const first = splitNames[0];
    const sharedParts = [];
    for (let index = 0; index < first.length; index += 1) {
        const part = first[index];
        if (splitNames.every((segments) => segments[index] === part)) {
            sharedParts.push(part);
            continue;
        }
        break;
    }
    return sharedParts.join("/");
}
function isComponentWithinSharedPrefix(componentName, sharedPrefix) {
    if (!sharedPrefix) {
        return false;
    }
    return componentName === sharedPrefix || componentName.startsWith(`${sharedPrefix}/`);
}
function hasMatchingSharedValue(component, node, property, rawValue, resolvedType, sharedComponentName) {
    return isComponentWithinSharedPrefix(component.componentName, sharedComponentName) &&
        getComparableRawValue(rawValue, resolvedType).length > 0;
}
async function bindVariableToNode(node, property, variable) {
    if (property === "fills.color") {
        if (!("fills" in node) || !Array.isArray(node.fills)) {
            throw new Error("Node does not support fill binding.");
        }
        const paints = [...node.fills];
        const index = paints.findIndex((paint) => paint.type === "SOLID");
        if (index < 0) {
            throw new Error("No solid fill available to bind.");
        }
        paints[index] = figma.variables.setBoundVariableForPaint(paints[index], "color", variable);
        node.fills = paints;
        return;
    }
    if (property === "strokes.color") {
        if (!("strokes" in node) || !Array.isArray(node.strokes)) {
            throw new Error("Node does not support stroke binding.");
        }
        const paints = [...node.strokes];
        const index = paints.findIndex((paint) => paint.type === "SOLID");
        if (index < 0) {
            throw new Error("No solid stroke available to bind.");
        }
        paints[index] = figma.variables.setBoundVariableForPaint(paints[index], "color", variable);
        node.strokes = paints;
        return;
    }
    if (node.type === "TEXT" && (property === "fontSize" || property === "fontFamily" || property === "fontWeight")) {
        const textNode = node;
        if (textNode.characters.length === 0) {
            throw new Error("Empty text nodes cannot be bound.");
        }
        if (textNode.setRangeBoundVariable) {
            textNode.setRangeBoundVariable(0, textNode.characters.length, property, variable);
            return;
        }
    }
    const bindableNode = node;
    if (!bindableNode.setBoundVariable) {
        throw new Error("Node does not support direct variable binding.");
    }
    bindableNode.setBoundVariable(property, variable);
}
function collectionNames(variableIndex) {
    return [...new Set([...variableIndex.values()].flat().map((entry) => entry.collectionName))];
}
function firstCollectionName(variableIndex) {
    return collectionNames(variableIndex)[0];
}
function normalizeTokenPath(value) {
    return value
        .split("/")
        .map((segment) => normalizeSegment(segment))
        .filter(Boolean)
        .join("/");
}
function normalizeSegment(value) {
    return value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9/_-]+/g, "");
}
function rawValueToDisplay(rawValue) {
    if (typeof rawValue === "number") {
        return String(rawValue);
    }
    if (typeof rawValue === "string") {
        return rawValue;
    }
    if ("family" in rawValue && "style" in rawValue) {
        return `${rawValue.family} ${rawValue.style}`;
    }
    const rgba = rawValue;
    return rgbaToHex(rgba);
}
function rgbaToHex(color) {
    const to255 = (value) => Math.round(Math.max(0, Math.min(1, value)) * 255);
    const red = to255(color.r).toString(16).padStart(2, "0");
    const green = to255(color.g).toString(16).padStart(2, "0");
    const blue = to255(color.b).toString(16).padStart(2, "0");
    const alpha = "a" in color ? to255(color.a).toString(16).padStart(2, "0") : "";
    return `#${red}${green}${blue}${alpha}`.toUpperCase();
}
function solidPaintToRgba(paint) {
    var _a;
    return {
        r: paint.color.r,
        g: paint.color.g,
        b: paint.color.b,
        a: (_a = paint.opacity) !== null && _a !== void 0 ? _a : 1
    };
}
function toVariableValue(rawValue, resolvedType) {
    if (resolvedType === "COLOR") {
        if (typeof rawValue === "object" && "r" in rawValue && "g" in rawValue && "b" in rawValue) {
            return rawValue;
        }
        throw new Error("Expected color value.");
    }
    if (resolvedType === "FLOAT") {
        if (typeof rawValue === "number") {
            return rawValue;
        }
        throw new Error("Expected numeric value.");
    }
    if (resolvedType === "STRING") {
        if (typeof rawValue === "string") {
            return rawValue;
        }
        if (typeof rawValue === "object" && "family" in rawValue && "style" in rawValue) {
            return `${rawValue.family}/${rawValue.style}`;
        }
        throw new Error("Expected string value.");
    }
    throw new Error(`Unsupported variable type: ${resolvedType}`);
}
function numberOrZero(value) {
    return typeof value === "number" ? value : 0;
}
function getTokenLeaf(node, component, property) {
    var _a;
    const primaryAlias = normalizeSegment((_a = PROPERTY_ALIASES[property][0]) !== null && _a !== void 0 ? _a : property);
    const layerSegment = normalizeSegment(node.name);
    const groupedAlias = getGroupedAlias(node, property);
    if (groupedAlias) {
        return groupedAlias;
    }
    if (shouldUsePropertyAliasLeaf(node, component, property)) {
        return primaryAlias;
    }
    if (shouldUseLayerAndPropertyLeaf(property, layerSegment)) {
        return `${layerSegment}/${primaryAlias}`;
    }
    return layerSegment || primaryAlias;
}
function getGroupedAlias(node, property) {
    if (isPaddingProperty(property) &&
        hasEqualNumericValues(node, "paddingTop", "paddingRight") &&
        hasEqualNumericValues(node, "paddingTop", "paddingBottom") &&
        hasEqualNumericValues(node, "paddingTop", "paddingLeft")) {
        return "padding";
    }
    if (isHorizontalPaddingProperty(property) && hasEqualNumericValues(node, "paddingLeft", "paddingRight")) {
        return "padding-horizontal";
    }
    if (isVerticalPaddingProperty(property) && hasEqualNumericValues(node, "paddingTop", "paddingBottom")) {
        return "padding-vertical";
    }
    if (isRadiusProperty(property) &&
        hasEqualNumericValues(node, "topLeftRadius", "topRightRadius") &&
        hasEqualNumericValues(node, "topLeftRadius", "bottomLeftRadius") &&
        hasEqualNumericValues(node, "topLeftRadius", "bottomRightRadius")) {
        return "radius";
    }
    if (isHorizontalRadiusProperty(property) && hasEqualNumericValues(node, "topLeftRadius", "topRightRadius")) {
        return "radius-top";
    }
    if (isHorizontalBottomRadiusProperty(property) && hasEqualNumericValues(node, "bottomLeftRadius", "bottomRightRadius")) {
        return "radius-bottom";
    }
    return null;
}
function shouldUsePropertyAliasLeaf(node, component, property) {
    if (component.node && node.id === component.node.id) {
        return true;
    }
    if (looksLikeVariantNodeName(node.name)) {
        return true;
    }
    return (property === "opacity" ||
        property === "paddingTop" ||
        property === "paddingRight" ||
        property === "paddingBottom" ||
        property === "paddingLeft" ||
        property === "itemSpacing" ||
        property === "topLeftRadius" ||
        property === "topRightRadius" ||
        property === "bottomLeftRadius" ||
        property === "bottomRightRadius") && !normalizeSegment(node.name);
}
function shouldUseLayerAndPropertyLeaf(property, layerSegment) {
    if (!layerSegment) {
        return false;
    }
    return (property === "strokes.color" ||
        property === "strokeWeight" ||
        property === "opacity" ||
        property === "width" ||
        property === "height" ||
        property === "fontSize" ||
        property === "fontFamily" ||
        property === "fontWeight" ||
        property === "paddingTop" ||
        property === "paddingRight" ||
        property === "paddingBottom" ||
        property === "paddingLeft" ||
        property === "itemSpacing" ||
        property === "topLeftRadius" ||
        property === "topRightRadius" ||
        property === "bottomLeftRadius" ||
        property === "bottomRightRadius");
}
function looksLikeVariantNodeName(value) {
    return value.includes("=") && /[a-z]/i.test(value);
}
function hasEqualNumericValues(node, first, second) {
    const firstValue = getNumericNodeValue(node, first);
    const secondValue = getNumericNodeValue(node, second);
    return firstValue !== null && secondValue !== null && Math.abs(firstValue - secondValue) < 0.0001;
}
function getNumericNodeValue(node, field) {
    const value = node[field];
    return typeof value === "number" ? value : null;
}
function isHugDimension(node, axis) {
    const field = axis === "horizontal" ? "layoutSizingHorizontal" : "layoutSizingVertical";
    return node[field] === "HUG";
}
function isPaddingProperty(property) {
    return (property === "paddingTop" ||
        property === "paddingRight" ||
        property === "paddingBottom" ||
        property === "paddingLeft");
}
function isHorizontalPaddingProperty(property) {
    return property === "paddingLeft" || property === "paddingRight";
}
function isVerticalPaddingProperty(property) {
    return property === "paddingTop" || property === "paddingBottom";
}
function isRadiusProperty(property) {
    return (property === "topLeftRadius" ||
        property === "topRightRadius" ||
        property === "bottomLeftRadius" ||
        property === "bottomRightRadius");
}
function isHorizontalRadiusProperty(property) {
    return property === "topLeftRadius" || property === "topRightRadius";
}
function isHorizontalBottomRadiusProperty(property) {
    return property === "bottomLeftRadius" || property === "bottomRightRadius";
}
function isFullOpacity(value) {
    return Math.abs(value - 1) < 0.0001 || Math.abs(value - 100) < 0.0001;
}
function formatError(error) {
    return error instanceof Error ? error.message : String(error);
}
