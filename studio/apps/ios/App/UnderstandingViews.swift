import SwiftUI
import TWHCore
import ImageIO

struct UnderstandingView: View {
    @EnvironmentObject private var model: AppModel
    @State private var projection: UnderstandingProjection?
    var body: some View { Screen {
        SyncStatusLine()
        if let projection { Text(MobileL10n.format("更新于 %@", [String(describing: projection.updatedAt)])).font(.caption); Text(MobileL10n.format("已收进 %@ 份记录 · 从 %@ 开始，仍在慢慢了解", [String(describing: projection.sourceCount), String(describing: projection.coverageFrom.prefix(10))])).font(.subheadline) }
        if model.documents.filter({ !$0.isSource }).isEmpty { EmptyMessage(title: "再多说几条，我才能开始理解", detail: "先把一段经历留下。"); Button("说一段") { model.presented = .recording } }
        NavigationLink { SelfUnderstandingView() } label: { UnderstandingEntry(title: "理解自己", detail: projection?.cards.first?.excerpt ?? "人生主线、反复循环与现实系统", icon: "person.crop.circle") }
        NavigationLink { TimelineView() } label: { UnderstandingEntry(title: "人生轨迹", detail: projection?.stages.last?.focus ?? "沿时间看看哪些事改变了你", icon: "point.topleft.down.to.point.bottomright.curvepath") }
        NavigationLink { LettersView() } label: { UnderstandingEntry(title: "近况回信", detail: projection?.letters.first?.excerpt ?? "把最近的自己读成一封信", icon: "envelope") }
        NavigationLink { PeopleView() } label: { UnderstandingEntry(title: "人与世界", detail: "\(projection?.people.count ?? 0) 位与你走过一段路的人", icon: "person.2") }
        NavigationLink("一起核对最近的理解") { ReviewUnderstandingView() }
        NavigationLink("未来一瞥") { FutureView() }
    }.navigationTitle("已有理解").onAppear { UserDefaults.standard.set(model.snapshot?.updatedAt ?? MobileProtocol.timestamp(), forKey: "understanding.seenAt.\(model.active?.id ?? "none")") }.task(id: model.snapshot?.updatedAt) { do { projection = try await UnderstandingProjection.load(model.boundSpace) } catch { model.error = error.localizedDescription } }.refreshable { await model.refresh() }.accessibilityIdentifier("UND-1") }
}
struct UnderstandingEntry: View {
    var title: String; var detail: String; var icon: String
    var body: some View { Paper { HStack(alignment: .top, spacing: 14) { Image(systemName: icon).font(.title2).foregroundStyle(Theme.blue).frame(width: 32); VStack(alignment: .leading, spacing: 6) { Text(title).font(Theme.serif(20)).fixedSize(horizontal: false, vertical: true).foregroundStyle(Theme.ink); Text(detail).font(.subheadline).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true) }; Spacer(); Image(systemName: "chevron.right").foregroundStyle(.secondary) } }.padding(.vertical, 2) }
}
struct SelfUnderstandingView: View {
    @EnvironmentObject private var model: AppModel
    @State private var category = "personal-lines"
    @State private var projection: UnderstandingProjection?
    @State private var selectedCard = ""
    @ScaledMetric(relativeTo: .body) private var cardHeight: CGFloat = 340
    private let categories = [("personal-lines", "人生主线"), ("cycles", "反复循环"), ("systems", "现实系统"), ("mental-models", "思维模型")]
    private var documents: [TWHCore.Document] { model.documents.filter { $0.category == category } }
    var body: some View {
        Screen {
            ScrollView(.horizontal, showsIndicators: false) { HStack { ForEach(categories, id: \.0) { item in Button(item.1) { category = item.0; selectedCard = model.documents.first(where: { $0.category == item.0 })?.id ?? "" }.buttonStyle(.bordered).tint(category == item.0 ? Theme.blue : .secondary).frame(minHeight: 44).fixedSize(horizontal: true, vertical: false) } } }
            if documents.isEmpty { EmptyMessage(title: "还在慢慢了解", detail: "已保存的理解同步后，会显示在这里。") }
            else {
                Text("左右滑动，慢慢看这一块的理解").font(.caption).foregroundStyle(.secondary)
                TabView(selection: $selectedCard) {
                    ForEach(documents) { document in ScrollView { understandingCard(document) }.padding(.horizontal, 3).padding(.bottom, 34).tag(document.id) }
                }.tabViewStyle(.page(indexDisplayMode: .always)).indexViewStyle(.page(backgroundDisplayMode: .always)).frame(height: cardHeight).accessibilityIdentifier("understanding.cardPager")
            }
            if category == "mental-models" { Text("这里展示已有的摘要与原话。").font(.footnote).foregroundStyle(.secondary) }
        }.navigationTitle("理解自己").navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) {
            if let document = documents.first(where: { $0.id == selectedCard }) {
                BottomActionBar { AdaptiveActions {
                    NavigationLink("不像我") { CorrectionView(document: document) }.buttonStyle(.bordered).frame(minHeight: 44)
                    if model.phoneModelAvailable { NavigationLink("聊聊这一条") { ConversationView(title: document.title, context: document.excerpt, evidence: document.bodyMarkdown) }.buttonStyle(.borderedProminent).frame(minHeight: 44) }
                } }
            }
        }.task(id: model.snapshot?.updatedAt) { do { projection = try await UnderstandingProjection.load(model.boundSpace); if !documents.contains(where: { $0.id == selectedCard }) { selectedCard = documents.first?.id ?? "" } } catch { model.error = error.localizedDescription } }.accessibilityIdentifier("UND-2")
    }
    private func understandingCard(_ document: TWHCore.Document) -> some View {
        let count = projection?.cards.first(where: { $0.path == document.path })?.evidence.count ?? 0
        return VStack(alignment: .leading, spacing: 16) {
            AdaptiveActions { Label("已同步的理解", systemImage: "text.book.closed"); Text(document.modifiedAt, style: .date) }.font(.caption).foregroundStyle(.secondary)
            NavigationLink { StructuredUnderstandingView(document: document) } label: { VStack(alignment: .leading, spacing: 14) { Text(document.title).font(Theme.serif(24)).fixedSize(horizontal: false, vertical: true); Text(document.excerpt).font(Theme.serif(17)).lineLimit(5).fixedSize(horizontal: false, vertical: true) }.frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle()) }.buttonStyle(.plain)
            Text(MobileL10n.format("依据 %@ 份", [String(count)]) + (count < 3 ? MobileL10n.text(" · 还在了解") : "")).font(.caption)
        }.padding(16).frame(maxWidth: .infinity, alignment: .leading).background(Color.white, in: RoundedRectangle(cornerRadius: 18)).overlay { RoundedRectangle(cornerRadius: 18).strokeBorder(Theme.blue.opacity(count < 3 ? 0.55 : 0.15), style: StrokeStyle(lineWidth: 1, dash: count < 3 ? [6, 4] : [])) }
    }
}
struct StructuredUnderstandingView: View {
    @EnvironmentObject private var model: AppModel
    var document: TWHCore.Document
    @State private var projection: UnderstandingProjection?
    @State private var voice = false
    @State private var voiceSection = ""
    @State private var bound: BoundSpace?
    private var card: UnderstandingProjection.Card? { projection?.cards.first { $0.path == document.path } }
    var body: some View { Screen {
        Text(document.title).font(Theme.serif(26)).fixedSize(horizontal: false, vertical: true); Text(card?.excerpt ?? document.excerpt).font(Theme.serif(18))
        if let card {
            if let confidence = card.confidence { Text(MobileL10n.text("置信度：") + confidence).font(.caption) }; if document.category == "mental-models" { Text(card.hitCount.map { MobileL10n.format("命中 %@ 次", [String(describing: $0)]) } ?? MobileL10n.text("命中次数尚未统计")).font(.caption) }
            Text(MobileL10n.format("依据 %@ 份 · %@", [String(describing: card.evidence.count), String(describing: document.modifiedAt.formatted(date: .abbreviated, time: .omitted))])).font(.caption)
            if card.evidence.count < 3 { Text(document.category == "cycles" ? MobileL10n.text("可能的循环 · 证据仍少") : MobileL10n.text("还在了解 · 依据不足")).foregroundStyle(.secondary) }
            if document.category == "cycles", let cycle = card.cycle { CycleExplanationView(cycle: cycle, evidence: card.evidence, document: document) }
            ForEach(Array(card.sections.enumerated()), id: \.offset) { _, section in DisclosureGroup(section.heading) { Text(section.body).font(Theme.serif(17)).textSelection(.enabled); if document.category == "systems" { Button("补充一下 · 语音") { voiceSection = section.heading; voice = true } } } }
            Text("我是怎么看出来的 · 原话来源").font(.headline); ProjectedEvidenceView(refs: card.evidence)
            if card.sections.isEmpty { Text("暂无结构化说明，可以先阅读完整原文。").foregroundStyle(.secondary) }
        }
        NavigationLink("阅读完整理解") { DocumentView(document: document) }.buttonStyle(.bordered).frame(minHeight: 44)
    }.navigationTitle("理解详情").navigationBarTitleDisplayMode(.inline)
    .safeAreaInset(edge: .bottom) { BottomActionBar { AdaptiveActions {
        NavigationLink("它不像我 · 纠错与补充") { CorrectionView(document: document) }.buttonStyle(.bordered).frame(minHeight: 44)
        if model.phoneModelAvailable { NavigationLink("聊聊这一条") { ConversationView(title: document.title, context: document.excerpt, evidence: document.markdown) }.buttonStyle(.borderedProminent).frame(minHeight: 44) }
    } } }.task(id: model.snapshot?.updatedAt) { if bound == nil { bound = model.boundSpace }; do { projection = try await UnderstandingProjection.load(bound) } catch { model.error = error.localizedDescription } }.sheet(isPresented: $voice) { QuestionVoiceView(question: MobileL10n.format("补充：%@", [document.title]) + " · " + voiceSection) { text in let section = voiceSection; model.perform { guard let bound else { return }; _ = try await bound.store.saveOriginal(text: "补充对象：\(document.path)\n类别：\(document.category)\n分块：\(section)\n\n\(text)", folder: "理解补充"); await model.refresh(); model.message = "补充原话已保存" } } } }
}
struct EvidenceLinksView: View {
    @EnvironmentObject private var model: AppModel
    var document: TWHCore.Document
    @State private var projection: UnderstandingProjection?
    var body: some View { Group { let refs = projection?.cards.first(where: { $0.path == document.path })?.evidence ?? projection?.letters.first(where: { $0.path == document.path })?.evidence ?? []
        if !refs.isEmpty { DisclosureGroup(MobileL10n.format("提到的来源 · %@ 份", [String(describing: refs.count)])) { ProjectedEvidenceView(refs: refs) } }
    }.task(id: model.snapshot?.updatedAt) { do { projection = try await UnderstandingProjection.load(model.boundSpace) } catch { model.error = error.localizedDescription } } }
}
struct TimelineView: View {
    @EnvironmentObject private var model: AppModel
    @State private var projection: UnderstandingProjection?
    @State private var selected: Set<String> = []; @State private var hidden: Set<String> = []; @State private var newLine = ""; @State private var custom: [String] = []
    private var key: String { "timeline.preferences." + (model.active?.id ?? "none") }
    private var lanes: [String] { Array(Set((projection?.nodes ?? []).map(\.lane) + custom)).sorted() }
    private var nodes: [UnderstandingProjection.Node] { (projection?.nodes ?? (model.snapshot?.timeline ?? []).map { UnderstandingProjection.Node(id: $0.id, path: $0.relativePath ?? "", title: $0.title, date: $0.start ?? "", excerpt: $0.excerpt, start: $0.start ?? "", end: $0.end ?? "", lane: "未分类", turning: false, sections: [], evidence: [], people: []) }).filter { !hidden.contains($0.lane) && (selected.isEmpty || selected.contains($0.lane)) }.sorted { $0.start > $1.start } }
    var body: some View { ScrollViewReader { reader in List {
        ScrollView(.horizontal) { HStack { Button("全部") { selected = [] }; ForEach(lanes, id: \.self) { lane in Button(lane) { if selected.contains(lane) { selected.remove(lane) } else { selected.insert(lane) } }.buttonStyle(.bordered).tint(selected.contains(lane) ? LifeThreadStyle.color(lane, among: lanes) : .secondary) } } }
        if lanes.count > 1 { DisclosureGroup("并行人生线") { ForEach(lanes, id: \.self) { lane in Toggle(isOn: Binding(get: { !hidden.contains(lane) }, set: { if $0 { hidden.remove(lane) } else { hidden.insert(lane) }; persist() })) { Label { Text(lane) } icon: { Image(systemName: "circle.fill").foregroundStyle(LifeThreadStyle.color(lane, among: lanes)) } }.tint(LifeThreadStyle.color(lane, among: lanes)); Text((projection?.nodes ?? []).first(where: { $0.lane == lane })?.title ?? MobileL10n.text("还没有节点")).font(.caption) } } }
        if nodes.count < 3 { Text("再多说几段经历，轨迹才会更清楚。").foregroundStyle(.secondary) }
        ForEach(Array(Set(nodes.map { String($0.start.prefix(4)) })).sorted(by: >), id: \.self) { year in Section(year.isEmpty ? "日期待核对" : year) { ForEach(nodes.filter { String($0.start.prefix(4)) == year }) { node in NavigationLink { MobileNodeDetailView(node: node) } label: { VStack(alignment: .leading) { Text(node.start.isEmpty ? MobileL10n.text("日期未确定") : node.start).font(.caption); Label { Text(node.title) } icon: { Image(systemName: node.turning ? "largecircle.fill.circle" : "circle.fill").foregroundStyle(LifeThreadStyle.color(node.lane, among: lanes)) }.font(node.turning ? .headline : .body); Text(node.excerpt).lineLimit(3); Text(node.lane).font(.caption) } }.id(node.id).contextMenu { if let doc = model.documents.first(where: { $0.path == node.path }) { NavigationLink("这个节点不准") { CorrectionView(document: doc) } } } } } }
        Button("跳到今天") { if let id = nodes.first?.id { withAnimation { reader.scrollTo(id, anchor: .top) } } }
    }.navigationTitle("人生轨迹").navigationBarTitleDisplayMode(.inline) }.task(id: model.snapshot?.updatedAt) { hidden = Set(UserDefaults.standard.stringArray(forKey: key + ".hidden") ?? []); custom = UserDefaults.standard.stringArray(forKey: key + ".custom") ?? UserDefaults.standard.stringArray(forKey: "timeline.lines." + (model.active?.id ?? "none")) ?? []; do { projection = try await UnderstandingProjection.load(model.boundSpace) } catch { model.error = error.localizedDescription } }.accessibilityIdentifier("UND-7") }
    private func persist() { UserDefaults.standard.set(Array(hidden), forKey: key + ".hidden"); UserDefaults.standard.set(custom, forKey: key + ".custom") }
}
struct MobileNodeDetailView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    var node: UnderstandingProjection.Node
    @State private var newLine = ""; @State private var bound: BoundSpace?
    var body: some View { Screen {
        Text(node.title).font(Theme.serif(26)).fixedSize(horizontal: false, vertical: true); Text(node.start.isEmpty ? MobileL10n.text("日期不确定") : node.start); Text(node.lane + (node.turning ? MobileL10n.text(" · 转折") : "")); Text(node.excerpt).font(Theme.serif(18))
        if node.turning {
            Text("它改变了什么").font(.headline)
            if dynamicTypeSize.isAccessibilitySize {
                VStack(spacing: 12) { turningColumn("转折前", body: node.before); turningColumn("转折后", body: node.after) }
            } else {
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .top, spacing: 12) {
                        turningColumn("转折前", body: node.before).frame(minWidth: 160)
                        turningColumn("转折后", body: node.after).frame(minWidth: 160)
                    }
                    VStack(spacing: 12) { turningColumn("转折前", body: node.before); turningColumn("转折后", body: node.after) }
                }
            }
        }
        ForEach(Array(node.sections.enumerated()), id: \.offset) { _, section in Text(section.heading).font(.headline); Text(section.body).font(Theme.serif(17)) }
        Text("相关人物").font(.headline); ProjectedEvidenceView(refs: node.people); Text("相关记录").font(.headline); ProjectedEvidenceView(refs: node.evidence)
    }.navigationTitle("轨迹节点").navigationBarTitleDisplayMode(.inline)
    .safeAreaInset(edge: .bottom) { if let doc = model.documents.first(where: { $0.path == node.path }) { BottomActionBar { NavigationLink("补充这条经历") { CorrectionView(document: doc) }.buttonStyle(.bordered).frame(minHeight: 44) } } }.task { bound = model.boundSpace } }
    private func turningColumn(_ title: String, body: String?) -> some View {
        VStack(alignment: .leading, spacing: 10) { Text(MobileL10n.text(title)).font(.headline); Text(body ?? MobileL10n.text("原始理解尚未说明，可以核对或补充。")).font(Theme.serif(17)).foregroundStyle(body == nil ? .secondary : .primary) }.padding(12).frame(maxWidth: .infinity, alignment: .topLeading).background(Theme.pale, in: RoundedRectangle(cornerRadius: 12))
    }
}
struct LettersView: View {
    @EnvironmentObject private var model: AppModel
    @State private var filter = "全部"
    @State private var projection: UnderstandingProjection?
    private var letters: [TWHCore.Document] { model.documents.filter { doc in guard doc.category == "letters" else { return false }; let archived = model.documentFlag("archived", document: doc); if filter == "已归档" { return archived }; if archived { return false }; if filter == "收藏" { return model.documentFlag("favorite", document: doc) }; if filter == "未读" { return !model.documentFlag("read", document: doc) }; return true }.sorted { $0.modifiedAt > $1.modifiedAt } }
    private var unread: [TWHCore.Document] { letters.filter { !model.documentFlag("read", document: $0) } }
    private var read: [TWHCore.Document] { letters.filter { model.documentFlag("read", document: $0) } }
    var body: some View { List {
        ScrollView(.horizontal, showsIndicators: false) { HStack(spacing: 8) { ForEach(["全部","未读","收藏","已归档"], id: \.self) { item in Button(LocalizedStringKey(item)) { filter = item }.buttonStyle(.bordered).tint(filter == item ? Theme.blue : .secondary).frame(minHeight: 44).fixedSize(horizontal: true, vertical: false) } } }.accessibilityLabel("回信筛选")
        if letters.isEmpty { EmptyMessage(title: "还没有已保存的回信", detail: "已有回信同步后，会显示在这里。", symbol: "envelope") }
        if !unread.isEmpty { Section("未读") { ForEach(unread) { doc in letterRow(doc) } } }
        ForEach(Array(Set(read.map { month($0) })).sorted(by: >), id: \.self) { value in Section(value) { ForEach(read.filter { month($0) == value }) { doc in letterRow(doc) } } }
    }.navigationTitle("近况回信").navigationBarTitleDisplayMode(.inline).task(id: model.snapshot?.updatedAt) { do { projection = try await UnderstandingProjection.load(model.boundSpace) } catch { model.error = error.localizedDescription } }.accessibilityIdentifier("UND-10") }
    private func month(_ doc: TWHCore.Document) -> String { String(doc.modifiedAt.formatted(.iso8601).prefix(7)) }
    private func letterRow(_ doc: TWHCore.Document) -> some View {
        NavigationLink { MobileLetterReader(document: doc) } label: { VStack(alignment: .leading) { HStack { if !model.documentFlag("read", document: doc) { Circle().fill(Theme.orange).frame(width: 8,height: 8) }; Text(doc.title).font(Theme.serif(20)).fixedSize(horizontal: false, vertical: true) }; Text(doc.excerpt).lineLimit(2); AdaptiveActions { Text(doc.modifiedAt, style: .date); if let letter = projection?.letters.first(where: { $0.path == doc.path }) { if let voice = letter.voice { Text(MobileL10n.text(voice)).padding(.horizontal, 7).padding(.vertical, 3).background(Theme.pale, in: Capsule()) }; if let perspective = letter.perspective, perspective != "auto" { Text(perspective).foregroundStyle(.secondary) } } }.font(.caption) } }.swipeActions { Button("归档") { model.setDocumentFlag("archived", document: doc, value: true) } }
    }
}
struct MobileLetterReader: View {
    @EnvironmentObject private var model: AppModel
    var document: TWHCore.Document
    @State private var projection: UnderstandingProjection?
    @State private var size: Double = 18; @State private var position: String?
    @State private var readingCoordinateSpace = UUID(); @State private var restoredPosition = false
    private var letter: UnderstandingProjection.Letter? { projection?.letters.first { $0.path == document.path } }
    var body: some View { ScrollViewReader { proxy in ScrollView { VStack(alignment: .leading, spacing: 16) {
        Text(document.title).font(Theme.serif(26)).fixedSize(horizontal: false, vertical: true); Text(letter?.date ?? document.modifiedAt.formatted()).font(.caption)
        Text(MobileL10n.format("参考 %@ 份记录", [String(describing: letter?.referenceCount ?? letter?.evidence.count ?? 0)])).font(.caption); if let voice = letter?.voice { Text(MobileL10n.text(voice)).font(.subheadline) }; if let perspective = letter?.perspective, perspective != "auto" { Text(perspective).font(.caption) }
        ForEach(Array(document.bodyMarkdown.components(separatedBy: "\n\n").enumerated()), id: \.offset) { index, paragraph in Text(paragraph).font(Theme.serif(size)).lineSpacing(size * 0.45).padding(paragraph.hasPrefix(">") ? 12 : 0).background(paragraph.hasPrefix(">") ? Theme.pale : Color.clear).textSelection(.enabled).id(String(index)).readingParagraph(String(index), in: readingCoordinateSpace) }
        DisclosureGroup("信里提到的") { ProjectedEvidenceView(refs: letter?.evidence ?? []) }
        Button(model.documentFlag("favorite", document: document) ? MobileL10n.text("取消收藏") : MobileL10n.text("收藏")) { model.setDocumentFlag("favorite", document: document, value: !model.documentFlag("favorite", document: document)) }
    }.frame(maxWidth: .infinity, alignment: .leading).padding(16) }.trackReadingPosition($position, in: readingCoordinateSpace) { guard !restoredPosition else { return position }; restoredPosition = true; let saved = UserDefaults.standard.string(forKey: "reading.letter.\(model.active?.id ?? "").\(document.path)") ?? UserDefaults.standard.string(forKey: "reading.\(document.id)"); position = saved.flatMap { value in Int(value).flatMap { document.bodyMarkdown.components(separatedBy: "\n\n").indices.contains($0) ? value : nil } }; if let position { proxy.scrollTo(position, anchor: .top) }; return position }.onAppear { model.setDocumentFlag("read", document: document, value: true) }.onDisappear { UserDefaults.standard.set(position, forKey: "reading.letter.\(model.active?.id ?? "").\(document.path)") } }
        .safeAreaInset(edge: .bottom) { BottomActionBar { AdaptiveActions {
            NavigationLink("它不像我") { CorrectionView(document: document) }.buttonStyle(.bordered).frame(minHeight: 44)
            if model.phoneModelAvailable { NavigationLink("聊聊这封信") { ConversationView(title: document.title, context: document.excerpt, evidence: document.markdown) }.buttonStyle(.borderedProminent).frame(minHeight: 44) }
        } } }.background(ImmersiveReadingNavigation()).navigationTitle("近况回信").navigationBarTitleDisplayMode(.inline).toolbar { Button("A−") { size = max(15,size-1) }.frame(minWidth: 44, minHeight: 44); Button("A+") { size = min(30,size+1) }.frame(minWidth: 44, minHeight: 44); ShareLink(item: document.markdown) { Image(systemName: "square.and.arrow.up") } }.task { do { projection = try await UnderstandingProjection.load(model.boundSpace) } catch { model.error = error.localizedDescription } }.accessibilityIdentifier("UND-11") }
}
// Legacy internal routes show saved letters; phone generation is intentionally unavailable.
typealias LetterRequestView = LettersView
struct PeopleView: View {
    @EnvironmentObject private var model: AppModel
    @State private var search = ""; @State private var role = "全部"; @State private var frequency = false; @State private var projection: UnderstandingProjection?
    private var people: [UnderstandingProjection.Person] { (projection?.people ?? []).filter { (search.isEmpty || $0.title.localizedCaseInsensitiveContains(search)) && (role == "全部" || $0.group == role) }.sorted { frequency ? $0.mentionCount > $1.mentionCount : $0.lastMention > $1.lastMention } }
    var body: some View { List {
        Picker("关系", selection: $role) { ForEach(["全部","家人","朋友","同事","伴侣","其他"], id: \.self) { Text(LocalizedStringKey($0)) } }; Toggle("按出现次数排序", isOn: $frequency)
        if model.photos.contains(where: { $0.photos.contains(where: { $0.faces.contains(where: { $0.name.isEmpty }) }) }) { Button("照片里还有待命名的人") { model.presented = .photos } }
        ForEach(Array(Set(people.map(\.group))).sorted(), id: \.self) { group in Section(MobileL10n.format("%@ · %@ 人", [String(describing: group), String(describing: people.filter { $0.group == group }.count)])) { ForEach(people.filter { $0.group == group }) { person in if let doc = model.documents.first(where: { $0.path == person.path }) { NavigationLink { PersonView(document: doc) } label: { HStack { Text(String(person.title.prefix(1))).font(Theme.serif(24)).frame(width: 44, height: 44).background(Theme.pale, in: Circle()); VStack(alignment: .leading) { Text(person.title).font(.body.weight(.medium)).fixedSize(horizontal: false, vertical: true); Text(MobileL10n.format("%@ · 出现 %@ 次 · %@", [String(describing: person.group), String(describing: person.mentionCount), String(describing: person.lastMention.prefix(10))])).font(.caption) } } } } } } }
        if projection == nil { ForEach(model.documents.filter { $0.category == "entities" && (search.isEmpty || $0.title.localizedCaseInsensitiveContains(search)) }) { document in NavigationLink { PersonView(document: document) } label: { Text(document.title) } } }
        if people.isEmpty && model.documents.filter({ $0.category == "entities" }).isEmpty { EmptyMessage(title: "还没有人物", detail: "已保存的人物资料同步后，会显示在这里。") }
        NavigationLink("手动补充一个人") { PersonSupplementView() }
    }.navigationTitle("人与世界").navigationBarTitleDisplayMode(.inline).searchable(text: $search).task(id: model.snapshot?.updatedAt) { do { projection = try await UnderstandingProjection.load(model.boundSpace) } catch { model.error = error.localizedDescription } }.accessibilityIdentifier("UND-16") }
}
struct PersonView: View {
    @EnvironmentObject private var model: AppModel
    var document: TWHCore.Document
    @State private var projection: UnderstandingProjection?; @State private var bound: BoundSpace?
    private var person: UnderstandingProjection.Person? { projection?.people.first { $0.path == document.path } }
    var body: some View { Screen {
        Text(document.title).font(Theme.serif(26)).fixedSize(horizontal: false, vertical: true); Text(person?.group ?? MobileL10n.text("关系待核对")).font(.caption); Text(document.excerpt).font(Theme.serif(18))
        if let person {
            PersonMemoryPhotos(name: document.title)
            if person.mentionCount < 3 { Text("了解还不多，可以多说一点关于 TA 的事。").foregroundStyle(.secondary) }
            Text("共同经历").font(.headline); ProjectedEvidenceView(refs: person.events)
            Text("相关记录").font(.headline); ProjectedEvidenceView(refs: person.evidence)
        }
        NavigationLink("阅读你们之间的理解") { DocumentView(document: document) }.buttonStyle(.bordered).frame(minHeight: 44)
    }.navigationTitle("人物详情").navigationBarTitleDisplayMode(.inline)
    .safeAreaInset(edge: .bottom) { BottomActionBar { AdaptiveActions {
        NavigationLink("改名或不像我 · 纠错") { CorrectionView(document: document) }.buttonStyle(.bordered).frame(minHeight: 44)
        if model.phoneModelAvailable { NavigationLink("聊聊 TA") { ConversationView(title: document.title, context: document.excerpt, evidence: document.markdown) }.buttonStyle(.borderedProminent).frame(minHeight: 44) }
    } } }.task(id: model.snapshot?.updatedAt) { if bound == nil { bound = model.boundSpace }; do { projection = try await UnderstandingProjection.load(bound) } catch { model.error = error.localizedDescription } }
        .accessibilityIdentifier("UND-17") }
}
struct PersonMemoryPhotos: View {
    @EnvironmentObject private var model: AppModel
    var name: String
    struct Item: Identifiable { var id: String; var image: UIImage; var recordPath: String? }
    @State private var images: [Item] = []
    var body: some View { ScrollView(.horizontal) { HStack { ForEach(images) { item in
        if let document = model.documents.first(where: { $0.path == item.recordPath }) { NavigationLink { DocumentView(document: document) } label: { Image(uiImage: item.image).resizable().scaledToFit().frame(width: 180,height: 160) } }
        else { Image(uiImage: item.image).resizable().scaledToFit().frame(width: 180,height: 160).accessibilityLabel("相关照片，故事尚未同步") }
    } } }.task(id: model.snapshot?.updatedAt) { guard let bound = model.boundSpace else { return }; var loaded: [Item] = []
        for draft in model.photos where draft.knowledgeBaseId == bound.manifest.id {
            for photo in draft.photos where photo.faces.contains(where: { $0.name == name }) {
                guard loaded.count < 12 else { break }
                if let bytes = try? await bound.store.read(photo.path), let source = CGImageSourceCreateWithData(bytes as CFData, nil), let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceThumbnailMaxPixelSize: 640, kCGImageSourceCreateThumbnailWithTransform: true] as CFDictionary) { loaded.append(Item(id: photo.path, image: UIImage(cgImage: thumbnail), recordPath: model.documents.first(where: { $0.isSource && $0.markdown.contains(photo.path) })?.path)) }
            }
        }; images = loaded
    } }
}
struct PersonSupplementView: View {
    @EnvironmentObject private var model: AppModel
    @State private var name = ""; @State private var role = "朋友"; @State private var text = ""
    var body: some View { Form { TextField("称呼", text: $name); Picker("关系", selection: $role) { ForEach(["家人", "朋友", "同事", "伴侣", "其他"], id: \.self) { Text(LocalizedStringKey($0)) } }; TextEditor(text: $text).frame(minHeight: 180) }.safeAreaInset(edge: .bottom) { BottomActionBar { Button("保存补充") { model.perform { guard let bound = model.boundSpace else { return }; _ = try await bound.store.saveOriginal(text: "称呼：\(name)\n关系：\(role)\n\n\(text)", folder: "人物补充", title: name); await model.refresh(); model.message = "人物补充原话已保存" } }.buttonStyle(PrimaryButton()).disabled(name.isEmpty) } }.navigationTitle("补充人物").navigationBarTitleDisplayMode(.inline) }
}
struct CorrectionView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    var document: TWHCore.Document
    @State private var reason = "不准确"; @State private var text = ""; @State private var voice = false; @State private var bound: BoundSpace?
    var body: some View { Form {
        Section("被纠正的理解") { Text(document.excerpt).font(Theme.serif(17)) }
        Picker("原因", selection: $reason) { ForEach(["不准确","太绝对","缺了信息","改名或合并人物","节点日期有误","删除节点"], id: \.self) { Text(LocalizedStringKey($0)) } }
        TextEditor(text: $text).frame(minHeight: 160).accessibilityLabel("用自己的话纠正这句理解").accessibilityIdentifier("understanding-correction-input"); Button("用语音说") { voice = true }
        Text("只保存你的纠正原话，不会自动改写已有理解。离线也可以保存。")
    }.accessibilityElement(children: .contain).accessibilityIdentifier("UND-18").safeAreaInset(edge: .bottom) { BottomActionBar { AdaptiveActions {
        Button("保存纠正原话") { model.perform { guard let bound else { return }; _ = try await bound.store.correction(document: document, reason: reason, text: text); model.message = "纠正原话已保存"; await model.refresh(); dismiss() } }.buttonStyle(PrimaryButton()).disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        Button("稍后再说") { dismiss() }.buttonStyle(.bordered).frame(minHeight: 44)
    } } }.navigationTitle("不像我").navigationBarTitleDisplayMode(.inline).task { bound = model.boundSpace }.sheet(isPresented: $voice) { QuestionVoiceView(question: "用自己的话纠正这句理解") { text += (text.isEmpty ? "" : "\n") + $0 } } }
}
struct ReviewUnderstandingView: View {
    @EnvironmentObject private var model: AppModel
    @State private var reviewed: Set<String> = []
    private var key: String { "understanding.reviewed." + (model.active?.id ?? "none") }
    var body: some View { List { ForEach(model.documents.filter { !$0.isSource && !reviewed.contains($0.id + $0.hash) }.prefix(20)) { document in NavigationLink { CorrectionView(document: document) } label: { VStack(alignment: .leading) { Text(document.title); Text(document.excerpt).font(.subheadline);  } }.swipeActions(edge: .leading) { Button("准确") { reviewed.insert(document.id + document.hash); UserDefaults.standard.set(Array(reviewed), forKey: key) }.tint(.green) }.swipeActions { NavigationLink("不像我") { CorrectionView(document: document) } } } }.navigationTitle("一起核对").navigationBarTitleDisplayMode(.inline).task(id: model.active?.id) { reviewed = Set(UserDefaults.standard.stringArray(forKey: key) ?? []) } }
}
struct FutureView: View {
    @EnvironmentObject private var model: AppModel
    @State private var prediction: PredictionSummary?
    @State private var thought = ""; @State private var kind = "想做的事"
    @State private var voice = false; @State private var voiceQuestion = "写下你的想法"
    @State private var bound: BoundSpace?; @State private var saving = false
    private var key: String { "prediction.thought." + (bound?.manifest.id ?? "none") }
    var body: some View { Screen {
        Paper {
            Picker("想法类型",selection:$kind) { ForEach(["想做的事","担心的事","一个假设"],id:\.self) { Text(LocalizedStringKey($0)) } }
            TextEditor(text:$thought).frame(minHeight:140).accessibilityLabel("想法原文")
            Button("说一段",systemImage:"mic") { voiceQuestion = "写下你的想法"; voice = true }
        }
        if let prediction {
            Text("已有的情景摘要").font(Theme.serif(26)).fixedSize(horizontal: false, vertical: true)
            Text("这里只回看已保存的内容，不会发起新的预测。")
            PredictionTimeScaleView(prediction: prediction)
            DisclosureGroup(MobileL10n.format("已有了解度记录 %@ / 100", [String(prediction.understanding.score)])) {
                ForEach(prediction.understanding.facets, id: \.id) { facet in
                    Text(MobileL10n.text(facet.label)); ProgressView(value:Double(facet.value),total:Double(max(1,facet.max)))
                    ForEach(facet.gaps ?? [], id: \.self) { gap in Button(gap + MobileL10n.text(" · 说一段")) { voiceQuestion = gap; voice = true } }
                }
                Text("保存补充只会留下原话，不会自动重新计算这份摘要。").font(.footnote)
            }
            if let report = prediction.report {
                Text(prediction.question ?? prediction.thoughts ?? MobileL10n.text("已有情景")).font(.headline)
                if let generated = prediction.generatedAt, let date = MobileProtocol.date(generated), Date().timeIntervalSince(date) > 90*86400 { Text("这份结果超过90天，仅供回看，当前情况可能已经变化。").foregroundStyle(.orange) }
                Text(report.current).font(Theme.serif(18))
                ForEach(report.scenarios, id: \.id) { scenario in NavigationLink { PredictionResultSummaryView(prediction:prediction,knowledgeBaseId:bound?.manifest.id ?? "") } label: { Paper { Text(scenario.title).font(Theme.serif(22)); Text(scenario.overview).lineLimit(2) } }.buttonStyle(.plain) }
                ShareLink(item:prediction.exportText) { Label("导出摘要",systemImage:"square.and.arrow.up") }
            }
        } else { EmptyMessage(title:"先留下此刻的想法",detail:"可以写下想做、担心或假设的事。已有情景摘要同步后可在这里回看。") }
    }.safeAreaInset(edge: .bottom) { BottomActionBar {
        Button(saving ? "正在保存…" : "保存想法") { saveThought() }.buttonStyle(PrimaryButton()).disabled(saving || thought.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty).accessibilityIdentifier("future-save-thought")
    } }.navigationTitle("想法与已有情景").navigationBarTitleDisplayMode(.inline).task(id:model.snapshot?.updatedAt) {
        if bound == nil { bound = model.boundSpace; thought = UserDefaults.standard.string(forKey:key) ?? "" }
        await load()
    }.onChange(of:thought) { _, value in UserDefaults.standard.set(value,forKey:key) }.refreshable { await model.refresh(); await load() }
    .sheet(isPresented:$voice) { QuestionVoiceView(question:voiceQuestion) { spoken in thought += (thought.isEmpty ? "" : "\n") + (voiceQuestion == "写下你的想法" ? spoken : "问题：\(voiceQuestion)\n\(spoken)") } }.accessibilityIdentifier("FUT-1") }
    private func saveThought() {
        guard !saving, let bound else { return }; let input = thought; let selectedKind = kind; saving = true
        model.perform { defer { saving = false }; _ = try await bound.store.saveOriginal(text:"类型：\(selectedKind)\n\n\(input)",folder:"想法"); if model.active?.id == bound.manifest.id { if thought == input { thought = "" }; await model.refresh(); model.message = "想法原话已保存" } }
    }
    private func load() async {
        do { guard let bound else { return }; let value = try JSONDecoder().decode(PredictionSummary.self,from:await bound.store.read(".mobile/prediction.json")); guard value.knowledgeBaseId == bound.manifest.id else { throw MobileError.invalidData("摘要不属于当前空间。") }; prediction = value }
        catch let error as NSError where error.domain == NSCocoaErrorDomain && error.code == NSFileReadNoSuchFileError { prediction = nil }
        catch { model.error = error.localizedDescription }
    }
}
struct PredictionSummary: Decodable {
    struct Understanding: Decodable { struct Facet: Decodable { var id: String; var label: String; var value: Int; var max: Int; var gaps: [String]? }; var score: Int; var unlocked: Bool; var facets: [Facet] }
    struct Report: Decodable {
        struct Evidence: Decodable { var id: String; var pageId: String; var quote: String }
        struct Scenario: Decodable { struct Dimension: Decodable { var id: String; var gains: [String]; var costs: [String] }; var id: String; var title: String; var overview: String; var unknowns: [String]; var confidence: String?; var dimensions: [Dimension]?; struct Stage: Decodable { var period: String; var change: String; var condition: String }; var stages: [Stage]? }
        var current: String; var scenarios: [Scenario]; var evidence: [Evidence]?
    }
    var knowledgeBaseId: String; var understanding: Understanding; var report: Report?; var generatedAt: String?; var thoughts: String?; var question: String?; var requestedTimeRange: String?
    var exportText: String {
        let header = [question ?? thoughts ?? "", requestedTimeRange.map { MobileL10n.text("时间范围：") + MobileL10n.text($0) } ?? "", report?.current ?? ""].filter { !$0.isEmpty }.joined(separator: "\n\n")
        let scenarios = (report?.scenarios ?? []).map { scenario in
            let dimensions = (scenario.dimensions ?? []).map { $0.id + "\n" + MobileL10n.text("收获：") + $0.gains.joined(separator: "；") + "\n" + MobileL10n.text("代价：") + $0.costs.joined(separator: "；") }.joined(separator: "\n")
            return [scenario.title, scenario.overview, dimensions, MobileL10n.text("它不能确定的：") + scenario.unknowns.joined(separator: "；")].joined(separator: "\n")
        }.joined(separator: "\n\n")
        let evidence = (report?.evidence ?? []).map { $0.pageId + "\n> " + $0.quote }.joined(separator: "\n")
        return [header, scenarios, evidence].filter { !$0.isEmpty }.joined(separator: "\n\n")
    }
}

