/**
 * 内置设备识别规则插件
 *
 * 通过 ctx.device.registerProfiles 注册设备指纹，供 conn.analyze.probe 使用。
 * 这是第三方插件编写自定义设备识别规则的参考范例：
 * 1. 在 package.json 声明 permissions: ["device:register"]；
 * 2. 在入口文件导出 activate(ctx)，调用 ctx.device.registerProfiles([...])。
 *
 * 说明：此文件中的 PROFILES 与主进程 BUILTIN_DEVICE_PROFILES（零回归兜底）
 * 保持一致，本插件为权威来源。
 */

const PROFILES = [
  {
    name: 'ESP32/ESP8266',
    patterns: ['ESP32', 'ESP8266', 'AT version', 'ready'],
    baud_hint: 115200,
  },
  { name: 'STM32', patterns: ['STM32', 'STMicroelectronics', 'U-Boot SPL'], baud_hint: 115200 },
  {
    name: 'Raspberry Pi',
    patterns: ['Raspberry Pi', 'raspberrypi', 'Debian', 'Raspbian'],
    baud_hint: 115200,
  },
  {
    name: 'NXP i.MX',
    patterns: ['imx6ull', 'imx6', 'imx8', 'imx', 'NXP', 'Freescale', '100ask'],
    baud_hint: 115200,
  },
  {
    name: 'TI AM335x',
    patterns: ['AM335', 'BeagleBone', 'beaglebone', 'TI Sitara'],
    baud_hint: 115200,
  },
  {
    name: 'U-Boot',
    patterns: ['U-Boot', 'Hit any key', 'Loading from', 'Booting'],
    baud_hint: 115200,
  },
  { name: 'Buildroot', patterns: ['Buildroot', 'buildroot'], baud_hint: 115200 },
  { name: 'Yocto/Poky', patterns: ['Yocto', 'Poky', 'poky'], baud_hint: 115200 },
  {
    name: 'OpenWrt',
    patterns: [
      'OpenWrt',
      'openwrt',
      'LuCI',
      'Attitude Adjustment',
      'Barrier Breaker',
      'Chaos Calmer',
      'LEDE',
    ],
    baud_hint: 115200,
  },
  {
    name: 'Linux',
    patterns: ['login:', 'Password:', 'Debian', 'Ubuntu', 'CentOS', 'kernel'],
    baud_hint: 115200,
  },
  { name: 'BusyBox', patterns: ['BusyBox', '/ #', '# '], baud_hint: 115200 },
  {
    name: 'Cisco IOS',
    patterns: ['Cisco IOS', 'Router>', 'Switch>', 'enable'],
    baud_hint: 9600,
  },
  { name: 'Juniper JunOS', patterns: ['JunOS', 'Juniper', 'junos'], baud_hint: 9600 },
  {
    name: 'MikroTik RouterOS',
    patterns: ['MikroTik', 'RouterOS', 'mikrotik'],
    baud_hint: 115200,
  },
  {
    name: 'EdgeOS (Ubiquiti)',
    patterns: ['EdgeOS', 'Ubiquiti', 'EdgeRouter', 'Vyatta'],
    baud_hint: 115200,
  },
  { name: 'Arduino', patterns: ['Arduino', 'avrdude'], baud_hint: 9600 },
  { name: 'FreeRTOS', patterns: ['FreeRTOS', 'freertos'], baud_hint: 115200 },
  { name: 'Zephyr', patterns: ['Zephyr', 'zephyr'], baud_hint: 115200 },
  { name: 'NuttX', patterns: ['NuttX', 'nuttx', 'NuttShell'], baud_hint: 115200 },
  {
    name: 'Android',
    patterns: ['Android', 'android', 'bootloader', 'fastboot'],
    baud_hint: 115200,
  },
  {
    name: 'BIOS/UEFI',
    patterns: ['BIOS', 'UEFI', 'American Megatrends', 'AMI', 'Insyde', 'Phoenix'],
    baud_hint: 115200,
  },
];

export async function activate(ctx) {
  ctx.device.registerProfiles(PROFILES);
  ctx.log.info(`registered ${PROFILES.length} device profiles`);
}

export function deactivate() {
  // 贡献由宿主在停用插件时统一回收，无需在此手动清理
}
