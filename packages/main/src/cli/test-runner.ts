/**
 * CLI Test Runner
 * Executes JSON test scripts against serial/SSH connections.
 * No Electron dependency - runs as plain Node.js.
 */

import { SerialConnection } from "../services/connection/serial.js";
import { SshConnection } from "../services/connection/ssh.js";
import type { SerialConnectionOptions, SshConnectionOptions } from "@qserial/shared";
import { ConnectionState, ConnectionType } from "@qserial/shared";

export interface TestStep {
  send?: string;
  expect?: string;
  expect_regex?: boolean;
  timeout_ms?: number;
  delay_ms?: number;
  description?: string;
}

export interface TestCase {
  name: string;
  connection: {
    type: "serial" | "ssh";
    port?: string;
    host?: string;
    port_num?: number;
    username?: string;
    password?: string;
    baudRate?: number;
  };
  setup?: TestStep[];
  steps: TestStep[];
  teardown?: TestStep[];
}

export interface StepResult {
  step: number;
  description: string;
  passed: boolean;
  output: string;
  duration_ms: number;
  error?: string;
}

export interface TestResult {
  name: string;
  passed: boolean;
  total: number;
  passed_count: number;
  failed_count: number;
  duration_ms: number;
  steps: StepResult[];
  error?: string;
}

/** Wait helper */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Run a single test case */
export async function runTestCase(tc: TestCase): Promise<TestResult> {
  const t0 = Date.now();
  const results: StepResult[] = [];
  let conn: SerialConnection | SshConnection | null = null;

  try {
    // Create connection
    if (tc.connection.type === "serial") {
      if (!tc.connection.port) throw new Error("Missing port for serial connection");
      const serialOpts: SerialConnectionOptions = {
        id: "cli-" + Date.now(),
        name: tc.name,
        type: ConnectionType.SERIAL,
        path: tc.connection.port,
        baudRate: tc.connection.baudRate || 115200,
        dataBits: 8,
        stopBits: 1,
        parity: "none",
      };
      conn = new SerialConnection(serialOpts);
      await conn.open();
    } else if (tc.connection.type === "ssh") {
      if (!tc.connection.host || !tc.connection.username) {
        throw new Error("Missing host/username for SSH");
      }
      const sshOpts: SshConnectionOptions = {
        id: "cli-" + Date.now(),
        name: tc.name,
        type: ConnectionType.SSH,
        host: tc.connection.host,
        port: tc.connection.port_num || 22,
        username: tc.connection.username,
        password: tc.connection.password,
      };
      conn = new SshConnection(sshOpts);
      await conn.open();
    }

    if (!conn || conn.state !== ConnectionState.CONNECTED) {
      throw new Error("Failed to connect");
    }

    // Set up output buffer
    let outputBuffer = "";
    conn.onData((data: Buffer) => { outputBuffer += data.toString("utf-8"); });

    // Run setup
    if (tc.setup) {
      for (const step of tc.setup) {
        const r = await runStep(conn, step, outputBuffer, results.length + 1);
        results.push(r);
        outputBuffer = ""; // clear after each step
        if (!r.passed) {
          return buildResult(tc.name, results, t0, false, "Setup failed: " + (r.error || ""));
        }
      }
    }

    // Run steps
    for (const step of tc.steps) {
      const r = await runStep(conn, step, outputBuffer, results.length + 1);
      results.push(r);
      outputBuffer = "";
      if (!r.passed) {
        return buildResult(tc.name, results, t0, false);
      }
    }

    // Run teardown
    if (tc.teardown) {
      for (const step of tc.teardown) {
        const r = await runStep(conn, step, outputBuffer, results.length + 1);
        results.push(r);
        outputBuffer = "";
      }
    }

    return buildResult(tc.name, results, t0, true);
  } catch (err) {
    return buildResult(tc.name, results, t0, false, (err as Error).message);
  } finally {
    if (conn) {
      try { await conn.close(); } catch { /* ignore */ }
    }
  }
}

async function runStep(
  conn: SerialConnection | SshConnection,
  step: TestStep,
  existingOutput: string,
  stepNum: number
): Promise<StepResult> {
  const t1 = Date.now();
  const desc = step.description || `Step ${stepNum}`;

  try {
    if (step.delay_ms) await sleep(step.delay_ms);

    // Send
    if (step.send) {
      const data = step.send.endsWith("\n") ? step.send : step.send + "\n";
      conn.write(Buffer.from(data, "utf-8"));
    }

    // Expect
    if (step.expect) {
      const timeout = step.timeout_ms || 5000;
      const startWait = Date.now();
      let output = existingOutput;

      while (Date.now() - startWait < timeout) {
        await sleep(100);
        // Wait for more data via event
        const matched = step.expect_regex
          ? new RegExp(step.expect, "i").test(output)
          : output.includes(step.expect);
        if (matched) {
          return { step: stepNum, description: desc, passed: true, output: output.slice(0, 2000), duration_ms: Date.now() - t1 };
        }
      }
      return { step: stepNum, description: desc, passed: false, output: output.slice(0, 2000), duration_ms: Date.now() - t1, error: `Expected "${step.expect}" not found` };
    }

    // Send-only step: always passes
    return { step: stepNum, description: desc, passed: true, output: existingOutput.slice(0, 2000), duration_ms: Date.now() - t1 };
  } catch (err) {
    return { step: stepNum, description: desc, passed: false, output: existingOutput.slice(0, 500), duration_ms: Date.now() - t1, error: (err as Error).message };
  }
}

function buildResult(name: string, steps: StepResult[], t0: number, passed: boolean, error?: string): TestResult {
  const passedCount = steps.filter((s) => s.passed).length;
  return {
    name,
    passed,
    total: steps.length,
    passed_count: passedCount,
    failed_count: steps.length - passedCount,
    duration_ms: Date.now() - t0,
    steps,
    error,
  };
}
