import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

// Review or remove this exception when a patched picomatch release is available.
const exception = { url: 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf', package: 'picomatch', expires: '2026-12-17' }
const severity = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 }

export function evaluateAudit(report, today = new Date().toISOString().slice(0, 10)) {
 if (report?.auditReportVersion !== 2 || !report.vulnerabilities || typeof report.vulnerabilities !== 'object' || Array.isArray(report.vulnerabilities) || !report.metadata?.vulnerabilities || report.error) throw new Error('Invalid npm audit report')
 const vulnerabilities = report.vulnerabilities
 const entries = Object.entries(vulnerabilities)
 if (report.metadata.vulnerabilities.total !== entries.length) throw new Error('Incomplete npm audit report')
 let excepted = false
 function acceptable(name, visiting = new Set()) {
  const entry = vulnerabilities[name]
  if (!entry || !Array.isArray(entry.via) || !entry.via.length || !(entry.severity in severity) || visiting.has(name)) return false
  const path = new Set(visiting).add(name)
  return entry.via.every(cause => {
   if (typeof cause === 'string') return acceptable(cause, path)
   if (!cause || typeof cause !== 'object' || !(cause.severity in severity) || typeof cause.url !== 'string' || typeof cause.name !== 'string') return false
   if (severity[cause.severity] < severity.moderate) return true
   if (name === exception.package && cause.name === exception.package && cause.url === exception.url && today <= exception.expires) { excepted = true; return true }
   return false
  })
 }
 const failures = entries.filter(([, value]) => !(value.severity in severity) || severity[value.severity] >= severity.moderate).filter(([name]) => !acceptable(name)).map(([name]) => name)
 return { failures, excepted }
}

export function runAudit(args = [], run = spawnSync) {
 const result = run('npm', ['audit', '--json', '--audit-level=moderate', ...args], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
 if (result.error || result.signal || ![0, 1].includes(result.status)) throw new Error(`npm audit failed to run: ${result.error?.message ?? result.signal ?? result.status}`)
 let report
 try { report = JSON.parse(result.stdout) } catch { throw new Error(`npm audit did not return a valid report: ${result.stderr || 'invalid JSON'}`) }
 if (args.includes('--omit=dev')) {
  if (report.auditReportVersion !== 2 || report.error || !report.metadata?.vulnerabilities || !report.vulnerabilities || report.metadata.vulnerabilities.total !== Object.keys(report.vulnerabilities).length) throw new Error('Invalid npm production audit report')
  if (result.status !== 0) throw new Error(`Production dependency audit failed:\n${JSON.stringify(report.vulnerabilities, null, 2)}`)
  return
 }
 const { failures, excepted } = evaluateAudit(report)
 if (result.status === 0 && failures.length) throw new Error('npm audit exit status contradicts report')
 if (result.status === 1 && !Object.keys(report.vulnerabilities).length) throw new Error('npm audit failed without vulnerability details')
 if (excepted) console.warn(`Temporary exception: ${exception.url} (review by ${exception.expires}); only this advisory and its dependency paths are allowed.`)
 if (failures.length) throw new Error(`Unexcepted moderate-or-higher audit findings: ${failures.join(', ')}\n${JSON.stringify(report.vulnerabilities, null, 2)}`)
 console.log('Dependency audit passed; no unexcepted moderate-or-higher findings.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 try { runAudit(); runAudit(['--omit=dev']); console.log('Production dependency audit passed.') }
 catch (error) { console.error(error.message); process.exitCode = 1 }
}
