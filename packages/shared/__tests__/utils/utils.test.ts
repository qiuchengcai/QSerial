import { describe, it, expect } from "vitest";
import {
  bufferToBase64, base64ToBuffer, stringToHex, hexToString,
  formatHex, formatTimestamp,
} from "../../src/utils/encoding.js";
import { uuid, shortId } from "../../src/utils/uuid.js";
import {
  isValidHost, isValidPort, isNonEmptyString,
  validateSerialOptions, validateSshOptions,
} from "../../src/utils/validation.js";

describe("encoding", () => {
  describe("bufferToBase64 / base64ToBuffer", () => {
    it("should round-trip", () => {
      const input = Buffer.from("Hello, 世界!");
      const b64 = bufferToBase64(input);
      expect(typeof b64).toBe("string");
      const decoded = base64ToBuffer(b64);
      expect(decoded.equals(input)).toBe(true);
    });

    it("should handle empty buffer", () => {
      const b64 = bufferToBase64(Buffer.alloc(0));
      expect(b64).toBe("");
      expect(base64ToBuffer(b64).length).toBe(0);
    });

    it("should handle binary data", () => {
      const input = Buffer.from([0x00, 0xFF, 0x7E, 0x01]);
      const b64 = bufferToBase64(input);
      const decoded = base64ToBuffer(b64);
      expect(decoded.equals(input)).toBe(true);
    });
  });

  describe("stringToHex / hexToString", () => {
    it("should round-trip ASCII", () => {
      const hex = stringToHex("ABC");
      expect(hex).toBe("414243");
      expect(hexToString(hex)).toBe("ABC");
    });

    it("should round-trip Unicode", () => {
      const hex = stringToHex("你好");
      expect(hexToString(hex)).toBe("你好");
    });

    it("should handle empty string", () => {
      expect(stringToHex("")).toBe("");
      expect(hexToString("")).toBe("");
    });
  });

  describe("formatHex", () => {
    it("should format buffer as hex dump", () => {
      const data = Buffer.from("Hello");
      const result = formatHex(data);
      expect(result).toContain("48 65 6C 6C 6F");
      expect(result).toContain("|Hello|");
    });

    it("should use address offsets", () => {
      const data = Buffer.alloc(32, 0x41);
      const result = formatHex(data);
      expect(result).toContain("00000000");
      expect(result).toContain("00000010");
    });
  });

  describe("formatTimestamp", () => {
    it("should return bracketed timestamp", () => {
      const ts = formatTimestamp(new Date("2024-01-01T12:00:00.000Z"));
      expect(ts).toMatch(/^\[\d{2}:\d{2}:\d{2}\.\d{3}\]$/);
    });
  });
});

describe("uuid", () => {
  describe("uuid", () => {
    it("should return valid UUID v4 format", () => {
      const id = uuid();
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
    });

    it("should generate unique IDs", () => {
      const ids = new Set(Array.from({ length: 100 }, () => uuid()));
      expect(ids.size).toBe(100);
    });
  });

  describe("shortId", () => {
    it("should return string of given length", () => {
      expect(shortId(8)).toHaveLength(8);
      expect(shortId(16)).toHaveLength(16);
    });

    it("should contain only alphanumeric chars", () => {
      const id = shortId(32);
      expect(id).toMatch(/^[A-Za-z0-9]+$/);
    });

    it("should default to length 8", () => {
      expect(shortId()).toHaveLength(8);
    });
  });
});

describe("validation", () => {
  describe("isValidHost", () => {
    it("should accept valid IPv4", () => {
      expect(isValidHost("192.168.1.1")).toBe(true);
      expect(isValidHost("10.0.0.1")).toBe(true);
      expect(isValidHost("127.0.0.1")).toBe(true);
    });

    it("should reject invalid IPv4", () => {
      expect(isValidHost("256.1.1.1")).toBe(false);
      expect(isValidHost("1.1.1")).toBe(false);
      expect(isValidHost("")).toBe(false);
      expect(isValidHost("..")).toBe(false);
    });

    it("should accept valid domain names", () => {
      expect(isValidHost("example.com")).toBe(true);
      expect(isValidHost("sub.example.co.uk")).toBe(true);
      expect(isValidHost("my-host.local")).toBe(true);
    });

    it("should reject invalid domain names", () => {
      expect(isValidHost("")).toBe(false);
      expect(isValidHost("-example.com")).toBe(false);
    });
  });

  describe("isValidPort", () => {
    it("should accept valid ports", () => {
      expect(isValidPort(1)).toBe(true);
      expect(isValidPort(22)).toBe(true);
      expect(isValidPort(8080)).toBe(true);
      expect(isValidPort(65535)).toBe(true);
    });

    it("should reject invalid ports", () => {
      expect(isValidPort(0)).toBe(false);
      expect(isValidPort(-1)).toBe(false);
      expect(isValidPort(65536)).toBe(false);
      expect(isValidPort(3.14)).toBe(false);
      expect(isValidPort(NaN)).toBe(false);
    });
  });

  describe("isNonEmptyString", () => {
    it("should accept non-empty strings", () => {
      expect(isNonEmptyString("hello")).toBe(true);
      expect(isNonEmptyString(" a ")).toBe(true);
    });

    it("should reject empty/whitespace strings", () => {
      expect(isNonEmptyString("")).toBe(false);
      expect(isNonEmptyString("   ")).toBe(false);
    });

    it("should reject non-strings", () => {
      expect(isNonEmptyString(123)).toBe(false);
      expect(isNonEmptyString(null)).toBe(false);
      expect(isNonEmptyString(undefined)).toBe(false);
      expect(isNonEmptyString({})).toBe(false);
    });
  });

  describe("validateSerialOptions", () => {
    it("should pass valid options", () => {
      const errors = validateSerialOptions({
        id: "s1", name: "Serial", type: "serial" as any,
        path: "/dev/ttyUSB0", baudRate: 115200,
        dataBits: 8, stopBits: 1, parity: "none",
      });
      expect(errors).toHaveLength(0);
    });

    it("should reject missing path", () => {
      const errors = validateSerialOptions({
        id: "s1", name: "S", type: "serial" as any,
        path: "", baudRate: 9600,
        dataBits: 8, stopBits: 1, parity: "none",
      });
      expect(errors.length).toBeGreaterThan(0);
    });

    it("should reject invalid baud rate", () => {
      const errors = validateSerialOptions({
        id: "s1", name: "S", type: "serial" as any,
        path: "/dev/tty", baudRate: 9999,
        dataBits: 8, stopBits: 1, parity: "none",
      });
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe("validateSshOptions", () => {
    it("should pass valid options", () => {
      const errors = validateSshOptions({
        id: "ssh1", name: "SSH", type: "ssh" as any,
        host: "192.168.1.1", port: 22,
        username: "admin", password: "secret",
      });
      expect(errors).toHaveLength(0);
    });

    it("should reject missing host", () => {
      const errors = validateSshOptions({
        id: "ssh1", name: "SSH", type: "ssh" as any,
        host: "", port: 22,
        username: "admin", password: "secret",
      });
      expect(errors.length).toBeGreaterThan(0);
    });

    it("should reject missing credentials", () => {
      const errors = validateSshOptions({
        id: "ssh1", name: "SSH", type: "ssh" as any,
        host: "example.com", port: 22,
        username: "admin",
      });
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
