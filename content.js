(() => {
  const PAGE_RULES = [
    { key: "admin_catalogue", label: "运营端 Catalogue", test: url => url.hostname.startsWith("admin.") && url.pathname.includes("catalogue") },
    { key: "admin_pricing_audit", label: "运营端 Cost Audit", test: url => url.hostname.startsWith("admin.") && url.pathname.includes("pricing/cost-audit") },
    { key: "admin_pricing_failed", label: "运营端 Pricing Failed", test: url => url.hostname.startsWith("admin.") && url.pathname.includes("pricing/failed-update") },
    { key: "admin_orders", label: "运营端 Orders", test: url => url.hostname.startsWith("admin.") && url.pathname.includes("order") },
    { key: "merchant_catalogue", label: "商家端 Catalogue", test: url => !url.hostname.startsWith("admin.") && url.pathname.includes("catalogue") },
    { key: "merchant_feeds", label: "商家端 FeedsList", test: url => !url.hostname.startsWith("admin.") && url.pathname.includes("feeds") },
    { key: "merchant_pricing", label: "商家端 Pricing", test: url => !url.hostname.startsWith("admin.") && url.pathname.includes("pricing") },
    { key: "merchant_inventory", label: "商家端 Inventory", test: url => !url.hostname.startsWith("admin.") && url.pathname.includes("inventory") },
    { key: "merchant_orders", label: "商家端 Orders", test: url => !url.hostname.startsWith("admin.") && url.pathname.includes("orders") },
    { key: "merchant_inbound", label: "商家端 Inbound", test: url => !url.hostname.startsWith("admin.") && url.pathname.includes("inbound") }
  ];

  const TODO_WORDS = [
    "New Products",
    "Updated to be Audit",
    "Sync Failure",
    "Pending",
    "Rejected",
    "Awaiting Fulfillment",
    "Partially Fulfilled",
    "Failed",
    "Failure",
    "Cost Audit",
    "No inbound process required"
  ];

  function clean(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function isVisible(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }

  function pageInfo() {
    const url = new URL(location.href);
    const rule = PAGE_RULES.find(item => item.test(url));
    const title = clean(document.querySelector("h1,h2,.ant-page-header-heading-title")?.textContent) || document.title || url.pathname;
    return {
      key: rule?.key || "unknown",
      label: rule?.label || "未知 EH 页面",
      title,
      url: location.href,
      tab: url.searchParams.get("tab") || ""
    };
  }

  function readTotal() {
    const text = clean(document.body.innerText);
    const matches = [
      /Total\s+(\d+)\s+items?/i,
      /共\s*(\d+)\s*条/,
      /(\d+)\s*items?/i
    ];
    for (const pattern of matches) {
      const found = text.match(pattern);
      if (found) return Number(found[1]);
    }
    return null;
  }

  function extractRows() {
    const tables = [...document.querySelectorAll("table")];
    const rows = [];
    for (const table of tables) {
      const headers = [...table.querySelectorAll("thead th")].map(th => clean(th.textContent)).filter(Boolean);
      const bodyRows = [...table.querySelectorAll("tbody tr")];
      for (const tr of bodyRows) {
        const cells = [...tr.querySelectorAll("td")].map(td => clean(td.textContent));
        if (!cells.some(Boolean) || cells.join(" ").includes("No data")) continue;
        const row = {};
        cells.forEach((value, index) => {
          row[headers[index] || `Column ${index + 1}`] = value;
        });
        rows.push(row);
      }
    }
    return rows;
  }

  function readReadiness() {
    const bodyText = clean(document.body.innerText);
    const loading =
      !!document.querySelector(".ant-spin-spinning, .ant-table-placeholder .ant-spin, [aria-busy='true']") ||
      /Loading|加载中/i.test(bodyText);
    const rows = extractRows();
    const total = readTotal();
    const hasNoData = /No data|暂无数据/i.test(bodyText);
    const hasTable = !!document.querySelector("table");
    return {
      ready: hasTable && !loading && (rows.length > 0 || total !== null || hasNoData),
      loading,
      rowCount: rows.length,
      total,
      hasNoData,
      hasTable,
      url: location.href
    };
  }

  function countBy(rows, candidates) {
    const key = candidates.find(candidate => rows.some(row => row[candidate]));
    if (!key) return {};
    return rows.reduce((acc, row) => {
      const value = row[key] || "空";
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    }, {});
  }

  function findValue(row, candidates) {
    const key = candidates.find(candidate => row[candidate]);
    return key ? row[key] : "";
  }

  function visibleTodos() {
    const text = clean(document.body.innerText);
    return TODO_WORDS.reduce((acc, word) => {
      const pattern = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      const count = (text.match(pattern) || []).length;
      if (count) acc[word] = count;
      return acc;
    }, {});
  }

  function clickCatalogueTabByLabel(label) {
    const allowedReadOnlyTabs = new Set([
      "New Products",
      "Updated to be Audit",
      "Sync Failure",
      "Awaiting Fulfillment",
      "Partially Fulfilled",
      "Canceled",
      "To be Updated",
      "Pricing Failed Update",
      "Cost Audit"
    ]);
    if (!allowedReadOnlyTabs.has(label)) return false;
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const labelPattern = new RegExp(`^${escapedLabel}(?:\\s|\\d|$)`);
    // EH renders each status tab as a button and appends its badge number
    // without a space, e.g. "New Products0". Target the button directly.
    const target = [...document.querySelectorAll("button,[role='tab'],.ant-tabs-tab")]
      .filter(isVisible)
      .find(element => labelPattern.test(clean(element.textContent)));
    if (!target) return false;
    // Let the message response leave this page before a Pricing tab navigates
    // to a different route and unloads the current content script.
    window.setTimeout(() => clickElement(target), 0);
    return true;
  }

  function activeStatusTabLabel() {
    const active = [...document.querySelectorAll("button,[role='tab'],.ant-tabs-tab")]
      .filter(isVisible)
      .find(element =>
        String(element.className || "").includes("statusTabActive") ||
        element.getAttribute("aria-selected") === "true"
      );
    return clean(active?.textContent).replace(/\s*\d+\s*$/, "");
  }

  function findMerchantTrigger() {
    // The sidebar also has a "Merchant" menu item. Only the Catalogue filter
    // is an Ant Select with a Merchant prefix and a combobox inside it.
    const merchantSelect = [...document.querySelectorAll(".ant-select")]
      .filter(isVisible)
      .find(select => clean(select.querySelector(".ant-select-prefix")?.textContent).startsWith("Merchant"));
    // Click the visible Merchant label the user clicks. After a merchant is
    // selected EH changes the label from "Merchant" to "Merchant |".
    return merchantSelect?.querySelector(".ant-select-prefix") ||
      merchantSelect?.querySelector(".ant-select-selector") || null;
  }

  function parseMerchantLine(text) {
    const value = clean(text);
    if (!value) return null;
    if (/^(Merchant|Search|Reset|Confirm|Cancel|OK|All|Select all)$/i.test(value)) return null;
    const countMatch = value.match(/^(.+?)\s*(?:\((\d+)\)|（(\d+)）|\s+(\d+))$/);
    if (countMatch) {
      const name = clean(countMatch[1]);
      const count = Number(countMatch[2] || countMatch[3] || countMatch[4]);
      if (name && Number.isFinite(count)) return { merchant: name, count };
    }
    if (/^[A-Za-z0-9][A-Za-z0-9 '&._-]{1,80}$/.test(value)) {
      return { merchant: value, count: null };
    }
    return null;
  }

  function visibleOverlayRoots() {
    const overlays = [
      ...document.querySelectorAll(".ant-dropdown:not(.ant-dropdown-hidden), .ant-popover:not(.ant-popover-hidden), .ant-select-dropdown:not(.ant-select-dropdown-hidden), [role='listbox']")
    ].filter(isVisible);
    return overlays.length ? overlays : [];
  }

  function inlineMerchantRoots() {
    const trigger = findMerchantTrigger();
    if (!trigger) return [];
    const triggerRect = trigger.getBoundingClientRect();
    return [...document.querySelectorAll("div,section,form")]
      .filter(isVisible)
      .filter(element => {
        const rect = element.getBoundingClientRect();
        if (rect.height < 70 || rect.width < 150 || rect.width > 360) return false;
        if (Math.abs(rect.left - triggerRect.left) > 16) return false;
        if (rect.top > triggerRect.top + 8 || rect.bottom < triggerRect.bottom + 60) return false;
        const text = clean(element.textContent);
        if (!text.includes("Merchant")) return false;
        const parsedCount = [...element.querySelectorAll("label,li,div,span")]
          .map(item => parseMerchantLine(clean(item.textContent)))
          .filter(Boolean).length;
        return parsedCount > 0;
      })
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return (ar.width * ar.height) - (br.width * br.height);
      })
      .slice(0, 3);
  }

  function merchantListRoots() {
    const trigger = findMerchantTrigger();
    const controlId = trigger?.closest(".ant-select")?.querySelector("input[role='combobox']")?.getAttribute("aria-controls");
    const exactDropdown = controlId
      ? [...document.querySelectorAll(".ant-select-dropdown")]
        .filter(isVisible)
        .filter(dropdown => dropdown.querySelector(`#${CSS.escape(controlId)}`))
      : [];
    const roots = [...exactDropdown, ...visibleOverlayRoots(), ...inlineMerchantRoots()];
    const unique = [];
    roots.forEach(root => {
      if (!unique.includes(root)) unique.push(root);
    });
    return unique;
  }

  function findClickableByText(root, matcher) {
    return [...root.querySelectorAll("button,a,label,li,div,span,[role='option'],[role='menuitem'],.ant-checkbox-wrapper")]
      .filter(isVisible)
      .find(element => matcher(clean(element.textContent)));
  }

  function clickElement(element) {
    if (!element) return false;
    element.focus?.({ preventScroll: true });
    const rect = element.getBoundingClientRect();
    const point = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
    element.dispatchEvent(new MouseEvent("mousedown", {
      ...point, bubbles: true, cancelable: true, view: window, button: 0, buttons: 1
    }));
    element.dispatchEvent(new MouseEvent("mouseup", {
      ...point, bubbles: true, cancelable: true, view: window, button: 0, buttons: 0
    }));
    element.click();
    return true;
  }

  async function openMerchantDropdown() {
    const trigger = findMerchantTrigger();
    if (!trigger) return false;
    if (merchantListRoots().length > 0) return true;
    // EH can ignore the first selector click while its table is settling.
    // Retry the visible "+ Merchant" box, but only while the list is closed.
    for (let clickAttempt = 0; clickAttempt < 3; clickAttempt += 1) {
      clickElement(trigger);
      for (let waitAttempt = 0; waitAttempt < 6; waitAttempt += 1) {
        await delay(250);
        if (merchantListRoots().length > 0) return true;
      }
    }
    return false;
  }

  async function listMerchantOptions() {
    const opened = await openMerchantDropdown();
    if (!opened) return { source: "merchant_filter_missing", merchants: [] };
    const roots = merchantListRoots();
    const dropdown = roots.find(root => root.matches?.(".ant-select-dropdown")) || roots[0];
    const holder = dropdown?.querySelector(".rc-virtual-list-holder");
    const names = new Set();
    for (let round = 0; round < 40; round += 1) {
      [...(dropdown?.querySelectorAll(".ant-select-item-option[title]") || [])]
        .filter(isVisible)
        .map(option => clean(option.getAttribute("title")))
        .filter(Boolean)
        .forEach(name => names.add(name));
      if (!holder) break;
      const before = holder.scrollTop;
      holder.scrollTop = Math.min(
        holder.scrollHeight - holder.clientHeight,
        holder.scrollTop + Math.max(160, holder.clientHeight - 24)
      );
      holder.dispatchEvent(new Event("scroll", { bubbles: true }));
      await delay(180);
      if (holder.scrollTop === before || holder.scrollTop + holder.clientHeight >= holder.scrollHeight - 4) {
        [...(dropdown?.querySelectorAll(".ant-select-item-option[title]") || [])]
          .filter(isVisible)
          .map(option => clean(option.getAttribute("title")))
          .filter(Boolean)
          .forEach(name => names.add(name));
        break;
      }
    }
    if (holder) {
      holder.scrollTop = 0;
      holder.dispatchEvent(new Event("scroll", { bubbles: true }));
    }
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
    return { source: "merchant_filter_options", merchants: [...names].filter(Boolean) };
  }

  async function selectOnlyMerchant(merchant) {
    let merchantSelect = findMerchantTrigger()?.closest(".ant-select");
    if (!merchantSelect) return { selected: false, reason: "merchant_filter_missing" };

    if (merchantSelect.querySelector(".ant-select-selection-item")) {
      const clear = merchantSelect.querySelector(".ant-select-clear");
      if (!clear) return { selected: false, reason: "merchant_clear_missing" };
      merchantSelect.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true, view: window }));
      clickElement(clear);
      for (let attempt = 0; attempt < 12; attempt += 1) {
        await delay(250);
        merchantSelect = findMerchantTrigger()?.closest(".ant-select");
        if (!merchantSelect?.querySelector(".ant-select-selection-item")) break;
      }
      if (merchantSelect?.querySelector(".ant-select-selection-item")) {
        return { selected: false, reason: "merchant_clear_failed" };
      }
    }

    const opened = await openMerchantDropdown();
    if (!opened) return { selected: false, reason: "merchant_filter_missing" };
    merchantSelect = findMerchantTrigger()?.closest(".ant-select");
    let dropdown = merchantListRoots().find(root => root.matches?.(".ant-select-dropdown"));
    let option = null;
    for (let round = 0; round < 40 && !option; round += 1) {
      dropdown = merchantListRoots().find(root => root.matches?.(".ant-select-dropdown"));
      option = [...(dropdown?.querySelectorAll(".ant-select-item-option[title]") || [])]
        .find(item => clean(item.getAttribute("title")) === merchant) || null;
      if (option) break;
      const holder = dropdown?.querySelector(".rc-virtual-list-holder");
      if (!holder) break;
      const before = holder.scrollTop;
      holder.scrollTop = Math.min(
        holder.scrollHeight - holder.clientHeight,
        holder.scrollTop + Math.max(160, holder.clientHeight - 24)
      );
      holder.dispatchEvent(new Event("scroll", { bubbles: true }));
      await delay(180);
      if (holder.scrollTop === before) break;
    }
    if (!option) {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
      return { selected: false, reason: "merchant_option_missing" };
    }
    clickElement(option);
    await delay(900);
    dropdown = merchantListRoots().find(root => root.matches?.(".ant-select-dropdown"));
    const selectedInDropdown = [...(dropdown?.querySelectorAll(".ant-select-item-option[title]") || [])]
      .some(item => clean(item.getAttribute("title")) === merchant &&
        (item.getAttribute("aria-selected") === "true" || item.classList.contains("ant-select-item-option-selected")));
    const selectedInControl = [...(merchantSelect?.querySelectorAll("[title]") || [])]
      .some(item => clean(item.getAttribute("title")) === merchant);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
    return {
      selected: selectedInDropdown || selectedInControl,
      confirmed: selectedInDropdown || selectedInControl
    };
  }

  function tableRowCount() {
    return extractRows().length;
  }

  function clickFirstPageIfPossible() {
    const current = [...document.querySelectorAll(".ant-pagination-item-active, [aria-current='page']")].find(isVisible);
    if (current && clean(current.textContent) === "1") return true;
    const first = [...document.querySelectorAll(".ant-pagination-item, [title='1']")]
      .filter(isVisible)
      .find(element => clean(element.textContent) === "1" || element.getAttribute("title") === "1");
    return first ? clickElement(first) : false;
  }

  function clickNextPageIfPossible() {
    const next = [...document.querySelectorAll(".ant-pagination-next, [title='Next Page'], [aria-label='Next Page']")]
      .filter(isVisible)
      .find(element => {
        const cls = element.className || "";
        const disabled = element.getAttribute("aria-disabled") === "true" || element.disabled || String(cls).includes("disabled");
        return !disabled;
      });
    if (!next) return false;
    return clickElement(next.querySelector("button,a") || next);
  }

  function pageLines() {
    return (document.body.innerText || "")
      .split(/\r?\n/)
      .map(clean)
      .filter(Boolean);
  }

  function valueAfterLineLabel(label, lines = pageLines(), startAt = 0) {
    const index = lines.findIndex((line, lineIndex) => lineIndex >= startAt && line.toLowerCase() === label.toLowerCase());
    if (index < 0) return "";
    return lines[index + 1] || "";
  }

  // A field label ("Title"/"Description"/...) immediately following another
  // field's label line means that field is empty in the UI (no value line
  // was rendered in between) rather than the next label being its value.
  const CONTENT_FIELD_LABELS = /^(Title|Description|Meta Title|Meta Description|Variant and Media|Editor)$/i;

  function readSectionTitleAndDescription(scoped) {
    const titleIndex = scoped.findIndex(line => /^Title$/i.test(line));
    const descriptionIndex = scoped.findIndex((line, index) => index > titleIndex && /^Description$/i.test(line));
    const descriptionEnd = scoped.findIndex((line, index) => index > descriptionIndex && /^(Meta Title|Meta Description|Variant and Media)$/i.test(line));
    const titleValue = titleIndex >= 0 ? scoped[titleIndex + 1] || "" : "";
    const title = CONTENT_FIELD_LABELS.test(titleValue) ? "" : titleValue;
    const description = descriptionIndex >= 0
      ? scoped.slice(descriptionIndex + 1, descriptionEnd > descriptionIndex ? descriptionEnd : scoped.length).join("\n")
      : "";
    return { title, description };
  }

  // The Editor Title field renders as a real <input>, and an <input>'s typed
  // value is never part of document.body.innerText (unlike plain text or a
  // contenteditable rich-text box, which is how Description is rendered).
  // So a filled-in Editor title has to be read straight off the DOM element
  // instead of the innerText line scan readSectionTitleAndDescription uses.
  function findLeafByExactText(text) {
    return [...document.querySelectorAll("div,span,p,label,h1,h2,h3,h4")]
      .filter(element => element.children.length === 0)
      .filter(isVisible)
      .find(element => clean(element.textContent) === text) || null;
  }

  // Scope the search to the Editor block's own container (the nearest
  // ancestor of the "Editor" heading that actually holds an <input>) rather
  // than matching by position alone -- Provided-by's "Title" label sits at a
  // very similar vertical offset in the next column over, so a pure
  // proximity check can grab the wrong one.
  function findEditorContainer() {
    const editorHeading = findLeafByExactText("Editor");
    if (!editorHeading) return null;
    let node = editorHeading;
    for (let depth = 0; depth < 6; depth += 1) {
      node = node.parentElement;
      if (!node) return null;
      if (node.querySelector("input")) return node;
    }
    return null;
  }

  function readEditorTitleInputValue() {
    const container = findEditorContainer();
    if (!container) return "";
    const titleLabel = [...container.querySelectorAll("div,span,p,label")]
      .filter(element => element.children.length === 0)
      .filter(isVisible)
      .find(element => clean(element.textContent) === "Title");
    if (!titleLabel) return "";
    const labelRect = titleLabel.getBoundingClientRect();
    const candidates = [...container.querySelectorAll("input")]
      .filter(isVisible)
      .filter(element => ["text", ""].includes((element.getAttribute("type") || "").toLowerCase()));
    const input = candidates.sort((a, b) => {
      const distanceA = Math.abs(a.getBoundingClientRect().top - labelRect.bottom);
      const distanceB = Math.abs(b.getBoundingClientRect().top - labelRect.bottom);
      return distanceA - distanceB;
    })[0];
    return input ? clean(input.value) : "";
  }

  function readProvidedContent() {
    const lines = pageLines();
    const providedIndex = lines.findIndex(line => /^Provided by\s+/i.test(line));
    const editorIndex = lines.findIndex((line, index) => index > providedIndex && /^Editor$/i.test(line));
    const providedScoped = providedIndex >= 0
      ? lines.slice(providedIndex, editorIndex > providedIndex ? editorIndex : Math.min(lines.length, providedIndex + 80))
      : lines;
    const editorScoped = editorIndex >= 0
      ? (() => {
          const boundaryIndex = lines.findIndex((line, index) => index > editorIndex && /^(Meta Title|Meta Description|Variant and Media)$/i.test(line));
          return lines.slice(editorIndex, boundaryIndex > editorIndex ? boundaryIndex : Math.min(lines.length, editorIndex + 80));
        })()
      : [];

    const provided = readSectionTitleAndDescription(providedScoped);
    const editor = readSectionTitleAndDescription(editorScoped);
    if (!editor.title) editor.title = readEditorTitleInputValue();
    const headerTitle = clean(document.querySelector(".ant-page-header-heading-title,h1")?.textContent);

    // The Editor fields let the merchandising team override the vendor's
    // Provided-by copy. When Editor actually filled in a field, that is the
    // copy customers see, so audit it instead of the untouched vendor text.
    const title = editor.title || provided.title || headerTitle;
    const description = editor.description || provided.description;
    const provider = providedIndex >= 0 ? clean(providedScoped[0]).replace(/^Provided by\s+/i, "") : "";
    return {
      title,
      description,
      provider,
      titleSource: editor.title ? "editor" : "provided",
      descriptionSource: editor.description ? "editor" : "provided"
    };
  }

  function readBasicValue(label) {
    const lines = pageLines();
    const basicIndex = lines.findIndex(line => /^Basic Info$/i.test(line));
    const endIndex = lines.findIndex((line, index) => index > basicIndex && /^Provided by\s+/i.test(line));
    const scoped = basicIndex >= 0
      ? lines.slice(basicIndex, endIndex > basicIndex ? endIndex : Math.min(lines.length, basicIndex + 50))
      : lines;
    return valueAfterLineLabel(label, scoped);
  }

  function readAttributeValue(label) {
    const lines = pageLines();
    const attributeIndex = lines.findIndex(line => /^Product Attribute$/i.test(line));
    if (attributeIndex < 0) return "";
    return valueAfterLineLabel(label, lines, attributeIndex);
  }

  function normalizedWords(text) {
    return (text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) || []).filter(Boolean);
  }

  function isTitleCaseWord(word, index, total) {
    const smallWords = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into", "nor", "of", "on", "or", "over", "per", "the", "to", "via", "with"]);
    const parts = word.split(/[-–—]/).filter(Boolean);
    return parts.every(part => {
      const letters = part.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "");
      if (!letters || /^[A-Z0-9]{2,}$/.test(letters)) return true;
      if (index > 0 && index < total - 1 && smallWords.has(letters.toLowerCase())) {
        return letters === letters.toLowerCase();
      }
      return /^[A-Z][a-z]*(?:['’][A-Za-z]+)?$/.test(letters);
    });
  }

  function titleChecks(title, brandNames) {
    const words = normalizedWords(title);
    const issues = [];
    if (words.length < 5 || words.length > 10) issues.push(`标题为 ${words.length} 个词，要求 5–10 个词`);
    const invalidCase = words.filter((word, index) => !isTitleCaseWord(word, index, words.length));
    if (invalidCase.length) issues.push(`未按 Title Case：${invalidCase.join(", ")}`);
    const normalizedTitle = ` ${title.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
    const includedBrands = brandNames.filter(Boolean).filter(brand => {
      const normalizedBrand = brand.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      return normalizedBrand && normalizedTitle.includes(` ${normalizedBrand} `);
    });
    if (includedBrands.length) issues.push(`标题含品牌名：${includedBrands.join(", ")}`);
    return issues;
  }

  function languageChecks(title, description) {
    const issues = [];
    const fields = [{ label: "Title", text: title }, { label: "Description", text: description }];
    fields.forEach(field => {
      const repeated = field.text.match(/\b([A-Za-z]{3,})\s+\1\b/i);
      if (repeated) issues.push(`${field.label}：重复词 “${repeated[1]} ${repeated[1]}”`);
      const spacingPattern = /\b[A-Za-z][A-Za-z'’-]{0,20}[,.!?;:][A-Za-z][A-Za-z'’-]{0,20}\b/g;
      const spacingHits = [...field.text.matchAll(spacingPattern)].slice(0, 5);
      spacingHits.forEach(hit => {
        const corrected = hit[0].replace(/([,.!?;:])(?=[A-Za-z])/g, "$1 ");
        issues.push(`${field.label}：“${hit[0]}” → “${corrected}”`);
      });
    });
    const commonTypos = {
      alot: "a lot", teh: "the", recieve: "receive", seperat: "separate",
      occured: "occurred", avaliable: "available", enviroment: "environment",
      womens: "women's", mens: "men's", accesories: "accessories",
      sleevless: "sleeveless", polyster: "polyester", lenght: "length",
      colourfull: "colorful", breathble: "breathable"
    };
    const text = `${title}\n${description}`;
    const lowerWords = normalizedWords(text).map(word => word.toLowerCase());
    const typoHits = [...new Set(lowerWords.filter(word => commonTypos[word]))];
    if (typoHits.length) {
      typoHits.forEach(word => {
        const field = title.toLowerCase().includes(word) ? "Title" : "Description";
        issues.push(`${field}：疑似错词 “${word}” → “${commonTypos[word]}”`);
      });
    }
    return issues;
  }

  function descriptionChecks(description) {
    const issues = [];
    if (!description) return ["Description 为空"];
    const words = normalizedWords(description).map(word => word.toLowerCase()).filter(word => word.length >= 4);
    const frequencies = words.reduce((map, word) => map.set(word, (map.get(word) || 0) + 1), new Map());
    const repeatedKeywords = [...frequencies.entries()]
      .filter(([, count]) => count >= 5 && count / Math.max(words.length, 1) >= 0.07)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
    if (repeatedKeywords.length) {
      issues.push(`疑似关键词重复：${repeatedKeywords.map(([word, count]) => `${word} × ${count}`).join("，")}`);
    }
    const lines = description.split(/\r?\n/).map(clean).filter(Boolean);
    const duplicateLines = lines.filter((line, index) => line.length > 12 && lines.indexOf(line) !== index);
    if (duplicateLines.length) issues.push(`Description 重复内容：“${[...new Set(duplicateLines)].slice(0, 3).join("” / “")}”`);
    const promotionalHits = description.match(/\b(best seller|buy now|limited time|lowest price|free shipping|100% guaranteed)\b/gi) || [];
    if (promotionalHits.length >= 2) issues.push(`Description 促销或 SEO 表述较多：“${[...new Set(promotionalHits)].join("” / “")}”`);
    return issues;
  }

  function majorContentChecks(description) {
    const issues = [];
    const contact = description.match(/(?:https?:\/\/|www\.)\S+|\b\S+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/i)?.[0];
    if (contact) issues.push(`Description 含网址或联系方式：“${contact}”`);
    return issues;
  }

  function priceConsistencyCheck() {
    const priceFields = ["VIP Price", "MSRP", "Token", "Cost", "SRP"];
    const rows = extractRows().filter(row => priceFields.some(field => Object.prototype.hasOwnProperty.call(row, field)));
    if (!rows.length) return { status: "manual", detail: "未读取到 Variant 价格表，请确认当前位于商品详情页。" };
    const differences = [];
    priceFields.forEach(field => {
      const values = rows.map(row => clean(row[field])).filter(Boolean);
      const unique = [...new Set(values)];
      const emptyValuesAreAllowed = field === "Token";
      if (!emptyValuesAreAllowed && values.length !== rows.length) unique.push("空值");
      if (unique.length > 1 || (!emptyValuesAreAllowed && values.length !== rows.length)) {
        differences.push(`${field}：${unique.join(" / ")}`);
      }
    });
    return differences.length
      ? { status: "attention", detail: `同一 SPU 内数值不一致。${differences.join("；")}` }
      : { status: "pass", detail: `${rows.length} 个 Variant 的 VIP Price、MSRP、Token、Cost、SRP 均一致。` };
  }

  function findVisibleTextElement(text) {
    return [...document.querySelectorAll("h1,h2,h3,h4,div,span,p")]
      .filter(isVisible)
      .find(element => clean(element.textContent) === text) || null;
  }

  async function ensureVariantSectionLoaded() {
    const priceFields = ["VIP Price", "MSRP", "Token", "Cost", "SRP"];
    for (let attempt = 0; attempt < 18; attempt += 1) {
      const rows = extractRows();
      if (rows.some(row => priceFields.some(field => Object.prototype.hasOwnProperty.call(row, field)))) return true;
      const section = findVisibleTextElement("Variant and Media");
      if (section) {
        section.scrollIntoView({ block: "start", behavior: "auto" });
      } else {
        window.scrollBy({ top: Math.max(500, window.innerHeight * 0.75), behavior: "auto" });
      }
      await delay(350);
    }
    return false;
  }

  async function clickMediaTab() {
    const target = [...document.querySelectorAll("button,[role='tab'],.ant-tabs-tab")]
      .filter(isVisible)
      .find(element => clean(element.textContent) === "Media");
    if (!target) return false;
    clickElement(target);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await delay(250);
      const active = target.getAttribute("aria-selected") === "true" || String(target.className || "").includes("active");
      const visibleImages = [...document.querySelectorAll("img")].filter(image => isVisible(image) && image.getBoundingClientRect().width >= 45);
      if (active || visibleImages.length >= 2) return true;
    }
    return true;
  }

  function candidateImageUrl(element) {
    const lazyAttributes = ["data-src", "data-original", "data-lazy-src", "data-url"];
    for (const attribute of lazyAttributes) {
      const value = element.getAttribute?.(attribute);
      if (value && !/^data:image\/(?:gif|svg\+xml)/i.test(value)) return value;
    }
    if (element.tagName === "IMG") return element.currentSrc || element.getAttribute("src") || "";
    const background = window.getComputedStyle(element).backgroundImage || "";
    return background.match(/url\(["']?(.*?)["']?\)/i)?.[1] || "";
  }

  function mediaColumnCandidates() {
    const tables = [...document.querySelectorAll("table")];
    const mediaTable = tables.find(table => {
      const headers = [...table.querySelectorAll("thead th")].map(header => clean(header.textContent));
      return headers.includes("Color Swatch Image") && headers.includes("Media");
    });
    if (!mediaTable) return [];
    const headers = [...mediaTable.querySelectorAll("thead th")].map(header => clean(header.textContent));
    const mediaIndex = headers.indexOf("Media");
    if (mediaIndex < 0) return [];
    const candidates = [];
    [...mediaTable.querySelectorAll("tbody tr")].forEach(row => {
      const cells = [...row.querySelectorAll(":scope > td")];
      const mediaCell = cells[mediaIndex];
      if (!mediaCell) return;
      const color = clean(cells[0]?.textContent) || "未知色号";
      const elements = [mediaCell, ...mediaCell.querySelectorAll("img,div,span")];
      let imageIndex = 0;
      elements.forEach(element => {
        const url = candidateImageUrl(element);
        if (!url) return;
        const rect = element.getBoundingClientRect();
        if (element.tagName === "IMG" && (rect.width < 35 || rect.height < 35)) return;
        imageIndex += 1;
        candidates.push({
          element,
          url,
          color,
          imageIndex,
          rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
        });
      });
    });
    return candidates.slice(0, 200);
  }

  // Color Swatch Image cells render much smaller than Media images, so this
  // uses a lower minimum-size cutoff than mediaColumnCandidates(). Rows with
  // no image at all are still returned (candidate: null) so the empty-link
  // check can report on them.
  function colorSwatchColumnStatus() {
    const tables = [...document.querySelectorAll("table")];
    const mediaTable = tables.find(table => {
      const headers = [...table.querySelectorAll("thead th")].map(header => clean(header.textContent));
      return headers.includes("Color Swatch Image") && headers.includes("Media");
    });
    if (!mediaTable) return { found: false, rows: [] };
    const headers = [...mediaTable.querySelectorAll("thead th")].map(header => clean(header.textContent));
    const swatchIndex = headers.indexOf("Color Swatch Image");
    if (swatchIndex < 0) return { found: false, rows: [] };
    const rows = [];
    [...mediaTable.querySelectorAll("tbody tr")].forEach(row => {
      const cells = [...row.querySelectorAll(":scope > td")];
      const swatchCell = cells[swatchIndex];
      if (!swatchCell) return;
      const color = clean(cells[0]?.textContent) || "未知色号";
      const elements = [swatchCell, ...swatchCell.querySelectorAll("img,div,span")];
      let candidate = null;
      for (const element of elements) {
        const url = candidateImageUrl(element);
        if (!url) continue;
        const rect = element.getBoundingClientRect();
        if (element.tagName === "IMG" && (rect.width < 8 || rect.height < 8)) continue;
        candidate = { element, url, color, rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } };
        break;
      }
      rows.push({ color, candidate });
    });
    return { found: true, rows: rows.slice(0, 200) };
  }

  async function loadCandidateImage(candidate) {
    const element = candidate.element;
    const renderedUrl = element.tagName === "IMG" ? (element.currentSrc || element.getAttribute("src") || "") : "";
    let hostname = "";
    try {
      hostname = new URL(candidate.url, location.href).hostname;
    } catch (_error) {
      hostname = "";
    }
    if ([
      "img.engagehub.tsostech.com",
      "cdn.shopify.com",
      "prodenv-merchant-public.s3.us-west-2.amazonaws.com"
    ].includes(hostname)) {
      const response = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: "EH_ASSISTANT_FETCH_IMAGE", url: candidate.url }, result => {
          if (chrome.runtime.lastError) resolve(null);
          else resolve(result || null);
        });
      });
      if (response?.ok && response.dataUrl) {
        const image = new Image();
        image.src = response.dataUrl;
        await Promise.race([
          image.decode(),
          new Promise((_, reject) => window.setTimeout(() => reject(new Error("EH 图片解码超时")), 5000))
        ]);
        return image;
      }
      if (response?.error) throw new Error(`EH 图片后台读取失败：${response.error}`);
    }
    if (element.tagName === "IMG" && element.complete && element.naturalWidth >= 40 && renderedUrl === candidate.url) return element;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = candidate.url;
    await Promise.race([
      image.decode(),
      new Promise((_, reject) => window.setTimeout(() => reject(new Error("image timeout")), 5000))
    ]);
    return image;
  }

  async function imageBackgroundResult(candidate) {
    try {
      const image = await loadCandidateImage(candidate);
      if (!image.complete) await image.decode();
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      if (width < 40 || height < 40) return { status: "manual", code: "too_small", detail: "图片尺寸过小，无法可靠判断" };
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 220 / Math.max(width, height));
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const classified = window.EHAssistantBackgroundClassifier.classifyBackgroundPixels(pixels, canvas.width, canvas.height);
      if (classified.code === "no_pixels") return { status: "manual", code: "pixel_unavailable", detail: "图片区域没有可分析像素" };
      if (classified.code === "transparent") return { status: "manual", code: "transparent", detail: "图片含透明背景，需人工确认页面呈现颜色" };
      if (classified.code === "scene") return { status: "pass", code: "scene", detail: "识别为场景图或信息图，背景色规则豁免" };
      return classified.code === "gray_pass"
        ? { status: "pass", code: "gray_pass", detail: `纯背景图，背景约为 ${classified.color}` }
        : { status: "attention", code: "color_mismatch", detail: `纯背景图背景约为 ${classified.color}，与 #E8E8E8 差异较明显` };
    } catch (error) {
      const message = String(error?.message || error || "");
      if (/tainted|cross-origin|cross origin|insecure|security/i.test(message) || error?.name === "SecurityError") {
        return { status: "manual", code: "pixel_blocked", detail: "图片可显示，但浏览器跨域安全限制阻止读取像素" };
      }
      if (/timeout|decode|load|network/i.test(message)) {
        return { status: "manual", code: "load_failed", detail: "图片加载或解码失败，无法读取像素" };
      }
      return { status: "manual", code: "pixel_unavailable", detail: `无法读取图片像素${message ? `：${message}` : ""}` };
    }
  }

  function mediaImageLabel(result) {
    return `${result.color} 第 ${result.imageIndex} 张`;
  }

  function summarizeManualReasons(results) {
    const reasonLabels = {
      pixel_blocked: "浏览器跨域安全限制阻止读取像素",
      load_failed: "图片加载或解码失败",
      broken_image: "图片无法显示，链接可能已失效",
      transparent: "透明背景",
      too_small: "图片尺寸过小",
      pixel_unavailable: "其他像素读取错误",
      outside_viewport: "图片不在当前可见区域",
      screenshot_failed: "页面截图分析失败"
    };
    const groups = results.reduce((map, result) => {
      const key = result.code || "pixel_unavailable";
      if (!map[key]) map[key] = { count: 0, details: new Set() };
      map[key].count += 1;
      if (result.detail) map[key].details.add(result.detail);
      return map;
    }, {});
    return Object.entries(groups)
      .map(([code, group]) => {
        const examples = [...group.details].slice(0, 2);
        const explanation = examples.length ? `（${examples.join("；")}）` : "";
        return `${reasonLabels[code] || code}：${group.count} 张${explanation}`;
      })
      .join("；");
  }

  function summarizeMediaResults(results) {
    const attention = results.filter(item => item.status === "attention");
    const manual = results.filter(item => item.status === "manual");
    const exempt = results.filter(item => item.code === "scene").length;
    const checked = results.length - exempt;
    if (attention.length) {
      const attentionDetails = attention.slice(0, 8).map(item => `${mediaImageLabel(item)}：${item.detail}`).join("；");
      const manualDetails = manual.length ? `另有 ${manual.length} 张无法自动判断，原因：${summarizeManualReasons(manual)}。` : "";
      return { status: "attention", detail: `Media 共 ${results.length} 张：${checked - attention.length - manual.length} 张自动通过，${exempt} 张场景图或信息图豁免，${attention.length} 张背景需关注。${attentionDetails}。${manualDetails}` };
    }
    if (manual.length) {
      const samples = manual.slice(0, 5).map(item => mediaImageLabel(item)).join("、");
      return { status: "manual", detail: `Media 共 ${results.length} 张：${checked - manual.length} 张自动通过，${exempt} 张场景图或信息图豁免，${manual.length} 张无法自动判断。原因：${summarizeManualReasons(manual)}。涉及：${samples}${manual.length > 5 ? "等" : ""}。` };
    }
    return { status: "pass", detail: `Media 共 ${results.length} 张：${checked} 张模特图或纯背景商品图符合灰色背景要求，${exempt} 张场景图或信息图已豁免。` };
  }

  async function mediaCheck() {
    if (!await clickMediaTab()) return { status: "manual", detail: "未找到 Media tab，请人工查看图片。" };
    await delay(800);
    let candidates = mediaColumnCandidates();
    for (let attempt = 0; attempt < 8 && !candidates.length; attempt += 1) {
      window.scrollBy({ top: 350, behavior: "auto" });
      await delay(250);
      candidates = mediaColumnCandidates();
    }
    if (!candidates.length) return { status: "manual", detail: "未读取到 Media 列图片；Color Swatch Image 已排除。" };
    const results = [];
    for (const candidate of candidates) {
      results.push({
        ...await imageBackgroundResult(candidate),
        color: candidate.color,
        imageIndex: candidate.imageIndex,
        rect: candidate.rect
      });
    }
    return {
      ...summarizeMediaResults(results),
      imageResults: results,
      viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio || 1 }
    };
  }

  // A genuine color swatch is close to one flat color edge-to-edge. A product
  // photo -- even one shot on a plain background -- has the product itself
  // occupying real frame area, so the single-color coverage across the WHOLE
  // image (not just the border, unlike the Media background check) comes out
  // much lower. Sampling the full frame is what tells the two apart.
  function classifySwatchLikelihood(pixels, width, height) {
    const allSamples = [];
    const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 900)));
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const index = (y * width + x) * 4;
        allSamples.push([pixels[index], pixels[index + 1], pixels[index + 2], pixels[index + 3]]);
      }
    }
    if (!allSamples.length) return { status: "manual", code: "pixel_unavailable", detail: "图片区域没有可分析像素" };
    const opaqueSamples = allSamples.filter(pixel => pixel[3] > 220).map(pixel => [pixel[0], pixel[1], pixel[2]]);
    if (opaqueSamples.length < allSamples.length * 0.5) {
      return { status: "manual", code: "transparent", detail: "图片含大面积透明区域，需人工确认是否为色块图" };
    }
    const mean = [0, 1, 2].map(channel => opaqueSamples.reduce((sum, pixel) => sum + pixel[channel], 0) / opaqueSamples.length);
    const colorDistance = (first, second) => Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2]);
    const closeRatio = opaqueSamples.filter(pixel => colorDistance(pixel, mean) <= 26).length / opaqueSamples.length;
    const color = `#${mean.map(value => Math.round(value).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
    if (closeRatio >= 0.9) return { status: "pass", code: "swatch", detail: `识别为色块图，颜色约为 ${color}` };
    if (closeRatio < 0.6) return { status: "attention", code: "product_photo", detail: `疑似产品图而非色块图，画面颜色变化较大（颜色一致占比 ${Math.round(closeRatio * 100)}%）` };
    return { status: "manual", code: "ambiguous", detail: `无法确定是否为色块图（颜色一致占比 ${Math.round(closeRatio * 100)}%），请人工确认` };
  }

  async function classifySwatchImageResult(candidate) {
    try {
      const image = await loadCandidateImage(candidate);
      if (!image.complete) await image.decode();
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      // A broken/expired image link still resolves as "complete" with zero
      // natural size (that's how the browser renders the broken-image icon)
      // rather than throwing -- this is a confirmed problem, not something
      // that merely couldn't be judged, so it must not fall into "too_small".
      if (!width || !height) {
        return { status: "attention", code: "broken_image", detail: "图片无法显示，链接可能已失效或返回了空内容" };
      }
      if (width < 6 || height < 6) return { status: "manual", code: "too_small", detail: "图片尺寸过小，无法可靠判断" };
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 220 / Math.max(width, height));
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      return classifySwatchLikelihood(pixels, canvas.width, canvas.height);
    } catch (error) {
      const message = String(error?.message || error || "");
      if (/tainted|cross-origin|cross origin|insecure|security/i.test(message) || error?.name === "SecurityError") {
        return { status: "manual", code: "pixel_blocked", detail: "图片可显示，但浏览器跨域安全限制阻止读取像素" };
      }
      // decode() rejecting (as opposed to resolving with a 0x0 image) means
      // the browser couldn't load the resource at all -- also a confirmed
      // broken link, so this is "attention", not "manual".
      if (/timeout|decode|load|network/i.test(message) || error?.name === "EncodingError") {
        return { status: "attention", code: "load_failed", detail: `图片加载失败，链接可能已失效${message ? `：${message}` : ""}` };
      }
      return { status: "manual", code: "pixel_unavailable", detail: `无法读取图片像素${message ? `：${message}` : ""}` };
    }
  }

  async function colorSwatchCheck() {
    const status = colorSwatchColumnStatus();
    if (!status.found) return { status: "manual", detail: "未找到 Color Swatch Image 列，请人工确认。" };
    if (!status.rows.length) return { status: "manual", detail: "未读取到任何色号行，请确认 Variant 表格已加载。" };

    const missingRows = status.rows.filter(row => !row.candidate);
    const presentRows = status.rows.filter(row => row.candidate);
    const results = [];
    for (const row of presentRows) {
      results.push({ color: row.color, ...await classifySwatchImageResult(row.candidate) });
    }
    const attention = results.filter(item => item.status === "attention");
    const manual = results.filter(item => item.status === "manual");

    const issues = [];
    if (missingRows.length) {
      const sample = missingRows.slice(0, 6).map(row => row.color).join("、");
      issues.push(`${missingRows.length} 个色号缺少 Color Swatch Image 图片链接：${sample}${missingRows.length > 6 ? "等" : ""}`);
    }
    if (attention.length) {
      const sample = attention.slice(0, 6).map(item => `${item.color}：${item.detail}`).join("；");
      issues.push(`${attention.length} 个色号的图片有问题（加载失败或疑似产品图）：${sample}`);
    }
    if (issues.length) {
      const manualNote = manual.length ? `另有 ${manual.length} 个色号无法自动判断，需人工确认（${summarizeManualReasons(manual)}）。` : "";
      return { status: "attention", detail: `${issues.join("；")}。${manualNote}` };
    }
    if (manual.length) {
      const sample = manual.slice(0, 5).map(item => item.color).join("、");
      return { status: "manual", detail: `${status.rows.length} 个色号中有 ${manual.length} 个无法自动判断是否为色块图，需人工确认。原因：${summarizeManualReasons(manual)}。涉及：${sample}${manual.length > 5 ? "等" : ""}。` };
    }
    return { status: "pass", detail: `共 ${status.rows.length} 个色号，Color Swatch Image 均存在且识别为色块图。` };
  }

  async function auditCurrentProduct(onStage = () => {}) {
    onStage("识别商品详情页");
    const bodyText = clean(document.body.innerText);
    const url = new URL(location.href);
    const isDetailRoute = url.hostname === "admin.engagehub.tsostech.com" && /^\/catalogue\/detail\//i.test(url.pathname);
    if (!isDetailRoute && !(/Basic Info/i.test(bodyText) && /Provided by/i.test(bodyText))) return null;
    onStage("读取 Basic Info 与商家文案");
    const product = readProvidedContent();
    product.spuId = readBasicValue("SPU ID");
    product.productBrand = readBasicValue("Product Brand");
    product.vendor = readBasicValue("Vendor");
    const brandNames = [...new Set([product.productBrand, product.vendor, product.provider].filter(Boolean))];
    const checks = [];
    onStage("检查标题与 Description");
    const titleSourceNote = product.titleSource === "editor" ? "（审核的是 Editor 覆盖后的标题）" : "";
    const descriptionSourceNote = product.descriptionSource === "editor" ? "（审核的是 Editor 覆盖后的 Description）" : "";
    const titleIssues = titleChecks(product.title, brandNames);
    checks.push({ label: "标题规范", status: titleIssues.length ? "attention" : "pass", detail: (titleIssues.join("；") || "5–10 个词、Title Case，且未包含品牌名。") + titleSourceNote });
    const languageIssues = languageChecks(product.title, product.description);
    checks.push({ label: "错别字与大小写", status: languageIssues.length ? "attention" : "pass", detail: languageIssues.join("；") || "未发现明显的拼写、重复词或标点问题。" });
    const seoIssues = descriptionChecks(product.description);
    checks.push({ label: "Description", status: seoIssues.length ? "attention" : "pass", detail: (seoIssues.join("；") || "未发现明显的 SEO 关键词堆砌或重复内容。") + descriptionSourceNote });
    const majorIssues = majorContentChecks(product.description);
    checks.push({ label: "明显内容错误", status: majorIssues.length ? "attention" : "pass", detail: majorIssues.join("；") || "未发现网址、联系方式等明显内容问题。材质近似表达不作严格比对。" });
    onStage("加载并检查 Variant 价格表");
    await ensureVariantSectionLoaded();
    checks.push({ label: "价格字段一致性", ...priceConsistencyCheck() });
    onStage("打开并检查 Media 图片");
    checks.push({ label: "图片背景", ...await mediaCheck() });
    onStage("检查 Color Swatch 图片");
    checks.push({ label: "Color Swatch", ...await colorSwatchCheck() });
    onStage("生成审核结果");
    return { product, checks, scannedAt: new Date().toISOString() };
  }

  function extractSnapshot() {
    const info = pageInfo();
    const rows = extractRows();
    const total = readTotal();
    const merchantCounts = countBy(rows, ["Merchant", "Brand", "merchant", "brand"]);
    const statusCounts = countBy(rows, ["Status", "Audit Status", "Order Status", "Push Status", "Cost Status", "Listing Status"]);
    const channelCounts = countBy(rows, ["Channel", "Sales Channel"]);
    const tabLabelMap = {
      ALL: "All",
      NEW_PRODUCTS: "New Products",
      UPDATED_TO_BE_AUDIT: "Updated to be Audit",
      SYNC_FAILURE: "Sync Failure"
    };
    const todoType = tabLabelMap[info.tab] || info.title || info.label;
    const rowSummaries = rows.map(row => ({
      merchant: findValue(row, ["Merchant", "Brand", "merchant", "brand"]) || "Unknown",
      status: findValue(row, ["Status", "Audit Status", "Order Status", "Push Status", "Cost Status", "Listing Status"]),
      channel: findValue(row, ["Channel", "Sales Channel"]),
      product: findValue(row, ["Product", "Title", "Order ID", "Model"]),
      todoType
    }));

    return {
      ...info,
      scannedAt: new Date().toISOString(),
      totalItems: total,
      visibleRows: rows.length,
      todoType,
      rowSummaries,
      merchantCounts,
      statusCounts,
      channelCounts,
      visibleTodoSignals: visibleTodos()
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "EH_ASSISTANT_SUMMARIZE_MEDIA_RESULTS") {
      try {
        sendResponse({ ok: true, check: summarizeMediaResults(message.results || []) });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || String(error) });
      }
      return;
    }
    if (message?.type === "EH_ASSISTANT_AUDIT_PRODUCT") {
      let stage = "识别商品详情页";
      (async () => {
        const result = await auditCurrentProduct(nextStage => { stage = nextStage; });
        return result;
      })()
        .then(result => sendResponse({ ok: true, result }))
        .catch(error => sendResponse({ ok: false, stage, error: error?.message || String(error) }));
      return true;
    }
    if (message?.type === "EH_ASSISTANT_CLICK_CATALOGUE_TAB") {
      try {
        sendResponse({ ok: true, clicked: clickCatalogueTabByLabel(message.label) });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || String(error) });
      }
      return;
    }
    if (message?.type === "EH_ASSISTANT_ACTIVE_STATUS_TAB") {
      try {
        sendResponse({ ok: true, label: activeStatusTabLabel() });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || String(error) });
      }
      return;
    }
    if (message?.type === "EH_ASSISTANT_LIST_MERCHANTS") {
      listMerchantOptions()
        .then(result => sendResponse({ ok: true, result }))
        .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
      return true;
    }
    if (message?.type === "EH_ASSISTANT_SELECT_MERCHANT") {
      selectOnlyMerchant(message.merchant)
        .then(result => sendResponse({ ok: true, result }))
        .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
      return true;
    }
    if (message?.type === "EH_ASSISTANT_ROW_COUNT") {
      try {
        sendResponse({ ok: true, count: tableRowCount() });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || String(error) });
      }
      return;
    }
    if (message?.type === "EH_ASSISTANT_FIRST_PAGE") {
      try {
        sendResponse({ ok: true, clicked: clickFirstPageIfPossible() });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || String(error) });
      }
      return;
    }
    if (message?.type === "EH_ASSISTANT_NEXT_PAGE") {
      try {
        sendResponse({ ok: true, clicked: clickNextPageIfPossible() });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || String(error) });
      }
      return;
    }
    if (message?.type === "EH_ASSISTANT_READY") {
      try {
        sendResponse({ ok: true, readiness: readReadiness() });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || String(error) });
      }
      return;
    }
    if (message?.type !== "EH_ASSISTANT_SCAN") return;
    try {
      sendResponse({ ok: true, snapshot: extractSnapshot() });
    } catch (error) {
      sendResponse({ ok: false, error: error?.message || String(error) });
    }
  });

  // Exposes the pure, DOM-independent checks for tests/tests.html to exercise
  // directly. Only activates when the test harness sets this flag before
  // content.js loads, so the real EH page never creates this global.
  if (typeof window !== "undefined" && window.__EH_ASSISTANT_TEST__) {
    window.__ehAssistantInternal = {
      normalizedWords,
      isTitleCaseWord,
      titleChecks,
      languageChecks,
      descriptionChecks,
      majorContentChecks,
      classifySwatchLikelihood,
      colorSwatchColumnStatus,
      colorSwatchCheck,
      loadCandidateImage
    };
  }
})();
