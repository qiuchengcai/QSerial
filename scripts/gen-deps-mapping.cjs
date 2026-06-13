/**
 * 自动扫描运行时依赖，生成 electron-builder 的 node_modules 映射配置
 * 解决手动维护依赖路径容易遗漏/过期的问题
 *
 * 用法: node scripts/gen-deps-mapping.cjs
 * 输出: electron-builder.config.deps.cjs (被 electron-builder.config.cjs 引用)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// 递归收集一个包及其全部子依赖
function collectDeps(pkgName, seen = new Set()) {
  if (seen.has(pkgName)) return seen;
  seen.add(pkgName);

  // scoped package 路径: @scope/name → @scope/name
  const pkgPath = path.join(ROOT, 'node_modules', pkgName, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    console.warn(`  ⚠ ${pkgName} not found in node_modules`);
    return seen;
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const deps = pkg.dependencies || {};

  for (const dep of Object.keys(deps)) {
    // 跳过 optionalDependencies 中未安装的包
    const depPath = path.join(ROOT, 'node_modules', dep, 'package.json');
    if (fs.existsSync(depPath)) {
      collectDeps(dep, seen);
    }
  }

  return seen;
}

// 顶层入口：从 main 包的 dependencies 开始
const mainPkg = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'packages/main/package.json'), 'utf8')
);
const entryDeps = Object.keys(mainPkg.dependencies || {}).filter(
  (d) => d !== '@qserial/shared' // workspace 包，单独映射
);

console.log('入口依赖:', entryDeps);

// 收集全部依赖
const allDeps = new Set();
for (const dep of entryDeps) {
  collectDeps(dep, allDeps);
}

// 排除一些运行时不需要的（文档、测试等）
const excludePatterns = ['/test/', '/tests/', '/docs/', '/example/', '/examples/', '/.github/'];

// 生成映射数组
const mappings = [];
for (const dep of [...allDeps].sort()) {
  mappings.push({
    from: `node_modules/${dep}`,
    to: `node_modules/${dep}`,
    filter: ['**/*', ...excludePatterns.map((p) => `!${p}`)],
  });
}

console.log(`共收集 ${mappings.length} 个运行时依赖包`);

// 生成 JS 配置片段
const jsContent = `// 自动生成！不要手动编辑。
// 由 scripts/gen-deps-mapping.cjs 生成。
// 重新生成: node scripts/gen-deps-mapping.cjs
module.exports = ${JSON.stringify(mappings, null, 2)};
`;

const outPath = path.join(ROOT, 'electron-builder.config.deps.cjs');
fs.writeFileSync(outPath, jsContent);
console.log(`已写入: ${outPath}`);
