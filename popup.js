const scanAllButton = document.getElementById("scanAll");
const stopScanButton = document.getElementById("stopScan");
const resumeScanButton = document.getElementById("resumeScan");
const autoScanCatalogueButton = document.getElementById("autoScanCatalogue");
const autoScanOrdersButton = document.getElementById("autoScanOrders");
const autoScanPricingButton = document.getElementById("autoScanPricing");
const auditProductButton = document.getElementById("auditProduct");
const optimizeProductButton = document.getElementById("optimizeProduct");
const optimizeStatusBox = document.getElementById("optimizeStatus");
const optimizeResultBox = document.getElementById("optimizeResult");
const aiSettingsToggle = document.getElementById("aiSettingsToggle");
const aiSettingsPanel = document.getElementById("aiSettingsPanel");
const aiProviderSelect = document.getElementById("aiProviderSelect");
const aiApiKeyInput = document.getElementById("aiApiKeyInput");
const aiModelSelect = document.getElementById("aiModelSelect");
const aiModelCustomField = document.getElementById("aiModelCustomField");
const aiModelCustomInput = document.getElementById("aiModelCustomInput");
const aiSettingsHint = document.getElementById("aiSettingsHint");
const copyButton = document.getElementById("copyReport");
const exportCsvButton = document.getElementById("exportCsv");
const clearButton = document.getElementById("clearToday");
const statusBox = document.getElementById("status");
const auditStatusBox = document.getElementById("auditStatus");
const summaryBox = document.getElementById("summary");
const auditResultBox = document.getElementById("auditResult");
const workspaceTabs = [...document.querySelectorAll("[data-workspace]")];
const workspaceTabsIndicator = document.querySelector(".workspace-tabs-indicator");
const todoWorkspace = document.getElementById("todoWorkspace");
const auditWorkspace = document.getElementById("auditWorkspace");
const optimizeWorkspace = document.getElementById("optimizeWorkspace");
const versionLabel = document.getElementById("versionLabel");
const merchantSearchInput = document.getElementById("merchantSearch");
const toggleSearchButton = document.getElementById("toggleSearch");
let summaryView = "todo";
let oneClickRunning = false;
let cancelRequested = false;
let currentSnapshots = [];
let currentSnapshotDateKey = "";
let yesterdaySnapshots = [];
let searchQuery = "";
const sortState = {};

versionLabel.textContent = `v${chrome.runtime.getManifest().version}`;

function checkCancelled() {
  if (cancelRequested) throw new Error("已停止巡检，进度已保存，可点击「继续巡检」从断点继续。");
}

// oneClickRunning tells us whether the caller is a standalone module scan or
// a step inside "一键巡检". A step must not reset/hide the shared cancel
// flag and stop button on its own way out -- scanAllButton owns those for
// the whole run and does so in its own finally block.
function beginScanning() {
  if (!oneClickRunning) cancelRequested = false;
  stopScanButton.hidden = false;
  stopScanButton.disabled = false;
  resumeScanButton.hidden = true;
}

function endScanning() {
  if (oneClickRunning) return;
  cancelRequested = false;
  stopScanButton.hidden = true;
  stopScanButton.disabled = true;
}

stopScanButton.addEventListener("click", () => {
  cancelRequested = true;
  stopScanButton.disabled = true;
  setStatus("正在停止巡检...");
});

// Resume support: after every Merchant a module scan completes, its progress
// (already-processed Merchants + accumulated rows) is checkpointed to
// storage under its own key -- separate from the final matrix snapshot, which
// is only written once a run finishes completely. This lets a scan
// interrupted partway (Stop button, a thrown error, closing the panel) pick
// back up from the same Merchant instead of restarting the whole module.
const MODULE_LABELS = { catalogue: "Catalogue", pricing: "Pricing", order: "Order" };

function progressStorageKey(module) {
  return `ehAssistant:progress:${module}`;
}

async function loadScanProgress(module) {
  const key = progressStorageKey(module);
  const result = await chrome.storage.local.get(key);
  return result[key] || null;
}

async function saveScanProgress(module, progress) {
  await chrome.storage.local.set({ [progressStorageKey(module)]: progress });
}

async function clearScanProgress(module) {
  await chrome.storage.local.remove(progressStorageKey(module));
}

async function refreshResumeAvailability() {
  for (const module of Object.keys(MODULE_LABELS)) {
    const progress = await loadScanProgress(module);
    if (progress) {
      resumeScanButton.hidden = false;
      resumeScanButton.disabled = false;
      resumeScanButton.dataset.module = module;
      const pageSuffix = progress.pageLabel ? ` / ${progress.pageLabel}` : "";
      resumeScanButton.textContent = `继续巡检（${MODULE_LABELS[module]}${pageSuffix} ${progress.nextMerchantIndex}/${progress.merchants.length}）`;
      return;
    }
  }
  resumeScanButton.hidden = true;
  delete resumeScanButton.dataset.module;
}

resumeScanButton.addEventListener("click", () => {
  const module = resumeScanButton.dataset.module;
  if (module === "catalogue") runCatalogueScan({ resume: true });
  else if (module === "order") runOrderScan({ resume: true });
  else if (module === "pricing") runPricingScan({ resume: true });
});

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function storageKey() {
  return `ehAssistant:${todayKey()}`;
}

