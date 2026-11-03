import XCTest

final class RecoveryAcceptanceTests: XCTestCase {
    override func setUp() { super.setUp(); continueAfterFailure = false }
    private func launch(scenario: String, screen: String, mode: String? = nil) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--uitest","-onboarding.complete","YES","-privacy.lock","NO","-language.interface","zh-Hans","-AppleLanguages","(zh-Hans)","-AppleLocale","zh_CN","-notifications.tasks","NO","-model.direct","YES"]
        app.launchEnvironment = ["TWH_UI_TEST_FIXTURE":"recovery-" + UUID().uuidString.lowercased(),"TWH_UI_TEST_SCENARIO":scenario,"TWH_UI_TEST_SCREEN":screen]
        if let mode { app.launchEnvironment["TWH_UI_MODEL_FIXTURE"] = mode }
        app.launch(); return app
    }
    private func tap(_ label: String, _ app: XCUIApplication, file: StaticString = #filePath, line: UInt = #line) {
        let button = app.buttons.matching(NSPredicate(format:"identifier == %@ OR label == %@ OR label BEGINSWITH %@",label,label,label)).firstMatch
        for _ in 0..<7 where !button.exists || !button.isHittable { app.swipeUp() }
        for _ in 0..<7 where !button.exists || !button.isHittable { app.swipeDown() }
        XCTAssertTrue(button.waitForExistence(timeout:15),label,file:file,line:line); XCTAssertTrue(button.isHittable,label,file:file,line:line); button.tap()
    }
    // Fixed actions must fit between the real navigation and keyboard boundaries.
    private func saveOriginal(_ app: XCUIApplication, file: StaticString = #filePath, line: UInt = #line) {
        let button = app.buttons["capture-save-original"]
        XCTAssertTrue(button.waitForExistence(timeout:15),file:file,line:line)
        let window = app.frame.insetBy(dx: 2, dy: 2)
        let top = app.navigationBars.allElementsBoundByIndex.filter { $0.exists && $0.frame.maxY <= button.frame.minY }.map { $0.frame.maxY }.max() ?? window.minY
        let keyboard = app.keyboards.firstMatch
        let bottom: CGFloat
        if keyboard.exists && keyboard.isHittable { bottom = min(window.maxY, keyboard.frame.minY) }
        else {
            let navigation = app.buttons["central-capture-button"]
            XCTAssertTrue(navigation.exists && navigation.isHittable,file:file,line:line)
            bottom = min(window.maxY, navigation.frame.minY - 6)
        }
        let safe = CGRect(x: window.minX, y: top, width: window.width, height: max(0, bottom-top))
        XCTAssertTrue(button.isEnabled && button.isHittable,file:file,line:line)
        XCTAssertTrue(safe.contains(button.frame),"The complete Save control must be above the actual navigation/keyboard: \(button.frame) in \(safe)",file:file,line:line)
        button.tap()
    }
    private func toggle(_ id: String, _ value: Bool, _ app: XCUIApplication) {
        let control = app.switches[id]
        for _ in 0..<7 where !control.exists || !control.isHittable { app.swipeUp() }
        XCTAssertTrue(control.waitForExistence(timeout:15)); XCTAssertTrue(control.isEnabled)
        let expected = value ? "1" : "0"
        if control.value as? String != expected { control.coordinate(withNormalizedOffset:CGVector(dx:0.92,dy:0.5)).tap() }
        let changed = expectation(for:NSPredicate(format:"value == %@",expected),evaluatedWith:control); wait(for:[changed],timeout:10)
    }
    private func restart(_ app: XCUIApplication, screen: String) { app.terminate(); app.launchEnvironment["TWH_UI_TEST_SCREEN"] = screen; app.launch() }
    private func image(_ name: String, _ app: XCUIApplication) { let a = XCTAttachment(screenshot:app.screenshot()); a.name = name; a.lifetime = .keepAlways; add(a) }
    func testLimitedPhotoCountRefreshesAndDeniedStillOffersSystemPicker() {
        let app = launch(scenario:"recovery-permissions",screen:"recovery-photo-limited")
        XCTAssertTrue(app.staticTexts["photo-limited-count"].waitForExistence(timeout:20)); XCTAssertEqual(app.staticTexts["photo-limited-count"].label,"你只允许了 12 张照片。")
        tap("photo-manage-limited",app)
        XCTAssertEqual(app.staticTexts["photo-limited-count"].label,"你只允许了 13 张照片。")
        XCTAssertTrue(app.buttons["recovery-photo-picker"].exists); image("STA-5-limited-count-refreshed",app)
        restart(app,screen:"recovery-photo-denied")
        XCTAssertTrue(app.buttons["photo-open-settings"].waitForExistence(timeout:20)); XCTAssertTrue(app.buttons["recovery-photo-picker"].exists)
        XCTAssertFalse(app.staticTexts["photo-limited-count"].exists); image("STA-5-denied-system-picker-retained",app)
    }
    func testProviderFailuresPreserveOriginalAndAllowLocalSavingWithoutTasks() {
        for (mode,reason) in [("failure-401","invalid-key"),("failure-403","invalid-key"),("failure-429","rate-limited"),("failure-503","provider-unavailable")] {
            let app = launch(scenario:"capture",screen:"NOW-1",mode:mode)
            let editor = app.textViews["此刻发生了什么"]
            XCTAssertTrue(editor.waitForExistence(timeout:20)); let original = editor.value as? String
            tap("整理成日记",app); tap("确认，使用手机模型",app)
            XCTAssertTrue(app.descendants(matching:.any).matching(identifier:"model-failure-" + reason).firstMatch.waitForExistence(timeout:15))
            XCTAssertEqual(editor.value as? String,original)
            tap("model-failure-settings",app); XCTAssertTrue(app.navigationBars["AI 助手"].waitForExistence(timeout:10))
            app.navigationBars.buttons["此刻"].firstMatch.tap(); XCTAssertEqual(editor.value as? String,original)
            XCTAssertFalse(app.buttons["model-failure-mac"].exists)
            saveOriginal(app)
            XCTAssertTrue(app.staticTexts["已保存原文"].waitForExistence(timeout:15))
            XCTAssertFalse(app.descendants(matching:.any).matching(identifier:"model-failure-" + reason).firstMatch.exists)
            restart(app,screen:"recovery-proof")
            XCTAssertTrue(app.staticTexts["proof.local-original-saved"].waitForExistence(timeout:20))
            XCTAssertTrue(app.staticTexts["proof.no-task-requests"].exists)
            image("STA-6-" + mode + "-local-original-proof",app); app.terminate()
        }
    }
    func testUnconfiguredPhoneModelHidesGenerationAndKeepsLocalSaveAvailable() {
        let app = launch(scenario:"capture",screen:"NOW-1",mode:"missing-key")
        XCTAssertTrue(app.textViews["此刻发生了什么"].waitForExistence(timeout:20))
        XCTAssertFalse(app.buttons["整理成日记"].exists)
        XCTAssertFalse(app.buttons["确认，交给 Mac"].exists)
        saveOriginal(app)
        XCTAssertTrue(app.staticTexts["已保存原文"].waitForExistence(timeout:15))
        restart(app,screen:"recovery-proof")
        XCTAssertTrue(app.staticTexts["proof.local-original-saved"].waitForExistence(timeout:20))
        XCTAssertTrue(app.staticTexts["proof.no-task-requests"].exists)
        image("STA-6-unconfigured-local-save-proof",app)
    }
}
