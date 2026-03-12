"use strict";
const UI_WIDTH = 440;
const UI_HEIGHT = 720;
const COMPONENT_SEGMENT = "component";
const MATCHABLE_NODE_TYPES = new Set(["COMPONENT", "COMPONENT_SET"]);
const PROPERTY_ALIASES = {
    "fills.color": ["bg", "fill", "color", "background"],
    "fills.opacity": ["fill-opacity", "opacity"],
    "strokes.color": ["border", "stroke", "stroke-color"],
    opacity: ["opacity"],
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
    fontName: ["font-name", "font-family", "font-style"],
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
            .map((match) => ({
            id: match.id,
            label: `${match.nodeName} · ${match.property}`,
            path: match.matchedVariablePath ?? "",
            checked: true
        })),
        unmatched: matches
            .filter((match) => !match.matched && !match.skippedBecauseBound)
            .map((match) => ({
            id: match.id,
            label: `${match.nodeName} · ${match.property}`,
            rawValue: rawValueToDisplay(match.rawValue),
            proposedPath: match.proposedPath,
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
        const fullPath = `${collection.name}/${variable.name}`;
        const normalizedPath = normalizeTokenPath(fullPath);
        if (!normalizedPath.includes(`/${COMPONENT_SEGMENT}/`)) {
            continue;
        }
        const entry = {
            key: normalizedPath,
            collectionId: collection.id,
            collectionName: collection.name,
            variable,
            variablePath: fullPath,
            normalizedPath
        };
        const existing = index.get(normalizedPath) ?? [];
        existing.push(entry);
        index.set(normalizedPath, existing);
    }
    return index;
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
                    variantSegments: parseVariantSegments(child.name)
                });
            }
            continue;
        }
        const componentNode = node;
        const parent = componentNode.parent;
        const variantSegments = parent && parent.type === "COMPONENT_SET" ? parseVariantSegments(componentNode.name) : [];
        const componentName = parent && parent.type === "COMPONENT_SET" ? parent.name : componentNode.name;
        prepared.push({
            node: componentNode,
            componentName,
            variantSegments
        });
    }
    return prepared;
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
    for (const component of components) {
        const nodes = walkNodes(component.node);
        for (const node of nodes) {
            const bindables = await inspectNodeBindings(node, component, variableIndex);
            matches.push(...bindables);
        }
    }
    return matches;
}
function walkNodes(root) {
    const nodes = [root];
    if ("children" in root) {
        for (const child of root.children) {
            nodes.push(...walkNodes(child));
        }
    }
    return nodes;
}
async function inspectNodeBindings(node, component, variableIndex) {
    const candidates = [];
    const bindables = extractBindableFields(node);
    for (const bindable of bindables) {
        const existingBinding = await getExistingBindingName(node, bindable.property);
        if (existingBinding) {
            candidates.push({
                id: `${node.id}:${bindable.property}`,
                nodeId: node.id,
                nodeName: node.name,
                property: bindable.property,
                resolvedType: bindable.resolvedType,
                rawValue: bindable.rawValue,
                matched: false,
                proposedCollectionName: firstCollectionName(variableIndex) ?? "Semantic",
                proposedPath: "",
                candidatePaths: [],
                variantSegments: component.variantSegments,
                variantProperties: component.variantSegments.map((segment) => segment.property),
                skippedBecauseBound: true,
                existingBindingName: existingBinding
            });
            continue;
        }
        const match = findVariableMatch(node.name, bindable.property, component, variableIndex);
        candidates.push({
            id: `${node.id}:${bindable.property}`,
            nodeId: node.id,
            nodeName: node.name,
            property: bindable.property,
            resolvedType: bindable.resolvedType,
            rawValue: bindable.rawValue,
            matched: Boolean(match),
            matchedVariableId: match?.variable.id,
            matchedVariablePath: match?.variablePath,
            proposedCollectionName: match?.collectionName ?? firstCollectionName(variableIndex) ?? "Semantic",
            proposedPath: match?.variablePath ?? proposePath(firstCollectionName(variableIndex) ?? "Semantic", component, node.name, bindable.property),
            candidatePaths: buildCandidatePaths(firstCollectionName(variableIndex) ?? "Semantic", component, node.name, bindable.property),
            variantSegments: component.variantSegments,
            variantProperties: component.variantSegments.map((segment) => segment.property),
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
            items.push({ property: "fills.color", rawValue: fill.color, resolvedType: "COLOR" });
            items.push({ property: "fills.opacity", rawValue: fill.opacity ?? 1, resolvedType: "FLOAT" });
        }
    }
    if ("strokes" in anyNode && Array.isArray(anyNode.strokes)) {
        const stroke = anyNode.strokes.find((paint) => paint.type === "SOLID");
        if (stroke) {
            items.push({ property: "strokes.color", rawValue: stroke.color, resolvedType: "COLOR" });
        }
    }
    const numericFields = [
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
            items.push({ property: field, rawValue: anyNode[field], resolvedType: "FLOAT" });
        }
    }
    if (node.type === "TEXT") {
        if (node.characters.length > 0) {
            items.push({ property: "fontSize", rawValue: numberOrZero(node.fontSize), resolvedType: "FLOAT" });
            if (node.fontName !== figma.mixed) {
                const fontName = node.fontName;
                items.push({
                    property: "fontName",
                    rawValue: { family: fontName.family, style: fontName.style },
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
    if (property === "fills.color" || property === "fills.opacity") {
        const paints = bound.fills;
        if (Array.isArray(paints)) {
            for (const entry of paints) {
                if (!entry || typeof entry !== "object") {
                    continue;
                }
                const paintBinding = entry;
                const key = property === "fills.color" ? "color" : "opacity";
                if (paintBinding[key]) {
                    return paintBinding[key];
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
function findVariableMatch(layerName, property, component, variableIndex) {
    for (const collectionName of collectionNames(variableIndex)) {
        const candidatePaths = buildCandidatePaths(collectionName, component, layerName, property);
        for (const candidatePath of candidatePaths) {
            const exact = variableIndex.get(candidatePath);
            if (exact?.length) {
                return exact[0];
            }
        }
        for (const candidatePath of candidatePaths) {
            const fuzzy = [...variableIndex.values()].flat().find((entry) => entry.normalizedPath.includes(candidatePath));
            if (fuzzy) {
                return fuzzy;
            }
        }
    }
    return null;
}
function buildCandidatePaths(collectionName, component, layerName, property) {
    const baseSegments = [
        normalizeSegment(collectionName),
        COMPONENT_SEGMENT,
        normalizeSegment(component.componentName),
        ...component.variantSegments.map((segment) => normalizeSegment(segment.value))
    ];
    const layerSegment = normalizeSegment(layerName);
    const aliases = PROPERTY_ALIASES[property];
    const leafs = new Set([
        layerSegment,
        ...aliases.map((alias) => normalizeSegment(alias)),
        ...aliases.map((alias) => `${layerSegment}/${normalizeSegment(alias)}`)
    ]);
    const candidates = [];
    for (const leaf of leafs) {
        if (!leaf) {
            continue;
        }
        candidates.push(normalizeTokenPath([...baseSegments, leaf].join("/")));
    }
    return candidates;
}
function proposePath(collectionName, component, layerName, property, allowedVariantProperties) {
    const filteredSegments = allowedVariantProperties === undefined
        ? component.variantSegments
        : component.variantSegments.filter((segment) => allowedVariantProperties.includes(segment.property));
    const aliases = PROPERTY_ALIASES[property];
    const lastSegment = normalizeSegment(layerName) || normalizeSegment(aliases[0]);
    return [
        collectionName,
        COMPONENT_SEGMENT,
        component.componentName,
        ...filteredSegments.map((segment) => segment.value),
        lastSegment
    ]
        .map((segment) => normalizeSegment(segment))
        .join("/");
}
async function executeBindings(message) {
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const variables = await figma.variables.getLocalVariablesAsync();
    const collectionById = new Map(collections.map((collection) => [collection.id, collection]));
    const variableIndex = buildVariableIndex(variables, collectionById);
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
            const variable = await ensureVariableForCandidate(candidate, unmatched.path, unmatched.variantProperties, collections, variableIndex);
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
async function ensureVariableForCandidate(candidate, editedPath, selectedVariantProperties, collections, variableIndex) {
    const normalizedEditedPath = normalizeTokenPath(editedPath);
    const existing = variableIndex.get(normalizedEditedPath)?.[0];
    if (existing) {
        return existing.variable;
    }
    const segments = normalizedEditedPath.split("/").filter(Boolean);
    if (segments.length < 4 || segments[1] !== COMPONENT_SEGMENT) {
        throw new Error("Variable path must follow {CollectionName}/component/{ComponentName}/.../{variableName}");
    }
    const collectionName = segments[0];
    const variableName = segments.slice(1).join("/");
    let collection = collections.find((item) => normalizeSegment(item.name) === normalizeSegment(collectionName));
    if (!collection) {
        collection = figma.variables.createVariableCollection(collectionName);
        collections.push(collection);
    }
    const variable = figma.variables.createVariable(variableName, collection, candidate.resolvedType);
    const modeId = collection.defaultModeId ?? collection.modes[0]?.modeId;
    if (!modeId) {
        throw new Error(`Collection ${collection.name} has no writable mode.`);
    }
    variable.setValueForMode(modeId, toVariableValue(candidate.rawValue, candidate.resolvedType));
    const component = {
        componentName: segments[2],
        node: null,
        variantSegments: candidate.variantSegments.filter((segment) => selectedVariantProperties.includes(segment.property))
    };
    candidate.proposedPath = proposePath(collection.name, component, candidate.nodeName, candidate.property, selectedVariantProperties);
    return variable;
}
async function bindVariableToNode(node, property, variable) {
    if (property === "fills.color" || property === "fills.opacity") {
        if (!("fills" in node) || !Array.isArray(node.fills)) {
            throw new Error("Node does not support fill binding.");
        }
        const paints = [...node.fills];
        const index = paints.findIndex((paint) => paint.type === "SOLID");
        if (index < 0) {
            throw new Error("No solid fill available to bind.");
        }
        const field = property === "fills.color" ? "color" : "opacity";
        paints[index] = figma.variables.setBoundVariableForPaint(paints[index], field, variable);
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
    if (node.type === "TEXT" && (property === "fontSize" || property === "fontName" || property === "fontWeight")) {
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
function formatError(error) {
    return error instanceof Error ? error.message : String(error);
}
