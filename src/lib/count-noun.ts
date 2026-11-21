/** English UI labels use the singular only for exactly one. */
export function countNoun(count: number | null | undefined, singular: string, plural = `${singular}s`) {
  return count === 1 ? singular : plural
}
