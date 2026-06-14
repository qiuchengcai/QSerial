import { describe, it, expect } from 'vitest';
import { toJUnitXml, toJsonReport } from '../../src/cli/reporter.js';
import type { TestResult } from '../../src/cli/test-runner.js';

function makeResult(overrides: Partial<TestResult> = {}): TestResult {
  return {
    name: 'default-test',
    passed: true,
    total: 1,
    passed_count: 1,
    failed_count: 0,
    duration_ms: 100,
    steps: [
      {
        step: 1,
        description: 'send AT',
        passed: true,
        output: 'OK\r\n',
        duration_ms: 50,
      },
    ],
    ...overrides,
  };
}

describe('toJUnitXml', () => {
  it('should produce valid XML with single passing test', () => {
    const xml = toJUnitXml([
      makeResult({ name: 'AT Test' }),
    ]);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<testsuites');
    expect(xml).toContain('name="QSerial CI"');
    expect(xml).toContain('<testsuite name="AT Test"');
    expect(xml).toContain('<testcase name="send AT"');
    expect(xml).toContain('failures="0"');
  });

  it('should report failures correctly', () => {
    const xml = toJUnitXml([
      makeResult({
        name: 'Failing Test',
        passed: false,
        passed_count: 0,
        failed_count: 1,
        steps: [
          {
            step: 1,
            description: 'send invalid cmd',
            passed: false,
            output: 'ERROR',
            duration_ms: 30,
            error: 'Expected "OK" not found',
          },
        ],
      }),
    ]);

    expect(xml).toContain('failures="1"');
    expect(xml).toContain('<failure message="Expected &quot;OK&quot; not found">');
  });

  it('should escape XML special characters', () => {
    const xml = toJUnitXml([
      makeResult({
        name: 'Test & < > " \' chars',
        steps: [
          {
            step: 1,
            description: 'send AT & expect <OK>',
            passed: true,
            output: '"response"',
            duration_ms: 10,
          },
        ],
      }),
    ]);

    expect(xml).toContain('Test &amp; &lt; &gt; &quot; &apos; chars');
    expect(xml).toContain('send AT &amp; expect &lt;OK&gt;');
  });

  it('should handle multiple test suites', () => {
    const xml = toJUnitXml([
      makeResult({ name: 'Test A', duration_ms: 100 }),
      makeResult({ name: 'Test B', duration_ms: 200 }),
    ]);

    expect(xml).toContain('<testsuite name="Test A"');
    expect(xml).toContain('<testsuite name="Test B"');
    expect(xml).toContain('tests="2"');
  });

  it('should include error testcase for connection errors', () => {
    const xml = toJUnitXml([
      makeResult({
        name: 'Connection Error Test',
        passed: false,
        total: 0,
        passed_count: 0,
        failed_count: 0,
        duration_ms: 10,
        steps: [],
        error: 'Failed to connect',
      }),
    ]);

    expect(xml).toContain('<testcase name="connection-error"');
    expect(xml).toContain('<error message="Failed to connect">');
  });

  it('should produce well-formed XML closing tags', () => {
    const xml = toJUnitXml([
      makeResult(),
      makeResult({ name: 'Test 2' }),
    ]);

    expect(xml.endsWith('</testsuites>\n')).toBe(true);
    const openSuites = (xml.match(/<testsuites/g) || []).length;
    const closeSuites = (xml.match(/<\/testsuites>/g) || []).length;
    expect(openSuites).toBe(1);
    expect(closeSuites).toBe(1);
  });

  it('should handle empty results array', () => {
    const xml = toJUnitXml([]);
    expect(xml).toContain('tests="0"');
    expect(xml).toContain('failures="0"');
  });

  it('should report errors count correctly', () => {
    const xml = toJUnitXml([
      makeResult({
        name: 'Aborted Test',
        passed: false,
        total: 0,
        passed_count: 0,
        failed_count: 0,
        duration_ms: 5,
        steps: [],
        error: 'Connection aborted',
      }),
    ]);

    expect(xml).toContain('errors="1"');
  });
});

describe('toJsonReport', () => {
  it('should produce valid JSON with summary', () => {
    const json = toJsonReport([
      makeResult({ name: 'AT Test', duration_ms: 150 }),
    ]);

    const parsed = JSON.parse(json);
    expect(parsed.total_tests).toBe(1);
    expect(parsed.passed).toBe(1);
    expect(parsed.failed).toBe(0);
    expect(parsed.suites).toBe(1);
    expect(parsed.duration_ms).toBe(150);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].name).toBe('AT Test');
  });

  it('should aggregate multiple results', () => {
    const json = toJsonReport([
      makeResult({ name: 'A', total: 2, passed_count: 2, failed_count: 0, duration_ms: 100 }),
      makeResult({ name: 'B', total: 3, passed_count: 1, failed_count: 2, duration_ms: 200 }),
    ]);

    const parsed = JSON.parse(json);
    expect(parsed.total_tests).toBe(5);
    expect(parsed.passed).toBe(3);
    expect(parsed.failed).toBe(2);
    expect(parsed.suites).toBe(2);
    expect(parsed.duration_ms).toBe(300);
  });

  it('should include steps in results', () => {
    const json = toJsonReport([
      makeResult({
        name: 'Multi Step',
        total: 2,
        passed_count: 1,
        failed_count: 1,
        steps: [
          { step: 1, description: 'step1', passed: true, output: 'OK', duration_ms: 10 },
          { step: 2, description: 'step2', passed: false, output: '', duration_ms: 20, error: 'timeout' },
        ],
      }),
    ]);

    const parsed = JSON.parse(json);
    expect(parsed.results[0].steps).toHaveLength(2);
    expect(parsed.results[0].steps[0].passed).toBe(true);
    expect(parsed.results[0].steps[1].passed).toBe(false);
    expect(parsed.results[0].steps[1].error).toBe('timeout');
  });

  it('should handle empty results array', () => {
    const json = toJsonReport([]);
    const parsed = JSON.parse(json);
    expect(parsed.total_tests).toBe(0);
    expect(parsed.passed).toBe(0);
    expect(parsed.failed).toBe(0);
    expect(parsed.results).toEqual([]);
  });
});
