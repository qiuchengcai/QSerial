const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) {
    console.error('Error: .env not found');
    process.exit(1);
  }
  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return env;
}

const env = loadEnv();
const HOST = env.QSERIAL_HOST;
const USER = env.QSERIAL_USER;
const WEB_ROOT = env.QSERIAL_WEB_ROOT || '/opt/qserial/website';

if (!HOST || !USER) {
  console.error('Error: QSERIAL_HOST and QSERIAL_USER must be set in .env');
  process.exit(1);
}

const password = process.env.QSERIAL_PASS;
if (!password) {
  console.error('Usage: $env:QSERIAL_PASS="your_password"; node scripts/sftp-upload.cjs');
  process.exit(1);
}

const uploads = [
  { local: 'release/QSerial-1.0.0-x64-win.exe', remote: `${WEB_ROOT}/download/installer/QSerial-1.0.0-x64-win.exe` },
  { local: 'release/QSerial-1.0.0-x64-win-portable.exe', remote: `${WEB_ROOT}/download/portable/QSerial-1.0.0-x64-win-portable.exe` },
  { local: 'website/index.html', remote: `${WEB_ROOT}/index.html` },
];

const conn = new Client();

conn.on('ready', () => {
  console.log('✅ SSH connected');
  conn.sftp((err, sftp) => {
    if (err) { console.error(err); conn.end(); return; }

    function upload(idx) {
      if (idx >= uploads.length) {
        console.log('\n🎉 All files uploaded');
        conn.end();
        return;
      }
      const { local, remote } = uploads[idx];
      const localPath = path.join(ROOT, local);
      const fname = path.basename(local);

      sftp.mkdir(path.dirname(remote), { mode: 0o755 }, () => {});

      const total = fs