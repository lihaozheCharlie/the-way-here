import XCTest
@testable import TWHCore

final class ContentOnlySyncTests: XCTestCase {
    func testContentStillSyncsBothWaysWithoutPublishingOrReplayingOldQueues() async throws {
        let files = FileManager.default
        let base = files.temporaryDirectory.appendingPathComponent("anonymous-content-only-" + UUID().uuidString)
        defer { try? files.removeItem(at: base) }
        let local = base.appendingPathComponent("Phone"), remote = base.appendingPathComponent("Cloud")
        let manifest = SpaceManifest(id: "anonymous-content-only", name: "Anonymous")
        let phone = try SpaceStore(root: local, manifest: manifest, deviceId: "phone")
        let other = try SpaceStore(root: remote, manifest: manifest, deviceId: "other")
        try await phone.initialize(); try await other.initialize()
        let phonePath = try await phone.saveOriginal(text: "ANONYMOUS_PHONE_INPUT", folder: "Phone")
        let otherPath = try await other.saveOriginal(text: "ANONYMOUS_EXISTING_CONTENT", folder: "Other")
        let phoneTask = TaskRequest(space: manifest.id, device: "phone", kind: .build, text: "OLD_ANONYMOUS_REQUEST")
        let otherTask = TaskRequest(space: manifest.id, device: "other", kind: .build, text: "OTHER_ANONYMOUS_REQUEST")
        try await phone.enqueue(phoneTask); try await other.enqueue(otherTask)
        let engine = FileSync(local: local, cloud: remote, ledger: base.appendingPathComponent("ledger.json"))
        _ = try await engine.synchronize(allowPhotos: true)
        _ = try await engine.synchronize(allowPhotos: true)
        XCTAssertEqual(try Data(contentsOf: local.appendingPathComponent(otherPath)), try Data(contentsOf: remote.appendingPathComponent(otherPath)))
        XCTAssertEqual(try Data(contentsOf: remote.appendingPathComponent(phonePath)), try Data(contentsOf: local.appendingPathComponent(phonePath)))
        XCTAssertFalse(files.fileExists(atPath: remote.appendingPathComponent(".mobile/queue/" + phoneTask.id + ".json").path))
        XCTAssertFalse(files.fileExists(atPath: local.appendingPathComponent(".mobile/queue/" + otherTask.id + ".json").path))
        // Existing files remain recoverable; filtering never deletes requests.
        XCTAssertTrue(files.fileExists(atPath: local.appendingPathComponent(".mobile/queue/" + phoneTask.id + ".json").path))
        XCTAssertTrue(files.fileExists(atPath: remote.appendingPathComponent(".mobile/queue/" + otherTask.id + ".json").path))
    }
}
