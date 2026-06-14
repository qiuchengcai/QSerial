# OpenWrt CLI Quick Reference

## System
| Command | Description |
|---------|-------------|
| uci show | Show all config |
| uci set key=value | Set config value |
| uci commit | Write config changes |
| opkg update | Update package lists |
| opkg install pkg | Install package |
| opkg list-installed | List installed packages |
| logread | Read system log |
| dmesg | Kernel ring buffer |
| eboot | Reboot device |

## Network
| Command | Description |
|---------|-------------|
| ifconfig | Interface info |
| ip addr | IP address info |
| iwconfig | Wireless interface info |
| wifi | Restart WiFi |
| iw dev wlan0 scan | Scan WiFi networks |
| cat /etc/config/network | Network config |
| cat /etc/config/wireless | Wireless config |

## Debug & Serial
| Command | Description |
|---------|-------------|
| cat /proc/cpuinfo | CPU info |
| cat /proc/mtd | Flash partitions |
| ree | Memory usage |
| df -h | Disk usage |
| ps | Process list |
| 	op -n 1 | CPU/memory snapshot |

## Console Settings
- Baud rate: 115200 (8N1, no flow control)
- Default shell: ash
- First boot: no password, press Enter at login
