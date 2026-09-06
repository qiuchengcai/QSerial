/**
 * 设备识别规则（指纹）集中管理
 *
 * 内置 21 类设备指纹由内置插件 qserial-plugin-device-profiles 提供；
 * 此处 BUILTIN_DEVICE_PROFILES 作为"零回归"兜底：当该内置插件被停用或损坏时，
 * conn.analyze.probe 仍能返回与历史版本一致的结果。
 *
 * 注意：BUILTIN_DEVICE_PROFILES 需与 plugins/qserial-plugin-device-profiles/index.mjs
 * 中的 PROFILES 保持一致（getAllDeviceProfiles 按 name 去重，插件侧为权威来源）。
 */

import type { DeviceProfile } from '../../plugins/registry.js';
import { getDeviceProfiles as getPluginProfiles } from '../../plugins/registry.js';

/** 内置 21 类设备指纹（历史版本硬编码于 conn.analyze.probe，现迁移至此） */
export const BUILTIN_DEVICE_PROFILES: DeviceProfile[] = [
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

/**
 * 返回用于设备探测的全部规则：内置兜底 + 插件贡献（按 name 去重）。
 */
export function getAllDeviceProfiles(): DeviceProfile[] {
  const merged: DeviceProfile[] = [];
  const names = new Set<string>();

  for (const profile of [...BUILTIN_DEVICE_PROFILES, ...getPluginProfiles()]) {
    if (names.has(profile.name)) continue;
    names.add(profile.name);
    merged.push(profile);
  }
  return merged;
}
