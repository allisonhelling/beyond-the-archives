import { organizerAppUrl } from '../../src/lib/connected-login'
import { useContext } from 'react'
import { SeriesNames } from '../../src/features/library/series/SeriesNames'
import { AuthorNames } from '../../src/features/library/AuthorNames'
import { BulletSeparated } from '../../src/features/library/BulletSeparated'
import { CircleArrowDown, createLucideIcon } from 'lucide-react'
import { DisplayEditorContext } from '../../src/features/library/display/display-editor-context'
import { DisplayInfo } from '../../src/features/library/display/DisplayInfo'
import { MetadataTags } from '../../src/features/library/MetadataTags'
import { PublicationStatusIndicator } from '../../src/features/library/PublicationStatusIndicator'
import { WorkSummary } from '../../src/features/library/summaries/WorkSummary'
import type { TagAppearance } from '../../src/features/library/display/display-settings'
import { useLayout } from '../../src/lib/use-layout'
import { seriesNames } from './metadata'
import { readerTilePreferences } from './tile-layout'
import { statuses, type CatalogBook, type Preferences } from './model'
import { WorkMenu } from './WorkMenu'
import { WorkTags } from './WorkTags'
const CloudOutline = createLucideIcon('CloudOutline', [['path', { d: 'M6 18h12a4 4 0 0 0 1-7.87A5.5 5.5 0 0 0 8.5 8.1 2.75 2.75 0 0 0 4.5 10.2 4.05 4.05 0 0 0 6 18Z', key: 'outline' }]])
export function ReaderTile({book,preferences,appearance,busy=false,onRead,onManage,onDetails,onRemove,onDelete,onSearch,onSeries,onAuthor,organizerAccount}: { organizerAccount?: string;
 book:CatalogBook;preferences:Preferences;appearance:TagAppearance;busy?:boolean;onRead:()=>void;onManage:()=>void;onDetails:()=>void;onRemove:()=>void;onDelete:()=>void;onSearch:(query:string)=>void;onSeries?:(name:string)=>void;onAuthor?:(name:string)=>void
}) {
 const editor=useContext(DisplayEditorContext),layout=useLayout(),metadata=book.metadata,series=seriesNames(metadata)
 const tags=(values:string[]|undefined,category?:'relationships'|'characters'|'warnings'|'collections')=><div className="tags"><MetadataTags values={values??[]} category={category} appearance={appearance} onTagClick={onSearch} /></div>
 const chapterCount=metadata.published_chapters??book.chapterCount
 const count=(value:number|null|undefined,label:string)=><span>{value?.toLocaleString()??'Unknown'} {label}</span>
 return <DisplayEditorContext value={editor??{preferences:readerTilePreferences(preferences,layout,appearance),groups:[],selected:null}}><article className="story-card">
  <div className="card-top"><h2><button className="title-button" onClick={book.hasFile?onRead:onDetails}>{metadata.title}</button>{'\u00a0'}<PublicationStatusIndicator portal status={metadata.publication_status} /></h2><div className="card-top-actions"><WorkMenu organizerHref={organizerAccount && book.account === organizerAccount && book.organizerEntryId ? new URL(`/stories/${encodeURIComponent(book.organizerEntryId)}`, organizerAppUrl()).href : undefined} onDelete={onDelete} onViewDetails={onDetails} onRemoveDownload={book.hasFile?onRemove:undefined} /></div></div>
  <DisplayInfo group="workTile" lineClassName="work-facts">{{
   authors:<p className="byline">by {metadata.authors.length?<AuthorNames metadata={metadata} onSelect={name=>onAuthor?.(name)} />:'Unknown Author'}</p>,
   fandoms:<p className="work-fandoms">{metadata.fandoms.length?<BulletSeparated values={metadata.fandoms} />:'INDEPENDENT EPUB'}</p>,
   series:series.length ? <span><SeriesNames metadata={{...metadata,series}} onSelect={name=>onSeries?.(name)} /></span> : null,
   rating:<span>{metadata.rating||'Unrated'}</span>,words:count(metadata.word_count??book.wordCount,'words'),
   summary:<div className="summary"><WorkSummary metadata={metadata} fallback="Open this EPUB to start reading." /></div>,
   allTags:<WorkTags metadata={metadata} onSearch={onSearch} appearance={appearance} />,
   relationships:tags(metadata.relationship_tags,'relationships'),characters:tags(metadata.character_tags,'characters'),tags:tags(metadata.additional_tags),warnings:tags(metadata.archive_warnings,'warnings'),category:tags(metadata.categories),collections:tags(book.collections,'collections'),
   kudos:count(metadata.kudos,'kudos'),bookmarks:count(metadata.bookmark_count,'bookmarks'),comments:count(metadata.comment_count,'comments'),hits:count(metadata.hits,'hits'),
   reading:<span>{statuses[book.status]}</span>,saved:<span>Imported {new Date(book.importedAt).toLocaleDateString()}</span>,updated:<span>Updated {metadata.updated_at||'Unknown'}</span>,published:<span>Published {metadata.published_at||'Unknown'}</span>,language:<span>{metadata.language??metadata.language_code??'Unknown Language'}</span>,publication:<span>{metadata.publication_status}</span>,workId:<span>{book.workId||'No AO3 Work ID'}</span>,source:<p>{metadata.manual_url||'No Source Link'}</p>,
   progress:<div className="card-progress"><span>{statuses[book.status]}</span><span>{book.completedCount} {book.completedCount===1?'chapter':'chapters'} read / {chapterCount} {chapterCount===1?'chapter':'chapters'}</span><span className="availability">{book.hasFile?<CircleArrowDown size={14} aria-hidden="true" />:<CloudOutline size={16} strokeWidth={1.5} aria-hidden="true" />}{book.hasFile?'Downloaded':'Available In Cloud'}</span></div>,
  }}</DisplayInfo>
  <div className="card-actions"><button className="primary" disabled={busy} onClick={onRead}>{book.hasFile?`${book.position.fraction||book.completedCount?'Continue Reading':'Start Reading'} →`:'Download EPUB'}</button><button onClick={onManage}>Manage EPUB</button></div>{!book.active&&<small>Retained version · Organizer links open the active version</small>}
 </article></DisplayEditorContext>
}
