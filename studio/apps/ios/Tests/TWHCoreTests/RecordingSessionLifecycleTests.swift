import XCTest
@testable import TWHCore

final class RecordingSessionLifecycleTests: XCTestCase {
    func testCancelDuringPermissionWaitCannotActivateRecorder() {
        var session = RecordingSessionLifecycle()
        let pendingPermission = session.beginStart()
        XCTAssertTrue(session.isStarting)
        session.stop()
        XCTAssertFalse(session.isStarting)
        XCTAssertFalse(session.acceptsPendingStart(pendingPermission))
        XCTAssertFalse(session.activate(pendingPermission))
        XCTAssertFalse(session.acceptsResult(pendingPermission))
    }
    func testNewStartSupersedesOldPermissionContinuation() {
        var session = RecordingSessionLifecycle()
        let old = session.beginStart()
        session.stop()
        let current = session.beginStart()
        XCTAssertFalse(session.isCurrent(old))
        XCTAssertFalse(session.activate(old))
        XCTAssertTrue(session.acceptsPendingStart(current))
        XCTAssertTrue(session.activate(current))
        XCTAssertTrue(session.acceptsResult(current))
    }
    func testLateResultsCannotMutateTranscriptAfterStopOrRestart() {
        var session = RecordingSessionLifecycle()
        var transcript = "Already preserved fictional words"
        let old = session.beginStart()
        XCTAssertFalse(session.acceptsResult(old))
        XCTAssertTrue(session.activate(old))
        session.stop()
        if session.acceptsResult(old) { transcript = "Late stale result" }
        XCTAssertEqual(transcript, "Already preserved fictional words")
        let current = session.beginStart()
        XCTAssertTrue(session.activate(current))
        if session.acceptsResult(old) { transcript = "Old session overwrote new one" }
        XCTAssertEqual(transcript, "Already preserved fictional words")
        if session.acceptsResult(current) { transcript += " with a new fictional sentence" }
        XCTAssertEqual(transcript, "Already preserved fictional words with a new fictional sentence")
    }
    func testRepeatedStopNeverRevalidatesOldSession() {
        var session = RecordingSessionLifecycle()
        let old = session.beginStart()
        XCTAssertTrue(session.activate(old))
        session.stop(); session.stop()
        XCTAssertFalse(session.isCurrent(old))
        XCTAssertFalse(session.activate(old))
    }
}
