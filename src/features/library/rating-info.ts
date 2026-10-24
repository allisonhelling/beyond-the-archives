import { createContext } from 'react'

export const defaultRatingInfo = 'Add how your personal rating system corresponds to the stars here! Edit this text in settings. To hide the info symbol, leave the box blank.'
export const RatingInfoContext = createContext(defaultRatingInfo)
