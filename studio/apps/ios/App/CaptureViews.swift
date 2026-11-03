import SwiftUI
import TWHCore
import UIKit
import AVFoundation
import UserNotifications

struct NowView: View {
    @EnvironmentObject private var model: AppModel
    @State private var resultDraft: Draft?
    @State private var confirming = false
    @State private var busy = false
    @State private var prepared = ""
    @State private var showPrepared = false
    @State private var resultBinding: BoundSpace?
    @State private var submittedDraftId: String?
    @State private var submittedText: String?
    @State private var result = ""
    @State private var failure = false
    @State private var modelFailure: ModelServiceFailure?
    @FocusState private var editing: Bool
    @ScaledMetric(relativeTo: .body) private var inputHeight: CGFloat = 104
    @Environment(\.dynamicTypeSize) private var typeSize
    var body: some View {
        GeometryReader { geometry in
        let compact = geometry.size.height < 620 || typeSize >= .xxxLarge || !model.draftText.isEmpty
        ScrollViewReader { scroll in Screen {
            SyncStatusLine()
            if model.active?.manifest.readOnly == true { Paper { Label("匿名演示 · 只读", systemImage: "person.crop.circle"); Button("开始我的空间") { model.presented = .cloudConnection } } }
            if !result.isEmpty { Paper { HStack { Label(MobileL10n.text(result), systemImage: failure ? "exclamationmark.circle" : "checkmark.circle"); Spacer(); Button("收起", systemImage: "xmark") { result = "" }.labelStyle(.iconOnly) }; if busy { ProgressView("保存原话 → 整理日记 → 等待确认") }; if failure { Button("重试") { confirming = true }; if let modelFailure { ModelFailureRecoveryCard(failure: modelFailure) } }; if let resultDraft { NavigationLink("查看记录") { CaptureHistoryDetail(draft: resultDraft, bound: resultBinding) } } else { Button("查看记录") { model.presented = .history } }; if model.phoneModelAvailable { NavigationLink("去聊聊") { ConversationView(title: "聊聊这段", context: submittedText ?? model.draftText, evidence: "用户当前记录", contextRole: "user") } } }.id("capture-result") }
            if !editing && result.isEmpty { if compact {
                Label(model.draftText.isEmpty ? MobileL10n.text("第 1 天 · 从此刻开始") : MobileL10n.text("草稿已保留"), systemImage: "heart").font(.caption).foregroundStyle(Theme.blue)
            } else { Paper {
                Label(model.active?.manifest.readOnly == true || model.documents.filter(\.isSource).isEmpty ? MobileL10n.text("第 1 天 · 从此刻开始") : MobileL10n.format("长期陪伴 · 已相处 %@ 天", [String(describing: model.companionshipDays)]), systemImage: "heart").font(.caption).foregroundStyle(Theme.blue)
                Text("此刻有什么，\n都可以说说").font(Theme.serif(25)).fixedSize(horizontal: false, vertical: true)
                Text("我不会替你下结论。你先说，我们慢慢把它整理成自己的记录。").font(.subheadline).foregroundStyle(.secondary)
            } } }
            Paper {
                Picker("记录方式", selection: Binding(get: { 0 }, set: { if $0 == 1 { model.presented = .photos } })) { Text("说或写").tag(0); Text("找照片").tag(1) }.pickerStyle(.segmented)
                TextEditor(text: $model.draftText).focused($editing).frame(height: inputHeight).font(.body).accessibilityLabel("此刻发生了什么").overlay(alignment: .topLeading) { if model.draftText.isEmpty { Text("此刻发生了什么？写下来，或说一段……").foregroundStyle(.secondary).padding(.top, 8).padding(.leading, 4).allowsHitTesting(false) } }
                if model.documents.filter(\.isSource).isEmpty { ForEach(["今天最让我在意的是…", "刚才发生了一件小事…", "我想记住这个瞬间…"], id: \.self) { opening in Button(LocalizedStringKey(opening)) { model.draftText = MobileL10n.text(opening); editing = true }.font(.footnote).frame(minHeight: 44) } }
                if model.active?.manifest.readOnly == true { Text("演示 · 不保存").font(.caption).foregroundStyle(.secondary) }
                HStack { Button("说一段", systemImage: "mic") { model.presented = .recording }.buttonStyle(.bordered); Spacer(); Button("暂存") { editing = false; model.perform { try await model.saveDraft(); model.message = "草稿已保留" } }; Button("展开", systemImage: "arrow.up.left.and.arrow.down.right") { model.presented = .writing }.labelStyle(.iconOnly) }

            }
                Text(model.phoneModelAvailable ? MobileL10n.text("只存原文不调用模型。整理前会确认发送内容。") : MobileL10n.text("文字与照片先保存在这台 iPhone。")).font(.caption).foregroundStyle(.secondary)
            if !model.drafts.isEmpty { Button { model.presented = .history } label: { Label(MobileL10n.format("草稿 %@ · 已保存 %@", [String(model.drafts.filter { $0.visibleInCaptureHistory && model.captureStatus($0) == "draft" }.count), String(model.drafts.filter { $0.visibleInCaptureHistory && model.captureStatus($0) == "saved" }.count)]), systemImage: "clock.arrow.circlepath").frame(minHeight: 44) } }
            NavigationLink { ShareInboxView() } label: { Label("分享收件箱", systemImage: "tray") }
            if !model.documents.filter(\.isSource).isEmpty {
                Text("最近记录").font(.headline)
                ForEach(Array(model.documents.filter(\.isSource).prefix(3))) { document in NavigationLink { DocumentView(document: document) } label: { Paper { DocumentRow(document: document, showDisclosure: true) } } }
            }
            if let topic = model.snapshot?.topics.first { Paper { Text("值得聊聊").font(.caption).foregroundStyle(.secondary); Text(topic.question).font(Theme.serif(20)); if model.phoneModelAvailable { NavigationLink("聊聊这个") { ConversationView(title: topic.title, context: topic.question, evidence: topic.currentUnderstanding) } } } }
        }.accessibilityElement(children: .contain).accessibilityIdentifier("NOW-1")
        .safeAreaInset(edge: .bottom, spacing: 0) {
            BottomActionBar {
                Button { model.presented = .folder } label: { Label(MobileL10n.format("保存到 生活记录 / %@", [String(describing: model.folder)]), systemImage: "folder").font(.footnote).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading) }
                AdaptiveActions(equalWidths: true) { Button("只存原文") { model.perform { if model.active?.manifest.readOnly == true { result = "演示体验：原文已预览，不保存" } else { let id = model.draftId; submittedText = model.draftText; resultBinding = model.boundSpace; try await model.saveOriginal(); resultDraft = model.drafts.first { $0.id == id }; failure = false; modelFailure = nil; result = "已保存原文" } } }.buttonStyle(SecondaryButton()).accessibilityIdentifier("capture-save-original"); if model.phoneModelAvailable { Button(busy ? MobileL10n.text("整理中…") : MobileL10n.text("整理成日记")) { confirming = true }.buttonStyle(PrimaryButton()) } }.disabled(model.draftText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || busy)

            }
        }.onChange(of: result) { _, value in
            guard !value.isEmpty else { return }; editing = false
            withAnimation { scroll.scrollTo("capture-result", anchor: .top) }
        } }
        .navigationTitle("此刻").refreshable { await model.refresh() }
        .sheet(isPresented: $confirming) { SendConfirmation(title: "整理成日记", text: model.draftText, photos: 0) { direct in confirming = false; organize(direct: direct) } }
        .sheet(isPresented: $showPrepared, onDismiss: { if model.draftText.isEmpty && submittedDraftId != nil { result = MobileL10n.text("日记已保存") } }) { NavigationStack { DraftResultView(text: $prepared, bound: resultBinding, sourceDraftId: submittedDraftId, sourceText: submittedText) }.environmentObject(model) }
        }
    }
    private func notifyDiaryPrepared(space: String, draft: String) async {
        let defaults = UserDefaults.standard
        guard defaults.bool(forKey:"notifications.tasks"), defaults.object(forKey:"notifications.build.enabled") as? Bool ?? true else { return }
        let center = UNUserNotificationCenter.current()
        guard await center.notificationSettings().authorizationStatus == .authorized else { return }
        let content = UNMutableNotificationContent(); content.title = MobileL10n.text("日记已整理好"); content.body = MobileL10n.text("请打开原空间核对草稿，确认后再保存。")
        content.userInfo = ["space":space,"url":SystemDestination.url(route:"history",space:space,target:draft).absoluteString]
        let now = Date(), hour = Calendar.current.component(.hour,from:Date()), start = defaults.object(forKey:"notifications.quiet.startHour") as? Int ?? 22, end = defaults.object(forKey:"notifications.quiet.endHour") as? Int ?? 8
        let quiet = start == end || (start < end ? hour >= start && hour < end : hour >= start || hour < end)
        let next = Calendar.current.nextDate(after:now,matching:DateComponents(hour:end),matchingPolicy:.nextTime)
        let trigger: UNNotificationTrigger? = (defaults.object(forKey:"notifications.quiet") as? Bool ?? true) && quiet ? UNTimeIntervalNotificationTrigger(timeInterval:max(1,(next ?? now.addingTimeInterval(3600)).timeIntervalSince(now)),repeats:false) : nil
        try? await center.add(UNNotificationRequest(identifier:"diary-prepared-" + space + "-" + draft,content:content,trigger:trigger))
    }
    private func organize(direct: Bool) {
        guard !busy, let bound = model.boundSpace else { return }
        if bound.manifest.readOnly { prepared = model.draftText; resultBinding = bound; showPrepared = true; result = "演示体验 · 你的文字不会保存或发送"; return }
        let text = model.draftText, store = bound.store, spaceId = bound.manifest.id, folder = bound.folder
        let draftId = model.draftId; modelFailure = nil; submittedDraftId = draftId; submittedText = text
        busy = true; failure = false; result = "整理中"
        Task {
            defer { busy = false }
            var attemptedModel = false
            do {
            let submitted = Draft(space: spaceId, text: text, folder: folder, id: draftId); resultDraft = submitted; resultBinding = bound
            try await store.saveDraft(submitted)
            if direct, model.phoneModelAvailable {
                attemptedModel = true
                guard let preset = selectedPreset(), let key = try CloudKeychain.read(preset.id), !key.isEmpty else { throw ModelServiceFailure.notConfigured }
                prepared = try await ModelClient().complete(messages: [ChatMessage(role: "system", content: "将用户原话整理成日记，保留事实与原话，不补写没有说过的内容。仅返回 Markdown 正文。"), ChatMessage(role: "user", content: text)], preset: preset, key: key)
                try await store.saveDraft(Draft(space:spaceId,text:prepared,folder:folder,kind:"generated-review",id:draftId + "-review"))
                // Generation does not overwrite or submit the source. User reviews first.
                if model.active?.id == spaceId { resultBinding = bound; showPrepared = true; result = "日记草稿已准备好，请确认" }
                else { try await store.saveDraft(Draft(space: spaceId, text: prepared, folder: folder, kind: "generated-review", id: draftId + "-review")) }
                await notifyDiaryPrepared(space: spaceId, draft: draftId)
            } else { throw ModelServiceFailure.notConfigured
            }
            } catch { if model.active?.id == spaceId { failure = true; modelFailure = attemptedModel ? (error as? ModelServiceFailure ?? .providerUnavailable(nil)) : nil; result = "整理失败：" + error.localizedDescription } }
        }
    }
}
@MainActor func selectedPreset() -> ProviderPreset? { if let fixture = UXVerificationFixtures.modelPreset { return fixture }; return ProviderPreset.all.first { $0.id == UserDefaults.standard.string(forKey: "model.provider") } ?? ProviderPreset.all.first }

