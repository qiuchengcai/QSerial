const { version } = require('./package.json');

module.exports = {
  appId: 'com.qserial.app',
  productName: 'QSerial',
  copyright: `Copyright © ${new Date().getFullYear()} QSerial Team`,

  directories: {
    output: 'release',
    buildResources: 'build',
  },

  files: [
    'packages/main/dist/**/*',
    'packages/renderer/dist/**/*',
    'package.json',
    {
      from: 'packages/shared',
      to: 'node_modules/@qserial/shared',
      filter: ['dist/**/*', 'package.json'],
    },
    // serialport 主包
    {
      from: 'node_modules/.pnpm/serialport@12.0.0/node_modules/serialport',
      to: 'node_modules/serialport',
      filter: ['**/*'],
    },
    // @serialport 命名空间下的所有包
    {
      from: 'node_modules/.pnpm/@serialport+binding-mock@10.2.2/node_modules/@serialport/binding-mock',
      to: 'node_modules/@serialport/binding-mock',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/.pnpm/@serialport+bindings-cpp@12.0.1/node_modules/@serialport/bindings-cpp',
      to: 'node_modules/@serialport/bindings-cpp',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/.pnpm/@serialport+bindings-interface@1.2.2/node_modules/@serialport/bindings-interface',
      to: 'node_modules/@serialport/bindings-interface',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/.pnpm/@serialport+parser-byte-length@12.0.0/node_modules/@serialport/parser-byte-length',
      to: 'node_modules/@serialport/parser-byte-length',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/.pnpm/@serialport+parser-cctalk@12.0.0/node_modules/@serialport/parser-cctalk',
      to: 'node_modules/@serialport/parser-cctalk',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/.pnpm/@serialport+parser-delimiter@12.0.0/node_modules/@serialport/parser-delimiter',
      to: 'node_modules/@serialport/parser-delimiter',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/.pnpm/@serialport+parser-inter-byte-timeout@12.0.0/node_modules/@serialport/parser-inter-byte-timeout',
      to: 'node_modules/@serialport/parser-inter-byte-timeout',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/.pnpm/@serialport+parser-packet-length@12.0.0/node_modules/@serialport/parser-packet-length',
      to: 'node_modules/@serialport/parser-packet-length',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/.pnpm/@serialport+parser-readline@12.0.0/node_modules/@serialport/parser-readline',
      to: 'node_modules/@serialport/parser-readline',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/.pnpm/@serialport+parser-ready@12.0.0/node_modules/@serialport/parser-ready',
      to: 'node_modules/@serialport/parser-ready',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/.pnpm/@serialport+parser-regex@12.0.0/node_modules/@serialport/parser-regex',
      to: 'node_modules/@serialport/parser-regex',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/.pnpm/@serialport+parser-slip-encoder@12.0.0/node_modules/@serialport/parser-slip-encoder',
      to: 'node_modules/@serialport/parser-slip-encoder',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/.pnpm/@serialport+parser-spacepacket@12.0.0/node_modules/@serialport/parser-spacepacket',
      to: 'node_modules/@serialport/parser-spacepacket',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/.pnpm/@serialport+stream@12.0.0/node_modules/@serialport/stream',
      to: 'node_modules/@serialport/stream',
      filter: ['**/*'],
    },
    // serialport 的依赖
    {
      from: 'node_modules/.pnpm/debug@4.3.4/node_modules/debug',
      to: 'node_modules/debug',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/.pnpm/ms@2.1.2/node_modules/ms',
      to: 'node_modules/ms',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/.pnpm/node-gyp-build@4.6.0/node_modules/node-gyp-build',
      to: 'node_modules/node-gyp-build',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/.pnpm/node-addon-api@7.0.0/node_modules/node-addon-api',
      to: 'node_modules/node-addon-api',
      filter: ['**/*'],
    },
    // ssh2 及其依赖
    {
      from: 'node_modules/.pnpm/ssh2@1.17.0/node_modules/ssh2',
      to: 'node_modules/ssh2',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/.pnpm/asn1@0.2.6/node_modules/asn1',
      to: 'node_modules/asn1',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/.pnpm/bcrypt-pbkdf@1.0.2/node_modules/bcrypt-pbkdf',
      to: 'node_modules/bcrypt-pbkdf',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/.pnpm/tweetnacl@0.14.5/node_modules/tweetnacl',
      to: 'node_modules/tweetnacl',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/.pnpm/safer-buffer@2.1.2/node_modules/safer-buffer',
      to: 'node_modules/safer-buffer',
      filter: ['**/*'],
    },
    // node-pty
    {
      from: 'node_modules/.pnpm/node-pty@1.1.0/node_modules/node-pty',
      to: 'node_modules/node-pty',
      filter: ['**/*'],
    },
    // tftp
    {
      from: 'node_modules/.pnpm/tftp@0.1.2/node_modules/tftp',
      to: 'node_modules/tftp',
      filter: ['**/*'],
    },
    // electron-log
    {
      from: 'node_modules/.pnpm/electron-log@5.4.3/node_modules/electron-log',
      to: 'node_modules/electron-log',
      filter: ['**/*'],
    },
    // uuid
    {
      from: 'node_modules/.pnpm/uuid@9.0.1/node_modules/uuid',
      to: 'node_modules/uuid',
      filter: ['**/*'],
    },
  ],

  extraResources: [
    {
      from: 'resources',
      to: 'resources',
      filter: ['**/*'],
    },
  ],

  extraFiles: [
    {
      from: 'scripts/launch-network.bat',
      to: 'launch-network.bat',
    },
  ],

  asar: true,
  npmRebuild: false,

  win: {
    target: [
      {
        target: 'dir',
        arch: ['x64'],
      },
    ],
    icon: 'build/icon.ico',
    artifactName: '${productName}-${version}-${arch}-${os}.${ext}',
    signAndEditExecutable: false,
  },

  mac: {
    target: [
      {
        target: 'dmg',
        arch: ['x64', 'arm64'],
      },
    ],
    icon: 'build/icon.icns',
    category: 'public.app-category.developer-tools',
    hardenedRuntime: true,
    gatekeeperAssess: false,
    artifactName: '${productName}-${version}-${arch}-${os}.${ext}',
  },

  linux: {
    target: ['AppImage', 'deb'],
    icon: 'build/icons',
    category: 'Development',
    maintainer: 'qserial@example.com',
    artifactName: '${productName}-${version}-${arch}-${os}.${ext}',
  },

  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'QSerial',
    installerIcon: 'build/icon.ico',
    uninstallerIcon: 'build/icon.ico',
  },

  portable: {
    artifactName: '${productName}-${version}-${arch}-${os}-portable.${ext}',
  },

  dmg: {
    contents: [
      {
        x: 130,
        y: 220,
      },
      {
        x: 410,
        y: 220,
        type: 'link',
        path: '/Applications',
      },
    ],
  },
};
