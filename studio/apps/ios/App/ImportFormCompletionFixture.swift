import SwiftUI
import UIKit
import TWHCore

/// Anonymous local-save checks. No task, worker, receipt, or parser is simulated.
@MainActor enum ImportFormCompletionFixture {
    static let cases = ["md", "text", "pdf-text", "pdf-scan", "unsupported", "oversized"]
    static var inputs: [String: ImportPreviewFile] = [:]
    static var baselineTasks: [String: [String]] = [:]
    private struct Seed: Codable { var filename: String; var data: Data?; var tasks: [String] }
    static func matches(scenario: String) -> Bool { scenario.hasPrefix("import-form-") && cases.contains(String(scenario.dropFirst("import-form-".count))) }
    static func checked(_ model: AppModel) throws -> (String, String, BoundSpace) {
        let env = ProcessInfo.processInfo.environment
        guard UXVerificationFixtures.enabled, let run = env["TWH_UI_IMPORT_RUN"], UUID(uuidString: run) != nil,
              let fixture = env["TWH_UI_TEST_FIXTURE"], fixture == "import-form-" + run.lowercased(),
              let scenario = env["TWH_UI_TEST_SCENARIO"], matches(scenario: scenario),
              model.acceptanceMode, model.cloudAcceptanceRun == nil, model.cloudRoot == nil,
              let bound = model.boundSpace, model.active?.cloud == nil, !bound.manifest.readOnly else { throw MobileError.invalidPath }
        let expected = FileManager.default.temporaryDirectory.standardizedFileURL.resolvingSymlinksInPath().appendingPathComponent("UIFixtures/" + fixture + "/Spaces")
        guard model.localRoot.standardizedFileURL.path == expected.standardizedFileURL.path,
              bound.store.root.standardizedFileURL.path.hasPrefix(expected.standardizedFileURL.path + "/") else { throw MobileError.invalidPath }
        return (fixture, String(scenario.dropFirst("import-form-".count)), bound)
    }
    static func seed(model: AppModel, bound: BoundSpace, scenario: String) async throws {
        guard matches(scenario: scenario) else { return }
        let (fixture, name, _) = try checked(model)
        guard inputs[fixture] == nil else { return }
        let marker = ".mobile/verification-import/" + name + ".json"
        if let bytes = try? await bound.store.read(marker) {
            let saved = try JSONDecoder().decode(Seed.self, from: bytes)
            inputs[fixture] = saved.data.map { ImportPreviewFile(data: $0, filename: saved.filename) } ?? makeInput(name)
            baselineTasks[fixture] = saved.tasks
        } else {
            let input = makeInput(name), tasks = try await bound.store.requests().map(\.id).sorted()
            try await bound.store.writeJSON(Seed(filename: input.filename, data: name == "oversized" ? nil : input.data, tasks: tasks), path: marker, exclusive: true)
            inputs[fixture] = input; baselineTasks[fixture] = tasks
        }
    }
    static func makeInput(_ name: String) -> ImportPreviewFile {
        let data: Data, filename: String
        switch name {
        case "md": data = Data("# ANONYMOUS_LOCAL_MARKDOWN\n\nANONYMOUS_LOCAL_MARKDOWN_BODY\n".utf8); filename = "Anonymous-md.md"
        case "text": data = Data("ANONYMOUS_LOCAL_TEXT_BODY\nA fictional local-only note.\n".utf8); filename = "Anonymous-text.txt"
        case "pdf-text", "pdf-scan":
            data = UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: 300, height: 200)).pdfData { context in
                context.beginPage()
                if name == "pdf-text" { ("AnonymousPdfReadableFixture" as NSString).draw(at: CGPoint(x: 12, y: 30), withAttributes: [.font: UIFont.systemFont(ofSize: 12)]) }
                else {
                    let scan = UIGraphicsImageRenderer(size: CGSize(width: 120, height: 120)).image { image in
                        UIColor.lightGray.setFill(); image.fill(CGRect(x: 0, y: 0, width: 120, height: 120))
                        UIColor.darkGray.setFill(); image.fill(CGRect(x: 10, y: 20, width: 100, height: 4))
                    }; scan.draw(in: CGRect(x: 20, y: 20, width: 120, height: 120))
                }
            }; filename = "Anonymous-" + name + ".pdf"
        case "oversized": data = Data(repeating: 65, count: 50_000_001); filename = "Anonymous-too-large.txt"
        default: data = Data("{\"fictional\":true}".utf8); filename = "Anonymous-unsupported.json"
        }
        return ImportPreviewFile(data: data, filename: filename)
    }
    static func folder(_ name: String) -> String { "Anonymous " + name + " Target" }
    static func proof(_ model: AppModel) async throws -> String {
        let (fixture, name, bound) = try checked(model)
        guard let input = inputs[fixture], let baseline = baselineTasks[fixture] else { throw MobileError.invalidPath }
        var checks = ["no-background-task-created": try await bound.store.requests().map(\.id).sorted() == baseline]
        if ["pdf-scan", "unsupported", "oversized"].contains(name) {
            var absent = true
            for folder in [folder(name), "手机导入"] {
                let path = try await bound.store.url(bound.manifest.sourcesPath + "/" + folder + "/" + input.filename)
                absent = absent && !FileManager.default.fileExists(atPath: path.path)
            }
            checks["rejected-before-saving-any-file"] = absent
        } else {
            let prepared = try ImportFilePreparation.prepare(input.data, filename: input.filename)
            let prefix = bound.manifest.sourcesPath + "/" + folder(name) + "/"
            let bytes = try await bound.store.read(prefix + prepared.filename)
            let raw = try await bound.store.read(prefix + prepared.originalName)
            checks["exact-readable-markdown-bytes"] = bytes == prepared.content
            checks["original-file-preserved-exactly"] = raw == input.data
            checks["real-readable-document-discovered"] = try await bound.store.documents().contains { $0.path == prefix + prepared.filename && $0.markdown == String(decoding: prepared.content, as: UTF8.self) }
            checks["bound-space-unchanged"] = bound.manifest.id == model.active?.id
        }
        return String(decoding: try JSONSerialization.data(withJSONObject: checks, options: [.sortedKeys]), as: UTF8.self)
    }
}
struct ImportFormCompletionVerificationScreen: View {
    @EnvironmentObject private var model: AppModel
    let screen: String
    @State private var input: ImportPreviewFile?
    @State private var proof = ""
    @State private var failure = ""
    var body: some View { Group { if let input { ImportView(prefilled: input) } else { ProgressView("Preparing anonymous local import") } }
        .safeAreaInset(edge: .bottom) { VStack(spacing: 4) {
            Button("Verify actual local save") { Task { do { proof = try await ImportFormCompletionFixture.proof(model) } catch { failure = error.localizedDescription } } }.accessibilityIdentifier("local-import-verify")
            if !proof.isEmpty { Text("Anonymous local proof ready").accessibilityIdentifier("local-import-proof").accessibilityValue(proof) }
            if !failure.isEmpty { Text(failure).foregroundStyle(.red).accessibilityIdentifier("local-import-proof-error") }
        }.font(.caption).padding(6).background(.bar) }
        .task { do { let (fixture, _, bound) = try ImportFormCompletionFixture.checked(model); try await ImportFormCompletionFixture.seed(model: model, bound: bound, scenario: screen); input = ImportFormCompletionFixture.inputs[fixture] } catch { failure = error.localizedDescription } }
    }
}
