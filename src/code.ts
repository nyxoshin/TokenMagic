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
  | "fontWeight";

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

type MatchCandidate = {
  id: string;
  nodeId: string;
  nodeName: string;
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
};

type PreparedComponent = {
  node: ComponentNode;
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

type AnalyzeResponse = {
  type: "analysis";
  ready: UISelectionItem[];
  unmatched: UIUnmatchedItem[];
  skippedBound: number;
  selectionSummary: string;
};

type ConfirmMessage = {
  type: "confirm-bind";
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
};

type SummaryResponse = {
  type: "summary";
  bound: number;
  skipped: number;
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
  fontWeight: ["font-weight"]
};

const analysisState = new Map<string, MatchCandidate>();

figma.showUI(__html__, { width: UI_WIDTH, height: UI_HEIGHT, themeColors: true });
void initialize();

async function initialize() {
  try {
    const analysis = await analyzeSelection();
    figma.ui.postMessage(analysis);
  } catch (error) {
    figma.ui.postMessage({
      type: "summary",
      bound: 0,
      skipped: 0,
      errors: [formatError(error)]
    } satisfies SummaryResponse);
  }
}

figma.on("selectionchange", () => {
  void initialize();
});

figma.ui.onmessage = async (message: ConfirmMessage) => {
  if (message.type !== "confirm-bind") {
    return;
  }

  try {
    const result = await executeBindings(message);
    figma.ui.postMessage(result);
  } catch (error) {
    figma.ui.postMessage({
      type: "summary",
      bound: 0,
      skipped: 0,
      errors: [formatError(error)]
    } satisfies SummaryResponse);
  }
};

async function analyzeSelection(): Promise<AnalyzeResponse> {
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

    const componentNode = node as ComponentNode;
    const parent = componentNode.parent;
    const variantSegments =
      parent && parent.type === "COMPONENT_SET" ? extractVariantSegments(componentNode, parent) : [];
    const componentName = parent && parent.type === "COMPONENT_SET" ? parent.name : componentNode.name;

    prepared.push({
      node: componentNode,
      componentName,
      variantSegments
    });
  }

  return prepared;
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
  variableIndex: Map<string, VariableLookupEntry[]>
): Promise<MatchCandidate[]> {
  const matches: MatchCandidate[] = [];
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
      nodes.push(...walkNodes(child as SceneNode));
    }
  }

  return nodes;
}

