/** FanFicFare/EpubMerge layout: three works, five prose chapters, plus metadata. */
export function anthologyFiles() {
  const files = [
    { name: 'mimetype', content: 'application/epub+zip' },
    { name: 'META-INF/container.xml', content: '<container><rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>' },
  ]
  const manifest: string[] = [], spine: string[] = [], navigation: string[] = []
  for (const [index, count] of [3, 1, 1].entries()) {
    const workId = String(91001 + index), title = `Fic ${index + 1}`, base = `book${index}/`
    const titlePath = `${base}title_page.xhtml`
    const paths = [titlePath, ...Array.from({ length: count }, (_, n) => `${base}file${n + 1}.xhtml`), `${base}notes.xhtml`]
    files.push({ name: titlePath, content: `<html><body class="fff_titlepage"><h3><a href="https://archiveofourown.org/works/${workId}">${title}</a></h3><b>Author:</b>Writer ${index + 1}<br/><b>Chapters:</b>${count}/${count}<br/><b>Status:</b>Completed<br/></body></html>` })
    for (let n = 1; n <= count; n++) files.push({ name: paths[n], content: `<html><body><div class="chapter"><h2 class="title"><a href="https://archiveofourown.org/works/${workId}/chapters/${workId}${n}">Chapter ${n}: ${title} Part ${n}</a></h2><div class="userstuff"><p>Story prose for ${title} chapter ${n}.</p></div></div></body></html>` })
    files.push({ name: paths.at(-1)!, content: '<html><body><h2>Notes:</h2><p>Thank you for reading!</p></body></html>' })
    for (const [n, path] of paths.entries()) { manifest.push(`<item id="w${index}s${n}" href="${path}" media-type="application/xhtml+xml"/>`); spine.push(`<itemref idref="w${index}s${n}"/>`) }
    navigation.push(`<navPoint><navLabel><text>${title}</text></navLabel><content src="${titlePath}"/>${paths.slice(1).map((path, n) => `<navPoint><navLabel><text>Chapter ${n + 1}</text></navLabel><content src="${path}"/></navPoint>`).join('')}</navPoint>`)
  }
  files.push({ name: 'toc.ncx', content: `<ncx><navMap>${navigation.join('')}</navMap></ncx>` })
  files.push({ name: 'content.opf', content: `<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Three Fic Anthology</dc:title><dc:creator>Various Authors</dc:creator><dc:identifier>urn:anthology:test</dc:identifier></metadata><manifest><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>${manifest.join('')}</manifest><spine toc="ncx">${spine.join('')}</spine></package>` })
  return files
}
