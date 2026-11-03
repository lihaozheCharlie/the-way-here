import SwiftUI
import TWHCore

struct TopicsView: View {
    @EnvironmentObject private var model: AppModel
    @State private var directions: Set<String> = []
    @State private var unreadOnly = false
    @State private var filters = false
    @State private var hidden: Set<String> = []
    @State private var visited: Set<String> = []
    @State private var projection: UnderstandingProjection?
    private var choices: [String] { let standard = ["工作","关系","家庭","健康","金钱","居住与迁移","学习与成长","情绪"]; return standard + Array(Set((model.snapshot?.topics ?? []).flatMap { $0.directions ?? [] }).subtracting(standard)).sorted() }
    private var key: String { "topics.state." + (model.active?.id ?? "none") }
    private var topics: [MobileSnapshot.Topic] { (model.snapshot?.topics ?? []).filter { topic in !hidden.contains(topic.id) && (!unreadOnly || !visited.contains(topic.id)) && (directions.isEmpty || !(Set(topic.directions ?? []).intersection(directions)).isEmpty) } }
    var body: some View { Screen {
        Text("我注意到的几件事").font(Theme.serif(27))
        if !directions.isEmpty { Text(directions.sorted().map { MobileL10n.text($0) }.joined(separator: " · ")).font(.caption) }
        if topics.isEmpty { EmptyMessage(title: "目前没有新的想问你的", detail: "已保存的话题会显示在这里。", symbol: "bubble.left.and.bubble.right") }
        ForEach(topics) { topic in Paper {
            Text(topic.question).font(Theme.serif(23)); Text(topic.reason).font(.subheadline)
            Text(MobileL10n.format("依据 %@ 份", [String(describing: projection?.topics.first(where: { $0.id == topic.id })?.evidence.count ?? 0)])).font(.caption)
            NavigationLink { TopicDetailView(topic: topic) } label: { Text("为什么问我") }
            if model.phoneModelAvailable { NavigationLink { ConversationView(title: topic.title, context: topic.question, evidence: topic.currentUnderstanding).onAppear { visited.insert(topic.id); persist() } } label: { Text("聊聊这个") } }
            Button("这个问题不想聊") { hidden.insert(topic.id); persist() }.font(.footnote)
        } }
        if model.phoneModelAvailable { NavigationLink("自己开个话题") { ConversationView(title: "一起往下想", context: "", evidence: "") } }
        NavigationLink("对话历史") { ConversationHistoryView() }
        if !hidden.isEmpty { DisclosureGroup("管理已屏蔽话题") { ForEach((model.snapshot?.topics ?? []).filter { hidden.contains($0.id) }) { topic in Button(MobileL10n.text("恢复：") + topic.question) { hidden.remove(topic.id); persist() } } } }
    }.navigationTitle("聊聊").onAppear { reloadTopicPreferences(); UserDefaults.standard.set(model.snapshot?.updatedAt ?? MobileProtocol.timestamp(), forKey: "topics.seenAt.\(model.active?.id ?? "none")") }.onChange(of: model.active?.id) { _, _ in reloadTopicPreferences() }.onReceive(NotificationCenter.default.publisher(for: UserDefaults.didChangeNotification).receive(on: RunLoop.main)) { _ in reloadTopicPreferences() }.onChange(of: directions) { _, _ in persist() }.onChange(of: unreadOnly) { _, _ in persist() }.toolbar { Button("按方向找") { filters = true } }.sheet(isPresented: $filters) { NavigationStack { Form {
        ForEach(choices, id: \.self) { direction in Toggle(LocalizedStringKey(direction), isOn: Binding(get: { directions.contains(direction) }, set: { if $0 { directions.insert(direction) } else { directions.remove(direction) } })) }
        Toggle("只看未聊过", isOn: $unreadOnly); Button("重置") { directions = []; unreadOnly = false }; Button("应用") { filters = false }
    }.navigationTitle("按方向找").navigationBarTitleDisplayMode(.inline) } }.task(id: model.snapshot?.updatedAt) { reloadTopicPreferences(); do { projection = try await UnderstandingProjection.load(model.boundSpace) } catch { model.error = error.localizedDescription } }.refreshable { await model.refresh() }.accessibilityIdentifier("CHT-1") }
    private func reloadTopicPreferences() {
        hidden = Set(UserDefaults.standard.stringArray(forKey: key + ".hidden") ?? UserDefaults.standard.stringArray(forKey: "topics.hidden." + (model.active?.id ?? "none")) ?? [])
        visited = Set(UserDefaults.standard.stringArray(forKey: key + ".visited") ?? [])
        directions = Set(UserDefaults.standard.stringArray(forKey: key + ".directions") ?? [])
        unreadOnly = UserDefaults.standard.bool(forKey: key + ".unreadOnly")
    }
    private func persist() { UserDefaults.standard.set(Array(hidden), forKey: key + ".hidden"); UserDefaults.standard.set(Array(visited), forKey: key + ".visited"); UserDefaults.standard.set(Array(directions), forKey: key + ".directions"); UserDefaults.standard.set(unreadOnly, forKey: key + ".unreadOnly") }
}
struct TopicDetailView: View {
    @EnvironmentObject private var model: AppModel
    var topic: MobileSnapshot.Topic
    @State private var bound: BoundSpace?
    @State private var projection: UnderstandingProjection?
    var body: some View { Screen {
        Text(topic.question).font(Theme.serif(28)); Text("为什么现在问你").font(.headline); Text(topic.reason)
        ProjectedEvidenceView(refs: Array((projection?.topics.first(where: { $0.id == topic.id })?.evidence ?? []).prefix(3)))
        Text("现在的理解 · 推断").font(.headline); Text(topic.currentUnderstanding)
        Text("还不确定").font(.headline); Text(topic.unknown)
        if model.phoneModelAvailable { NavigationLink("开始聊") { ConversationView(title: topic.title, context: topic.question, evidence: topic.currentUnderstanding) } }
        Button("这个问题不想聊") { guard let bound else { return }; let key = "topics.state.\(bound.manifest.id).hidden"; var ids = Set(UserDefaults.standard.stringArray(forKey: key) ?? []); ids.insert(topic.id); UserDefaults.standard.set(Array(ids), forKey: key); model.message = "已屏蔽，可在话题列表恢复" }
    }.navigationTitle(topic.title).navigationBarTitleDisplayMode(.inline).task { if bound == nil { bound = model.boundSpace }; do { projection = try await UnderstandingProjection.load(bound) } catch { model.error = error.localizedDescription } }.accessibilityIdentifier("CHT-3") }
}
struct ConversationArchive: Codable, Identifiable {
    var id: String; var knowledgeBaseId: String; var title: String; var updatedAt: String; var messages: [ChatMessage]
    var pendingTaskId: String?; var savedQuotes: [String]?; var context: String?; var evidence: String?
}
struct ConversationView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    var title: String; var context: String; var evidence: String
    var contextRole: String = "assistant"
    var restored: ConversationArchive?
    @State private var id = UUID().uuidString.lowercased()
    @State private var messages: [ChatMessage] = []
    @State private var text = ""; @State private var busy = false; @State private var consent = false
    @FocusState private var composing: Bool
    @State private var showEvidence = false; @State private var wrapUp = false; @State private var noPrompts = false
    @State private var generation: Task<Void, Never>?
    @State private var saveTranscript = true; @State private var bound: BoundSpace?
    @State private var savedQuotes: [String] = []; @State private var includedQuotes: Set<String> = []
    @State private var retry = false; @State private var clear = false; @State private var evidenceTab = 0
    @State private var projection: UnderstandingProjection?
    @State private var loaded = false
    @State private var savingQuote = false
    @State private var finishing = false
    @State private var editingExcerpt = false
    @State private var archiveChanged = false
    private var actualEvidence: String { restored?.evidence ?? evidence }
    private var actualContext: String { restored?.context ?? context }
    private var refs: [UnderstandingProjection.Ref] { projection?.topics.first(where: { $0.title == title || $0.question == actualContext })?.evidence ?? [] }
    private var suppressedKey: String { "conversation.suppressed." + (bound?.manifest.id ?? "none") }
    private var candidate: ChatMessage? { guard !noPrompts, let last = messages.last(where: { $0.role == "user" }) else { return nil }; let key = MobileProtocol.hash(Data(last.content.utf8)); let until = (UserDefaults.standard.dictionary(forKey: suppressedKey)?[key] as? Double) ?? 0; return until > Date().timeIntervalSince1970 || savedQuotes.contains(last.content) ? nil : last }
    var body: some View { VStack(spacing: 0) {
        ScrollViewReader { proxy in ScrollView { LazyVStack(alignment: .leading, spacing: 16) {
            Text("本次对话保留为当前空间的草稿，结束时确认要保存的内容。").font(.caption).accessibilityIdentifier("CHT-4")
            ForEach(messages) { message in HStack { if message.role == "user" { Spacer(minLength: 24) }; VStack(alignment: .leading) { Text(message.content).font(Theme.serif(17)).fixedSize(horizontal: false, vertical: true).textSelection(.enabled); if message.role == "assistant", !refs.isEmpty { Button(MobileL10n.format("来自 %@ 份记录 · 依据", [String(describing: refs.count)])) { showEvidence = true }.font(.caption) } }.padding(14).background(message.role == "user" ? Theme.pale : Color.white, in: RoundedRectangle(cornerRadius: 16)); if message.role != "user" { Spacer(minLength: 24) } }.id(message.id) }
            if busy { ProgressView(MobileL10n.text("正在想…")) }
            if retry && model.phoneModelAvailable { Button("重发最后一条消息") { send(retrying: true) } }
            if let candidate { Paper { Text(MobileL10n.format("你刚说到“%@”，要记下来吗？", [String(describing: candidate.content.prefix(80))])).font(.subheadline); AdaptiveActions {
                Button("记下来") { guard !savingQuote else { return }; savingQuote = true; model.perform { defer { savingQuote = false }; guard let bound else { return }; _ = try await bound.store.saveOriginal(text: candidate.content, folder: "对话摘录"); savedQuotes.append(candidate.content); includedQuotes.insert(candidate.content); archiveChanged = true; try await saveArchive(); model.message = "原话已记下" } }
                Button("改一改再记") { beginExcerptEditing(candidate.content) }.disabled(editingExcerpt)
                Button("不用了") { var values = UserDefaults.standard.dictionary(forKey: suppressedKey) ?? [:]; values[MobileProtocol.hash(Data(candidate.content.utf8))] = Date().addingTimeInterval(7*86400).timeIntervalSince1970; UserDefaults.standard.set(values, forKey: suppressedKey); noPrompts = true }
            }.font(.footnote).buttonStyle(.bordered) } }
            if !busy && model.phoneModelAvailable { ScrollView(.horizontal) { HStack { ForEach(["我想补充一点","这里不太像我","我还不确定"], id: \.self) { reply in Button(LocalizedStringKey(reply)) { text = MobileL10n.text(reply) }.buttonStyle(.bordered) } } } }
            Color.clear.frame(height: 1).id("conversation-bottom")
        }.padding() }.scrollDismissesKeyboard(.interactively)
            .onChange(of: messages.count) { _, _ in withAnimation { proxy.scrollTo("conversation-bottom", anchor: .bottom) } }
            .onChange(of: composing) { _, focused in if focused { withAnimation { proxy.scrollTo("conversation-bottom", anchor: .bottom) } } }
        }
    }.safeAreaInset(edge: .bottom, spacing: 0) {
        if model.phoneModelAvailable { BottomActionBar { HStack(alignment: .bottom, spacing: 8) {
            TextField("慢慢说，我在听", text: $text, axis: .vertical).lineLimit(1...5).focused($composing)
                .padding(10).frame(minWidth: 0, maxWidth: .infinity, minHeight: 44)
                .background(Theme.canvas, in: RoundedRectangle(cornerRadius: 14)).layoutPriority(1).accessibilityIdentifier("conversation.input")
            HoldConversationVoice { spoken, edit in text = spoken; if !edit { composing = false; consent = true } }
                .frame(width: 44, height: 44)
            if busy { Button("停止", systemImage: "stop.fill") { generation?.cancel(); busy = false }
                    .labelStyle(.iconOnly).frame(width: 44, height: 44).accessibilityLabel(Text("停止")) }
            else { Button("发送", systemImage: "arrow.up") { composing = false; consent = true }
                    .labelStyle(.iconOnly).frame(width: 44, height: 44).accessibilityLabel(Text("发送"))
                    .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !model.online) }
        } } }
    }.background(Theme.canvas).navigationTitle(title).navigationBarTitleDisplayMode(.inline)
        .toolbar { Button("依据") { showEvidence = true }; Menu("更多") { Button("结束并保存") { wrapUp = true }; Button("清空对话", role: .destructive) { clear = true } } }
        .confirmationDialog("清空这次对话草稿？", isPresented: $clear) { Button("清空", role: .destructive) { messages = []; savedQuotes = []; archiveChanged = true; model.perform { try await saveArchive() } } }
        .task { guard !loaded else { return }; loaded = true; if bound == nil { bound = model.boundSpace }; if let restored { guard restored.knowledgeBaseId == bound?.manifest.id else { bound = nil; model.error = "请回到对话所属空间。"; return }; id = restored.id; messages = restored.messages; savedQuotes = restored.savedQuotes ?? [] } else if messages.isEmpty && !context.isEmpty { messages = [ChatMessage(role: contextRole, content: context)]; archiveChanged = true }; do { projection = try await UnderstandingProjection.load(bound); try await saveArchive() } catch { model.error = error.localizedDescription } }
        .onDisappear { generation?.cancel(); model.perform { try await saveArchive() } }
        .sheet(isPresented: $consent) { SendConfirmation(title: "发送这次对话", text: ([actualContext, actualEvidence] + messages.map(\.content) + [text]).filter { !$0.isEmpty }.joined(separator: "\n\n"), photos: 0) { _ in consent = false; send() } }
        .sheet(isPresented: $showEvidence) { NavigationStack { Form { Picker("依据", selection: $evidenceTab) { Text("事实依据").tag(0); Text("现在的理解").tag(1); Text("还不知道").tag(2) }.pickerStyle(.segmented)
            if evidenceTab == 0 { if refs.isEmpty { Text("这个话题来自你刚才的对话，还没有历史依据。") }; ProjectedEvidenceView(refs: refs) }
            if evidenceTab == 1 { Text("推断").font(.headline); Text(actualEvidence.isEmpty ? MobileL10n.text("这次没有附带既有理解。") : actualEvidence) }
            if evidenceTab == 2 { Text(projection?.topics.first(where: { $0.title == title })?.unknown ?? MobileL10n.text("未附带来源的内容不能当作已证实的事实。")); if model.phoneModelAvailable { Button("补充一下") { text = MobileL10n.text("我想补充的是："); showEvidence = false } } }
        }.navigationTitle("依据与未知").navigationBarTitleDisplayMode(.inline).toolbar { Button("完成") { showEvidence = false } } } }
        .sheet(isPresented: $wrapUp) { NavigationStack { Form {
            if messages.filter({ $0.role == "user" }).count >= 3 { Section("这次聊过 · 保留你的原话") { ForEach(messages.filter { $0.role == "user" }.suffix(3)) { Text($0.content) } } }
            Toggle("保存对话全文", isOn: $saveTranscript)
            ForEach(savedQuotes, id: \.self) { quote in Toggle(quote, isOn: Binding(get: { includedQuotes.contains(quote) }, set: { if $0 { includedQuotes.insert(quote) } else { includedQuotes.remove(quote) } })) }
        }.safeAreaInset(edge: .bottom, spacing: 0) { BottomActionBar { AdaptiveActions {
            Button("继续聊") { wrapUp = false }.frame(maxWidth: .infinity, minHeight: 44)
            Button("完成") { finish() }.buttonStyle(PrimaryButton()).disabled(finishing).accessibilityIdentifier("conversation-finish-save")
        } } }.navigationTitle("结束对话与小结").navigationBarTitleDisplayMode(.inline) } }
        }
    private func send(retrying: Bool = false) {
        guard bound != nil, model.phoneModelAvailable, model.online, !busy else { return }
        if !retrying {
            let input = text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !input.isEmpty else { return }
            text = ""
            if input.contains("不要记录") || input.contains("不用记录") { noPrompts = true }
            messages.append(ChatMessage(role: "user", content: input))
        }
        archiveChanged = true; busy = true; retry = false
        generation = Task {
            do {
                try await saveArchive()
                guard let preset = selectedPreset(), let key = try CloudKeychain.read(preset.id), !key.isEmpty else { throw ModelServiceFailure.notConfigured }
                let promptMessages = messages
                let responseId = UUID().uuidString
                messages.append(ChatMessage(id: responseId, role: "assistant", content: ""))
                let answer = try await ModelClient().complete(messages: [ChatMessage(role: "system", content: "围绕用户话题对话，区分事实、推断与未知。不替用户下定论。背景资料：\n\(actualEvidence)")] + promptMessages, preset: preset, key: key, onDelta: { delta in
                    if let index = messages.firstIndex(where: { $0.id == responseId }) { messages[index].content += delta }
                })
                try Task.checkCancellation()
                if let index = messages.firstIndex(where: { $0.id == responseId }) { messages[index].content = answer }
                busy = false; try await saveArchive(); await model.refresh()
            } catch {
                busy = false
                if !Task.isCancelled && !(error is CancellationError) { retry = true; model.error = error.localizedDescription }
                try? await saveArchive()
            }
        }
    }
    private func beginExcerptEditing(_ quote: String) {
        guard !editingExcerpt, let bound, bound.manifest.id == model.active?.id else { model.error = "请回到原空间编辑这段摘录。"; return }
        let previousText = model.draftText, previousFolder = model.folder, previousID = model.draftId
        var previous = model.drafts.first(where: { $0.id == previousID }) ?? Draft(space: bound.manifest.id, id: previousID)
        previous.text = previousText; previous.folder = previousFolder; previous.updatedAt = MobileProtocol.timestamp()
        let excerpt = Draft(space: bound.manifest.id, text: quote, folder: "对话摘录", kind: "conversation-excerpt")
        editingExcerpt = true
        model.perform {
            defer { editingExcerpt = false }
            if !previousText.isEmpty { try await bound.store.saveDraft(previous) }
            try await bound.store.saveDraft(excerpt)
            guard model.active?.id == bound.manifest.id, model.draftId == previousID, model.draftText == previousText, model.folder == previousFolder else { model.message = "摘录已另存为草稿，请到原空间的历史中继续编辑。"; return }
            model.draftId = excerpt.id; model.draftText = excerpt.text; model.folder = excerpt.folder
            await model.refresh(); model.presented = .writing
        }
    }
    private func finish() { guard !finishing else { return }; finishing = true; model.perform { defer { finishing = false }; guard let bound else { return }; let transcript = saveTranscript ? messages.map { "\($0.role == "user" ? "我" : "AI")：\n\($0.content)" }.joined(separator: "\n\n") : ""; let content = ([transcript] + includedQuotes.sorted()).filter { !$0.isEmpty }.joined(separator: "\n\n"); if !content.isEmpty { _ = try await bound.store.saveOriginal(text: content, folder: "对话", title: title) }; try await saveArchive(); wrapUp = false; await model.refresh(); dismiss() } }
    private func saveArchive() async throws { guard archiveChanged, let bound else { return }; try await bound.store.writeJSON(ConversationArchive(id: id, knowledgeBaseId: bound.manifest.id, title: title, updatedAt: MobileProtocol.timestamp(), messages: messages, pendingTaskId: nil, savedQuotes: savedQuotes, context: actualContext, evidence: actualEvidence), path: ".mobile/conversations/\(id).json") }
}
struct HoldConversationVoice: View {
    var onText: (String, Bool) -> Void
    @StateObject private var recorder = SpeechRecorder()
    @State private var holding = false
    @State private var dragOffset: CGSize = .zero
    var body: some View { Image(systemName: "mic.fill").frame(width: 44,height: 44).contentShape(Rectangle()).accessibilityLabel("按住说话，上滑取消，左滑转文字编辑").accessibilityIdentifier("conversation.holdVoice").accessibilityAddTraits(.isButton)
        .gesture(LongPressGesture(minimumDuration: 0.4).sequenced(before: DragGesture(minimumDistance: 0)).onChanged { phase in if case .second(true, let drag) = phase { dragOffset = drag?.translation ?? .zero }; if case .second(true, _) = phase, !holding { holding = true; recorder.transcript = ""; recorder.seconds = 0; Task { await recorder.start(); if !holding { recorder.stop() } } } }.onEnded { phase in guard holding else { recorder.stop(); return }; recorder.stop(); holding = false; if case .second(true, let drag) = phase, (drag?.translation.height ?? 0) > -70, !recorder.transcript.isEmpty { onText(recorder.transcript, (drag?.translation.width ?? 0) < -70) } })
        .overlay(alignment: .bottomTrailing) { if holding { VStack { Text(dragOffset.height < -70 ? "松开取消" : dragOffset.width < -70 ? "松开转文字编辑" : "松开发送"); HStack(spacing: 3) { ForEach(0..<16) { index in Capsule().fill(Theme.blue).frame(width: 3, height: CGFloat(6 + recorder.level * Float(15 + index % 5 * 8))) } }.frame(height: 60); Text(recorder.transcript); Text(recorder.seconds >= 50 ? MobileL10n.format("还剩 %@ 秒", [String(describing: max(0,60-recorder.seconds))]) : MobileL10n.format("%@ 秒", [String(describing: recorder.seconds)])); if let error = recorder.error { Text(MobileL10n.text(error)) } }.padding().frame(width: 260).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16)).offset(y: -60) } }
        .onChange(of: recorder.seconds) { _, seconds in if seconds >= 60, holding { recorder.stop(); holding = false; if !recorder.transcript.isEmpty { onText(recorder.transcript, false) } } }.onDisappear { recorder.stop() }
    }
}
struct VoiceReplyView: View { @Environment(\.dismiss) private var dismiss; var onText: (String) -> Void; var body: some View { QuestionVoiceView(question: "说着回答") { onText($0); dismiss() } } }
struct ConversationHistoryView: View {
    @EnvironmentObject private var model: AppModel
    @State private var conversations: [ConversationArchive] = []
    var body: some View { List { ForEach(conversations) { archive in NavigationLink(archive.title) { ConversationView(title: archive.title, context: archive.context ?? "", evidence: archive.evidence ?? "", restored: archive) } }; if conversations.isEmpty { EmptyMessage(title: "还没有聊过", detail: "对话草稿留在这里，下次接着说。") } }.navigationTitle("对话历史").navigationBarTitleDisplayMode(.inline).task(id: model.active?.id) { conversations = []; guard let bound = model.boundSpace else { return }; model.perform { let directory = bound.store.root.appendingPathComponent(".mobile/conversations"); guard FileManager.default.fileExists(atPath: directory.path) else { return }; var loaded: [ConversationArchive] = []; for file in try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil) where file.pathExtension == "json" { let value = try JSONDecoder().decode(ConversationArchive.self, from: await bound.store.read(".mobile/conversations/" + file.lastPathComponent)); if value.knowledgeBaseId == bound.manifest.id { loaded.append(value) } }; if model.active?.id == bound.manifest.id { conversations = loaded.sorted { $0.updatedAt > $1.updatedAt } } } } }
}
struct TasksView: View {
    var body: some View { Screen { EmptyMessage(title: "手机记录与已有内容", detail: "手机可以保存原话、阅读已有内容；不会提交后台处理任务。") }.navigationTitle("已有内容").accessibilityIdentifier("REC-11") }
}
