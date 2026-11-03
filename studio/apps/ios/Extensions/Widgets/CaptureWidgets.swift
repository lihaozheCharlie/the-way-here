import WidgetKit
import SwiftUI
import ActivityKit
import AppIntents

struct CaptureEntry: TimelineEntry {
    var date: Date
    var title: String
    var configured = false
    var topic: String? = nil
    var topicURL: URL? = nil
}
struct CaptureProvider: TimelineProvider {
    func placeholder(in context: Context) -> CaptureEntry { .init(date: Date(), title: "给此刻留一段话") }
    func getSnapshot(in context: Context, completion: @escaping (CaptureEntry) -> Void) { completion(entry()) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<CaptureEntry>) -> Void) { completion(Timeline(entries: [entry()], policy: .after(Date().addingTimeInterval(900)))) }
    private func entry() -> CaptureEntry {
        let defaults = UserDefaults(suiteName: "group.com.thewayhere.shared")
        let space = defaults?.string(forKey: "widget.spaceId")
        var topicURL: URL?
        if let space, let topic = defaults?.string(forKey: "widget.topicId") {
            var url = URLComponents(); url.scheme = "thewayhere"; url.host = "topic"; url.queryItems = [URLQueryItem(name: "space", value: space), URLQueryItem(name: "target", value: topic)]; topicURL = url.url
        }
        return .init(date: Date(), title: defaults?.string(forKey: "widget.title") ?? "给此刻留一段话", configured: space != nil, topic: defaults?.string(forKey: "widget.topic"), topicURL: topicURL)
    }
}
struct CaptureWidget: Widget {
    let kind = "com.thewayhere.capture"
    var body: some WidgetConfiguration { StaticConfiguration(kind: kind, provider: CaptureProvider()) { entry in CaptureWidgetView(entry: entry).environment(\.locale, Locale(identifier: UserDefaults(suiteName: "group.com.thewayhere.shared")?.string(forKey: "language.interface") ?? "system")).containerBackground(.fill.tertiary, for: .widget) }.configurationDisplayName("随时记一笔").description("说一段、写一段、找照片，也读读已有的内容。").supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular]) }
}
struct CaptureWidgetView: View {
    @Environment(\.widgetFamily) private var family
    var entry: CaptureEntry
    var body: some View {
        if !entry.configured {
            Link(destination: URL(string: "thewayhere://home")!) { if family == .accessoryCircular { Image(systemName: "mic") } else { Label("打开 App 开始", systemImage: "mic") } }
        } else if family == .accessoryCircular {
            Link(destination: URL(string: "thewayhere://record")!) { Image(systemName: "mic.fill").font(.title2) }.accessibilityLabel("说一段")
        } else if family == .accessoryRectangular {
            Link(destination: entry.topicURL ?? URL(string: "thewayhere://write")!) { VStack(alignment: .leading) { if let topic = entry.topic { Text(topic).font(.headline).lineLimit(2) } else { Text("给此刻留一段话").font(.headline); Text("写下一段自己的话").lineLimit(1) } } }
        } else {
            VStack(alignment: .leading, spacing: 12) {
                Text("此刻有什么，\n都可以说说").font(.headline)
                HStack { widgetLink("说一段", "mic.fill", "record"); if family == .systemMedium { widgetLink("找照片", "photo", "photos"); widgetLink("写一段", "square.and.pencil", "write") } }
                Text(entry.title).font(.caption).lineLimit(2)
            }.widgetURL(URL(string: "thewayhere://record"))
        }
    }
    private func widgetLink(_ label: String, _ icon: String, _ route: String) -> some View { Link(destination: URL(string: "thewayhere://\(route)")!) { Label(LocalizedStringKey(label), systemImage: icon).font(.caption).padding(8).background(.blue.opacity(0.12), in: RoundedRectangle(cornerRadius: 10)) } }
}
struct CaptureLiveActivity: Widget {
    private func recording(_ context: ActivityViewContext<CaptureActivity>) -> Bool { context.state.kind == "recording" }
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: CaptureActivity.self) { context in
            if recording(context) {
                VStack(alignment: .leading, spacing: 10) {
                    HStack { Image(systemName: "waveform"); VStack(alignment: .leading) { Text(context.state.title).font(.headline); Text(context.isStale ? "状态可能已更新，打开 App 查看" : context.state.stage).font(.caption) }; Spacer(); activityValue(context.state) }
                    if !context.state.complete { recordingControls(context.state) }
                    else { Link("查看", destination: URL(string: "thewayhere://record")!) }
                }.padding().widgetURL(URL(string: "thewayhere://record"))
            }
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) { if recording(context) { Label(context.state.title, systemImage: "waveform").font(.caption) } }
                DynamicIslandExpandedRegion(.trailing) { if recording(context) { activityValue(context.state) } }
                DynamicIslandExpandedRegion(.center) { if recording(context) { Text(context.state.stage).font(.caption).lineLimit(2) } }
                DynamicIslandExpandedRegion(.bottom) { if recording(context) { if !context.state.complete { recordingControls(context.state) } else { Link("查看", destination: URL(string: "thewayhere://record")!) } } }
            } compactLeading: { if recording(context) { Image(systemName: context.state.complete ? "checkmark.circle.fill" : context.state.paused == true ? "pause.fill" : "waveform") } }
            compactTrailing: { if recording(context) { activityValue(context.state).frame(maxWidth: 54) } }
            minimal: { if recording(context) { Image(systemName: context.state.complete ? "checkmark" : "mic.fill") } }
            .widgetURL(recording(context) ? URL(string: "thewayhere://record") : nil)
        }
    }
    @ViewBuilder private func activityValue(_ state: CaptureActivity.ContentState) -> some View {
        if state.complete { Image(systemName: "checkmark.circle.fill").foregroundStyle(.green) }
        else if state.paused == true { Text(String(format: "%02d:%02d", (state.elapsed ?? 0) / 60, (state.elapsed ?? 0) % 60)).monospacedDigit().font(.caption) }
        else { Text(state.startedAt, style: .timer).monospacedDigit().font(.caption) }
    }
    private func recordingControls(_ state: CaptureActivity.ContentState) -> some View {
        HStack { Button(intent: RecordingCommandIntent(state.paused == true ? .resume : .pause)) { Label(LocalizedStringKey(state.paused == true ? "继续" : "暂停"), systemImage: state.paused == true ? "play.fill" : "pause.fill") }; Spacer(); Button(intent: RecordingCommandIntent(.finish)) { Label("完成", systemImage: "stop.circle.fill") } }.buttonStyle(.bordered)
    }
}

@main struct CaptureWidgetBundle: WidgetBundle { var body: some Widget { CaptureWidget(); CaptureLiveActivity(); if #available(iOS 18.0, *) { CaptureControl() } } }
