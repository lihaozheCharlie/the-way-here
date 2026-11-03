import SwiftUI
import TWHCore
import UIKit

/// Anonymous, local-only acceptance data. It is unreachable without both explicit
/// UI-test flags and an isolated fixture directory selected by AppModel.
@MainActor enum UXVerificationFixtures {
    static var installed: Set<String> = []
    static var enabled: Bool {
        let env = ProcessInfo.processInfo.environment
        return CommandLine.arguments.contains("--uitest") && env["TWH_UI_TEST_FIXTURE"].map(MobileProtocol.validID) == true && env["TWH_UI_TEST_SCENARIO"] != nil
    }
    static var speechEnabled: Bool { enabled && ProcessInfo.processInfo.environment["TWH_UI_SPEECH_FIXTURE"] == "transcript" }
    static var modelPreset: ProviderPreset? {
        guard enabled, ModelFixtureMode.supported.contains(ProcessInfo.processInfo.environment["TWH_UI_MODEL_FIXTURE"] ?? "") else { return nil }
        return ProviderPreset(id: "anonymous-fixture", name: "Anonymous UI fixture (local)", baseURL: "https://fixture.thewayhere.invalid/v1", model: "anonymous", protocolName: "openai-chat", supportsImages: ProcessInfo.processInfo.environment["TWH_UI_MODEL_SUPPORTS_IMAGES"] != "NO")
    }
    static var photoID = "anonymous-photo-fixture"
    static let screenshotMatrix: [String: String] = [
        "ONB-1": "WelcomeView", "ONB-2": "CloudConnectionView", "ONB-3": "SpacesView", "ONB-4": "CreateSpaceView", "ONB-5": "PermissionsView", "ONB-6": "ModelSettingsView",
        "NOW-1": "NowView", "NOW-2": "NowView (anonymous read-only demo)", "NOW-3": "RecordingView", "NOW-4": "WritingView", "NOW-5": "FolderPickerView", "NOW-6": "DraftResultView", "NOW-7": "MobileShell capture menu", "NOW-8": "HistoryView", "NOW-9": "CaptureHistoryDetail",
        "PHO-1": "PhotoFlowView (empty selection)", "PHO-2": "PhotoFlowView (selected photos)", "PHO-3": "PhotoFlowView (face annotation)", "PHO-4": "FaceNamingView", "PHO-5": "ManualFaceSelectionView", "PHO-6": "PhotoCandidatesView", "PHO-7": "PhotoFlowView (story)", "PHO-8": "PhotoStoryEditor", "PHO-9": "PhotoSendOptions", "PHO-10": "PhotoFlowView (submission review)", "PHO-11": "PhotoFlowView (completion)", "PHO-12": "PhotoFlowView (draft library)",
        "SYS-2": "SystemEntriesView", "SYS-3": "RecordingView + real Live Activity", "SYS-4": "SystemDestinationView (exact bound task/person)", "SYS-5": "UIApplication actual dynamic shortcut items", "SYS-6": "UIActivityViewController with anonymous payload"
    ].merging(RecordsSettingsFixtures.screenshotMatrix) { original, _ in original }.merging(UnderstandingVerificationFixtures.screenshotMatrix) { original, _ in original }
    static func install(on model: AppModel) async throws {
        guard enabled, let fixture = ProcessInfo.processInfo.environment["TWH_UI_TEST_FIXTURE"], !installed.contains(fixture), let bound = model.boundSpace else { return }
        // A fixture can never seed an ordinary app directory or an iCloud space.
        guard model.localRoot.path.contains("/UIFixtures/" + fixture + "/Spaces"), model.active?.cloud == nil, !bound.manifest.readOnly else { throw MobileError.unavailable("Anonymous fixture requires its isolated local space.") }
        installed.insert(fixture)
        if modelPreset != nil { URLProtocol.registerClass(UXModelFixtureProtocol.self) }
        let scenario = ProcessInfo.processInfo.environment["TWH_UI_TEST_SCENARIO"] ?? ""
        let marker = ".mobile/anonymous-ui-fixture.json"
        if (try? await bound.store.read(marker)) == nil {
            try await seed(model, bound: bound, scenario: scenario)
            try await bound.store.writeJSON(["fixture": fixture, "scenario": scenario], path: marker)
        }
        // No bootstrap recursion and no cloud/Keychain/Photos access.
        model.documents = try await bound.store.documents(); model.photos = try await bound.store.photoDrafts(); model.drafts = try await bound.store.drafts()
        model.tasks = try await bound.store.requests(); model.receipts = try await bound.store.receipts(); model.snapshot = try await bound.store.snapshot()
        model.sourceFolders = try await bound.store.folders()
        if let draft = model.drafts.first(where: { $0.id == "anonymous-capture-draft" && $0.status != "saved" && $0.status != "discarded" }), scenario.hasPrefix("capture") { model.draftText = draft.text; model.draftId = draft.id; model.folder = draft.folder }
        await model.systemUpdate(requests: model.tasks, receipts: model.receipts, documents: model.documents)
        try RecordsSettingsFixtures.configure(model: model, scenario: scenario)
        if try await UXCompletionFixtures.configure(model: model, scenario: scenario) { return }
        if scenario == "identity-recovery" { try await IdentityRecoveryFixture.configure(model); return }
        guard let screen = ProcessInfo.processInfo.environment["TWH_UI_TEST_SCREEN"], !screen.isEmpty else { return }
        if screen == "NOW-1" || screen == "NOW-7" { model.selectedTab = 0 }
        else if screen == "NOW-2" { try await model.openDemo(); model.selectedTab = 0 }
        else if screen == "ONB-1" { model.onboarding = true }
        else if screen == "photo-flow" { model.systemDestination = SystemDestination(route: "share-photo", space: bound.manifest.id, target: photoID) }
        else if screen == "share-flow" { model.systemDestination = SystemDestination(route: "share-photo", space: bound.manifest.id, target: "anonymous-shared-photo") }
        else if screen == "system-person" { model.systemDestination = SystemDestination(route: "document", space: bound.manifest.id, target: bound.manifest.wikiPath + "/匿名朋友.md") }
        else if screen == "recording-intent" {
            model.presented = .recording
            Task { try? await Task.sleep(for: .seconds(1)); _ = try? await RecordingCommandIntent(.pause).perform(); try? await Task.sleep(for: .milliseconds(200)); _ = try? await RecordingCommandIntent(.finish).perform() }
        } else { model.systemDestination = SystemDestination(route: "verification", space: bound.manifest.id, target: screen) }
    }
    private static func seed(_ model: AppModel, bound: BoundSpace, scenario: String) async throws {
        let personPath = bound.manifest.wikiPath + "/匿名朋友.md", letterPath = bound.manifest.wikiPath + "/匿名回信.md"
        try await write("# 匿名朋友\n\n这是完全虚构的验收人物，只用于本机原生流程测试。\n", path: personPath, store: bound.store)
        try await write("# 匿名回信\n\n你好，测试者。你记下的片刻已经安全保留。\n", path: letterPath, store: bound.store)
        let snapshotObject: [String: Any] = [
            "version": 1, "knowledgeBaseId": bound.manifest.id, "updatedAt": MobileProtocol.timestamp(), "macVersion": "development", "protocolVersion": 1, "capabilities": TaskKind.allCases.map(\.rawValue), "companionshipStartedAt": MobileProtocol.timestamp(),
            "pages": [["relativePath": personPath, "category": "entities"], ["relativePath": letterPath, "category": "letters"]],
            "topics": [["id": "anonymous-topic", "title": "匿名话题", "question": "这个虚构的片刻，让你想到什么？", "reason": "匿名验收材料", "currentUnderstanding": "这里只展示明确标注的虚构材料。", "unknown": "没有任何真实用户资料。"]]
        ]
        let snapshot = try JSONDecoder().decode(MobileSnapshot.self, from: JSONSerialization.data(withJSONObject: snapshotObject))
        try await bound.store.writeJSON(snapshot, path: ".mobile/snapshot.json")
        var capture = Draft(space: bound.manifest.id, text: "Anonymous capture fixture: a quiet walk with a friend.", folder: "随手记", id: "anonymous-capture-draft")
        try await bound.store.saveDraft(capture)
        if scenario == "capture-failed" {
            let request = TaskRequest(space: bound.manifest.id, device: model.deviceId, kind: .diary, text: capture.text, options: ["captureDraftId": capture.id])
            try await bound.store.enqueue(request)
            try await receipt(request, status: "failed", store: bound.store, message: "Anonymous fixture: model temporarily unavailable.")
        }
        let raw = try await bound.store.saveOriginal(text: "Anonymous saved record fixture.", folder: "随手记", title: "匿名保存记录")
        capture.id = "anonymous-saved-capture"; capture.savedPath = raw; capture.status = "saved"; try await bound.store.saveDraft(capture)
        var draft = PhotoDraft(space: bound.manifest.id); draft.id = photoID; draft.title = "匿名周末照片"; draft.date = "2026-10-01"; draft.location = "虚构公园"; draft.story = "这是匿名验收照片。我们沿着虚构的河岸散步。人物与场景均为测试绘制。"
        let screen = ProcessInfo.processInfo.environment["TWH_UI_TEST_SCREEN"] ?? ""
        draft.step = ["PHO-3": 1, "PHO-4": 1, "PHO-5": 1, "PHO-6": 1, "PHO-7": 2, "PHO-8": 3, "PHO-10": 3, "PHO-11": 4][screen] ?? (scenario == "photo-naming" ? 1 : scenario == "photo-review" ? 3 : 0)
        // Distinct photo records intentionally contain the same anonymous JPEG
        // and crop. Vision still computes every feature print and distance; the
        // fixture never injects a "same person" result or changes its threshold.
        let anonymousJPEG = image().jpegData(compressionQuality: 0.85)!
        for _ in 0..<3 {
            let path = try await bound.store.savePhoto(anonymousJPEG, draftId: draft.id)
            draft.photos.append(MemoryPhoto(path: path, faces: [FaceAnnotation(x: 0.30, y: 0.14, width: 0.38, height: 0.55)]))
        }
        try await bound.store.savePhotoDraft(draft)
        if scenario == "photo-text-only-model", modelPreset?.supportsImages == false {
            // A stale opt-in must not survive switching to a text-only model.
            UserDefaults.standard.set(["images": true, "clues": true, "names": true, "selected": draft.photos.map(\.id)] as [String: Any], forKey: "photo.consent." + draft.knowledgeBaseId + "." + draft.id)
        }
        var cleanup = PhotoDraft(space: bound.manifest.id); cleanup.id = "anonymous-cleanup-photo"; cleanup.title = "待清理匿名草稿"; cleanup.updatedAt = "2026-08-01T00:00:00Z"
        let cleanupPath = try await bound.store.savePhoto(image().jpegData(compressionQuality: 0.8)!, draftId: cleanup.id); cleanup.photos = [MemoryPhoto(path: cleanupPath)]
        try await bound.store.savePhotoDraft(cleanup)
        var completed = draft; completed.id = "anonymous-completed-photo"; completed.title = "已完成的匿名照片故事"; completed.step = 4; completed.photos = []
        try await bound.store.savePhotoDraft(completed)
        if scenario == "share" {
            let inboxURL = model.localRoot.deletingLastPathComponent().appendingPathComponent("Inbox/anonymous-shared-photo")
            try FileManager.default.createDirectory(at: inboxURL, withIntermediateDirectories: true)
            try image().jpegData(compressionQuality: 0.85)!.write(to: inboxURL.appendingPathComponent("anonymous.jpg"))
            let payload = SharePayload(id: "anonymous-shared-photo", createdAt: MobileProtocol.timestamp(), text: "Anonymous shared photo payload.", attachments: ["anonymous.jpg"], folder: "分享收件箱", kind: "照片故事", note: "来自明确标注的验收夹具", knowledgeBaseId: bound.manifest.id)
            try MobileProtocol.encoder().encode(payload).write(to: inboxURL.appendingPathComponent("payload.json"))
            do {try await ShareImportCoordinator.importPayload(payload,inbox:ShareInbox(root:inboxURL.deletingLastPathComponent()),store:bound.store,spaceID:bound.manifest.id)}
            catch {try? await bound.store.writeJSON(["stage":"anonymous-share-import","error":error.localizedDescription],path:".mobile/anonymous-fixture-error.json");throw error}
        }
        if scenario == "system" {
            let task = TaskRequest(space: bound.manifest.id, device: model.deviceId, kind: .build, text: "Anonymous system route fixture")
            try await bound.store.enqueue(task); try await receipt(task, status: "completed", store: bound.store, message: "匿名人物页面已更新", paths: [personPath])
        }
        try await DeepFlowFixtures.seed(model:model,bound:bound,scenario:scenario)
        try await RecoveryVerificationFixtures.seed(model:model,bound:bound,scenario:scenario)
        try await UXCompletionFixtures.seed(model:model,bound:bound,scenario:scenario)
        if ImportFormCompletionFixture.matches(scenario:scenario) { try await ImportFormCompletionFixture.seed(model:model,bound:bound,scenario:scenario) }
        if RecordsSettingsFixtures.matches(scenario) { try await RecordsSettingsFixtures.seed(model: model, bound: bound, scenario: scenario) }
        if scenario.hasPrefix("understanding") { try await UnderstandingVerificationFixtures.seed(model: model, bound: bound, scenario: scenario) }
    }
    static func image() -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: 640, height: 480)).image { context in
            UIColor.systemTeal.withAlphaComponent(0.12).setFill(); context.fill(CGRect(x: 0, y: 0, width: 640, height: 480))
            UIColor.systemOrange.withAlphaComponent(0.5).setFill(); UIBezierPath(ovalIn: CGRect(x: 200, y: 65, width: 235, height: 270)).fill()
            UIColor.darkGray.setFill(); for x in [260, 350] { UIBezierPath(ovalIn: CGRect(x: x, y: 170, width: 18, height: 18)).fill() }
            let line = UIBezierPath(); line.move(to: CGPoint(x: 275, y: 250)); line.addQuadCurve(to: CGPoint(x: 355, y: 250), controlPoint: CGPoint(x: 315, y: 295)); line.lineWidth = 7; UIColor.darkGray.setStroke(); line.stroke()
            ("ANONYMOUS UI FIXTURE" as NSString).draw(at: CGPoint(x: 20, y: 420), withAttributes: [.font: UIFont.systemFont(ofSize: 20), .foregroundColor: UIColor.darkGray])
        }
    }
    private static func write(_ text: String, path: String, store: SpaceStore) async throws {
        let url = try await store.url(path); try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true); try Data(text.utf8).write(to: url)
    }
    private static func receipt(_ request: TaskRequest, status: String, store: SpaceStore, message: String, paths: [String] = []) async throws {
        let data = try JSONSerialization.data(withJSONObject: ["version": 1, "id": request.id, "knowledgeBaseId": request.knowledgeBaseId, "status": status, "updatedAt": MobileProtocol.timestamp(), "message": message, "resultPaths": paths])
        let receipt = try JSONDecoder().decode(TaskReceipt.self, from: data)
        try await store.writeJSON(receipt, path: ".mobile/receipts/" + request.id + ".json")
    }
}

