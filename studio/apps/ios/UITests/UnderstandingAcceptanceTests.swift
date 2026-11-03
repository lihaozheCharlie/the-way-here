import XCTest

/// Uses only an isolated local UIFixtures directory and fictional sources. No cloud or real keys.
final class UnderstandingAcceptanceTests: XCTestCase {
    override func setUp() { super.setUp(); continueAfterFailure = false }
    private func launch(_ screen: String, fixture: String = "understanding-" + UUID().uuidString.lowercased(), speech: Bool = false, language: String = "zh-Hans", direct: Bool = true) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--uitest", "-onboarding.complete", "YES", "-privacy.lock", "NO", "-model.direct", direct ? "YES" : "NO", "-model.neverPhotos", "YES", "-notifications.tasks", "NO", "-language.interface", language, "-AppleLanguages", language == "en" ? "(en)" : "(zh-Hans)", "-AppleLocale", language == "en" ? "en_US" : "zh_CN"]
        app.launchEnvironment["TWH_UI_TEST_FIXTURE"] = fixture
        app.launchEnvironment["TWH_UI_TEST_SCENARIO"] = "understanding"
        app.launchEnvironment["TWH_UI_TEST_SCREEN"] = screen
        app.launchEnvironment["TWH_UI_MODEL_FIXTURE"] = "success"
        if speech { app.launchEnvironment["TWH_UI_SPEECH_FIXTURE"] = "transcript" }
        app.launch(); return app
    }
    private func button(_ text: String, _ app: XCUIApplication) -> XCUIElement { app.buttons.matching(NSPredicate(format: "label == %@ OR label BEGINSWITH %@", text, text)).firstMatch }
    private func tap(_ text: String, _ app: XCUIApplication) {
        let element = button(text, app)
        XCTAssertTrue(element.waitForExistence(timeout: 20), "Missing real control: \(text)")
        for _ in 0..<8 where !element.isHittable { app.swipeUp() }
        element.tap()
    }
    /// Scroll the foreground Future content, excluding its fixed save bar from the hit region.
    private func revealFuture(_ element: XCUIElement, _ app: XCUIApplication, file: StaticString = #filePath, line: UInt = #line) {
        let scroll = app.scrollViews["FUT-1"]
        XCTAssertTrue(scroll.waitForExistence(timeout: 20), file: file, line: line)
        let footer = button("保存想法", app)
        XCTAssertTrue(footer.exists, file: file, line: line)
        let navigation = app.navigationBars["想法与已有情景"]
        for _ in 0..<10 {
            let top = max(scroll.frame.minY, navigation.frame.maxY)
            let bottom = min(scroll.frame.maxY, footer.frame.minY)
            let safe = CGRect(x: scroll.frame.minX + 2, y: top + 2, width: scroll.frame.width - 4, height: max(0, bottom - top - 4))
            if element.exists && element.isHittable && safe.contains(element.frame) { return }
            let x = scroll.frame.midX
            let upper = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: x, dy: top + (bottom - top) * 0.25))
            let lower = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: x, dy: top + (bottom - top) * 0.75))
            if element.exists && element.frame.minY < top { upper.press(forDuration: 0.05, thenDragTo: lower) }
            else { lower.press(forDuration: 0.05, thenDragTo: upper) }
        }
        XCTFail("Future control must be fully visible between the navigation and fixed save bar: \(element)", file: file, line: line)
    }
    private func attach(_ name: String, _ app: XCUIApplication) { let image = XCTAttachment(screenshot: app.screenshot()); image.name = name; image.lifetime = .keepAlways; add(image) }
    private func proof(_ app: XCUIApplication, _ name: String) {
        app.terminate(); app.launchEnvironment["TWH_UI_TEST_SCREEN"] = "understanding-proof"; app.launch()
        XCTAssertTrue(app.staticTexts["proof.loadedFromDisk"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.staticTexts[name].exists, "Missing persisted result: \(name)")
        attach(name, app)
    }
    func testExcerptEditingPreservesExistingCaptureAndCreatesIndependentBoundDraft() {
        let app = launch("CHT-7")
        XCTAssertTrue(button("改一改再记", app).waitForExistence(timeout: 20))
        attach("CHT-7-excerpt-offer", app)
        tap("改一改再记", app)
        XCTAssertTrue(app.textViews.firstMatch.waitForExistence(timeout: 10))
        XCTAssertTrue((app.textViews.firstMatch.value as? String)?.contains("Anonymous excerpt to edit") == true)
        proof(app, "proof.excerptIndependent")
        XCTAssertTrue(app.staticTexts["proof.oldCapturePreserved"].exists)
    }
    func testSectionVoiceRetainsExactSectionAndSavesOriginalWithoutTask() {
        let app = launch("UND-5", speech: true)
        tap("作息与恢复", app); tap("补充一下 · 语音", app)
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "作息与恢复")).firstMatch.waitForExistence(timeout: 10))
        attach("UND-5-section-voice-question", app)
        tap("使用这段文字", app)
        // Let the async source write finish before killing the process.
        XCTAssertTrue(app.navigationBars["理解详情"].waitForExistence(timeout: 10))
        tap("阅读完整理解", app)
        proof(app, "proof.sectionVoiceSaved"); XCTAssertTrue(app.staticTexts["proof.noTaskRequests"].exists)
    }
    func testCorrectionPreservesOriginalAndSavesBoundSourceWithoutTask() {
        let app = launch("UND-18")
        let editor = app.textViews["understanding-correction-input"]
        XCTAssertTrue(editor.waitForExistence(timeout: 20)); XCTAssertTrue(editor.isHittable); editor.tap(); editor.typeText("Anonymous correction acceptance")
        attach("UND-18-original-plus-correction", app)
        tap("保存纠正原话", app)
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "纠正原话已保存")).firstMatch.waitForExistence(timeout: 10))
        proof(app, "proof.correctionBound")
    }
    func testSavedLettersRemainReadableWithoutGenerationControls() {
        let app = launch("UND-10")
        XCTAssertTrue(app.navigationBars["近况回信"].waitForExistence(timeout: 20))
        XCTAssertFalse(button("写一封", app).exists)
        tap("匿名回信", app)
        XCTAssertTrue(app.navigationBars["近况回信"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "完全虚构")).firstMatch.waitForExistence(timeout: 10))
    }
    func testNewIdeaIsSavedLocallyAndTurningPointComparisonRemainsReadable() {
        var app = launch("FUT-4")
        let editor = app.textViews["想法原文"]
        XCTAssertTrue(editor.waitForExistence(timeout: 20))
        XCTAssertFalse((editor.value as? String)?.contains("Anonymous explicit idea acceptance") == true)
        editor.tap(); editor.typeText("Anonymous newly recorded idea")
        tap("保存想法", app)
        proof(app, "proof.localIdeaSaved"); XCTAssertTrue(app.staticTexts["proof.noTaskRequests"].exists)
        attach("FUT-4-explicit-current-space-idea", app); app.terminate()
        app = launch("UND-8")
        XCTAssertTrue(app.staticTexts["它改变了什么"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.staticTexts["转折前"].exists); XCTAssertTrue(app.staticTexts["转折后"].exists)
        XCTAssertTrue(app.staticTexts["虚构的转折前：忙碌时没有休息安排。"].exists)
        XCTAssertTrue(app.staticTexts["虚构的转折后：明确留出休息时间。"].exists)
        attach("UND-8-explicit-before-after", app)
    }
    func testUnderstandingCardsSwipeWithinCategory() {
        let app = launch("UND-2")
        let pager = app.descendants(matching: .any).matching(identifier: "understanding.cardPager").firstMatch
        XCTAssertTrue(pager.waitForExistence(timeout: 20))
        XCTAssertTrue(app.staticTexts["匿名第二主线"].waitForExistence(timeout: 10))
        pager.swipeLeft()
        XCTAssertTrue(app.staticTexts["匿名人生主线"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["匿名人生主线"].isHittable)
        attach("UND-2-card-swiped-within-category", app)
    }
    func testWithoutPhoneModelSavedTopicsRemainReadableAndNewChatIsHidden() {
        let app = launch("CHT-1", direct: false)
        XCTAssertTrue(app.navigationBars["聊聊"].waitForExistence(timeout:20))
        XCTAssertTrue(button("为什么问我", app).exists)
        XCTAssertFalse(button("聊聊这个", app).exists)
        XCTAssertFalse(button("自己开个话题", app).exists)
        XCTAssertFalse(button("换一批", app).exists)
        tap("为什么问我", app)
        XCTAssertTrue(app.staticTexts["为什么现在问你"].waitForExistence(timeout:10))
        XCTAssertFalse(button("开始聊", app).exists)
    }
    func testDirectionUsesExplicitTagAndDetailHideUpdatesParentAndRestart() {
        let app = launch("CHT-1")
        let question = "这个虚构的片刻，让你想到什么？"
        XCTAssertTrue(app.staticTexts[question].waitForExistence(timeout: 20))
        tap("按方向找", app)
        let work = app.switches["工作"]; XCTAssertTrue(work.waitForExistence(timeout: 5)); work.tap()
        tap("应用", app)
        let filtersClosed = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: app.navigationBars["按方向找"])
        wait(for: [filtersClosed], timeout: 5)
        XCTAssertTrue(button("为什么问我", app).isHittable)
        // Neither question nor reason contains 工作. Only the explicit snapshot tag can keep it visible.
        XCTAssertTrue(app.staticTexts[question].waitForExistence(timeout: 5))
        tap("为什么问我", app)
        XCTAssertTrue(app.navigationBars["匿名话题"].waitForExistence(timeout: 5))
        tap("这个问题不想聊", app)
        app.navigationBars.buttons.firstMatch.tap()
        XCTAssertTrue(app.navigationBars["聊聊"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["目前没有新的想问你的"].waitForExistence(timeout: 5))
        XCTAssertFalse(button("为什么问我", app).exists)
        attach("CHT-3-detail-hidden-immediately", app)
        app.terminate(); app.launch()
        XCTAssertTrue(app.navigationBars["聊聊"].waitForExistence(timeout: 20))
        XCTAssertFalse(button("为什么问我", app).exists)
        for _ in 0..<6 where !button("管理已屏蔽话题", app).isHittable { app.swipeUp() }
        tap("管理已屏蔽话题", app); tap("恢复：", app)
        XCTAssertTrue(app.staticTexts[question].waitForExistence(timeout: 5))
        attach("CHT-2-explicit-direction-restored-after-restart", app)
    }
    func testVoiceSlideToEditAndCancelUseLocalTranscriptOnly() {
        let app = launch("CHT-6", speech: true)
        XCTAssertTrue(app.navigationBars["匿名话题"].waitForExistence(timeout: 20))
        let mic = app.buttons["按住说话，上滑取消，左滑转文字编辑"]
        XCTAssertTrue(mic.waitForExistence(timeout: 5))
        let text = app.textFields.firstMatch
        XCTAssertTrue(text.exists)
        let original = text.value as? String
        mic.tap() // Under 0.4 seconds must not start or send anything.
        XCTAssertEqual(text.value as? String, original)
        XCTAssertFalse(app.navigationBars["发送这次对话"].exists)
        let start = mic.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
        start.press(forDuration: 1, thenDragTo: start.withOffset(CGVector(dx: -100, dy: 0)))
        let transcript = "Anonymous speech fixture: these words are simulated for acceptance testing."
        XCTAssertEqual(text.value as? String, transcript)
        XCTAssertFalse(app.navigationBars["发送这次对话"].exists)
        attach("CHT-6-held-voice-slide-to-edit-result", app)
        start.press(forDuration: 1, thenDragTo: start.withOffset(CGVector(dx: 0, dy: -100)))
        XCTAssertEqual(text.value as? String, transcript)
        XCTAssertFalse(app.navigationBars["发送这次对话"].exists)
    }
    func testUnderstandingNativeScreenshotMatrix() {
        let cases: [(String, String)] = [("UND-1","已有理解"),("UND-2","理解自己"),("UND-3","理解详情"),("UND-4","理解详情"),("UND-6","理解详情"),("UND-7","人生轨迹"),("UND-8","轨迹节点"),("UND-9","人生轨迹"),("UND-10","近况回信"),("UND-11","近况回信"),("UND-16","人与世界"),("UND-17","人物详情")]
        for (screen, title) in cases {
            let app = launch(screen)
            XCTAssertTrue(app.navigationBars[title].waitForExistence(timeout: 20), "Wrong native destination for \(screen)")
            if screen == "UND-9" { tap("并行人生线", app); XCTAssertTrue(app.switches.firstMatch.waitForExistence(timeout: 5)) }
            if screen == "UND-4" { XCTAssertTrue(app.staticTexts["循环如何发生"].waitForExistence(timeout: 5)) }
            attach(screen, app)
            if screen == "UND-11" { app.swipeUp(); app.swipeUp(); attach("UND-11-native-immersive-scroll", app) }
            app.terminate()
        }
    }
    func testConversationNativeScreenshotMatrix() {
        for screen in ["CHT-1","CHT-2","CHT-3","CHT-4","CHT-5","CHT-8"] {
            let app = launch(screen)
            if ["CHT-1","CHT-2"].contains(screen) { XCTAssertTrue(app.navigationBars["聊聊"].waitForExistence(timeout: 20)); if screen == "CHT-2" { tap("按方向找", app) } }
            else { XCTAssertTrue(app.navigationBars["匿名话题"].waitForExistence(timeout: 20)) }
            if screen == "CHT-5" { tap("依据", app); XCTAssertTrue(app.navigationBars["依据与未知"].waitForExistence(timeout: 5)) }
            if screen == "CHT-8" { tap("更多", app); tap("结束并保存", app); XCTAssertTrue(app.switches.firstMatch.waitForExistence(timeout: 5)) }
            attach(screen, app); app.terminate()
        }
    }
    func testFutureNativeScreenshotMatrix() {
        for screen in ["FUT-1","FUT-2","FUT-3","FUT-4","FUT-6"] {
            let app = launch(screen)
            XCTAssertTrue(app.navigationBars["想法与已有情景"].waitForExistence(timeout: 20))
            if screen == "FUT-2" {
                let disclosure = button("已有了解度记录", app); revealFuture(disclosure, app); disclosure.tap()
                let coverage = app.staticTexts["匿名记录覆盖"]; revealFuture(coverage, app)
                XCTAssertTrue(coverage.waitForExistence(timeout: 5)); XCTAssertTrue(coverage.isHittable)
            }
            if ["FUT-3","FUT-4"].contains(screen) { for _ in 0..<4 { app.swipeUp() } }
            if screen == "FUT-6" { let path = button("匿名路径1", app); revealFuture(path, app); path.tap(); XCTAssertTrue(app.navigationBars["可能的路径"].waitForExistence(timeout: 5)); XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "虚构收获")).firstMatch.waitForExistence(timeout: 5)); for _ in 0..<6 where !app.staticTexts["匿名路径3"].isHittable { app.swipeUp() }; XCTAssertTrue(app.staticTexts["匿名路径3"].isHittable) }
            attach(screen, app); app.terminate()
        }
    }
}
