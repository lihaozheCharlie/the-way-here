import Foundation
import TWHCore

@main struct VerifyCore {
    static func require(_ condition: Bool, _ message: String) throws { if !condition { throw MobileError.invalidData(message) } }
    static func signalledSoon(_ semaphore: DispatchSemaphore) -> Bool { semaphore.wait(timeout: .now() + 0.2) == .success }
    static func waitForSignal(_ semaphore: DispatchSemaphore) async throws {
        let signalled = await withCheckedContinuation { continuation in
            DispatchQueue.global().async { continuation.resume(returning: semaphore.wait(timeout: .now() + 10) == .success) }
        }
        try require(signalled, "并发夹具未在 10 秒内到达预定时序")
    }
    static func main() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("twh-mobile-verification-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = try SpaceStore(root: root, manifest: SpaceManifest(id: "anonymous", name: "匿名测试"), deviceId: "fixture")
        try await store.initialize()
        let path = try await store.saveOriginal(text: "用户原话", folder: "笔记"), original = try await store.read(path)
        let second = try await store.saveOriginal(text: "用户原话", folder: "笔记")
        try require(path != second, "同名记录覆盖")
        try await store.saveEdit(path: path, expectedHash: MobileProtocol.hash(original), markdown: "Mac 新版")
        var conflictPreserved = false
        do { try await store.saveEdit(path: path, expectedHash: MobileProtocol.hash(original), markdown: "iPhone 新版") }
        catch MobileError.conflict(let url) { conflictPreserved = try String(contentsOf: url) == "iPhone 新版" }
        try require(conflictPreserved, "并发修改未保留两个版本")
        let current = try await store.read(path); try require(String(data: current, encoding: .utf8) == "Mac 新版", "Mac 版本被覆盖")
        for invalid in ["../escape", "/absolute", "a//b", "a\\b", "a/./b", "a/../b"] {
            var rejected = false; do { _ = try await store.url(invalid) } catch { rejected = true }; try require(rejected, "越界路径被接受")
        }
        let request = TaskRequest(space: "anonymous", device: "fixture", kind: .letter, text: "写一封信")
        try await store.enqueue(request); try await store.cancel(request.id)
        var duplicateRejected = false; do { try await store.enqueue(request) } catch { duplicateRejected = true }; try require(duplicateRejected, "重复任务覆盖")
        let requests = try await store.requests(); try require(requests == [request], "取消改写了原任务")
        var wrongSpaceRejected = false; do { try await store.saveDraft(Draft(space: "other", text: "不可串库")) } catch { wrongSpaceRejected = true }; try require(wrongSpaceRejected, "草稿串库")
        let demo = try SpaceStore(root: root, manifest: SpaceManifest(id: "demo", name: "演示", readOnly: true), deviceId: "fixture")
        var readOnly = false; do { _ = try await demo.saveOriginal(text: "不写入", folder: "笔记") } catch { readOnly = true }; try require(readOnly, "演示库可写")
        let share = SharePayload(id: "share-fixture", createdAt: MobileProtocol.timestamp(), text: "分享的原话", attachments: ["sample.txt"], folder: "分享", kind: "记录", note: "", knowledgeBaseId: "anonymous")
        let (sharePath, _) = try await store.importShare(share, attachments: [("sample.txt", Data("附件".utf8))])
        let (retriedPath, _) = try await store.importShare(share, attachments: [("sample.txt", Data("附件".utf8))])
        try require(sharePath == retriedPath, "分享重试重复生成来源")
        try await store.trash(path: sharePath); let trashed = try await store.trashEntries(); try require(trashed.count == 1, "删除没有可恢复副本")
        try await store.restoreTrash(trashed[0]); let restored = try await store.read(sharePath); try require(String(data: restored, encoding: .utf8)?.contains("分享的原话") == true, "最近删除恢复丢失原话")
        try await store.createFolder("空文件夹/子目录")
        let folderList = try await store.folders(); try require(folderList.contains("空文件夹/子目录"), "空文件夹未展示")
        let relocated = try await store.move(path: second, folder: "空文件夹")
        let renamed = try await store.rename(path: relocated, name: "新的名称")
        let renamedData = try await store.read(renamed); try require(renamedData.contains(Data("用户原话".utf8)), "移动重命名丢失原文")
        let binary = try await store.importFile(data: Data([1,2,3]), filename: "sample.pdf", folder: "附件")
        try await store.trash(path: binary); let binaryTrash = try await store.trashEntries().first { $0.path == binary }!
        _ = try await store.importFile(data: Data([4,5]), filename: "sample.pdf", folder: "附件")
        try await store.restoreTrash(binaryTrash)
        let binaryData = try await store.read(binary); try require(binaryData == Data([1,2,3]), "非文本附件恢复失败")
        let cloud = root.deletingLastPathComponent().appendingPathComponent("twh-mobile-cloud-fixture-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: cloud, withIntermediateDirectories: true); defer { try? FileManager.default.removeItem(at: cloud) }
        let ledger = root.deletingLastPathComponent().appendingPathComponent(UUID().uuidString + ".ledger"); defer { try? FileManager.default.removeItem(at: ledger) }
        let sync = FileSync(local: root, cloud: cloud, ledger: ledger)
        let firstSync = try await sync.synchronize(allowPhotos: true); try require(firstSync.uploaded > 0, "本地原文没有上传到云端夹具")
        let currentBefore = try await store.read(path)
        try await store.saveEdit(path: path, expectedHash: MobileProtocol.hash(currentBefore), markdown: "离线 iPhone 编辑")
        try Data("离线 Mac 编辑".utf8).write(to: cloud.appendingPathComponent(path), options: .atomic)
        let conflictSync = try await sync.synchronize(allowPhotos: true); try require(conflictSync.conflicts >= 1, "两端离线修改未形成冲突副本")
        let docs = try await store.documents(); try require(docs.contains(where: { $0.markdown == "离线 iPhone 编辑" }) && docs.contains(where: { $0.markdown == "离线 Mac 编辑" }), "双端修改有一份被覆盖")
        // A path discovered on one replica must not traverse a symlink on the other.
        let outside = root.deletingLastPathComponent().appendingPathComponent("twh-outside-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: outside, withIntermediateDirectories: true); defer { try? FileManager.default.removeItem(at: outside) }
        let sourceBase = try await store.url(store.manifest.sourcesPath)
        try FileManager.default.createDirectory(at: sourceBase.appendingPathComponent("linked"), withIntermediateDirectories: true)
        try Data("private boundary fixture".utf8).write(to: sourceBase.appendingPathComponent("linked/sample.md"))
        try FileManager.default.createSymbolicLink(at: cloud.appendingPathComponent(store.manifest.sourcesPath + "/linked"), withDestinationURL: outside)
        var symlinkRejected = false; do { _ = try await sync.synchronize(allowPhotos: true) } catch { symlinkRejected = true }
        try require(symlinkRejected && !FileManager.default.fileExists(atPath: outside.appendingPathComponent("sample.md").path), "同步跟随另一端的符号链接越界")
        try FileManager.default.removeItem(at: cloud.appendingPathComponent(store.manifest.sourcesPath + "/linked"))
        let photo = try await store.savePhoto(Data([1,2,3]), draftId: "photo-links")
        let photoName = URL(fileURLWithPath: photo).lastPathComponent
        let story = try await store.saveOriginal(text: "![照片](" + photoName + ")", folder: "照片回忆/photo-links")
        let movedStory = try await store.move(path: story, folder: "移动后的故事")
        let movedText = String(data: try await store.read(movedStory), encoding: .utf8) ?? ""
        try require(movedText.contains(photo), "移动照片故事后附件链接断开")
        let expiredPath = try await store.saveOriginal(text: "到期删除夹具", folder: "笔记")
        try await store.trash(path: expiredPath)
        var expired = try await store.trashEntries().first { $0.path == expiredPath }!
        expired.deletedAt = MobileProtocol.timestamp(Date().addingTimeInterval(-31 * 24 * 3600))
        try await store.writeJSON(expired, path: ".mobile/trash/" + expired.id + ".json")
        _ = try await sync.synchronize(allowPhotos: true)
        try await store.purgeExpiredTrash()
        _ = try await sync.synchronize(allowPhotos: true)
        let cloudBlob = cloud.appendingPathComponent(".mobile/trash/" + expired.id + ".md")
        try require(!FileManager.default.fileExists(atPath: cloudBlob.path), "云端到期备份未清理")
        let tombstone = try await store.read(".mobile/trash/" + expired.id + ".json")
        let purgedEntry = try JSONDecoder().decode(SpaceStore.TrashEntry.self, from: tombstone)
        try require(purgedEntry.purgedAt != nil, "到期清理丢失删除标记")
        // Pause after the deletion snapshot, then try restoring concurrently.
        // Restore must wait for the shared transaction and survive the next sync.
        let racePath = try await store.saveOriginal(text: "并发恢复夹具", folder: "笔记")
        _ = try await sync.synchronize(allowPhotos: true)
        try await store.trash(path: racePath)
        let raceEntry = try await store.trashEntries().first { $0.path == racePath }!
        let entered = DispatchSemaphore(value: 0), release = DispatchSemaphore(value: 0), restoreStarted = DispatchSemaphore(value: 0), restoreFinished = DispatchSemaphore(value: 0)
        let racingSync = Task.detached { try await sync.synchronize(allowPhotos: true) { done, _ in if done == 0 { entered.signal(); _ = release.wait(timeout: .now() + 10) } } }
        try await waitForSignal(entered)
        let restoration = Task.detached { restoreStarted.signal(); try await store.restoreTrash(raceEntry); restoreFinished.signal() }
        try await waitForSignal(restoreStarted)
        let restoredBeforeRelease = await Task.detached { signalledSoon(restoreFinished) }.value
        release.signal()
        _ = try await racingSync.value; try await restoration.value
        try require(!restoredBeforeRelease, "恢复未等待同步事务，删除快照可能过期")
        _ = try await sync.synchronize(allowPhotos: true)
        let raceLocal = try await store.read(racePath), raceCloud = try Data(contentsOf: cloud.appendingPathComponent(racePath))
        try require(raceLocal == raceCloud && String(data: raceLocal, encoding: .utf8)?.contains("并发恢复夹具") == true, "并发恢复再次被删除")
        let remainingTrash = try await store.trashEntries(); try require(!remainingTrash.contains(where: { $0.id == raceEntry.id }), "恢复状态与回收站不一致")
        print("PASS: native core — unique originals, coordinated conflict copies, path isolation, immutable queue, cancellation, space-bound drafts, read-only demo, idempotent share import, trash restore, source move/rename, empty folders, attachment restore, two-replica offline conflicts, concurrent restore transaction.")
    }
}
