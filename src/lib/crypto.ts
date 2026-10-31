/** Web Crypto helpers shared by browser applications and server handoffs. */
export async function sha256(value:string|ArrayBuffer):Promise<string> {
 const bytes=typeof value==='string'?new TextEncoder().encode(value):value
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('')
}
export function randomSecret():string {
 return crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','')
}
