import SwiftUI
import TWHCore

/// Fictional, local-only acceptance data. Never called outside an explicitly isolated UI fixture.
@MainActor enum UnderstandingVerificationFixtures {
    static let prefix = "understanding"
    static let oldDraft = "understanding-existing-capture"
    static let oldText = "Anonymous existing capture must survive"
    static let quote = "Anonymous excerpt to edit"
    static let conversationID = "understanding-conversation"
    static var screenshotMatrix: [String: String] {
        var matrix: [String: String] = [:]
        for id in 1...18 { matrix["UND-\(id)"] = "UnderstandingVerificationScreen → real native view; see UnderstandingAcceptanceTests for state actions" }
        for id in 1...8 { matrix["CHT-\(id)"] = "UnderstandingVerificationScreen → real native view; CHT-5/6/7/8 require in-view interaction" }
        for id in 1...6 { matrix["FUT-\(id)"] = "UnderstandingVerificationScreen → real native view; FUT-2/4 require in-view interaction" }
        return matrix
    }
    static func seed(model: AppModel, bound: BoundSpace, scenario: String) async throws {
        guard scenario.hasPrefix(prefix) else { return }
        guard UXVerificationFixtures.enabled, let fixture = ProcessInfo.processInfo.environment["TWH_UI_TEST_FIXTURE"], model.localRoot.path.contains("/UIFixtures/" + fixture + "/Spaces"), model.active?.cloud == nil, !bound.manifest.readOnly else { throw MobileError.unavailable("Understanding fixtures require an isolated local test space.") }
        let wiki = bound.manifest.wikiPath
        let original = try await bound.store.saveOriginal(text: "Anonymous fictional evidence: I stayed up after a busy day, then felt tired. No real person or history.", folder: "匿名验收", title: "匿名依据")
        let ref: [String: Any] = ["id": "u-ref", "path": original, "title": "匿名依据", "date": "2026-10-01", "excerpt": "Anonymous fictional evidence.", "isSource": true]
        let categories = [("personal-lines", "匿名人生主线"), ("cycles", "匿名重复循环"), ("systems", "匿名现实系统"), ("mental-models", "匿名思维模型")]
        var pages: [[String: Any]] = [], cards: [[String: Any]] = []
        for (category, title) in categories {
            let path = wiki + "/" + title + ".md"
            let heading = category == "systems" ? "作息与恢复" : "明确的理解"
            try await write("# \(title)\n\n这是完全虚构的匿名验收理解。\n\n## \(heading)\n\n这里只使用明确的虚构依据。\n", path: path, bound: bound)
            pages.append(["relativePath": path, "category": category])
            var card: [String: Any] = ["id": category, "title": title, "excerpt": "这是完全虚构的匿名验收理解。", "category": category, "path": path, "sections": [["heading": heading, "body": "这里只使用明确的虚构依据。"]], "evidence": [ref], "confidence": "待更多记录核对", "hitCount": 2]
            if category == "cycles" { card["cycle"] = ["steps": [("trigger", "触发", "虚构的忙碌一天"), ("response", "反应", "虚构的推迟休息"), ("relief", "短期结果", "虚构的短时放松"), ("cost", "长期代价", "虚构的第二天疲劳"), ("return", "再次触发", "虚构的疲劳影响节奏")].map { ["id": $0.0, "label": $0.1, "body": $0.2] }, "occurrenceCount": 2, "experiment": "虚构的小实验：今晚提前十分钟结束屏幕使用。"] }
            cards.append(card)
        }
        let secondPath = wiki + "/匿名第二主线.md"
        try await write("# 匿名第二主线\n\n第二张明确虚构的卡片，用于左右翻页验收。", path: secondPath, bound: bound)
        pages.append(["relativePath": secondPath, "category": "personal-lines"])
        cards.append(["id": "second-line", "title": "匿名第二主线", "excerpt": "第二张明确虚构的卡片，用于左右翻页验收。", "category": "personal-lines", "path": secondPath, "sections": [], "evidence": [ref]])
        let person = wiki + "/匿名朋友.md", letter = wiki + "/匿名回信.md"
        pages += [["relativePath": person, "category": "entities"], ["relativePath": letter, "category": "letters"]]
        let paragraphs = (1...18).map { "第\($0)段。测试者，这是完全虚构的长信，只用于核对阅读字号、滚动与保存位置。你可以慢慢读这一段匿名材料。" }
        try await write("---\nvoice: 老朋友\nperspective: fictional\n---\n# 匿名回信\n\n" + paragraphs.joined(separator: "\n\n") + "\n\n> Anonymous original quotation.\n\n匿名老朋友", path: letter, bound: bound)
        let topic: [String: Any] = ["directions": ["工作"], "id": "anonymous-topic", "title": "匿名话题", "question": "这个虚构的片刻，让你想到什么？", "reason": "匿名验收材料", "currentUnderstanding": "只是依据匿名材料的推断。", "unknown": "我们还不知道虚构人物当时的感受。"]
        var projectedTopic = topic; projectedTopic["evidence"] = [ref]
        var nodes: [[String: Any]] = []
        for (offset, lane) in ["工作线", "关系线", "健康线"].enumerated() {
            let path = wiki + "/匿名节点\(offset).md"
            try await write("# 匿名节点\(offset)\n\n虚构的\(lane)经历。", path: path, bound: bound)
            pages.append(["relativePath": path, "category": "timeline"])
            nodes.append(["id": "node-\(offset)", "path": path, "title": "匿名节点\(offset)", "date": "2026-10-0\(offset+1)", "start": "2026-10-0\(offset+1)", "end": "", "excerpt": "虚构的\(lane)经历。", "lane": lane, "turning": offset == 0, "before": "虚构的转折前：忙碌时没有休息安排。", "after": "虚构的转折后：明确留出休息时间。", "sections": [["heading": "明确发生", "body": "这是匿名虚构节点。"]], "evidence": [ref], "people": [["id": "u-person", "path": person, "title": "匿名朋友", "date": "2026-10-01", "excerpt": "虚构朋友", "isSource": false]]])
        }
        let snapshot: [String: Any] = ["version": 1, "knowledgeBaseId": bound.manifest.id, "updatedAt": MobileProtocol.timestamp(), "macVersion": "development", "protocolVersion": 1, "capabilities": TaskKind.allCases.map(\.rawValue), "pages": pages, "topics": [topic]]
        try await writeJSON(snapshot, path: ".mobile/snapshot.json", bound: bound)
        let projection: [String: Any] = ["version": 1, "knowledgeBaseId": bound.manifest.id, "updatedAt": MobileProtocol.timestamp(), "sourceCount": 36, "coverageFrom": "2026-01-01", "cards": cards, "topics": [projectedTopic], "people": [["id": "u-person", "path": person, "title": "匿名朋友", "group": "朋友", "mentionCount": 4, "lastMention": "2026-10-01", "evidence": [ref], "events": [ref]]], "stages": [], "nodes": nodes, "letters": [["id": "u-letter", "path": letter, "title": "匿名回信", "date": "2026-10-01", "excerpt": "这是完全虚构的长信。", "evidence": [ref], "voice": "老朋友", "perspective": "匿名观察者", "referenceCount": 1]]]
        try await writeJSON(projection, path: ".mobile/understanding.json", bound: bound)
        let archive = ConversationArchive(id: conversationID, knowledgeBaseId: bound.manifest.id, title: "匿名话题", updatedAt: MobileProtocol.timestamp(), messages: [ChatMessage(role: "assistant", content: "这里只讨论虚构匿名材料。"), ChatMessage(role: "user", content: quote)], context: "这个虚构的片刻，让你想到什么？", evidence: "只是依据匿名材料的推断。")
        try await bound.store.writeJSON(archive, path: ".mobile/conversations/" + conversationID + ".json")
        let draft = Draft(space: bound.manifest.id, text: oldText, folder: "随手记", id: oldDraft)
        try await bound.store.saveDraft(draft)
        model.draftId = draft.id; model.draftText = draft.text; model.folder = draft.folder
        let scenarios: [[String: Any]] = (1...3).map { offset -> [String: Any] in
            let dimensions: [[String: Any]] = [["id": "health", "gains": ["虚构收获：多休息"], "costs": ["虚构代价：少一点自由时间"]]]
            return ["id": "scenario-\(offset)", "title": "匿名路径\(offset)", "overview": "明确标为虚构的不同路径。", "confidence": "存在不确定性", "unknowns": ["虚构环境是否变化"], "dimensions": dimensions, "stages": [["period": "months0_3", "change": "虚构的近期改变", "condition": "虚构条件"], ["period": "years1_3", "change": "虚构的长期改变", "condition": "虚构条件"]]]
        }
        let prediction: [String: Any] = ["knowledgeBaseId": bound.manifest.id, "generatedAt": MobileProtocol.timestamp(), "thoughts": "匿名虚构想法", "question": "匿名问题：尝试新的安排会怎样？", "requestedTimeRange": "半年", "understanding": ["score": 72, "unlocked": true, "facets": [["id": "records", "label": "匿名记录覆盖", "value": 18, "max": 25, "gaps": ["仍需更多虚构的日常细节"]]]], "report": ["current": "虚构现状，不能当作真实人生预测。", "scenarios": scenarios, "evidence": [["id": "e1", "pageId": original, "quote": "Anonymous fictional evidence."]]]]
        try await writeJSON(prediction, path: ".mobile/prediction.json", bound: bound)
        _ = try await bound.store.saveOriginal(text: "Anonymous explicit idea acceptance", folder: "想法", title: "匿名最近想法")
    }
    static func archive(_ model: AppModel) -> ConversationArchive? {
        guard let bound = model.boundSpace else { return nil }
        return ConversationArchive(id: conversationID, knowledgeBaseId: bound.manifest.id, title: "匿名话题", updatedAt: MobileProtocol.timestamp(), messages: [ChatMessage(role: "assistant", content: "这里只讨论虚构匿名材料。"), ChatMessage(role: "user", content: quote)], context: "这个虚构的片刻，让你想到什么？", evidence: "只是依据匿名材料的推断。")
    }
    private static func writeJSON(_ value: [String: Any], path: String, bound: BoundSpace) async throws { let data = try JSONSerialization.data(withJSONObject: value); let url = try await bound.store.url(path); try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true); try data.write(to: url) }
    private static func write(_ text: String, path: String, bound: BoundSpace) async throws { let url = try await bound.store.url(path); try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true); try Data(text.utf8).write(to: url) }
}