function shiftedDateKey(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

async function loadYesterdaySnapshots() {
  const key = `ehAssistant:${shiftedDateKey(-1)}`;
  const result = await chrome.storage.local.get(key);
  yesterdaySnapshots = result[key] || [];
}

const MODULE_FIELDS = {
  catalogue_merchant_matrix: ["newProducts", "updatedToBeAudit", "syncFailure"],
  pricing_merchant_matrix: ["toBeUpdated", "pricingFailedUpdate", "costAudit"],
  order_merchant_matrix: ["awaitingFulfillment", "partiallyFulfilled", "canceled"]
};

function snapshotRows(snapshots, type) {
  return snapshots.find(snapshot => snapshot.type === type)?.rows || [];
}

function moduleTotal(rows, fields) {
  return rows.reduce((sum, row) => sum + fields.reduce((fieldSum, field) => fieldSum + Number(row[field] || 0), 0), 0);
}

function moduleTrendLabel(type, rows) {
  // yesterdaySnapshots is always literally "yesterday relative to right now",
  // so the comparison only makes sense while the displayed snapshots are
  // actually today's -- once refresh() has fallen back to an older day's
  // data (see findMostRecentSnapshots), "较昨日" would be comparing the
  // wrong pair of days and could show a misleading delta.
  if (currentSnapshotDateKey !== todayKey()) return "";
  const yesterdaySnapshot = yesterdaySnapshots.find(snapshot => snapshot.type === type);
  if (!yesterdaySnapshot) return "";
  const fields = MODULE_FIELDS[type];
  const delta = moduleTotal(rows, fields) - moduleTotal(yesterdaySnapshot.rows || [], fields);
  if (delta > 0) return `<span class="trend trend-up">▲ +${delta} 较昨日</span>`;
  if (delta < 0) return `<span class="trend trend-down">▼ ${delta} 较昨日</span>`;
  return `<span class="trend trend-flat">持平 较昨日</span>`;
}

function formatScanTime(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function latestScanTime(snapshots) {
  const timestamps = snapshots.map(snapshot => snapshot.scannedAt).filter(Boolean).sort();
  return timestamps.length ? formatScanTime(timestamps[timestamps.length - 1]) : "";
}

function setStatus(text) {
  statusBox.textContent = text;
}

function setAuditStatus(text) {
  auditStatusBox.textContent = text;
}

function setOptimizeStatus(text) {
  optimizeStatusBox.textContent = text;
}

// AI config (provider + API key + optional model override) lives in
// chrome.storage.local, same pattern as loadScanProgress/saveScanProgress.
// The key never leaves this machine except in the direct request background.js
// makes to the selected provider's own API.
const aiConfigStorageKey = "ehAssistant:aiConfig";

async function loadAiConfig() {
  const result = await chrome.storage.local.get(aiConfigStorageKey);
  return result[aiConfigStorageKey] || null;
}

async function saveAiConfig(config) {
  await chrome.storage.local.set({ [aiConfigStorageKey]: config });
}

// A short curated model list per provider so the settings panel can offer a
// dropdown instead of a free-text field. "" always means "let background.js
// use that provider's own default". A "custom" option is included on every
// provider since AI providers ship new model ids often enough that a fixed
// list here will eventually go stale -- picking "custom" reveals a plain
// text field for typing any model id directly.
const AI_PROVIDER_MODELS = {
  anthropic: [
    { value: "", label: "默认（claude-sonnet-5）" },
    { value: "claude-opus-5", label: "Claude Opus 5（最强，速度较慢/更贵）" },
    { value: "claude-sonnet-5", label: "Claude Sonnet 5（推荐，性价比均衡）" },
    { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5（最快最便宜）" },
    { value: "custom", label: "自定义..." }
  ],
  openai: [
    { value: "", label: "默认（gpt-4o-mini）" },
    { value: "gpt-5", label: "GPT-5（最强）" },
    { value: "gpt-5-mini", label: "GPT-5 Mini（性价比均衡）" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini（便宜稳定）" },
    { value: "custom", label: "自定义..." }
  ],
  deepseek: [
    { value: "", label: "默认（deepseek-chat）" },
    { value: "deepseek-chat", label: "DeepSeek Chat（V3，通用）" },
    { value: "deepseek-reasoner", label: "DeepSeek Reasoner（R1，推理增强，较慢）" },
    { value: "custom", label: "自定义..." }
  ],
  // Company-internal LiteLLM gateway. Confirmed 2026-09-20: both models are
  // reasoning models on this gateway's backend, but background.js sends
  // enable_thinking:false for every "company" request regardless of which
  // one is picked here, so v4-flash responds in ~2s instead of ~15s+ with
  // no quality loss -- that's the default now. "custom" stays as the escape
  // hatch for whenever the gateway team adds more models to this Key.
  company: [
    { value: "", label: "默认（JF Merchant Center Management-deepseek-v4-flash，快）" },
    { value: "JF Merchant Center Management-deepseek-v4-pro", label: "JF Merchant Center Management-deepseek-v4-pro（慢，Key 若只授权 flash 会 403）" },
    { value: "custom", label: "自定义..." }
  ]
};

const validAiProviders = new Set(Object.keys(AI_PROVIDER_MODELS));
const AI_PROVIDER_LABELS = { anthropic: "Anthropic", openai: "OpenAI", deepseek: "DeepSeek", company: "公司 AI 网关" };

// Rebuilds the Model dropdown for `provider` and selects `selectedModel`
// (falling back to the "custom" option + custom text field if it's not one
// of the known values -- covers both an explicitly typed custom model and a
// stale/newer id from a provider whose lineup moved on since this list was
// last updated).
function populateModelOptions(provider, selectedModel) {
  const options = AI_PROVIDER_MODELS[provider] || AI_PROVIDER_MODELS.anthropic;
  const knownValues = new Set(options.map(option => option.value).filter(value => value && value !== "custom"));
  const isCustom = !!selectedModel && !knownValues.has(selectedModel);
  aiModelSelect.innerHTML = options
    .map(option => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
    .join("");
  aiModelSelect.value = isCustom ? "custom" : (selectedModel || "");
  aiModelCustomField.hidden = aiModelSelect.value !== "custom";
  aiModelCustomInput.value = isCustom ? selectedModel : "";
}

function showAiSettingsHint(text, tone) {
  aiSettingsHint.textContent = text;
  aiSettingsHint.classList.toggle("saved", tone === "saved");
}

function currentModelValue() {
  return aiModelSelect.value === "custom" ? aiModelCustomInput.value.trim() : aiModelSelect.value;
}

// No explicit "保存" button: every field change either saves immediately or
// (when there's nothing valid to save yet) shows an inline hint saying so,
// so it's never ambiguous whether a change has taken effect.
async function maybeAutoSaveAiConfig() {
  const provider = validAiProviders.has(aiProviderSelect.value) ? aiProviderSelect.value : "anthropic";
  const apiKey = aiApiKeyInput.value.trim();
  const model = currentModelValue();
  if (!apiKey) {
    showAiSettingsHint(`请填写 ${AI_PROVIDER_LABELS[provider]} 的 API Key`, "muted");
    return;
  }
  if (aiModelSelect.value === "custom" && !model) {
    showAiSettingsHint("请填写自定义 Model ID", "muted");
    return;
  }
  await saveAiConfig({ provider, apiKey, model });
  showAiSettingsHint("已自动保存 ✓", "saved");
}

aiProviderSelect.addEventListener("change", () => {
  // Switching provider clears the key field rather than silently reusing
  // whatever was typed for the previous provider (which almost certainly
  // won't work against the new one) -- the hint then guides the next step.
  aiApiKeyInput.value = "";
  populateModelOptions(aiProviderSelect.value, "");
  showAiSettingsHint(`已切换到 ${AI_PROVIDER_LABELS[aiProviderSelect.value]}，请重新填写对应的 API Key（不同服务商的 Key 不通用，已自动清空）`, "muted");
});

aiApiKeyInput.addEventListener("change", () => {
  maybeAutoSaveAiConfig();
});

aiModelSelect.addEventListener("change", () => {
  aiModelCustomField.hidden = aiModelSelect.value !== "custom";
  if (aiModelSelect.value !== "custom") maybeAutoSaveAiConfig();
  else showAiSettingsHint("请填写自定义 Model ID", "muted");
});

aiModelCustomInput.addEventListener("change", () => {
  maybeAutoSaveAiConfig();
});

populateModelOptions("anthropic", "");

const WORKSPACE_PANELS = { todo: todoWorkspace, audit: auditWorkspace, optimize: optimizeWorkspace };

// Slides the pill indicator to sit exactly under the active tab button.
// Measuring the real button (offsetLeft/offsetWidth) instead of computing a
// position from the column count keeps this correct regardless of how many
// tabs there are or whether their widths ever stop being equal.
function updateWorkspaceIndicator(activeButton) {
  if (!workspaceTabsIndicator || !activeButton) return;
  workspaceTabsIndicator.style.width = `${activeButton.offsetWidth}px`;
  workspaceTabsIndicator.style.transform = `translateX(${activeButton.offsetLeft}px)`;
}

function setWorkspace(workspace) {
  const activeWorkspace = WORKSPACE_PANELS[workspace] ? workspace : "todo";
  Object.entries(WORKSPACE_PANELS).forEach(([name, panel]) => {
    panel.hidden = name !== activeWorkspace;
  });
  let activeButton = null;
  workspaceTabs.forEach(button => {
    const active = button.dataset.workspace === activeWorkspace;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
    if (active) activeButton = button;
  });
  updateWorkspaceIndicator(activeButton);
  localStorage.setItem("ehAssistantWorkspace", activeWorkspace);
}

workspaceTabs.forEach(button => {
  button.addEventListener("click", () => setWorkspace(button.dataset.workspace));
});

// The panel's width can change (side panel resized, or the same layout
// opened wider in a tab) without any workspace switch happening, which
// would leave the pill sized/positioned for the old width.
window.addEventListener("resize", () => {
  updateWorkspaceIndicator(workspaceTabs.find(button => button.classList.contains("active")));
});

function auditTone(status) {
  if (status === "attention") return { label: "需要关注", className: "attention" };
  if (status === "manual") return { label: "人工查看", className: "manual" };
  return { label: "通过", className: "pass" };
}

function renderProductAudit(result) {
  const checks = result?.checks || [];
  const attentionCount = checks.filter(item => item.status === "attention").length;
  const manualCount = checks.filter(item => item.status === "manual").length;
  auditResultBox.hidden = false;
  auditResultBox.innerHTML = `
    <div class="audit-result-head">
      <div>
        <h2>商品审核结果</h2>
        <div class="audit-product-title">${escapeHtml(result?.product?.title || "当前商品")}</div>
      </div>
      <span class="audit-overall ${attentionCount ? "attention" : manualCount ? "manual" : "pass"}">
        ${attentionCount ? `${attentionCount} 项需关注` : manualCount ? `${manualCount} 项需查看` : "检查通过"}
      </span>
    </div>
    <div class="audit-checks">
      ${checks.map(check => {
        const tone = auditTone(check.status);
        return `
          <div class="audit-check ${tone.className}">
            <div class="audit-check-head">
              <strong>${escapeHtml(check.label)}</strong>
              <span>${tone.label}</span>
            </div>
            <div class="audit-check-detail">${escapeHtml(check.detail)}</div>
          </div>
        `;
      }).join("")}
    </div>
    <div class="audit-note">辅助结果仅用于提示，最终由运营人员判断。插件不会点击 Approved 或 Rejected。</div>
  `;
}

function captureVisibleTab(windowId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(windowId, { format: "png" }, dataUrl => {
      if (chrome.runtime.lastError || !dataUrl) {
        reject(new Error(chrome.runtime.lastError?.message || "无法截取当前页面"));
        return;
      }
      resolve(dataUrl);
    });
  });
}

function loadDataUrlImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("页面截图加载失败"));
    image.src = dataUrl;
  });
}

function classifyScreenshotPixels(data, width, height) {
  const classified = window.EHAssistantBackgroundClassifier.classifyBackgroundPixels(data, width, height);
  if (classified.code === "no_pixels") return { status: "manual", code: "screenshot_failed", detail: "截图区域没有可分析像素" };
  if (classified.code === "transparent") return { status: "manual", code: "transparent", detail: "图片含透明背景，需人工确认页面呈现颜色" };
  if (classified.code === "scene") return { status: "pass", code: "scene", detail: "从页面截图识别为场景图或信息图，背景色规则豁免" };
  return classified.code === "gray_pass"
    ? { status: "pass", code: "gray_pass", detail: `从页面截图读取，背景约为 ${classified.color}` }
    : { status: "attention", code: "color_mismatch", detail: `从页面截图读取，背景约为 ${classified.color}，与 #E8E8E8 差异较明显` };
}

