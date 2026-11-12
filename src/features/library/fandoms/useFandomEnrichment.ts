import { useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { sampleMode } from '../../../lib/sample-mode'

/** Deferred independent work: page reads never wait for AO3 or this request. */
export function useFandomEnrichment(user: string, onChange: () => Promise<void>) {
 useEffect(() => {
  if (sampleMode || !supabase || user === 'sample') return
  let alive = true, timer: ReturnType<typeof setTimeout> | undefined
  async function tick() {
   if (!alive) return
   let delay = 60000
   if (!document.hidden && navigator.onLine) {
    try {
     const { data,error } = await supabase!.functions.invoke('tag-resolution',{body:{processFandoms:true}})
     if (!error && alive) {
      delay = Math.max(35000,Number(data?.retryAfterMs) || 60000)
      if (data?.classified) await onChange()
     }
    } catch { /* Enrichment failures do not block imports, browsing or saves. */ }
   }
   if (alive) timer = setTimeout(() => void tick(),delay)
  }
  timer = setTimeout(() => void tick(),5000)
  return () => { alive=false; clearTimeout(timer) }
 },[user,onChange])
}
