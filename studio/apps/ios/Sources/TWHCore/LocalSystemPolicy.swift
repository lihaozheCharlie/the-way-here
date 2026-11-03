import Foundation

/// Compatibility boundary for system entry points left by previous versions.
public enum LocalSystemPolicy {
    public static let legacyTaskRoutes: Set<String> = ["tasks", "task", "retry"]
    public static func ignoresLegacyTaskURL(_ url: URL) -> Bool {
        url.scheme == "thewayhere" && legacyTaskRoutes.contains(url.host ?? "")
    }
    public static func notificationURL(rawURL: String?, localRoute: String?) -> URL? {
        if let rawURL, let url = URL(string: rawURL), url.scheme == "thewayhere", !ignoresLegacyTaskURL(url) { return url }
        guard let localRoute, ["record", "write", "photos"].contains(localRoute) else { return nil }
        return URL(string: "thewayhere://" + localRoute)
    }
    public static func ownsRetiredPendingNotification(category: String, space: String?, task: String?, expectedSpace: String, knownTaskIDs: Set<String>) -> Bool {
        ["TASK_DONE", "TASK_FAILED"].contains(category) && space == expectedSpace && task.map(knownTaskIDs.contains) == true
    }
}
