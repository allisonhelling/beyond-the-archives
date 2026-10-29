type ImportFailure = { code?: string; message?: string; details?: string; hint?: string }

/** Preserve the backend reason instead of diagnosing every failure as a migration. */
export function importError(operation: string, error: ImportFailure): Error {
  let advice = 'Resolve the reported error before retrying.'
  if (['PGRST202', 'PGRST204', '42883', '42P01', '42703'].includes(error.code ?? '')) {
    advice = 'The database/API schema does not match this app. Check the connected project, installed migrations, and API schema cache.'
  } else if (['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(error.code ?? '')) {
    advice = 'Sign in again. If access is still denied, check the account’s import permissions.'
  } else if (error.code === '57014') {
    advice = 'The database cancelled this request, possibly because it exceeded its time limit. Check import history before retrying; repeated cancellations need investigation.'
  } else if (['40P01', '55P03'].includes(error.code ?? '')) {
    advice = 'Another database operation blocked this request. Retry after other library operations finish.'
  } else if (!error.code || /fetch|network|load failed/i.test(error.message ?? '')) {
    advice = 'The request could not be confirmed. Check your connection and import history before retrying.'
  }
  const reason = [error.code && `[${error.code}]`, error.message?.trim()].filter(Boolean).join(' ')
  return new Error(`${operation}. ${advice}${reason ? ` Server response: ${reason}` : ''}`, { cause: error })
}
