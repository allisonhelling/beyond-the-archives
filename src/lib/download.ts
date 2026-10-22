export function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  try { link.click() } finally {
    link.remove()
    // Give Safari time to consume the download before releasing the object URL.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
}

