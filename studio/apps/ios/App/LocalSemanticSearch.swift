import Foundation
import NaturalLanguage
import TWHCore

/// Embeddings are supplied by the OS and stay on this device. No content leaves the space.
enum LocalSemanticSearch {
    struct Result { var paths: [String]; var available: Bool }
    static func search(_ query: String, documents: [TWHCore.Document]) -> Result {
        let language = NLLanguageRecognizer.dominantLanguage(for: query) ?? .simplifiedChinese
        guard let embedding = NLEmbedding.sentenceEmbedding(for: language), let vector = embedding.vector(for: query) else { return Result(paths: [], available: false) }
        func cosine(_ other: [Double]) -> Double {
            guard other.count == vector.count else { return 0 }
            let dot = zip(vector, other).reduce(0) { $0 + $1.0 * $1.1 }
            let lengths = sqrt(vector.reduce(0) { $0 + $1 * $1 }) * sqrt(other.reduce(0) { $0 + $1 * $1 })
            return lengths > 0 ? dot / lengths : 0
        }
        let matches = documents.compactMap { document -> (String, Double)? in
            let sections = ([document.title] + document.markdown.components(separatedBy: "\n\n").filter { !$0.isEmpty }.map { String($0.prefix(600)) }).prefix(80)
            let score = sections.compactMap { embedding.vector(for: $0).map(cosine) }.max() ?? 0
            return score >= 0.64 ? (document.path, score) : nil
        }.sorted { $0.1 > $1.1 }
        return Result(paths: matches.prefix(30).map(\.0), available: true)
    }
}
