import SwiftUI
import TWHCore
import Combine

/// The app's fail-closed branch for invalid acceptance flags. It never offers a
/// normal-space action and reports initialized state, without opening any files.
struct InvalidAcceptanceConfigurationView: View {
    @EnvironmentObject private var model: AppModel
    private var closed: Bool {
        model.invalidAcceptanceConfiguration && model.active == nil && model.store == nil && model.spaces.isEmpty && model.archivedSpaces.isEmpty && model.documents.isEmpty && model.drafts.isEmpty && model.photos.isEmpty && model.tasks.isEmpty && model.receipts.isEmpty && model.snapshot == nil && model.cloudRoot == nil && model.draftText.isEmpty && model.localRoot.path.contains("/InvalidAcceptance/")
    }
    var body: some View { VStack(alignment: .leading, spacing: 20) {
        Image(systemName: "lock.shield").font(.largeTitle).accessibilityHidden(true)
        Text("Acceptance configuration invalid").font(.title2.weight(.semibold)).accessibilityIdentifier("acceptance-invalid-title")
        Text("A valid, fresh test UUID is required. Restart with TWH_ICLOUD_TEST_RUN set to a UUID. No normal workspace can be opened from this diagnostic screen.")
        Text(closed ? "PASS fail-closed state" : "FAIL fail-closed state").font(.headline).foregroundStyle(closed ? .green : .red).accessibilityIdentifier("acceptance-invalid-state")
        Text("Real spaces, iCloud content, model credentials, and shared provider keys were not opened.").font(.footnote)
    }.padding(28).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading).background(Theme.canvas).accessibilityElement(children: .contain).accessibilityIdentifier("acceptance-fail-closed") }
}

private struct ActivationSafetyProof: Codable {
    var processToken: String
    var oldSpaceID: String
    var badSpaceID: String
    var oldSourcePath: String
    var oldSourceHash: String
    var oldDraftID: String
    var oldDraftText: String
    var oldFolder: String
    var badDraftHash: String
    var checks: [String: Bool]
    var complete: Bool
}

