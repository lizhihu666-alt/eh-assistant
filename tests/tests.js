(function () {
  const results = [];

  function assert(name, condition, detail) {
    results.push({ name, pass: !!condition, detail: detail || "" });
  }

  function assertEqual(name, actual, expected) {
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    assert(name, pass, pass ? "" : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }

  const I = window.__ehAssistantInternal;
  const C = window.EHAssistantBackgroundClassifier;

  if (!I) {
    document.getElementById("output").textContent =
      "content.js 没有暴露 __ehAssistantInternal，测试无法运行。请确认 window.__EH_ASSISTANT_TEST__ 在 content.js 加载前已经设置为 true。";
    return;
  }
  if (!C) {
    document.getElementById("output").textContent =
      "shared/background-classifier.js 没有正确加载，window.EHAssistantBackgroundClassifier 不存在。";
    return;
  }

  // --- normalizedWords ---
  assertEqual(
    "normalizedWords splits on punctuation and keeps apostrophes/hyphens inside a word",
    I.normalizedWords("Hello, World! It's ok-fine"),
    ["Hello", "World", "It's", "ok-fine"]
  );

  // --- isTitleCaseWord ---
  assert("isTitleCaseWord accepts a Title Case word", I.isTitleCaseWord("Bikini", 1, 5));
  assert("isTitleCaseWord rejects an all-lowercase word", !I.isTitleCaseWord("bikini", 1, 5));
  assert("isTitleCaseWord allows a small word lowercase in the middle", I.isTitleCaseWord("of", 2, 5));
  assert("isTitleCaseWord rejects a small word capitalized in the middle", !I.isTitleCaseWord("Of", 2, 5));
  assert("isTitleCaseWord allows a small word capitalized at the start", I.isTitleCaseWord("The", 0, 5));
  assert("isTitleCaseWord allows an all-caps acronym", I.isTitleCaseWord("USB", 1, 5));

  // --- titleChecks ---
  assertEqual(
    "titleChecks passes a clean 5-word Title Case title with no brand match",
    I.titleChecks("Seamless Bikini Full Coverage Underwear", ["ubras"]),
    []
  );
  assert(
    "titleChecks flags a title under 5 words",
    I.titleChecks("Nice Shirt", []).some(msg => msg.includes("个词"))
  );
  assert(
    "titleChecks flags a title over 10 words",
    I.titleChecks("One Two Three Four Five Six Seven Eight Nine Ten Eleven", []).some(msg => msg.includes("个词"))
  );
  assert(
    "titleChecks flags a non-Title-Case word",
    I.titleChecks("ubras Seamless Bikini Full Coverage", ["ubras"]).some(msg => msg.includes("Title Case"))
  );
  assert(
    "titleChecks flags the brand name appearing in the title",
    I.titleChecks("Ubras Seamless Bikini Full Coverage Set", ["ubras"]).some(msg => msg.includes("品牌名"))
  );

  // --- languageChecks ---
  assertEqual(
    "languageChecks passes clean title + description",
    I.languageChecks("Seamless Bikini Full Coverage Underwear", "Truly invisible and no show under tighter clothing."),
    []
  );
  assert(
    "languageChecks flags an immediately repeated word",
    I.languageChecks("The The Best Shirt Ever Made", "").some(msg => msg.includes("重复词"))
  );
  assert(
    "languageChecks flags missing space after punctuation",
    I.languageChecks("", "clothing.Cotton gusset enhances breathability").some(msg => msg.startsWith("Description"))
  );
  assert(
    "languageChecks flags a known common typo",
    I.languageChecks("", "This is a alot of fun to wear").some(msg => msg.includes("alot"))
  );

  // --- descriptionChecks ---
  assertEqual("descriptionChecks flags an empty description", I.descriptionChecks(""), ["Description 为空"]);
  assert(
    "descriptionChecks flags stacked promotional phrases",
    I.descriptionChecks("Buy now for the best seller item with free shipping and lowest price guaranteed.")
      .some(msg => msg.includes("促销"))
  );
  assert(
    "descriptionChecks flags a duplicated line",
    I.descriptionChecks("This is a great product for everyone.\nThis is a great product for everyone.")
      .some(msg => msg.includes("重复内容"))
  );
  assertEqual(
    "descriptionChecks passes an ordinary description",
    I.descriptionChecks("A soft, breathable everyday fabric that keeps you comfortable all day long."),
    []
  );

  // --- majorContentChecks ---
  assert(
    "majorContentChecks flags a URL",
    I.majorContentChecks("Check our site at https://example.com for more info").some(msg => msg.includes("网址"))
  );
  assert(
    "majorContentChecks flags an email address",
    I.majorContentChecks("Contact us at sales@example.com for bulk orders").some(msg => msg.includes("联系方式"))
  );
  assertEqual("majorContentChecks passes plain text", I.majorContentChecks("A soft and breathable everyday fabric."), []);

  // --- classifyBackgroundPixels (shared/background-classifier.js) ---
  function solidImage(width, height, r, g, b, a) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i += 1) {
      data[i * 4] = r;
      data[i * 4 + 1] = g;
      data[i * 4 + 2] = b;
      data[i * 4 + 3] = a;
    }
    return data;
  }
  function checkerImage(width, height) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const block = (Math.floor(x / 5) + Math.floor(y / 5)) % 2;
        const value = block ? 20 : 230;
        data[index] = value;
        data[index + 1] = value;
        data[index + 2] = value;
        data[index + 3] = 255;
      }
    }
    return data;
  }

  assertEqual(
    "classifyBackgroundPixels: solid #E8E8E8 passes the gray-background check",
    C.classifyBackgroundPixels(solidImage(60, 60, 0xe8, 0xe8, 0xe8, 255), 60, 60).code,
    "gray_pass"
  );
  assertEqual(
    "classifyBackgroundPixels: solid red is a color mismatch",
    C.classifyBackgroundPixels(solidImage(60, 60, 220, 20, 20, 255), 60, 60).code,
    "color_mismatch"
  );
  assertEqual(
    "classifyBackgroundPixels: fully transparent background needs manual review",
    C.classifyBackgroundPixels(solidImage(60, 60, 0xe8, 0xe8, 0xe8, 0), 60, 60).code,
    "transparent"
  );
  assertEqual(
    "classifyBackgroundPixels: a busy checkerboard is treated as a scene/info image",
    C.classifyBackgroundPixels(checkerImage(60, 60), 60, 60).code,
    "scene"
  );
  assertEqual(
    "classifyBackgroundPixels: an empty pixel buffer reports no_pixels",
    C.classifyBackgroundPixels(new Uint8ClampedArray(0), 0, 0).code,
    "no_pixels"
  );

  // --- classifySwatchLikelihood (content.js -- Color Swatch Image check) ---
  assertEqual(
    "classifySwatchLikelihood: a solid color image is a genuine swatch",
    I.classifySwatchLikelihood(solidImage(40, 40, 0x2a, 0x6f, 0xed, 255), 40, 40).code,
    "swatch"
  );
  assertEqual(
    "classifySwatchLikelihood: a busy checkerboard reads as a product photo, not a swatch",
    I.classifySwatchLikelihood(checkerImage(40, 40), 40, 40).code,
    "product_photo"
  );
  assertEqual(
    "classifySwatchLikelihood: a fully transparent image needs manual review",
    I.classifySwatchLikelihood(solidImage(40, 40, 0x2a, 0x6f, 0xed, 0), 40, 40).code,
    "transparent"
  );
  assertEqual(
    "classifySwatchLikelihood: an empty pixel buffer reports pixel_unavailable",
    I.classifySwatchLikelihood(new Uint8ClampedArray(0), 0, 0).code,
    "pixel_unavailable"
  );

  const passCount = results.filter(result => result.pass).length;
  const failCount = results.length - passCount;
  const lines = results.map(result => `${result.pass ? "PASS" : "FAIL"}  ${result.name}${result.detail ? `\n      ${result.detail}` : ""}`);
  lines.push("", `${passCount}/${results.length} passed${failCount ? `, ${failCount} FAILED` : ""}`);

  const output = document.getElementById("output");
  output.textContent = lines.join("\n");
  output.style.color = failCount ? "#b42318" : "#067647";
  // eslint-disable-next-line no-console
  console.log(lines.join("\n"));
})();
