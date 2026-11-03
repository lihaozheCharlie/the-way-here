import SwiftUI
import TWHCore

/// Anonymous foreground regression data, scoped by the existing UI-fixture boundary.
@MainActor enum DeepFlowFixtures {
    static let conflictTitle = "Anonymous deep conflict"
    static let conversationTitle = "Anonymous selected quotations"
    static let localSecond = "LOCAL SECOND paragraph to exclude."
    static let remoteSecond = "REMOTE SECOND paragraph to retain."
    static let localThird = "LOCAL THIRD paragraph to retain."
    static let remoteThird = "REMOTE THIRD paragraph to exclude."
    static let keep = "KEEP QUOTATION: In this entirely fictional conversation I learned to pause before making a decision, write down the specific question, and leave enough time to consider a different possibility without rushing to an answer."
    static let exclude = "EXCLUDE QUOTATION: This entirely fictional sentence is deliberately long enough to wrap across several lines, so the regression must reach its actual switch and turn it off rather than accidentally touching a neighbouring choice."
    static let transcriptOnly = "TRANSCRIPT ONLY: This assistant message must never enter the selected-quotation record."
    static let marker = ".mobile/deep-flow-fixture.json"
    static func seed(model: AppModel, bound: BoundSpace, scenario: String) async throws {
        guard scenario == "deep-flow-conflict" || scenario == "deep-flow-quotes" else { return }
        try validate(model, bound)
        let path = try await bound.store.importNamedSourceFile(data: Data(("# " + conflictTitle + "\n\nInitial fictional paragraph.").utf8), filename: "Deep-conflict.md", folder: "Deep flow")
        let original = try await bound.store.read(path)
        try await bound.store.saveEdit(path: path, expectedHash: MobileProtocol.hash(original), markdown: "# " + conflictTitle + "\n\n" + remoteSecond + "\n\n" + remoteThird)
        do { try await bound.store.saveEdit(path: path, expectedHash: MobileProtocol.hash(original), markdown: "# " + conflictTitle + "\n\n" + localSecond + "\n\n" + localThird) } catch MobileError.conflict { }
        try await bound.store.writeJSON(["path": path], path: marker)
    }
    static func validate(_ model: AppModel, _ bound: BoundSpace) throws {
        guard UXVerificationFixtures.enabled, let fixture = ProcessInfo.processInfo.environment["TWH_UI_TEST_FIXTURE"], fixture.hasPrefix("deep-flow-"), UUID(uuidString: String(fixture.dropFirst("deep-flow-".count))) != nil, model.localRoot.path.contains("/UIFixtures/" + fixture + "/Spaces"), model.active?.cloud == nil, !bound.manifest.readOnly else { throw MobileError.unavailable("Deep flow requires its isolated anonymous UI fixture.") }
    }
    static func archive(_ bound: BoundSpace) -> ConversationArchive {
        ConversationArchive(id: "deep-flow-quotes", knowledgeBaseId: bound.manifest.id, title: conversationTitle, updatedAt: MobileProtocol.timestamp(), messages: [ChatMessage(role: "assistant", content: transcriptOnly), ChatMessage(role: "user", content: exclude), ChatMessage(role: "user", content: keep)], savedQuotes: [exclude, keep])
    }
}

struct DeepFlowVerificationScreen: View {
    @EnvironmentObject private var model: AppModel
    var screen: String
    @State private var checks: [String] = []
    var body: some View {
        Group {
            if screen == "deep-flow-conflict", let bound = model.boundSpace, let conflict = model.documents.first(where: { $0.path.contains("Deep-conflict.conflict-") }) {
                ExistingRecordConflictView(document: conflict, bound: bound)
            } else if screen == "deep-flow-quotes", let bound = model.boundSpace {
                ConversationView(title: DeepFlowFixtures.conversationTitle, context: "", evidence: "", restored: DeepFlowFixtures.archive(bound))
            } else if screen == "deep-flow-proof" {
                List(checks, id: \.self) { Text($0).accessibilityIdentifier($0) }.navigationTitle("Anonymous deep flow proof")
            } else { Text("Anonymous flow completed") }
        }.task {
            guard screen == "deep-flow-proof" else { return }
            do {
                guard let bound = model.boundSpace else { return }
                try DeepFlowFixtures.validate(model, bound)
                let docs = try await bound.store.documents()
                if let expected = ProcessInfo.processInfo.environment["TWH_UI_DEEP_EXPECTED_TEXT"], !expected.isEmpty {
                    let object = try JSONDecoder().decode([String: String].self, from: await bound.store.read(DeepFlowFixtures.marker))
                    if let path = object["path"], try await bound.store.read(path) == Data(expected.utf8) { checks.append("deep.conflict-exact-edited-bytes") }
                    if !docs.contains(where: { $0.path.contains("Deep-conflict.conflict-") }) { checks.append("deep.conflict-copy-resolved") }
                }
                let selected = docs.filter { $0.title == DeepFlowFixtures.conversationTitle }
                let expectedQuote = "# " + DeepFlowFixtures.conversationTitle + "\n\n" + DeepFlowFixtures.keep + "\n"
                if selected.count == 1, selected[0].markdown == expectedQuote { checks.append("deep.only-selected-quote-exact") }
                if try await bound.store.requests().isEmpty { checks.append("deep.no-tasks") }
                checks.append("deep.reloaded-real-files")
            } catch { checks = ["deep.error:" + error.localizedDescription] }
        }
    }
}