@MainActor private enum ActivationSafetyFixture {
    static let processToken = UUID().uuidString
    static let oldBody = "ANONYMOUS_ACTIVATION_OLD_BODY: a fictional walk beside an imaginary river."
    static let oldDraft = "ANONYMOUS_ACTIVATION_OLD_DRAFT: these words belong only to the original isolated test space."
    static let corruptBytes = Data("{ ANONYMOUS_CORRUPT_TARGET_DRAFT: deliberately invalid JSON".utf8)
    static let corruptPath = ".mobile/drafts/activation-corrupt.json"
    static func checkedRoot(_ model: AppModel, scenario: String = "activation-safety") throws -> URL {
        let env = ProcessInfo.processInfo.environment
        guard UXVerificationFixtures.enabled, env["TWH_UI_TEST_SCENARIO"] == scenario, let fixture = env["TWH_UI_TEST_FIXTURE"], MobileProtocol.validID(fixture), model.acceptanceMode, model.cloudAcceptanceRun == nil, model.cloudRoot == nil else { throw MobileError.unavailable("Anonymous activation verification requires explicit local-only UI-test flags.") }
        let temporary = FileManager.default.temporaryDirectory.standardizedFileURL.resolvingSymlinksInPath()
        var expected = temporary
        for component in ["UIFixtures", fixture, "Spaces"] {
            expected.appendPathComponent(component)
            guard (try? FileManager.default.destinationOfSymbolicLink(atPath: expected.path)) == nil else { throw MobileError.invalidPath }
        }
        guard model.localRoot.standardizedFileURL.resolvingSymlinksInPath().path == expected.path, let active = model.active, active.cloud == nil, !active.manifest.readOnly, active.root.standardizedFileURL.resolvingSymlinksInPath().path.hasPrefix(expected.path + "/") else { throw MobileError.unavailable("Anonymous activation verification refuses non-fixture spaces.") }
        return expected
    }
    static func ledgerURL(_ model: AppModel) throws -> URL {
        let root = try checkedRoot(model)
        let url = root.deletingLastPathComponent().appendingPathComponent("activation-safety-proof.json")
        guard (try? FileManager.default.destinationOfSymbolicLink(atPath: url.path)) == nil else { throw MobileError.invalidPath }
        return url
    }
    static func readProof(_ model: AppModel) throws -> ActivationSafetyProof? {
        let url = try ledgerURL(model)
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        guard (try? FileManager.default.destinationOfSymbolicLink(atPath: url.path)) == nil else { throw MobileError.invalidPath }
        return try JSONDecoder().decode(ActivationSafetyProof.self, from: Data(contentsOf: url))
    }
    static func targetHasNoOriginalContent(root: URL) throws -> Bool {
        guard let iterator = FileManager.default.enumerator(at: root, includingPropertiesForKeys: [.isRegularFileKey, .isSymbolicLinkKey]) else { return false }
        for case let file as URL in iterator {
            let values = try file.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
            guard values.isSymbolicLink != true else { return false }
            guard values.isRegularFile == true else { continue }
            let bytes = try Data(contentsOf: file)
            if bytes.range(of: Data(oldBody.utf8)) != nil || bytes.range(of: Data(oldDraft.utf8)) != nil { return false }
        }
        return true
    }
    static func run(_ model: AppModel) async throws -> ActivationSafetyProof {
        let root = try checkedRoot(model)
        guard let bound = model.boundSpace else { throw MobileError.unavailable("No anonymous original space is open.") }
        // Make the selected pending draft unambiguous on restart. Only this
        // scenario's fictional baseline drafts are touched.
        for var draft in try await bound.store.drafts() { draft.status = "discarded"; try await bound.store.saveDraft(draft) }
        let source = try await bound.store.importNamedSourceFile(data: Data(("# ANONYMOUS ACTIVATION ORIGINAL\n\n" + oldBody + "\n").utf8), filename: "Activation-original.md", folder: "Activation original")
        model.draftText = oldDraft; model.draftId = "activation-original-draft"; model.folder = "Activation original"
        try await model.saveDraft()
        guard await model.refresh(), model.active?.id == bound.manifest.id, let oldActive = model.active, let oldStore = model.store else { throw MobileError.unavailable("The anonymous original space could not be prepared.") }
        let oldDocuments = model.documents, oldDraftText = model.draftText, oldDraftID = model.draftId, oldFolder = model.folder
        let sourceHash = MobileProtocol.hash(try await oldStore.read(source))
        let badID = "activation-bad-" + UUID().uuidString.lowercased()
        let badRoot = root.appendingPathComponent(badID)
        try FileManager.default.createDirectory(at: badRoot, withIntermediateDirectories: true)
        let badManifest = SpaceManifest(id: badID, name: "Anonymous corrupt activation target")
        let badStore = try SpaceStore(root: badRoot, manifest: badManifest, deviceId: model.deviceId)
        try await badStore.initialize()
        let corrupt = try await badStore.url(corruptPath)
        try FileManager.default.createDirectory(at: corrupt.deletingLastPathComponent(), withIntermediateDirectories: true)
        try corruptBytes.write(to: corrupt, options: .withoutOverwriting)
        var parserRejected = false
        var parserError = ""
        do { _ = try await badStore.drafts() } catch let error as DecodingError { parserRejected = true; parserError = error.localizedDescription }
        let target = AppModel.Space(manifest: badManifest, root: badRoot, cloud: nil)
        model.spaces.append(target)
        var enteredTarget = false
        let observation = model.$active.sink { next in if next?.id == badID { enteredTarget = true } }
        defer { observation.cancel() }
        var activationThrew = false
        do { try await model.activate(target) } catch { activationThrew = true }
        observation.cancel()
        // These compare the actual in-memory rollback immediately after activate,
        // before a refresh or another write can repair or hide incorrect state.
        var checks: [String: Bool] = [
            "activation-threw": activationThrew,
            "bad-draft-parser-rejected": parserRejected,
            "target-entered-active": enteredTarget,
            "target-parser-error-surfaced": !parserError.isEmpty && model.error == parserError,
            "active-restored": model.active?.id == oldActive.id && model.active?.manifest == oldActive.manifest && model.active?.root == oldActive.root && model.active?.cloud == oldActive.cloud,
            "store-identity-restored": model.store.map { $0 === oldStore } ?? false,
            "documents-restored": model.documents == oldDocuments,
            "draft-text-restored": model.draftText == oldDraftText,
            "draft-id-restored": model.draftId == oldDraftID,
            "folder-restored": model.folder == oldFolder,
            "selected-space-persisted": UserDefaults.standard.string(forKey: model.activeSpacePreferenceKey) == oldActive.id
        ]
        model.error = nil
        // Exercise the normal post-failure save path; never replace it with a
        // direct write to the old store, which could conceal a stale binding.
        do { try await model.saveDraft(); checks["post-failure-save-succeeded"] = true } catch { checks["post-failure-save-succeeded"] = false }
        checks["target-has-no-old-content"] = try targetHasNoOriginalContent(root: badRoot)
        checks["target-corruption-preserved"] = try await badStore.read(corruptPath) == corruptBytes
        checks["old-body-preserved"] = MobileProtocol.hash(try await oldStore.read(source)) == sourceHash
        let persistedDraft = try await oldStore.drafts().first { $0.id == oldDraftID }
        checks["old-draft-persisted"] = persistedDraft?.text == oldDraftText && persistedDraft?.knowledgeBaseId == oldActive.id
        // Reproduce old Mac exports: different directories with one identity.
        // Discovery must reject the ambiguity before choosing or merging roots.
        let duplicateRoot = root.appendingPathComponent("activation-duplicate-" + UUID().uuidString.lowercased())
        let duplicateStore = try SpaceStore(root: duplicateRoot, manifest: oldActive.manifest, deviceId: model.deviceId)
        try await duplicateStore.initialize()
        do {
            var selectionRejected = false
            try await model.discover()
            checks["duplicate-discovery-quarantined"] = model.spaceRegistry.conflictingSpaceIDs.contains(oldActive.id) && !model.spaces.contains { $0.id == oldActive.id }
            let expectedBadRoot = badRoot.standardizedFileURL.resolvingSymlinksInPath().pathComponents
            checks["duplicate-valid-spaces-retained"] = model.spaces.contains { $0.id == badID && $0.root.standardizedFileURL.resolvingSymlinksInPath().pathComponents == expectedBadRoot }
            do { try await model.activate(AppModel.Space(manifest: oldActive.manifest, root: duplicateRoot, cloud: nil)) } catch { selectionRejected = true }
            checks["duplicate-activation-rejected"] = selectionRejected
            checks["duplicate-original-binding-preserved"] = model.active?.root == oldActive.root && model.store.map { $0 === oldStore } == true && model.draftId == oldDraftID && model.draftText == oldDraftText && model.spaces.filter { $0.id == oldActive.id }.allSatisfy { $0.root == oldActive.root }
            try await model.saveDraft()
            let duplicateDrafts = try await duplicateStore.drafts()
            let savedOriginal = try await oldStore.drafts().first { $0.id == oldDraftID }
            let preservedOriginalHash = MobileProtocol.hash(try await oldStore.read(source))
            checks["duplicate-post-failure-save-isolated"] = duplicateDrafts.isEmpty && savedOriginal?.text == oldDraftText && preservedOriginalHash == sourceHash
            try FileManager.default.removeItem(at: duplicateRoot)
            try await model.discover()
            checks["duplicate-cleared-after-fixture-cleanup"] = model.spaceRegistry.conflictingSpaceIDs.isEmpty
        } catch {
            try? FileManager.default.removeItem(at: duplicateRoot)
            throw error
        }
        checks.merge(try await CloudConnectionSafetyVerification.run(on: model)) { _, new in new }
        let proof = ActivationSafetyProof(processToken: processToken, oldSpaceID: oldActive.id, badSpaceID: badID, oldSourcePath: source, oldSourceHash: sourceHash, oldDraftID: oldDraftID, oldDraftText: oldDraftText, oldFolder: oldFolder, badDraftHash: MobileProtocol.hash(corruptBytes), checks: checks, complete: true)
        try MobileProtocol.encoder().encode(proof).write(to: try ledgerURL(model), options: .atomic)
        return proof
    }
    static func restartChecks(_ model: AppModel, proof: ActivationSafetyProof) async throws -> [String: Bool] {
        let root = try checkedRoot(model)
        guard MobileProtocol.validID(proof.oldSpaceID), MobileProtocol.validID(proof.badSpaceID), MobileProtocol.validPath(proof.oldSourcePath), let current = model.store else { throw MobileError.invalidPath }
        let badRoot = root.appendingPathComponent(proof.badSpaceID)
        let bad = try SpaceStore(root: badRoot, manifest: SpaceManifest(id: proof.badSpaceID, name: "Anonymous corrupt activation target"), deviceId: model.deviceId)
        let oldDraft = try await current.drafts().first { $0.id == proof.oldDraftID }
        return [
            "fresh-process": proof.processToken != processToken,
            "restart-active-original": model.active?.id == proof.oldSpaceID,
            "restart-store-original": current.manifest.id == proof.oldSpaceID,
            "restart-body-preserved": MobileProtocol.hash(try await current.read(proof.oldSourcePath)) == proof.oldSourceHash,
            "restart-documents-original": model.documents.contains { $0.path == proof.oldSourcePath && $0.markdown.contains(oldBody) } && !model.documents.contains { $0.path.hasPrefix(bad.manifest.sourcesPath + "/") },
            "restart-draft-text": model.draftText == proof.oldDraftText && oldDraft?.text == proof.oldDraftText,
            "restart-draft-id": model.draftId == proof.oldDraftID,
            "restart-folder": model.folder == proof.oldFolder,
            "restart-target-no-old-content": try targetHasNoOriginalContent(root: badRoot),
            "restart-target-corruption-preserved": MobileProtocol.hash(try await bad.read(corruptPath)) == proof.badDraftHash
        ]
    }
}

