# ESP32 TCP Client Connection Workflow

You are connecting an ESP32/ESP8266 as a TCP client using AT commands.

## Steps
1. **Test AT**: Send `AT` -> expect `OK`
2. **Connect WiFi** (if not connected): Use espat-wifi prompt first
3. **Create TCP connection**: Send `AT+CIPSTART="TCP","{{host}}",{{port}}` -> expect `OK` or `CONNECT`
4. **Send data**: 
   - Send `AT+CIPSEND=<len>` where len is the data length in bytes
   - Wait for `>` prompt
   - Send the actual data (no trailing newline)
   - Expect `SEND OK`
5. **Read data**: Incoming data arrives as `+IPD,<len>:<data>`
6. **Close connection**: Send `AT+CIPCLOSE` -> expect `CLOSED`

## Notes
- Use connection_send_command for each AT command (auto-strips echo/prompt)
- TCP connection timeout: 10000ms
- CIPSTART may take 5-10s depending on network conditions
- For TLS connections, use `AT+CIPSTART="SSL","{{host}}",{{port}}`
- Check connection status with `AT+CIPSTATUS`
- Maximum CIPSEND length varies by firmware (typically 2048 bytes)