struct UnderstandingVerificationScreen: View {
    @EnvironmentObject private var model: AppModel
    var screen: String
    @State private var projection: UnderstandingProjection?
    @State private var conversation: ConversationArchive?
    @ViewBuilder var body: some View {
        Group {
            switch screen {
            case "CHT-1", "CHT-2": TopicsView()
            case "CHT-3": if let topic = model.snapshot?.topics.first { TopicDetailView(topic: topic) }
            case "CHT-4", "CHT-5", "CHT-6", "CHT-7", "CHT-8": if let conversation { ConversationView(title: conversation.title, context: "", evidence: "", restored: conversation) } else { ProgressView("Loading anonymous conversation") }
            case "UND-1": UnderstandingView()
            case "UND-2": SelfUnderstandingView()
            case "UND-3", "UND-4", "UND-5", "UND-6": if let document = model.documents.first(where: { $0.category == ["UND-3": "personal-lines", "UND-4": "cycles", "UND-5": "systems", "UND-6": "mental-models"][screen] }) { StructuredUnderstandingView(document: document) }
            case "UND-7", "UND-9": TimelineView()
            case "UND-8": if let node = projection?.nodes?.first { MobileNodeDetailView(node: node) } else { ProgressView("Loading anonymous timeline node") }
            case "UND-10": LettersView()
            case "UND-11": if let letter = model.documents.first(where: { $0.category == "letters" }) { MobileLetterReader(document: letter) }
            case "UND-12", "UND-13", "UND-14", "UND-15": LettersView()
            case "UND-16": PeopleView()
            case "UND-17": if let person = model.documents.first(where: { $0.category == "entities" }) { PersonView(document: person) }
            case "UND-18": if let document = model.documents.first(where: { $0.category == "personal-lines" }) { CorrectionView(document: document) }
            case "FUT-1", "FUT-2", "FUT-3", "FUT-4", "FUT-5", "FUT-6": FutureView()
            case "understanding-proof": UnderstandingPersistenceProof()
            default: Text("Unknown anonymous understanding fixture")
            }
        }.task { do { projection = try await UnderstandingProjection.load(model.boundSpace); if let bound = model.boundSpace { conversation = try JSONDecoder().decode(ConversationArchive.self, from: await bound.store.read(".mobile/conversations/" + UnderstandingVerificationFixtures.conversationID + ".json")) } } catch { model.error = error.localizedDescription } }
    }
}

