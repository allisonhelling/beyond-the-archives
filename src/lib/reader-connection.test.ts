import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, expect, it, vi } from 'vitest'
import { consumeReaderPairing, enableOrganizerSync, hostedOrganizer, readerBaseUrl, readerPairingUrl } from './reader-connection'
const pairing = { ...hostedOrganizer, code: 'a'.repeat(64) }
afterEach(() => window.history.replaceState(null, '', '/'))
it('hands off a one-time code only in the fragment and scrubs it while preserving other URL state', () => {
  const url = new URL(readerPairingUrl(window.location.origin, pairing))
  expect(url.search).toBe('')
  url.searchParams.set('work', '123')
  window.history.replaceState(null, '', url)
  expect(consumeReaderPairing()).toEqual(pairing)
  expect(window.location.hash).toBe('')
  expect(window.location.search).toBe('?work=123')
  expect(consumeReaderPairing()).toBeUndefined()
})
it('removes invalid pairing payloads without accepting privileged keys or insecure backends', () => {
  for (const value of ['{', 'null', JSON.stringify({ ...pairing, key: 'sb_secret_bad' }), JSON.stringify({ ...pairing, url: 'http://example.com' }), JSON.stringify({ ...pairing, code: 'short' })]) {
    window.history.replaceState(null, '', `/#${new URLSearchParams({ readerPairing: value })}`)
    expect(consumeReaderPairing()).toBeUndefined()
    expect(window.location.hash).toBe('')
  }
})
it('permits HTTPS and local reader origins while rejecting unsafe destinations', () => {
  expect(readerBaseUrl('https://reader.example/?old=1#old').href).toBe('https://reader.example/')
  expect(readerBaseUrl('http://127.0.0.1:5174').origin).toBe('http://127.0.0.1:5174')
  for (const url of ['javascript:alert(1)', 'http://reader.example', 'https://user:pass@reader.example']) expect(() => readerBaseUrl(url)).toThrow()
})

it('keeps a pairing link in this tab through sign-in and expires it after five minutes',async()=>{
 const {deferReaderPairing,consumePendingReaderPairing}=await import('./reader-connection')
 deferReaderPairing(pairing)
 expect(consumePendingReaderPairing()).toEqual(pairing)
 expect(consumePendingReaderPairing()).toBeUndefined()
 deferReaderPairing(pairing)
 const stored=JSON.parse(sessionStorage.getItem('reader:pending-pairing')!)
 sessionStorage.setItem('reader:pending-pairing',JSON.stringify({...stored,expires:Date.now()-1}))
 expect(consumePendingReaderPairing()).toBeUndefined()
 expect(sessionStorage.getItem('reader:pending-pairing')).toBeNull()
})

function associationClient(user: object | null, error: object | null = null) {
  const rpc = vi.fn().mockResolvedValue({error})
  const client = {auth:{getUser:vi.fn().mockResolvedValue({data:{user},error:null})},rpc}
  return {client:client as unknown as SupabaseClient,rpc}
}
it('enables the shared association without registering a reader installation', async () => {
  const {client,rpc} = associationClient({email_confirmed_at:'2026-01-01',is_anonymous:false})
  await enableOrganizerSync(client)
  expect(rpc).toHaveBeenCalledExactlyOnceWith('reader_organizer_connection',{p_action:'enable'})
})
it('does not associate signed-out, unconfirmed, or anonymous users', async () => {
  for (const user of [null,{}, {email_confirmed_at:'2026-01-01',is_anonymous:true}]) {
    const {client,rpc} = associationClient(user)
    await expect(enableOrganizerSync(client)).rejects.toThrow('Confirm your email')
    expect(rpc).not.toHaveBeenCalled()
  }
})
it('preserves access-check failures instead of treating the account as connected', async () => {
  const {client} = associationClient({email_confirmed_at:'2026-01-01'},{message:'Reader account access required'})
  await expect(enableOrganizerSync(client)).rejects.toThrow('Reader account access required')
})
