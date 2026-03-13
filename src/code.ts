type VariableLookupEntry = {
  key: string;
  collectionId: string;
  collectionName: string;
  variable: Variable;
  variablePath: string;
  normalizedPath: string;
};

type VariantSegment = {
  property: string;
  value: string;
};

type BindableProperty =
  | "fills.color"
  | "strokes.color"
  | "strokeWeight"
  | "opacity"
  | "width"
  | "height"
  | "topLeftRadius"
  | "topRightRadius"
  | "bottomLeftRadius"
  | "bottomRightRadius"
  | "paddingTop"
  | "paddingRight"
  | "paddingBottom"
  | "paddingLeft"
  | "itemSpacing"
  | "fontSize"
  | "fontFamily"
  | "fontWeight"
  | "lineHeight"
  | "letterSpacing"
  | "paragraphSpacing"
  | "paragraphIndent";

type RawValue =
  | RGB
  | RGBA
  | number
  | string
  | {
      family: string;
      style: string;
    };

type CollectionKind = "colors" | "typography" | "device";
type ScanMode =
  | "selected-objects"
  | "selected-objects-with-internal-layers"
  | "selected-objects-with-semantic-internal-layers";

type PropertyFamily = "colors" | "typography" | "spacing" | "radius" | "size" | "border" | "opacity";

type ScanSettings = {
  colorsScanMode: ScanMode;
  typographyScanMode: ScanMode;
  deviceScanMode: ScanMode;
  enabledFamilies: Record<PropertyFamily, boolean>;
  semanticAllowlist: string[];
  semanticDenylist: string[];
};

type MatchCandidate = {
  id: string;
  nodeId: string;
  nodeName: string;
  pathNodeName: string;
  property: BindableProperty;
  resolvedType: VariableResolvedDataType;
  rawValue: RawValue;
  collectionKind: CollectionKind;
  matched: boolean;
  matchedVariableId?: string;
  matchedVariablePath?: string;
  proposedBasePath: string;
  proposedSemanticPath: string;
  proposedComponentPath: string;
  candidatePaths: string[];
  variantSegments: VariantSegment[];
  variantProperties: string[];
  pathComponentName: string;
  pathVariantSegments: VariantSegment[];
  skippedBecauseBound: boolean;
  existingBindingName?: string;
  rangeStart?: number;
  rangeEnd?: number;
};

type PreparedComponent = {
  node: SceneNode;
  ownerComponent: ComponentNode;
  componentName: string;
  variantSegments: VariantSegment[];
};

type PathContext = {
  componentName: string;
  variantSegments: VariantSegment[];
};

type SharedPropertyIndex = Map<string, string>;
type SharedObservation = {
  values: Set<string>;
  count: number;
};

type UISelectionItem = {
  id: string;
  label: string;
  path: string;
  checked: boolean;
};

type UIUnmatchedItem = {
  id: string;
  label: string;
  collectionKind: CollectionKind;
  rawValue: string;
  basePath: string;
  semanticPath: string;
  componentPath: string;
  variantProperties: string[];
  selectedVariantProperties: string[];
};

type UISkippedItem = {
  id: string;
  label: string;
  reason: string;
};

type UIConflictItem = {
  id: string;
  label: string;
  path: string;
  reason: string;
  pathKind: "base" | "semantic" | "component";
  chainLevelLabel: string;
  proposedPath: string;
  fallbackPath?: string;
  resolvedPreviewPath: string;
  action: "skip" | "reuse-existing" | "rename-proposed" | "create-deeper-semantic";
};

type ExecutionMode = "create-and-bind" | "dry-run" | "create-only" | "bind-only";

type AnalyzeResponse = {
  type: "analysis";
  ready: UISelectionItem[];
  unmatched: UIUnmatchedItem[];
  skippedItems: UISkippedItem[];
  conflicts: UIConflictItem[];
  skippedBound: number;
  selectionSummary: string;
  settings: ScanSettings;
};

type ConfirmMessage = {
  type: "confirm-bind";
  executionMode: ExecutionMode;
  readyIds: string[];
  createBaseVariables: boolean;
  unmatched: Array<{
    id: string;
    basePath: string;
    semanticPath: string;
    componentPath: string;
    skip: boolean;
    variantProperties: string[];
  }>;
  conflicts: Array<{
    id: string;
    action: "skip" | "reuse-existing" | "rename-proposed" | "create-deeper-semantic";
    proposedPath: string;
    pathKind: "base" | "semantic" | "component";
    fallbackPath?: string;
  }>;
};

type RequestAnalysisMessage = {
  type: "request-analysis";
  settings?: Partial<ScanSettings>;
};

type SummaryResponse = {
  type: "summary";
  executionMode: ExecutionMode;
  bound: number;
  created: number;
  skipped: number;
  plannedBound?: number;
  plannedCreated?: number;
  errors: string[];
};

const UI_WIDTH = 440;
const UI_HEIGHT = 720;
const COMPONENT_SEGMENT = "component";
const MATCHABLE_NODE_TYPES = new Set<NodeType>(["COMPONENT", "COMPONENT_SET"]);
const PROPERTY_ALIASES: Record<BindableProperty, string[]> = {
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
  fontWeight: ["font-weight"],
  lineHeight: ["line-height"],
  letterSpacing: ["letter-spacing"],
  paragraphSpacing: ["paragraph-spacing"],
  paragraphIndent: ["paragraph-indent"]
};

const analysisState = new Map<string, MatchCandidate>();
const defaultScanSettings: ScanSettings = {
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
let currentScanSettings: ScanSettings = {
  ...defaultScanSettings,
  enabledFamilies: { ...defaultScanSettings.enabledFamilies },
  semanticAllowlist: [...defaultScanSettings.semanticAllowlist],
  semanticDenylist: [...defaultScanSettings.semanticDenylist]
};

figma.showUI(__html__, { width: UI_WIDTH, height: UI_HEIGHT, themeColors: true });
void initialize();

async function initialize() {
  try {
    const analysis = await analyzeSelection(currentScanSettings);
    figma.ui.postMessage(analysis);
  } catch (error) {
    figma.ui.postMessage({
      type: "summary",
      executionMode: "create-and-bind",
      bound: 0,
      created: 0,
      skipped: 0,
      errors: [formatError(error)]
    } satisfies SummaryResponse);
  }
}

figma.on("selectionchange", () => {
  void initialize();
});

figma.ui.onmessage = async (message: ConfirmMessage | RequestAnalysisMessage) => {
  if (message.type === "request-analysis") {
    currentScanSettings = {
      ...currentScanSettings,
      ...message.settings,
      enabledFamilies: {
        ...currentScanSettings.enabledFamilies,
        ...(message.settings?.enabledFamilies ?? {})
      },
      semanticAllowlist: message.settings?.semanticAllowlist
        ? [...message.settings.semanticAllowlist]
        : currentScanSettings.semanticAllowlist,
      semanticDenylist: message.settings?.semanticDenylist
        ? [...message.settings.semanticDenylist]
        : currentScanSettings.semanticDenylist
    };
    await initialize();
    return;
  }

  if (message.type !== "confirm-bind") {
    return;
  }

  try {
    const result = await executeBindings(message);
    figma.ui.postMessage(result);
  } catch (error) {
    figma.ui.postMessage({
      type: "summary",
      executionMode: "create-and-bind",
      bound: 0,
      created: 0,
      skipped: 0,
      errors: [formatError(error)]
    } satisfies SummaryResponse);
  }
};

async function analyzeSelection(scanSettings: ScanSettings): Promise<AnalyzeResponse> {
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
      skippedItems: [],
      conflicts: [],
      skippedBound: 0,
      selectionSummary: "Select a component, component set, or a layer inside a component.",
      settings: scanSettings
    };
  }

  const { matches, skippedItems } = await collectMatches(preparedComponents, variableIndex, scanSettings);
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
      .map((match) => ({
        id: match.id,
        label: `${match.nodeName} · ${match.property}`,
        path: match.matchedVariablePath ?? "",
        checked: true
      })),
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
    settings: scanSettings
  };
}

function buildVariableIndex(
  variables: Variable[],
  collectionById: Map<string, VariableCollection>
): Map<string, VariableLookupEntry[]> {
  const index = new Map<string, VariableLookupEntry[]>();

  for (const variable of variables) {
    const collection = collectionById.get(variable.variableCollectionId);
    if (!collection) {
      continue;
    }

    insertVariableIntoIndex(index, variable, collection);
  }

  return index;
}

