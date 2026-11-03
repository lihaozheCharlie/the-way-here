import Foundation

/// Pure presentation data shared by actual system publication and isolated UI
/// acceptance. This type never reads preferences, writes App Groups, or calls OS APIs.
public struct SystemPresentation: Sendable {
    public enum TextValue: Equatable, Sendable { case message(String), authored(String) }
    public struct Shortcut: Identifiable, Equatable, Sendable {
        public var id: String { action + ":" + (target ?? "") }
        public var action: String
        public var target: String?
        public var titleKey: String
        public var subtitle: String?
        public var symbol: String
    }
    public var space: String
    public var widgetTitle: TextValue
    public var widgetTopic: String?
    public var topicID: String?
    public var latestUnreadLetterPath: String?
    public var shortcuts: [Shortcut]
    public static func project(space:String,readOnly:Bool,hidePreview:Bool,documents:[Document],topics:[MobileSnapshot.Topic],readLetterPaths:Set<String>) -> Self {
        let newest = documents.sorted { $0.modifiedAt == $1.modifiedAt ? $0.path < $1.path : $0.modifiedAt > $1.modifiedAt }
        let title:TextValue = readOnly ? .message("先看匿名演示故事") : hidePreview ? .message("给此刻留一段话") : newest.first(where: \.isSource).map { .authored($0.title) } ?? .message("给此刻留一段话")
        let letter = newest.first { $0.category == "letters" && !readLetterPaths.contains($0.path) }
        var shortcuts = [Shortcut(action:"record",titleKey:"说一段",symbol:"mic"),Shortcut(action:"photos",titleKey:"找照片",symbol:"photo"),Shortcut(action:"write",titleKey:"写一段",symbol:"square.and.pencil")]
        if let letter { shortcuts.append(Shortcut(action:"letter",target:letter.path,titleKey:"最近一条未读回信",subtitle:hidePreview ? nil : letter.title,symbol:"envelope.badge")) }
        return Self(space:space,widgetTitle:title,widgetTopic:hidePreview ? nil : topics.first?.question,topicID:topics.first?.id,latestUnreadLetterPath:letter?.path,shortcuts:shortcuts)
    }
}
