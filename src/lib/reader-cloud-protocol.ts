export type ReaderCloudRequest = {
  p_id: string
  p_key: string
  p_value: unknown
  p_base: number
  p_generation: number
}

export function readerEpubPath(owner: string, hash: string, generation: number) {
  return `${owner}/${hash}/${generation}.epub`
}