async function resolveMediaByScreenshot(tab, result) {
  const checkIndex = (result.checks || []).findIndex(check => check.label === "图片背景");
  if (checkIndex < 0) return result;
  const mediaCheck = result.checks[checkIndex];
  const unresolvedCodes = new Set(["pixel_blocked", "load_failed", "pixel_unavailable"]);
  if (!(mediaCheck.imageResults || []).some(item => item.status === "manual" && unresolvedCodes.has(item.code))) return result;

  setAuditStatus("图片源限制像素读取，正在改用当前页面截图检查背景...");
  let updatedResults = mediaCheck.imageResults.map(item => ({ ...item }));
  try {
    const dataUrl = await captureVisibleTab(tab.windowId);
    const screenshot = await loadDataUrlImage(dataUrl);
    const viewport = mediaCheck.viewport || {};
    const scaleX = screenshot.naturalWidth / Math.max(1, viewport.width || screenshot.naturalWidth);
    const scaleY = screenshot.naturalHeight / Math.max(1, viewport.height || screenshot.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = screenshot.naturalWidth;
    canvas.height = screenshot.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(screenshot, 0, 0);

    updatedResults = updatedResults.map(item => {
      if (item.status !== "manual" || !unresolvedCodes.has(item.code)) return item;
      const rect = item.rect || {};
      const fullyVisible = rect.left >= 0 && rect.top >= 0 &&
        rect.left + rect.width <= (viewport.width || 0) &&
        rect.top + rect.height <= (viewport.height || 0);
      if (!fullyVisible || rect.width < 20 || rect.height < 20) {
        return { ...item, code: "outside_viewport", detail: "图片不在当前页面截图的可见区域" };
      }
      const inset = Math.min(3, rect.width * 0.04, rect.height * 0.04);
      const x = Math.max(0, Math.round((rect.left + inset) * scaleX));
      const y = Math.max(0, Math.round((rect.top + inset) * scaleY));
      const width = Math.min(canvas.width - x, Math.max(1, Math.round((rect.width - inset * 2) * scaleX)));
      const height = Math.min(canvas.height - y, Math.max(1, Math.round((rect.height - inset * 2) * scaleY)));
      if (width < 10 || height < 10) return { ...item, code: "screenshot_failed", detail: "截图中的图片区域过小" };
      try {
        return { ...item, ...classifyScreenshotPixels(context.getImageData(x, y, width, height).data, width, height) };
      } catch (error) {
        return { ...item, status: "manual", code: "screenshot_failed", detail: `截图像素分析失败：${error?.message || error}` };
      }
    });
  } catch (error) {
    updatedResults = updatedResults.map(item => unresolvedCodes.has(item.code)
      ? { ...item, code: "screenshot_failed", detail: `${item.detail}；页面截图备用方案失败：${error?.message || error}` }
      : item);
  }

  const summary = await sendContentMessage(tab.id, {
    type: "EH_ASSISTANT_SUMMARIZE_MEDIA_RESULTS",
    results: updatedResults
  });
  const replacement = summary?.ok ? { label: "图片背景", ...summary.check } : mediaCheck;
  return { ...result, checks: result.checks.map((check, index) => index === checkIndex ? replacement : check) };
}

async function getSnapshots() {
  const key = storageKey();
  const result = await chrome.storage.local.get(key);
  return result[key] || [];
}

// Each day's scans live under their own storageKey(), so once the calendar
// date rolls over, today's key starts out empty even though nothing was
// actually lost -- it's still sitting under yesterday's (or an earlier) key.
// Walks backward day by day (bounded so a long-unused install doesn't scan
// forever) until it finds a non-empty day to show as a fallback.
async function findMostRecentSnapshots(maxDaysBack = 7) {
  for (let offset = 1; offset <= maxDaysBack; offset += 1) {
    const dateKey = shiftedDateKey(-offset);
    const key = `ehAssistant:${dateKey}`;
    const result = await chrome.storage.local.get(key);
    const snapshots = result[key] || [];
    if (snapshots.length) return { snapshots, dateKey };
  }
  return null;
}

async function saveSnapshot(snapshot) {
  const key = storageKey();
  const snapshots = await getSnapshots();
  const filtered = snapshots.filter(item => item.key !== snapshot.key || item.tab !== snapshot.tab || item.url !== snapshot.url);
  filtered.push(snapshot);
  await chrome.storage.local.set({ [key]: filtered });
  return filtered;
}

function buildMerchantTodoMatrix(snapshots) {
  const matrix = {};
  snapshots.forEach(snapshot => {
    if (snapshot.type === "catalogue_merchant_matrix") {
      snapshot.rows.forEach(row => {
        matrix[row.merchant] = matrix[row.merchant] || {};
        matrix[row.merchant]["New Products"] = row.newProducts || 0;
        matrix[row.merchant]["Updated to be Audit"] = row.updatedToBeAudit || 0;
        matrix[row.merchant]["Sync Failure"] = row.syncFailure || 0;
      });
      return;
    }
    const todoType = snapshot.todoType || snapshot.tab || snapshot.label;
    const merchantFilterCounts = snapshot.merchantFilterCounts || {};
    if (Object.keys(merchantFilterCounts).length) {
      Object.entries(merchantFilterCounts).forEach(([merchant, count]) => {
        matrix[merchant] = matrix[merchant] || {};
        matrix[merchant][todoType] = (matrix[merchant][todoType] || 0) + count;
      });
      return;
    }
    const rows = snapshot.rowSummaries || [];
    if (rows.length) {
      rows.forEach(row => {
        const merchant = row.merchant || "Unknown";
        matrix[merchant] = matrix[merchant] || {};
        matrix[merchant][todoType] = (matrix[merchant][todoType] || 0) + 1;
      });
      return;
    }
    Object.entries(snapshot.merchantCounts || {}).forEach(([merchant, count]) => {
      matrix[merchant] = matrix[merchant] || {};
      matrix[merchant][todoType] = (matrix[merchant][todoType] || 0) + count;
    });
  });
  return matrix;
}

function formatMerchantMatrix(matrix) {
  const merchants = Object.keys(matrix).sort();
  if (!merchants.length) return ["- 当前记录未读取到 Merchant / Brand 列。"];
  return merchants.map(merchant => {
    const parts = Object.entries(matrix[merchant])
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([type, count]) => `${type}: ${count}`)
      .join("；");
    return `- ${merchant}: ${parts}`;
  });
}

function formatMatrixTable(rows) {
  if (!rows?.length) return ["| Merchant | New Product | Updated to be Audit | Sync Failure |", "|---|---:|---:|---:|"];
  const lines = ["| Merchant | New Product | Updated to be Audit | Sync Failure |", "|---|---:|---:|---:|"];
  rows.forEach(row => {
    lines.push(`| ${row.merchant} | ${row.newProducts || 0} | ${row.updatedToBeAudit || 0} | ${row.syncFailure || 0} |`);
  });
  return lines;
}

function formatOrderMatrixTable(rows) {
  const lines = ["| Merchant | Awaiting Fulfillment | Partially Fulfilled | Canceled |", "|---|---:|---:|---:|"];
  (rows || []).forEach(row => {
    lines.push(`| ${row.merchant} | ${row.awaitingFulfillment || 0} | ${row.partiallyFulfilled || 0} | ${row.canceled || 0} |`);
  });
  return lines;
}

function formatPricingMatrixTable(rows) {
  const lines = ["| Merchant | To be Updated | Pricing Failed Update | Cost Audit |", "|---|---:|---:|---:|"];
  (rows || []).forEach(row => {
    lines.push(`| ${row.merchant} | ${row.toBeUpdated || 0} | ${row.pricingFailedUpdate || 0} | ${row.costAudit || 0} |`);
  });
  return lines;
}

function sectionNumber(value) {
  return ["", "一", "二", "三", "四", "五", "六"][value] || String(value);
}

function formatCounts(counts) {
  const entries = Object.entries(counts || {});
  if (!entries.length) return "无";
  return entries.map(([key, value]) => `${key}: ${value}`).join("；");
}

function pageLine(snapshot) {
  const tab = snapshot.tab ? ` / ${snapshot.tab}` : "";
  const merchantCount = Object.keys(snapshot.merchantFilterCounts || snapshot.merchantCounts || {}).length;
  return `${snapshot.label}${tab}: ${merchantCount} 个 merchant`;
}

const TABLE_COLUMNS = {
  catalogue: [
    { key: "merchant", label: "Merchant" },
    { key: "newProducts", label: "New Product" },
    { key: "updatedToBeAudit", label: "Updated Audit" },
    { key: "syncFailure", label: "Sync Failure" }
  ],
  pricing: [
    { key: "merchant", label: "Merchant" },
    { key: "toBeUpdated", label: "To be Updated" },
    { key: "pricingFailedUpdate", label: "Pricing Failed Update" },
    { key: "costAudit", label: "Cost Audit" }
  ],
  order: [
    { key: "merchant", label: "Merchant" },
    { key: "awaitingFulfillment", label: "Awaiting Fulfillment" },
    { key: "partiallyFulfilled", label: "Partially Fulfilled" },
    { key: "canceled", label: "Canceled" }
  ]
};

function metricCell(value) {
  const count = Number(value ?? 0);
  return count > 0
    ? `<td class="metric-cell"><span class="metric-badge">${escapeHtml(String(count))}</span></td>`
    : `<td class="metric-cell metric-zero">${escapeHtml(String(count))}</td>`;
}

function applySearch(rows) {
  const query = searchQuery.trim().toLowerCase();
  if (!query) return rows;
  return rows.filter(row => (row.merchant || "").toLowerCase().includes(query));
}

function sortRows(rows, sort) {
  if (!sort?.col) return rows;
  return [...rows].sort((a, b) => {
    const comparison = sort.col === "merchant"
      ? String(a.merchant || "").localeCompare(String(b.merchant || ""))
      : Number(a[sort.col] || 0) - Number(b[sort.col] || 0);
    return comparison * sort.dir;
  });
}

function sortIndicator(tableKey, colKey) {
  const sort = sortState[tableKey];
  if (!sort || sort.col !== colKey) return "";
  return sort.dir === 1 ? " ▲" : " ▼";
}

