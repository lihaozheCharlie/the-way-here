import XCTest
@testable import TWHCore

final class MobileL10nTests: XCTestCase {
    func testImmediateLanguageSwitchAndFormattingPreserveAuthoredText() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString).appendingPathComponent("LocalizationFixture.bundle")
        defer { try? FileManager.default.removeItem(at: root) }
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        try PropertyListSerialization.data(fromPropertyList: ["CFBundleIdentifier": "com.thewayhere.anonymous-localization", "CFBundleName": "LocalizationFixture"], format: .xml, options: 0).write(to: root.appendingPathComponent("Info.plist"))
        for language in ["en", "zh-Hans"] {
            let folder = root.appendingPathComponent(language + ".lproj"); try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let strings = language == "en" ? "\"完成\" = \"Done\";\n\"版本 %@ · 构建 %@\" = \"Version %@ · Build %@\";" : "\"完成\" = \"完成\";\n\"版本 %@ · 构建 %@\" = \"版本 %@ · 构建 %@\";"
            try Data(strings.utf8).write(to: folder.appendingPathComponent("Localizable.strings"))
        }
        let bundle = try XCTUnwrap(Bundle(path: root.path)); let defaults = UserDefaults.standard; let previous = defaults.object(forKey: "language.interface")
        defer { if let previous { defaults.set(previous, forKey: "language.interface") } else { defaults.removeObject(forKey: "language.interface") } }
        defaults.set("en", forKey: "language.interface")
        XCTAssertEqual(MobileL10n.text("完成", in: bundle), "Done")
        XCTAssertEqual(MobileL10n.format("版本 %@ · 构建 %@", ["1.0", "2"], in: bundle), "Version 1.0 · Build 2")
        let authored = "My original words 与我的原话"
        XCTAssertEqual(MobileL10n.text(authored, in: bundle), authored)
        defaults.set("zh-Hans", forKey: "language.interface")
        XCTAssertEqual(MobileL10n.text("完成", in: bundle), "完成")
        XCTAssertEqual(MobileL10n.format("版本 %@ · 构建 %@", ["1.0", "2"], in: bundle), "版本 1.0 · 构建 2")
    }
}
