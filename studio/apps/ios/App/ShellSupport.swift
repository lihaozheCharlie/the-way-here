import SwiftUI
import TWHCore
import LocalAuthentication
import UIKit
import UserNotifications

/// The lock surface never displays cached record titles, previews, or space names.
struct AppLockGate: View {
    @EnvironmentObject private var model: AppModel
    @State private var verifying = false
    @State private var failures = 0
    @State private var failure = ""
    @State private var attempted = false
    private var biometricName: String {
        let context = LAContext()
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil) else { return MobileL10n.text("使用设备密码") }
        return context.biometryType == .faceID ? MobileL10n.text("使用 Face ID") : context.biometryType == .touchID ? MobileL10n.text("使用 Touch ID") : MobileL10n.text("验证身份")
    }
    var body: some View { VStack(spacing: 24) {
        Spacer()
        Image(systemName: "lock.shield.fill").font(.system(size: 64)).foregroundStyle(Theme.blue).accessibilityHidden(true)
        Text("The Way Here 已锁定").font(Theme.serif(26))
        Text("验证后才会打开你的私人记录。").font(.subheadline).foregroundStyle(.secondary)
        if verifying { ProgressView("正在验证身份…") }
        else { Button(failures >= 3 ? MobileL10n.text("使用设备密码继续") : biometricName) { authenticate() }.buttonStyle(PrimaryButton()).accessibilityIdentifier("unlock-records") }
        if !failure.isEmpty { Text(MobileL10n.text(failure)).font(.footnote).foregroundStyle(.red).multilineTextAlignment(.center) }
        if failures >= 3 { Text("连续验证失败。请在系统验证窗口选择设备密码；若仍无法验证，请检查设备密码设置后重试。").font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center) }
        Spacer()
    }.padding(28).frame(maxWidth: .infinity, maxHeight: .infinity).background(.regularMaterial).accessibilityIdentifier("STA-8")
    .task { guard !attempted else { return }; attempted = true; authenticate() } }
    private func authenticate() {
        guard !verifying, model.locked else { return }; verifying = true; failure = ""; model.error = nil
        Task { await model.unlock(); verifying = false
            if model.locked { failures += 1; failure = model.error ?? MobileL10n.text("验证未完成，请重试。"); model.error = nil }
        }
    }
}

enum CaptureQuickAction: String, CaseIterable, Identifiable {
    case speak, write, photos, importFile
    var id: String { rawValue }
    var title: String { switch self { case .speak: return "说一段"; case .write: return "写一段"; case .photos: return "找照片"; case .importFile: return "导入资料" } }
    var symbol: String { switch self { case .speak: return "mic.fill"; case .write: return "square.and.pencil"; case .photos: return "photo"; case .importFile: return "square.and.arrow.down" } }
}
struct CaptureActionFrames: PreferenceKey {
    static var defaultValue: [CaptureQuickAction: CGRect] = [:]
    static func reduce(value: inout [CaptureQuickAction: CGRect], nextValue: () -> [CaptureQuickAction: CGRect]) { value.merge(nextValue()) { _, new in new } }
}