function renderMerchantMatrixTable(tableKey, extraClass, rows) {
  const columns = TABLE_COLUMNS[tableKey];
  const sortedRows = sortRows(rows, sortState[tableKey]);
  return `
    <div class="matrix-wrap">
      <table class="matrix-table ${extraClass}">
        <colgroup>
          <col class="merchant-col" />
          ${columns.slice(1).map(() => "<col />").join("")}
        </colgroup>
        <thead>
          <tr>
            ${columns.map(column => `
              <th class="sortable-th" data-table="${tableKey}" data-col="${column.key}">${escapeHtml(column.label)}${sortIndicator(tableKey, column.key)}</th>
            `).join("")}
          </tr>
        </thead>
        <tbody>
          ${sortedRows.map(row => `
            <tr>
              <td class="merchant-cell" title="${escapeHtml(row.merchant)}">${escapeHtml(row.merchant)}</td>
              ${columns.slice(1).map(column => metricCell(row[column.key])).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function buildReport(snapshots) {
  const catalogueSnapshot = snapshots.find(snapshot => snapshot.type === "catalogue_merchant_matrix");
  const orderSnapshot = snapshots.find(snapshot => snapshot.type === "order_merchant_matrix");
  const pricingSnapshot = snapshots.find(snapshot => snapshot.type === "pricing_merchant_matrix");
  const catalogueRows = (catalogueSnapshot?.rows || []).filter(row =>
    Number(row.newProducts || 0) > 0 ||
    Number(row.updatedToBeAudit || 0) > 0 ||
    Number(row.syncFailure || 0) > 0
  );
  const orderRows = (orderSnapshot?.rows || []).filter(row =>
    Number(row.awaitingFulfillment || 0) > 0 ||
    Number(row.partiallyFulfilled || 0) > 0 ||
    Number(row.canceled || 0) > 0
  );
  const pricingRows = (pricingSnapshot?.rows || []).filter(row =>
    Number(row.toBeUpdated || 0) > 0 ||
    Number(row.pricingFailedUpdate || 0) > 0 ||
    Number(row.costAudit || 0) > 0
  );
  const lines = [`EH 每日待办统计（${todayKey()}）`];
  const totalTodoMerchants = catalogueRows.length + orderRows.length + pricingRows.length;
  if (!totalTodoMerchants) return `${lines[0]}\n\n当前暂无待办数据。`;

  let section = 1;
  if (catalogueRows.length) {
    lines.push("", `${sectionNumber(section)}、Catalogue Merchant 待办`);
    lines.push(...formatMatrixTable(catalogueRows));
    section += 1;
  }
  if (pricingRows.length) {
    lines.push("", `${sectionNumber(section)}、Pricing Merchant 待办`);
    lines.push(...formatPricingMatrixTable(pricingRows));
    section += 1;
  }
  if (orderRows.length) {
    lines.push("", `${sectionNumber(section)}、Order Merchant 待办`);
    lines.push(...formatOrderMatrixTable(orderRows));
  }
  return lines.join("\n");
}

function csvEscapeField(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvTable(rows, columns) {
  const header = columns.map(column => csvEscapeField(column.label)).join(",");
  const body = rows.map(row => columns.map(column => csvEscapeField(row[column.key] ?? 0)).join(","));
  return [header, ...body].join("\r\n");
}

function buildCsv(snapshots) {
  const sections = [];
  const catalogueRows = snapshotRows(snapshots, "catalogue_merchant_matrix");
  const pricingRows = snapshotRows(snapshots, "pricing_merchant_matrix");
  const orderRows = snapshotRows(snapshots, "order_merchant_matrix");
  if (catalogueRows.length) sections.push(`Catalogue Merchant 待办\r\n${csvTable(catalogueRows, TABLE_COLUMNS.catalogue)}`);
  if (pricingRows.length) sections.push(`Pricing Merchant 待办\r\n${csvTable(pricingRows, TABLE_COLUMNS.pricing)}`);
  if (orderRows.length) sections.push(`Order Merchant 待办\r\n${csvTable(orderRows, TABLE_COLUMNS.order)}`);
  return sections.join("\r\n\r\n");
}

function downloadTextFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function render(snapshots, dateKey) {
  currentSnapshots = snapshots;
  // dateKey is only passed by refresh() when it just loaded a specific day's
  // data; re-renders triggered from within renderInner itself (sort, search,
  // 待办/汇总 toggle) call render(currentSnapshots) with no dateKey and must
  // keep showing whichever day was already loaded, not silently jump back to
  // today.
  if (dateKey) currentSnapshotDateKey = dateKey;
  else if (!currentSnapshotDateKey) currentSnapshotDateKey = todayKey();
  try {
    renderInner(snapshots);
  } catch (error) {
    console.error("EH Assistant render failed", error);
    summaryBox.innerHTML = `<div class="empty">渲染汇总数据时出错，请清空记录后重新扫描；如果反复出现，请联系维护者。</div>`;
  }
}

function renderInner(snapshots) {
  summaryBox.innerHTML = "";

  if (!snapshots.length) {
    summaryBox.innerHTML = `<div class="empty">今天还没有扫描记录，最近几天内也没有找到过往记录。</div>`;
    return;
  }

  const matrixSnapshot = snapshots.find(snapshot => snapshot.type === "catalogue_merchant_matrix");
  const orderMatrixSnapshot = snapshots.find(snapshot => snapshot.type === "order_merchant_matrix");
  const pricingMatrixSnapshot = snapshots.find(snapshot => snapshot.type === "pricing_merchant_matrix");
  const allMatrixRows = matrixSnapshot?.rows || [];
  const todoMatrixRows = allMatrixRows.filter(row =>
    Number(row.newProducts || 0) > 0 ||
    Number(row.updatedToBeAudit || 0) > 0 ||
    Number(row.syncFailure || 0) > 0
  );
  const displayedMatrixRows = applySearch(summaryView === "todo" ? todoMatrixRows : allMatrixRows);
  const allOrderRows = orderMatrixSnapshot?.rows || [];
  const todoOrderRows = allOrderRows.filter(row =>
    Number(row.awaitingFulfillment || 0) > 0 ||
    Number(row.partiallyFulfilled || 0) > 0 ||
    Number(row.canceled || 0) > 0
  );
  const displayedOrderRows = applySearch(summaryView === "todo" ? todoOrderRows : allOrderRows);
  const allPricingRows = pricingMatrixSnapshot?.rows || [];
  const todoPricingRows = allPricingRows.filter(row =>
    Number(row.toBeUpdated || 0) > 0 ||
    Number(row.pricingFailedUpdate || 0) > 0 ||
    Number(row.costAudit || 0) > 0
  );
  const displayedPricingRows = applySearch(summaryView === "todo" ? todoPricingRows : allPricingRows);
  const matrixLines = formatMerchantMatrix(buildMerchantTodoMatrix(snapshots));
  const hasMatrix = !!matrixSnapshot || !!orderMatrixSnapshot || !!pricingMatrixSnapshot;
  const searchActive = !!searchQuery.trim();
  const emptyMessage = moduleName => searchActive
    ? `<div class="empty table-empty">没有匹配的 ${moduleName} Merchant。</div>`
    : `<div class="empty table-empty">当前没有需要关注的 ${moduleName} Merchant。</div>`;
  const matrixSections = [
    matrixSnapshot ? `
      <div class="matrix-section-title-row">
        <span class="matrix-section-title">Catalogue Merchant 待办</span>
        ${moduleTrendLabel("catalogue_merchant_matrix", allMatrixRows)}
      </div>
      ${displayedMatrixRows.length
        ? renderMerchantMatrixTable("catalogue", "", displayedMatrixRows)
        : emptyMessage("Catalogue")}
    ` : "",
    pricingMatrixSnapshot ? `
      <div class="matrix-section-title-row">
        <span class="matrix-section-title">Pricing Merchant 待办</span>
        ${moduleTrendLabel("pricing_merchant_matrix", allPricingRows)}
      </div>
      ${displayedPricingRows.length
        ? renderMerchantMatrixTable("pricing", "pricing-matrix", displayedPricingRows)
        : emptyMessage("Pricing")}
    ` : "",
    orderMatrixSnapshot ? `
      <div class="matrix-section-title-row">
        <span class="matrix-section-title">Order Merchant 待办</span>
        ${moduleTrendLabel("order_merchant_matrix", allOrderRows)}
      </div>
      ${displayedOrderRows.length
        ? renderMerchantMatrixTable("order", "order-matrix", displayedOrderRows)
        : emptyMessage("Order")}
    ` : ""
  ].join("");
  const scanTime = latestScanTime(snapshots);
  summaryBox.innerHTML = `
    <div class="card">
      <div class="card-title"><span>${currentSnapshotDateKey} 汇总</span><span>${snapshots.length} 项</span></div>
      ${scanTime ? `<div class="meta">最后更新 ${scanTime}</div>` : ""}
      ${hasMatrix ? `
        <div class="summary-filter" role="group" aria-label="汇总数据筛选">
          <button type="button" data-summary-view="todo" class="${summaryView === "todo" ? "active" : ""}" aria-pressed="${summaryView === "todo"}">待办数据</button>
          <button type="button" data-summary-view="all" class="${summaryView === "all" ? "active" : ""}" aria-pressed="${summaryView === "all"}">汇总数据</button>
        </div>
      ` : ""}
      ${hasMatrix
        ? matrixSections
        : `<div class="line"><strong>Merchant 维度</strong></div>${matrixLines.map(line => `<div class="line">${escapeHtml(line.replace(/^- /, ""))}</div>`).join("")}`}
    </div>
  `;

  summaryBox.querySelectorAll("[data-summary-view]").forEach(button => {
    button.addEventListener("click", () => {
      summaryView = button.dataset.summaryView;
      render(currentSnapshots);
    });
  });

  summaryBox.querySelectorAll(".sortable-th").forEach(th => {
    th.addEventListener("click", () => {
      const tableKey = th.dataset.table;
      const col = th.dataset.col;
      const current = sortState[tableKey];
      const dir = current && current.col === col ? -current.dir : 1;
      sortState[tableKey] = { col, dir };
      render(currentSnapshots);
    });
  });
}

function waitForTabComplete(tabId) {
  return new Promise(resolve => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 12000);
    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 900);
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sendContentMessage(tabId, message) {
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tabId, message, response => {
      if (chrome.runtime.lastError) resolve(null);
      else resolve(response || null);
    });
  });
}

async function askContent(tabId, message) {
  const response = await sendContentMessage(tabId, message);
  return response?.ok ? response : null;
}

async function askContentWithInjection(tabId, message) {
  let response = await sendContentMessage(tabId, message);
  if (response) return response;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["shared/background-classifier.js", "content.js"]
    });
    await delay(250);
    response = await sendContentMessage(tabId, message);
    return response;
  } catch (_error) {
    return null;
  }
}

async function waitForEhDataReady(tabId, label) {
  let lastReadiness = null;
  let stableHits = 0;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    checkCancelled();
    const response = await askContent(tabId, { type: "EH_ASSISTANT_READY" });
    const readiness = response?.readiness;
    if (readiness) {
      const signature = `${readiness.rowCount}:${readiness.total}:${readiness.hasNoData}:${readiness.loading}`;
      const lastSignature = lastReadiness
        ? `${lastReadiness.rowCount}:${lastReadiness.total}:${lastReadiness.hasNoData}:${lastReadiness.loading}`
        : "";
      stableHits = signature === lastSignature ? stableHits + 1 : 0;
      lastReadiness = readiness;
      if (readiness.ready && stableHits >= 1) return readiness;
      setStatus(`等待 ${label} 数据加载... 行数 ${readiness.rowCount}，总数 ${readiness.total ?? "读取中"}`);
    } else {
      setStatus(`等待 ${label} 页面脚本加载...`);
    }
    await delay(1000);
  }
  return lastReadiness;
}

async function scanActiveTab(tabId) {
  const response = await askContent(tabId, { type: "EH_ASSISTANT_SCAN" });
  return response?.snapshot || null;
}

async function listMerchants(tabId) {
  const response = await askContent(tabId, { type: "EH_ASSISTANT_LIST_MERCHANTS" });
  return response?.result?.merchants || [];
}

