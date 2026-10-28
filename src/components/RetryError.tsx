export function RetryError({ message, onRetry, retryLabel = 'Retry Loading' }: { message: string; onRetry?: () => void; retryLabel?: string }) {
  return <div role="alert" className="error-message error-message-retry"><p>{message}</p>{onRetry && <button type="button" className="button secondary" onClick={onRetry}>{retryLabel}</button>}</div>
}
