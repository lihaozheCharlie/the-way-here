import SwiftUI
import TWHCore
import UIKit

/// Local fixtures for real UI actions. This does not run in ordinary or cloud acceptance mode.
@MainActor enum UXCompletionFixtures {
    static let context = "UX_COMPLETION_USER_CONTEXT: a wholly fictional quiet afternoon."
    static let secondMessage = "UX_COMPLETION_SECOND_USER: continue this fictional thought."
    static let photoA = "ux-completion-photo-a", photoB = "ux-completion-photo-b"
    static let storyA = "GROUP_A_CURRENT_INPUT: fictional afternoon by the painted river."
    static let storyB = "GROUP_B_CURRENT_INPUT: fictional morning in the imaginary garden."
    static let cluesA = "CLUES_A_ONLY: fictional orange umbrella."
    static let cluesB = "CLUES_B_ONLY: fictional blue notebook."
    static let originalA = "GROUP_A_FIRST_ORIGINAL: immutable fictional first telling."
    static let originalB = "GROUP_B_FIRST_ORIGINAL: immutable fictional first telling."
    static let nameA = "Fictional Alex A", nameB = "Fictional Bailey B"
    static let recordTitle = "UX COMPLETION SHARED TITLE"
    static let bodyA = "ORIGINAL_SPACE_A_EXACT_BODY: this fictional record belongs only to A."
    static let bodyB = "OTHER_SPACE_B_EXACT_BODY: this distinct fictional record belongs only to B."
    struct Plan: Codable {
        var originalID: String; var originalDirectory: String; var otherID: String; var otherDirectory: String
        var originalPath: String; var otherPath: String
        var copiedURL: String?; var switchedToOther = false
    }
    static func matches(_ scenario: String) -> Bool { scenario.hasPrefix("ux-completion-") }
    static func checkedBase(_ model: AppModel) throws -> URL {
        guard UXVerificationFixtures.enabled,
              let fixture = ProcessInfo.processInfo.environment["TWH_UI_TEST_FIXTURE"], MobileProtocol.validID(fixture),
              matches(ProcessInfo.processInfo.environment["TWH_UI_TEST_SCENARIO"] ?? ""),
              model.localRoot.path.contains("/UIFixtures/" + fixture + "/Spaces"), model.cloudRoot == nil,
              model.active?.cloud == nil else { throw MobileError.invalidPath }
        return model.localRoot.deletingLastPathComponent()
    }
    static func plan(_ model: AppModel) throws -> Plan {
        let result = try JSONDecoder().decode(Plan.self, from: Data(contentsOf: checkedBase(model).appendingPathComponent("ux-completion-plan.json")))
        guard [result.originalID,result.otherID,result.originalDirectory,result.otherDirectory].allSatisfy(MobileProtocol.validID),
              MobileProtocol.validPath(result.originalPath), MobileProtocol.validPath(result.otherPath) else { throw MobileError.invalidPath }
        return result
    }
    static func store(_ model: AppModel, directory: String) throws -> SpaceStore {
        _ = try checkedBase(model)
        guard MobileProtocol.validID(directory) else { throw MobileError.invalidPath }
        let root = model.localRoot.appendingPathComponent(directory)
        let manifest = try JSONDecoder().decode(SpaceManifest.self, from: Data(contentsOf: root.appendingPathComponent("mobile-space.json")))
        return try SpaceStore(root: root, manifest: manifest, deviceId: model.deviceId)
    }
    static func seed(model: AppModel, bound: BoundSpace, scenario: String) async throws {
        guard matches(scenario) else { return }
        let base = try checkedBase(model)
        let originalPath = try await bound.store.importNamedSourceFile(data: Data(("# " + recordTitle + "\n\n" + bodyA).utf8), filename: "UX-completion-record.md", folder: "Fictional completion")
        let otherID = "ux-other-" + UUID().uuidString.lowercased()
        let other = try SpaceStore(root: model.localRoot.appendingPathComponent(otherID), manifest: SpaceManifest(id: otherID, name: "Fictional completion B"), deviceId: model.deviceId)
        try await other.initialize()
        let otherPath = try await other.importNamedSourceFile(data: Data(("# " + recordTitle + "\n\n" + bodyB).utf8), filename: "UX-completion-record.md", folder: "Fictional completion")
        let info = Plan(originalID: bound.manifest.id, originalDirectory: bound.store.root.lastPathComponent, otherID: otherID, otherDirectory: otherID, originalPath: originalPath, otherPath: otherPath)
        try MobileProtocol.encoder().encode(info).write(to: base.appendingPathComponent("ux-completion-plan.json"), options: .atomic)
        let capture = Draft(space: bound.manifest.id, text: context, folder: "随手记", id: "ux-completion-context")
        try await bound.store.saveDraft(capture)
        let internalTimestamp = MobileProtocol.timestamp((MobileProtocol.date(capture.updatedAt) ?? Date()).addingTimeInterval(10))
        for isA in [true,false] {
            var draft = PhotoDraft(space: bound.manifest.id)
            draft.id = isA ? photoA : photoB; draft.title = isA ? "Fictional photo group A" : "Fictional photo group B"
            draft.story = isA ? storyA : storyB; draft.date = "2026-10-01"; draft.location = "Fictional location"
            draft.step = scenario == "ux-completion-photo-stop" && isA ? 3 : 0
            var face = FaceAnnotation(x: 0.3, y: 0.14, width: 0.38, height: 0.55)
            face.name = isA ? nameA : nameB; face.role = "朋友"
            let path = try await bound.store.savePhoto(UXVerificationFixtures.image().jpegData(compressionQuality:0.8)!, draftId:draft.id)
            draft.photos = [MemoryPhoto(path:path,faces:[face])]
            try await bound.store.savePhotoDraft(draft)
            // These intentionally outrank capture input, proving activation filters
            // internal drafts instead of relying on incidental timestamp order.
            for (suffix, text, kind) in [("-photo-clues", isA ? cluesA : cluesB, "photo"), ("-story-source", isA ? originalA : originalB, "photo"), ("-pre-generation", isA ? storyA : storyB, "photo"), ("-acceptance-review", "Fictional generated review excluded from automatic capture restore.", "generated-review")] {
                var internalDraft = Draft(space: bound.manifest.id, text: text, folder: "照片回忆", kind: kind, id: draft.id + suffix)
                internalDraft.updatedAt = internalTimestamp
                try await bound.store.saveDraft(internalDraft)
            }
        }
    }
    static func configure(model: AppModel, scenario: String) async throws -> Bool {
        guard matches(scenario) else { return false }
        _ = try checkedBase(model)
        let info = try plan(model)
        // Register only this test's slow .invalid transport; production ModelClient still parses real SSE.
        if let bound = model.boundSpace {
            UXCompletionSSEProtocol.configure(recording: bound.store.root.appendingPathComponent(".mobile/ux-completion-request.json"))
            URLProtocol.registerClass(UXCompletionSSEProtocol.self)
        }
        try await model.discover()
        let screen = ProcessInfo.processInfo.environment["TWH_UI_TEST_SCREEN"] ?? "ux-completion-records"
        if screen == "ux-completion-writing" {
            guard let draft = model.drafts.first(where: {$0.id == "ux-completion-context"}) else { throw MobileError.invalidData("Missing fictional completion draft.") }
            model.draftText = draft.text; model.draftId = draft.id; model.folder = draft.folder
        }
        guard model.active?.id == info.originalID else { throw MobileError.invalidData("Completion fixture opened a different anonymous space.") }
        model.systemDestination = SystemDestination(route:"verification",space:info.originalID,target:screen)
        return true
    }
    static func openCopiedLinkFromOtherSpace(_ model: AppModel) async throws {
        var info = try plan(model)
        guard let raw = UIPasteboard.general.string, let url = URL(string:raw),
              raw == SystemDestination.url(route:"document",space:info.originalID,target:info.originalPath).absoluteString else { throw MobileError.invalidData("The actual copied record link did not match the original fictional record.") }
        guard let other = model.spaces.first(where: {$0.id == info.otherID}) else { throw MobileError.invalidPath }
        try await model.activate(other)
        guard model.active?.id == info.otherID else { throw MobileError.invalidData("The second fictional space was not activated.") }
        info.copiedURL = raw; info.switchedToOther = true
        try MobileProtocol.encoder().encode(info).write(to: checkedBase(model).appendingPathComponent("ux-completion-plan.json"), options:.atomic)
        model.handleURL(url)
    }
}

