import SwiftUI
import TWHCore

enum ModelFixtureMode { static let supported: Set<String> = ["success", "failure", "failure-401", "failure-403", "failure-429", "failure-503", "missing-key"] }

/// Provider failures carry a stable category independent of the interface language.
enum ModelServiceFailure: Error, LocalizedError {
    case notConfigured, invalidKey, rateLimited, providerUnavailable(Int?)
    var errorDescription: String? {
        switch self {
        case .notConfigured: return MobileL10n.text("尚未配置手机模型，请设置 API Key。")
        case .invalidKey: return MobileL10n.text("模型 Key 无效或没有权限，请重新设置。")
        case .rateLimited: return MobileL10n.text("模型额度或请求频率受限，请稍后重试。")
        case .providerUnavailable(let status): return status.map { MobileL10n.format("模型服务暂时不可用（%@），原文已保留。", [String($0)]) } ?? MobileL10n.text("模型服务暂时不可用，原文已保留。")
        }
    }
    var identifier: String {
        switch self { case .notConfigured: return "not-configured"; case .invalidKey: return "invalid-key"; case .rateLimited: return "rate-limited"; case .providerUnavailable: return "provider-unavailable" }
    }
    var title: String {
        switch self { case .notConfigured: return "还没有配置手机模型"; case .invalidKey: return "模型 Key 无效或没有权限"; case .rateLimited: return "模型额度或请求频率受限"; case .providerUnavailable: return "模型厂商暂时不可用" }
    }
}
struct ModelFailureRecoveryCard: View {
    let failure: ModelServiceFailure
    var body: some View { VStack(alignment: .leading, spacing: 12) {
        Label(LocalizedStringKey(failure.title), systemImage: "exclamationmark.triangle").foregroundStyle(Theme.orange)
        Text(failure.localizedDescription).font(.footnote)
        Text("原始草稿仍保留在原空间。修改模型设置后可以重试。").font(.footnote).foregroundStyle(.secondary)
        NavigationLink("设置模型") { ModelSettingsView() }.accessibilityIdentifier("model-failure-settings")
    }.accessibilityElement(children: .contain).accessibilityIdentifier("model-failure-" + failure.identifier) }
}
