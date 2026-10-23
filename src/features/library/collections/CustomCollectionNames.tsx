import { useContext } from 'react'
import { DisplayEditorContext } from '../display/display-editor-context'
import { useLibrary } from '../LibraryProvider'
import { MetadataTags } from '../MetadataTags'
export function CustomCollectionNames({ ids }: { ids: string[] }) {
  const { collections } = useLibrary()
  const editor = useContext(DisplayEditorContext)
  const names = collections.filter(collection => !collection.default_key && ids.includes(collection.id)).map(collection => collection.name)
  return <MetadataTags values={names.length || !editor ? names : ['Example Collection']} category="collections" />
}
