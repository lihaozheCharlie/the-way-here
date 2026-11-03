import SwiftUI
import Photos
import TWHCore

struct PhotoAccessSnapshot: Equatable {
    var status: PHAuthorizationStatus
    var allowedImages: Int?
}
@MainActor final class PhotoAccessStatus: NSObject, ObservableObject, PHPhotoLibraryChangeObserver {
    @Published private(set) var snapshot = PhotoAccessSnapshot(status: .notDetermined, allowedImages: nil)
    private var observing = false
    func start() { refresh(); guard !observing, !UXVerificationFixtures.enabled && !CommandLine.arguments.contains("--icloud-acceptance") else { return }; PHPhotoLibrary.shared().register(self); observing = true }
    func stop() { if observing { PHPhotoLibrary.shared().unregisterChangeObserver(self); observing = false } }
    func refresh() {
        // Test surfaces never enumerate a simulator/device photo library.
        if UXVerificationFixtures.enabled || CommandLine.arguments.contains("--icloud-acceptance") { snapshot = PhotoAccessSnapshot(status: .notDetermined, allowedImages: nil); return }
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        snapshot = PhotoAccessSnapshot(status: status, allowedImages: status == .limited ? PHAsset.fetchAssets(with: .image, options: nil).count : nil)
    }
    nonisolated func photoLibraryDidChange(_ changeInstance: PHChange) { Task { @MainActor [weak self] in self?.refresh() } }
    func manage() {
        guard !UXVerificationFixtures.enabled && !CommandLine.arguments.contains("--icloud-acceptance"), snapshot.status == .limited, let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first, var controller = scene.windows.first(where: \.isKeyWindow)?.rootViewController else { return }
        while let presented = controller.presentedViewController { controller = presented }
        PHPhotoLibrary.shared().presentLimitedLibraryPicker(from: controller) { [weak self] _ in Task { @MainActor in self?.refresh() } }
    }
}
/// A shared permission banner; it only counts images inside the granted scope.
struct PhotoAccessNotice: View {
    @StateObject private var access = PhotoAccessStatus()
    @Environment(\.scenePhase) private var scenePhase
    var snapshot: PhotoAccessSnapshot? = nil
    var manageFixture: (() -> Void)? = nil
    private var value: PhotoAccessSnapshot { snapshot ?? access.snapshot }
    var body: some View { Group {
        if value.status == .limited {
            VStack(alignment: .leading, spacing: 8) {
                Label(MobileL10n.format("你只允许了 %@ 张照片。", [String(value.allowedImages ?? 0)]), systemImage: "photo.badge.checkmark").accessibilityIdentifier("photo-limited-count")
                Text("系统选择器仍可使用；新增授权后会自动更新。这里只统计你已允许访问的照片。").font(.footnote).foregroundStyle(.secondary)
                Button("管理可访问的照片") { if let manageFixture { manageFixture() } else { access.manage() } }.accessibilityIdentifier("photo-manage-limited")
            }.accessibilityElement(children: .contain).accessibilityIdentifier("STA-5-limited")
        } else if value.status == .denied || value.status == .restricted {
            VStack(alignment: .leading, spacing: 8) {
                Label("照片访问未允许；你仍可用系统选择器单次选择。", systemImage: "exclamationmark.triangle")
                Button("打开系统设置") { guard snapshot == nil, !UXVerificationFixtures.enabled && !CommandLine.arguments.contains("--icloud-acceptance"), let url = URL(string: UIApplication.openSettingsURLString) else { return }; UIApplication.shared.open(url) }.accessibilityIdentifier("photo-open-settings")
            }.accessibilityElement(children: .contain).accessibilityIdentifier("STA-5-denied")
        }
    }.task { if snapshot == nil { access.start() } }.onDisappear { access.stop() }.onChange(of: scenePhase) { _, phase in if phase == .active && snapshot == nil { access.refresh() } } }
}