struct ActivationSafetyVerificationView: View {
    @EnvironmentObject private var model: AppModel
    @State private var proof: ActivationSafetyProof?
    @State private var restart: [String: Bool] = [:]
    @State private var running = false
    @State private var failure = ""
    var body: some View { List {
        Text("Anonymous activation rollback regression").font(.headline)
        Text("Only fictional records in the isolated local UI-test directory are used. No iCloud or provider Keychain calls are made.").font(.footnote)
        if let proof {
            let passed = proof.complete && proof.checks.values.allSatisfy { $0 }
            Text(passed ? "PASS activation rollback" : "FAIL activation rollback").accessibilityIdentifier("activation-rollback-result")
            ForEach(proof.checks.keys.sorted(), id: \.self) { key in Text((proof.checks[key] == true ? "PASS " : "FAIL ") + key).accessibilityIdentifier("activation-check-" + key) }
            Text(restart["fresh-process"] == false ? "Restart required for persistence verification" : !restart.isEmpty && restart.values.allSatisfy { $0 } ? "PASS restart isolation" : "FAIL restart isolation").accessibilityIdentifier("activation-restart-result")
            ForEach(restart.keys.sorted(), id: \.self) { key in Text((restart[key] == true ? "PASS " : "FAIL ") + key).accessibilityIdentifier("activation-check-" + key) }
        } else { Button(running ? "Running real activate…" : "Run real failed activation") { guard !running else { return }; running = true; Task { do { let result = try await ActivationSafetyFixture.run(model); proof = result; restart = try await ActivationSafetyFixture.restartChecks(model, proof: result) } catch { failure = error.localizedDescription }; running = false } }.disabled(running).accessibilityIdentifier("run-activation-rollback") }
        if !failure.isEmpty { Text(failure).foregroundStyle(.red).accessibilityIdentifier("activation-verification-error") }
    }.navigationTitle("Activation safety").accessibilityIdentifier("activation-safety-verification")
    .task {
        // activate deliberately tears down the destination during its attempt.
        // The restored view reads the persisted proof from the original fixture,
        // rather than relying on State from the discarded presentation.
        for _ in 0..<100 {
            do { if let saved = try ActivationSafetyFixture.readProof(model) { proof = saved; restart = try await ActivationSafetyFixture.restartChecks(model, proof: saved); return } } catch { failure = error.localizedDescription; return }
            do { try await Task.sleep(for: .milliseconds(200)); try Task.checkCancellation() } catch { return }
        }
    }
}
}

