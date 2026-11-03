import { beforeAll, describe, expect, it } from 'vitest'
import { webcrypto } from 'node:crypto'
import { epubBuffer, epubFiles } from '../../src/test/epub-fixture'
import { importEpub } from '../src/epub'
import { emptyFilters, facetOptions, facets, filterErrors, matchesBook, type FacetKey, type Filters } from '../src/filters'
import { frontMatterMetadata, metadataDate, metadataVersion, packageMetadata, publisherName, seriesNames } from '../src/metadata'
import { blankMetadata, type Book } from '../src/model'
beforeAll(() => { Object.defineProperty(globalThis, 'crypto', { value: webcrypto }) })
const parse = (text: string) => new DOMParser().parseFromString(text, 'application/xml')
const titlePage = `<html><body class="fff_titlepage"><h3><a href="https://archiveofourown.org/works/23818510">Trust Me, I'm an Alchemist</a> by metisket</h3><div>
<b>Category:</b> Gen, M/M<br/><b>Author:</b> <a href="https://archiveofourown.org/users/metisket">metisket</a><br/>
<b>Fandoms:</b> <a>Yuri!!! on Ice (Anime)</a>, <a>Fullmetal Alchemist: Brotherhood &amp; Manga</a><br/>
<b>Characters:</b> <a>Edward Elric</a>, <a>Yuri Plisetsky</a><br/>
<b>Relationships:</b> <a>Katsuki Yuuri/Victor Nikiforov</a>, <a>Alphonse Elric &amp; Edward Elric</a><br/>
<b>Freeform Tags:</b> <a>Crossover</a>, <a>Families of Choice</a>, <a>One tag, with a comma</a><br/>
<b>Warnings:</b> No Archive Warnings Apply<br/><b>Rating:</b> Teen And Up Audiences<br/>
<b>Collections:</b> <a>Quality Gen Fics</a>, <a>Works Worth Rereading</a><br/>
<b>Series:</b> <a>Another Life</a><br/><b>Language:</b> English<br/>
<b>Published:</b> 2020-04-24T00:00:00<br/><b>Updated:</b> 2020-05-18T00:00:00<br/>
<b>Packaged:</b> 2026-09-27T17:13:33.454387<br/><b>Chapters:</b> 5/5<br/><b>Chapters:</b> 5<br/>
<b>Words:</b> 54,791<br/><b>Kudos:</b> 11,496<br/><b>Hits:</b> 152,972<br/><b>Bookmarks:</b> 5,085<br/><b>Comments:</b> 1,645<br/>
<b>Publisher:</b> archiveofourown.org<br/><b>Status:</b> Completed<br/>
<b>Python_Version:</b> 3.14.5<br/><b>Story ID:</b> 999999<br/>
</div></body></html>`
async function fixtureBook() {
  const files = epubFiles({ source: 'https://archiveofourown.org/works/23818510' })
  files[3].content = titlePage
  const buffer = await epubBuffer(files)
  return importEpub({ size: buffer.byteLength, arrayBuffer: async () => buffer } as File)
}
describe('FanFicFare metadata', () => {
  it('reads labeled title-page fields and preserves linked tag boundaries', () => {
    const result = frontMatterMetadata(parse(titlePage))
    expect(result.metadata).toMatchObject({ categories: ['Gen','M/M'], authors: ['metisket'], fandoms: ['Yuri!!! on Ice (Anime)', 'Fullmetal Alchemist: Brotherhood & Manga'], character_tags: ['Edward Elric', 'Yuri Plisetsky'], additional_tags: ['Crossover','Families of Choice','One tag, with a comma'], published_chapters: 5, total_chapters: 5, publication_status: 'complete', word_count: 54791, kudos: 11496, hits: 152972, bookmark_count: 5085, comment_count: 1645, published_at: '2020-04-24', updated_at: '2020-05-18', packaged_at: '2026-09-27', language: 'English', publisher: 'archiveofourown.org', ao3_collections: ['Quality Gen Fics', 'Works Worth Rereading'] })
    expect(result.urls).toEqual(['https://archiveofourown.org/works/23818510'])
    expect(result.metadata).not.toHaveProperty('Python_Version')
  })
  it('supports table title pages without consuming unrelated body text', () => {
    const result = frontMatterMetadata(parse('<html><body class="fff_titlepage"><table><tr><td><b>Words:</b></td><td>54,791</td></tr><tr><td><b>Characters:</b></td><td><a>Edward, Jr.</a>, <a>Yuri</a></td></tr></table></body></html>'))
    expect(result.metadata).toMatchObject({ word_count: 54791, character_tags: ['Edward, Jr.', 'Yuri'] })
    expect(frontMatterMetadata(parse('<html><body><b>Kudos:</b> 999999<br/></body></html>')).metadata).toEqual({})
  })
  it('reads package dates and Calibre custom fields without mistaking packaging modification for story updates', () => {
    const opf = parse(`<package><metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf"><dc:date opf:event="publication">2020-04-24</dc:date><dc:date opf:event="modification">2020-05-18</dc:date><dc:language>en</dc:language><meta property="dcterms:modified">2026-10-01T00:00:00Z</meta><meta name="calibre:user_metadata:#characters" content='{"#value#":["Edward Elric","Yuri Plisetsky"]}'/><meta name="calibre:series" content="One Series, Two Worlds"/></metadata></package>`)
    expect(packageMetadata(opf)).toMatchObject({ published_at: '2020-04-24', updated_at: '2020-05-18', language_code: 'en', character_tags: ['Edward Elric','Yuri Plisetsky'], series: ['One Series, Two Worlds'] })
  })
  it('imports rich metadata while keeping AO3 collections separate and existing subject tags', async () => {
    const book = await fixtureBook()
    expect(book.workId).toBe('23818510')
    expect(book.metadata.word_count).toBe(54791)
    expect(book.metadata.ao3_tags).toContain('Found Tag')
    expect(book.metadata.ao3_collections).toContain('Quality Gen Fics')
    expect(book.collections).toEqual([])
    expect(book.chapters[0].kind).toBe('frontmatter')
    expect(facets.some(f => String(f.key) === 'ao3Collection')).toBe(false)
  })
  it('rejects invalid dates and negative or malformed statistics', () => {
    expect(metadataDate('2020-02-30')).toBeUndefined()
    const result = frontMatterMetadata(parse('<html><body class="fff_titlepage"><b>Words:</b> -3<br/><b>Kudos:</b> lots<br/><b>Updated:</b> 2020-02-30<br/></body></html>'))
    expect(result.metadata).not.toHaveProperty('word_count')
    expect(result.metadata).not.toHaveProperty('kudos')
    expect(result.metadata).not.toHaveProperty('updated_at')
  })
})
describe('Offline metadata filters', () => {
  let book: Book
  beforeAll(async () => { book = await fixtureBook() })
  function selection(filters: Omit<Partial<Filters>, 'selections' | 'excluded'> & { selections?: Partial<Record<FacetKey, string | string[]>>; excluded?: Partial<Record<FacetKey, string | string[]>> } = {}): Filters {
    const arrays = (values: Partial<Record<FacetKey, string | string[]>> = {}) => Object.fromEntries(Object.entries(values).map(([key,value]) => [key, Array.isArray(value) ? value : [value]]))
    return { ...emptyFilters(), ...filters, selections: arrays(filters.selections), excluded: arrays(filters.excluded) }
  }
  it('combines metadata facets, negative tags, and ranges', () => {
    const filters = selection({ selections: { author: 'metisket', category: 'M/M', character: 'Edward Elric', publication: 'Completed', language: 'English' }, excluded: { freeform: 'Unwanted' }, ranges: { words: { min: '50000', max: '60000' }, chapters: { min: '5', max: '5' }, updated: { min: '2020-05-18', max: '2020-05-18' } } })
    expect(matchesBook(book, filters, 'Families of Choice')).toBe(true)
    expect(matchesBook(book, { ...filters, excluded: { freeform: ['Crossover'] } }, '')).toBe(false)
    expect(matchesBook(book, { ...filters, selections: { character: ['Alphonse'] } }, '')).toBe(false)
  })
  it.each(['words','chapters','kudos','bookmarks','comments','hits'] as const)('filters both ends of the %s range', key => {
    const values = { words: 54791, chapters: 5, kudos: 11496, bookmarks: 5085, comments: 1645, hits: 152972 }
    expect(matchesBook(book, selection({ ranges: { [key]: { min: String(values[key]), max: String(values[key]) } } }), '')).toBe(true)
    expect(matchesBook(book, selection({ ranges: { [key]: { min: '', max: String(values[key] - 1) } } }), '')).toBe(false)
  })
  it('excludes missing statistics from bounded ranges while accepting zero', () => {
    expect(matchesBook({ ...book, metadata: { ...book.metadata, kudos: undefined } }, selection({ ranges: { kudos: { min: '0', max: '' } } }), '')).toBe(false)
    expect(matchesBook({ ...book, metadata: { ...book.metadata, kudos: 0 } }, selection({ ranges: { kudos: { min: '0', max: '0' } } }), '')).toBe(true)
    expect(filterErrors(selection({ ranges: { words: { min: '200', max: '100' } } }))).toHaveLength(1)
  })
  it('searches series, collections, warnings and IDs without searching personal notes or chapter prose', () => {
    expect(matchesBook(book, emptyFilters(), '23818510')).toBe(true)
    expect(matchesBook(book, emptyFilters(), 'Quality Gen Fics')).toBe(true)
    expect(matchesBook(book, emptyFilters(), 'Another Life')).toBe(true)
    expect(matchesBook({ ...book, notes: 'UNIQUE_PRIVATE_NOTE' }, emptyFilters(), 'UNIQUE_PRIVATE_NOTE')).toBe(false)
    expect(matchesBook(book, emptyFilters(), 'PRIVATE CHAPTER PROSE')).toBe(false)
  })
  it('keeps organizer collection filtering independent of AO3 collection membership', () => {
    expect(matchesBook(book, selection({ selections: { collection: 'Quality Gen Fics' } }), '')).toBe(false)
    expect(matchesBook({ ...book, collections: ['Favorites'] }, selection({ selections: { collection: 'Favorites' } }), '')).toBe(true)
  })
  it('builds deduplicated catalog counts and normalizes language codes', () => {
    const authorFacet = facets.find(f => f.key === 'author')!
    expect(facetOptions([book, { ...book, metadata: { ...book.metadata, authors: ['Metisket'] } }], authorFacet)).toEqual([{ value: 'metisket', count: 2 }])
    expect(matchesBook({ ...book, metadata: { ...book.metadata, language: 'en' } }, selection({ selections: { language: 'English' } }), '')).toBe(true)
  })
})
it('combines multi-selections with every other field, exclusions, search and ranges', () => {
  const b = { file: new Blob(['book']), metadata: { title: 'Story', summary: '', authors: ['Author'], fandoms: ['A','B'], rating: 'Teen', publication_status: 'complete', categories: ['Gen'], language: 'en', relationship_tags: ['A/B','C/D'], character_tags: ['A','B'], additional_tags: ['Crossover','Tag, With Comma'], ao3_tags: ['Tag, With Comma'], word_count: 1000, published_chapters: 5, kudos: 5, bookmark_count: 10, comment_count: 2, hits: 50, updated_at: '2020-01-01', publisher: 'archiveofourown.org' }, active: true, collections: ['Favorites'], importedAt: '2026-10-01T00:00:00Z' } as Book
  const filters = emptyFilters()
  filters.selections = { fandom: ['A','Unrelated'], character: ['A','B'], relationship: ['A/B','C/D'], freeform: ['Crossover','Tag, With Comma'], language: ['English','French'], category: ['Gen'], collection: ['Favorites'], publication: ['Completed'], rating: ['Teen'], author: ['Author'], publisher: ['AO3'], version: ['Active Version'] }
  filters.ranges = { words: { min: '1000', max: '1000' }, chapters: { min: '5', max: '5' }, kudos: { min: '5', max: '5' }, bookmarks: { min: '10', max: '10' }, comments: { min: '2', max: '2' }, hits: { min: '50', max: '50' }, updated: { min: '2020-01-01', max: '2020-01-01' } }
  expect(matchesBook(b, filters, 'Story')).toBe(true)
  filters.modes.fandom = 'all'
  expect(matchesBook(b, filters, '')).toBe(false)
  filters.modes.fandom = 'any'
  filters.selections.character = ['A','Missing']
  expect(matchesBook(b, filters, '')).toBe(false)
  filters.modes.character = 'any'
  expect(matchesBook(b, filters, '')).toBe(true)
  filters.excluded.freeform = ['Unrelated','Tag, With Comma']
  expect(matchesBook(b, filters, '')).toBe(false)
  expect(facets.some(f => String(f.key) === 'identity' || String(f.key) === 'tag')).toBe(false)
})