struct SendConfirmation: View {
    @EnvironmentObject private var model: AppModel
    var title: String; var text: String; var photos: Int
    var onConfirm: (Bool) -> Void
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            Form {
                Section("将发送的内容") { Text(text).lineLimit(8); if photos > 0 { Text(MobileL10n.format("%@ 张压缩照片副本与人物标注", [String(photos)])) } }
                Section("接收方") { Text(selectedPreset()?.localizedName ?? ""); Text("只有你确认的材料会发送。原图留在系统相册。").font(.footnote).foregroundStyle(.secondary) }
            }.safeAreaInset(edge: .bottom, spacing: 0) {
                if model.phoneModelAvailable, let preset = selectedPreset(), photos == 0 || preset.supportsImages {
                    BottomActionBar { Button("确认，使用手机模型") { onConfirm(true) }.buttonStyle(PrimaryButton()) }
                }
            }.navigationTitle(MobileL10n.text(title)).navigationBarTitleDisplayMode(.inline).toolbar { Button("取消", role: .cancel) { dismiss() } }
        }.presentationDetents([.medium, .large]).accessibilityIdentifier("PHO-9")
    }
}

struct DraftResultView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @Binding var text: String
    var bound: BoundSpace?
    var sourceDraftId: String? = nil
    var sourceText: String? = nil
    @State private var saving = false
    @State private var savedPath: String?
    @State private var savedText: String?
    var body: some View {
        Form {
            Section("确认后才保存") { TextEditor(text:$text).font(Theme.serif(17)).frame(minHeight:280).disabled(saving) }
        }.safeAreaInset(edge: .bottom, spacing: 0) {
            BottomActionBar { Button(saving ? MobileL10n.text("正在保存…") : MobileL10n.text("确认保存")) { save() }.buttonStyle(PrimaryButton()).disabled(saving) }
        }.navigationTitle("确认这份日记").navigationBarTitleDisplayMode(.inline).toolbar { Button("稍后") { dismiss() }.disabled(saving) }.interactiveDismissDisabled(saving).accessibilityIdentifier("NOW-6")
    }
    private func save() {
        guard !saving else { return }; saving = true
        model.perform {
            defer { saving = false }
            guard let bound else { throw MobileError.unavailable("原空间已关闭，草稿保留，请重新打开。") }
            if bound.manifest.readOnly { dismiss(); return }
            let currentText = text, path: String
            if let savedPath, savedText == currentText { path = savedPath }
            else {
                let expected = "# 日记\n\n\(currentText)\n"
                let previous = try await bound.store.drafts().first { $0.id == sourceDraftId }
                let existing = try await bound.store.documents().first { $0.isSource && $0.path == previous?.savedPath && $0.markdown == expected }
                if let existing { path = existing.path } else { path = try await bound.store.saveOriginal(text:currentText,folder:bound.folder,title:"日记") }
                savedPath = path; savedText = currentText
            }
            if let id = sourceDraftId {
                let existing = try await bound.store.drafts().first { $0.id == id }
                var draft = existing ?? Draft(space:bound.manifest.id,text:sourceText ?? currentText,folder:bound.folder,id:id)
                draft.status = "saved"; draft.savedPath = path; try await bound.store.saveDraft(draft)
                var review = Draft(space:bound.manifest.id,text:currentText,folder:bound.folder,kind:"generated-review",id:id + "-review"); review.status = "saved"; review.savedPath = path; try await bound.store.saveDraft(review)
                if model.active?.id == bound.manifest.id && model.draftId == id { model.draftText = ""; model.draftId = UUID().uuidString.lowercased() }
            }
            model.message = "日记已保存"; await model.refresh(); dismiss()
        }
    }
}
struct WritingView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var saved = ""
    var body: some View {
        VStack(spacing: 8) {
            HStack { Text(MobileL10n.format("%@ 字", [String(describing: model.draftText.count)])); Spacer(); Text(LocalizedStringKey(saved)) }.font(.caption).foregroundStyle(.secondary).padding(.horizontal)
            CaptureNativeEditor(text:$model.draftText,label:MobileL10n.text("记录正文"),initialFocus:true).padding(.horizontal)
        }.safeAreaInset(edge: .bottom, spacing: 0) { BottomActionBar { editorTools } }
        .navigationTitle("写一段").navigationBarTitleDisplayMode(.inline).toolbar { ToolbarItem(placement:.confirmationAction) { Button("完成") { model.perform { try await model.saveDraft(); dismiss() } } } }
            .task(id: model.draftText) { do { try await Task.sleep(for: .milliseconds(700)); try Task.checkCancellation(); saved = "自动保存中…"; try await model.saveDraft(); saved = "草稿已保存" } catch is CancellationError {} catch { saved = "草稿保存失败，文字仍在本机"; model.error = error.localizedDescription } }
            .onDisappear { model.perform { try await model.saveDraft() } }
            .accessibilityIdentifier("NOW-4")
    }
    private var editorTools: some View { HStack { Button("语音", systemImage:"mic") { model.presented = .recording }.labelStyle(.iconOnly).frame(minWidth: 44, minHeight: 44); Button("照片", systemImage:"photo") { model.presented = .photos }.labelStyle(.iconOnly).frame(minWidth: 44, minHeight: 44); Button("保存位置", systemImage:"folder") { model.presented = .folder }.labelStyle(.iconOnly).frame(minWidth: 44, minHeight: 44); Spacer(); Menu("更多") { if model.phoneModelAvailable { NavigationLink("先聊聊这段") { ConversationView(title:"聊聊这段",context:model.draftText,evidence:"用户当前记录",contextRole:"user") } }; Button("只存原文") { model.perform { try await model.saveOriginal(); dismiss() } }.disabled(model.draftText.isEmpty); Button("清空",role:.destructive) { model.draftText = "" } }.frame(minWidth: 44, minHeight: 44).accessibilityIdentifier("writing-more") } }

}
struct RecordingView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var recorder = SpeechRecorder()
    @State private var cancel = false
    @State private var initialText = ""
    @State private var bound: BoundSpace?
    @State private var originalDraftId = ""
    @State private var finished = false
    var body: some View {
        VStack(spacing: 12) {
            Text(String(format: "%02d:%02d", recorder.seconds / 60, recorder.seconds % 60)).font(.title2.monospacedDigit())
            CaptureNativeEditor(text:Binding(get:{recorder.transcript},set:{recorder.editTranscript($0)}),label:MobileL10n.text("实时识别文字，可修改"),uncertainWords:recorder.uncertainWords).padding()
            if !recorder.uncertainWords.isEmpty { Text(MobileL10n.text("请核对：") + recorder.uncertainWords.joined(separator: "、")).underline(true, pattern: .dot).font(.caption).foregroundStyle(.secondary) }
            Text("本机识别 · 文字可修订，修订时自动暂停").font(.caption).foregroundStyle(.secondary)
            HStack(spacing: 4) { ForEach(0..<24) { index in Capsule().fill(Theme.blue).frame(width: 4, height: CGFloat(8 + recorder.level * Float(20 + index % 7 * 6))) } }.frame(height: 44).accessibilityLabel(recorder.paused ? MobileL10n.text("已暂停录音") : MobileL10n.text("正在本机录音"))
            if let error = recorder.error { Text(MobileL10n.text(error)).font(.footnote).foregroundStyle(.red); Button("打开系统设置") { UIApplication.shared.open(URL(string: UIApplication.openSettingsURLString)!) } }
        }.safeAreaInset(edge: .bottom, spacing: 0) { BottomActionBar {
            HStack(spacing: 12) {
                Button("改用键盘", systemImage: "keyboard") { finish(next: .writing) }.labelStyle(.iconOnly).frame(minWidth: 44, minHeight: 44)
                Button("加照片", systemImage: "photo") { finish(next: .photos) }.labelStyle(.iconOnly).frame(minWidth: 44, minHeight: 44)
                Spacer(minLength: 0)
                Button(recorder.paused ? MobileL10n.text("继续") : MobileL10n.text("暂停"), systemImage: recorder.paused ? "play" : "pause") { recorder.paused ? recorder.resume() : recorder.pause() }.labelStyle(.iconOnly).frame(minWidth: 44, minHeight: 44)
                Button("完成") { finish(next: .writing) }.buttonStyle(.borderedProminent).frame(minHeight: 44)
            }
        } }.navigationTitle("说一段").navigationBarTitleDisplayMode(.inline).toolbar { ToolbarItem(placement: .cancellationAction) { Button("取消") { cancel = true } } }
            .confirmationDialog("已识别的内容会保留为草稿", isPresented: $cancel) { Button("保留文字并离开") { finish() }; Button("丢弃这次录音", role: .destructive) { finished = true; recorder.stop(); dismiss() }; Button("继续录音", role: .cancel) {} }
            .task { initialText = model.draftText; bound = model.boundSpace; originalDraftId = model.draftId; recorder.spaceID = bound?.manifest.id; recorder.retainAudioOverride = bound?.manifest.readOnly == true ? false : nil; recorder.onExternalFinish = { finish(next: .writing) }; recorder.onExternalPause = { preserve() }; await recorder.start() }
            .onChange(of: scenePhase) { _, value in if value != .active { recorder.pause(); preserve() } }
            .onReceive(NotificationCenter.default.publisher(for: AVAudioSession.interruptionNotification)) { _ in recorder.pause(); preserve() }
            .onDisappear { recorder.stop(); if !finished { preserve() } }.accessibilityIdentifier("NOW-3")
    }
    private func finish(next: AppModel.Modal? = nil) {
        guard !finished else { return }; finished = true; recorder.stop(); preserve(); dismiss(); if let next { Task { try? await Task.sleep(for: .milliseconds(350)); model.presented = next } }
        if let bound, UserDefaults.standard.object(forKey: "speech.undo") as? Bool ?? true { model.recordingUndo = .init(bound: bound, draftId: originalDraftId, text: initialText, expires: Date().addingTimeInterval(3)) }
    }
    private func preserve() {
        let merged = [initialText, recorder.transcript].filter { !$0.isEmpty }.joined(separator: "\n")
        guard let bound else { return }
        if model.active?.id == bound.manifest.id { model.draftText = merged }
        if bound.manifest.readOnly { return }
        model.perform { try await bound.store.saveDraft(Draft(space: bound.manifest.id, text: merged, folder: bound.folder, kind: "voice", id: originalDraftId)) }
    }
}
struct HistoryView: View {
    @EnvironmentObject private var model: AppModel
    @State private var filter = "全部"
    @State private var query = ""
    @State private var source = "全部来源"
    @State private var deleting: Draft?
    @State private var moving: Draft?
    @State private var bound: BoundSpace?

