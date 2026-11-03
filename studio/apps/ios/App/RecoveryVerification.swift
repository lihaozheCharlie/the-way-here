import SwiftUI
import PhotosUI
import TWHCore

@MainActor enum RecoveryVerificationFixtures {
    static let original = "Anonymous capture fixture: a quiet walk with a friend."
    static let chosen = "ANONYMOUS SELECTED ATTACHMENT TEXT 872"
    static let excluded = "ANONYMOUS EXCLUDED ATTACHMENT TEXT 913"
    static func seed(model: AppModel, bound: BoundSpace, scenario: String) async throws {
        guard scenario == "recovery-letter" else { return }
        guard UXVerificationFixtures.enabled, let fixture = ProcessInfo.processInfo.environment["TWH_UI_TEST_FIXTURE"], model.localRoot.path.contains("/UIFixtures/" + fixture + "/Spaces"), model.active?.cloud == nil, !bound.manifest.readOnly else { throw MobileError.invalidData("Recovery fixtures require their isolated local test space.") }
        _ = try await bound.store.importNamedSourceFile(data: Data("# ANONYMOUS CHOSEN RECORD\n\n\(chosen)".utf8), filename: "Recent-choice-A.md", folder: "Anonymous attachments")
        _ = try await bound.store.importNamedSourceFile(data: Data("# ANONYMOUS EXCLUDED RECORD\n\n\(excluded)".utf8), filename: "Recent-choice-B.md", folder: "Anonymous attachments")
        let archive = ConversationArchive(id: "anonymous-attachment-conversation", knowledgeBaseId: bound.manifest.id, title: "Anonymous prior conversation", updatedAt: MobileProtocol.timestamp(), messages: [ChatMessage(role:"user",content:"ANONYMOUS CHOSEN CONVERSATION 318")], context: "", evidence: "")
        try await bound.store.writeJSON(archive, path: ".mobile/conversations/" + archive.id + ".json")
    }
}
struct RecoveryPhotoVerificationView: View {
    var denied = false
    @State private var added = false
    @State private var selection: [PhotosPickerItem] = []
    var body: some View { List {
        PhotoAccessNotice(snapshot: PhotoAccessSnapshot(status: denied ? .denied : .limited, allowedImages: denied ? nil : added ? 13 : 12), manageFixture: { added = true })
        PhotosPicker(selection: $selection, matching: .images) { Label("选择照片", systemImage:"photo") }.accessibilityIdentifier("recovery-photo-picker")
        Text("Anonymous permission adapter: counts are fictional; the real photo library is never enumerated.").font(.caption)
    }.navigationTitle("Anonymous photo permission check") }
}
struct RecoveryVerificationProof: View {
    @EnvironmentObject private var model: AppModel
    @State private var checks: [String:Bool] = [:]
    var body: some View { List { ForEach(checks.keys.sorted(), id:\.self) { key in Text(checks[key] == true ? "proof." + key : "FAIL " + key).accessibilityIdentifier(checks[key] == true ? "proof." + key : "failed." + key) } }.navigationTitle("Anonymous persisted recovery checks").task {
        guard UXVerificationFixtures.enabled, let bound = model.boundSpace, model.active?.cloud == nil else { return }
        do {
            let tasks = try await bound.store.requests(), drafts = try await bound.store.drafts()
            let documents = try await bound.store.documents()
            checks["no-task-requests"] = tasks.isEmpty
            checks["local-original-saved"] = documents.contains { $0.isSource && $0.bodyMarkdown.contains(RecoveryVerificationFixtures.original) }
            checks["original-draft-preserved"] = drafts.contains { $0.id == "anonymous-capture-draft" && $0.text == RecoveryVerificationFixtures.original }
            checks["notification-build-disabled"] = UserDefaults.standard.object(forKey:"notifications.build.enabled") as? Bool == false
        } catch { checks["fixture-read"] = false }
    } }
}

struct RecoveryLetterLimitVerification: View {
    @State private var textRejected = false
    @State private var pathsRejected = false
    var body: some View { List {
        Text(textRejected ? "proof.letter-text-limit" : "FAIL letter-text-limit")
        Text(pathsRejected ? "proof.letter-path-limit" : "FAIL letter-path-limit")
    }.task {
        do { _ = try LetterAttachmentPayload(question:String(repeating:"a",count:50_001),conversation:nil,records:[]) } catch { textRejected = true }
        let records = (1...5).map { index in FrozenLetterRecord(TWHCore.Document(path:"anonymous/" + String(repeating:"a",count:410) + String(index) + ".md",markdown:"# Fictional record\n\nAnonymous text.",isSource:true)) }
        do { _ = try LetterAttachmentPayload(question:"Anonymous limit check",conversation:nil,records:records) } catch { pathsRejected = true }
    } }
}
