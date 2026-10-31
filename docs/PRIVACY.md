# 隐私与数据

本仓库/发布包**不包含任何真实数据**：

- 不含人设卡、加密卡（*.enc）、DPAPI 密钥（*.dpapi）
- 不含文件索引、记忆库、聊天记录、粉丝/高频词数据
- 不含本机绝对路径、用户名或工作区内容
- UI 里的示例节点、粉丝昵称、项目名均为虚构示例

你的数据只会在运行后写到本机数据目录（默认 `%USERPROFILE%\ArcDreamHub`，可用 `ARC_HUB_DATA` 覆盖），并且已在 `.gitignore` 中排除。

## 人设卡加密

- 主密钥 32 字节随机，使用 Windows DPAPI（CurrentUser）保护后存 `data/persona/hela.key.dpapi`
- 人设卡用 AES-256-GCM 加密存 `data/persona/hela-role-card.enc`
- DSH 插件只在内存解密，工具只返回摘要，不提供原文；换 Windows 用户或换机器无法解密

## 发布前自查

`node tools/build_release.mjs` 会执行隐私扫描，出现以下任何字符串即打包失败：
本机路径、公司名、真实项目名、真实昵称、人设卡文件名等。
