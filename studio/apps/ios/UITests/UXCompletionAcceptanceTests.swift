import XCTest

/// Exercises production controls; fictional fixtures supply data and a delayed local SSE peer only.
final class UXCompletionAcceptanceTests: XCTestCase {
    override func setUp() { super.setUp(); continueAfterFailure = false }
    private func launch(_ scenario: String, screen: String, images: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--uitest","-onboarding.complete","YES","-privacy.lock","NO","-notifications.tasks","NO","-model.direct","YES","-model.neverPhotos",images ? "NO" : "YES","-language.interface","zh-Hans","-AppleLanguages","(zh-Hans)","-AppleLocale","zh_CN"]
        app.launchEnvironment = ["TWH_UI_TEST_FIXTURE":"completion-" + UUID().uuidString.lowercased(),"TWH_UI_TEST_SCENARIO":scenario,"TWH_UI_TEST_SCREEN":screen,"TWH_UI_MODEL_FIXTURE":"success"]
        app.launch(); return app
    }
    private func control(_ label: String, _ app: XCUIApplication) -> XCUIElement {
        let exact = app.buttons.matching(NSPredicate(format:"identifier == %@ OR label == %@",label,label)).firstMatch
        if label == "更多" || exact.exists { return exact }
        return app.buttons.matching(NSPredicate(format:"label BEGINSWITH %@",label)).firstMatch
    }
    private func tap(_ label: String, _ app: XCUIApplication, file: StaticString = #filePath, line: UInt = #line) {
        let button = control(label,app)
        for _ in 0..<8 { if button.exists && button.isHittable { break }; app.swipeUp() }
        for _ in 0..<8 { if button.exists && button.isHittable { break }; app.swipeDown() }
        XCTAssertTrue(button.waitForExistence(timeout:15),label,file:file,line:line)
        XCTAssertTrue(button.isHittable,label,file:file,line:line); button.tap()
    }
    private func setToggle(_ label: String, _ enabled: Bool, _ app: XCUIApplication, file: StaticString = #filePath, line: UInt = #line) {
        let toggle = app.switches.matching(NSPredicate(format:"label == %@ OR identifier == %@",label,label)).firstMatch
        let form = app.collectionViews.firstMatch
        let proceed = app.buttons["继续确认发送"]
        XCTAssertTrue(form.waitForExistence(timeout:10),"The foreground send-options form must be present.",file:file,line:line)
        guard form.exists else { return }
        func visibleBounds() -> CGRect {
            let navBottom = app.navigationBars.allElementsBoundByIndex.filter { $0.exists }.map { $0.frame.maxY }.max() ?? form.frame.minY
            let top = max(form.frame.minY,navBottom)
            let bottom = min(form.frame.maxY,proceed.exists ? proceed.frame.minY - 8 : form.frame.maxY)
            return CGRect(x:form.frame.minX,y:top,width:form.frame.width,height:max(0,bottom-top))
        }
        func safelyVisible() -> Bool {
            toggle.exists && toggle.isHittable && visibleBounds().contains(toggle.frame)
        }
        // A partially exposed row can report hittable behind the pinned footer.
        // Scroll the actual sheet form, never the app/sheet dismissal gesture.
        for _ in 0..<10 {
            if safelyVisible() { break }
            if toggle.exists && toggle.frame.midY < visibleBounds().minY { form.swipeDown() }
            else { form.swipeUp() }
        }
        XCTAssertTrue(safelyVisible(),"The complete toggle row must be above the pinned Continue button: " + label,file:file,line:line)
        guard safelyVisible() else { return }
        XCTAssertTrue(toggle.isEnabled,label,file:file,line:line)
        let target = enabled ? "1" : "0"
        if toggle.value as? String != target { toggle.coordinate(withNormalizedOffset:CGVector(dx:0.92,dy:0.5)).tap() }
        let changed = expectation(for:NSPredicate(format:"value == %@",target),evaluatedWith:toggle); wait(for:[changed],timeout:10)
    }
    private func shot(_ name: String, _ app: XCUIApplication) { let item = XCTAttachment(screenshot:app.screenshot()); item.name=name; item.lifetime = .keepAlways; add(item) }
    private func restartProof(_ app: XCUIApplication, checks: [String]) {
        app.terminate(); app.launchEnvironment["TWH_UI_TEST_SCREEN"] = "ux-completion-proof"; app.launch()
        XCTAssertTrue(app.staticTexts["completion.loaded-from-disk"].waitForExistence(timeout:20))
        XCTAssertTrue(app.staticTexts["completion.capture-restore-excludes-internal-drafts"].exists,"Automatic capture restoration must match an on-disk text/voice input, never photo metadata or generated review.")
        for check in checks { XCTAssertTrue(app.staticTexts[check].exists,"Missing actual persisted check: " + check) }
        shot("UX-completion-durable-proof",app)
    }
    func testCopiedRecordLinkReopensOriginalSpaceAfterSwitchAndRestart() {
        let app = launch("ux-completion-link",screen:"ux-completion-records")
        let records = app.buttons.matching(NSPredicate(format:"label BEGINSWITH %@","UX COMPLETION SHARED TITLE"))
        // A sheet can expose an identically labelled row in the underlying tab.
        // Only interact with the real foreground row, never its first stale match.
        let foreground = expectation(for:NSPredicate { _, _ in records.allElementsBoundByIndex.contains(where: { $0.exists && $0.isHittable }) },evaluatedWith:nil)
        wait(for:[foreground],timeout:20)
        guard let record = records.allElementsBoundByIndex.first(where: { $0.exists && $0.isHittable }) else { XCTFail("No foreground record row can receive the actual copy-link long press."); return }
        record.press(forDuration:1)
        tap("复制链接",app)
        tap("Open copied link from fictional B",app)
        XCTAssertTrue(app.navigationBars["阅读"].waitForExistence(timeout:20))
        XCTAssertTrue(app.staticTexts["ORIGINAL_SPACE_A_EXACT_BODY: this fictional record belongs only to A."].exists)
        XCTAssertFalse(app.staticTexts["OTHER_SPACE_B_EXACT_BODY: this distinct fictional record belongs only to B."].exists)
        shot("REC-3-cross-space-real-copied-link-exact-original",app)
        restartProof(app,checks:["completion.copied-link-bound-original"])
    }
    func testUserContextAndStoppedPartialReplyKeepTheirAuthorsAfterRestart() {
        let app = launch("ux-completion-chat",screen:"ux-completion-writing")
        XCTAssertTrue(app.textViews["记录正文"].waitForExistence(timeout:20))
        tap("更多",app); tap("先聊聊这段",app)
        XCTAssertTrue(app.navigationBars["聊聊这段"].waitForExistence(timeout:15))
        XCTAssertTrue(app.staticTexts["UX_COMPLETION_USER_CONTEXT: a wholly fictional quiet afternoon."].exists)
        let input = app.textFields["conversation.input"]
        XCTAssertTrue(input.waitForExistence(timeout:10)); input.tap(); input.typeText("UX_COMPLETION_SECOND_USER: continue this fictional thought.")
        tap("发送",app); tap("确认，使用手机模型",app)
        let partial = app.staticTexts.matching(NSPredicate(format:"label CONTAINS %@","UX_COMPLETION_STREAM_PARTIAL")).firstMatch
        XCTAssertTrue(partial.waitForExistence(timeout:20)); tap("停止",app)
        XCTAssertFalse(app.staticTexts.matching(NSPredicate(format:"label CONTAINS %@","UX_COMPLETION_STREAM_FINAL_SHOULD_NOT_APPEAR")).firstMatch.exists)
        shot("CHT-4-real-stream-stopped-partial",app)
        tap("更多",app); tap("结束并保存",app)
        XCTAssertTrue(app.navigationBars["结束对话与小结"].waitForExistence(timeout:10)); tap("完成",app)
        XCTAssertTrue(app.navigationBars["写一段"].waitForExistence(timeout:15))
        restartProof(app,checks:["completion.conversation-user-role-and-partial-durable","completion.transcript-preserves-user-author"])
    }
    private func clues(_ app: XCUIApplication) -> XCUIElement {
        app.descendants(matching:.any).matching(identifier:"photo-story-clues").firstMatch
    }
    private func storyStep(_ app: XCUIApplication) {
        tap("photo-selection-next",app); tap("photo-naming-next",app)
        XCTAssertTrue(clues(app).waitForExistence(timeout:10))
    }
    private func selectLibrary(_ app: XCUIApplication) {
        let story = app.textViews["照片故事正文，可选择段落重写"]
        // The review editor exists while streaming, when the step picker is
        // deliberately disabled. Wait for the actual response and unlock.
        let complete = expectation(for:NSPredicate(format:"value CONTAINS %@","UX_COMPLETION_STREAM_FINAL_SHOULD_NOT_APPEAR"),evaluatedWith:story)
        wait(for:[complete],timeout:20)
        let steps = app.buttons.matching(NSPredicate(format:"label BEGINSWITH %@","步骤")).firstMatch
        let enabled = expectation(for:NSPredicate { _, _ in steps.exists && steps.isEnabled },evaluatedWith:nil)
        wait(for:[enabled],timeout:10)
        let content = app.scrollViews.matching(identifier:"verification-ux-completion-photos").firstMatch
        func safelyVisible() -> Bool {
            let navBottom = app.navigationBars.allElementsBoundByIndex.filter { $0.exists }.map { $0.frame.maxY }.max() ?? app.frame.minY
            return steps.exists && steps.isEnabled && steps.isHittable && steps.frame.minY >= navBottom && steps.frame.maxY < app.frame.maxY - 34
        }
        for _ in 0..<6 { if safelyVisible() { break }; content.swipeDown() }
        XCTAssertTrue(safelyVisible(),"The enabled step picker must be fully visible before opening its real menu.")
        guard safelyVisible() else { return }
        steps.tap()
        let choices = app.descendants(matching:.any).matching(NSPredicate(format:"label == %@","这组照片"))
        let menuReady = expectation(for:NSPredicate { _, _ in choices.allElementsBoundByIndex.contains { $0.exists && $0.isHittable } },evaluatedWith:nil)
        wait(for:[menuReady],timeout:10)
        guard let choice = choices.allElementsBoundByIndex.first(where: { $0.exists && $0.isHittable }) else { XCTFail("The native photo-step menu did not open."); return }
        choice.tap()
        XCTAssertTrue(app.textFields["给这组照片起个标题"].waitForExistence(timeout:10))
    }
    func testPhotoGroupsKeepSeparateCluesAndPhoneConsentAfterRestartWithoutTasks() {
        let app = launch("ux-completion-photos",screen:"ux-completion-photos",images:true)
        tap("Fictional photo group B",app); storyStep(app)
        XCTAssertEqual(clues(app).value as? String,"CLUES_B_ONLY: fictional blue notebook.")
        tap("请 AI 帮我写",app)
        setToggle("包含线索文字",false,app); setToggle("包含已确认的人物标注",false,app); setToggle("不发照片，仅用文字",true,app); setToggle("本次记住选择",true,app)
        tap("继续确认发送",app); tap("确认，使用手机模型",app)
        XCTAssertTrue(app.textViews["照片故事正文，可选择段落重写"].waitForExistence(timeout:20))
        selectLibrary(app); tap("Fictional photo group A",app); storyStep(app)
        XCTAssertEqual(clues(app).value as? String,"CLUES_A_ONLY: fictional orange umbrella.")
        tap("请 AI 帮我写",app)
        XCTAssertEqual(app.switches["包含线索文字"].value as? String,"1")
        XCTAssertEqual(app.switches["包含已确认的人物标注"].value as? String,"1")
        setToggle("不发照片，仅用文字",false,app); setToggle("本次记住选择",true,app)
        tap("继续确认发送",app); tap("确认，使用手机模型",app)
        XCTAssertTrue(app.textViews["照片故事正文，可选择段落重写"].waitForExistence(timeout:20))
        selectLibrary(app); tap("Fictional photo group B",app); storyStep(app)
        tap("请 AI 帮我写",app)
        XCTAssertEqual(app.switches["包含线索文字"].value as? String,"0")
        XCTAssertEqual(app.switches["包含已确认的人物标注"].value as? String,"0")
        XCTAssertEqual(app.switches["不发照片，仅用文字"].value as? String,"1")
        tap("取消",app)
        shot("PHO-7-PHO-9-two-groups-phone-consent-restored",app)
        restartProof(app,checks:["completion.photo-groups-packets-isolated","completion.photo-groups-originals-isolated","completion.photo-group-consent-isolated","completion.no-task-requests"])
    }
    func testStoppingPhotoStreamRestoresCurrentInputAndKeepsPartialAfterRestart() {
        let app = launch("ux-completion-photo-stop",screen:"ux-completion-photo-review")
        let editor = app.textViews["照片故事正文，可选择段落重写"]
        XCTAssertTrue(editor.waitForExistence(timeout:20)); XCTAssertEqual(editor.value as? String,"GROUP_A_CURRENT_INPUT: fictional afternoon by the painted river.")
        tap("调整这份草稿",app); tap("再写一版",app); tap("继续确认发送",app); tap("确认，使用手机模型",app)
        let began = expectation(for:NSPredicate(format:"value CONTAINS %@","UX_COMPLETION_STREAM_PARTIAL"),evaluatedWith:editor); wait(for:[began],timeout:20)
        tap("取消生成",app)
        let restored = expectation(for:NSPredicate(format:"value == %@","GROUP_A_CURRENT_INPUT: fictional afternoon by the painted river."),evaluatedWith:editor); wait(for:[restored],timeout:15)
        shot("PHO-8-user-stop-restored-current-input",app)
        restartProof(app,checks:["completion.photo-stop-current-and-partial-durable","completion.photo-groups-originals-isolated"])
    }
}