/// Delayed chunks make user Stop testable; all bytes remain local and fictional.
final class UXCompletionSSEProtocol: URLProtocol, @unchecked Sendable {
    static let partial = "UX_COMPLETION_STREAM_PARTIAL"
    static let finalMarker = "UX_COMPLETION_STREAM_FINAL_SHOULD_NOT_APPEAR"
    private static let lock = NSLock()
    private static var recordingURL: URL?
    private var delivery: Task<Void,Never>?
    static func configure(recording url: URL) { lock.lock(); recordingURL = url; lock.unlock() }
    private static var configuredURL: URL? { lock.lock(); defer {lock.unlock()}; return recordingURL }
    override class func canInit(with request: URLRequest) -> Bool {
        let env = ProcessInfo.processInfo.environment
        return CommandLine.arguments.contains("--uitest") && env["TWH_UI_TEST_SCENARIO"]?.hasPrefix("ux-completion-") == true && request.url?.host == "fixture.thewayhere.invalid" && configuredURL != nil
    }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    private static func requestBody(_ request: URLRequest) throws -> Data {
        let limit = 8_000_000
        if let body = request.httpBody {
            guard !body.isEmpty, body.count <= limit else { throw MobileError.invalidData("Anonymous request body exceeded its fixture limit.") }
            return body
        }
        guard let stream = request.httpBodyStream else { throw MobileError.invalidData("Anonymous request body was unavailable to the fixture transport.") }
        stream.open(); defer { stream.close() }
        var body = Data(), buffer = [UInt8](repeating: 0, count: 8192)
        while true {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count < 0 { throw stream.streamError ?? MobileError.invalidData("Anonymous request stream could not be read.") }
            if count == 0 { break }
            guard body.count + count <= limit else { throw MobileError.invalidData("Anonymous request body exceeded its fixture limit.") }
            body.append(contentsOf: buffer.prefix(count))
        }
        guard !body.isEmpty else { throw MobileError.invalidData("Anonymous request stream was empty.") }
        return body
    }
    private static func record(_ body: Data, to file: URL) throws {
        guard try JSONSerialization.jsonObject(with: body) is [String: Any] else { throw MobileError.invalidData("Anonymous request body was not a JSON object.") }
        lock.lock(); defer { lock.unlock() }
        var data = FileManager.default.fileExists(atPath: file.path) ? try Data(contentsOf: file) : Data()
        data.append(body); data.append(Data("\n".utf8))
        try data.write(to: file, options: .atomic)
    }
    override func startLoading() {
        do {
            guard let file = Self.configuredURL else { throw MobileError.invalidData("Anonymous request recording was not configured.") }
            try Self.record(Self.requestBody(request), to: file)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
            return
        }
        let response = HTTPURLResponse(url:request.url!,statusCode:200,httpVersion:"HTTP/1.1",headerFields:["Content-Type":"text/event-stream"])!
        client?.urlProtocol(self,didReceive:response,cacheStoragePolicy:.notAllowed)
        delivery = Task { [weak self] in
            guard let self else { return }
            do {
                for index in 0..<2 {
                    try Task.checkCancellation()
                    let text = index == 0 ? Self.partial : " fictional-chunk-\(index)"
                    let json = try JSONSerialization.data(withJSONObject:["choices":[["delta":["content":text]]]])
                    self.client?.urlProtocol(self,didLoad:Data("data: ".utf8) + json + Data("\n\n".utf8))
                    try await Task.sleep(for:.seconds(1))
                }
                if ProcessInfo.processInfo.environment["TWH_UI_TEST_SCENARIO"] != "ux-completion-photos" { try await Task.sleep(for:.seconds(80)) }
                try Task.checkCancellation()
                let json = try JSONSerialization.data(withJSONObject:["choices":[["delta":["content":Self.finalMarker]]]])
                self.client?.urlProtocol(self,didLoad:Data("data: ".utf8) + json + Data("\n\ndata: [DONE]\n\n".utf8))
                self.client?.urlProtocolDidFinishLoading(self)
            } catch { /* URLSession cancellation owns terminal delivery. */ }
        }
    }
    override func stopLoading() { delivery?.cancel(); delivery = nil }
}

