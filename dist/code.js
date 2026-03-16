"use strict";
const UI_WIDTH = 1200;
const UI_HEIGHT = 760;
const COMPONENT_SEGMENT = "component";
const MATCHABLE_NODE_TYPES = new Set(["COMPONENT", "COMPONENT_SET"]);
const PROPERTY_ALIASES = {
    "fills.color": ["bg", "fill", "color", "background"],
    "strokes.color": ["stroke", "border", "stroke-color"],
    strokeWeight: ["stroke", "stroke-weight", "border-width"],
    "effects.color": ["effect-color", "shadow-color"],
    "effects.radius": ["effect-radius", "shadow-radius", "blur-radius"],
    "effects.spread": ["effect-spread", "shadow-spread"],
    "effects.offsetX": ["effect-offset-x", "shadow-offset-x"],
    "effects.offsetY": ["effect-offset-y", "shadow-offset-y"],
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
    fontWeight: ["font-weight"],
    lineHeight: ["line-height"],
    letterSpacing: ["letter-spacing"],
    paragraphSpacing: ["paragraph-spacing"],
    paragraphIndent: ["paragraph-indent"]
};
const analysisState = new Map();
const defaultScanSettings = {
    colorsScanMode: "selected-objects-with-internal-layers",
    typographyScanMode: "selected-objects-with-semantic-internal-layers",
    deviceScanMode: "selected-objects",
    enabledFamilies: {
        colors: true,
        typography: true,
        spacing: true,
        radius: true,
        size: true,
        border: true,
        opacity: true
    },
    semanticAllowlist: [],
    semanticDenylist: [
        "primary",
        "secondary",
        "tertiary",
        "subtract",
        "vector",
        "shape",
        "group",
        "union",
        "path",
        "frame",
        "rectangle",
        "ellipse",
        "polygon",
        "line",
        "star",
        "boolean-operation",
        "mask"
    ]
};
let currentScanSettings = Object.assign(Object.assign({}, defaultScanSettings), { enabledFamilies: Object.assign({}, defaultScanSettings.enabledFamilies), semanticAllowlist: [...defaultScanSettings.semanticAllowlist], semanticDenylist: [...defaultScanSettings.semanticDenylist] });
figma.showUI(__html__, { width: UI_WIDTH, height: UI_HEIGHT, themeColors: true });
void initialize();
async function initialize() {
    try {
        const analysis = await analyzeSelection(currentScanSettings);
        figma.ui.postMessage(analysis);
    }
    catch (error) {
        figma.ui.postMessage({
            type: "summary",
            executionMode: "create-and-bind",
            bound: 0,
            created: 0,
            skipped: 0,
            errors: [formatError(error)]
        });
    }
}
figma.on("selectionchange", () => {
    void initialize();
});
figma.ui.onmessage = async (message) => {
    var _a, _b, _c, _d;
    if (message.type === "resize-ui") {
        figma.ui.resize(message.width, message.height);
        return;
    }
    if (message.type === "request-analysis") {
        currentScanSettings = Object.assign(Object.assign(Object.assign({}, currentScanSettings), message.settings), { enabledFamilies: Object.assign(Object.assign({}, currentScanSettings.enabledFamilies), ((_b = (_a = message.settings) === null || _a === void 0 ? void 0 : _a.enabledFamilies) !== null && _b !== void 0 ? _b : {})), semanticAllowlist: ((_c = message.settings) === null || _c === void 0 ? void 0 : _c.semanticAllowlist)
                ? [...message.settings.semanticAllowlist]
                : currentScanSettings.semanticAllowlist, semanticDenylist: ((_d = message.settings) === null || _d === void 0 ? void 0 : _d.semanticDenylist)
                ? [...message.settings.semanticDenylist]
                : currentScanSettings.semanticDenylist });
        await initialize();
        return;
    }
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
            executionMode: "create-and-bind",
            bound: 0,
            created: 0,
            skipped: 0,
            errors: [formatError(error)]
        });
    }
};
async function analyzeSelection(scanSettings) {
    analysisState.clear();
    const debug = [];
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
            alreadyBound: [],
            unmatched: [],
            skippedItems: [],
            conflicts: [],
            skippedBound: 0,
            selectionSummary: "Select a component, component set, or a layer inside a component.",
            settings: scanSettings,
            debug
        };
    }
    const { matches, skippedItems } = await collectMatches(preparedComponents, variableIndex, scanSettings, debug);
    for (const match of matches) {
        analysisState.set(match.id, match);
    }
    const unmatchedCandidates = matches.filter((match) => !match.matched && !match.skippedBecauseBound);
    const conflictItems = await preflightConflicts(unmatchedCandidates, collections, variableIndex);
    const conflictIds = new Set(conflictItems.map((item) => item.id));
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
        alreadyBound: matches
            .filter((match) => match.skippedBecauseBound)
            .map((match) => {
            var _a;
            return ({
                id: match.id,
                label: `${match.nodeName} · ${match.property}`,
                path: (_a = match.existingBindingName) !== null && _a !== void 0 ? _a : ""
            });
        }),
        unmatched: matches
            .filter((match) => !match.matched && !match.skippedBecauseBound && !conflictIds.has(match.id))
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
        skippedItems,
        conflicts: conflictItems,
        skippedBound: matches.filter((match) => match.skippedBecauseBound).length,
        selectionSummary: `Prepared ${preparedComponents.length} selection target${preparedComponents.length === 1 ? "" : "s"} for binding.`,
        settings: scanSettings,
        debug
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
        if (node.type === "INSTANCE") {
            continue;
        }
        if (node.type === "COMPONENT_SET") {
            for (const child of node.children) {
                if (child.type !== "COMPONENT") {
                    continue;
                }
                prepared.push({
                    node: child,
                    ownerComponent: child,
                    componentName: node.name,
                    variantSegments: extractVariantSegments(child, node)
                });
            }
            continue;
        }
        if (node.type === "COMPONENT") {
            const componentNode = node;
            const parent = componentNode.parent;
            const variantSegments = parent && parent.type === "COMPONENT_SET" ? extractVariantSegments(componentNode, parent) : [];
            const componentName = parent && parent.type === "COMPONENT_SET" ? parent.name : componentNode.name;
            prepared.push({
                node: componentNode,
                ownerComponent: componentNode,
                componentName,
                variantSegments
            });
            continue;
        }
        const ownerComponent = findOwningComponent(node);
        if (!ownerComponent) {
            continue;
        }
        if (isNodeInsideNestedInstance(node, ownerComponent)) {
            continue;
        }
        const parent = ownerComponent.parent;
        const variantSegments = parent && parent.type === "COMPONENT_SET" ? extractVariantSegments(ownerComponent, parent) : [];
        const componentName = parent && parent.type === "COMPONENT_SET" ? parent.name : ownerComponent.name;
        prepared.push({
            node,
            ownerComponent,
            componentName,
            variantSegments
        });
    }
    return prepared;
}
function findOwningComponent(node) {
    let current = node;
    while (current) {
        if (current.type === "COMPONENT") {
            return current;
        }
        current = current.parent;
    }
    return null;
}
function isNodeInsideNestedInstance(node, ownerComponent) {
    let current = node.parent;
    while (current && current.id !== ownerComponent.id) {
        if (current.type === "INSTANCE") {
            return true;
        }
        current = current.parent;
    }
    return false;
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
async function collectMatches(components, variableIndex, scanSettings, debug) {
    const matches = [];
    const skippedItems = [];
    const skippedKeys = new Set();
    const sharedPropertyIndex = buildSharedPropertyIndex(components, scanSettings);
    for (const component of components) {
        const nodes = walkNodes(component.node);
        for (const node of nodes) {
            const result = await inspectNodeBindings(node, component, variableIndex, sharedPropertyIndex, scanSettings, debug);
            for (const skipped of result.skippedItems) {
                const key = `${skipped.id}:${skipped.reason}`;
                if (!skippedKeys.has(key)) {
                    skippedKeys.add(key);
                    skippedItems.push(skipped);
                }
            }
            const bindables = result.candidates;
            matches.push(...bindables);
        }
    }
    return { matches, skippedItems };
}
function walkNodes(root) {
    if (shouldStopTraversalOnNode(root)) {
        return [];
    }
    const nodes = [root];
    if ("children" in root) {
        for (const child of root.children) {
            if (child.type === "INSTANCE") {
                continue;
            }
            nodes.push(...walkDescendants(child));
        }
    }
    return nodes;
}
function walkDescendants(node) {
    if (shouldStopTraversalOnNode(node)) {
        return [];
    }
    const nodes = [node];
    if ("children" in node) {
        for (const child of node.children) {
            if (child.type === "INSTANCE") {
                continue;
            }
            nodes.push(...walkDescendants(child));
        }
    }
    return nodes;
}
async function inspectNodeBindings(node, component, variableIndex, sharedPropertyIndex, scanSettings, debug) {
    var _a, _b, _c, _d, _e, _f, _g;
    const candidates = [];
    const skippedItems = [];
    const extracted = extractBindableFields(node);
    const bindables = extracted.items;
    for (const skipped of extracted.skippedItems) {
        if (shouldIncludeSkippedForSettings(node, component, skipped.property, scanSettings)) {
            skippedItems.push({
                id: `${node.id}:${skipped.property}:skipped`,
                label: `${node.name} · ${skipped.property}`,
                reason: skipped.reason
            });
        }
    }
    for (const bindable of bindables) {
        if (bindable.property === "strokeWeight") {
            debug.push(`[strokeWeight] extracted node="${node.name}" component="${component.componentName}" value=${String(bindable.rawValue)}`);
        }
        if (!shouldIncludeBindableForSettings(node, component, bindable.property, scanSettings)) {
            if (bindable.property === "strokeWeight") {
                debug.push(`[strokeWeight] filtered-by-settings node="${node.name}" component="${component.componentName}" mode="${getScanModeForProperty(bindable.property, scanSettings)}"`);
            }
            continue;
        }
        const effectiveNode = bindable.pathNodeName
            ? Object.assign(Object.assign({}, node), { name: bindable.pathNodeName })
            : node;
        const pathContext = getPathContext(effectiveNode, component, bindable.property, bindable.rawValue, bindable.resolvedType, sharedPropertyIndex);
        const proposedChain = buildProposedChain(pathContext, effectiveNode, bindable.property, bindable.rawValue);
        const existingBinding = await getExistingBindingName(node, bindable.property, bindable.rangeStart, bindable.rangeEnd, bindable.effectIndex, bindable.effectField);
        const candidateId = `${node.id}:${bindable.property}:${(_a = bindable.rangeStart) !== null && _a !== void 0 ? _a : "all"}:${(_b = bindable.rangeEnd) !== null && _b !== void 0 ? _b : "all"}:${(_c = bindable.effectIndex) !== null && _c !== void 0 ? _c : "all"}`;
        const candidateNodeName = (_d = bindable.displayNodeName) !== null && _d !== void 0 ? _d : node.name;
        if (existingBinding) {
            if (bindable.property === "strokeWeight") {
                debug.push(`[strokeWeight] already-bound node="${node.name}" binding="${existingBinding}"`);
            }
            candidates.push({
                id: candidateId,
                nodeId: node.id,
                nodeName: candidateNodeName,
                pathNodeName: (_e = bindable.pathNodeName) !== null && _e !== void 0 ? _e : node.name,
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
                existingBindingName: existingBinding,
                rangeStart: bindable.rangeStart,
                rangeEnd: bindable.rangeEnd,
                effectIndex: bindable.effectIndex,
                effectField: bindable.effectField
            });
            continue;
        }
        const match = findVariableMatch(effectiveNode, bindable.property, pathContext, variableIndex);
        if (bindable.property === "strokeWeight") {
            debug.push(match
                ? `[strokeWeight] matched node="${node.name}" path="${match.variablePath}"`
                : `[strokeWeight] unmatched node="${node.name}" base="${proposedChain.basePath}" semantic="${proposedChain.semanticPath}" component="${proposedChain.componentPath}"`);
        }
        candidates.push({
            id: candidateId,
            nodeId: node.id,
            nodeName: candidateNodeName,
            pathNodeName: (_f = bindable.pathNodeName) !== null && _f !== void 0 ? _f : node.name,
            property: bindable.property,
            resolvedType: bindable.resolvedType,
            rawValue: bindable.rawValue,
            collectionKind: proposedChain.collectionKind,
            matched: Boolean(match),
            matchedVariableId: match === null || match === void 0 ? void 0 : match.variable.id,
            matchedVariablePath: match === null || match === void 0 ? void 0 : match.variablePath,
            proposedBasePath: proposedChain.basePath,
            proposedSemanticPath: proposedChain.semanticPath,
            proposedComponentPath: (_g = match === null || match === void 0 ? void 0 : match.variablePath) !== null && _g !== void 0 ? _g : proposedChain.componentPath,
            candidatePaths: buildCandidatePaths(proposedChain.collectionKind, pathContext, effectiveNode, bindable.property),
            variantSegments: component.variantSegments,
            variantProperties: component.variantSegments.map((segment) => segment.property),
            pathComponentName: pathContext.componentName,
            pathVariantSegments: pathContext.variantSegments,
            skippedBecauseBound: false,
            rangeStart: bindable.rangeStart,
            rangeEnd: bindable.rangeEnd,
            effectIndex: bindable.effectIndex,
            effectField: bindable.effectField
        });
    }
    return { candidates, skippedItems };
}
function extractBindableFields(node) {
    const items = [];
    const skippedItems = [];
    const anyNode = node;
    if ("fills" in anyNode && Array.isArray(anyNode.fills)) {
        const fills = anyNode.fills;
        const fillSupport = getPaintSupportDetails(fills, "fill");
        if (fillSupport.kind === "single-solid" && fillSupport.paint) {
            items.push({ property: "fills.color", rawValue: solidPaintToRgba(fillSupport.paint), resolvedType: "COLOR" });
        }
        else if (fillSupport.reason) {
            skippedItems.push({ property: "fills.color", reason: fillSupport.reason });
        }
    }
    if ("strokes" in anyNode && Array.isArray(anyNode.strokes)) {
        const strokes = anyNode.strokes;
        const strokeSupport = getPaintSupportDetails(strokes, "stroke");
        if (strokeSupport.kind === "single-solid" && strokeSupport.paint) {
            items.push({ property: "strokes.color", rawValue: solidPaintToRgba(strokeSupport.paint), resolvedType: "COLOR" });
        }
        else if (strokeSupport.reason) {
            skippedItems.push({ property: "strokes.color", reason: strokeSupport.reason });
        }
        if (typeof anyNode.strokeWeight === "number" && (hasVisiblePaint(strokes) || hasExistingStrokeColorBinding(node))) {
            items.push({ property: "strokeWeight", rawValue: anyNode.strokeWeight, resolvedType: "FLOAT" });
        }
    }
    const shouldDebugStrokeWeight = typeof anyNode.strokeWeight === "number" &&
        ("strokes" in anyNode && Array.isArray(anyNode.strokes));
    if (shouldDebugStrokeWeight && !items.some((item) => item.property === "strokeWeight")) {
        const strokes = anyNode.strokes;
        const strokeSupport = getPaintSupportDetails(strokes, "stroke");
        const hasVisible = hasVisiblePaint(strokes);
        const hasBoundStrokeColor = hasExistingStrokeColorBinding(node);
        skippedItems.push({
            property: "strokeWeight",
            reason: `Debug: strokeWeight=${String(anyNode.strokeWeight)} support=${strokeSupport.kind}${strokeSupport.reason ? ` (${strokeSupport.reason})` : ""} visibleStroke=${String(hasVisible)} boundStrokeColor=${String(hasBoundStrokeColor)}`
        });
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
            if ((isPaddingProperty(field) || field === "itemSpacing") && !hasAutoLayout(node)) {
                continue;
            }
            if (field === "width" && shouldSkipDimensionVariable(node, "horizontal")) {
                skippedItems.push({ property: "width", reason: "Width is skipped for HUG or FILL sizing." });
                continue;
            }
            if (field === "height" && shouldSkipDimensionVariable(node, "vertical")) {
                skippedItems.push({ property: "height", reason: "Height is skipped for HUG or FILL sizing." });
                continue;
            }
            if (field === "opacity" && isFullOpacity(anyNode[field])) {
                skippedItems.push({ property: "opacity", reason: "Full opacity does not create a standalone variable." });
                continue;
            }
            items.push({ property: field, rawValue: anyNode[field], resolvedType: "FLOAT" });
        }
    }
    if (node.type === "TEXT") {
        if (node.characters.length > 0) {
            const textExtraction = extractTextBindableFields(node);
            items.push(...textExtraction.items);
            skippedItems.push(...textExtraction.skippedItems);
        }
    }
    if ("effects" in anyNode && Array.isArray(anyNode.effects)) {
        const effectExtraction = extractEffectBindableFields(node, anyNode.effects);
        items.push(...effectExtraction.items);
        skippedItems.push(...effectExtraction.skippedItems);
    }
    return { items, skippedItems };
}
function percentTypographyValueToPixels(fontSize, percentValue) {
    return normalizeFloatValue((fontSize * percentValue) / 100);
}
function extractTextBindableFields(node) {
    const items = [];
    const skippedItems = [];
    const numericFontSize = typeof node.fontSize === "number" ? node.fontSize : null;
    const segments = getTextStyledSegments(node);
    if (numericFontSize !== null) {
        items.push({ property: "fontSize", rawValue: numericFontSize, resolvedType: "FLOAT" });
    }
    else {
        const rangeItems = extractRangeTextPropertyItems(node, "fontSize", segments);
        if (rangeItems.length > 0) {
            items.push(...rangeItems);
        }
        else {
            skippedItems.push({ property: "fontSize", reason: "Mixed text styles are not supported for font size yet." });
        }
    }
    if (node.fontName !== figma.mixed) {
        const fontName = node.fontName;
        items.push({
            property: "fontFamily",
            rawValue: fontName.family,
            resolvedType: "STRING"
        });
    }
    else {
        const rangeItems = extractRangeTextPropertyItems(node, "fontFamily", segments);
        if (rangeItems.length > 0) {
            items.push(...rangeItems);
        }
        else {
            skippedItems.push({ property: "fontFamily", reason: "Mixed text styles are not supported for font family yet." });
        }
    }
    if (typeof node.fontWeight === "number") {
        items.push({ property: "fontWeight", rawValue: node.fontWeight, resolvedType: "FLOAT" });
    }
    else {
        const rangeItems = extractRangeTextPropertyItems(node, "fontWeight", segments);
        if (rangeItems.length > 0) {
            items.push(...rangeItems);
        }
        else {
            skippedItems.push({ property: "fontWeight", reason: "Mixed text styles are not supported for font weight yet." });
        }
    }
    if (node.lineHeight !== figma.mixed) {
        const value = resolveTextLineHeightValue(node.lineHeight, numericFontSize);
        if (typeof value === "number") {
            if (!shouldSkipDefaultTextNumericValue("lineHeight", value)) {
                items.push({ property: "lineHeight", rawValue: value, resolvedType: "FLOAT" });
            }
            else {
                skippedItems.push({ property: "lineHeight", reason: "Default line height does not create a token." });
            }
        }
        else {
            skippedItems.push({ property: "lineHeight", reason: value !== null && value !== void 0 ? value : "Line height is not supported yet." });
        }
    }
    else {
        const rangeItems = extractRangeTextPropertyItems(node, "lineHeight", segments);
        if (rangeItems.length > 0) {
            items.push(...rangeItems);
        }
        else {
            skippedItems.push({ property: "lineHeight", reason: "Mixed text styles are not supported for line height yet." });
        }
    }
    if (node.letterSpacing !== figma.mixed) {
        const value = resolveTextLetterSpacingValue(node.letterSpacing, numericFontSize);
        if (typeof value === "number") {
            if (!shouldSkipDefaultTextNumericValue("letterSpacing", value)) {
                items.push({ property: "letterSpacing", rawValue: value, resolvedType: "FLOAT" });
            }
            else {
                skippedItems.push({ property: "letterSpacing", reason: "Default letter spacing does not create a token." });
            }
        }
        else {
            skippedItems.push({ property: "letterSpacing", reason: value !== null && value !== void 0 ? value : "Letter spacing is not supported yet." });
        }
    }
    else {
        const rangeItems = extractRangeTextPropertyItems(node, "letterSpacing", segments);
        if (rangeItems.length > 0) {
            items.push(...rangeItems);
        }
        else {
            skippedItems.push({ property: "letterSpacing", reason: "Mixed text styles are not supported for letter spacing yet." });
        }
    }
    if (typeof node.paragraphSpacing === "number") {
        if (!shouldSkipDefaultTextNumericValue("paragraphSpacing", node.paragraphSpacing)) {
            items.push({ property: "paragraphSpacing", rawValue: node.paragraphSpacing, resolvedType: "FLOAT" });
        }
        else {
            skippedItems.push({ property: "paragraphSpacing", reason: "Default paragraph spacing does not create a token." });
        }
    }
    else {
        const rangeItems = extractRangeTextPropertyItems(node, "paragraphSpacing", segments);
        if (rangeItems.length > 0) {
            items.push(...rangeItems);
        }
        else {
            skippedItems.push({ property: "paragraphSpacing", reason: "Mixed text styles are not supported for paragraph spacing yet." });
        }
    }
    if (typeof node.paragraphIndent === "number") {
        if (!shouldSkipDefaultTextNumericValue("paragraphIndent", node.paragraphIndent)) {
            items.push({ property: "paragraphIndent", rawValue: node.paragraphIndent, resolvedType: "FLOAT" });
        }
        else {
            skippedItems.push({ property: "paragraphIndent", reason: "Default paragraph indent does not create a token." });
        }
    }
    else {
        const rangeItems = extractRangeTextPropertyItems(node, "paragraphIndent", segments);
        if (rangeItems.length > 0) {
            items.push(...rangeItems);
        }
        else {
            skippedItems.push({ property: "paragraphIndent", reason: "Mixed text styles are not supported for paragraph indent yet." });
        }
    }
    return { items, skippedItems };
}
function extractEffectBindableFields(node, effects) {
    const items = [];
    const skippedItems = [];
    effects.forEach((effect, index) => {
        if (effect.visible === false) {
            return;
        }
        const effectIndex = index;
        const effectNodeName = buildEffectPathNodeName(node.name, effect.type, index);
        const displayNodeName = buildEffectDisplayNodeName(node.name, effect.type, index);
        if (effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW") {
            items.push({
                property: "effects.color",
                rawValue: effect.color,
                resolvedType: "COLOR",
                displayNodeName,
                pathNodeName: effectNodeName,
                effectIndex,
                effectField: "color"
            });
            if (!shouldSkipDefaultEffectNumericValue("effects.radius", effect.radius)) {
                items.push({
                    property: "effects.radius",
                    rawValue: effect.radius,
                    resolvedType: "FLOAT",
                    displayNodeName,
                    pathNodeName: effectNodeName,
                    effectIndex,
                    effectField: "radius"
                });
            }
            else {
                skippedItems.push({ property: "effects.radius", reason: "Default effect radius does not create a token." });
            }
            if (typeof effect.spread === "number") {
                if (!shouldSkipDefaultEffectNumericValue("effects.spread", effect.spread)) {
                    items.push({
                        property: "effects.spread",
                        rawValue: effect.spread,
                        resolvedType: "FLOAT",
                        displayNodeName,
                        pathNodeName: effectNodeName,
                        effectIndex,
                        effectField: "spread"
                    });
                }
                else {
                    skippedItems.push({ property: "effects.spread", reason: "Default effect spread does not create a token." });
                }
            }
            if (!shouldSkipDefaultEffectNumericValue("effects.offsetX", effect.offset.x)) {
                items.push({
                    property: "effects.offsetX",
                    rawValue: effect.offset.x,
                    resolvedType: "FLOAT",
                    displayNodeName,
                    pathNodeName: effectNodeName,
                    effectIndex,
                    effectField: "offsetX"
                });
            }
            else {
                skippedItems.push({ property: "effects.offsetX", reason: "Default effect offsetX does not create a token." });
            }
            if (!shouldSkipDefaultEffectNumericValue("effects.offsetY", effect.offset.y)) {
                items.push({
                    property: "effects.offsetY",
                    rawValue: effect.offset.y,
                    resolvedType: "FLOAT",
                    displayNodeName,
                    pathNodeName: effectNodeName,
                    effectIndex,
                    effectField: "offsetY"
                });
            }
            else {
                skippedItems.push({ property: "effects.offsetY", reason: "Default effect offsetY does not create a token." });
            }
            return;
        }
        if (effect.type === "LAYER_BLUR" || effect.type === "BACKGROUND_BLUR") {
            if (!shouldSkipDefaultEffectNumericValue("effects.radius", effect.radius)) {
                items.push({
                    property: "effects.radius",
                    rawValue: effect.radius,
                    resolvedType: "FLOAT",
                    displayNodeName,
                    pathNodeName: effectNodeName,
                    effectIndex,
                    effectField: "radius"
                });
            }
            else {
                skippedItems.push({ property: "effects.radius", reason: "Default effect radius does not create a token." });
            }
            return;
        }
        skippedItems.push({
            property: "effects.radius",
            reason: `${effect.type} effects are not supported yet.`
        });
    });
    return { items, skippedItems };
}
function buildEffectPathNodeName(nodeName, effectType, index) {
    return `${nodeName}/${normalizeEffectType(effectType)}-${index + 1}`;
}
function buildEffectDisplayNodeName(nodeName, effectType, index) {
    return `${nodeName} [${humanizeEffectType(effectType)} ${index + 1}]`;
}
function normalizeEffectType(effectType) {
    switch (effectType) {
        case "DROP_SHADOW":
            return "drop-shadow";
        case "INNER_SHADOW":
            return "inner-shadow";
        case "LAYER_BLUR":
            return "layer-blur";
        case "BACKGROUND_BLUR":
            return "background-blur";
        default:
            return normalizeSegment(effectType);
    }
}
function humanizeEffectType(effectType) {
    switch (effectType) {
        case "DROP_SHADOW":
            return "Drop shadow";
        case "INNER_SHADOW":
            return "Inner shadow";
        case "LAYER_BLUR":
            return "Layer blur";
        case "BACKGROUND_BLUR":
            return "Background blur";
        default:
            return effectType;
    }
}
function getTextStyledSegments(node) {
    var _a;
    const textNode = node;
    if (!textNode.getStyledTextSegments) {
        return [];
    }
    return (_a = textNode.getStyledTextSegments([
        "fontSize",
        "fontName",
        "fontWeight",
        "lineHeight",
        "letterSpacing",
        "paragraphSpacing",
        "paragraphIndent"
    ])) !== null && _a !== void 0 ? _a : [];
}
function extractRangeTextPropertyItems(node, property, segments) {
    var _a;
    const rangeItems = [];
    for (const segment of segments) {
        const rawValue = getTextSegmentRawValue(segment, property);
        if (rawValue === null) {
            continue;
        }
        if (typeof rawValue === "number" && shouldSkipDefaultTextNumericValue(property, rawValue)) {
            continue;
        }
        const previous = rangeItems[rangeItems.length - 1];
        const comparable = getComparableRawValue(rawValue, getResolvedTypeForTextProperty(property));
        if (previous &&
            previous.rangeEnd === segment.start &&
            getComparableRawValue(previous.rawValue, previous.resolvedType) === comparable) {
            previous.rangeEnd = segment.end;
            previous.displayNodeName = buildTextRangeDisplayNodeName(node.name, rangeItems.length, node.characters.slice((_a = previous.rangeStart) !== null && _a !== void 0 ? _a : 0, segment.end));
            continue;
        }
        const textSlice = node.characters.slice(segment.start, segment.end);
        const rangeIndex = rangeItems.length + 1;
        rangeItems.push({
            property,
            rawValue,
            resolvedType: getResolvedTypeForTextProperty(property),
            displayNodeName: buildTextRangeDisplayNodeName(node.name, rangeIndex, textSlice),
            pathNodeName: buildTextRangePathNodeName(node.name, rangeIndex),
            rangeStart: segment.start,
            rangeEnd: segment.end
        });
    }
    return rangeItems.filter((item) => item.rangeStart !== item.rangeEnd);
}
function getResolvedTypeForTextProperty(property) {
    return property === "fontFamily" ? "STRING" : "FLOAT";
}
function getTextSegmentRawValue(segment, property) {
    if (property === "fontSize") {
        return typeof segment.fontSize === "number" ? segment.fontSize : null;
    }
    if (property === "fontFamily") {
        const fontName = segment.fontName;
        return fontName && typeof fontName.family === "string" ? fontName.family : null;
    }
    if (property === "fontWeight") {
        return typeof segment.fontWeight === "number" ? segment.fontWeight : null;
    }
    if (property === "lineHeight") {
        const fontSize = typeof segment.fontSize === "number" ? segment.fontSize : null;
        const resolved = resolveTextLineHeightValue(segment.lineHeight, fontSize);
        return typeof resolved === "number" ? resolved : null;
    }
    if (property === "letterSpacing") {
        const fontSize = typeof segment.fontSize === "number" ? segment.fontSize : null;
        const resolved = resolveTextLetterSpacingValue(segment.letterSpacing, fontSize);
        return typeof resolved === "number" ? resolved : null;
    }
    if (property === "paragraphSpacing") {
        return typeof segment.paragraphSpacing === "number" ? segment.paragraphSpacing : null;
    }
    if (property === "paragraphIndent") {
        return typeof segment.paragraphIndent === "number" ? segment.paragraphIndent : null;
    }
    return null;
}
function resolveTextLineHeightValue(lineHeight, numericFontSize) {
    if (!lineHeight) {
        return null;
    }
    if (lineHeight.unit === "PIXELS" && typeof lineHeight.value === "number") {
        return lineHeight.value;
    }
    if (lineHeight.unit === "PERCENT" && typeof lineHeight.value === "number") {
        if (numericFontSize !== null) {
            return percentTypographyValueToPixels(numericFontSize, lineHeight.value);
        }
        return "Percent line height needs a single numeric font size to convert to pixels.";
    }
    if (lineHeight.unit === "AUTO") {
        return "Auto line height is not supported yet.";
    }
    return "Only pixel or percent line height is supported yet.";
}
function resolveTextLetterSpacingValue(letterSpacing, numericFontSize) {
    if (!letterSpacing) {
        return null;
    }
    if (letterSpacing.unit === "PIXELS" && typeof letterSpacing.value === "number") {
        return letterSpacing.value;
    }
    if (letterSpacing.unit === "PERCENT" && typeof letterSpacing.value === "number") {
        if (numericFontSize !== null) {
            return percentTypographyValueToPixels(numericFontSize, letterSpacing.value);
        }
        return "Percent letter spacing needs a single numeric font size to convert to pixels.";
    }
    return "Only pixel or percent letter spacing is supported yet.";
}
function shouldSkipDefaultTextNumericValue(property, value) {
    if (!isZeroValue(value)) {
        return false;
    }
    return (property === "letterSpacing" ||
        property === "paragraphSpacing" ||
        property === "paragraphIndent");
}
function shouldSkipDefaultEffectNumericValue(property, value) {
    if (!isZeroValue(value)) {
        return false;
    }
    return (property === "effects.radius" ||
        property === "effects.spread" ||
        property === "effects.offsetX" ||
        property === "effects.offsetY");
}
function toTextRange(candidate) {
    if (candidate.rangeStart === undefined || candidate.rangeEnd === undefined) {
        return undefined;
    }
    return {
        start: candidate.rangeStart,
        end: candidate.rangeEnd
    };
}
function buildTextRangeDisplayNodeName(nodeName, rangeIndex, textSlice) {
    const preview = truncateTextRangeLabel(textSlice);
    return `${nodeName} [Range ${rangeIndex}: ${preview}]`;
}
function buildTextRangePathNodeName(nodeName, rangeIndex) {
    return `${nodeName}/text-range-${rangeIndex}`;
}
function truncateTextRangeLabel(value) {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!normalized) {
        return "range";
    }
    return normalized.length > 24 ? `${normalized.slice(0, 24).trim()}…` : normalized;
}
function getPaintSupportDetails(paints, paintKind) {
    const visiblePaints = paints.filter((paint) => paint.visible !== false);
    if (visiblePaints.length === 0) {
        return { kind: "empty" };
    }
    const solidPaints = visiblePaints.filter((paint) => paint.type === "SOLID");
    const gradientPaints = visiblePaints.filter((paint) => paint.type.includes("GRADIENT"));
    const imagePaints = visiblePaints.filter((paint) => paint.type === "IMAGE");
    const otherPaints = visiblePaints.filter((paint) => paint.type !== "SOLID" && !paint.type.includes("GRADIENT") && paint.type !== "IMAGE");
    if (visiblePaints.length > 1) {
        return {
            kind: "unsupported",
            reason: `Multiple visible ${paintKind}s are not supported yet.`
        };
    }
    if (solidPaints.length === 1 && gradientPaints.length === 0 && imagePaints.length === 0 && otherPaints.length === 0) {
        return {
            kind: "single-solid",
            paint: solidPaints[0]
        };
    }
    if (gradientPaints.length > 0) {
        return {
            kind: "unsupported",
            reason: `Gradient ${paintKind}s are not supported yet.`
        };
    }
    if (imagePaints.length > 0) {
        return {
            kind: "unsupported",
            reason: `Image ${paintKind}s are not supported yet.`
        };
    }
    return {
        kind: "unsupported",
        reason: `Only single solid ${paintKind}s are supported.`
    };
}
function hasVisiblePaint(paints) {
    return paints.some((paint) => paint.visible !== false);
}
function hasExistingStrokeColorBinding(node) {
    return extractExistingBinding(node, "strokes.color") !== null;
}
async function getExistingBindingName(node, property, rangeStart, rangeEnd, effectIndex, effectField) {
    const binding = extractExistingBinding(node, property, rangeStart, rangeEnd, effectIndex, effectField);
    if (!binding) {
        return null;
    }
    const variable = await figma.variables.getVariableByIdAsync(binding.id);
    return variable ? variable.name : binding.id;
}
function extractExistingBinding(node, property, rangeStart, rangeEnd, effectIndex, effectField) {
    var _a;
    if (node.type === "TEXT" &&
        rangeStart !== undefined &&
        rangeEnd !== undefined &&
        (property === "fontSize" ||
            property === "fontFamily" ||
            property === "fontWeight" ||
            property === "lineHeight" ||
            property === "letterSpacing" ||
            property === "paragraphSpacing" ||
            property === "paragraphIndent")) {
        const textNode = node;
        if (textNode.getRangeBoundVariable) {
            const binding = textNode.getRangeBoundVariable(rangeStart, rangeEnd, property);
            if (binding && typeof binding === "object" && "id" in binding) {
                return binding;
            }
        }
    }
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
    if ((property === "effects.color" ||
        property === "effects.radius" ||
        property === "effects.spread" ||
        property === "effects.offsetX" ||
        property === "effects.offsetY") &&
        effectIndex !== undefined &&
        effectField) {
        const effects = ("effects" in node && Array.isArray(node.effects)) ? node.effects : null;
        const effect = effects === null || effects === void 0 ? void 0 : effects[effectIndex];
        const binding = (_a = effect === null || effect === void 0 ? void 0 : effect.boundVariables) === null || _a === void 0 ? void 0 : _a[effectField];
        if (binding) {
            return binding;
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
function findExistingVariableByPath(fullPath, variableIndex) {
    var _a, _b;
    const normalizedPath = normalizeTokenPath(fullPath);
    return (_b = (_a = variableIndex.get(normalizedPath)) === null || _a === void 0 ? void 0 : _a[0]) !== null && _b !== void 0 ? _b : null;
}
function buildCandidatePaths(collectionKind, pathContext, node, property) {
    const candidates = [];
    const seen = new Set();
    const pushPath = (componentName, variantSegments) => {
        const localPathContext = { componentName, variantSegments };
        const path = shouldUseSemanticTerminal(collectionKind, componentName)
            ? buildTerminalSemanticPath(collectionKind, localPathContext, node, property)
            : buildComponentPath(collectionKind, localPathContext, node, property);
        if (!seen.has(path)) {
            seen.add(path);
            candidates.push(path);
        }
    };
    pushPath(pathContext.componentName, pathContext.variantSegments);
    if (pathContext.variantSegments.length > 0) {
        pushPath(pathContext.componentName, []);
    }
    const componentPrefixes = getComponentNamePrefixes(pathContext.componentName);
    for (const prefix of componentPrefixes) {
        pushPath(prefix, []);
    }
    return candidates;
}
function getComponentNamePrefixes(componentName) {
    const segments = componentName
        .split("/")
        .map((segment) => segment.trim())
        .filter(Boolean);
    const prefixes = [];
    for (let index = segments.length - 1; index > 0; index -= 1) {
        prefixes.push(segments.slice(0, index).join("/"));
    }
    return prefixes;
}
function buildComponentPath(collectionKind, pathContext, node, property) {
    const componentLeaf = getComponentLeaf(node, {
        node: null,
        ownerComponent: null,
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
    const semanticPath = buildSemanticPath(collectionKind, pathContext, node, property, rawValue);
    return {
        collectionKind,
        basePath: buildBasePath(collectionKind, property, rawValue),
        semanticPath,
        componentPath: shouldUseSemanticTerminal(collectionKind, pathContext.componentName)
            ? semanticPath
            : buildComponentPath(collectionKind, pathContext, node, property)
    };
}
function buildSemanticPath(collectionKind, pathContext, node, property, rawValue) {
    if (shouldUseSemanticTerminal(collectionKind, pathContext.componentName)) {
        return buildTerminalSemanticPath(collectionKind, pathContext, node, property);
    }
    if (collectionKind === "color") {
        return [
            "color",
            "semantic",
            getSemanticColorRole(node, property, pathContext.componentName),
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
    if (shouldUseSemanticTerminal(collectionKind, pathContext.componentName)) {
        return buildTerminalSemanticPath(collectionKind, pathContext, node, property);
    }
    if (collectionKind === "color") {
        return [
            "color",
            "semantic",
            getSemanticColorRole(node, property, pathContext.componentName),
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
    return [
        "device",
        "semantic",
        getDeviceBucket(property),
        ...pathContext.componentName.split("/").map((segment) => normalizeSegment(segment)).filter(Boolean),
        formatNumberish(rawValue)
    ]
        .map((segment) => normalizeSegment(segment))
        .join("/");
}
function buildTerminalSemanticPath(collectionKind, pathContext, node, property) {
    if (collectionKind === "color" && isIconFamily(pathContext.componentName)) {
        return [
            "color",
            "semantic",
            "icon",
            ...getSemanticSubtypeSegments(pathContext.componentName),
            getSemanticColorRole(node, property, pathContext.componentName),
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
    return buildComponentPath(collectionKind, pathContext, node, property);
}
function shouldUseSemanticTerminal(collectionKind, componentName) {
    return collectionKind === "typography" || (collectionKind === "color" && isIconFamily(componentName));
}
function buildBasePath(collectionKind, property, rawValue) {
    if (collectionKind === "color") {
        const color = rawValue;
        return ["color", "base", getBaseColorName(color), String(colorAlphaPercent(color))]
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
    if (property === "fills.color" || property === "strokes.color" || property === "effects.color") {
        return "color";
    }
    if (property === "fontSize" ||
        property === "fontFamily" ||
        property === "fontWeight" ||
        property === "lineHeight" ||
        property === "letterSpacing" ||
        property === "paragraphSpacing" ||
        property === "paragraphIndent") {
        return "typography";
    }
    return "device";
}
function getPropertyFamily(property) {
    if (property === "fills.color" || property === "effects.color") {
        return "colors";
    }
    if (property === "fontSize" ||
        property === "fontFamily" ||
        property === "fontWeight" ||
        property === "lineHeight" ||
        property === "letterSpacing" ||
        property === "paragraphSpacing" ||
        property === "paragraphIndent") {
        return "typography";
    }
    if (property === "strokes.color" || property === "strokeWeight") {
        return "border";
    }
    if (property === "opacity") {
        return "opacity";
    }
    if (property === "paddingTop" ||
        property === "paddingRight" ||
        property === "paddingBottom" ||
        property === "paddingLeft" ||
        property === "itemSpacing") {
        return "spacing";
    }
    if (property === "topLeftRadius" ||
        property === "topRightRadius" ||
        property === "bottomLeftRadius" ||
        property === "bottomRightRadius") {
        return "radius";
    }
    return "size";
}
function getScanModeForProperty(property, settings) {
    const collectionKind = getCollectionKind(property);
    if (collectionKind === "color") {
        return settings.colorsScanMode;
    }
    if (collectionKind === "typography") {
        return settings.typographyScanMode;
    }
    return settings.deviceScanMode;
}
function shouldIncludeBindableForSettings(node, component, property, settings) {
    if (!settings.enabledFamilies[getPropertyFamily(property)]) {
        return false;
    }
    const scanMode = getScanModeForProperty(property, settings);
    return shouldIncludeNodeForMode(node, component, scanMode, settings);
}
function shouldIncludeSkippedForSettings(node, component, property, settings) {
    if (!settings.enabledFamilies[getPropertyFamily(property)]) {
        return false;
    }
    const scanMode = getScanModeForProperty(property, settings);
    return shouldIncludeNodeForMode(node, component, scanMode, settings);
}
function shouldIncludeNodeForMode(node, component, scanMode, settings) {
    if (shouldStopTraversalOnNode(node)) {
        return false;
    }
    if (node.id === component.node.id) {
        return true;
    }
    if (scanMode === "selected-objects") {
        return false;
    }
    if (scanMode === "selected-objects-with-internal-layers") {
        return true;
    }
    return hasSemanticLayerName(node, settings);
}
function getComponentLeaf(node, component, property) {
    var _a;
    const collectionKind = getCollectionKind(property);
    if (collectionKind === "color") {
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
function getSemanticColorRole(node, property, componentName) {
    if (property === "strokes.color") {
        return "stroke";
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
function isIconFamily(componentName) {
    var _a;
    const family = normalizeSegment((_a = componentName.split("/")[0]) !== null && _a !== void 0 ? _a : componentName);
    return family === "icon";
}
function getTypographyLeaf(property) {
    if (property === "fontSize") {
        return "font-size";
    }
    if (property === "fontFamily") {
        return "font-family";
    }
    if (property === "lineHeight") {
        return "line-height";
    }
    if (property === "letterSpacing") {
        return "letter-spacing";
    }
    if (property === "paragraphSpacing") {
        return "paragraph-spacing";
    }
    if (property === "paragraphIndent") {
        return "paragraph-indent";
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
        case "effects.radius":
        case "effects.spread":
        case "effects.offsetX":
        case "effects.offsetY":
            return "effect";
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
        return String(normalizeFloatValue(rawValue));
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
        if (parts[0] !== "color" || parts[1] !== "base" || !((_a = parts[2]) === null || _a === void 0 ? void 0 : _a.startsWith("color"))) {
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
    if (message.executionMode === "dry-run") {
        return buildDryRunSummary(message, collections, variableIndex);
    }
    let bound = 0;
    let created = 0;
    let skipped = 0;
    const errors = [];
    const debug = [];
    const shouldBind = message.executionMode !== "create-only";
    const shouldCreate = message.executionMode !== "bind-only";
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
            if (shouldBind) {
                await bindVariableToNode(node, candidate.property, variable, toTextRange(candidate), candidate.effectIndex, candidate.effectField);
                bound += 1;
            }
            else {
                skipped += 1;
            }
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
            if (candidate.property === "strokeWeight") {
                debug.push(`[strokeWeight execute] start node="${candidate.nodeName}" base="${unmatched.basePath}" semantic="${unmatched.semanticPath}" component="${unmatched.componentPath}" shouldCreate=${String(shouldCreate)} shouldBind=${String(shouldBind)}`);
            }
            const node = await figma.getNodeByIdAsync(candidate.nodeId);
            if (!node) {
                throw new Error(`Missing node ${candidate.nodeName}`);
            }
            if (shouldSkipNewVariableCreation(candidate, node)) {
                if (candidate.property === "strokeWeight") {
                    debug.push(`[strokeWeight execute] skipped-by-create-rule node="${candidate.nodeName}"`);
                }
                skipped += 1;
                continue;
            }
            if (!shouldCreate) {
                if (candidate.property === "strokeWeight") {
                    debug.push(`[strokeWeight execute] skipped-because-create-disabled node="${candidate.nodeName}"`);
                }
                skipped += 1;
                continue;
            }
            const result = await ensureVariableForCandidate(candidate, {
                createBaseVariables: message.createBaseVariables,
                basePath: unmatched.basePath,
                semanticPath: unmatched.semanticPath,
                componentPath: unmatched.componentPath,
                variantProperties: unmatched.variantProperties
            }, collections, variableIndex);
            if (candidate.property === "strokeWeight") {
                debug.push(`[strokeWeight execute] ensured variable="${result.variable.name}" createdCount=${String(result.createdCount)}`);
            }
            created += result.createdCount;
            if (shouldBind) {
                await bindVariableToNode(node, candidate.property, result.variable, toTextRange(candidate), candidate.effectIndex, candidate.effectField);
                if (candidate.property === "strokeWeight") {
                    debug.push(`[strokeWeight execute] bound variable="${result.variable.name}"`);
                }
                bound += 1;
            }
        }
        catch (error) {
            if ((candidate === null || candidate === void 0 ? void 0 : candidate.property) === "strokeWeight") {
                debug.push(`[strokeWeight execute] error ${formatError(error)}`);
            }
            errors.push(`${candidate.nodeName} · ${candidate.property}: ${formatError(error)}`);
        }
    }
    for (const conflict of message.conflicts) {
        const candidate = analysisState.get(conflict.id);
        if (!candidate) {
            skipped += 1;
            continue;
        }
        if (conflict.action === "skip") {
            skipped += 1;
            continue;
        }
        try {
            const node = await figma.getNodeByIdAsync(candidate.nodeId);
            if (!node) {
                throw new Error(`Missing node ${candidate.nodeName}`);
            }
            if (conflict.action === "reuse-existing") {
                const existing = findExistingVariableByPath(conflict.pathKind === "base"
                    ? candidate.proposedBasePath
                    : conflict.pathKind === "semantic"
                        ? candidate.proposedSemanticPath
                        : candidate.proposedComponentPath, variableIndex);
                if (!existing) {
                    throw new Error("Existing conflict variable is missing.");
                }
                await bindVariableToNode(node, candidate.property, existing.variable, toTextRange(candidate), candidate.effectIndex, candidate.effectField);
                bound += 1;
                continue;
            }
            if (!shouldCreate) {
                skipped += 1;
                continue;
            }
            const resolvedBasePath = conflict.pathKind === "base" ? conflict.proposedPath : candidate.proposedBasePath;
            const resolvedSemanticPath = conflict.action === "create-deeper-semantic"
                ? conflict.fallbackPath || candidate.proposedSemanticPath
                : conflict.pathKind === "semantic"
                    ? conflict.proposedPath
                    : candidate.proposedSemanticPath;
            const resolvedComponentPath = conflict.pathKind === "component" ? conflict.proposedPath : candidate.proposedComponentPath;
            const result = await ensureVariableForCandidate(candidate, {
                createBaseVariables: message.createBaseVariables,
                basePath: resolvedBasePath,
                semanticPath: resolvedSemanticPath,
                componentPath: resolvedComponentPath,
                variantProperties: candidate.variantProperties
            }, collections, variableIndex);
            created += result.createdCount;
            if (shouldBind) {
                await bindVariableToNode(node, candidate.property, result.variable, toTextRange(candidate), candidate.effectIndex, candidate.effectField);
                bound += 1;
            }
        }
        catch (error) {
            errors.push(`${candidate.nodeName} · ${candidate.property}: ${formatError(error)}`);
        }
    }
    return {
        type: "summary",
        executionMode: message.executionMode,
        bound,
        created,
        skipped,
        errors,
        debug
    };
}
async function buildDryRunSummary(message, collections, variableIndex) {
    let skipped = 0;
    let plannedBound = 0;
    let plannedCreated = 0;
    const errors = [];
    const simulatedPaths = new Set(variableIndex.keys());
    for (const readyId of message.readyIds) {
        const candidate = analysisState.get(readyId);
        if (!candidate || !candidate.matchedVariableId) {
            skipped += 1;
            continue;
        }
        plannedBound += 1;
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
            if (shouldSkipNewVariableCreation(candidate, node)) {
                skipped += 1;
                continue;
            }
            plannedCreated += estimateCreatedPathsForCandidate(candidate, unmatched.basePath, unmatched.semanticPath, unmatched.componentPath, message.createBaseVariables, variableIndex, simulatedPaths);
            plannedBound += 1;
        }
        catch (error) {
            errors.push(`${candidate.nodeName} · ${candidate.property}: ${formatError(error)}`);
        }
    }
    for (const conflict of message.conflicts) {
        const candidate = analysisState.get(conflict.id);
        if (!candidate || conflict.action === "skip") {
            skipped += 1;
            continue;
        }
        if (conflict.action === "reuse-existing") {
            plannedBound += 1;
            continue;
        }
        const semanticPath = conflict.action === "create-deeper-semantic"
            ? conflict.fallbackPath || candidate.proposedSemanticPath
            : conflict.pathKind === "semantic"
                ? conflict.proposedPath
                : candidate.proposedSemanticPath;
        const basePath = conflict.pathKind === "base" ? conflict.proposedPath : candidate.proposedBasePath;
        const componentPath = conflict.pathKind === "component" ? conflict.proposedPath : candidate.proposedComponentPath;
        plannedCreated += estimateCreatedPathsForCandidate(candidate, basePath, semanticPath, componentPath, message.createBaseVariables, variableIndex, simulatedPaths);
        plannedBound += 1;
    }
    return {
        type: "summary",
        executionMode: "dry-run",
        bound: 0,
        created: 0,
        skipped,
        plannedBound,
        plannedCreated,
        errors
    };
}
function estimateCreatedPathsForCandidate(candidate, basePath, semanticPath, componentPath, createBaseVariables, variableIndex, simulatedPaths) {
    let created = 0;
    if (createBaseVariables) {
        created += addSimulatedPath(basePath, simulatedPaths, variableIndex);
        if (candidate.collectionKind === "color") {
            const ladder = collectBaseColorAlphaLadder(variableIndex);
            ladder.add(colorAlphaPercent(candidate.rawValue));
            const colorEntries = collectBaseColorEntries(variableIndex);
            for (const colorName of colorEntries.keys()) {
                for (const alpha of ladder) {
                    const ladderPath = normalizeTokenPath(`color/base/${colorName}/${alpha}`);
                    created += addSimulatedPath(ladderPath, simulatedPaths, variableIndex);
                }
            }
        }
    }
    created += addSimulatedPath(semanticPath, simulatedPaths, variableIndex);
    created += addSimulatedPath(componentPath, simulatedPaths, variableIndex);
    return created;
}
function addSimulatedPath(fullPath, simulatedPaths, variableIndex) {
    const normalizedPath = normalizeTokenPath(fullPath);
    if (simulatedPaths.has(normalizedPath) || variableIndex.has(normalizedPath)) {
        return 0;
    }
    simulatedPaths.add(normalizedPath);
    return 1;
}
async function ensureVariableForCandidate(candidate, options, collections, variableIndex) {
    const selectedVariantSegments = candidate.pathVariantSegments.filter((segment) => options.variantProperties.includes(segment.property));
    const pathContext = {
        componentName: candidate.pathComponentName,
        variantSegments: selectedVariantSegments
    };
    const componentPath = normalizeTokenPath(options.componentPath || buildComponentPath(candidate.collectionKind, pathContext, {
        id: candidate.nodeId,
        name: candidate.pathNodeName
    }, candidate.property));
    const semanticPath = normalizeTokenPath(options.semanticPath || buildSemanticPath(candidate.collectionKind, pathContext, {
        id: candidate.nodeId,
        name: candidate.pathNodeName
    }, candidate.property, candidate.rawValue));
    const basePath = normalizeTokenPath(options.basePath || buildBasePath(candidate.collectionKind, candidate.property, candidate.rawValue));
    let baseVariable = null;
    let createdCount = 0;
    if (options.createBaseVariables) {
        const baseResult = await ensureChainVariable(basePath, candidate, collections, variableIndex, {
            kind: "base",
            rawValue: candidate.rawValue
        });
        baseVariable = baseResult.variable;
        createdCount += baseResult.created ? 1 : 0;
        createdCount += await ensureGlobalColorBaseLadder(candidate, collections, variableIndex);
    }
    let resolvedSemanticPath = semanticPath;
    let semanticVariable;
    try {
        const semanticResult = await ensureChainVariable(semanticPath, candidate, collections, variableIndex, {
            kind: "semantic",
            rawValue: candidate.rawValue,
            aliasTarget: baseVariable
        });
        semanticVariable = semanticResult.variable;
        createdCount += semanticResult.created ? 1 : 0;
    }
    catch (error) {
        if (!(error instanceof Error) || !error.message.startsWith("Conflict at")) {
            throw error;
        }
        resolvedSemanticPath = buildScopedSemanticPath(candidate.collectionKind, pathContext, {
            id: candidate.nodeId,
            name: candidate.pathNodeName
        }, candidate.property, candidate.rawValue);
        const semanticResult = await ensureChainVariable(resolvedSemanticPath, candidate, collections, variableIndex, {
            kind: "semantic",
            rawValue: candidate.rawValue,
            aliasTarget: baseVariable
        });
        semanticVariable = semanticResult.variable;
        createdCount += semanticResult.created ? 1 : 0;
    }
    if (componentPath === resolvedSemanticPath) {
        candidate.proposedBasePath = basePath;
        candidate.proposedSemanticPath = resolvedSemanticPath;
        candidate.proposedComponentPath = componentPath;
        return { variable: semanticVariable, createdCount };
    }
    const componentResult = await ensureChainVariable(componentPath, candidate, collections, variableIndex, {
        kind: "component",
        rawValue: candidate.rawValue,
        aliasTarget: semanticVariable
    });
    createdCount += componentResult.created ? 1 : 0;
    candidate.proposedBasePath = basePath;
    candidate.proposedSemanticPath = resolvedSemanticPath;
    candidate.proposedComponentPath = componentPath;
    return { variable: componentResult.variable, createdCount };
}
async function preflightConflicts(candidates, collections, variableIndex) {
    const conflicts = [];
    for (const candidate of candidates) {
        const result = await preflightCandidateConflict(candidate, collections, variableIndex);
        if (result) {
            const shouldUseFallbackByDefault = result.pathKind === "semantic" &&
                Boolean(result.fallbackPath) &&
                normalizeTokenPath(result.fallbackPath) !== normalizeTokenPath(result.proposedPath);
            const action = shouldUseFallbackByDefault ? "create-deeper-semantic" : "skip";
            const resolvedPreviewPath = shouldUseFallbackByDefault && result.fallbackPath
                ? result.fallbackPath
                : result.proposedPath;
            conflicts.push({
                id: candidate.id,
                label: `${candidate.nodeName} · ${candidate.property}`,
                path: result.path,
                reason: result.reason,
                pathKind: result.pathKind,
                chainLevelLabel: getConflictChainLevelLabel(result.pathKind),
                proposedPath: result.proposedPath,
                fallbackPath: result.fallbackPath,
                resolvedPreviewPath,
                action
            });
        }
    }
    return conflicts;
}
async function preflightCandidateConflict(candidate, collections, variableIndex) {
    const baseResult = await inspectExistingPathConflict(candidate.proposedBasePath, candidate, collections, variableIndex, {
        kind: "base",
        rawValue: candidate.rawValue
    });
    if (baseResult) {
        return baseResult;
    }
    const semanticResult = await inspectExistingPathConflict(candidate.proposedSemanticPath, candidate, collections, variableIndex, {
        kind: "semantic",
        rawValue: candidate.rawValue,
        aliasTarget: null
    });
    if (semanticResult) {
        const fallbackPath = buildScopedSemanticPath(candidate.collectionKind, {
            componentName: candidate.pathComponentName,
            variantSegments: candidate.pathVariantSegments
        }, { id: candidate.nodeId, name: candidate.pathNodeName }, candidate.property, candidate.rawValue);
        const fallbackResult = await inspectExistingPathConflict(fallbackPath, candidate, collections, variableIndex, {
            kind: "semantic",
            rawValue: candidate.rawValue,
            aliasTarget: null
        });
        if (fallbackResult) {
            return fallbackResult;
        }
        return Object.assign(Object.assign({}, semanticResult), { fallbackPath: normalizeTokenPath(fallbackPath) !== normalizeTokenPath(candidate.proposedSemanticPath)
                ? normalizeTokenPath(fallbackPath)
                : undefined });
    }
    if (normalizeTokenPath(candidate.proposedComponentPath) === normalizeTokenPath(candidate.proposedSemanticPath)) {
        return null;
    }
    const componentResult = await inspectExistingPathConflict(candidate.proposedComponentPath, candidate, collections, variableIndex, {
        kind: "component",
        rawValue: candidate.rawValue,
        aliasTarget: null
    });
    if (componentResult) {
        return componentResult;
    }
    return null;
}
async function inspectExistingPathConflict(fullPath, candidate, collections, variableIndex, options) {
    var _a;
    const normalizedPath = normalizeTokenPath(fullPath);
    const existingByPath = (_a = variableIndex.get(normalizedPath)) === null || _a === void 0 ? void 0 : _a[0];
    if (!existingByPath) {
        return null;
    }
    try {
        await validateExistingVariableFit(existingByPath.variable, candidate, collections, options);
        return null;
    }
    catch (error) {
        return {
            path: `${existingByPath.collectionName}/${existingByPath.variable.name}`,
            reason: formatError(error).replace(/^Conflict at [^:]+:\s*/, ""),
            pathKind: options.kind,
            proposedPath: normalizedPath
        };
    }
}
function getConflictChainLevelLabel(pathKind) {
    if (pathKind === "base") {
        return "Base";
    }
    if (pathKind === "semantic") {
        return "Semantic";
    }
    return "Component";
}
async function ensureChainVariable(fullPath, candidate, collections, variableIndex, options) {
    var _a;
    const normalizedPath = normalizeTokenPath(fullPath);
    const existingByPath = (_a = variableIndex.get(normalizedPath)) === null || _a === void 0 ? void 0 : _a[0];
    if (existingByPath) {
        await validateExistingVariableFit(existingByPath.variable, candidate, collections, options);
        return { variable: existingByPath.variable, created: false };
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
            return { variable: reused, created: false };
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
    return { variable, created: true };
}
async function validateExistingVariableFit(variable, candidate, collections, options) {
    const collection = collections.find((item) => item.id === variable.variableCollectionId);
    if (!collection) {
        return;
    }
    const modeId = getDefaultModeId(collection);
    const currentValue = variable.valuesByMode[modeId];
    if (options.aliasTarget) {
        if (!currentValue || typeof currentValue !== "object" || !("id" in currentValue)) {
            throw new Error(`Conflict at ${collection.name}/${variable.name}: existing value is not an alias`);
        }
        if (currentValue.id === options.aliasTarget.id) {
            return;
        }
        const existingAliasTarget = await figma.variables.getVariableByIdAsync(currentValue.id);
        if (existingAliasTarget &&
            await haveCompatibleResolvedValues(existingAliasTarget, options.aliasTarget, collections, candidate.resolvedType)) {
            return;
        }
        throw new Error(`Conflict at ${collection.name}/${variable.name}: existing alias points to ${describeAliasTarget(existingAliasTarget, currentValue.id, collections)} instead of ${describeAliasTarget(options.aliasTarget, options.aliasTarget.id, collections)}`);
    }
    if (getComparableVariableValue(currentValue, candidate.resolvedType) !==
        getComparableVariableValue(options.rawValue, candidate.resolvedType)) {
        throw new Error(`Conflict at ${collection.name}/${variable.name}: existing value does not match new value`);
    }
}
async function haveCompatibleResolvedValues(first, second, collections, resolvedType) {
    const firstValue = await resolveVariableComparableValue(first, collections, resolvedType, new Set());
    const secondValue = await resolveVariableComparableValue(second, collections, resolvedType, new Set());
    return firstValue !== null && secondValue !== null && firstValue === secondValue;
}
async function resolveVariableComparableValue(variable, collections, resolvedType, seen) {
    if (seen.has(variable.id)) {
        return null;
    }
    seen.add(variable.id);
    const collection = collections.find((item) => item.id === variable.variableCollectionId);
    if (!collection) {
        return null;
    }
    const modeId = getDefaultModeId(collection);
    const value = variable.valuesByMode[modeId];
    if (value && typeof value === "object" && "id" in value) {
        const aliasTarget = await figma.variables.getVariableByIdAsync(value.id);
        if (!aliasTarget) {
            return null;
        }
        return resolveVariableComparableValue(aliasTarget, collections, resolvedType, seen);
    }
    return getComparableVariableValue(value, resolvedType);
}
function describeAliasTarget(variable, fallbackId, collections) {
    if (!variable) {
        return fallbackId;
    }
    const collection = collections.find((item) => item.id === variable.variableCollectionId);
    return collection ? `${collection.name}/${variable.name}` : variable.name;
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
        return String(normalizeFloatValue(rawValue));
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
    if (candidate.collectionKind !== "color") {
        return 0;
    }
    const ladder = collectBaseColorAlphaLadder(variableIndex);
    ladder.add(colorAlphaPercent(candidate.rawValue));
    const colorEntries = collectBaseColorEntries(variableIndex);
    let createdCount = 0;
    for (const [colorName, rgbHex] of colorEntries.entries()) {
        const rgb = hexToRgb(rgbHex);
        for (const alpha of ladder) {
            const ladderPath = ["color", "base", colorName, String(alpha)]
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
            const result = await ensureChainVariable(ladderPath, candidate, collections, variableIndex, {
                kind: "base",
                rawValue: colorValue
            });
            createdCount += result.created ? 1 : 0;
        }
    }
    return createdCount;
}
function collectBaseColorAlphaLadder(variableIndex) {
    const ladder = new Set([100, 80, 60, 40, 20, 10, 0]);
    for (const entry of [...variableIndex.values()].flat()) {
        const parts = entry.normalizedPath.split("/");
        if (parts[0] !== "color" || parts[1] !== "base" || !parts[3]) {
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
        if (parts[0] !== "color" || parts[1] !== "base" || !parts[2]) {
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
function buildSharedPropertyIndex(components, scanSettings) {
    var _a, _b, _c;
    const observations = new Map();
    for (const component of components) {
        for (const node of walkNodes(component.node)) {
            const bindables = extractBindableFields(node).items;
            for (const bindable of bindables) {
                if (!shouldIncludeBindableForSettings(node, component, bindable.property, scanSettings)) {
                    continue;
                }
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
        return String(normalizeFloatValue(rawValue));
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
async function bindVariableToNode(node, property, variable, range, effectIndex, effectField) {
    var _a, _b;
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
    if ((property === "effects.color" ||
        property === "effects.radius" ||
        property === "effects.spread" ||
        property === "effects.offsetX" ||
        property === "effects.offsetY") &&
        effectIndex !== undefined &&
        effectField) {
        if (!("effects" in node) || !Array.isArray(node.effects)) {
            throw new Error("Node does not support effect binding.");
        }
        const effects = [...node.effects];
        const effect = effects[effectIndex];
        if (!effect) {
            throw new Error(`Missing effect at index ${effectIndex}.`);
        }
        effects[effectIndex] = figma.variables.setBoundVariableForEffect(effect, effectField, variable);
        node.effects = effects;
        return;
    }
    if (node.type === "TEXT" &&
        (property === "fontSize" ||
            property === "fontFamily" ||
            property === "fontWeight" ||
            property === "lineHeight" ||
            property === "letterSpacing" ||
            property === "paragraphSpacing" ||
            property === "paragraphIndent")) {
        const textNode = node;
        if (textNode.characters.length === 0) {
            throw new Error("Empty text nodes cannot be bound.");
        }
        if (textNode.setRangeBoundVariable) {
            textNode.setRangeBoundVariable((_a = range === null || range === void 0 ? void 0 : range.start) !== null && _a !== void 0 ? _a : 0, (_b = range === null || range === void 0 ? void 0 : range.end) !== null && _b !== void 0 ? _b : textNode.characters.length, property, variable);
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
            return normalizeFloatValue(rawValue);
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
function normalizeFloatValue(value) {
    return Math.round((value + Number.EPSILON) * 10000) / 10000;
}
function numberOrZero(value) {
    return typeof value === "number" ? value : 0;
}
function getTokenLeaf(node, component, property) {
    var _a;
    const primaryAlias = normalizeSegment((_a = PROPERTY_ALIASES[property][0]) !== null && _a !== void 0 ? _a : property);
    const layerSegment = normalizeGeneratedLayerSegment(node.name, property);
    const groupedAlias = getGroupedAlias(node, property);
    if (groupedAlias) {
        return groupedAlias;
    }
    if (shouldUsePropertyAliasLeaf(node, component, property)) {
        return primaryAlias;
    }
    if (shouldUseLayerAndPropertyLeaf(property, layerSegment)) {
        if (layerSegment === primaryAlias) {
            return primaryAlias;
        }
        return `${layerSegment}/${primaryAlias}`;
    }
    return layerSegment || primaryAlias;
}
function normalizeGeneratedLayerSegment(nodeName, property) {
    const normalized = normalizeSegment(nodeName);
    if (!normalized) {
        return normalized;
    }
    if ((property === "strokes.color" || property === "strokeWeight") && normalized === "border") {
        return "stroke";
    }
    return normalized;
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
        property === "effects.color" ||
        property === "effects.radius" ||
        property === "effects.spread" ||
        property === "effects.offsetX" ||
        property === "effects.offsetY" ||
        property === "opacity" ||
        property === "width" ||
        property === "height" ||
        property === "fontSize" ||
        property === "fontFamily" ||
        property === "fontWeight" ||
        property === "lineHeight" ||
        property === "letterSpacing" ||
        property === "paragraphSpacing" ||
        property === "paragraphIndent" ||
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
function shouldSkipDimensionVariable(node, axis) {
    const field = axis === "horizontal" ? "layoutSizingHorizontal" : "layoutSizingVertical";
    const value = node[field];
    return value === "HUG" || value === "FILL";
}
function hasSemanticLayerName(node, settings) {
    const normalized = normalizeSegment(node.name);
    if (!normalized) {
        return false;
    }
    if (matchesSemanticDenylist(normalized, settings.semanticDenylist)) {
        return false;
    }
    if (/^(vector|group|frame|rectangle|ellipse|polygon|line|star)(-\d+)?$/.test(normalized)) {
        return false;
    }
    if (settings.semanticAllowlist.length > 0) {
        return matchesSemanticAllowlist(normalized, settings.semanticAllowlist);
    }
    return true;
}
function shouldStopTraversalOnNode(node) {
    if (node.type === "INSTANCE") {
        return true;
    }
    if (node.type === "BOOLEAN_OPERATION") {
        return true;
    }
    if ("isMask" in node && node.isMask === true) {
        return true;
    }
    const normalized = normalizeSegment(node.name);
    if (!normalized) {
        return false;
    }
    if (normalized === "mask") {
        return true;
    }
    if (normalized === "subtract" || normalized.startsWith("subtract-")) {
        return true;
    }
    return false;
}
function hasAutoLayout(node) {
    return "layoutMode" in node && typeof node.layoutMode === "string" && node.layoutMode !== "NONE";
}
function matchesSemanticAllowlist(normalizedName, allowlist) {
    return allowlist.some((entry) => {
        const normalizedEntry = normalizeSegment(entry);
        return normalizedEntry && (normalizedName === normalizedEntry || normalizedName.startsWith(`${normalizedEntry}-`));
    });
}
function matchesSemanticDenylist(normalizedName, denylist) {
    return denylist.some((entry) => {
        const normalizedEntry = normalizeSegment(entry);
        return normalizedEntry && (normalizedName === normalizedEntry || normalizedName.startsWith(`${normalizedEntry}-`));
    });
}
function shouldSkipNewVariableCreation(candidate, node) {
    if (candidate.resolvedType !== "FLOAT") {
        return false;
    }
    const numericValue = typeof candidate.rawValue === "number" ? candidate.rawValue : null;
    if (numericValue === null) {
        return false;
    }
    if ((candidate.property === "width" || candidate.property === "height") && isFillDimension(node, candidate.property)) {
        return true;
    }
    return isZeroCreateOnlyProperty(candidate.property) && isZeroValue(numericValue);
}
function isFillDimension(node, property) {
    if (property !== "width" && property !== "height") {
        return false;
    }
    const field = property === "width" ? "layoutSizingHorizontal" : "layoutSizingVertical";
    return node[field] === "FILL";
}
function isZeroCreateOnlyProperty(property) {
    return (property === "itemSpacing" ||
        property === "paddingTop" ||
        property === "paddingRight" ||
        property === "paddingBottom" ||
        property === "paddingLeft" ||
        property === "topLeftRadius" ||
        property === "topRightRadius" ||
        property === "bottomLeftRadius" ||
        property === "bottomRightRadius" ||
        property === "strokeWeight");
}
function isZeroValue(value) {
    return Math.abs(value) < 0.0001;
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
