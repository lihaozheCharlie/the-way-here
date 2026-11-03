import UIKit
import UniformTypeIdentifiers
import SwiftUI
import TWHCore

final class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        let host = UIHostingController(rootView: ShareCaptureView(items: extensionContext?.inputItems as? [NSExtensionItem] ?? [], complete: { [weak self] in self?.extensionContext?.completeRequest(returningItems: nil) }, open: { [weak self] url, completion in self?.extensionContext?.open(url, completionHandler: completion) }))
        addChild(host); view.addSubview(host.view); host.view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([host.view.topAnchor.constraint(equalTo: view.topAnchor), host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor), host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor), host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor)]); host.didMove(toParent: self)
    }
}
struct ShareCaptureView: View {
    var items: [NSExtensionItem]
    var complete: () -> Void
    var open: (URL, @escaping (Bool) -> Void) -> Void
    @State private var shareID = UUID().uuidString.lowercased()
    @State private var text = ""
    @State private var note = ""
    @State private var folder = "分享收件箱"
    @State private var kind = "记录"
    @State private var error: String?
    @State private var busy = false
    @State private var loading = true
    @State private var thumbnails: [UIImage] = []
    @State private var filenames: [String] = []
    @State private var saved = false
    @State private var continueURL: URL?
    private var providers: [NSItemProvider] { items.flatMap { $0.attachments ?? [] } }
    private var spaceName: String? {
        guard let data = UserDefaults(suiteName: "group.com.thewayhere.shared")?.data(forKey: "widget.spaceManifest"), let value = try? JSONDecoder().decode(SpaceManifest.self, from: data), !value.readOnly else { return nil }
        return value.name
    }
    var body: some View {
        NavigationStack { Form {
            if saved { Section { Label("已安全存入空间", systemImage: "checkmark.circle.fill"); if continueURL != nil { Text("如果系统没有自动打开 App，下次打开时会直接回到这组照片。").font(.footnote); Button("继续讲照片故事") { openPhoto() } }; Button("完成") { complete() } } }
            else {
                if let spaceName { Section("保存空间") { Text(spaceName) } }
                else { Section { Text("请先打开 The Way Here，选择个人空间后再分享。演示库不会接收私人材料。").foregroundStyle(.orange) } }
                Section("预览") {
                    if loading { ProgressView("正在读取分享预览…") }
                    if !thumbnails.isEmpty { ScrollView(.horizontal) { HStack { ForEach(Array(thumbnails.enumerated()), id: \.offset) { _, image in Image(uiImage: image).resizable().scaledToFill().frame(width: 92, height: 92).clipped() } } } }
                    ForEach(Array(filenames.enumerated()), id: \.offset) { _, name in Label(name, systemImage: "doc") }
                    TextEditor(text: $text).frame(minHeight: 150).accessibilityLabel("分享文字或网页摘要")
                    Text("只保存你分享的文字、图片、文件与网页标题。内容不会在分享面板中发给模型。").font(.footnote)
                }
                Picker("建议保存为", selection: $kind) { ForEach(["记录", "照片故事", "聊天记录"], id: \.self) { Text(LocalizedStringKey($0)) } }
                TextField("保存文件夹", text: $folder); TextField("备注", text: $note)
                if let error { Text(error).foregroundStyle(.red) }
                Button(LocalizedStringKey(busy ? "保存中…" : "存进 The Way Here")) { save() }.disabled(busy || loading || spaceName == nil)
            }
        }.navigationTitle("收进 The Way Here").toolbar { Button("取消") { complete() }.disabled(busy) }.task { await preview() }.interactiveDismissDisabled(busy) }
    }
    private func preview() async {
        defer { loading = false }
        text = items.compactMap { item in [item.attributedTitle?.string, item.attributedContentText?.string].compactMap { $0 }.joined(separator: "\n") }.filter { !$0.isEmpty }.joined(separator: "\n\n")
        for provider in providers.prefix(12) {
            if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier), let value = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier), let value = value as? String, !text.contains(value) { text += (text.isEmpty ? "" : "\n\n") + value }
            if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier), let value = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier), let url = value as? URL, !url.isFileURL { text += "\n" + url.absoluteString }
            if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
                kind = "照片故事"
                let preview: UIImage? = await withCheckedContinuation { continuation in provider.loadPreviewImage(options: nil) { object, _ in continuation.resume(returning: object as? UIImage) } }
                if let preview { thumbnails.append(preview) }
            } else if let name = provider.suggestedName { filenames.append(name); if ["txt", "json", "csv"].contains(URL(fileURLWithPath: name).pathExtension.lowercased()) { kind = "聊天记录" } }
        }
        if providers.count > 12 { error = MobileL10n.text("一次最多接收 12 个附件，请减少后重试。") }
    }
    private func save() {
        busy = true; error = nil
        Task { do {
            guard providers.count <= 12 else { throw MobileError.invalidData(MobileL10n.text("一次最多接收 12 个附件，请减少后重试。")) }
            guard let group = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.com.thewayhere.shared") else { throw MobileError.unavailable(MobileL10n.text("App Group 尚未配置，请打开主 App 完成安装。")) }
            let defaults = UserDefaults(suiteName: "group.com.thewayhere.shared")
            guard let data = defaults?.data(forKey: "widget.spaceManifest"), let directory = defaults?.string(forKey: "widget.spaceDirectory"), MobileProtocol.validID(directory) else { throw MobileError.unavailable(MobileL10n.text("请先打开 App，连接个人空间。")) }
            let manifest = try JSONDecoder().decode(SpaceManifest.self, from: data); try manifest.validate()
            guard !manifest.readOnly, defaults?.string(forKey: "widget.spaceId") == manifest.id else { throw MobileError.readOnly }
            guard MobileProtocol.validSourceFolder(folder) else { throw MobileError.invalidPath }
            let id = shareID, root = group.appendingPathComponent("Inbox/\(id)")
            try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
            var attachments: [String] = []
            for (index, provider) in providers.enumerated() {
                guard let type = provider.registeredTypeIdentifiers.first(where: { UTType($0)?.conforms(to: .image) == true || UTType($0)?.conforms(to: .data) == true }) else { continue }
                let item = try await provider.loadItem(forTypeIdentifier: type)
                let ext = UTType(type)?.preferredFilenameExtension ?? "bin", name = "attachment-" + String(index + 1) + "." + ext
                let bytes: Data
                if let url = item as? URL {
                    let access = url.startAccessingSecurityScopedResource(); defer { if access { url.stopAccessingSecurityScopedResource() } }
                    if let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize, size > 50_000_000 { throw MobileError.invalidData(MobileL10n.text("附件超过 50 MB，未导入。")) }
                    bytes = try Data(contentsOf: url)
                } else if let data = item as? Data { bytes = data }
                else if let image = item as? UIImage, let data = image.jpegData(compressionQuality: 0.82) { bytes = data }
                else { continue }
                guard bytes.count <= 50_000_000 else { throw MobileError.invalidData(MobileL10n.text("附件超过 50 MB，未导入。")) }
                let destination = root.appendingPathComponent(name)
                if FileManager.default.fileExists(atPath: destination.path) { guard try Data(contentsOf: destination) == bytes else { throw MobileError.conflict(destination) } }
                else { try bytes.write(to: destination, options: .withoutOverwriting) }; attachments.append(name)
            }
            guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !attachments.isEmpty else { throw MobileError.invalidData(MobileL10n.text("没有可保存的内容。")) }
            let payload = SharePayload(id: id, createdAt: MobileProtocol.timestamp(), text: text, attachments: attachments, folder: folder, kind: kind, note: note, knowledgeBaseId: manifest.id)
            try MobileProtocol.encoder().encode(payload).write(to: root.appendingPathComponent("payload.json"), options: .atomic)
            let local = group.appendingPathComponent("Spaces/\(directory)")
            let store = try SpaceStore(root: local, manifest: manifest, deviceId: "share-extension")
            try await ShareImportCoordinator.importPayload(payload, inbox: ShareInbox(root: group.appendingPathComponent("Inbox")), store: store, spaceID: manifest.id)
            if defaults?.bool(forKey: "widget.cloudLinked") == true, let container = await Task.detached(operation: { FileManager.default.url(forUbiquityContainerIdentifier: "iCloud.com.thewayhere.shared") }).value {
                let sync = FileSync(local: local, cloud: container.appendingPathComponent("Documents/Spaces/\(directory)"), ledger: group.appendingPathComponent("SyncLedgers/\(manifest.id).json"))
                _ = try await sync.synchronize(allowPhotos: defaults?.bool(forKey: "widget.allowPhotos") == true)
            }
            busy = false; saved = true
            if kind == "照片故事" {
                var parts = URLComponents(); parts.scheme = "thewayhere"; parts.host = "share-photo"; parts.queryItems = [URLQueryItem(name: "space", value: manifest.id), URLQueryItem(name: "target", value: id)]
                continueURL = parts.url; defaults?.set(parts.url?.absoluteString, forKey: "intent.pendingURL"); openPhoto()
            } else { complete() }
        } catch { self.error = error.localizedDescription; busy = false } }
    }
    private func openPhoto() { guard let continueURL else { return }; open(continueURL) { success in if success { complete() } } }
}
