export function operationErrorMessage(error: unknown, fallback = 'The operation failed. Existing files and history are retained.') {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message) {
    const code = 'code' in error && typeof error.code === 'string' ? ` (${error.code})` : ''
    return `${error.message}${code}`
  }
  return typeof error === 'string' && error ? error : fallback
}