async function inspectNodeBindings(
  node: SceneNode,
  component: PreparedComponent,
  variableIndex: Map<string, VariableLookupEntry[]>,
  sharedPropertyIndex: SharedPropertyIndex
): Promise<MatchCandidate[]> {
  const candidates: MatchCandidate[] = [];
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
      matchedVariableId: match?.variable.id,
      matchedVariablePath: match?.variablePath,
      proposedBasePath: proposedChain.basePath,
      proposedSemanticPath: proposedChain.semanticPath,
      proposedComponentPath: match?.variablePath ?? proposedChain.componentPath,
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

function extractBindableFields(
  node: SceneNode
): Array<{ property: BindableProperty; rawValue: RawValue; resolvedType: VariableResolvedDataType }> {
  const items: Array<{ property: BindableProperty; rawValue: RawValue; resolvedType: VariableResolvedDataType }> = [];
  const anyNode = node as SceneNode & Record<string, unknown>;

  if ("fills" in anyNode && Array.isArray(anyNode.fills)) {
    const fill = (anyNode.fills as Paint[]).find((paint) => paint.type === "SOLID") as SolidPaint | undefined;
    if (fill) {
      items.push({ property: "fills.color", rawValue: solidPaintToRgba(fill), resolvedType: "COLOR" });
    }
  }

  if ("strokes" in anyNode && Array.isArray(anyNode.strokes)) {
    const stroke = (anyNode.strokes as Paint[]).find((paint) => paint.type === "SOLID") as SolidPaint | undefined;
    if (stroke) {
      items.push({ property: "strokes.color", rawValue: solidPaintToRgba(stroke), resolvedType: "COLOR" });
      if (typeof anyNode.strokeWeight === "number") {
        items.push({ property: "strokeWeight", rawValue: anyNode.strokeWeight as number, resolvedType: "FLOAT" });
      }
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
      if (field === "width" && isHugDimension(node, "horizontal")) {
        continue;
      }
      if (field === "height" && isHugDimension(node, "vertical")) {
        continue;
      }
      if (field === "opacity" && isFullOpacity(anyNode[field] as number)) {
        continue;
      }
      items.push({ property: field, rawValue: anyNode[field] as number, resolvedType: "FLOAT" });
    }
  }

  if (node.type === "TEXT") {
    if (node.characters.length > 0) {
      items.push({ property: "fontSize", rawValue: numberOrZero(node.fontSize), resolvedType: "FLOAT" });
      if (node.fontName !== figma.mixed) {
        const fontName = node.fontName as FontName;
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

async function getExistingBindingName(node: SceneNode, property: BindableProperty): Promise<string | null> {
  const binding = extractExistingBinding(node, property);
  if (!binding) {
    return null;
  }

  const variable = await figma.variables.getVariableByIdAsync(binding.id);
  return variable ? variable.name : binding.id;
}

function extractExistingBinding(
  node: SceneNode,
  property: BindableProperty
): { id: string } | null {
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

function buildCandidatePaths(
  collectionKind: CollectionKind,
  pathContext: PathContext,
  node: SceneNode,
  property: BindableProperty
): string[] {
  return [buildComponentPath(collectionKind, pathContext, node, property)];
}

function buildComponentPath(
  collectionKind: CollectionKind,
  pathContext: PathContext,
  node: SceneNode,
  property: BindableProperty
): string {
  const componentLeaf = getComponentLeaf(node, {
    node: null as unknown as ComponentNode,
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
  if (property === "fontSize" || property === "fontFamily" || property === "fontWeight") {
    return "typography";
  }
  return "device";
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

  let bound = 0;
  let skipped = 0;
  const errors: string[] = [];

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
      await bindVariableToNode(node as SceneNode, candidate.property, variable);
      bound += 1;
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

      const variable = await ensureVariableForCandidate(
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
      await bindVariableToNode(node as SceneNode, candidate.property, variable);
      bound += 1;
    } catch (error) {
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
): Promise<Variable> {
  const selectedVariantSegments = candidate.pathVariantSegments.filter((segment) =>
    options.variantProperties.includes(segment.property)
  );
  const pathContext: PathContext = {
    componentName: candidate.pathComponentName,
    variantSegments: selectedVariantSegments
  };

  const componentPath = normalizeTokenPath(options.componentPath || buildComponentPath(candidate.collectionKind, pathContext, {
    id: candidate.nodeId,
    name: candidate.nodeName
  } as SceneNode, candidate.property));
  const semanticPath = normalizeTokenPath(options.semanticPath || buildSemanticPath(candidate.collectionKind, pathContext, {
    id: candidate.nodeId,
    name: candidate.nodeName
  } as SceneNode, candidate.property, candidate.rawValue));
  const basePath = normalizeTokenPath(options.basePath || buildBasePath(candidate.collectionKind, candidate.property, candidate.rawValue));

  let baseVariable: Variable | null = null;
  if (options.createBaseVariables) {
    baseVariable = await ensureChainVariable(basePath, candidate, collections, variableIndex, {
      kind: "base",
      rawValue: candidate.rawValue
    });
    await ensureGlobalColorBaseLadder(candidate, collections, variableIndex);
  }

  let resolvedSemanticPath = semanticPath;
  let semanticVariable: Variable;
  try {
    semanticVariable = await ensureChainVariable(semanticPath, candidate, collections, variableIndex, {
      kind: "semantic",
      rawValue: candidate.rawValue,
      aliasTarget: baseVariable
    });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith("Conflict at")) {
      throw error;
    }
    resolvedSemanticPath = buildScopedSemanticPath(candidate.collectionKind, pathContext, {
      id: candidate.nodeId,
      name: candidate.nodeName
    } as SceneNode, candidate.property, candidate.rawValue);
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
): Promise<Variable> {
  const normalizedPath = normalizeTokenPath(fullPath);
  const existingByPath = variableIndex.get(normalizedPath)?.[0];
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
    const reused = findBaseVariableByExactValue(
      collection.name,
      candidate.resolvedType,
      options.rawValue,
      collection,
      variableIndex
    );
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
  } else {
    variable.setValueForMode(modeId, toVariableValue(options.rawValue, candidate.resolvedType));
  }

  return variable;
}

function validateExistingVariableFit(
  variable: Variable,
  candidate: MatchCandidate,
  collections: VariableCollection[],
  options: {
    kind: "base" | "semantic" | "component";
    rawValue: RawValue;
    aliasTarget?: Variable | null;
  }
): void {
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

  if (
    getComparableVariableValue(currentValue as RawValue, candidate.resolvedType) !==
    getComparableVariableValue(options.rawValue, candidate.resolvedType)
  ) {
    throw new Error(`Conflict at ${collection.name}/${variable.name}: existing value does not match new value`);
  }
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
): Promise<void> {
  if (candidate.collectionKind !== "colors") {
    return;
  }

  const ladder = collectBaseColorAlphaLadder(variableIndex);
  ladder.add(colorAlphaPercent(candidate.rawValue as RGBA | RGB));
  const colorEntries = collectBaseColorEntries(variableIndex);

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
      await ensureChainVariable(ladderPath, candidate, collections, variableIndex, {
        kind: "base",
        rawValue: colorValue
      });
    }
  }
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

function buildSharedPropertyIndex(components: PreparedComponent[]): SharedPropertyIndex {
  const observations = new Map<string, Map<string, SharedObservation>>();

  for (const component of components) {
    for (const node of walkNodes(component.node)) {
      const bindables = extractBindableFields(node);
      for (const bindable of bindables) {
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

async function bindVariableToNode(node: SceneNode, property: BindableProperty, variable: Variable): Promise<void> {
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

  if (node.type === "TEXT" && (property === "fontSize" || property === "fontFamily" || property === "fontWeight")) {
    const textNode = node as TextNode & {
      setRangeBoundVariable?: (
        start: number,
        end: number,
        field: "fontFamily" | "fontSize" | "fontWeight",
        variable: Variable
      ) => void;
    };
    if (textNode.characters.length === 0) {
      throw new Error("Empty text nodes cannot be bound.");
    }

    if (textNode.setRangeBoundVariable) {
      textNode.setRangeBoundVariable(0, textNode.characters.length, property, variable);
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

function isHugDimension(node: SceneNode, axis: "horizontal" | "vertical"): boolean {
  const field = axis === "horizontal" ? "layoutSizingHorizontal" : "layoutSizingVertical";
  return (node as SceneNode & Record<string, unknown>)[field] === "HUG";
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
