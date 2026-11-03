import SwiftUI
import AppIntents
import ActivityKit
import WidgetKit
import TWHCore
import BackgroundTasks
import UIKit
import UserNotifications

@MainActor enum LiveCapture {
    static var activity: Activity<CaptureActivity>?
    static func begin() {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        if let old = activity { Task { await old.end(nil, dismissalPolicy: .immediate) } }
        do { activity = try Activity.request(attributes: CaptureActivity(route: "record"), content: ActivityContent(state: .init(title: MobileL10n.text("说一段"), stage: MobileL10n.text("本机识别中"), startedAt: Date(), complete: false, kind: "recording", elapsed: 0), staleDate: Date().addingTimeInterval(3600)), pushType: nil) } catch { }
    }
    static func update(seconds: Int, paused: Bool) {
        guard let activity else { return }
        let state = CaptureActivity.ContentState(title: MobileL10n.text("说一段"), stage: paused ? MobileL10n.text("已暂停 · 文字已保留") : MobileL10n.text("本机识别中"), startedAt: Date().addingTimeInterval(-Double(seconds)), complete: false, kind: "recording", paused: paused, elapsed: seconds)
        Task { await activity.update(ActivityContent(state: state, staleDate: Date().addingTimeInterval(3600))) }
    }
    static func end() {
        guard let activity else { return }; self.activity = nil
        var state = activity.content.state; state.complete = true; state.stage = MobileL10n.text("语音文字已保留")
        Task { await activity.end(ActivityContent(state: state, staleDate: Date().addingTimeInterval(20)), dismissalPolicy: .after(Date().addingTimeInterval(20))) }
    }
    static func endLegacyTaskActivities() async {
        for activity in Activity<CaptureActivity>.activities where activity.content.state.kind == "task" {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
    }
}
enum RetiredTaskNotifications {
    static func removePending(space: String, knownTaskIDs: Set<String>) async {
        guard !knownTaskIDs.isEmpty else { return }
        let center = UNUserNotificationCenter.current()
        let pending = await center.pendingNotificationRequests()
        let identifiers = pending.filter { request in
            LocalSystemPolicy.ownsRetiredPendingNotification(category: request.content.categoryIdentifier,
                space: request.content.userInfo["space"] as? String,
                task: request.content.userInfo["task"] as? String,
                expectedSpace: space, knownTaskIDs: knownTaskIDs)
        }.map(\.identifier)
        center.removePendingNotificationRequests(withIdentifiers: identifiers)
    }
}
final class NotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let info = response.notification.request.content.userInfo
        // Notifications from the retired Mac queue must never create work again.
        guard !["TASK_DONE", "TASK_FAILED"].contains(response.notification.request.content.categoryIdentifier),
              response.actionIdentifier != "RETRY", response.actionIdentifier != "LATER", response.actionIdentifier != "MUTE",
              let url = LocalSystemPolicy.notificationURL(rawURL: info["url"] as? String, localRoute: info["route"] as? String) else { return }
        UserDefaults.standard.set(url.absoluteString, forKey: "launch.url")
        await MainActor.run { NotificationCenter.default.post(name: .init("twh.deepLink"), object: url) }
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions { ["TASK_DONE", "TASK_FAILED"].contains(notification.request.content.categoryIdentifier) ? [] : [.banner, .list, .sound] }
}
@MainActor enum HomeShortcutDelivery {
    static func deliver(_ shortcut: UIApplicationShortcutItem) {
        let raw = shortcut.type.hasPrefix("thewayhere:") ? shortcut.type : "thewayhere://" + shortcut.type
        guard let url = URL(string: raw), !LocalSystemPolicy.ignoresLegacyTaskURL(url) else { return }
        // Scene connection can precede SwiftUI's subscribers and bootstrap.
        // Keep the normal launch intent until the bound space can receive it.
        if !CommandLine.arguments.contains("--uitest"), !CommandLine.arguments.contains("--icloud-acceptance") {
            UserDefaults.standard.set(raw, forKey: "launch.url")
        }
        NotificationCenter.default.post(name: .init("twh.deepLink"), object: url)
    }
}
final class HomeShortcutSceneDelegate: NSObject, UIWindowSceneDelegate {
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        if let shortcut = connectionOptions.shortcutItem { HomeShortcutDelivery.deliver(shortcut) }
    }
    func windowScene(_ windowScene: UIWindowScene, performActionFor shortcutItem: UIApplicationShortcutItem, completionHandler: @escaping (Bool) -> Void) {
        HomeShortcutDelivery.deliver(shortcutItem)
        completionHandler(true)
    }
}
final class AppDelegate: NSObject, UIApplicationDelegate {
    let notificationDelegate = NotificationDelegate()
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        AppPrivacyShield.shared.install()
        if let shortcut = launchOptions?[.shortcutItem] as? UIApplicationShortcutItem { HomeShortcutDelivery.deliver(shortcut) }
        UNUserNotificationCenter.current().setNotificationCategories([])
        if !CommandLine.arguments.contains("--uitest"), !CommandLine.arguments.contains("--icloud-acceptance") {
            Task { await LiveCapture.endLegacyTaskActivities() }
        }
        UNUserNotificationCenter.current().delegate = notificationDelegate
        BGTaskScheduler.shared.register(forTaskWithIdentifier: "com.thewayhere.mobile.refresh", using: nil) { task in
            guard !CommandLine.arguments.contains("--uitest"), !CommandLine.arguments.contains("--icloud-acceptance") else { task.setTaskCompleted(success: false); return }
            let work = Task { @MainActor in
                let model = AppModel(); await model.bootstrap(); await model.refresh(); task.setTaskCompleted(success: model.error == nil)
            }
            task.expirationHandler = { work.cancel() }
        }
        return true
    }
    func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(name: nil, sessionRole: connectingSceneSession.role)
        configuration.delegateClass = HomeShortcutSceneDelegate.self
        return configuration
    }
    func application(_ application: UIApplication, performActionFor shortcutItem: UIApplicationShortcutItem, completionHandler: @escaping (Bool) -> Void) {
        HomeShortcutDelivery.deliver(shortcutItem); completionHandler(true)
    }
}
