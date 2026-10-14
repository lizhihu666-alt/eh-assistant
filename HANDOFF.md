# EH Assistant Project Handoff

## 接手说明

这是一个用于 Engage Hub（EH）的只读 Chrome Side Panel 扩展，面向电商运营人员。接手后请先阅读本文件、`README.md`、`manifest.json` 以及现有代码，在确认理解之前不要重写项目。

项目目录：

`C:\Users\leohu\Documents\Codex\eh-assistant-mvp`

当前版本：`v0.30.2`

版本号只需要维护 `manifest.json` 一处：`popup.html`/`popup.js` 会在加载时通过 `chrome.runtime.getManifest().version` 动态读取并显示，不再在多个文件里手写版本号字符串。

## 绝对安全边界

- EH 是真实业务系统，页面中的产品、价格、库存和订单数据不可随意修改。
- 插件只能执行读取、筛选、切换待办 tab 和只读分页等操作。
- 永远不要点击或自动触发 `Approved`、`Rejected`、`Approve`、`Reject`、`Retry`、`Save`、`Submit`、`Fulfill`、`Cancel Order` 等业务操作。
- 不得提交审核、修改商品、调整价格、变更库存、发货或取消订单。
- 商品审核功能只生成辅助提示，最终由运营人员人工判断。
- 图片不上传、不保存；巡检结果仅保存在浏览器本地。
- **两个例外**（均属于「一键优化」功能，2026-09-02 起）：
  1. 会把商品现有的 Title/Description 文本（不含图片）发送给外部 AI 服务（Anthropic / OpenAI / DeepSeek / 公司 AI 网关 四选一）生成文案建议——插件第一次向"数据不出本机"之外迈出的一步，经用户明确批准。
  2. 支持把生成的建议**填入 EH 页面 Editor 的 Title/Description 输入框**（如同手动输入）——插件第一次真正改动页面输入内容，同样经用户明确要求后加入。
  两个例外都严格止步于"生成/填入内容"：**插件绝不会点击 EH 自己的 Save/Submit/Approve 等按钮**，商品数据在运营人员自己确认并点击 EH 的保存按钮之前不会真正改变。运营人员始终可以选择用「复制」按钮走传统的复制粘贴，而不是「一键填入」。

## 已完成功能

### 1. Merchant 待办巡检

插件可分别扫描三个运营端模块，也支持一键依次巡检：

- Catalogue：逐个 Merchant 统计 `New Products`、`Updated to be Audit`、`Sync Failure`。
- Pricing：逐个 Merchant 统计 `To be Updated`、`Pricing Failed Update`、`Cost Audit`。
- Order：逐个 Merchant 统计 `Awaiting Fulfillment`、`Partially Fulfilled`、`Canceled`。

巡检规则：

- Catalogue 忽略 `All`。
- Order 忽略 `All` 和 `Fulfilled`。
- 外循环为 Merchant，内循环为各待办状态及必要分页。
- Merchant 下拉列表需要插件主动点击打开，并支持滚动读取全部 Merchant。
- 选择下一个 Merchant 时直接重新打开 Merchant 下拉并点击目标商家，不需要先取消当前选择。
- 切换同一 Merchant 的 Catalogue 或 Order 状态时不要刷新页面，否则 Merchant 选择会丢失。
- Pricing 的三个状态位于不同页面，因此按“状态页面外循环、Merchant 内循环”执行。
- 不依赖 tab 上的数字作为 Merchant 统计结果；优先读取筛选后的真实结果或页面总数。

输出能力：

- Merchant × 待办类型矩阵表，非零数字以橙色圆角徽标高亮，数字为 0 的单元格弱化为浅灰色，便于快速扫到真正需要处理的项。
- `待办数据`与`汇总数据`切换。
- 待办数据只显示至少一个数字大于 0 的 Merchant。
- 复制精简的中文待办日报：入口是「今日待办」标题右侧的小图标按钮（单击复制），不再是大按钮。
- 当天结果保存到 Chrome 本地存储，存储 key 是 `ehAssistant:YYYY-MM-DD`，按自然日分开存。
- 巡检过程中可点击「停止巡检」中断（一键巡检或单个模块扫描都支持）。中断信号通过共享的 `cancelRequested` 标志 + `checkCancelled()` 检查点实现，检查点分布在 Merchant 循环、状态/页面循环和 `waitForEhDataReady` 轮询里；一键巡检链式调用三个模块时，取消标志由最外层的一键巡检持有，不会被内部模块扫描提前重置或提前隐藏停止按钮。
- **断点续扫**：Catalogue / Pricing / Order 三个专项扫描每完成一个 Merchant，就会把「已处理到第几个 Merchant + 已收集的行数据」存进 `ehAssistant:progress:<module>`（与最终的待办矩阵快照是分开的两份存储，互不影响）。**读取到 Merchant 列表后会立刻先存一次初始进度（`nextMerchantIndex: 0`），不等第一个 Merchant 扫完**——这是为了覆盖"巡检刚开始、第一个 Merchant 还没扫完就被中断"这种情况（比如切换到其他浏览器窗口，Chrome 可能会暂停看不见的侧边栏的脚本执行导致巡检中断）；如果没有这一步，这么早的中断会导致存储里什么进度都没有，「继续巡检」按钮也就不会出现。扫描被中断（不管是点了「停止巡检」还是过程中出现其它错误）时，这份进度不会丢，面板上会出现「继续巡检（模块 已完成 X/Y）」按钮，点击后从 `nextMerchantIndex` 指向的 Merchant 继续，不会重复处理前面已经做完的 Merchant。全部完成后会清空这份进度记录；如果不点「继续巡检」而是直接点专项扫描按钮重新开始，会视为全新一轮扫描，自动丢弃旧的断点进度。Pricing 因为是「页面外循环、Merchant 内循环」的结构，进度里除了 Merchant 索引外还多存了 `pageIndex`（当前在三个 Pricing 页面里的第几个），并且每翻到一个新页面、读完该页 Merchant 列表后也会立刻存一次该页的初始进度。「清空记录」按钮也会一并清掉这三个模块的断点进度。
  - 注意：插件没法阻止 Chrome 因为"侧边栏不可见"而暂停/限制巡检的执行，这是浏览器本身的省电机制；上面这个改动只是确保不管什么时候被打断，回来都一定有断点可以续，而不是让中断本身不发生。
