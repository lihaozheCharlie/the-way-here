import XCTest

final class DeepFlowAcceptanceTests: XCTestCase {
    override func setUp() { super.setUp(); continueAfterFailure = false }
    private let keep = "KEEP QUOTATION: In this entirely fictional conversation I learned to pause before making a decision, write down the specific question, and leave enough time to consider a different possibility without rushing to an answer."
    private let exclude = "EXCLUDE QUOTATION: This entirely fictional sentence is deliberately long enough to wrap across several lines, so the regression must reach its actual switch and turn it off rather than accidentally touching a neighbouring choice."
    private func launch(_ flow: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--uitest", "-onboarding.complete", "YES", "-privacy.lock", "NO", "-language.interface", "zh-Hans", "-AppleLanguages", "(zh-Hans)", "-AppleLocale", "zh_CN"]
        app.launchEnvironment = ["TWH_UI_TEST_FIXTURE": "deep-flow-" + UUID().uuidString.lowercased(), "TWH_UI_TEST_SCENARIO": "deep-flow-" + flow, "TWH_UI_TEST_SCREEN": "deep-flow-" + flow]
        app.launch(); return app
    }
    private func button(_ text: String, _ app: XCUIApplication) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label == %@ OR label CONTAINS %@", text, text)).firstMatch
    }
    /// Geometry comes from the currently presented screen, not an underlying tab or a stale AX match.
    private func bounds(_ app: XCUIApplication, navigation: String, footer: XCUIElement? = nil) -> CGRect {
        let window = app.frame.insetBy(dx: 3, dy: 3)
        let bar = app.navigationBars[navigation]
        XCTAssertTrue(bar.exists, "The actual foreground navigation bar must be present")
        let top = max(window.minY, bar.frame.maxY + 2)
        var bottom = window.maxY
        if app.keyboards.firstMatch.exists { bottom = min(bottom, app.keyboards.firstMatch.frame.minY - 3) }
        if let footer, footer.exists { bottom = min(bottom, footer.frame.minY - 6) }
        let tabs = app.buttons["central-capture-button"]
        if tabs.exists && tabs.isHittable && tabs.frame.minY > top { bottom = min(bottom, tabs.frame.minY - 6) }
        return CGRect(x: window.minX, y: top, width: window.width, height: max(0, bottom - top))
    }
    private func reveal(_ target: XCUIElement, app: XCUIApplication, navigation: String, footer: XCUIElement? = nil, file: StaticString = #filePath, line: UInt = #line) {
        for direction in [true, false] {
            for _ in 0..<12 {
                let visible = bounds(app, navigation: navigation, footer: footer)
                if target.exists && target.isHittable && !target.frame.isEmpty && visible.contains(target.frame) { return }
                // Drag solely inside the foreground content, never through the fixed actions or keyboard.
                guard visible.height > 80 else { XCTFail("No foreground content area", file: file, line: line); return }
                let start = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: visible.midX, dy: visible.minY + visible.height * (direction ? 0.78 : 0.25)))
                let end = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: visible.midX, dy: visible.minY + visible.height * (direction ? 0.25 : 0.78)))
                start.press(forDuration: 0.05, thenDragTo: end)
            }
        }
        XCTFail("Complete foreground control is not visible: \(target.debugDescription)", file: file, line: line)
    }
    private func tap(_ target: XCUIElement, app: XCUIApplication, navigation: String, footer: XCUIElement? = nil, file: StaticString = #filePath, line: UInt = #line) {
        reveal(target, app: app, navigation: navigation, footer: footer, file: file, line: line)
        XCTAssertTrue(target.isEnabled && bounds(app, navigation: navigation, footer: footer).contains(target.frame), file: file, line: line)
        target.tap()
    }
    private func set(_ target: XCUIElement, to value: Bool, app: XCUIApplication, footer: XCUIElement) {
        reveal(target, app: app, navigation: "结束对话与小结", footer: footer)
        let expected = value ? "1" : "0"
        if target.value as? String != expected { target.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap() }
        let changed = expectation(for: NSPredicate(format: "value == %@", expected), evaluatedWith: target)
        wait(for: [changed], timeout: 5)
    }
    private func proof(_ app: XCUIApplication, _ names: [String]) {
        app.terminate(); app.launchEnvironment["TWH_UI_TEST_SCREEN"] = "deep-flow-proof"; app.launch()
        for name in names + ["deep.reloaded-real-files", "deep.no-tasks"] { XCTAssertTrue(app.staticTexts[name].waitForExistence(timeout: 20), name) }
        let attachment = XCTAttachment(screenshot: app.screenshot()); attachment.name = "Persisted deep flow proof"; attachment.lifetime = .keepAlways; add(attachment)
    }
    func testConflictParagraphMergeFullTextEditSavesWithKeyboardAndSurvivesRestartWithoutTasks() {
        let app = launch("conflict")
        XCTAssertTrue(app.navigationBars["同步冲突"].waitForExistence(timeout: 20))
        tap(button("逐段合并", app), app: app, navigation: "同步冲突")
        tap(button("REMOTE SECOND paragraph to retain.", app), app: app, navigation: "同步冲突")
        tap(button("LOCAL THIRD paragraph to retain.", app), app: app, navigation: "同步冲突")
        tap(button("核对合并全文", app), app: app, navigation: "同步冲突")
        let editor = app.textViews.firstMatch
        XCTAssertTrue(editor.waitForExistence(timeout: 10))
        XCTAssertEqual(editor.value as? String, "# Anonymous deep conflict\n\nREMOTE SECOND paragraph to retain.\n\nLOCAL THIRD paragraph to retain.")
        // Type into the real native editor. Capture its entire resulting text for byte-exact disk verification.
        tap(editor, app: app, navigation: "同步冲突"); editor.typeText(" EDITED IN FOREGROUND")
        let actual = editor.value as? String ?? ""
        XCTAssertTrue(actual.contains("EDITED IN FOREGROUND")); XCTAssertTrue(actual.contains("REMOTE SECOND paragraph to retain.")); XCTAssertTrue(actual.contains("LOCAL THIRD paragraph to retain."))
        XCTAssertFalse(actual.contains("LOCAL SECOND")); XCTAssertFalse(actual.contains("REMOTE THIRD"))
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
        let save = button("保存核对后的合并内容", app)
        reveal(save, app: app, navigation: "同步冲突")
        XCTAssertTrue(app.keyboards.firstMatch.exists, "Saving must work with the keyboard still displayed")
        XCTAssertTrue(bounds(app, navigation: "同步冲突").contains(save.frame), "The complete Save button must be above the keyboard")
        let conflictScreen = app.navigationBars["同步冲突"]
        XCTAssertTrue(conflictScreen.exists, "The foreground conflict screen must still own the Save action")
        save.tap()
        let resolved = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: conflictScreen); wait(for: [resolved], timeout: 15)
        app.launchEnvironment["TWH_UI_DEEP_EXPECTED_TEXT"] = actual
        proof(app, ["deep.conflict-exact-edited-bytes", "deep.conflict-copy-resolved"])
    }
    func testFinishConversationKeepsOnlySelectedLongQuoteWithTranscriptDisabledAfterRestart() {
        let app = launch("quotes")
        XCTAssertTrue(app.navigationBars["Anonymous selected quotations"].waitForExistence(timeout: 20))
        let more = app.navigationBars["Anonymous selected quotations"].buttons["更多"]
        XCTAssertTrue(more.exists && more.isEnabled && more.isHittable)
        XCTAssertTrue(app.navigationBars["Anonymous selected quotations"].frame.contains(more.frame)); more.tap()
        let finish = app.buttons["结束并保存"]
        XCTAssertTrue(finish.waitForExistence(timeout: 5)); XCTAssertTrue(app.frame.insetBy(dx: 3, dy: 3).contains(finish.frame)); finish.tap()
        XCTAssertTrue(app.navigationBars["结束对话与小结"].waitForExistence(timeout: 10))
        let done = app.buttons["conversation-finish-save"]
        let excluded = app.switches.matching(NSPredicate(format: "label == %@", exclude)).firstMatch
        let retained = app.switches.matching(NSPredicate(format: "label == %@", keep)).firstMatch
        let full = app.switches["保存对话全文"]
        // Exercise both values, rather than allowing an unselected default to stand in for exclusion.
        set(excluded, to: true, app: app, footer: done)
        set(excluded, to: false, app: app, footer: done)
        set(retained, to: true, app: app, footer: done)
        set(full, to: false, app: app, footer: done)
        // Revisit the long rows after scrolling and prove their final independent states.
        reveal(excluded, app: app, navigation: "结束对话与小结", footer: done); XCTAssertEqual(excluded.value as? String, "0")
        reveal(retained, app: app, navigation: "结束对话与小结", footer: done); XCTAssertEqual(retained.value as? String, "1")
        XCTAssertTrue(done.isEnabled && bounds(app, navigation: "结束对话与小结").contains(done.frame)); done.tap()
        let dismissed = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: app.navigationBars["结束对话与小结"]); wait(for: [dismissed], timeout: 15)
        proof(app, ["deep.only-selected-quote-exact"])
    }
}
