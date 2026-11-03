import SwiftUI

private struct ReadingPositionGeometry: Equatable {
    var paragraphs: [String: CGRect] = [:]
    var viewportHeight: CGFloat = 0
}

private struct ReadingPositionPreference: PreferenceKey {
    static let defaultValue = ReadingPositionGeometry()
    static func reduce(value: inout ReadingPositionGeometry, nextValue: () -> ReadingPositionGeometry) {
        let next = nextValue()
        value.paragraphs.merge(next.paragraphs, uniquingKeysWith: { _, latest in latest })
        value.viewportHeight = max(value.viewportHeight, next.viewportHeight)
    }
}

private struct ReadingParagraphGeometry: ViewModifier {
    let id: String
    let coordinateSpace: UUID
    func body(content: Content) -> some View {
        content.background {
            GeometryReader { proxy in
                Color.clear.preference(key: ReadingPositionPreference.self, value: ReadingPositionGeometry(paragraphs: [id: proxy.frame(in: .named(coordinateSpace))]))
            }.allowsHitTesting(false)
        }
    }
}

/// Reports the first visible paragraph without requesting a scroll or creating lazy-stack anchors.
/// Reader paragraphs use stable, non-lazy heights at accessibility text sizes.
private struct PassiveReadingPosition: ViewModifier {
    @Binding var position: String?
    let coordinateSpace: UUID
    let onLayoutReady: () -> String?
    @State private var notificationScheduled = false
    @State private var notificationDelivered = false
    @State private var restoringTarget: String?
    private func visible(_ frame: CGRect, in geometry: ReadingPositionGeometry) -> Bool {
        frame.maxY > 0 && frame.minY < geometry.viewportHeight
    }
    private func track(_ geometry: ReadingPositionGeometry) {
        if let target = restoringTarget {
            guard let frame = geometry.paragraphs[target], visible(frame, in: geometry) else { return }
            restoringTarget = nil
        }
        guard let first = geometry.paragraphs.filter({ visible($0.value, in: geometry) })
            .min(by: { $0.value.minY < $1.value.minY })?.key, position != first else { return }
        position = first
    }
    func body(content: Content) -> some View {
        content.coordinateSpace(name: coordinateSpace)
            .overlay {
                GeometryReader { proxy in
                    Color.clear.preference(key: ReadingPositionPreference.self, value: ReadingPositionGeometry(viewportHeight: proxy.size.height))
                }.allowsHitTesting(false)
            }
            .onPreferenceChange(ReadingPositionPreference.self) { geometry in
                guard geometry.viewportHeight > 0, !geometry.paragraphs.isEmpty else { return }
                if !notificationScheduled {
                    notificationScheduled = true
                    // ScrollViewReader's IDs and the viewport must exist before the one restore.
                    DispatchQueue.main.async {
                        restoringTarget = onLayoutReady()
                        notificationDelivered = true
                        track(geometry)
                    }
                    return
                }
                guard notificationDelivered else { return }
                // Initial paragraph zero cannot replace a saved target while restoration settles.
                track(geometry)
            }
    }
}

extension View {
    func readingParagraph(_ id: String, in coordinateSpace: UUID) -> some View {
        modifier(ReadingParagraphGeometry(id: id, coordinateSpace: coordinateSpace))
    }
    func trackReadingPosition(_ position: Binding<String?>, in coordinateSpace: UUID, onLayoutReady: @escaping () -> String?) -> some View {
        modifier(PassiveReadingPosition(position: position, coordinateSpace: coordinateSpace, onLayoutReady: onLayoutReady))
    }
}
