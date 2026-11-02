from calibre.customize import InterfaceActionBase


class ArchivesUnfoldedPlugin(InterfaceActionBase):
    name = 'archives unfolded'
    description = 'Send EPUBs to a paired archives unfolded reader library'
    supported_platforms = ['windows', 'osx', 'linux']
    author = 'Beyond the Archives'
    version = (1, 2, 0)
    minimum_calibre_version = (7, 0, 0)
    actual_plugin = 'calibre_plugins.archives_unfolded.ui:ArchivesUnfoldedAction'
