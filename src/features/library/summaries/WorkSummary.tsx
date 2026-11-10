import { createElement, useId, useMemo, useState, type ReactNode } from 'react'
import { load } from 'cheerio'
import type { Metadata } from '../model'
import { useSummaryMode } from '../display/useDisplayPreference'
import { readSummary } from './summary'

export function WorkSummary({ metadata, fallback = '', tile = false }: { tile?: boolean; metadata: Pick<Metadata, 'summary' | 'summary_html'>; fallback?: string }) {
 const mode = useSummaryMode(), id = useId()
 const [disclosure, setDisclosure] = useState({ mode, expanded: mode !== 'collapsed' })
 const open = disclosure.mode === mode ? disclosure.expanded : mode !== 'collapsed'
 const formatted = useMemo(() => {
  if (typeof metadata.summary_html !== 'string') return null
  const sanitized = readSummary(metadata.summary_html)
  // A manual plain-text correction takes precedence over older automatic markup.
  if (sanitized.summary !== metadata.summary) return null
  const $ = load(sanitized.summary_html, undefined, false)
  function renderNodes(nodes: ReturnType<typeof $>): ReactNode[] {
   return nodes.toArray().map((node, key) => {
    if (node.type === 'text') return node.data
    if (node.type !== 'tag') return null
    const props = node.name === 'a' ? { href: node.attribs.href, target: node.attribs.target, rel: node.attribs.rel } : {}
    return createElement(node.name, { key, ...props }, ...renderNodes($(node).contents()))
   })
  }
  return renderNodes($.root().contents())
 }, [metadata.summary, metadata.summary_html])
 const content = formatted ? <div className="formatted-summary">{formatted}</div> : <>{metadata.summary || fallback}</>
 if (!tile || mode === 'full' || !metadata.summary) return content
 return <div className="summary-disclosure"><div id={id} className="summary-content" data-collapsed={!open}>{content}</div><button type="button" className="text-button" aria-expanded={open} aria-controls={id} onClick={() => setDisclosure({ mode, expanded: !open })}>{open ? 'Show Less' : 'Show More'}</button></div>
}
