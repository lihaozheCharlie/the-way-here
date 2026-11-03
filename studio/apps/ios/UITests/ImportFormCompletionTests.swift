import XCTest

final class ImportFormCompletionTests: XCTestCase {
    override func setUp() { super.setUp(); continueAfterFailure = false }
    private func launch(_ name: String) -> XCUIApplication {
        let run = UUID().uuidString.lowercased(), app = XCUIApplication()
        app.launchArguments = ["--uitest", "-onboarding.complete", "YES", "-privacy.lock", "NO", "-notifications.tasks", "NO", "-language.interface", "zh-Hans", "-AppleLanguages", "(zh-Hans)", "-AppleLocale", "zh_CN"]
        app.launchEnvironment = ["TWH_UI_IMPORT_RUN": run, "TWH_UI_TEST_FIXTURE": "import-form-" + run, "TWH_UI_TEST_SCENARIO": "import-form-" + name, "TWH_UI_TEST_SCREEN": "import-form-" + name]
        app.launch(); return app
    }
    private func reveal(_ target: XCUIElement, app: XCUIApplication, file: StaticString = #filePath, line: UInt = #line) {
        for _ in 0..<8 where !target.exists || !target.isHittable { app.swipeUp() }
        for _ in 0..<12 where !target.exists || !target.isHittable { app.swipeDown() }
        XCTAssertTrue(target.exists, file: file, line: line); XCTAssertTrue(target.isHittable, file: file, line: line)
    }
    private func screenshot(_ name: String, app: XCUIApplication) { let image = XCTAttachment(screenshot: app.screenshot()); image.name = name; image.lifetime = .keepAlways; add(image) }
    private func proof(_ app: XCUIApplication) {
        let verify = app.buttons["local-import-verify"]; reveal(verify, app: app); verify.tap()
        let proof = app.staticTexts["local-import-proof"]; XCTAssertTrue(proof.waitForExistence(timeout: 15))
        XCTAssertFalse(app.staticTexts["local-import-proof-error"].exists)
        let checks = (try? JSONSerialization.jsonObject(with: Data((proof.value as? String ?? "").utf8))) as? [String: Bool] ?? [:]
        XCTAssertFalse(checks.isEmpty)
        for key in checks.keys.sorted() { XCTAssertEqual(checks[key], true, key) }
        XCTAssertEqual(checks["no-background-task-created"], true)
    }
    private func saveAndRestart(_ name: String, body: String) {
        let app = launch(name)
        let target = app.textFields["import-target"]; XCTAssertTrue(target.waitForExistence(timeout: 25)); reveal(target, app: app)
        let previous = target.value as? String ?? ""
        target.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)).tap()
        target.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: previous.count) + "Anonymous " + name + " Target\n")
        XCTAssertEqual(target.value as? String, "Anonymous " + name + " Target")
        let save = app.buttons["import-submit"]; reveal(save, app: app); save.tap()
        XCTAssertTrue(app.navigationBars["导入完成"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "local-import-saved").firstMatch.exists)
        let open = app.buttons["local-import-open"]; XCTAssertTrue(open.waitForExistence(timeout: 10)); open.tap()
        XCTAssertTrue(app.navigationBars["阅读"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", body)).firstMatch.exists)
        XCTAssertFalse(app.buttons["提交构建 · 由 Mac 收进理解"].exists)
        app.navigationBars["阅读"].buttons["导入完成"].tap()
        app.navigationBars["导入完成"].buttons["导入资料"].tap()
        proof(app); screenshot("local-import-" + name + "-exact-files-no-task", app: app)
        app.terminate(); app.launchEnvironment["TWH_UI_TEST_SCREEN"] = "REC-1"; app.launch()
        XCTAssertTrue(app.navigationBars["生活记录"].waitForExistence(timeout: 25))
        let note = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", body)).firstMatch
        reveal(note, app: app); note.tap()
        XCTAssertTrue(app.navigationBars["阅读"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", body)).firstMatch.exists)
        screenshot("local-import-" + name + "-readable-after-restart", app: app)
    }
    func testMarkdownSavesExactOriginalAndReopensAfterRestartWithoutTask() { saveAndRestart("md", body: "ANONYMOUS_LOCAL_MARKDOWN_BODY") }
    func testTextPreservesOriginalAndCreatesReadableMarkdownWithoutTask() { saveAndRestart("text", body: "ANONYMOUS_LOCAL_TEXT_BODY") }
    func testTextPDFPreservesOriginalAndCreatesReadableMarkdownWithoutTask() { saveAndRestart("pdf-text", body: "AnonymousPdfReadableFixture") }
    private func rejected(_ name: String, message: String) {
        let app = launch(name)
        let alert = app.alerts.firstMatch
        XCTAssertTrue(alert.waitForExistence(timeout: 30)); XCTAssertTrue(alert.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", message)).firstMatch.exists)
        alert.buttons["知道了"].tap(); XCTAssertFalse(app.buttons["import-submit"].exists)
        proof(app); screenshot("local-import-" + name + "-rejected-no-files-no-task", app: app)
    }
    func testScannedPDFRejectedBeforeAnyFileOrTaskIsSaved() { rejected("pdf-scan", message: "PDF 中没有可提取文字") }
    func testUnsupportedJSONRejectedBeforeAnyFileOrTaskIsSaved() { rejected("unsupported", message: "手机支持导入 Markdown") }
    func testOver50MBRejectedBeforeAnyFileOrTaskIsSaved() { rejected("oversized", message: "文件超过 50 MB") }
    func testImportFormOffersOnlyPhoneExecutableActions() {
        let app = launch("md"); XCTAssertTrue(app.buttons["import-submit"].waitForExistence(timeout: 25))
        for id in ["import-owner", "import-period", "import-excluded-merchants", "import-exclude-groups"] { XCTAssertFalse(app.descendants(matching: .any).matching(identifier: id).firstMatch.exists) }
        for text in ["聊天记录", "账单", "提交构建", "查看处理进度", "确认，交给 Mac"] { XCTAssertFalse(app.buttons[text].exists) }
        screenshot("local-import-phone-only-form", app: app)
    }
}
