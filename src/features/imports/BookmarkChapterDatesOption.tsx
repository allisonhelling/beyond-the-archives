export function BookmarkChapterDatesOption({ checked, disabled, onChange, scan = false }: {
 checked: boolean; disabled: boolean; onChange: (checked: boolean) => void; scan?: boolean
}) {
 return <><label className="check-label"><input type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />Check chapter publication dates for bookmarks</label>
 <p className="field-help">Optional: estimate chapters read by comparing each chapter’s publication date with the bookmark date. Chapters published on the bookmark date or with missing dates remain unconfirmed. {scan ? 'Uses the scan tab to open eligible works’ Chapter Index pages at the selected request interval, so scans take longer. Existing reading progress is kept. Marked for Later and explicit list statuses other than Reading do not use this option.' : 'Metadata processing may open extra AO3 pages, so imports take longer. Existing progress is kept unless you choose Overwrite for that bookmark. Marked for Later does not use this option.'}</p></>
}
