import type { Collection } from './model'

export function CollectionChoices({ collections, selected, onChange }: {
  collections: Collection[]; selected: string[]; onChange: (selected: string[]) => void
}) {
  return collections.filter(collection => !collection.default_key).map(collection => <label className="check-label" key={collection.id}>
    <input type="checkbox" checked={selected.includes(collection.id)} onChange={event => onChange(event.target.checked ? [...selected, collection.id] : selected.filter(id => id !== collection.id))} />
    {collection.name}
  </label>)
}
