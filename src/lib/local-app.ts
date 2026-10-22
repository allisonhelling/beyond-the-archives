export function isLocalHostname(hostname: string) {
 return ['localhost', '127.0.0.1', '[::1]'].includes(hostname)
}
export function isLocalApp() {
 return isLocalHostname(window.location.hostname)
}
