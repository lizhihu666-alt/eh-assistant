// EH 每日定时巡检（由 Loop 每天叫醒，在后台跑）· Created by Leo Hu
// 和侧边栏「一键巡检」统计口径完全一样（Catalogue / Pricing / Order 三个模块，逐个 Merchant 读筛选后的总数），
// 区别只是：不依赖侧边栏开着，由后台脚本驱动一个单独的 EH 窗口。
// 只读：只做切换 Merchant、切换待办 tab、读总数，永远不点 Approve / Save / Submit 之类的业务按钮。
//
// 分段跑：浏览器会回收跑太久的后台脚本，所以每段最多跑 budgetMs，进度存在 chrome.storage.local，
// 返回 { done:false } 让 Loop 到点再叫醒接着跑；全部做完才返回 { done:true, snapshots, report }。
(function (root) {
  const ORIGIN = "https://admin.engagehub.tsostech.com";
  const STATE_KEY = "ehAssistant:dailyScan";
  const MODULES = [
    {
      id: "catalogue",
      label: "Catalogue",
      url: ORIGIN + "/catalogue?tab=ALL&page=1&page_size=20&channel=1&search_field=model",
      pathname: "/catalogue",
      tabs: [
        { field: "newProducts", label: "New Products" },
        { field: "updatedToBeAudit", label: "Updated to be Audit" },
        { field: "syncFailure", label: "Sync Failure" },
      ],
    },
    {
      id: "pricing",
      label: "Pricing",
      url: ORIGIN + "/pricing",
      // Pricing 的三个状态在不同页面：页面外循环、Merchant 内循环（和侧边栏一样）
      pages: [
        { field: "toBeUpdated", label: "To be Updated", pathname: "/pricing", navigates: false },
        { field: "pricingFailedUpdate", label: "Pricing Failed Update", pathname: "/pricing/failed-update", navigates: true },
        { field: "costAudit", label: "Cost Audit", pathname: "/pricing/cost-audit", navigates: true },
      ],
    },
    {
      id: "order",
      label: "Order",
      url: ORIGIN + "/order-list",
      pathname: "/order-list",
      tabs: [
        { field: "awaitingFulfillment", label: "Awaiting Fulfillment" },
        { field: "partiallyFulfilled", label: "Partially Fulfilled" },
        { field: "canceled", label: "Canceled" },
      ],
    },
  ];
  const FIELDS = {
    catalogue: [["newProducts", "New Product"], ["updatedToBeAudit", "Updated to be Audit"], ["syncFailure", "Sync Failure"]],
    pricing: [["toBeUpdated", "To be Updated"], ["pricingFailedUpdate", "Pricing Failed Update"], ["costAudit", "Cost Audit"]],
    order: [["awaitingFulfillment", "Awaiting Fulfillment"], ["partiallyFulfilled", "Partially Fulfilled"], ["canceled", "Canceled"]],
  };
  const SNAPSHOT_META = {
    catalogue: { type: "catalogue_merchant_matrix", key: "admin_catalogue_merchant_matrix", label: "运营端 Catalogue Merchant 待办" },
    pricing: { type: "pricing_merchant_matrix", key: "admin_pricing_merchant_matrix", label: "运营端 Pricing Merchant 待办" },
    order: { type: "order_merchant_matrix", key: "admin_order_merchant_matrix", label: "运营端 Order Merchant 待办" },
  };

  function dateKey(d) {
    const x = d || new Date();
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  }
  function shiftDateKey(key, days) {
    const [y, m, d] = key.split("-").map(Number);
    return dateKey(new Date(y, m - 1, d + days));
  }

  /** 生成发到飞书的日报：只列有待办的 Merchant；文字要短，飞书卡片放得下 */
  function buildFeishuReport(results, opts) {
    const o = opts || {};
    const lines = [];
    let total = 0;
    const merchants = new Set();
    const sections = [];
    for (const mod of ["catalogue", "pricing", "order"]) {
      const rows = (results[mod] || []).filter((r) => FIELDS[mod].some(([f]) => Number(r[f] || 0) > 0));
      if (!rows.length) continue;
      const out = [MODULES.find((m) => m.id === mod).label + "（" + rows.length + " 个 Merchant）"];
      rows.sort((a, b) => String(a.merchant).localeCompare(String(b.merchant)));
      for (const r of rows) {
        merchants.add(r.merchant);
        const parts = FIELDS[mod].filter(([f]) => Number(r[f] || 0) > 0).map(([f, name]) => { total += Number(r[f]); return name + " " + r[f]; });
        out.push("· " + r.merchant + "：" + parts.join("、"));
      }
      sections.push(out.join("\n"));
    }
    let head = "待办合计 " + total + " 项，涉及 " + merchants.size + " 个 Merchant";
    if (Number.isFinite(o.yesterdayTotal)) {
      const diff = total - o.yesterdayTotal;
      head += diff === 0 ? "，和昨天持平" : diff > 0 ? "，比昨天多 " + diff + " 项" : "，比昨天少 " + -diff + " 项";
    }
    lines.push(head);
    if (o.skipped && o.skipped.length) lines.push("有 " + o.skipped.length + " 处没读成（已跳过）：" + o.skipped.slice(0, 5).join("；") + (o.skipped.length > 5 ? "…" : ""));
    if (!sections.length) lines.push("", "今天没有待办。");
    else lines.push("", sections.join("\n\n"));
    let text = lines.join("\n");
    if (text.length > 3800) text = text.slice(0, 3800) + "\n…（太长了，其余请在 EH Assistant 侧边栏里看）";
    return { text, total, merchantCount: merchants.size };
  }

  function totalOf(results) {
    let t = 0;
    for (const mod of Object.keys(FIELDS)) for (const r of results[mod] || []) for (const [f] of FIELDS[mod]) t += Number(r[f] || 0);
    return t;
  }

  /** 侧边栏存的快照 → 各模块的行（用来算「较昨日」） */
  function resultsFromSnapshots(snapshots) {
    const out = {};
    for (const mod of Object.keys(SNAPSHOT_META)) {
      const s = (snapshots || []).find((x) => x.type === SNAPSHOT_META[mod].type);
      if (s) out[mod] = s.rows || [];
    }
    return out;
  }

  function create(deps) {
    const chrome = deps.chrome;
    const now = deps.now || (() => Date.now());
    const delay = deps.delay || ((ms) => new Promise((r) => setTimeout(r, ms)));
    const log = deps.log || (() => {});

    // ---- 和侧边栏同一套页面消息（content.js 已经实现） ----
    function send(tabId, message) {
      return new Promise((resolve) => {
        try {
          chrome.tabs.sendMessage(tabId, message, (response) => {
            if (chrome.runtime.lastError) resolve(null);
            else resolve(response || null);
          });
        } catch (e) {
          resolve(null);
        }
      });
    }
    async function ask(tabId, message) {
      const r = await send(tabId, message);
      return r && r.ok ? r : null;
    }
    function waitTabComplete(tabId, ms = 20000) {
      return new Promise((resolve) => {
        const timer = setTimeout(() => { chrome.tabs.onUpdated.removeListener(l); resolve(); }, ms);
        function l(id, info) {
          if (id === tabId && info.status === "complete") { clearTimeout(timer); chrome.tabs.onUpdated.removeListener(l); setTimeout(resolve, 900); }
        }
        chrome.tabs.onUpdated.addListener(l);
      });
    }
    async function waitReady(tabId) {
      let last = null, stable = 0;
      for (let i = 0; i < 30; i += 1) {
        const r = await ask(tabId, { type: "EH_ASSISTANT_READY" });
        const rd = r && r.readiness;
        if (rd) {
          const sig = `${rd.rowCount}:${rd.total}:${rd.hasNoData}:${rd.loading}`;
          const lastSig = last ? `${last.rowCount}:${last.total}:${last.hasNoData}:${last.loading}` : "";
          stable = sig === lastSig ? stable + 1 : 0;
          last = rd;
          if (rd.ready && stable >= 1) return rd;
        }
        await delay(1000);
      }
      return last;
    }
    async function retry(fn, times, gap) {
      for (let i = 0; i < times; i += 1) { if (await fn()) return true; await delay(gap); }
      return false;
    }
    const selectMerchant = (tabId, merchant) => retry(async () => !!((await ask(tabId, { type: "EH_ASSISTANT_SELECT_MERCHANT", merchant })) || {}).result?.selected, 3, 500);
    const clickTab = (tabId, label) => retry(async () => !!((await ask(tabId, { type: "EH_ASSISTANT_CLICK_CATALOGUE_TAB", label })) || {}).clicked, 3, 350);
    async function waitActiveTab(tabId, label) {
      for (let i = 0; i < 24; i += 1) {
        const r = await ask(tabId, { type: "EH_ASSISTANT_ACTIVE_STATUS_TAB" });
        if (r && r.label === label) return true;
        await delay(250);
      }
      return false;
    }
    async function listMerchants(tabId) {
      const r = await ask(tabId, { type: "EH_ASSISTANT_LIST_MERCHANTS" });
      return [...new Set((r && r.result && r.result.merchants) || [])].filter(Boolean);
    }
    // 读当前筛选后的总数：EH 分页脚上的总数包含所有页，最快也最准（侧边栏同样做法）；没有页脚时退回逐页数行
    async function countRows(tabId) {
      const rd = await waitReady(tabId);
      if (rd && rd.hasNoData) return 0;
      if (rd && Number.isFinite(rd.total)) return rd.total;
      await ask(tabId, { type: "EH_ASSISTANT_FIRST_PAGE" });
      let total = 0;
      const seen = new Set();
      for (let page = 1; page <= 50; page += 1) {
        await waitReady(tabId);
        const snap = ((await ask(tabId, { type: "EH_ASSISTANT_SCAN" })) || {}).snapshot;
        const sig = `${snap?.url || ""}|${snap?.visibleRows ?? ""}|${(snap?.rowSummaries || []).map((x) => x.product).join("~")}`;
        if (seen.has(sig)) break;
        seen.add(sig);
        total += Number(((await ask(tabId, { type: "EH_ASSISTANT_ROW_COUNT" })) || {}).count || 0);
        const moved = !!((await ask(tabId, { type: "EH_ASSISTANT_NEXT_PAGE" })) || {}).clicked;
        if (!moved) break;
        await delay(900);
      }
      return total;
    }

    // ---- 巡检窗口：单独开一个 EH 窗口，不碰你正在用的标签页；做完关掉 ----
    async function tabAlive(state) {
      if (state.tabId == null) return false;
      try { await chrome.tabs.get(state.tabId); return true; } catch (e) { return false; }
    }
    async function ensureTab(state, url) {
      if (await tabAlive(state)) return state.tabId;
      const win = await chrome.windows.create({ url, focused: true, type: "normal", width: 1360, height: 900 });
      const tab = (win.tabs && win.tabs[0]) || (await chrome.tabs.query({ windowId: win.id }))[0];
      state.windowId = win.id;
      state.tabId = tab.id;
      state.page = null;
      await waitTabComplete(tab.id);
      return tab.id;
    }
    async function currentPath(tabId) {
      const t = await chrome.tabs.get(tabId);
      let u;
      try { u = new URL(t.url || t.pendingUrl || ""); } catch (e) { return { host: "", path: "" }; }
      return { host: u.origin, path: u.pathname };
    }
    async function checkLogin(tabId) {
      const p = await currentPath(tabId);
      if (p.host !== ORIGIN || /login|sign-?in|auth/i.test(p.path)) throw new Error("EH 登录已过期（巡检页面被跳到了 " + (p.host + p.path || "空白页") + "）");
    }
    async function goTo(tabId, url) {
      const done = waitTabComplete(tabId);
      await chrome.tabs.update(tabId, { url });
      await done;
      await checkLogin(tabId);
      await waitReady(tabId);
    }
    async function waitPath(tabId, pathname) {
      for (let i = 0; i < 40; i += 1) { if ((await currentPath(tabId)).path === pathname) return true; await delay(250); }
      return false;
    }

    // 进入某个模块（Pricing 是某个页面）的页面；只在需要时跳转
    async function openPage(state, mod) {
      const tabId = await ensureTab(state, mod.url);
      const pageId = mod.id + (mod.pages ? ":" + state.pageIndex : "");
      if (state.page === pageId && (await currentPath(tabId)).path === (mod.pages ? mod.pages[state.pageIndex].pathname : mod.pathname)) return tabId;
      await goTo(tabId, mod.url);
      if (mod.pages) {
        const pg = mod.pages[state.pageIndex];
        const nav = pg.navigates ? waitTabComplete(tabId) : null;
        if (!(await clickTab(tabId, pg.label))) throw new Error("打不开 Pricing / " + pg.label);
        if (pg.navigates) { await nav; if (!(await waitPath(tabId, pg.pathname))) throw new Error("Pricing / " + pg.label + " 页面没跳转过去"); }
        else if (!(await waitActiveTab(tabId, pg.label))) throw new Error("Pricing / " + pg.label + " 没切换过去");
        await waitReady(tabId);
      }
      state.page = pageId;
      return tabId;
    }

    // 处理一个 Merchant；出错只记下来跳过，不让一个 Merchant 拖垮整轮
    async function doMerchant(state, mod, tabId, merchant) {
      if (!(await selectMerchant(tabId, merchant))) throw new Error("选不中 Merchant");
      if (mod.pages) {
        const pg = mod.pages[state.pageIndex];
        const row = state.rowMap[merchant] || (state.rowMap[merchant] = { merchant, toBeUpdated: 0, pricingFailedUpdate: 0, costAudit: 0 });
        if (!state.merchantOrder.includes(merchant)) state.merchantOrder.push(merchant);
        row[pg.field] = await countRows(tabId);
        return;
      }
      const row = { merchant };
      for (const t of mod.tabs) row[t.field] = 0;
      for (const t of mod.tabs) {
        if (!(await clickTab(tabId, t.label))) throw new Error("点不到 " + t.label);
        if (!(await waitActiveTab(tabId, t.label))) throw new Error(t.label + " 没切换过去");
        row[t.field] = await countRows(tabId);
      }
      state.rows.push(row);
    }

    async function load() { return (await chrome.storage.local.get(STATE_KEY))[STATE_KEY] || null; }
    async function save(state) { state.at = now(); await chrome.storage.local.set({ [STATE_KEY]: state }); }

    function fresh(day) {
      return { day, startedAt: now(), moduleIndex: 0, pageIndex: 0, merchants: null, next: 0, rows: [], rowMap: {}, merchantOrder: [], results: {}, skipped: [], fails: 0, tabId: null, windowId: null, page: null };
    }

    async function finishModule(state, mod) {
      state.results[mod.id] = mod.pages ? state.merchantOrder.map((m) => state.rowMap[m]) : state.rows;
      state.moduleIndex += 1;
      state.pageIndex = 0;
      state.merchants = null;
      state.next = 0;
      state.rows = [];
      state.rowMap = {};
      state.merchantOrder = [];
      state.page = null;
    }

    /** 跑一段。返回 { done:false, progress } 或 { done:true, results, skipped, day } */
    async function runChunk(opts) {
      const o = opts || {};
      const budget = o.budgetMs || 150000;
      const t0 = now();
      const today = dateKey(new Date(now()));
      let state = await load();
      // 同一天没做完的接着做；隔天的或者 6 小时前的旧进度作废，重新开始
      if (!state || state.day !== today || now() - (state.at || 0) > 6 * 3600 * 1000 || o.restart) {
        if (state && state.windowId != null) chrome.windows.remove(state.windowId).catch(() => {});
        state = fresh(today);
      }
      try {
        while (state.moduleIndex < MODULES.length) {
          const mod = MODULES[state.moduleIndex];
          if (now() - t0 > budget) { await save(state); return { done: false, progress: describe(state) }; }
          const tabId = await openPage(state, mod);
          if (!state.merchants) {
            state.merchants = await listMerchants(tabId);
            state.next = 0;
            if (!state.merchants.length) {
              await checkLogin(tabId);
              throw new Error(mod.label + (mod.pages ? " / " + mod.pages[state.pageIndex].label : "") + " 没读到 Merchant 列表");
            }
            await save(state);
          }
          while (state.next < state.merchants.length) {
            if (now() - t0 > budget) { await save(state); return { done: false, progress: describe(state) }; }
            const merchant = state.merchants[state.next];
            try {
              await doMerchant(state, mod, tabId, merchant);
              state.fails = 0;
            } catch (e) {
              await checkLogin(tabId);
              state.fails += 1;
              state.skipped.push(mod.label + (mod.pages ? "/" + mod.pages[state.pageIndex].label : "") + "：" + merchant + "（" + ((e && e.message) || e) + "）");
              log("跳过 " + merchant + "：" + ((e && e.message) || e));
              // 连续 3 个 Merchant 都失败，多半是页面出了问题：重新打开这个页面再试
              if (state.fails >= 3) { state.fails = 0; state.page = null; await save(state); state.next += 1; break; }
            }
            state.next += 1;
            await save(state);
          }
          if (state.next >= state.merchants.length) {
            if (mod.pages && state.pageIndex < mod.pages.length - 1) {
              state.pageIndex += 1;
              state.merchants = null;
              state.next = 0;
              state.page = null;
            } else {
              await finishModule(state, mod);
            }
            await save(state);
          }
        }
      } catch (e) {
        await save(state);
        throw e;
      }
      // 全部做完：关窗口、清进度、把结果写进侧边栏用的同一份当天记录
      if (state.windowId != null) await chrome.windows.remove(state.windowId).catch(() => {});
      await chrome.storage.local.remove(STATE_KEY);
      const snapshots = await storeSnapshots(state.day, state.results);
      return { done: true, day: state.day, results: state.results, skipped: state.skipped, snapshots };
    }

    function describe(state) {
      const mod = MODULES[state.moduleIndex];
      if (!mod) return "收尾中";
      const part = mod.label + (mod.pages ? " / " + mod.pages[state.pageIndex].label : "");
      return part + (state.merchants ? " " + state.next + "/" + state.merchants.length : " 准备中") + "（第 " + (state.moduleIndex + 1) + "/3 个模块）";
    }

    async function storeSnapshots(day, results) {
      const key = "ehAssistant:" + day;
      const existing = (await chrome.storage.local.get(key))[key] || [];
      const scannedAt = new Date(now()).toISOString();
      const fresh = Object.keys(results).map((mod) => Object.assign({}, SNAPSHOT_META[mod], { scannedAt, rows: results[mod], source: "daily" }));
      const keys = new Set(fresh.map((s) => s.key));
      const next = existing.filter((s) => !keys.has(s.key) && s.key !== "admin_catalogue_auto").concat(fresh);
      await chrome.storage.local.set({ [key]: next });
      return next;
    }

    async function yesterdayTotal(day) {
      const key = "ehAssistant:" + shiftDateKey(day, -1);
      const snaps = (await chrome.storage.local.get(key))[key];
      if (!snaps || !snaps.length) return undefined;
      const res = resultsFromSnapshots(snaps);
      if (Object.keys(res).length < 3) return undefined; // 昨天没巡全，不比
      return totalOf(res);
    }

    async function abort() {
      const state = await load();
      if (state && state.windowId != null) await chrome.windows.remove(state.windowId).catch(() => {});
      await chrome.storage.local.remove(STATE_KEY);
    }

    return { runChunk, yesterdayTotal, abort, load };
  }

  const api = { create, buildFeishuReport, totalOf, resultsFromSnapshots, dateKey, shiftDateKey, MODULES, STATE_KEY };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.EHDailyScan = api;
})(typeof self !== "undefined" ? self : globalThis);