/// Seeds conflicting legacy directories and two independently bound libraries.
/// The test then uses the real space picker, onboarding and record reader.
@MainActor enum IdentityRecoveryFixture {
    static func configure(_ model: AppModel) async throws {
        let root = try ActivationSafetyFixture.checkedRoot(model, scenario: "identity-recovery")
        let marker = root.deletingLastPathComponent().appendingPathComponent("identity-recovery-ready.json")
        guard (try? FileManager.default.destinationOfSymbolicLink(atPath: marker.path)) == nil else { throw MobileError.invalidPath }
        model.selectedTab = 2
        if FileManager.default.fileExists(atPath: marker.path) { return }
        guard let original = model.active else { throw MobileError.invalidPath }
        var legacy = original.manifest; legacy.name = "Old conflict one"
        try MobileProtocol.encoder().encode(legacy).write(to: original.root.appendingPathComponent("mobile-space.json"), options: .atomic)
        var duplicate = legacy; duplicate.name = "Old conflict two"
        let duplicateStore = try SpaceStore(root: root.appendingPathComponent("legacy-" + UUID().uuidString.lowercased()), manifest: duplicate, deviceId: model.deviceId)
        try await duplicateStore.initialize()
        for recovered in [false, true] {
            let id = UUID().uuidString.lowercased()
            var manifest = SpaceManifest(id: id, name: recovered ? "Recovered independent copy" : "Independent other")
            // Mac exports preserve the original corpus paths while rebinding ID.
            manifest.sourcesPath = legacy.sourcesPath; manifest.wikiPath = legacy.wikiPath
            let store = try SpaceStore(root: root.appendingPathComponent("portable-" + id), manifest: manifest, deviceId: model.deviceId)
            try await store.initialize()
            let text = recovered ? "# RECOVERED INDEPENDENT NOTE\n\nOnly the explicitly selected independent copy is open." : "# OTHER INDEPENDENT NOTE\n\nThis separate fictional library must not be selected automatically."
            _ = try await store.importNamedSourceFile(data: Data(text.utf8), filename: recovered ? "Recovered.md" : "Other.md", folder: "Fictional recovery")
            try await store.writeJSON(["fixture": ProcessInfo.processInfo.environment["TWH_UI_TEST_FIXTURE"] ?? "", "scenario": "identity-recovery"], path: ".mobile/anonymous-ui-fixture.json")
        }
        try Data("Anonymous identity recovery fixture".utf8).write(to: marker, options: .withoutOverwriting)
        model.active = nil; model.store = nil; model.documents = []; model.sourceFolders = []; model.drafts = []; model.photos = []; model.tasks = []; model.receipts = []; model.snapshot = nil; model.macHeartbeat = nil; model.latestSyncReport = nil; model.draftText = ""; model.systemDestination = nil
        try await model.discover()
    }
}
