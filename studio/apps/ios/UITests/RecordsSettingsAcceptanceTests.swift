import XCTest

final class RecordsSettingsAcceptanceTests: XCTestCase {
    override func setUp() { super.setUp(); continueAfterFailure = false }
    private func launch(_ fixture: String = "records-" + UUID().uuidString.lowercased(), scenario: String = "records", screen: String, language: String? = "zh-Hans", locked: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--uitest", "-onboarding.complete", "YES", "-privacy.lock", locked ? "YES" : "NO", "-AppleLanguages", "(zh-Hans)", "-AppleLocale", "zh_CN"]
        if !scenario.hasPrefix("settings") { app.launchArguments += ["-notifications.tasks", "NO"] }
        if let language { app.launchArguments += ["-language.interface", language] }
        app.launchEnvironment = ["TWH_UI_TEST_FIXTURE":fixture, "TWH_UI_TEST_SCENARIO":scenario, "TWH_UI_TEST_SCREEN":screen]
        app.launch(); return app
    }
    private func button(_ label: String, app: XCUIApplication) -> XCUIElement { app.buttons.matching(NSPredicate(format:"label == %@ OR label BEGINSWITH %@",label,label)).firstMatch }
    private func tap(_ label: String, app: XCUIApplication, file: StaticString = #filePath, line: UInt = #line) {
        let target = button(label, app: app); XCTAssertTrue(target.waitForExistence(timeout:20),label,file:file,line:line)
        for _ in 0..<7 where !target.isHittable { app.swipeUp() }; target.tap()
    }
    private func setSwitch(_ control: XCUIElement, enabled: Bool, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertTrue(control.waitForExistence(timeout:15),file:file,line:line); XCTAssertTrue(control.isEnabled,file:file,line:line)
        let expected = enabled ? "1" : "0"
        if control.value as? String != expected { control.coordinate(withNormalizedOffset:CGVector(dx:0.92,dy:0.5)).tap() }
        let changed = expectation(for:NSPredicate(format:"value == %@",expected),evaluatedWith:control); wait(for:[changed],timeout:10)
    }
    private func screenshot(_ name: String, app: XCUIApplication) { let image = XCTAttachment(screenshot:app.screenshot()); image.name=name; image.lifetime = .keepAlways; add(image) }
    private func waitForFixtureDismissal(_ app: XCUIApplication, screen: String) {
        let container=app.descendants(matching:.any).matching(identifier:"verification-"+screen).firstMatch
        let gone=expectation(for:NSPredicate(format:"exists == false"),evaluatedWith:container)
        wait(for:[gone],timeout:15)
    }
    private func relaunch(_ app: XCUIApplication, screen: String) { app.terminate(); app.launchEnvironment["TWH_UI_TEST_SCREEN"] = screen; app.launch() }
    func testEditorKeyboardAndTitleUndoThenSaveSurvivesRestart() {
        let app = launch(screen:"REC-7")
        let editor = app.textViews["record-editor-body"], title = app.textFields["record-editor-title"]
        XCTAssertTrue(editor.waitForExistence(timeout:20)); let original = editor.value as? String ?? ""
        editor.tap(); editor.typeText(" Keyboard undo marker")
        tap("撤销",app:app); XCTAssertEqual(editor.value as? String,original)
        title.tap(); title.typeText(" RENAMED")
        tap("撤销",app:app); XCTAssertEqual(title.value as? String,"ANONYMOUS ORBIT NOTE")
        editor.tap(); editor.typeText(" Persisted anonymous edit")
        tap("完成",app:app);waitForFixtureDismissal(app,screen:"REC-7")
        relaunch(app,screen:"REC-7"); XCTAssertTrue(editor.waitForExistence(timeout:20)); XCTAssertTrue((editor.value as? String)?.contains("Persisted anonymous edit") == true)
        screenshot("REC-7-keyboard-undo-and-persisted-edit",app:app)
    }
    func testMovingRecordUpdatesActualFolderAfterRestart() {
        let app = launch(screen:"REC-4")
        tap("Move Target",app:app); tap("移到这里",app:app);waitForFixtureDismissal(app,screen:"REC-4")
        relaunch(app,screen:"REC-6")
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format:"label CONTAINS %@","Move Target")).firstMatch.waitForExistence(timeout:20))
        screenshot("REC-4-move-persisted-actual-location",app:app)
    }
    func testConflictKeepRemoteRemovesPendingConflictAfterRestart() {
        let app = launch(screen:"REC-8")
        tap("保留另一版本",app:app);waitForFixtureDismissal(app,screen:"REC-8")
        relaunch(app,screen:"REC-1")
        XCTAssertTrue(app.navigationBars["生活记录"].waitForExistence(timeout:20))
        XCTAssertFalse(app.staticTexts["需要处理的冲突"].exists)
        screenshot("REC-8-conflict-choice-persisted",app:app)
    }
    func testSearchReturnsRealContentAndRemembersHistory() {
        let app = launch(scenario:"search",screen:"SRC-1")
        let field=app.textFields["record-search-input"]; XCTAssertTrue(field.waitForExistence(timeout:20)); field.tap();field.typeText("orbit")
        let result=app.buttons.matching(NSPredicate(format:"label CONTAINS %@","ANONYMOUS ORBIT NOTE")).firstMatch
        XCTAssertTrue(result.waitForExistence(timeout:15));screenshot("SRC-2-real-fulltext-results",app:app);result.tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format:"label CONTAINS %@","Anonymous orbit journal")).firstMatch.waitForExistence(timeout:10))
        relaunch(app,screen:"SRC-1")
        XCTAssertTrue(button("orbit",app:app).waitForExistence(timeout:20))
        screenshot("SRC-1-search-history-restored",app:app)
    }
    func testSearchMoreExpandsActualMatchesAndNoKeyHidesConversation() {
        let app=launch(scenario:"search",screen:"SRC-2")
        let field=app.textFields["record-search-input"];XCTAssertTrue(field.waitForExistence(timeout:20));field.tap();field.typeText("cluster\n")
        tap("更多",app:app)
        let summary = app.staticTexts["search-expanded-记录"]
        for _ in 0..<6 where !summary.exists { app.swipeUp() }
        XCTAssertTrue(summary.waitForExistence(timeout:10))
        XCTAssertEqual(app.staticTexts["search-expanded-记录"].label,"已显示全部 5 条匹配")
        for number in 1...5 {
            let row = app.buttons["search-result-Cluster-\(number).md"]
            for _ in 0..<6 where !row.exists || !row.isHittable { app.swipeUp() }
            if !row.exists || !row.isHittable { for _ in 0..<6 where !row.exists || !row.isHittable { app.swipeDown() } }
            XCTAssertTrue(row.exists,"Missing distinct match \(number)"); XCTAssertTrue(row.isHittable); row.tap()
            let readingBar = app.navigationBars["阅读"]
            XCTAssertTrue(readingBar.waitForExistence(timeout:10))
            XCTAssertTrue(app.buttons["记录信息"].exists)
            XCTAssertTrue(app.staticTexts["Fictional cluster search evidence \(number)."].waitForExistence(timeout:10))
            let back = readingBar.buttons["搜索"]
            XCTAssertTrue(back.exists); XCTAssertTrue(back.isHittable)
            back.tap()
            XCTAssertTrue(field.waitForExistence(timeout:10)); XCTAssertEqual(field.value as? String,"cluster")
            let keyboardGone = expectation(for:NSPredicate(format:"exists == false"),evaluatedWith:app.keyboards.firstMatch); wait(for:[keyboardGone],timeout:5)
            XCTAssertFalse(app.staticTexts["正在搜索…"].exists)
            for _ in 0..<6 where !summary.exists { app.swipeUp() }
            XCTAssertTrue(summary.exists); XCTAssertEqual(summary.label,"已显示全部 5 条匹配")
        }
        screenshot("SRC-2-more-expanded",app:app)
        relaunch(app,screen:"SRC-3");XCTAssertTrue(field.waitForExistence(timeout:20));field.tap();field.typeText("zzqxfixtureunmatched772")
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format:"label BEGINSWITH %@","没有找到与")).firstMatch.waitForExistence(timeout:15))
        XCTAssertFalse(button("把这个问题拿去聊聊",app:app).exists); screenshot("SRC-3-no-key-local-search",app:app)
    }
    func testGenericErrorShowsSafetyRecoveryAndThirdFailureAdvice() {
        let app=launch(scenario:"shell",screen:"STA-9")
        for number in 1...3 { tap("Trigger anonymous network error",app:app);XCTAssertTrue(button("反馈问题",app:app).waitForExistence(timeout:10));if number<3 { tap("知道了",app:app) } }
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format:"label CONTAINS %@","已经连续失败 3 次")).firstMatch.exists)
        screenshot("STA-9-three-real-error-events",app:app)
    }
    func testDailyLocalReminderChoicePersistsWithoutTaskCategories() {
        let app = launch(scenario:"settings",screen:"SET-7")
        let daily = app.switches["每天 21:00 提醒我记一笔"]
        XCTAssertFalse(app.switches["任务完成与失败通知"].exists)
        XCTAssertFalse(app.switches["notification-category-build"].exists)
        setSwitch(daily,enabled:false)
        daily.coordinate(withNormalizedOffset:CGVector(dx:0.92,dy:0.5)).tap()
        let springboard = XCUIApplication(bundleIdentifier:"com.apple.springboard")
        let permission = springboard.alerts.firstMatch
        if permission.waitForExistence(timeout:3) {
            let allow = permission.buttons.matching(NSPredicate(format:"label == %@ OR label == %@", "允许", "Allow")).firstMatch
            XCTAssertTrue(allow.exists); allow.tap()
        }
        setSwitch(daily,enabled:false)
        relaunch(app,screen:"SET-7")
        XCTAssertTrue(daily.waitForExistence(timeout:20)); XCTAssertEqual(daily.value as? String,"0")
        XCTAssertFalse(app.switches["notification-category-build"].exists)
        screenshot("SET-7-local-daily-reminder-preference-restored",app:app)
    }
    func testLockGateNeverShowsRecordTitlesBeforeAuthentication() {
        let app = launch(scenario:"shell-lock",screen:"STA-8",locked:true)
        XCTAssertTrue(app.staticTexts["The Way Here 已锁定"].waitForExistence(timeout:20))
        XCTAssertFalse(app.staticTexts["ANONYMOUS ORBIT NOTE"].exists)
        XCTAssertFalse(app.buttons["设置"].exists)
        screenshot("STA-8-gated-before-any-content-load",app:app)
    }
    func testLanguageChangePersistsAndChangesNativeLabels() {
        let app=launch(scenario:"settings-language",screen:"SET-1",language:nil)
        XCTAssertTrue(app.navigationBars["设置"].waitForExistence(timeout:20)); tap("语言",app:app)
        let picker = app.buttons["interface-language-picker"]; XCTAssertTrue(picker.waitForExistence(timeout:20)); picker.tap(); tap("English",app:app)
        let languageBar = app.navigationBars["Language"]
        XCTAssertTrue(languageBar.waitForExistence(timeout:10)); XCTAssertTrue(picker.label.contains("English"))
        let back = languageBar.buttons.matching(NSPredicate(format:"label == %@ OR label == %@","Settings","设置")).firstMatch
        XCTAssertTrue(back.exists); XCTAssertTrue(back.isHittable); back.tap()
        XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout:10))
        XCTAssertTrue(app.staticTexts["Sync and iCloud"].waitForExistence(timeout:10))
        screenshot("SET-5-live-language-updates-settings-siblings",app:app)
        relaunch(app,screen:"SET-1")
        XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout:20))
        XCTAssertTrue(app.staticTexts["Sync and iCloud"].waitForExistence(timeout:10))
        tap("Language",app:app); XCTAssertTrue(languageBar.waitForExistence(timeout:10)); XCTAssertTrue(picker.label.contains("English"))
        screenshot("SET-5-English-preference-survives-restart",app:app)
    }
    func testCentralLongPressOpensImportInsteadOfRecording() {
        let app=launch(scenario:"shell",screen:"NOW-7")
        let center=app.buttons["central-capture-button"];XCTAssertTrue(center.waitForExistence(timeout:20))
        center.press(forDuration:0.6)
        XCTAssertTrue(button("导入资料",app:app).waitForExistence(timeout:10));screenshot("NOW-7-native-capture-menu",app:app)
        tap("导入资料",app:app)
        XCTAssertTrue(app.navigationBars["导入资料"].waitForExistence(timeout:10))
        XCTAssertFalse(app.navigationBars["说一段"].exists)
    }
    func testRecordsSettingsAndStatusScreenshotMatrix() {
        let matrix:[(String,String)] = [("REC-1","records"),("REC-2","records"),("REC-5","records"),("REC-6","records"),("REC-7","records"),("REC-8","records"),("REC-12","records"),("SET-1","settings"),("SET-2","settings"),("SET-3","settings"),("SET-4","settings"),("SET-5","settings"),("SET-6","settings"),("SET-7","settings"),("SET-8","settings"),("SET-9","settings"),("STA-1","shell-offline"),("STA-2","shell-waiting"),("STA-3","shell-quota"),("STA-7","shell-download"),("STA-9","shell")]
        for (screen,scenario) in matrix {
            let app=launch(scenario:scenario,screen:screen)
            XCTAssertTrue(app.descendants(matching:.any).matching(identifier:"verification-"+screen).firstMatch.waitForExistence(timeout:20),screen)
            if screen == "STA-9" { tap("Trigger anonymous network error",app:app); XCTAssertTrue(button("反馈问题",app:app).waitForExistence(timeout:10)) }
            screenshot(screen+"-anonymous-native",app:app);app.terminate()
        }
    }
}
