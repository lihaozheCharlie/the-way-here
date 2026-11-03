import SwiftUI
import TWHCore

struct ShareInboxView: View {
    @EnvironmentObject private var model: AppModel
    @State private var entries: [SharePayload] = []
    @State private var busy = false
    private var inbox: ShareInbox { ShareInbox(root: model.localRoot.deletingLastPathComponent().appendingPathComponent("Inbox")) }
    var body: some View { List {
        Text("分享内容已先保存在本机。核对目标空间后导入，不调用模型。").font(.footnote)
        ForEach(entries, id: \.id) { entry in Section(entry.kind) { Text(entry.text.isEmpty ? MobileL10n.format("%@ 个附件", [String(describing: entry.attachments.count)]) : String(entry.text.prefix(300))); Text(MobileL10n.format("保存到：%@", [String(describing: entry.folder)])); if let target = entry.knowledgeBaseId, target != model.active?.id { Text("这份内容属于另一个空间，请切回分享时的空间。").foregroundStyle(.orange) } else { Button(MobileL10n.format("导入到 %@", [String(describing: model.active?.manifest.name ?? "当前空间")])) { importEntry(entry) }.disabled(busy || model.active?.manifest.readOnly == true) } } }
        if entries.isEmpty { EmptyMessage(title: "收件箱已清空", detail: "在其他 App 的分享面板选择 The Way Here，就能先把材料留下。", symbol: "tray") }
    }.navigationTitle("分享收件箱").task { model.perform { entries = try await inbox.list() } }.accessibilityIdentifier("SYS-6") }
    private func importEntry(_ entry: SharePayload) {
        guard let bound = model.boundSpace else { return }; busy = true
        model.perform {
            defer { busy = false }
            try await ShareImportCoordinator.importPayload(entry, inbox: inbox, store: bound.store, spaceID: bound.manifest.id)
            entries = try await inbox.list(); await model.refresh(); model.message = "已导入，原文与附件均已保留"
        }
    }
}
