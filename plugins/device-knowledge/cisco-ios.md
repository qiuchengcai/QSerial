# Cisco IOS Command Quick Reference

## Navigation Modes
| Prompt | Mode | Access |
|--------|------|--------|
| Router> | User EXEC | Basic monitoring |
| Router# | Privileged EXEC | Full config access (after enable) |
| Router(config)# | Global Config | configure terminal |

## Essential Commands
### Show (Diagnostics)
| Command | Description |
|---------|-------------|
| show version | IOS version, uptime, hardware |
| show running-config | Current active config |
| show ip interface brief | Interface IP status table |
| show interfaces | Detailed interface stats |
| show vlan brief | VLAN summary |
| show mac address-table | MAC table |
| show cdp neighbors | Cisco Discovery neighbors |
| show log | System log |
| show processes cpu | CPU utilization |

### Configuration
| Command | Description |
|---------|-------------|
| hostname NAME | Set device hostname |
| interface GigabitEthernet0/1 | Enter interface config |
| ip address 192.168.1.1 255.255.255.0 | Set IP on interface |
| 
o shutdown | Enable interface |
| lan 10 | Create VLAN |
| ip route 0.0.0.0 0.0.0.0 192.168.1.254 | Default route |

## Console Settings
- Default baud: 9600, 8N1, no flow control
- Some devices use 115200
- Use show line con 0 to check console baud rate
