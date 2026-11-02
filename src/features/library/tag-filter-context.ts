import { createContext } from 'react'

export const TagFilterContext = createContext<((tag: string) => void) | undefined>(undefined)
