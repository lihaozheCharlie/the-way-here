import SwiftUI
import TWHCore

struct PhotoThumbnail: View {
    let path: String
    let store: SpaceStore?
    @State private var image: UIImage?
    var body: some View {
        GeometryReader { geometry in
            Group {
                if let image {
                    Image(uiImage: image).resizable().scaledToFill()
                        .frame(width: geometry.size.width, height: geometry.size.height)
                } else {
                    Rectangle().fill(Theme.pale).overlay { Image(systemName: "photo").foregroundStyle(Theme.blue) }
                }
            }.frame(width: geometry.size.width, height: geometry.size.height)
                .clipped().contentShape(Rectangle())
        }.task(id: path) { guard let store else { return }; if let data = try? await store.read(path) { image = UIImage(data: data) } }
    }
}
struct PhotoSendOptions: View {
    let draft: PhotoDraft?
    let store: SpaceStore?
    @Binding var selected: Set<String>
    @Binding var allowImages: Bool
    @Binding var includeClues: Bool
    @Binding var includeNames: Bool
    var clues: String
    var onContinue: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var remember = false
    var body: some View {
        NavigationStack { Form {
            Section("将发送的内容") {
                Text(draft?.story ?? "").lineLimit(5)
                Toggle("包含线索文字", isOn: $includeClues)
                if includeClues { Text(clues).font(.footnote) }
                Toggle("包含已确认的人物标注", isOn: $includeNames)
                Text(MobileL10n.text("人物：") + (draft?.photos.flatMap(\.faces).filter { !$0.name.isEmpty }.map(\.name).joined(separator: "、") ?? ""))
                if selectedPreset()?.supportsImages == true {
                    Toggle("不发照片，仅用文字", isOn: Binding(get: { !allowImages }, set: { allowImages = !$0 })).disabled(UserDefaults.standard.bool(forKey: "model.neverPhotos"))
                    if allowImages { ForEach(draft?.photos ?? []) { photo in Toggle(isOn: Binding(get: { selected.contains(photo.id) }, set: { if $0 { selected.insert(photo.id) } else { selected.remove(photo.id) } })) { PhotoThumbnail(path: photo.path, store: store).frame(width: 72, height: 72).accessibilityLabel("照片压缩副本") } } }
                }
            }
            Section("接收方") { Text(selectedPreset()?.localizedName ?? MobileL10n.text("手机配置的模型")); Text("原图留在系统相册。每次生成前都会列出发送范围。").font(.footnote) }
            Toggle("本次记住选择", isOn: $remember)
        }.safeAreaInset(edge: .bottom, spacing: 0) {
            BottomActionBar { Button("继续确认发送", action: continueSending).buttonStyle(PrimaryButton()) }
        }.navigationTitle("发送确认").navigationBarTitleDisplayMode(.inline).toolbar { ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } } } }.onAppear {
            if let draft, let saved = UserDefaults.standard.dictionary(forKey: "photo.consent." + draft.knowledgeBaseId + "." + draft.id) {
                allowImages = saved["images"] as? Bool ?? false; includeClues = saved["clues"] as? Bool ?? true; includeNames = saved["names"] as? Bool ?? true
                selected = Set(saved["selected"] as? [String] ?? []).intersection(Set(draft.photos.map(\.id))); remember = true
            }
            if UserDefaults.standard.bool(forKey:"model.neverPhotos") || selectedPreset()?.supportsImages != true { allowImages = false }
        }.presentationDetents([.medium, .large]).accessibilityIdentifier("PHO-9")
    }
    private func continueSending() {
        // Recheck before persisting consent and entering the common confirmation.
        if UserDefaults.standard.bool(forKey: "model.neverPhotos") || selectedPreset()?.supportsImages != true { allowImages = false }
        if remember, let draft {
            UserDefaults.standard.set(["images": allowImages, "clues": includeClues, "names": includeNames, "selected": Array(selected)], forKey: "photo.consent." + draft.knowledgeBaseId + "." + draft.id)
        }
        onContinue()
    }
}

/// UITextView supplies native selection and paragraph rewrite actions on iOS 17.
struct PhotoStoryEditor: UIViewRepresentable {
    @Binding var text: String
    var onSelection: ((NSRange) -> Void)? = nil
    var canRewrite = true
    var onRewrite: (NSRange, Bool) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeUIView(context: Context) -> UITextView {
        let view = UITextView(); view.delegate = context.coordinator
        view.font = UIFont(name: "Songti SC", size: 17) ?? .preferredFont(forTextStyle: .body)
        view.adjustsFontForContentSizeCategory = true; view.backgroundColor = .clear; view.keyboardDismissMode = .interactive
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        view.accessibilityLabel = MobileL10n.text(canRewrite ? "照片故事正文，可选择段落重写" : "照片故事正文")
        return view
    }
    func updateUIView(_ view: UITextView, context: Context) {
        let coordinator = context.coordinator
        coordinator.parent = self
        coordinator.isApplyingUpdate = true
        defer { coordinator.isApplyingUpdate = false }
        view.accessibilityLabel = MobileL10n.text(canRewrite ? "照片故事正文，可选择段落重写" : "照片故事正文")
        if view.text != text { let selection = view.selectedRange; view.text = text; if selection.location <= (text as NSString).length { view.selectedRange = selection } }
    }
    final class Coordinator: NSObject, UITextViewDelegate {
        var parent: PhotoStoryEditor
        var isApplyingUpdate = false
        private var lastReportedSelection: NSRange?
        init(_ parent: PhotoStoryEditor) { self.parent = parent }
        func textViewDidChange(_ textView: UITextView) {
            guard !isApplyingUpdate, parent.text != textView.text else { return }
            parent.text = textView.text
        }
        func textViewDidChangeSelection(_ textView: UITextView) {
            guard !isApplyingUpdate, lastReportedSelection != textView.selectedRange else { return }
            lastReportedSelection = textView.selectedRange
            parent.onSelection?(textView.selectedRange)
        }
        func textView(_ textView: UITextView, editMenuForTextIn range: NSRange, suggestedActions: [UIMenuElement]) -> UIMenu? {
            let selected = range.length > 0 ? range : (textView.text as NSString).paragraphRange(for: range)
            guard parent.canRewrite, selected.length > 0 else { return UIMenu(children: suggestedActions) }
            let rewrite = UIAction(title: NSLocalizedString("再写一版", comment: ""), image: UIImage(systemName: "arrow.clockwise")) { [weak self] _ in self?.parent.onRewrite(selected, false) }
            let shorter = UIAction(title: NSLocalizedString("更简短", comment: ""), image: UIImage(systemName: "text.badge.minus")) { [weak self] _ in self?.parent.onRewrite(selected, true) }
            return UIMenu(children: suggestedActions + [rewrite, shorter])
        }
    }
}
