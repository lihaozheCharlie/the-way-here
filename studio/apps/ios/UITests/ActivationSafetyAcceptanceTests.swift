import XCTest

final class ActivationSafetyAcceptanceTests: XCTestCase {
    override func setUp() { super.setUp(); continueAfterFailure = false }
    private func launchRollback() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--uitest", "-onboarding.complete", "YES", "-privacy.lock", "NO", "-notifications.tasks", "NO", "-language.interface", "en", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launchEnvironment = ["TWH_UI_TEST_FIXTURE":"activation-" + UUID().uuidString.lowercased(), "TWH_UI_TEST_SCENARIO":"activation-safety", "TWH_UI_TEST_SCREEN":"activation-safety"]
        app.launch(); return app
    }
    private func element(_ id: String, app: XCUIApplication) -> XCUIElement { app.descendants(matching: .any).matching(identifier: id).firstMatch }
    private func findCheck(_ id: String, app: XCUIApplication, file: StaticString = #filePath, line: UInt = #line) -> XCUIElement {
        let target = element("activation-check-" + id, app: app)
        for _ in 0..<9 where !target.exists { app.swipeUp() }
        XCTAssertTrue(target.waitForExistence(timeout: 10), "Missing actual state check: " + id, file: file, line: line)
        return target
    }
    private func attach(_ name: String, app: XCUIApplication) { let attachment = XCTAttachment(screenshot: app.screenshot()); attachment.name = name; attachment.lifetime = .keepAlways; add(attachment) }
    func testCorruptTargetActivationRollsBackAndRemainsIsolatedAfterRestart() {
        let app = launchRollback()
        let run = app.buttons["run-activation-rollback"]
        XCTAssertTrue(run.waitForExistence(timeout: 30)); run.tap()
        let result = element("activation-rollback-result", app: app)
        XCTAssertTrue(result.waitForExistence(timeout: 30)); XCTAssertEqual(result.label, "PASS activation rollback")
        let immediate = ["connection-first-upload-failed", "connection-intent-persisted-before-upload", "connection-first-remote-manifest-absent", "connection-discover-restores-unuploaded-target", "connection-restart-uploads-bound-manifest", "connection-restart-uploads-exact-source", "connection-local-only-stays-local-with-remote-manifest", "connection-unlink-survives-remote-manifest", "connection-local-only-does-not-upload", "connection-unlinked-new-source-does-not-upload", "connection-original-binding-untouched", "connection-fixture-cleaned-and-selection-restored", "activation-threw", "active-restored", "bad-draft-parser-rejected", "documents-restored", "draft-id-restored", "draft-text-restored", "duplicate-activation-rejected", "duplicate-cleared-after-fixture-cleanup", "duplicate-discovery-quarantined", "duplicate-original-binding-preserved", "duplicate-post-failure-save-isolated", "duplicate-valid-spaces-retained", "folder-restored", "old-body-preserved", "old-draft-persisted", "post-failure-save-succeeded", "selected-space-persisted", "store-identity-restored", "target-corruption-preserved", "target-entered-active", "target-has-no-old-content", "target-parser-error-surfaced"].sorted()
        for check in immediate { XCTAssertEqual(findCheck(check, app: app).label, "PASS " + check) }
        attach("activation-real-failure-rollback-and-post-failure-save", app: app)
        app.terminate(); app.launch()
        XCTAssertTrue(result.waitForExistence(timeout: 30)); XCTAssertEqual(result.label, "PASS activation rollback")
        let restarted = ["fresh-process", "restart-active-original", "restart-body-preserved", "restart-documents-original", "restart-draft-id", "restart-draft-text", "restart-folder", "restart-store-original", "restart-target-corruption-preserved", "restart-target-no-old-content"]
        for check in restarted { XCTAssertEqual(findCheck(check, app: app).label, "PASS " + check) }
        let restart = element("activation-restart-result", app: app)
        for _ in 0..<9 where !restart.exists { app.swipeDown() }
        XCTAssertTrue(restart.exists); XCTAssertEqual(restart.label, "PASS restart isolation")
        XCTAssertFalse(element("activation-verification-error", app: app).exists)
        attach("activation-fresh-process-no-old-content-in-corrupt-target", app: app)
    }
    private func assertInvalidCloudAcceptance(run: String, name: String) {
        let app = XCUIApplication()
        // An explicit empty value prevents an inherited runner UUID from turning
        // the missing-UUID case into a real iCloud acceptance run.
        app.launchArguments = ["--icloud-acceptance", "-onboarding.complete", "YES", "-privacy.lock", "NO", "-language.interface", "en", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launchEnvironment = ["TWH_ICLOUD_TEST_RUN": run]
        app.launch()
        XCTAssertTrue(element("acceptance-fail-closed", app: app).waitForExistence(timeout: 20))
        XCTAssertEqual(element("acceptance-invalid-title", app: app).label, "Acceptance configuration invalid")
        XCTAssertEqual(element("acceptance-invalid-state", app: app).label, "PASS fail-closed state")
        for label in ["Start my space", "Speak", "Write", "Settings", "My space", "我的空间", "开始我的空间", "说一段", "设置"] { XCTAssertFalse(app.buttons[label].exists, "Normal-space action appeared: " + label) }
        XCTAssertFalse(app.buttons["central-capture-button"].exists)
        XCTAssertEqual(app.tabBars.count, 0)
        XCTAssertEqual(app.navigationBars.count, 0)
        XCTAssertFalse(app.textViews.firstMatch.exists)
        XCTAssertFalse(app.searchFields.firstMatch.exists)
        attach(name, app: app)
        app.terminate(); app.launch()
        XCTAssertTrue(element("acceptance-fail-closed", app: app).waitForExistence(timeout: 20))
        XCTAssertEqual(element("acceptance-invalid-state", app: app).label, "PASS fail-closed state")
        XCTAssertFalse(app.buttons["central-capture-button"].exists)
    }
    func testICloudAcceptanceWithoutRunUUIDIsFailClosed() { assertInvalidCloudAcceptance(run: "", name: "cloud-acceptance-missing-uuid-diagnostics-only") }
    func testICloudAcceptanceWithMalformedRunUUIDIsFailClosed() { assertInvalidCloudAcceptance(run: "not-an-acceptance-uuid", name: "cloud-acceptance-invalid-uuid-diagnostics-only") }
    func testDuplicateCopiesLeaveIndependentSpacesSelectableAndResumeTheChosenCopy() {
        let app = XCUIApplication()
        app.launchArguments = ["--uitest", "-onboarding.complete", "YES", "-privacy.lock", "NO", "-notifications.tasks", "NO", "-language.interface", "zh-Hans", "-AppleLanguages", "(zh-Hans)", "-AppleLocale", "zh_CN"]
        app.launchEnvironment = ["TWH_UI_TEST_FIXTURE": "identity-" + UUID().uuidString.lowercased(), "TWH_UI_TEST_SCENARIO": "identity-recovery", "TWH_UI_TEST_SCREEN": "identity-recovery"]
        app.launch()
        XCTAssertTrue(app.staticTexts["space-identity-warning"].waitForExistence(timeout: 30))
        // A cold start with the old ambiguous saved ID must also show the picker,
        // including during onboarding, instead of choosing the first valid row.
        app.terminate(); app.launchArguments[2] = "NO"; app.launch()
        XCTAssertTrue(app.staticTexts["space-identity-warning"].waitForExistence(timeout: 30))
        for name in ["Old conflict one", "Old conflict two"] { XCTAssertFalse(app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", name)).firstMatch.exists) }
        let recovered = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Recovered independent copy")).firstMatch
        for _ in 0..<8 where !recovered.exists || !recovered.isHittable { app.swipeUp() }
        XCTAssertTrue(recovered.exists); XCTAssertTrue(recovered.isHittable); recovered.tap()
        XCTAssertTrue(app.navigationBars["先打好招呼"].waitForExistence(timeout: 20))
        let next = app.buttons["继续"]
        for _ in 0..<8 where !next.exists || !next.isHittable { app.swipeUp() }
        XCTAssertTrue(next.exists); next.tap()
        app.buttons["记录"].tap()
        let note = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "RECOVERED INDEPENDENT NOTE")).firstMatch
        XCTAssertTrue(note.waitForExistence(timeout: 20)); note.tap()
        XCTAssertTrue(app.navigationBars["阅读"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Only the explicitly selected independent copy is open."].exists)
        attach("identity-conflicts-quarantined-chosen-new-copy-readable", app: app)
        app.terminate(); app.launchArguments.removeSubrange(1...2); app.launch()
        XCTAssertTrue(note.waitForExistence(timeout: 30)); note.tap()
        XCTAssertTrue(app.navigationBars["阅读"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Only the explicitly selected independent copy is open."].exists)
        attach("identity-safe-copy-resumes-with-legacy-conflicts-still-present", app: app)
    }
}