/// UIKit's long-press recognizer cancels the button tap, so a slide selection
/// cannot accidentally trigger the microphone a second time when released.
struct CaptureTriggerButton: UIViewRepresentable {
    var disabled: Bool
    var tap: () -> Void
    var begin: () -> Void
    var hover: (CGPoint) -> Void
    var end: (CGPoint?) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeUIView(context: Context) -> UIButton {
        let button = UIButton(type: .system)
        button.backgroundColor = UIColor(Theme.blue); button.tintColor = .white; button.layer.cornerRadius = 28
        button.setImage(UIImage(systemName: "mic.fill", withConfiguration: UIImage.SymbolConfiguration(pointSize: 24, weight: .semibold)), for: .normal)
        button.addTarget(context.coordinator, action: #selector(Coordinator.tapped), for: .touchUpInside)
        let press = UILongPressGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.pressed(_:)))
        press.minimumPressDuration = 0.35; press.allowableMovement = 30; press.cancelsTouchesInView = true
        button.addGestureRecognizer(press)
        button.accessibilityIdentifier = "central-capture-button"
        return button
    }
    func updateUIView(_ button: UIButton, context: Context) {
        context.coordinator.parent = self; button.isEnabled = !disabled; button.alpha = disabled ? 0.45 : 1
        button.accessibilityLabel = MobileL10n.text("说一段")
        button.accessibilityHint = MobileL10n.text(disabled ? "正在录音，采集菜单暂不可用" : "点按录音，长按选择采集方式")
        button.accessibilityCustomActions = [UIAccessibilityCustomAction(name: MobileL10n.text("选择采集方式"), target: context.coordinator, selector: #selector(Coordinator.showMenu))]
    }
    final class Coordinator: NSObject {
        var parent: CaptureTriggerButton
        init(_ parent: CaptureTriggerButton) { self.parent = parent }
        @objc func tapped() { guard !parent.disabled else { return }; parent.tap() }
        @objc func showMenu() -> Bool { guard !parent.disabled else { return false }; parent.begin(); return true }
        @objc func pressed(_ gesture: UILongPressGestureRecognizer) {
            guard !parent.disabled else { return }
            let point = gesture.location(in: nil)
            switch gesture.state {
            case .began: UIImpactFeedbackGenerator(style: .soft).impactOccurred(); parent.begin()
            case .changed: parent.hover(point)
            case .ended: parent.end(point)
            case .cancelled, .failed: parent.end(nil)
            default: break
            }
        }
    }
}
struct CaptureQuickMenu: View {
    var selected: CaptureQuickAction?
    var choose: (CaptureQuickAction) -> Void
    var close: () -> Void
    var body: some View { ZStack(alignment: .bottom) {
        Color.black.opacity(0.22).ignoresSafeArea().contentShape(Rectangle()).onTapGesture(perform: close).accessibilityLabel("关闭采集菜单").accessibilityAddTraits(.isButton)
        VStack(spacing: 18) {
            HStack(alignment: .top, spacing: 28) { ForEach([CaptureQuickAction.speak, .write, .photos]) { action in
                Button { choose(action) } label: { VStack(spacing: 10) {
                    Image(systemName: action.symbol).font(.title2).foregroundStyle(selected == action ? .white : Theme.blue).frame(width: 62, height: 62).background(selected == action ? Theme.blue : Color(uiColor: .systemBackground), in: Circle())
                    Text(LocalizedStringKey(action.title)).font(.subheadline.weight(.medium)).foregroundStyle(.primary)
                }.frame(minWidth: 72, minHeight: 98) }.buttonStyle(.plain).background(actionFrame(action))
            } }
            Button("导入资料", systemImage: "square.and.arrow.down") { choose(.importFile) }.font(.subheadline).frame(minWidth: 160, minHeight: 44).background(.regularMaterial, in: Capsule()).overlay { Capsule().stroke(selected == .importFile ? Theme.blue : .clear, lineWidth: 2) }.background(actionFrame(.importFile))
            Text("滑到选项上松开，或点按选择").font(.caption).foregroundStyle(.secondary)
        }.padding(20).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 24)).padding(.horizontal, 18).padding(.bottom, 92)
    }.accessibilityElement(children: .contain).accessibilityIdentifier("NOW-7") }
    private func actionFrame(_ action: CaptureQuickAction) -> some View { GeometryReader { geometry in Color.clear.preference(key: CaptureActionFrames.self, value: [action: geometry.frame(in: .global)]) } }
}

