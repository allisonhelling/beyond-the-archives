import { blankMetadata, type Story } from './model'
import { librarySeries, type SeriesRecord } from './series'
const date = '2026-10-15T12:00:00Z'
const url = 'https://archiveofourown.org/works/12694770'
export const exampleWork: Story = {
  id: 'example-work', user_id: 'example', work_id: 'example-work', original_url: url,
  reading_status: 'reading', last_read_chapter: 0, personal_rating: null, notes: 'A favorite to return to on a rainy afternoon.', is_favorite: true, is_rec: false,
  metadata_overrides: {}, extension_metadata: {}, extension_chapters: {}, started_at: date, finished_at: null, last_update_notification_at: null, update_dismissed_at: null,
  created_at: date, updated_at: date, detailsLoaded: true, personalTags: ['Comfort Read'], collectionIds: [],
  metadata: { ...blankMetadata, title: 'Minimum Height Requirement', authors: ['Drag0nst0rm'], author_links: { Drag0nst0rm: 'https://archiveofourown.org/users/Drag0nst0rm/pseuds/Drag0nst0rm' }, fandoms: ['Batman - All Media Types', 'Batman (Comics)'], rating: 'Teen And Up Audiences', kudos: 18314, archive_warnings: ['Creator Chose Not To Use Archive Warnings'], categories: ['F/M', 'Gen'], summary: "Somewhere in the multiverse, there's a universe where letting his children dress up in capes and follow him into vigilantism seems like a good idea.\n\nBruce is determined that it isn't going to be this one . . . Despite his children's repeated attempts to convince him otherwise.\n\n(Or: \"When you're eighteen, you can do what you want. Until then, no capes.\")", word_count: 66463, published_chapters: 9, total_chapters: 9, publication_status: 'complete' , series: ['Childish Things'], series_memberships: [{ id: 901773, name: 'Childish Things', url: 'https://archiveofourown.org/series/901773', position: 1 }], relationship_tags: ['Dick Grayson & Bruce Wayne', 'Barbara Gordon/Dick Grayson', 'Jason Todd & Bruce Wayne', 'Tim Drake & Bruce Wayne', 'Stephanie Brown/Tim Drake', 'Bruce Wayne & Damian Wayne', 'Dick Grayson & Jason Todd & Tim Drake', 'Dick Grayson & Damian Wayne', 'Cassandra Cain & Bruce Wayne'], character_tags: ['Dick Grayson', 'Bruce Wayne', 'Barbara Gordon', 'Alfred Pennyworth', 'Jason Todd', 'Tim Drake', 'Stephanie Brown', 'Damian Wayne', 'Jim Gordon', 'Talia al Ghul', 'Clark Kent', 'Cassandra Cain'], additional_tags: ['Batfamily Feels', 'Bruce Wayne is a Good Dad', 'Batfamily', 'Alternate Universe', 'Humor', 'Angst', 'Fluff', 'Temporary Character Death', 'Canonical Character Death'], ao3_tags: [] },
  work: { id: 'example-work', ao3_work_id: 12694770, canonical_url: url, canonical_verified_at: date, title: null, summary: null, rating: null, language: 'en', word_count: 66463, published_chapters: 9, total_chapters: 9, is_complete: true, ao3_published_at: '2017-11-11T00:00:00Z', ao3_updated_at: '2017-12-06T00:00:00Z', last_metadata_check: date, last_metadata_success: date, metadata_source: 'manual', field_provenance: {}, automatic_metadata: {}, verified_chapters: {}, created_at: date, updated_at: date },
}
exampleWork.metadata.ao3_tags = [...exampleWork.metadata.archive_warnings!, ...exampleWork.metadata.categories!, ...exampleWork.metadata.relationship_tags!, ...exampleWork.metadata.character_tags!, ...exampleWork.metadata.additional_tags!]
const record: SeriesRecord = {
  id: 'example-series', user_id: 'example', ao3_series_id: 901773, notes: 'Read these stories in order.', is_favorite: true, is_rec: false, reading_status: 'reading', created_at: date, updated_at: date,
  metadata: { seriesId: 901773, title: 'Childish Things', normalizedUrl: 'https://archiveofourown.org/series/901773', description: "There are plenty of realities where Bruce's children follow him into the vigilante life from a young age.\nIn this reality, Bruce puts his foot down.", creators: ['Drag0nst0rm'], creatorLinks: { Drag0nst0rm: 'https://archiveofourown.org/users/Drag0nst0rm/pseuds/Drag0nst0rm' }, basic: false, begun: '2017-11-11', updated: '2017-12-25', wordCount: 67405, workCount: 2, complete: true, works: [] },
}
const secondWork: Story = {
  ...exampleWork, id: 'example-second-work', work_id: 'example-second-work', original_url: 'https://archiveofourown.org/works/13130229',
  metadata: {
    ...blankMetadata, title: 'Mix and Mingle', authors: ['Drag0nst0rm'], author_links: exampleWork.metadata.author_links,
    summary: 'Jason is very disappointed in himself.\n\nOr, rather, his alternate self.',
    rating: 'General Audiences', archive_warnings: ['Creator Chose Not To Use Archive Warnings'], categories: ['Gen'],
    fandoms: ['Batman - All Media Types'], relationship_tags: ['Jason Todd & Bruce Wayne'],
    character_tags: ['Jason Todd', 'Bruce Wayne', 'Dick Grayson', 'Damian Wayne', 'Tim Drake', 'Alfred Pennyworth'],
    additional_tags: ['Alternate Universe', 'Alternate Reality'],
    ao3_tags: ['Creator Chose Not To Use Archive Warnings', 'Gen', 'Jason Todd & Bruce Wayne', 'Jason Todd', 'Bruce Wayne', 'Dick Grayson', 'Damian Wayne', 'Tim Drake', 'Alfred Pennyworth', 'Alternate Universe', 'Alternate Reality'],
    kudos: 9385, word_count: 942, published_chapters: 1, total_chapters: 1, publication_status: 'complete',
    series: ['Childish Things'], series_memberships: [{ ...exampleWork.metadata.series_memberships![0], position: 2 }],
  },
  work: { ...exampleWork.work, id: 'example-second-work', ao3_work_id: 13130229, canonical_url: 'https://archiveofourown.org/works/13130229', word_count: 942, published_chapters: 1, total_chapters: 1, is_complete: true, ao3_published_at: '2017-12-25T00:00:00Z', ao3_updated_at: '2017-12-25T00:00:00Z' },
}
export const exampleSeries = librarySeries([exampleWork, secondWork], [record])[0]
