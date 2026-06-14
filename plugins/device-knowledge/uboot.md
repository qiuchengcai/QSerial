# U-Boot Bootloader Command Reference

## Basic Commands
| Command | Description |
|---------|-------------|
| printenv | Print environment variables |
| setenv key value | Set environment variable |
| saveenv | Save environment to flash |
| eset | Reset the board |
| oot | Boot default image |
| ootm addr | Boot kernel image from memory |
| ootz addr | Boot zImage from memory |
| 	ftpboot addr file | Load file via TFTP |
| loadb addr | Load binary via serial (kermit) |
| loady addr | Load binary via serial (ymodem) |
| md addr [len] | Memory display (hex dump) |
| mm addr | Memory modify (interactive) |
| mw addr value [count] | Memory write |
| linfo | Flash info |
| erase addr size | Erase flash region |
| cp src dst count | Copy memory |
| ping ip | Network test |
| dhcp | Get IP via DHCP |
| iminfo addr | Print image header info |
| atinfo dev | Print FAT filesystem info |
| atload dev addr file | Load file from FAT |
| ext2load dev addr file | Load file from ext2 |

## Typical Boot Sequence
1. Power-on → U-Boot SPL → U-Boot proper
2. U-Boot loads kernel + device tree from flash, TFTP, or SD
3. Kernel boots with ootargs from environment

## Debug Tips
- Interrupt boot by pressing any key during countdown
- Common baud rate: 115200
- Default IP often via DHCP or ipaddr env var
- ootargs contains kernel command line
