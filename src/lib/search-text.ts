/** Shared case/accent folding for local searches and saved tag matching. */
export const normalizeSearchText = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase()
