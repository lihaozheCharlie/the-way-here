import SwiftUI
import UIKit

/// One native editor owns text selection; programmatic recognition updates do
/// not invoke the manual-edit callback or reset the user's caret.
struct CaptureNativeEditor: UIViewRepresentable {
    @Binding var text: String
    var label: String
    var uncertainWords: [String] = []
    var initialFocus = false
    var onSelection: ((NSRange) -> Void)? = nil
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeUIView(context: Context) -> UITextView {
        let view = UITextView(); view.delegate = context.coordinator
        view.font = UIFont(name:"Songti SC",size:18).map { UIFontMetrics(forTextStyle: .body).scaledFont(for: $0) } ?? .preferredFont(forTextStyle:.body)
        view.textContainerInset = UIEdgeInsets(top: 8, left: 4, bottom: 12, right: 4)
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        view.adjustsFontForContentSizeCategory = true; view.backgroundColor = .clear
        view.accessibilityLabel = label
        if initialFocus { DispatchQueue.main.async { view.becomeFirstResponder(); view.selectedRange = NSRange(location:(view.text as NSString).length,length:0) } }
        return view
    }
    func updateUIView(_ view: UITextView, context: Context) {
        let coordinator = context.coordinator
        coordinator.parent = self
        coordinator.isApplyingUpdate = true
        defer { coordinator.isApplyingUpdate = false }
        let old = view.selectedRange, oldLength = (view.text as NSString).length
        if view.text != text { view.text = text; view.selectedRange = old.location == oldLength ? NSRange(location:(text as NSString).length,length:0) : NSRange(location:min(old.location,(text as NSString).length),length:0) }
        let full = NSRange(location:0,length:(text as NSString).length)
        view.textStorage.removeAttribute(.underlineStyle,range:full)
        for word in uncertainWords where !word.isEmpty {
            var search = full
            while search.length > 0 {
                let range = (text as NSString).range(of:word,options:[],range:search)
                if range.location == NSNotFound { break }
                view.textStorage.addAttribute(.underlineStyle,value:NSUnderlineStyle.single.rawValue | NSUnderlineStyle.patternDot.rawValue,range:range)
                search = NSRange(location:NSMaxRange(range),length:full.length-NSMaxRange(range))
            }
        }
    }
    final class Coordinator: NSObject, UITextViewDelegate {
        var parent: CaptureNativeEditor
        var isApplyingUpdate = false
        private var lastReportedSelection: NSRange?
        init(_ parent: CaptureNativeEditor) { self.parent = parent }
        func textViewDidChange(_ view: UITextView) {
            guard !isApplyingUpdate, parent.text != view.text else { return }
            parent.text = view.text
        }
        func textViewDidChangeSelection(_ view: UITextView) {
            guard !isApplyingUpdate, lastReportedSelection != view.selectedRange else { return }
            lastReportedSelection = view.selectedRange
            parent.onSelection?(view.selectedRange)
        }
    }
}
