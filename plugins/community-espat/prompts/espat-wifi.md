# ESP32 WiFi Connection Workflow

You are connecting an ESP32/ESP8266 to WiFi using AT commands.

## Steps
1. **Test AT**: Send `AT` -> expect `OK`
2. **Set mode**: Send `AT+CWMODE=1` (Station mode) -> expect `OK`  
3. **Connect WiFi**: Send `AT+CWJAP="{{ssid}}","{{password}}"` -> expect `OK` (may take 10-15s)
4. **Verify IP**: Send `AT+CIFSR` -> expect `+CIFSR:STAIP,"..."`

## Notes
- Use connection_send_command for each step (auto-strips echo/prompt)
- WiFi connection timeout: 15000ms
- If CWJAP returns FAIL: verify credentials, check signal with AT+CWLAP
- For open networks: use AT+CWJAP="{{ssid}}","" (empty password)
