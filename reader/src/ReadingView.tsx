import { anthologyLabel, progressMetadata, workChapters } from './anthology'
import { linkEpubUrls } from './epub-links'
import { ChapterProgress } from '../../src/features/library/ChapterProgress'
import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { PublicationStatusIndicator } from '../../src/features/library/PublicationStatusIndicator'
import { Dropdown } from '../../src/components/Dropdown'
import { useLayout } from '../../src/lib/use-layout'
import { useDismissible } from '../../src/components/useDismissible'
import { List, X, ChevronRight, ChevronLeft, Type } from 'lucide-react'
import { ReaderDisplay } from './ReaderDisplay'
import { readingFonts, readerColors } from './reading-display'
import { capturePosition, restorePosition } from './reading-position'
import { isAnthology, readerProgress, readerChapterNumber, chapterPosition, readerChapterLabel, type Book, type Chapter, type Preferences, type ReadingPosition } from './model'

function titleText(label: string) {
  const parts = label.match(/^((?:Chapter\s+)?\d+\s*[:.–—-]\s*)(.+)$/i)
  return <>{parts && <span className="chapter-number">{parts[1]}</span>}<span className="chapter-name">{parts?.[2] ?? label}</span></>
}
function ChapterTitle({ chapters, index, onGo, heading = false }: { chapters: Chapter[]; index: number; onGo: (chapter: Chapter) => void; heading?: boolean }) {
  const anthology = new Set(chapters.map(chapter => chapter.workKey).filter(Boolean)).size > 1
  return <div className="chapter-navigation-title" role={heading ? 'heading' : undefined} aria-level={heading ? 2 : undefined} aria-label={heading ? readerChapterLabel(chapters[index], chapters) : undefined}><Dropdown label="Choose Chapter" textTrigger portal closeOnSelect renderValue={() => titleText(readerChapterLabel(chapters[index], chapters))} value={chapters[index].id} options={chapters.map(chapter => ({ value: chapter.id, label: `${anthology && chapter.workTitle ? `${chapter.workTitle} · ` : ''}${readerChapterLabel(chapter, chapters)}` }))} onChange={id => { const chapter = chapters.find(chapter => chapter.id === id); if (chapter) onGo(chapter) }} /></div>
}
function ChapterNavigation({ chapters, index, onGo, position, onRead, completed }: { chapters: Chapter[]; index: number; onGo: (chapter: Chapter) => void; position: 'top' | 'bottom'; onRead: (chapter: Chapter, through: boolean) => void; completed: string[] }) {
  return <nav className="chapter-navigation" data-position={position} aria-label={`${position === 'top' ? 'Top' : 'Bottom'} Chapter Navigation`}><button disabled={index === 0} onClick={() => onGo(chapters[index - 1])} aria-label="Previous Chapter"><ChevronLeft size={16} aria-hidden="true" /><span>Previous</span></button>{position === 'top' && <ChapterTitle chapters={chapters} index={index} onGo={onGo} heading />}<button disabled={index === chapters.length - 1} onClick={() => onGo(chapters[index + 1])} aria-label="Next Chapter"><span>Next</span><ChevronRight size={16} aria-hidden="true" /></button><button type="button" className="chapter-nav-mark" disabled={chapters[index].kind === 'frontmatter' || chapters.slice(0, index + 1).filter(chapter => chapter.kind !== 'frontmatter').every(chapter => completed.includes(chapter.id))} title={`Mark As Read Through Chapter ${readerChapterNumber(chapters[index], chapters) ?? '—'}`} onClick={() => onRead(chapters[index], true)}>Mark Chapter Read</button></nav>
}
export function ReadingView({ book, preferences, onPreferences, onPosition, onRead, onClose, onViewDetails, onProgress }: { onProgress: (progress: number) => Promise<void>; book: Book; preferences: Preferences; onPreferences: (p: Preferences) => void; onPosition: (position: ReadingPosition) => void; onRead: (chapter: Chapter, through: boolean) => void; onClose: () => void; onViewDetails: () => void }) {
  const [chapterId, setChapterId] = useState(book.position.chapter), [settings, setSettings] = useState(false), [contents, setContents] = useState(false), [rendered, setRendered] = useState<Record<string,string>>({})
  const displayId = useId(), mobile = useLayout(650) === 'mobile'
  const [chrome, setChrome] = useState(true), [chapterProgress, setChapterProgress] = useState({ fraction: 0, pagesLeft: 0 })
  const colors = readerColors(preferences)
  const contentsTrigger = useRef<HTMLButtonElement>(null)
  const contentsPanel = useDismissible<HTMLElement>(contents, () => setContents(false), { additionalRefs: [contentsTrigger] })
  function closeContents() { setContents(false); contentsTrigger.current?.focus() }
  useEffect(() => { if (contents) contentsPanel.current?.focus({ preventScroll: true }) }, [contents, contentsPanel])
  const viewport = useRef<HTMLDivElement>(null), touch = useRef<number | null>(null), restore = useRef(book.position), restoring = useRef(true), restoredScroll = useRef({ top: 0, left: 0 }), latest = useRef(onPosition)
  latest.current = onPosition
  const current = book.chapters.find(c => c.id === chapterId) ?? book.chapters[0], index = book.chapters.indexOf(current)
  const pages = preferences.layout === 'pages'
  const anthology = isAnthology(book)
  const currentWork = book.works?.find(work => work.key === current.workKey)
  const currentChapters = currentWork ? workChapters(book, currentWork) : book.chapters
  const proseChapters = book.chapters.filter(chapter => chapter.kind !== 'frontmatter')
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
      linkEpubUrls(doc.body)
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
  }, [chapterId, rendered, preferences.content, preferences.layout, preferences.size, preferences.width, preferences.font, preferences.lineHeight])
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
  function chapterBounds() {
    const element = viewport.current
    const section = element?.querySelector<HTMLElement>(`[data-chapter="${CSS.escape(current.id)}"]`)
    if (!element || !section) return null
    const viewportBox = element.getBoundingClientRect(), boxes = [...section.getClientRects()]
    if (!boxes.length) return null
    const start = pages ? Math.floor((element.scrollLeft + Math.min(...boxes.map(box => box.left)) - viewportBox.left) / element.clientWidth) * element.clientWidth : element.scrollTop + boxes[0].top - viewportBox.top
    const end = pages ? element.scrollLeft + Math.max(...boxes.map(box => box.right)) - viewportBox.left : element.scrollTop + boxes[0].bottom - viewportBox.top
    const pageSize = pages ? element.clientWidth : element.clientHeight
    const maximum = Math.max(0, end - start - pageSize)
    const offset = Math.max(0, Math.min(maximum, (pages ? element.scrollLeft : element.scrollTop) - start))
    return { element, start: Math.max(0, start), maximum, offset, pageSize }
  }
  function refreshChapterProgress() {
    const bounds = chapterBounds()
    if (!bounds) return
    setChapterProgress({ fraction: bounds.maximum ? bounds.offset / bounds.maximum : 1, pagesLeft: Math.max(0, Math.ceil((bounds.maximum - bounds.offset) / bounds.pageSize)) })
  }
  const updateChapterProgress = useRef(refreshChapterProgress)
  updateChapterProgress.current = refreshChapterProgress
  useLayoutEffect(() => {
    const element = viewport.current
    if (!element) return
    let frame = 0
    const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => updateChapterProgress.current()) }
    const observer = new ResizeObserver(update)
    observer.observe(element)
    if (element.firstElementChild) observer.observe(element.firstElementChild)
    element.addEventListener('scroll', update, { passive: true })
    update()
    return () => { cancelAnimationFrame(frame); observer.disconnect(); element.removeEventListener('scroll', update) }
  }, [chapterId, rendered, pages, preferences.content, preferences.size, preferences.width, preferences.font, preferences.lineHeight])
  function seekChapter(fraction: number) {
    const bounds = chapterBounds()
    if (!bounds) return
    const offset = bounds.start + fraction * bounds.maximum
    if (pages) bounds.element.scrollLeft = Math.round(offset / bounds.pageSize) * bounds.pageSize
    else bounds.element.scrollTop = offset
    remember(true); refreshChapterProgress()
  }
  function topOfChapter() { if (!pages) seekChapter(0) }
  const nativeTop = useRef(topOfChapter)
  nativeTop.current = topOfChapter
  useEffect(() => {
    if (pages || !mobile) return
    // iOS sends status-bar taps to the document scroller. Keep a one-pixel
    // document scroll range and forward its return to zero to this chapter.
    const previousY = window.scrollY
    let interactedAt = performance.now()
    const interact = () => { interactedAt = performance.now() }
    let frame = requestAnimationFrame(() => window.scrollTo(0, 1))
    function scroll() {
      if (window.scrollY !== 0) return
      if (performance.now() - interactedAt > 400) nativeTop.current()
      frame = requestAnimationFrame(() => window.scrollTo(0, 1))
    }
    window.addEventListener('scroll', scroll, { passive: true })
    document.addEventListener('pointerdown', interact, true); document.addEventListener('keydown', interact, true); document.addEventListener('focusin', interact, true)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', scroll); document.removeEventListener('pointerdown', interact, true); document.removeEventListener('keydown', interact, true); document.removeEventListener('focusin', interact, true); window.scrollTo(0, previousY) }
  }, [pages, mobile])
  function changePreferences(next: Preferences) { remember(true); onPreferences(next) }
  const chapterRead = current.kind === 'frontmatter' || proseChapters.slice(0, proseChapters.indexOf(current) + 1).every(chapter => book.completed.includes(chapter.id))
  const chapters = preferences.content === 'entire' ? book.chapters : [current]
  return <div className="reading-screen" data-chrome-visible={chrome || settings || contents} data-reading-layout={preferences.layout} style={{ '--reading-size': `${preferences.size}px`, '--reading-width': `${preferences.width}px`, '--reading-font': readingFonts[preferences.font ?? 'default']?.family ?? readingFonts.default.family, '--reading-line-height': preferences.lineHeight ?? 1.75, '--reading-text': colors.text, '--reading-link': colors.link, '--reading-background': colors.background, '--reading-brightness': preferences.brightness ?? 1 } as CSSProperties}>
    <button type="button" className="chapter-top-target" aria-label="Go to Chapter Start" onClick={topOfChapter} />
    <header className="reader-toolbar"><button className="reader-back" aria-label="Bookshelf" onClick={() => { remember(true); onClose() }}><ChevronLeft size={24} aria-hidden="true" /><span className="reader-control-label">Bookshelf</span></button><button ref={contentsTrigger} className="contents-trigger" aria-label="Contents" onClick={() => setContents(!contents)} aria-expanded={contents} aria-controls={contents ? `${displayId}-contents` : undefined}><List size={20} aria-hidden="true" /><span className="reader-control-label">Contents</span></button><div className="reading-title"><strong><button className="title-button reading-work-name" onClick={onViewDetails} title="View Details">{book.metadata.title}</button><span className="reader-work-status"><PublicationStatusIndicator portal placement="bottom" status={book.metadata.publication_status} /></span></strong><small>{book.metadata.authors.join(', ')}</small>{anthology && <><small>{anthologyLabel(book)}</small>{currentWork && <small className="current-anthology-work">{currentWork.title} · {current.kind === 'frontmatter' ? readerChapterLabel(current, currentChapters) : `Chapter ${chapterPosition(current, currentChapters)} of ${currentChapters.filter(chapter => chapter.kind !== 'frontmatter').length}`}</small>}</>}</div><ChapterProgress label={anthology ? "Anthology Chapters" : "Chapter"} status={book.status} progress={readerProgress(book)} metadata={{ ...progressMetadata(book), published_chapters: book.metadata.published_chapters ?? proseChapters.length }} onSave={onProgress} /><button className="toolbar-mark-read" title={`Mark As Read Through Chapter ${readerChapterNumber(current, book.chapters) ?? '—'}`} disabled={chapterRead} onClick={() => onRead(current, true)}>{current.kind === 'frontmatter' ? 'Front Matter' : 'Mark As Read'}</button><button className="reader-display-trigger" aria-label="Display" onClick={() => { remember(true); setSettings(!settings) }} aria-expanded={settings}><Type size={22} aria-hidden="true" /><span className="reader-control-label">Display</span></button></header>
    <div className="reading-body">{settings && <ReaderDisplay preferences={preferences} onChange={changePreferences} />}<div ref={viewport} className={`reading-viewport ${pages ? 'paginated' : ''}`} tabIndex={0} aria-label="Book Content" onScroll={() => remember()} onTouchStart={e => { touch.current = e.touches[0].clientX }} onTouchEnd={e => { if (pages && touch.current !== null) { const dx = e.changedTouches[0].clientX - touch.current; if (Math.abs(dx) > 50) turn(dx < 0 ? 1 : -1) } touch.current = null }} onClick={e => { const target = e.target as HTMLElement, link = target.closest('a'); if (link?.hasAttribute('data-link')) { e.preventDefault(); const [path, fragment] = link.getAttribute('data-link')!.split('#'); const chapter = book.chapters.find(c => c.path === path); if (chapter) { go(chapter); if (fragment) requestAnimationFrame(() => viewport.current?.querySelector(`[id="${CSS.escape(fragment)}"]`)?.scrollIntoView()) } return } if (mobile && !target.closest('a, button, [role=button], .custom-dropdown') && !window.getSelection()?.toString()) { setChrome(value => !value); setSettings(false); setContents(false) } if (pages && !target.closest('a, button, .custom-dropdown') && !window.getSelection()?.toString()) { const rect = e.currentTarget.getBoundingClientRect(), x = e.clientX - rect.left; if (x < rect.width * .25 || x > rect.width * .75) turn(x > rect.width / 2 ? 1 : -1) } }}>
      <div className="prose">{chapters.map((chapter, i) => { const sectionIndex = preferences.content === 'entire' ? i : index; return <section key={`${chapter.id}-${i}`} data-chapter={chapter.id} aria-label={chapter.title}>{!pages && <ChapterNavigation chapters={book.chapters} index={sectionIndex} onGo={go} position="top" onRead={onRead} completed={book.completed} />}{pages && <ChapterTitle chapters={book.chapters} index={sectionIndex} onGo={go} heading />}<div data-chapter-content dangerouslySetInnerHTML={{ __html: rendered[chapter.id] ?? '' }} />{!pages && <ChapterNavigation chapters={book.chapters} index={sectionIndex} onGo={go} position="bottom" onRead={onRead} completed={book.completed} />}</section> })}</div>
    </div>{contents && <aside ref={contentsPanel} className="contents-panel" id={`${displayId}-contents`} aria-labelledby={`${displayId}-contents-heading`} tabIndex={-1} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeContents() } }}><div className="contents-heading"><h2 id={`${displayId}-contents-heading`}>Contents</h2><button type="button" aria-label="Close Contents" onClick={closeContents}><X size={20} aria-hidden="true" /></button></div><nav aria-label="Contents"><ol className="toc-list">{book.chapters.map(chapter => <Fragment key={chapter.id}>{anthology && chapter.workStart && <li className="toc-work-title"><button className="menu-item" onClick={() => { go(chapter); closeContents() }}>{chapter.workTitle}<ChevronRight size={18} aria-hidden="true" /></button></li>}<li data-anthology-child={anthology && Boolean(chapter.workKey)} data-section-kind={chapter.kind ?? 'chapter'}><button className="menu-item" aria-current={chapter.id === current.id ? 'location' : undefined} onClick={() => { go(chapter); closeContents() }}><span>{readerChapterLabel(chapter, book.chapters)}</span><ChevronRight size={18} aria-hidden="true" /></button></li></Fragment>)}</ol></nav></aside>}</div><footer className="reading-footer"><label className="chapter-position-slider"><span className="sr-only">Position Within Chapter</span><input type="range" aria-label="Position Within Chapter" aria-valuetext={`${Math.round(chapterProgress.fraction * 100)}% through ${readerChapterLabel(current, book.chapters)}`} min="0" max="1000" step="1" value={Math.round(chapterProgress.fraction * 1000)} onChange={event => seekChapter(Number(event.target.value) / 1000)} /></label><div className="chapter-footer-details"><span>{chapterProgress.pagesLeft} {chapterProgress.pagesLeft === 1 ? 'page' : 'pages'} left</span><button type="button" title={`Mark As Read Through Chapter ${readerChapterNumber(current, book.chapters) ?? '—'}`} disabled={chapterRead} onClick={() => onRead(current, true)}>Mark Chapter Read</button></div></footer>
  </div>
}
