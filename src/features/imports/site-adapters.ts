/** Recognize the desktop route only. The URL is a candidate until the page supplies story evidence. */
export function isFanFictionStoryUrl(url: URL) {
 return ['https:', 'http:'].includes(url.protocol) && !url.port && !url.username && !url.password
  && ['fanfiction.net', 'www.fanfiction.net'].includes(url.hostname)
  && /^\/s\/[1-9]\d*(?:\/[1-9]\d*(?:\/[^/]+)?)?\/?$/.test(url.pathname)
}