- 顶部标题栏显示一个「待办总数」徽标（今天所有模块待办数字之和），以及最后一次扫描的时间（「最后更新 HH:MM」）。
- 每个模块标题旁会显示较昨日的增减趋势（▲增加 / ▼减少 / 持平），仅当本地存有昨天同模块的扫描记录时才显示；没有昨天数据时不显示（不会显示成 0 或 N/A 误导用户）。
- **跨天兜底**（2026-09-05 加）：用户反馈"今天打开插件就看不到昨天巡检的数据了"。根因不是数据丢失，是当天存储 key 按日期分开、`今日待办` 原来只读当天 key，一过零点当天 key 自然是空的，界面就直接显示"今天还没有扫描记录"，实际数据还在前一天的 key 里，只是没人去读它。修了之后 `refresh()`（`popup.js`）逻辑是：先查今天的 key，有数据就正常显示；今天是空的，就用 `findMostRecentSnapshots()` 往前找最近 7 天里第一个有数据的日期展示出来，同时在顶部状态栏和汇总卡片里都会明确提示"今天还没有新的扫描结果，以下是最近一次（YYYY-MM-DD）的巡检数据"，不会让人误以为是当天的实时结果；7 天内都没有才真正显示"没有扫描记录"。展示的是往日数据时，「较昨日」趋势徽标会自动隐藏（`moduleTrendLabel` 靠 `currentSnapshotDateKey !== todayKey()` 判断），因为这时候"昨日"这个参照对象已经不成立了。`render(snapshots, dateKey)` 新增了第二个参数：三个自动扫描函数（`runCatalogueScan`/`runOrderScan`/`runPricingScan`）和 `refresh()` 每次都显式传 `todayKey()`（真正拿到了当天新数据）或找到的历史 `dateKey`；`renderInner` 内部因排序/搜索/待办-汇总切换触发的重渲染（`render(currentSnapshots)`）则不传，沿用当前已经在显示的日期，不会把用户正在看的历史数据悄悄换回今天。
- Merchant 矩阵表格的列标题可点击排序（再次点击切换升/降序，表头会显示 ▲/▼），并提供一个常驻的 Merchant 搜索框（在标题下方，独立于会被整体重绘的表格区域，输入过程中不会因为重新渲染而丢失光标焦点）。
- 支持把当前 Merchant 矩阵导出为 CSV 文件（今日待办标题旁的下载图标），导出的是「汇总数据」范围（不受待办数据筛选影响），带 UTF-8 BOM 以便 Excel 正常显示中文。

### 2. Catalogue 商品辅助审核

运营端 Catalogue 商品详情页支持以下只读检查：

- Title / Description 逐字段判断：若 Editor 对应字段已填写实际内容，则审核 Editor 内容；Editor 该字段为空时回退审核 Provided by 内容。审核结果会标注当前检查的是 Editor 覆盖内容还是 Provided by 内容。
- 标题为 5–10 个英文词。
- 标题使用 Title Case。
- 标题不能包含品牌名。
- 检查明显的错别字、重复词、大小写和标点格式问题。
- 检查 Description 是否存在明显的 SEO 关键词堆砌、重复内容、网址或联系方式。
- 不严格比对标题、Description 与 Product Attribute 中的近似材质表达。
- 检查同一 SPU 的 `VIP Price`、`MSRP`、`Token`、`Cost`、`SRP` 是否一致。
- `Token` 为空值时视为一致；只有非空 Token 值彼此不同时才提示。

图片审核规则（`Media` 列）：

- 模特图和纯背景商品图需要检查背景是否接近 `#E8E8E8`。
- 场景图、尺码表及其他信息图豁免背景色检查。
- 当前算法使用角落背景聚类与边缘占比，避免人物触及图片边缘时被误判为场景图。
- 已使用一组真实 EH 图片验证：前 6 张模特图均正确进入背景检查并读取为 `#E8E8E8`，最后 1 张尺码表正确识别为信息图并豁免。
- 支持读取 `img.engagehub.tsostech.com`、`cdn.shopify.com` 和 `prodenv-merchant-public.s3.us-west-2.amazonaws.com`（多数商品的 Media 图片实际存放在这里）图片。
- 图片由扩展后台读取后在本地分析，避免网页跨域限制；其他来源才尝试页面截图备用方案。

Color Swatch 图片审核规则（`Color Swatch Image` 列，独立于 `Media` 列检查）：

- 每个色号的 Color Swatch Image 图片链接不能为空；为空直接提示需关注。
- 应为纯色块图，不应是产品实拍图：算法对整张图（不只是边缘/角落）做像素采样，计算与图片主色的一致占比——占比 ≥90% 判定为色块图（通过），<60% 判定为疑似产品图（需关注），中间地带判定为无法确定（需人工查看）。这跟 `Media` 列背景色检查（`shared/background-classifier.js`）是两套不同的算法：`Media` 只看边缘背景，允许中间有主体；Color Swatch 要求整张图基本是单一颜色。
- 只做「是否像色块图」的判断，不校验色块颜色是否与色号名称/实际商品颜色相符。
- 图片加载方式、跨域处理与 `Media` 列一致；但目前没有接入 `popup.js` 的页面截图兜底方案（Color Swatch 图片通常很小，直接读取失败时会归为「需人工查看」而不是尝试截图）。
- 图片真的加载失败（链接失效、返回空内容，浏览器会显示成裂图图标）判定为「需关注」，跟"图片能显示、只是脚本因为跨域限制读不到像素"的「需人工查看」是两回事，不会混在一起——前者是确定有问题，后者是看得见但脚本读不到，需要人工确认。判断依据：图片 `naturalWidth/naturalHeight` 为 0，或者 `decode()` 直接失败（`EncodingError`）。
- 「需人工查看」的汇总提示会带上具体原因（复用 `summarizeManualReasons`，比如"浏览器跨域安全限制阻止读取像素：3 张"），不会只说一句"无法自动判断"，方便判断是脚本的问题还是图片本身的问题。
- 2026-09-05：有问题的色号改成**一行一个**展示（`colorIssueLines()`，用真实换行符 `\n` 拼接），不再是原来那种用"；"全部挤在一句话里的写法——色号一多就很难读。为了不让色号特别多的商品把这张检查卡片撑得没边，问题行数分别封顶在 10 行（缺链接+疑似产品图）和 8 行（无法自动判断），超过的部分用一行"……另有 N 个色号，请展开 Variant 表格逐一确认"收尾。渲染这一侧配合把 `.audit-check-detail`/`.audit-note` 的 CSS 加了 `white-space: pre-line`，所以理论上以后别的检查项如果也想要"一条一行"的效果，直接在 `detail` 字符串里用 `\n` 分隔就行，不需要再改 CSS。
- 2026-09-20：用户问"商品审核"是不是在调 AI 的 API、想优化审核速度——先确认了一遍：**`商品审核`全程不调用任何 AI/大模型接口**，`标题规范`/`错别字与大小写`/`Description`/`明显内容错误`都是纯正则+字符串规则（`titleChecks`/`languageChecks`/`descriptionChecks`/`majorContentChecks`），价格一致性是纯数值比较，`图片背景`/`Color Swatch` 是本地 canvas 像素分析（`classifyBackgroundPixels`/`classifySwatchLikelihood`）。只有"一键优化"才会调 AI，两个功能完全独立、互不影响速度。
  - 真正的耗时瓶颈是 `mediaCheck()`/`colorSwatchCheck()` 里对每张图片的处理是**严格串行**的（`for...of` + `await`），每张图片都要走一次"content script → background.js 转发 fetch → base64 编码 → 传回 content script → decode → canvas 画图取像素"的完整链路；Media 图片常见 20-30 张，色号图片也可能有十几个，串行下来就是 N 次链路耗时的总和，跟图片数量线性叠加，这才是"审核好慢"的真正原因，不是什么算法本身复杂。
  - 修复：加了一个通用的 `mapWithConcurrency(items, limit, fn)`（`content.js`，`delay()` 函数下面），用一个简单的 worker-pool 模式把"同时最多 N 个在跑"这件事包起来，不依赖任何第三方库。`mediaCheck()`/`colorSwatchCheck()` 原来的 `for...of` 循环都换成了 `mapWithConcurrency(candidates/presentRows, 5, ...)`，并发上限先定成 5（图片请求都是各自独立的 `background.js` 消息，不共享状态，并发没有正确性风险；5 是"明显提速但不至于同时打开几十个请求"的折中，后续如果还觉得慢可以再调大）。返回结果顺序不受并发影响（worker 按下标写回，不是谁先完成谁先进数组），审核卡片里图片顺序跟以前完全一样。
  - 验证方式：`node --check content.js` 语法检查通过；单独把 `mapWithConcurrency` 的实现抽出来在 Node 里跑了一遍正确性 + 耗时验证（12 个任务、并发 5、每个 50ms，实际总耗时约 180ms，跟串行需要的 600ms 对比明显更快，且结果顺序完全正确）；`tests/tests.html` 41/41 仍然全过（这次改动没有碰任何被测的纯函数，只是改了调用它们的循环结构）。**没有验证过的部分**：这台机器现在拿不到真实登录态的 EH 页面，没法在真实商品详情页上量出改之前/改之后的具体秒数差异——这个需要用户自己在真实页面上跑一次"审核当前商品"确认效果和结果是否跟以前一致。
  - 顺带发现 `HANDOFF.md` 里"这台开发机没有装 Node"这条记录已经过期了（现在装了 Node v24），后面如果需要更可靠的语法/单测验证可以直接用 `node --check`，不用再完全依赖浏览器预览。

