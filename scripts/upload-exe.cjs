const path = require('path')
const fs = require('fs')
const { Client } = require('ssh2')

const ROOT = path.resolve(__dirname, '..')

function loadEnv() {
  const envPath = path.join(ROOT, '.env')
  if (!fs.existsSync(envPath)) { console.error('Missing .env'); process.exit(1) }
  const content = fs.readFileSync(envPath, 'utf8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    const val = trimmed.slice(idx + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
}
loadEnv()

const HOST = process.env.QSERIAL_HOST
const USER = process.env.QSERIAL_USER || 'root'
const PASS = process.env.QSERIAL_PASS
const WEB_ROOT = process.env.QSERIAL_WEB_ROOT || '/opt/qserial/website'

if (!HOST || !PASS) {
  console.error('请在 .env 中设置 QSERIAL_PASS 密码')
  process.exit(1)
}

const FILES = {
  installer: {
    local: path.join(ROOT, 'release', 'QSerial-1.0.0-x64-win.exe'),
    remote: `${WEB_ROOT}/download/installer/QSerial-1.0.0-x64-win.exe`,
  },
  portable: {
    local: path.join(ROOT, 'release', 'QSerial-1.0.0-x64-win-portable.exe'),
    remote: `${WEB_ROOT}/download/portable/QSerial-1.0.0-x64-win-portable.exe`,
  },
}

function uploadFile(localPath, remotePath, label) {
  return new Promise((resolve, reject) => {
    const stat = fs.statSync(localPath)
    const totalSize = stat.size
    let uploaded = 0
    let lastPct = -1

    const conn = new Client()
    conn.on('ready', () => {
      console.log(`[${label}] 已连接，开始上传 ${(totalSize / 1024 / 1024).toFixed(0)} MB...`)
      conn.sftp((err, sftp) => {
        if (err) return reject(err)

        const writeStream = sftp.createWriteStream(remotePath, { flags: 'w', mode: 0o644 })

        writeStream.on('close', () => {
          conn.end()
          console.log(`[${label}] ✅ 上传完成`)
          resolve()
        })

        writeStream.on('error', (e) => {
          conn.end()
          reject(e)
        })

        const readStream = fs.createReadStream(localPath)
        readStream.on('data', (chunk) => {
          uploaded += chunk.length
          const pct = Math.floor((uploaded / totalSize) * 100)
          if (pct !== lastPct && pct % 10 === 0) {
            console.log(`[${label}] ${pct}% (${(uploaded