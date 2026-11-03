import Foundation
import Security
import TWHCore

struct ProviderPreset: Codable, Identifiable {
    var localizedName: String { MobileL10n.text(name) }
    var id: String; var name: String; var baseURL: String; var model: String; var protocolName: String; var supportsImages: Bool
    static var all: [ProviderPreset] {
        guard let url = Bundle.main.url(forResource: "ModelProviders", withExtension: "json"), let data = try? Data(contentsOf: url), let values = try? JSONDecoder().decode([ProviderPreset].self, from: data) else { return [] }
        return values
    }
}
enum CloudKeychain {
    static func query(_ provider: String) throws -> [String: Any] {
        guard let group = Bundle.main.object(forInfoDictionaryKey:"TWHSharedKeychainAccessGroup") as? String, group.contains(".com.thewayhere.shared"), !group.contains("$(") else { throw MobileError.unavailable("此安装包还没有共享钥匙串签名能力，请先配置 Apple 开发者签名。") }
        return [kSecAttrAccessGroup as String: group, kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "com.thewayhere.mobile.models", kSecAttrAccount as String: provider, kSecAttrSynchronizable as String: true]
    }
    static func read(_ provider: String) throws -> String? {
        if CommandLine.arguments.contains("--uitest") {
            if provider == "anonymous-fixture", ModelFixtureMode.supported.contains(ProcessInfo.processInfo.environment["TWH_UI_MODEL_FIXTURE"] ?? ""), ProcessInfo.processInfo.environment["TWH_UI_MODEL_FIXTURE"] != "missing-key" { return "anonymous-fixture-key" }
            return nil
        }
        if CommandLine.arguments.contains("--icloud-acceptance") { return nil }
        var q = try query(provider); q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?; let code = SecItemCopyMatching(q as CFDictionary, &result)
        if code == errSecItemNotFound { return nil }
        guard code == errSecSuccess, let data = result as? Data, let key = String(data: data, encoding: .utf8) else { throw MobileError.unavailable("系统钥匙串暂时不可用，现有密钥未修改。") }
        return key
    }
    static func save(_ key: String, provider: String) throws {
        if CommandLine.arguments.contains("--uitest") || CommandLine.arguments.contains("--icloud-acceptance") { throw MobileError.unavailable("界面验收不访问真实钥匙串。") }
        let bytes = Data(key.utf8), q = try query(provider)
        let update = SecItemUpdate(q as CFDictionary, [kSecValueData as String: bytes] as CFDictionary)
        if update == errSecItemNotFound {
            var item = q; item[kSecValueData as String] = bytes; item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else { throw MobileError.unavailable("密钥未能保存到钥匙串，请重试。") }; return
        }
        guard update == errSecSuccess else { throw MobileError.unavailable("钥匙串更新失败，原密钥已保留。") }
    }
    static func remove(_ provider: String) throws {
        if CommandLine.arguments.contains("--uitest") || CommandLine.arguments.contains("--icloud-acceptance") { throw MobileError.unavailable("界面验收不访问真实钥匙串。") }
        let code = SecItemDelete(try query(provider) as CFDictionary)
        guard code == errSecSuccess || code == errSecItemNotFound else { throw MobileError.unavailable("密钥未能移除，请稍后重试。") }
    }
}
struct ChatMessage: Codable, Identifiable, Equatable {
    var id = UUID().uuidString
    var role: String; var content: String
}
actor ModelClient {
    struct ResponseBody: Decodable { struct Choice: Decodable { struct Message: Decodable { var content: String? }; var message: Message }; var choices: [Choice] }
    private func request(messages: [ChatMessage], images: [Data], preset: ProviderPreset, key: String, streaming: Bool) throws -> URLRequest {
        guard images.isEmpty || preset.supportsImages && !UserDefaults.standard.bool(forKey: "model.neverPhotos") else { throw MobileError.unavailable("当前设置或模型不允许发送照片，请仅使用文字。") }
        guard !key.isEmpty else { throw ModelServiceFailure.notConfigured }
        guard let base = URL(string: preset.baseURL), base.scheme == "https", base.user == nil, base.password == nil else { throw MobileError.invalidData("模型服务地址无效。") }
        let responses = preset.protocolName == "openai-responses"
        let url = base.appendingPathComponent(responses ? "responses" : "chat/completions")
        var request = URLRequest(url: url); request.httpMethod = "POST"; request.timeoutInterval = 120
        request.setValue("Bearer " + key, forHTTPHeaderField: "Authorization"); request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        var bodyMessages: [[String: Any]] = messages.map { ["role": $0.role, "content": $0.content] }
        let replyPreference = UserDefaults.standard.string(forKey: "language.reply") ?? "system"
        let interface = UserDefaults.standard.string(forKey: "language.interface") ?? "system"
        let selectedLanguage = replyPreference == "system" ? interface : replyPreference
        let replyLanguage = selectedLanguage == "system" ? (Locale.preferredLanguages.first?.hasPrefix("en") == true ? "en" : "zh-Hans") : selectedLanguage
        if replyLanguage != "system" { bodyMessages.insert(["role": "system", "content": replyLanguage == "en" ? "Reply in English. Preserve the original language in quotations." : "请用中文回复，引用保留原始语言。"], at: 0) }
        if !images.isEmpty {
            var content: [[String: Any]] = [["type": responses ? "input_text" : "text", "text": messages.last?.content ?? ""]]
            for data in images {
                let url = "data:image/jpeg;base64," + data.base64EncodedString()
                content.append(responses ? ["type": "input_image", "image_url": url] : ["type": "image_url", "image_url": ["url": url]])
            }
            if !bodyMessages.isEmpty { bodyMessages[bodyMessages.count - 1]["content"] = content }
        }
        var payload: [String: Any] = responses ? ["model": preset.model, "input": bodyMessages, "max_output_tokens": 4096] : ["model": preset.model, "messages": bodyMessages, "max_tokens": 4096]
        if streaming { payload["stream"] = true; request.setValue("text/event-stream", forHTTPHeaderField: "Accept") }
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)
        return request
    }
    func complete(messages: [ChatMessage], images: [Data] = [], preset: ProviderPreset, key: String, onDelta: (@MainActor @Sendable (String) -> Void)? = nil) async throws -> String {
        let request = try request(messages: messages, images: images, preset: preset, key: key, streaming: onDelta != nil)
        if let onDelta { return try await stream(request, responses: preset.protocolName == "openai-responses", onDelta: onDelta) }
        let (data, raw) = try await URLSession.shared.data(for: request)
        try validate(raw)
        guard data.count <= 2_000_000 else { throw MobileError.unavailable("模型响应过大，原文已保留。") }
        if preset.protocolName == "openai-responses" {
            let object = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            let output = object?["output"] as? [[String: Any]] ?? []
            let text = output.flatMap { $0["content"] as? [[String: Any]] ?? [] }.compactMap { $0["text"] as? String }.joined(separator: "\n")
            guard !text.isEmpty else { throw MobileError.unavailable("模型未返回文字，请重试。") }; return text
        }
        guard let text = try JSONDecoder().decode(ResponseBody.self, from: data).choices.first?.message.content, !text.isEmpty else { throw MobileError.unavailable("模型未返回文字，请重试。") }; return text
    }
    private func validate(_ raw: URLResponse) throws {
        guard let response = raw as? HTTPURLResponse else { throw ModelServiceFailure.providerUnavailable(nil) }
        guard (200..<300).contains(response.statusCode) else {
            switch response.statusCode {
            case 401, 403: throw ModelServiceFailure.invalidKey
            case 429: throw ModelServiceFailure.rateLimited
            default: throw ModelServiceFailure.providerUnavailable(response.statusCode)
            }
        }
    }
    private func stream(_ request: URLRequest, responses: Bool, onDelta: @MainActor @Sendable (String) -> Void) async throws -> String {
        let (bytes, raw) = try await URLSession.shared.bytes(for: request)
        try validate(raw)
        guard (raw as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Type")?.lowercased().contains("text/event-stream") == true else { throw MobileError.unavailable("这个模型未返回流式响应，请检查模型配置。原话已保留。") }
        var eventLines: [String] = [], text = "", ended = false, receivedBytes = 0
        func consume(_ lines: [String]) async throws {
            let payload = lines.joined(separator: "\n")
            guard !payload.isEmpty else { return }
            if payload == "[DONE]" { ended = true; return }
            let event = try ModelStreamEvent.decode(payload, responses: responses)
            if let failure = event.failure { throw MobileError.unavailable(failure) }
            if !event.delta.isEmpty { text += event.delta; await onDelta(event.delta) }
            if event.finished { ended = true }
        }
        // AsyncBytes.lines drops blank lines on some OS versions. SSE needs those
        // delimiters, so frame UTF-8 bytes before decoding individual JSON events.
        var lineBytes: [UInt8] = [], previousCR = false
        func receiveLine() async throws {
            try Task.checkCancellation()
            guard let line = String(bytes: lineBytes, encoding: .utf8) else { throw MobileError.invalidData("模型流式响应编码无效，原话仍保留。") }
            lineBytes.removeAll(keepingCapacity: true)
            if line.isEmpty { try await consume(eventLines); eventLines = [] }
            else if line.hasPrefix("data:") { eventLines.append(String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces)) }
        }
        for try await byte in bytes {
            receivedBytes += 1
            guard receivedBytes <= 2_000_000 else { throw MobileError.unavailable("模型响应过大，已生成文字与原话仍保留。") }
            if byte == 13 { try await receiveLine(); previousCR = true }
            else if byte == 10 { if !previousCR { try await receiveLine() }; previousCR = false }
            else { previousCR = false; lineBytes.append(byte) }
            if ended { break }
        }
        if !lineBytes.isEmpty && !ended { try await receiveLine() }
        if !eventLines.isEmpty && !ended { try await consume(eventLines) }
        try Task.checkCancellation()
        guard ended else { throw MobileError.unavailable("生成连接提前结束，已生成文字仍保留，请重试。") }
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw MobileError.unavailable("模型未返回文字，请重试。") }
        return text
    }

}