### 3. 一键优化 Title / Description（AI 生成文案）

运营端 Catalogue 商品详情页新增「一键优化」按钮（位于「商品审核」工作区，审核结果下方），按 JustFab 前端内容规范（约 30 个品类的标题公式 + 属性列表，编码在 `shared/optimize-templates.js` 里）生成建议 Title/Description：

- 品类识别，两级兜底：
  1. 优先读取 Basic Info 里的品类面包屑（`content.js` 的 `gatherOptimizeData()`），用 `EHAssistantOptimizeTemplates.match()` 从面包屑最深一级往上逐级匹配模板。**2026-09-05 在真实 EH 商品页上核实过实际 DOM 结构后修了一个根因 bug**：Basic Info 里渲染的其实是"`Mapping Categories`（分组标题，不是字段）→ `Brand Category`（真正的字段名）→ `Fashion>>Clothing>>Sweaters>>Cardigans`（值）"这样一个三层结构，之前代码写的是 `readBasicValue("Mapping Categories")`，实际读到的是下一行的字符串 `"Brand Category"` 本身（因为 `readBasicValue` 是"找到这一行文本，返回下一行"的简单实现），根本不是品类路径，所以这条面包屑匹配路径此前基本总是失败，全靠下面第 2 步的文本兜底在硬撑。现在已经改成 `readBasicValue("Brand Category")`，能正确读到 `Fashion>>Clothing>>Sweaters>>Cardigans` 这样的真实路径了。
  2. 读不到、格式不符预期、或该品类不在规范表里时，退而用 `EHAssistantOptimizeTemplates.matchByText(title, description)` 从商品**现有的** Title/Description 猜品类：规范表里几乎每个品类的标题公式都以"...+ 品类词"结尾，所以这个函数会把标题最后 1～3 个词的关键词命中权重设得比标题其它位置/Description 里的命中高得多——这样才能正确处理"Sport Fleece Relaxed Pullover Hoodie"这种标题开头出现了另一个品类词（Sport 品类）、但真正品类应该是结尾的 Hoodie 这种情况，不会被开头的风格词带偏。
  3. 两级都猜不出来（或猜出来但有歧义）时，才会展示一个品类下拉框让运营人员手动选择。
