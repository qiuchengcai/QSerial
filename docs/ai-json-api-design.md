# AI JSON API — 开发设计文档

## 目标

在现有 ConnectionServer 的基础上，增加一个并行的 JSON-over-TCP 端口，使局域网内的 AI Agent 可以通过结构化消息操作 QSerial 设备，同时与 TELNET 人类客户端共享同一个设备会话。

---

## 架构

```
                        ┌──────────────────────────────────────┐
                        │         ConnectionServer              │
                        │                                       │
 设备 ←→ IConnection ←→ sharedConnection                       │
                        │                                       │
                        │  :<port>    TELNET TCP  ──→ 人类终端  │
                        │  :<apiPort> JSON TCP   ──→ AI Agent  │
                        └──────────────────────────────────────┘
```

- 两个端口共享同一个 `sharedConnection` 数据流
- 人类看不到 JSON 端口，AI 看不到 TELNET 协议细节
- 人类和 AI 看到的设备输出完全相同，输入内容也相互可见（通过 `peer_input`）

---

## JSON 协议定义

传输层：TCP，每行一个 JSON 对象，换行符 `\n` 分隔。
二进制数据：base64 编码。

### Server → Client

| type | 触发时机 | payload |
|------|---------|---------|
| `hello` | 连接建立后立即 | `{serverId, sourceType, sourceDesc}` |
| `auth_required` | hello 之后（如果设置了密码） | `{}` |
| `auth_ok` | 认证通过 | `{}` |
| `auth_fail` | 认证失败 | `{message}` |
| `data` | 设备有输出 | `{data: "<base64>"}` |
| `peer_input` | 其他客户端写入设备 | `{source: "telnet"\|"json", data: "<base64>"}` |
| `source_down` | 设备连接断开 | `{}` |
| `source_restored` | 设备连接恢复 | `{}` |
| `error` | 异常 | `{message}` |
| `client_join` | 有新客户端连入 | `{source: "telnet"\|"json"}` |
| `client_leave` | 有客户端断开 | `{source: "telnet"\|"json"}` |

### Client → Server

| type | 用途 | payload |
|------|------|---------|
| `auth` | 发送密码 | `{password: "..."}` |
| `write` | 写入 base64 数据 | `{data: "<base64>"}` |
| `write_text` | 写入明文文本 | `{text: "..."}` |
| `resize` | 调整终端大小 | `{cols: 80, rows: 24}` |

### 完整交互序列示例

```
[连接建立]
S → {"type":"auth_required"}
C → {"type":"auth","password":"mypass"}
S → {"type":"auth_ok"}
S → {"type":"hello","serverId":"conn-abc","sourceType":"serial","sourceDesc":"COM3 115200"}

[正常通信]
S → {"type":"data","data":"TG9naW46IA=="}                         ← 设备输出
C → {"type":"write_text","text":"admin\n"}                         ← AI 发送命令
S → {"type":"peer_input","source":"json","data":"YWRtaW4K"}       ← AI输入广播给其他JSON客户端

[状态变化]
S → {"type":"source_down"}                                         ← 设备断开
S → {"type":"source_restored"}                                     ← 设备重连

[客户端通知]
S → {"type":"client_join","source":"telnet"}                       ← 人类连入
S → {"type":"client_leave","source":"telnet"}                      ← 人类断开
```

---

## 修改文件清单

### 1. `packages/shared/src/types/connection.ts` (+6 行)

`ConnectionServerOptions` 新增字段：

```typescript
/** API 端口（JSON协议，供AI/程序化客户端使用） */
apiPort?: number;
/** API 协议，默认 'json-tcp'，预留 'websocket' */
apiProtocol?: 'json-tcp';
```

### 2. `packages/shared/src/types/ipc.ts` (+3 行)

`IpcRequestMap[IPC_CHANNELS.CONNECTION_SERVER_START]` 新增：

```typescript
apiPort?: number;
apiProtocol?: 'json-tcp';
```

`ConnectionServerStatus` 新增：

```typescript
apiPort?: number;
apiClientCount: number;
```

### 3. `packages/main/src/connection/connectionServer.ts` (+~180 行)

新增内容：

#### 3a. JSON 客户端结构

```typescript
interface JsonClientInfo {
  socket: net.Socket;
  address: string;
  authenticated: boolean;
  lineBuffer: string;  // 拼包缓冲区
}
```

#### 3b. 新增私有成员

```typescript
private jsonClients: Map<string, JsonClientInfo> = new Map();
private jsonTcpServer: net.Server | null = null;
```

#### 3c. 新增方法

- `startJsonApiServer()` — 启动 JSON TCP 监听，处理客户端连接、认证、消息解析
- `_broadcastJson(msg: object)` — 向所有认证过的 JSON 客户端广播消息
- `_notifyPeerInput(source: string, data: Buffer)` — 通知 JSON 客户端有其他客户端的输入
- `_notifyClientEvent(action: 'join' | 'leave', source: string)` — 通知 JSON 客户端有客户端连接/断开

#### 3d. 修改现有方法

- `open()` — 在 `startTcpServer()` 后调用 `startJsonApiServer()`
- `close()` — 额外清理 `jsonClients` 和 `jsonTcpServer`
- `_processWriteQueue()` — 写入设备后调用 `_notifyPeerInput()`
- `startTcpServer()` 中的 `socket.on('close')` — TELNET 客户端离开时广播 `client_leave`
- `startTcpServer()` 中的 `socket.on('connect')` — TELNET 客户端连入时广播 `client_join`

#### 3e. JSON 消息处理伪代码

