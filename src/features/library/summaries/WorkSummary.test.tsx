import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { WorkSummary } from './WorkSummary'
import { readSummary } from './summary'

it('preserves nested emphasis, paragraphs, line breaks, lists and AO3 links', () => {
 const metadata = readSummary('<p>Some <em>italic <strong>and bold</strong></em> text.<br>Next line.</p><ul><li>One</li><li>Two</li></ul><p><a href="/works/123">Original</a></p>')
 const { container } = render(<WorkSummary metadata={metadata} />)
 expect(metadata.summary).toBe('Some italic and bold text.\nNext line.\n\nOne\n\nTwo\n\nOriginal')
 expect(container.querySelector('em strong')).toHaveTextContent('and bold')
 expect(container.querySelectorAll('li')).toHaveLength(2)
 expect(container.querySelector('br')).not.toBeNull()
 expect(screen.getByRole('link', { name: 'Original' })).toHaveAttribute('href', 'https://archiveofourown.org/works/123')
})

it.each([
 '<p onclick="alert(1)">Safe <em style="color:red">text</em><img src="x" onerror="alert(1)"></p><script>alert(1)</script>',
 '<svg><script>alert(1)</script></svg><p>Safe <em>text</em></p>',
 '<math><mtext><img src=x onerror=alert(1)></mtext></math><p>Safe <em>text</em></p>',
 '<iframe srcdoc="<script>alert(1)</script>"></iframe><p>Safe <em>text</em></p>',
])('removes active content and untrusted attributes at render time: %s', html => {
 const metadata = { summary: 'Safe text', summary_html: html }
 const { container } = render(<WorkSummary metadata={metadata} />)
 expect(container).toHaveTextContent('Safe text')
 expect(container.querySelector('em')).toHaveTextContent('text')
 expect(container.querySelector('script, style, img, svg, math, iframe, [onclick], [onerror], [style]')).toBeNull()
})

it('preserves manual corrections and literal markup in plain summaries', () => {
 const { container, rerender } = render(<WorkSummary metadata={{ summary: 'My correction', summary_html: '<p>Original <em>summary</em></p>' }} />)
 expect(container).toHaveTextContent('My correction')
 expect(container.querySelector('em')).toBeNull()
 rerender(<WorkSummary metadata={{ summary: '<em>Literal text</em>' }} />)
 expect(container).toHaveTextContent('<em>Literal text</em>')
 expect(container.querySelector('em')).toBeNull()
})

it('removes unsafe link destinations while retaining their labels', () => {
 const metadata = readSummary('<p><a href="javascript:alert(1)">Bad</a> <a href="data:text/html,unsafe">Data</a> <a href="https://example.com">Good</a></p>')
 const { container } = render(<WorkSummary metadata={metadata} />)
 expect(screen.getByRole('link', { name: 'Good' })).toHaveAttribute('rel', 'noopener noreferrer')
 expect(container.querySelector('a[href^="javascript:"], a[href^="data:"]')).toBeNull()
 expect(container).toHaveTextContent('Bad Data Good')
})