async function selectMerchant(tabId, merchant) {
  const response = await askContent(tabId, { type: "EH_ASSISTANT_SELECT_MERCHANT", merchant });
  return !!response?.result?.selected;
}

async function currentRowCount(tabId) {
  const response = await askContent(tabId, { type: "EH_ASSISTANT_ROW_COUNT" });
  return Number(response?.count || 0);
}

async function goFirstPage(tabId) {
  const response = await askContent(tabId, { type: "EH_ASSISTANT_FIRST_PAGE" });
  return !!response?.clicked;
}

async function goNextPage(tabId) {
  const response = await askContent(tabId, { type: "EH_ASSISTANT_NEXT_PAGE" });
  return !!response?.clicked;
}

async function clickCatalogueTab(tabId, label) {
  const response = await askContent(tabId, { type: "EH_ASSISTANT_CLICK_CATALOGUE_TAB", label });
  return !!response?.clicked;
}

async function waitForActiveStatusTab(tabId, label) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const response = await askContent(tabId, { type: "EH_ASSISTANT_ACTIVE_STATUS_TAB" });
    if (response?.label === label) return true;
    await delay(250);
  }
  return false;
}

async function openEhPage(tabId, url, label) {
  const current = await chrome.tabs.get(tabId);
  const completed = waitForTabComplete(tabId);
  if (current.url === url) {
    await chrome.tabs.reload(tabId);
  } else {
    await chrome.tabs.update(tabId, { url });
  }
  await completed;
  return waitForEhDataReady(tabId, label);
}

async function waitForPath(tabId, pathname) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const current = await chrome.tabs.get(tabId);
    try {
      if (new URL(current.url).pathname === pathname) return true;
    } catch (_error) {
      // Keep waiting while Chrome reports an intermediate navigation URL.
    }
    await delay(250);
  }
  return false;
}

async function countCurrentMerchantTabRows(tabId, label) {
  const readiness = await waitForEhDataReady(tabId, label);
  // EH already exposes the count for every page in the pagination footer.
  // It includes every page, so it is both faster and more reliable than
  // adding only the rows currently rendered by its virtualised table.
  if (readiness?.hasNoData) return 0;
  if (Number.isFinite(readiness?.total)) return readiness.total;

  // Keep a row-by-row fallback only for an unexpected page without a footer.
  await goFirstPage(tabId);
  await waitForEhDataReady(tabId, `${label} 第 1 页`);
  let total = 0;
  const seen = new Set();
  for (let page = 1; page <= 50; page += 1) {
    await waitForEhDataReady(tabId, `${label} 第 ${page} 页`);
    const snapshot = await scanActiveTab(tabId);
    const url = snapshot?.url || "";
    const signature = `${url}|${snapshot?.visibleRows ?? ""}|${snapshot?.rowSummaries?.map(row => row.product).join("~") || ""}`;
    if (seen.has(signature)) break;
    seen.add(signature);
    total += await currentRowCount(tabId);
    const moved = await goNextPage(tabId);
    if (!moved) break;
    await delay(900);
  }
  return total;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

async function refresh() {
  const snapshots = await getSnapshots();
  if (snapshots.length) {
    render(snapshots, todayKey());
    return;
  }
  const fallback = await findMostRecentSnapshots();
  if (fallback) {
    render(fallback.snapshots, fallback.dateKey);
    setStatus(`今天还没有巡检记录，正在显示 ${fallback.dateKey} 的最近一次结果，建议重新运行一键巡检。`);
    return;
  }
  render([], todayKey());
}

async function snapshotTimestamp(key) {
  return (await getSnapshots()).find(snapshot => snapshot.key === key)?.scannedAt || "";
}

async function runScanButtonAndWait(button, snapshotKey, label) {
  const previousTimestamp = await snapshotTimestamp(snapshotKey);
  button.click();

  let started = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (button.disabled) {
      started = true;
      break;
    }
    await delay(100);
  }
  if (!started) throw new Error(`${label} 未能启动。`);

  for (let attempt = 0; attempt < 14400; attempt += 1) {
    if (!button.disabled) {
      const nextTimestamp = await snapshotTimestamp(snapshotKey);
      if (nextTimestamp && nextTimestamp !== previousTimestamp) return;
      throw new Error(statusBox.textContent || `${label} 未生成新的扫描结果。`);
    }
    await delay(250);
  }
  throw new Error(`${label} 扫描超时，已停止一键巡检。`);
}

scanAllButton.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https:\/\/admin\.engagehub\.tsostech\.com\//.test(tab.url || "")) {
    setStatus("请先打开任意运营端 EH 页面。");
    return;
  }

  beginScanning();
  oneClickRunning = true;
  scanAllButton.disabled = true;
  const jobs = [
    {
      label: "Catalogue",
      url: "https://admin.engagehub.tsostech.com/catalogue?tab=ALL&page=1&page_size=20&channel=1&search_field=model",
      button: autoScanCatalogueButton,
      snapshotKey: "admin_catalogue_merchant_matrix"
    },
    {
      label: "Pricing",
      url: "https://admin.engagehub.tsostech.com/pricing",
      button: autoScanPricingButton,
      snapshotKey: "admin_pricing_merchant_matrix"
    },
    {
      label: "Order",
      url: "https://admin.engagehub.tsostech.com/order-list",
      button: autoScanOrdersButton,
      snapshotKey: "admin_order_merchant_matrix"
    }
  ];

  try {
    for (let index = 0; index < jobs.length; index += 1) {
      checkCancelled();
      const job = jobs[index];
      setStatus(`一键巡检 ${index + 1}/${jobs.length}：正在准备 ${job.label}...`);
      await openEhPage(tab.id, job.url, job.label);
      await runScanButtonAndWait(job.button, job.snapshotKey, job.label);
      await refresh();
    }
    setStatus("一键巡检完成：Catalogue、Pricing、Order 均已更新。");
  } catch (error) {
    setStatus(error?.message || "一键巡检失败，已停止。");
  } finally {
    oneClickRunning = false;
    scanAllButton.disabled = false;
    autoScanCatalogueButton.disabled = false;
    autoScanPricingButton.disabled = false;
    autoScanOrdersButton.disabled = false;
    endScanning();
  }
});

async function runCatalogueScan({ resume } = {}) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/https:\/\/admin\.engagehub\.tsostech\.com\/catalogue/.test(tab.url || "")) {
    setStatus("请先打开运营端 Catalogue 页面。");
    return;
  }

  beginScanning();
  autoScanCatalogueButton.disabled = true;
  autoScanOrdersButton.disabled = true;
  autoScanPricingButton.disabled = true;
  scanAllButton.disabled = true;
  const tabConfigs = [
    { value: "NEW_PRODUCTS", label: "New Products" },
    { value: "UPDATED_TO_BE_AUDIT", label: "Updated to be Audit" },
    { value: "SYNC_FAILURE", label: "Sync Failure" }
  ];

  const existingProgress = resume ? await loadScanProgress("catalogue") : null;
  const combinedSnapshots = [];
  try {
    // Reloading guarantees the active EH tab receives the same content-script
    // version as this popup after the unpacked extension has been refreshed.
    setStatus(existingProgress ? "正在恢复 Catalogue 巡检..." : "正在准备 EH 页面...");
    await chrome.tabs.reload(tab.id);
    await waitForTabComplete(tab.id);
    await waitForEhDataReady(tab.id, "Catalogue");

    let merchants;
    let rows;
    let startIndex;
    if (existingProgress) {
      merchants = existingProgress.merchants;
      rows = existingProgress.rows;
      startIndex = existingProgress.nextMerchantIndex;
      setStatus(`已恢复进度：${startIndex}/${merchants.length} 个 Merchant，继续扫描...`);
    } else {
      await clearScanProgress("catalogue");
      // Opening Merchant only reads its selectable names. No count is ever read
      // from All; each merchant is counted only after New Products is selected.
      setStatus("正在打开 Merchant 列表...");
      merchants = await listMerchants(tab.id);
      merchants = [...new Set(merchants)].filter(Boolean);
      if (!merchants.length) {
        setStatus("没有读取到 Merchant 列表，请确认 Merchant 筛选可打开。");
        return;
      }
      setStatus(`已读取 ${merchants.length} 个 Merchant，开始逐个扫描...`);
      await delay(500);
      rows = [];
      startIndex = 0;
      // Checkpoint immediately, before the first Merchant even starts -- if
      // the panel gets interrupted (e.g. Chrome suspends a hidden side panel
      // after the window loses focus for a while) before Merchant 1 finishes,
      // there would otherwise be nothing saved yet for "继续巡检" to resume.
      await saveScanProgress("catalogue", { merchants, nextMerchantIndex: startIndex, rows });
    }

    for (let merchantIndex = startIndex; merchantIndex < merchants.length; merchantIndex += 1) {
      checkCancelled();
      const merchant = merchants[merchantIndex];
      setStatus(`正在选择 Merchant ${merchantIndex + 1}/${merchants.length}: ${merchant}`);
      let selected = false;
      for (let attempt = 0; attempt < 3 && !selected; attempt += 1) {
        selected = await selectMerchant(tab.id, merchant);
        if (!selected) await delay(500);
      }
      if (!selected) {
        throw new Error(`无法选择 Merchant：${merchant}，扫描已停止。`);
      }

      const row = { merchant, newProducts: 0, updatedToBeAudit: 0, syncFailure: 0 };
      for (const tabConfig of tabConfigs) {
        setStatus(`正在统计 ${merchant} / ${tabConfig.label}...`);
        let clicked = false;
        for (let attempt = 0; attempt < 3 && !clicked; attempt += 1) {
          clicked = await clickCatalogueTab(tab.id, tabConfig.label);
          if (!clicked) await delay(350);
        }
        if (!clicked) {
          throw new Error(`无法点击 ${tabConfig.label}，扫描已停止，Merchant 筛选未刷新。`);
        }
        if (!await waitForActiveStatusTab(tab.id, tabConfig.label)) {
          throw new Error(`${tabConfig.label} 未完成切换，扫描已停止。`);
        }
        await waitForEhDataReady(tab.id, `${merchant} / ${tabConfig.label}`);
        const count = await countCurrentMerchantTabRows(tab.id, `${merchant} / ${tabConfig.label}`);
        if (tabConfig.value === "NEW_PRODUCTS") row.newProducts = count;
        if (tabConfig.value === "UPDATED_TO_BE_AUDIT") row.updatedToBeAudit = count;
        if (tabConfig.value === "SYNC_FAILURE") row.syncFailure = count;
      }
      rows.push(row);
      await saveScanProgress("catalogue", { merchants, nextMerchantIndex: merchantIndex + 1, rows });
    }

    combinedSnapshots.push({
      type: "catalogue_merchant_matrix",
      key: "admin_catalogue_merchant_matrix",
      label: "运营端 Catalogue Merchant 待办",
      scannedAt: new Date().toISOString(),
      rows
    });

    const key = storageKey();
    const existing = await getSnapshots();
    const withoutOldCatalogue = existing.filter(item => item.key !== "admin_catalogue_auto" && item.key !== "admin_catalogue_merchant_matrix");
    const next = [...withoutOldCatalogue, ...combinedSnapshots];
    await chrome.storage.local.set({ [key]: next });
    await clearScanProgress("catalogue");
    setStatus(`自动扫描完成：${rows.length} 个 merchant。`);
    render(next, todayKey());
  } catch (error) {
    setStatus(error?.message || "自动扫描失败，已停止且没有刷新 Merchant 筛选。");
  } finally {
    autoScanCatalogueButton.disabled = false;
    autoScanOrdersButton.disabled = false;
    autoScanPricingButton.disabled = false;
    if (!oneClickRunning) scanAllButton.disabled = false;
    endScanning();
    await refreshResumeAvailability();
  }
}

