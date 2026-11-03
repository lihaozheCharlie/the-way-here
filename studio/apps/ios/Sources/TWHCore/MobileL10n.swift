import Foundation

/// UI strings only. User-authored sources and model responses must remain verbatim.
public enum MobileL10n {
    public static var language: String {
        let shared = UserDefaults(suiteName: "group.com.thewayhere.shared")
        let choice = UserDefaults.standard.string(forKey: "language.interface") ?? shared?.string(forKey: "language.interface") ?? "system"
        let language = choice == "system" ? Locale.preferredLanguages.first ?? "en" : choice
        return language.hasPrefix("zh") ? "zh-Hans" : "en"
    }
    public static func text(_ key: String, in resources: Bundle = .main) -> String {
        guard let path = resources.path(forResource: language, ofType: "lproj"), let bundle = Bundle(path: path) else { return key }
        return bundle.localizedString(forKey: key, value: key, table: nil)
    }
    public static func format(_ key: String, _ values: [String], in resources: Bundle = .main) -> String {
        String(format: text(key, in: resources), locale: Locale(identifier: language), arguments: values.map { $0 as CVarArg })
    }
}
