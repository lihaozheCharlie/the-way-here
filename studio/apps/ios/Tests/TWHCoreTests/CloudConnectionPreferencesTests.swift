import XCTest
@testable import TWHCore

final class CloudConnectionPreferencesTests: XCTestCase {
    private func isolated(_ body: (UserDefaults, String) async throws -> Void) async throws {
        let suite = "anonymous-cloud-connection-" + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        try await body(defaults, suite)
    }
    func testFailedFirstUploadRetainsTargetAcrossPreferenceReloadThenReallyRetries() async throws {
        try await isolated { defaults, suite in
            let base = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            defer { try? FileManager.default.removeItem(at: base) }
            let local = base.appendingPathComponent("Local/anonymous-copy"), cloud = base.appendingPathComponent("Cloud"), outside = base.appendingPathComponent("Outside")
            let target = cloud.appendingPathComponent("anonymous-copy")
            let manifest = SpaceManifest(id: "anonymous-space", name: "Anonymous")
            let store = try SpaceStore(root: local, manifest: manifest, deviceId: "anonymous-device")
            try await store.initialize()
            let source = try await store.saveOriginal(text: "FICTIONAL_CLOUD_RETRY_BODY", folder: "Anonymous", title: "Anonymous")
            try FileManager.default.createDirectory(at: target, withIntermediateDirectories: true)
            try FileManager.default.createDirectory(at: outside, withIntermediateDirectories: true)
            // A genuine safety rejection, not a fake FileSync result.
            try FileManager.default.createSymbolicLink(at: target.appendingPathComponent(".mobile"), withDestinationURL: outside)
            let prefs = CloudConnectionPreferences(defaults: defaults)
            try prefs.setLinked(true, spaceID: manifest.id, directory: "anonymous-copy")
            let engine = FileSync(local: local, cloud: target, ledger: base.appendingPathComponent("ledger.json"))
            do { _ = try await engine.synchronize(allowPhotos: true); XCTFail("A linked child must be rejected") } catch MobileError.invalidPath {} catch { XCTFail("Unexpected rejection: \(error)") }
            XCTAssertFalse(FileManager.default.fileExists(atPath: target.appendingPathComponent("mobile-space.json").path))
            XCTAssertTrue(try FileManager.default.contentsOfDirectory(atPath: outside.path).isEmpty)
            // A fresh UserDefaults/store is the restart boundary; no remote
            // manifest and no remembered in-memory Space or FileSync instance.
            let restartedDefaults = try XCTUnwrap(UserDefaults(suiteName: suite))
            let restarted = CloudConnectionPreferences(defaults: restartedDefaults)
            let recovered = try XCTUnwrap(restarted.destination(spaceID: manifest.id, directory: "anonymous-copy", cloudRoot: cloud, hasCloudManifest: false))
            XCTAssertEqual(recovered.path, target.path)
            try FileManager.default.removeItem(at: target.appendingPathComponent(".mobile"))
            let retry = FileSync(local: local, cloud: recovered, ledger: base.appendingPathComponent("restart-ledger.json"))
            _ = try await retry.synchronize(allowPhotos: true)
            let decoded = try JSONDecoder().decode(SpaceManifest.self, from: Data(contentsOf: target.appendingPathComponent("mobile-space.json")))
            XCTAssertEqual(decoded.id, manifest.id)
            let localBytes = try await store.read(source)
            XCTAssertEqual(try Data(contentsOf: target.appendingPathComponent(source)), localBytes)
        }
    }
    func testLocalOnlyAndUnlinkedChoicesNeverRecoverAnUploadDestination() async throws {
        try await isolated { defaults, suite in
            let cloud = URL(fileURLWithPath: "/tmp/anonymous-never-created-cloud")
            let prefs = CloudConnectionPreferences(defaults: defaults)
            XCTAssertNil(try prefs.destination(spaceID: "never-selected", directory: "local-copy", cloudRoot: cloud, hasCloudManifest: false))
            try prefs.setLinked(false, spaceID: "local-only", directory: "local-copy")
            try prefs.setLinked(true, spaceID: "unlinked", directory: "old-copy")
            try prefs.setLinked(false, spaceID: "unlinked", directory: "old-copy")
            let restarted = CloudConnectionPreferences(defaults: try XCTUnwrap(UserDefaults(suiteName: suite)))
            for (id, directory) in [("local-only", "local-copy"), ("unlinked", "old-copy")] {
                XCTAssertNil(try restarted.destination(spaceID: id, directory: directory, cloudRoot: cloud, hasCloudManifest: true))
            }
            XCTAssertEqual(defaults.dictionary(forKey: "sync.cloudBindings") as? [String:String], [:])
        }
    }
    func testExistingRemoteManifestMigratesBindingButDifferentDirectoryCannotReuseIt() async throws {
        try await isolated { defaults, _ in
            let prefs = CloudConnectionPreferences(defaults: defaults)
            let cloud = URL(fileURLWithPath: "/tmp/anonymous-container")
            XCTAssertEqual(try prefs.destination(spaceID: "portable-id", directory: "source-id-portable-id", cloudRoot: cloud, hasCloudManifest: true), cloud.appendingPathComponent("source-id-portable-id"))
            XCTAssertEqual(try prefs.destination(spaceID: "portable-id", directory: "source-id-portable-id", cloudRoot: cloud, hasCloudManifest: false), cloud.appendingPathComponent("source-id-portable-id"))
            XCTAssertThrowsError(try prefs.destination(spaceID: "portable-id", directory: "different-copy", cloudRoot: cloud, hasCloudManifest: true))
            XCTAssertThrowsError(try prefs.setLinked(true, spaceID: "portable-id", directory: "../escape"))
        }
    }
    func testAcceptanceNamespacesCannotReadOrModifyProductionOrOtherRuns() async throws {
        try await isolated { defaults, _ in
            defaults.set(["production-unlinked"], forKey: "sync.detachedSpaces")
            defaults.set(["production-linked": "production-copy"], forKey: "sync.cloudBindings")
            let before = defaults.dictionaryRepresentation()
            let first = CloudConnectionPreferences(defaults: defaults, namespace: "icloud-" + UUID().uuidString)
            let second = CloudConnectionPreferences(defaults: defaults, namespace: "ui-anonymous-fixture")
            let cloud = URL(fileURLWithPath: "/tmp/anonymous-container")
            XCTAssertNil(try first.destination(spaceID: "production-linked", directory: "production-copy", cloudRoot: cloud, hasCloudManifest: false))
            try first.setLinked(true, spaceID: "fixture-space", directory: "fixture-copy")
            try second.setLinked(false, spaceID: "fixture-space", directory: "fixture-copy")
            XCTAssertNotNil(try first.destination(spaceID: "fixture-space", directory: "fixture-copy", cloudRoot: cloud, hasCloudManifest: false))
            XCTAssertNil(try second.destination(spaceID: "fixture-space", directory: "fixture-copy", cloudRoot: cloud, hasCloudManifest: true))
            XCTAssertEqual(defaults.stringArray(forKey: "sync.detachedSpaces"), before["sync.detachedSpaces"] as? [String])
            XCTAssertEqual(defaults.dictionary(forKey: "sync.cloudBindings") as? [String:String], before["sync.cloudBindings"] as? [String:String])
        }
    }
    func testMalformedPreferencesFailClosedWithoutOverwritingExistingBytes() async throws {
        try await isolated { defaults, _ in
            defaults.set("malformed-anonymous-preference", forKey: "sync.cloudBindings")
            let prefs = CloudConnectionPreferences(defaults: defaults)
            XCTAssertThrowsError(try prefs.setLinked(true, spaceID: "anonymous", directory: "anonymous-copy"))
            XCTAssertThrowsError(try prefs.destination(spaceID: "anonymous", directory: "anonymous-copy", cloudRoot: URL(fileURLWithPath: "/tmp/anonymous"), hasCloudManifest: true))
            XCTAssertEqual(defaults.string(forKey: "sync.cloudBindings"), "malformed-anonymous-preference")
            XCTAssertNil(defaults.object(forKey: "sync.detachedSpaces"))
        }
    }
}
