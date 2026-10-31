import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

/**
 * ArcDream Hub · 本地服务（零依赖）
 * 端口 127.0.0.1:8799
 * UI/H5、目录选择、工作区配置、模型 API（DeepSeek / 豆包 / OpenAI / 自定义 OpenAI 兼容）
 */
const VERSION = '0.1.2'
const PORT = Number(process.env.ARC_HUB_PORT || 8799)
const HOST = '127.0.0.1'
const ROOT = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC = path.join(ROOT, 'public')
const DATA_POINTER = path.join(ROOT, 'data-dir.txt')
function defaultDataDir() {
  try { const p = fs.readFileSync(DATA_POINTER, 'utf8').trim(); if (p) return p } catch (e) { /* ignore */ }
  return process.env.ARC_HUB_DATA || path.join(os.homedir(), 'ArcDreamHub')
}
const DATA_DIR = defaultDataDir()
const CONFIG = path.join(DATA_DIR, 'config.json')
const MODEL = path.join(DATA_DIR, 'model.json')
const STARTED = Date.now()

const PROVIDERS = {
  deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  doubao: { label: '豆包（火山方舟）', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: '' },
  openai: { label: 'OpenAI / GPT', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  custom: { label: '自定义（OpenAI 兼容）', baseUrl: '', model: '' },
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch (e) { return fallback }
}
function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8')
}
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}
function json(res, code, obj) {
  cors(res)
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(obj))
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', c => { body += c; if (body.length > 1e6) { reject(new Error('too large')); req.destroy() } })
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')) } catch (e) { reject(new Error('bad json')) } })
    req.on('error', reject)
  })
}
function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { windowsHide: true, ...opts })
    let out = '', err = ''
    p.stdout?.on('data', d => { out += d })
    p.stderr?.on('data', d => { err += d })
    p.on('close', code => resolve({ code, out: out.trim(), err: err.trim() }))
    p.on('error', e => resolve({ code: -1, out: '', err: String(e.message || e) }))
  })
}

/* ---------- DPAPI 保护模型 Key（Windows；其他平台退化为 base64，仅本机文件） ---------- */
const PS_PROTECT = `param([string]$in,[string]$out)
Add-Type -AssemblyName System.Security
$b = [IO.File]::ReadAllBytes($in)
$p = [Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
[IO.File]::WriteAllBytes($out,$p)
Write-Output ok`
const PS_UNPROTECT = `param([string]$in,[string]$out)
Add-Type -AssemblyName System.Security
$b = [IO.File]::ReadAllBytes($in)
$p = [Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
[IO.File]::WriteAllBytes($out,$p)
Write-Output ok`

async function protectSecret(text) {
  if (process.platform !== 'win32') return 'b64:' + Buffer.from(text, 'utf8').toString('base64')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-hub-sec-'))
  try {
    const psFile = path.join(dir, 'p.ps1'), inFile = path.join(dir, 'in.bin'), outFile = path.join(dir, 'out.bin')
    fs.writeFileSync(psFile, PS_PROTECT)
    fs.writeFileSync(inFile, Buffer.from(text, 'utf8'))
    const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', psFile, inFile, outFile])
    if (r.code !== 0) throw new Error('DPAPI protect failed')
    return 'dpapi:' + fs.readFileSync(outFile).toString('base64')
  } finally { try { fs.rmSync(dir, { recursive: true, force: true }) } catch (e) { /* ignore */ } }
}
async function unprotectDpapiFile(filePath) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-hub-dpapi-'))
  try {
    const psFile = path.join(dir, 'u.ps1'), outFile = path.join(dir, 'out.bin')
    fs.writeFileSync(psFile, PS_UNPROTECT)
    const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', psFile, filePath, outFile])
    if (r.code !== 0) throw new Error('DPAPI 解保护失败')
    return fs.readFileSync(outFile)
  } finally { try { fs.rmSync(dir, { recursive: true, force: true }) } catch (e) { /* ignore */ } }
}
async function unprotectSecret(stored) {
  if (!stored) return ''
  if (stored.startsWith('b64:')) return Buffer.from(stored.slice(4), 'base64').toString('utf8')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-hub-sec-'))
  try {
    const psFile = path.join(dir, 'u.ps1'), inFile = path.join(dir, 'in.bin'), outFile = path.join(dir, 'out.bin')
    fs.writeFileSync(psFile, PS_UNPROTECT)
    fs.writeFileSync(inFile, Buffer.from(stored.slice(6), 'base64'))
    const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', psFile, inFile, outFile])
    if (r.code !== 0) return ''
    return fs.readFileSync(outFile, 'utf8')
  } finally { try { fs.rmSync(dir, { recursive: true, force: true }) } catch (e) { /* ignore */ } }
}

