import Foundation
import TWHCore

enum ShareImportCoordinator {
    static func importPayload(_ entry: SharePayload, inbox: ShareInbox, store: SpaceStore, spaceID: String) async throws {
        var detectionUnavailable=false
        var metadata: (date: String?, location: String?)?
        var attachments: [(name: String, data: Data)] = [], faces: [String: [FaceAnnotation]] = [:]
        for name in entry.attachments {
            let bytes = try await inbox.attachment(name, itemID: entry.id)
            if ["jpg", "jpeg", "png", "heic"].contains(URL(fileURLWithPath: name).pathExtension.lowercased()) {
                let prepared = try PhotoPreparation.prepare(bytes), filename = URL(fileURLWithPath: name).deletingPathExtension().lastPathComponent + ".jpg"
                detectionUnavailable = detectionUnavailable || prepared.faceDetectionUnavailable
                attachments.append((filename, prepared.jpeg)); faces[filename] = prepared.faces; if metadata == nil { metadata = (prepared.date, prepared.location) }
            } else { attachments.append((name, bytes)) }
        }
        let (path, paths) = try await store.importShare(entry, attachments: attachments)
        if entry.kind == "照片故事", !(try await store.photoDrafts()).contains(where: { $0.id == entry.id }) {
            var draft = PhotoDraft(space: spaceID); draft.id = entry.id; draft.story = [entry.text, entry.note].filter { !$0.isEmpty }.joined(separator: "\n\n")
            if let date = metadata?.date { draft.date = date }; if let location = metadata?.location { draft.location = location }
            for path in paths where faces[URL(fileURLWithPath: path).lastPathComponent] != nil {
                let bytes = try await store.read(path)
                let copy = try await store.savePhoto(bytes, draftId: draft.id)
                draft.photos.append(MemoryPhoto(path: copy, faces: faces[URL(fileURLWithPath: path).lastPathComponent] ?? []))
            }
            try await store.savePhotoDraft(draft)
        }
        if detectionUnavailable {try await store.saveDraft(Draft(space:spaceID,text:"face-detection-unavailable",folder:"照片回忆",kind:"photo-metadata",id:entry.id+"-face-detection"))}
        try await inbox.markImported(entry.id, spaceID: spaceID, path: path)
    }
}
