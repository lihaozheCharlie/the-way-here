import Foundation
import PDFKit
import TWHCore

struct PreparedImportFile {
    var original: Data
    var originalName: String
    var content: Data
    var filename: String
}
/// Phone-executable preparation only. No Mac parser or queued task is involved.
enum ImportFilePreparation {
    static func prepare(_ data: Data, filename: String) throws -> PreparedImportFile {
        guard data.count <= 50_000_000 else { throw MobileError.invalidData("文件超过 50 MB，请选择较小的文件。") }
        let ext = (filename as NSString).pathExtension.lowercased()
        guard ["txt", "md", "pdf"].contains(ext) else { throw MobileError.invalidData("手机支持导入 Markdown、文本和有文字的 PDF 文件。") }
        let content: Data
        if ext == "pdf" {
            guard let pdf = PDFDocument(data: data), let text = pdf.string,
                  !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw MobileError.invalidData("PDF 中没有可提取文字，当前无法导入。") }
            content = Data(text.utf8)
        } else {
            let text = String(data: data, encoding: .utf8) ?? (ext == "txt" ? String(data: data, encoding: .utf16) : nil)
            guard let text, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw MobileError.invalidData("无法读取文件中的文字，请选择 UTF-8 文本或有文字的 PDF。") }
            content = ext == "md" ? data : Data(text.utf8)
        }
        guard content.count <= 50_000_000 else { throw MobileError.invalidData("文件超过 50 MB，请选择较小的文件。") }
        let preparedName = ext == "md" ? filename : (filename as NSString).deletingPathExtension + ".md"
        return PreparedImportFile(original: data, originalName: filename, content: content, filename: preparedName)
    }
}
