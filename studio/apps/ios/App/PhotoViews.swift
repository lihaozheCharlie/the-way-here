import SwiftUI
import PhotosUI
import Vision
import TWHCore
import Photos

private enum PhotoPanel: String, Identifiable { case naming, candidates, sendOptions, folder, confirmation; var id:String {rawValue} }
struct PhotoFlowView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    var initialDraft: PhotoDraft?
    @State private var draft: PhotoDraft?
    @State private var selection: [PhotosPickerItem] = []
    @State private var image: UIImage?
    @State private var current = 0
    @State private var step = 0
    @State private var naming: FaceAnnotation?
    @State private var manual = false
    @State private var zoom: CGFloat = 1
    @State private var busy = false
    @State private var panel: PhotoPanel?
    @State private var pendingPanel: PhotoPanel?
    @State private var presentedPanel: PhotoPanel?
    @State private var pendingManualFace: FaceAnnotation?
    @State private var candidateSearch: Task<Void,Never>?
    @State private var consentImages = false
    @State private var dragStart: CGPoint?
    @State private var bound: BoundSpace?
    @State private var manualSheet = false
    @State private var candidates: [PhotoFaceCandidate] = []
    @State private var namedSource: FaceAnnotation?
    @State private var deleting: PhotoDraft?
    @State private var selectedImages: Set<String> = []
    @State private var savedPath: String?
    @State private var failure: String?
    @State private var progress = 0
    @State private var importTotal = 0
    @State private var detectingFaces = false
    @State private var detectionUnavailable=false
    @State private var storyFolder = "照片回忆"
    @State private var generation: Task<Void, Never>?
    @State private var recordingStory = false
    @State private var originalStory = ""
    @State private var storySelection = NSRange(location:0,length:0)
    @State private var storyRecordingTarget = "story"
    @State private var savedFingerprint: String?
    @State private var clues = ""
    @State private var rewriteRange: NSRange?
    @State private var rewriteShorter = false
    @State private var includeClues = true
    @State private var includeNames = true
    @State private var streamedText = ""
    @StateObject private var storyRecorder = SpeechRecorder()
    private var completedDrafts: [PhotoDraft] { model.photos.filter { $0.step >= 4 } }
    private var pendingDrafts: [PhotoDraft] { model.photos.filter { $0.step >= 0 && $0.step < 4 } }
    private var wikiPeople: [TWHCore.Document] { model.documents.filter { $0.category == "entities" } }

    var body: some View {
        Screen {
            PhotoAccessNotice()
            if busy { ProgressView(importTotal > 0 ? MobileL10n.format("正在导出压缩副本 %@/%@", [String(describing: progress), String(describing: importTotal)]) : MobileL10n.text("正在整理，请稍候…")); if generation != nil { Button("取消生成") { generation?.cancel(); generation = nil; busy = false } } }
            if detectingFaces { ProgressView("正在找人脸…") }
            if detectionUnavailable {Text("本机人脸检测暂时不可用，照片已保留。可以手动圈选与命名，不会猜测人物身份。").font(.footnote).foregroundStyle(Theme.orange)}
            if let failure { Paper { Text(MobileL10n.text(failure)).foregroundStyle(.red); Button("重试") { if !selection.isEmpty { importPhotos(selection) } else if model.phoneModelAvailable { presentPanel(.confirmation) } else { saveStory() } } } }
            if let value = draft {
                Picker("步骤", selection: $step) { Text("这组照片").tag(0); Text("1 认人").tag(1); Text("2 讲故事").tag(2); Text("确认保存").tag(3) }.pickerStyle(.menu).disabled(busy)
                if step == 0 { photoSelection(value) }
                if step == 1 { photoNaming(value) }
                if step == 2 { photoStory(value) }
                if step == 3 { photoReview(value) }
                if step == 4 { photoCompletion(value) }
            }
        }.scrollDismissesKeyboard(.interactively)
            .safeAreaInset(edge: .bottom, spacing: 0) { photoActions }
            .navigationTitle("照片记忆").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("暂存并关闭", systemImage: "xmark") { persist(); dismiss() }.labelStyle(.iconOnly) }
                ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("完成") { UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil) } }
            }
            .task { bound = model.boundSpace; if let bound, !bound.manifest.readOnly { for discarded in model.photos.filter({ $0.step < 0 }) { try? await bound.store.discardPhotoDraft(discarded) } }; draft = initialDraft ?? PhotoDraft(space: model.active?.id ?? ""); step = draft?.step ?? 0; detectionUnavailable=model.drafts.contains{$0.id==(draft?.id ?? "")+"-face-detection"}; clues = model.drafts.first { $0.id == (draft?.id ?? "") + "-photo-clues" }?.text ?? ""; originalStory = model.drafts.first { $0.id == (draft?.id ?? "") + "-story-source" }?.text ?? ""; if UserDefaults.standard.bool(forKey: "model.neverPhotos") || selectedPreset()?.supportsImages != true { consentImages = false }; if step > 0 { loadImage() } }
            .onDisappear { storyRecorder.stop(); generation?.cancel(); candidateSearch?.cancel(); persist() }
            .onChange(of: step) { _, _ in persist() }.onChange(of: draft?.story) { _, _ in persist() }
            .onChange(of: clues) { _, text in guard let bound, let id = draft?.id, !bound.manifest.readOnly else { return }; model.perform { try await bound.store.saveDraft(Draft(space: bound.manifest.id, text: text, folder: "照片回忆", kind: "photo", id: id + "-photo-clues")) } }
            .onChange(of: selection) { _, items in if !busy && !items.isEmpty { importPhotos(items) } }
            .sheet(item:$panel,onDismiss:advancePanel) { displayed in
                switch displayed {
                case .naming:
                    if let face=naming { FaceNamingView(face:face,existing:draft?.photos.flatMap(\.faces).filter{!$0.name.isEmpty} ?? [],crop:image.flatMap{LocalFaceComparison.crop($0,face:face)},people:wikiPeople) { named in
                        guard var value=draft,current<value.photos.count,let index=value.photos[current].faces.firstIndex(where:{$0.id==named.id}) else{return}
                        value.photos[current].faces[index]=named;draft=value;persist();findCandidates(named)
                    } }
                case .candidates:
                    PhotoCandidatesView(name:namedSource?.name ?? "",candidates:candidates) { confirmed in
                        guard let source=namedSource,var value=draft else{return}
                        for photo in value.photos.indices { for index in value.photos[photo].faces.indices where confirmed.contains(value.photos[photo].faces[index].id) {value.photos[photo].faces[index].name=source.name;value.photos[photo].faces[index].personId=source.personId;value.photos[photo].faces[index].role=source.role} };draft=value;persist()
                    }
                case .sendOptions:
                    PhotoSendOptions(draft:draft,store:bound?.store,selected:$selectedImages,allowImages:$consentImages,includeClues:$includeClues,includeNames:$includeNames,clues:clues) { presentPanel(.confirmation) }
                case .folder:
                    NavigationStack { FolderPickerView {storyFolder=$0} }.environmentObject(model)
                case .confirmation:
                    SendConfirmation(title:"确认发送范围",text:draft.map{packetSummary($0)} ?? "",photos:consentImages ? selectedImages.count : 0) {direct in panel=nil;organize(direct:direct)}
                }
            }
            .fullScreenCover(isPresented:$manualSheet,onDismiss:{if let face=pendingManualFace{pendingManualFace=nil;presentNaming(face)}}) {
                if let image,let value=draft,current<value.photos.count { ManualFaceSelectionView(image:image,existing:value.photos[current].faces) {face,replacing in
                    guard var value=draft,current<value.photos.count else{return};if let replacing{value.photos[current].faces.removeAll{$0.id==replacing}};value.photos[current].faces.append(face);draft=value;persist();pendingManualFace=face;manualSheet=false
                } }
            }
            .confirmationDialog("删除这组草稿及照片副本？副本在最近删除保留 30 天，系统相册原图不受影响。", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } })) { Button("删除草稿与副本", role: .destructive) { guard let value = deleting, let bound else { return }; model.perform { try await bound.store.discardPhotoDraft(value); await model.refresh() }; deleting = nil } }
            .accessibilityElement(children:.contain).accessibilityIdentifier("PHO-1")
    }
    @ViewBuilder private var photoActions: some View {
        if let value = draft, step < 4 {
            BottomActionBar {
                if step == 0 {
                    Button(value.photos.isEmpty ? MobileL10n.text("开始认人") : MobileL10n.format("下一步：开始认人（%@）", [String(value.photos.count)])) { step = 1; current = 0; loadImage() }
                        .buttonStyle(PrimaryButton()).disabled(value.photos.isEmpty || busy).accessibilityIdentifier("photo-selection-next")
                } else if step == 1 {
                    Button(value.photos.flatMap(\.faces).allSatisfy { !$0.name.isEmpty } ? MobileL10n.text("下一步：讲故事") : MobileL10n.text("跳过未命名，继续讲故事")) { step = 2; persist() }
                        .buttonStyle(PrimaryButton()).disabled(busy).accessibilityIdentifier("photo-naming-next")
                } else if step == 2 {
                    if model.phoneModelAvailable {
                        Button("请 AI 帮我写") { selectedImages = Set(value.photos.map(\.id)); presentPanel(.sendOptions) }
                            .buttonStyle(PrimaryButton()).disabled(busy || (value.story.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && clues.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty))
                    }
                    Button("不使用模型，直接确认原话") { step = 3; persist() }.frame(maxWidth: .infinity, minHeight: 44).disabled(busy)
                } else if step == 3 {
                    Button("确认保存") { saveStory() }.buttonStyle(PrimaryButton()).disabled(value.story.isEmpty || busy)
                }
            }
        }
    }
    @ViewBuilder private func photoSelection(_ source: PhotoDraft) -> some View {
        let value = source
                    photoDraftSections

                    TextField("给这组照片起个标题", text: Binding(get: { draft?.title ?? "" }, set: { draft?.title = $0 }))
                    TextField("日期", text: Binding(get: { draft?.date ?? "" }, set: { draft?.date = $0 }))
                    TextField("地点（可选）", text: Binding(get: { draft?.location ?? "" }, set: { draft?.location = $0 }))
                    PhotosPicker(selection: $selection, maxSelectionCount: max(1, 12 - value.photos.count), matching: .images, photoLibrary: .shared()) { Label("从系统相册多选（最多 12 张）", systemImage: "photo.on.rectangle") }.disabled(value.photos.count >= 12)
                    Text("原图留在系统相册，只保留最长边 2560 像素的压缩副本。人脸检测在这台 iPhone 完成。").font(.footnote).foregroundStyle(.secondary)
                    ScrollView(.horizontal) { HStack { ForEach(Array(value.photos.enumerated()), id: \.element.id) { index, photo in PhotoThumbnail(path: photo.path, store: bound?.store).frame(width: 92, height: 92).overlay(alignment: .bottomLeading) { Text(index == 0 ? MobileL10n.text("封面") : "\(index + 1)").font(.caption).padding(4).background(.regularMaterial) }.draggable(photo.id).dropDestination(for: String.self) { ids, _ in guard let id = ids.first, let from = draft?.photos.firstIndex(where: { $0.id == id }), from != index else { return false }; draft?.photos.swapAt(from, index); persist(); return true } } } }
                    ForEach(Array(value.photos.enumerated()), id: \.element.id) { index, photo in HStack { Label(MobileL10n.format("第 %@ 张 · %@ 个人脸框", [String(describing: index + 1), String(describing: photo.faces.count)]), systemImage: "photo"); Spacer(); Button("上移", systemImage: "arrow.up") { guard index > 0 else { return }; draft?.photos.swapAt(index, index - 1); persist() }.labelStyle(.iconOnly).disabled(index == 0); Button("移除", systemImage: "xmark") { draft?.photos.remove(at: index); persist() }.labelStyle(.iconOnly) } }


    }
    @ViewBuilder private func photoNaming(_ source: PhotoDraft) -> some View {
        let value = source
                    Text("点框命名，漏掉的人可手动圈选。不会自动猜测身份。").font(.subheadline).foregroundStyle(.secondary)
                    if let image, current < value.photos.count { faceStage(image: image, photo: value.photos[current]) }
                    ScrollView(.horizontal) { HStack { ForEach(Array(value.photos.enumerated()), id: \.element.id) { index, photo in Button(MobileL10n.format("%@ · 已命名 %@", [String(describing: index + 1), String(describing: photo.faces.filter { !$0.name.isEmpty }.count)])) { current = index; loadImage() }.buttonStyle(.bordered).tint(current == index ? Theme.blue : .secondary) } } }
                    AdaptiveActions { Button("手动圈选") { manualSheet = true }.frame(minHeight: 44); Button("这张没有人") { guard current < value.photos.count else { return }; draft?.photos[current].faces = []; persist() } }
                    if !detectionUnavailable && current < value.photos.count && value.photos[current].faces.isEmpty { Text("没有找到人脸，可手动圈选").font(.footnote).foregroundStyle(.secondary) }

    }
    @ViewBuilder private func photoStory(_ source: PhotoDraft) -> some View {
        let value = source
                    HStack { TextField("线索：谁和你在一起，那天发生了什么", text: $clues, axis: .vertical).lineLimit(2...5).textFieldStyle(.roundedBorder).disabled(busy).accessibilityLabel("线索：谁和你在一起，那天发生了什么").accessibilityIdentifier("photo-story-clues"); Button("语音线索",systemImage:"mic") { toggleStoryRecording(target:"clues") }.labelStyle(.iconOnly).frame(minWidth: 44, minHeight: 44).disabled(busy) }
                    Paper { Text(MobileL10n.format("这些照片里的故事 · %@ 张照片", [String(describing: value.photos.count)])).font(Theme.serif(21)); PhotoStoryEditor(text: Binding(get: { draft?.story ?? "" }, set: { draft?.story = $0 }), onSelection: { storySelection = $0 }, canRewrite: model.phoneModelAvailable) { range, shorter in rewriteRange = range; rewriteShorter = shorter; presentPanel(.sendOptions) }.frame(height: 200).overlay(alignment:.topLeading) { if value.story.isEmpty { Text("还没有故事，可以先说一句").foregroundStyle(.secondary).allowsHitTesting(false) } }; Text(MobileL10n.text("已命名：") + value.photos.flatMap(\.faces).filter { !$0.name.isEmpty }.map(\.name).joined(separator: "、")).font(.caption) }
                    Button(recordingStory ? MobileL10n.text("完成语音补充") : MobileL10n.text("说一句补充"), systemImage: "mic") { toggleStoryRecording(target:"story") }
                    if recordingStory { TextEditor(text: Binding(get: { storyRecorder.transcript }, set: { storyRecorder.editTranscript($0) })).frame(minHeight: 100) }
                    if let error = storyRecorder.error { Text(MobileL10n.text(error)).font(.footnote).foregroundStyle(.red) }
                    Button("修改人物线索") { step = 1; loadImage() }
                    Text("真实讲述 · 依据你提供的文字与已确认标注").font(.caption).foregroundStyle(.secondary)
                    if model.phoneModelAvailable && selectedPreset()?.supportsImages == true { Toggle("同意把压缩照片副本发给模型", isOn: $consentImages).disabled(UserDefaults.standard.bool(forKey: "model.neverPhotos")) }
                    Text(consentImages ? MobileL10n.text("确认下一步时会再次展示发送范围。") : MobileL10n.text("只使用你的文字与人物标注，不发送照片。手动讲述也可以完成。 ")).font(.footnote).foregroundStyle(.secondary)

    }
    @ViewBuilder private func photoReview(_ source: PhotoDraft) -> some View {
        let value = source
                    if let first = value.photos.first { PhotoThumbnail(path: first.path, store: bound?.store).frame(height: 180).allowsHitTesting(false) }
                    Text("\(value.date) · \(value.location)").font(.caption)
                    Text("真实讲述 · 请核对事实与人物称呼后保存").font(.footnote).foregroundStyle(.secondary)
                    if !originalStory.isEmpty { DisclosureGroup("讲述原话（完整保留）") { Text(originalStory).textSelection(.enabled) } }
                    if model.phoneModelAvailable { Menu("调整这份草稿") { Button("再写一版") { rewriteRange = nil; rewriteShorter = false; presentPanel(.sendOptions) }; Button("更简短") { rewriteRange = nil; rewriteShorter = true; presentPanel(.sendOptions) } } }
                    Button(MobileL10n.format("保存位置：生活记录 / %@", [String(describing: storyFolder)])) { presentPanel(.folder) }

                    TextField("故事标题", text: Binding(get: { draft?.title ?? "" }, set: { draft?.title = $0 }))
                    PhotoStoryEditor(text: Binding(get: { draft?.story ?? "" }, set: { draft?.story = $0 }), onSelection: { storySelection = $0 }, canRewrite: model.phoneModelAvailable) { range, shorter in rewriteRange = range; rewriteShorter = shorter; presentPanel(.sendOptions) }.disabled(busy).frame(height: 220).font(Theme.serif(17))
                    Button(recordingStory ? MobileL10n.text("完成语音补充") : MobileL10n.text("说一句补充"),systemImage:"mic") { toggleStoryRecording(target:"story") }.disabled(busy)

    }
    private func faceStage(image: UIImage, photo: MemoryPhoto) -> some View {
        GeometryReader { geometry in
            let width = min(geometry.size.width, geometry.size.height * image.size.width / image.size.height), height = width * image.size.height / image.size.width
            ZStack(alignment: .topLeading) {
                Image(uiImage: image).resizable().scaledToFit().frame(width: width, height: height)
                ForEach(photo.faces) { face in Button { presentNaming(face) } label: { Rectangle().stroke(naming?.id == face.id ? Theme.orange : face.name.isEmpty ? Color.white : Color.green, style: StrokeStyle(lineWidth: 2, dash: face.name.isEmpty ? [5] : [])).overlay(alignment: .bottom) { Text(face.name.isEmpty ? MobileL10n.text("点我命名") : face.name).font(.caption).padding(4).background(.regularMaterial) } }.frame(width: width * face.width, height: height * face.height).offset(x: width * face.x, y: height * face.y).accessibilityLabel(face.name.isEmpty ? MobileL10n.text("未命名人脸") : face.name) }
            }.frame(width: width, height: height).scaleEffect(zoom).gesture(MagnificationGesture().onChanged { zoom = min(3, max(1, $0)) })
                .simultaneousGesture(LongPressGesture(minimumDuration: 0.4).sequenced(before: DragGesture()).onChanged { phase in if case .second(true, let drag?) = phase, manual { dragStart = drag.startLocation } }.onEnded { phase in
                    guard manual, case .second(true, let drag?) = phase, var value = draft, current < value.photos.count else { return }
                    let rect = CGRect(x: min(drag.startLocation.x, drag.location.x), y: min(drag.startLocation.y, drag.location.y), width: abs(drag.translation.width), height: abs(drag.translation.height))
                    guard rect.width > 12, rect.height > 12 else { return }
                    let face = FaceAnnotation(x: rect.minX / width, y: rect.minY / height, width: rect.width / width, height: rect.height / height)
                    value.photos[current].faces.append(face); draft = value; presentNaming(face); persist()
                }).frame(maxWidth: .infinity, maxHeight: .infinity)
        }.frame(height: 300).clipped()
    }
    private func presentPanel(_ next:PhotoPanel) {
        if panel == next{return}
        if presentedPanel != nil {pendingPanel=next;panel=nil} else {presentedPanel=next;panel=next}
    }
    private func advancePanel() {
        let next=pendingPanel;pendingPanel=nil;presentedPanel=nil
        if next != .naming {naming=nil}
        if let next {presentedPanel=next;panel=next}
    }
    private func presentNaming(_ face:FaceAnnotation) {naming=face;presentPanel(.naming)}
    private func toggleStoryRecording(target:String) {
        if recordingStory {
            storyRecorder.stop(); recordingStory = false
            if storyRecordingTarget == "clues" { clues += (clues.isEmpty ? "" : "\n") + storyRecorder.transcript }
            else if var value = draft {
                let source = value.story as NSString
                let range = NSRange(location:min(storySelection.location,source.length),length:min(storySelection.length,max(0,source.length-storySelection.location)))
                value.story = source.replacingCharacters(in:range,with:storyRecorder.transcript); draft = value
                storySelection = NSRange(location:range.location + (storyRecorder.transcript as NSString).length,length:0)
            }
            persist()
        } else { storyRecordingTarget = target; storyRecorder.transcript = ""; storyRecorder.spaceID = bound?.manifest.id; recordingStory = true; Task { await storyRecorder.start(); if !storyRecorder.running { recordingStory = false } } }
    }
    private func importPhotos(_ items: [PhotosPickerItem]) {
        guard !busy, !items.isEmpty, let store = bound?.store, let bound = draft else { return }; busy = true; failure = nil; progress = 0; importTotal = items.count
        Task {
            defer { busy = false; importTotal = 0; detectingFaces = false }
            var value = bound
            do {
            for item in items.prefix(max(0, 12 - value.photos.count)) {
                guard let bytes = try await item.loadTransferable(type: Data.self) else { throw MobileError.invalidData("照片暂时无法读取，请重试。") }
                detectingFaces = true
                let prepared = try await Task.detached(priority:.userInitiated) { try PhotoPreparation.prepare(bytes) }.value
                detectingFaces = false
                if prepared.faceDetectionUnavailable {detectionUnavailable=true;try await store.saveDraft(Draft(space:bound.knowledgeBaseId,text:"face-detection-unavailable",folder:"照片回忆",kind:"photo-metadata",id:bound.id+"-face-detection"))}
                let path = try await store.savePhoto(prepared.jpeg, draftId: value.id); value.photos.append(MemoryPhoto(path: path, faces: prepared.faces)); progress += 1
                if value.photos.count == 1 { if let date = prepared.date { value.date = date }; if let location = prepared.location { value.location = location } }
                try await store.savePhotoDraft(value)
                draft = value; selection = Array(selection.dropFirst())
            }
            draft = value; selection = []
            } catch { draft = value; failure = error.localizedDescription }
        }
    }
    private func selectDraft(_ saved: PhotoDraft) {
        guard !busy else { return }; storyRecorder.stop(); recordingStory = false
        generation?.cancel(); generation = nil; candidateSearch?.cancel(); candidateSearch=nil
        draft = saved; step = saved.step; current = 0; image = nil; streamedText = ""; rewriteRange = nil; originalStory = ""; clues = ""; storySelection = NSRange(location:0,length:0); savedPath = nil; candidates = []; namedSource = nil; selectedImages = []; consentImages = false; includeClues = true; includeNames = true; failure = nil; selection = []
        detectionUnavailable=model.drafts.contains{$0.id==saved.id+"-face-detection"}
        clues = model.drafts.first { $0.id == saved.id + "-photo-clues" }?.text ?? ""
        originalStory = model.drafts.first { $0.id == saved.id + "-story-source" }?.text ?? ""
        loadImage()
    }
    private func loadImage() {
        guard let value = draft, current < value.photos.count, let store = bound?.store else { return }
        image = nil; zoom = 1
        model.perform { image = UIImage(data: try await store.read(value.photos[current].path)) }
    }
    private func persist() {
        guard var value = draft, let store = bound?.store, bound?.manifest.readOnly != true else { return }
        value.step = step; value.updatedAt = MobileProtocol.timestamp(); draft = value
        model.perform { try await store.savePhotoDraft(value) }
    }
    private func organize(direct: Bool) {
        guard let value = draft, let bound else { return }; busy = true; failure = nil
        generation = Task {
            defer { busy = false; generation = nil }
            do {
            if direct, model.phoneModelAvailable, let preset = selectedPreset(), let key = try CloudKeychain.read(preset.id) {
                let people = includeNames ? value.photos.flatMap(\.faces).filter { !$0.name.isEmpty }.map { "\($0.name)（\($0.role)）" }.joined(separator: "、") : ""
                var images: [Data] = []
                if consentImages && preset.supportsImages && !UserDefaults.standard.bool(forKey: "model.neverPhotos") { for photo in value.photos where selectedImages.contains(photo.id) { images.append(try await bound.store.read(photo.path)) } }
                try await bound.store.saveDraft(Draft(space:bound.manifest.id,text:value.story,folder:"照片回忆",kind:"photo",id:value.id + "-pre-generation"))
                let originalInput = [includeClues ? clues : "", value.story].filter { !$0.isEmpty }.joined(separator: "\n\n")
                if originalStory.isEmpty { originalStory = originalInput; try await bound.store.saveDraft(Draft(space: bound.manifest.id, text: originalInput, folder: "照片回忆", kind: "photo", id: value.id + "-story-source")) }
                let sourceText = value.story as NSString
                let validRange = rewriteRange.flatMap { $0.location >= 0 && NSMaxRange($0) <= sourceText.length ? $0 : nil }
                let prefix = validRange.map { sourceText.substring(to: $0.location) } ?? ""
                let suffix = validRange.map { sourceText.substring(from: NSMaxRange($0)) } ?? ""
                let generationText = validRange.map { sourceText.substring(with: $0) + (rewriteShorter ? "\n请在保留事实前提下缩短这一段。" : "\n请保留事实，将这一段重新表达。") } ?? (originalInput + (rewriteShorter ? "\n请在保留事实的前提下整理得更简短。" : ""))
                streamedText = ""
                step = 3
                let story = try await ModelClient().complete(messages: [ChatMessage(role: "system", content: "整理用户讲述的照片故事，不推测未提供的事实或人物身份。"), ChatMessage(role: "user", content: "人物：\(people)\n日期：\(value.date)\n地点：\(value.location)\n\(generationText)")], images: images, preset: preset, key: key, onDelta: { delta in guard draft?.id == value.id else { return }; streamedText += delta; draft?.story = prefix + streamedText + suffix })
                guard draft?.id == value.id else { return }; draft?.story = prefix + story + suffix; rewriteRange = nil; step = 3; persist()
            } else { throw ModelServiceFailure.notConfigured
            }
            } catch is CancellationError { if draft?.id == value.id { if !streamedText.isEmpty { try? await bound.store.saveDraft(Draft(space:bound.manifest.id,text:streamedText,folder:"照片回忆",kind:"generated-review",id:value.id + "-interrupted-review")) }; draft?.story = value.story; persist() } } catch { if draft?.id == value.id { if !streamedText.isEmpty { try? await bound.store.saveDraft(Draft(space:bound.manifest.id,text:streamedText,folder:"照片回忆",kind:"generated-review",id:value.id + "-interrupted-review")) }; draft?.story = value.story; persist() }; failure = error.localizedDescription }
        }
    }
    private func saveStory() {
        guard !busy, let value = draft, let bound else { return }; busy = true; failure = nil
        model.perform {
            defer { busy = false }
            let people = value.photos.flatMap(\.faces).filter { !$0.name.isEmpty }.map { "\($0.name)（\($0.role)）" }.joined(separator:"、")
            let links = value.photos.map { "![](<\($0.path)>)" }.joined(separator:"\n")
            let content = "日期：\(value.date)\n地点：\(value.location)\n人物：\(people)\n\n\(value.story)\n\n\(links)"
            let fingerprint = MobileProtocol.hash(Data(content.utf8))
            do {
                let journal = try await bound.store.drafts().first { $0.id == value.id + "-saved-story" && $0.text == fingerprint }
                let path: String
                if let existing = savedPath, savedFingerprint == fingerprint { path = existing }
                else if let existing = journal?.savedPath { path = existing }
                else { let heading = (value.title.isEmpty ? "照片故事" : value.title).replacingOccurrences(of:"\n",with:" "); let expected = "# \(heading)\n\n\(content)\n"; let existing = try await bound.store.documents().first { $0.isSource && $0.path.hasPrefix(bound.manifest.sourcesPath + "/\(storyFolder)/\(value.id)/") && $0.markdown == expected }; if let existing { path = existing.path } else { path = try await bound.store.saveOriginal(text:content,folder:"\(storyFolder)/\(value.id)",title:value.title.isEmpty ? "照片故事" : value.title) }; savedPath = path; savedFingerprint = fingerprint; var marker = Draft(space:bound.manifest.id,text:fingerprint,folder:storyFolder,kind:"photo-metadata",id:value.id + "-saved-story"); marker.status = "saved"; marker.savedPath = path; try await bound.store.saveDraft(marker) }
                savedPath = path
                step = 4; persist(); model.message = "故事与照片副本已保存"; await model.refresh()
            } catch { failure = error.localizedDescription; throw error }
        }
    }
    @ViewBuilder private var photoDraftSections: some View {
        Text("进行中").font(.headline)
        if pendingDrafts.isEmpty { Text("没有未完成的照片组").font(.footnote).foregroundStyle(.secondary) }
        ForEach(pendingDrafts.filter { $0.id != draft?.id }) { saved in
            HStack {
                if let photo = saved.photos.first { PhotoThumbnail(path: photo.path, store: bound?.store).frame(width: 64, height: 64) }
                Button { selectDraft(saved) } label: { VStack(alignment: .leading) { Text(saved.title.isEmpty ? MobileL10n.text("未命名照片组") : saved.title); Text(MobileL10n.format("第 %@ 步 · %@", [String(describing: min(3, saved.step + 1)), String(describing: saved.updatedAt)])).font(.caption) } }
                Spacer(); Button("删除", systemImage: "trash", role: .destructive) { deleting = saved }.labelStyle(.iconOnly)
            }
            if let date = ISO8601DateFormatter().date(from: saved.updatedAt), Date().timeIntervalSince(date) > 30 * 86400 { Text("这组草稿已有 30 天未编辑，可继续讲述或清理副本。").font(.caption).foregroundStyle(.secondary) }
        }
        if !completedDrafts.isEmpty { Text("已完成").font(.headline); ForEach(completedDrafts) { saved in
            if let doc = model.documents.first(where: { $0.isSource && $0.markdown.contains(saved.id) }) { NavigationLink { DocumentView(document: doc) } label: { Text(saved.title.isEmpty ? MobileL10n.text("照片故事") : saved.title) } }
            else { Button(saved.title.isEmpty ? MobileL10n.text("照片故事") : saved.title) { selectDraft(saved) } }
        } }
    }
    @ViewBuilder private func photoCompletion(_ value: PhotoDraft) -> some View {
        Paper {
            Label("已经安全保存", systemImage: "checkmark.circle.fill").font(.headline)
            Text(MobileL10n.format("故事与 %@ 张照片副本保存在这个空间。", [String(describing: value.photos.count)]))
            Label("已保存", systemImage: "checkmark.circle")
            Label(model.active?.cloud == nil ? MobileL10n.text("仅本机 · 尚未连接 iCloud") : model.syncing ? MobileL10n.text("同步中") : MobileL10n.text("已完成最近一次 iCloud 同步检查"), systemImage: "icloud")
            ForEach(wikiPeople.filter { person in value.photos.flatMap(\.faces).contains { $0.name == person.title || $0.personId == person.path } }) { person in NavigationLink("看这个人：" + person.title) { PersonView(document: person) } }
            Button("再讲一组照片") { selectDraft(PhotoDraft(space: bound?.manifest.id ?? "")) }.disabled(busy)
            Button("回到此刻") { model.selectedTab = 0; dismiss() }
        }.accessibilityIdentifier("PHO-11")
    }
    private func packetSummary(_ value: PhotoDraft) -> String {
        let names = includeNames ? value.photos.flatMap(\.faces).filter { !$0.name.isEmpty }.map { $0.name + "（" + $0.role + "）" }.joined(separator: "、") : ""
        let source = [includeClues ? clues : "", value.story].filter { !$0.isEmpty }.joined(separator: "\n\n")
        return "人物：\(names)\n日期：\(value.date)\n地点：\(value.location)\n\(source)"
    }
    private func findCandidates(_ named: FaceAnnotation) {
        guard !named.name.isEmpty, let value = draft, current < value.photos.count, let image, let source = LocalFaceComparison.crop(image, face: named), let bound else { return }
        let sourcePhoto = value.photos[current].id
        candidateSearch?.cancel()
        candidateSearch = Task {
            var found:[PhotoFaceCandidate]=[]
            for photo in value.photos where photo.id != sourcePhoto {
                guard !Task.isCancelled,let data=try? await bound.store.read(photo.path),let other=UIImage(data:data) else{continue}
                for face in photo.faces where face.name.isEmpty {
                    guard !Task.isCancelled,let crop=LocalFaceComparison.crop(other,face:face),LocalFaceComparison.similar(source,to:crop) else{continue}
                    found.append(PhotoFaceCandidate(photoID:photo.id,face:face,crop:crop))
                }
            }
            guard !Task.isCancelled,draft?.id==value.id,!found.isEmpty else{return}
            candidates=found;namedSource=named;presentPanel(.candidates)
        }
    }

}
struct FaceNamingView: View {
    @Environment(\.dismiss) private var dismiss
    var face: FaceAnnotation
    var existing: [FaceAnnotation]
    var crop: UIImage? = nil
    var people: [TWHCore.Document] = []
    var onSave: (FaceAnnotation) -> Void
    @State private var name = ""; @State private var role = "朋友"; @State private var myself = false
    @State private var duplicate: FaceAnnotation?
    @State private var showDuplicate = false
    private var matches: [TWHCore.Document] { people.filter { name.isEmpty || $0.title.localizedCaseInsensitiveContains(name) } }
    var body: some View {
        NavigationStack { Form {
            if let crop { Image(uiImage: crop).resizable().scaledToFit().frame(maxWidth: .infinity, maxHeight: 80) }
            TextField("怎么称呼 TA", text: $name)
            Toggle("这是我自己", isOn: $myself).onChange(of: myself) { _, value in if value { name = "我"; role = "自己" } }
            Picker("关系", selection: $role) { ForEach(["家人", "朋友", "同事", "伴侣", "自己", "其他"], id: \.self) { Text(LocalizedStringKey($0)) } }
            if !matches.isEmpty { Section("已有人物") { ForEach(Array(matches.prefix(8))) { person in Button(person.title) { var value = face; value.name = person.title; value.personId = person.path; value.role = role; onSave(value); dismiss() } } } }
            Section("最近出现的人物") { ForEach(Array(Dictionary(existing.filter { $0.id != face.id }.map { ($0.personId, $0) }, uniquingKeysWith: { first, _ in first }).values).sorted { $0.name < $1.name }, id: \.personId) { person in Button(MobileL10n.format("使用 %@", [String(describing: person.name)])) { save(using: person) } } }

            if !face.name.isEmpty { Button("取消这个命名") { var value = face; value.name = ""; onSave(value); dismiss() } }
        }.scrollDismissesKeyboard(.interactively)
            .safeAreaInset(edge: .bottom, spacing: 0) {
                BottomActionBar {
                    AdaptiveActions {
                        Button("暂不命名") { dismiss() }.frame(maxWidth: .infinity, minHeight: 44)
                        Button("确定", action: confirmName).buttonStyle(PrimaryButton()).disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
            }.navigationTitle("命名这个人").navigationBarTitleDisplayMode(.inline).onAppear { name = face.name; role = face.role; myself = face.role == "自己" }
            .confirmationDialog("已有同名人物，是同一个人吗？", isPresented: $showDuplicate) { Button("同一个人，合并") { save(using: duplicate) }; Button("不同的人，分别保留") { save(using: nil) } }
        }.presentationDetents([.medium, .large]).accessibilityIdentifier("PHO-4")
    }
    private func confirmName() {
        if let person = existing.first(where: { $0.name == name.trimmingCharacters(in: .whitespaces) && $0.personId != face.personId }) { duplicate = person; showDuplicate = true }
        else if let person = people.first(where: { $0.title == name.trimmingCharacters(in: .whitespaces) && $0.path != face.personId }) { duplicate = FaceAnnotation(name: person.title, role: role, x: face.x, y: face.y, width: face.width, height: face.height, personId: person.path); showDuplicate = true }
        else { save(using: nil) }
    }
    private func save(using person: FaceAnnotation?) { var value = face; value.name = person?.name ?? name.trimmingCharacters(in: .whitespaces); value.role = person?.role ?? role; if let person { value.personId = person.personId }; if myself { value.name = "我"; value.role = "自己"; value.personId = "self" }; onSave(value); dismiss() }
}
