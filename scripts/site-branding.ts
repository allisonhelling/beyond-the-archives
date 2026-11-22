import type { Plugin } from 'vite'

export function siteBranding(name: string, tagline: string, { installedName = name, ...manifestOptions }: {
  installedName?: string
  background_color: string
  theme_color: string
  scope?: string
  icons?: { src: string; sizes: string; type: string; purpose: string }[]
}): Plugin {
  const manifest = JSON.stringify({ name: installedName, short_name: installedName, start_url: '/', display: 'standalone', ...manifestOptions })
  return {
    name: 'site-branding',
    configureServer(server) {
      server.middlewares.use('/manifest.webmanifest', (_request, response) => {
        response.setHeader('Content-Type', 'application/manifest+json')
        response.end(manifest)
      })
    },
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: manifest }) },
    transformIndexHtml: html => html.replaceAll('__SITE_NAME__', name).replaceAll('__SITE_SHORT_NAME__', installedName).replaceAll('__SITE_TAGLINE__', tagline),
  }
}
