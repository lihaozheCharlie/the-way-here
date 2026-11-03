import Foundation
import TWHCore

/// Exercises the real AppModel wiring against ordinary files within the current
/// anonymous fixture. It never asks Foundation for an iCloud container URL.
@MainActor enum CloudConnectionSafetyVerification {
    static func run(on original: AppModel) async throws -> [String: Bool] {
        let env = ProcessInfo.processInfo.environment
        guard UXVerificationFixtures.enabled, env["TWH_UI_TEST_SCENARIO"] == "activation-safety",
              let fixture = env["TWH_UI_TEST_FIXTURE"], MobileProtocol.validID(fixture),
              original.acceptanceMode, original.cloudAcceptanceRun == nil, original.cloudRoot == nil else { throw MobileError.invalidPath }
        let files = FileManager.default, defaults = UserDefaults.standard
        let temporary = files.temporaryDirectory.standardizedFileURL.resolvingSymlinksInPath()
        let expected = temporary.appendingPathComponent("UIFixtures/" + fixture + "/Spaces")
        guard original.localRoot.standardizedFileURL.resolvingSymlinksInPath().path == expected.path,
              let originalActive = original.active, originalActive.cloud == nil else { throw MobileError.invalidPath }
        // No test-created path may traverse a link, including a broken link.
        var ancestor = temporary
        for part in ["UIFixtures", fixture, "Spaces"] {
            ancestor.appendPathComponent(part)
            guard (try? files.destinationOfSymbolicLink(atPath: ancestor.path)) == nil else { throw MobileError.invalidPath }
        }
        let nonce = UUID().uuidString.lowercased()
        let namePrefix = "Cloud " + String(nonce.prefix(16))
        let fakeCloud = expected.deletingLastPathComponent().appendingPathComponent("fake-cloud-" + nonce)
        let activeKey = original.activeSpacePreferenceKey
        let activeBefore = defaults.object(forKey: activeKey)
        let preferencePrefix = "acceptance.ui-" + fixture + "."
        let bindingKey = preferencePrefix + "sync.cloudBindings", detachedKey = preferencePrefix + "sync.detachedSpaces"
        let bindingsExisted = defaults.object(forKey: bindingKey) != nil, detachedExisted = defaults.object(forKey: detachedKey) != nil
        let bindingsBefore = defaults.dictionary(forKey: bindingKey) as? [String: String]
        let detachedBefore = defaults.stringArray(forKey: detachedKey)
        var owned = [String: URL]()
        func collect(_ worker: AppModel) {
            for space in worker.spaces where space.manifest.name.hasPrefix(namePrefix) && space.root.deletingLastPathComponent().path == original.localRoot.path {
                owned[space.id] = space.root
            }
        }
        func cleanup() -> Bool {
            var success = true
            for (id, root) in owned {
                guard MobileProtocol.validID(id), root.deletingLastPathComponent().path == original.localRoot.path,
                      root.lastPathComponent == id else { success = false; continue }
                if files.fileExists(atPath: root.path) { do { try files.removeItem(at: root) } catch { success = false } }
                for prefix in ["nickname.", "folder.", "sync.pendingSince.", "sync.lastCheckedAt.", "sync.notifyMacOnline."] { defaults.removeObject(forKey: prefix + id) }
                let ledger = expected.deletingLastPathComponent().appendingPathComponent("SyncLedgers/" + id + ".json")
                if files.fileExists(atPath: ledger.path) { do { try files.removeItem(at: ledger) } catch { success = false } }
            }
            if var bindings = defaults.dictionary(forKey: bindingKey) as? [String: String] {
                for id in owned.keys { bindings.removeValue(forKey: id) }
                if bindings.isEmpty && !bindingsExisted { defaults.removeObject(forKey: bindingKey) } else { defaults.set(bindings, forKey: bindingKey) }
            }
            if let detached = defaults.stringArray(forKey: detachedKey) {
                let retained = detached.filter { owned[$0] == nil }
                if retained.isEmpty && !detachedExisted { defaults.removeObject(forKey: detachedKey) } else { defaults.set(retained, forKey: detachedKey) }
            }
            if files.fileExists(atPath: fakeCloud.path) { do { try files.removeItem(at: fakeCloud) } catch { success = false } }
            if let activeBefore { defaults.set(activeBefore, forKey: activeKey) } else { defaults.removeObject(forKey: activeKey) }
            return success
        }
        defer { _ = cleanup() }
        func create(_ worker: AppModel, suffix: String, cloud: Bool) async throws -> AppModel.Space {
            defer { collect(worker) }
            worker.online = true
            try await worker.createSpace(name: namePrefix + suffix, nickname: "", cloud: cloud)
            guard let space = worker.active, space.manifest.name == namePrefix + suffix else { throw MobileError.invalidPath }
            return space
        }
        func newWorker() throws -> AppModel {
            let worker = AppModel()
            guard worker.localRoot.path == original.localRoot.path, worker.acceptanceMode, worker.cloudAcceptanceRun == nil else { throw MobileError.invalidPath }
            worker.cloudRoot = fakeCloud; worker.online = true
            return worker
        }
        // The ordinary file blocks directory creation. This is a real first
        // FileSync failure, without substituting the sync implementation.
        try Data("ANONYMOUS_CLOUD_BLOCKER".utf8).write(to: fakeCloud, options: .withoutOverwriting)
        let first = try newWorker()
        let linked = try await create(first, suffix: " linked", cloud: true)
        guard let firstStore = first.store else { throw MobileError.invalidPath }
        var checks: [String: Bool] = [
            "connection-first-upload-failed": first.latestSyncReport == nil && first.message != nil,
            "connection-intent-persisted-before-upload": (defaults.dictionary(forKey: bindingKey) as? [String: String])?[linked.id] == linked.root.lastPathComponent,
            "connection-first-remote-manifest-absent": !files.fileExists(atPath: fakeCloud.appendingPathComponent(linked.id + "/mobile-space.json").path)
        ]
        let body = "ANONYMOUS_CONNECTION_RESTART_BODY_" + nonce
        first.draftText = body; first.folder = "Anonymous connection"
        try await first.saveOriginal()
        guard let source = try await firstStore.documents().first(where: { $0.markdown.contains(body) }) else { throw MobileError.invalidPath }
        let originalBytes = try await firstStore.read(source.path)
        // Only remove the exact blocker created above, then replace it with a
        // normal directory. No real iCloud URL enters this test.
        guard try Data(contentsOf: fakeCloud) == Data("ANONYMOUS_CLOUD_BLOCKER".utf8) else { throw MobileError.invalidPath }
        try files.removeItem(at: fakeCloud); try files.createDirectory(at: fakeCloud, withIntermediateDirectories: false)
        let restarted = try newWorker()
        try await restarted.discover(presentPickerIfNeeded: false)
        guard let recovered = restarted.spaces.first(where: { $0.id == linked.id }) else { throw MobileError.invalidPath }
        checks["connection-discover-restores-unuploaded-target"] = recovered.cloud?.path == fakeCloud.appendingPathComponent(linked.root.lastPathComponent).path
        try await restarted.activate(recovered)
        let remoteManifest = fakeCloud.appendingPathComponent(linked.id + "/mobile-space.json")
        let uploadedManifest = try JSONDecoder().decode(SpaceManifest.self, from: Data(contentsOf: remoteManifest))
        checks["connection-restart-uploads-bound-manifest"] = restarted.active?.id == linked.id && uploadedManifest.id == linked.id && restarted.latestSyncReport != nil
        checks["connection-restart-uploads-exact-source"] = try Data(contentsOf: fakeCloud.appendingPathComponent(linked.id).appendingPathComponent(source.path)) == originalBytes

        let local = try await create(restarted, suffix: " local only", cloud: false)
        guard let localStore = restarted.store else { throw MobileError.invalidPath }
        let localPath = try await localStore.saveOriginal(text: "ANONYMOUS_LOCAL_ONLY_" + nonce, folder: "Anonymous connection")
        let localRemote = fakeCloud.appendingPathComponent(local.id)
        try files.createDirectory(at: localRemote, withIntermediateDirectories: false)
        // Even an old matching remote manifest must not override local-only.
        try MobileProtocol.encoder().encode(local.manifest).write(to: localRemote.appendingPathComponent("mobile-space.json"), options: .withoutOverwriting)
        try await restarted.activate(recovered)
        try await restarted.setCloudLinked(false)
        let unlinkedPath = try await firstStore.saveOriginal(text: "ANONYMOUS_AFTER_UNLINK_" + nonce, folder: "Anonymous connection")
        let final = try newWorker()
        try await final.discover(presentPickerIfNeeded: false)
        guard let localRecovered = final.spaces.first(where: { $0.id == local.id }), let unlinkedRecovered = final.spaces.first(where: { $0.id == linked.id }) else { throw MobileError.invalidPath }
        checks["connection-local-only-stays-local-with-remote-manifest"] = localRecovered.cloud == nil
        checks["connection-unlink-survives-remote-manifest"] = unlinkedRecovered.cloud == nil && files.fileExists(atPath: remoteManifest.path)
        try await final.activate(localRecovered)
        checks["connection-local-only-does-not-upload"] = !files.fileExists(atPath: localRemote.appendingPathComponent(localPath).path)
        try await final.activate(unlinkedRecovered)
        checks["connection-unlinked-new-source-does-not-upload"] = !files.fileExists(atPath: fakeCloud.appendingPathComponent(linked.id).appendingPathComponent(unlinkedPath).path)
        checks["connection-original-binding-untouched"] = original.active?.id == originalActive.id && original.active?.cloud == nil && original.cloudRoot == nil
        let cleaned = cleanup()
        let bindingsRestored = (defaults.dictionary(forKey: bindingKey) as? [String: String]) == bindingsBefore
        let detachedRestored = Set(defaults.stringArray(forKey: detachedKey) ?? []) == Set(detachedBefore ?? []) && (defaults.object(forKey: detachedKey) != nil) == detachedExisted
        checks["connection-fixture-cleaned-and-selection-restored"] = cleaned && bindingsRestored && detachedRestored && (defaults.string(forKey: activeKey) == (activeBefore as? String)) && !files.fileExists(atPath: fakeCloud.path) && owned.values.allSatisfy { !files.fileExists(atPath: $0.path) }
        return checks
    }
}
