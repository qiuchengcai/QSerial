import { describe, it, expect } from "vitest";
import { IPC_CHANNELS } from "../../src/types/ipc.js";

describe("IPC_CHANNELS", () => {
  it("should define all connection management channels", () => {
    expect(IPC_CHANNELS.CONNECTION_CREATE).toBe("connection:create");
    expect(IPC_CHANNELS.CONNECTION_OPEN).toBe("connection:open");
    expect(IPC_CHANNELS.CONNECTION_CLOSE).toBe("connection:close");
    expect(IPC_CHANNELS.CONNECTION_DESTROY).toBe("connection:destroy");
    expect(IPC_CHANNELS.CONNECTION_WRITE).toBe("connection:write");
    expect(IPC_CHANNELS.CONNECTION_DATA).toBe("connection:data");
    expect(IPC_CHANNELS.CONNECTION_STATE).toBe("connection:state");
  });

  it("should define config channels", () => {
    expect(IPC_CHANNELS.CONFIG_GET).toBe("config:get");
    expect(IPC_CHANNELS.CONFIG_SET).toBe("config:set");
    expect(IPC_CHANNELS.CONFIG_DELETE).toBe("config:delete");
  });

  it("should define file transfer channels", () => {
    expect(IPC_CHANNELS.TFTP_START).toBe("tftp:start");
    expect(IPC_CHANNELS.TFTP_STOP).toBe("tftp:stop");
    expect(IPC_CHANNELS.NFS_START).toBe("nfs:start");
    expect(IPC_CHANNELS.NFS_STOP).toBe("nfs:stop");
  });

  it("should define MCP channels", () => {
    expect(IPC_CHANNELS.MCP_START).toBe("mcp:start");
    expect(IPC_CHANNELS.MCP_STOP).toBe("mcp:stop");
  });

  it("should define window channels", () => {
    expect(IPC_CHANNELS.WINDOW_MINIMIZE).toBe("window:minimize");
    expect(IPC_CHANNELS.WINDOW_MAXIMIZE).toBe("window:maximize");
    expect(IPC_CHANNELS.WINDOW_CLOSE).toBe("window:close");
  });

  it("should have unique channel names", () => {
    const values = Object.values(IPC_CHANNELS);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});
