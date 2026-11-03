import ActivityKit
import Foundation

struct CaptureActivity: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var title: String
        var stage: String
        var startedAt: Date
        var complete: Bool
        var kind: String? = nil
        var progress: Double? = nil
        var paused: Bool? = nil
        var elapsed: Int? = nil
    }
    var route: String
}
