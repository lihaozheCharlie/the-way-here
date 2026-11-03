import Foundation
import TWHCore

struct FrozenLetterRecord: Identifiable, Codable, Equatable {
    var id: String { path }
    let path: String
    let title: String
    let hash: String
    let text: String
    init(_ document: TWHCore.Document) { path = document.path; title = document.title; hash = document.hash; text = document.bodyMarkdown }
}

struct LetterAttachmentPayload {
    let text: String
    let pathsJSON: String
    init(question: String, conversation: String?, records: [FrozenLetterRecord]) throws {
        let attachments = records.map { "来源：\($0.path)\n内容哈希：\($0.hash)\n\($0.text)" }.joined(separator: "\n\n---\n\n")
        text = (question.isEmpty ? "写一封近况回信" : question) + (conversation.map { "\n\n用户选择附带的最近对话原话：\n" + $0 } ?? "") + (records.isEmpty ? "" : "\n\n用户明确选择附带的来源原话（冻结内容）：\n" + attachments)
        pathsJSON = String(decoding: try JSONEncoder().encode(records.map(\.path)), as: UTF8.self)
        guard text.count <= 50_000 else { throw MobileError.invalidData("问题与附加原话合计超过 50,000 字，请减少材料后再提交。问题与选择仍保留。") }
        guard pathsJSON.count <= 2_000 else { throw MobileError.invalidData("附加记录的路径合计过长，请减少勾选后再提交。问题与选择仍保留。") }
    }
}
