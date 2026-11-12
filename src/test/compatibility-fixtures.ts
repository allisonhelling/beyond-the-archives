/** Synthetic current-contract fixtures shared by SQL and reader tests. No real user data. */
export const compatibilityFixtures = [
 { key: 'ao3-planned', workId: 981001, fandom: 'Fixture Fandom', published: 12, total: 30 },
 { key: 'original-work', workId: 981002, fandom: 'Original Work', published: 1, total: 1 },
 { key: 'legacy-unknown', workId: 981003, fandom: 'Fixture Fandom', published: null, total: null },
] as const
export function compatibilityHtml(fixture: typeof compatibilityFixtures[number]) {
 return `<!doctype html><html><head><link rel="canonical" href="https://archiveofourown.org/works/${fixture.workId}"></head><body>
 <h2 class="title">Fixture ${fixture.key}</h2><h3 class="byline"><a rel="author" href="/users/Fixture">Fixture Author</a></h3>
 <dl class="work meta"><dd class="fandom tags"><a class="tag">${fixture.fandom}</a></dd>
 <dd class="character tags"><a class="tag">Fixture Character</a></dd><dd class="freeform tags"><a class="tag">Fixture Additional Tag</a></dd>
 <dd class="series"><span class="position">Part 1 of <a href="/series/981">Fixture Series</a></span></dd>
 ${fixture.published === null ? '' : `<dd class="chapters">${fixture.published}/${fixture.total}</dd>`}</dl></body></html>`
}
