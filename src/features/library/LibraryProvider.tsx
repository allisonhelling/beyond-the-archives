import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { UndoNotice } from '../../components/UndoNotice'
import type { Collection, Story } from './model'
import { deleteStory, loadLibrary, restoreStory, updateEntry } from './repository'
type ReadingUndo = { id: string; storyId: string; title: string; message: string; previous?: { last_read_chapter: number; reading_status: Story['reading_status'] }; removed?: Story }
type LibraryState = { stories: Story[]; collections: Collection[]; loading: boolean; error: string; refresh: () => Promise<void>; markAllRead: (story: Story) => Promise<void>; markFinished: (story: Story) => Promise<void>; removeStory: (story: Story) => Promise<void> }
const Context = createContext<LibraryState | null>(null)
export function LibraryProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<{ stories: Story[]; collections: Collection[] }>({ stories: [], collections: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [undoNotices, setUndoNotices] = useState<ReadingUndo[]>([])
  const dismissUndo = useCallback((id: string) => setUndoNotices(notices => notices.filter(notice => notice.id !== id)), [])
  const refresh = useCallback(async () => {
    try { const next = await loadLibrary(); setData(next); setError('') }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load your library.'); throw e }
    finally { setLoading(false) }
  }, [])
  async function updateReadingWithUndo(story: Story, status: Story['reading_status'], chapters: number, message: string) {
    await updateEntry(story.id, { last_read_chapter: chapters, reading_status: status })
    setUndoNotices(notices => [...notices.filter(notice => notice.storyId !== story.id), {
      id: crypto.randomUUID(), storyId: story.id, title: story.metadata.title, message,
      previous: notices.find(notice => notice.storyId === story.id)?.previous ?? { last_read_chapter: story.last_read_chapter, reading_status: story.reading_status },
    }])
    await refresh()
  }
  async function markAllRead(story: Story) {
    if (story.metadata.published_chapters === null) return
    const status = story.metadata.publication_status === 'complete' ? 'finished' : story.metadata.publication_status === 'in_progress' ? 'waiting_for_updates' : story.reading_status
    await updateReadingWithUndo(story, status, story.metadata.published_chapters, `Marked all chapters of “${story.metadata.title}” as read${status === 'finished' ? ' and fic as finished.' : status === 'waiting_for_updates' ? '. Waiting for updates.' : '.'}`)
  }
  async function removeStory(story: Story) {
    await deleteStory(story.id)
    setUndoNotices(notices => [...notices.filter(notice => notice.storyId !== story.id), { id: crypto.randomUUID(), storyId: story.id, title: story.metadata.title, message: `Removed “${story.metadata.title}” from your library.`, removed: story }])
    await refresh()
  }
  async function markFinished(story: Story) {
    const chapters = story.metadata.published_chapters ?? story.metadata.total_chapters
    await updateReadingWithUndo(story, 'finished', chapters ?? story.last_read_chapter, `Marked “${story.metadata.title}” as finished.${chapters === null ? '' : ' All chapters marked as read.'}`)
  }
  useEffect(() => { let alive = true; loadLibrary().then(next => { if (alive) { setData(next); setError('') } }).catch(e => { if (alive) setError(e instanceof Error ? e.message : 'Could not load library.') }).finally(() => { if (alive) setLoading(false) }); return () => { alive = false } }, [])
  return <Context.Provider value={{ ...data, loading, error, refresh, markAllRead, markFinished, removeStory }}>
    {undoNotices.length > 0 && <section className="reading-undo-notices" aria-label="Reading updates">{undoNotices.map(notice => <UndoNotice key={notice.id} id={notice.id} message={notice.message} dismissLabel={`Dismiss undo notification for ${notice.title}`} onDismiss={dismissUndo} onUndo={async () => { if (notice.removed) await restoreStory(notice.removed); else if (notice.previous) await updateEntry(notice.storyId, notice.previous); await refresh() }} />)}</section>}
    {children}
  </Context.Provider>
}
// eslint-disable-next-line react-refresh/only-export-components
export function useLibrary() { const value = useContext(Context); if (!value) throw new Error('Library provider missing'); return value }