struct UXCompletionVerificationScreen: View {
    @EnvironmentObject private var model: AppModel
    let screen: String
    var body: some View { Group {
        switch screen {
        case "ux-completion-records": RecordsView().safeAreaInset(edge:.bottom) { Button("Open copied link from fictional B") { model.perform { try await UXCompletionFixtures.openCopiedLinkFromOtherSpace(model) } }.frame(minHeight:44).padding(.horizontal).background(.bar) }
        case "ux-completion-writing": WritingView()
        case "ux-completion-photos", "ux-completion-photo-review":
            if let draft = model.photos.first(where: {$0.id == UXCompletionFixtures.photoA}) { PhotoFlowView(initialDraft:draft) }
        case "ux-completion-proof": UXCompletionPersistenceProof()
        default: Text("Unknown anonymous completion screen")
        }
    } }
}

/// Proof flags are derived only by reopening actual saved records/archives/requests.
private struct UXCompletionPersistenceProof: View {
    @EnvironmentObject private var model: AppModel
    @State private var checks: [String] = []
    var body: some View { List(checks,id:\.self) { Text($0).accessibilityIdentifier($0) }.navigationTitle("Fictional persisted completion proof").task {
        do {
            let info = try UXCompletionFixtures.plan(model)
            let original = try UXCompletionFixtures.store(model,directory:info.originalDirectory)
            let other = try UXCompletionFixtures.store(model,directory:info.otherDirectory)
            let originalData = try await original.read(info.originalPath), otherData = try await other.read(info.otherPath)
            if String(decoding:originalData,as:UTF8.self).contains(UXCompletionFixtures.bodyA), String(decoding:otherData,as:UTF8.self).contains(UXCompletionFixtures.bodyB), info.switchedToOther, model.active?.id == info.originalID,
               info.copiedURL == SystemDestination.url(route:"document",space:info.originalID,target:info.originalPath).absoluteString { checks.append("completion.copied-link-bound-original") }
            let docs = try await original.documents(), drafts = try await original.drafts(), photos = try await original.photoDrafts(), requests = try await original.requests()
            if model.active?.id == info.originalID,
               let capture = drafts.first(where: { $0.id == model.draftId }),
               ["text", "voice"].contains(capture.kind), capture.visibleInCaptureHistory,
               !["saved", "discarded"].contains(model.captureStatus(capture)),
               !capture.text.isEmpty, model.draftText == capture.text {
                checks.append("completion.capture-restore-excludes-internal-drafts")
            }
            let directory = original.root.appendingPathComponent(".mobile/conversations")
            if let files = try? FileManager.default.contentsOfDirectory(at:directory,includingPropertiesForKeys:nil) {
                for file in files where file.pathExtension == "json" {
                    let archive = try JSONDecoder().decode(ConversationArchive.self,from:await original.read(".mobile/conversations/" + file.lastPathComponent))
                    if archive.messages.first?.role == "user", archive.messages.first?.content == UXCompletionFixtures.context,
                       archive.messages.contains(where: {$0.role == "user" && $0.content == UXCompletionFixtures.secondMessage}),
                       archive.messages.contains(where: {$0.role == "assistant" && $0.content.contains(UXCompletionSSEProtocol.partial) && !$0.content.contains(UXCompletionSSEProtocol.finalMarker)}), archive.knowledgeBaseId == info.originalID { checks.append("completion.conversation-user-role-and-partial-durable") }
                }
            }
            if docs.contains(where: {$0.isSource && $0.bodyMarkdown.contains("我：\n" + UXCompletionFixtures.context) && $0.bodyMarkdown.contains("AI：\n" + UXCompletionSSEProtocol.partial) && !$0.bodyMarkdown.contains("AI：\n" + UXCompletionFixtures.context) && !$0.bodyMarkdown.contains(UXCompletionSSEProtocol.finalMarker)}) { checks.append("completion.transcript-preserves-user-author") }
            if let photo = photos.first(where: {$0.id == UXCompletionFixtures.photoA}), photo.story == UXCompletionFixtures.storyA,
               drafts.contains(where: {$0.id == photo.id + "-interrupted-review" && $0.text.contains(UXCompletionSSEProtocol.partial) && !$0.text.contains(UXCompletionSSEProtocol.finalMarker)}),
               drafts.contains(where: {$0.id == photo.id + "-story-source" && $0.text == UXCompletionFixtures.originalA}),
               drafts.contains(where: {$0.id == photo.id + "-pre-generation" && $0.text == UXCompletionFixtures.storyA}) { checks.append("completion.photo-stop-current-and-partial-durable") }
            if requests.isEmpty { checks.append("completion.no-task-requests") }
            let requestFile = original.root.appendingPathComponent(".mobile/ux-completion-request.json")
            let packets = (try? String(contentsOf:requestFile,encoding:.utf8))?.split(separator:"\n").compactMap { try? JSONSerialization.jsonObject(with:Data($0.utf8)) as? [String:Any] } ?? []
            let packetText = packets.compactMap { packet -> String? in
                guard let messages = packet["messages"] as? [[String:Any]] else { return nil }
                return messages.compactMap { message -> String? in
                    if let text = message["content"] as? String { return text }
                    return (message["content"] as? [[String:Any]])?.compactMap { $0["text"] as? String }.joined(separator:"\n")
                }.joined(separator:"\n")
            }
            if packetText.contains(where: { $0.contains(UXCompletionFixtures.storyA) && $0.contains(UXCompletionFixtures.cluesA) && $0.contains(UXCompletionFixtures.nameA) && !$0.contains("GROUP_B") && !$0.contains("CLUES_B") && !$0.contains(UXCompletionFixtures.nameB) }),
               packetText.contains(where: { $0.contains(UXCompletionFixtures.storyB) && !$0.contains("GROUP_A") && !$0.contains("CLUES_A") && !$0.contains(UXCompletionFixtures.cluesB) && !$0.contains(UXCompletionFixtures.nameB) }) { checks.append("completion.photo-groups-packets-isolated") }
            if drafts.contains(where: {$0.id == UXCompletionFixtures.photoA + "-photo-clues" && $0.text == UXCompletionFixtures.cluesA}), drafts.contains(where: {$0.id == UXCompletionFixtures.photoB + "-photo-clues" && $0.text == UXCompletionFixtures.cluesB}), drafts.contains(where: {$0.id == UXCompletionFixtures.photoA + "-story-source" && $0.text == UXCompletionFixtures.originalA}), drafts.contains(where: {$0.id == UXCompletionFixtures.photoB + "-story-source" && $0.text == UXCompletionFixtures.originalB}) { checks.append("completion.photo-groups-originals-isolated") }
            let preferences = UserDefaults.standard
            if let consentA = preferences.dictionary(forKey:"photo.consent." + info.originalID + "." + UXCompletionFixtures.photoA), let consentB = preferences.dictionary(forKey:"photo.consent." + info.originalID + "." + UXCompletionFixtures.photoB), consentA["images"] as? Bool == true, consentA["clues"] as? Bool == true, consentA["names"] as? Bool == true, consentB["images"] as? Bool == false, consentB["clues"] as? Bool == false, consentB["names"] as? Bool == false { checks.append("completion.photo-group-consent-isolated") }
            checks.append("completion.loaded-from-disk")
        } catch { checks.append("completion.error:" + error.localizedDescription) }
    } }
}
