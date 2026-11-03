import SwiftUI
import TWHCore

/// Fictional local data, reachable only through the explicit, isolated UI-test fixture.
@MainActor enum RecordsSettingsFixtures {
    static let recordName = "ANONYMOUS ORBIT NOTE"
    static let recordFile = "Acceptance-note.md"
    static let screens = (1...15).map { "REC-\($0)" } + (1...3).map { "SRC-\($0)" } + (1...9).map { "SET-\($0)" } + ["STA-1", "STA-2", "STA-3", "STA-7", "STA-9", "STA-10"]
    static var screenshotMatrix: [String: String] { Dictionary(uniqueKeysWithValues: screens.map { ($0, "RecordsSettingsVerificationScreen → real " + $0 + " view") }) }
    static func supports(_ screen: String) -> Bool { screens.contains(screen) }
    static func matches(_ scenario: String) -> Bool { ["records", "search", "settings", "shell"].contains { scenario.hasPrefix($0) } }
    static func seed(model: AppModel, bound: BoundSpace, scenario: String) async throws {
        guard UXVerificationFixtures.enabled, matches(scenario), let fixture = ProcessInfo.processInfo.environment["TWH_UI_TEST_FIXTURE"], model.localRoot.path.contains("/UIFixtures/" + fixture + "/Spaces"), model.active?.cloud == nil, !bound.manifest.readOnly else { return }
        _ = try await bound.store.importNamedSourceFile(data: Data("# \(recordName)\n\nAnonymous orbit journal, made only for local acceptance.\n".utf8), filename: recordFile, folder: "随手记")
        for number in 1...5 { _ = try await bound.store.importNamedSourceFile(data: Data("# ANONYMOUS CLUSTER \(number)\n\nFictional cluster search evidence \(number).".utf8), filename: "Cluster-\(number).md", folder: "Search fixtures") }
        try await bound.store.createFolder("Move Target")
        try await bound.store.createFolder("Empty Folder/Child")
        let conflicting = try await bound.store.importNamedSourceFile(data: Data("# ANONYMOUS CONFLICT\n\nInitial anonymous text.".utf8), filename: "Conflict-note.md", folder: "随手记")
        let prior = try await bound.store.read(conflicting)
        try await bound.store.saveEdit(path: conflicting, expectedHash: MobileProtocol.hash(prior), markdown: "# ANONYMOUS CONFLICT\n\nRemote anonymous text.")
        do { try await bound.store.saveEdit(path: conflicting, expectedHash: MobileProtocol.hash(prior), markdown: "# ANONYMOUS CONFLICT\n\nLocal anonymous text.") } catch MobileError.conflict { }
        if scenario == "settings-language" { UserDefaults.standard.set("zh-Hans", forKey: "language.interface") }
        if scenario == "shell-compatibility" {
            var object = try JSONSerialization.jsonObject(with: await bound.store.read(".mobile/snapshot.json")) as! [String: Any]
            object["capabilities"] = nil; object["macVersion"] = "0.0.1"
            let snapshot = try JSONDecoder().decode(MobileSnapshot.self, from: JSONSerialization.data(withJSONObject: object)); try await bound.store.writeJSON(snapshot, path: ".mobile/snapshot.json")
        }
    }
    static func configure(model: AppModel, scenario: String) throws {
        guard UXVerificationFixtures.enabled, matches(scenario), model.active?.cloud == nil else { return }
        if scenario == "shell-offline" { model.online = false }
        if scenario == "shell-quota" || scenario == "shell-download" {
            var report = SyncReport(); report.cloudQuotaExceeded = scenario == "shell-quota"; report.pendingPhotos = 1; report.pendingFiles = [SyncPendingFile(path: "anonymous-pending-photo.jpg", reason: "等待 Wi-Fi 或退出低电量模式")]; report.availableDocuments = 2; report.totalDocuments = 5
            model.latestSyncReport = report; model.syncing = scenario == "shell-download"
            if scenario == "shell-quota", let id = model.active?.id { UserDefaults.standard.set(MobileProtocol.timestamp(Date().addingTimeInterval(-15 * 86400)), forKey: "sync.pendingSince." + id) }
        }
        if scenario == "shell-waiting" { model.macHeartbeat = try JSONDecoder().decode(MacHeartbeat.self, from: JSONSerialization.data(withJSONObject: ["version":1, "knowledgeBaseId":model.active!.id, "updatedAt":"2026-01-01T00:00:00Z", "macVersion":"development", "deviceName":"Anonymous fixture Mac"])) }
    }
}
struct RecordsSettingsVerificationScreen: View {
    @EnvironmentObject private var model: AppModel
    let screen: String
    private var note: TWHCore.Document? { model.documents.first { URL(fileURLWithPath: $0.path).lastPathComponent == RecordsSettingsFixtures.recordFile } }
    private var conflict: TWHCore.Document? { model.documents.first { $0.path.contains(".conflict-") } }
    var body: some View { Group {
        switch screen {
        case "REC-1", "REC-3": RecordsView()
        case "REC-2": FolderBrowserView(initialFolder: "随手记")
        case "REC-4": RecordDestinationView(title: "移动记录", currentFolders: ["随手记"]) { folder in if let note, let bound = model.boundSpace { model.perform { _ = try await bound.store.moveSource(path: note.path, folder: folder); await model.refresh(); model.systemDestination = nil } } }
        case "REC-5": if let note { DocumentView(document: note) }
        case "REC-6": if let note { RecordInformationView(document: note, bound: model.boundSpace) }
        case "REC-7": if let note { RecordEditorView(document: note) }
        case "REC-8": if let conflict { ExistingRecordConflictView(document: conflict, bound: model.boundSpace) }
        case "REC-9": RecordsView()
        case "REC-10": RecordsView()
        case "REC-11": RecordsView()
        case "REC-12", "REC-13", "REC-14", "REC-15": ImportView()
        case "SRC-1", "SRC-2", "SRC-3": SearchView()
        case "SET-1": SettingsView()
        case "SET-2": SyncSettingsView()
        case "SET-3": SpeechSettingsView()
        case "SET-4": ModelSettingsView()
        case "SET-5": LanguageSettingsView()
        case "SET-6": PrivacySettingsView()
        case "SET-7": NotificationSettingsView()
        case "SET-8": SpaceManagementView()
        case "SET-9": AboutView()
        case "STA-1", "STA-2", "STA-3", "STA-7": ShellSyncDetails()
        case "STA-9": VStack(spacing: 20) { Text("Anonymous error acceptance fixture"); Button("Trigger anonymous network error") { model.error = "Anonymous network fixture failure. No private data is involved." } }
        case "STA-10": List { MacCompatibilityNotice() }
        default: RecordsView()
        }
    } }
}
