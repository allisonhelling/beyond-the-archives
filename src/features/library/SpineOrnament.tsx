export function SpineOrnament({ horizontal = false }: { horizontal?: boolean }) {
  return <svg viewBox={horizontal ? '0 0 40 12' : '0 0 12 40'} width={horizontal ? 40 : 12} height={horizontal ? 12 : 40} preserveAspectRatio="none" focusable="false" aria-hidden="true"><path transform={horizontal ? 'translate(40 0) rotate(90)' : undefined} d="M5.4 0H6.6C6.6 16 6.6 18 12 20C6.6 22 6.6 24 6.6 40H5.4C5.4 24 5.4 22 0 20C5.4 18 5.4 16 5.4 0Z" fill="currentColor" /></svg>
}