function insertVariableIntoIndex(
  index: Map<string, VariableLookupEntry[]>,
  variable: Variable,
  collection: VariableCollection
): void {
  const fullPath = `${collection.name}/${variable.name}`;
  const normalizedPath = normalizeTokenPath(fullPath);
  const entry: VariableLookupEntry = {
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

function prepareSelection(selection: readonly SceneNode[]): PreparedComponent[] {
  const prepared: PreparedComponent[] = [];

  for (const node of selection) {
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
      const componentNode = node as ComponentNode;
      const parent = componentNode.parent;
      const variantSegments =
        parent && parent.type === "COMPONENT_SET" ? extractVariantSegments(componentNode, parent) : [];
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

    const parent = ownerComponent.parent;
    const variantSegments =
      parent && parent.type === "COMPONENT_SET" ? extractVariantSegments(ownerComponent, parent) : [];
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

function findOwningComponent(node: SceneNode): ComponentNode | null {
  let current: BaseNode | null = node;

  while (current) {
    if (current.type === "COMPONENT") {
      return current;
    }
    current = current.parent;
  }

  return null;
}

function extractVariantSegments(componentNode: ComponentNode, componentSet?: ComponentSetNode): VariantSegment[] {
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

function getVariantPropertyNames(componentSet?: ComponentSetNode): string[] {
  if (!componentSet) {
    return [];
  }

  const groupPropertyNames = Object.keys(componentSet.variantGroupProperties ?? {});
  if (groupPropertyNames.length > 0) {
    return groupPropertyNames;
  }

  return Object.entries(componentSet.componentPropertyDefinitions)
    .filter(([, definition]) => definition.type === "VARIANT")
    .map(([propertyName]) => propertyName);
}

function parseVariantSegments(variantName: string): VariantSegment[] {
  return variantName
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const [property, value] = segment.split("=").map((part) => part.trim());
      return property && value ? { property, value } : null;
    })
    .filter((segment): segment is VariantSegment => segment !== null);
}

async function collectMatches(
  components: PreparedComponent[],
  variableIndex: Map<string, VariableLookupEntry[]>,
  scanSettings: ScanSettings
): Promise<{ matches: MatchCandidate[]; skippedItems: UISkippedItem[] }> {
  const matches: MatchCandidate[] = [];
  const skippedItems: UISkippedItem[] = [];
  const skippedKeys = new Set<string>();
  const sharedPropertyIndex = buildSharedPropertyIndex(components, scanSettings);

  for (const component of components) {
    const nodes = walkNodes(component.node);
    for (const node of nodes) {
      const result = await inspectNodeBindings(node, component, variableIndex, sharedPropertyIndex, scanSettings);
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

function walkNodes(root: SceneNode): SceneNode[] {
  if (root.type === "INSTANCE") {
    return [];
  }

  const nodes: SceneNode[] = [root];

  if ("children" in root) {
    for (const child of root.children) {
      if (child.type === "INSTANCE") {
        continue;
      }
      nodes.push(...walkDescendants(child as SceneNode));
    }
  }

  return nodes;
}

function walkDescendants(node: SceneNode): SceneNode[] {
  if (node.type === "INSTANCE") {
    return [];
  }

  const nodes: SceneNode[] = [node];

  if ("children" in node) {
    for (const child of node.children) {
      if (child.type === "INSTANCE") {
        continue;
      }
      nodes.push(...walkDescendants(child as SceneNode));
    }
  }

  return nodes;
}

async function inspectNodeBindings(
  node: SceneNode,
  component: PreparedComponent,
  variableIndex: Map<string, VariableLookupEntry[]>,
  sharedPropertyIndex: SharedPropertyIndex,
  scanSettings: ScanSettings
): Promise<{ candidates: MatchCandidate[]; skippedItems: UISkippedItem[] }> {
  const candidates: MatchCandidate[] = [];
  const skippedItems: UISkippedItem[] = [];
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
    if (!shouldIncludeBindableForSettings(node, component, bindable.property, scanSettings)) {
      continue;
    }

    const effectiveNode = bindable.pathNodeName
      ? ({ ...(node as unknown as Record<string, unknown>), name: bindable.pathNodeName } as SceneNode)
      : node;
    const pathContext = getPathContext(effectiveNode, component, bindable.property, bindable.rawValue, bindable.resolvedType, sharedPropertyIndex);
    const proposedChain = buildProposedChain(pathContext, effectiveNode, bindable.property, bindable.rawValue);
    const existingBinding = await getExistingBindingName(node, bindable.property, bindable.rangeStart, bindable.rangeEnd);
    const candidateId = `${node.id}:${bindable.property}:${bindable.rangeStart ?? "all"}:${bindable.rangeEnd ?? "all"}`;
    const candidateNodeName = bindable.displayNodeName ?? node.name;
    if (existingBinding) {
      candidates.push({
        id: candidateId,
        nodeId: node.id,
        nodeName: candidateNodeName,
        pathNodeName: bindable.pathNodeName ?? node.name,
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
        rangeEnd: bindable.rangeEnd
      });
      continue;
    }

    const match = findVariableMatch(effectiveNode, bindable.property, pathContext, variableIndex);
    candidates.push({
      id: candidateId,
      nodeId: node.id,
      nodeName: candidateNodeName,
      pathNodeName: bindable.pathNodeName ?? node.name,
      property: bindable.property,
      resolvedType: bindable.resolvedType,
      rawValue: bindable.rawValue,
      collectionKind: proposedChain.collectionKind,
      matched: Boolean(match),
      matchedVariableId: match?.variable.id,
      matchedVariablePath: match?.variablePath,
      proposedBasePath: proposedChain.basePath,
      proposedSemanticPath: proposedChain.semanticPath,
      proposedComponentPath: match?.variablePath ?? proposedChain.componentPath,
      candidatePaths: buildCandidatePaths(proposedChain.collectionKind, pathContext, effectiveNode, bindable.property),
      variantSegments: component.variantSegments,
      variantProperties: component.variantSegments.map((segment) => segment.property),
      pathComponentName: pathContext.componentName,
      pathVariantSegments: pathContext.variantSegments,
      skippedBecauseBound: false,
      rangeStart: bindable.rangeStart,
      rangeEnd: bindable.rangeEnd
    });
  }

  return { candidates, skippedItems };
}

function extractBindableFields(
  node: SceneNode
): {
  items: Array<{
    property: BindableProperty;
    rawValue: RawValue;
    resolvedType: VariableResolvedDataType;
    displayNodeName?: string;
    pathNodeName?: string;
    rangeStart?: number;
    rangeEnd?: number;
  }>;
  skippedItems: Array<{ property: BindableProperty; reason: string }>;
} {
  const items: Array<{
    property: BindableProperty;
    rawValue: RawValue;
    resolvedType: VariableResolvedDataType;
    displayNodeName?: string;
    pathNodeName?: string;
    rangeStart?: number;
    rangeEnd?: number;
  }> = [];
  const skippedItems: Array<{ property: BindableProperty; reason: string }> = [];
  const anyNode = node as SceneNode & Record<string, unknown>;

  if ("fills" in anyNode && Array.isArray(anyNode.fills)) {
    const fills = anyNode.fills as Paint[];
    const fillSupport = getPaintSupportDetails(fills, "fill");
    if (fillSupport.kind === "single-solid" && fillSupport.paint) {
      items.push({ property: "fills.color", rawValue: solidPaintToRgba(fillSupport.paint), resolvedType: "COLOR" });
    } else if (fillSupport.reason) {
      skippedItems.push({ property: "fills.color", reason: fillSupport.reason });
    }
  }

  if ("strokes" in anyNode && Array.isArray(anyNode.strokes)) {
    const strokes = anyNode.strokes as Paint[];
    const strokeSupport = getPaintSupportDetails(strokes, "stroke");
    if (strokeSupport.kind === "single-solid" && strokeSupport.paint) {
      items.push({ property: "strokes.color", rawValue: solidPaintToRgba(strokeSupport.paint), resolvedType: "COLOR" });
      if (typeof anyNode.strokeWeight === "number") {
        items.push({ property: "strokeWeight", rawValue: anyNode.strokeWeight as number, resolvedType: "FLOAT" });
      }
    } else if (strokeSupport.reason) {
      skippedItems.push({ property: "strokes.color", reason: strokeSupport.reason });
    }
  }

  const numericFields: BindableProperty[] = [
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
      if (field === "width" && shouldSkipDimensionVariable(node, "horizontal")) {
        skippedItems.push({ property: "width", reason: "Width is skipped for HUG or FILL sizing." });
        continue;
      }
      if (field === "height" && shouldSkipDimensionVariable(node, "vertical")) {
        skippedItems.push({ property: "height", reason: "Height is skipped for HUG or FILL sizing." });
        continue;
      }
      if (field === "opacity" && isFullOpacity(anyNode[field] as number)) {
        skippedItems.push({ property: "opacity", reason: "Full opacity does not create a standalone variable." });
        continue;
      }
      items.push({ property: field, rawValue: anyNode[field] as number, resolvedType: "FLOAT" });
    }
  }

  if (node.type === "TEXT") {
    if (node.characters.length > 0) {
      const textExtraction = extractTextBindableFields(node);
      items.push(...textExtraction.items);
      skippedItems.push(...textExtraction.skippedItems);
    }
  }

  return { items, skippedItems };
}

function percentTypographyValueToPixels(fontSize: number, percentValue: number): number {
  return (fontSize * percentValue) / 100;
}

function extractTextBindableFields(node: TextNode): {
  items: Array<{
    property: BindableProperty;
    rawValue: RawValue;
    resolvedType: VariableResolvedDataType;
    displayNodeName?: string;
    pathNodeName?: string;
    rangeStart?: number;
    rangeEnd?: number;
  }>;
  skippedItems: Array<{ property: BindableProperty; reason: string }>;
} {
  const items: Array<{
    property: BindableProperty;
    rawValue: RawValue;
    resolvedType: VariableResolvedDataType;
    displayNodeName?: string;
    pathNodeName?: string;
    rangeStart?: number;
    rangeEnd?: number;
  }> = [];
  const skippedItems: Array<{ property: BindableProperty; reason: string }> = [];
  const numericFontSize = typeof node.fontSize === "number" ? node.fontSize : null;
  const segments = getTextStyledSegments(node);

  if (numericFontSize !== null) {
    items.push({ property: "fontSize", rawValue: numericFontSize, resolvedType: "FLOAT" });
  } else {
    const rangeItems = extractRangeTextPropertyItems(node, "fontSize", segments);
    if (rangeItems.length > 0) {
      items.push(...rangeItems);
    } else {
      skippedItems.push({ property: "fontSize", reason: "Mixed text styles are not supported for font size yet." });
    }
  }

  if (node.fontName !== figma.mixed) {
    const fontName = node.fontName as FontName;
    items.push({
      property: "fontFamily",
      rawValue: fontName.family,
      resolvedType: "STRING"
    });
  } else {
    const rangeItems = extractRangeTextPropertyItems(node, "fontFamily", segments);
    if (rangeItems.length > 0) {
      items.push(...rangeItems);
    } else {
      skippedItems.push({ property: "fontFamily", reason: "Mixed text styles are not supported for font family yet." });
    }
  }

  if (typeof node.fontWeight === "number") {
    items.push({ property: "fontWeight", rawValue: node.fontWeight, resolvedType: "FLOAT" });
  } else {
    const rangeItems = extractRangeTextPropertyItems(node, "fontWeight", segments);
    if (rangeItems.length > 0) {
      items.push(...rangeItems);
    } else {
      skippedItems.push({ property: "fontWeight", reason: "Mixed text styles are not supported for font weight yet." });
    }
  }

  if (node.lineHeight !== figma.mixed) {
    const value = resolveTextLineHeightValue(node.lineHeight as LineHeight, numericFontSize);
    if (typeof value === "number") {
      if (!shouldSkipDefaultTextNumericValue("lineHeight", value)) {
        items.push({ property: "lineHeight", rawValue: value, resolvedType: "FLOAT" });
      } else {
        skippedItems.push({ property: "lineHeight", reason: "Default line height does not create a token." });
      }
    } else {
      skippedItems.push({ property: "lineHeight", reason: value ?? "Line height is not supported yet." });
    }
  } else {
    const rangeItems = extractRangeTextPropertyItems(node, "lineHeight", segments);
    if (rangeItems.length > 0) {
      items.push(...rangeItems);
    } else {
      skippedItems.push({ property: "lineHeight", reason: "Mixed text styles are not supported for line height yet." });
    }
  }

  if (node.letterSpacing !== figma.mixed) {
    const value = resolveTextLetterSpacingValue(node.letterSpacing as LetterSpacing, numericFontSize);
    if (typeof value === "number") {
      if (!shouldSkipDefaultTextNumericValue("letterSpacing", value)) {
        items.push({ property: "letterSpacing", rawValue: value, resolvedType: "FLOAT" });
      } else {
        skippedItems.push({ property: "letterSpacing", reason: "Default letter spacing does not create a token." });
      }
    } else {
      skippedItems.push({ property: "letterSpacing", reason: value ?? "Letter spacing is not supported yet." });
    }
  } else {
    const rangeItems = extractRangeTextPropertyItems(node, "letterSpacing", segments);
    if (rangeItems.length > 0) {
      items.push(...rangeItems);
    } else {
      skippedItems.push({ property: "letterSpacing", reason: "Mixed text styles are not supported for letter spacing yet." });
    }
  }

  if (typeof node.paragraphSpacing === "number") {
    if (!shouldSkipDefaultTextNumericValue("paragraphSpacing", node.paragraphSpacing)) {
      items.push({ property: "paragraphSpacing", rawValue: node.paragraphSpacing, resolvedType: "FLOAT" });
    } else {
      skippedItems.push({ property: "paragraphSpacing", reason: "Default paragraph spacing does not create a token." });
    }
  } else {
    const rangeItems = extractRangeTextPropertyItems(node, "paragraphSpacing", segments);
    if (rangeItems.length > 0) {
      items.push(...rangeItems);
    } else {
      skippedItems.push({ property: "paragraphSpacing", reason: "Mixed text styles are not supported for paragraph spacing yet." });
    }
  }

  if (typeof node.paragraphIndent === "number") {
    if (!shouldSkipDefaultTextNumericValue("paragraphIndent", node.paragraphIndent)) {
      items.push({ property: "paragraphIndent", rawValue: node.paragraphIndent, resolvedType: "FLOAT" });
    } else {
      skippedItems.push({ property: "paragraphIndent", reason: "Default paragraph indent does not create a token." });
    }
  } else {
    const rangeItems = extractRangeTextPropertyItems(node, "paragraphIndent", segments);
    if (rangeItems.length > 0) {
      items.push(...rangeItems);
    } else {
      skippedItems.push({ property: "paragraphIndent", reason: "Mixed text styles are not supported for paragraph indent yet." });
    }
  }

  return { items, skippedItems };
}

function getTextStyledSegments(node: TextNode): Array<Record<string, unknown> & { start: number; end: number; characters: string }> {
  const textNode = node as TextNode & {
    getStyledTextSegments?: (fields: string[]) => Array<Record<string, unknown> & { start: number; end: number; characters: string }>;
  };

  if (!textNode.getStyledTextSegments) {
    return [];
  }

  return textNode.getStyledTextSegments([
    "fontSize",
    "fontName",
    "fontWeight",
    "lineHeight",
    "letterSpacing",
    "paragraphSpacing",
    "paragraphIndent"
  ]) ?? [];
}

function extractRangeTextPropertyItems(
  node: TextNode,
  property: BindableProperty,
  segments: Array<Record<string, unknown> & { start: number; end: number; characters: string }>
): Array<{
  property: BindableProperty;
  rawValue: RawValue;
  resolvedType: VariableResolvedDataType;
  displayNodeName?: string;
  pathNodeName?: string;
  rangeStart?: number;
  rangeEnd?: number;
}> {
  const rangeItems: Array<{
    property: BindableProperty;
    rawValue: RawValue;
    resolvedType: VariableResolvedDataType;
    displayNodeName?: string;
    pathNodeName?: string;
    rangeStart?: number;
    rangeEnd?: number;
  }> = [];

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
    if (
      previous &&
      previous.rangeEnd === segment.start &&
      getComparableRawValue(previous.rawValue, previous.resolvedType) === comparable
    ) {
      previous.rangeEnd = segment.end;
      previous.displayNodeName = buildTextRangeDisplayNodeName(
        node.name,
        rangeItems.length,
        node.characters.slice(previous.rangeStart ?? 0, segment.end)
      );
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

function getResolvedTypeForTextProperty(property: BindableProperty): VariableResolvedDataType {
  return property === "fontFamily" ? "STRING" : "FLOAT";
}

function getTextSegmentRawValue(
  segment: Record<string, unknown>,
  property: BindableProperty
): RawValue | null {
  if (property === "fontSize") {
    return typeof segment.fontSize === "number" ? segment.fontSize : null;
  }
  if (property === "fontFamily") {
    const fontName = segment.fontName as FontName | undefined;
    return fontName && typeof fontName.family === "string" ? fontName.family : null;
  }
  if (property === "fontWeight") {
    return typeof segment.fontWeight === "number" ? segment.fontWeight : null;
  }
  if (property === "lineHeight") {
    const fontSize = typeof segment.fontSize === "number" ? segment.fontSize : null;
    const resolved = resolveTextLineHeightValue(segment.lineHeight as LineHeight | undefined, fontSize);
    return typeof resolved === "number" ? resolved : null;
  }
  if (property === "letterSpacing") {
    const fontSize = typeof segment.fontSize === "number" ? segment.fontSize : null;
    const resolved = resolveTextLetterSpacingValue(segment.letterSpacing as LetterSpacing | undefined, fontSize);
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

function resolveTextLineHeightValue(lineHeight: LineHeight | undefined, numericFontSize: number | null): number | string | null {
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

function resolveTextLetterSpacingValue(letterSpacing: LetterSpacing | undefined, numericFontSize: number | null): number | string | null {
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

function shouldSkipDefaultTextNumericValue(property: BindableProperty, value: number): boolean {
  if (!isZeroValue(value)) {
    return false;
  }

  return (
    property === "letterSpacing" ||
    property === "paragraphSpacing" ||
    property === "paragraphIndent"
  );
}

function toTextRange(candidate: MatchCandidate): { start: number; end: number } | undefined {
  if (candidate.rangeStart === undefined || candidate.rangeEnd === undefined) {
    return undefined;
  }
  return {
    start: candidate.rangeStart,
    end: candidate.rangeEnd
  };
}

function buildTextRangeDisplayNodeName(nodeName: string, rangeIndex: number, textSlice: string): string {
  const preview = truncateTextRangeLabel(textSlice);
  return `${nodeName} [Range ${rangeIndex}: ${preview}]`;
}

function buildTextRangePathNodeName(nodeName: string, rangeIndex: number): string {
  return `${nodeName}/text-range-${rangeIndex}`;
}

function truncateTextRangeLabel(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "range";
  }
  return normalized.length > 24 ? `${normalized.slice(0, 24).trim()}…` : normalized;
}

function getPaintSupportDetails(
  paints: Paint[],
  paintKind: "fill" | "stroke"
): {
  kind: "empty" | "single-solid" | "unsupported";
  paint?: SolidPaint;
  reason?: string;
} {
  const visiblePaints = paints.filter((paint) => paint.visible !== false);
  if (visiblePaints.length === 0) {
    return { kind: "empty" };
  }

  const solidPaints = visiblePaints.filter((paint): paint is SolidPaint => paint.type === "SOLID");
  const gradientPaints = visiblePaints.filter((paint) => paint.type.includes("GRADIENT"));
  const imagePaints = visiblePaints.filter((paint) => paint.type === "IMAGE");
  const otherPaints = visiblePaints.filter((paint) =>
    paint.type !== "SOLID" && !paint.type.includes("GRADIENT") && paint.type !== "IMAGE"
  );

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

async function getExistingBindingName(
  node: SceneNode,
  property: BindableProperty,
  rangeStart?: number,
  rangeEnd?: number
): Promise<string | null> {
  const binding = extractExistingBinding(node, property, rangeStart, rangeEnd);
  if (!binding) {
    return null;
  }

  const variable = await figma.variables.getVariableByIdAsync(binding.id);
  return variable ? variable.name : binding.id;
}

function extractExistingBinding(
  node: SceneNode,
  property: BindableProperty,
  rangeStart?: number,
  rangeEnd?: number
): { id: string } | null {
  if (
    node.type === "TEXT" &&
    rangeStart !== undefined &&
    rangeEnd !== undefined &&
    (
      property === "fontSize" ||
      property === "fontFamily" ||
      property === "fontWeight" ||
      property === "lineHeight" ||
      property === "letterSpacing" ||
      property === "paragraphSpacing" ||
      property === "paragraphIndent"
    )
  ) {
    const textNode = node as TextNode & {
      getRangeBoundVariable?: (
        start: number,
        end: number,
        field: "fontFamily" | "fontSize" | "fontWeight" | "lineHeight" | "letterSpacing" | "paragraphSpacing" | "paragraphIndent"
      ) => VariableAlias | null | undefined;
    };
    if (textNode.getRangeBoundVariable) {
      const binding = textNode.getRangeBoundVariable(rangeStart, rangeEnd, property);
      if (binding && typeof binding === "object" && "id" in binding) {
        return binding;
      }
    }
  }

  const anyNode = node as SceneNode & {
    boundVariables?: Record<string, VariableAlias | VariableAlias[] | Record<string, VariableAlias> | undefined>;
  };
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
        const paintBinding = entry as unknown as Record<string, VariableAlias | undefined>;
        if (paintBinding.color) {
          return paintBinding.color as VariableAlias;
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
        const paintBinding = entry as unknown as Record<string, VariableAlias | undefined>;
        if (paintBinding.color) {
          return paintBinding.color;
        }
      }
    }
  }

  const directKey = property as keyof typeof bound;
  const directBinding = bound[directKey];
  if (directBinding && !Array.isArray(directBinding) && "id" in directBinding) {
    return directBinding as VariableAlias;
  }

  return null;
}

function findVariableMatch(
  node: SceneNode,
  property: BindableProperty,
  pathContext: PathContext,
  variableIndex: Map<string, VariableLookupEntry[]>
): VariableLookupEntry | null {
  const candidatePaths = buildCandidatePaths(getCollectionKind(property), pathContext, node, property);
  for (const candidatePath of candidatePaths) {
    const exact = variableIndex.get(candidatePath);
    if (exact?.length) {
      return exact[0];
    }
  }

  return null;
}

function findExistingVariableByPath(
  fullPath: string,
  variableIndex: Map<string, VariableLookupEntry[]>
): VariableLookupEntry | null {
  const normalizedPath = normalizeTokenPath(fullPath);
  return variableIndex.get(normalizedPath)?.[0] ?? null;
}

function buildCandidatePaths(
  collectionKind: CollectionKind,
  pathContext: PathContext,
  node: SceneNode,
  property: BindableProperty
): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();

  const pushPath = (componentName: string, variantSegments: VariantSegment[]) => {
    const path = buildComponentPath(collectionKind, { componentName, variantSegments }, node, property);
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

function getComponentNamePrefixes(componentName: string): string[] {
  const segments = componentName
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  const prefixes: string[] = [];

  for (let index = segments.length - 1; index > 0; index -= 1) {
    prefixes.push(segments.slice(0, index).join("/"));
  }

  return prefixes;
}

function buildComponentPath(
  collectionKind: CollectionKind,
  pathContext: PathContext,
  node: SceneNode,
  property: BindableProperty
): string {
  const componentLeaf = getComponentLeaf(node, {
    node: null as unknown as SceneNode,
    ownerComponent: null as unknown as ComponentNode,
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

function buildProposedChain(
  pathContext: PathContext,
  node: SceneNode,
  property: BindableProperty,
  rawValue: RawValue
): { collectionKind: CollectionKind; basePath: string; semanticPath: string; componentPath: string } {
  const collectionKind = getCollectionKind(property);
  return {
    collectionKind,
    basePath: buildBasePath(collectionKind, property, rawValue),
    semanticPath: buildSemanticPath(collectionKind, pathContext, node, property, rawValue),
    componentPath: buildComponentPath(collectionKind, pathContext, node, property)
  };
}

function buildSemanticPath(
  collectionKind: CollectionKind,
  pathContext: PathContext,
  node: SceneNode,
  property: BindableProperty,
  rawValue: RawValue
): string {
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

function buildScopedSemanticPath(
  collectionKind: CollectionKind,
  pathContext: PathContext,
  node: SceneNode,
  property: BindableProperty,
  rawValue: RawValue
): string {
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

function buildBasePath(
  collectionKind: CollectionKind,
  property: BindableProperty,
  rawValue: RawValue
): string {
  if (collectionKind === "colors") {
    const color = rawValue as RGBA | RGB;
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

function getCollectionKind(property: BindableProperty): CollectionKind {
  if (property === "fills.color" || property === "strokes.color") {
    return "colors";
  }
  if (
    property === "fontSize" ||
    property === "fontFamily" ||
    property === "fontWeight" ||
    property === "lineHeight" ||
    property === "letterSpacing" ||
    property === "paragraphSpacing" ||
    property === "paragraphIndent"
  ) {
    return "typography";
  }
  return "device";
}

function getPropertyFamily(property: BindableProperty): PropertyFamily {
  if (property === "fills.color") {
    return "colors";
  }
  if (
    property === "fontSize" ||
    property === "fontFamily" ||
    property === "fontWeight" ||
    property === "lineHeight" ||
    property === "letterSpacing" ||
    property === "paragraphSpacing" ||
    property === "paragraphIndent"
  ) {
    return "typography";
  }
  if (property === "strokes.color" || property === "strokeWeight") {
    return "border";
  }
  if (property === "opacity") {
    return "opacity";
  }
  if (
    property === "paddingTop" ||
    property === "paddingRight" ||
    property === "paddingBottom" ||
    property === "paddingLeft" ||
    property === "itemSpacing"
  ) {
    return "spacing";
  }
  if (
    property === "topLeftRadius" ||
    property === "topRightRadius" ||
    property === "bottomLeftRadius" ||
    property === "bottomRightRadius"
  ) {
    return "radius";
  }
  return "size";
}

function getScanModeForProperty(property: BindableProperty, settings: ScanSettings): ScanMode {
  const collectionKind = getCollectionKind(property);
  if (collectionKind === "colors") {
    return settings.colorsScanMode;
  }
  if (collectionKind === "typography") {
    return settings.typographyScanMode;
  }
  return settings.deviceScanMode;
}

function shouldIncludeBindableForSettings(
  node: SceneNode,
  component: PreparedComponent,
  property: BindableProperty,
  settings: ScanSettings
): boolean {
  if (!settings.enabledFamilies[getPropertyFamily(property)]) {
    return false;
  }

  const scanMode = getScanModeForProperty(property, settings);
  return shouldIncludeNodeForMode(node, component, scanMode, settings);
}

function shouldIncludeSkippedForSettings(
  node: SceneNode,
  component: PreparedComponent,
  property: BindableProperty,
  settings: ScanSettings
): boolean {
  if (!settings.enabledFamilies[getPropertyFamily(property)]) {
    return false;
  }

  const scanMode = getScanModeForProperty(property, settings);
  return shouldIncludeNodeForMode(node, component, scanMode, settings);
}

function shouldIncludeNodeForMode(
  node: SceneNode,
  component: PreparedComponent,
  scanMode: ScanMode,
  settings: ScanSettings
): boolean {
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

function getComponentLeaf(node: SceneNode, component: PreparedComponent, property: BindableProperty): string {
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
    return normalizeSegment(PROPERTY_ALIASES[property][0] ?? property);
  }

  const nodeName = normalizeSegment(node.name);
  const bucket = getDeviceBucket(property);
  return nodeName && component.node && node.id !== component.node.id ? `${nodeName}/${bucket}` : bucket;
}

function getSemanticColorRole(node: SceneNode, property: BindableProperty): string {
  if (property === "strokes.color") {
    return "border";
  }
  const nodeName = normalizeSegment(node.name);
  if (nodeName && !looksLikeVariantNodeName(node.name)) {
    return nodeName;
  }
  return "bg";
}

function getSemanticDomain(componentName: string): string {
  const family = normalizeSegment(componentName.split("/")[0] ?? componentName);
  if (family === "button") {
    return "action";
  }
  return family || "surface";
}

function getSemanticSubtypeSegments(componentName: string): string[] {
  const segments = componentName.split("/").map((segment) => normalizeSegment(segment)).filter(Boolean);
  return segments.slice(1);
}

function getTypographyLeaf(property: BindableProperty): string {
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

function getDeviceBucket(property: BindableProperty): string {
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
      return normalizeSegment(PROPERTY_ALIASES[property][0] ?? property);
  }
}

function formatNumberish(rawValue: RawValue): string {
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

function colorAlphaPercent(color: RGBA | RGB): number {
  const alpha = "a" in color ? color.a : 1;
  return Math.round(alpha * 100);
}

const baseColorNames = new Map<string, string>();

function getBaseColorName(color: RGBA | RGB): string {
  const rgbKey = rgbaToHex({ r: color.r, g: color.g, b: color.b });
  const existing = baseColorNames.get(rgbKey);
  if (existing) {
    return existing;
  }
  const next = `color${baseColorNames.size + 1}`;
  baseColorNames.set(rgbKey, next);
  return next;
}

function seedBaseColorNames(
  variableIndex: Map<string, VariableLookupEntry[]>,
  collectionById: Map<string, VariableCollection>
): void {
  baseColorNames.clear();
  for (const entry of [...variableIndex.values()].flat()) {
    const parts = entry.normalizedPath.split("/");
    if (parts[0] !== "colors" || parts[1] !== "base" || !parts[2]?.startsWith("color")) {
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

async function executeBindings(message: ConfirmMessage): Promise<SummaryResponse> {
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
  const errors: string[] = [];
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
        await bindVariableToNode(node as SceneNode, candidate.property, variable, toTextRange(candidate));
        bound += 1;
      } else {
        skipped += 1;
      }
    } catch (error) {
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
      if (shouldSkipNewVariableCreation(candidate, node as SceneNode)) {
        skipped += 1;
        continue;
      }

      if (!shouldCreate) {
        skipped += 1;
        continue;
      }

      const result = await ensureVariableForCandidate(
        candidate,
        {
          createBaseVariables: message.createBaseVariables,
          basePath: unmatched.basePath,
          semanticPath: unmatched.semanticPath,
          componentPath: unmatched.componentPath,
          variantProperties: unmatched.variantProperties
        },
        collections,
        variableIndex
      );
      created += result.createdCount;
      if (shouldBind) {
        await bindVariableToNode(node as SceneNode, candidate.property, result.variable, toTextRange(candidate));
        bound += 1;
      }
    } catch (error) {
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
        await bindVariableToNode(node as SceneNode, candidate.property, existing.variable, toTextRange(candidate));
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

      const result = await ensureVariableForCandidate(
        candidate,
        {
          createBaseVariables: message.createBaseVariables,
          basePath: resolvedBasePath,
          semanticPath: resolvedSemanticPath,
          componentPath: resolvedComponentPath,
          variantProperties: candidate.variantProperties
        },
        collections,
        variableIndex
      );
      created += result.createdCount;
      if (shouldBind) {
        await bindVariableToNode(node as SceneNode, candidate.property, result.variable, toTextRange(candidate));
        bound += 1;
      }
    } catch (error) {
      errors.push(`${candidate.nodeName} · ${candidate.property}: ${formatError(error)}`);
    }
  }

  return {
    type: "summary",
    executionMode: message.executionMode,
    bound,
    created,
    skipped,
    errors
  };
}

async function buildDryRunSummary(
  message: ConfirmMessage,
  collections: VariableCollection[],
  variableIndex: Map<string, VariableLookupEntry[]>
): Promise<SummaryResponse> {
  let skipped = 0;
  let plannedBound = 0;
  let plannedCreated = 0;
  const errors: string[] = [];
  const simulatedPaths = new Set<string>(variableIndex.keys());

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
      if (shouldSkipNewVariableCreation(candidate, node as SceneNode)) {
        skipped += 1;
        continue;
      }
      plannedCreated += estimateCreatedPathsForCandidate(
        candidate,
        unmatched.basePath,
        unmatched.semanticPath,
        unmatched.componentPath,
        message.createBaseVariables,
        variableIndex,
        simulatedPaths
      );
      plannedBound += 1;
    } catch (error) {
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

    plannedCreated += estimateCreatedPathsForCandidate(
      candidate,
      basePath,
      semanticPath,
      componentPath,
      message.createBaseVariables,
      variableIndex,
      simulatedPaths
    );
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

function estimateCreatedPathsForCandidate(
  candidate: MatchCandidate,
  basePath: string,
  semanticPath: string,
  componentPath: string,
  createBaseVariables: boolean,
  variableIndex: Map<string, VariableLookupEntry[]>,
  simulatedPaths: Set<string>
): number {
  let created = 0;

  if (createBaseVariables) {
    created += addSimulatedPath(basePath, simulatedPaths, variableIndex);
    if (candidate.collectionKind === "colors") {
      const ladder = collectBaseColorAlphaLadder(variableIndex);
      ladder.add(colorAlphaPercent(candidate.rawValue as RGBA | RGB));
      const colorEntries = collectBaseColorEntries(variableIndex);
      for (const colorName of colorEntries.keys()) {
        for (const alpha of ladder) {
          const ladderPath = normalizeTokenPath(`colors/base/${colorName}/${alpha}`);
          created += addSimulatedPath(ladderPath, simulatedPaths, variableIndex);
        }
      }
    }
  }

  created += addSimulatedPath(semanticPath, simulatedPaths, variableIndex);
  created += addSimulatedPath(componentPath, simulatedPaths, variableIndex);
  return created;
}

function addSimulatedPath(
  fullPath: string,
  simulatedPaths: Set<string>,
  variableIndex: Map<string, VariableLookupEntry[]>
): number {
  const normalizedPath = normalizeTokenPath(fullPath);
  if (simulatedPaths.has(normalizedPath) || variableIndex.has(normalizedPath)) {
    return 0;
  }
  simulatedPaths.add(normalizedPath);
  return 1;
}

async function ensureVariableForCandidate(
  candidate: MatchCandidate,
  options: {
    createBaseVariables: boolean;
    basePath: string;
    semanticPath: string;
    componentPath: string;
    variantProperties: string[];
  },
  collections: VariableCollection[],
  variableIndex: Map<string, VariableLookupEntry[]>
): Promise<{ variable: Variable; createdCount: number }> {
  const selectedVariantSegments = candidate.pathVariantSegments.filter((segment) =>
    options.variantProperties.includes(segment.property)
  );
  const pathContext: PathContext = {
    componentName: candidate.pathComponentName,
    variantSegments: selectedVariantSegments
  };

  const componentPath = normalizeTokenPath(options.componentPath || buildComponentPath(candidate.collectionKind, pathContext, {
    id: candidate.nodeId,
    name: candidate.pathNodeName
  } as SceneNode, candidate.property));
  const semanticPath = normalizeTokenPath(options.semanticPath || buildSemanticPath(candidate.collectionKind, pathContext, {
    id: candidate.nodeId,
    name: candidate.pathNodeName
  } as SceneNode, candidate.property, candidate.rawValue));
  const basePath = normalizeTokenPath(options.basePath || buildBasePath(candidate.collectionKind, candidate.property, candidate.rawValue));

  let baseVariable: Variable | null = null;
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
  let semanticVariable: Variable;
  try {
    const semanticResult = await ensureChainVariable(semanticPath, candidate, collections, variableIndex, {
      kind: "semantic",
      rawValue: candidate.rawValue,
      aliasTarget: baseVariable
    });
    semanticVariable = semanticResult.variable;
    createdCount += semanticResult.created ? 1 : 0;
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith("Conflict at")) {
      throw error;
    }
    resolvedSemanticPath = buildScopedSemanticPath(candidate.collectionKind, pathContext, {
      id: candidate.nodeId,
      name: candidate.pathNodeName
    } as SceneNode, candidate.property, candidate.rawValue);
    const semanticResult = await ensureChainVariable(resolvedSemanticPath, candidate, collections, variableIndex, {
      kind: "semantic",
      rawValue: candidate.rawValue,
      aliasTarget: baseVariable
    });
    semanticVariable = semanticResult.variable;
    createdCount += semanticResult.created ? 1 : 0;
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

async function preflightConflicts(
  candidates: MatchCandidate[],
  collections: VariableCollection[],
  variableIndex: Map<string, VariableLookupEntry[]>
): Promise<UIConflictItem[]> {
  const conflicts: UIConflictItem[] = [];

  for (const candidate of candidates) {
    const result = await preflightCandidateConflict(candidate, collections, variableIndex);
    if (result) {
      conflicts.push({
        id: candidate.id,
        label: `${candidate.nodeName} · ${candidate.property}`,
        path: result.path,
        reason: result.reason,
        pathKind: result.pathKind,
        chainLevelLabel: getConflictChainLevelLabel(result.pathKind),
        proposedPath: result.proposedPath,
        fallbackPath: result.fallbackPath,
        resolvedPreviewPath: result.proposedPath,
        action: "skip"
      });
    }
  }

  return conflicts;
}

async function preflightCandidateConflict(
  candidate: MatchCandidate,
  collections: VariableCollection[],
  variableIndex: Map<string, VariableLookupEntry[]>
): Promise<{
  path: string;
  reason: string;
  pathKind: "base" | "semantic" | "component";
  proposedPath: string;
  fallbackPath?: string;
} | null> {
  const baseResult = await inspectExistingPathConflict(candidate.proposedBasePath, candidate, collections, variableIndex, {
    kind: "base",
    rawValue: candidate.rawValue
  });
  if (baseResult) {
    return baseResult;
  }

  const semanticResult = await inspectExistingPathConflict(
    candidate.proposedSemanticPath,
    candidate,
    collections,
    variableIndex,
    {
      kind: "semantic",
      rawValue: candidate.rawValue,
      aliasTarget: null
    }
  );
  if (semanticResult) {
    const fallbackPath = buildScopedSemanticPath(
      candidate.collectionKind,
      {
        componentName: candidate.pathComponentName,
        variantSegments: candidate.pathVariantSegments
      },
      { id: candidate.nodeId, name: candidate.pathNodeName } as SceneNode,
      candidate.property,
      candidate.rawValue
    );
    const fallbackResult = await inspectExistingPathConflict(
      fallbackPath,
      candidate,
      collections,
      variableIndex,
      {
        kind: "semantic",
        rawValue: candidate.rawValue,
        aliasTarget: null
      }
    );
    if (fallbackResult) {
      return fallbackResult;
    }
    return {
      ...semanticResult,
      fallbackPath: normalizeTokenPath(fallbackPath) !== normalizeTokenPath(candidate.proposedSemanticPath)
        ? normalizeTokenPath(fallbackPath)
        : undefined
    };
  }

  const componentResult = await inspectExistingPathConflict(
    candidate.proposedComponentPath,
    candidate,
    collections,
    variableIndex,
    {
      kind: "component",
      rawValue: candidate.rawValue,
      aliasTarget: null
    }
  );
  if (componentResult) {
    return componentResult;
  }

  return null;
}

async function inspectExistingPathConflict(
  fullPath: string,
  candidate: MatchCandidate,
  collections: VariableCollection[],
  variableIndex: Map<string, VariableLookupEntry[]>,
  options: {
    kind: "base" | "semantic" | "component";
    rawValue: RawValue;
    aliasTarget?: Variable | null;
  }
): Promise<{
  path: string;
  reason: string;
  pathKind: "base" | "semantic" | "component";
  proposedPath: string;
} | null> {
  const normalizedPath = normalizeTokenPath(fullPath);
  const existingByPath = variableIndex.get(normalizedPath)?.[0];
  if (!existingByPath) {
    return null;
  }

  try {
    await validateExistingVariableFit(existingByPath.variable, candidate, collections, options);
    return null;
  } catch (error) {
    return {
      path: `${existingByPath.collectionName}/${existingByPath.variable.name}`,
      reason: formatError(error).replace(/^Conflict at [^:]+:\s*/, ""),
      pathKind: options.kind,
      proposedPath: normalizedPath
    };
  }
}

function getConflictChainLevelLabel(pathKind: "base" | "semantic" | "component"): string {
  if (pathKind === "base") {
    return "Base";
  }
  if (pathKind === "semantic") {
    return "Semantic";
  }
  return "Component";
}

async function ensureChainVariable(
  fullPath: string,
  candidate: MatchCandidate,
  collections: VariableCollection[],
  variableIndex: Map<string, VariableLookupEntry[]>,
  options: {
    kind: "base" | "semantic" | "component";
    rawValue: RawValue;
    aliasTarget?: Variable | null;
  }
): Promise<{ variable: Variable; created: boolean }> {
  const normalizedPath = normalizeTokenPath(fullPath);
  const existingByPath = variableIndex.get(normalizedPath)?.[0];
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
    const reused = findBaseVariableByExactValue(
      collection.name,
      candidate.resolvedType,
      options.rawValue,
      collection,
      variableIndex
    );
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
  } else {
    variable.setValueForMode(modeId, toVariableValue(options.rawValue, candidate.resolvedType));
  }

  return { variable, created: true };
}

async function validateExistingVariableFit(
  variable: Variable,
  candidate: MatchCandidate,
  collections: VariableCollection[],
  options: {
    kind: "base" | "semantic" | "component";
    rawValue: RawValue;
    aliasTarget?: Variable | null;
  }
): Promise<void> {
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
    if (
      existingAliasTarget &&
      await haveCompatibleResolvedValues(existingAliasTarget, options.aliasTarget, collections, candidate.resolvedType)
    ) {
      return;
    }

    throw new Error(
      `Conflict at ${collection.name}/${variable.name}: existing alias points to ${describeAliasTarget(existingAliasTarget, currentValue.id, collections)} instead of ${describeAliasTarget(options.aliasTarget, options.aliasTarget.id, collections)}`
    );
  }

  if (
    getComparableVariableValue(currentValue as RawValue, candidate.resolvedType) !==
    getComparableVariableValue(options.rawValue, candidate.resolvedType)
  ) {
    throw new Error(`Conflict at ${collection.name}/${variable.name}: existing value does not match new value`);
  }
}

async function haveCompatibleResolvedValues(
  first: Variable,
  second: Variable,
  collections: VariableCollection[],
  resolvedType: VariableResolvedDataType
): Promise<boolean> {
  const firstValue = await resolveVariableComparableValue(first, collections, resolvedType, new Set<string>());
  const secondValue = await resolveVariableComparableValue(second, collections, resolvedType, new Set<string>());
  return firstValue !== null && secondValue !== null && firstValue === secondValue;
}

async function resolveVariableComparableValue(
  variable: Variable,
  collections: VariableCollection[],
  resolvedType: VariableResolvedDataType,
  seen: Set<string>
): Promise<string | null> {
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

  return getComparableVariableValue(value as RawValue, resolvedType);
}

function describeAliasTarget(variable: Variable | null, fallbackId: string, collections: VariableCollection[]): string {
  if (!variable) {
    return fallbackId;
  }

  const collection = collections.find((item) => item.id === variable.variableCollectionId);
  return collection ? `${collection.name}/${variable.name}` : variable.name;
}

function getOrCreateCollection(collections: VariableCollection[], collectionName: string): VariableCollection {
  const existing = collections.find((collection) => normalizeSegment(collection.name) === normalizeSegment(collectionName));
  if (existing) {
    return existing;
  }

  const created = figma.variables.createVariableCollection(collectionName);
  collections.push(created);
  return created;
}

function getDefaultModeId(collection: VariableCollection): string {
  const modeId = collection.defaultModeId ?? collection.modes[0]?.modeId;
  if (!modeId) {
    throw new Error(`Collection ${collection.name} has no writable mode.`);
  }
  return modeId;
}

function findBaseVariableByExactValue(
  collectionName: string,
  resolvedType: VariableResolvedDataType,
  rawValue: RawValue,
  collection: VariableCollection,
  variableIndex: Map<string, VariableLookupEntry[]>
): Variable | null {
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
    if (getComparableVariableValue(currentValue as RawValue, resolvedType) === expectedValue) {
      return entry.variable;
    }
  }

  return null;
}

function getComparableVariableValue(rawValue: RawValue, resolvedType: VariableResolvedDataType): string {
  if (resolvedType === "COLOR") {
    return rgbaToHex(rawValue as RGBA | RGB);
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

async function ensureGlobalColorBaseLadder(
  candidate: MatchCandidate,
  collections: VariableCollection[],
  variableIndex: Map<string, VariableLookupEntry[]>
): Promise<number> {
  if (candidate.collectionKind !== "colors") {
    return 0;
  }

  const ladder = collectBaseColorAlphaLadder(variableIndex);
  ladder.add(colorAlphaPercent(candidate.rawValue as RGBA | RGB));
  const colorEntries = collectBaseColorEntries(variableIndex);
  let createdCount = 0;

  for (const [colorName, rgbHex] of colorEntries.entries()) {
    const rgb = hexToRgb(rgbHex);
    for (const alpha of ladder) {
      const ladderPath = ["colors", "base", colorName, String(alpha)]
        .map((segment) => normalizeSegment(segment))
        .join("/");
      if (variableIndex.get(ladderPath)?.length) {
        continue;
      }

      const colorValue: RGBA = {
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

function collectBaseColorAlphaLadder(variableIndex: Map<string, VariableLookupEntry[]>): Set<number> {
  const ladder = new Set<number>([100, 80, 60, 40, 20, 10, 0]);
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

function collectBaseColorEntries(variableIndex: Map<string, VariableLookupEntry[]>): Map<string, string> {
  const entries = new Map<string, string>();

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

function hexToRgb(hex: string): RGB {
  const clean = hex.replace("#", "").slice(0, 6);
  return {
    r: parseInt(clean.slice(0, 2), 16) / 255,
    g: parseInt(clean.slice(2, 4), 16) / 255,
    b: parseInt(clean.slice(4, 6), 16) / 255
  };
}

function buildSharedPropertyIndex(components: PreparedComponent[], scanSettings: ScanSettings): SharedPropertyIndex {
  const observations = new Map<string, Map<string, SharedObservation>>();

  for (const component of components) {
    for (const node of walkNodes(component.node)) {
      const bindables = extractBindableFields(node).items;
      for (const bindable of bindables) {
        if (!shouldIncludeBindableForSettings(node, component, bindable.property, scanSettings)) {
          continue;
        }
        const leaf = getSharedLeaf(node, component, bindable.property);
        const key = `${leaf}|${bindable.property}`;
        const componentValues = observations.get(key) ?? new Map<string, SharedObservation>();
        const observation = componentValues.get(component.componentName) ?? {
          values: new Set<string>(),
          count: 0
        };
        observation.values.add(getComparableRawValue(bindable.rawValue, bindable.resolvedType));
        observation.count += 1;
        componentValues.set(component.componentName, observation);
        observations.set(key, componentValues);
      }
    }
  }

  const sharedIndex: SharedPropertyIndex = new Map();

  for (const [key, componentValues] of observations.entries()) {
    const componentsByValue = new Map<string, string[]>();

    for (const [componentName, observation] of componentValues.entries()) {
      if (observation.values.size !== 1) {
        continue;
      }
      const [value] = [...observation.values];
      const names = componentsByValue.get(value) ?? [];
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

function getPathContext(
  node: SceneNode,
  component: PreparedComponent,
  property: BindableProperty,
  rawValue: RawValue,
  resolvedType: VariableResolvedDataType,
  sharedPropertyIndex: SharedPropertyIndex
): PathContext {
  const leaf = getSharedLeaf(node, component, property);
  const sharedKey = `${leaf}|${property}`;
  const sharedComponentName = sharedPropertyIndex.get(sharedKey);

  if (
    sharedComponentName &&
    isComponentWithinSharedPrefix(component.componentName, sharedComponentName) &&
    hasMatchingSharedValue(component, node, property, rawValue, resolvedType, sharedComponentName)
  ) {
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

function getSharedLeaf(node: SceneNode, component: PreparedComponent, property: BindableProperty): string {
  return getCollectionKind(property) === "device"
    ? getComponentLeaf(node, component, property)
    : getTokenLeaf(node, component, property);
}

function getComparableRawValue(rawValue: RawValue, resolvedType: VariableResolvedDataType): string {
  if (resolvedType === "COLOR") {
    return rgbaToHex(rawValue as RGBA | RGB);
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

function findCommonComponentPrefix(componentNames: string[]): string {
  if (componentNames.length === 0) {
    return "";
  }

  const splitNames = componentNames.map((name) => name.split("/").map((part) => part.trim()).filter(Boolean));
  const first = splitNames[0];
  const sharedParts: string[] = [];

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

function isComponentWithinSharedPrefix(componentName: string, sharedPrefix: string): boolean {
  if (!sharedPrefix) {
    return false;
  }

  return componentName === sharedPrefix || componentName.startsWith(`${sharedPrefix}/`);
}

function hasMatchingSharedValue(
  component: PreparedComponent,
  node: SceneNode,
  property: BindableProperty,
  rawValue: RawValue,
  resolvedType: VariableResolvedDataType,
  sharedComponentName: string
): boolean {
  return isComponentWithinSharedPrefix(component.componentName, sharedComponentName) &&
    getComparableRawValue(rawValue, resolvedType).length > 0;
}

async function bindVariableToNode(
  node: SceneNode,
  property: BindableProperty,
  variable: Variable,
  range?: { start: number; end: number }
): Promise<void> {
  if (property === "fills.color") {
    if (!("fills" in node) || !Array.isArray(node.fills)) {
      throw new Error("Node does not support fill binding.");
    }

    const paints = [...node.fills];
    const index = paints.findIndex((paint) => paint.type === "SOLID");
    if (index < 0) {
      throw new Error("No solid fill available to bind.");
    }

    paints[index] = figma.variables.setBoundVariableForPaint(paints[index] as SolidPaint, "color", variable);
    (node as GeometryMixin).fills = paints;
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

    paints[index] = figma.variables.setBoundVariableForPaint(paints[index] as SolidPaint, "color", variable);
    (node as GeometryMixin).strokes = paints;
    return;
  }

  if (
    node.type === "TEXT" &&
    (
      property === "fontSize" ||
      property === "fontFamily" ||
      property === "fontWeight" ||
      property === "lineHeight" ||
      property === "letterSpacing" ||
      property === "paragraphSpacing" ||
      property === "paragraphIndent"
    )
  ) {
    const textNode = node as TextNode & {
      setRangeBoundVariable?: (
        start: number,
        end: number,
        field: "fontFamily" | "fontSize" | "fontWeight" | "lineHeight" | "letterSpacing" | "paragraphSpacing" | "paragraphIndent",
        variable: Variable
      ) => void;
    };
    if (textNode.characters.length === 0) {
      throw new Error("Empty text nodes cannot be bound.");
    }

    if (textNode.setRangeBoundVariable) {
      textNode.setRangeBoundVariable(range?.start ?? 0, range?.end ?? textNode.characters.length, property, variable);
      return;
    }
  }

  const bindableNode = node as SceneNode & {
    setBoundVariable?: (field: string, variable: Variable) => void;
  };
  if (!bindableNode.setBoundVariable) {
    throw new Error("Node does not support direct variable binding.");
  }

  bindableNode.setBoundVariable(property, variable);
}

function collectionNames(variableIndex: Map<string, VariableLookupEntry[]>): string[] {
  return [...new Set([...variableIndex.values()].flat().map((entry) => entry.collectionName))];
}

function firstCollectionName(variableIndex: Map<string, VariableLookupEntry[]>): string | undefined {
  return collectionNames(variableIndex)[0];
}

function normalizeTokenPath(value: string): string {
  return value
    .split("/")
    .map((segment) => normalizeSegment(segment))
    .filter(Boolean)
    .join("/");
}

function normalizeSegment(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9/_-]+/g, "");
}

function rawValueToDisplay(rawValue: RawValue): string {
  if (typeof rawValue === "number") {
    return String(rawValue);
  }

  if (typeof rawValue === "string") {
    return rawValue;
  }

  if ("family" in rawValue && "style" in rawValue) {
    return `${rawValue.family} ${rawValue.style}`;
  }

  const rgba = rawValue as RGBA;
  return rgbaToHex(rgba);
}

function rgbaToHex(color: RGBA | RGB): string {
  const to255 = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 255);
  const red = to255(color.r).toString(16).padStart(2, "0");
  const green = to255(color.g).toString(16).padStart(2, "0");
  const blue = to255(color.b).toString(16).padStart(2, "0");
  const alpha = "a" in color ? to255(color.a).toString(16).padStart(2, "0") : "";
  return `#${red}${green}${blue}${alpha}`.toUpperCase();
}

function solidPaintToRgba(paint: SolidPaint): RGBA {
  return {
    r: paint.color.r,
    g: paint.color.g,
    b: paint.color.b,
    a: paint.opacity ?? 1
  };
}

function toVariableValue(rawValue: RawValue, resolvedType: VariableResolvedDataType): VariableValue {
  if (resolvedType === "COLOR") {
    if (typeof rawValue === "object" && "r" in rawValue && "g" in rawValue && "b" in rawValue) {
      return rawValue as RGBA | RGB;
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

function numberOrZero(value: number | typeof figma.mixed): number {
  return typeof value === "number" ? value : 0;
}

function getTokenLeaf(node: SceneNode, component: PreparedComponent, property: BindableProperty): string {
  const primaryAlias = normalizeSegment(PROPERTY_ALIASES[property][0] ?? property);
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

function getGroupedAlias(node: SceneNode, property: BindableProperty): string | null {
  if (
    isPaddingProperty(property) &&
    hasEqualNumericValues(node, "paddingTop", "paddingRight") &&
    hasEqualNumericValues(node, "paddingTop", "paddingBottom") &&
    hasEqualNumericValues(node, "paddingTop", "paddingLeft")
  ) {
    return "padding";
  }

  if (isHorizontalPaddingProperty(property) && hasEqualNumericValues(node, "paddingLeft", "paddingRight")) {
    return "padding-horizontal";
  }

  if (isVerticalPaddingProperty(property) && hasEqualNumericValues(node, "paddingTop", "paddingBottom")) {
    return "padding-vertical";
  }

  if (
    isRadiusProperty(property) &&
    hasEqualNumericValues(node, "topLeftRadius", "topRightRadius") &&
    hasEqualNumericValues(node, "topLeftRadius", "bottomLeftRadius") &&
    hasEqualNumericValues(node, "topLeftRadius", "bottomRightRadius")
  ) {
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

function shouldUsePropertyAliasLeaf(
  node: SceneNode,
  component: PreparedComponent,
  property: BindableProperty
): boolean {
  if (component.node && node.id === component.node.id) {
    return true;
  }

  if (looksLikeVariantNodeName(node.name)) {
    return true;
  }

  return (
    property === "opacity" ||
    property === "paddingTop" ||
    property === "paddingRight" ||
    property === "paddingBottom" ||
    property === "paddingLeft" ||
    property === "itemSpacing" ||
    property === "topLeftRadius" ||
    property === "topRightRadius" ||
    property === "bottomLeftRadius" ||
    property === "bottomRightRadius"
  ) && !normalizeSegment(node.name);
}

function shouldUseLayerAndPropertyLeaf(property: BindableProperty, layerSegment: string): boolean {
  if (!layerSegment) {
    return false;
  }

  return (
    property === "strokes.color" ||
    property === "strokeWeight" ||
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
    property === "bottomRightRadius"
  );
}

function looksLikeVariantNodeName(value: string): boolean {
  return value.includes("=") && /[a-z]/i.test(value);
}

function hasEqualNumericValues(node: SceneNode, first: string, second: string): boolean {
  const firstValue = getNumericNodeValue(node, first);
  const secondValue = getNumericNodeValue(node, second);
  return firstValue !== null && secondValue !== null && Math.abs(firstValue - secondValue) < 0.0001;
}

function getNumericNodeValue(node: SceneNode, field: string): number | null {
  const value = (node as SceneNode & Record<string, unknown>)[field];
  return typeof value === "number" ? value : null;
}

function shouldSkipDimensionVariable(node: SceneNode, axis: "horizontal" | "vertical"): boolean {
  const field = axis === "horizontal" ? "layoutSizingHorizontal" : "layoutSizingVertical";
  const value = (node as SceneNode & Record<string, unknown>)[field];
  return value === "HUG" || value === "FILL";
}

function hasSemanticLayerName(node: SceneNode, settings: ScanSettings): boolean {
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

function matchesSemanticAllowlist(normalizedName: string, allowlist: string[]): boolean {
  return allowlist.some((entry) => {
    const normalizedEntry = normalizeSegment(entry);
    return normalizedEntry && (normalizedName === normalizedEntry || normalizedName.startsWith(`${normalizedEntry}-`));
  });
}

function matchesSemanticDenylist(normalizedName: string, denylist: string[]): boolean {
  return denylist.some((entry) => {
    const normalizedEntry = normalizeSegment(entry);
    return normalizedEntry && (normalizedName === normalizedEntry || normalizedName.startsWith(`${normalizedEntry}-`));
  });
}

function shouldSkipNewVariableCreation(candidate: MatchCandidate, node: SceneNode): boolean {
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

function isFillDimension(node: SceneNode, property: BindableProperty): boolean {
  if (property !== "width" && property !== "height") {
    return false;
  }

  const field = property === "width" ? "layoutSizingHorizontal" : "layoutSizingVertical";
  return (node as SceneNode & Record<string, unknown>)[field] === "FILL";
}

function isZeroCreateOnlyProperty(property: BindableProperty): boolean {
  return (
    property === "itemSpacing" ||
    property === "paddingTop" ||
    property === "paddingRight" ||
    property === "paddingBottom" ||
    property === "paddingLeft" ||
    property === "topLeftRadius" ||
    property === "topRightRadius" ||
    property === "bottomLeftRadius" ||
    property === "bottomRightRadius" ||
    property === "strokeWeight"
  );
}

function isZeroValue(value: number): boolean {
  return Math.abs(value) < 0.0001;
}

function isPaddingProperty(property: BindableProperty): boolean {
  return (
    property === "paddingTop" ||
    property === "paddingRight" ||
    property === "paddingBottom" ||
    property === "paddingLeft"
  );
}

function isHorizontalPaddingProperty(property: BindableProperty): boolean {
  return property === "paddingLeft" || property === "paddingRight";
}

function isVerticalPaddingProperty(property: BindableProperty): boolean {
  return property === "paddingTop" || property === "paddingBottom";
}

function isRadiusProperty(property: BindableProperty): boolean {
  return (
    property === "topLeftRadius" ||
    property === "topRightRadius" ||
    property === "bottomLeftRadius" ||
    property === "bottomRightRadius"
  );
}

function isHorizontalRadiusProperty(property: BindableProperty): boolean {
  return property === "topLeftRadius" || property === "topRightRadius";
}

function isHorizontalBottomRadiusProperty(property: BindableProperty): boolean {
  return property === "bottomLeftRadius" || property === "bottomRightRadius";
}

function isFullOpacity(value: number): boolean {
  return Math.abs(value - 1) < 0.0001 || Math.abs(value - 100) < 0.0001;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
