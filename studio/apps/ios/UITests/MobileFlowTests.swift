import XCTest

final class MobileFlowTests: XCTestCase {
    private func launch(_ fixture: String, language: String = "zh-Hans") -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--uitest", "-onboarding.complete", "YES", "-privacy.lock", "NO", "-language.interface", language, "-AppleLanguages", "(zh-Hans)", "-AppleLocale", "zh_CN"]
        app.launchEnvironment["TWH_UI_TEST_FIXTURE"] = fixture
        app.launch(); return app
    }
    func testCaptureSurvivesRestartWithoutCloudOrModel() {
        let fixture = "capture-" + UUID().uuidString.lowercased(), app = launch(fixture)
        let input = app.textViews["此刻发生了什么"]
        XCTAssertTrue(input.waitForExistence(timeout: 20)); input.tap(); input.typeText("Anonymous iPhone capture fixture")
        app.buttons["只存原文"].tap()
        app.buttons["记录"].tap()
        let row = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Anonymous iPhone capture fixture")).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 10))
        app.terminate(); app.launch(); app.buttons["记录"].tap()
        XCTAssertTrue(row.waitForExistence(timeout: 10))
        let shot = XCTAttachment(screenshot: app.screenshot()); shot.name = "phone-records"; shot.lifetime = .keepAlways; add(shot)
    }
    func testDraftAndNavigationKeepOriginalContent() {
        let app = launch("draft-" + UUID().uuidString.lowercased())
        let input = app.textViews["此刻发生了什么"]
        XCTAssertTrue(input.waitForExistence(timeout: 20)); input.tap(); input.typeText("A draft remains in its own space")
        app.buttons["暂存"].tap(); app.buttons["理解"].tap(); app.buttons["此刻"].tap()
        XCTAssertTrue((input.value as? String)?.contains("A draft remains") == true)
        app.terminate(); app.launch()
        XCTAssertTrue(input.waitForExistence(timeout: 20)); XCTAssertTrue((input.value as? String)?.contains("A draft remains") == true)
    }
    func testSettingsAndSearchHaveNativeNavigation() {
        let app = launch("navigation-" + UUID().uuidString.lowercased())
        XCTAssertTrue(app.buttons["设置"].waitForExistence(timeout: 20)); app.buttons["设置"].tap()
        XCTAssertTrue(app.staticTexts["同步与 iCloud"].waitForExistence(timeout: 10)); app.buttons["完成"].tap()
        app.buttons["搜索"].tap(); XCTAssertTrue(app.textFields["record-search-input"].waitForExistence(timeout: 10) || app.searchFields.firstMatch.exists)
    }
    func testEnglishSettingsAndSearch() {
        let app = launch("english-" + UUID().uuidString.lowercased(), language: "en")
        XCTAssertTrue(app.buttons["Settings"].waitForExistence(timeout: 20)); app.buttons["Settings"].tap()
        let settings = app.navigationBars["Settings"]
        XCTAssertTrue(settings.waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Sync and iCloud"].waitForExistence(timeout: 10))
        let done = settings.buttons["Done"]; XCTAssertTrue(done.exists); XCTAssertTrue(done.isHittable); done.tap()
        let settingsGone = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: settings); wait(for: [settingsGone], timeout: 10)
        let search = app.buttons["Search"]; XCTAssertTrue(search.waitForExistence(timeout: 10)); XCTAssertTrue(search.isHittable); search.tap()
        let searchBar = app.navigationBars["Search"]
        XCTAssertTrue(searchBar.waitForExistence(timeout: 10))
        let input = app.textFields["record-search-input"]; XCTAssertTrue(input.exists)
        XCTAssertEqual(input.placeholderValue, "Records, understanding, or people")
        let cancel = searchBar.buttons["Cancel"]; XCTAssertTrue(cancel.isHittable); cancel.tap()
        let searchGone = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: searchBar); wait(for: [searchGone], timeout: 10)
        // A malformed public deep link raises the real root alert without accessing any content.
        app.open(URL(string: "thewayhere://document")!)
        let alert = app.alerts["This step was not completed"]
        XCTAssertTrue(alert.waitForExistence(timeout: 10))
        XCTAssertTrue(alert.buttons["Check sync again"].exists)
        XCTAssertTrue(alert.buttons["Report a problem"].exists)
        alert.buttons["Got it"].tap()
    }

}