autoScanCatalogueButton.addEventListener("click", () => runCatalogueScan());

async function runOrderScan({ resume } = {}) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/https:\/\/admin\.engagehub\.tsostech\.com\/order-list/.test(tab.url || "")) {
    setStatus("请先打开运营端 Order List 页面。");
    return;
  }

  beginScanning();
  autoScanOrdersButton.disabled = true;
  autoScanCatalogueButton.disabled = true;
  autoScanPricingButton.disabled = true;
  scanAllButton.disabled = true;
  const tabConfigs = [
    { field: "awaitingFulfillment", label: "Awaiting Fulfillment" },
    { field: "partiallyFulfilled", label: "Partially Fulfilled" },
    { field: "canceled", label: "Canceled" }
  ];

  const existingProgress = resume ? await loadScanProgress("order") : null;
  try {
    setStatus(existingProgress ? "正在恢复 Order 巡检..." : "正在准备 Order List 页面...");
    await chrome.tabs.reload(tab.id);
    await waitForTabComplete(tab.id);
    await waitForEhDataReady(tab.id, "Order List");

    let merchants;
    let rows;
    let startIndex;
    if (existingProgress) {
      merchants = existingProgress.merchants;
      rows = existingProgress.rows;
      startIndex = existingProgress.nextMerchantIndex;
      setStatus(`已恢复进度：${startIndex}/${merchants.length} 个 Order Merchant，继续扫描...`);
    } else {
      await clearScanProgress("order");
      setStatus("正在打开 Order Merchant 列表...");
      merchants = await listMerchants(tab.id);
      merchants = [...new Set(merchants)].filter(Boolean);
      if (!merchants.length) {
        setStatus("没有读取到 Order Merchant 列表，请确认 Merchant 筛选可打开。");
        return;
      }
      setStatus(`已读取 ${merchants.length} 个 Order Merchant，开始逐个扫描...`);
      await delay(500);
      rows = [];
      startIndex = 0;
      await saveScanProgress("order", { merchants, nextMerchantIndex: startIndex, rows });
    }

    for (let merchantIndex = startIndex; merchantIndex < merchants.length; merchantIndex += 1) {
      checkCancelled();
      const merchant = merchants[merchantIndex];
      setStatus(`Order ${merchantIndex + 1}/${merchants.length}：正在选择 ${merchant}`);
      let selected = false;
      for (let attempt = 0; attempt < 3 && !selected; attempt += 1) {
        selected = await selectMerchant(tab.id, merchant);
        if (!selected) await delay(500);
      }
      if (!selected) {
        throw new Error(`无法选择 Order Merchant：${merchant}，扫描已停止。`);
      }

      const row = { merchant, awaitingFulfillment: 0, partiallyFulfilled: 0, canceled: 0 };
      for (const tabConfig of tabConfigs) {
        setStatus(`正在统计 Order / ${merchant} / ${tabConfig.label}...`);
        let clicked = false;
        for (let attempt = 0; attempt < 3 && !clicked; attempt += 1) {
          clicked = await clickCatalogueTab(tab.id, tabConfig.label);
          if (!clicked) await delay(350);
        }
        if (!clicked) {
          throw new Error(`无法点击 Order ${tabConfig.label}，扫描已停止。`);
        }
        if (!await waitForActiveStatusTab(tab.id, tabConfig.label)) {
          throw new Error(`Order ${tabConfig.label} 未完成切换，扫描已停止。`);
        }
        const count = await countCurrentMerchantTabRows(tab.id, `Order / ${merchant} / ${tabConfig.label}`);
        row[tabConfig.field] = count;
      }
      rows.push(row);
      await saveScanProgress("order", { merchants, nextMerchantIndex: merchantIndex + 1, rows });
    }

    const orderSnapshot = {
      type: "order_merchant_matrix",
      key: "admin_order_merchant_matrix",
      label: "运营端 Order Merchant 待办",
      scannedAt: new Date().toISOString(),
      rows
    };
    const key = storageKey();
    const existing = await getSnapshots();
    const withoutOldOrders = existing.filter(item => item.key !== "admin_order_merchant_matrix");
    const next = [...withoutOldOrders, orderSnapshot];
    await chrome.storage.local.set({ [key]: next });
    await clearScanProgress("order");
    setStatus(`Order 自动扫描完成：${rows.length} 个 Merchant。`);
    render(next, todayKey());
  } catch (error) {
    setStatus(error?.message || "Order 自动扫描失败，已停止。");
  } finally {
    autoScanOrdersButton.disabled = false;
    autoScanCatalogueButton.disabled = false;
    autoScanPricingButton.disabled = false;
    if (!oneClickRunning) scanAllButton.disabled = false;
    endScanning();
    await refreshResumeAvailability();
  }
}

autoScanOrdersButton.addEventListener("click", () => runOrderScan());

async function runPricingScan({ resume } = {}) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/https:\/\/admin\.engagehub\.tsostech\.com\/pricing(?:\/|$)/.test(tab.url || "")) {
    setStatus("请先打开运营端 Pricing 页面。");
    return;
  }

  beginScanning();
  autoScanPricingButton.disabled = true;
  autoScanCatalogueButton.disabled = true;
  autoScanOrdersButton.disabled = true;
  scanAllButton.disabled = true;
  const pricingUrl = "https://admin.engagehub.tsostech.com/pricing";
  const pageConfigs = [
    { field: "toBeUpdated", label: "To be Updated", pathname: "/pricing", navigates: false },
    { field: "pricingFailedUpdate", label: "Pricing Failed Update", pathname: "/pricing/failed-update", navigates: true },
    { field: "costAudit", label: "Cost Audit", pathname: "/pricing/cost-audit", navigates: true }
  ];

  const existingProgress = resume ? await loadScanProgress("pricing") : null;
  try {
    let rowMap;
    let merchantOrder;
    let startPageIndex;
    if (existingProgress) {
      rowMap = new Map(Object.entries(existingProgress.rowMap));
      merchantOrder = existingProgress.merchantOrder;
      startPageIndex = existingProgress.pageIndex;
    } else {
      await clearScanProgress("pricing");
      rowMap = new Map();
      merchantOrder = [];
      startPageIndex = 0;
    }

    for (let pageIndex = startPageIndex; pageIndex < pageConfigs.length; pageIndex += 1) {
      checkCancelled();
      const pageConfig = pageConfigs[pageIndex];
      // Only the page we resumed on (if any) reuses a saved Merchant list and
      // start offset; every later page in this run always lists fresh.
      const resumingThisPage = existingProgress && pageIndex === startPageIndex;
      setStatus(`Pricing ${pageIndex + 1}/${pageConfigs.length}：${resumingThisPage ? "正在恢复" : "正在返回 Pricing 并打开"} ${pageConfig.label}...`);
      await openEhPage(tab.id, pricingUrl, "Pricing");

      const navigation = pageConfig.navigates ? waitForTabComplete(tab.id) : null;
      let clicked = false;
      for (let attempt = 0; attempt < 3 && !clicked; attempt += 1) {
        clicked = await clickCatalogueTab(tab.id, pageConfig.label);
        if (!clicked) await delay(350);
      }
      if (!clicked) throw new Error(`无法打开 Pricing / ${pageConfig.label}，扫描已停止。`);

      if (pageConfig.navigates) {
        await navigation;
        if (!await waitForPath(tab.id, pageConfig.pathname)) {
          throw new Error(`${pageConfig.label} 页面未完成跳转，扫描已停止。`);
        }
      } else if (!await waitForActiveStatusTab(tab.id, pageConfig.label)) {
        throw new Error(`${pageConfig.label} 未完成切换，扫描已停止。`);
      }
      await waitForEhDataReady(tab.id, `Pricing / ${pageConfig.label}`);

      let merchants;
      let merchantStartIndex;
      if (resumingThisPage) {
        merchants = existingProgress.merchants;
        merchantStartIndex = existingProgress.nextMerchantIndex;
        setStatus(`已恢复进度：Pricing / ${pageConfig.label} ${merchantStartIndex}/${merchants.length}，继续扫描...`);
      } else {
        setStatus(`正在读取 ${pageConfig.label} 的 Merchant 列表...`);
        merchants = await listMerchants(tab.id);
        merchants = [...new Set(merchants)].filter(Boolean);
        if (!merchants.length) {
          throw new Error(`${pageConfig.label} 没有读取到 Merchant 列表，扫描已停止。`);
        }
        merchantStartIndex = 0;
        await saveScanProgress("pricing", {
          pageIndex,
          pageLabel: pageConfig.label,
          merchants,
          nextMerchantIndex: merchantStartIndex,
          rowMap: Object.fromEntries(rowMap),
          merchantOrder
        });
      }

      for (let merchantIndex = merchantStartIndex; merchantIndex < merchants.length; merchantIndex += 1) {
        checkCancelled();
        const merchant = merchants[merchantIndex];
        if (!rowMap.has(merchant)) {
          rowMap.set(merchant, { merchant, toBeUpdated: 0, pricingFailedUpdate: 0, costAudit: 0 });
          merchantOrder.push(merchant);
        }
        setStatus(`Pricing ${pageIndex + 1}/${pageConfigs.length} · Merchant ${merchantIndex + 1}/${merchants.length}：${merchant}`);
        let selected = false;
        for (let attempt = 0; attempt < 3 && !selected; attempt += 1) {
          selected = await selectMerchant(tab.id, merchant);
          if (!selected) await delay(500);
        }
        if (!selected) {
          throw new Error(`${pageConfig.label} 无法选择 Merchant：${merchant}，扫描已停止。`);
        }
        rowMap.get(merchant)[pageConfig.field] = await countCurrentMerchantTabRows(
          tab.id,
          `Pricing / ${pageConfig.label} / ${merchant}`
        );
        await saveScanProgress("pricing", {
          pageIndex,
          pageLabel: pageConfig.label,
          merchants,
          nextMerchantIndex: merchantIndex + 1,
          rowMap: Object.fromEntries(rowMap),
          merchantOrder
        });
      }
    }

    const rows = merchantOrder.map(merchant => rowMap.get(merchant));
    const pricingSnapshot = {
      type: "pricing_merchant_matrix",
      key: "admin_pricing_merchant_matrix",
      label: "运营端 Pricing Merchant 待办",
      scannedAt: new Date().toISOString(),
      rows
    };
    const key = storageKey();
    const existing = await getSnapshots();
    const withoutOldPricing = existing.filter(item => item.key !== "admin_pricing_merchant_matrix");
    const next = [...withoutOldPricing, pricingSnapshot];
    await chrome.storage.local.set({ [key]: next });
    await clearScanProgress("pricing");
    setStatus(`Pricing 自动扫描完成：${rows.length} 个 Merchant。`);
    render(next, todayKey());
  } catch (error) {
    setStatus(error?.message || "Pricing 自动扫描失败，已停止。");
  } finally {
    autoScanPricingButton.disabled = false;
    autoScanCatalogueButton.disabled = false;
    autoScanOrdersButton.disabled = false;
    if (!oneClickRunning) scanAllButton.disabled = false;
    endScanning();
    await refreshResumeAvailability();
  }
}

