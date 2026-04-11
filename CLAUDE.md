# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

QSerial is a cross-platform terminal application built with Electron, supporting multiple connection types: local terminal (PTY), serial port, SSH, and Telnet.

## Development Commands

```bash
# Install dependencies
pnpm install

# Build shared package first (required before other builds)
pnpm build:shared

# Start development mode
pnpm dev

# Build all packages
pnpm build

# Run the application
pnpm start

# Package for distribution
pnpm package          # Current platform
pnpm package:win      # Windows
pnpm package:mac      # macOS
pnpm package:linux    # Linux

# Linting and formatting
pnpm lint             # Check for issues
pnpm lint:fix         # Auto-fix lint issues
pnpm format           # Format code with Prettier

# Testing
pnpm test             # Run tests once
pnpm test:watch       # Run tests in watch mode
```

## Architecture

### Monorepo Structure

- `packages/main/` - Electron main process (Node.js)
- `packages/renderer/` - React frontend (browser environment)
- `packages/shared/` - Shared types, constants, and utilities

**Build order matters**: `shared` must be built before `main` and `renderer` since they depend on it.

### Main Process (`packages/main/`)

Handles native functionality:
- Window lifecycle management (`src/index.ts`)
- Connection implementations (`src/connection/`): PTY, Serial, SSH
- IPC handlers (`src/ipc/handlers.ts`)
- Configuration persistence (`src/config/manager.ts`)

Key files:
- `src/index.ts` - Application entry point, window creation
- `src/connection/factory.ts` - Creates and manages connection instances
- `src/preload.ts` - Exposes IPC APIs to renderer via contextBridge

### Renderer Process (`packages/renderer/`)

React application with:
- UI components (`src/components/`)
- State management with Zustand (`src/stores/`)
- Terminal rendering with xterm.js

Key stores:
- `terminal.ts` - Terminal sessions and tabs
- `sessions.ts` - Saved connection sessions
- `config.ts` - Application settings
- `theme.ts` - Theme management

### Shared Package (`packages/shared/`)

TypeScript types and constants shared between processes:
- `types/connection.ts` - Connection types, options, and interfaces
- `types/ipc.ts` - IPC channel names and message types
- `types/config.ts` - Configuration structure
- `constants/` - Shared constants
- `utils/` - Utility functions

### IPC Communication Pattern

1. Main process exposes APIs via `preload.ts` using `contextBridge.exposeInMainWorld`
2. Renderer accesses via `window.electronAPI`
3. Request/response pattern: `invoke(channel, params)` → returns Promise
4. Events from main: `on(channel, callback)` for data/state updates

Example IPC flow:
```
Renderer                          Main Process
   |                                    |
   | invoke('connection:create', opts)  |
   |----------------------------------->|
   |                                    | ConnectionFactory.create()
   |         { id: string }             |
   |<-----------------------------------|
   |                                    |
   | on('connection:data', callback)    |  (event from main when data arrives)
```

## Connection Types

All connections implement `IConnection` interface (`packages/shared/src/types/connection.ts`):

- **PTY**: Local terminal using `node-pty`
- **Serial**: Serial port using `serialport`
- **SSH**: Remote SSH using `ssh2`
- **Telnet**: Telnet protocol

## Code Style

- TypeScript with strict mode
- ESLint + Prettier for formatting
- Single quotes, semicolons, 2-space indentation
- React functional components with hooks

## Key Dependencies

- **Electron 28** - Desktop framework
- **React 18** - UI framework
- **xterm.js 5** - Terminal rendering
- **Zustand** - State management
- **Tailwind CSS** - Styling
- **Vite** - Build tool for renderer
- **TypeScript** - Type system
- **node-pty** - PTY support
- **serialport** - Serial communication
- **ssh2** - SSH protocol

## Configuration

User configuration stored in Electron's userData directory:
- Config file: `config.json`
- Sessions: `sessions.json`

Default config structure defined in `packages/shared/src/types/config.ts`.
