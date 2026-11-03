import XCTest
@testable import TWHCore

final class ManifestCompatibilityTests: XCTestCase {
    func testManifestRejectsProtectedRootsAtEveryDepthAndBothDirectionsOfOverlap() throws {
        let base = SpaceManifest(id:"anonymous-manifest",name:"Anonymous manifest")
        try base.validate()
        for component in [".mobile",".runtime",".git","knowledge-engine","node_modules","mobile-space.json","the-way-here.config.yaml","AGENTS.md"] {
            for prefix in ["", "vault/anonymous/"] {
                for source in [true,false] {
                    var manifest=base
                    if source { manifest.sourcesPath=prefix+component+"/sources" } else { manifest.wikiPath=prefix+component+"/wiki" }
                    XCTAssertThrowsError(try manifest.validate(),"Accepted protected component: \(prefix)\(component)")
                }
            }
        }
        for (source,wiki) in [("corpus","corpus"),("corpus","corpus/wiki"),("corpus/sources","corpus")] {
            var manifest=base;manifest.sourcesPath=source;manifest.wikiPath=wiki
            XCTAssertThrowsError(try manifest.validate(),"Accepted overlapping roots: \(source), \(wiki)")
        }
        var siblings=base;siblings.sourcesPath="corpus/sources";siblings.wikiPath="corpus/sources-old"
        XCTAssertNoThrow(try siblings.validate(),"Sibling name prefixes are not path overlap")
    }
    func testProtectedRootAndOverlapChecksCannotBeBypassedByCaseVariants() throws {
        let base=SpaceManifest(id:"anonymous-case",name:"Anonymous case")
        for component in ["Knowledge-Engine","NODE_MODULES","MOBILE-SPACE.JSON","THE-WAY-HERE.CONFIG.YAML","agents.MD"] {
            var manifest=base;manifest.sourcesPath=component+"/sources"
            XCTAssertThrowsError(try manifest.validate(),"Accepted case variant of a protected root: \(component)")
        }
        var manifest=base;manifest.sourcesPath="corpus/Sources";manifest.wikiPath="corpus/sources/wiki"
        XCTAssertThrowsError(try manifest.validate(),"Accepted roots that overlap on a case-insensitive volume")
    }
    func testPartialCapabilitiesWarnAboutMissingFeaturesButKeepSupportedActionsAvailable() {
        let compatibility=MacCompatibility(version:"anonymous-development",protocolVersion:1,capabilities:[TaskKind.build.rawValue,TaskKind.diary.rawValue])
        XCTAssertTrue(compatibility.requiresMacUpdate)
        XCTAssertFalse(compatibility.requiresPhoneUpdate)
        XCTAssertTrue(compatibility.supports(.build));XCTAssertTrue(compatibility.supports(.diary));XCTAssertFalse(compatibility.supports(.letter))
        XCTAssertEqual(Set(compatibility.affectedFeatures),Set(TaskKind.allCases.filter { ![TaskKind.build,TaskKind.diary].contains($0) }.map(\.title)))
        let full=MacCompatibility(version:"anonymous-development",protocolVersion:1,capabilities:TaskKind.allCases.map(\.rawValue)+["future-unknown-feature"])
        XCTAssertFalse(full.requiresMacUpdate);XCTAssertTrue(full.affectedFeatures.isEmpty)
        let newer=MacCompatibility(version:"anonymous-development",protocolVersion:MobileProtocol.version+1,capabilities:TaskKind.allCases.map(\.rawValue))
        XCTAssertTrue(newer.requiresPhoneUpdate);XCTAssertEqual(newer.affectedFeatures.count,TaskKind.allCases.count)
    }
    private func fixture() async throws -> (SpaceStore,URL) {
        let root=FileManager.default.temporaryDirectory.appendingPathComponent("anonymous-compatibility-"+UUID().uuidString)
        let store=try SpaceStore(root:root,manifest:SpaceManifest(id:"anonymous-compatibility",name:"Anonymous compatibility"),deviceId:"anonymous-phone")
        try await store.initialize();return (store,root)
    }
    private func installSnapshot(_ store:SpaceStore, space:String="anonymous-compatibility", capabilities:[String]?, protocolVersion:Int=1) async throws {
        var snapshot=MobileSnapshot(version:1,knowledgeBaseId:space,updatedAt:MobileProtocol.timestamp(),macVersion:"anonymous-development",pages:[],topics:[])
        snapshot.capabilities=capabilities;snapshot.protocolVersion=protocolVersion
        try await store.writeJSON(snapshot,path:".mobile/snapshot.json")
    }
    func testQueueGatesOnlyTheRequestedCapabilityAndPreservesSourcesAndDrafts() async throws {
        let (store,root)=try await fixture();defer{try? FileManager.default.removeItem(at:root)}
        let original=try await store.saveOriginal(text:"Fictional anonymous source",folder:"Anonymous")
        let bytes=try await store.read(original)
        try await store.saveDraft(Draft(space:"anonymous-compatibility",text:"Fictional draft",id:"anonymous-draft"))
        try await installSnapshot(store,capabilities:[TaskKind.build.rawValue])
        let supported=TaskRequest(space:"anonymous-compatibility",device:"anonymous-phone",kind:.build,text:"Anonymous build",paths:[original])
        try await store.enqueue(supported)
        let unsupported=TaskRequest(space:"anonymous-compatibility",device:"anonymous-phone",kind:.letter,text:"Anonymous letter")
        do {try await store.enqueue(unsupported);XCTFail("Queued an unsupported action")} catch {}
        let requests=try await store.requests();XCTAssertEqual(requests,[supported])
        let after=try await store.read(original);XCTAssertEqual(after,bytes)
        let drafts=try await store.drafts();XCTAssertEqual(drafts.first?.text,"Fictional draft")
    }
    func testUnknownMacCanQueueButKnownLegacyOrFutureProtocolCannotRunTasks() async throws {
        let (store,root)=try await fixture();defer{try? FileManager.default.removeItem(at:root)}
        let waiting=TaskRequest(space:"anonymous-compatibility",device:"anonymous-phone",kind:.diary,text:"Fictional offline diary")
        try await store.enqueue(waiting)
        try await installSnapshot(store,capabilities:nil)
        do {try await store.enqueue(TaskRequest(space:"anonymous-compatibility",device:"anonymous-phone",kind:.diary,text:"Blocked legacy task"));XCTFail("Legacy snapshot authorized a task")} catch {}
        try await installSnapshot(store,capabilities:TaskKind.allCases.map(\.rawValue),protocolVersion:MobileProtocol.version+1)
        do {try await store.enqueue(TaskRequest(space:"anonymous-compatibility",device:"anonymous-phone",kind:.diary,text:"Blocked future task"));XCTFail("New protocol authorized a task")} catch {}
        let requests=try await store.requests();XCTAssertEqual(requests,[waiting])
        _ = try await store.saveOriginal(text:"Still available without a compatible Mac",folder:"Anonymous")
    }
    func testForeignLibrarySnapshotCannotAuthorizeTheCurrentSpacesTask() async throws {
        let (store,root)=try await fixture();defer{try? FileManager.default.removeItem(at:root)}
        try await installSnapshot(store,space:"other-anonymous-space",capabilities:TaskKind.allCases.map(\.rawValue))
        do {try await store.enqueue(TaskRequest(space:"anonymous-compatibility",device:"anonymous-phone",kind:.build,text:"Must reject foreign capability snapshot"));XCTFail("Foreign snapshot authorized a task")} catch {}
        let requests=try await store.requests();XCTAssertTrue(requests.isEmpty)
    }
}
