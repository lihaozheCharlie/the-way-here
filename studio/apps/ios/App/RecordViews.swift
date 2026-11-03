import SwiftUI
import TWHCore
import AVFoundation
import UniformTypeIdentifiers
import ImageIO
import PDFKit
import NaturalLanguage

struct DocumentRow: View {
    @EnvironmentObject private var model: AppModel
    var document: TWHCore.Document
    var showDisclosure = false
    private var sourceIcon: String {
        if !document.isSource { return "sparkles" }
        if model.recordOrigin(document) == "语音" { return "mic" }
        if model.recordCategory(document) == "照片" { return "photo" }
        if ["聊天", "对话"].contains(model.recordCategory(document)) { return "bubble.left.and.bubble.right" }
        if model.recordCategory(document) == "账单" { return "creditcard" }
        return "doc.text"
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                Image(systemName: sourceIcon).foregroundStyle(Theme.blue)
                Text(document.title).font(.body.weight(.medium)).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
                if showDisclosure { Spacer(minLength: 0); Image(systemName: "chevron.right").foregroundStyle(.secondary) }
            }
            Text(document.excerpt).font(.subheadline).lineLimit(2).foregroundStyle(.secondary)
            Text(document.modifiedAt, style: .date).font(.caption).foregroundStyle(.secondary)
        }.padding(.vertical, 6).accessibilityElement(children: .combine)
    }
}
struct RecordsView: View {
    @EnvironmentObject private var model: AppModel
    @State private var category = "全部"
    @State private var selected: Set<String> = []
    @State private var selecting = false
    @State private var moving = false
    @State private var copying = false
    @State private var deleting = false
    @State private var renaming: TWHCore.Document?
    @State private var newName = ""
    @State private var bound: BoundSpace?
    @State private var undo: [(from: String, to: String)] = []
    @State private var deleted: [SpaceStore.TrashEntry] = []
    private var records: [TWHCore.Document] { model.documents.filter { $0.isSource && (category == "全部" || model.recordCategory($0) == category) }.sorted { a, b in
        if a.path.contains(".conflict-") != b.path.contains(".conflict-") { return a.path.contains(".conflict-") }; return a.modifiedAt > b.modifiedAt
    } }
    private var visibleDrafts: [Draft] { model.drafts.filter { ["text", "voice"].contains($0.kind) && model.captureStatus($0) == "draft" && !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && (category == "全部" || category == "笔记") } }
    private var months: [String] { var seen = Set<String>(); return records.map { month($0) }.filter { seen.insert($0).inserted } }
    private func month(_ document: TWHCore.Document) -> String { if document.path.contains(".conflict-") { return "需要处理的冲突" }; return document.modifiedAt.formatted(.dateTime.year().month(.wide).locale(Locale(identifier: MobileL10n.language))) }
    var body: some View {
        List {
            SyncStatusLine()
            ScrollView(.horizontal, showsIndicators: false) { HStack { ForEach(["全部", "笔记", "聊天", "账单", "照片", "对话"], id: \.self) { value in Button(LocalizedStringKey(value)) { category = value }.buttonStyle(.bordered).tint(category == value ? Theme.blue : .secondary) } } }
            NavigationLink { FolderBrowserView() } label: { Label("按文件夹浏览", systemImage: "folder") }
            if selecting { AdaptiveActions {
                Button { selected = Set(records.map(\.path)) } label: { Text("全选").frame(minWidth: 44, minHeight: 44) }
                Button { copying = false; moving = true } label: { Text("移动").frame(minWidth: 44, minHeight: 44) }.disabled(selected.isEmpty)
                Button(role: .destructive) { deleting = true } label: { Text("删除").frame(minWidth: 44, minHeight: 44) }.disabled(selected.isEmpty)
            }.buttonStyle(.bordered).controlSize(.regular) }
            if !undo.isEmpty || !deleted.isEmpty { HStack { Text("操作已完成"); Spacer(); Button("撤销") { undoLast() } }.listRowBackground(Theme.pale) }
            if records.isEmpty && visibleDrafts.isEmpty { EmptyMessage(title: "还没有记录", detail: "点中间按钮说一段，或从文件收进来。") }
            ForEach(months, id: \.self) { month in Section(LocalizedStringKey(month)) {
                ForEach(records.filter { self.month($0) == month }) { document in
                    Group {
                        if selecting { Button { if selected.contains(document.path) { selected.remove(document.path) } else { selected.insert(document.path) } } label: { HStack { Image(systemName: selected.contains(document.path) ? "checkmark.circle.fill" : "circle"); RecordStatusRow(document: document) } } }
                        else { NavigationLink { DocumentView(document: document) } label: { RecordStatusRow(document: document) } }
                    }.listRowBackground(Color.clear).listRowSeparator(.hidden)
                    .swipeActions { Button("删除", role: .destructive) { selected = [document.path]; deleting = true }; Button("移动") { selected = [document.path]; copying = false; moving = true }.tint(Theme.blue) }
                    .contextMenu {
                        Button("多选") { selecting = true; selected.insert(document.path) }
                        Button("移动") { selected = [document.path]; copying = false; moving = true }
                        Button("复制到…") { selected = [document.path]; copying = true; moving = true }
                        Button("重命名") { renaming = document; newName = URL(fileURLWithPath: document.path).deletingPathExtension().lastPathComponent }
                        Button("复制链接") { if let bound { UIPasteboard.general.string = SystemDestination.url(route: "document", space: bound.manifest.id, target: document.path).absoluteString } }
                        Button("删除", role: .destructive) { selected = [document.path]; deleting = true }
                    }
                }
            } }
            if !visibleDrafts.isEmpty && !selecting { Section("草稿") { ForEach(visibleDrafts) { draft in NavigationLink { CaptureHistoryDetail(draft: draft, bound: bound) } label: { VStack(alignment: .leading, spacing: 6) { Label(String(draft.text.prefix(80)), systemImage: draft.kind == "voice" ? "mic" : "doc.text"); Text("草稿").font(.caption).foregroundStyle(.secondary); Text(draft.updatedAt).font(.caption2).foregroundStyle(.secondary) } } } } }
        }.listStyle(.plain).background(Theme.canvas).navigationTitle(selecting ? MobileL10n.format("已选 %@ 份", [String(describing: selected.count)]) : MobileL10n.text("生活记录")).refreshable { await model.refresh() }
        .toolbar { ToolbarItemGroup(placement: .topBarTrailing) {
            Button("搜索", systemImage: "magnifyingglass") { model.presented = .search }
            if selecting { Button("完成") { selecting = false; selected = [] } }
            else { Menu { Button("新建记录", systemImage: "square.and.pencil") { model.presented = .writing }; NavigationLink("导入资料") { ImportView() }; Button("多选") { selecting = true } } label: { Label("新建或导入", systemImage: "plus") } }
        } }
        .task { bound = model.boundSpace }
        .sheet(isPresented: $moving) { NavigationStack { RecordDestinationView(title: copying ? MobileL10n.format("复制 %@ 份", [String(selected.count)]) : MobileL10n.format("移动 %@ 份", [String(selected.count)]), currentFolders: Set(selected.map { String(($0 as NSString).deletingLastPathComponent.dropFirst((bound?.manifest.sourcesPath.count ?? 0) + 1)) })) { folder in
            guard let bound else { return }; let paths = selected.sorted(); let copy = copying
            model.perform { var journal: [(String, String)] = []; do { for path in paths { let destination = try await (copy ? bound.store.copySource(path: path, folder: folder) : bound.store.moveSource(path: path, folder: folder)); journal.append((path, destination)); if !copy { undo = journal; deleted = [] } } } catch { await model.refresh(); throw error }; model.message = MobileL10n.format("已保存到 %@，同名记录会自动编号", [String(describing: folder)]); await model.refresh() }
        } }.environmentObject(model) }
        .confirmationDialog("移到最近删除？保留 30 天。", isPresented: $deleting) { Button("移到最近删除", role: .destructive) {
            guard let bound else { return }; let paths = selected.sorted(); model.perform { let before = Set(try await bound.store.trashEntries().map(\.id)); do { for path in paths { try await bound.store.trash(path: path) } } catch { deleted = try await bound.store.trashEntries().filter { !before.contains($0.id) }; undo = []; await model.refresh(); throw error }; deleted = try await bound.store.trashEntries().filter { !before.contains($0.id) }; undo = []; selected = []; await model.refresh() }
        } }
        .alert("重命名记录", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) { TextField("名称", text: $newName); Button("保存") { if let document = renaming, let bound { let name = newName; model.perform { let path = try await bound.store.renameSource(path: document.path, name: name); undo = [(document.path, path)]; deleted = []; await model.refresh() } } }; Button("取消", role: .cancel) {} }
        .accessibilityIdentifier("REC-1")
    }
    private func undoLast() { guard let bound else { return }; let moves = undo, trash = deleted; model.perform {
        for move in moves.reversed() { _ = try await bound.store.relocateSource(path: move.to, destination: move.from) }
        for entry in trash { try await bound.store.restoreTrash(entry) }; undo = []; deleted = []; await model.refresh()
    } }
}
struct RecordStatusRow: View {
    @EnvironmentObject private var model: AppModel
    let document: TWHCore.Document
    var body: some View { VStack(alignment: .leading, spacing: 6) { DocumentRow(document: document); Text(LocalizedStringKey(document.path.contains(".conflict-") ? "需要处理的冲突" : "已保存")).font(.caption).foregroundStyle(document.path.contains(".conflict-") ? .red : .secondary) } }
}
struct FolderBrowserView: View {
    var initialFolder = ""
    @State private var initialized = false
    @EnvironmentObject private var model: AppModel
    @State private var current = ""
    @State private var name = ""
    @State private var create = false
    @State private var renaming: String?
    @State private var moving: String?
    @State private var deleting: String?
    @State private var alphabetical = true
    @State private var compact = false
    @State private var bound: BoundSpace?
    private var base: String { (bound?.manifest.sourcesPath ?? model.active?.manifest.sourcesPath ?? "") + "/" + (current.isEmpty ? "" : current + "/") }
    private var folders: [String] { let prefix = current.isEmpty ? "" : current + "/"; return Array(Set(model.sourceFolders.compactMap { path in guard path.hasPrefix(prefix) else { return nil }; return path.dropFirst(prefix.count).split(separator: "/").first.map(String.init) })).sorted() }
    private var documents: [TWHCore.Document] { model.documents.filter { $0.isSource && $0.path.hasPrefix(base) && !$0.path.dropFirst(base.count).contains("/") }.sorted { alphabetical ? $0.title.localizedStandardCompare($1.title) == .orderedAscending : $0.modifiedAt > $1.modifiedAt } }
    private func full(_ child: String) -> String { current.isEmpty ? child : current + "/" + child }
    var body: some View {
        List {
            ScrollView(.horizontal, showsIndicators: false) { HStack { Button("生活记录") { current = "" }; ForEach(Array(current.split(separator: "/").enumerated()), id: \.offset) { index, part in Image(systemName: "chevron.right").font(.caption); Button(String(part)) { current = current.split(separator: "/").prefix(index + 1).joined(separator: "/") }.fontWeight(index == current.split(separator: "/").count - 1 ? .semibold : .regular) } } }
            ForEach(folders, id: \.self) { child in let folder = full(child); Button { current = folder } label: { HStack { Label(child, systemImage: "folder"); Spacer(); Text("\(model.documents.filter { $0.isSource && $0.path.hasPrefix((bound?.manifest.sourcesPath ?? "") + "/" + folder + "/") }.count)").foregroundStyle(.secondary); Image(systemName: "chevron.right") } }.contextMenu { Button("重命名") { renaming = folder; name = child }; Button("移动") { moving = folder }; Button("删除", role: .destructive) { deleting = folder } } }
            ForEach(documents) { document in NavigationLink { DocumentView(document: document) } label: { if compact { Text(document.title) } else { RecordStatusRow(document: document) } } }
            if folders.isEmpty && documents.isEmpty { EmptyMessage(title: "这里还没有内容", detail: "点 + 新建文件夹或记录。", symbol: "folder") }
        }.navigationTitle(current.isEmpty ? MobileL10n.text("文件夹") : URL(fileURLWithPath: current).lastPathComponent).navigationBarTitleDisplayMode(.inline)
        .toolbar { Menu { Button("新建文件夹") { name = ""; create = true }; Button("新记录") { if !current.isEmpty { model.folder = current }; model.presented = .writing } } label: { Label("新建", systemImage: "plus") }; Menu { Toggle("按名称排序", isOn: $alphabetical); Toggle("紧凑显示", isOn: $compact); if !current.isEmpty { Button("返回上一层") { current = current.split(separator: "/").dropLast().joined(separator: "/") } } } label: { Label("排序与显示", systemImage: "ellipsis") } }
        .task { guard !initialized else { return }; initialized = true; bound = model.boundSpace; current = initialFolder }
        .alert("新建文件夹", isPresented: $create) { TextField("名称", text: $name); Button("创建") { guard let bound else { return }; let destination = full(name); model.perform { try await bound.store.createFolder(destination); await model.refresh() } }; Button("取消", role: .cancel) {} }
        .alert("重命名文件夹", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) { TextField("名称", text: $name); Button("保存") { guard let folder = renaming, let bound else { return }; let parent = folder.split(separator: "/").dropLast().joined(separator: "/"); let destination = parent.isEmpty ? name : parent + "/" + name; model.perform { _ = try await bound.store.relocateFolder(folder, to: destination); await model.refresh() } }; Button("取消", role: .cancel) {} }
        .sheet(isPresented: Binding(get: { moving != nil }, set: { if !$0 { moving = nil } })) { NavigationStack { RecordDestinationView(title: "移动文件夹", excluded: moving) { destination in guard let folder = moving, let bound else { return }; model.perform { _ = try await bound.store.relocateFolder(folder, to: destination + "/" + URL(fileURLWithPath: folder).lastPathComponent); await model.refresh() } } }.environmentObject(model) }
        .confirmationDialog("删除整个文件夹？所有文件保留 30 天。", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } })) { Button("移到最近删除", role: .destructive) { guard let folder = deleting, let bound else { return }; model.perform { try await bound.store.trashFolder(folder); await model.refresh() } } }.accessibilityIdentifier("REC-2")
    }
}
struct RecordDestinationView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    var title: String
    var currentFolders: Set<String> = []
    var excluded: String? = nil
    var select: (String) -> Void
    @State private var current = ""
    @State private var name = ""
    @State private var create = false
    @State private var bound: BoundSpace?
    private var folders: [String] {
        let prefix = current.isEmpty ? "" : current + "/"
        return Array(Set((model.sourceFolders + ["随手记"]).filter { path in path.hasPrefix(prefix) && !(excluded.map { path == $0 || path.hasPrefix($0 + "/") } ?? false) }.compactMap { $0.dropFirst(prefix.count).split(separator: "/").first.map(String.init) })).sorted()
    }
    var body: some View { List {
        Button("生活记录") { current = "" }; if !current.isEmpty { Text(current); Button("返回上一层") { current = current.split(separator: "/").dropLast().joined(separator: "/") } }
        ForEach(folders, id: \.self) { child in Button { current = current.isEmpty ? child : current + "/" + child } label: { Label(child, systemImage: "folder") } }
        Button("新建文件夹") { create = true }
    }.navigationTitle(MobileL10n.text(title)).navigationBarTitleDisplayMode(.inline).safeAreaInset(edge: .bottom) { Button("移到这里") { select(current); dismiss() }.buttonStyle(PrimaryButton()).padding().disabled(current.isEmpty || currentFolders.contains(current) || (excluded.map { current == $0 || current.hasPrefix($0 + "/") } ?? false)) }.task { bound = model.boundSpace }
    .alert("新建文件夹", isPresented: $create) { TextField("名称", text: $name); Button("创建") { guard let bound else { return }; let target = current.isEmpty ? name : current + "/" + name; model.perform { try await bound.store.createFolder(target); current = target; name = ""; await model.refresh() } }; Button("取消", role: .cancel) {} }.accessibilityIdentifier("REC-4") }
}
struct DocumentView: View {
    @EnvironmentObject private var model: AppModel
    var document: TWHCore.Document
    @State private var fontSize: Double = 17
    @State private var editor = false
    @State private var correction = false
    @State private var synthesizer = AVSpeechSynthesizer()
    @State private var position: String?
    @State private var readingCoordinateSpace = UUID(); @State private var restoredPosition = false
    @State private var information = false
    @State private var shownHash = ""
    @State private var displayed: TWHCore.Document?
    @State private var updateNotice = false
    @State private var bound: BoundSpace?
    private var latest: TWHCore.Document { model.documents.first(where: { $0.id == document.id }) ?? document }
    private var current: TWHCore.Document { displayed ?? document }
    private var paragraphs: [String] { current.bodyMarkdown.components(separatedBy: "\n\n") }
    var body: some View {
        ScrollViewReader { reader in
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text(current.title).font(.custom("Songti SC", size: 24, relativeTo: .title2)).fixedSize(horizontal: false, vertical: true).accessibilityAddTraits(.isHeader)
                    PhotoStripView(document: current)
                    Text(current.modifiedAt, style: .date).font(.caption).foregroundStyle(.secondary)
                    if document.isSource { Text(MobileL10n.text(model.recordOrigin(current))).font(.caption); Text(current.path).font(.caption).foregroundStyle(.secondary); Text(LocalizedStringKey(current.path.contains(".conflict-") ? "需要处理的冲突" : "已保存")).font(.caption); Button("记录信息") { information = true } }
                    if updateNotice { Button("这份记录有更新，点此刷新") { displayed = latest; shownHash = latest.hash; updateNotice = false }.font(.caption) }
                    if current.path.contains(".conflict-") { NavigationLink("处理同步冲突") { ExistingRecordConflictView(document: current, bound: bound) } }
                    let people = model.documents.filter { $0.category == "entities" && current.markdown.contains($0.title) }
                    if !people.isEmpty { ScrollView(.horizontal) { HStack { ForEach(people) { person in NavigationLink { PersonView(document: person) } label: { Label(person.title, systemImage: "person.crop.circle") }.buttonStyle(.bordered) } } } }
                    if !document.isSource { EvidenceLinksView(document: current) }
                    ForEach(Array(paragraphs.enumerated()), id: \.offset) { index, paragraph in Text((try? AttributedString(markdown: paragraph, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(paragraph)).font(Theme.serif(fontSize)).lineSpacing(fontSize * 0.8).frame(maxWidth: .infinity, alignment: .leading).textSelection(.enabled).id(String(index)).readingParagraph(String(index), in: readingCoordinateSpace) }
                    if !document.isSource { Button("它不像我 · 纠错与补充") { correction = true }.buttonStyle(.bordered); if model.phoneModelAvailable { NavigationLink("聊聊这一条") { ConversationView(title: document.title, context: document.excerpt, evidence: document.markdown) } } }
                }.padding(20)
            }.trackReadingPosition($position, in: readingCoordinateSpace) { guard !restoredPosition else { return position }; restoredPosition = true; let saved = UserDefaults.standard.string(forKey: "reading.\(document.id)"); position = saved.flatMap { value in Int(value).flatMap { paragraphs.indices.contains($0) ? value : nil } }; if let position { reader.scrollTo(position, anchor: .top) }; return position }.onDisappear { UserDefaults.standard.set(position, forKey: "reading.\(document.id)"); synthesizer.stopSpeaking(at: .immediate) }
        }
        .navigationTitle(document.category == "letters" ? MobileL10n.text("近况回信") : MobileL10n.text("阅读")).navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if document.isSource { Button("编辑") { editor = true } }
            Menu { if document.isSource { Button("记录信息与更多") { information = true } }; if document.category == "letters" { Button(model.documentFlag("favorite", document: document) ? MobileL10n.text("取消收藏") : MobileL10n.text("收藏回信"), systemImage: "star") { model.setDocumentFlag("favorite", document: document, value: !model.documentFlag("favorite", document: document)) }; Button(model.documentFlag("archived", document: document) ? MobileL10n.text("取消归档") : MobileL10n.text("归档回信"), systemImage: "archivebox") { model.setDocumentFlag("archived", document: document, value: !model.documentFlag("archived", document: document)) } }; Text(document.path); Text(MobileL10n.format("%@ 字节", [String(describing: document.markdown.utf8.count)])); ShareLink(item: document.markdown) { Label("导出 Markdown", systemImage: "square.and.arrow.up") }; Button("复制全文") { UIPasteboard.general.string = document.markdown } } label: { Label("更多", systemImage: "ellipsis") }
        }
        .safeAreaInset(edge: .bottom) { BottomActionBar { AdaptiveActions {
            HStack(spacing: 8) {
                Button { fontSize = max(15, fontSize - 1) } label: { Label("缩小字号", systemImage: "textformat.size.smaller").labelStyle(.iconOnly).frame(minWidth: 44, minHeight: 44) }
                Button { fontSize = min(28, fontSize + 1) } label: { Label("放大字号", systemImage: "textformat.size.larger").labelStyle(.iconOnly).frame(minWidth: 44, minHeight: 44) }
            }
            Button(synthesizer.isSpeaking ? MobileL10n.text("停止朗读") : MobileL10n.text("朗读"), systemImage: "speaker.wave.2") {
                if synthesizer.isSpeaking { synthesizer.stopSpeaking(at: .immediate) }
                else { let speech = AVSpeechUtterance(string: current.bodyMarkdown); speech.voice = AVSpeechSynthesisVoice(language: NLLanguageRecognizer.dominantLanguage(for: current.bodyMarkdown)?.rawValue ?? AVSpeechSynthesisVoice.currentLanguageCode()); synthesizer.speak(speech) }
            }.frame(minHeight: 44)
            ShareLink(item: document.markdown) { Label("导出 Markdown", systemImage: "square.and.arrow.up").labelStyle(.iconOnly).frame(minWidth: 44, minHeight: 44) }
        } } }
        .sheet(isPresented: $editor) { NavigationStack { RecordEditorView(document: current) }.environmentObject(model) }
        .sheet(isPresented: $correction) { NavigationStack { CorrectionView(document: document) }.environmentObject(model) }
        .sheet(isPresented: $information) { NavigationStack { RecordInformationView(document: current, bound: bound) }.environmentObject(model) }
        .task { bound = model.boundSpace; if displayed == nil { displayed = latest }; shownHash = current.hash }
        .onChange(of: latest.hash) { _, value in if !shownHash.isEmpty && shownHash != value { updateNotice = true } }
        .accessibilityIdentifier(document.category == "letters" ? "UND-11" : "REC-5")
    }
}
struct RecordEditorView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.verticalSizeClass) private var verticalSizeClass
    var document: TWHCore.Document
    @State private var markdown = ""
    @State private var title = ""
    @State private var hash = ""
    @State private var saved = ""
    @State private var status = ""
    @State private var conflict: String?
    @State private var bound: BoundSpace?
    @State private var remoteMarkdown = ""
    @State private var remoteHash = ""
    private struct EditSnapshot { var title: String; var markdown: String }
    @State private var history: [EditSnapshot] = []
    @State private var cancelling = false
    @State private var saving = false
    @State private var lastEditField: String?
    @State private var lastEditAt = Date.distantPast
    @StateObject private var recorder = SpeechRecorder()
    @State private var voice = false
    private var content: String { let lines = markdown.components(separatedBy: "\n"); if let index = lines.firstIndex(where: { $0.hasPrefix("# ") }) { var changed = lines; changed[index] = "# " + title.replacingOccurrences(of: "\n", with: " "); return changed.joined(separator: "\n") }; return "# \(title)\n\n" + markdown }
    var body: some View { VStack(alignment: .leading, spacing: verticalSizeClass == .compact ? 4 : 8) {
        TextField("标题", text: titleBinding).accessibilityIdentifier("record-editor-title").font(.custom("Songti SC", size: verticalSizeClass == .compact ? 17 : 22, relativeTo: .title3)).padding(.horizontal)
        if verticalSizeClass != .compact { Text(model.online ? MobileL10n.text(status) : MobileL10n.text("已在本机保存 · 将在联网后上传")).font(.caption).foregroundStyle(.secondary).padding(.horizontal) }
        TextEditor(text: markdownBinding).accessibilityIdentifier("record-editor-body").font(Theme.serif(17)).lineSpacing(10).padding(.horizontal).frame(minHeight: 44).layoutPriority(1)
        if verticalSizeClass != .compact { Text("仅来源可编辑。理解页请用“不像我”追加纠正。").font(.caption).foregroundStyle(.secondary).padding(.horizontal) }
    }.navigationTitle("编辑记录").navigationBarTitleDisplayMode(.inline).toolbar { ToolbarItem(placement: .cancellationAction) { Button("取消") { if content == document.markdown { dismiss() } else { cancelling = true } }.accessibilityIdentifier("record-editor-cancel") }; ToolbarItem(placement: .confirmationAction) { Button("完成") { model.perform { if try await save() { await model.refresh(); dismiss() } } }.accessibilityIdentifier("record-editor-save") } }
    .safeAreaInset(edge: .bottom, spacing: 0) { BottomActionBar(verticalPadding: verticalSizeClass == .compact ? 4 : 12) {
        ScrollView(.horizontal) { HStack(spacing: 12) {
            Button { voice = true } label: { Label("语音", systemImage: "mic").frame(minWidth: 44, minHeight: 44) }
            Button { append("**文字**") } label: { Label("粗体", systemImage: "bold").frame(minWidth: 44, minHeight: 44) }
            Button { append("\n- ") } label: { Label("列表", systemImage: "list.bullet").frame(minWidth: 44, minHeight: 44) }
            Button { append("\n> ") } label: { Label("引用", systemImage: "text.quote").frame(minWidth: 44, minHeight: 44) }
            Button { if let previous = history.popLast() { title = previous.title; markdown = previous.markdown; lastEditField = nil } } label: { Label("撤销", systemImage: "arrow.uturn.backward").frame(minWidth: 44, minHeight: 44) }.disabled(history.isEmpty).accessibilityIdentifier("record-editor-undo")
        }.labelStyle(.iconOnly).buttonStyle(.plain).controlSize(.regular).frame(minHeight: 44) }
    } }
    .onAppear { bound = model.boundSpace; markdown = document.markdown; title = document.title; hash = document.hash; saved = document.markdown }
    .task(id: content) { do { try await Task.sleep(for: .seconds(2)); try Task.checkCancellation(); if !hash.isEmpty && content != saved && conflict == nil && !voice { _ = try await save() } } catch is CancellationError {} catch { model.error = error.localizedDescription } }
    .confirmationDialog("退出编辑？", isPresented: $cancelling) {
        Button("保留修改并关闭") { model.perform { if try await save() { await model.refresh(); dismiss() } } }
        Button("放弃本次全部修改", role: .destructive) { markdown = document.markdown; title = document.title; model.perform { if try await save() { await model.refresh(); dismiss() } } }
        Button("继续编辑", role: .cancel) {}
    } message: { Text("部分修改可能已经自动保存。放弃会按内容哈希恢复打开编辑时的版本；其他设备有新修改时仍会保留冲突副本。") }
    .sheet(isPresented: $voice) { NavigationStack { VStack { Text(recorder.transcript).font(Theme.serif(17)); if let error = recorder.error { Text(MobileL10n.text(error)).foregroundStyle(.red) }; Button(recorder.running ? MobileL10n.text("结束录音") : MobileL10n.text("开始录音")) { if recorder.running { recorder.stop() } else { model.perform { await recorder.start() } } }; Button("插入文字") { recorder.stop(); append("\n" + recorder.transcript); voice = false }; Button("取消") { recorder.stop(); voice = false } }.padding().navigationTitle("语音输入").navigationBarTitleDisplayMode(.inline) }.onDisappear { recorder.stop() } }
    .sheet(isPresented: Binding(get: { conflict != nil }, set: { if !$0 { conflict = nil } })) { NavigationStack { ConflictMergeView(local: content, remote: remoteMarkdown, keepBoth: { resolve(content, keepCopy: true) }, keepLocal: { resolve(content, keepCopy: false) }, keepRemote: { resolve(remoteMarkdown, keepCopy: false) }) { merged in resolve(merged, keepCopy: false) } } }.accessibilityElement(children: .contain).accessibilityIdentifier("REC-7") }
    private var titleBinding: Binding<String> { Binding(get: { title }, set: { value in guard value != title else { return }; rememberEdit(field: "title"); title = value; markdown = content }) }
    private var markdownBinding: Binding<String> { Binding(get: { markdown }, set: { value in guard value != markdown else { return }; rememberEdit(field: "body"); markdown = value; if let heading = value.split(separator: "\n").first(where: { $0.hasPrefix("# ") }) { title = String(heading.dropFirst(2)) } }) }
    private func rememberEdit(field: String) {
        let now = Date(); defer { lastEditField = field; lastEditAt = now }
        guard field == "tool" || lastEditField != field || now.timeIntervalSince(lastEditAt) >= 0.8 else { return }
        history.append(EditSnapshot(title: title, markdown: markdown)); if history.count > 200 { history.removeFirst(history.count - 200) }
    }
    private func append(_ value: String) { rememberEdit(field: "tool"); markdown += value }
    private func save() async throws -> Bool {
        guard document.isSource, let store = bound?.store, conflict == nil, !saving else { return false }; saving = true; defer { saving = false }
        let value = content
        do { try await store.saveEdit(path: document.path, expectedHash: hash, markdown: value); hash = MobileProtocol.hash(Data(value.utf8)); saved = value; status = "已自动保存"; return true }
        catch MobileError.conflict(let url) { remoteMarkdown = String(data: try await store.read(document.path), encoding: .utf8) ?? ""; remoteHash = MobileProtocol.hash(Data(remoteMarkdown.utf8)); conflict = String(url.path.dropFirst(store.root.path.count + 1)); status = "两个版本均已保留，等待你确认"; return false }
    }
    private func resolve(_ value: String, keepCopy: Bool) { guard let bound, let conflict else { return }; let expected = remoteHash; model.perform { try await bound.store.resolveConflict(path: document.path, expectedHash: expected, markdown: value, conflictPath: conflict, keepCopy: keepCopy); self.conflict = nil; await model.refresh(); dismiss() } }
}
struct ConflictMergeView: View {
    var local: String; var remote: String; var keepBoth: () -> Void
    var keepLocal: () -> Void = {}; var keepRemote: () -> Void = {}; var save: (String) -> Void
    @State private var picks: [Int: Bool] = [:]
    @State private var merged = ""
    @State private var advanced = false
    @State private var editing = false
    private var localParts: [String] { local.components(separatedBy: "\n\n") }
    private var remoteParts: [String] { remote.components(separatedBy: "\n\n") }
    var body: some View { Screen {
        Text("这份记录在不同设备上都被修改过。").font(.headline)
        Text("建议两份都保留。逐段合并按段落序号对照；增删可能错位，请核对全文。").font(.subheadline)
        if !advanced { Paper { Text("iPhone 版本").font(.headline); Text(local).font(Theme.serif(17)).textSelection(.enabled) }; Paper { Text("另一台设备的版本").font(.headline); Text(remote).font(Theme.serif(17)).textSelection(.enabled) }; Button("两份都保留（建议）", action: keepBoth).buttonStyle(PrimaryButton()); Button("保留 iPhone 版", action: keepLocal); Button("保留另一版本", action: keepRemote); Button("逐段合并") { advanced = true } }
        else if editing { TextEditor(text: $merged).frame(minHeight: 400).font(Theme.serif(17)); Button("保存核对后的合并内容") { save(merged) }.disabled(merged.isEmpty) }
        else {
            ForEach(0..<max(localParts.count, remoteParts.count), id: \.self) { index in
                let own = index < localParts.count ? localParts[index] : ""
                let other = index < remoteParts.count ? remoteParts[index] : ""
                Paper { Text(MobileL10n.format("段落 %@", [String(describing: index + 1)])).font(.caption); if own == other { Text(own).font(Theme.serif(17)) } else {
                    Button { picks[index] = true } label: { VStack(alignment: .leading) { Label("这台 iPhone", systemImage: (picks[index] ?? true) ? "checkmark.circle.fill" : "circle"); Text(own.isEmpty ? MobileL10n.text("（此版本没有这一段）") : own).font(Theme.serif(17)).foregroundStyle(.primary) } }
                    Divider()
                    Button { picks[index] = false } label: { VStack(alignment: .leading) { Label("另一台设备", systemImage: !(picks[index] ?? true) ? "checkmark.circle.fill" : "circle"); Text(other.isEmpty ? MobileL10n.text("（此版本没有这一段）") : other).font(Theme.serif(17)).foregroundStyle(.primary) } }
                } }
            }
            Button("核对合并全文") { merged = (0..<max(localParts.count, remoteParts.count)).map { index in (picks[index] ?? true) ? (index < localParts.count ? localParts[index] : "") : (index < remoteParts.count ? remoteParts[index] : "") }.filter { !$0.isEmpty }.joined(separator: "\n\n"); editing = true }
        }
    }.navigationTitle("同步冲突").navigationBarTitleDisplayMode(.inline).interactiveDismissDisabled().accessibilityIdentifier("REC-8") }
}
struct PhotoStripView: View {
    @EnvironmentObject private var model: AppModel
    var document: TWHCore.Document
    @State private var images: [UIImage] = []
    @State private var selected: Int?
    @State private var scale: CGFloat = 1
    var body: some View {
        Group {
            if !images.isEmpty { ScrollView(.horizontal, showsIndicators: false) { HStack(spacing: 10) { ForEach(Array(images.enumerated()), id: \.offset) { index, image in Button { selected = index } label: { Image(uiImage: image).resizable().scaledToFill().frame(width: 160, height: 150).clipped().clipShape(RoundedRectangle(cornerRadius: 12)) }.accessibilityLabel(MobileL10n.format("查看第 %@ 张照片", [String(describing: index + 1)])) } } } }
        }.task(id: document.hash) {
            guard let store = model.store else { return }
            do {
                let regex = try NSRegularExpression(pattern: "!\\[[^\\]]*\\]\\(([^)]+)\\)")
                let text = document.markdown as NSString
                var loaded: [UIImage] = []
                for match in regex.matches(in: document.markdown, range: NSRange(location: 0, length: text.length)).prefix(12) {
                    let relative = text.substring(with: match.range(at: 1)).trimmingCharacters(in: CharacterSet(charactersIn: "<>"))
                    guard MobileProtocol.validPath(relative), !relative.contains(":") else { continue }
                    let folder = (document.path as NSString).deletingLastPathComponent
                    let path = relative.hasPrefix(store.manifest.sourcesPath + "/") ? relative : folder + "/" + relative
                    let data = try await store.read(path)
                    if let source = CGImageSourceCreateWithData(data as CFData, nil), let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceThumbnailMaxPixelSize: 640, kCGImageSourceCreateThumbnailWithTransform: true] as CFDictionary) { loaded.append(UIImage(cgImage: thumbnail)) }
                }
                images = loaded
            } catch { model.message = "部分照片尚未下载，文字仍可阅读。" }
        }.sheet(isPresented: Binding(get: { selected != nil }, set: { if !$0 { selected = nil; scale = 1 } })) { if let selected, selected < images.count { VStack { Button("完成") { self.selected = nil }; Image(uiImage: images[selected]).resizable().scaledToFit().scaleEffect(scale).gesture(MagnificationGesture().onChanged { scale = max(1, min(4, $0)) }) }.padding() } }
    }
}
struct SearchView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var debounced = ""
    @State private var category = "全部"
    @State private var expanded: Set<String> = []
    @State private var searching = false
    @State private var semanticPaths: [String] = []
    @State private var semanticAvailable = true
    @State private var recent: [String] = []
    @State private var bound: BoundSpace?
    @State private var loaded = false
    @State private var completedSearch: [String]?
    private var searchSignature: [String] { [query] + model.documents.flatMap { [$0.path, $0.hash] } }
    @FocusState private var focused: Bool
    private var historyKey: String { "search.recent." + (bound?.manifest.id ?? "none") }
    private var results: [TWHCore.Document] { model.documents.filter { document in
        !debounced.isEmpty && (document.title.localizedCaseInsensitiveContains(debounced) || document.markdown.localizedCaseInsensitiveContains(debounced) || semanticPaths.contains(document.path)) && (category == "全部" || group(document) == category)
    }.sorted { a, b in
        let left = a.title.localizedCaseInsensitiveContains(debounced) || a.markdown.localizedCaseInsensitiveContains(debounced)
        let right = b.title.localizedCaseInsensitiveContains(debounced) || b.markdown.localizedCaseInsensitiveContains(debounced)
        if left != right { return left }
        return (semanticPaths.firstIndex(of: a.path) ?? 999) < (semanticPaths.firstIndex(of: b.path) ?? 999)
    } }
    private func group(_ document: TWHCore.Document) -> String { document.isSource ? (document.path.contains("对话") ? "对话" : "记录") : document.category == "entities" ? "人物" : "理解" }
    private func highlight(_ text: String) -> AttributedString { var value = AttributedString(text); guard !debounced.isEmpty else { return value }; var range = value.startIndex..<value.endIndex; while let found = value[range].range(of: debounced, options: [.caseInsensitive]) { value[found].backgroundColor = Theme.pale; value[found].foregroundColor = Theme.blue; guard found.upperBound < value.endIndex else { break }; range = found.upperBound..<value.endIndex }; return value }
    private func snippet(_ document: TWHCore.Document) -> String { guard let range = document.markdown.range(of: debounced, options: .caseInsensitive) else { return document.excerpt }; let start = document.markdown.index(range.lowerBound, offsetBy: -40, limitedBy: document.markdown.startIndex) ?? document.markdown.startIndex; return String(document.markdown[start...].prefix(180)).replacingOccurrences(of: "\n", with: " ") }
    private func remember() { let value = query.trimmingCharacters(in: .whitespacesAndNewlines); guard !value.isEmpty else { return }; recent = Array(([value] + recent.filter { $0 != value }).prefix(10)); UserDefaults.standard.set(recent, forKey: historyKey) }
    private var filters: some View { ScrollView(.horizontal, showsIndicators: false) { HStack { ForEach(["全部", "记录", "理解", "人物", "对话"], id: \.self) { value in Button(LocalizedStringKey(value)) { category = value; expanded = [] }.buttonStyle(.bordered).tint(category == value ? Theme.blue : .secondary) } } } }
    @ViewBuilder private var history: some View {
        if !recent.isEmpty { Section("最近搜索") { ForEach(recent, id: \.self) { value in Button(value) { query = value } }; Button("清除搜索历史", role: .destructive) { recent = []; UserDefaults.standard.removeObject(forKey: historyKey) } } }
        Section("快捷动作") { Button("说一段", systemImage: "mic") { dismiss(); model.presented = .recording }; Button("找照片", systemImage: "photo") { dismiss(); model.presented = .photos }; if model.phoneModelAvailable { Button("写信给我", systemImage: "envelope") { dismiss(); model.presented = .letters } } }
        Text("搜索已同步到手机的全文、人物与理解。内容在同步后加入搜索。").font(.footnote).foregroundStyle(.secondary)
    }
    private var emptyResults: some View { Section {
        EmptyMessage(title: MobileL10n.format("没有找到与“%@”相关的内容", [String(describing: debounced)]), detail: "换个说法、试试更短的词，或检查拼写。", symbol: "magnifyingglass")
        if model.phoneModelAvailable { NavigationLink("把这个问题拿去聊聊") { ConversationView(title: debounced, context: debounced, evidence: "") } }
    }.accessibilityIdentifier("SRC-3") }
    @ViewBuilder private func resultSection(_ label: String) -> some View {
        let matches = results.filter { group($0) == label }
        if !matches.isEmpty { Section(LocalizedStringKey(label)) {
            ForEach(expanded.contains(label) ? matches : Array(matches.prefix(3))) { document in resultLink(document, label: label) }
            if expanded.contains(label) { Text(MobileL10n.format("已显示全部 %@ 条匹配", [String(matches.count)])).font(.caption).foregroundStyle(.secondary).accessibilityIdentifier("search-expanded-" + label) }; if matches.count > 3 && !expanded.contains(label) { Button(MobileL10n.format("更多（%@）", [String(describing: matches.count)])) { expanded.insert(label) }.accessibilityIdentifier("search-more-" + label) }
        } }
    }
    private func resultLink(_ document: TWHCore.Document, label: String) -> some View {
        NavigationLink { Group { if document.category == "entities" { PersonView(document: document) } else { DocumentView(document: document) } }.onAppear { remember(); focused = false } } label: {
            SearchResultRow(document: document, title: highlight(document.title), snippet: highlight(snippet(document)), person: label == "人物")
        }.accessibilityIdentifier("search-result-" + URL(fileURLWithPath: document.path).lastPathComponent)
    }
    var body: some View { List {
        filters
        if !semanticAvailable && !query.isEmpty { Text("此语言的本机语义模型尚不可用，当前使用全文搜索。系统模型就绪后自动启用。").font(.footnote).foregroundStyle(.secondary) }
        if !model.online { Text("离线 · 只搜索本机已同步内容").font(.footnote).foregroundStyle(Theme.orange) }
        if query.isEmpty { history }
        else if searching { HStack { ProgressView(); Text("正在搜索…") }.redacted(reason: .placeholder) }
        else { ForEach(["记录", "理解", "人物", "对话"], id: \.self) { resultSection($0) }; if results.isEmpty { emptyResults } }
    }.scrollDismissesKeyboard(.interactively).safeAreaInset(edge: .top) { HStack { Image(systemName: "magnifyingglass").foregroundStyle(.secondary); TextField("记录、理解或人物", text: $query).accessibilityIdentifier("record-search-input").focused($focused).submitLabel(.search).onSubmit { remember(); focused = false }; if !query.isEmpty { Button("清除", systemImage: "xmark.circle.fill") { query = "" }.labelStyle(.iconOnly).foregroundStyle(.secondary).frame(minWidth: 44, minHeight: 44) } }.padding(.horizontal, 16).padding(.vertical, 8).background(.bar) }.navigationTitle("搜索").navigationBarTitleDisplayMode(.inline)
    .toolbar { Button("取消") { dismiss() } }
    .task { guard !loaded else { return }; loaded = true; bound = model.boundSpace; recent = UserDefaults.standard.stringArray(forKey: historyKey) ?? []; focused = true }
    .onDisappear { focused = false }
    .onChange(of: query) { _, _ in expanded = [] }
    .task(id: searchSignature) { let signature = searchSignature; guard completedSearch != signature else { searching = false; return }; searching = !query.isEmpty; do { try await Task.sleep(for: .milliseconds(300)); try Task.checkCancellation(); let value = query.trimmingCharacters(in: .whitespacesAndNewlines); let documents = model.documents
            let semantic = await Task.detached(priority: .userInitiated) { LocalSemanticSearch.search(value, documents: documents) }.value
            try Task.checkCancellation(); debounced = value; semanticPaths = semantic.paths; semanticAvailable = semantic.available; completedSearch = signature; searching = false } catch {} }
    .accessibilityElement(children: .contain).accessibilityIdentifier(query.isEmpty ? "SRC-1" : "SRC-2") }
}
struct SearchResultRow: View {
    var document: TWHCore.Document
    var title: AttributedString
    var snippet: AttributedString
    var person: Bool
    var body: some View { HStack(alignment: .top) {
        Image(systemName: person ? "person.crop.circle.fill" : document.isSource ? "doc.text" : "sparkles").foregroundStyle(Theme.blue)
        VStack(alignment: .leading, spacing: 6) { Text(title); Text(snippet).font(.caption).lineLimit(3).foregroundStyle(.secondary); HStack { Text(document.modifiedAt, style: .date); Text(LocalizedStringKey(person ? "人物" : document.isSource ? "记录" : "理解")) }.font(.caption2).foregroundStyle(.secondary) }
    } }
}
struct ImportPreviewFile { var data: Data; var filename: String }
struct ImportView: View {
    var prefilled: ImportPreviewFile?
    @EnvironmentObject private var model: AppModel
    @State private var loadedPrefill = false
    @State private var picker = false
    @State private var prepared: PreparedImportFile?
    @State private var bound: BoundSpace?
    @State private var target = "手机导入"
    @State private var saving = false
    @FocusState private var folderFocused: Bool
    @State private var rawSavedPath: String?
    @State private var readableSavedPath: String?
    @State private var savedPaths: [String] = []
    @State private var showResult = false
    private var preview: String { String(data: prepared?.content ?? Data(), encoding: .utf8).map { String($0.prefix(1600)) } ?? "" }
    var body: some View { Form {
        Text("在手机上保存 Markdown、文本和有文字的 PDF。原文件保留，文字会加入生活记录。").font(.footnote)
        Button("从“文件”选择") { picker = true }.disabled(saving)
        Button("从剪贴板粘贴") { model.draftText = UIPasteboard.general.string ?? ""; model.presented = .writing }.disabled(saving)
        if let prepared {
            Section(prepared.originalName) {
                Text(MobileL10n.format("%@ 字节", [String(prepared.original.count)]))
                Text(preview).font(.caption).lineLimit(10).textSelection(.enabled)
            }
            TextField("保存位置", text: $target).focused($folderFocused).submitLabel(.done).onSubmit { folderFocused = false }.accessibilityIdentifier("import-target").disabled(saving || rawSavedPath != nil || readableSavedPath != nil)
        }
    }.accessibilityElement(children: .contain).accessibilityIdentifier("REC-12")
    .scrollDismissesKeyboard(.interactively).navigationTitle("导入资料").navigationBarTitleDisplayMode(.inline)
    .safeAreaInset(edge: .bottom, spacing: 0) { if prepared != nil { BottomActionBar {
        Button(saving ? MobileL10n.text("正在保存…") : MobileL10n.text("保存到生活记录")) { folderFocused = false; save() }
            .buttonStyle(PrimaryButton()).disabled(saving || bound == nil).accessibilityIdentifier("import-submit")
    } } }
    .task { bound = model.boundSpace; if let prefilled, !loadedPrefill { loadedPrefill = true; do { try receive(prefilled.data, filename: prefilled.filename) } catch { model.error = error.localizedDescription } } }
    .navigationDestination(isPresented: $showResult) { LocalImportResultView(paths: savedPaths, readablePath: readableSavedPath ?? "", bound: bound) }
    .fileImporter(isPresented: $picker, allowedContentTypes: [.plainText, .pdf], allowsMultipleSelection: false) { result in
        model.perform { let urls = try result.get(); guard let url = urls.first else { return }; let access = url.startAccessingSecurityScopedResource(); defer { if access { url.stopAccessingSecurityScopedResource() } }; try receive(Data(contentsOf: url), filename: url.lastPathComponent) }
    } }
    private func receive(_ data: Data, filename: String) throws {
        let next = try ImportFilePreparation.prepare(data, filename: filename)
        prepared = next; rawSavedPath = nil; readableSavedPath = nil; savedPaths = []
    }
    private func save() {
        guard let prepared, let bound, !saving else { return }
        let folder = target
        guard MobileProtocol.validSourceFolder(folder) else { model.error = MobileL10n.text("请填写有效的保存位置。"); return }
        saving = true
        model.perform {
            defer { saving = false }
            if prepared.originalName != prepared.filename, rawSavedPath == nil {
                rawSavedPath = try await bound.store.importNamedSourceFile(data: prepared.original, filename: prepared.originalName, folder: folder)
            }
            if readableSavedPath == nil {
                readableSavedPath = try await bound.store.importNamedSourceFile(data: prepared.content, filename: prepared.filename, folder: folder)
            }
            savedPaths = [readableSavedPath, rawSavedPath].compactMap { $0 }
            await model.refresh(); self.prepared = nil; showResult = true
        }
    }
}
struct LocalImportResultView: View {
    @EnvironmentObject private var model: AppModel
    var paths: [String]
    var readablePath: String
    var bound: BoundSpace?
    @State private var document: TWHCore.Document?
    @State private var originalURL: URL?
    private var folder: String { String((readablePath as NSString).deletingLastPathComponent.dropFirst((bound?.manifest.sourcesPath.count ?? 0) + 1)) }
    var body: some View { List {
        Label("已保存在这台 iPhone", systemImage: "checkmark.circle.fill").foregroundStyle(Theme.blue).accessibilityIdentifier("local-import-saved")
        Text("文字已加入生活记录，原文件保留在所选文件夹。").font(.footnote)
        if model.active?.id == bound?.manifest.id {
            if let document { NavigationLink("查看记录") { DocumentView(document: document) }.accessibilityIdentifier("local-import-open") }
            NavigationLink(MobileL10n.format("查看保存位置：%@", [folder])) { FolderBrowserView(initialFolder: folder) }
        }
        if let originalURL { ShareLink(item: originalURL) { Label("分享原文件", systemImage: "square.and.arrow.up") } }
    }.navigationTitle("导入完成").navigationBarTitleDisplayMode(.inline).task {
        guard let bound else { return }
        do { document = try await bound.store.documents().first { $0.path == readablePath }; originalURL = try await bound.store.url(paths.last ?? readablePath) } catch { model.error = error.localizedDescription }
    }.accessibilityIdentifier("REC-15") }
}
struct RecordInformationView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    var document: TWHCore.Document
    var bound: BoundSpace?
    @State private var moving = false
    @State private var renaming = false
    @State private var deleting = false
    @State private var name = ""
    @State private var sourceInfo: SpaceStore.SourceInformation?
    var body: some View { List {
        Section("来源与文件") { LabeledContent("原始文件", value: sourceInfo?.originalName ?? URL(fileURLWithPath: document.path).lastPathComponent); LabeledContent("保存位置", value: (document.path as NSString).deletingLastPathComponent); LabeledContent("大小", value: ByteCountFormatter.string(fromByteCount: Int64(document.markdown.utf8.count), countStyle: .file)); LabeledContent("创建设备", value: sourceInfo.map { MobileL10n.text($0.deviceId == bound?.deviceId ? "这台 iPhone" : "其他设备") } ?? MobileL10n.text("来源设备未登记")); Text(document.modifiedAt, style: .date) }
        if document.path.contains(".conflict-") { Section("同步冲突") { NavigationLink("处理冲突") { ExistingRecordConflictView(document: document, bound: bound) } } }
        Section { Button("移动") { moving = true }; Button("重命名") { name = URL(fileURLWithPath: document.path).deletingPathExtension().lastPathComponent; renaming = true }; Button("复制全文") { UIPasteboard.general.string = document.markdown }; ShareLink(item: document.markdown) { Label("导出 Markdown", systemImage: "square.and.arrow.up") }; Button("删除", role: .destructive) { deleting = true } }
    }.navigationTitle("记录信息").navigationBarTitleDisplayMode(.inline).task { if let bound { do { sourceInfo = try await bound.store.sourceInformation(for: document.path) } catch { model.error = error.localizedDescription } } }.toolbar { Button("完成") { dismiss() } }
    .sheet(isPresented: $moving) { NavigationStack { RecordDestinationView(title: "移动记录") { folder in guard let bound else { return }; model.perform { _ = try await bound.store.moveSource(path: document.path, folder: folder); await model.refresh(); dismiss() } } }.environmentObject(model) }
    .alert("重命名记录", isPresented: $renaming) { TextField("名称", text: $name); Button("保存") { guard let bound else { return }; let value = name; model.perform { _ = try await bound.store.renameSource(path: document.path, name: value); await model.refresh(); dismiss() } }; Button("取消", role: .cancel) {} }
    .confirmationDialog("移到最近删除？保留 30 天。", isPresented: $deleting) { Button("移到最近删除", role: .destructive) { guard let bound else { return }; model.perform { try await bound.store.trash(path: document.path); await model.refresh(); dismiss() } } }.accessibilityIdentifier("REC-6") }
}
struct ExistingRecordConflictView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    var document: TWHCore.Document
    var bound: BoundSpace?
    @State private var remote = ""
    @State private var hash = ""
    private var originalPath: String { document.path.replacingOccurrences(of: "\\.conflict-[^.]+\\.md$", with: ".md", options: .regularExpression) }
    var body: some View { Group { if hash.isEmpty { ProgressView("读取两个版本…") } else { ConflictMergeView(local: document.markdown, remote: remote, keepBoth: { resolve(remote, keepCopy: true) }, keepLocal: { resolve(document.markdown, keepCopy: false) }, keepRemote: { resolve(remote, keepCopy: false) }) { resolve($0, keepCopy: false) } } }.task {
        guard let bound else { return }; do { let bytes = try await bound.store.read(originalPath); remote = String(data: bytes, encoding: .utf8) ?? ""; hash = MobileProtocol.hash(bytes) } catch { model.error = error.localizedDescription }
    } }
    private func resolve(_ text: String, keepCopy: Bool) { guard let bound else { return }; model.perform {
        try await bound.store.resolveConflict(path: originalPath, expectedHash: hash, markdown: text, conflictPath: document.path, keepCopy: keepCopy)
        await model.refresh(); dismiss()
    } }
}
