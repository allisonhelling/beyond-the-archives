export const defaultShelfColors = { all: '#970000', currently_reading: '#214921', paused_reading: '#8b491e', to_read: '#243c5e', favorites: '#54254b', recs: '#92504e', finished: '#4a1b0f', did_not_finish: '#25211f', series: '#07534a' } as const

export const collectionColors = [
  { label: 'Burgundy', value: defaultShelfColors.all }, { label: 'Forest', value: defaultShelfColors.currently_reading },
  { label: 'Navy', value: defaultShelfColors.to_read }, { label: 'Finished', value: defaultShelfColors.finished },
  { label: 'One Shots', value: '#721613' },
  { label: 'Plum', value: defaultShelfColors.favorites }, { label: 'Charcoal', value: defaultShelfColors.did_not_finish },
  { label: 'Rose', value: defaultShelfColors.recs }, { label: 'Teal', value: defaultShelfColors.series },
] as const

export const collectionColorPattern = '^#[0-9a-fA-F]{6}$'