- 事实来源：只把商品**现有的** Title/Description 文本发给 AI 作为事实依据，Prompt 里明确要求"不得凭空编造材质/规格等给定内容之外的事实"。不读取 Product Attribute 表格，也不发送任何图片。2026-09-05 在真实商品页上确认过，这个决定是对的：Product Attribute 区域展示的是"该品类所有可能的属性名"（比如一件毛衣的页面上会同时列出 Heel Height、Toe Type 这种明显是鞋类才用的属性名），绝大多数字段对当前商品其实是空的，只有极少数（比如 Gender: Women）真正填了值。纯文本行扫描没法可靠区分"这行是空属性的标签"还是"下一个属性的标签"，贸然解析很容易把无关属性名当成上一个属性的值，这也是当初没有基于它构建通用读取函数的原因。
- 调用方式：`popup.js` 拼好 Prompt 后，通过 `chrome.runtime.sendMessage({type:"EH_ASSISTANT_CALL_AI", provider, apiKey, model, prompt})` 交给 `background.js`（Service Worker，无页面 CSP 限制）去调用对应服务商的接口。`background.js` 里的 `AI_PROVIDERS` 表按 `provider` 字段分别配置 endpoint、默认 model 和响应文本提取方式，四个 endpoint 都是硬编码的已知地址，不会被消息里的任意输入指向别的域名：
  - `anthropic`：`https://api.anthropic.com/v1/messages`，用的是 Anthropic 官方为浏览器直连场景提供的 `anthropic-dangerous-direct-browser-access` header，默认 model `claude-sonnet-5`。
  - `openai`、`deepseek`、`company`：三个都是 OpenAI 兼容的 chat completions 接口（`Authorization: Bearer <key>`），共用同一套请求/响应拼装逻辑（`openAiCompatibleProviders()` 工厂函数），只是 endpoint 和默认 model 不同：OpenAI → `https://api.openai.com/v1/chat/completions` / `gpt-4o-mini`；DeepSeek → `https://api.deepseek.com/chat/completions` / `deepseek-chat`；`company`（2026-09-09 加，公司运维发的内部 LiteLLM 网关，代理 DeepSeek V4 Pro）→ `https://litellm.wangoon.cn/v1/chat/completions` / `JF Merchant Center Management-deepseek-v4-pro`——注意这个默认 model 字符串带空格，是公司文档里明确要求原样使用的展示名，不是精简的 `deepseek-v4-pro` 这个 API 标识；Key 是公司运维私发的 LiteLLM Virtual Key，同样只存在 `chrome.storage.local`，不会写进代码仓库。
  - 要求 AI 只输出 `{"title":..., "description":...}` 这个 JSON；解析失败时原样展示 AI 返回的文本并提示"格式异常，请人工核对"，不强行拆解。
  - **真实 bug，2026-09-09 修**：接入公司网关后用户实测反馈"AI 返回内容为空"。直接拿公司给的 Key 对着网关发真实的一键优化 Prompt 复现，发现网关背后的 `deepseek-v4-pro` 是"推理模型"，请求返回 `finish_reason: "length"`、`reasoning_tokens: 1024`（正好等于当时的 `max_tokens`）——模型把整个 token 预算全花在了看不见的内部推理上，一个字都没来得及写进正式回答里，`content` 自然是空的。原来 `max_tokens: 1024` 这个值对非推理模型（GPT-4o-mini、Claude 等）够用，但推理模型光是"思考"就可能用掉一两千 token。修法：把 `max_tokens` 统一提到 `MAX_COMPLETION_TOKENS = 8192`（对所有服务商生效，不只是公司网关）——这只是一个上限，不是目标值，模型该多短就多短，真实计费按实际生成的 token 数走，调高上限本身不产生额外成本。同时给"AI 返回内容为空"这个报错加了 `finish_reason` 诊断信息（`extractFinishReason()`），如果还是被截断，报错里会提示"模型把 token 预算全用在内部推理上了"，不用再靠猜。
  - 用户随后反馈"公司网关比直连 DeepSeek API 慢很多"：拿同一个 Key 查了 `GET /v1/models`，确认这个 Virtual Key 目前只挂了 `JF Merchant Center Management-deepseek-v4-pro` 这一个推理模型，网关侧没有更快的非推理模型可切换——所以变慢是模型档位本身的问题（推理过程要生成大量看不见的 token，逐字生成，跟公司网关这一层代理本身的网络开销关系不大），不是插件或网关的 bug。真要更快，要么用户自己申请官方 DeepSeek API Key 走插件里已有的"DeepSeek"选项（默认 `deepseek-chat`，非推理，快很多），要么找公司运维在同一个 Key 下加一个非推理档位的模型部署。为了不让用户误以为卡住，`popup.js` 里"一键优化"生成中的状态提示加了一句"如果服务商用的是推理类模型，这一步可能要等 30-90 秒"。
  - 后续用户拿到内部消息说网关上还有一个 `JF Merchant Center Management-deepseek-v4-flash`（应该是更快的非推理档位），让试试。直接拿 Key 请求这个模型名，网关返回的是 `403 key_model_access_denied`（"This key can only access models=['...v4-pro']"）——说明这个模型在网关侧确实存在，只是这个 Virtual Key 还没被授权访问，不是模型名写错，也不是插件这边的问题，需要用户找运维把 `v4-flash` 加到这个 Key 的可用模型列表里。等运维开通、且用户确认这个模型确实更快之后，可以把它也加进 `popup.js` 的 `AI_PROVIDER_MODELS.company` 预设列表；在那之前用户可以先用"自定义"选项手动填这个模型名试。
  - **2026-09-20，运维开通 `v4-flash` 权限后，用户反馈"还是慢"，这次真的挖到了根**：
    - 先确认用户没配错——截图显示 Model 已经手动切到"自定义"、`v4-flash` 拼写完全正确。直接拿 Key 对 `v4-flash` 测了真实优化 Prompt：**15.7 秒**，返回 `usage.completion_tokens_details.reasoning_tokens: 1275`——`v4-flash` 依然是个推理模型，只是比 `v4-pro`（之前测的同类 Prompt 要一分多钟、1926 个推理 token）轻一些，不是真正的非推理快速档。
    - 用户接着怀疑"是不是网关转了一手"。用一个不涉及生成、只读的接口（`GET /v1/models`）单独测了网关本身的往返延迟：**101 毫秒**。又对比两次生成请求的吞吐：简单请求 392 token/4981ms ≈ 78 token/秒，真实 Prompt 1358 token/15703ms ≈ 86 token/秒——两次速率基本一致，说明耗时几乎完全正比于要生成的 token 数量，不存在"网关转发"带来的固定延迟。结论：慢的是模型自己老老实实"边想边写"，不是网络路径的问题。
    - 关键突破——**这个网关的报错信息意外暴露了后端实际是阿里云 DashScope**（测 `reasoning_effort` 参数时报错 `litellm.UnsupportedParamsError: dashscope does not support parameters...`）。DashScope 的混合推理模型（Qwen 系列同款机制）支持一个 `enable_thinking: false` 参数来关闭思考过程，试了一下——**真的支持**：同样的真实优化 Prompt，加上这个参数后从 15.7 秒降到 **1.8 秒**，`usage` 里完全没有 `reasoning_tokens` 字段（没思考，直接答），JSON 格式和内容质量跟之前推理版本的结果基本一致。这是个数量级的提速，不是微调。
    - **已经把这个改成默认行为**：`background.js` 里给 `openAiCompatibleProviders()` 工厂加了个 `extraBody` 扩展点（原来的 `buildRequest` body 拼装 `...this.extraBody` 展开），只有 `company` 这一个 provider 配了 `extraBody: { enable_thinking: false }`——`openai`/`deepseek` 两个官方接口完全不受影响（用 Node 直接跑过 `buildRequest`，确认了 `deepseek` 的请求体里没有多出这个字段，`company` 的请求体不管选哪个 model 都会带上）。之所以只加在 `company` 上而不是全局：这个参数是 DashScope 专属的，官方 OpenAI/DeepSeek API 收到不认识的字段有没有可能报错没有实测过，没必要冒这个险。
    - `company` provider 的 `defaultModel` 顺手从 `v4-pro` 改成了 `v4-flash`（因为用户这个 Key 现在只有 `v4-flash` 权限了，测 `v4-pro` 直接 403，说明运维那边是把权限从 `v4-pro` 换成了 `v4-flash`，不是新增），`popup.js` 的 `AI_PROVIDER_MODELS.company` 预设列表也加了这两个模型的选项（默认 flash，标注了"快"；v4-pro 选项标注了"慢，Key 若只授权 flash 会 403"）。
    - 验证方式：直接拿真实 Key 对 `https://litellm.wangoon.cn/v1/chat/completions` 做的 diagnostic fetch（`enable_thinking:false` 前后对比、`GET /v1/models` 测网关延迟）；`node --check background.js`/`popup.js` 语法检查；单独在 Node 里跑了一遍 `buildRequest` 的输出，确认 `extraBody` 只影响 `company` 不影响 `deepseek`；`tests/tests.html` 41/41 依旧全过（这次改动不涉及任何被测的纯函数）。**没法在这里验证的部分**：`enable_thinking:false` 对复杂度更高、字段更多的真实商品（尤其是描述里属性列表很长的品类）会不会因为跳过推理而略微降低文案质量，需要用户实际用几个不同品类的商品跑几次"一键优化"抽查一下结果，如果发现明显变差，告诉我，可以考虑做成一个可选开关而不是强制默认关闭思考。
- 结果呈现：侧边栏展示品类、建议 Title（附词数提示）、建议 Description，Title 和 Description 各配一个「复制」（`navigator.clipboard.writeText`）、一个「一键填入」和一个「翻译」按钮。
- 「一键填入」（2026-09-05 加）：`popup.js` 的 `fillIntoEditor()` 发消息给 `content.js` 的 `EH_ASSISTANT_FILL_EDITOR_TITLE`/`EH_ASSISTANT_FILL_EDITOR_DESCRIPTION`，只把内容写进 Editor 对应输入框，绝不点击任何 Save/Submit 控件：
  - Title 是真实的 `<input>`，而且这个页面很可能是 React 驱动的（Ant Design 组件），直接设置 `.value` 只改 DOM、不会触发 React 自己的状态更新，字段可能在下一次渲染时静默"跳回"原值。`fillEditorTitle()` 用的是"抓原生 setter + 手动派发 `input`/`change` 事件"这个标准 trick（`setNativeInputValue()`），让 React 的 `onChange` 能收到这次变化。
  - Description 是富文本 contenteditable 框（不是普通 `<input>`/`<textarea>`，这一点在读取逻辑的注释里早就确认过）。富文本编辑器通常有自己的一套内部文档模型，直接改 `textContent`/`innerHTML` 很容易跟编辑器内部状态失步。`fillEditorDescription()` 改用选中全部原内容 + `document.execCommand("insertText", ...)`，模拟一次真实的粘贴/输入，大多数富文本框自己的输入监听器都认这种方式。**这一条目前没有在真实 EH 页面上验证过**，如果这个 Description 框背后是某些对 `execCommand` 支持不好的富文本框架（比如某些 Slate.js 配置），可能填不进去或者跟内部状态对不上；两个函数都会在填入后立刻回读校验一遍，校验不通过时 `filled: false`，popup 会提示改用「复制」按钮手动粘贴，不会误报成功。
  - 找 Title 输入框/Description 编辑框都复用同一个 `findFieldNearLabel(container, labelText, selector)`：在 Editor 容器内找到跟 label 文本完全匹配的叶子节点，再按纵向距离找最近的目标元素——这是从原来专门给 Title 写的proximity 逻辑抽出来的通用版本，Provided-by 那一列同名 label 不会被误选中。
