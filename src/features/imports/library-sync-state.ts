export const librarySyncSafetyLimitError = 'Reached the 500-page safety limit. Prepare the saved batch to import it and continue scanning.'

export function isLibrarySyncSafetyLimit(state: { attention?: string; error?: string } | null | undefined) {
 // Recognize checkpoints saved before the companion had a distinct attention type.
 return state?.attention === 'safety_limit' || Boolean(state?.error?.startsWith('Reached the 500-page safety limit.'))
}
