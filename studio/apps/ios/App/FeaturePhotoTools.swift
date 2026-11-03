import SwiftUI
import TWHCore
import Vision
import Photos

struct PhotoFaceCandidate: Identifiable {
    var id: String { face.id }
    var photoID: String
    var face: FaceAnnotation
    var crop: UIImage
}

enum LocalFaceComparison {
    static func crop(_ image: UIImage, face: FaceAnnotation) -> UIImage? {
        guard let cg = image.cgImage else { return nil }
        let bounds = CGRect(x: face.x * Double(cg.width), y: face.y * Double(cg.height), width: face.width * Double(cg.width), height: face.height * Double(cg.height)).intersection(CGRect(x: 0, y: 0, width: cg.width, height: cg.height))
        guard !bounds.isEmpty, let cropped = cg.cropping(to: bounds) else { return nil }
        return UIImage(cgImage: cropped)
    }
    static func fingerprint(_ image: UIImage) throws -> VNFeaturePrintObservation? {
        guard let cg = image.cgImage else { return nil }
        let request=VNGenerateImageFeaturePrintRequest()
        do {try VNImageRequestHandler(cgImage:cg).perform([request]);return request.results?.first as? VNFeaturePrintObservation}
        catch {
            let fallback=VNGenerateImageFeaturePrintRequest();fallback.usesCPUOnly=true
            try VNImageRequestHandler(cgImage:cg).perform([fallback])
            return fallback.results?.first as? VNFeaturePrintObservation
        }
    }
    static func similar(_ source: UIImage, to target: UIImage) -> Bool {
        guard let first = try? fingerprint(source), let second = try? fingerprint(target) else { return false }
        var distance: Float = .infinity
        do { try first.computeDistance(&distance, to: second); return distance < 0.75 } catch { return false }
    }
}

struct PhotoCandidatesView: View {
    let name: String
    let candidates: [PhotoFaceCandidate]
    var onConfirm: (Set<String>) -> Void
    @Environment(\.dismiss) private var dismiss
    // A newly presented sheet starts with every supplied candidate selected.
    // Resolve that default from current inputs: sheet appearance can precede
    // delivery of candidates. An explicit empty set still means deselect all.
    @State private var selected: Set<String>?
    private var selectedIDs: Set<String> { selected ?? Set(candidates.map(\.id)) }
    var body: some View {
        NavigationStack { List {
            Section { Text(MobileL10n.format("在其他照片里发现可能是“%@”的人。请逐个确认，本机相似度不会自动决定身份。", [String(describing: name)])) }
            ForEach(candidates) { candidate in Button { var updated = selectedIDs; if updated.contains(candidate.id) { updated.remove(candidate.id) } else { updated.insert(candidate.id) }; selected = updated } label: { HStack { Image(uiImage: candidate.crop).resizable().scaledToFill().frame(width: 72, height: 72).clipped(); Text(name); Spacer(); Image(systemName: selectedIDs.contains(candidate.id) ? "checkmark.circle.fill" : "circle") } }.accessibilityLabel(MobileL10n.format("候选人脸，%@", [MobileL10n.text(selectedIDs.contains(candidate.id) ? "已选" : "未选")])) }
        }.safeAreaInset(edge: .bottom, spacing: 0) {
            BottomActionBar { AdaptiveActions {
                Button("都不是") { onConfirm([]); dismiss() }.buttonStyle(.bordered).frame(minHeight: 44)
                Button("确认合并") { onConfirm(selectedIDs); dismiss() }.buttonStyle(PrimaryButton())
            } }
        }.navigationTitle("同一个人？").navigationBarTitleDisplayMode(.inline).toolbar { ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } } } }.presentationDetents([.large]).accessibilityIdentifier("PHO-6")
    }
}