@MainActor func phoneSyncStatus(_ model: AppModel) -> LocalizedStringKey {
    if !model.online { return "离线 · 内容保留在本机" }
    if model.latestSyncReport?.cloudQuotaExceeded == true { return "iCloud 空间不足 · 原文仍在本机" }
    if model.active?.cloud == nil { return "仅保存在这台 iPhone" }
    if model.syncing { return "正在同步 iCloud 文件" }
    if let report = model.latestSyncReport {
        if report.conflicts > 0 { return "同步冲突副本已保留" }
        if !report.pendingFiles.isEmpty || report.pendingPhotos > 0 || report.pendingCloudUploads > 0 { return "有文件等待 iCloud 上传" }
    }
    return "文件已交给 iCloud · 上传由系统继续"
}

struct ShellSyncSummary: View {
    @EnvironmentObject private var model: AppModel
    var compact = false
    @State private var details = false
    private var color: Color { model.latestSyncReport?.cloudQuotaExceeded == true ? .red : !model.online ? Theme.orange : .secondary }
    var body: some View { Button { details = true } label: { VStack(alignment: .leading, spacing: 5) {
        HStack(spacing: 7) {
            Image(systemName: model.latestSyncReport?.cloudQuotaExceeded == true ? "icloud.slash" : model.online ? "icloud" : "wifi.slash")
            Text(phoneSyncStatus(model))
            Spacer(minLength: 8)
            if model.syncing { ProgressView().controlSize(.small) } else { Image(systemName: "chevron.right").font(.caption2) }
        }
        if !compact, model.syncing, let report = model.latestSyncReport, report.totalDocuments > 0 { ProgressView(value: Double(report.availableDocuments), total: Double(max(1,report.totalDocuments))); Text(MobileL10n.format("已下载 %@ / %@ 份", [String(report.availableDocuments),String(report.totalDocuments)])) }
    }.font(.caption).foregroundStyle(color).padding(.vertical, 5).frame(minHeight: 36) }.buttonStyle(.plain).accessibilityLabel("查看 iCloud 同步状态")
    .sheet(isPresented: $details) { NavigationStack { ShellSyncDetails().environmentObject(model).toolbar { Button("完成") { details = false } } } } }
}
struct ShellSyncDetails: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    var body: some View { List {
        Section("同步状态") { Text(phoneSyncStatus(model)); if !model.online { Text("离线时仍可记录与阅读，搜索只使用本机已有内容。").font(.footnote) }; if model.active?.cloud == nil { Text("这个空间的内容保留在本机，可在同步设置中连接已有 iCloud 云盘。").font(.footnote) } }
        if model.latestSyncReport?.cloudQuotaExceeded == true { Section("iCloud 空间不足") { Text("照片等附件等待上传，文字与原文件仍在本机。请在系统设置 → Apple 账号 → iCloud 管理存储。"); Button("打开应用系统设置") { if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) } }; Button("先只记录文字") { beginWriting() }; Text("iOS 未提供可保证直达 iCloud 容量页的公开链接；请按上述路径管理。").font(.caption) } }
        if model.syncing { Section("首次同步") { if let report = model.latestSyncReport, report.totalDocuments > 0 { ProgressView(value: Double(report.availableDocuments), total: Double(report.totalDocuments)); Text(MobileL10n.format("已下载 %@ / %@ 份", [String(report.availableDocuments), String(report.totalDocuments)])) }; Button("先去记一笔") { beginWriting() }; Text("同步会继续进行，图片在阅读时按需加载。").font(.footnote) } }
        LongPendingSyncNotice()
        NavigationLink("同步设置与待上传文件") { SyncSettingsView() }
        Button("立即重新检查") { Task { await model.refresh() } }.disabled(model.syncing)
    }.navigationTitle("iCloud 同步").accessibilityIdentifier("STA-2") }
    private func beginWriting() { let space = model.active?.id; dismiss(); Task { try? await Task.sleep(for: .milliseconds(300)); guard model.active?.id == space else { return }; model.presented = .writing } }
}

