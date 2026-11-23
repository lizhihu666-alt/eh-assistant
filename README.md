# EH Assistant

这是一个只读 Chrome 扩展，用于在 Engage Hub 页面上生成每日待办统计。界面运行在 Chrome Side Panel 中，点击 EH 页面时不会自动关闭。

## 当前功能

- 一键依次完成 Catalogue、Pricing、Order 三个模块的 Merchant 待办巡检。
- 一键自动扫描运营端 Catalogue 的三个待办 tab：New Products、Updated to be Audit、Sync Failure。
- 一键自动扫描运营端 Order List 的三个待办 tab：Awaiting Fulfillment、Partially Fulfilled、Canceled。
- 一键自动扫描运营端 Pricing 的三个待办页面：To be Updated、Pricing Failed Update、Cost Audit。
- 自动读取 Merchant 列表。
- 按 Merchant 外循环、三个待办 tab 内循环读取页面总数。
- 输出 Merchant × 待办类型的矩阵表。
- 在汇总数据和待办数据之间切换。
- 读取页面表格、状态、总数和可见待办信号。
- 按 Merchant / Brand 维度汇总待办数量。
- 将当天扫描结果保存到浏览器本地。
- 生成只包含非零待办 Merchant 的精简中文日报。
- 在运营端 Catalogue 商品详情页执行只读辅助审核：标题、Description、同一 SPU 的价格字段一致性，以及 Media 列纯背景商品图/模特图的灰色背景（场景图不参与背景色检查）。
- 同时检查 Color Swatch Image 列：图片链接不能为空，且应为纯色块图而不是产品实拍图。
- 支持从 EH 图片域名、Shopify 官方 CDN 与商家媒体存储桶（`prodenv-merchant-public.s3.us-west-2.amazonaws.com`）在扩展后台读取 Media 图片并进行本地像素分析；图片不上传、不保存。其他图片源无法读取时，才尝试当前 EH 页面截图作为备用方案。
- EH 图片通过限定域名 `img.engagehub.tsostech.com`、`cdn.shopify.com`、`prodenv-merchant-public.s3.us-west-2.amazonaws.com` 在扩展后台读取，避免网页跨域限制；不申请其他网站的图片访问权限。
- 「一键优化」：按品类规范调用 AI（Anthropic / OpenAI / DeepSeek / 公司 AI 网关 四选一）生成建议 Title/Description，侧边栏里每项都配「复制」和「一键填入」两个按钮——「一键填入」会把内容填进 EH 页面 Editor 的输入框（如同手动输入），但不会点击 EH 自己的保存/提交按钮，填入后仍需你自己确认并保存。需要在设置面板里选择服务商并自行配置对应的 API Key。品类识别会先看页面的品类字段，识别不出来再从商品标题/描述里猜，还是猜不出来才需要手动选择。

## 每日定时巡检（可选，v0.35.0 起）

- 连上本机 Loop 中台（agent-autoloop）后，每天 8:30 由 Loop 叫醒插件，插件单独开一个 EH 窗口，依次巡检 Catalogue、Pricing、Order，统计口径与侧边栏「一键巡检」相同，结果写进侧边栏当天记录，并把只含非零待办的日报交给 Loop 发到飞书。
- 全程只读：只切换 Merchant 和待办 tab、读总数；分段运行（每段约 2.5 分钟，Loop 20 秒后叫醒接着跑），中途被打断会从断点继续；选不中的 Merchant 跳过并在日报里写明；EH 登录过期时飞书会收到卡片，登录后点「已登录，接着巡检」继续。
- 设置：`chrome://extensions` → EH Assistant → 详细信息 → 扩展程序选项，填 Loop 地址、接单名 `eh-extension`、接单密钥并勾选启用。不填即关闭，其他功能不受影响；密钥只发往本机地址。
- 代码：`shared/daily-scan.js`（巡检）、`shared/loop-worker.js`（Loop 接单）、`background.js` 末尾（接线）、`options.html` / `options.js`（连接设置）。

## 使用方式

1. 打开 Chrome 的 `chrome://extensions/`。
2. 开启右上角 `Developer mode`。
3. 点击 `Load unpacked`。
4. 选择本目录：`C:\Users\leohu\Documents\Codex\eh-assistant-mvp`。
5. 打开任意运营端 EH 页面，点击浏览器右上角的 `EH Assistant`，Chrome 会在右侧打开常驻面板。
6. 点击 `一键巡检`，扩展会依次完成 Catalogue、Pricing、Order 三个模块的 Merchant 待办扫描。
7. 也可以使用三个独立扫描按钮，只重新扫描指定模块。
8. 点击 `复制待办日报`，粘贴到飞书、邮件或文档。日报只包含至少一项待办数量大于 0 的 Merchant。
9. 打开运营端待审核商品详情页，点击 `审核当前商品`。插件会读取页面并切换到 Media 检查图片，不会提交审核结果。

商品辅助审核会在页面脚本未加载时自动注入当前版本，无需依赖手动刷新商品页。

Side Panel 打开后，可以继续点击和查看 EH 页面，面板不会因为失去焦点而关闭。再次点击扩展图标可以快速打开面板。

## 建议扫描页面

- 运营端 Catalogue 的三个待办 tab。这个已支持一键自动扫描。
- 运营端 Pricing 的三个待办页面。这个已支持一键自动扫描。
- 商家端 FeedsList。
- 商家端 Orders。
- 商家端 Orders Sync Failures。

## 安全边界

- 扩展只读取页面内容，并操作 Merchant 筛选、待办 tab、Pricing 页面入口和只读分页。
- 不会点击 Approve、Reject、Retry、Save、Submit、Fulfill、Cancel Order 等业务操作。
- 不会提交、审核、发货、取消订单或修改任何数据。
- 统计结果只保存在本地浏览器。
- 「一键优化」是唯一会把数据发到扩展之外、也是唯一会改动页面输入内容的功能：只发送商品现有的 Title/Description 文本给你选择的 AI 服务商（Anthropic / OpenAI / DeepSeek / 公司 AI 网关）生成文案建议，不发送图片；生成结果可以「一键填入」EH 页面 Editor 的输入框，但插件不会点击 Save/Submit，是否保存、何时保存仍由你自己决定。
