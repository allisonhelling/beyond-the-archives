import { useId, useRef, useState } from 'react'

export function FilePicker({ label, accept, multiple = false, disabled = false, className = '', onChange }: {
  label: string; accept: string; multiple?: boolean; disabled?: boolean; className?: string
  onChange: (files: File[]) => void
}) {
  const id = useId(), input = useRef<HTMLInputElement>(null)
  const [names, setNames] = useState('')
  return <div className={className}>
    <label htmlFor={id}>{label}</label>
    <div className="file-picker">
      <input ref={input} id={id} type="file" accept={accept} multiple={multiple} disabled={disabled} hidden onChange={event => {
        const files = Array.from(event.target.files ?? [])
        event.target.value = ''
        if (!files.length) return
        setNames(files.map(file => file.name).join(', '))
        onChange(files)
      }} />
      <button type="button" className="button secondary" disabled={disabled} onClick={() => input.current?.click()}>Choose Files</button>
      <span aria-live="polite">{names || 'No file chosen'}</span>
    </div>
  </div>
}
