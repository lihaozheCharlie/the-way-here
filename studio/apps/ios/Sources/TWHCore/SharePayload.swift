import Foundation

public struct SharePayload: Codable {
    public var id: String; public var createdAt: String; public var text: String; public var attachments: [String]; public var folder: String; public var kind: String; public var note: String
    public var knowledgeBaseId: String?
    public init(id: String, createdAt: String, text: String, attachments: [String], folder: String, kind: String, note: String, knowledgeBaseId: String? = nil) { self.id = id; self.createdAt = createdAt; self.text = text; self.attachments = attachments; self.folder = folder; self.kind = kind; self.note = note; self.knowledgeBaseId = knowledgeBaseId }
}
