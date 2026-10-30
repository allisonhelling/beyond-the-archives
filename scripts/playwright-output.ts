/** Workers inherit the run ID so concurrent runners never clean each other's traces. */
export function playwrightOutputDir(suite: string) {
  const runId = process.env.BTA_PLAYWRIGHT_RUN_ID ??= `${Date.now()}-${process.pid}`
  return `test-results/${suite}/${runId}`
}
