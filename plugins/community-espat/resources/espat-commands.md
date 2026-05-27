# ESP32/ESP8266 AT Command Reference

## Basic Commands
| Command | Description | Response |
|---------|-------------|----------|
| AT | Test AT startup | OK |
| AT+RST | Restart module | OK + READY |
| AT+GMR | Firmware version | AT version:x.x.x |
| AT+GSLP=N | Deep sleep N ms | OK |
| ATE0 | Echo off | OK |
| ATE1 | Echo on | OK |

## WiFi Commands
| Command | Description | Response |
|---------|-------------|----------|
| AT+CWMODE=1 | Station mode | OK |
| AT+CWMODE=2 | SoftAP mode | OK |
| AT+CWMODE=3 | Station+SoftAP | OK |
| AT+CWJAP="ssid","pwd" | Connect to AP | OK / FAIL |
| AT+CWQAP | Disconnect from AP | OK |
| AT+CWLAP | List available APs | +CWLAP:(...) |
| AT+CIFSR | Get local IP | +CIFSR:STAIP,"..." |
| AT+CIPSTA? | Query station IP | +CIPSTA:ip:"..." |
| AT+CIPAP? | Query SoftAP IP | +CIPAP:ip:"..." |

## TCP/UDP Commands
| Command | Description | Response |
|---------|-------------|----------|
| AT+CIPSTART="TCP","host",port | TCP connect | CONNECT / ALREADY |
| AT+CIPSTART="UDP","host",port | UDP connect | CONNECT |
| AT+CIPSEND=N | Send N bytes | > |
| AT+CIPCLOSE | Close connection | CLOSED |
| AT+CIPSTATUS | Connection status | STATUS:x |
| AT+CIPSERVER=1,port | Start TCP server | OK |
| AT+CIPSERVERMAXCONN=N | Max server connections | OK |

## HTTP Commands (ESP32)
| Command | Description |
|---------|-------------|
| AT+HTTPCLIENT=1,"url" | HTTP GET request |
| AT+HTTPCLIENT=2,"url","data" | HTTP POST request |

## MQTT Commands (ESP32)
| Command | Description |
|---------|-------------|
| AT+MQTTUSERCFG=0,"scheme","id","user","pwd",0,0,"" | Config MQTT |
| AT+MQTTCONN=0,"broker",port,0 | Connect MQTT broker |
| AT+MQTTPUB=0,"topic","data",1,0 | Publish message |
| AT+MQTTSUB=0,"topic",1 | Subscribe topic |

## Troubleshooting
- No response to AT: check baud rate (default 115200), reset module
- CWJAP fails: verify SSID/password, check signal strength
- CIPSEND timeout: use connection_expect with longer timeout for slow networks
- ESP8266 vs ESP32: ESP32 has HTTP/MQTT built-in commands, ESP8266 needs AT+CIP for raw TCP
