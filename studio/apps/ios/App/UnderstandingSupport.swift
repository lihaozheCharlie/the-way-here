import SwiftUI
import UIKit
import TWHCore

struct UnderstandingProjection: Decodable {
    struct Ref: Decodable, Identifiable { var id: String; var path: String; var title: String; var date: String; var excerpt: String; var isSource: Bool }
    struct Section: Decodable { var heading: String; var body: String }
    struct Card: Decodable, Identifiable { var id: String; var title: String; var excerpt: String; var category: String; var path: String; var sections: [Section]; var evidence: [Ref]; var confidence: String?; var hitCount: Int?; var cycle: Cycle? }
    struct Cycle: Decodable { struct Step: Decodable, Identifiable { var id: String; var label: String; var body: String? }; var steps: [Step]; var occurrenceCount: Int?; var experiment: String? }
    struct Topic: Decodable, Identifiable { var id: String; var title: String; var question: String; var reason: String; var currentUnderstanding: String; var unknown: String; var evidence: [Ref] }
    struct Person: Decodable, Identifiable { var id: String; var path: String; var title: String; var group: String; var mentionCount: Int; var lastMention: String; var evidence: [Ref]; var events: [Ref] }
    struct Stage: Decodable, Identifiable { var id: String; var path: String; var title: String; var range: String; var focus: String; var lane: Int; var current: Bool; var people: [Ref]; var events: [Ref] }
    struct Letter: Decodable, Identifiable { var id: String; var path: String; var title: String; var date: String; var excerpt: String; var evidence: [Ref]; var voice: String?; var perspective: String?; var referenceCount: Int? }
    var version: Int; var knowledgeBaseId: String; var updatedAt: String; var sourceCount: Int; var coverageFrom: String
    struct Node: Decodable, Identifiable { var id: String; var path: String; var title: String; var date: String; var excerpt: String; var start: String; var end: String; var lane: String; var turning: Bool; var before: String?; var after: String?; var sections: [Section]; var evidence: [Ref]; var people: [Ref] }
    var nodes: [Node]?
    var cards: [Card]; var topics: [Topic]; var people: [Person]; var stages: [Stage]; var letters: [Letter]
    static func load(_ bound: BoundSpace?) async throws -> Self? {
        guard let bound else { return nil }
        do { let value = try JSONDecoder().decode(Self.self, from: await bound.store.read(".mobile/understanding.json")); guard value.knowledgeBaseId == bound.manifest.id, value.version == 1 else { throw MobileError.invalidData("理解快照不属于当前空间。") }; return value }
        catch let error as NSError where error.domain == NSCocoaErrorDomain && error.code == NSFileReadNoSuchFileError { return nil }
    }
}
struct ProjectedEvidenceView: View {
    @EnvironmentObject private var model: AppModel
    var refs: [UnderstandingProjection.Ref]
    var body: some View { ForEach(refs) { ref in
        if let doc = model.documents.first(where: { $0.path == ref.path }) { NavigationLink { DocumentView(document: doc) } label: { VStack(alignment: .leading, spacing: 4) { Text(ref.title).font(.body.weight(.medium)).fixedSize(horizontal: false, vertical: true); Text(ref.date.prefix(10)).font(.caption).foregroundStyle(.secondary); Text(ref.excerpt).font(.subheadline).foregroundStyle(.secondary).lineLimit(3) }.frame(maxWidth: .infinity, minHeight: 44, alignment: .leading).contentShape(Rectangle()) } }
        else { Label(MobileL10n.format("%@ · 记录已不在或尚未同步", [String(describing: ref.title)]), systemImage: "doc.badge.ellipsis").foregroundStyle(.secondary) }
    } }
}
struct QuestionVoiceView: View {
    @Environment(\.dismiss) private var dismiss
    var question: String; var onText: (String) -> Void
    @StateObject private var recorder = SpeechRecorder()
    var body: some View { NavigationStack {
        VStack(spacing: 12) {
            Text(MobileL10n.text(question)).font(.headline).fixedSize(horizontal: false, vertical: true)
            TextEditor(text: $recorder.transcript).font(Theme.serif(17))
            Text(MobileL10n.format("%@ 秒", [String(describing: recorder.seconds)])).font(.caption).monospacedDigit()
            if let error = recorder.error { Text(MobileL10n.text(error)).font(.footnote).foregroundStyle(.red).fixedSize(horizontal: false, vertical: true) }
        }.padding(16).safeAreaInset(edge: .bottom) { BottomActionBar { AdaptiveActions {
            Button(recorder.paused ? MobileL10n.text("继续") : MobileL10n.text("暂停")) { recorder.paused ? recorder.resume() : recorder.pause() }.buttonStyle(.bordered).frame(minHeight: 44)
            Button("使用这段文字") { recorder.stop(); onText(recorder.transcript); dismiss() }.buttonStyle(PrimaryButton()).disabled(recorder.transcript.isEmpty)
        } } }.navigationTitle("说一段").navigationBarTitleDisplayMode(.inline).toolbar { Button("取消") { recorder.stop(); dismiss() } }.task { await recorder.start() }.onDisappear { recorder.stop() }
    } }

}
/// Old links may still point at an already saved result. No task action is offered.
struct MobileTaskDetailView: View {
    @EnvironmentObject private var model: AppModel
    var task: TaskRequest
    private var receipt: TaskReceipt? { model.receipts.first { $0.id == task.id && $0.knowledgeBaseId == task.knowledgeBaseId } }
    var body: some View { Screen {
        if let receipt, receipt.status == .completed {
            if let result = receipt.result { Text(result).textSelection(.enabled) }
            ForEach(receipt.resultPaths ?? [],id:\.self) { path in if let document = model.documents.first(where:{$0.path == path}) { NavigationLink(document.title) { DocumentView(document:document) } } }
        } else { EmptyMessage(title:"没有已保存的结果",detail:"手机只记录原话和展示已有内容，不会提交后台处理。") }
    }.navigationTitle("已有结果").navigationBarTitleDisplayMode(.inline) }
}

