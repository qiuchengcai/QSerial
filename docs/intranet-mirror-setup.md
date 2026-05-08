# Uniview 内网环境配置指南

> 版本: 1.0.0 | 日期: 2026-04-15

## 变更记录

| 日期 | 版本 | 变更内容 |
|------|------|----------|
| 2026-04-15 | 1.0.0 | 初始版本 |

## 一、镜像源地址

| 服务 | URL |
|------|-----|
| 镜像站首页 | `https://mirrors.uniview.com/` |
| npm registry | `https://mirrors.uniview.com/npm/` |
| Node.js 镜像 | `https://mirrors.uniview.com/node/` |
| Electron 镜像 | `https://mirrors.uniview.com/electron/` |

## 二、npm/pnpm 配置

### 方式一：命令行配置

```bash
# npm 配置
npm config set registry https://mirrors.uniview.com/npm/

# pnpm 配置
pnpm config set registry https://mirrors.uniview.com/npm/
```

### 方式二：.npmrc 文件

在项目根目录或用户目录 (`~/.npmrc`) 创建：

```ini
registry=https://mirrors.uniview.com/npm/
electron_mirror=https://mirrors.uniview.com/electron/
```

## 三、Node.js 安装

### Ubuntu 18.04 (GLIBC 2.27)

系统 GLIBC 版本较低，需使用 Node.js 16.x：

```bash
# 检查 GLIBC 版本
ldd --version | head -1

# 下载 Node.js 16
curl -fsSL https://mirrors.uniview.com/node/v16.20.2/node-v16.20.2-linux-x64.tar.xz -o node.tar.xz
tar -xf node.tar.xz

# 配置环境变量
export PATH=/tmp/node-v16.20.2-linux-x64/bin:$PATH
```

### Ubuntu 20.04+ (GLIBC >= 2.28)

可使用 Node.js 20+：

```bash
# 下载 Node.js 20
curl -fsSL https://mirrors.uniview.com/node/v20.20.2/node-v20.20.2-linux-x64.tar.xz -o node.tar.xz
tar -xf node.tar.xz

# 配置环境变量
export PATH=/tmp/node-v20.20.2-linux-x64/bin:$PATH
```

## 四、pnpm 安装

```bash
# 使用 npm 安装 pnpm
npm install -g pnpm@8.15

# 验证
pnpm --version
```

## 五、原生模块编译

编译 node-pty、serialport 等原生模块时，需配置 Node.js 头文件路径：

```bash
# 设置 node-gyp 配置
export npm_config_nodedir=/tmp/node-v16.20.2-linux-x64

# 编译原生模块
pnpm rebuild node-pty @serialport/bindings-cpp
```

## 六、Electron 打包

### 环境变量

```bash
export ELECTRON_MIRROR=https://mirrors.uniview.com/electron/
```

### electron-builder 配置

在 `electron-builder.config.cjs` 中：

```javascript
module.exports = {
  win: {
    signAndEditExecutable: false,  // 跳过签名（Linux 交叉编译）
  }
}
```

## 七、常见问题

### 1. npm install 报 404

**解决**：使用正确的 URL `https://mirrors.uniview.com/npm/`

### 2. Electron 下载失败

**解决**：
```bash
export ELECTRON_MIRROR=https://mirrors.uniview.com/electron/
```

### 3. node-gyp 编译失败

**解决**：
```bash
export npm_config_nodedir=/path/to/nodejs
```

### 4. GLIBC 版本不兼容

**解决**：使用 Node.js 16.x


---