/* ---------- 目录选择（Windows 原生文件夹对话框） ---------- */
async function pickDirectory(title) {
  if (process.platform !== 'win32') return { ok: false, error: '仅 Windows 支持原生目录选择' }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-hub-pick-'))
  try {
    const psFile = path.join(dir, 'pick.ps1'), outFile = path.join(dir, 'out.txt')
    fs.writeFileSync(psFile, `param([string]$title,[string]$out)
Add-Type -AssemblyName System.Windows.Forms
$f = New-Object System.Windows.Forms.FolderBrowserDialog
$f.Description = $title
$f.ShowNewFolderButton = $true
$r = $f.ShowDialog()
if ($r -eq [System.Windows.Forms.DialogResult]::OK) { [IO.File]::WriteAllText($out, $f.SelectedPath) }
else { [IO.File]::WriteAllText($out, '') }`)
    const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', psFile, title || '选择目录', outFile], { timeout: 120000 })
    if (r.code !== 0) return { ok: false, error: '目录选择窗口失败' }
    const selected = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').trim() : ''
    if (!selected) return { ok: true, cancelled: true }
    return { ok: true, path: selected }
  } finally { try { fs.rmSync(dir, { recursive: true, force: true }) } catch (e) { /* ignore */ } }
}

/* ---------- 模型调用（OpenAI 兼容） ---------- */
function modelConfig() {
  const cfg = readJson(MODEL, {})
  return Object.assign({ provider: 'deepseek', baseUrl: PROVIDERS.deepseek.baseUrl, model: PROVIDERS.deepseek.model, secret: '' }, cfg)
}
async function callModel(messages, opts = {}) {
  const cfg = modelConfig()
  const key = await unprotectSecret(cfg.secret)
  if (!key) throw new Error('未配置模型 API Key（设置 → 模型）')
  const base = (cfg.baseUrl || PROVIDERS[cfg.provider]?.baseUrl || '').replace(/\/$/, '')
  const model = opts.model || cfg.model || PROVIDERS[cfg.provider]?.model
  if (!base) throw new Error('缺少 Base URL')
  if (!model) throw new Error('缺少模型名（豆包需要填写接入点 ID）')
  const r = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({ model, messages, temperature: opts.temperature ?? 0.8, max_tokens: opts.maxTokens ?? 800 }),
    signal: AbortSignal.timeout(opts.timeout ?? 60000),
  })
  const txt = await r.text()
  let data = null
  try { data = JSON.parse(txt) } catch (e) { /* ignore */ }
  if (!r.ok) throw new Error('模型返回 ' + r.status + '：' + (data?.error?.message || txt.slice(0, 200)))
  const reply = data?.choices?.[0]?.message?.content
  if (!reply) throw new Error('模型返回为空')
  return reply
}