/// A stable visual identity for a user/server-provided lane; no life classification.
enum LifeThreadStyle {
    static func color(_ lane: String, among lanes: [String] = []) -> Color {
        let palette: [Color] = [Theme.blue, Theme.orange, .purple, .teal, .pink, .indigo]
        let bucket = Array(Set(lanes)).sorted().firstIndex(of: lane) ?? (Int(MobileProtocol.hash(Data(lane.utf8)).prefix(2), radix: 16) ?? 0)
        return palette[bucket % palette.count]
    }
}
struct CycleExplanationView: View {
    @EnvironmentObject private var model: AppModel
    var cycle: UnderstandingProjection.Cycle
    var evidence: [UnderstandingProjection.Ref]
    var document: TWHCore.Document
    var body: some View { VStack(alignment: .leading, spacing: 18) {
        Text("循环如何发生").font(.headline)
        ForEach(cycle.steps) { step in HStack(alignment: .top, spacing: 12) { Image(systemName: "arrow.down.circle").foregroundStyle(Theme.blue); VStack(alignment: .leading, spacing: 8) { Text(MobileL10n.text(step.label)).font(.headline); Text(step.body ?? MobileL10n.text("这一环节尚无明确说明，可以补充或核对。")).font(Theme.serif(17)) } } }
        if let count = cycle.occurrenceCount { Text(MobileL10n.format("明确记录的次数：%@", [String(count)])) }
        else { Text("出现次数尚未确认，以下只列已有的记录与时间。").font(.caption).foregroundStyle(.secondary) }
        ProjectedEvidenceView(refs: evidence)
        if let experiment = cycle.experiment { Text("来自对话的小实验").font(.headline); Text(experiment).font(Theme.serif(17)); if model.phoneModelAvailable { NavigationLink("聊聊这个小实验") { ConversationView(title: document.title, context: experiment, evidence: document.bodyMarkdown) } } }
        else if model.phoneModelAvailable { NavigationLink("一起探索一个小实验") { ConversationView(title: document.title, context: "", evidence: document.bodyMarkdown) } }
    } }
}

/// Use the navigation controller's native hide-on-scroll behavior, preserving its back gesture.
struct ImmersiveReadingNavigation: UIViewControllerRepresentable {
    final class Controller: UIViewController {
        override func viewDidAppear(_ animated: Bool) { super.viewDidAppear(animated); navigationController?.hidesBarsOnSwipe = true }
        override func viewWillDisappear(_ animated: Bool) { navigationController?.hidesBarsOnSwipe = false; navigationController?.setNavigationBarHidden(false, animated: false); super.viewWillDisappear(animated) }
    }
    func makeUIViewController(context: Context) -> Controller { Controller() }
    func updateUIViewController(_ uiViewController: Controller, context: Context) {}
}

/// Uses explicit source classification only. Ordinary diary text is never treated as a prediction idea.
enum RecentIdeaSource {
    static func latest(in documents: [TWHCore.Document], sourcesPath: String) -> TWHCore.Document? {
        documents.filter { document in
            guard document.isSource, document.path.hasPrefix(sourcesPath + "/") else { return false }
            let components = document.path.dropFirst(sourcesPath.count + 1).split(separator: "/").dropLast()
            return document.category == "ideas" || document.category == "thoughts" || components.contains("想法")
        }.sorted { $0.modifiedAt > $1.modifiedAt }.first
    }
}
struct PredictionTimeScaleView: View {
    var prediction: PredictionSummary
    private let order = ["months0_3", "months3_12", "years1_3", "years3_5"]
    private let labels = ["months0_3": "0–3 个月", "months3_12": "3–12 个月", "years1_3": "1–3 年", "years3_5": "3–5 年"]
    private var periods: [String] { let actual = Set((prediction.report?.scenarios ?? []).flatMap { ($0.stages ?? []).map(\.period) }); return order.filter { actual.contains($0) } }
    var body: some View { VStack(alignment: .leading, spacing: 6) {
        Text("时间尺度").font(.headline)
        if periods.isEmpty { Text("暂无已保存的时间尺度说明"); Text("这里只展示已有情景，不会从了解度推算预测年限。").font(.caption).foregroundStyle(.secondary) }
        else { Text(MobileL10n.text("已有共享路径涵盖：") + periods.compactMap { labels[$0].map { MobileL10n.text($0) } }.joined(separator: " · ")); Text("这是共享模型给出的情景跨度，不代表已证实的未来。").font(.caption).foregroundStyle(.secondary) }
    }.accessibilityIdentifier("prediction.timeScale") }
}