struct ManualFaceSelectionView: View {
    let image: UIImage
    let existing: [FaceAnnotation]
    var onConfirm: (FaceAnnotation, String?) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var rect: CGRect?
    @State private var undo: [CGRect] = []
    @State private var points: [CGPoint] = []
    @State private var mode = "方框"
    @State private var finger: CGPoint?
    @State private var zoom: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var panOrigin: CGSize = .zero
    @State private var small = false
    @State private var overlap: FaceAnnotation?
    @State private var showOverlap = false
    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Text("按住并拖动，圈出一张脸").font(.headline)
                Picker("圈选模式", selection: $mode) { Text("方框").tag("方框"); Text("手绘圈（套索）").tag("套索") }.pickerStyle(.segmented).padding(.horizontal)
                GeometryReader { geometry in
                    let width = min(geometry.size.width, geometry.size.height * image.size.width / image.size.height)
                    let size = CGSize(width: width, height: width * image.size.height / image.size.width)
                    ZStack(alignment: .topLeading) {
                        Image(uiImage: image).resizable().frame(width: size.width, height: size.height)
                        if let rect { Rectangle().stroke(small ? .red : Theme.orange, style: StrokeStyle(lineWidth: 2, dash: [5])).frame(width: rect.width * size.width, height: rect.height * size.height).offset(x: rect.minX * size.width, y: rect.minY * size.height).allowsHitTesting(false) }
                        Color.clear.contentShape(Rectangle()).gesture(LongPressGesture(minimumDuration: 0.3).sequenced(before: DragGesture(minimumDistance: 0)).onChanged { phase in
                            guard case .second(true, let drag?) = phase else { return }
                            finger = drag.location
                            if points.isEmpty { if let rect { undo.append(rect) }; points = [drag.startLocation] }
                            if mode == "套索" { points.append(drag.location) }
                            let all = mode == "套索" ? points : [drag.startLocation, drag.location]
                            let xs = all.map(\.x), ys = all.map(\.y)
                            let box = CGRect(x: xs.min() ?? 0, y: ys.min() ?? 0, width: (xs.max() ?? 0) - (xs.min() ?? 0), height: (ys.max() ?? 0) - (ys.min() ?? 0))
                            small = box.width < 24 || box.height < 24
                            rect = normalized(box, size: size)
                        }.onEnded { _ in finger = nil; points = [] })
                        if let rect { ForEach(0..<4) { corner in handle(corner, rect: rect, size: size) } }
                        if let finger { Image(uiImage: image).resizable().frame(width: size.width * 3, height: size.height * 3).offset(x: 54 - finger.x * 3, y: 54 - finger.y * 3).frame(width: 108, height: 108, alignment: .topLeading).clipped().overlay(Circle().stroke(Theme.blue, lineWidth: 2)).clipShape(Circle()).offset(x: min(size.width - 110, max(0, finger.x - 54)), y: max(0, finger.y - 130)).allowsHitTesting(false) }
                    }.coordinateSpace(name: "manual-photo").frame(width: size.width, height: size.height).scaleEffect(zoom).offset(offset).simultaneousGesture(MagnificationGesture().onChanged { zoom = min(4, max(1, $0)) })
                        .background(PhotoTwoFingerPan { translation, began in
                            if began { panOrigin = offset; points = []; finger = nil }
                            if zoom > 1 { offset = CGSize(width:panOrigin.width + translation.width,height:panOrigin.height + translation.height) }
                        }).frame(maxWidth: .infinity, maxHeight: .infinity)
                }.clipped()
                if small { Text("再大一点（至少 24 像素）").foregroundStyle(.red) }
            }.safeAreaInset(edge: .bottom, spacing: 0) { BottomActionBar { AdaptiveActions {
                Button("撤销") { rect = undo.popLast() }.frame(minHeight: 44).disabled(undo.isEmpty)
                Button("重画") { if let rect { undo.append(rect) }; rect = nil; zoom = 1; offset = .zero }.frame(minHeight: 44)
                Button("确认") { confirm() }.buttonStyle(PrimaryButton()).disabled(rect == nil || small)
            } } }.navigationTitle("手动圈选").navigationBarTitleDisplayMode(.inline).toolbar { ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } } }
                .confirmationDialog("已有这个人，合并还是替换？", isPresented: $showOverlap) { Button("合并已有标注") { if let overlap { onConfirm(overlap, overlap.id); dismiss() } }; Button("替换人脸框") { finish(replacing: overlap?.id) }; Button("保留两个框") { finish(replacing: nil) } }
        }.accessibilityIdentifier("PHO-5")
    }
    private func normalized(_ box: CGRect, size: CGSize) -> CGRect { CGRect(x: max(0, min(1, box.minX / size.width)), y: max(0, min(1, box.minY / size.height)), width: min(1, box.width / size.width), height: min(1, box.height / size.height)) }
    private func handle(_ corner: Int, rect: CGRect, size: CGSize) -> some View {
        let point = CGPoint(x: corner % 2 == 0 ? rect.minX : rect.maxX, y: corner < 2 ? rect.minY : rect.maxY)
        return Circle().fill(Theme.orange).frame(width: 16, height: 16).frame(width: 44, height: 44).contentShape(Rectangle()).position(x: point.x * size.width, y: point.y * size.height).gesture(DragGesture(coordinateSpace: .named("manual-photo")).onChanged { drag in
            let fixed = CGPoint(x: corner % 2 == 0 ? rect.maxX : rect.minX, y: corner < 2 ? rect.maxY : rect.minY)
            let moved = CGPoint(x: max(0, min(1, drag.location.x / size.width)), y: max(0, min(1, drag.location.y / size.height)))
            self.rect = CGRect(x: min(fixed.x, moved.x), y: min(fixed.y, moved.y), width: abs(fixed.x - moved.x), height: abs(fixed.y - moved.y)); small = abs(fixed.x - moved.x) * size.width < 24 || abs(fixed.y - moved.y) * size.height < 24
        }).accessibilityLabel(MobileL10n.format("调整圈选框第 %@ 个角", [String(describing: corner + 1)]))
    }
    private func confirm() { guard let rect else { return }; overlap = existing.first { face in let old = CGRect(x: face.x, y: face.y, width: face.width, height: face.height); let intersection = old.intersection(rect); return !intersection.isNull && intersection.width * intersection.height / min(old.width * old.height, rect.width * rect.height) > 0.6 }; if overlap != nil { showOverlap = true } else { finish(replacing: nil) } }
    private func finish(replacing: String?) { guard let rect else { return }; onConfirm(FaceAnnotation(x: rect.minX, y: rect.minY, width: rect.width, height: rect.height), replacing); dismiss() }
}

