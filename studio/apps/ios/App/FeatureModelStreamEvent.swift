import Foundation

/// Pure SSE payload decoding, shared by both supported provider protocols.
struct ModelStreamEvent {
    var delta = ""
    var finished = false
    var failure: String?
    static func decode(_ payload: String, responses: Bool) throws -> ModelStreamEvent {
        guard let data = payload.data(using: .utf8), let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { return ModelStreamEvent() }
        if value["error"] != nil { return ModelStreamEvent(failure: "模型生成失败，已生成文字与原话仍保留。") }
        if responses {
            switch value["type"] as? String {
            case "response.output_text.delta": return ModelStreamEvent(delta: value["delta"] as? String ?? "")
            case "response.completed": return ModelStreamEvent(finished: true)
            case "response.failed", "response.incomplete", "error": return ModelStreamEvent(failure: "模型未能完整生成，已生成文字与原话仍保留，请重试。")
            case "response.refusal.delta": return ModelStreamEvent(failure: "模型未能处理这次请求，原话已保留，可以修改后重试。")
            default: return ModelStreamEvent()
            }
        }
        guard let choice = (value["choices"] as? [[String: Any]])?.first else { return ModelStreamEvent() }
        let delta = choice["delta"] as? [String: Any]
        if let refusal = delta?["refusal"] as? String, !refusal.isEmpty { return ModelStreamEvent(failure: "模型未能处理这次请求，原话已保留。") }
        let reason = choice["finish_reason"] as? String
        if reason == "length" || reason == "content_filter" { return ModelStreamEvent(failure: "模型未能完整生成，已生成文字仍保留，可以重试。") }
        return ModelStreamEvent(delta: delta?["content"] as? String ?? "", finished: reason == "stop")
    }
}
