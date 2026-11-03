import Foundation
import Security

// JSON is exchanged only over the main-process-owned stdin/stdout pipes.
// Neither command-line arguments nor error output ever contain credentials.
struct Request: Decodable { var operation: String; var provider: String?; var token: String?; var acceptanceRun: String? }
struct Response: Encodable { var available: Bool; var reason: String?; var token: String? }
func output(_ value: Response) { if let data = try? JSONEncoder().encode(value) { FileHandle.standardOutput.write(data) } }
// Identity comes from Security's live code objects, never argv[0], environment or caller-supplied PID.
struct ParentIdentity: Equatable { var pid: pid_t; var team: String; var identifier: String; var cdHash: Data }
struct ParentAuthorization {
    static let identifiers: Set<String> = ["com.thewayhere.desktop", "com.thewayhere.desktop.dev"]
    let parentPID: pid_t
    let original: ParentIdentity
    let currentPID: () -> pid_t
    let identity: (pid_t) -> ParentIdentity?
    init?(parentPID: pid_t, helperTeam: String, currentPID: @escaping () -> pid_t, identity: @escaping (pid_t) -> ParentIdentity?) {
        guard parentPID > 1, currentPID() == parentPID, let parent = identity(parentPID), parent.pid == parentPID, parent.team == helperTeam, Self.identifiers.contains(parent.identifier), !parent.cdHash.isEmpty, currentPID() == parentPID else { return nil }
        self.parentPID = parentPID; self.original = parent; self.currentPID = currentPID; self.identity = identity
    }
    func isCurrent() -> Bool { currentPID() == parentPID && identity(parentPID) == original && currentPID() == parentPID }
}
func signingInformation(_ code: SecCode) -> [String: Any]? {
    var staticCode: SecStaticCode?, result: CFDictionary?
    guard SecCodeCopyStaticCode(code, [], &staticCode) == errSecSuccess, let staticCode,
          SecCodeCopySigningInformation(staticCode, SecCSFlags(rawValue: kSecCSSigningInformation), &result) == errSecSuccess else { return nil }
    return result as? [String: Any]
}
func trustedRequirement(team: String, desktopOnly: Bool) -> SecRequirement? {
    guard team.range(of: "^[A-Z0-9]{10}$", options: .regularExpression) != nil else { return nil }
    let desktop = desktopOnly ? " and (identifier \"com.thewayhere.desktop\" or identifier \"com.thewayhere.desktop.dev\")" : ""
    let text = "anchor apple generic and certificate leaf[subject.OU] = \"\(team)\"" + desktop
    var requirement: SecRequirement?
    guard SecRequirementCreateWithString(text as CFString, [], &requirement) == errSecSuccess else { return nil }
    return requirement
}
func helperSigningInformation() -> [String: Any]? {
    var code: SecCode?
    guard SecCodeCopySelf([], &code) == errSecSuccess, let code, let info = signingInformation(code),
          let team = info[kSecCodeInfoTeamIdentifier as String] as? String,
          let requirement = trustedRequirement(team: team, desktopOnly: false),
          SecCodeCheckValidity(code, SecCSFlags(rawValue: kSecCSStrictValidate), requirement) == errSecSuccess else { return nil }
    return info
}
func trustedParent(_ pid: pid_t, team: String) -> ParentIdentity? {
    var code: SecCode?, staticCode: SecStaticCode?
    guard let requirement = trustedRequirement(team: team, desktopOnly: true),
          SecCodeCopyGuestWithAttributes(nil, [kSecGuestAttributePid as String: NSNumber(value: pid)] as CFDictionary, [], &code) == errSecSuccess,
          let code, SecCodeCheckValidity(code, SecCSFlags(rawValue: kSecCSStrictValidate), requirement) == errSecSuccess,
          SecCodeCopyStaticCode(code, [], &staticCode) == errSecSuccess, let staticCode,
          SecStaticCodeCheckValidity(staticCode, SecCSFlags(rawValue: kSecCSStrictValidate | kSecCSCheckNestedCode), requirement) == errSecSuccess,
          let info = signingInformation(code), let identifier = info[kSecCodeInfoIdentifier as String] as? String,
          let actualTeam = info[kSecCodeInfoTeamIdentifier as String] as? String, actualTeam == team,
          let hash = info[kSecCodeInfoUnique as String] as? Data, !hash.isEmpty else { return nil }
    return ParentIdentity(pid: pid, team: actualTeam, identifier: identifier, cdHash: hash)
}
func requestAllowed(_ request: Request) -> Bool {
    guard ["status", "read", "write", "remove"].contains(request.operation), request.acceptanceRun == nil || UUID(uuidString: request.acceptanceRun!) != nil else { return false }
    let allowed = request.acceptanceRun == nil ? ["deepseek", "zhipu", "qwen", "kimi", "openai"] : ["anonymous-phone", "anonymous-mac"]
    return request.provider.map { allowed.contains($0) } ?? (request.operation == "status")
}
func accessGroup(_ info: [String: Any]?) -> String? {
    guard let entitlements = info?[kSecCodeInfoEntitlementsDict as String] as? [String: Any], let groups = entitlements["keychain-access-groups"] as? [String] else { return nil }
    return groups.first { $0.hasSuffix(".com.thewayhere.shared") && !$0.contains("$") }
}
#if TWH_MOBILE_KEYCHAIN_AUTH_TESTS
// Compiled only by the anonymous authorization test command, never enabled by argv or environment.
func runAuthorizationTests() {
    let good = ParentIdentity(pid: 123, team: "ABCD123456", identifier: "com.thewayhere.desktop", cdHash: Data([1, 2, 3]))
    var observed: ParentIdentity? = good, parent: pid_t = 123
    let authorize = { ParentAuthorization(parentPID: 123, helperTeam: "ABCD123456", currentPID: { parent }, identity: { _ in observed }) }
    precondition(trustedRequirement(team: "ABCD123456", desktopOnly: true) != nil)
    precondition(trustedRequirement(team: "bad\" or true", desktopOnly: true) == nil)
    precondition(authorize()?.isCurrent() == true)
    observed?.identifier = "com.unrelated.app"; precondition(authorize() == nil)
    observed = good; observed?.team = "OTHER12345"; precondition(authorize() == nil)
    observed = nil; precondition(authorize() == nil)
    observed = good; let bound = authorize()!; parent = 1; precondition(!bound.isCurrent()); parent = 123
    observed?.cdHash = Data([4]); precondition(!bound.isCurrent())
    observed = good; observed?.identifier = "com.thewayhere.desktop.dev"; precondition(authorize()?.isCurrent() == true)
    // Real metadata lookup of an unsigned/foreign test launcher may never authorize as the desktop app.
    precondition(trustedParent(getppid(), team: "ABCD123456") == nil)
    let anonymousRun = "01234567-89AB-CDEF-0123-456789ABCDEF"
    precondition(requestAllowed(Request(operation: "read", provider: "anonymous-phone", acceptanceRun: anonymousRun)))
    precondition(requestAllowed(Request(operation: "write", provider: "anonymous-mac", token: "anonymous-test-value", acceptanceRun: anonymousRun)))
    precondition(!requestAllowed(Request(operation: "read", provider: "deepseek", acceptanceRun: anonymousRun)))
    precondition(!requestAllowed(Request(operation: "status", provider: "openai", acceptanceRun: anonymousRun)))
    precondition(!requestAllowed(Request(operation: "read", provider: "anonymous-mac", acceptanceRun: "invalid")))
    precondition(!requestAllowed(Request(operation: "read", provider: "anonymous-mac")))
    print("16 anonymous authorization and request-policy checks passed; no SecItem operations executed.")
}
runAuthorizationTests()
#else
// Capture the kernel parent before a potentially blocking read. Reparenting cannot select a new caller.
let launchParentPID = getppid()
let bytes = FileHandle.standardInput.readData(ofLength: 16385)
guard bytes.count <= 16384, let request = try? JSONDecoder().decode(Request.self, from: bytes) else { output(Response(available: false, reason: "请求无效")); exit(0) }
// Acceptance can only address its own UUID service, never a real provider item.
guard request.acceptanceRun == nil || UUID(uuidString:request.acceptanceRun!) != nil else { output(Response(available:false,reason:"验收标识无效")); exit(0) }
let serviceNamespace = "com.thewayhere.mobile.models" + (request.acceptanceRun.map { ".acceptance." + $0.lowercased() } ?? "")
func query(group: String, account: String) -> [String: Any] { [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: serviceNamespace, kSecAttrAccount as String: account, kSecAttrAccessGroup as String: group, kSecAttrSynchronizable as String: true, kSecUseDataProtectionKeychain as String: true] }
let signingInfo = helperSigningInformation()
let authorization: ParentAuthorization? = request.acceptanceRun == nil ? (signingInfo?[kSecCodeInfoTeamIdentifier as String] as? String).flatMap { team in ParentAuthorization(parentPID: launchParentPID, helperTeam: team, currentPID: { getppid() }, identity: { trustedParent($0, team: team) }) } : nil
func ensureCaller() {
    guard request.acceptanceRun != nil || authorization?.isCurrent() == true else { output(Response(available: false, reason: "共享钥匙串只接受同 Team 签名的桌面主程序调用。")); exit(0) }
}
ensureCaller()
guard requestAllowed(request) else { output(Response(available: false, reason: "厂商或操作无效")); exit(0) }
guard let group = accessGroup(signingInfo) else { output(Response(available: false, reason: "此安装包未具备共享钥匙串签名能力。原本机密钥保留；请安装配置了共享组与有效描述文件的版本。")); exit(0) }
ensureCaller()
let probe = SecItemCopyMatching(query(group: group, account: "__capability_probe__") as CFDictionary, nil)
guard probe == errSecSuccess || probe == errSecItemNotFound else { output(Response(available: false, reason: "共享钥匙串不可用，请检查签名描述文件、Apple ID 和钥匙串权限。")); exit(0) }
if request.operation == "status" { output(Response(available: true)); exit(0) }
guard let provider = request.provider, (request.acceptanceRun == nil ? ["deepseek","zhipu","qwen","kimi","openai"] : ["anonymous-phone","anonymous-mac"]).contains(provider) else { output(Response(available: false, reason: "厂商无效")); exit(0) }
var q = query(group: group, account: provider)
switch request.operation {
case "read":
    q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne
    ensureCaller()
    var result: CFTypeRef?; let code = SecItemCopyMatching(q as CFDictionary, &result)
    if code == errSecItemNotFound { output(Response(available: true)); exit(0) }
    guard code == errSecSuccess, let data = result as? Data, data.count <= 8192, let token = String(data: data, encoding: .utf8) else { output(Response(available: false, reason: "无法读取共享钥匙串，未使用本机备份替代。")); exit(0) }
    ensureCaller()
    output(Response(available: true, token: token))
case "write":
    guard let token = request.token, !token.isEmpty, token.utf8.count <= 8192 else { output(Response(available: false, reason: "密钥无效")); exit(0) }
    ensureCaller()
    let data = Data(token.utf8), updated = SecItemUpdate(q as CFDictionary, [kSecValueData as String: data] as CFDictionary)
    var code = updated
    if updated == errSecItemNotFound { ensureCaller(); q[kSecValueData as String] = data; q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock; code = SecItemAdd(q as CFDictionary, nil) }
    output(Response(available: code == errSecSuccess, reason: code == errSecSuccess ? nil : "共享密钥未能保存，本机备份保留。"))
case "remove":
    ensureCaller()
    let code = SecItemDelete(q as CFDictionary); output(Response(available: code == errSecSuccess || code == errSecItemNotFound, reason: code == errSecSuccess || code == errSecItemNotFound ? nil : "共享密钥未能移除。"))
default: output(Response(available: false, reason: "操作无效"))
}

#endif