/// UIKit supplies an actual two-touch pan on iOS 17; a one-finger drag remains
/// dedicated to drawing or moving a face handle.
private struct PhotoTwoFingerPan: UIViewRepresentable {
    var onPan: (CGSize,Bool) -> Void
    func makeUIView(context:Context) -> PanAttachmentView { let view = PanAttachmentView(); view.onPan = onPan; return view }
    func updateUIView(_ view:PanAttachmentView,context:Context) { view.onPan = onPan }
    static func dismantleUIView(_ view:PanAttachmentView,coordinator:()) { view.detach() }
    final class PanAttachmentView: UIView {
        var onPan: ((CGSize,Bool) -> Void)?
        private var attached: UIView?
        private lazy var pan: UIPanGestureRecognizer = { let value = UIPanGestureRecognizer(target:self,action:#selector(moved)); value.minimumNumberOfTouches = 2; value.maximumNumberOfTouches = 2; value.cancelsTouchesInView = true; return value }()
        override func didMoveToSuperview() { super.didMoveToSuperview(); detach(); if let superview { attached = superview; superview.addGestureRecognizer(pan) } }
        func detach() { attached?.removeGestureRecognizer(pan); attached = nil }
        @objc private func moved() { let value = pan.translation(in:attached); onPan?(CGSize(width:value.x,height:value.y),pan.state == .began) }
    }
}
