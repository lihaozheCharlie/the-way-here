import XCTest

/// Anonymous, local-only UI fixtures. These cases never use a real model key or
/// the user's knowledge library.
final class CaptureSafetyRegressionTests: XCTestCase {
    override func setUp() { super.setUp(); continueAfterFailure = false }
    private func launch(model: String = "failure") -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--uitest","-onboarding.complete","YES","-privacy.lock","NO","-model.direct","YES","-model.neverPhotos","YES","-notifications.tasks","NO","-language.interface","zh-Hans","-AppleLanguages","(zh-Hans)","-AppleLocale","zh_CN"]
        app.launchEnvironment["TWH_UI_TEST_FIXTURE"] = "safety-" + UUID().uuidString.lowercased()
        app.launchEnvironment["TWH_UI_TEST_SCENARIO"] = "photo-review"
        app.launchEnvironment["TWH_UI_TEST_SCREEN"] = "photo-flow"
        app.launchEnvironment["TWH_UI_MODEL_FIXTURE"] = model
        app.launch(); return app
    }
    private func tap(_ title: String, app: XCUIApplication) {
        let button = app.buttons.matching(NSPredicate(format:"label == %@ OR label BEGINSWITH %@",title,title)).firstMatch
        XCTAssertTrue(button.waitForExistence(timeout:15),"Missing \(title)")
        for _ in 0..<5 where !button.isHittable { app.swipeUp() }
        button.tap()
    }
    func testCancellingShorterConfirmationLeavesCurrentStoryUnchangedAfterRestart() {
        let app = launch()
        let editor = app.textViews.firstMatch
        XCTAssertTrue(editor.waitForExistence(timeout:20))
        let original = editor.value as? String
        tap("调整这份草稿",app:app); tap("更简短",app:app)
        XCTAssertTrue(app.navigationBars["发送确认"].waitForExistence(timeout:10))
        tap("取消",app:app)
        XCTAssertTrue(editor.waitForExistence(timeout:10)); XCTAssertEqual(editor.value as? String,original)
        app.terminate(); app.launch()
        XCTAssertTrue(editor.waitForExistence(timeout:20)); XCTAssertEqual(editor.value as? String,original)
    }
    func testPhotoGenerationFailureRestoresCurrentInputAfterRestart() {
        let app = launch()
        let editor = app.textViews.firstMatch
        XCTAssertTrue(editor.waitForExistence(timeout:20))
        let original = editor.value as? String
        tap("调整这份草稿",app:app); tap("再写一版",app:app)
        tap("继续确认发送",app:app); tap("确认，使用手机模型",app:app)
        XCTAssertTrue(app.buttons.matching(NSPredicate(format:"label == %@","重试")).firstMatch.waitForExistence(timeout:15))
        XCTAssertEqual(editor.value as? String,original)
        app.terminate(); app.launch()
        XCTAssertTrue(editor.waitForExistence(timeout:20)); XCTAssertEqual(editor.value as? String,original)
    }
}