```
socket.on('data', (raw) => {
  lineBuffer += raw.toString()
  while (has complete line) {
    msg = JSON.parse(line)
    switch (msg.type) {
      case 'auth':
        check password → send auth_ok or auth_fail, close if fail
      case 'write':
        sharedConnection.write(base64decode(msg.data))
        _notifyPeerInput('json', decodedData)
      case 'write_text':
        buf = Buffer.from(msg.text)
        sharedConnection.write(buf)
        _notifyPeerInput('json', buf)
      case 'resize':
        sharedConnection.resize(msg.cols, msg.rows)
    }
  }
})
```

### 4. `packages/main/src/ipc/handlers.ts` (+2 行)

`CONNECTION_SERVER_START` handler 中解构 options 时新增：

```typescript
const {
  id, sourceType, existingConnectionId, newConnectionOptions,
  localPort, listenAddress, accessPassword,
  apiPort, apiProtocol,  // ← 新增
} = options;
```

传给 `ConnectionFactory.create` 的 options 对象中新增 `apiPort, apiProtocol`。

### 5. `packages/main/src/preload.ts` (+3 行)

`connectionServer.start` 的 options 参数新增：

```typescript
apiPort?: number;
apiProtocol?: string;
```

### 6. `packages/renderer/src/types/global.d.ts` (+3 行)

同上，`QSerialAPI.connectionServer.start` 的 options 新增类型。

### 7. `packages/renderer/src/components/dialogs/ConnectionShareDialog.tsx` (+~60 行)

新增 UI：
- **API 端口输入框**（`apiPort` 状态变量，默认 `localPort + 1`）
- **协议说明文字**：告知用户 JSON API 的使用方式
- **启动成功弹窗**：同时展示 TELNET 连接命令和 JSON API 连接示例
- **状态显示**：额外显示 `apiClientCount`

---

## 不变的部分

以下现有代码/行为不受任何影响：

- TELNET 客户端的所有行为
- ConnectionFactory 接口
- SerialServer（串口专用共享）— 本次不改
- 现有 IPC 通道名和响应格式
- getStatus() 返回结构（仅扩展字段，不删除）
- SSHJ/Telnet/PTY 等连接类型

---

## AI 端伪代码示例

### Python

```python
import socket, json, base64

class QSerialClient:
    def __init__(self, host, port, password=None):
        self.sock = socket.create_connection((host, port))
        self.reader = self.sock.makefile('r')
        self._handshake(password)

    def _handshake(self, password):
        for line in self.reader:
            msg = json.loads(line)
            if msg['type'] == 'auth_required':
                self._send({'type': 'auth', 'password': password})
            elif msg['type'] == 'auth_ok':
                break
            elif msg['type'] == 'auth_fail':
                raise Exception(msg['message'])

    def _send(self, msg):
        self.sock.sendall((json.dumps(msg) + '\n').encode())

    def write(self, text):
        self._send({'type': 'write_text', 'text': text})

    def read_events(self):
        """生成器，逐条 yield 服务端消息"""
        for line in self.reader:
            yield json.loads(line)

# 使用
client = QSerialClient('192.168.1.100', 9801, password='mypass')
for msg in client.read_events():
    if msg['type'] == 'data':
        output = base64.b64decode(msg['data'])
        if b'error' in output:
            client.write('journalctl -xe\n')
    elif msg['type'] == 'peer_input':
        who = msg['source']
        print(f'[{who}] 输入了: {base64.b64decode(msg["data"])}')
```

### Node.js

```javascript
const net = require('net');

const sock = net.connect({ host: '192.168.1.100', port: 9801 });
let buf = '';
sock.on('data', (chunk) => {
  buf += chunk;
  while (buf.includes('\n')) {
    const i = buf.indexOf('\n');
    const msg = JSON.parse(buf.slice(0, i));
    buf = buf.slice(i + 1);
    // handle msg
  }
});
function send(msg) { sock.write(JSON.stringify(msg) + '\n'); }
```

---

## 测试验证

### 手动测试

1. 启动 QSerial，连接一个 PTY 终端
2. 在连接共享对话框中配置 JSON API 端口（如 9801）
3. 启动共享
4. 另一台机器或本机用 `nc` 测试：
   ```bash
   echo '{"type":"auth","password":"test"}' | nc 127.0.0.1 9801
   echo '{"type":"write_text","text":"echo hello\n"}' | nc 127.0.0.1 9801
   ```
5. 验证 TELNET 客户端能看到 `echo hello` 的回显和输出
6. 验证 JSON 客户端能收到 `peer_input`（当 TELNET 客户端输入时）

### 边缘情况

- 未配置 `apiPort` 时不启动 JSON 服务器（向后兼容）
- JSON 客户端未认证时发送非 auth 消息 → 忽略
- 设备断开后 JSON 客户端收到 `source_down`，可保持连接等待恢复
- 多个 JSON 客户端同时 `write` → 通过 `_processWriteQueue` 串行化，不会乱序

---

## 预估行数

| 文件 | 增量 | 说明 |
|------|------|------|
| shared/types/connection.ts | +6 | apiPort/apiProtocol 字段 |
| shared/types/ipc.ts | +3 | 请求参数 + 状态响应扩展 |
| connection/connectionServer.ts | +180 | JSON 服务器核心实现 |
| ipc/handlers.ts | +2 | 参数透传 |
| preload.ts | +3 | API 签名 |
| renderer/types/global.d.ts | +3 | 类型声明 |
| ConnectionShareDialog.tsx | +60 | UI 字段 |
| **总计** | **~257** | |
