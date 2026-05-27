/**
 * MCP Prompts - server-defined prompt templates
 */
export const MCP_PROMPTS = [
  {
    name: "esp32-at",
    description: "ESP32/ESP8266 AT command guide for WiFi, TCP, HTTP operations",
    arguments: [
      { name: "device_port", description: "Serial port (e.g. COM3)", required: true },
      { name: "baud_rate", description: "Baud rate, default 115200", required: false },
    ],
  },
  {
    name: "uboot-flash",
    description: "U-Boot firmware flashing and recovery workflow",
    arguments: [
      { name: "device_port", description: "Serial port", required: true },
      { name: "firmware_path", description: "Path to firmware image file", required: true },
      { name: "flash_offset", description: "Flash offset address (hex)", required: false },
    ],
  },
  {
    name: "cisco-config",
    description: "Cisco IOS router/switch basic configuration template",
    arguments: [
      { name: "hostname", description: "Device hostname", required: true },
      { name: "mgmt_ip", description: "Management IP address", required: true },
      { name: "mgmt_mask", description: "Subnet mask", required: true },
    ],
  },
  {
    name: "linux-diag",
    description: "Linux embedded device diagnostic workflow (logs, network, processes)",
    arguments: [
      { name: "device_port", description: "Connection ID", required: true },
    ],
  },
  {
    name: "serial-debug",
    description: "General serial port debugging and troubleshooting guide",
    arguments: [
      { name: "device_port", description: "Serial port (e.g. COM3)", required: true },
    ],
  },
  {
    name: "modbus-query",
    description: "Modbus RTU register read via serial (hex write)",
    arguments: [
      { name: "device_port", description: "Serial port (e.g. COM3)", required: true },
      { name: "slave_id", description: "Modbus slave ID (1-247)", required: true },
      { name: "register_addr", description: "Starting register address (hex)", required: true },
    ],
  },
];

const TPL: Record<string, string> = {};

TPL["esp32-at"] = [
  "You are debugging an ESP32/ESP8266 device on port {{device_port}} at {{baud_rate}} baud.",
  "",
  "## Connection",
  "Use connection_create: type=serial, port={{device_port}}, baudRate={{baud_rate}}",
  "",
  "## Common AT Commands",
  "| Command | Description | Response |",
  "| AT | Basic test | OK |",
  "| AT+GMR | Firmware version | AT version |",
  "| AT+CWMODE=1 | WiFi station mode | OK |",
  "| AT+CWJAP=ssid,pwd | Connect WiFi | OK / FAIL |",
  "| AT+CIFSR | Get IP address | +CIFSR:STAIP |",
  "| AT+CIPSTART=TCP,host,port | TCP connect | CONNECT |",
  "| AT+CIPSEND=N | Send N bytes | > |",
  "",
  "## Tips",
  "Use connection_send_command for clean output (auto-strips echo and prompt).",
  "Timeout 10s for WiFi operations.",
  "Use connection_expect with expect_regex=true for pattern matching.",
].join("\n");

TPL["uboot-flash"] = [
  "Flashing firmware to U-Boot device on {{device_port}}.",
  "Firmware: {{firmware_path}}, Flash offset: {{flash_offset}}",
  "",
  "## Workflow",
  "1. Interrupt boot: send any key during autoboot countdown",
  '2. Verify prompt: expect "=>" or "U-Boot>"',
  "3. Erase: erase {{flash_offset}} +$filesize",
  "4. Load via XMODEM: connection_send_file protocol=xmodem file={{firmware_path}}",
  "5. Verify: crc32 {{flash_offset}} $filesize",
  "6. Boot: bootm {{flash_offset}} or reset",
  "",
  "## Common U-Boot Commands",
  "printenv, setenv, saveenv, mmc info, tftpboot, md (memory dump), mm (memory modify)",
].join("\n");