autoScanPricingButton.addEventListener("click", () => runPricingScan());

auditProductButton.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https:\/\/admin\.engagehub\.tsostech\.com\//.test(tab.url || "")) {
    setAuditStatus("请先打开运营端 Catalogue 商品详情页。");
    return;
  }

  auditProductButton.disabled = true;
  auditResultBox.hidden = true;
  setAuditStatus("正在读取当前商品信息并检查 Media 图片...");
  try {
    const response = await askContentWithInjection(tab.id, { type: "EH_ASSISTANT_AUDIT_PRODUCT" });
    if (!response) throw new Error(`无法连接当前 EH 页面脚本，请确认扩展已更新到 v${chrome.runtime.getManifest().version} 后重试。`);
    if (!response.ok) throw new Error(`审核执行失败：${response.stage || "未知步骤"}；${response.error || "未知错误"}`);
    if (!response.result) throw new Error("页面脚本已连接，但当前网址不是运营端 Catalogue 商品详情路径。");
    const auditResult = await resolveMediaByScreenshot(tab, response.result);
    renderProductAudit(auditResult);
    const attentionCount = auditResult.checks.filter(item => item.status === "attention").length;
    const manualCount = auditResult.checks.filter(item => item.status === "manual").length;
    setAuditStatus(`商品检查完成：${attentionCount} 项需关注，${manualCount} 项需人工查看。`);
  } catch (error) {
    setAuditStatus(error?.message || "商品辅助审核失败，请重试。");
  } finally {
    auditProductButton.disabled = false;
  }
});

function optimizeWordCount(title) {
  return (String(title || "").trim().match(/\S+/g) || []).length;
}

function optimizeCategoryLabel(template) {
  return [template.category1, template.category2, template.category3].filter(Boolean).join(" / ");
}

function buildOptimizePrompt(product, template) {
  return [
    "You are helping a JustFab merchandising operator rewrite a product's storefront Title and Description to match the brand's content spec.",
    "",
    "Rules:",
    "- Title: at most 8 words. Must include the category keyword, the style, and the key selling point. Optional words in parentheses in the formula below may also be used.",
    "- Description: fill in every structured property listed below that genuinely applies to this product. Skip a property only if it truly does not apply (e.g. a flat sandal has no Heel Height).",
    "- Only use facts present in the product's existing Title/Description given below. Do not invent materials, measurements, or features that aren't evidenced by the given content.",
    "- Output ONLY a JSON object of the exact shape {\"title\": string, \"description\": string} -- no markdown, no extra commentary, no code fences.",
    "",
    `Category: ${optimizeCategoryLabel(template)}`,
    `Title formula: ${template.titleFormula.en} (${template.titleFormula.zh})`,
    `Title example: ${template.titleExample}`,
    `Description properties to fill when applicable: ${template.descriptionProperties.join(", ")}`,
    `Description example:\n${template.descriptionExample}`,
    "",
    "Product's existing content (source of truth for facts):",
    `Existing Title: ${product.title || "(empty)"}`,
    `Existing Description: ${product.description || "(empty)"}`,
    product.productBrand ? `Brand: ${product.productBrand}` : "",
    product.vendor ? `Vendor: ${product.vendor}` : ""
  ].filter(Boolean).join("\n");
}

function parseOptimizeAiText(text) {
  const trimmed = String(text || "").trim();
  const tryParse = candidate => {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed.title === "string" && typeof parsed.description === "string") return parsed;
    } catch (_error) {
      return null;
    }
    return null;
  };
  const direct = tryParse(trimmed);
  if (direct) return direct;
  const match = trimmed.match(/\{[\s\S]*\}/);
  const fromMatch = match ? tryParse(match[0]) : null;
  if (fromMatch) return fromMatch;
  return { raw: trimmed };
}

function callAi(prompt) {
  return new Promise(resolve => {
    loadAiConfig().then(aiConfig => {
      chrome.runtime.sendMessage(
        { type: "EH_ASSISTANT_CALL_AI", provider: aiConfig?.provider || "anthropic", apiKey: aiConfig?.apiKey, model: aiConfig?.model, prompt },
        response => {
          if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
          else resolve(response || { ok: false, error: "未知错误" });
        }
      );
    });
  });
}

function renderOptimizeResult(parsed, template) {
  optimizeResultBox.hidden = false;
  const categoryLabel = optimizeCategoryLabel(template);
  if (parsed.raw) {
    optimizeResultBox.innerHTML = `
      <div class="optimize-category"><span>匹配品类：${escapeHtml(categoryLabel)}</span></div>
      <div class="optimize-block">
        <div class="optimize-block-head"><strong>AI 返回内容（格式异常，请人工核对）</strong></div>
        <div class="optimize-block-text">${escapeHtml(parsed.raw)}</div>
      </div>
    `;
    return;
  }
  const wordCount = optimizeWordCount(parsed.title);
  optimizeResultBox.innerHTML = `
    <div class="optimize-category"><span>匹配品类：${escapeHtml(categoryLabel)}</span></div>
    <div class="optimize-block">
      <div class="optimize-block-head">
        <strong>建议 Title</strong>
        <span class="optimize-word-count ${wordCount > 8 ? "over-limit" : ""}">${wordCount} 个词${wordCount > 8 ? "（超过 8 个词，请人工精简）" : ""}</span>
      </div>
      <div class="optimize-block-text">${escapeHtml(parsed.title)}</div>
      <div class="optimize-translation" hidden></div>
      <div class="optimize-block-actions">
        <button class="optimize-copy" type="button" data-copy-target="title">复制</button>
        <button class="optimize-copy" type="button" data-fill-target="title">一键填入</button>
        <button class="optimize-copy" type="button" data-translate-target="title">翻译</button>
      </div>
    </div>
    <div class="optimize-block">
      <div class="optimize-block-head"><strong>建议 Description</strong></div>
      <div class="optimize-block-text">${escapeHtml(parsed.description)}</div>
      <div class="optimize-translation" hidden></div>
      <div class="optimize-block-actions">
        <button class="optimize-copy" type="button" data-copy-target="description">复制</button>
        <button class="optimize-copy" type="button" data-fill-target="description">一键填入</button>
        <button class="optimize-copy" type="button" data-translate-target="description">翻译</button>
      </div>
    </div>
    <div class="audit-note">AI 生成内容仅供参考，请人工核对。「一键填入」只会把内容填进 Editor 输入框（如同手动输入），插件不会点击 EH 自己的保存/提交按钮，填入后仍需你自己确认并保存。</div>
  `;
  optimizeResultBox.querySelectorAll("[data-copy-target]").forEach(button => {
    button.addEventListener("click", async () => {
      const isTitle = button.dataset.copyTarget === "title";
      await navigator.clipboard.writeText((isTitle ? parsed.title : parsed.description) || "");
      setOptimizeStatus(`${isTitle ? "Title" : "Description"} 已复制。`);
    });
  });
  optimizeResultBox.querySelectorAll("[data-fill-target]").forEach(button => {
    button.addEventListener("click", () => {
      const isTitle = button.dataset.fillTarget === "title";
      fillIntoEditor(isTitle ? "title" : "description", isTitle ? parsed.title : parsed.description);
    });
  });
  optimizeResultBox.querySelectorAll("[data-translate-target]").forEach(button => {
    button.addEventListener("click", () => {
      const isTitle = button.dataset.translateTarget === "title";
      translateOptimizeField(isTitle ? "title" : "description", isTitle ? parsed.title : parsed.description, button);
    });
  });
}

