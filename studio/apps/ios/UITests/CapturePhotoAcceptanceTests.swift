import XCTest

final class CapturePhotoAcceptanceTests: XCTestCase {
    override func setUp() { super.setUp(); continueAfterFailure = false }
    private func launch(_ fixture: String = "acceptance-" + UUID().uuidString.lowercased(), scenario: String, screen: String, model: String? = nil, speech: Bool = false, language: String = "zh-Hans", neverPhotos: Bool = true, supportsImages: Bool = true) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--uitest", "-onboarding.complete", "YES", "-privacy.lock", "NO", "-model.direct", "YES", "-model.neverPhotos", neverPhotos ? "YES" : "NO", "-notifications.tasks", "NO", "-language.interface", language, "-AppleLanguages", language == "en" ? "(en)" : "(zh-Hans)", "-AppleLocale", language == "en" ? "en_US" : "zh_CN"]
        app.launchEnvironment["TWH_UI_TEST_FIXTURE"] = fixture
        app.launchEnvironment["TWH_UI_TEST_SCENARIO"] = scenario
        app.launchEnvironment["TWH_UI_TEST_SCREEN"] = screen
        if let model { app.launchEnvironment["TWH_UI_MODEL_FIXTURE"] = model }
        if speech { app.launchEnvironment["TWH_UI_SPEECH_FIXTURE"] = "transcript" }
        if !supportsImages { app.launchEnvironment["TWH_UI_MODEL_SUPPORTS_IMAGES"] = "NO" }
        app.launch(); return app
    }
    private func button(_ label: String, in app: XCUIApplication) -> XCUIElement { app.buttons.matching(NSPredicate(format: "label == %@ OR label BEGINSWITH %@", label, label)).firstMatch }
    private func tap(_ label: String, in app: XCUIApplication, file: StaticString = #filePath, line: UInt = #line) {
        let control = button(label, in: app)
        XCTAssertTrue(control.waitForExistence(timeout: 15), "Missing control: \(label)", file: file, line: line)
        for _ in 0..<5 where !control.isHittable { app.swipeUp() }
        control.tap()
    }
    private func waitGone(_ element: XCUIElement, seconds: TimeInterval = 10) {
        let gone = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: element)
        wait(for: [gone], timeout: seconds)
    }
    private func attach(_ name: String, app: XCUIApplication) {
        let shot = XCTAttachment(screenshot: app.screenshot()); shot.name = name; shot.lifetime = .keepAlways; add(shot)
    }

    func testLegacyFailedHistoryHasNoRemoteRetryActionsAfterRestart() {
        let app = launch(scenario: "capture-failed", screen: "NOW-8")
        XCTAssertTrue(app.navigationBars["历史记录"].waitForExistence(timeout: 20))
        XCTAssertFalse(button("全部重试", in: app).exists)
        XCTAssertFalse(app.buttons["待处理"].exists)
        app.terminate(); app.launch()
        XCTAssertTrue(app.navigationBars["历史记录"].waitForExistence(timeout: 20))
        XCTAssertFalse(button("全部重试", in: app).exists)
        attach("NOW-8-local-history-without-remote-actions", app: app)
    }
    func testRetiredTaskLinksCannotExposeRemoteExecution() {
        let app = launch(scenario: "capture", screen: "NOW-1")
        XCTAssertTrue(app.textViews["此刻发生了什么"].waitForExistence(timeout: 20))
        XCTAssertFalse(button("整理成日记", in: app).exists)
        for raw in ["thewayhere://tasks", "thewayhere://task?space=anonymous&target=old", "thewayhere://retry?space=anonymous&target=old"] {
            app.open(URL(string: raw)!)
            XCTAssertTrue(app.textViews["此刻发生了什么"].waitForExistence(timeout: 10))
            XCTAssertFalse(button("确认，交给 Mac", in: app).exists)
            XCTAssertFalse(button("核对后重试", in: app).exists)
        }
        app.terminate(); app.launchEnvironment["TWH_UI_TEST_SCREEN"] = "recovery-proof"; app.launch()
        XCTAssertTrue(app.staticTexts["proof.no-task-requests"].waitForExistence(timeout: 20))
        attach("local-only-retired-links-create-no-requests", app: app)
    }
    func testModelFailureRetainsOriginalAndSuccessfulRetryRequiresReview() {
        let app = launch(scenario: "capture", screen: "NOW-1", model: "failure")
        let editor = app.textViews["此刻发生了什么"]
        XCTAssertTrue(editor.waitForExistence(timeout: 20)); let original = editor.value as? String
        tap("整理成日记", in: app); tap("确认，使用手机模型", in: app)
        XCTAssertTrue(button("重试", in: app).waitForExistence(timeout: 15))
        XCTAssertEqual(editor.value as? String, original)
        app.terminate(); app.launchEnvironment["TWH_UI_MODEL_FIXTURE"] = "success"; app.launch()
        XCTAssertTrue(editor.waitForExistence(timeout: 20)); XCTAssertEqual(editor.value as? String, original)
        tap("整理成日记", in: app); tap("确认，使用手机模型", in: app)
        XCTAssertTrue(app.navigationBars["确认这份日记"].waitForExistence(timeout: 15))
        XCTAssertTrue((app.textViews.firstMatch.value as? String)?.contains("匿名验收生成") == true)
        tap("确认保存", in: app)
        XCTAssertTrue(editor.waitForExistence(timeout: 10))
        XCTAssertEqual(editor.value as? String, "")
        app.terminate(); app.launch(); tap("记录", in: app)
        XCTAssertTrue(app.staticTexts["日记"].firstMatch.waitForExistence(timeout: 10) || app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "日记")).firstMatch.exists)
        attach("NOW-6-generated-review-saved", app: app)
    }
    func testFaceNamingRequiresCrossPhotoConfirmationAndPersists() {
        let app = launch(scenario: "photo-naming", screen: "photo-flow")
        tap("未命名人脸", in: app)
        let field = app.textFields["怎么称呼 TA"]; XCTAssertTrue(field.waitForExistence(timeout: 10)); field.tap(); field.typeText("Anonymous Alex")
        tap("确定", in: app)
        XCTAssertTrue(app.navigationBars["同一个人？"].waitForExistence(timeout: 15))
        tap("确认合并", in: app)
        tap("2 · 已命名 1", in: app)
        XCTAssertTrue(button("Anonymous Alex", in: app).waitForExistence(timeout: 10))
        app.terminate(); app.launch()
        XCTAssertTrue(button("Anonymous Alex", in: app).waitForExistence(timeout: 20))
        attach("PHO-6-confirmed-identity-persisted", app: app)
    }
    private func revealCandidate(_ element: XCUIElement, app: XCUIApplication, file: StaticString = #filePath, line: UInt = #line) {
        let navigation = app.navigationBars["同一个人？"]
        for _ in 0..<8 {
            XCTAssertTrue(navigation.exists, "Changing a checkbox must keep the confirmation sheet open.", file: file, line: line)
            let confirm = button("确认合并", in: app)
            XCTAssertTrue(confirm.exists, file: file, line: line)
            let top = navigation.frame.maxY + 2, bottom = confirm.frame.minY - 12
            let safe = CGRect(x: app.frame.minX + 16, y: top, width: app.frame.width - 32, height: max(0, bottom-top))
            if element.exists && element.isHittable && safe.contains(element.frame) { return }
            let origin = app.coordinate(withNormalizedOffset: .zero)
            let upper = origin.withOffset(CGVector(dx: safe.midX, dy: safe.minY + safe.height * 0.25))
            let lower = origin.withOffset(CGVector(dx: safe.midX, dy: safe.minY + safe.height * 0.75))
            if element.exists && element.frame.minY < safe.minY { upper.press(forDuration: 0.05, thenDragTo: lower) }
            else { lower.press(forDuration: 0.05, thenDragTo: upper) }
        }
        XCTFail("The entire candidate must be visible above the fixed confirmation bar before a tap.", file: file, line: line)
    }
    func testCandidateSelectionPreservesExplicitExclusionsAndOnlyMergesConfirmedFaces() {
        for clearAll in [false, true] {
            let app = launch(scenario: "photo-naming", screen: "photo-flow")
            tap("未命名人脸", in: app)
            let field = app.textFields["怎么称呼 TA"]; XCTAssertTrue(field.waitForExistence(timeout: 10)); field.tap(); field.typeText("Anonymous Selected")
            tap("确定", in: app); XCTAssertTrue(app.navigationBars["同一个人？"].waitForExistence(timeout: 15))
            let chosen = app.buttons.matching(NSPredicate(format: "label == %@", "候选人脸，已选"))
            XCTAssertEqual(chosen.count, 2, "Fresh candidates start selected without relying on appearance timing.")
            revealCandidate(chosen.firstMatch, app: app); chosen.firstMatch.tap()
            XCTAssertTrue(app.navigationBars["同一个人？"].exists); XCTAssertEqual(chosen.count, 1)
            if clearAll {
                revealCandidate(chosen.firstMatch, app: app); chosen.firstMatch.tap()
                XCTAssertTrue(app.navigationBars["同一个人？"].exists); XCTAssertTrue(button("确认合并", in: app).exists)
                XCTAssertEqual(chosen.count, 0)
            }
            attach(clearAll ? "PHO-6-all-candidates-explicitly-excluded" : "PHO-6-one-candidate-explicitly-excluded", app: app)
            tap("确认合并", in: app)
            XCTAssertTrue(button("2 · 已命名 0", in: app).waitForExistence(timeout: 10))
            XCTAssertTrue(button(clearAll ? "3 · 已命名 0" : "3 · 已命名 1", in: app).exists)
            app.terminate(); app.launch()
            XCTAssertTrue(button("2 · 已命名 0", in: app).waitForExistence(timeout: 20))
            XCTAssertTrue(button(clearAll ? "3 · 已命名 0" : "3 · 已命名 1", in: app).exists)
            XCTAssertTrue(button("Anonymous Selected", in: app).exists)
            attach(clearAll ? "PHO-6-empty-selection-durable" : "PHO-6-only-confirmed-face-durable", app: app)
            app.terminate()
        }
    }
    func testManualLassoAnnotationCanBeNamedAndRestored() {
        let app = launch(scenario: "photo-naming", screen: "photo-flow")
        tap("手动圈选", in: app); tap("手绘圈（套索）", in: app)
        let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.07, dy: 0.36)), end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.25, dy: 0.50))
        start.press(forDuration: 0.4, thenDragTo: end)
        tap("确认", in: app)
        if button("保留两个框", in: app).waitForExistence(timeout: 1) { tap("保留两个框", in: app) }
        let field = app.textFields["怎么称呼 TA"]; XCTAssertTrue(field.waitForExistence(timeout: 10)); field.tap(); field.typeText("Anonymous Manual")
        tap("确定", in: app)
        if button("都不是", in: app).waitForExistence(timeout: 1) { tap("都不是", in: app) }
        XCTAssertTrue(button("Anonymous Manual", in: app).waitForExistence(timeout: 10))
        app.terminate(); app.launch()
        XCTAssertTrue(button("Anonymous Manual", in: app).waitForExistence(timeout: 20))
        attach("PHO-5-manual-annotation-persisted", app: app)
    }
    func testPhotoStreamingDraftKeepsOriginalAndNeedsExplicitSave() {
        let app = launch(scenario: "photo-review", screen: "photo-flow", model: "success")
        tap("调整这份草稿", in: app); tap("再写一版", in: app)
        tap("继续确认发送", in: app); tap("确认，使用手机模型", in: app)
        let generated = app.textViews.firstMatch
        let value = expectation(for: NSPredicate(format: "value CONTAINS %@", "匿名验收生成"), evaluatedWith: generated)
        wait(for: [value], timeout: 15)
        XCTAssertTrue(app.buttons["讲述原话（完整保留）"].exists || app.staticTexts["讲述原话（完整保留）"].exists)
        tap("确认保存", in: app)
        XCTAssertTrue(app.staticTexts["已经安全保存"].waitForExistence(timeout: 15))
        app.terminate(); app.launch()
        XCTAssertTrue(app.staticTexts["已经安全保存"].waitForExistence(timeout: 20))
        attach("PHO-8-real-sse-reviewed-and-saved", app: app)
    }
    func testTextOnlyModelCanConfirmGenerateAndSavePhotoStoryWithoutSendingImages() {
        let app = launch(scenario: "photo-text-only-model", screen: "PHO-7", model: "success", neverPhotos: false, supportsImages: false)
        let story = app.textViews["照片故事正文，可选择段落重写"]
        XCTAssertTrue(story.waitForExistence(timeout: 20))
        XCTAssertFalse(app.switches["同意把压缩照片副本发给模型"].exists)
        tap("请 AI 帮我写", in: app)
        XCTAssertTrue(app.navigationBars["发送确认"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.switches["包含线索文字"].exists)
        XCTAssertFalse(app.switches["不发照片，仅用文字"].exists)
        XCTAssertEqual(app.switches.matching(NSPredicate(format: "label CONTAINS %@", "照片压缩副本")).count, 0)
        tap("继续确认发送", in: app)
        let confirmation = button("确认，使用手机模型", in: app)
        XCTAssertTrue(confirmation.waitForExistence(timeout: 10)); XCTAssertTrue(confirmation.isEnabled); XCTAssertTrue(confirmation.isHittable)
        confirmation.tap()
        // Real ModelClient rejects nonempty images for this preset before the
        // fixture HTTP/SSE request; a generated response proves text-only send.
        let generated = expectation(for: NSPredicate(format: "value CONTAINS %@", "这是匿名验收生成的草稿。"), evaluatedWith: story)
        wait(for: [generated], timeout: 15)
        XCTAssertTrue(app.buttons["讲述原话（完整保留）"].exists || app.staticTexts["讲述原话（完整保留）"].exists)
        tap("确认保存", in: app)
        XCTAssertTrue(app.staticTexts["已经安全保存"].waitForExistence(timeout: 15))
        app.terminate(); app.launchEnvironment["TWH_UI_TEST_SCREEN"] = "REC-1"; app.launch()
        let saved = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "这是匿名验收生成的草稿。")).firstMatch
        XCTAssertTrue(saved.waitForExistence(timeout: 20)); saved.tap()
        XCTAssertTrue(app.navigationBars["阅读"].waitForExistence(timeout: 10))
        let savedBody = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "这是匿名验收生成的草稿。")).firstMatch
        for _ in 0..<5 where !savedBody.exists || !savedBody.isHittable { app.swipeUp() }
        XCTAssertTrue(savedBody.exists); XCTAssertTrue(savedBody.isHittable)
        attach("PHO-text-only-model-generated-and-saved-locally", app: app)
        app.terminate(); app.launchEnvironment["TWH_UI_TEST_SCREEN"] = "recovery-proof"; app.launch()
        XCTAssertTrue(app.staticTexts["proof.no-task-requests"].waitForExistence(timeout: 20))
        attach("PHO-text-only-model-no-task-requests", app: app)
    }
    func testPhotoDraftDeletionSurvivesRestart() {
        let app = launch(scenario: "photo", screen: "PHO-12")
        XCTAssertTrue(button("待清理匿名草稿", in: app).waitForExistence(timeout: 20))
        tap("删除", in: app); tap("删除草稿与副本", in: app)
        waitGone(button("待清理匿名草稿", in: app))
        app.terminate(); app.launch()
        XCTAssertTrue(app.navigationBars["照片记忆"].waitForExistence(timeout: 20))
        XCTAssertFalse(button("待清理匿名草稿", in: app).exists)
        attach("PHO-12-draft-deletion-persisted", app: app)
    }
    func testSharedPayloadCreatesPhotoDraftAndSavedSource() {
        let app = launch(scenario: "share", screen: "share-flow")
        let naming=app.buttons["photo-selection-next"];XCTAssertTrue(naming.waitForExistence(timeout:20),"Anonymous share entry did not load: \(app.alerts.debugDescription)");XCTAssertTrue(naming.isEnabled);naming.tap()
        let story=app.buttons["photo-naming-next"];XCTAssertTrue(story.waitForExistence(timeout:15));story.tap()
        XCTAssertTrue((app.textViews.firstMatch.value as? String)?.contains("Anonymous shared photo payload") == true)
        tap("不使用模型，直接确认原话", in: app)
        let build = app.switches["保存并收进理解（由 Mac 完成）"]
        if build.exists && build.value as? String == "1" { build.tap() }
        tap("确认保存", in: app)
        XCTAssertTrue(app.staticTexts["已经安全保存"].waitForExistence(timeout: 15))
        app.terminate(); app.launch()
        XCTAssertTrue(app.staticTexts["已经安全保存"].waitForExistence(timeout: 20))
        attach("SYS-6-share-to-photo-to-source", app: app)
    }
    func testSystemProjectionTracksUnreadLettersAndBoundRoutes() {
        let app = launch(scenario: "system", screen: "SYS-5")
        XCTAssertTrue(app.staticTexts["fixture-shortcut-letter"].waitForExistence(timeout:20))
        tap("切换第二匿名空间后打开原空间通知", in: app)
        XCTAssertTrue(app.navigationBars["人物详情"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.staticTexts["匿名朋友"].exists)
        XCTAssertTrue(app.staticTexts["这是完全虚构的验收人物，只用于本机原生流程测试。"].exists)
        app.terminate(); app.launch()
        tap("打开最近未读回信", in: app)
        XCTAssertTrue(app.navigationBars["近况回信"].waitForExistence(timeout: 10) || app.staticTexts["匿名回信"].firstMatch.exists)
        app.terminate(); app.launch()
        XCTAssertTrue(app.navigationBars["匿名系统投影与入口验收"].waitForExistence(timeout: 20))
        XCTAssertFalse(app.staticTexts["fixture-shortcut-letter"].exists)
        attach("SYS-4-SYS-5-shared-projection-bound-route-read-state", app: app)
    }
    func testRecordingIntentFinishPreservesAnonymousTranscript() {
        let app = launch(scenario: "speech", screen: "recording-intent", speech: true)
        let editor = app.textViews["记录正文"]
        XCTAssertTrue(editor.waitForExistence(timeout: 20))
        XCTAssertTrue((editor.value as? String)?.contains("Anonymous speech fixture") == true)
        app.terminate(); app.launchEnvironment["TWH_UI_TEST_SCREEN"] = "NOW-4"; app.launch()
        XCTAssertTrue(editor.waitForExistence(timeout: 20))
        XCTAssertTrue((editor.value as? String)?.contains("Anonymous speech fixture") == true)
        attach("SYS-3-recording-intent-draft-persisted", app: app)
    }

    private func screenshots(_ screens: [String], language: String = "zh-Hans") {
        for screen in screens {
            let app = launch(scenario: "screenshots", screen: screen, speech: screen == "NOW-3" || screen == "SYS-3", language: language)
            if screen == "ONB-1" {XCTAssertTrue(app.staticTexts["welcome-headline"].waitForExistence(timeout:15));XCTAssertTrue(app.buttons["welcome-start-own-space"].exists)}
            else if screen == "NOW-1" || screen == "NOW-7" { XCTAssertTrue(app.staticTexts["匿名保存记录"].waitForExistence(timeout: 15)) }
            else if screen == "NOW-2" { XCTAssertTrue(app.staticTexts[language == "en" ? "Demo · Nothing is saved" : "演示 · 不保存"].waitForExistence(timeout: 15)) }
            else { XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "verification-" + screen).firstMatch.waitForExistence(timeout: 15)) }
            if screen == "NOW-7" {let mic=app.buttons["central-capture-button"];XCTAssertTrue(mic.waitForExistence(timeout:10));mic.press(forDuration:1);XCTAssertTrue(app.descendants(matching:.any).matching(identifier:"NOW-7").firstMatch.waitForExistence(timeout:10));XCTAssertTrue(app.buttons[language == "en" ? "Import materials" : "导入资料"].exists)}
            attach(screen + "-" + language, app: app); app.terminate()
        }
    }
    func testScreenshotMatrixOnboardingAndEarlyCapture() { screenshots(["ONB-1","ONB-2","ONB-3","ONB-4","ONB-5","ONB-6","NOW-1","NOW-2","NOW-3"]) }
    func testScreenshotMatrixCaptureAndEarlyPhotos() { screenshots(["NOW-4","NOW-5","NOW-6","NOW-7","NOW-8","NOW-9","PHO-1","PHO-2","PHO-3"]) }
    func testScreenshotMatrixPhotos() { screenshots(["PHO-4","PHO-5","PHO-6","PHO-7","PHO-8","PHO-9","PHO-10","PHO-11","PHO-12"]) }
    func testScreenshotMatrixEnglishAndSystem() { screenshots(["NOW-1","NOW-4","PHO-7","PHO-9","SYS-2","SYS-3","SYS-4","SYS-5","SYS-6"], language: "en") }
}
