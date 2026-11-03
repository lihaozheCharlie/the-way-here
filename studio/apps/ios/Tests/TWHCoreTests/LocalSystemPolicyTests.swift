import XCTest
@testable import TWHCore

final class LocalSystemPolicyTests: XCTestCase {
    func testRetiredTaskLinksAreIgnoredEvenWithoutParameters() {
        for route in ["tasks", "task", "retry"] {
            XCTAssertTrue(LocalSystemPolicy.ignoresLegacyTaskURL(URL(string: "thewayhere://\(route)")!))
            XCTAssertTrue(LocalSystemPolicy.ignoresLegacyTaskURL(URL(string: "thewayhere://\(route)?space=fictional&target=old-task")!))
        }
    }
    func testLocalCaptureAndExistingContentLinksRemainAvailable() {
        for route in ["record", "write", "photos", "document", "letter", "topic", "share-photo"] {
            XCTAssertFalse(LocalSystemPolicy.ignoresLegacyTaskURL(URL(string: "thewayhere://\(route)?space=fictional&target=existing")!))
        }
        XCTAssertFalse(LocalSystemPolicy.ignoresLegacyTaskURL(URL(string: "https://retry")!))
    }
    func testDailyCaptureNotificationRoutesLocallyWithoutTaskFallback() {
        XCTAssertEqual(LocalSystemPolicy.notificationURL(rawURL:nil, localRoute:"record")?.absoluteString, "thewayhere://record")
        XCTAssertNil(LocalSystemPolicy.notificationURL(rawURL:nil, localRoute:"tasks"))
        XCTAssertNil(LocalSystemPolicy.notificationURL(rawURL:"thewayhere://retry?space=fictional&target=known",localRoute:nil))
        XCTAssertNil(LocalSystemPolicy.notificationURL(rawURL:"https://example.com",localRoute:nil))
    }
    func testPendingCleanupRequiresExactSpaceAndKnownTaskIdentity() {
        func owns(_ category:String = "TASK_FAILED", _ space:String? = "fictional-a", _ task:String? = "known") -> Bool {
            LocalSystemPolicy.ownsRetiredPendingNotification(category:category,space:space,task:task,expectedSpace:"fictional-a",knownTaskIDs:["known"])
        }
        XCTAssertTrue(owns())
        XCTAssertTrue(owns("TASK_DONE"))
        XCTAssertFalse(owns("LOCAL_CAPTURE"))
        XCTAssertFalse(owns("TASK_FAILED","fictional-b"))
        XCTAssertFalse(owns("TASK_FAILED","fictional-a","unknown"))
        XCTAssertFalse(owns("TASK_FAILED",nil,"known"))
        XCTAssertFalse(owns("TASK_FAILED","fictional-a",nil))
    }
}
