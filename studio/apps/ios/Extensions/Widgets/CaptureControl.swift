import WidgetKit
import SwiftUI
import AppIntents

@available(iOS 18.0, *)
struct CaptureControl: ControlWidget {
    var body: some ControlWidgetConfiguration { StaticControlConfiguration(kind: "com.thewayhere.capture.control") { ControlWidgetButton(action: OpenCaptureIntent(.speak)) { Label("说一段", systemImage: "mic") } }.displayName("说一段").description("打开 The Way Here，给此刻留一段自己的话。") }
}
