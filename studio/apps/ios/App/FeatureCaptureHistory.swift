import SwiftUI
import TWHCore
import UIKit

extension Draft {
    var visibleInCaptureHistory: Bool { kind != "photo-metadata" && !id.hasSuffix("-photo-clues") && !id.hasSuffix("-story-source") && !id.hasSuffix("-pre-generation") }
}
extension AppModel {
    func restoreCapture(_ draft:Draft, bound:BoundSpace?, edit:Bool) async throws {
        guard let bound, active?.id == bound.manifest.id else { throw MobileError.unavailable("请先回到记录所属空间，再继续编辑。") }
        if draftId != draft.id { try await saveDraft() }
        draftText = draft.text; draftId = draft.id; folder = draft.folder
        selectedTab = 0; presented = edit ? .writing : nil
    }
    func retryCapture(_ request: TaskRequest, bound: BoundSpace) async throws {
        throw MobileError.unavailable("手机不再提交远端任务，原始记录仍保留。")
    }
    func discardCapture(_ draft: Draft, bound: BoundSpace) async throws {
        if let path = draft.savedPath { try await bound.store.trash(path: path) }
        var value = draft; value.status = "discarded"; value.updatedAt = MobileProtocol.timestamp()
        try await bound.store.saveDraft(value)
        if active?.id == bound.manifest.id { if draftId == draft.id { draftText = ""; draftId = UUID().uuidString.lowercased() }; await refresh() }
    }
}

struct CaptureHistoryDetail: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    let draft: Draft
    let bound: BoundSpace?
    @State private var deleting = false
    var body: some View {
        Screen {
            Text(draft.text).font(Theme.serif(17)).textSelection(.enabled)
            Paper {
                Text("处理轨迹").font(.headline)
                Label(MobileL10n.format("已写入 · %@", [String(describing: draft.updatedAt)]), systemImage: "checkmark.circle")
                if model.active?.cloud != nil { Label(model.syncing ? MobileL10n.text("同步中") : MobileL10n.text("最近同步检查完成"), systemImage: "icloud") }

            }
            Button("继续编辑") { model.perform { try await model.restoreCapture(draft,bound:bound,edit:true) } }
            if model.phoneModelAvailable {
                Button("整理成日记") { model.perform { try await model.restoreCapture(draft,bound:bound,edit:false) } }
                NavigationLink("先聊聊") { ConversationView(title: "聊聊这段", context: draft.text, evidence: draft.savedPath ?? "用户原话", contextRole: "user") }
            }

        }.navigationTitle("历史详情").accessibilityIdentifier("NOW-9")
            .toolbar { Menu("更多", systemImage: "ellipsis") { Button("复制") { UIPasteboard.general.string = draft.text }; Button("删除", role: .destructive) { deleting = true } } }
            .confirmationDialog("删除这条记录？原始文件会在最近删除保留 30 天。", isPresented: $deleting) { Button("删除", role: .destructive) { guard let bound else { return }; model.perform { try await model.discardCapture(draft, bound: bound); dismiss() } } }
    }
}
