/**
 * 设置 Windows exe 图标
 * 使用 resedit 纯 JS 方式修改 PE 资源，不破坏文件结构
 * 解决 rcedit (wine) 修改后导致从 UNC 网络路径无法启动的问题
 */

const fs = require('fs');

const exePath = process.argv[2];
const icoPath = process.argv[3];

if (!exePath || !icoPath) {
  console.error('用法: node set-icon.cjs <exe路径> <ico路径>');
  process.exit(1);
}

async function main() {
  const { NtExecutable, NtExecutableResource, Data, Resource } = await import('resedit');

  const exeData = fs.readFileSync(exePath);
  const icoData = fs.readFileSync(icoPath);

  const pe = NtExecutable.from(exeData);
  const res = NtExecutableResource.from(pe);
  const ico = Data.IconFile.from(icoData);

  // 将 ico.icons 转换为 replaceIconsForResource 需要的格式
  // RawIconItem 风格: { width, height, bitCount, bin, planes }
  const icons = ico.icons.map(e => ({
    width: e.data.width,
    height: e.data.height,
    bitCount: e.data.bitCount,
    bin: e.data.bin,
    planes: 1,
    isIcon: () => false,
  }));

  // 替换图标：iconGroupID=1, lang=1033 (English)
  Resource.IconGroupEntry.replaceIconsForResource(
    res.entries,
    1,
    1033,
    icons
  );

  res.outputResource(pe);
  const newData = pe.generate();

  fs.writeFileSync(exePath, Buffer.from(newData));
  console.log('图标设置成功');
}

main().catch(err => {
  console.error('错误:', err.message);
  process.exit(1);
});
