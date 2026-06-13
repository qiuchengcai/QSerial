const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');

const SERVER_HOST = process.env.QSERIAL_HOST || '120.26.216.55';
const SERVER_USER = process.env.QSERIAL_USER || 'root';
const WEB_ROOT = '/opt/qserial/website';

function scp(src, dest) {
  const cmd = `scp ${src} ${SERVER_USER}@${SERVER_HOST}:${dest}`;
  console.log(`  → ${src}  =>  ${SERVER_USER}@${SERVER_HOST}:${dest}`);
  execSync(cmd, { stdio: 'inherit', cwd: ROOT });
}

function targetWebsite() {
  console.log('\n📄 部署网站页面...');
  scp(path.join(ROOT, 'website/index.html'), `${WEB_ROOT}/index.html`);
  console.log('✅ 网站页面部署完成\n');
}

function targetRelease() {
  const releaseDir = path.join(ROOT, 'release');
  const exes = fs.readdirSync(releaseDir).filter(f => f.endsWith('.exe'));
  if (exes.length === 0) {
    console.log('⚠️  release/ 目录下没有 .exe 文件，跳过安装包部署\n');
    return;
  }
  console.log('\n📦 部署安装包...');
  for (const exe of exes) {
    scp(path.join(releaseDir, exe), `${WEB_ROOT}/download/${exe}`);
  }
  console.log('✅ 安装包部署完成\n');
}

function targetNginx() {
  console.log('\n🔧 部署 Nginx 配置...');
  scp(
    path.join(ROOT, 'website/qserial-nginx.conf'),
    '/etc/nginx/sites-available/qserial'
  );
  const reload = `ssh ${SERVER_USER}@${SERVER_HOST} "nginx -t && nginx -s reload"`;
  console.log('  → nginx -t && nginx -s reload');
  execSync(reload, { stdio: 'inherit' });
  console.log('✅ Nginx 配置部署完成\n');
}

function printUsage() {
  console.log(`
用法: node scripts/deploy.cjs <target>

  --website   只部署网站页面 (index.html)
  --release   只部署安装包 (release/*.exe)
  --nginx     只部署 Nginx 配置并 reload
  --all       部署全部 (默认)

环境变量:
  QSERIAL_HOST  服务器地址 (默认: 120.26.216.55)
  QSERIAL_USER  SSH 用户   (默认: root)
`);
}

const args = process.argv.slice(2);
const targets = new Set(args.length === 0 ? ['--all'] : args);

if (targets.has('--help') || targets.has('-h')) {
  printUsage();
  process.exit(0);
}

const all = targets.has('--all');

for (const t of targets) {
  switch (t) {
    case '--all':
      targetWebsite();
      targetRelease();
      targetNginx();
      break;
    case '--website':
      targetWebsite();
      break;
    case '--release':
      targetRelease();
      break;
    case '--nginx':
      targetNginx();
      break;
    default:
      console.error(`未知参数: ${t}`);
      printUsage();
      process.exit(1);
  }
}

console.log('🎉 部署完成');