/// Reads saved files after a fresh app launch; assertions cannot pass merely from in-memory view state.
private struct UnderstandingPersistenceProof: View {
    @EnvironmentObject private var model: AppModel
    @State private var flags: [String] = []
    var body: some View { List(flags, id: \.self) { flag in Text(flag).accessibilityIdentifier(flag) }.navigationTitle("Anonymous persisted proof").task {
        do {
            guard UXVerificationFixtures.enabled, let bound = model.boundSpace, model.active?.cloud == nil else { return }
            let drafts = try await bound.store.drafts(), docs = try await bound.store.documents(), requests = try await bound.store.requests()
            if drafts.contains(where: { $0.id == UnderstandingVerificationFixtures.oldDraft && $0.text == UnderstandingVerificationFixtures.oldText }) { flags.append("proof.oldCapturePreserved") }
            if drafts.contains(where: { $0.id != UnderstandingVerificationFixtures.oldDraft && $0.kind == "conversation-excerpt" && $0.text == UnderstandingVerificationFixtures.quote && $0.knowledgeBaseId == bound.manifest.id }) { flags.append("proof.excerptIndependent") }
            if docs.contains(where: { $0.bodyMarkdown.contains("分块：作息与恢复") && $0.bodyMarkdown.contains("Anonymous speech fixture") }) { flags.append("proof.sectionVoiceSaved") }
            if docs.contains(where: { $0.bodyMarkdown.contains("Anonymous correction acceptance") }), requests.isEmpty { flags.append("proof.correctionBound") }
            if requests.isEmpty { flags.append("proof.noTaskRequests") }
            if docs.contains(where: { $0.bodyMarkdown.contains("Anonymous newly recorded idea") }) { flags.append("proof.localIdeaSaved") }
            flags.append("proof.loadedFromDisk")
        } catch { flags = ["proof.error:" + error.localizedDescription] }
    } }
}