/* ---------- 文件索引（SQLite） ---------- */
const INDEX_DIR = path.join(DATA_DIR, 'index')
const INDEX_DB = path.join(INDEX_DIR, 'hub.db')
const INDEX_SKIP = new Set(['node_modules', '.git', '.svn', '.hg', '__pycache__', '.cache', '.next', 'dist', 'build', 'out', 'checkpoints', 'tmp', 'temp', 'pip-build-env-jlxtfye8'])
let idxDb = null
let idxState = { running: false, roots: [], files: 0, done: 0, startedAt: 0, finishedAt: 0, error: '' }
function openIndex() {
  if (idxDb) return idxDb
  fs.mkdirSync(INDEX_DIR, { recursive: true })
  idxDb = new DatabaseSync(INDEX_DB)
  idxDb.exec('PRAGMA journal_mode=WAL')
  idxDb.exec('CREATE TABLE IF NOT EXISTS files(path TEXT PRIMARY KEY, name TEXT, dir TEXT, ext TEXT, size INTEGER, mtime INTEGER, root TEXT, project TEXT)')
  idxDb.exec('CREATE INDEX IF NOT EXISTS files_name ON files(name)')
  idxDb.exec('CREATE INDEX IF NOT EXISTS files_root ON files(root)')
  return idxDb
}
function skipDir(name) {
  if (INDEX_SKIP.has(name)) return true
  if (/^(pip-|npm-|.dsh-office|.dsh-spill)/.test(name)) return true
  return false
}
async function scanIndex() {
  if (idxState.running) return idxState
  const cfg = readJson(CONFIG, {})
  const roots = (cfg.workspaceDirs || []).filter(x => fs.existsSync(x))
  idxState = { running: true, roots, files: 0, done: 0, startedAt: Date.now(), finishedAt: 0, error: '' }
  try {
    const db = openIndex()
    db.exec('BEGIN')
    db.exec('DELETE FROM files')
    const stmt = db.prepare('INSERT OR REPLACE INTO files(path,name,dir,ext,size,mtime,root,project) VALUES(?,?,?,?,?,?,?,?)')
    let n = 0
    for (const root of roots) {
      const stack = [root]
      while (stack.length) {
        const dir = stack.pop()
        let entries
        try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch (e) { continue }
        for (const e of entries) {
          const full = path.join(dir, e.name)
          if (e.isDirectory()) { if (!skipDir(e.name)) stack.push(full); continue }
          if (!e.isFile()) continue
          let st
          try { st = fs.statSync(full) } catch (e) { continue }
          const rel = path.relative(root, full)
          const project = rel.split(path.sep)[0] || path.basename(root)
          stmt.run(full, e.name, dir, path.extname(e.name).toLowerCase(), st.size, Math.round(st.mtimeMs), root, project)
          n++
          if (n % 5000 === 0) { idxState.done = n; db.exec('COMMIT'); db.exec('BEGIN') }
        }
      }
    }
    db.exec('COMMIT')
    idxState.files = n
    idxState.done = n
    idxState.finishedAt = Date.now()
  } catch (e) {
    idxState.error = String(e && e.message || e)
    try { openIndex().exec('COMMIT') } catch (e2) { /* ignore */ }
  } finally {
    idxState.running = false
  }
  return idxState
}
function searchIndex(q, limit) {
  const db = openIndex()
  const like = '%' + String(q || '').replace(/[%_]/g, '') + '%'
  const rows = db.prepare('SELECT path,name,dir,ext,size,mtime,project FROM files WHERE name LIKE ? OR path LIKE ? ORDER BY CASE WHEN name LIKE ? THEN 0 ELSE 1 END, mtime DESC LIMIT ?').all(like, like, like, Math.max(1, Math.min(100, limit || 20)))
  return rows
}
function readIndexedFile(filePath) {
  const cfg = readJson(CONFIG, {})
  const roots = cfg.workspaceDirs || []
  const abs = path.resolve(filePath)
  if (!roots.some(r => abs.toLowerCase().startsWith(path.resolve(r).toLowerCase()))) throw new Error('路径不在已登记的工作区内')
  const st = fs.statSync(abs)
  if (st.size > 512 * 1024) throw new Error('文件太大（>512KB），请直接打开目录查看')
  return fs.readFileSync(abs, 'utf8')
}