- 「翻译」（2026-09-05 加）：运营人员英文阅读门槛的问题——Title/Description 各多一个「翻译」按钮，点击后调用同一套 `callAi()`（复用已配置的服务商/Key）把这段英文文案翻成中文，展示在文字和操作按钮之间的一个浅色小方块里（`.optimize-translation`）。这是**按需翻译**，不是每次生成都自动带出来的：一是没必要让每次生成都多付一次翻译的 token 成本，二是操作上更接近"复制/填入"这类可选动作而不是必须看到的内容。按钮第一次点击才会真的调用 AI，翻译结果缓存在这个方块的 `dataset.translated` 上，第二次点击只是切换显示/隐藏，不会重复调用。翻译用的是纯文本 Prompt（不是 JSON），直接把 AI 返回的文本掐头去尾当译文用，没有再走一遍 `parseOptimizeAiText` 那套 JSON 解析。
- API Key 与 Model：设置面板（齿轮按钮）里先选服务商（Anthropic / OpenAI / DeepSeek / 公司 AI 网关），API Key 是必填文本框；Model 是下拉菜单，选项跟随所选服务商变化（`popup.js` 的 `AI_PROVIDER_MODELS`），列表最后一项固定是「自定义...」，选中后才会出现一个文本框允许输入任意 model id——这是为了在服务商上线新模型、这里的列表没来得及更新时仍然可用，不必等代码改动。保存在 `chrome.storage.local`（key: `ehAssistant:aiConfig` = `{provider, apiKey, model}`）。**这个 Key 是明文存在本机浏览器本地存储里的，没有加密**——对这种只供你自己使用、Key 由你自己配置的本地工具是可接受的取舍，但如果这台电脑给别人用过，要提醒对方这一点。
- 2026-09-02 晚些时候：用户反馈这个设置面板视觉权重太大（跟旁边"一键优化"按钮抢注意力），而且切换服务商/Model 后不知道要点保存才生效。改成了**没有保存按钮、逐字段自动保存**：切换服务商会清空 API Key 输入框（避免把上一个服务商的 key 误存成新服务商的）并在面板底部的 `#aiSettingsHint` 提示"请填写 XX 的 API Key"；填完 Key 失焦（`change` 事件）、切换 Model 下拉、或填完自定义 Model ID 失焦，都会立刻自动保存并把提示变成绿色的"已自动保存 ✓"；选了"自定义..."但还没填内容时不会保存，提示会说"请填写自定义 Model ID"。面板本身也从跟审核结果卡片同款的实心边框卡片，改成了一条虚线分隔 + 无背景的轻量抽屉样式，视觉上明显比之前"轻"。以后如果再往这个面板加字段，记得也接入 `maybeAutoSaveAiConfig()` 这一套，不要重新加保存按钮。
- 紧接着又反馈：齿轮按钮展开面板后缺少"可以收起"的视觉引导。加了一个行业通用的 chevron（人字箭头）：`#aiSettingsToggle` 里齿轮图标旁多了一个小箭头 `<svg class="chevron">`，通过 CSS `.icon-button[aria-expanded="true"] .chevron { transform: rotate(180deg); }` 在展开/收起时旋转朝上/朝下；`popup.js` 的点击处理器同步维护这个按钮的 `aria-expanded` 属性和 `title`（"展开 AI 设置"/"收起 AI 设置"）。这个 `aria-expanded` + 旋转箭头的组合是通用的可展开面板模式，以后其它地方如果也要做类似的展开/收起交互，应该复用同一套写法。
- 2026-09-02：用户的 Anthropic API 额度用完了，问有没有免费的替代，加了 DeepSeek（新账号有一次性 500 万 token 免费额度，之后按量计费但单价很低）和 Groq（个人使用真免费，按速率限制不按额度限制）。同一天晚些时候用户又要求把 Groq 删掉（只保留 Anthropic / OpenAI / DeepSeek 三个），原因未详细说明，照做即可，不用再加回去。

## 当前 UI 状态