function buildTranslatePrompt(text) {
  return [
    "Translate the following English e-commerce product copy into natural, concise Chinese so a Chinese-speaking merchandising operator can quickly understand it.",
    "Output ONLY the Chinese translation -- no quotes, no pinyin, no extra commentary, no markdown.",
    "",
    "Text:",
    text
  ].join("\n");
}

// Translation is on demand (a button, not baked into every generation) since
// it's purely a reading aid for the operator -- the EH page itself always
// needs the English copy, so most generations may never need this click.
// Toggling re-shows a translation already fetched instead of calling the AI
// again.
async function translateOptimizeField(field, text, button) {
  const label = field === "title" ? "Title" : "Description";
  const translationBox = button.closest(".optimize-block").querySelector(".optimize-translation");
  if (translationBox.dataset.translated === "true") {
    translationBox.hidden = !translationBox.hidden;
    button.textContent = translationBox.hidden ? "翻译" : "隐藏翻译";
    return;
  }
  const aiConfig = await loadAiConfig();
  if (!aiConfig?.apiKey) {
    setOptimizeStatus("请先在设置里配置 AI 服务商和 API Key。");
    return;
  }
  button.disabled = true;
  setOptimizeStatus(`正在翻译 ${label}...`);
  try {
    const aiResponse = await callAi(buildTranslatePrompt(text));
    if (!aiResponse.ok) throw new Error(aiResponse.error || "翻译失败");
    const translated = String(aiResponse.text || "").trim();
    if (!translated) throw new Error("翻译结果为空");
    translationBox.textContent = translated;
    translationBox.hidden = false;
    translationBox.dataset.translated = "true";
    button.textContent = "隐藏翻译";
    setOptimizeStatus(`${label} 翻译完成，仅供参考，不代表最终文案。`);
  } catch (error) {
    setOptimizeStatus(error?.message || `${label} 翻译失败，请重试。`);
  } finally {
    button.disabled = false;
  }
}

async function fillIntoEditor(field, text) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https:\/\/admin\.engagehub\.tsostech\.com\//.test(tab.url || "")) {
    setOptimizeStatus("请先打开运营端 Catalogue 商品详情页再填入。");
    return;
  }
  const label = field === "title" ? "Title" : "Description";
  const messageType = field === "title" ? "EH_ASSISTANT_FILL_EDITOR_TITLE" : "EH_ASSISTANT_FILL_EDITOR_DESCRIPTION";
  setOptimizeStatus(`正在填入 ${label}...`);
  try {
    const response = await askContentWithInjection(tab.id, { type: messageType, text: text || "" });
    if (!response) throw new Error(`无法连接当前 EH 页面脚本，请确认扩展已更新到 v${chrome.runtime.getManifest().version} 后重试。`);
    if (!response.ok) throw new Error(response.error || `${label} 填入失败`);
    if (!response.result?.filled) {
      throw new Error(response.result?.reason || `${label} 填入后校验不一致，请改用「复制」按钮手动粘贴。`);
    }
    setOptimizeStatus(`${label} 已填入 Editor 输入框，请确认内容后自己点击 EH 的保存按钮——插件不会自动保存或提交。`);
  } catch (error) {
    setOptimizeStatus(error?.message || `${label} 填入失败，请改用「复制」按钮手动粘贴。`);
  }
}

async function runOptimizeGeneration(product, template) {
  optimizeProductButton.disabled = true;
  // A reasoning-model call can take 30-90s with nothing to show for it; a
  // static message left the user unsure whether it had frozen (this is the
  // exact scenario that prompted "为什么这么慢" -- a ticking elapsed time is
  // cheap, concrete proof the extension is still waiting, not stuck.
  const baseMessage = "正在调用 AI 生成 Title/Description 建议...如果服务商用的是推理类模型，这一步可能要等 30-90 秒，属于正常现象，请不要重复点击。";
  const startedAt = Date.now();
  const tickStatus = () => setOptimizeStatus(`${baseMessage}（已等待 ${Math.round((Date.now() - startedAt) / 1000)} 秒）`);
  tickStatus();
  const tickTimer = setInterval(tickStatus, 1000);
  try {
    const prompt = buildOptimizePrompt(product, template);
    const aiResponse = await callAi(prompt);
    if (!aiResponse.ok) throw new Error(aiResponse.error || "AI 调用失败。");
    const parsed = parseOptimizeAiText(aiResponse.text);
    renderOptimizeResult(parsed, template);
    setOptimizeStatus(parsed.raw
      ? "AI 返回内容格式异常，已原样展示，请人工核对。"
      : "AI 建议已生成，仅供参考，请人工核对后手动复制到 EH 页面。");
  } catch (error) {
    setOptimizeStatus(error?.message || "生成建议失败，请重试。");
  } finally {
    clearInterval(tickTimer);
    optimizeProductButton.disabled = false;
  }
}

function renderOptimizeCategoryPicker(product) {
  const templates = window.EHAssistantOptimizeTemplates.templates;
  optimizeResultBox.hidden = false;
  const detectedNote = product.categoryPath ? `（读取到：${escapeHtml(product.categoryPath)}）` : "";
  optimizeResultBox.innerHTML = `
    <div class="optimize-category">
      <span>未能自动识别商品品类${detectedNote}，请手动选择：</span>
      <select id="optimizeCategorySelect">
        <option value="">请选择品类...</option>
        ${templates.map((template, index) => `<option value="${index}">${escapeHtml(optimizeCategoryLabel(template))}</option>`).join("")}
      </select>
    </div>
    <button id="optimizeCategoryConfirm" class="primary compact-button" type="button">生成建议</button>
  `;
  document.getElementById("optimizeCategoryConfirm").addEventListener("click", () => {
    const select = document.getElementById("optimizeCategorySelect");
    const index = Number(select.value);
    const template = templates[index];
    if (!select.value || !template) {
      setOptimizeStatus("请先选择品类。");
      return;
    }
    runOptimizeGeneration(product, template);
  });
}

aiSettingsToggle.addEventListener("click", async () => {
  const willShow = aiSettingsPanel.hidden;
  aiSettingsPanel.hidden = !willShow;
  aiSettingsToggle.setAttribute("aria-expanded", String(willShow));
  aiSettingsToggle.title = willShow ? "收起 AI 设置" : "展开 AI 设置";
  if (willShow) {
    const config = await loadAiConfig();
    const provider = validAiProviders.has(config?.provider) ? config.provider : "anthropic";
    aiProviderSelect.value = provider;
    aiApiKeyInput.value = config?.apiKey || "";
    populateModelOptions(provider, config?.model || "");
    // Blank hint: what's shown in the fields already matches what's saved,
    // so there's nothing pending to call out yet.
    showAiSettingsHint("", "muted");
  }
});

optimizeProductButton.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https:\/\/admin\.engagehub\.tsostech\.com\//.test(tab.url || "")) {
    setOptimizeStatus("请先打开运营端 Catalogue 商品详情页。");
    return;
  }
  const aiConfig = await loadAiConfig();
  if (!aiConfig?.apiKey) {
    aiSettingsPanel.hidden = false;
    setOptimizeStatus("请先在设置里配置 AI 服务商和 API Key。");
    return;
  }

  optimizeProductButton.disabled = true;
  optimizeResultBox.hidden = true;
  setOptimizeStatus("正在读取当前商品信息...");
  try {
    const response = await askContentWithInjection(tab.id, { type: "EH_ASSISTANT_GATHER_OPTIMIZE_DATA" });
    if (!response) throw new Error(`无法连接当前 EH 页面脚本，请确认扩展已更新到 v${chrome.runtime.getManifest().version} 后重试。`);
    if (!response.ok) throw new Error(`读取商品信息失败：${response.error || "未知错误"}`);
    if (!response.product) throw new Error("页面脚本已连接，但当前网址不是运营端 Catalogue 商品详情路径。");
    const product = response.product;
    // Prefer the page's own category breadcrumb; if that can't be read or
    // doesn't match a known template, fall back to guessing from the
    // product's existing Title/Description before giving up to a manual pick.
    const template = window.EHAssistantOptimizeTemplates.match(product.categoryPath)
      || window.EHAssistantOptimizeTemplates.matchByText(product.title, product.description);
    if (template) {
      await runOptimizeGeneration(product, template);
    } else {
      renderOptimizeCategoryPicker(product);
      setOptimizeStatus("未能自动识别品类，请手动选择后继续。");
    }
  } catch (error) {
    setOptimizeStatus(error?.message || "读取商品信息失败，请重试。");
  } finally {
    optimizeProductButton.disabled = false;
  }
});

copyButton.addEventListener("click", async () => {
  const report = buildReport(await getSnapshots());
  await navigator.clipboard.writeText(report);
  setStatus("待办日报已复制。");
});

clearButton.addEventListener("click", async () => {
  await chrome.storage.local.remove(storageKey());
  await Promise.all(Object.keys(MODULE_LABELS).map(module => clearScanProgress(module)));
  setStatus("今日记录已清空。");
  await refresh();
  await refreshResumeAvailability();
});

exportCsvButton.addEventListener("click", async () => {
  const snapshots = await getSnapshots();
  const csv = buildCsv(snapshots);
  if (!csv) {
    setStatus("当前没有可导出的数据。");
    return;
  }
  const utf8Bom = String.fromCharCode(0xfeff);
  downloadTextFile(`EH待办统计_${todayKey()}.csv`, utf8Bom + csv, "text/csv;charset=utf-8;");
  setStatus("待办数据已导出为 CSV。");
});

merchantSearchInput.addEventListener("input", () => {
  searchQuery = merchantSearchInput.value;
  render(currentSnapshots);
});

toggleSearchButton.addEventListener("click", () => {
  const willShow = merchantSearchInput.hidden;
  merchantSearchInput.hidden = !willShow;
  if (willShow) {
    merchantSearchInput.focus();
  } else {
    merchantSearchInput.value = "";
    searchQuery = "";
    render(currentSnapshots);
  }
});

setWorkspace(localStorage.getItem("ehAssistantWorkspace") || "todo");
loadYesterdaySnapshots();
refreshResumeAvailability();
refresh();