    private var entries: [Draft] {
        model.drafts.filter { draft in
            let status = model.captureStatus(draft)
            guard draft.visibleInCaptureHistory, status != "discarded", query.isEmpty || draft.text.localizedCaseInsensitiveContains(query), source == "全部来源" || draft.kind == source else { return false }
            switch filter { case "草稿": return status == "draft"; case "已保存": return status == "saved"; default: return true }
        }
    }
    var body: some View {
        List {
            Picker("历史分类", selection: $filter) { ForEach(["全部", "草稿", "已保存"], id: \.self) { Text(LocalizedStringKey($0)) } }.pickerStyle(.segmented)

            ForEach(entries) { draft in
                NavigationLink { CaptureHistoryDetail(draft: draft, bound: bound) } label: {
                    VStack(alignment: .leading, spacing: 6) { Text(String(draft.text.prefix(80))).lineLimit(2); HStack { Label(draft.updatedAt, systemImage: draft.kind == "voice" ? "mic" : draft.kind == "photo" ? "photo" : "text.alignleft"); Spacer(); Text(model.captureStatus(draft) == "saved" ? MobileL10n.text("已保存") : MobileL10n.text("草稿")) }.font(.caption).foregroundStyle(.secondary) }
                }.swipeActions { Button("删除", role: .destructive) { deleting = draft }; Button("移动") { moving = draft }.tint(Theme.blue) }
            }
            if entries.isEmpty { EmptyMessage(title: "还没有记录", detail: "说一句话就可以开始。") }
        }.navigationTitle("历史记录").searchable(text: $query, prompt: "搜索历史记录").refreshable { await model.refresh() }
            .toolbar { Menu("筛选", systemImage: "line.3.horizontal.decrease.circle") { Picker("来源", selection: $source) { Text("全部来源").tag("全部来源"); Text("文字").tag("text"); Text("语音").tag("voice"); Text("照片").tag("photo") } } }
            .task { bound = model.boundSpace }
            .sheet(item: $moving) { draft in NavigationStack { FolderPickerView { folder in guard let bound else { return }; model.perform { var value = draft; value.folder = folder; if let path = draft.savedPath { value.savedPath = try await bound.store.move(path: path, folder: folder) }; try await bound.store.saveDraft(value); await model.refresh() } } }.environmentObject(model) }
            .confirmationDialog("删除这条记录？原始文件会在最近删除保留 30 天。", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } })) { Button("删除", role: .destructive) { guard let deleting, let bound else { return }; model.perform { try await model.discardCapture(deleting, bound: bound) }; self.deleting = nil } }
            .accessibilityIdentifier("NOW-8")
    }
}
struct FolderPickerView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var newFolder = ""
    @State private var expanded: Set<String> = []
    private var recent: [String] { guard let id = model.active?.id else { return [] }; return UserDefaults.standard.stringArray(forKey: "recent.folders." + id) ?? [] }
    private func select(_ folder: String) { if let id = model.active?.id { UserDefaults.standard.set(Array(([folder] + recent.filter { $0 != folder }).prefix(3)), forKey: "recent.folders." + id) }; onSelect(folder); dismiss() }
    var onSelect: (String) -> Void
    private var folders: [String] { var all = Set(["随手记", "日记", "照片回忆", "聊天记录", "想法"]); for path in model.sourceFolders { let parts = path.split(separator: "/"); for depth in 1...max(1, parts.count) { all.insert(parts.prefix(depth).joined(separator: "/")) } }; return all.sorted() }
    var body: some View {
        List {
            if !recent.isEmpty { Section("最近使用") { ForEach(recent, id: \.self) { folder in Button(folder) { select(folder) } } } }
            Section("文件夹") { ForEach(folders.filter { folder in !folder.contains("/") || expanded.contains(String(folder.split(separator: "/").dropLast().joined(separator: "/"))) }, id: \.self) { folder in HStack { Button { select(folder) } label: { Label(String(folder.split(separator: "/").last ?? ""), systemImage: "folder").frame(maxWidth: .infinity, minHeight: 44, alignment: .leading).padding(.leading, CGFloat(folder.split(separator: "/").count - 1) * 16) }; if folders.contains(where: { $0.hasPrefix(folder + "/") }) { Button { if expanded.contains(folder) { expanded.remove(folder) } else { expanded.insert(folder) } } label: { Image(systemName: expanded.contains(folder) ? "chevron.down" : "chevron.right").frame(width: 44, height: 44) }.accessibilityLabel("展开文件夹") } } } }
            Section("新建文件夹") { TextField("文件夹名称，支持多级目录", text: $newFolder); Button("创建并使用") { model.perform { let name = newFolder.trimmingCharacters(in: .whitespacesAndNewlines); guard !folders.contains(name) else { throw MobileError.invalidData("已有同名文件夹") }; try await model.store?.createFolder(name); select(name) } }.disabled(newFolder.trimmingCharacters(in: .whitespaces).isEmpty) }
        }.navigationTitle("保存位置").accessibilityIdentifier("NOW-5")
    }
}
