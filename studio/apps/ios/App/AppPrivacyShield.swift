import UIKit

/// A scene-level cover also protects sheets and nested system presentations.
/// It never becomes key, so returning to the app preserves editor focus.
@MainActor final class AppPrivacyShield: NSObject {
    static let shared = AppPrivacyShield()
    private var installed = false
    private var covers: [String: UIWindow] = [:]
    func install() {
        guard !installed else { return }; installed = true
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(deactivate(_:)), name: UIScene.willDeactivateNotification, object: nil)
        center.addObserver(self, selector: #selector(activate(_:)), name: UIScene.didActivateNotification, object: nil)
        center.addObserver(self, selector: #selector(activate(_:)), name: UIScene.didDisconnectNotification, object: nil)
    }
    @objc private func deactivate(_ notification: Notification) {
        guard UserDefaults.standard.object(forKey: "privacy.hidePreview") as? Bool ?? true,
              let scene = notification.object as? UIWindowScene else { return }
        let id = scene.session.persistentIdentifier
        guard covers[id] == nil else { return }
        let controller = UIViewController()
        controller.view.backgroundColor = .systemBackground
        controller.view.accessibilityElementsHidden = true
        let icon = UIImageView(image: UIImage(systemName: "lock.shield", withConfiguration: UIImage.SymbolConfiguration(pointSize: 40)))
        icon.tintColor = .systemBlue; icon.translatesAutoresizingMaskIntoConstraints = false
        controller.view.addSubview(icon)
        NSLayoutConstraint.activate([icon.centerXAnchor.constraint(equalTo: controller.view.centerXAnchor), icon.centerYAnchor.constraint(equalTo: controller.view.centerYAnchor)])
        let cover = UIWindow(windowScene: scene)
        cover.windowLevel = UIWindow.Level(rawValue: UIWindow.Level.alert.rawValue + 1)
        cover.rootViewController = controller; cover.isUserInteractionEnabled = false
        covers[id] = cover; cover.isHidden = false
    }
    @objc private func activate(_ notification: Notification) {
        guard let scene = notification.object as? UIWindowScene else { return }
        covers.removeValue(forKey: scene.session.persistentIdentifier)?.isHidden = true
    }
}
