import { Fragment, useContext } from 'react'
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
export function ReaderTile({book,preferences,appearance,busy=false,cloud=false,onRead,onManage,onDetails,onRemove,onDelete,onSearch,onSeries}: {
 book:CatalogBook;preferences:Preferences;appearance:TagAppearance;busy?:boolean;cloud?:boolean;onRead:()=>void;onManage:()=>void;onDetails:()=>void;onRemove:()=>void;onDelete:()=>void;onSearch:(query:string)=>void;onSeries?:(name:string)=>void
}) {
 const editor=useContext(DisplayEditorContext),layout=useLayout(),metadata=book.metadata,series=seriesNames(metadata)
 const tags=(values:string[]|undefined,category?:'relationships'|'characters'|'warnings'|'collections')=><div className="tags"><MetadataTags values={values??[]} category={category} appearance={appearance} onTagClick={onSearch} /></div>
 const count=(value:number|null|undefined,label:string)=><span>{value?.toLocaleString()??'Unknown'} {label}</span>
 return <DisplayEditorContext value={editor??{preferences:readerTilePreferences(preferences,layout,appearance),groups:[],selected:null}}><article className="story-card">
  <div className="card-top"><h2><button className="title-button" onClick={book.hasFile?onRead:onDetails}>{metadata.title}</button>{'\u00a0'}<PublicationStatusIndicator portal status={metadata.publication_status} /></h2><div className="card-top-actions"><WorkMenu onDelete={onDelete} onViewDetails={onDetails} onRemoveDownload={book.hasFile?onRemove:undefined} /></div></div>
  <DisplayInfo group="workTile" lineClassName="work-facts">{{
   authors:<p className="byline">by {metadata.authors.join(', ')||'Unknown Author'}</p>,
   fandoms:<p className="work-fandoms">{metadata.fandoms.join(' · ')||'INDEPENDENT EPUB'}</p>,
   series:series.length ? <span>{series.map((name,index)=><Fragment key={name}>{index>0&&' · '}<button className="title-button series-link" onClick={()=>onSeries?.(name)}>{name}</button></Fragment>)}</span> : null,
   rating:<span>{metadata.rating||'Unrated'}</span>,words:count(metadata.word_count??book.wordCount,'words'),chapters:count(metadata.published_chapters??book.chapterCount,'chapters'),
   summary:<div className="summary"><WorkSummary metadata={metadata} fallback="Open this EPUB to start reading." /></div>,
   allTags:<WorkTags metadata={metadata} onSearch={onSearch} appearance={appearance} />,
   relationships:tags(metadata.relationship_tags,'relationships'),characters:tags(metadata.character_tags,'characters'),tags:tags(metadata.additional_tags),warnings:tags(metadata.archive_warnings,'warnings'),category:tags(metadata.categories),collections:tags(book.collections,'collections'),
   kudos:count(metadata.kudos,'kudos'),bookmarks:count(metadata.bookmark_count,'bookmarks'),comments:count(metadata.comment_count,'comments'),hits:count(metadata.hits,'hits'),
   reading:<span>{statuses[book.status]}</span>,saved:<span>Imported {new Date(book.importedAt).toLocaleDateString()}</span>,updated:<span>Updated {metadata.updated_at||'Unknown'}</span>,published:<span>Published {metadata.published_at||'Unknown'}</span>,language:<span>{metadata.language??metadata.language_code??'Unknown Language'}</span>,publication:<span>{metadata.publication_status}</span>,workId:<span>{book.workId||'No AO3 Work ID'}</span>,source:<p>{metadata.manual_url||'No Source Link'}</p>,
   progress:<div className="card-progress"><span>{statuses[book.status]}</span><span>{book.completedCount} chapters read</span><span className="availability">{book.hasFile?'✓ Downloaded':'Not Downloaded'}</span></div>,
  }}</DisplayInfo>
  <div className="card-actions"><button className="primary" disabled={busy} onClick={onRead}>{book.hasFile?`${book.position.fraction||book.completedCount?'Continue Reading':'Start Reading'} →`:cloud?'Download EPUB':'Import EPUB'}</button><button onClick={onManage}>Manage EPUB</button></div>{!book.active&&<small>Retained version · Organizer links open the active version</small>}
 </article></DisplayEditorContext>
}
