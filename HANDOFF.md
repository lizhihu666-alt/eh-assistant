# EH Assistant Project Handoff

## 接手说明

这是一个用于 Engage Hub（EH）的只读 Chrome Side Panel 扩展，面向电商运营人员。接手后请先阅读本文件、`README.md`、`manifest.json` 以及现有代码，在确认理解之前不要重写项目。

项目目录：

`C:\Users\leohu\Documents\Codex\eh-assistant-mvp`

当前版本：`v0.16.0`

版本号只需要维护 `manifest.json` 一处：`popup.html`/`popup.js` 会在加载时通过 `chrome.runtime.getManifest().version` 动态读取并显示，不再在多个文件里手写版本号字符串。

## 绝对安全边界

- EH 是真实业务系统，页面中的产品、价格、库存和订单数据不可随意修改。
- 插件只能执行读取、筛选、切换待办 tab 和只读分页等操作。
- 永远不要点击或自动触发 `Approved`、`Rejected`、`Approve`、`Reject`、`Retry`、`Save`、`Submit`、`Fulfill`、`Cancel Order` 等业务操作。
- 不得提交审核、修改商品、调整价格、变更库存、发货或取消订单。
- 商品审核功能只生成辅助提示，最终由运营人员人工判断。
- 图片不上传、不保存；巡检结果仅保存在浏览器本地。

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
- 当天结果保存到 Chrome 本地存储。
- 巡检过程中可点击「停止巡检」中断（一键巡检或单个模块扫描都支持）。中断后本次未完成的扫描结果不会写入存储，此前已保存的数据不受影响。中断信号通过共享的 `cancelRequested` 标志 + `checkCancelled()` 检查点实现，检查点分布在 Merchant 循环、状态/页面循环和 `waitForEhDataReady` 轮询里；一键巡检链式调用三个模块时，取消标志由最外层的一键巡检持有，不会被内部模块扫描提前重置或提前隐藏停止按钮。
- 顶部标题栏显示一个「待办总数」徽标（今天所有模块待办数字之和），以及最后一次扫描的时间（「最后更新 HH:MM」）。
- 每个模块标题旁会显示较昨日的增减趋势（▲增加 / ▼减少 / 持平），仅当本地存有昨天同模块的扫描记录时才显示；没有昨天数据时不显示（不会显示成 0 或 N/A 误导用户）。
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

图片审核规则：

- 只检查 `Media` 列，`Color Swatch Image` 不参与。
- 模特图和纯背景商品图需要检查背景是否接近 `#E8E8E8`。
- 场景图、尺码表及其他信息图豁免背景色检查。
- 当前算法使用角落背景聚类与边缘占比，避免人物触及图片边缘时被误判为场景图。
- 已使用一组真实 EH 图片验证：前 6 张模特图均正确进入背景检查并读取为 `#E8E8E8`，最后 1 张尺码表正确识别为信息图并豁免。
- 支持读取 `img.engagehub.tsostech.com` 和 `cdn.shopify.com` 图片。
- 图片由扩展后台读取后在本地分析，避免网页跨域限制；其他来源才尝试页面截图备用方案。

## 当前 UI 状态

- 插件运行在 Chrome Side Panel 中，点击 EH 页面时不会自动关闭。
- `待办巡检`和`商品审核`已经拆分为两个独立工作区。
- 插件会记住上次打开的工作区。
- 用户正在使用 Figma 探索新版 UI；已经用一版 Figma AI 生成稿子做过参考，但用户不满意整体视觉方案，只采纳了其中「待办数字高亮」的思路（已经落地，见上文矩阵表格高亮说明）。
- 后续可能会根据用户提供的 Figma 截图重新实现界面。
- UI 改造时必须保留现有扫描、统计、图片读取和商品审核逻辑，不要因重构界面破坏已调通的业务流程。
- `popup.css` 已经改为基于 CSS 自定义属性（`--bg-page`、`--text-primary` 等）的浅色/深色双主题结构，深色主题通过 `@media (prefers-color-scheme: dark)` 覆盖同名变量实现，跟随系统主题自动切换。新增样式请复用已有变量，不要重新写死颜色值，否则会在深色模式下失效。

## 关键文件

- `manifest.json`：扩展版本、权限、Side Panel、内容脚本和图片域名权限。版本号只需要改这一处。
- `popup.html`：Side Panel 页面结构。
- `popup.css`：Side Panel 视觉样式与表格布局，浅色/深色双主题变量定义在文件顶部 `:root` 和 `@media (prefers-color-scheme: dark)` 里。
- `popup.js`：界面状态、巡检调度、本地存储、日报、CSV 导出、Merchant 搜索/排序、同比昨日趋势、商品审核结果展示及截图备用逻辑。
- `content.js`：EH 页面识别、Merchant 遍历、tab 切换、数量读取、商品内容审核和图片分类；文件末尾有一个仅供 `tests/tests.html` 使用的测试导出钩子（`window.__EH_ASSISTANT_TEST__` 为 true 时才会挂载 `window.__ehAssistantInternal`），真实 EH 页面上不会触发。
- `background.js`：Side Panel 配置及受限图片域名的后台读取。
- `shared/background-classifier.js`：`content.js` 和 `popup.js` 共用的图片背景色判定核心算法。
- `tests/tests.html` + `tests/tests.js`：纯函数单元测试（标题/描述检查、价格一致性判断依赖 DOM 未纳入、背景色分类）。这台开发机没有装 Node，所以测试不走 `npm test`，而是直接在 Chrome 里打开 `tests/tests.html` 运行，结果显示在页面上。修改 `content.js` 或 `shared/background-classifier.js` 里的纯函数逻辑后，应该重新打开这个文件确认仍然全部 PASS。
- `README.md`：功能与安装说明。

## 图片与网站权限

当前 `manifest.json` 只允许以下站点：

- `https://admin.engagehub.tsostech.com/*`
- `https://engagehub.tsostech.com/*`
- `https://img.engagehub.tsostech.com/*`
- `https://cdn.shopify.com/*`

不要随意扩展为 `<all_urls>`。新增图片域名时应使用最小范围的精确权限，并解释原因。

## 开发与验证规范

- 修改前先阅读相关代码，沿用现有结构和命名。
- 保留用户已有改动，不做无关重构。
- 使用小范围、可验证的修改。
- 这台开发机没有装 Node，跑不了 `node --check` 之类的语法检查，也没有真实的 Chrome 扩展环境。验证代码改动时改用「浏览器里跑起来验证」的办法：
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
