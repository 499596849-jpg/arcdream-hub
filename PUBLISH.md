# 发布到 GitHub（10 分钟，含一键下载）

本目录就是仓库内容，可直接上传。发布包里已带：文档、截图、安装向导、插件、GitHub Actions。

## 0. 你需要

- 一个 GitHub 账号；
- 本目录（`release/arcdream-hub/`）；
- 发布包 `dist/arcdream-hub-0.1.2.zip`。

> 本机没装 Git 也能做，用网页上传即可。

## 1. 新建仓库

1. 打开 <https://github.com/new>；
2. Repository name：`arcdream-hub`；
3. 选 **Public**；
4. 不要勾 "Add a README"（我们已有）；
5. Create repository。

## 2. 上传文件（网页拖拽）

1. 在空仓库页点 **uploading an existing file**；
2. 把本目录 `release/arcdream-hub/` 里的**全部内容**拖进去（含 `app/` `plugin/` `install/` `docs/` `.github/` README LICENSE .gitignore PUBLISH.md CONTRIBUTING.md SECURITY.md）；
3. Commit changes。

检查：仓库首页应显示 README 和 4 张截图（`docs/screenshots/`）。

## 3. 改一键安装地址

编辑 `install/install.ps1` 第 3 行的默认仓库地址：

```powershell
[string]$Repo = "https://github.com/你的用户名/arcdream-hub",
```

改成你的仓库并提交。这样别人执行安装脚本时不用带参数。

## 4. 创建 Release（挂载安装包）

1. 仓库页右侧 **Releases** → **Draft a new release**；
2. Tag：`v0.1.2`，Target：`main`；
3. Title：`ArcDream Hub 0.1.2`；
4. 描述可粘贴 `docs/RELEASE_NOTES-0.1.2.md` 的内容；
5. 上传资产：`dist/arcdream-hub-0.1.2.zip`；
6. Publish release。

## 5. 别人的一键安装命令

```powershell
irm https://github.com/你的用户名/arcdream-hub/releases/latest/download/install.ps1 | iex
```

（`install.ps1` 必须也在仓库里；上面这行会从仓库默认分支下载。若想从 Release 资产下载，可把 `install.ps1` 也上传到 Release。）

## 6. 可选：用 Git 推送（以后更新方便）

装 Git 后：

```powershell
cd release\arcdream-hub
git init
git add .
git commit -m "ArcDream Hub 0.1.2"
git branch -M main
git remote add origin https://github.com/你的用户名/arcdream-hub.git
git push -u origin main
```

## 7. 发布前自查

- 不含真实数据：`data/`、`*.enc`、`*.dpapi`、`model.json` 不在仓库里（`.gitignore` 已排除；上传时也不要带 `dist/` 里的安装包以外的东西）；
- 文档里的 `YOUR_NAME` 已替换；
- Release 里 zip 能下载；
- 别人按一键命令能装。

发布后可以加一句 star 引导，也欢迎 PR。
