const { version } = require('./package.json');

module.exports = {
  appId: 'com.qserial.app',
  productName: 'QSerial',
  copyright: `Copyright 婕?${new Date().getFullYear()} QSerial Team`,
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
    // 鏉╂劘顢戦弮鏈电贩鐠ф牗妲х亸鍕剁礄閻?scripts/gen-deps-mapping.cjs 閼奉亜濮╅悽鐔稿灇閿?    // 闁插秵鏌婇悽鐔稿灇: node scripts/gen-deps-mapping.cjs
    ...require('./electron-builder.config.deps.cjs'),
  ],

  extraResources: [
    {
      from: 'node_modules/ffmpeg-static',
      to: 'ffmpeg-static',
      filter: ['ffmpeg.exe', 'ffmpeg', 'ffmpeg_darwin', 'package.json'],
    },
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
    'node_modules/ffmpeg-static/**/*',
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

    win: {
    icon: 'build/icon.ico',
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