it('omits publication-status chips without altering stored tags or similar freeform tags', async () => {
  const { workTags, publicationStatusFromText } = await import('../src/metadata')
  const book = await fixtureBook()
  book.metadata.ao3_tags = ['Complete', 'Completed', 'Status: In Progress', 'Publication Status: Abandoned', 'Deleted', 'AO3 Status Unknown', 'Completed Works', 'Found Family']
  expect(workTags(book.metadata)).toEqual(['Completed Works', 'Found Family'])
  expect(book.metadata.ao3_tags).toHaveLength(8)
  expect(publicationStatusFromText('Status: In Progress')).toBe('in_progress')
})

it('describes all active filter types and removes only the selected value or bound', async () => {
  const { appliedFilterTags } = await import('../src/filters')
  const filters = emptyFilters()
  filters.selections = { character: ['Edward', 'Alphonse'], publisher: ['__reader_unknown__'] }
  filters.excluded = { freeform: ['Unwanted'] }
  filters.ranges = { words: {min:'0',max:'1000'}, updated:{min:'2020-01-01',max:''} }
  const chips = appliedFilterTags(filters, 'Some story')
  expect(chips.map(chip => chip.label)).toEqual(expect.arrayContaining(['Search: Some story', 'Characters (All): Edward', 'Characters (All): Alphonse', 'Publisher: Unknown / Not Saved', 'Exclude Freeform Tags: Unwanted', 'Words From: 0', 'Words Through: 1000', 'Updated From: 2020-01-01']))
  expect(chips.find(chip => chip.label === 'Characters (All): Edward')!.clear().filters.selections.character).toEqual(['Alphonse'])
  const range = chips.find(chip => chip.label === 'Words Through: 1000')!.clear()
  expect(range.filters.ranges.words).toEqual({min:'0',max:''})
  expect(range.query).toBe('Some story')
  expect(filters.ranges.words?.max).toBe('1000')
})

