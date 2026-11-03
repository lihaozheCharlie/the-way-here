import SwiftUI
import TWHCore
import LocalAuthentication
import Network
import UserNotifications
import WidgetKit
import BackgroundTasks

struct BoundSpace: Sendable {
    let store: SpaceStore
    let manifest: SpaceManifest
    let deviceId: String
    let folder: String
    @discardableResult func enqueue(_ kind: TaskKind, text: String, paths: [String] = [], context: String? = nil, options: [String: String] = [:]) async throws -> TaskRequest {
        // Older links and restored view state must never recreate a Mac job.
        throw MobileError.unavailable("手机仅保存输入与展示已有内容，此操作不再提供。")
    }
}
@MainActor final class AppModel: ObservableObject {
    struct Space: Identifiable { var id: String { manifest.id }; var manifest: SpaceManifest; var root: URL; var cloud: URL? }
    @Published var spaces: [Space] = []
    @Published var archivedSpaces: [Space] = []
    private(set) var spaceRegistry = SpaceDiscoveryRegistry()
    private var pendingAcceptanceURL: URL?
    @Published var systemDestination: SystemDestination? { didSet { if systemDestination != nil { presented = nil } } }
    @Published var latestSyncReport: SyncReport?
    @Published var macHeartbeat: MacHeartbeat?
    @Published var active: Space?
    @Published var documents: [TWHCore.Document] = []
    @Published var sourceFolders: [String] = []
    @Published var readingPreferencesVersion = 0
    @Published var drafts: [Draft] = []
    @Published var photos: [PhotoDraft] = []
    @Published var tasks: [TaskRequest] = []
    @Published var receipts: [TaskReceipt] = []
    @Published var snapshot: MobileSnapshot?
    @Published var error: String?
    @Published var message: String?
    @Published var syncing = false
    @Published var syncCompleted = 0
    @Published var syncTotal = 0
    @Published var syncStatus: LocalizedStringKey = "仅保存在本机"
    @Published var online = true
    @Published private(set) var phoneModelAvailable = false
    @Published var wifi = false
    @Published var locked = false
    @Published var presented: Modal? { didSet { if presented != nil { systemDestination = nil } } }
    @Published var selectedTab = 0
    @Published var draftText = ""
    @Published var folder = "随手记"
    @Published var draftId = UUID().uuidString.lowercased()
    struct RecordingUndo { var bound: BoundSpace; var draftId: String; var text: String; var expires: Date }
    @Published var recordingUndo: RecordingUndo?
    @Published var onboarding = !UserDefaults.standard.bool(forKey: "onboarding.complete")
    var store: SpaceStore?
    var boundSpace: BoundSpace? { guard let store, let active else { return nil }; return BoundSpace(store: store, manifest: active.manifest, deviceId: deviceId, folder: folder) }
    var macOnline: Bool { macHeartbeat?.online ?? false }
    var compatibility: MacCompatibility? { snapshot.map { MacCompatibility(version:$0.macVersion,protocolVersion:$0.protocolVersion,capabilities:$0.capabilities) } }
    var companionshipDays: Int { guard active?.manifest.readOnly != true, let value = snapshot?.companionshipStartedAt ?? active?.manifest.createdAt, let date = MobileProtocol.date(value) else { return 1 }; return max(1, (Calendar.current.dateComponents([.day], from: Calendar.current.startOfDay(for: date), to: Calendar.current.startOfDay(for: Date())).day ?? 0) + 1) }
    var invalidAcceptanceConfiguration: Bool {
        let env = ProcessInfo.processInfo.environment
        return CommandLine.arguments.contains("--icloud-acceptance") && env["TWH_ICLOUD_TEST_RUN"].flatMap(UUID.init(uuidString:)) == nil || CommandLine.arguments.contains("--uitest") && env["TWH_UI_TEST_FIXTURE"].map(MobileProtocol.validID) != true
    }
    var acceptanceMode: Bool { CommandLine.arguments.contains("--uitest") || CommandLine.arguments.contains("--icloud-acceptance") }
    var activeSpacePreferenceKey: String {
        guard acceptanceMode else { return "active.space" }
        return "acceptance.active.space." + (cloudAcceptanceRun ?? ProcessInfo.processInfo.environment["TWH_UI_TEST_FIXTURE"] ?? "invalid")
    }
    private var cloudConnectionPreferences: CloudConnectionPreferences {
        let namespace: String?
        if acceptanceMode {
            namespace = cloudAcceptanceRun.map { "icloud-" + $0 } ?? "ui-" + (ProcessInfo.processInfo.environment["TWH_UI_TEST_FIXTURE"] ?? "invalid")
        } else { namespace = nil }
        return CloudConnectionPreferences(namespace: namespace)
    }
    var cloudAcceptanceRun: String? {
        guard CommandLine.arguments.contains("--icloud-acceptance"), let run = ProcessInfo.processInfo.environment["TWH_ICLOUD_TEST_RUN"], UUID(uuidString:run) != nil else { return nil }
        return run.lowercased()
    }
    let deviceId: String
    let localRoot: URL
    var cloudRoot: URL?
    private let monitor = NWPathMonitor()
    var notified: Set<String>
    private var backgroundAt: Date?
    private var syncEngines: [String: FileSync] = [:]
    private var activating = false
    private var bootstrapping = false
    private var refreshing: Set<String> = []
    private var syncTasks: [String: Task<SyncReport, Error>] = [:]
    private var cloudObserver: CloudDirectoryObserver?
    enum Modal: String, Identifiable { case recording, writing, photos, history, spaces, settings, search, tasks, folder, newSpace, permissions, letters, future, cloudConnection, importMaterials; var id: String { rawValue } }
    init() {
        let defaults = UserDefaults.standard
        let testing = CommandLine.arguments.contains("--uitest") || CommandLine.arguments.contains("--icloud-acceptance")
        if testing { let run = ProcessInfo.processInfo.environment["TWH_ICLOUD_TEST_RUN"] ?? ProcessInfo.processInfo.environment["TWH_UI_TEST_FIXTURE"] ?? "invalid"; deviceId = "acceptance-" + String(MobileProtocol.hash(Data(run.utf8)).prefix(32)) }
        else { deviceId = defaults.string(forKey:"device.id") ?? UUID().uuidString.lowercased(); defaults.set(deviceId,forKey:"device.id") }
        notified = Set(defaults.stringArray(forKey: "notified.tasks") ?? [])
        if CommandLine.arguments.contains("--uitest"), let id = ProcessInfo.processInfo.environment["TWH_UI_TEST_FIXTURE"], MobileProtocol.validID(id) { localRoot = FileManager.default.temporaryDirectory.appendingPathComponent("UIFixtures/\(id)/Spaces") }
        else if CommandLine.arguments.contains("--icloud-acceptance"), let run = ProcessInfo.processInfo.environment["TWH_ICLOUD_TEST_RUN"], UUID(uuidString:run) != nil { localRoot = FileManager.default.temporaryDirectory.appendingPathComponent("CloudAcceptance/" + run.lowercased() + "/Spaces") }
        else if CommandLine.arguments.contains("--uitest") || CommandLine.arguments.contains("--icloud-acceptance") { localRoot = FileManager.default.temporaryDirectory.appendingPathComponent("InvalidAcceptance/" + UUID().uuidString.lowercased()) }
        else { localRoot = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.com.thewayhere.shared")?.appendingPathComponent("Spaces") ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Spaces") }
        monitor.pathUpdateHandler = { [weak self] path in Task { @MainActor in self?.online = path.status == .satisfied; self?.wifi = path.usesInterfaceType(.wifi); self?.refreshPhoneModelAvailability() } }
        monitor.start(queue: DispatchQueue(label: "twh.reachability"))
        if defaults.bool(forKey: "privacy.lock") { locked = true }
        refreshPhoneModelAvailability()
    }
    func refreshPhoneModelAvailability() {
        let defaults = UserDefaults.standard
        // Match the settings default while preserving an explicit false, even
        // when it comes from the launch-argument domain during verification.
        let enabled = defaults.object(forKey: "model.direct") == nil || defaults.bool(forKey: "model.direct")
        guard !invalidAcceptanceConfiguration, online, enabled, let preset = selectedPreset() else { phoneModelAvailable = false; return }
        phoneModelAvailable = ((try? CloudKeychain.read(preset.id)) ?? "").isEmpty == false
    }
    deinit { monitor.cancel() }
    func perform(_ operation: @escaping () async throws -> Void) { Task { do { try await operation() } catch { self.error = error.localizedDescription } } }
    func bootstrap() async {
        guard !invalidAcceptanceConfiguration else { error = "Acceptance configuration is invalid. Real spaces were not opened."; return }
        guard !locked, !bootstrapping else { return }; bootstrapping = true; defer { bootstrapping = false }
        do {
            try FileManager.default.createDirectory(at: localRoot, withIntermediateDirectories: true)
            // Container discovery may block on the OS; keep it off the main actor.
            if CommandLine.arguments.contains("--uitest") { cloudRoot = nil }
            else { cloudRoot = await Task.detached { FileManager.default.url(forUbiquityContainerIdentifier: "iCloud.com.thewayhere.shared")?.appendingPathComponent("Documents/Spaces") }.value }
            if let run = cloudAcceptanceRun, let container = cloudRoot?.deletingLastPathComponent() {
                cloudRoot = container.appendingPathComponent("AcceptanceTests/" + run + "/Spaces")
            }
            if let cloudRoot { try FileManager.default.createDirectory(at: cloudRoot, withIntermediateDirectories: true) }
            if let cloudRoot, cloudObserver == nil { cloudObserver = CloudDirectoryObserver(root:cloudRoot) { [weak self] in guard let self else { return }; self.perform { try await self.discover() } } }
            try await discover(presentPickerIfNeeded: false)
            if active == nil, !spaceRegistry.conflictingSpaceIDs.isEmpty {
                guard let saved = UserDefaults.standard.string(forKey: activeSpacePreferenceKey), let selected = spaces.first(where: { $0.id == saved }) else { presented = .spaces; return }
                try await activate(selected)
            }
            if spaces.isEmpty && onboarding { return }
            if spaces.isEmpty { try await createSpace(name: "我的空间", nickname: "", cloud: cloudRoot != nil) }
            else if active == nil { try await activate(spaces.first(where: { $0.id == UserDefaults.standard.string(forKey: activeSpacePreferenceKey) }) ?? spaces[0]) }
            if !locked { await refresh(); try await UXVerificationFixtures.install(on:self); refreshPhoneModelAvailability() }
        } catch { self.error = error.localizedDescription }
    }
    func discover(presentPickerIfNeeded: Bool = true) async throws {
        var found: [String: Space] = [:]
        var registry = SpaceDiscoveryRegistry()
        var candidates: [(root: URL, directory: URL, manifest: SpaceManifest)] = []
        for root in [localRoot, cloudRoot].compactMap({ $0 }) {
            guard FileManager.default.fileExists(atPath: root.path) else { continue }
            for directory in try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: [.isDirectoryKey]) {
                let file = directory.appendingPathComponent("mobile-space.json")
                guard FileManager.default.fileExists(atPath: file.path) else { continue }
                let manifest = try JSONDecoder().decode(SpaceManifest.self, from: Data(contentsOf: file)); try manifest.validate()
                try registry.register(manifest, directory: directory.lastPathComponent)
                candidates.append((root, directory, manifest))
            }
        }
        spaceRegistry = registry
        for candidate in candidates {
            let (root, directory, manifest) = candidate
            guard !registry.conflictingSpaceIDs.contains(manifest.id) else { continue }
            let local = localRoot.appendingPathComponent(directory.lastPathComponent)
            try FileManager.default.createDirectory(at: local, withIntermediateDirectories: true)
            let cloud = try cloudConnectionPreferences.destination(spaceID: manifest.id, directory: directory.lastPathComponent, cloudRoot: cloudRoot, hasCloudManifest: root == cloudRoot || found[manifest.id]?.cloud != nil)
            found[manifest.id] = Space(manifest: manifest, root: local, cloud: cloud)
        }
        var available: [Space] = [], archived: [Space] = []
        for space in found.values {
            let storage = try SpaceStore(root:space.root,manifest:space.manifest,deviceId:deviceId)
            var events = try await storage.lifecycleEvents()
            if let cloud = space.cloud {
                let remote = try SpaceStore(root:cloud,manifest:space.manifest,deviceId:deviceId)
                let remoteEvents = try await remote.lifecycleEvents()
                for event in remoteEvents where event.knowledgeBaseId == space.id && MobileProtocol.validID(event.id) {
                    let relative = ".mobile/space-events/" + event.id + ".json"
                    if !FileManager.default.fileExists(atPath:space.root.appendingPathComponent(relative).path) { try await storage.writeJSON(event,path:relative,exclusive:true) }
                }
                events += remoteEvents
            }
            let state = SpaceLifecycleState.reduce(events,space:space.id)
            if state.archived { if state.canRestore { archived.append(space) } } else { available.append(space) }
        }
        spaces = available.sorted { $0.manifest.name < $1.manifest.name }; archivedSpaces = archived.sorted { $0.manifest.name < $1.manifest.name }
        if presentPickerIfNeeded, active == nil, !registry.conflictingSpaceIDs.isEmpty { presented = .spaces }
    }
    func createSpace(name: String, nickname: String, cloud: Bool) async throws {
        let name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, name.count <= 40, !spaces.contains(where: { $0.manifest.name == name }) else { throw MobileError.invalidData("请使用非空且不重复的空间名称。") }
        if cloud && cloudRoot == nil { throw MobileError.unavailable("请先登录 iCloud 并开启 iCloud Drive。") }
        var manifest = SpaceManifest(id: "space-" + UUID().uuidString.lowercased(), name: name)
        let root = localRoot.appendingPathComponent(manifest.id)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        guard nickname.count <= 40 else { throw MobileError.invalidData("称呼最多 40 个字符。") }; manifest.nickname = nickname
        let newStore = try SpaceStore(root: root, manifest: manifest, deviceId: deviceId); try await newStore.initialize(); try await newStore.writeJSON(["knowledgeBaseId":manifest.id,"name":manifest.name],path:".mobile/identity-state.json",exclusive:true)
        // A Mac opens this exact workspace; files keep the same source of truth.
        let quoted = { (s: String) in "\"" + s.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"").replacingOccurrences(of: "\n", with: " ") + "\"" }
        let config = "version: 3\nname: \(quoted(name))\ndefaultKnowledgeBase: \(manifest.id)\npaths:\n  skills: knowledge-engine/skills\n  tools: knowledge-engine/tools\n  agentInstructions: AGENTS.md\nknowledgeBases:\n  \(manifest.id):\n    name: \(quoted(name))\n    paths:\n      wiki: \(manifest.wikiPath)\n      sources: \(manifest.sourcesPath)\nvalidation:\n  commands: []\n"
        try Data(config.utf8).write(to: root.appendingPathComponent("the-way-here.config.yaml"), options: .withoutOverwriting)
        UserDefaults.standard.set(nickname, forKey: "nickname.\(manifest.id)")
        // Preserve the explicit target before activate can attempt the first
        // upload. A missing remote manifest on restart is not an unlink choice.
        try cloudConnectionPreferences.setLinked(cloud, spaceID: manifest.id, directory: root.lastPathComponent)
        let space = Space(manifest: manifest, root: root, cloud: cloud ? cloudRoot?.appendingPathComponent(manifest.id) : nil)
        spaces.append(space); try await activate(space)
    }
    func activate(_ space: Space) async throws {
        try spaceRegistry.validateSelection(space.id)
        guard !activating else { throw MobileError.unavailable("正在切换空间，请稍后再试。") }; activating = true; defer { activating = false }
        if !draftText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { try await saveDraft() }
        try spaceRegistry.validateSelection(space.id)
        let bound = try SpaceStore(root: space.root, manifest: space.manifest, deviceId: deviceId, cloudRoot:space.cloud)
        let previous = (active:active,store:store,documents:documents,folders:sourceFolders,drafts:drafts,photos:photos,tasks:tasks,receipts:receipts,snapshot:snapshot,heartbeat:macHeartbeat,report:latestSyncReport,syncStatus:syncStatus,text:draftText,draftId:draftId,folder:folder,destination:systemDestination)
        active = space; store = bound
        documents = []; sourceFolders = []; drafts = []; photos = []; tasks = []; receipts = []; snapshot = nil; macHeartbeat = nil; latestSyncReport = nil; systemDestination = nil; syncing = false; syncCompleted = 0; syncTotal = 0; syncStatus = "仅保存在本机"
        draftText = ""; draftId = UUID().uuidString.lowercased(); folder = UserDefaults.standard.string(forKey:"folder." + space.id) ?? "随手记"
        let loaded = await refresh()
        let identityError: Error?
        do { try spaceRegistry.validateSelection(space.id); identityError = nil } catch { identityError = error }
        guard loaded, active?.id == space.id, identityError == nil else {
            if active == nil || active?.id == space.id {
                active = previous.active; store = previous.store; documents = previous.documents; sourceFolders = previous.folders; drafts = previous.drafts; photos = previous.photos; tasks = previous.tasks; receipts = previous.receipts; snapshot = previous.snapshot; macHeartbeat = previous.heartbeat; latestSyncReport = previous.report; syncStatus = previous.syncStatus; draftText = previous.text; draftId = previous.draftId; folder = previous.folder; systemDestination = previous.destination
            }
            if active == nil, !spaceRegistry.conflictingSpaceIDs.isEmpty { presented = .spaces }
            if let identityError { throw identityError }
            throw MobileError.unavailable("空间没有打开成功，原空间与草稿已保留。")
        }
        UserDefaults.standard.set(space.id,forKey:activeSpacePreferenceKey)
        if let nickname = active?.manifest.nickname { UserDefaults.standard.set(nickname,forKey:"nickname." + space.id) }
        if let latest = drafts.first(where: { ["text", "voice"].contains($0.kind) && $0.visibleInCaptureHistory && !["saved","discarded"].contains(captureStatus($0)) && !$0.text.isEmpty }) { draftText = latest.text; draftId = latest.id; folder = latest.folder }
    }
    @discardableResult
    func refresh() async -> Bool {
        refreshPhoneModelAvailability()
        guard !locked, let space = active, let store else { return false }
        guard refreshing.insert(space.id).inserted else { return false }
        defer { refreshing.remove(space.id) }
        do {
            try await store.purgeExpiredTrash()
            guard active?.id == space.id else { return false }
            if let cloud = space.cloud, online, !space.manifest.readOnly {
                syncing = true; defer { if active?.id == space.id { syncing = false } }
                let syncKey = space.id + "|" + cloud.path
                let sync: FileSync
                if let existing = syncEngines[syncKey] { sync = existing } else { let created = FileSync(local: space.root, cloud: cloud, ledger: localRoot.deletingLastPathComponent().appendingPathComponent("SyncLedgers/\(space.id).json")); syncEngines[syncKey] = created; sync = created }
                let wifiOnly = UserDefaults.standard.object(forKey: "sync.wifiPhotos") as? Bool ?? true
                let lowPowerPause = UserDefaults.standard.object(forKey: "sync.lowPowerPause") as? Bool ?? true
                let allowPhotos = (!wifiOnly || wifi) && !(lowPowerPause && ProcessInfo.processInfo.isLowPowerModeEnabled)
                let syncTask = Task { try await sync.synchronize(allowPhotos: allowPhotos) { completed, total in Task { @MainActor [weak self] in guard let self, self.active?.id == space.id else { return }; self.syncCompleted = completed; self.syncTotal = total } } }; syncTasks[space.id] = syncTask
                defer { syncTasks.removeValue(forKey: space.id) }
                do {
                    let report = try await syncTask.value
                    guard active?.id == space.id else { return false }
                    latestSyncReport = report
                    let pendingKey = "sync.pendingSince." + space.id
                    if report.cloudQuotaExceeded || report.pendingCloudUploads > 0 || report.pendingPhotos > 0 || !report.pendingFiles.isEmpty {
                        if UserDefaults.standard.string(forKey:pendingKey) == nil { UserDefaults.standard.set(MobileProtocol.timestamp(),forKey:pendingKey) }
                    } else { UserDefaults.standard.removeObject(forKey:pendingKey) }
                    UserDefaults.standard.set(MobileProtocol.timestamp(),forKey:"sync.lastCheckedAt." + space.id)
                    syncStatus = report.cloudQuotaExceeded ? "iCloud 空间不足 · 新内容仍保存在这台 iPhone" : report.pendingCloudUploads > 0 ? "iCloud 正在上传，还有 \(report.pendingCloudUploads) 个文件" : report.conflicts > 0 ? "已保留 \(report.conflicts) 份冲突副本" : report.pendingPhotos > 0 ? "等待 Wi-Fi 上传 \(report.pendingPhotos) 个附件" : "文件已交给 iCloud · 上传由系统继续"
                } catch is CancellationError {} catch { guard active?.id == space.id else { return false }; if UserDefaults.standard.string(forKey:"sync.pendingSince." + space.id) == nil { UserDefaults.standard.set(MobileProtocol.timestamp(),forKey:"sync.pendingSince." + space.id) }; syncStatus = MobileProtocol.isCloudQuotaError(error) ? "iCloud 空间不足 · 新内容仍保存在这台 iPhone" : "iCloud 暂未完成 · 本机内容已保留"; message = error.localizedDescription }
            } else { syncStatus = online ? "仅保存在本机" : "离线 · 内容已保存在这台 iPhone" }
            guard active?.id == space.id else { return false }
            try await store.purgeExpiredSpace()
            guard active?.id == space.id else { return false }
            let lifecycle = try await store.lifecycleState()
            guard active?.id == space.id else { return false }
            if lifecycle.archived { active = nil; self.store = nil; documents = []; drafts = []; photos = []; tasks = []; receipts = []; snapshot = nil; sourceFolders = []; macHeartbeat = nil; systemDestination = nil; syncing = false; try await discover(); guard active == nil else { return false }; presented = .spaces; return false }
            let currentManifest = try JSONDecoder().decode(SpaceManifest.self,from:await store.read("mobile-space.json")); try currentManifest.validate()
            guard currentManifest.id == space.id, currentManifest.sourcesPath == space.manifest.sourcesPath, currentManifest.wikiPath == space.manifest.wikiPath else { throw MobileError.invalidData("空间同步信息发生变化，请重新打开空间。") }
            guard active?.id == space.id else { return false }
            if currentManifest != space.manifest { active?.manifest = currentManifest; self.store = try SpaceStore(root:space.root,manifest:currentManifest,deviceId:deviceId,cloudRoot:space.cloud); if let nickname = currentManifest.nickname { UserDefaults.standard.set(nickname,forKey:"nickname." + space.id) } }
            let folders = try await store.folders()
            let docs = try await store.documents(), ds = try await store.drafts(), ps = try await store.photoDrafts(), snap = try await store.snapshot()
            // Retain old request metadata only for removing obsolete local
            // notifications. It cannot block reading or create new requests.
            let requests = (try? await store.requests()) ?? []
            let states = (try? await store.receipts()) ?? []
            let identityData = try? await store.read(".mobile/identity-conflict.json")
            guard active?.id == space.id else { return false }
            if let data = identityData, let conflict = try JSONSerialization.jsonObject(with:data) as? [String:String], conflict["knowledgeBaseId"] == space.id { message = conflict["message"] }
            guard active?.id == space.id else { return false }
            documents = docs; sourceFolders = folders; drafts = ds; photos = ps; tasks = requests; receipts = states; snapshot = snap
            guard active?.id == space.id else { return false }
            if !acceptanceMode {
            await systemUpdate(requests:requests,receipts:states,documents:docs)
            guard active?.id == space.id else { return false }
            let widget = UserDefaults(suiteName: "group.com.thewayhere.shared")
            widget?.set((UserDefaults.standard.object(forKey: "privacy.hidePreview") as? Bool ?? true) ? "给此刻留一段话" : documents.first?.title ?? "给此刻留一段话", forKey: "widget.title")
            widget?.removeObject(forKey: "widget.pending")
            widget?.set(space.id, forKey: "widget.spaceId"); widget?.set(space.root.lastPathComponent, forKey: "widget.spaceDirectory"); widget?.set(try MobileProtocol.encoder().encode(space.manifest), forKey: "widget.spaceManifest")
            widget?.set(space.cloud != nil, forKey: "widget.cloudLinked"); widget?.set(wifi, forKey: "widget.allowPhotos")
            WidgetCenter.shared.reloadAllTimelines()
            }
            processPendingURL()
            return true
        } catch is CancellationError { return false } catch { if active?.id == space.id { self.error = error.localizedDescription }; return false }
    }
    func saveDraft() async throws {
        guard let store, let active, !active.manifest.readOnly else { return }
        if draftText.isEmpty && !drafts.contains(where: { $0.id == draftId }) { return }
        var draft = Draft(space: active.id, text: draftText, folder: folder, id: draftId); draft.kind = drafts.first(where:{$0.id == draftId})?.kind ?? "text"
        if draftText.isEmpty { draft.status = "discarded" }
        try await store.saveDraft(draft)
        UserDefaults.standard.set(folder, forKey: "folder.\(active.id)")
    }
    func saveOriginal() async throws {
        guard let store, let spaceId = active?.id else { return }
        let text = draftText, folder = folder, id = draftId
        let path = try await store.saveOriginal(text: text, folder: folder)
        var draft = Draft(space: spaceId, text: text, folder: folder, id: id); draft.kind = drafts.first(where:{$0.id == id})?.kind ?? "text"; draft.status = "saved"; draft.savedPath = path; try await store.saveDraft(draft)
        if active?.id == spaceId { draftText = ""; draftId = UUID().uuidString.lowercased(); message = "原文已保存在这台 iPhone"; await refresh() }
    }
    @discardableResult func enqueue(_ kind: TaskKind, text: String, paths: [String] = [], context: String? = nil, options: [String: String] = [:]) async throws -> TaskRequest {
        guard let boundSpace else { throw MobileError.unavailable("请先打开空间。") }
        let task = try await boundSpace.enqueue(kind, text: text, paths: paths, context: context, options: options)
        return task
    }
    func documentFlag(_ flag: String, document: TWHCore.Document) -> Bool {
        guard let id = active?.id else { return false }
        return UserDefaults.standard.bool(forKey: "document." + id + "." + document.id + "." + flag)
    }
    func setDocumentFlag(_ flag: String, document: TWHCore.Document, value: Bool) {
        guard let id = active?.id else { return }
        UserDefaults.standard.set(value, forKey: "document." + id + "." + document.id + "." + flag)
        readingPreferencesVersion += 1
    }
    func handleURL(_ url: URL) {
        guard !invalidAcceptanceConfiguration else { return }
        guard url.scheme == "thewayhere" else { return }
        if locked || active == nil || onboarding { deferURL(url); return }
        if !acceptanceMode {
            if UserDefaults.standard.string(forKey: "launch.url") == url.absoluteString { UserDefaults.standard.removeObject(forKey: "launch.url") }
            let shared = UserDefaults(suiteName: "group.com.thewayhere.shared")
            if shared?.string(forKey: "intent.pendingURL") == url.absoluteString { shared?.removeObject(forKey: "intent.pendingURL") }
        }
        if handleSystemURL(url) { return }
        switch url.host { case "record": presented = .recording; case "write": presented = .writing; case "photos": presented = .photos; case "letters": presented = .letters; case "future": presented = .future; default: break }
    }
    func deferURL(_ url: URL) {
        // Acceptance may consume an explicitly delivered URL, never the user's
        // persisted launch intent or real shared App Group pending contents.
        if acceptanceMode { pendingAcceptanceURL = url }
        else { UserDefaults.standard.set(url.absoluteString, forKey: "launch.url") }
    }
    func processPendingURL() {
        if acceptanceMode {
            guard !locked, !onboarding, active != nil, let url = pendingAcceptanceURL else { return }
            pendingAcceptanceURL = nil
            handleURL(url)
            return
        }
        let shared = UserDefaults(suiteName: "group.com.thewayhere.shared")
        let value = shared?.string(forKey: "intent.pendingURL") ?? UserDefaults.standard.string(forKey: "launch.url")
        if let value, let url = URL(string: value), active != nil, !onboarding {
            shared?.removeObject(forKey: "intent.pendingURL"); UserDefaults.standard.removeObject(forKey: "launch.url"); handleURL(url)
        }
    }

    func unlock() async {
        let context = LAContext()
        do { if try await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "打开你的生活记录") { locked = false; await bootstrap() } } catch { self.error = error.localizedDescription }
    }
    func openDemo() async throws {
        struct Demo: Decodable { struct Page: Decodable { var path: String; var markdown: String; var category: String }; var pages: [Page]; var topics: [MobileSnapshot.Topic] }
        guard let resource = Bundle.main.url(forResource: "MobileDemo", withExtension: "json") else { throw MobileError.unavailable("演示资料未随安装包提供。") }
        let demo = try JSONDecoder().decode(Demo.self, from: Data(contentsOf: resource))
        let root = localRoot.appendingPathComponent("demo")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let manifest = SpaceManifest(id: "demo", name: "匿名演示", readOnly: true)
        for page in demo.pages {
            guard MobileProtocol.validPath(page.path), page.path.hasPrefix("vault/demo/") else { throw MobileError.invalidPath }
            let file = root.appendingPathComponent(page.path); try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true); try Data(page.markdown.utf8).write(to: file, options: .atomic)
        }
        try MobileProtocol.encoder().encode(manifest).write(to: root.appendingPathComponent("mobile-space.json"), options: .atomic)
        let snapshot: [String: Any] = ["version": 1, "knowledgeBaseId": "demo", "updatedAt": MobileProtocol.timestamp(), "macVersion": "demo", "pages": demo.pages.map { ["relativePath": $0.path, "category": $0.category] }, "topics": try JSONSerialization.jsonObject(with: MobileProtocol.encoder().encode(demo.topics))]
        try FileManager.default.createDirectory(at: root.appendingPathComponent(".mobile"), withIntermediateDirectories: true)
        try JSONSerialization.data(withJSONObject: snapshot).write(to: root.appendingPathComponent(".mobile/snapshot.json"), options: .atomic)
        let space = Space(manifest: manifest, root: root, cloud: nil); spaces.removeAll { $0.id == "demo" }; spaces.append(space); try await activate(space)
    }
    func enteredBackground() {
        backgroundAt = Date()
        guard !acceptanceMode else { return }
        let request = BGAppRefreshTaskRequest(identifier: "com.thewayhere.mobile.refresh"); request.earliestBeginDate = Date().addingTimeInterval(900); try? BGTaskScheduler.shared.submit(request)
    }
    func enteredForeground() {
        guard !invalidAcceptanceConfiguration else { return }
        if UserDefaults.standard.bool(forKey: "privacy.lock"), let backgroundAt, Date().timeIntervalSince(backgroundAt) >= Double(UserDefaults.standard.integer(forKey: "privacy.lockMinutes") * 60) { locked = true }
        if !locked { Task { await refresh(); processPendingURL() } }
    }
    func setCloudLinked(_ linked: Bool) async throws {
        guard var space = active else { return }
        if !linked { syncTasks[space.id]?.cancel(); _ = try? await syncTasks[space.id]?.value }
        if linked {
            guard let cloudRoot else { throw MobileError.unavailable("请先登录 iCloud 并开启 iCloud Drive。") }
            try cloudConnectionPreferences.setLinked(true, spaceID: space.id, directory: space.root.lastPathComponent)
            space.cloud = cloudRoot.appendingPathComponent(space.root.lastPathComponent)
        } else {
            try cloudConnectionPreferences.setLinked(false, spaceID: space.id, directory: space.root.lastPathComponent)
            space.cloud = nil
        }
        if let index = spaces.firstIndex(where: { $0.id == space.id }) { spaces[index] = space }
        if active?.id == space.id { active = space; syncStatus = linked ? "准备同步" : "已暂停此设备的 iCloud 同步" }
        if linked { await refresh() }
    }
    func undoRecording() async throws {
        guard let undo = recordingUndo, undo.expires > Date() else { recordingUndo = nil; return }
        try await undo.bound.store.saveDraft(Draft(space: undo.bound.manifest.id, text: undo.text, folder: undo.bound.folder, id: undo.draftId))
        if active?.id == undo.bound.manifest.id { draftText = undo.text }
        recordingUndo = nil
    }
    func captureStatus(_ draft: Draft) -> String {
        ["saved", "discarded"].contains(draft.status ?? "") ? draft.status! : "draft"
    }
}
