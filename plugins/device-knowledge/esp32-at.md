# ESP32 / ESP8266 AT Command Reference

## WiFi Commands
| Command | Description |
|---------|-------------|
| AT | Test AT startup |
| AT+RST | Restart module |
| AT+GMR | View version info |
| AT+CWMODE=1 | Set WiFi mode (1=Station, 2=AP, 3=Both) |
| AT+CWLAP | List available APs |
| AT+CWJAP="SSID","PASSWORD" | Connect to AP |
| AT+CWQAP | Disconnect from AP |
| AT+CIFSR | Get local IP and MAC |
| AT+CIPSTART | Establish TCP/UDP connection |
| AT+CIPSEND | Send data |
| AT+CIPCLOSE | Close connection |
| AT+PING="host" | Ping host |
| AT+CIPMUX=0 | Connection mode (0=single, 1=multiple) |

## HTTP / MQTT
| Command | Description |
|---------|-------------|
| AT+HTTPCLIENT | HTTP client request |
| AT+MQTTUSERCFG | Configure MQTT user |
| AT+MQTTCONN | Connect to MQTT broker |
| AT+MQTTPUB | Publish MQTT message |
| AT+MQTTSUB | Subscribe to MQTT topic |

## Common Issues
- Baud rate: typically 115200 (some modules use 74800 at boot)
- Flow control: usually RTS/CTS disabled
- Always send \r\n line endings
- ESP32 may need GPIO0 low + EN toggle for flash mode
