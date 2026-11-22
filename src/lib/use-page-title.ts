import { useLayoutEffect } from 'react'
import { brandName } from './brand'

export function usePageTitle(title: string | undefined, brand: string = brandName, { fallbackToBrand = false } = {}) {
  useLayoutEffect(() => {
    if (title) document.title = `${title} · ${brand}`
    else if (fallbackToBrand) document.title = brand
  }, [title, brand, fallbackToBrand])
}