describe('Summary formatting', () => {
  it('retains multiline FanFicFare summaries through import without swallowing later metadata', async () => {
    const files = epubFiles()
    files[3].content = '<html><body class="fff_titlepage"><b>Summary:</b>First <em>line</em>.<br/>Second line.<br/><br/>Last paragraph.<script>unsafe()</script><br/><b>Status:</b>Completed<br/></body></html>'
    const buffer = await epubBuffer(files)
    const book = await importEpub({ size: buffer.byteLength, arrayBuffer: async () => buffer } as File)
    expect(book.metadata.summary).toBe('First line.\nSecond line.\n\nLast paragraph.')
    expect(book.metadata.summary_html).toContain('<em>line</em>')
    expect(book.metadata.summary_html).not.toMatch(/script|unsafe|Status/)
    expect(book.metadata.publication_status).toBe('complete')
  })
  it('retains table summary paragraphs and safe emphasis', () => {
    const { metadata } = frontMatterMetadata(parse('<html><body class="fff_titlepage"><table><tr><td><b>Summary:</b></td><td><p>First <strong>paragraph</strong>.</p><p>Second.<br/>Third.</p></td></tr></table></body></html>'))
    expect(metadata.summary).toBe('First paragraph.\n\nSecond.\nThird.')
    expect(metadata.summary_html).toContain('<strong>paragraph</strong>')
  })
})