struct PredictionResultSummaryView: View {
    @EnvironmentObject private var model: AppModel
    var prediction: PredictionSummary
    var knowledgeBaseId: String
    var body: some View { Screen {
        Text(prediction.question ?? prediction.thoughts ?? MobileL10n.text("最近一次预测")).font(Theme.serif(26)).fixedSize(horizontal: false, vertical: true)
        if let range = prediction.requestedTimeRange { Text(MobileL10n.text("时间范围：") + MobileL10n.text(range)).font(.caption) }
        if let generated = prediction.generatedAt, let date = ISO8601DateFormatter().date(from: generated), Date().timeIntervalSince(date) > 90*86400 { Text("这份结果超过90天，仅供回看，当前情况可能已经变化。").foregroundStyle(.orange) }
        Text(prediction.report?.current ?? "").font(Theme.serif(18))
        DisclosureGroup("依据 · 数据来自哪些记录") { ForEach(prediction.report?.evidence ?? [], id: \.id) { item in Text(item.quote); if let document = model.documents.first(where: { $0.path == item.pageId }) { NavigationLink(document.title) { DocumentView(document: document) } } else { Text("来源未同步或已不可用").foregroundStyle(.secondary) } } }
        ForEach(prediction.report?.scenarios ?? [], id: \.id) { scenario in scenarioCard(scenario) }
    }.safeAreaInset(edge: .bottom) { BottomActionBar {
        ShareLink(item: prediction.exportText) { Label("导出摘要", systemImage: "square.and.arrow.up") }.buttonStyle(.borderedProminent).frame(minHeight: 44)
    } }.navigationTitle("可能的路径").navigationBarTitleDisplayMode(.inline).accessibilityIdentifier("FUT-6") }
    private func scenarioCard(_ scenario: PredictionSummary.Report.Scenario) -> some View { Paper {
        Text(scenario.title).font(Theme.serif(24)); Text(scenario.overview).font(Theme.serif(18))
        Text(MobileL10n.text("可能性：") + (scenario.confidence ?? MobileL10n.text("模型未提供")))
        ForEach(scenario.dimensions ?? [], id: \.id) { dimension in Text(MobileL10n.text(dimension.id)).font(.headline); Text(MobileL10n.text("收获：") + dimension.gains.joined(separator: "；")); Text(MobileL10n.text("代价：") + dimension.costs.joined(separator: "；")) }
        Text(MobileL10n.text("它不能确定的：") + scenario.unknowns.joined(separator: "；"))
        if model.phoneModelAvailable { NavigationLink("聊聊这条路径") { ConversationView(title: scenario.title, context: scenario.overview, evidence: scenario.unknowns.joined(separator: "\n")) } }
    } }
}
