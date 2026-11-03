import Foundation

/// Metadata discovery is needed before iCloud placeholder files have downloaded.
/// Reading only local directory entries can otherwise mistake a new device for
/// an empty account and create another space.
@MainActor final class CloudDirectoryObserver {
    private let query = NSMetadataQuery()
    private var observers: [NSObjectProtocol] = []
    private let root: URL
    private let changed: () -> Void
    init(root: URL, changed: @escaping () -> Void) {
        self.root = root.standardizedFileURL
        self.changed = changed
        query.searchScopes = [NSMetadataQueryUbiquitousDocumentsScope]
        query.predicate = NSPredicate(format: "%K == %@ AND %K BEGINSWITH %@", NSMetadataItemFSNameKey, "mobile-space.json", NSMetadataItemPathKey, self.root.path + "/")
        for name in [Notification.Name.NSMetadataQueryDidFinishGathering, Notification.Name.NSMetadataQueryDidUpdate] {
            observers.append(NotificationCenter.default.addObserver(forName: name, object: query, queue: .main) { [weak self] _ in Task { @MainActor in self?.update() } })
        }
        query.start()
    }
    private func update() {
        query.disableUpdates(); defer { query.enableUpdates() }
        for result in query.results {
            guard let item = result as? NSMetadataItem, let url = item.value(forAttribute: NSMetadataItemURLKey) as? URL, url.standardizedFileURL.path.hasPrefix(root.path + "/") else { continue }
            try? FileManager.default.startDownloadingUbiquitousItem(at: url)
        }
        changed()
    }
    deinit { query.stop(); for observer in observers { NotificationCenter.default.removeObserver(observer) } }
}
