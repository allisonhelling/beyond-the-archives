from calibre.customize import InterfaceActionBase

PLUGIN_ID = 'archives unfolded'  # Keep installed plugin and toolbar registrations.
READER_NAME = 'bta reader'


class ArchivesUnfoldedPlugin(InterfaceActionBase):
    name = PLUGIN_ID
    description = f'Send EPUBs to a paired {READER_NAME} library'
    supported_platforms = ['windows', 'osx', 'linux']
    author = 'Beyond the Archives'
    version = (1, 3, 0)
    minimum_calibre_version = (7, 0, 0)
    actual_plugin = 'calibre_plugins.archives_unfolded.ui:ArchivesUnfoldedAction'
