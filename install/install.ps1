param(
  [string]$Repo = "https://github.com/499596849-jpg/arcdream-hub",
  [string]$ZipPath = ""
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms

Write-Host ""
Write-Host "=== 弧梦数字中枢 · 安装向导 ==="
Write-Host ""

# 1. 选择数据目录（配置 / 索引 / 记忆都放这里）
$fbd = New-Object System.Windows.Forms.FolderBrowserDialog
$fbd.Description = "选择中枢数据目录（配置、索引、记忆都放这里；建议空文件夹）"
$fbd.SelectedPath = Join-Path $env:LOCALAPPDATA "ArcDreamHub"
$fbd.ShowNewFolderButton = $true
if ($fbd.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  $root = $fbd.SelectedPath
} else {
  $root = Join-Path $env:LOCALAPPDATA "ArcDreamHub"
}
Write-Host "数据目录: $root"
New-Item -ItemType Directory -Path $root -Force | Out-Null

# 2. 取得发布包
if ($ZipPath -and (Test-Path $ZipPath)) {
  $zip = $ZipPath
} else {
  $zip = Join-Path $env:TEMP "arcdream-hub-0.1.2.zip"
  Write-Host "下载 $Repo/releases/latest/download/arcdream-hub-0.1.2.zip ..."
  Invoke-WebRequest -Uri "$Repo/releases/latest/download/arcdream-hub-0.1.2.zip" -OutFile $zip -UseBasicParsing
}

# 3. 解压
Expand-Archive -Path $zip -DestinationPath $root -Force
$seed = Join-Path $root "examples\persona\hela-role-card.md"
if (Test-Path $seed) {
  New-Item -ItemType Directory -Path (Join-Path $root "data\persona") -Force | Out-Null
  Copy-Item $seed (Join-Path $root "data\persona\hela-role-card.md") -Force
}
$app = Join-Path $root "app"
[IO.File]::WriteAllText((Join-Path $app "data-dir.txt"), $root, (New-Object System.Text.UTF8Encoding($false)))

# 4. 选择工作区目录（索引哪些文件，可先跳过，之后在设置里加）
$wsFile = Join-Path $root "workspace-dirs.txt"
$list = @()
while ($true) {
  $fbd2 = New-Object System.Windows.Forms.FolderBrowserDialog
  $fbd2.Description = "选择要索引的工作区目录（点取消结束；之后可在网页设置里加）"
  $fbd2.SelectedPath = $env:USERPROFILE
  if ($fbd2.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { break }
  $list += $fbd2.SelectedPath
  Write-Host "已添加: $($fbd2.SelectedPath)"
}
if ($list.Count -gt 0) { [IO.File]::WriteAllLines($wsFile, $list, (New-Object System.Text.UTF8Encoding($false))) }

# 5. 桌面快捷方式 + 启动
$desktop = [Environment]::GetFolderPath("Desktop")
$lnk = Join-Path $desktop "弧梦数字中枢.lnk"
$ws = New-Object -ComObject WScript.Shell
$s = $ws.CreateShortcut($lnk)
$s.TargetPath = Join-Path $app "启动.cmd"
$s.WorkingDirectory = $app
$s.IconLocation = "$env:SystemRoot\System32\shell32.dll,13"
$s.Description = "ArcDream Hub · 弧梦数字中枢"
$s.Save()
Write-Host ""
Write-Host "安装完成: $root"
Write-Host "桌面快捷方式: 弧梦数字中枢"
Write-Host "正在启动..."
Start-Process -FilePath (Join-Path $app "启动.cmd")

