import { supabase } from '../../lib/supabase'
import { sampleMode } from '../../lib/sample-mode'
import type { Json } from '../../types/database'
import type { SeriesPreview } from '../imports/urls'
import { conflictFromError, type EditValues } from './edit-merge'

export async function rememberSeries(preview: SeriesPreview) {
 const metadata = { ...preview, basic: false, fetchedAt: preview.fetchedAt ?? new Date().toISOString() }
 if (sampleMode) return (await import('./sample/repository')).rememberSampleSeries(metadata)
 if (!supabase) throw new Error('Database is not configured.')
 const { data, error } = await supabase.rpc('remember_library_series', { p_metadata: metadata as unknown as Json })
 if (error) throw new Error('Could not save series details. Apply the library series migration and try again.')
 return data!
}
/** Store identity only; never replace an existing full snapshot. */
export async function ensureSeries(series: Pick<SeriesPreview, 'seriesId' | 'title'>) {
 if (sampleMode) return (await import('./sample/repository')).ensureSampleSeries(series)
 if (!supabase) throw new Error('Database is not configured.')
 const { error } = await supabase.rpc('ensure_library_series', { p_series: series.seriesId, p_title: series.title })
 if (error) throw new Error('Could not save the series identity. Apply the latest migrations and try again.')
}
export async function removeSeriesDetails(seriesId: number) {
 if (sampleMode) return (await import('./sample/repository')).removeSampleSeriesDetails(seriesId)
 if (!supabase) throw new Error('Database is not configured.')
 const { error } = await supabase.rpc('remove_library_series_details', { p_series: seriesId })
 if (error) throw new Error('Could not remove downloaded series details. Try again.')
}
export async function saveSeriesNote(seriesId: number, notes: string, base: string): Promise<void> {
 if (sampleMode) return (await import('./sample/repository')).saveSampleSeriesNote(seriesId, notes, base)
 if (!supabase) throw new Error('Database is not configured.')
 const { error } = await supabase.rpc('save_library_series_note', { p_series: seriesId, p_notes: notes, p_base: base })
 const conflict = conflictFromError(error, (values, baseline) => saveSeriesNote(seriesId, String(values.notes ?? ''), String(baseline.notes ?? '')))
 if (conflict) throw conflict
 if (error) throw new Error('Could not save your series note. Your draft is retained; try again.')
}

export async function updateSeries(seriesId: number, values: EditValues, baseline: EditValues): Promise<void> {
 if (sampleMode) return (await import('./sample/repository')).updateSampleSeries(seriesId, values, baseline)
 if (!supabase) throw new Error('Database is not configured.')
 const { error } = await supabase.rpc('update_library_series', { p_series: seriesId, p_input: values, p_base: baseline })
 const conflict = conflictFromError(error, (next, base) => updateSeries(seriesId, next, base))
 if (conflict) throw conflict
 if (error) throw new Error('Could not save series changes. Your selections are retained; try again.')
}
export async function finishSeries(seriesId: number) {
 if (sampleMode) return (await import('./sample/repository')).finishSampleSeries(seriesId)
 if (!supabase) throw new Error('Database is not configured.')
 const { data, error } = await supabase.rpc('finish_library_series', { p_series: seriesId })
 if (error) throw new Error('Could not finish this series. No changes were saved; try again.')
 return data
}
