/**
 * 璁剧疆 Windows exe 鍥炬爣
 * 浣跨敤 resedit 绾?JS 鏂瑰紡淇敼 PE 璧勬簮锛屼笉鐮村潖鏂囦欢缁撴瀯
 * 瑙ｅ喅 rcedit (wine) 淇敼鍚庡鑷翠粠 UNC 缃戠粶璺緞鏃犳硶鍚姩鐨勯棶棰?
 */

const fs = require('fs');

const exePath = process.argv[2];
const icoPath = process.argv[3];

if (!exePath || !icoPath) {
  console.error('鐢ㄦ硶: node set-icon.cjs <exe璺緞> <ico璺緞>');
  process.exit(1);
}

async function main() {
  const { NtExecutable, NtExecutableResource, Data, Resource } = await import('resedit');

  const exeData = fs.readFileSync(exePath);
  const icoData = fs.readFileSync(icoPath);

  const pe = NtExecutable.from(exeData);
  const res = NtExecutableResource.from(pe);
  const ico = Data.IconFile.from(icoData);

  // 灏?ico.icons 杞崲涓?replaceIconsForResource 闇€瑕佺殑鏍煎紡
  // RawIconItem 椋庢牸: { width, height, bitCount, bin, planes }
  const icons = ico.icons.map(e => ({
    width: e.data.width,
    height: e.data.height,
    bitCount: e.data.bitCount,
    bin: e.data.bin,
    planes: 1,
    isIcon: () => false,
  }));

  // 鏇挎崲鍥炬爣锛歩conGroupID=1, lang=1033 (English)
  // Try all icon groups (1-20)
let replaced = false;
for (let gid = 1; gid <= 20; gid++) {
  try {
    Resource.IconGroupEntry.replaceIconsForResource(res.entries, gid, 1033, icons);
    replaced = true;
    console.log('Replaced icon group ' + gid);
    break;
  } catch(e) { /* not found, try next */ }
}
if (!replaced) {
  // Fallback: try main icon group
  Resource.IconGroupEntry.replaceIconsForResource(res.entries, 1, 1033, icons);
}

  res.outputResource(pe);
  const newData = pe.generate();

  fs.writeFileSync(exePath, Buffer.from(newData));
  console.log('鍥炬爣璁剧疆鎴愬姛');
}

main().catch(err => {
  console.error('閿欒:', err.message);
  process.exit(1);
});
