import { parseSeriesUrl, seriesPageUrl } from '../../src/features/imports/urls.ts'
import { parseSeries } from '../../src/features/imports/ao3-series.ts'
import { retrieveAo3Document } from './adapter.ts'
export { parseSeries } from '../../src/features/imports/ao3-series.ts'

export async function retrieveSeries(url: string, fetcher: typeof fetch = fetch) {
 const identity = parseSeriesUrl(url)
 const result = await retrieveAo3Document(seriesPageUrl(url, identity.seriesId), next => parseSeriesUrl(next).seriesId === identity.seriesId, fetcher, false)
 if (!('html' in result)) return { preview: null, failure: result }
 return { preview: parseSeries(result.html, result.sourceUrl), failure: null }
}
