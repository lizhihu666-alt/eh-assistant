# EH Assistant Project Handoff

## 接手说明

这是一个用于 Engage Hub（EH）的只读 Chrome Side Panel 扩展，面向电商运营人员。接手后请先阅读本文件、`README.md`、`manifest.json` 以及现有代码，在确认理解之前不要重写项目。

项目目录：

`C:\Users\leohu\Documents\Codex\eh-assistant-mvp`

当前版本：`v0.14.0`

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
- 复制精简的中文待办日报。
- 当天结果保存到 Chrome 本地存储。

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
- 用户正在使用 Figma 探索新版 UI。
- 后续可能会根据用户提供的 Figma 截图重新实现界面。
- UI 改造时必须保留现有扫描、统计、图片读取和商品审核逻辑，不要因重构界面破坏已调通的业务流程。

## 关键文件

- `manifest.json`：扩展版本、权限、Side Panel、内容脚本和图片域名权限。
- `popup.html`：Side Panel 页面结构。
- `popup.css`：Side Panel 视觉样式与表格布局。
- `popup.js`：界面状态、巡检调度、本地存储、日报、商品审核结果展示及截图备用逻辑。
- `content.js`：EH 页面识别、Merchant 遍历、tab 切换、数量读取、商品内容审核和图片分类。
- `background.js`：Side Panel 配置及受限图片域名的后台读取。
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
- 修改 JavaScript 后运行语法检查。
- 涉及 UI 时在约 360–500px 的 Side Panel 宽度下检查文字溢出、横向表格、加载状态和结果状态。
- 修改 `manifest.json` 的版本或权限后，提醒用户在 `chrome://extensions/` 重新加载扩展并刷新 EH 页面。
- 调试 EH 时只执行只读操作，不触发任何业务流程。

## 给接手模型的第一条任务

请先完整阅读本项目和上述关键文件，然后输出：

1. 你对项目目标和安全边界的理解。
2. 当前代码结构及各文件职责。
3. 已实现的巡检和商品审核流程。
4. 可能存在的技术风险，但暂时不要修改代码。

在用户确认总结正确后，再开始下一项开发任务。
