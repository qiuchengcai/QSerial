/**
 * JUnit XML Reporter
 * Converts TestResult[] to JUnit XML format for CI integration.
 */

import type { TestResult } from "./test-runner.js";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function toJUnitXml(results: TestResult[]): string {
  const totalTests = results.reduce((s, r) => s + r.total, 0);
  const failures = results.reduce((s, r) => s + r.failed_count, 0);
  const errors = results.filter((r) => r.error && r.passed_count === 0).length;
  const totalTime = results.reduce((s, r) => s + r.duration_ms, 0) / 1000;

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += `<testsuites name="QSerial CI" tests="${totalTests}" failures="${failures}" errors="${errors}" time="${totalTime.toFixed(3)}">\n`;

  for (const result of results) {
    const suiteTime = result.duration_ms / 1000;
    xml += `  <testsuite name="${escapeXml(result.name)}" tests="${result.total}" failures="${result.failed_count}" errors="${result.error ? 1 : 0}" time="${suiteTime.toFixed(3)}">\n`;

    for (const step of result.steps) {
      const stepTime = step.duration_ms / 1000;
      xml += `    <testcase name="${escapeXml(step.description)}" time="${stepTime.toFixed(3)}"`;
      if (!step.passed) {
        xml += ">\n";
        xml += `      <failure message="${escapeXml(step.error || "Assertion failed")}">\n`;
        xml += `        Expected output to match but got:\n${escapeXml(step.output.slice(0, 1000))}\n`;
        xml += "      </failure>\n";
        xml += "    </testcase>\n";
      } else {
        xml += " />\n";
      }
    }

    if (result.error) {
      xml += `    <testcase name="connection-error" time="0">\n`;
      xml += `      <error message="${escapeXml(result.error)}">${escapeXml(result.error)}</error>\n`;
      xml += "    </testcase>\n";
    }

    xml += "  </testsuite>\n";
  }

  xml += "</testsuites>\n";
  return xml;
}

export function toJsonReport(results: TestResult[]): string {
  const summary = {
    total_tests: 0,
    passed: 0,
    failed: 0,
    duration_ms: 0,
    suites: results.length,
    results,
  };
  for (const r of results) {
    summary.total_tests += r.total;
    summary.passed += r.passed_count;
    summary.failed += r.failed_count;
    summary.duration_ms += r.duration_ms;
  }
  return JSON.stringify(summary, null, 2);
}