it.each(['ao3','fanficfare'] as const)('uses the first story summary in %s anthologies, following spine order',async format=>{
  const files=epubFiles()
  files[2].content=files[2].content.replace('</metadata>','<dc:description>Anthology overview.</dc:description></metadata>').replace('<manifest>','<manifest><item id="second" href="second.xhtml" media-type="application/xhtml+xml"/>').replace('</spine>','<itemref idref="second"/></spine>')
  const frontMatter=(id:number,summary:string)=>format==='ao3'
    ? `<html><body><div id="preface"><p class="message"><a href="https://archiveofourown.org/works/${id}">Story</a></p><h2 class="title">Story ${id}</h2><dl class="tags"><dt>Fandom:</dt><dd>Fandom</dd></dl><h2>Summary</h2><blockquote>${summary}</blockquote><p>Notes</p><blockquote>Author notes.</blockquote></div></body></html>`
    : `<html><body class="fff_titlepage"><h3><a href="https://archiveofourown.org/works/${id}">Story ${id}</a></h3><b>Summary:</b>${summary}<br/><b>Status:</b>Completed</body></html>`
  files[3].content=frontMatter(8001,'<p>First <em>story</em>.</p><p>Another paragraph.<script>unsafe()</script></p>')
  files.push({name:'OEBPS/second.xhtml',content:frontMatter(8002,'Second story summary.')})
  const buffer=await epubBuffer(files)
  const book=await importEpub({size:buffer.byteLength,arrayBuffer:async()=>buffer} as File)
  expect(book.workId).toBeNull()
  expect(book.chapters.map(chapter => chapter.workTitle)).toEqual(['Story 8001', 'Story 8001', 'Story 8002'])
  expect(book.chapters.filter(chapter => chapter.workStart).map(chapter => chapter.workTitle)).toEqual(['Story 8001', 'Story 8002'])
  expect(book.metadata.summary).toBe('First story.\n\nAnother paragraph.')
  expect(book.metadata.summary_html).toContain('<em>story</em>')
  expect(book.metadata.summary_html).not.toMatch(/Second story|Anthology overview|Chapter summary|Author notes|script|unsafe/)
  expect(book.metadataVersion).toBe(metadataVersion)
  // If the first story has no summary, use the package fallback, never the second story.
  files[3].content=frontMatter(8001,'')
  const missing=await epubBuffer(files)
  const fallback=await importEpub({size:missing.byteLength,arrayBuffer:async()=>missing} as File)
  expect(fallback.metadata.summary).toBe('Anthology overview.')
})