@MainActor func presentShellFeedback(model: AppModel) {
    // Present from the current sheet's host, preserving its draft and navigation stack.
    Task { try? await Task.sleep(for: .milliseconds(300)); guard !model.locked,
        let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first,
        var controller = scene.windows.first(where: \.isKeyWindow)?.rootViewController else { return }
        while let presented = controller.presentedViewController { controller = presented }
        guard !controller.isBeingDismissed else { return }
        controller.present(UIHostingController(rootView: NavigationStack { FeedbackView() }.environmentObject(model)), animated: true)
    }
}

struct ShellErrorDescription {
    let message: String
    var title: String {
        let value = message.lowercased()
        if ["network", "offline", "网络", "联网", "连接", "icloud"].contains(where: value.contains) { return "暂时没有连接成功" }
        if ["decode", "parse", "utf-8", "解析", "格式", "编码"].contains(where: value.contains) { return "这份内容暂时无法读取" }
        if ["permission", "denied", "授权", "权限", "只读", "钥匙串"].contains(where: value.contains) { return "需要检查访问权限" }
        return "这一步没有完成"
    }
    func detail(failures: Int) -> String {
        var value = MobileL10n.text(message) + "\n\n" + MobileL10n.text("已有记录不会因这次错误被清空。请保留当前输入，并在原页面重试。");
        if failures >= 3 { value += "\n\n" + MobileL10n.text("已经连续失败 3 次。请查看同步状态；若仍无法恢复，请重启 App 或反馈问题。") }
        return value
    }
}

struct LongPendingSyncNotice: View {
    @EnvironmentObject private var model: AppModel
    @State private var backup: URL?
    @State private var exporting = false
    private var overdue: Bool {
        guard let id = model.active?.id, let raw = UserDefaults.standard.string(forKey: "sync.pendingSince." + id), let date = MobileProtocol.date(raw) else { return false }
        return Date().timeIntervalSince(date) >= 14 * 86400
    }
    var body: some View { Group { if overdue {
        VStack(alignment: .leading, spacing: 10) {
            Label("有内容等待同步已超过 14 天", systemImage: "exclamationmark.triangle").foregroundStyle(Theme.orange)
            Text("请先导出本机空间备份，再在系统设置 → Apple 账号 → iCloud 检查存储与同步。原文件与草稿仍保留在本机。").font(.footnote)
            Button { guard !exporting, let bound = model.boundSpace else { return }; exporting = true; model.perform { defer { exporting = false }; let archive = try await bound.store.exportArchive(); if model.active?.id == bound.manifest.id { backup = archive } } } label: { if exporting { ProgressView("正在准备备份…") } else { Text("准备导出本机备份") } }
            if let backup { ShareLink(item: backup) { Label("分享空间备份", systemImage: "square.and.arrow.up") } }
            Text("备份含私人内容，请确认接收方。iOS 不向 App 提供完整 iCloud 容量信息。").font(.caption).foregroundStyle(.secondary)
        }.accessibilityIdentifier("STA-3-long-pending")
    } }.onChange(of: model.active?.id) { _, _ in backup = nil } }
}

/// Present recovery on the visible sheet so dismissing an alert never discards its form.
struct ShellErrorAlert: ViewModifier {
    @EnvironmentObject private var model: AppModel
    @State private var failures = 0
    func body(content: Content) -> some View {
        content.onChange(of: model.error) { _, value in if value != nil { failures += 1 } }
            .alert(MobileL10n.text(ShellErrorDescription(message: model.error ?? "").title), isPresented: Binding(get: { model.error != nil && !model.locked }, set: { if !$0 { model.error = nil } })) {
                Button("重新检查同步") { model.error = nil; Task { await model.refresh(); if model.error == nil { failures = 0 } } }
                Button("反馈问题") { model.error = nil; presentShellFeedback(model: model) }
                Button("知道了", role: .cancel) { model.error = nil }
            } message: { Text(ShellErrorDescription(message: model.error ?? "").detail(failures: failures)) }
    }
}
