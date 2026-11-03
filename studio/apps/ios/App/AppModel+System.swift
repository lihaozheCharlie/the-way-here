import SwiftUI
import TWHCore
import WidgetKit
import UIKit

struct SystemDestination: Identifiable, Equatable {
    var id: String { space + ":" + route + ":" + target }
    var route: String
    var space: String
    var target: String
    static func url(route: String, space: String, target: String) -> URL {
        var parts = URLComponents(); parts.scheme = "thewayhere"; parts.host = route
        parts.queryItems = [URLQueryItem(name: "space", value: space), URLQueryItem(name: "target", value: target)]
        return parts.url!
    }
}
extension AppModel {
    @discardableResult func handleSystemURL(_ url: URL) -> Bool {
        if LocalSystemPolicy.ignoresLegacyTaskURL(url) { return true }
        guard url.scheme == "thewayhere", let route = url.host, ["document", "letter", "prediction", "topic", "share-photo"].contains(route), let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return false }
        let values = components.queryItems ?? []
        guard let spaceID = values.first(where: { $0.name == "space" })?.value, MobileProtocol.validID(spaceID), let target = values.first(where: { $0.name == "target" })?.value, !target.isEmpty, target.count <= 1000 else { error = MobileL10n.text("这个入口缺少有效的空间或内容标识。"); return true }
        if locked || onboarding || active == nil { deferURL(url); return true }
        perform {
            try self.spaceRegistry.validateSelection(spaceID)
            if self.active?.id != spaceID {
                guard let space = self.spaces.first(where: { $0.id == spaceID }) else { throw MobileError.unavailable(MobileL10n.text("请先重新打开这份内容所属的空间。")) }
                try await self.activate(space)
            }
            try self.spaceRegistry.validateSelection(spaceID)
            guard self.active?.id == spaceID else { return }
            self.systemDestination = SystemDestination(route: route, space: spaceID, target: target)
        }
        return true
    }
    func systemUpdate(requests: [TaskRequest], receipts: [TaskReceipt], documents: [TWHCore.Document]) async {
        guard !acceptanceMode, let active else { return }
        let spaceID = active.id
        await LiveCapture.endLegacyTaskActivities()
        await RetiredTaskNotifications.removePending(space: spaceID, knownTaskIDs: Set(requests.map(\.id) + receipts.map(\.id)))
        guard self.active?.id == spaceID else { return }
        let defaults = UserDefaults.standard
        let shared = UserDefaults(suiteName: "group.com.thewayhere.shared")
        shared?.set(defaults.string(forKey: "language.interface") ?? "system", forKey: "language.interface")
        let presentation = systemPresentation(requests:requests,receipts:receipts,documents:documents,space:active)
        let widgetTitle:String
        switch presentation.widgetTitle {case .message(let key):widgetTitle=MobileL10n.text(key);case .authored(let title):widgetTitle=title}
        shared?.set(widgetTitle,forKey:"widget.title")
        shared?.set(presentation.widgetTopic,forKey:"widget.topic")
        shared?.set(presentation.topicID,forKey:"widget.topicId")
        shared?.set(presentation.space,forKey:"widget.spaceId")
        shared?.removeObject(forKey:"widget.pending")
        shared?.removeObject(forKey:"system.latestUnreadLetterURL")
        if let path=presentation.latestUnreadLetterPath {shared?.set(SystemDestination.url(route:"letter",space:spaceID,target:path).absoluteString,forKey:"system.latestUnreadLetterURL")}
        UIApplication.shared.shortcutItems = presentation.shortcuts.map { shortcut in
            UIApplicationShortcutItem(type:shortcut.target.map {SystemDestination.url(route:shortcut.action,space:spaceID,target:$0).absoluteString} ?? shortcut.action,localizedTitle:MobileL10n.text(shortcut.titleKey),localizedSubtitle:shortcut.subtitle,icon:UIApplicationShortcutIcon(systemImageName:shortcut.symbol))
        }
        WidgetCenter.shared.reloadAllTimelines()
    }
    func systemPresentation(requests:[TaskRequest],receipts:[TaskReceipt],documents:[TWHCore.Document],space:Space) -> SystemPresentation {
        let readPaths=Set(documents.filter {$0.category=="letters" && documentFlag("read",document:$0)}.map(\.path))
        return SystemPresentation.project(space:space.id,readOnly:space.manifest.readOnly,hidePreview:UserDefaults.standard.object(forKey:"privacy.hidePreview") as? Bool ?? true,documents:documents,topics:snapshot?.topics ?? [],readLetterPaths:readPaths)
    }

}

struct SystemDestinationView: View {
    @EnvironmentObject private var model: AppModel
    let destination: SystemDestination
    var body: some View { NavigationStack {
        Group {
            if destination.route == "verification", UXVerificationFixtures.enabled { UXVerificationScreen(screen: destination.target) }
            else if LocalSystemPolicy.legacyTaskRoutes.contains(destination.route) { EmptyMessage(title: "这个入口已停用", detail: "已保存的内容仍可在记录中查看。") }
            else if model.active?.id != destination.space { EmptyMessage(title: "这份内容属于另一个空间", detail: "重新打开所属空间后再试。") }
            else if destination.route == "share-photo", let photo = model.photos.first(where: { $0.id == destination.target && $0.step >= 0 }) { PhotoFlowView(initialDraft: photo) }
            else if destination.route == "prediction" { FutureView() }
            else if destination.route == "topic", let topic = model.snapshot?.topics.first(where: { $0.id == destination.target }) { TopicDetailView(topic: topic) }
            else if let document = model.documents.first(where: { $0.path == destination.target }) {
                if document.category == "letters" { MobileLetterReader(document: document) }
                else if document.category == "entities" { PersonView(document: document) }
                else { DocumentView(document: document) }
            } else { EmptyMessage(title: "内容尚未同步到这台 iPhone", detail: "来源不会丢失，请先同步后重试。") }
        }.navigationBarTitleDisplayMode(.inline).toolbar { Button("完成") { model.systemDestination = nil } }
    } }
}