it.each(['archiveofourown.org',' www.archiveofourown.org ','https://archiveofourown.org/'])('displays %s as AO3 without rewriting saved metadata', value => {
 expect(publisherName(value)).toBe('AO3')
 expect(publisherName('Other Publisher')).toBe('Other Publisher')
 expect(publisherName('archiveofourown.org.example.com')).toBe('archiveofourown.org.example.com')
 expect(publisherName(undefined)).toBeUndefined()
})

it('shares saved series names between tiles and exact-name local filters',()=>{
 const metadata={...blankMetadata,series:['First Series',' First Series '],series_memberships:[{id:9,name:'Second Series',url:'https://archiveofourown.org/series/9',position:2}]}
 expect(seriesNames(metadata)).toEqual(['First Series','Second Series'])
 expect(facets.find(facet=>facet.key==='series')!.values({metadata} as Book)).toEqual(['First Series','Second Series'])
})

it('preserves saved AO3 series positions from EPUB front matter',()=>{
 const result=frontMatterMetadata(parse('<html><body><div id="preface"><dl><dt>Series:</dt><dd>Part 2 of <a href="https://archiveofourown.org/series/99">First Series</a></dd><dt>Series:</dt><dd>Part 4 of <a href="/series/100">Second Series</a></dd></dl></div></body></html>'))
 expect(result.metadata.series_memberships).toEqual([
  {id:99,name:'First Series',url:'https://archiveofourown.org/series/99',position:2},
  {id:100,name:'Second Series',url:'https://archiveofourown.org/series/100',position:4},
 ])
})

