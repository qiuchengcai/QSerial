/**
 * 将 win-unpacked 打包为便携版 ZIP，输出到 release/portable/
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const RELEASE_DIR = path.resolve(__dirname, '..', 'release');
const UNPACKED_DIR = path.join(RELEASE_DIR, 'win-unpacked');
const PORTABLE_DIR = path.join(RELEASE_DIR, 'portable');

if (!fs.existsSync(UNPACKED_DIR)) {
  console.error('win-unpacked not found:', UNPACKED_DIR);
  process.exit(1);
}

const { version } = require('../package.json');
const zipName = `QSerial-${version}-x64-win-portable.zip`;
const zipPath = path.join(PORTABLE_DIR, zipName);

fs.mkdirSync(PORTABLE_DIR, { recursive: true });

if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

if (process.platform === 'win32') {
  // First organize into qserial-portable subdir
  const portableSubdir = path.join(RELEASE_DIR, 'qserial-portable');
  if (fs.existsSync(portableSubdir)) {
    fs.rmSync(portableSubdir, { recursive: true, force: true });
  }

  // Copy win-unpacked to qserial-portable
  execSync(`robocopy "${UNPACKED_DIR}" "${portableSubdir}" /E /NFL /NDL /NJH /NJS /nc /ns /np`, { stdio: 'pipe' });

  // Move NSIS installer out
  const installerDir = path.join(RELEASE_DIR, 'installer');
  fs.mkdirSync(installerDir, { recursive: true });
  const installerExe = `QSerial-${version}-x64-win.exe`;
  const installerSrc = path.join(RELEASE_DIR, installerExe);
  const installerDst = path.join(installerDir, installerExe);
  if (fs.existsSync(installerSrc)) {
    if (fs.existsSync(installerDst)) fs.unlinkSync(installerDst);
    fs.renameSync(installerSrc, installerDst);
    console.log('Installer:', `installer/${installerExe}`);
  }

  // Pack portable
  const sevenZip = path.join(process.env['ProgramFiles'] || 'C:\\Program Files', '7-Zip', '7z.exe');
  const compressCmd = fs.existsSync(sevenZip)
    ? `"${sevenZip}" a -tzip -mx9 "${zipPath}" "${portableSubdir}\\*" -r -xr!*.blockmap`
    : `powershell -Command "Compress-Archive -Path '${portableSubdir}\\*' -DestinationPath '${zipPath}' -Force"`;
  execSync(compressCmd, { stdio: 'inherit' });

  // Cleanup
  fs.rmSync(portableSubdir, { recursive: true, force: true });

  const sizeMB = (fs.statSync(zipPath).size / (1024 * 1024)).toFixed(1);
  console.log(`Portable ZIP: portable/${zipName} (${sizeMB} MB)`);
} else {
  // macOS/Linux: tar.gz
  const tarball = zipPath.replace('.zip', '.tar.gz');
  execSync(`tar -czf "${tarball}" -C "${UNPACKED_DIR}" .`, { stdio: 'inherit' });
  console.log(`Portable: portable/${path.basename(tarball)}`);
}
