import { ratingLabel } from '../../src/features/library/model'
import { countNoun } from '../../src/lib/count-noun'
import { isDisplayFieldHidden } from '../../src/features/library/display/display-settings'
import { LoadingIcon } from '../../src/components/ActivityIndicator'
import { PersonalToggleButton } from '../../src/features/library/FavoriteButton'
import { ChapterProgress } from '../../src/features/library/ChapterProgress'
import { organizerAppUrl } from '../../src/lib/connected-login'
import { useContext, type ReactNode } from 'react'
import { SeriesNames } from '../../src/features/library/series/SeriesNames'
import { AuthorNames } from '../../src/features/library/AuthorNames'
import { FandomTags } from '../../src/features/library/FandomTags'
import { CircleArrowDown, createLucideIcon } from 'lucide-react'
import { DisplayEditorContext } from '../../src/features/library/display/display-editor-context'
import { DisplayInfo } from '../../src/features/library/display/DisplayInfo'
import { MetadataTags } from '../../src/features/library/MetadataTags'
import { WorkTileHeader } from '../../src/features/library/WorkTileHeader'
import { WorkSummary } from '../../src/features/library/summaries/WorkSummary'
import type { TagAppearance } from '../../src/features/library/display/display-settings'
import { useLayout } from '../../src/lib/use-layout'
import { readerSeries, readerSourceSite } from './metadata'
import { readerTilePreferences } from './tile-layout'
import { isAnthology, statuses, type CatalogBook, type Preferences } from './model'
import { WorkMenu } from './WorkMenu'
import { WorkTags } from './WorkTags'
import { anthologyLabel, progressMetadata } from './anthology'
const CloudOutline = createLucideIcon('CloudOutline', [['path', { d: 'M6 18h12a4 4 0 0 0 1-7.87A5.5 5.5 0 0 0 8.5 8.1 2.75 2.75 0 0 0 4.5 10.2 4.05 4.05 0 0 0 6 18Z', key: 'outline' }]])
export function ReaderTile({collectionAction,book,preferences,appearance,busy=false,onRead,onManage,onDetails,onRemove,onDelete,onSearch,onSeries,onAuthor,onProgress,onMarking,organizerAccount}: { collectionAction?: ReactNode; onMarking: (field: 'favorite' | 'rec', value: boolean) => Promise<void>; onProgress: (progress: number) => Promise<void>; organizerAccount?: string;
 book:CatalogBook;preferences:Preferences;appearance:TagAppearance;busy?:boolean;onRead:()=>void;onManage:()=>void;onDetails:()=>void;onRemove:()=>void;onDelete:()=>void;onSearch:(query:string)=>void;onSeries?:(name:string)=>void;onAuthor?:(name:string)=>void
}) {
 const editor=useContext(DisplayEditorContext),layout=useLayout(),metadata=book.metadata,series=readerSeries(metadata)
 const tags=(values:string[]|undefined,category?:'relationships'|'characters'|'warnings'|'collections'|'categories')=><div className="story-facts"><MetadataTags values={values??[]} category={category} appearance={appearance} onTagClick={onSearch} /></div>
 const tilePreference = (editor?.preferences ?? readerTilePreferences(preferences,layout,appearance)).workTile
 const chapterCount=metadata.published_chapters??book.chapterCount
 const count=(value:number|null|undefined,label:string)=><span>{value?.toLocaleString()??'Unknown'} {countNoun(value, ({ words: 'word', bookmarks: 'bookmark', comments: 'comment', hits: 'hit' }[label] ?? label), label)}</span>
 return <DisplayEditorContext value={editor??{preferences:readerTilePreferences(preferences,layout,appearance),groups:[],selected:null}}><article className="story-card work-card" data-deleting={book.deleting || undefined} aria-busy={book.deleting || undefined}><div className="reader-tile-content" inert={book.deleting || undefined}>
  <WorkTileHeader status={metadata.publication_status} source={readerSourceSite(book)}>
    <DisplayInfo group="workTile" fields={['favorite', 'rec']}>{{
      favorite: <PersonalToggleButton kind="favorite" selected={Boolean(book.favorite)} disabled={busy} onChange={value => void onMarking('favorite', value)} />,
      rec: <PersonalToggleButton kind="rec" selected={Boolean(book.rec)} disabled={busy} onChange={value => void onMarking('rec', value)} />,
    }}</DisplayInfo>
    <WorkMenu
      markings={(['favorite','rec'] as const).filter(kind => isDisplayFieldHidden(tilePreference,kind)).map(kind => <PersonalToggleButton key={kind} menu kind={kind} selected={Boolean(book[kind])} disabled={busy} onChange={value => void onMarking(kind,value)} />)}
      organizerHref={organizerAccount && book.account === organizerAccount && book.organizerEntryId ? new URL(`/stories/${encodeURIComponent(book.organizerEntryId)}`, organizerAppUrl()).href : undefined}
      onDelete={onDelete}
      onViewDetails={onDetails}
      onRemoveDownload={book.hasFile?onRemove:undefined}
    />
  </WorkTileHeader>
  <h2><button className="title-button" onClick={book.hasFile?onRead:onDetails}>{metadata.title}</button></h2>
  {isAnthology(book) && <p className="anthology-summary">{anthologyLabel(book)}</p>}
  <DisplayInfo group="workTile" >{{
   authors:<p className="byline">By {metadata.authors.length?<AuthorNames metadata={metadata} onSelect={name=>onAuthor?.(name)} />:'Unknown Author'}</p>,
   fandoms:<p className="work-fandoms">{metadata.fandoms.length?<FandomTags values={metadata.fandoms} appearance={appearance} onSelect={onSearch} />:'INDEPENDENT EPUB'}</p>,
   series:series.series.length ? <span className="display-fact-value"><SeriesNames metadata={{...metadata,series:series.series}} positions={series.series_positions} onSelect={name=>onSeries?.(name)} /></span> : null,
   rating:<span className="display-fact-value">{ratingLabel(metadata.rating) || 'Rating unknown'}</span>,words:<span className="display-fact-value">{count(metadata.word_count??book.wordCount,'words')}</span>,
   summary:<><hr className="story-summary-divider" /><div className="story-summary"><WorkSummary tile metadata={metadata} fallback="Open this EPUB to start reading." /></div></>,
   allTags:<div className="story-facts"><WorkTags metadata={metadata} onSearch={onSearch} appearance={appearance} /></div>,
   relationships:tags(metadata.relationship_tags,'relationships'),characters:tags(metadata.character_tags,'characters'),tags:tags(metadata.additional_tags),warnings:tags(metadata.archive_warnings,'warnings'),category:tags(metadata.categories,'categories'),collections:tags(book.collections,'collections'),
   kudos:count(metadata.kudos,'kudos'),bookmarks:count(metadata.bookmark_count,'bookmarks'),comments:count(metadata.comment_count,'comments'),hits:count(metadata.hits,'hits'),
   reading:<span>{statuses[book.status]}</span>,saved:<span>Imported {new Date(book.importedAt).toLocaleDateString()}</span>,updated:<span>Updated {metadata.updated_at||'Unknown'}</span>,published:<span>Published {metadata.published_at||'Unknown'}</span>,language:<span>{metadata.language??metadata.language_code??'Unknown Language'}</span>,publication:<span>{metadata.publication_status}</span>,workId:<span>{book.workId||'No AO3 Work ID'}</span>,source:<p>{metadata.manual_url||'No Source Link'}</p>,
   progress:<div className="card-progress"><span>{statuses[book.status]}</span><ChapterProgress label={isAnthology(book) ? 'Anthology Chapters' : 'Chapter'} status={book.status} progress={book.completedCount} metadata={{ ...progressMetadata(book), published_chapters: chapterCount }} disabled={busy} onSave={onProgress} /><span className="availability">{book.hasFile?<CircleArrowDown size={14} aria-hidden="true" />:<CloudOutline size={16} strokeWidth={1.5} aria-hidden="true" />}{book.hasFile?'Downloaded':'In Cloud'}</span></div>,
  }}</DisplayInfo>
  <div className="card-actions"><button className="primary" disabled={busy} onClick={onRead}>{book.hasFile?`${book.position.fraction||book.completedCount?'Continue Reading':'Start Reading'} →`:'Download EPUB'}</button><button onClick={onManage}>Manage EPUB</button>{collectionAction}</div>{!book.active&&<small>Retained version · Organizer links open the active version</small>}
 </div>{book.deleting && <p className="deletion-status" role="status"><LoadingIcon />Deleting</p>}</article></DisplayEditorContext>
}
