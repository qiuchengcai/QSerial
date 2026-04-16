const builder = require('electron-builder');
const path = require('path');
const fs = require('fs');

async function build() {
  try {
    await builder.build({
      targets: builder.Platform.WINDOWS.createTarget('dir'),
      config: {
        npmRebuild: false,
        appId: 'com.qserial.app',
        productName: 'QSerial',
        directories: { output: 'release', buildResources: 'build' },
        files: [
          'packages/main/dist/**/*',
          'packages/renderer/dist/**/*',
          'package.json',
          { from: 'packages/shared', to: 'node_modules/@qserial/shared', filter: ['dist/**/*', 'package.json'] },
          // node-pty
          { from: 'node_modules/.pnpm/node-pty@1.1.0/node_modules/node-pty', to: 'node_modules/node-pty', filter: ['**/*'] },
          // serialport 主包
          { from: 'node_modules/.pnpm/serialport@12.0.0/node_modules/serialport', to: 'node_modules/serialport', filter: ['**/*'] },
          // @serialport 命名空间下的所有包
          { from: 'node_modules/.pnpm/@serialport+binding-mock@10.2.2/node_modules/@serialport/binding-mock', to: 'node_modules/serialport/node_modules/@serialport/binding-mock', filter: ['**/*'] },
          { from: 'node_modules/.pnpm/@serialport+bindings-cpp@12.0.1/node_modules/@serialport/bindings-cpp', to: 'node_modules/serialport/node_modules/@serialport/bindings-cpp', filter: ['**/*'] },
          { from: 'node_modules/.pnpm/@serialport+bindings-interface@1.2.2/node_modules/@serialport/bindings-interface', to: 'node_modules/serialport/node_modules/@serialport/bindings-interface', filter: ['**/*'] },
          { from: 'node_modules/.pnpm/@serialport+parser-byte-length@12.0.0/node_modules/@serialport/parser-byte-length', to: 'node_modules/serialport/node_modules/@serialport/parser-byte-length', filter: ['**/*'] },
          { from: 'node_modules/.pnpm/@serialport+parser-cctalk@12.0.0/node_modules/@serialport/parser-cctalk', to: 'node_modules/serialport/node_modules/@serialport/parser-cctalk', filter: ['**/*'] },
          { from: 'node_modules/.pnpm/@serialport+parser-delimiter@12.0.0/node_modules/@serialport/parser-delimiter', to: 'node_modules/serialport/node_modules/@serialport/parser-delimiter', filter: ['**/*'] },
          { from: 'node_modules/.pnpm/@serialport+parser-inter-byte-timeout@12.0.0/node_modules/@serialport/parser-inter-byte-timeout', to: 'node_modules/serialport/node_modules/@serialport/parser-inter-byte-timeout', filter: ['**/*'] },
          { from: 'node_modules/.pnpm/@serialport+parser-packet-length@12.0.0/node_modules/@serialport/parser-packet-length', to: 'node_modules/serialport/node_modules/@serialport/parser-packet-length', filter: ['**/*'] },
          { from: 'node_modules/.pnpm/@serialport+parser-readline@12.0.0/node_modules/@serialport/parser-readline', to: 'node_modules/serialport/node_modules/@serialport/parser-readline', filter: ['**/*'] },
          { from: 'node_modules/.pnpm/@serialport+parser-ready@12.0.0/node_modules/@serialport/parser-ready', to: 'node_modules/serialport/node_modules/@serialport/parser-ready', filter: ['**/*'] },
          { from: 'node_modules/.pnpm/@serialport+parser-regex@12.0.0/node_modules/@serialport/parser-regex', to: 'node_modules/serialport/node_modules/@serialport/parser-regex', filter: ['**/*'] },
          { from: 'node_modules/.pnpm/@serialport+parser-slip-encoder@12.0.0/node_modules/@serialport/parser-slip-encoder', to: 'node_modules/serialport/node_modules/@serialport/parser-slip-encoder', filter: ['**/*'] },
          { from: 'node_modules/.pnpm/@serialport+parser-spacepacket@12.0.0/node_modules/@serialport/parser-spacepacket', to: 'node_modules/serialport/node_modules/@serialport/parser-spacepacket', filter: ['**/*'] },
          { from: 'node_modules/.pnpm/@serialport+stream@12.0.0/node_modules/@serialport/stream', to: 'node_modules/serialport/node_modules/@serialport/stream', filter: ['**/*'] },
          // serialport 的依赖
          { from: 'node_modules/.pnpm/debug@4.3.4/node_modules/debug', to: 'node_modules/debug', filter: ['**/*'] },
          { from: 'node_modules/.pnpm/ms@2.1.2/node_modules/ms', to: 'node_modules/ms', filter: ['**/*'] },
          { from: 'node_modules/.pnpm/node-gyp-build@4.6.0/node_modules/node-gyp-build', to: 'node_modules/node-gyp-build', filter: ['**/*'] },
          { from: 'node_modules/.pnpm/node-addon-api@7.0.0/node_modules/node-addon-api', to: 'node_modules/node-addon-api', filter: ['**/*'] },
          // ssh2 及其依赖
          { from: 'node_modules/.pnpm/ssh2@1.17.0/node_modules/ssh2', to: 'node_modules/ssh2', filter: ['**/*'] },
          { from: 'node_modules/.pnpm/asn1@0.2.6/node_modules/asn1', to: 'node_modules/asn1', filter: ['**/*'] },
          { from: 'node_modules/.pnpm/bcrypt-pbkdf@1.0.2/node_modules/bcrypt-pbkdf', to: 'node_modules/bcrypt-pbkdf', filter: ['**/*'] },
          { from: 'node_modules/.pnpm/tweetnacl@0.14.5/node_modules/tweetnacl', to: 'node_modules/tweetnacl', filter: ['**/*'] },
          { from: 'node_modules/.pnpm/safer-buffer@2.1.2/node_modules/safer-buffer', to: 'node_modules/safer-buffer', filter: ['**/*'] },
          // electron-log
          { from: 'node_modules/.pnpm/electron-log@5.4.3/node_modules/electron-log', to: 'node_modules/electron-log', filter: ['**/*'] },
          // uuid
          { from: 'node_modules/.pnpm/uuid@9.0.1/node_modules/uuid', to: 'node_modules/uuid', filter: ['**/*'] },
          // tftp
          { from: 'node_modules/.pnpm/tftp@0.1.2/node_modules/tftp', to: 'node_modules/tftp', filter: ['**/*'] },
        ],
        asar: true,
        asarUnpack: [
          'node_modules/node-pty/**/*',
          'node_modules/serialport/**/*',
          'node_modules/serialport/node_modules/@serialport/**/*'
        ],
        win: { target: [{ target: 'dir', arch: ['x64'] }], sign: null, signingHashAlgorithms: [] }
      }
    });
  } catch (err) {
    // 签名错误可以忽略，继续后续处理
    if (err.code !== 'ERR_ELECTRON_BUILDER_CANNOT_EXECUTE') {
      throw err;
    }
    console.log('Signing skipped (expected on Linux)');
  }

  // 手动复制 @serialport 到 unpacked 目录
  console.log('Copying @serialport to unpacked directory...');
  const unpackedDir = path.join(__dirname, '..', 'release', 'win-unpacked', 'resources', 'app.asar.unpacked', 'node_modules');
  const targetDir = path.join(unpackedDir, 'serialport', 'node_modules', '@serialport');
  
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  
  // 复制 bindings-cpp
  const bindingsCppSrc = path.join(__dirname, '..', 'node_modules', '.pnpm', '@serialport+bindings-cpp@12.0.1', 'node_modules', '@serialport', 'bindings-cpp');
  const bindingsCppDst = path.join(targetDir, 'bindings-cpp');
  
  function copyDir(src, dst) {
    fs.mkdirSync(dst, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const dstPath = path.join(dst, entry.name);
      if (entry.isDirectory()) {
        copyDir(srcPath, dstPath);
      } else {
        fs.copyFileSync(srcPath, dstPath);
      }
    }
  }
  
  copyDir(bindingsCppSrc, bindingsCppDst);
  console.log('Copied @serialport/bindings-cpp');
  
  console.log('Windows build complete!');
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
