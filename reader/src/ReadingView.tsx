import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { PublicationStatusIndicator } from '../../src/features/library/PublicationStatusIndicator'
import { Dropdown } from '../../src/components/Dropdown'
import { useDismissible } from '../../src/components/useDismissible'
import { List, X, ChevronRight } from 'lucide-react'
import { capturePosition, restorePosition } from './reading-position'
import { chapterNumber, readingRanges, type Book, type Chapter, type Preferences, type ReadingPosition } from './model'

function titleText(label: string) {
  const parts = label.match(/^((?:Chapter\s+)?\d+\s*[:.–—-]\s*)(.+)$/i)
  return <>{parts && <span className="chapter-number">{parts[1]}</span>}<span className="chapter-name">{parts?.[2] ?? label}</span></>
}
function ChapterTitle({ chapters, index, onGo, heading = false }: { chapters: Chapter[]; index: number; onGo: (chapter: Chapter) => void; heading?: boolean }) {
  return <div className="chapter-navigation-title" role={heading ? 'heading' : undefined} aria-level={heading ? 2 : undefined} aria-label={heading ? chapters[index].title : undefined}><Dropdown label="Choose Chapter" textTrigger portal closeOnSelect renderValue={titleText} value={chapters[index].id} options={chapters.map(chapter => ({ value: chapter.id, label: chapter.title }))} onChange={id => { const chapter = chapters.find(chapter => chapter.id === id); if (chapter) onGo(chapter) }} /></div>
}
function ChapterNavigation({ chapters, index, onGo, position }: { chapters: Chapter[]; index: number; onGo: (chapter: Chapter) => void; position: 'top' | 'bottom' }) {
  return <nav className="chapter-navigation" data-position={position} aria-label={`${position === 'top' ? 'Top' : 'Bottom'} Chapter Navigation`}><button disabled={index === 0} onClick={() => onGo(chapters[index - 1])}>← Previous Chapter</button><ChapterTitle chapters={chapters} index={index} onGo={onGo} heading={position === 'top'} /><button disabled={index === chapters.length - 1} onClick={() => onGo(chapters[index + 1])}>Next Chapter →</button></nav>
}
export function ReadingView({ book, preferences, onPreferences, onPosition, onRead, onClose, onViewDetails }: { book: Book; preferences: Preferences; onPreferences: (p: Preferences) => void; onPosition: (position: ReadingPosition) => void; onRead: (chapter: Chapter, through: boolean) => void; onClose: () => void; onViewDetails: () => void }) {
  const [chapterId, setChapterId] = useState(book.position.chapter), [settings, setSettings] = useState(false), [contents, setContents] = useState(false), [rendered, setRendered] = useState<Record<string,string>>({})
  const displayId = useId()
  const contentsTrigger = useRef<HTMLButtonElement>(null)
  const contentsPanel = useDismissible<HTMLElement>(contents, () => setContents(false), { additionalRefs: [contentsTrigger] })
  function closeContents() { setContents(false); contentsTrigger.current?.focus() }
  useEffect(() => { if (contents) contentsPanel.current?.focus({ preventScroll: true }) }, [contents, contentsPanel])
  const viewport = useRef<HTMLDivElement>(null), touch = useRef<number | null>(null), restore = useRef(book.position), restoring = useRef(true), restoredScroll = useRef({ top: 0, left: 0 }), latest = useRef(onPosition)
  latest.current = onPosition
  const current = book.chapters.find(c => c.id === chapterId) ?? book.chapters[0], index = book.chapters.indexOf(current)
  const pages = preferences.layout === 'pages'
  const proseChapters = book.chapters.filter(chapter => chapter.kind !== 'frontmatter')
  const chapterCount = book.chapters.slice(0, index + 1).filter(chapter => chapter.kind !== 'frontmatter').length
  useEffect(() => {
    const urls = Object.fromEntries(Object.entries(book.resources).map(([key, blob]) => [key, URL.createObjectURL(blob)]))
    const html = Object.fromEntries(book.chapters.map(chapter => {
      const doc = new DOMParser().parseFromString(chapter.html, 'text/html')
      const heading = doc.body.querySelector('h1, h2, h3, h4, h5, h6')
      const normalize = (text: string) => text.replace(/\s+/g, ' ').trim().replace(/^Notes:?$/i, 'Author Notes')
      if (heading && normalize(heading.textContent ?? '') === normalize(chapter.title)) heading.remove()
      for (const label of doc.body.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
        if (/^Chapter Text:?$/i.test(label.textContent?.trim() ?? '')) label.remove()
      }
      for (const notes of doc.body.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
        if (normalize(notes.textContent ?? '') !== 'Author Notes') continue
        // AO3 notes are a heading followed by a blockquote of author prose.
        const content = notes.nextElementSibling
        if (content && content.nextElementSibling?.tagName !== 'HR') content.after(doc.createElement('hr'))
      }
      if (/^Notes:?$/i.test(chapter.title) && doc.body.lastElementChild?.tagName !== 'HR') doc.body.append(doc.createElement('hr'))
      for (const image of doc.querySelectorAll('[data-resource]')) image.setAttribute('src', urls[image.getAttribute('data-resource')!] ?? '')
      return [chapter.id, doc.body.innerHTML]
    }))
    setRendered(html)
    return () => Object.values(urls).forEach(URL.revokeObjectURL)
  }, [book.id, book.resources, book.chapters])
  function go(chapter: Chapter, fraction = 0) {
    restore.current = { chapter: chapter.id, fraction }; setChapterId(chapter.id); latest.current(restore.current)
    const el = viewport.current
    if (el && chapter.id === chapterId) restorePosition(el, preferences, restore.current)
  }
  useLayoutEffect(() => {
    const el = viewport.current
    if (!el || !Object.keys(rendered).length) return
    let frame = 0, cancelled = false
    const apply = () => {
      if (cancelled) return
      restoring.current = true
      cancelAnimationFrame(frame)
      restorePosition(el, preferences, restore.current)
      restoredScroll.current = { top: el.scrollTop, left: el.scrollLeft }
      frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => { restoring.current = false }) })
    }
    apply()
    const images = [...el.querySelectorAll('img')]; images.forEach(image => image.addEventListener('load', apply))
    const resize = new ResizeObserver(apply); resize.observe(el)
    void document.fonts.ready.then(apply)
    return () => { cancelled = true; cancelAnimationFrame(frame); resize.disconnect(); images.forEach(image => image.removeEventListener('load', apply)) }
  }, [chapterId, rendered, preferences.content, preferences.layout, preferences.size, preferences.width])
  function remember(force = false) {
    const el = viewport.current
    if (!el || !Object.keys(rendered).length) return
    if (!force && restoring.current && el.scrollTop === restoredScroll.current.top && el.scrollLeft === restoredScroll.current.left) return
    restoring.current = false
    restore.current = capturePosition(el, preferences, restore.current)
    if (restore.current.chapter !== chapterId) setChapterId(restore.current.chapter)
    latest.current(restore.current)
  }
  const capture = useRef(remember)
  capture.current = remember
  useEffect(() => {
    const hide = () => capture.current(), visibility = () => { if (document.visibilityState === 'hidden') hide() }
    window.addEventListener('pagehide', hide); document.addEventListener('visibilitychange', visibility)
    return () => { window.removeEventListener('pagehide', hide); document.removeEventListener('visibilitychange', visibility) }
  }, [])

  function turn(direction: number) {
    const el = viewport.current
    if (!el) return
    const last = Math.max(0, el.scrollWidth - el.clientWidth)
    if (direction > 0 && el.scrollLeft >= last - 2 && preferences.content === 'chapter' && index < book.chapters.length - 1) go(book.chapters[index + 1])
    else if (direction < 0 && el.scrollLeft <= 2 && preferences.content === 'chapter' && index > 0) go(book.chapters[index - 1], 1)
    else { el.scrollLeft = Math.max(0, Math.min(last, el.scrollLeft + direction * el.clientWidth)); remember(true) }
  }
  const keyboardTurn = useRef(turn)
  keyboardTurn.current = turn
  const keyboardChapter = useRef<(direction: number) => void>(() => {})
  keyboardChapter.current = direction => {
    const candidates = direction > 0 ? book.chapters.slice(index + 1) : book.chapters.slice(0, index).reverse()
    const next = candidates.find(chapter => chapter.kind !== 'frontmatter')
    if (next) go(next)
  }
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing || document.querySelector('dialog[open]')) return
      const target = event.target
      if (target instanceof Element && target.closest('.contents-panel, input, select, textarea, [contenteditable]:not([contenteditable="false"]), [role="slider"], [role="combobox"], [role="listbox"], [role="menu"], [aria-haspopup="listbox"][aria-expanded="true"]')) return
      const chapterDirection = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
      const pageDirection = pages ? ['PageDown', 'ArrowDown'].includes(event.key) ? 1 : ['PageUp', 'ArrowUp'].includes(event.key) ? -1 : 0 : 0
      if (!chapterDirection && !pageDirection) return
      event.preventDefault()
      if (chapterDirection) keyboardChapter.current(chapterDirection)
      else keyboardTurn.current(pageDirection)
    }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [pages])
  useEffect(() => {
    const element = viewport.current
    if (!pages || !element) return
    // Wheel events include touchpad momentum. Turn only once until the gesture rests.
    const gesture = { delta: 0, last: 0, turned: false }
    function wheel(event: WheelEvent) {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open]')) return
      if (event.target instanceof Element && event.target.closest('input, select, textarea, [contenteditable]:not([contenteditable="false"]), .custom-dropdown, [role="listbox"], [role="menu"]')) return
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      if (!delta) return
      event.preventDefault()
      const now = performance.now()
      if (now - gesture.last > 180) { gesture.delta = 0; gesture.turned = false }
      gesture.last = now
      if (gesture.turned) return
      gesture.delta += delta * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element!.clientWidth : 1)
      if (Math.abs(gesture.delta) >= 48) { gesture.turned = true; keyboardTurn.current(Math.sign(gesture.delta)) }
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [pages])
  const chapters = preferences.content === 'entire' ? book.chapters : [current]
  return <div className="reading-screen">
    <header className="reader-toolbar"><button onClick={() => { remember(true); onClose() }}>← Bookshelf</button><button ref={contentsTrigger} className="contents-trigger" onClick={() => setContents(!contents)} aria-expanded={contents} aria-controls={contents ? `${displayId}-contents` : undefined}><List size={18} aria-hidden="true" />Contents</button><div className="reading-title"><strong><button className="title-button reading-work-name" onClick={onViewDetails} title="View Details">{book.metadata.title}</button><PublicationStatusIndicator portal placement="bottom" status={book.metadata.publication_status} /></strong><small>{book.metadata.authors.join(', ')}</small></div><span className="reader-chapter-count" aria-label="Chapter Progress">{chapterCount} / {proseChapters.length} chapters</span><button disabled={current.kind === 'frontmatter' || book.completed.includes(current.id)} onClick={() => onRead(current, false)}>{current.kind === 'frontmatter' ? 'Front Matter' : book.completed.includes(current.id) ? '✓ Chapter Read' : 'Mark Chapter Read'}</button><button disabled={current.kind === 'frontmatter'} onClick={() => onRead(current, true)}>Mark Through Ch {chapterNumber(current, book.chapters) ?? '—'}</button><button onClick={() => setSettings(!settings)} aria-expanded={settings}>Aa · Display</button></header>


    {settings && <div className="display-panel"><label>Content Shown<select value={preferences.content} onChange={e => onPreferences({ ...preferences, content: e.target.value as Preferences['content'] })}><option value="chapter">One Chapter</option><option value="entire">Entire Work</option></select></label><label>Reading Layout<select value={preferences.layout} onChange={e => onPreferences({ ...preferences, layout: e.target.value as Preferences['layout'] })}><option value="scroll">Continuous Scroll</option><option value="pages">Paginated</option></select></label>{(['size', 'width'] as const).map(key => { const range = readingRanges[key], id = `${displayId}-${key}`; return <label className="reading-range" key={key} htmlFor={id}><span>{range.label}<output htmlFor={id} aria-label={`${range.label} Value`}>{preferences[key]} px</output></span><input id={id} aria-label={range.label} aria-valuetext={`${preferences[key]} pixels`} type="range" min={range.min} max={range.max} step={range.step} value={preferences[key]} onChange={e => onPreferences({ ...preferences, [key]: Number(e.target.value) })} /></label> })}<label><input type="checkbox" checked={preferences.dark} onChange={e => onPreferences({ ...preferences, dark: e.target.checked })} /> Dark Mode</label></div>}
    <div className="reading-body"><div ref={viewport} className={`reading-viewport ${pages ? 'paginated' : ''}`} style={{ '--reading-size': `${preferences.size}px`, '--reading-width': `${preferences.width}px` } as CSSProperties} tabIndex={0} aria-label="Book Content" onScroll={() => remember()} onTouchStart={e => { touch.current = e.touches[0].clientX }} onTouchEnd={e => { if (pages && touch.current !== null) { const dx = e.changedTouches[0].clientX - touch.current; if (Math.abs(dx) > 50) turn(dx < 0 ? 1 : -1) } touch.current = null }} onClick={e => { const target = e.target as HTMLElement, link = target.closest('a'); if (link?.hasAttribute('data-link')) { e.preventDefault(); const [path, fragment] = link.getAttribute('data-link')!.split('#'); const chapter = book.chapters.find(c => c.path === path); if (chapter) { go(chapter); if (fragment) requestAnimationFrame(() => viewport.current?.querySelector(`[id="${CSS.escape(fragment)}"]`)?.scrollIntoView()) } return } if (pages && !target.closest('a, button, .custom-dropdown') && !window.getSelection()?.toString()) { const rect = e.currentTarget.getBoundingClientRect(), x = e.clientX - rect.left; if (x < rect.width * .25 || x > rect.width * .75) turn(x > rect.width / 2 ? 1 : -1) } }}>
      <div className="prose">{chapters.map((chapter, i) => { const sectionIndex = preferences.content === 'entire' ? i : index; return <section key={`${chapter.id}-${i}`} data-chapter={chapter.id} aria-label={chapter.title}>{!pages && <ChapterNavigation chapters={book.chapters} index={sectionIndex} onGo={go} position="top" />}{pages && <ChapterTitle chapters={book.chapters} index={sectionIndex} onGo={go} heading />}<div data-chapter-content dangerouslySetInnerHTML={{ __html: rendered[chapter.id] ?? '' }} />{!pages && <ChapterNavigation chapters={book.chapters} index={sectionIndex} onGo={go} position="bottom" />}</section> })}</div>
    </div>{contents && <aside ref={contentsPanel} className="contents-panel" id={`${displayId}-contents`} aria-labelledby={`${displayId}-contents-heading`} tabIndex={-1} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeContents() } }}><div className="contents-heading"><h2 id={`${displayId}-contents-heading`}>Contents</h2><button type="button" aria-label="Close Contents" onClick={closeContents}><X size={20} aria-hidden="true" /></button></div><nav aria-label="Contents"><ol className="toc-list">{book.chapters.map(chapter => <li key={chapter.id} data-section-kind={chapter.kind ?? 'chapter'}><button className="menu-item" aria-current={chapter.id === current.id ? 'location' : undefined} onClick={() => { go(chapter); closeContents() }}><span>{chapter.title}</span><ChevronRight size={18} aria-hidden="true" /></button></li>)}</ol></nav></aside>}</div><footer className="reading-footer"><span>Position saves automatically · Chapter completion is explicit</span><span>{pages ? '←/→ chapters · ↑/↓ or Page Up/Down, two-finger swipe, or tap edges for pages' : 'Continuous Scroll · ←/→ chapters'}</span></footer>
  </div>
}