- 插件运行在 Chrome Side Panel 中，点击 EH 页面时不会自动关闭。
- `待办巡检`和`商品审核`已经拆分为两个独立工作区。
- 插件会记住上次打开的工作区。
- 用户正在使用 Figma 探索新版 UI；已经用一版 Figma AI 生成稿子做过参考，但用户不满意整体视觉方案，只采纳了其中「待办数字高亮」的思路（已经落地，见上文矩阵表格高亮说明）。
- 后续可能会根据用户提供的 Figma 截图重新实现界面。
- UI 改造时必须保留现有扫描、统计、图片读取和商品审核逻辑，不要因重构界面破坏已调通的业务流程。
- `popup.css` 已经改为基于 CSS 自定义属性（`--bg-page`、`--text-primary` 等）的浅色/深色双主题结构，深色主题通过 `@media (prefers-color-scheme: dark)` 覆盖同名变量实现，跟随系统主题自动切换。新增样式请复用已有变量，不要重新写死颜色值，否则会在深色模式下失效。
- 待办总数徽标（header 里的红色数字）已经按用户反馈整个移除，不要再加回来。
- 「专项巡检」三个按钮和「清空记录」现在共用一行（`.section-label-row`），「清空记录」缩小为次要样式（`.compact-button`），不再是满宽按钮；「Catalogue/Pricing/Order」三个按钮也弱化成了浅色次要样式，与醒目的「一键巡检」形成主次对比。这几处都是用户明确要求的视觉调整，改动前请先确认用户是否仍然认可这个方向。
- Merchant 搜索框默认收起，「今日待办」标题右侧多了一个搜索图标（跟 CSV/复制两个图标同一行），点击展开输入框并自动聚焦，再点一次会收起并清空搜索词、恢复完整数据。
- 修复过一个 CSS Grid 溢出 bug：`.summary`/`.card` 之前没有 `min-width: 0`，导致 Merchant 矩阵表格的内容会把整个侧边栏页面撑宽，而不是像预期那样只在 `.matrix-wrap` 自己的框内横向滚动。这个问题在真实 Chrome 侧边栏里可能被浏览器的固定宽度机制部分遮住，但本质上是布局 bug，已经修掉。
- 2026-09-05：`商品审核` 工作区内部又拆出了第二层 Tab（`商品审核` / `一键优化`），因为审核结果和优化结果一旦都展开，两块内容叠在一起会变成一屏很长的滚动页面，视觉上很累。做法是给 `#auditWorkspace` 加了一条 `.workspace-subtabs` 二级导航（`popup.html` 里的 `#auditPanel`/`#optimizePanel` 两个容器，`popup.js` 里的 `setAuditSubWorkspace()`），同一时间只显示其中一块；样式上故意用了下划线风格而不是复用顶层 `.workspace-tab` 的实心药丸样式，让两级 Tab 看起来不是同一种东西。选中状态记在 `localStorage`（key: `ehAssistantAuditSubWorkspace`），下次打开面板会记住。以后如果某个工作区里的内容又开始堆叠变长，这是现成的可以复用的模式。**2026-09-20 起这个二级 Tab 结构已经被拆掉了，见下面新的一条。**
- 2026-09-20：用户反馈"商品审核"和"一键优化"现在挤在同一个工作区下面的二级 Tab 里，想拆开。直接把二级结构拆平成三个平级的顶层工作区（`待办巡检` / `商品审核` / `一键优化`），不再有"进了商品审核还要再选一次一键优化"这一层：
  - `popup.html`：顶部 `.workspace-tabs` 从两个按钮加到三个（`data-workspace="todo"/"audit"/"optimize"`）；原来 `#auditWorkspace` 包裹 `.workspace-subtabs` + `#auditPanel`/`#optimizePanel` 两个 `subworkspace-panel` 的三层结构，拆成 `#auditWorkspace`（原 `#auditPanel` 的内容）和 `#optimizeWorkspace`（原 `#optimizePanel` 的内容）两个跟 `#todoWorkspace` 同级的 `.workspace-panel`，`preview/popup-preview.html` 同步改了一份。
  - `popup.js`：删掉了 `setAuditSubWorkspace()`、`auditSubTabs`、`auditPanel`/`optimizePanel` 这些二级 Tab 专用的变量和逻辑，以及对应的 `localStorage` key `ehAssistantAuditSubWorkspace`。`setWorkspace()` 改成从"硬编码 todo/audit 两个分支"变成一个 `WORKSPACE_PANELS = { todo, audit, optimize }` 查找表驱动的通用实现，以后如果还要加第四个工作区，只需要在这个表里加一行、`popup.html` 加个按钮和面板，不用再改 `setWorkspace()` 本身的逻辑。
  - `popup.css`：`.workspace-tabs` 的 `grid-template-columns` 从 `1fr 1fr` 改成 `repeat(3, 1fr)`；删掉了整套 `.workspace-subtabs`/`.workspace-subtab`/`.subworkspace-panel` 规则（不再被引用）。
  - 验证方式：`node --check popup.js` 语法检查；浏览器里点过三个顶层 Tab 之间的切换，桌面宽度和手机宽度（375px）下三个 Tab 文字都没有换行/溢出；`tests/tests.html` 41/41 依旧全过；detector 干净。
  - 拆完之后用户反馈三个按钮之间切换"不太自然"，想要"框来回移动"的效果（类似 iOS 分段控件那种滑动高亮块，而不是每个按钮各自瞬间切换背景色）。做法：
    - `popup.html`/`preview/popup-preview.html`：在 `.workspace-tabs` 里加了一个 `<span class="workspace-tabs-indicator" aria-hidden="true">`，放在三个按钮之前。
    - `popup.css`：`.workspace-tabs` 改成 `position: relative`；`.workspace-tab.active` 不再自己设置背景色/阴影，那部分视觉现在完全由 `.workspace-tabs-indicator`（绝对定位、`transition: transform 200ms ease`）来表现；配了 `@media (prefers-reduced-motion: reduce)` 关掉这个 transition。
    - `popup.js`：新增 `updateWorkspaceIndicator(activeButton)`，用 `activeButton.offsetLeft`/`offsetWidth` 量出真实按钮的位置和宽度直接设给指示条的 `transform`/`width`，不是靠猜 grid 的 gap/padding 数值算坐标——这样以后不管是改 Tab 数量还是改内边距，都不用重新推导 CSS calc 公式。`setWorkspace()` 里切换的同时会调这个函数；另外加了个 `window resize` 监听，防止面板宽度变化后指示条位置/宽度跟实际按钮对不上。
    - 中间有个 impeccable 的 detector 真发现了问题：一开始把 `width` 也放进了 `transition` 里（虽然三个 Tab 等宽，实际不会触发，但这是个真实的"动画 layout 属性导致重排"隐患），检测器标了 `layout-transition` 警告，改成只 `transition: transform`（`width` 由 JS 直接赋值，不参与动画），这是唯一该用 `transform`/`opacity` 做动画的教科书场景。
    - 验证方式：截图确认了滑动过程中间帧（指示条真的在按钮之间移动，不是瞬间跳变），切到三个 Tab 各自都验证了指示条落点正确；深色模式 + 手机宽度（375px）下也检查过一遍；改完再跑一次 detector 是干净的；`tests/tests.html` 41/41 依旧全过。
  - 用户要求在插件里加上署名"Created by Leo Hu"。加在 header 右上角、版本号徽标下面（`popup.html`/`preview/popup-preview.html` 的 `.header-meta` 里新增一个 `<span class="author-credit">`；`.header-meta` 从水平排列改成 `flex-direction: column; align-items: flex-end`，版本号在上、署名在下）。第一版给的是 10px，被 detector 标了 `undersized-ui-text`（判定为"功能性文字"而不是"法律小字"，够不到 10px 的软下限），没必要为这一行文字去跟检测器的判断较劲，直接改成 11px 就干净了——跟其他所有已经统一过的小字号一致。
