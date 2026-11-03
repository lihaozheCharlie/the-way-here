import XCTest

/// Real production controls must fit the viewport; existence alone is insufficient.
final class PhoneLayoutAcceptanceTests: XCTestCase {
    override func setUp() { super.setUp(); continueAfterFailure = false }
    private func launch(screen: String = "NOW-1", large: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--uitest", "-onboarding.complete", "YES", "-privacy.lock", "NO", "-model.direct", "YES", "-notifications.tasks", "NO", "-language.interface", "zh-Hans", "-AppleLanguages", "(zh-Hans)", "-AppleLocale", "zh_CN"]
        if large { app.launchArguments += ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryXXXL"] }
        let run = UUID().uuidString.lowercased(), importing = screen.hasPrefix("import-form-")
        app.launchEnvironment = ["TWH_UI_TEST_FIXTURE": (importing ? "import-form-" : "layout-") + run, "TWH_UI_TEST_SCENARIO": importing ? screen : screen.hasPrefix("CHT") ? "understanding" : "capture", "TWH_UI_TEST_SCREEN": screen, "TWH_UI_MODEL_FIXTURE": "success"]
        if importing { app.launchEnvironment["TWH_UI_IMPORT_RUN"] = run }
        app.launch(); return app
    }
    private func visible(_ element: XCUIElement, in app: XCUIApplication, aboveKeyboard: Bool = false, aboveNavigation: Bool = false, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertTrue(element.waitForExistence(timeout: 20), file: file, line: line)
        XCTAssertTrue(element.isHittable, "Control must be hittable without scrolling.", file: file, line: line)
        var bounds = app.frame.insetBy(dx: 2, dy: 2)
        if aboveKeyboard, app.keyboards.firstMatch.exists { bounds.size.height = app.keyboards.firstMatch.frame.minY - bounds.minY }
        if aboveNavigation {
            let navigation = app.buttons["central-capture-button"]
            XCTAssertTrue(navigation.exists, "The production navigation boundary must exist.", file: file, line: line)
            bounds.size.height = min(bounds.height, navigation.frame.minY - 6 - bounds.minY)
        }
        XCTAssertTrue(bounds.contains(element.frame), "Entire control must fit the visible area: \(element.frame) in \(bounds)", file: file, line: line)
    }
    private func shot(_ name: String, _ app: XCUIApplication) { let item = XCTAttachment(screenshot: app.screenshot()); item.name = name; item.lifetime = .keepAlways; add(item) }
    func testHomeSaveActionsRemainVisibleWithoutScrollingAndAboveKeyboard() {
        let app = launch(), save = app.buttons["capture-save-original"], organize = app.buttons["整理成日记"]
        visible(save, in: app, aboveNavigation: true); visible(organize, in: app, aboveNavigation: true)
        let input = app.textViews["此刻发生了什么"]
        visible(input, in: app)
        XCTAssertFalse(app.tabBars.firstMatch.isHittable, "The hidden system tab bar must not overlap the designed navigation.")
        let folder = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "保存到 生活记录")).firstMatch
        XCTAssertLessThanOrEqual(input.frame.maxY, folder.frame.minY, "The input must fit above the fixed action region.")
        shot("layout-home-first-viewport", app)
        input.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 10))
        visible(save, in: app, aboveKeyboard: true); visible(organize, in: app, aboveKeyboard: true)
        shot("layout-home-keyboard-actions", app)
        save.tap()
        XCTAssertTrue(app.staticTexts["已保存原文"].waitForExistence(timeout: 15))
    }
    func testHomeLargeTextKeepsPrimaryActionsInsideViewport() {
        let app = launch(large: true)
        visible(app.buttons["capture-save-original"], in: app, aboveNavigation: true); visible(app.buttons["整理成日记"], in: app, aboveNavigation: true)
        let input = app.textViews["此刻发生了什么"]
        visible(input, in: app)
        let folder = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "保存到 生活记录")).firstMatch
        XCTAssertLessThanOrEqual(input.frame.maxY, folder.frame.minY, "Larger reading sizes must keep the actual input in the first viewport.")
        shot("layout-home-xxxl-first-viewport", app)
    }
    func testWritingProductionEntryKeepsToolsAboveKeyboardAndOneDoneButton() {
        let app = launch()
        let trigger = app.buttons["central-capture-button"]; visible(trigger, in: app); trigger.press(forDuration: 0.6)
        let write = app.buttons.matching(NSPredicate(format: "label == %@", "写一段")).firstMatch
        visible(write, in: app); write.tap()
        XCTAssertTrue(app.textViews["记录正文"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 10))
        for label in ["语音", "照片", "保存位置", "更多"] {
            visible(app.buttons.matching(NSPredicate(format: "label == %@", label)).firstMatch, in: app, aboveKeyboard: true)
        }
        XCTAssertEqual(app.navigationBars["写一段"].buttons.matching(NSPredicate(format: "label == %@", "完成")).count, 1)
        shot("layout-writing-production-keyboard-tools", app)
    }
    func testSendConfirmationPrimaryActionIsVisibleInInitialSheet() {
        let app = launch(), organize = app.buttons["整理成日记"]
        visible(organize, in: app, aboveNavigation: true); organize.tap()
        let confirm = app.buttons["确认，使用手机模型"]
        visible(confirm, in: app)
        XCTAssertLessThan(app.navigationBars["整理成日记"].frame.height, 70, "A focused confirmation must not spend half its sheet on a large title.")
        shot("layout-model-confirmation-first-sheet", app)
    }
    func testLandscapeKeepsHomePrimaryActionsInsideViewport() {
        let app = launch()
        XCUIDevice.shared.orientation = .landscapeLeft
        defer { XCUIDevice.shared.orientation = .portrait }
        let rotated = expectation(for: NSPredicate { _, _ in app.frame.width > app.frame.height }, evaluatedWith: app)
        wait(for: [rotated], timeout: 10)
        visible(app.buttons["capture-save-original"], in: app, aboveNavigation: true); visible(app.buttons["整理成日记"], in: app, aboveNavigation: true)
        shot("layout-home-landscape-actions", app)
    }
    func testPhotoSelectionAndNamingActionsRemainVisibleWithoutScrolling() {
        let app = launch(screen: "PHO-2"), next = app.buttons["photo-selection-next"]
        visible(next, in: app); shot("layout-photos-selection-actions", app); next.tap()
        let naming = app.buttons["photo-naming-next"]
        visible(naming, in: app); shot("layout-photos-naming-actions", app)
    }
    func testPhotoSendConfirmationActionFitsAndRespondsInInitialSheet() {
        let confirmation = launch(screen: "PHO-9")
        let send = confirmation.buttons["继续确认发送"]
        visible(send, in: confirmation)
        shot("layout-photos-confirmation-action", confirmation)
        send.tap()
        XCTAssertTrue(confirmation.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "匿名发送范围已确认，未发送网络请求")).firstMatch.waitForExistence(timeout: 15))
    }
    func testImportSaveRemainsVisibleAboveKeyboard() {
        let app = launch(screen: "import-form-md"), target = app.textFields["import-target"], save = app.buttons["import-submit"]
        XCTAssertTrue(target.waitForExistence(timeout: 20)); visible(save, in: app)
        target.tap(); target.typeText(" Layout")
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 10))
        visible(save, in: app, aboveKeyboard: true); XCTAssertTrue(save.isEnabled)
        shot("layout-import-keyboard-save", app); save.tap()
        XCTAssertTrue(app.navigationBars["导入完成"].waitForExistence(timeout: 15))
    }
    func testConversationSendRemainsVisibleAboveKeyboard() {
        let app = launch(screen: "CHT-4")
        let input = app.textFields["conversation.input"]
        XCTAssertTrue(input.waitForExistence(timeout: 20)); input.tap(); input.typeText("Anonymous layout message")
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 10))
        visible(app.buttons["发送"], in: app, aboveKeyboard: true)
        shot("layout-chat-keyboard-send", app)
    }
}