function kindOfExt(ext) {
  const e = String(ext || '').toLowerCase()
  if (/\.(mp4|mov|mkv|avi|flv|webm)$/.test(e)) return '视频'
  if (/\.(mp3|wav|flac|m4a)$/.test(e)) return '音频'
  if (/\.(png|jpg|jpeg|webp|gif|svg|psd)$/.test(e)) return '图片'
  if (/\.(md|txt|docx?|pdf|xlsx?|csv|pptx?)$/.test(e)) return '文档'
  if (/\.(zip|7z|rar|tar|gz)$/.test(e)) return '压缩包'
  if (/\.(js|mjs|ts|py|json|html|css|sh|ps1|yml|yaml)$/.test(e)) return '代码'
  return '其他'
}
function fmtBytes(n) {
  n = Number(n) || 0
  if (n >= 1073741824) return (n / 1073741824).toFixed(1) + ' GB'
  if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB'
  if (n >= 1024) return (n / 1024).toFixed(0) + ' KB'
  return n + ' B'
}
function readmeTitle(dir) {
  try {
    const f = path.join(dir, 'README.md')
    if (!fs.existsSync(f)) return ''
    const t = fs.readFileSync(f, 'utf8').slice(0, 6000)
    const m = t.match(/^#\s+(.+)$/m)
    return m ? m[1].trim().slice(0, 40) : ''
  } catch (e) { return '' }
}
function detectUses(projectPath, projectName) {
  const hay = (projectName + ' ' + projectPath).toLowerCase()
  let text = ''
  try { const f = path.join(projectPath, 'README.md'); if (fs.existsSync(f)) text = fs.readFileSync(f, 'utf8').slice(0, 20000).toLowerCase() } catch (e) { /* ignore */ }
  const all = hay + ' ' + text
  const out = []
  if (/人设|persona|角色卡|role-card/.test(all)) out.push('persona')
  if (/音色|voice|tts|xiaoyi/.test(all)) out.push('voice')
  if (/工作流|workflow|卡点|skill/.test(all)) out.push('workflow')
  if (/agent|陪伴|机器人|bot/.test(all)) out.push('agent')
  return out
}
function buildGraph() {
  const db = openIndex()
  const cfg = readJson(CONFIG, {})
  const roots = (cfg.workspaceDirs || []).filter(x => fs.existsSync(x))
  const nodes = [{ id: 'core', label: '中枢核心', layer: 0, type: 'core', size: 16, summary: '工作区 ' + roots.length + ' 个' }]
  const links = []
  const CORE_ENTS = [
    { id: 'ent:persona', label: '人设卡', layer: 1, type: 'entity', size: 12, summary: '海拉的加密人设卡（本机加密存储，只给摘要）' },
    { id: 'ent:voice', label: '音色', layer: 1, type: 'entity', size: 10, summary: '语音合成音色（默认 Xiaoyi，可在配置里改）' },
    { id: 'ent:workflow', label: '工作流', layer: 1, type: 'entity', size: 11, summary: '卡点视频 / 直播 / 发布等工作流' },
    { id: 'ent:agent', label: 'Agent', layer: 1, type: 'entity', size: 10, summary: '陪伴机器人 / 私信 / 直播中控代理' }
  ]
  for (const e of CORE_ENTS) { nodes.push(e); links.push({ source: 'core', target: e.id, w: 1 }) }
  let wsIdx = 0
  for (const root of roots) {
    wsIdx++
    const wsId = 'ws:' + wsIdx
    let projects = []
    try {
      projects = fs.readdirSync(root, { withFileTypes: true })
        .filter(d => d.isDirectory() && !/^[.\$]|node_modules|^tmp$|^dist$|^release$|^data$|^plugin$/i.test(d.name))
        .map(d => d.name)
    } catch (e) { /* ignore */ }
    nodes.push({ id: wsId, label: '工作区 · ' + path.basename(root), layer: 2, type: 'workspace', size: 12, summary: root + ' · ' + projects.length + ' 个项目' })
    links.push({ source: 'core', target: wsId, w: 1 })
    const rows = db.prepare("SELECT project, COUNT(*) AS c, SUM(size) AS sz FROM files WHERE root = ? GROUP BY project ORDER BY c DESC").all(root)
    for (const p of rows) {
      const pdir = path.join(root, p.project)
      const pid = 'pj:' + wsIdx + ':' + p.project
      const title = readmeTitle(pdir) || p.project
      nodes.push({ id: pid, label: title, layer: 2, type: 'project', project: p.project, size: Math.min(16, 9 + Math.log10(p.c + 1) * 3), count: p.c, summary: p.project + ' · ' + p.c + ' 文件 · ' + fmtBytes(p.sz), meta: [fmtBytes(p.sz), p.c + ' 文件'] })
      links.push({ source: wsId, target: pid, w: .8 })
      const uses = detectUses(pdir, p.project)
      for (const u of uses) links.push({ source: pid, target: 'ent:' + u, w: .45 })
      // 产出：优先 成片/成品/out 下的媒体；否则 README / 最大文件
      let arts = []
      try {
        arts = db.prepare("SELECT path, name, ext, size FROM files WHERE project = ? AND ext IN ('.mp4','.mov','.mkv','.flv','.mp3','.wav','.zip','.pptx','.pdf') AND size > 51200 ORDER BY mtime DESC LIMIT 4").all(p.project)
      } catch (e) { /* ignore */ }
      if (!arts.length) {
        try { arts = db.prepare("SELECT path, name, ext, size FROM files WHERE project = ? ORDER BY size DESC LIMIT 1").all(p.project) } catch (e) { /* ignore */ }
      }
      for (const a of arts) {
        const aid = 'af:' + wsIdx + ':' + a.path
        nodes.push({ id: aid, label: a.name.length > 34 ? a.name.slice(0, 30) + '…' : a.name, layer: 3, type: 'artifact', project: p.project, size: 6, summary: a.path, meta: [fmtBytes(a.size)] })
        links.push({ source: pid, target: aid, w: .4 })
        for (const u of uses) links.push({ source: aid, target: 'ent:' + u, w: .25 })
      }
    }
  }
  return { nodes, links }
}
function openExplorer(target, select) {
  const p = path.resolve(target)
  if (!fs.existsSync(p)) return false
  const [cmd, args] = process.platform === 'win32'
    ? (select ? ['explorer.exe', ['/select,' + p]] : ['explorer.exe', [p]])
    : process.platform === 'darwin' ? ['open', [p]] : ['xdg-open', [p]]
  spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref()
  return true
}

// 安装向导留下的工作区目录 → 首次生成 config
try {
  if (!fs.existsSync(CONFIG)) {
    const wf = path.join(ROOT, 'workspace-dirs.txt')
    const dirs = fs.existsSync(wf) ? fs.readFileSync(wf, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean) : []
    writeJson(CONFIG, { mode: 'multimodal', workspaceDirs: dirs })
  }
} catch (e) { /* ignore */ }

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); res.end(); return }
  let url
  try { url = new URL(req.url, 'http://' + HOST) } catch { return json(res, 400, { ok: false }) }
  const p = url.pathname

  try {
    if (p === '/api/ping') return json(res, 200, { ok: true, service: 'arc-hub', version: VERSION })
    if (p === '/api/status') {
      const cfg = readJson(CONFIG, { mode: 'multimodal' })
      const m = modelConfig()
      return json(res, 200, { ok: true, version: VERSION, mode: cfg.mode || 'multimodal', dataDir: DATA_DIR, workspaceDirs: cfg.workspaceDirs || [], model: { provider: m.provider, baseUrl: m.baseUrl, model: m.model, hasKey: !!m.secret }, uptime: Math.round((Date.now() - STARTED) / 1000) })
    }
    if (p === '/api/config' && req.method === 'GET') {
      const cfg = readJson(CONFIG, { mode: 'multimodal' })
      return json(res, 200, { ok: true, mode: cfg.mode || 'multimodal', workspaceDirs: cfg.workspaceDirs || [] })
    }
    if (p === '/api/config' && req.method === 'POST') {
      const body = await readBody(req)
      const cfg = readJson(CONFIG, { mode: 'multimodal' })
      if (body.mode !== undefined) {
        if (body.mode !== 'single' && body.mode !== 'multimodal') return json(res, 400, { ok: false, error: 'mode 必须是 single|multimodal' })
        cfg.mode = body.mode
      }
      if (Array.isArray(body.workspaceDirs)) cfg.workspaceDirs = body.workspaceDirs.filter(x => typeof x === 'string' && x.trim()).slice(0, 50)
      writeJson(CONFIG, cfg)
      return json(res, 200, { ok: true, mode: cfg.mode, workspaceDirs: cfg.workspaceDirs || [] })
    }
    if (p === '/api/pick-dir') {
      const r = await pickDirectory(url.searchParams.get('title') || '选择目录')
      return json(res, r.ok ? 200 : 400, r)
    }
    if (p === '/api/model' && req.method === 'GET') {
      const m = modelConfig()
      return json(res, 200, { ok: true, provider: m.provider, baseUrl: m.baseUrl, model: m.model, hasKey: !!m.secret, providers: Object.fromEntries(Object.entries(PROVIDERS).map(([k, v]) => [k, { label: v.label, baseUrl: v.baseUrl, model: v.model }])) })
    }
    if (p === '/api/model' && req.method === 'POST') {
      const body = await readBody(req)
      const cur = modelConfig()
      if (body.provider) {
        if (!PROVIDERS[body.provider]) return json(res, 400, { ok: false, error: '未知 provider' })
        cur.provider = body.provider
        if (!body.baseUrl) cur.baseUrl = PROVIDERS[body.provider].baseUrl
        if (!body.model) cur.model = PROVIDERS[body.provider].model
      }
      if (typeof body.baseUrl === 'string') cur.baseUrl = body.baseUrl.trim()
      if (typeof body.model === 'string') cur.model = body.model.trim()
      if (typeof body.key === 'string' && body.key.trim()) cur.secret = await protectSecret(body.key.trim())
      if (body.clearKey) cur.secret = ''
      writeJson(MODEL, cur)
      return json(res, 200, { ok: true, provider: cur.provider, baseUrl: cur.baseUrl, model: cur.model, hasKey: !!cur.secret })
    }
    if (p === '/api/model/test' && req.method === 'POST') {
      const t = Date.now()
      try {
        const reply = await callModel([{ role: 'user', content: '只回复两个字：可以' }], { maxTokens: 20, timeout: 30000 })
        return json(res, 200, { ok: true, ms: Date.now() - t, reply: String(reply).slice(0, 40) })
      } catch (e) { return json(res, 200, { ok: false, ms: Date.now() - t, error: String(e.message || e) }) }
    }
    if (p === '/api/chat' && req.method === 'POST') {
      const body = await readBody(req)
      const messages = Array.isArray(body.messages) ? body.messages.slice(-30) : []
      if (!messages.length) return json(res, 400, { ok: false, error: '缺少 messages' })
      try {
        const reply = await callModel(messages, { maxTokens: body.maxTokens ?? 800 })
        return json(res, 200, { ok: true, reply })
      } catch (e) { return json(res, 200, { ok: false, error: String(e.message || e) }) }
    }
    if (p === '/api/persona') {
      const md = path.join(DATA_DIR, 'persona', 'hela-role-card.md')
      if (fs.existsSync(md)) return json(res, 200, { ok: true, source: 'file', text: fs.readFileSync(md, 'utf8') })
      const enc = path.join(DATA_DIR, 'persona', 'hela-role-card.enc')
      const keyF = path.join(DATA_DIR, 'persona', 'hela.key.dpapi')
      if (fs.existsSync(enc) && fs.existsSync(keyF)) {
        try {
          const key = await unprotectDpapiFile(keyF)
          const box = JSON.parse(fs.readFileSync(enc, 'utf8'))
          const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(box.iv, 'base64'))
          d.setAuthTag(Buffer.from(box.tag, 'base64'))
          const text = Buffer.concat([d.update(Buffer.from(box.data, 'base64')), d.final()]).toString('utf8')
          return json(res, 200, { ok: true, source: 'encrypted', text })
        } catch (e) { return json(res, 200, { ok: false, error: '人设卡解密失败：' + String(e && e.message || e) }) }
      }
      return json(res, 200, { ok: false, error: '未找到人设卡（persona/hela-role-card.md 或加密卡 + 密钥）' })
    }
    if (p === '/api/open' || p === '/api/reveal') {
      const raw = url.searchParams.get('path') || ''
      if (!raw) return json(res, 400, { ok: false, error: 'missing path' })
      const target = path.resolve(raw)
      if (!fs.existsSync(target)) return json(res, 404, { ok: false, error: 'path not found', path: target })
      openExplorer(target, p === '/api/reveal')
      return json(res, 200, { ok: true, opened: target })
    }

    if (p === '/api/index/start' && req.method === 'POST') {
      if (idxState.running) return json(res, 200, { ok: true, running: true, state: idxState })
      scanIndex()
      return json(res, 200, { ok: true, started: true })
    }
    if (p === '/api/index/status') {
      try { const row = openIndex().prepare('SELECT COUNT(*) AS c FROM files').get(); idxState.files = Number(row.c) } catch (e) { /* ignore */ }
      return json(res, 200, Object.assign({ ok: true }, idxState))
    }
    if (p === '/api/search') {
      const q = (url.searchParams.get('q') || '').trim()
      if (!q) return json(res, 200, { ok: true, count: 0, results: [] })
      try {
        const results = searchIndex(q, Number(url.searchParams.get('limit') || 20))
        return json(res, 200, { ok: true, count: results.length, results })
      } catch (e) { return json(res, 200, { ok: false, error: String(e && e.message || e), results: [] }) }
    }
    if (p === '/api/file') {
      const fp = url.searchParams.get('path') || ''
      try { return json(res, 200, { ok: true, path: fp, text: readIndexedFile(fp) }) }
      catch (e) { return json(res, 200, { ok: false, error: String(e && e.message || e) }) }
    }
    if (p === '/api/graph') {
      try { return json(res, 200, Object.assign({ ok: true }, buildGraph())) }
      catch (e) { return json(res, 200, { ok: false, error: String(e && e.message || e), nodes: [], links: [] }) }
    }
    if (p === '/api/hub/info') {
      return json(res, 200, { ok: true, name: 'ArcDream Hub', version: VERSION, endpoints: ['/api/ping', '/api/status', '/api/config', '/api/pick-dir', '/api/model', '/api/model/test', '/api/chat', '/api/index/start', '/api/index/status', '/api/search', '/api/file', '/api/graph', '/api/open', '/api/reveal'] })
    }

    // 静态 / 与 /m（H5 同一页面）
    if (req.method === 'GET' && (p === '/' || p === '/index.html' || p === '/m' || p === '/m/')) {
      const file = path.join(PUBLIC, 'index.html')
      if (!fs.existsSync(file)) return json(res, 500, { ok: false, error: 'public/index.html missing' })
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store, must-revalidate' })
      return fs.createReadStream(file).pipe(res)
    }
    json(res, 404, { ok: false, error: 'not found' })
  } catch (e) {
    json(res, 500, { ok: false, error: String(e && e.message || e) })
  }
})

server.listen(PORT, HOST, () => {
  try {
    const cfg = readJson(CONFIG, {})
    if ((cfg.workspaceDirs || []).length) setTimeout(() => { scanIndex().catch(() => {}) }, 800)
  } catch (e) { /* ignore */ }
  console.log('[arc-hub] http://' + HOST + ':' + PORT)
  console.log('[arc-hub] data:', DATA_DIR)
})
