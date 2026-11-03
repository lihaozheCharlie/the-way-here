/// Keeps a replacement route pending until the system confirms dismissal.
/// A route requested before presentation finishes waits for didAppear first.
public struct SheetPresentationQueue<Route: Equatable> {
    private enum Phase { case idle, presenting, visible, dismissing }
    private var phase: Phase = .idle
    private var requested: Route?
    public private(set) var displayed: Route?
    public init() {}
    public mutating func request(_ route: Route?) {
        requested = route
        switch phase {
        case .idle:
            if let route { displayed = route; phase = .presenting }
        case .visible:
            if route != displayed { displayed = nil; phase = .dismissing }
        case .presenting, .dismissing: break
        }
    }
    public mutating func didAppear() {
        guard phase == .presenting else { return }
        phase = .visible
        request(requested)
    }
    /// Returns true only for an interactive dismissal, not a pending replacement.
    @discardableResult public mutating func dismissByUser() -> Bool {
        guard phase == .visible || phase == .presenting else { return false }
        requested = nil; displayed = nil; phase = .dismissing
        return true
    }
    public mutating func didDismiss() {
        displayed = nil; phase = .idle
        request(requested)
    }
}