final class UXModelFixtureProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "fixture.thewayhere.invalid" && CommandLine.arguments.contains("--uitest") }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let mode = ProcessInfo.processInfo.environment["TWH_UI_MODEL_FIXTURE"] ?? "success"
        let failure = mode == "failure" || mode.hasPrefix("failure-")
        let status = failure ? Int(mode.replacingOccurrences(of: "failure-", with: "")) ?? 503 : 200
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "text/event-stream"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        if !failure {
            let paragraphs = ["这是匿名验收生成的草稿。", "所有人物和经历都明确标注为虚构。"]
            if request.value(forHTTPHeaderField: "Accept") == "text/event-stream" {
                for text in paragraphs {
                    let json = try! JSONSerialization.data(withJSONObject: ["choices": [["delta": ["content": text]]]])
                    client?.urlProtocol(self, didLoad: Data("data: ".utf8) + json + Data("\n\n".utf8))
                }
                client?.urlProtocol(self, didLoad: Data("data: [DONE]\n\n".utf8))
            } else {
                let data = try! JSONSerialization.data(withJSONObject: ["choices": [["message": ["content": paragraphs.joined(separator: "\n\n")]]]])
                client?.urlProtocol(self, didLoad: data)
            }
        }
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

struct UXVerificationScreen: View {
    @EnvironmentObject private var model: AppModel
    let screen: String
    @State private var reviewedText = "匿名验收日记草稿：这些文字仅来自显式的虚构测试资料。"
    @State private var selected: Set<String> = []
    @State private var images = false
    @State private var names = true
    @State private var clues = true
    private var photo: PhotoDraft? { model.photos.first { $0.id == UXVerificationFixtures.photoID } }
    private var sampleImage: UIImage { UXVerificationFixtures.image() }
    var body: some View {
        Group {
            switch screen {
            case "ONB-2": CloudConnectionView()
            case "ONB-3": SpacesView()
            case "ONB-4": CreateSpaceView()
            case "ONB-5": PermissionsView()
            case "ONB-6": ModelSettingsView()
            case "NOW-3", "SYS-3": RecordingView()
            case "NOW-4": WritingView()
            case "NOW-5": FolderPickerView { model.folder = $0 }
            case "NOW-6": DraftResultView(text: $reviewedText, bound: model.boundSpace)
            case "NOW-8": HistoryView()
            case "NOW-9": if let draft = model.drafts.first(where: { $0.id == "anonymous-capture-draft" }) { CaptureHistoryDetail(draft: draft, bound: model.boundSpace) }
            case "PHO-1": PhotoFlowView()
            case "PHO-2", "PHO-3", "PHO-7", "PHO-8", "PHO-10", "PHO-11", "PHO-12": if let photo { PhotoFlowView(initialDraft: photo) }
            case "PHO-4": if let face = photo?.photos.first?.faces.first { FaceNamingView(face: face, existing: [], crop: LocalFaceComparison.crop(sampleImage, face: face), people: model.documents.filter { $0.category == "entities" }) { face in updateFace(face) } }
            case "PHO-5": if let photo { ManualFaceSelectionView(image: sampleImage, existing: photo.photos.first?.faces ?? []) { face, replacing in appendFace(face, replacing: replacing) } }
            case "PHO-6": if let photo, let face = photo.photos.first?.faces.first {
                PhotoCandidatesView(name: "匿名朋友", candidates: photo.photos.dropFirst().flatMap { photo in photo.faces.compactMap { face in LocalFaceComparison.crop(sampleImage, face: face).map { PhotoFaceCandidate(photoID: photo.id, face: face, crop: $0) } } }) { selected in
                    var source = face; source.name = "匿名朋友"; updateFace(source, including: selected)
                }
            }
            case "PHO-9": PhotoSendOptions(draft: photo, store: model.store, selected: $selected, allowImages: $images, includeClues: $clues, includeNames: $names, clues: "完全虚构的匿名线索") { model.message = "匿名发送范围已确认，未发送网络请求" }
            case "SYS-2": SystemEntriesView()
            case "SYS-4", "SYS-5": UXSystemVerificationView()
            case "SYS-6": UXShareVerificationView()
            case "recovery-letter": LetterRequestView()
            case "recovery-letter-limits": RecoveryLetterLimitVerification()
            case "recovery-photo-limited": RecoveryPhotoVerificationView()
            case "recovery-photo-denied": RecoveryPhotoVerificationView(denied:true)
            case "recovery-proof": RecoveryVerificationProof()
            case "activation-safety": ActivationSafetyVerificationView()
            case let value where value.hasPrefix("ux-completion-"): UXCompletionVerificationScreen(screen:value)
            case let value where value.hasPrefix("deep-flow-"): DeepFlowVerificationScreen(screen:value)
            case let value where value.hasPrefix("import-form-"): ImportFormCompletionVerificationScreen(screen:value)
            default: if RecordsSettingsFixtures.supports(screen) { RecordsSettingsVerificationScreen(screen: screen) } else if screen.hasPrefix("UND-") || screen.hasPrefix("CHT-") || screen.hasPrefix("FUT-") || screen == "understanding-proof" { UnderstandingVerificationScreen(screen: screen) } else { NowView() }
            }
        }.accessibilityElement(children: .contain).accessibilityIdentifier("verification-" + screen)
    }
    private func updateFace(_ face: FaceAnnotation, including ids: Set<String> = []) {
        guard var value = photo, let bound = model.boundSpace else { return }
        for photo in value.photos.indices { for index in value.photos[photo].faces.indices where value.photos[photo].faces[index].id == face.id || ids.contains(value.photos[photo].faces[index].id) { value.photos[photo].faces[index].name = face.name; value.photos[photo].faces[index].role = face.role; value.photos[photo].faces[index].personId = face.personId } }
        model.perform { try await bound.store.savePhotoDraft(value); model.photos = try await bound.store.photoDrafts() }
    }
    private func appendFace(_ face: FaceAnnotation, replacing: String?) {
        guard var value = photo, !value.photos.isEmpty, let bound = model.boundSpace else { return }
        if let replacing { value.photos[0].faces.removeAll { $0.id == replacing } }; value.photos[0].faces.append(face)
        model.perform { try await bound.store.savePhotoDraft(value); model.photos = try await bound.store.photoDrafts() }
    }
}

