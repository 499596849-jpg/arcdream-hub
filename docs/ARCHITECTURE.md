# 架构

`
┌──────────────┐     ┌───────────────────────────┐
│ 浏览器 / H5   │────▶│ app/server.mjs (127.0.0.1:8799) │
└──────────────┘     │  UI 托管 · /api/* · SQLite 索引 │
                     └───────────┬───────────────┘
                                 │
                     ┌───────────▼───────────┐
                     │ 数据目录 (ARC_HUB_DATA) │
                     │ config / model / index │
                     └───────────────────────┘
        ▲
        │ HTTP /api
┌───────┴──────────────────────────────┐
│ DSH 插件 dsh-arc-hub（Host + Client） │
│ 工具：status/persona/mode/search/open │
│ Client：设置页 + 右下角中枢圆         │
└──────────────────────────────────────┘
`

## 设计取舍

- **零依赖**：只用 Node 内置模块（http、
ode:sqlite、s、child_process），下载即跑，无 npm install。
- **单文件 UI**：pp/public/index.html 内联 CSS/JS，便于分发与改主题。
- **本机优先**：服务只绑 127.0.0.1；模型 Key 用 Windows DPAPI 加密；人设卡 AES-256-GCM。
- **索引是"名字"级**：当前按文件名/路径建 SQLite 索引；全文检索（FTS5 + 中文分词）在 Roadmap。
- **打开目录由本机服务执行**：浏览器无法启动 explorer.exe，所以由本地服务 spawn。

## 安全边界

- 服务只监听本机回环地址；
- /api/file 只允许读取已登记工作区内的文件，且 ≤512KB；
- /api/model 的 GET 永不返回 Key 明文；
- 发布包由 	ools/build_release.mjs 做隐私扫描（命中真实路径/公司名/项目名/昵称/人设卡文件名即中止打包）。
