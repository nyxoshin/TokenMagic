const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseVariantSegments,
  findCommonComponentPrefix,
  buildCandidatePathsForTest,
  normalizeTokenPath,
  percentTypographyValueToPixels,
  shouldSkipDefaultTextNumericValue,
  shouldSkipDefaultEffectNumericValue,
  buildTextRangePathNodeName,
  buildTextRangeDisplayNodeName,
  getSemanticDomain,
  getSemanticSubtypeSegments,
  getTypographyLeaf,
  getDeviceBucket,
  buildScopedDeviceSemanticPathForTest,
  isComponentWithinSharedPrefix
} = require("../.test-dist/testable.js");

test("parseVariantSegments parses standard variant syntax", () => {
  assert.deepEqual(parseVariantSegments("State=Hover, Size=Large"), [
    { property: "State", value: "Hover" },
    { property: "Size", value: "Large" }
  ]);
});

test("findCommonComponentPrefix finds shared subtype prefix", () => {
  assert.equal(
    findCommonComponentPrefix([
      "button/secondary/default",
      "button/secondary/hover",
      "button/secondary/focus"
    ]),
    "button/secondary"
  );
});

test("findCommonComponentPrefix hoists only as far as the shared family really goes", () => {
  assert.equal(
    findCommonComponentPrefix([
      "button/primary/default",
      "button/secondary/default"
    ]),
    "button"
  );
  assert.equal(
    findCommonComponentPrefix([
      "button/fab/default",
      "button/fab/hover"
    ]),
    "button/fab"
  );
});

test("isComponentWithinSharedPrefix matches exact component and descendants only", () => {
  assert.equal(isComponentWithinSharedPrefix("button/secondary", "button/secondary"), true);
  assert.equal(isComponentWithinSharedPrefix("button/secondary/default", "button/secondary"), true);
  assert.equal(isComponentWithinSharedPrefix("button/primary/default", "button/secondary"), false);
});

test("buildCandidatePathsForTest falls back from variant to shared component prefix", () => {
  assert.deepEqual(
    buildCandidatePathsForTest(
      "device",
      "icon/test-1",
      [{ property: "State", value: "Default" }],
      "root",
      "width"
    ),
    [
      "device/component/icon/test-1/default/root/width",
      "device/component/icon/test-1/root/width",
      "device/component/icon/root/width"
    ]
  );
});

test("buildCandidatePathsForTest preserves device leaf when falling back to shared prefixes", () => {
  assert.deepEqual(
    buildCandidatePathsForTest(
      "device",
      "button/secondary",
      [{ property: "State", value: "Focus" }],
      "border",
      "strokeWeight"
    ),
    [
      "device/component/button/secondary/focus/stroke",
      "device/component/button/secondary/stroke",
      "device/component/button/stroke"
    ]
  );
});

test("buildCandidatePathsForTest does not duplicate semantic stroke layer names", () => {
  assert.deepEqual(
    buildCandidatePathsForTest(
      "color",
      "avatar/user",
      [{ property: "Type", value: "Default" }],
      "border",
      "strokes.color"
    ),
    [
      "color/component/avatar/user/default/stroke",
      "color/component/avatar/user/stroke",
      "color/component/avatar/stroke"
    ]
  );
});

test("buildCandidatePathsForTest supports effect leaf paths", () => {
  assert.deepEqual(
    buildCandidatePathsForTest(
      "device",
      "card/default",
      [{ property: "State", value: "Default" }],
      "surface/drop-shadow-1",
      "effects.radius"
    ),
    [
      "device/component/card/default/default/surface/drop-shadow-1/effect-radius",
      "device/component/card/default/surface/drop-shadow-1/effect-radius",
      "device/component/card/surface/drop-shadow-1/effect-radius"
    ]
  );
});

test("normalizeTokenPath strips unsupported characters and normalizes segments", () => {
  assert.equal(
    normalizeTokenPath("Typography / Component / Button / Label / Font Size"),
    "typography/component/button/label/font-size"
  );
});

test("semantic naming helpers derive domain and subtype segments", () => {
  assert.equal(getSemanticDomain("button/secondary"), "action");
  assert.equal(getSemanticDomain("card/outlined"), "card");
  assert.deepEqual(getSemanticSubtypeSegments("button/secondary/default"), ["secondary", "default"]);
  assert.deepEqual(getSemanticSubtypeSegments("input"), []);
});

test("typography leaves and device buckets stay stable", () => {
  assert.equal(getTypographyLeaf("fontSize"), "font-size");
  assert.equal(getTypographyLeaf("lineHeight"), "line-height");
  assert.equal(getTypographyLeaf("paragraphIndent"), "paragraph-indent");
  assert.equal(getDeviceBucket("itemSpacing"), "gap");
  assert.equal(getDeviceBucket("paddingLeft"), "spacing");
  assert.equal(getDeviceBucket("strokeWeight"), "stroke");
  assert.equal(getDeviceBucket("height"), "height");
});

test("scoped device semantic paths keep the device bucket before component segments", () => {
  assert.equal(
    buildScopedDeviceSemanticPathForTest("avatar/club/sm", "strokeWeight", 1),
    "device/semantic/stroke/avatar/club/sm/1"
  );
});

test("percentTypographyValueToPixels converts percent values to px", () => {
  assert.equal(percentTypographyValueToPixels(20, 140), 28);
  assert.equal(percentTypographyValueToPixels(16, 5), 0.8);
  assert.equal(percentTypographyValueToPixels(14, 120.00000476837158), 16.8);
});

test("shouldSkipDefaultTextNumericValue skips only default zero text layout values", () => {
  assert.equal(shouldSkipDefaultTextNumericValue("letterSpacing", 0), true);
  assert.equal(shouldSkipDefaultTextNumericValue("paragraphSpacing", 0), true);
  assert.equal(shouldSkipDefaultTextNumericValue("paragraphIndent", 0), true);
  assert.equal(shouldSkipDefaultTextNumericValue("lineHeight", 0), false);
  assert.equal(shouldSkipDefaultTextNumericValue("letterSpacing", 0.5), false);
});

test("shouldSkipDefaultEffectNumericValue skips only default zero effect numeric values", () => {
  assert.equal(shouldSkipDefaultEffectNumericValue("effects.radius", 0), true);
  assert.equal(shouldSkipDefaultEffectNumericValue("effects.spread", 0), true);
  assert.equal(shouldSkipDefaultEffectNumericValue("effects.offsetX", 0), true);
  assert.equal(shouldSkipDefaultEffectNumericValue("effects.offsetY", 0), true);
  assert.equal(shouldSkipDefaultEffectNumericValue("strokeWeight", 0), false);
  assert.equal(shouldSkipDefaultEffectNumericValue("effects.radius", 2), false);
});

test("mixed text range names are stable and content preview stays out of the path", () => {
  assert.equal(buildTextRangePathNodeName("label", 2), "label/text-range-2");
  assert.equal(
    buildTextRangeDisplayNodeName("label", 2, "Continue with email"),
    "label [Range 2: Continue with email]"
  );
});
