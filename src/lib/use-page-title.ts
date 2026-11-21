import { useLayoutEffect } from 'react'
import { brandName } from './brand'

export function usePageTitle(title: string | undefined, brand: string = brandName) {
  useLayoutEffect(() => {
    if (title) document.title = `${title} · ${brand}`
  }, [title, brand])
}
