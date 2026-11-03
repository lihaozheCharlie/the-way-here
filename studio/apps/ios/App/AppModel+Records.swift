import SwiftUI
import TWHCore

extension AppModel {
    func recordCategory(_ document: TWHCore.Document) -> String {
        if document.path.contains("账单") || document.markdown.contains("import_channel: alipay") { return "账单" }
        if document.path.contains("照片") { return "照片" }
        if document.path.contains("聊天") || document.markdown.range(of: #"import_channel:\s*"?(chatgpt|claude|gemini|deepseek|doubao|other-ai)"#, options: .regularExpression) != nil { return "聊天" }
        if document.path.contains("对话") { return "对话" }
        return "笔记"
    }
    func recordOrigin(_ document: TWHCore.Document) -> String {
        if drafts.contains(where: { $0.savedPath == document.path && $0.kind == "voice" }) { return "语音" }
        return recordCategory(document) == "笔记" ? "文字" : recordCategory(document)
    }
    func recordLinks(_ document: TWHCore.Document) -> [TWHCore.Document] {
        let paths = Set(snapshot?.pages.filter { $0.links?.contains(document.path) == true }.map(\.relativePath) ?? [])
        return documents.filter { !$0.isSource && (paths.contains($0.path) || $0.markdown.contains(document.path)) }
    }
    func recordStatus(_ document: TWHCore.Document) -> String {
        if document.path.contains(".conflict-") { return "同步冲突" }
        return "已保存"
    }
}
