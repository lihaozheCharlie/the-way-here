import SwiftUI
import TWHCore

struct SpaceManagementView: View {
    @EnvironmentObject private var model: AppModel
    @State private var name = ""
    @State private var nickname = ""
    private enum EditingField: Hashable { case name, nickname }
    @FocusState private var editingField: EditingField?
    @State private var bytes: Int64 = 0
    @State private var lifecycle = SpaceLifecycleState()
    var body: some View { Form {
        Section("当前空间") {
            TextField("空间名称",text:$name).focused($editingField, equals: .name).submitLabel(.next).onSubmit { editingField = .nickname }; TextField("你希望被怎么称呼",text:$nickname).focused($editingField, equals: .nickname).submitLabel(.done).onSubmit { editingField = nil }
            if let space = model.active { LabeledContent("创建时间",value:space.manifest.createdAt); LabeledContent("空间占用",value:ByteCountFormatter.string(fromByteCount:bytes,countStyle:.file)) }
            Text(MobileL10n.format("%@ 份记录 · %@ 份理解", [String(model.documents.filter(\.isSource).count), String(model.documents.filter { !$0.isSource }.count)]))
        }.disabled(model.active?.manifest.readOnly == true)
        Section {
            NavigationLink("导出此空间") { PrivacySettingsView() }
            Button { model.perform { try await model.copyActiveSpace() } } label: { Text("复制到新空间（含照片与理解，密钥不复制）").fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, alignment: .leading) }
            NavigationLink("最近删除的空间") { DeletedSpacesView() }
        }.disabled(model.active?.manifest.readOnly == true)
        if lifecycle.status == "requested" {
            Section("旧版删除申请") { Button("撤销删除申请") { model.perform { try await model.store?.cancelDeletion(); lifecycle = try await model.store?.lifecycleState() ?? SpaceLifecycleState(); await model.refresh() } } }
        }
        if model.active?.manifest.readOnly == true { Text("演示空间只读，不能重命名或复制。") }
    }.scrollDismissesKeyboard(.interactively).navigationTitle("空间管理").navigationBarTitleDisplayMode(.inline)
    .safeAreaInset(edge: .bottom, spacing: 0) { BottomActionBar {
        Button("保存名称与称呼") { editingField = nil; guard let bound = model.boundSpace else { return }; let value = name.trimmingCharacters(in:.whitespacesAndNewlines); model.perform { guard !value.isEmpty,value.count <= 40 else { throw MobileError.invalidData("请输入 1–40 个字符的空间名称。") }; guard nickname.count <= 40 else { throw MobileError.invalidData("称呼最多 40 个字符。") }; var manifest = bound.manifest; manifest.name = value; manifest.nickname = nickname; try await bound.store.writeJSON(manifest,path:"mobile-space.json"); UserDefaults.standard.set(nickname,forKey:"nickname.\(manifest.id)"); if model.active?.id == manifest.id { model.active?.manifest = manifest; if let active = model.active { model.store = try SpaceStore(root:active.root,manifest:manifest,deviceId:model.deviceId,cloudRoot:active.cloud) } }; model.message = "空间设置已保存" } }.buttonStyle(PrimaryButton()).disabled(model.active?.manifest.readOnly == true)
    } }.task(id:model.active?.id) { name = model.active?.manifest.name ?? ""; nickname = UserDefaults.standard.string(forKey:"nickname.\(model.active?.id ?? "")") ?? ""; do { bytes = try await model.store?.contentBytes() ?? 0; lifecycle = try await model.store?.lifecycleState() ?? SpaceLifecycleState() } catch { model.error = error.localizedDescription } }

    }
}
struct DeletedSpacesView: View {
    @EnvironmentObject private var model: AppModel
    @State private var restoring: String?
    var body: some View { List {
        ForEach(model.archivedSpaces) { space in VStack(alignment:.leading,spacing:8) {
            Text(space.manifest.name).font(Theme.serif(20)); Text("30 天内可恢复；恢复会通过 iCloud 同步。").font(.caption)
            Button("恢复空间") { restoring = space.id; model.perform { defer { restoring = nil }; let store = try SpaceStore(root:space.root,manifest:space.manifest,deviceId:model.deviceId,cloudRoot:space.cloud); try await store.restoreSpace(); try await model.discover(); try await model.activate(space); await model.refresh() } }.disabled(restoring != nil)
        } }
        if model.archivedSpaces.isEmpty { EmptyMessage(title:"没有可恢复的空间",detail:"删除的空间会在这里保留 30 天。") }
    }.navigationTitle("最近删除的空间").navigationBarTitleDisplayMode(.inline).task { model.perform { try await model.discover() } } }
}
extension AppModel {
    func copyActiveSpace() async throws {
        guard let source = boundSpace, !source.manifest.readOnly else { throw MobileError.readOnly }
        let oldActive = active
        var copyTarget: SpaceStore?
        var candidate = source.manifest.name + " 副本", index = 2
        while spaces.contains(where:{$0.manifest.name == candidate}) { candidate = source.manifest.name + " 副本 \(index)"; index += 1 }
        do {
            try await createSpace(name:String(candidate.prefix(40)),nickname:UserDefaults.standard.string(forKey:"nickname.\(source.manifest.id)") ?? "",cloud:cloudRoot != nil)
            guard let target = store else { throw MobileError.unavailable("新空间尚未准备完成。") }
            copyTarget = target
            try await target.writeJSON(["state":"copying","sourceKnowledgeBaseId":source.manifest.id],path:".mobile/copy-status.json")
            try await source.store.copyContent(to:target); try await target.writeJSON(["state":"completed","sourceKnowledgeBaseId":source.manifest.id],path:".mobile/copy-status.json"); await refresh(); message = "空间内容已复制，原空间保持不变"
        } catch {
            if let target = copyTarget {
                var manifest = target.manifest; manifest.name = String(manifest.name.prefix(33)) + "（未完成）"
                try? await target.writeJSON(manifest,path:"mobile-space.json")
                try? await target.writeJSON(["state":"interrupted","sourceKnowledgeBaseId":source.manifest.id],path:".mobile/copy-status.json")
                if let index = spaces.firstIndex(where:{$0.id == manifest.id}) { spaces[index].manifest = manifest }
            }
            if let oldActive { try? await activate(oldActive) }; throw error
        }
    }
}
