import assert from 'node:assert/strict'
import { test } from 'node:test'
import { evaluateAudit, runAudit } from '../audit-dependencies.mjs'
const url = 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf'
const advisory = { name: 'picomatch', url, severity: 'high' }
const entry = (via, severity = 'high') => ({ via, severity })
const report = vulnerabilities => ({ auditReportVersion: 2, vulnerabilities, metadata: { vulnerabilities: { total: Object.keys(vulnerabilities).length } } })
const graph = () => ({ picomatch: entry([advisory]), vite: entry(['picomatch']) })
const now = '2026-11-17'
test('allows only the documented advisory and its transitive paths before expiry', () => {
 assert.deepEqual(evaluateAudit(report(graph()), now), { failures: [], excepted: true })
 assert.deepEqual(evaluateAudit(report(graph()), '2026-12-18').failures.sort(), ['picomatch', 'vite'])
})
test('fails on other advisories even when they share an affected package', () => {
 const vulnerabilities = graph()
 vulnerabilities.picomatch.via.push({ name: 'picomatch', url: 'https://github.com/advisories/GHSA-other', severity: 'moderate' })
 assert.deepEqual(evaluateAudit(report(vulnerabilities), now).failures.sort(), ['picomatch', 'vite'])
})
test('fails on unrelated findings and unknown or cyclic paths', () => {
 for (const extra of [entry([{name:'other', url:'https://example.test', severity:'high'}]), entry(['missing']), entry(['other'])]) {
  const vulnerabilities = { ...graph(), other: extra }
  assert.ok(evaluateAudit(report(vulnerabilities), now).failures.includes('other'))
 }
})
test('fails closed on malformed reports and audit execution errors', () => {
 assert.throws(() => evaluateAudit({ vulnerabilities: {} }, now))
 assert.throws(() => runAudit([], () => ({ status: 1, stdout: '{', stderr: 'network error' })))
 assert.throws(() => runAudit([], () => ({ status: 2, stdout: '' })))
 assert.throws(() => runAudit(['--omit=dev'], () => ({ status: 1, stdout: JSON.stringify(report(graph())) })), /Production dependency audit failed/)
})
