/**
 * MCP tools tests
 * Validates helper functions used by MCP tools
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock native dependencies
vi.mock("serialport", () => ({
  SerialPort: vi.fn().mockImplementation(() => ({
    on: vi.fn(), write: vi.fn(), close: vi.fn(), set: vi.fn(), isOpen: true,
  })),
}));
vi.mock("node-pty", () => ({
  spawn: vi.fn(() => ({
    onData: vi.fn(), write: vi.fn(), resize: vi.fn(), kill: vi.fn(),
  })),
}));
vi.mock("ssh2", () => ({
  Client: vi.fn().mockImplementation(() => ({
    on: vi.fn(), connect: vi.fn(), end: vi.fn(),
  })),
}));
vi.mock("electron", () => ({
  BrowserWindow: vi.fn(),
  app: { getPath: vi.fn(() => "/tmp"), commandLine: { appendSwitch: vi.fn() } },
}));

import { ConnectionFactory } from "../../src/services/connection/factory.ts";
import { ConnectionType } from "@qserial/shared";

describe("MCP Tool Helpers", () => {
  beforeEach(() => {
    ConnectionFactory.initialize();
  });

  describe("buffer management", () => {
    it("should create connection and attach data listener", async () => {
      const conn = await ConnectionFactory.create({
        id: "buf-test", name: "Buffer Test",
        type: ConnectionType.PTY, shell: "bash",
      });
      expect(conn).toBeDefined();
      expect(conn.id).toBe("buf-test");
      const unsub = conn.onData(() => {});
      expect(unsub).toBeInstanceOf(Function);
      unsub();
    });
  });

  describe("pattern matching", () => {
    function matchPattern(text: string, pattern: string, isRegex: boolean): boolean {
      if (isRegex) {
        try { return new RegExp(pattern, "i").test(text); }
        catch { return text.toLowerCase().includes(pattern.toLowerCase()); }
      }
      return text.toLowerCase().includes(pattern.toLowerCase());
    }

    it("should match plain substring (case insensitive)", () => {
      expect(matchPattern("Hello World", "hello", false)).toBe(true);
      expect(matchPattern("Hello World", "WORLD", false)).toBe(true);
      expect(matchPattern("Hello", "xyz", false)).toBe(false);
    });

    it("should match regex patterns", () => {
      expect(matchPattern("Login: ", "login[:\\s]", true)).toBe(true);
      expect(matchPattern("Password: ", "password[:\\s]", true)).toBe(true);
    });

    it("should fall back to substring on invalid regex", () => {
      expect(matchPattern("[invalid", "[invalid", true)).toBe(true);
      expect(matchPattern("test", "[invalid", true)).toBe(false);
    });
  });

  describe("state analysis", () => {
    interface TerminalState {
      state: string; shell_type?: string;
      detected_prompts: string[]; details: string;
    }
    function analyzeState(output: string, connectionState: string): TerminalState {
      if (connectionState !== "connected") {
        return { state: "idle", detected_prompts: [], details: "not connected" };
      }
      if (!output || output.trim().length === 0) {
        return { state: "idle", detected_prompts: [], details: "empty buffer" };
      }
      const tail = output.slice(-1024).toLowerCase();
      const detected: string[] = [];
      if (/password[:\s]/i.test(tail)) detected.push("password_prompt");
      if (/login[:\s]|username[:\s]/i.test(tail) && !detected.includes("password_prompt"))
        detected.push("login_prompt");
      const lastLine = (output.split("\n").filter(l => l.trim()).pop() || "").trim();
      let shellType = "";
      if (lastLine.endsWith("# ") || lastLine.match(/#\s*$/)) { shellType = "root"; detected.push("root_shell"); }
      else if (lastLine.endsWith("$ ") || lastLine.match(/\$\s*$/)) { shellType = "user"; detected.push("user_shell"); }
      else if (lastLine.endsWith("> ") || lastLine.match(/>\s*$/)) { shellType = "prompt"; detected.push("shell_prompt"); }
      const bootIndicators = ["booting", "kernel", "u-boot", "uboot"];
      const hasBootMsg = bootIndicators.some(k => tail.includes(k));
      if (detected.includes("password_prompt")) return { state: "password_prompt", shell_type: shellType || undefined, detected_prompts: detected, details: "waiting for password" };
      if (detected.includes("login_prompt")) return { state: "login_prompt", shell_type: shellType || undefined, detected_prompts: detected, details: "waiting for username" };
      if (shellType) return { state: "shell", shell_type: shellType, detected_prompts: detected, details: "shell ready" };
      if (hasBootMsg) return { state: "booting", detected_prompts: detected, details: "device booting" };
      return { state: "program_running", detected_prompts: detected, details: "output detected" };
    }

    it("should detect password prompt", () => {
      expect(analyzeState("login: admin\nPassword: ", "connected").state).toBe("password_prompt");
    });
    it("should detect login prompt", () => {
      expect(analyzeState("Ubuntu 22.04\nhost login: ", "connected").state).toBe("login_prompt");
    });
    it("should detect root shell", () => {
      const r = analyzeState("root@host:~# ", "connected");
      expect(r.state).toBe("shell");
      expect(r.shell_type).toBe("root");
    });
    it("should detect user shell", () => {
      const r = analyzeState("user@host:~$ ", "connected");
      expect(r.state).toBe("shell");
      expect(r.shell_type).toBe("user");
    });
    it("should detect booting state", () => {
      expect(analyzeState("U-Boot 2024.01\nStarting kernel...\n", "connected").state).toBe("booting");
    });
    it("should detect idle when empty", () => {
      expect(analyzeState("", "connected").state).toBe("idle");
    });
    it("should detect idle when disconnected", () => {
      expect(analyzeState("root@host:~# ", "disconnected").state).toBe("idle");
    });
  });
});