private struct UXSystemVerificationView: View {
    @EnvironmentObject private var model: AppModel
    var body: some View { List {
        Text("匿名系统投影验收 · 与生产共用呈现规则，不写入系统快捷菜单或 App Group")
        if let presentation {ForEach(presentation.shortcuts) {item in Text(MobileL10n.text(item.titleKey)).accessibilityIdentifier("fixture-shortcut-"+item.action)}}
        if let person = model.documents.first(where: { $0.category == "entities" }), let space = model.active?.id {
            Button("打开绑定的匿名人物通知入口") { model.handleURL(SystemDestination.url(route: "document", space: space, target: person.path)) }
            Button("切换第二匿名空间后打开原空间通知") { model.perform { try await model.createSpace(name: "匿名第二空间", nickname: "", cloud: false); model.handleURL(SystemDestination.url(route: "document", space: space, target: person.path)) } }
        }
        if let presentation,let target=presentation.latestUnreadLetterPath {Button("打开最近未读回信") {model.handleURL(SystemDestination.url(route:"letter",space:presentation.space,target:target))}}
        if let task = model.tasks.first { NavigationLink("查看匿名任务真实状态") { MobileTaskDetailView(task: task) } }
    }.navigationTitle("匿名系统投影与入口验收") }
    private var presentation:SystemPresentation? {guard let space=model.active else{return nil};return model.systemPresentation(requests:model.tasks,receipts:model.receipts,documents:model.documents,space:space)}
}
private struct UXShareVerificationView: View {
    @State private var sharing = false
    var body: some View {
        VStack(spacing: 20) { Text("匿名分享验收 · 只使用测试绘制图片与文字"); Button("打开系统分享面板") { sharing = true } }
            .sheet(isPresented: $sharing) { UXNativeShareSheet() }
    }
}
private struct UXNativeShareSheet: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: ["Anonymous native share fixture.", UXVerificationFixtures.image()], applicationActivities: nil) }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
