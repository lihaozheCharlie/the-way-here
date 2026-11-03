import XCTest
@testable import TWHCore

final class SheetPresentationQueueTests: XCTestCase {
    func testSpaceSwitchWaitsForRealDismissalBeforeOpeningBoundRoute() {
        var queue = SheetPresentationQueue<String>()
        queue.request("space-A:verification"); queue.didAppear()
        queue.request(nil); queue.request("space-A:person")
        XCTAssertNil(queue.displayed)
        queue.didDismiss()
        XCTAssertEqual(queue.displayed, "space-A:person")
    }
    func testRequestWhilePresentingCannotLoseDismissalCallback() {
        var queue = SheetPresentationQueue<String>()
        queue.request("old"); queue.request("new")
        XCTAssertEqual(queue.displayed, "old")
        queue.didAppear(); XCTAssertNil(queue.displayed)
        queue.didDismiss(); XCTAssertEqual(queue.displayed, "new")
    }
    func testInteractiveDismissalDoesNotReopenOldRoute() {
        var queue = SheetPresentationQueue<String>()
        queue.request("old"); queue.didAppear()
        XCTAssertTrue(queue.dismissByUser()); queue.didDismiss()
        XCTAssertNil(queue.displayed)
    }
    func testLatestPendingRouteWinsWithoutCancellingItsIntent() {
        var queue = SheetPresentationQueue<String>()
        queue.request("old"); queue.didAppear(); queue.request("new")
        XCTAssertFalse(queue.dismissByUser())
        queue.request("latest"); queue.didDismiss()
        XCTAssertEqual(queue.displayed, "latest")
    }
}
