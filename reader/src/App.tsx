import { progressReadingStatus } from '../../src/features/library/model'
import { CalibreTransfers } from './CalibreTransfers'
import { receiveTransfers } from './transfers'
import { importedVersion, prepareImport, saveImportedVersion } from './import-books'
import { LocalStorageDialog, type StorageEstimate } from './LocalStorageDialog'
import { formatBytes, isStorageFull, storageFullMessage } from './storage-info'
import { ReaderAccount } from './ReaderAccount'
import { connectedLogin, organizerAppUrl } from '../../src/lib/connected-login'
import { readerCloud, readerCloudConfig, readerAuthIntent, rememberOrganizerConnection, validateOrganizerConnection, restoreOrganizerConnection, switchLibrary, downloadCloud, syncCloud, type CloudConflict } from './cloud'
import { clearPendingReaderPairing, consumeReaderPairing, deferReaderPairing, type ReaderPairing } from '../../src/lib/reader-connection'
import { readPublicConfig } from '../../src/lib/config'
import { useDismissible } from '../../src/components/useDismissible'
import { useFilterDraft } from '../../src/components/useFilterDraft'
import { TagSettings } from './TagSettings'
import { useTagSettings } from './useTagSettings'
import { readerBrandName } from '../../src/lib/brand'
import { Pagination } from '../../src/features/library/browsing/Pagination'
import { BookshelfFilters } from './BookshelfFilters'
import { emptyFilters, matchesBook, numericFields, dateFields } from './filters'
import { mergeMetadata, metadataVersion, savedWorkIdentity } from './metadata'
import { Copy, LayoutGrid, Moon, RefreshCw, Sun, Tags, UserRound } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Tooltip } from '../../src/components/Tooltip'
import { InfoTooltip } from '../../src/components/InfoTooltip'
import { Dialog } from '../../src/components/Dialog'
import { parseWorkUrl } from '../../src/features/imports/urls'
import { digest, importEpub } from './epub'
import { all, getBook, getBookDetails, listCatalog, loadSetting, mutateBook, putBook, deleteEpub, removeDownload, saveBook, setting, transaction, readerInstallationId, readerOwner } from './storage'
import { readerProgress, chapterNumber, withOrganizerProgress, hasVerifiedMapping, withPublication, bookDetails, catalogBook, completionStatus, defaultPreferences, defaultTagAppearance, statuses, type BookDetails, type CatalogBook, type Book, type Chapter, type Connection, type Pending, type Preferences, type ReadingPosition } from './model'
import { pendingUpdate, rpc, synchronize } from './sync'
import { ReadingView } from './ReadingView'
import { WorkDetails } from './WorkDetails'
import { ReaderTile } from './ReaderTile'
import { TileSettings } from './TileSettings'
const shelfPageSize = 24
function describeOrganizerValue(key: string, value: unknown) {
  if (key === 'status') return statuses[value as keyof typeof statuses] ?? 'No reading status saved.'
  if (key === 'progress') return `${value ?? 0} chapters read`
  return String(value || 'No personal notes.')
}
export function App({ initialPairing }: { initialPairing?: ReaderPairing }) {
  const [profileOpen, setProfileOpen] = useState(false)
  const [profileIdentity,setProfileIdentity]=useState({name:'Reader',email:''})
  const profileRef = useDismissible<HTMLDivElement>(profileOpen, () => setProfileOpen(false))
  function openProfileOption(option: 'connect' | 'sync' | 'tags' | 'tiles' | 'account') {
    setProfileOpen(false)
    profileRef.current?.querySelector('button')?.focus()
    setModal(!readerOwner && (option === 'connect' || option === 'sync') ? 'account' : option)
  }
  const [cloudConflicts, setCloudConflicts] = useState<CloudConflict[]>([])
  const [copiedSecret, setCopiedSecret] = useState<string>()
  const copyTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(copyTimer.current), [])
  const [storageFull, setStorageFull] = useState(false)
  const [pairing, setPairing] = useState(initialPairing)
  const [books, setBooks] = useState<CatalogBook[]>([]), [selected, setSelected] = useState<string>(), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  const [preferences, setPreferences] = useState(defaultPreferences), [connection, setConnection] = useState<Connection>(), [modal, setModal] = useState<'connect' | 'sync' | 'manage' | 'details' | 'tags' | 'account' | 'storage' | 'calibre' | 'tiles'>(), [managed, setManaged] = useState<string>()
  const [appliedFilters, setAppliedFilters] = useState(() => ({ query: '', filters: emptyFilters() }))
  const { query, filters } = appliedFilters
  const [draftFilters, setDraftFilters] = useFilterDraft(appliedFilters)
  const setQuery = (query: string) => setDraftFilters({ ...draftFilters, query })
  const [sort, setSort] = useState('recent'), [online, setOnline] = useState(navigator.onLine), [offlineReady, setOfflineReady] = useState(false), [pending, setPending] = useState<Pending[]>([])
  const [detailsFromStorage,setDetailsFromStorage]=useState(false)
  const [review, setReview] = useState<{ pending: Pending; remote: NonNullable<Book['remote']> }>()
  const [candidate, setCandidate] = useState<Book>(), [previous, setPrevious] = useState<BookDetails>(), [missingWork, setMissingWork] = useState<string>(), [replaceTarget, setReplaceTarget] = useState<string>()
  const requestedOpening = useRef<{ target: string; chapter: number } | undefined>(undefined)
  const picker = useRef<HTMLInputElement>(null), connectionRef = useRef(connection), syncing = useRef(false), syncRequested = useRef<{force:boolean;quiet:boolean} | undefined>(undefined), saving = useRef(Promise.resolve())
  connectionRef.current = connection
  const [active, setActive] = useState<Book>(), [manage, setManage] = useState<BookDetails>(), [page, setPage] = useState(1)
  const localTagAppearance = preferences.tagAppearance ?? defaultTagAppearance
  const tagsLinked = Boolean(connection && preferences.tagSyncAccount === connection.account)
  const tagSettings = useTagSettings(connection, tagsLinked, localTagAppearance)
  const [storage, setStorage] = useState<StorageEstimate>()
  async function refreshStorage() {
    try {
      const estimate = await navigator.storage?.estimate?.(), persistent = await navigator.storage?.persisted?.()
      setStorage({ ...estimate, persistent })
    } catch { setStorage(undefined) }
  }
  async function refresh() {
    const saved = await listCatalog(); const linked=readerOwner && !await loadSetting<boolean>('organizer-disabled-here') ? await loadSetting<Connection>('connection') : undefined;setConnection(linked);connectionRef.current=linked;setBooks(saved); setPending(await all<Pending>('pending')); await refreshStorage(); return saved
  }
  useEffect(() => {
    let cancelled = false
    setActive(undefined)
    if (selected) void attempt(async () => {
      await saving.current
      let book = await getBook(selected)
      const opening = requestedOpening.current
      if (book && opening && (book.id === opening.target || savedWorkIdentity(book) === opening.target)) {
        const chapters = book.chapters.filter(chapter => chapterNumber(chapter, book!.chapters) === opening.chapter)
        if (chapters.length === 1) {
          const position = { chapter: chapters[0].id, fraction: 0 }
          await mutateBook(book.id, current => ({ ...current, position }))
          book = { ...book, position }
        }
        requestedOpening.current = undefined
      }
      if (!cancelled) { setActive(book); if (!book) { setSelected(undefined); setMessage('This download is no longer available. Import its EPUB again.') } }
    })
    return () => { cancelled = true }
  }, [selected])
  useEffect(() => {
    let cancelled = false
    if ((modal === 'manage' || modal === 'details') && managed) void getBookDetails(managed).then(book => { if (!cancelled) setManage(book) }).catch(error => setMessage(String(error)))
    else setManage(undefined)
    // Refresh open reading state without reloading EPUB contents after a sync or edit.
    if (selected) void getBookDetails(selected).then(details => {
      if (!cancelled) { if (details) setActive(current => current?.id === details.id ? { ...current, ...details, chapters: current.chapters } : current); else { setActive(undefined); setSelected(undefined) } }
    }).catch(error => setMessage(String(error)))
    return () => { cancelled = true }
  }, [books, managed, modal, selected])
  async function refreshMetadata(force = true) {
    let updated = 0, failed = 0
    for (const entry of await listCatalog()) {
      if (!entry.hasFile || !force && entry.metadataVersion === metadataVersion && entry.workId) continue
      const book = await getBook(entry.id)
      if (!book?.file) continue
      try {
        const imported = await importEpub(book.file as File)
        await mutateBook(book.id, current => ({ ...current, workId: current.workId ?? imported.workId, metadata: mergeMetadata(current.metadata, imported.metadata), metadataVersion }))
        updated++
      } catch (error) { if (isStorageFull(error)) throw error; failed++ }
    }
    if (updated) await refresh()
    if (force || failed) setMessage(`${updated} EPUB metadata snapshots refreshed locally.${failed ? ` ${failed} files could not be refreshed; their existing metadata is retained.` : ''} Reading history and organizer data are unchanged.`)
  }
  function reportError(error: unknown) {
    if (isStorageFull(error)) { setStorageFull(true); setModal('storage'); setMessage(storageFullMessage); void refreshStorage(); return }
    setMessage(error instanceof Error ? error.message : 'The operation failed. Existing files and history are retained.')
  }
  async function copyReaderSecret(button: HTMLButtonElement) {
    if (!connection) return
    button.focus()
    try {
      await navigator.clipboard.writeText(connection.secret)
      setCopiedSecret(connection.secret)
      window.clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => setCopiedSecret(undefined), 2000)
    } catch (error) { setCopiedSecret(undefined); reportError(error) }
  }
  async function removeLocalDownload(target: CatalogBook | BookDetails | CatalogBook[]) {
    const targets=Array.isArray(target)?target:[target]
    if (!confirm(targets.length>1?`Remove ${targets.length} local EPUB downloads? Notes, reading history, and positions will be retained.`:'Remove this local EPUB? Reading history, notes, and position will be retained. Keep an original backup or verify a cloud copy first.')) return
    await attempt(async () => {
      await saving.current
      for(const book of targets){const details=await getBookDetails(book.id);if(details)await removeDownload(details)}
      await refresh(); void sync(); if (targets.some(book=>selected===book.id)) setSelected(undefined)
      if (modal !== 'storage') setModal(undefined)
      setMessage(`${targets.length===1?'Local download removed.':`${targets.length} local downloads removed.`} Notes, reading history, and position are retained. Retry the save that failed if storage was full.`)
    })
  }
  function readBook(book: CatalogBook) {
    if (book.hasFile) { setMissingWork(undefined); setSelected(book.id) }
    else if (readerOwner) void attempt(async () => { await downloadCloud(book.id); await refresh(); setMissingWork(undefined); setSelected(book.id) })
    else picker.current?.click()
  }
  async function downloadSelection(selectedBooks: CatalogBook[]) {
    await attempt(async()=>{
      let downloaded=0
      const failed:string[]=[]
      try {for(const book of selectedBooks){try{await downloadCloud(book.id);downloaded++}catch(error){if(isStorageFull(error))throw error;failed.push(`${book.metadata.title}: ${error instanceof Error?error.message:String(error)}`)}}}
      finally {await refresh()}
      setMessage(`${downloaded} EPUB downloads completed.${failed.length?` ${failed.length} failed: ${failed.join('; ')}`:''}`)
    })
  }
  async function deleteVersion(target: CatalogBook | BookDetails | CatalogBook[]) {
    const targets = Array.isArray(target) ? target : [target], book = targets[0]
    if (!book) return
    if (!confirm(`Permanently delete ${targets.length > 1 ? `${targets.length} selected EPUB versions` : `“${book.metadata.title}”`} from ${readerOwner ? 'this account’s library and cloud storage' : 'this guest library'}? This removes this EPUB version, personal notes, reading history, and position${readerOwner ? ' from other devices when they sync' : ''}. Other versions, original files outside the reader, and organizer data are kept. This cannot be undone.`)) return
    await attempt(async () => {
      await saving.current
      // Finish any in-flight sync before removing this version and its queued edits.
      if (syncing.current) await syncCloud()
      for (const target of targets) await deleteEpub(target.id)
      if (targets.some(target => selected === target.id)) { setSelected(undefined); setActive(undefined) }
      if (modal !== 'storage') setModal(undefined)
      setManaged(undefined); await refresh()
      setMessage(readerOwner ? 'EPUB deleted from this device. Cloud deletion is queued and will retry when online.' : 'EPUB and its reading data permanently deleted from this guest library.')
      void sync()
    })
  }
  async function attempt(action: () => Promise<void>) { setBusy(true); try { await action() } catch (error) { reportError(error) } finally { setBusy(false) } }
  async function sync(force = false, quiet = false) {
    if (!readerOwner) return
    if (!navigator.onLine) { if (!quiet) setMessage('Offline. Downloads remain available. Your saved reading changes will sync when you reconnect.'); return }
    let linked = connectionRef.current
    if (syncing.current) {
      const requested = syncRequested.current
      const manual = requested?.force && !requested.quiet || force && !quiet
      syncRequested.current = { force: Boolean(requested?.force || force), quiet: !manual }
      return
    }
    syncing.current = true
    if (force && !quiet) setMessage('Syncing the cloud catalog and organizer links… Cloud-only EPUBs will stay in the cloud.')
    try {
      await saving.current
      const messages: string[] = []
      const syncAccount = async () => {
        try { const conflicts = await syncCloud(true); setCloudConflicts(conflicts); if (conflicts.length) messages.push('Reading-progress sync needs attention. Open Reader Account to choose which edits to keep.') }
        catch (error) { if (isStorageFull(error)) reportError(error); messages.push(`Cloud storage and reading-progress sync paused: ${error instanceof Error ? error.message : String(error)}`) }
      }
      if (navigator.onLine) {
        try {linked=await restoreOrganizerConnection(linked);setConnection(linked);connectionRef.current=linked} catch(error){linked=undefined;messages.push(`Organizer sync setup paused: ${error instanceof Error ? error.message : 'The connection could not be restored.'} Your local reading changes are retained.`)}
      }

      if (force && !quiet && await loadSetting<boolean>('organizer-disabled-here')) messages.push('Organizer reading-progress sync is paused on this device. Open Reader Account → Advanced Troubleshooting → Repair Organizer Connection to resume.')
      await syncAccount()
      if (linked) {
        try {
          const report = await synchronize(linked, force)
          // Background success stays quiet; manual sync and problems remain visible.
          if (force && !quiet || !report.startsWith('Reading updates are synced.')) messages.push(report)
        }
        catch (error) { if (isStorageFull(error)) reportError(error); messages.push(`Organizer sync paused: ${error instanceof Error ? error.message : String(error)}`) }
      }
      if (linked) await syncAccount()
      if (force && !quiet && !messages.length) messages.push('Sync finished. Your cloud library and reading progress are up to date.')
      if (messages.length) setMessage(messages.join(' '))
      const prefs = await loadSetting<Preferences>('preferences')
      if (prefs) setPreferences(prefs)
      await refresh()
    } catch (error) { setMessage(`Sync paused: ${error instanceof Error ? error.message : 'Connection failed'}. Local changes are retained.`) } finally {
      syncing.current = false
      if (syncRequested.current !== undefined) { const requested = syncRequested.current; syncRequested.current = undefined; void sync(requested.force, requested.quiet) }
    }
  }
  useEffect(() => {
    void attempt(async () => {
      const saved = await refresh(), prefs = await loadSetting<Preferences>('preferences'), linked = connectionRef.current
      await readerInstallationId()
      if (prefs) setPreferences(prefs)
      if (linked) { setConnection(linked); connectionRef.current = linked }
      if (initialPairing) await receivePairing(initialPairing)
      if (location.pathname === '/auth/callback' || readerAuthIntent === 'invite' || readerAuthIntent === 'recovery' || readerAuthIntent === 'signup') setModal('account')
      else if (navigator.onLine) void (async()=>{
        try {
          const {data}=await readerCloud.auth.getSession()
          if(!data.session && await connectedLogin(readerCloud,organizerAppUrl())) {
            const session=(await readerCloud.auth.getSession()).data.session
            if(session && (!readerOwner || readerOwner===session.user.id)){await saving.current;await switchLibrary(session.user.id)}
            else if(session)setModal('account')
          }
        }catch{ /* Email/password and a popup fallback remain available. */ }
      })()
      const requested = new URLSearchParams(location.search)
      const id = requested.get('work') ?? requested.get('book')
      const chapter = Number(requested.get('chapter'))
      if (id && Number.isSafeInteger(chapter) && chapter > 0) requestedOpening.current = { target: id, chapter }
      if (id && (/^[1-9]\d*$/.test(id) || /^[a-f0-9]{64}$/.test(id))) { const found = saved.find(b => (savedWorkIdentity(b) === id || b.id === id) && b.active && b.hasFile); if (found) { if (new URLSearchParams(location.search).get('manage') === '1') { setManaged(found.id); setModal('manage') } else setSelected(found.id) } else setMissingWork(id) }
      if ('serviceWorker' in navigator && import.meta.env.PROD) {
        const registration = await navigator.serviceWorker.register('/sw.js')
        void navigator.serviceWorker.ready.then(() => setOfflineReady(true))
        if (registration.active) setOfflineReady(true)
      }
      await refreshMetadata(false)
      // Keep the existing-connection explanation visible when rejecting a new pairing link.
      if (!initialPairing || !linked) void sync(Boolean(requested.get('chapter')), true)
    })
    const authListener=readerCloud.auth.onAuthStateChange((event,session)=>{
      const user=session?.user
      const name=[user?.user_metadata?.display_name,user?.user_metadata?.full_name,user?.user_metadata?.name].find(value=>typeof value==='string'&&value.trim()) || user?.email?.split('@')[0] || 'Reader'
      setProfileIdentity({name,email:user?.email??''})
      if(event==='PASSWORD_RECOVERY')setModal('account')
    })
    const reconnect = () => { setOnline(navigator.onLine); if (navigator.onLine) void sync() }, foreground = () => { if (document.visibilityState === 'visible') void sync(true, true) }
    const pairingChanged = () => { const incoming = consumeReaderPairing(); if (incoming) void attempt(() => receivePairing(incoming)) }
    window.addEventListener('hashchange', pairingChanged)
    const cloudInterval = window.setInterval(() => { if (document.visibilityState === 'visible') void sync() }, 30000)
    window.addEventListener('focus', foreground); window.addEventListener('online', reconnect); window.addEventListener('offline', reconnect); document.addEventListener('visibilitychange', foreground)
    return () => { authListener.data.subscription.unsubscribe();window.removeEventListener('hashchange', pairingChanged); window.clearInterval(cloudInterval); window.removeEventListener('focus', foreground);window.removeEventListener('online', reconnect); window.removeEventListener('offline', reconnect); document.removeEventListener('visibilitychange', foreground) }
  }, [])
  useEffect(() => {
    let running = false
    const receive = async () => {
      if (running || document.visibilityState === 'hidden') return
      running = true
      try { await saving.current; if (await receiveTransfers()) { await refresh(); void sync() } }
      catch (error) { reportError(error) } finally { running = false }
    }
    void receive()
    const timer = window.setInterval(() => void receive(), 15000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => { document.documentElement.dataset.theme = preferences.dark ? 'dark' : 'light' }, [preferences.dark])
  function updatePreferences(next: Preferences) { setPreferences(next); void setting('preferences', next).catch(reportError) }
  async function commit(book: Book | BookDetails, event?: Pending, preservePosition = true) {
    await saving.current
    let details = 'file' in book ? bookDetails(book) : book
    await saveBook(details, event, preservePosition)
    details = await getBookDetails(book.id) ?? details
    const entry = catalogBook(details)
    setBooks(previous => previous.map(b => b.id === book.id ? entry : b).concat(previous.some(b => b.id === book.id) ? [] : [entry]))
    setActive(current => current?.id === book.id ? { ...current, ...details, chapters: current.chapters } : current)
    setPending(await all<Pending>('pending'))
    if (event) void sync()
  }
  async function updateMarking(id: string, field: 'favorite' | 'rec', value: boolean) {
    await attempt(async () => {
      const book = await getBookDetails(id)
      if (!book) return
      await commit({ ...book, [field]: value })
      void sync()
    })
  }
  async function queueUpdate(book: Book | BookDetails, input: Record<string, unknown>) {
    const event = pendingUpdate(book, connection, input)
    if (event) {
      const prior = (await all<Pending>('pending')).filter(p => p.book === book.id).at(-1)
      if (prior) { const { status, progress, notes } = prior.input; event.base = { ...event.base, ...prior.base, ...(typeof status === 'string' && { status }), ...(typeof progress === 'number' && { progress }), ...(typeof notes === 'string' && { notes }) } as typeof event.base }
      if ('notes' in input) event.action = 'save'
      else if (!('progress' in input)) event.input.progress = event.base.progress
    }
    return event
  }
  function position(position: ReadingPosition) {
    const id = selected
    if (!id) return
    // Serialize position writes so closing/restarting never lets an older scroll overwrite a newer one.
    saving.current = saving.current.then(async () => {
      await mutateBook(id, book => ({ ...book, position }))
    }).catch(error => { if (isStorageFull(error)) reportError(error); else setMessage(`Position could not be saved: ${String(error)}`) })
  }
  async function updateProgress(id: string, progress: number, reread = false) {
    await saving.current
    const book = await getBookDetails(id)
    if (!book) throw new Error('This book is no longer available.')
    const status = reread ? 're_reading' : progressReadingStatus(progress, book.metadata)
    const completed = book.chapters.filter(chapter => chapter.kind !== 'frontmatter' && (chapterNumber(chapter, book.chapters) ?? Infinity) <= progress).map(chapter => chapter.id)
    const event = await queueUpdate(book, { progress, status })
    const position = reread ? { chapter: book.chapters.find(chapter => chapter.kind !== 'frontmatter')?.id ?? book.position.chapter, fraction: 0 } : book.position
    await commit({ ...book, status, completed, progress, position }, event, !reread)
    setMessage(reread ? 'New reread started. Previous history is retained.' : 'Reading progress saved.')
  }
  async function read(chapter: Chapter, through: boolean) {
    await attempt(async () => {
      await saving.current
      let book = selected ? await getBookDetails(selected) : undefined
      if (!book) throw new Error('This download is no longer available.')
      book = withPublication(book, book.remote)
      if (navigator.onLine && connection && book.workId && book.account === connection.account) {
        try { const result = await rpc(connection, 'get', book.workId); book = withPublication(book, result.entry ?? undefined) } catch { /* Use the saved publication snapshot if refresh is unavailable. */ }
      }
      const savedBook = book
      const index = savedBook.chapters.indexOf(savedBook.chapters.find(c => c.id === chapter.id)!)
      const chosen = (through ? book.chapters.slice(0, index + 1) : [chapter]).filter(c => c.kind !== 'frontmatter' && !savedBook.completed.includes(c.id))
      if (!chosen.length) return
      const next: BookDetails = { ...book, completed: [...book.completed, ...chosen.map(c => c.id)], status: book.status === 'to_read' ? 'reading' as const : book.status,
        history: [...book.history, ...chosen.map(c => ({ id: crypto.randomUUID(), chapter: c.id, words: c.words, at: new Date().toISOString(), reread: savedBook.status === 're_reading' || savedBook.history.some(h => h.chapter === c.id) }))] }
      next.progress = Math.max(readerProgress(book), ...next.chapters.filter(chapter => chapter.kind !== 'frontmatter' && next.completed.includes(chapter.id)).map(chapter => chapterNumber(chapter, next.chapters) ?? 0))
      next.status = completionStatus(next)
      const reads = chosen.filter(c => hasVerifiedMapping(c, next.chapters)).map(c => ({ chapter: c.number!, chapter_id: c.ao3Id, word_count: c.words })).sort((a,b) => a.chapter - b.chapter)
      let event: Pending | undefined
      if (reads.length === chosen.length && reads.length) {
        const last = reads.at(-1)!
        event = await queueUpdate(book, { progress: next.progress, status: next.status, chapter_read: { ...last, previous_chapters: reads.slice(0, -1) } })
      }
      await commit(next, event)
      setMessage((event ? 'Chapter completion saved. Sync queued.' : connection && book.remote ? 'Saved locally. Chapter mapping is uncertain, so organizer progress was preserved.' : 'Chapter completion saved on this device. For unknown publication status, choose a reading status in Manage EPUB.') + (!navigator.onLine ? ` Publication information reflects its last update: ${new Date(next.metadataAt).toLocaleString()}.` : ''))
      if ((!['complete', 'in_progress', 'deleted'].includes(next.metadata.publication_status) || next.chapters.some(c => c.kind !== 'frontmatter' && !hasVerifiedMapping(c, next.chapters))) && next.chapters.filter(c => c.kind !== 'frontmatter').every(c => next.completed.includes(c.id))) { setManaged(next.id); setModal('manage') }
    })
  }
  async function acceptImport(next: Book, old?: BookDetails, replace = false) {
    await saving.current
    if (old) old = await getBookDetails(old.id) ?? old
    let saved = importedVersion(next, old)
    if (!old && connection && next.workId && navigator.onLine) {
      try { const result = await rpc(connection, 'get', next.workId); if (result.entry) saved = { ...withOrganizerProgress(saved, result.entry), account: connection.account, remote: result.entry, notes: result.entry.notes, collections: (result.collections ?? []).filter(c => result.entry!.collections?.includes(c.id)).map(c => c.name) } } catch { /* Import remains fully independent of the organizer. */ }
    }
    if (!replace) saved.resumeRequired = old ? saved.resumeRequired : false
    await saveImportedVersion(saved, old, replace)
    await navigator.storage?.persist?.()
    await refresh(); void sync(); setSelected(saved.id); setCandidate(undefined); setPrevious(undefined); setMissingWork(undefined)
    setMessage(saved.resumeRequired ? 'Imported. Some chapters could not be mapped. Choose a chapter to resume; your previous reading history is retained.' : 'EPUB saved. Available Here.')
  }
  async function importFile(file: File) {
    await attempt(async () => {
      const { next, duplicate, previous: prior } = await prepareImport(file, replaceTarget)
      setReplaceTarget(undefined)
      if (duplicate?.hasFile) { await mutateBook(duplicate.id, current => ({ ...current, metadata: mergeMetadata(current.metadata, next.metadata), metadataVersion })); await refresh(); setSelected(duplicate.id); setMessage('This exact file is already available. Opened the existing copy.'); return }
      if (duplicate) { await acceptImport(next, prior, true); return }
      if (prior) { setCandidate(next); setPrevious(prior) } else await acceptImport(next)
    })
  }
  async function receivePairing(incoming: ReaderPairing) {
    setPairing(incoming)
    deferReaderPairing(incoming)
    if (!readerOwner) {
      setModal('account'); setMessage('Sign in to the matching reader account to connect this organizer. Guest reading stays local.')
      let session=(await readerCloud.auth.getSession()).data.session
      if (!session && await connectedLogin(readerCloud, organizerAppUrl())) session=(await readerCloud.auth.getSession()).data.session
      if (session) await switchLibrary(session.user.id)
      return
    }
    await connect(undefined, incoming)
  }
  async function connect(form?: HTMLFormElement, incoming = pairing) {
    if (!readerOwner) { setModal('account'); setMessage('Sign in to connect an organizer. Guest reading stays local.'); return }
    await attempt(async () => {
      const fields = form ? new FormData(form) : new FormData()
      const defaults = incoming ?? readerCloudConfig
      const config = readPublicConfig({ VITE_SUPABASE_URL: defaults.url, VITE_SUPABASE_PUBLISHABLE_KEY: defaults.key })
      if (!config) throw new Error('Organizer connection settings are unavailable. Check the shared backend configuration.')
      const secret = incoming?.code ?? String(fields.get('secret')).trim(), backend = config.url.replace(/\/$/, '')
      const next: Connection = { backend, key: config.key, secret, account: await digest(new TextEncoder().encode(`${backend}\n${secret}`).buffer), label: new URL(backend).hostname, name: String(fields.get('name') ?? '').trim() || 'My Reader' }
      const existing = await loadSetting<Connection>('connection')
      if (existing && existing.backend.replace(/\/$/,'') !== backend) throw new Error('Disconnect the current organizer before connecting another one. Pending updates remain associated with the previous connection.')
      await validateOrganizerConnection(next)
      async function claim() {
        const claimed = await rpc(next, 'claim', '1', existing ? { existingSecret: existing.secret } : {})
        if (!claimed.secret) throw new Error('Pairing did not return a reader credential.')
        if (existing) {
          if(claimed.secret !== existing.secret)throw new Error('Update the organizer backend before reusing this reader connection. The existing connection is retained.')
          Object.assign(next,existing,{key:next.key})
        } else {
          next.secret = claimed.secret
          next.account = await digest(new TextEncoder().encode(`${next.backend}\n${next.secret}`).buffer)
        }
      }
      if (incoming || existing) await claim()
      try { await rpc(next, 'get', '1') } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('Pair this device first')) throw error
        await claim()
        await rpc(next, 'get', '1')
      }
      await rememberOrganizerConnection(next)
      await setting('organizer-disabled-here', false);await setting('connection', next);
      clearPendingReaderPairing()
      setPairing(undefined); setConnection(next); connectionRef.current = next; setModal(undefined); setMessage(`${existing?'Existing organizer connection reused.':'Organizer connected.'} Matching AO3 EPUBs link automatically during sync. Connecting does not create organizer entries.`); void sync()
    })
  }
  async function link(book: BookDetails, url: string) {
    await attempt(async () => {
      const id = String(parseWorkUrl(url).workId)
      if (book.workId && book.workId !== id) throw new Error('This file already identifies another AO3 work.')
      if (!connection) { await commit({ ...book, workId: id }); setMessage('AO3 identity saved locally.'); return }
      if ((await all<Pending>('pending')).some(p => p.book === book.id)) throw new Error('Resolve this book’s pending sync changes before changing its connection.')
      const result = await rpc(connection, 'get', id)
      if (!result.entry) throw new Error('Save this work in the organizer first. The reader does not create organizer entries automatically.')
      await commit({ ...withOrganizerProgress(book, result.entry), workId: id, account: connection.account, remote: result.entry, notes: result.entry.notes, collections: (result.collections ?? []).filter(c => result.entry!.collections?.includes(c.id)).map(c => c.name) })
      void sync()
      setMessage('Work linked. Existing local history is retained; earlier standalone reads are not uploaded retroactively.')
    })
  }
  function viewFacet(key:'series'|'author',name:string) {
    const next={query:'',filters:{...emptyFilters(),selections:{[key]:[name]}}}
    setDraftFilters(next);setAppliedFilters(next);setPage(1)
  }
  function viewDetails(id: string, fromStorage=false) { setDetailsFromStorage(fromStorage);setManaged(id);setModal('details') }
  const available = useMemo(() => books.filter(b => b.hasFile), [books])
  const results = useMemo(() => books.filter(book => matchesBook(book, filters, query)).sort((a,b) => {
    if (sort === 'title') return a.metadata.title.localeCompare(b.metadata.title)
    const numeric = numericFields.find(field => field.key === sort)
    if (numeric) return (numeric.value(b) ?? -1) - (numeric.value(a) ?? -1)
    const date = dateFields.find(field => field.key === sort)
    if (date) return (date.value(b) ?? '').localeCompare(date.value(a) ?? '')
    return b.importedAt.localeCompare(a.importedAt) || a.id.localeCompare(b.id)
  }), [books, filters, query, sort])
  useEffect(() => { setPage(1) }, [query, filters, sort])
  const pages = Math.max(1, Math.ceil(results.length / shelfPageSize)), currentPage = Math.min(page, pages)
  const visible = results.slice((currentPage - 1) * shelfPageSize, currentPage * shelfPageSize)
  const handoffBook = books.find(book => (savedWorkIdentity(book) === missingWork || book.id === missingWork) && book.active)
  return <>
    {active?.file && active.id === selected ? <ReadingView key={active.id} book={active} onProgress={progress => updateProgress(active.id, progress)} onViewDetails={() => viewDetails(active.id)} preferences={preferences} onPreferences={updatePreferences} onPosition={position} onRead={(c,t) => void read(c,t)} onClose={() => { void saving.current.then(refresh); setSelected(undefined) }} /> : <>
      <header className="app-header"><a className="brand" href="/">▤ <span>{readerBrandName}<small>AN EPUB READER, AVAILABLE ONLINE AND OFFLINE</small></span></a><nav><span className="connection-state">● {online ? 'Online' : 'Offline'}</span><button onClick={() => { setStorageFull(false); setModal('storage') }}>Storage</button><button onClick={() => setModal('calibre')}>Calibre</button><button className="theme-toggle" aria-pressed={preferences.dark} aria-label="Toggle Dark Mode" onClick={() => updatePreferences({ ...preferences, dark: !preferences.dark })}>{preferences.dark ? <Sun size={20} strokeWidth={2.75} aria-hidden="true" /> : <Moon size={20} strokeWidth={2.75} aria-hidden="true" />}</button><div className="profile-wrapper" ref={profileRef} onKeyDown={event => { if (event.key === 'Escape') { setProfileOpen(false); profileRef.current?.querySelector('button')?.focus() } }}><button className="avatar profile-trigger" aria-label="Profile Menu" title="Profile Menu" aria-expanded={profileOpen} aria-controls="reader-profile-options" onClick={() => setProfileOpen(!profileOpen)}>{profileIdentity.name.slice(0,1).toUpperCase()}</button>{profileOpen && <section className="profile-menu menu-surface" id="reader-profile-options" aria-label="Profile Menu"><div className="profile-identity"><strong>{profileIdentity.name}</strong><p>{profileIdentity.email || (readerOwner?'Account Library':'Guest Library')}</p></div><button className="profile-action" onClick={() => openProfileOption('account')}><UserRound size={17} aria-hidden="true" />Reader Account</button><button className="profile-action" onClick={() => openProfileOption('sync')}><RefreshCw size={17} aria-hidden="true" />Organizer & Sync</button><button className="profile-action" onClick={() => openProfileOption('tags')}><Tags size={17} aria-hidden="true" />Tag Format</button><button className="profile-action" onClick={() => openProfileOption('tiles')}><LayoutGrid size={17} aria-hidden="true" />Customize Tiles</button></section>}</div></nav></header>
      <main className="bookshelf"><div className="shelf-intro"><div className="library-heading"><div><p className="eyebrow">YOUR OFFLINE LIBRARY</p><h1>The Bookshelf</h1><p className="muted">A quiet place for the stories you carry with you.</p></div><button className="primary" disabled={busy} onClick={() => picker.current?.click()}>＋ Import EPUB</button></div>
      <div className="shelf-summary"><span className="download-count">{available.length} {available.length === 1 ? 'work' : 'works'} downloaded</span><span className="reader-status-line"><span>{offlineReady ? '✓ Reader prepared for offline use' : import.meta.env.DEV ? 'Development mode · Build to prepare offline use' : 'Preparing offline application…'}</span><span className="reader-account-state">{readerOwner ? connection ? `${pending.length} pending reading updates` : 'Account Library' : 'Guest · Local Only'}</span></span><span className="storage-summary" aria-label="Storage Usage">{storage?.usage !== undefined ? <>{formatBytes(storage.usage)} used{storage.quota !== undefined && <> of {formatBytes(storage.quota)} browser allowance <InfoTooltip label="Browser Allowance Information" placement="bottom" description="If browser storage fills up, the reader opens Manage Local Storage so you can choose which downloaded EPUBs to remove. Nothing is deleted automatically. Removing a download keeps its bookshelf information, notes, reading history, completed chapters, reading position, and preferences saved in the reader. Existing cloud copies are also kept." /></>}</> : 'Storage estimate unavailable'} · {storage?.persistent === true ? 'Persistent storage granted' : storage?.persistent === false ? 'Storage may be cleared automatically' : 'Persistence status unavailable'}</span></div></div>
      {missingWork && <div className="notice">{handoffBook ? <>{handoffBook.hasFile ? 'This work is downloaded in this reader.' : readerOwner ? 'This work is saved in your reader cloud. Download it while online to read it offline.' : 'Import this EPUB again to read it.'}<button disabled={busy || !online && !handoffBook.hasFile && Boolean(readerOwner)} onClick={() => readBook(handoffBook)}>{handoffBook.hasFile ? 'Read EPUB' : readerOwner ? 'Download and Read' : 'Import EPUB'}</button></> : <>{/^\d+$/.test(missingWork) ? `AO3 work ${missingWork}` : 'This EPUB'} is not available in this reader installation. Import its EPUB to open it. No server lookup is required.</>}</div>}
      <BookshelfFilters books={books} filters={draftFilters.filters} onChange={filters => setDraftFilters({ ...draftFilters, filters })} query={draftFilters.query} onQuery={setQuery} appliedFilters={filters} appliedQuery={query} onApply={next => { setDraftFilters(next); setAppliedFilters(next) }} onRefresh={() => void attempt(() => refreshMetadata())} busy={busy} appearance={tagSettings.appearance} />
      <div className="results-toolbar"><span>{results.length} {results.length === 1 ? 'story' : 'stories'} on your shelf</span>{results.length > 0 && <Pagination inlinePage page={currentPage} pages={pages} total={results.length} size={shelfPageSize} onPage={setPage} />}<label>Sort By<select value={sort} onChange={e => setSort(e.target.value)}><option value="recent">Recently Imported</option><option value="title">Title</option>{numericFields.map(field => <option key={field.key} value={field.key}>{field.label} · Most First</option>)}{dateFields.filter(field => field.key !== 'imported').map(field => <option key={field.key} value={field.key}>{field.label} · Newest First</option>)}</select></label></div>
      {results.length ? <div className="story-grid">{visible.map(book => <ReaderTile key={book.id} organizerAccount={connection?.account} book={book} onMarking={(field, value) => updateMarking(book.id, field, value)} onProgress={progress => updateProgress(book.id, progress)} preferences={preferences} appearance={tagSettings.appearance} busy={busy} onRead={() => readBook(book)} onManage={()=>{setManaged(book.id);setModal('manage')}} onDetails={()=>viewDetails(book.id)} onRemove={()=>void removeLocalDownload(book)} onDelete={()=>void deleteVersion(book)} onSearch={query => { const next = { ...appliedFilters, query }; setDraftFilters(next); setAppliedFilters(next) }} onSeries={name=>viewFacet('series',name)} onAuthor={name=>viewFacet('author',name)} />)}</div> : <div className="empty-state"><div className="book-mark">▤</div><h2>{books.length ? 'No Matching Stories' : 'Make Yourself at Home'}</h2><p>{books.length ? 'Try another search or adjust your filters.' : 'Import an EPUB to begin your offline bookshelf. Your books and your place stay on this device.'}</p>{!books.length && <button className="primary" disabled={busy} onClick={() => picker.current?.click()}>Import Your First EPUB</button>}</div>}
      <footer className="app-footer"><span>Every story, a place to return to.</span><span>Metadata search · Local EPUB storage · Independent reader</span></footer></main>
    </>}
    <input hidden ref={picker} aria-label="Import EPUB File" type="file" accept=".epub,application/epub+zip" onChange={e => { const file = e.target.files?.[0]; if (file) void importFile(file); e.target.value = '' }} />
    {modal === 'calibre' && <CalibreTransfers onClose={() => setModal(undefined)} onRefresh={async()=>{await refresh();void sync()}} onError={reportError} />}
    {message && <div className="toast" role="status"><span>{message}</span><button aria-label="Dismiss Message" onClick={() => setMessage('')}>×</button></div>}
    {active?.resumeRequired && <Dialog title="Choose Where to Resume" onClose={() => setSelected(undefined)}><p>The previous reading location could not be matched reliably. Your history is retained. Choose a section to continue.</p><form onSubmit={e => { e.preventDefault(); const chapter = String(new FormData(e.currentTarget).get('chapter')); void attempt(async () => { await commit({ ...active, resumeRequired: false, position: { chapter, fraction: 0 } }, undefined, false); setSelected(undefined); requestAnimationFrame(() => setSelected(active.id)) }) }}><label>Resume At<select name="chapter">{active.chapters.map((c,i) => <option key={i} value={c.id}>{c.title}</option>)}</select></label><button className="primary">Resume Reading</button></form></Dialog>}
    {busy && <div className="busy-indicator" role="status">Saving…</div>}
    {candidate && previous && <Dialog title="Another EPUB Version" busy={busy} onClose={() => { setCandidate(undefined); setPrevious(undefined) }}><p>Current EPUB: {previous.chapters.length} sections. New EPUB: {candidate.chapters.length} sections. {candidate.chapters.filter(c => !previous.chapters.some(old => old.id === c.id)).length} new or changed sections detected.</p><p>Reliable chapter matches retain progress. Unmatched chapters require a resume choice. Organizer notes and history are preserved.</p><div className="dialog-actions"><button className="primary" onClick={() => void attempt(() => acceptImport(candidate, previous, true))}>Replace Current EPUB</button><button onClick={() => void attempt(() => acceptImport(candidate, previous))}>Keep Both Versions</button><button onClick={() => { setCandidate(undefined); setPrevious(undefined) }}>Cancel</button></div></Dialog>}
    {modal === 'connect' && <Dialog title="Connect Organizer" busy={busy} onClose={() => { setPairing(undefined); setModal(undefined) }}><p>Organizer sync connects automatically after sign-in. Use this form only to repair an existing connection with a dedicated legacy pairing code. Connecting never creates organizer entries.</p><form onSubmit={e => { e.preventDefault(); void connect(e.currentTarget) }}><label>Pairing Code<input name="secret" type="password" required defaultValue={pairing?.code ?? ''} autoComplete="off" /></label><label>Device Name (Optional)<input name="name" maxLength={80} placeholder="My Reader" /></label><button className="primary" disabled={busy}>Connect Organizer</button></form></Dialog>}
    {modal === 'sync' && <Dialog title="Organizer & Sync" onClose={() => setModal(undefined)}><p>{connection ? 'Organizer sync is connected to your shared account.' : 'Organizer sync connects automatically when you are signed in and online.'}</p><p>{pending.filter(p => p.account === connection?.account).length} reading updates waiting. Your cloud library and reading progress sync automatically while the app is open, when you return, and when you reconnect. Sync Now checks your full library. Choose which EPUBs to download for offline reading; sync does not download them automatically.</p><details><summary>Advanced Troubleshooting</summary><p>Background organizer refreshes check up to 50 EPUB versions per run, at least one minute apart. Sync Now checks all eligible versions. Local reading changes remain queued if a connection fails.</p><button onClick={() => setModal('connect')}>Enter Legacy Pairing Code</button>{connection && <><p>Reader Connection Credential</p><p>This installation credential grants access to organizer companion operations. Keep it private; automatic account restoration normally handles reconnection.</p><div className="copy-field"><label htmlFor="paired-reader-secret">Paired Reader Secret</label><div className="copy-field-control"><input id="paired-reader-secret" readOnly type="password" value={connection.secret} /><Tooltip description={<span role="status">{copiedSecret === connection.secret ? 'Copied' : 'Copy Paired Reader Secret'}</span>}>{descriptionId => <button type="button" className="copy-field-button" aria-label="Copy Paired Reader Secret" aria-describedby={descriptionId} onClick={event => void copyReaderSecret(event.currentTarget)}><Copy size={18} aria-hidden="true" /></button>}</Tooltip></div></div></> }<button onClick={() => setModal('account')}>Repair Organizer Connection</button>{connection && <button onClick={() => void attempt(async () => { await setting('organizer-disabled-here', true); setConnection(undefined); connectionRef.current = undefined; setModal(undefined); setMessage('Organizer sync paused on this device. Use Repair Organizer Connection in advanced troubleshooting to resume. Saved reading changes are retained.') })}>Disconnect Organizer</button>}</details>{pending.filter(p => p.account === connection?.account).map(p => <div className="pending-item" key={p.id}><strong>{books.find(b => b.id === p.book)?.metadata.title}</strong><p>{p.error || 'Waiting to synchronize.'}</p><p>Local changes and the original baseline remain saved. Review the organizer before discarding a conflicting update.</p><button onClick={() => void attempt(async () => { const result = await rpc(connection!, 'get', p.work); if (!result.entry) throw new Error('The organizer entry no longer exists.'); setReview({ pending: p, remote: result.entry }) })}>Review Changes</button><button onClick={() => { if (confirm('Discard this queued organizer update? Local reading history stays saved.')) void attempt(async () => { await transaction(['pending'], tx => tx.objectStore('pending').delete(p.id)); await refresh() }) }}>Discard Queued Update</button></div>)}<div className="dialog-actions organizer-sync-actions"><button className="primary" onClick={() => void sync(true)}>Sync Now</button></div></Dialog>}
    {review && <Dialog title="Review Reading Changes" busy={busy} onClose={() => setReview(undefined)}><p>Choose which update to send. Local reading history is retained with either choice. Later changes are checked again by the server.</p><dl>{Object.entries(review.pending.input).filter(([key]) => ['status','progress','notes'].includes(key)).map(([key,value]) => <div className="conflict-field" key={key}><dt>{{status:'Reading Status',progress:'Chapters Read',notes:'Personal Notes'}[key]}</dt><dd>Original: {describeOrganizerValue(key,review.pending.base[key as keyof typeof review.pending.base])}</dd><dd>Reader: {describeOrganizerValue(key,value)}</dd><dd>Organizer: {describeOrganizerValue(key,review.remote[key as keyof typeof review.remote])}</dd></div>)}</dl><div className="dialog-actions"><button onClick={() => void attempt(async () => { await transaction(['pending'], tx => tx.objectStore('pending').delete(review.pending.id)); await refresh(); setReview(undefined); void sync() })}>Use Organizer</button><button className="primary" onClick={() => void attempt(async () => { await transaction(['pending'], tx => tx.objectStore('pending').put({ ...review.pending, base: review.remote, input: { ...review.pending.input, version: review.remote.version, base: review.remote }, error: undefined })); setReview(undefined); void sync() })}>Use Reader</button></div></Dialog>}
    {(modal === 'storage'||modal==='details'&&detailsFromStorage) && <LocalStorageDialog cloud={Boolean(readerOwner)} books={books} storage={storage} full={storageFull} busy={busy} onClose={() => { setStorageFull(false); setModal(undefined) }} online={online} preferences={preferences} onDetails={id=>viewDetails(id,true)} onColumns={storageColumns=>updatePreferences({...preferences,storageColumns})} onSort={storageSort=>updatePreferences({...preferences,storageSort})} onDelete={books=>void deleteVersion(books)} onDownload={books=>void downloadSelection(books)} onRemove={books => void removeLocalDownload(books)} onPersist={() => void attempt(async () => { const granted = await navigator.storage?.persist?.(); await refreshStorage(); setMessage(granted ? 'Persistent storage granted.' : 'Persistent storage was not granted by this browser. Keep EPUB backups or verified cloud copies.') })} />}
    {modal === 'account' && <ReaderAccount onSync={() => sync(true)} conflicts={cloudConflicts} onStorageFull={reportError} onClose={() => setModal(undefined)} beforeSwitch={() => saving.current} onRefresh={async () => { const prefs = await loadSetting<Preferences>('preferences'); if (prefs) setPreferences(prefs); return refresh() }} />}
    {modal==='tiles'&&<TileSettings preferences={preferences} appearance={tagSettings.appearance} book={books[0]} onSave={async(layout,value)=>{const next={...preferences,tileLayouts:{...preferences.tileLayouts,[layout]:value}};await setting('preferences',next);setPreferences(next)}} onClose={()=>setModal(undefined)} />}
    {modal === 'tags' && <TagSettings appearance={tagSettings.appearance} connected={Boolean(connection)} linked={tagsLinked} loaded={tagSettings.loaded} error={tagSettings.error} onShape={shape => updatePreferences({ ...preferences, tagAppearance: { ...localTagAppearance, shape } })} onOrder={order => updatePreferences({ ...preferences, tagAppearance: { ...localTagAppearance, order } })} onColors={colors => updatePreferences({ ...preferences, tagAppearance: { ...localTagAppearance, colors } })} onLink={enabled => updatePreferences({ ...preferences, tagSyncAccount: enabled ? connection?.account : undefined })} onClose={() => setModal(undefined)} />}
    {modal === 'details' && manage && <WorkDetails book={manage} appearance={tagSettings.appearance} onClose={() => {setModal(detailsFromStorage?'storage':undefined);setDetailsFromStorage(false)}} />}
    {modal === 'manage' && manage && <Dialog title="Manage EPUB" busy={busy} onClose={() => setModal(undefined)}><h3>{manage.metadata.title}</h3><p>File version: {manage.id.slice(0,12)} · {manage.chapters.length} sections</p><p>Publication metadata saved {new Date(manage.metadataAt).toLocaleDateString()}. Offline completion uses this snapshot. Unknown or unmapped chapters never imply completion.</p><form onSubmit={e => { e.preventDefault(); const status = String(new FormData(e.currentTarget).get('status')) as Book['status']; void attempt(async () => { const event = await queueUpdate(manage, { status }); await commit({ ...manage, status }, event); setMessage('Reading status saved.') }) }}><label>Reading Status<select name="status" defaultValue={manage.status}>{Object.entries(statuses).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label><button>Save Reading Status</button></form><p>Author Notes are included in the EPUB content. Personal Notes below are separate.</p><form onSubmit={e => { e.preventDefault(); const notes = String(new FormData(e.currentTarget).get('notes')); void attempt(async () => { const event = await queueUpdate(manage, { notes }); await commit({ ...manage, notes }, event); setMessage('Personal notes saved.') }) }}><label>Personal Notes<textarea key={manage.id + manage.notes} name="notes" defaultValue={manage.notes} rows={5} /></label><button disabled={busy}>Save Personal Notes</button></form><form onSubmit={e => { e.preventDefault(); void link(manage, String(new FormData(e.currentTarget).get('url'))) }}><label>Link to Organizer Work<input name="url" type="url" required defaultValue={manage.workId ? `https://archiveofourown.org/works/${manage.workId}` : ''} placeholder="https://archiveofourown.org/works/123" /></label><button disabled={busy}>{manage.remote ? 'Refresh Organizer Link' : 'Confirm Work Link'}</button></form><div className="dialog-actions"><button onClick={() => { setReplaceTarget(manage.id); setModal(undefined); picker.current?.click() }}>Replace EPUB</button><button onClick={() => void attempt(async () => { await transaction(['books', 'catalog', 'settings'], tx => { for (const book of books.filter(b => b.workId && b.workId === manage.workId)) { const request = tx.objectStore('books').get(book.id); request.onsuccess = () => { if (request.result) putBook(tx, { ...request.result, active: book.id === manage.id }) } } }); await refresh(); void sync(); setMessage('Active version updated.') })}>Make Active Version</button><button onClick={() => void attempt(async () => { await updateProgress(manage.id, 0, true) })}>Begin Re-Reading</button><button className="danger" disabled={busy} onClick={() => void deleteVersion(manage)}>Delete EPUB</button>{manage.hasFile && <button className="danger" onClick={() => void removeLocalDownload(manage)}>Remove Download</button>}</div></Dialog>}
  </>
}
