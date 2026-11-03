import XCTest
import UIKit

/// Uses existing anonymous fixtures, real foreground controls and system-screen captures.
final class SystemEdgeLayoutAcceptanceTests: XCTestCase {
    override func setUp() { super.setUp(); continueAfterFailure = false; XCUIDevice.shared.orientation = .portrait }
    override func tearDown() { XCUIDevice.shared.orientation = .portrait; super.tearDown() }

    private func launch(screen: String, scenario: String = "understanding", accessibility3: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--uitest", "-onboarding.complete", "YES", "-privacy.lock", "NO", "-language.interface", "zh-Hans", "-AppleLanguages", "(zh-Hans)", "-AppleLocale", "zh_CN", "-model.direct", "YES", "-notifications.tasks", "NO"]
        if accessibility3 { app.launchArguments += ["-UIPreferredContentSizeCategoryName", UIContentSizeCategory.accessibilityExtraLarge.rawValue] }
        app.launchEnvironment = ["TWH_UI_TEST_FIXTURE": "edge-layout-" + UUID().uuidString.lowercased(), "TWH_UI_TEST_SCENARIO": scenario, "TWH_UI_TEST_SCREEN": screen, "TWH_UI_MODEL_FIXTURE": "success", "TWH_UI_SPEECH_FIXTURE": "transcript"]
        app.launch(); return app
    }
    private func button(_ label: String, _ app: XCUIApplication) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label == %@", label)).firstMatch
    }
    private func keyboardBounds(_ app: XCUIApplication) -> CGRect? {
        let keyboard = app.keyboards.firstMatch
        guard keyboard.exists && keyboard.isHittable else { return nil }
        let raw = keyboard.frame, viewport = app.frame
        // iOS reports this specific landscape keyboard in portrait screen coordinates.
        // Normalize only when the raw axes match the observed rotated-screen signature.
        if viewport.width > viewport.height,
           abs(raw.height - viewport.width) <= 2,
           raw.width > 0, raw.width < viewport.height,
           abs(raw.minX) <= 2, abs(raw.minY) <= 2 {
            return CGRect(x: viewport.minX, y: viewport.maxY - raw.width, width: viewport.width, height: raw.width)
        }
        return raw
    }
    private func visible(_ control: XCUIElement, _ app: XCUIApplication, navigation: XCUIElement? = nil, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertTrue(control.waitForExistence(timeout: 20), file: file, line: line)
        XCTAssertTrue(control.isEnabled, file: file, line: line)
        XCTAssertTrue(control.isHittable, file: file, line: line)
        var bounds = app.frame
        if let navigation { XCTAssertTrue(navigation.exists, file: file, line: line); bounds.origin.y = navigation.frame.maxY; bounds.size.height = app.frame.maxY - bounds.minY }
        if let keyboard = keyboardBounds(app) { bounds.size.height = min(bounds.maxY, keyboard.minY) - bounds.minY }
        XCTAssertTrue(bounds.contains(control.frame), "Complete foreground control must fit above the keyboard and below navigation: \(control.frame), safe \(bounds)", file: file, line: line)
    }
    private func screen(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot()); attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
    private func restart(_ app: XCUIApplication, screen: String) {
        app.terminate(); app.launchEnvironment["TWH_UI_TEST_SCREEN"] = screen; app.launch()
    }
    private func waitGone(_ element: XCUIElement) {
        let gone = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: element)
        wait(for: [gone], timeout: 20)
    }
    private func revealCorrectionVoice(_ control: XCUIElement, _ app: XCUIApplication, navigation: XCUIElement) {
        let form = app.collectionViews["UND-18"]
        XCTAssertTrue(form.exists)
        for _ in 0..<10 {
            let top = navigation.frame.maxY
            let footer = button("保存纠正原话", app)
            let bottom = min(footer.frame.minY, keyboardBounds(app)?.minY ?? app.frame.maxY)
            let safe = CGRect(x: app.frame.minX + 1, y: top, width: app.frame.width - 2, height: max(0, bottom - top))
            if control.exists && control.isHittable && safe.contains(control.frame) { return }
            let start = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: form.frame.midX, dy: top + (bottom - top) * 0.8))
            let end = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: form.frame.midX, dy: top + (bottom - top) * 0.2))
            start.press(forDuration: 0.05, thenDragTo: end)
        }
        XCTFail("The actual voice row must be fully exposed above keyboard and fixed footer.")
    }

    func testCorrectionVoiceChildSheetPreservesTypedWordsAndReasonThenPersists() {
        let app = launch(screen: "UND-18")
        let correction = app.navigationBars["不像我"]
        XCTAssertTrue(correction.waitForExistence(timeout: 20))
        let reason = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "原因")).firstMatch
        visible(reason, app, navigation: correction); reason.tap()
        let missing = button("缺了信息", app); visible(missing, app); missing.tap()
        let editor = app.textViews["understanding-correction-input"]
        visible(editor, app, navigation: correction); editor.tap(); editor.typeText("Anonymous correction acceptance: keep my typed words.")
        let spoken = button("用语音说", app)
        revealCorrectionVoice(spoken, app, navigation: correction)
        visible(spoken, app, navigation: correction); spoken.tap()
        let voice = app.navigationBars["说一段"]
        XCTAssertTrue(voice.waitForExistence(timeout: 20))
        let transcript = app.textViews.matching(NSPredicate(format: "value CONTAINS %@", "Anonymous speech fixture")).firstMatch
        XCTAssertTrue(transcript.waitForExistence(timeout: 20))
        let use = button("使用这段文字", app)
        visible(use, app, navigation: voice); screen("edge-correction-voice-child-sheet"); use.tap(); waitGone(voice)
        XCTAssertTrue(correction.exists)
        XCTAssertTrue((editor.value as? String)?.contains("Anonymous correction acceptance: keep my typed words.") == true)
        XCTAssertTrue((editor.value as? String)?.contains("Anonymous speech fixture") == true)
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "缺了信息")).firstMatch.exists)
        let save = button("保存纠正原话", app)
        visible(save, app, navigation: correction); screen("edge-correction-returned-with-original-and-voice"); save.tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "纠正原话已保存")).firstMatch.waitForExistence(timeout: 15))
        restart(app, screen: "understanding-proof")
        XCTAssertTrue(app.staticTexts["proof.loadedFromDisk"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.staticTexts["proof.correctionBound"].exists)
        XCTAssertTrue(app.staticTexts["proof.noTaskRequests"].exists)
        restart(app, screen: "REC-1")
        let saved = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "纠正：")).firstMatch
        XCTAssertTrue(saved.waitForExistence(timeout: 20)); saved.tap()
        // DocumentView renders separate Markdown paragraphs as separate accessibility elements.
        let reasonParagraph = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "原因：缺了信息")).firstMatch
        let exactWords = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@ AND label CONTAINS %@", "Anonymous correction acceptance: keep my typed words.", "Anonymous speech fixture")).firstMatch
        let reading = app.navigationBars["阅读"]
        let footer = button("缩小字号", app)
        for (index, paragraph) in [reasonParagraph, exactWords].enumerated() {
            var reached = false
            for _ in 0..<15 {
                let top = reading.frame.maxY, bottom = footer.frame.minY
                let safe = CGRect(x: app.frame.minX + 1, y: top, width: app.frame.width - 2, height: max(0, bottom - top))
                if paragraph.exists && paragraph.isHittable && safe.contains(paragraph.frame) { reached = true; break }
                let lower = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: app.frame.midX, dy: top + (bottom - top) * 0.85))
                let upper = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: app.frame.midX, dy: top + (bottom - top) * 0.15))
                lower.press(forDuration: 0.05, thenDragTo: upper)
            }
            XCTAssertTrue(reached, "The persisted source paragraph must be fully exposed, including the exact reason and both original inputs.")
            screen("edge-correction-restarted-source-paragraph-\(index)")
        }
    }

    func testAccessibilityThreeLongLetterReachesLastParagraphAndCorrectionAction() {
        let app = launch(screen: "UND-11", accessibility3: true)
        XCTAssertTrue(app.navigationBars["近况回信"].waitForExistence(timeout: 20))
        let scroll = app.scrollViews["UND-11"]
        XCTAssertTrue(scroll.waitForExistence(timeout: 20))
        let correction = button("它不像我", app), talk = button("聊聊这封信", app)
        visible(correction, app); visible(talk, app)
        let last = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "第18段。")).firstMatch
        var reached = false
        for attempt in 0..<120 {
            let top = app.navigationBars["近况回信"].exists ? app.navigationBars["近况回信"].frame.maxY : scroll.frame.minY
            let bottom = min(correction.frame.minY, talk.frame.minY)
            let safe = CGRect(x: app.frame.minX + 1, y: top, width: app.frame.width - 2, height: max(0, bottom - top))
            // A paragraph may exceed the viewport at AX3; its actual end must be reachable.
            if last.exists && last.isHittable && last.frame.maxY <= safe.maxY && last.frame.maxY > safe.minY { reached = true; break }
            let start = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: app.frame.midX, dy: top + (bottom - top) * 0.78))
            let end = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: app.frame.midX, dy: top + (bottom - top) * 0.22))
            start.press(forDuration: 0.05, thenDragTo: end, withVelocity: .fast, thenHoldForDuration: 0)
            if attempt % 20 == 19 { screen("edge-letter-accessibility3-reading-progress-\(attempt + 1)") }
        }
        XCTAssertTrue(reached, "The actual last paragraph's end must be reached above the fixed reading actions at accessibility3.")
        visible(correction, app); visible(talk, app); screen("edge-letter-accessibility3-last-paragraph-and-actions")
        correction.tap()
        let correctionNavigation = app.navigationBars["不像我"]
        XCTAssertTrue(correctionNavigation.waitForExistence(timeout: 20))
        let editor = app.textViews["understanding-correction-input"]
        revealCorrectionVoice(editor, app, navigation: correctionNavigation)
        visible(editor, app, navigation: correctionNavigation)
        editor.tap(); editor.typeText("Anonymous correction acceptance at accessibility size")
        let save = button("保存纠正原话", app)
        visible(save, app, navigation: correctionNavigation)
        screen("edge-letter-accessibility3-real-correction-destination")
        save.tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "纠正原话已保存")).firstMatch.waitForExistence(timeout: 20))
        restart(app, screen: "understanding-proof")
        XCTAssertTrue(app.staticTexts["proof.loadedFromDisk"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.staticTexts["proof.correctionBound"].exists)
        XCTAssertTrue(app.staticTexts["proof.noTaskRequests"].exists)
    }

    func testLetterRestoresTheActualVisibleParagraphAfterFreshLaunch() {
        let app = launch(screen: "UND-11")
        let scroll = app.scrollViews["UND-11"]
        XCTAssertTrue(scroll.waitForExistence(timeout: 20))
        let correction = button("它不像我", app), talk = button("聊聊这封信", app)
        let last = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "第18段。")).firstMatch
        func viewport() -> CGRect {
            let navigation = app.navigationBars["近况回信"]
            let top = max(scroll.frame.minY, navigation.exists ? navigation.frame.maxY : scroll.frame.minY)
            let bottom = min(correction.frame.minY, talk.frame.minY)
            return CGRect(x: app.frame.minX + 1, y: top, width: app.frame.width - 2, height: max(0, bottom - top))
        }
        var reachedEnd = false
        for _ in 0..<80 {
            let safe = viewport()
            if last.exists && last.isHittable && last.frame.maxY > safe.minY && last.frame.maxY <= safe.maxY { reachedEnd = true; break }
            let lower = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: app.frame.midX, dy: safe.minY + safe.height * 0.8))
            let upper = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: app.frame.midX, dy: safe.minY + safe.height * 0.2))
            lower.press(forDuration: 0.05, thenDragTo: upper, withVelocity: .fast, thenHoldForDuration: 0)
        }
        XCTAssertTrue(reachedEnd, "A real reading session must reach the last paragraph before leaving.")
        let safe = viewport()
        let visibleParagraphs = scroll.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "第")).allElementsBoundByIndex.filter {
            $0.isHittable && $0.frame.intersects(safe)
        }.sorted { $0.frame.minY < $1.frame.minY }
        XCTAssertFalse(visibleParagraphs.isEmpty)
        guard let first = visibleParagraphs.first else { return }
        let actualParagraph = first.label
        XCTAssertFalse(actualParagraph.hasPrefix("第1段。"), "The restart check must not accidentally accept the opening paragraph.")
        screen("edge-letter-position-before-leaving")
        visible(correction, app); visible(talk, app); correction.tap()
        XCTAssertTrue(app.navigationBars["不像我"].waitForExistence(timeout: 20))
        restart(app, screen: "UND-11")
        let restored = app.staticTexts.matching(NSPredicate(format: "label == %@", actualParagraph)).firstMatch
        let returnedToActualParagraph = expectation(for: NSPredicate { _, _ in
            guard scroll.exists, correction.exists, talk.exists, restored.exists, restored.isHittable else { return false }
            return restored.frame.intersects(viewport())
        }, evaluatedWith: app)
        // No swipes, preference injection, or explicit jump after this fresh launch.
        wait(for: [returnedToActualParagraph], timeout: 20)
        visible(correction, app); visible(talk, app)
        screen("edge-letter-position-restored-after-fresh-launch")
    }

    func testLandscapeRecordEditorKeyboardToolbarSaveAndPortraitRestart() {
        let app = launch(screen: "REC-1", scenario: "records")
        // Dismiss only the fixture's presentation, then use the actual Records → Read → Edit path.
        // This keeps the verification wrapper's extra Done out of the production editor toolbar.
        let fixture = app.descendants(matching: .any).matching(identifier: "verification-REC-1").firstMatch
        XCTAssertTrue(fixture.waitForExistence(timeout: 20))
        app.navigationBars["生活记录"].buttons.matching(NSPredicate(format: "label == %@", "完成")).firstMatch.tap()
        waitGone(fixture)
        let records = button("记录", app); visible(records, app); records.tap()
        let record = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "ANONYMOUS ORBIT NOTE")).firstMatch
        for _ in 0..<12 {
            let nav = app.navigationBars["生活记录"]
            let bottom = app.buttons["central-capture-button"].frame.minY - 6
            if record.exists && record.isHittable && record.frame.minY >= nav.frame.maxY && record.frame.maxY <= bottom { break }
            app.swipeUp()
        }
        visible(record, app, navigation: app.navigationBars["生活记录"])
        XCTAssertLessThanOrEqual(record.frame.maxY, app.buttons["central-capture-button"].frame.minY - 6)
        record.tap()
        let edit = button("编辑", app); visible(edit, app); edit.tap()
        let editor = app.textViews["record-editor-body"]
        XCTAssertTrue(editor.waitForExistence(timeout: 20))
        XCUIDevice.shared.orientation = .landscapeLeft
        defer { XCUIDevice.shared.orientation = .portrait }
        var consecutiveLandscapeScreens = 0
        let rotated = expectation(for: NSPredicate { _, _ in
            let size = XCUIScreen.main.screenshot().image.size
            if app.frame.width > app.frame.height && size.width > size.height { consecutiveLandscapeScreens += 1 } else { consecutiveLandscapeScreens = 0 }
            return consecutiveLandscapeScreens >= 2
        }, evaluatedWith: app)
        wait(for: [rotated], timeout: 25)
        editor.tap(); editor.typeText(" Anonymous landscape keyboard persisted marker")
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 15))
        let navigation = app.navigationBars["编辑记录"]
        XCTAssertGreaterThanOrEqual(editor.frame.height, 44, "Landscape editing must leave at least a 44-point visible input region.")
        visible(editor, app, navigation: navigation)
        XCTAssertTrue((editor.value as? String)?.contains("Anonymous landscape keyboard persisted marker") == true)
        let done = navigation.buttons["record-editor-save"], cancel = navigation.buttons["record-editor-cancel"]
        XCTAssertEqual(navigation.buttons.matching(NSPredicate(format: "label == %@", "完成")).count, 1, "The actual production editor must have exactly one completion action.")
        visible(done, app); visible(cancel, app)
        for name in ["语音", "粗体", "列表", "引用"] { visible(button(name, app), app, navigation: navigation) }
        screen("edge-landscape-record-keyboard-full-system-screen")
        done.tap(); waitGone(editor)
        XCUIDevice.shared.orientation = .portrait
        let portrait = expectation(for: NSPredicate { _, _ in app.frame.height > app.frame.width && XCUIScreen.main.screenshot().image.size.height > XCUIScreen.main.screenshot().image.size.width }, evaluatedWith: app)
        wait(for: [portrait], timeout: 25)
        restart(app, screen: "REC-7")
        XCTAssertTrue(editor.waitForExistence(timeout: 20))
        XCTAssertTrue((editor.value as? String)?.contains("Anonymous landscape keyboard persisted marker") == true)
        screen("edge-landscape-record-restarted-in-portrait")
    }
}
