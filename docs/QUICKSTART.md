# 快速上手（3 分钟）

## 1. 安装

下载发布包 rcdream-hub-0.1.2.zip 解压，双击 pp\启动.cmd。  
或用一键脚本（发布到 GitHub 后）：

`powershell
irm https://github.com/YOUR_NAME/arcdream-hub/releases/latest/download/install.ps1 | iex
`

## 2. 打开

浏览器访问 <http://127.0.0.1:8799/>。

## 3. 设置

右上角 **⚙**：

- 运行模式：多模态（星图+检索）/ 单序列（陪伴形态）；
- 工作区目录：点「选择目录…」弹 Windows 原生文件夹框，可加多个；
- 模型 API：选 DeepSeek / 豆包 / OpenAI / 自定义，填 Key 后点「测试连接」。

## 4. 搜索 / 打开

顶部搜索框输入文件名或路径片段 → 点结果 → 弹出资源管理器并定位。

## 5. H5

同一页面访问 <http://127.0.0.1:8799/m>（手机用局域网地址）。

## 常见问题

- **设置里测试连接报「not found」**：说明你打开的是本地文件（ile://），不是服务版页面。先运行 pp\启动.cmd，再打开 http://127.0.0.1:8799/。
- **搜不到文件**：进设置加工作区目录；索引在后台构建，可访问 /api/index/status 查看进度。
- **想换数据目录**：用环境变量 ARC_HUB_DATA 指向新目录（或安装时选）。
