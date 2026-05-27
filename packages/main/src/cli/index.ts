#!/usr/bin/env node
/**
 * QSerial CLI - Hardware CI/CD test runner
 * Usage: qserial-test --script <test.json> [--device COM3] [--format junit|json]
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { runTestCase, type TestCase, type TestResult } from "./test-runner.js";
import { toJUnitXml, toJsonReport } from "./reporter.js";

interface CliArgs {
  script: string;
  device?: string;
  format: "junit" | "json";
  output?: string;
  help: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = { script: "", format: "junit", help: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--script":
      case "-s":
        result.script = args[++i] || "";
        break;
      case "--device":
      case "-d":
        result.device = args[++i] || "";
        break;
      case "--format":
      case "-f":
        result.format = (args[++i] === "json" ? "json" : "junit");
        break;
      case "--output":
      case "-o":
        result.output = args[++i] || "";
        break;
      case "--help":
      case "-h":
        result.help = true;
        break;
    }
  }
  return result;
}

function printHelp(): void {
  console.log(`
QSerial CLI - Hardware CI/CD Test Runner

Usage: qserial-test --script <test.json> [options]

Options:
  -s, --script <path>   Test script JSON file (required)
  -d, --device <port>   Override serial port (e.g. COM3, /dev/ttyUSB0)
  -f, --format <fmt>    Output format: junit (default) or json
  -o, --output <path>   Write report to file (default: stdout)
  -h, --help            Show this help

Test Script Format (JSON):
{
  "tests": [
    {
      "name": "My Test",
      "connection": {
        "type": "serial",
        "port": "COM3",
        "baudRate": 115200
      },
      "steps": [
        { "send": "AT", "expect": "OK", "description": "AT test" },
        { "send": "AT+GMR", "expect": "AT version", "timeout_ms": 5000 }
      ]
    }
  ]
}
`);
}

async function main(): Promise<void> {
  const cli = parseArgs();

  if (cli.help || !cli.script) {
    printHelp();
    process.exit(cli.help ? 0 : 1);
  }

  // Load test script
  const scriptPath = path.resolve(cli.script);
  if (!fs.existsSync(scriptPath)) {
    console.error(`Error: Test script not found: ${scriptPath}`);
    process.exit(1);
  }

  let script: { tests: TestCase[] };
  try {
    script = JSON.parse(fs.readFileSync(scriptPath, "utf-8"));
  } catch (err) {
    console.error(`Error: Invalid JSON in test script: ${(err as Error).message}`);
    process.exit(1);
  }

  if (!script.tests || !Array.isArray(script.tests)) {
    console.error('Error: Test script must have a "tests" array');
    process.exit(1);
  }

  // Override device port if specified
  if (cli.device) {
    for (const tc of script.tests) {
      if (tc.connection.type === "serial") {
        tc.connection.port = cli.device;
      }
    }
  }

  // Run tests
  console.error(`QSerial CI: Running ${script.tests.length} test(s)...`);
  const results: TestResult[] = [];
  for (const tc of script.tests) {
    console.error(`  [${tc.name}] Starting...`);
    const result = await runTestCase(tc);
    results.push(result);
    const status = result.passed ? "PASS" : "FAIL";
    console.error(`  [${tc.name}] ${status} (${result.passed_count}/${result.total} steps, ${result.duration_ms}ms)`);
    if (result.error) console.error(`    Error: ${result.error}`);
  }

  // Generate report
  const report = cli.format === "json" ? toJsonReport(results) : toJUnitXml(results);

  if (cli.output) {
    fs.writeFileSync(path.resolve(cli.output), report, "utf-8");
    console.error(`Report written to: ${cli.output}`);
  } else {
    console.log(report);
  }

  // Exit with failure if any test failed
  const hasFailures = results.some((r) => !r.passed);
  process.exit(hasFailures ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(2);
});