TPL["cisco-config"] = [
  "Configuring Cisco IOS device.",
  "Hostname: {{hostname}}, Management IP: {{mgmt_ip}}/{{mgmt_mask}}",
  "",
  "## Basic Configuration",
  "enable",
  "configure terminal",
  "hostname {{hostname}}",
  "enable secret cisco123",
  "line vty 0 4",
  " password cisco123",
  " login",
  "exit",
  "interface vlan 1",
  " ip address {{mgmt_ip}} {{mgmt_mask}}",
  " no shutdown",
  "exit",
  "ip default-gateway {{mgmt_ip}}",
  "end",
  "write memory",
  "",
  "Use connection_send_command for each line. Wait for # or > prompt between commands.",
].join("\n");

TPL["linux-diag"] = [
  "Diagnosing Linux embedded device on {{device_port}}.",
  "",
  "## System Info",
  "uname -a",
  "cat /proc/cpuinfo",
  "cat /proc/meminfo",
  "df -h",
  "mount",
  "",
  "## Network",
  "ifconfig -a  or  ip addr show",
  "ping -c 3 8.8.8.8",
  "netstat -tulpn",
  "",
  "## Processes",
  "ps aux",
  "top -n 1 -b",
  "",
  "## Logs",
  "dmesg | tail -50",
  "tail -100 /var/log/messages",
  "journalctl -n 50 --no-pager",
  "",
  "## Extra",
  "cat /proc/interrupts | lsusb | lspci | free -m | uptime | cat /etc/os-release",
].join("\n");

TPL["serial-debug"] = [
  "Debugging device on serial port {{device_port}}.",
  "",
  "## Workflow",
  "1. Connect: connection_create type=serial port={{device_port}}",
  "2. Probe: connection_probe to auto-detect device type",
  "3. Observe: connection_read consume=false to see current output",
  "4. Interact: connection_send_command for clean command/response",
  "5. Login: connection_login if login prompt detected",
  "6. Monitor: connection_watch for error/crash patterns",
  "7. Summarize: connection_summarize for session statistics",
  "",
  "## Common Baud Rates",
  "9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600",
  "",
  "## Troubleshooting",
  "- No output: check baud rate, flow control, DTR/RTS settings",
  "- Garbled text: baud rate mismatch between device and terminal",
  "- Timeout: increase response_timeout_ms (embedded devices may need 3-5s)",
].join("\n");

TPL["modbus-query"] = [
  "Querying Modbus RTU device on {{device_port}}.",
  "Slave ID: {{slave_id}}, Starting Register: {{register_addr}}",
  "",
  "## Modbus RTU Frame Format (Read Holding Registers, Function 03)",
  "Byte 0: Slave ID (1-247)",
  "Byte 1: Function Code (03 = read holding registers)",
  "Byte 2-3: Starting address (big-endian)",
  "Byte 4-5: Quantity of registers (big-endian)",
  "Byte 6-7: CRC16 (Modbus)",
  "",
  "## Example: Read 1 register at 0x0000 from slave 1",
  "Hex frame: 01 03 00 00 00 01 84 0A",
  "Send with: connection_write_hex hex=010300000001840A",
  "",
  "## For your device",
  "Build frame: [{{slave_id}}] [03] [addr_hi] [addr_lo] [00] [01] + CRC16",
  "Send the hex string using connection_write_hex",
].join("\n");

export function getPrompt(name: string, args: Record<string, string>): {
  messages: Array<{ role: string; content: { type: string; text: string } }>;
} | null {
  const template = TPL[name];
  if (!template) return null;

  let text = template;
  for (const [key, value] of Object.entries(args)) {
    text = text.replace(new RegExp("{{" + key + "}}", "g"), value || "");
  }
  // Defaults for unfilled placeholders
  text = text.replace(/\{\{baud_rate\}\}/g, "115200");
  text = text.replace(/\{\{flash_offset\}\}/g, "0x80000000");

  return {
    messages: [{ role: "user", content: { type: "text", text } }],
  };
}
