import SwiftUI

enum Theme {
    static let blue = Color(red: 10/255, green: 124/255, blue: 1)
    static let pale = Color(red: 234/255, green: 242/255, blue: 1)
    static let ink = Color(red: 15/255, green: 27/255, blue: 45/255)
    static let canvas = Color(red: 244/255, green: 247/255, blue: 251/255)
    static let orange = Color(red: 1, green: 122/255, blue: 69/255)
    static func serif(_ size: CGFloat) -> Font { .custom("Songti SC", size: size, relativeTo: .body) }
}
struct Paper<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View { VStack(alignment: .leading, spacing: 12) { content }.frame(maxWidth: .infinity, alignment: .leading).padding(16).background(.background, in: RoundedRectangle(cornerRadius: 16)) }
}
struct PrimaryButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.body.weight(.semibold)).multilineTextAlignment(.center).padding(.horizontal, 16).padding(.vertical, 12).frame(maxWidth: .infinity, minHeight: 48).foregroundStyle(.white).background(Theme.blue.opacity(configuration.isPressed ? 0.75 : 1), in: RoundedRectangle(cornerRadius: 14))
    }
}
struct EmptyMessage: View {
    var title: String; var detail: String; var symbol = "book.closed"
    var body: some View { ContentUnavailableView(LocalizedStringKey(title), systemImage: symbol, description: Text(LocalizedStringKey(detail))).padding(.vertical, 32) }
}
struct Screen<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View { ScrollView { VStack(alignment: .leading, spacing: 12) { content }.frame(maxWidth: .infinity, alignment: .leading).padding(16) }.scrollDismissesKeyboard(.interactively).background(Theme.canvas) }
}

/// Reserves space in the scroll container instead of covering the last rows.
struct BottomActionBar<Content: View>: View {
    var verticalPadding: CGFloat = 12
    @ViewBuilder var content: Content
    var body: some View {
        VStack(spacing: 12) { content }
            .frame(maxWidth: .infinity).padding(.horizontal, 16).padding(.vertical, verticalPadding)
            .background(.bar).overlay(alignment: .top) { Divider() }
    }
}

struct SecondaryButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.body.weight(.semibold)).multilineTextAlignment(.center)
            .padding(.horizontal, 16).padding(.vertical, 12).frame(maxWidth: .infinity, minHeight: 48)
            .foregroundStyle(Theme.blue).background(Theme.pale.opacity(configuration.isPressed ? 0.6 : 1), in: RoundedRectangle(cornerRadius: 14))
    }
}

/// A single control tree: measure complete labels before choosing a row or column.
struct AdaptiveActions<Content: View>: View {
    var equalWidths = false
    @ViewBuilder var content: Content
    var body: some View { FittingActionLayout(equalWidths: equalWidths) { content } }
}

private struct FittingActionLayout: Layout {
    var equalWidths: Bool
    private let horizontalGap: CGFloat = 12
    private let verticalGap: CGFloat = 8
    private struct Measurement { var size: CGSize; var horizontal: Bool; var widths: [CGFloat]; var heights: [CGFloat] }
    private func measure(width proposed: CGFloat?, subviews: Subviews) -> Measurement {
        guard !subviews.isEmpty else { return Measurement(size: .zero, horizontal: true, widths: [], heights: []) }
        let ideal = subviews.map { view -> CGFloat in
            let width = view.sizeThatFits(.unspecified).width
            return width.isFinite ? max(0, width) : 44
        }
        let gaps = horizontalGap * CGFloat(subviews.count - 1)
        let required = (equalWidths ? (ideal.max() ?? 0) * CGFloat(subviews.count) : ideal.reduce(0, +)) + gaps
        let width = proposed.flatMap { $0.isFinite ? max(0, $0) : nil } ?? required
        let horizontal = required <= width + 0.5
        let extra = max(0, width - gaps - ideal.reduce(0, +)) / CGFloat(subviews.count)
        let widths = horizontal ? ideal.map { equalWidths ? max(0, (width - gaps) / CGFloat(subviews.count)) : $0 + extra } : ideal.map { _ in width }
        let heights = zip(subviews, widths).map { view, width -> CGFloat in
            let height = view.sizeThatFits(ProposedViewSize(width: width, height: nil)).height
            return height.isFinite ? max(0, height) : 44
        }
        let height = horizontal ? heights.max() ?? 0 : heights.reduce(0, +) + verticalGap * CGFloat(subviews.count - 1)
        return Measurement(size: CGSize(width: width, height: height), horizontal: horizontal, widths: widths, heights: heights)
    }
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize { measure(width: proposal.width, subviews: subviews).size }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let value = measure(width: bounds.width, subviews: subviews)
        var x = bounds.minX, y = bounds.minY
        for index in subviews.indices {
            let height = value.horizontal ? value.size.height : value.heights[index]
            subviews[index].place(at: CGPoint(x: x, y: y), anchor: .topLeading, proposal: ProposedViewSize(width: value.widths[index], height: height))
            if value.horizontal { x += value.widths[index] + horizontalGap }
            else { y += height + verticalGap }
        }
    }
}