- 2026-09-16：装了 [pbakaus/impeccable](https://github.com/pbakaus/impeccable) 这个设计质量 skill（`.claude/skills/impeccable`，装在项目内、只对 Claude Code 生效，不影响扩展本体），跑了一遍 `audit` 对 `popup.html`/`popup.css`/`preview/popup-preview.html` 做技术性检查（对比度、字号、实现一致性），修了几个真实问题：
  - 深色模式下 `.primary` 按钮（白字 + `--accent` 背景）对比度只有 3.2:1，hover 态更差只有 2.5:1，都不满足 WCAG AA 的 4.5:1；把深色主题的 `--accent`/`--accent-hover` 从 `#5b8cff`/`#7ba0ff` 调深到 `#3d6fe0`/`#2f5bc0`（`--accent-text` 没动，它是文字色不是按钮底色，用在别的地方没有这个问题）。
  - 顶层 `.workspace-tab:hover` 之前写死 `background: rgba(255,255,255,0.6)`，浅色模式下是"变浅一点"的效果，但深色模式下会把按钮整个刷成接近白色的浅灰（约 `#a6a8ac`），而文字颜色是给深色底设计的浅灰字（`--text-secondary`），叠在一起对比度只剩 1.0:1，等于 hover 时文字基本看不见。这是这次唯一一个检测器只报了色值、需要反推才能定位到具体规则的真 bug；改成 `background: var(--bg-hover)`（本来就有浅/深两套取值）。
  - 一批 10px 的功能性文字（设置面板的字段标签、审核/优化区的徽标、`meta`、词数提示、表格单元格等）低于可用性下限，统一提到 11px。
  - `.optimize-block` 之前用左侧 3px 彩色粗边框（AI 生成 UI 最常见的一种"糊弄"视觉套路），改成跟 `.audit-result`/`.card` 一致的四边细边框卡片，顺带让「一键优化」区域和其他卡片视觉上更统一。
  - 顺手发现「复制 Title / 一键填入 / 翻译」这三个按钮一直用的是 `.ghost`（危险色，红色边框+红字），跟"停止巡检"「清空记录」这些真正有风险的操作用的是同一个样式——等于把最常点的安全操作做成了警告色，还稀释了红色在真正危险操作上的信号。去掉了这三个按钮的 `.ghost`，改用默认中性按钮样式。
  - 字体栈开头的 `Inter` 从没有真正加载过（没有 `@font-face`/Google Fonts），Chrome 一直是回退到 `"Segoe UI"` 渲染，这条声明纯粹是误导性死代码，删掉了。
  - 验证方式：`tests/tests.html` 41/41 仍然全过；在浏览器工具里切了深色/浅色模式和手机宽度分别截图检查，`hover`/`active` 态也手动点过一遍。
- 2026-09-16（同一天，第二轮）：做了一轮轻量的 UX 走查（不是正式的 impeccable `critique` 双 agent 流程，那个太吃 token，用户打断了；改成基于已读代码直接给意见），挑了两个用户认为优先级最高、且成本低的点动手改：
  - **切换 AI 服务商会静默清空 API Key**：这是有意的安全设计（防止把 A 服务商的 key 发给 B），但原来的提示文案「请填写 XXX 的 API Key」看起来跟"从来没填过"一模一样，用户分不清是不是 bug。改成明确点出原因："已切换到 ${provider}，请重新填写对应的 API Key（不同服务商的 Key 不通用，已自动清空）"（`popup.js` 的 `aiProviderSelect` change 监听器）。
  - **一键优化的 AI 调用可能要等 30-90 秒，之前只有一句不会变化的静态提示**：这正是用户之前问"为什么这么慢"的场景，长时间盯着不变的文字容易怀疑卡死。`runOptimizeGeneration()` 现在每秒用 `setInterval` 刷新一次状态文案，带上"（已等待 N 秒）"，成功/失败/`finally` 里都会 `clearInterval` 清掉计时器。用 `window.runOptimizeGeneration()` 直接在 preview 里灌了假数据验证过文案确实在跳（3 秒 → 10 秒），不是摆设。
  - 另外还发现两个更值一提但没动手的点，留给以后：（1）"待办巡检"的主操作是顶部通栏大按钮，"商品审核"的主操作却是标题行旁边的中等按钮，两个工作区的"最重要动作在哪"不一致；（2）"一键填入"（真的会写入 EH 页面）跟"复制"/"翻译"（纯只读）现在视觉权重完全一样，误点后果却不同。
  - 用户随后要求把这两个也改了：
    - `.audit-button`（`审核当前商品`/`一键优化` 共用的按钮样式）加了 `min-height: 40px; font-weight: 700;`，视觉分量往 `.one-click`（"一键巡检"）靠拢，不需要重排布局结构就能缩小两个工作区"主操作有多显眼"的落差。这是有意的折中：完全统一成同一种布局（比如把审核/优化按钮也挪到标题下面单独一行）改动面更大，风险也更高，先用最小改动把最明显的落差收窄。
    - 新增 `.optimize-fill`（`popup.css`），只给"一键填入"按钮用 `--accent`/`--accent-text` 描边，"复制"/"翻译"保持中性——不用回到危险色，但让唯一一个真的会改 EH 页面内容的按钮，看起来跟另外两个纯只读按钮不一样。`popup.js` 里两处 `data-fill-target` 按钮都加了这个 class。
  - 用户又反馈了三处，都改了：
    - **设置齿轮按钮和"一键优化"主按钮挤在同一行**（前面列的第 2 点）：把 `#aiSettingsToggle` 从 `.optimize-heading-actions`（跟主按钮同一个 flex 行）移到标题文字下面，紧跟在说明文字 `<p>` 后面，变成一个安静的行内文字链接（新增 `.optimize-settings-link`，去掉边框/背景，加了 `AI 设置` 文字标签），`#optimizeProduct` 直接变成 `.audit-heading` 的第二个子元素，跟"商品审核"tab 的结构完全一致了。旧的 `.optimize-heading-actions` 规则已删除（不再被引用）。`popup.html` 和 `preview/popup-preview.html` 两处结构手动同步改了（提醒：**这两个文件的 HTML 骨架是手动镜像的，不是共享同一份**，只有 `popup.js`/`popup.css` 是两边真正共用的文件——这次改完才想起来验证的时候preview 一开始没反应过来，排查了一下才想起这茬）。
    - **一键填入按钮的颜色**：撤回上一轮加的 `.optimize-fill` 描边样式，恢复成跟"复制"/"翻译"完全一样的中性样式（用户明确要求撤回，不是发现新问题）。
    - **按钮文案精简**：`popup.js` 里"复制 Title"/"复制 Description" 改成统一的"复制"（点击后的状态提示文案不受影响，因为那部分逻辑读的是 `data-copy-target` 属性，不是按钮文字）。
  - 顺手用 `impeccable hooks ignore-value` 给 `tiny-text`/`11px body text` 这条在 `popup.html` 和 `preview/popup-preview.html` 上加了范围限定的忽略规则（`.impeccable/config.json`），原因就是上面记录过的"密度优先于通用建议"的决定，不然设计钩子会在这两个文件的每次改动后都重新报一遍。
  - 用户看了实际截图后又反馈两处"看着乱"，都是纯删除、没有替代内容：
    - 删掉了"待办巡检"标题下面的副标题文字"按 Merchant 汇总 Catalogue、Pricing 与 Order 待办"（`popup.html`/`preview/popup-preview.html`，`商品审核`/`一键优化` 两个工作区的标题下说明文字保留，因为那两处的说明还有实际信息量——品类/AI 相关的功能不像"待办巡检"这么自解释）。
    - 删掉了汇总卡片里的"今天还没有新的扫描结果，以下是最近一次...建议重新运行一键巡检"这条黄色提示（`popup.js` 的 `render()`，连带清掉了只服务于它的 `isStale` 变量和 `popup.css` 里的 `.meta.stale-note` 规则）。数据是否过期，现在只靠专项巡检按钮下面那一条更低调的状态提示行（"今天还没有巡检记录，正在显示 XX 的最近一次结果"）来说明，不再重复提示两遍。

## 关键文件

- `manifest.json`：扩展版本、权限、Side Panel、内容脚本和图片域名权限。版本号只需要改这一处。
- `popup.html`：Side Panel 页面结构。
- `popup.css`：Side Panel 视觉样式与表格布局，浅色/深色双主题变量定义在文件顶部 `:root` 和 `@media (prefers-color-scheme: dark)` 里。
- `popup.js`：界面状态、巡检调度、本地存储、日报、CSV 导出、Merchant 搜索/排序、同比昨日趋势、商品审核结果展示及截图备用逻辑、一键优化的 Prompt 拼装/AI 调用/结果展示/品类兜底选择/AI 设置面板。
- `content.js`：EH 页面识别、Merchant 遍历、tab 切换、数量读取、商品内容审核和图片分类、一键优化所需商品数据读取（`gatherOptimizeData()`）；文件末尾有一个仅供测试使用的导出钩子（`window.__EH_ASSISTANT_TEST__` 为 true 时才会挂载 `window.__ehAssistantInternal`，暴露了纯函数检查、色块判断和 `loadCandidateImage` 供临时验证图片域名白名单是否命中），真实 EH 页面上不会触发。
- `background.js`：Side Panel 配置、受限图片域名的后台读取，以及一键优化功能对 Anthropic / OpenAI / DeepSeek 三个 AI 服务商接口的后台调用（`AI_PROVIDERS` 表，endpoint 硬编码，不接受任意域名）。
- `shared/background-classifier.js`：`content.js` 和 `popup.js` 共用的图片背景色判定核心算法。
- `shared/optimize-templates.js`：一键优化功能的品类模板数据（约 30 个品类的标题公式/示例/Description 属性列表）+ 两个纯函数品类匹配逻辑——`EHAssistantOptimizeTemplates.match()`（按 Mapping Categories 面包屑匹配）和 `matchByText()`（按 Title/Description 关键词猜品类的兜底逻辑），`popup.html` 和 `tests/tests.html` 都会加载。
- `tests/tests.html` + `tests/tests.js`：纯函数单元测试（标题/描述检查、价格一致性判断依赖 DOM 未纳入、`Media` 背景色分类、Color Swatch 色块图判断、一键优化的两个品类匹配函数 `EHAssistantOptimizeTemplates.match()`/`matchByText()`）。这套测试没有配套的 `package.json`/构建流程（`npm test` 走不通），就算这台机器现在装了 Node，也是直接在 Chrome 里打开 `tests/tests.html` 运行最省事，结果显示在页面上。修改 `content.js`、`shared/background-classifier.js` 或 `shared/optimize-templates.js` 里的纯函数逻辑后，应该重新打开这个文件确认仍然全部 PASS。
- `preview/popup-preview.html` + `preview/_serve.ps1`：本地 UI 预览工具，不属于插件本身、不会被 Chrome 加载。用真实的 `popup.html`/`popup.css`/`popup.js` 配合内存版 `chrome.*` mock 和一批模拟数据渲染整个侧边栏界面，用于跟用户对着实时预览做视觉/交互方面的精细化调整，不需要登录真实 EH 或加载扩展。`_serve.ps1` 是一个基于 PowerShell `HttpListener` 的静态文件服务器（监听 `http://127.0.0.1:8792/`），因为这台机器上 `file://` 页面在浏览器工具里只会被当成静态快照渲染、不会真正执行脚本。修改 `popup.html` 里的结构时，如果同一处也在 `preview/popup-preview.html` 里有对应标记，要同步改一份，否则预览会跟真实页面不一致。
- `README.md`：功能与安装说明。

## 图片与网站权限

当前 `manifest.json` 只允许以下站点：

- `https://admin.engagehub.tsostech.com/*`
- `https://engagehub.tsostech.com/*`
- `https://img.engagehub.tsostech.com/*`
- `https://cdn.shopify.com/*`
- `https://prodenv-merchant-public.s3.us-west-2.amazonaws.com/*`

另外还有四个非图片域名：`https://api.anthropic.com/*`、`https://api.openai.com/*`、`https://api.deepseek.com/*`、`https://litellm.wangoon.cn/*`（公司内部 AI 网关，2026-09-09 加），2026-09-02 起为「一键优化」功能新增，只用于调用对应服务商的文案生成接口（`background.js` 里的 `EH_ASSISTANT_CALL_AI` 处理器 + `AI_PROVIDERS` 表），用户在设置面板里选哪个服务商就只会用到哪一个。

不要随意扩展为 `<all_urls>`。新增图片域名时应使用最小范围的精确权限，并解释原因。

`prodenv-merchant-public.s3.us-west-2.amazonaws.com` 是 2026-08-31 新加的：用户反馈某个商品的「图片背景」和「Color Swatch」检查全部显示「人工查看」，原因是"跨域安全限制阻止读取像素"，且截图兜底方案也因为 `activeTab` 权限过期而失败。让用户在真实商品页面右键检查了一张 Media 图片的 `<img src>`，发现该商品的 Media 图片实际存放在这个 S3 桶上，不在原先的两个白名单域名里，所以直接读取像素这条路一开始就走不通、只能碰运气去撤退到会过期的截图方案。加入这个域名后，`content.js` 的 `loadCandidateImage()` 和 `background.js` 的 `allowedImageHosts` 都会把这个域名当作后台读取的白名单来源，不再需要截图兜底。这条经验说明：以后如果又看到"图片背景/Color Swatch 全部人工查看，原因是跨域限制"，第一反应应该是怀疑图片域名不在白名单里，而不是怀疑判断算法本身有问题。

## 开发与验证规范

- 修改前先阅读相关代码，沿用现有结构和命名。
- 保留用户已有改动，不做无关重构。
- 使用小范围、可验证的修改。
- 这台开发机 2026-09-20 起装了 Node（v24），改完 `.js` 文件可以先 `node --check <file>` 做个语法检查兜底（之前这里写的是"没装 Node"，已过期）；但依然没有真实的 Chrome 扩展环境，所以功能性验证还是要靠「浏览器里跑起来验证」：
  - 纯函数逻辑（标题/描述检查、背景色分类）改动后，打开 `tests/tests.html` 确认全部 PASS。
  - 涉及 UI 交互的改动，可以用一个本地静态文件服务器（比如临时起一个基于 PowerShell `HttpListener` 的脚本）把 `popup.html`/`popup.js` 用真实的 `<script src>` 方式跑起来，配合一个内存版 `chrome.*` API mock 做集成验证（历史上验证 v0.16.0 这批改动时用过这种办法，验证完会清理掉临时文件，不会留在仓库里）。
  - 直接用 `file://` 打开本项目内的 HTML 文件，在这个环境的浏览器工具里会被当成静态快照渲染、不会真正执行脚本，所以不能作为验证手段。
- 涉及 UI 时在约 360–500px 的 Side Panel 宽度下检查文字溢出、横向表格、加载状态和结果状态；同时用浏览器工具的深色模式模拟（或 `prefers-color-scheme: dark`）检查一遍，确认没有写死的颜色导致深色模式下不可读。
- 修改 `manifest.json` 的版本或权限后，提醒用户在 `chrome://extensions/` 重新加载扩展并刷新 EH 页面。功能性改动（哪怕很小）都建议顺手把 `manifest.json` 的版本号往上跳一格，方便用户确认重新加载是否生效。
- 调试 EH 时只执行只读操作，不触发任何业务流程。

## 给接手模型的第一条任务

请先完整阅读本项目和上述关键文件，然后输出：

1. 你对项目目标和安全边界的理解。
2. 当前代码结构及各文件职责。
3. 已实现的巡检和商品审核流程。
4. 可能存在的技术风险，但暂时不要修改代码。

在用户确认总结正确后，再开始下一项开发任务。