const plainTitlePage = `<html><head><title>Title page</title></head><body>
<h3><a href="https://archiveofourown.org/works/50225803">Coil</a> by Allegory_for_Hatred</h3>
<p>Fandoms: 文豪ストレイドッグス | Bungou Stray Dogs, Harry Potter - J. K. Rowling</p>
<p>Status: Completed</p><p>Published: 2023-09-21</p><p>Updated: 2024-06-05</p>
<p>Chapters: 33/33</p><p>Words: 312047</p><p>Additional tags: Crossover, Found Family</p>
<p>Categories: Gen</p><p>Rating: Not Rated</p>
<p>Series: <a href="https://archiveofourown.org/series/3733633">Magic and Mystery</a> 2</p>
<div>Summary: <p>A first summary paragraph.</p><p>A second summary paragraph.</p></div>
</body></html>`
it('extracts plain paragraph title pages such as Coil without inventing absent statistics', () => {
 const result=frontMatterMetadata(parse(plainTitlePage),'OEBPS/titlepage.html')
 expect(result.urls).toEqual(['https://archiveofourown.org/works/50225803'])
 expect(result.metadata).toMatchObject({fandoms:['文豪ストレイドッグス | Bungou Stray Dogs','Harry Potter - J. K. Rowling'],rating:'Not Rated',publication_status:'complete',published_chapters:33,total_chapters:33,word_count:312047,published_at:'2023-09-21',updated_at:'2024-06-05',publisher:'AO3',categories:['Gen'],additional_tags:['Crossover','Found Family'],series:['Magic and Mystery'],series_memberships:[{id:3733633,position:2}]})
 expect(result.metadata.summary_html).toContain('<p>A first summary paragraph.</p>')
 for(const field of ['kudos','bookmark_count','comment_count','hits'] as const) expect(result.metadata[field]).toBeUndefined()
 expect(frontMatterMetadata(parse('<html><body><p>Words: 999999</p><p>Status: Completed</p></body></html>'),'OEBPS/chapter1.html').metadata).toEqual({})
})
it('imports Coil-style source identity and metadata through the complete EPUB path', async () => {
 const files=epubFiles({source:'urn:uuid:standalone-package',preface:false})
 const opf=files.find(file=>file.name.endsWith('.opf'))!
 opf.content=opf.content.replaceAll('preface.xhtml','titlepage.html').replace('Recovered &amp; Remembered','Coil').replace('Recovered Author','Allegory_for_Hatred')
 const title=files.find(file=>file.name.endsWith('preface.xhtml'))!
 title.name='OEBPS/titlepage.html';title.content=plainTitlePage
 const buffer=await epubBuffer(files)
 const book=await importEpub({size:buffer.byteLength,arrayBuffer:async()=>buffer} as File)
 expect(book.workId).toBe('50225803')
 expect(book.metadata).toMatchObject({title:'Coil',authors:['Allegory_for_Hatred'],word_count:312047,publication_status:'complete',fandoms:['文豪ストレイドッグス | Bungou Stray Dogs','Harry Potter - J. K. Rowling']})
 expect(book.chapters[0].kind).toBe('frontmatter')
 expect(book.metadataVersion).toBe(metadataVersion)
})
