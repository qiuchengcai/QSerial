const { version } = require('./package.json');

module.exports = {
  appId: 'com.qserial.app',
  productName: 'QSerial',
  copyright: `Copyright © ${new Date().getFullYear()} QSerial Team`,
  publish: null,

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
      from: 'node_modules/serialport',
      to: 'node_modules/serialport',
      filter: ['**/*'],
    },
    // @serialport 命名空间下的所有包
    {
      from: 'node_modules/@serialport/binding-mock',
      to: 'node_modules/@serialport/binding-mock',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/@serialport/bindings-cpp',
      to: 'node_modules/@serialport/bindings-cpp',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/@serialport/bindings-interface',
      to: 'node_modules/@serialport/bindings-interface',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/@serialport/parser-byte-length',
      to: 'node_modules/@serialport/parser-byte-length',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/@serialport/parser-cctalk',
      to: 'node_modules/@serialport/parser-cctalk',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/@serialport/parser-delimiter',
      to: 'node_modules/@serialport/parser-delimiter',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/@serialport/parser-inter-byte-timeout',
      to: 'node_modules/@serialport/parser-inter-byte-timeout',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/@serialport/parser-packet-length',
      to: 'node_modules/@serialport/parser-packet-length',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/@serialport/parser-readline',
      to: 'node_modules/@serialport/parser-readline',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/@serialport/parser-ready',
      to: 'node_modules/@serialport/parser-ready',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/@serialport/parser-regex',
      to: 'node_modules/@serialport/parser-regex',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/@serialport/parser-slip-encoder',
      to: 'node_modules/@serialport/parser-slip-encoder',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/@serialport/parser-spacepacket',
      to: 'node_modules/@serialport/parser-spacepacket',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/@serialport/stream',
      to: 'node_modules/@serialport/stream',
      filter: ['**/*'],
    },
    // serialport 的依赖
    {
      from: 'node_modules/debug',
      to: 'node_modules/debug',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/ms',
      to: 'node_modules/ms',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/node-gyp-build',
      to: 'node_modules/node-gyp-build',
      filter: ['**/*'],
    },
    // ssh2 及其依赖
    {
      from: 'node_modules/ssh2',
      to: 'node_modules/ssh2',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/asn1',
      to: 'node_modules/asn1',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/bcrypt-pbkdf',
      to: 'node_modules/bcrypt-pbkdf',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/tweetnacl',
      to: 'node_modules/tweetnacl',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/safer-buffer',
      to: 'node_modules/safer-buffer',
      filter: ['**/*'],
    },
    // node-pty
    {
      from: 'node_modules/node-pty',
      to: 'node_modules/node-pty',
      filter: ['**/*'],
    },
    // tftp
    {
      from: 'node_modules/tftp',
      to: 'node_modules/tftp',
      filter: ['**/*'],
    },
    // @modelcontextprotocol/sdk (MCP server)
    {
      from: 'node_modules/@modelcontextprotocol/sdk',
      to: 'node_modules/@modelcontextprotocol/sdk',
      filter: ['**/*'],
    },
    // @modelcontextprotocol/sdk 的依赖
    {
      from: 'node_modules/zod',
      to: 'node_modules/zod',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/zod-to-json-schema',
      to: 'node_modules/zod-to-json-schema',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/eventsource',
      to: 'node_modules/eventsource',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/eventsource-parser',
      to: 'node_modules/eventsource-parser',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/content-type',
      to: 'node_modules/content-type',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/raw-body',
      to: 'node_modules/raw-body',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/bytes',
      to: 'node_modules/bytes',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/http-errors',
      to: 'node_modules/http-errors',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/depd',
      to: 'node_modules/depd',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/inherits',
      to: 'node_modules/inherits',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/setprototypeof',
      to: 'node_modules/setprototypeof',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/statuses',
      to: 'node_modules/statuses',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/toidentifier',
      to: 'node_modules/toidentifier',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/iconv-lite',
      to: 'node_modules/iconv-lite',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/unpipe',
      to: 'node_modules/unpipe',
      filter: ['**/*'],
    },
    {
      from: 'node_modules/cross-spawn',
      to: 'node_modules/cross-spawn',
      filter: ['**/*'],
    },
    // ftp-srv 通过 extraResources 打包（依赖链较深，使用打平安装方式）
  ],

  extraResources: [
    {
      from: 'resources',
      to: 'resources',
      filter: ['**/*'],
    },
  ],

  asar: true,
  asarUnpack: [
    'node_modules/node-pty/**/*',
    'node_modules/@serialport/bindings-cpp/**/*',
    'node_modules/ssh2/**/*',
  ],
  npmRebuild: false,

  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64'],
      },
      {
        target: 'portable',
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
