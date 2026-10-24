import { createElement, useMemo, type ReactNode } from 'react'
import { load } from 'cheerio'
import type { Metadata } from '../model'
import { readSummary } from './summary'

export function WorkSummary({ metadata, fallback = '' }: { metadata: Pick<Metadata, 'summary' | 'summary_html'>; fallback?: string }) {
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
 return formatted
  ? <div className="formatted-summary">{formatted}</div>
  : <>{metadata.summary || fallback}</>
}
