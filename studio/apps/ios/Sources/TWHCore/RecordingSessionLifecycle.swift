/// A recorder owns this value on its serial executor. Permission continuations
/// and recognition results must carry the token of the session that created them.
public struct RecordingSessionLifecycle {
    public typealias Token = UInt64
    private enum Phase { case stopped, starting, active }
    private var generation: Token = 0
    private var phase: Phase = .stopped
    public init() {}
    public var isStarting: Bool { phase == .starting }
    @discardableResult public mutating func beginStart() -> Token {
        generation &+= 1
        phase = .starting
        return generation
    }
    public func isCurrent(_ token: Token) -> Bool {
        token == generation && phase != .stopped
    }
    public func acceptsPendingStart(_ token: Token) -> Bool {
        token == generation && phase == .starting
    }
    @discardableResult public mutating func activate(_ token: Token) -> Bool {
        guard acceptsPendingStart(token) else { return false }
        phase = .active
        return true
    }
    public func acceptsResult(_ token: Token) -> Bool {
        token == generation && phase == .active
    }
    public mutating func stop() {
        generation &+= 1
        phase = .stopped
    }
}
