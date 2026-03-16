export type VariantSegment = {
  property: string;
  value: string;
};

export type BindableProperty =
  | "fills.color"
  | "strokes.color"
  | "strokeWeight"
  | "effects.color"
  | "effects.radius"
  | "effects.spread"
  | "effects.offsetX"
  | "effects.offsetY"
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

export type CollectionKind = "color" | "typography" | "device";

const PROPERTY_ALIASES: Record<BindableProperty, string[]> = {
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

export function normalizeSegment(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9/_-]+/g, "");
}

export function normalizeTokenPath(value: string): string {
  return value
    .split("/")
    .map((segment) => normalizeSegment(segment))
    .filter(Boolean)
    .join("/");
}

export function parseVariantSegments(variantName: string): VariantSegment[] {
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

export function findCommonComponentPrefix(componentNames: string[]): string {
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

export function getComponentNamePrefixes(componentName: string): string[] {
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

export function isComponentWithinSharedPrefix(componentName: string, sharedPrefix: string): boolean {
  if (!sharedPrefix) {
    return false;
  }

  return componentName === sharedPrefix || componentName.startsWith(`${sharedPrefix}/`);
}

function buildComponentPath(
  collectionKind: CollectionKind,
  componentName: string,
  variantSegments: VariantSegment[],
  nodeName: string,
  property: BindableProperty
): string {
  const componentLeaf = buildComponentLeaf(nodeName, property);
  return [
    collectionKind,
    "component",
    componentName,
    ...variantSegments.map((segment) => segment.value),
    componentLeaf
  ]
    .map((segment) => normalizeSegment(segment))
    .join("/");
}

function buildComponentLeaf(nodeName: string, property: BindableProperty): string {
  const layerSegment = normalizeGeneratedLayerSegment(nodeName, property);
  const primaryAlias = normalizeSegment(PROPERTY_ALIASES[property][0] ?? property);

  if (!layerSegment) {
    return primaryAlias;
  }

  if (property === "fills.color") {
    return layerSegment;
  }

  if (layerSegment === primaryAlias) {
    return primaryAlias;
  }

  return `${layerSegment}/${primaryAlias}`;
}

function normalizeGeneratedLayerSegment(nodeName: string, property: BindableProperty): string {
  const normalized = normalizeSegment(nodeName);
  if (!normalized) {
    return normalized;
  }

  if ((property === "strokes.color" || property === "strokeWeight") && normalized === "border") {
    return "stroke";
  }

  return normalized;
}

export function buildCandidatePathsForTest(
  collectionKind: CollectionKind,
  componentName: string,
  variantSegments: VariantSegment[],
  nodeName: string,
  property: BindableProperty
): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();

  const pushPath = (nextComponentName: string, nextVariantSegments: VariantSegment[]) => {
    const path = buildComponentPath(collectionKind, nextComponentName, nextVariantSegments, nodeName, property);
    if (!seen.has(path)) {
      seen.add(path);
      candidates.push(path);
    }
  };

  pushPath(componentName, variantSegments);

  if (variantSegments.length > 0) {
    pushPath(componentName, []);
  }

  const componentPrefixes = getComponentNamePrefixes(componentName);
  for (const prefix of componentPrefixes) {
    pushPath(prefix, []);
  }

  return candidates;
}

export function percentTypographyValueToPixels(fontSize: number, percentValue: number): number {
  return Math.round((((fontSize * percentValue) / 100) + Number.EPSILON) * 10000) / 10000;
}

export function getSemanticDomain(componentName: string): string {
  const family = normalizeSegment(componentName.split("/")[0] ?? componentName);
  if (family === "button") {
    return "action";
  }
  return family || "surface";
}

export function getSemanticSubtypeSegments(componentName: string): string[] {
  const segments = componentName.split("/").map((segment) => normalizeSegment(segment)).filter(Boolean);
  return segments.slice(1);
}

export function getTypographyLeaf(property: BindableProperty): string {
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

export function getDeviceBucket(property: BindableProperty): string {
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

export function buildScopedDeviceSemanticPathForTest(componentName: string, property: BindableProperty, rawValue: number): string {
  return [
    "device",
    "semantic",
    getDeviceBucket(property),
    ...componentName.split("/").map((segment) => normalizeSegment(segment)).filter(Boolean),
    String(rawValue)
  ].join("/");
}

export function shouldSkipDefaultTextNumericValue(property: BindableProperty, value: number): boolean {
  const isZero = Math.abs(value) < 0.0001;
  if (!isZero) {
    return false;
  }

  return (
    property === "letterSpacing" ||
    property === "paragraphSpacing" ||
    property === "paragraphIndent"
  );
}

export function shouldSkipDefaultEffectNumericValue(property: BindableProperty, value: number): boolean {
  const isZero = Math.abs(value) < 0.0001;
  if (!isZero) {
    return false;
  }

  return (
    property === "effects.radius" ||
    property === "effects.spread" ||
    property === "effects.offsetX" ||
    property === "effects.offsetY"
  );
}

export function buildTextRangePathNodeName(nodeName: string, rangeIndex: number): string {
  return `${nodeName}/text-range-${rangeIndex}`;
}

export function buildTextRangeDisplayNodeName(nodeName: string, rangeIndex: number, textSlice: string): string {
  return `${nodeName} [Range ${rangeIndex}: ${truncateTextRangeLabel(textSlice)}]`;
}

export function truncateTextRangeLabel(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "range";
  }
  return normalized.length > 24 ? `${normalized.slice(0, 24).trim()}…` : normalized;
}
