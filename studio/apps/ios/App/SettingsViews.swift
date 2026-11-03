import SwiftUI
import TWHCore
import Photos
import Speech
import LocalAuthentication
import UserNotifications
import AVFoundation
import MessageUI

struct SettingsView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @AppStorage("language.interface") private var interface = "system"
    private var missingKey: Bool { !model.phoneModelAvailable && (UserDefaults.standard.object(forKey: "model.direct") as? Bool ?? true) }
    var body: some View {
        // Recompute the retained parent title when its language child changes the preference.
        let _ = interface
        List {
        Section { NavigationLink { SpaceSettingsView() } label: { VStack(alignment: .leading, spacing: 8) { Label(model.active?.manifest.name ?? MobileL10n.text("我的空间"), systemImage: "books.vertical"); Text(MobileL10n.format("%@ 份记录", [String(describing: model.documents.filter(\.isSource).count)])).font(.subheadline); Text(phoneSyncStatus(model)).font(.caption).foregroundStyle(.secondary) } } }
        Section { settingsLink("同步与 iCloud", attention: !model.online || model.error != nil) { SyncSettingsView() }; settingsLink("AI 助手", attention: missingKey) { ModelSettingsView() }; NavigationLink("语音与输入") { SpeechSettingsView() }; NavigationLink("语言") { LanguageSettingsView() } }
        Section { NavigationLink("隐私与安全") { PrivacySettingsView() }; NavigationLink("通知") { NotificationSettingsView() }; NavigationLink("关于与帮助") { AboutView() }; NavigationLink("系统快捷入口") { SystemEntriesView() } }
    }.navigationTitle(Text(MobileL10n.text("设置"))).navigationBarTitleDisplayMode(.inline).toolbar { Button("完成") { dismiss() } }.task { model.refreshPhoneModelAvailability() }.accessibilityIdentifier("SET-1") }
    private func settingsLink<Destination: View>(_ title: String, attention: Bool, @ViewBuilder destination: () -> Destination) -> some View { NavigationLink(destination: destination) { HStack { Text(LocalizedStringKey(title)); Spacer(); if attention { Image(systemName: "exclamationmark.circle.fill").foregroundStyle(.red).accessibilityLabel("需要处理") } } } }
}
struct SyncSettingsView: View {
    @EnvironmentObject private var model: AppModel
    @AppStorage("sync.wifiPhotos") private var wifi = true
    @AppStorage("sync.lowPowerPause") private var lowPower = true
    @State private var unlink = false
    @State private var refreshing = false
    var body: some View { Form {
        Section("iCloud 状态") {
            Label(phoneSyncStatus(model), systemImage: "icloud").foregroundStyle(model.online ? Theme.blue : Theme.orange)
            Text(model.cloudRoot == nil ? MobileL10n.text("未发现此 App 的 iCloud 容器。请在系统设置登录 Apple 账号，并为 The Way Here 开启 iCloud Drive。") : MobileL10n.text("iCloud Drive 已可用。系统不会向 App 提供 Apple 账号邮箱或完整容量信息。"))
            Text("容量与账号：系统设置 → Apple 账号 → iCloud。App 空间不足时会暂停附件，文字仍保留在本机。").font(.footnote).foregroundStyle(.secondary)
            if model.syncing { ProgressView(value: Double(model.syncCompleted), total: Double(max(1, model.syncTotal))); Text(MobileL10n.format("正在核对 %@ / %@ 个文件", [String(describing: model.syncCompleted), String(describing: model.syncTotal)])).font(.caption) }
            if lowPower && ProcessInfo.processInfo.isLowPowerModeEnabled { Label("低电量模式 · 附件暂停上传", systemImage: "battery.25percent").foregroundStyle(Theme.orange) }
            if wifi && !model.wifi { Label("照片等待 Wi-Fi", systemImage: "wifi").foregroundStyle(Theme.orange) }
            if let error = model.error { Text(MobileL10n.text(error)).font(.caption).foregroundStyle(.red) }
        }
        Section("待上传") {
            if let report = model.latestSyncReport {
                Text(MobileL10n.format("待上传 %@ 项", [String(report.pendingFiles.count)]))
                DisclosureGroup("查看文件") { ForEach(report.pendingFiles) { pending in VStack(alignment: .leading) { Text(URL(fileURLWithPath: pending.path).lastPathComponent); Text(MobileL10n.text(pending.reason)).font(.caption).foregroundStyle(.secondary) } } }
                if report.totalDocuments > 0 { Text(MobileL10n.format("已下载 %@ / %@ 份", [String(report.availableDocuments), String(report.totalDocuments)])) }
                if report.cloudQuotaExceeded { Text("iCloud 空间已满，附件等待上传。文字与原文件保留在本机。").foregroundStyle(.red) }
            } else { Text("同步一次后会显示上传队列。原文始终保留在本机。").font(.caption) }
        }
        LongPendingSyncNotice()
        Section("上传偏好") { Toggle("仅 Wi-Fi 上传照片", isOn: $wifi); Toggle("低电量时暂停附件上传", isOn: $lowPower); Text("文件交给 iCloud 后，由系统继续上传。待上传详情与容量在系统 iCloud 设置中查看。").font(.footnote) }
        Section { if model.active?.cloud == nil && model.cloudRoot != nil { Button("把这个本机空间连接到 iCloud") { model.perform { try await model.setCloudLinked(true) } } }; Button("解除本机与 iCloud 的关联", role: .destructive) { unlink = true }; Text("停止此设备同步后，本机文件与云端文件均保留。").font(.footnote) }
    }.navigationTitle("同步与 iCloud").navigationBarTitleDisplayMode(.inline)
    .safeAreaInset(edge: .bottom, spacing: 0) { BottomActionBar {
        Button(refreshing || model.syncing ? MobileL10n.text("同步中…") : MobileL10n.text("立即同步")) { refreshing = true; Task { await model.refresh(); refreshing = false } }
            .buttonStyle(PrimaryButton()).disabled(refreshing || model.syncing)
    } }.confirmationDialog("停止此设备同步？已保存的内容会保留。", isPresented: $unlink) { Button("停止此设备同步", role: .destructive) { model.perform { try await model.setCloudLinked(false) } } }.accessibilityIdentifier("SET-2") }
}
struct SpeechSettingsView: View {
    @EnvironmentObject private var model: AppModel
    @AppStorage("speech.language") private var language = "zh-CN"
    @AppStorage("speech.punctuation") private var punctuation = true
    @AppStorage("speech.paragraphs") private var paragraphs = true
    @AppStorage("speech.keepAudio") private var keep = true
    @AppStorage("speech.undo") private var undo = true
    @AppStorage("speech.vocabulary") private var vocabulary = ""
    private var people: [String] { model.documents.filter { $0.category == "entities" }.map(\.title) }
    private var locale: Locale { Locale(identifier: language == "auto" ? Locale.preferredLanguages.first ?? "zh-CN" : language) }
    private var localAvailable: Bool { (language == "auto" ? Locale.preferredLanguages : [language]).contains { SFSpeechRecognizer(locale: Locale(identifier: $0))?.supportsOnDeviceRecognition == true } }
    private var dialects: [String] { SFSpeechRecognizer.supportedLocales().map(\.identifier).filter { $0.hasPrefix("zh") || $0.hasPrefix("yue") }.sorted() }
    var body: some View { Form {
        Section("识别语言") { Picker("识别语言", selection: $language) { Text("自动（跟随系统语言）").tag("auto"); Text("简体中文").tag("zh-CN"); Text("English").tag("en-US"); ForEach(dialects.filter { !["zh-CN", "en-US"].contains($0) }, id: \.self) { value in Text(Locale.current.localizedString(forIdentifier: value) ?? value).tag(value) } }
            Label(localAvailable ? MobileL10n.text("当前语言支持本机识别") : MobileL10n.text("本机语言资源尚不可用"), systemImage: localAvailable ? "checkmark.circle" : "exclamationmark.circle").foregroundStyle(localAvailable ? Theme.blue : Theme.orange)
            if !localAvailable { Text("请在系统设置中下载或启用此语言资源，再返回重试。系统不向 App 提供下载百分比；你仍可使用键盘记录。").font(.caption) }
        }
        Section("输入习惯") { Toggle("自动标点", isOn: $punctuation); Toggle("自动分段", isOn: $paragraphs); Toggle("仅本机识别", isOn: .constant(true)).disabled(true); Text("语音识别始终在本机完成。语言资源不可用时提示改用键盘，不会自动切换在线识别。").font(.footnote); Toggle("保留原音频 7 天", isOn: $keep); Toggle("结束后 3 秒内可撤销", isOn: $undo) }
        Section("识别人名与专有词（每行一个）") { TextEditor(text: $vocabulary).frame(minHeight: 160); if !people.isEmpty { Text(MobileL10n.text("从人物页加入：") + people.joined(separator: "、")).font(.caption).foregroundStyle(.secondary) }; Text("这些词仅供本机识别参考，不会改写原始记录。").font(.caption) }
    }.scrollDismissesKeyboard(.interactively).navigationTitle("语音与输入").navigationBarTitleDisplayMode(.inline).onChange(of: vocabulary) { _, _ in updateVocabulary() }.onChange(of: people) { _, _ in updateVocabulary() }.task { updateVocabulary() }.accessibilityIdentifier("SET-3") }
    private func updateVocabulary() { let manual = vocabulary.split(separator: "\n").map { String($0).trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }; UserDefaults.standard.set(Array(Set(manual + people)).sorted().prefix(100).joined(separator: "\n"), forKey: "speech.contextualVocabulary") }
}
struct ModelSettingsView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("model.provider") private var provider = "deepseek"
    @AppStorage("model.direct") private var direct = true
    @AppStorage("model.neverPhotos") private var neverPhotos = false
    @State private var key = ""
    @FocusState private var keyFocused: Bool
    @State private var suffix = ""
    @State private var testing = false
    @State private var result = ""
    @State private var succeeded = false
    @State private var remove = false
    @State private var returningFromProvider = false
    @State private var suggestPaste = false
    var body: some View { Form {
        Section("当前模型") {
            Picker("厂商与模型", selection: $provider) { ForEach(ProviderPreset.all) { Text($0.localizedName + " · " + $0.model).tag($0.id) } }
            Button("获取 API Key（前往厂商）", systemImage:"arrow.up.right.square") { returningFromProvider = true; UIApplication.shared.open(keyURL) }
            SecureField("粘贴 API Key", text: $key).focused($keyFocused).submitLabel(.done).onSubmit { keyFocused = false }.textContentType(.password).autocorrectionDisabled().textInputAutocapitalization(.never)
            if suggestPaste { Text("已返回厂商页面，可粘贴刚复制的 Key；应用不会自动读取剪贴板。").font(.caption); PasteButton(payloadType:String.self) { values in if let value = values.first { key = value.trimmingCharacters(in:.whitespacesAndNewlines); suggestPaste = false } } }
            if !suffix.isEmpty { Text(MobileL10n.format("已从钥匙串读取 · 尾号 %@", [String(describing: suffix)])).font(.footnote) } else { Label("尚未配置此模型的 Key", systemImage: "key").font(.footnote).foregroundStyle(Theme.orange) }
            Text("Key 仅保存在系统钥匙串，不会写入记录文件。手机只向你选择的模型厂商直接发送经过确认的材料。").font(.footnote).foregroundStyle(.secondary)
            if !result.isEmpty { Label(MobileL10n.text(result), systemImage: succeeded ? "checkmark.circle" : "exclamationmark.circle").font(.footnote).foregroundStyle(succeeded ? Theme.blue : .red) }
        }
        Section("发送策略") { Toggle("让手机直接调用模型", isOn: $direct); Toggle("从不发送照片", isOn: $neverPhotos); Text("关闭手机直连后隐藏 AI 功能，仍可记录、保存和阅读已有内容。每次发送前仍可检查材料与接收方。").font(.footnote) }
        Button("移除共享 Key", role: .destructive) { remove = true }.disabled(suffix.isEmpty)
        Button("稍后设置") { dismiss() }
    }.scrollDismissesKeyboard(.interactively).navigationTitle("AI 助手").navigationBarTitleDisplayMode(.inline)
    .safeAreaInset(edge: .bottom, spacing: 0) { BottomActionBar {
        Button { keyFocused = false; test() } label: { HStack { if testing { ProgressView() }; Text(testing ? MobileL10n.text("测试中…") : MobileL10n.text("保存并测试连接")).multilineTextAlignment(.center) } }
            .buttonStyle(PrimaryButton()).disabled(testing)
    } }.onChange(of:scenePhase) { _, phase in if phase == .active { model.refreshPhoneModelAvailability(); if returningFromProvider { returningFromProvider = false; suggestPaste = true } } }.task(id: provider) { loadKey(); model.refreshPhoneModelAvailability() }.onChange(of: direct) { _, _ in model.refreshPhoneModelAvailability() }.onDisappear { model.refreshPhoneModelAvailability() }.confirmationDialog("从 iCloud 钥匙串移除？使用这份共享 Key 的其他设备也将失效。", isPresented: $remove) { Button("移除 Key", role: .destructive) { do { try CloudKeychain.remove(provider); suffix = ""; key = ""; result = "共享 Key 已移除"; succeeded = true; model.refreshPhoneModelAvailability() } catch { result = error.localizedDescription; succeeded = false } } }.accessibilityIdentifier("SET-4") }
    private var keyURL: URL {
        let addresses = ["deepseek":"https://platform.deepseek.com/api_keys","zhipu":"https://bigmodel.cn/usercenter/proj-mgmt/apikeys","qwen":"https://bailian.console.aliyun.com/","kimi":"https://platform.kimi.com/console/api-keys","openai":"https://platform.openai.com/api-keys"]
        return URL(string:addresses[provider] ?? "https://platform.deepseek.com/api_keys")!
    }
    private func loadKey() { do { suffix = String((try CloudKeychain.read(provider) ?? "").suffix(4)); key = ""; result = "" } catch { result = error.localizedDescription; succeeded = false } }
    private func test() {
        guard let preset = ProviderPreset.all.first(where: { $0.id == provider }) else { return }; testing = true; result = ""; let boundProvider = provider, inputKey = key
        Task { defer { testing = false }; do { let token = inputKey.isEmpty ? try CloudKeychain.read(boundProvider) ?? "" : inputKey; guard !token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw MobileError.unavailable("请先填写 API Key；也可以稍后设置，继续本机记录与阅读。") }; _ = try await ModelClient().complete(messages: [ChatMessage(role: "user", content: "Reply only OK.")], preset: preset, key: token); try CloudKeychain.save(token, provider: boundProvider); model.refreshPhoneModelAvailability(); if provider == boundProvider { suffix = String(token.suffix(4)); key = ""; result = "连接成功，密钥已保存"; succeeded = true } } catch { if provider == boundProvider { result = error.localizedDescription; succeeded = false } } }
    }
}
struct LanguageSettingsView: View {
    @AppStorage("language.interface") private var interface = "system"
    @AppStorage("language.reply") private var reply = "system"
    var body: some View { Form { Picker("界面语言", selection: $interface) { Text("跟随系统").tag("system"); Text("中文").tag("zh-Hans"); Text("English").tag("en") }.accessibilityIdentifier("interface-language-picker"); Picker("AI 回复语言", selection: $reply) { Text("跟随界面").tag("system"); Text("中文").tag("zh-Hans"); Text("English").tag("en") }; Text("原始记录的语言保持不变，不会自动翻译。").font(.footnote) }.navigationTitle(Text(MobileL10n.text("语言"))).navigationBarTitleDisplayMode(.inline).environment(\.locale, interface == "system" ? .current : Locale(identifier: interface)).accessibilityElement(children: .contain).accessibilityIdentifier("SET-5") }
}
struct PrivacySettingsView: View {
    @EnvironmentObject private var model: AppModel
    @AppStorage("privacy.lock") private var lock = false
    @AppStorage("privacy.hidePreview") private var hide = true
    @AppStorage("privacy.lockMinutes") private var minutes = 0
    @State private var archive: URL?
    @State private var bound: BoundSpace?
    @State private var verifying = false
    @State private var authError = ""
    private var biometrics: Bool { LAContext().canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil) }
    var body: some View { Form {
        Section("App 锁") {
            Toggle(biometrics ? MobileL10n.text("Face ID / Touch ID 与设备密码") : MobileL10n.text("使用设备密码保护"), isOn: Binding(get: { lock }, set: setLock)).disabled(verifying)
            if verifying { ProgressView("验证身份…") }
            if !authError.isEmpty { Text(MobileL10n.text(authError)).font(.caption).foregroundStyle(.red); Button("重新验证") { setLock(true) } }
            Picker("重新锁定", selection: $minutes) { Text("立即").tag(0); Text("1 分钟后").tag(1); Text("5 分钟后").tag(5) }; Toggle("切后台隐藏内容预览", isOn: $hide)
            Text("打开或回到前台时验证；系统生物识别失败后可使用设备密码。").font(.caption)
        }
        Section("数据在哪") { Text("记录先保存在本机，可由你的 iCloud 在设备间同步。只有你确认的材料会直接发送给所选模型厂商。没有第三方中转服务器。").font(.subheadline) }
        NavigationLink("最近删除 · 保留 30 天") { TrashView() }
        Section("导出与缓存") { Button("准备导出当前空间") { guard let bound else { return }; model.perform { archive = try await bound.store.exportArchive() } }; if let archive { ShareLink(item: archive) { Label("分享 Markdown 空间备份", systemImage: "square.and.arrow.up") } }; Text("备份可能包含私人记录，分享前请确认接收方。").font(.caption); Button("清除本机缓存") { URLCache.shared.removeAllCachedResponses(); model.message = "缓存已清理，原文与草稿保留" }; Text("清理缓存不会删除原文与草稿；尚未上传的文件不是缓存。").font(.footnote) }
        Section("本机诊断") { NavigationLink("预览与分享诊断信息") { DiagnosticsView() }; Text("仅在你选择分享时导出，不自动发送；不包含记录、密钥或文件路径。").font(.caption) }
    }.navigationTitle("隐私与安全").navigationBarTitleDisplayMode(.inline).task { bound = model.boundSpace }.accessibilityIdentifier("SET-6") }
    private func setLock(_ value: Bool) { guard !verifying else { return }; verifying = true; authError = ""; Task { defer { verifying = false }; do { let context = LAContext(); var error: NSError?; guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else { throw MobileError.unavailable("请先在系统设置启用设备密码，再设置 App 锁。") }; if try await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: value ? "开启生活记录保护" : "关闭生活记录保护") { lock = value } } catch { authError = error.localizedDescription } } }
}
struct TrashView: View {
    @EnvironmentObject private var model: AppModel
    @State private var entries: [SpaceStore.TrashEntry] = []
    @State private var bound: BoundSpace?
    var body: some View { List {
        Text("删除记录保留 30 天。恢复后会同步到你的其他设备。").font(.footnote)
        ForEach(entries) { entry in VStack(alignment: .leading, spacing: 8) { Text(URL(fileURLWithPath: entry.path).lastPathComponent); Text(entry.deletedAt).font(.caption); Button("恢复") { guard let bound else { return }; model.perform { try await bound.store.restoreTrash(entry); entries = try await bound.store.trashEntries(); await model.refresh() } } } }
        if entries.isEmpty { EmptyMessage(title: "最近删除是空的", detail: "删除记录会在这里保留 30 天。") }
    }.navigationTitle("最近删除").navigationBarTitleDisplayMode(.inline).task { bound = model.boundSpace; if let bound { do { try await bound.store.purgeExpiredTrash(); entries = try await bound.store.trashEntries() } catch { model.error = error.localizedDescription } } } }
}
struct NotificationSettingsView: View {
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("notifications.daily") private var daily = false
    @State private var authorization = UNAuthorizationStatus.notDetermined
    @State private var status = ""
    var body: some View { Form {
        Section("系统通知") {
            if authorization == .denied { Label("系统通知未允许", systemImage: "exclamationmark.triangle.fill").foregroundStyle(.red); Button("去系统设置开启") { openSystemSettings() } }
            else if authorization == .notDetermined { Button("允许系统通知") { Task { await requestPermission() } } }
            else { Label("系统通知已允许", systemImage: "checkmark.circle").foregroundStyle(Theme.blue) }
            if !status.isEmpty { Text(MobileL10n.text(status)).font(.caption).foregroundStyle(.secondary) }
        }
        Section("记录提醒") { Toggle("每天 21:00 提醒我记一笔", isOn: $daily).onChange(of: daily) { _, value in Task { await scheduleDaily(value) } }; Text("默认关闭。提醒由这台 iPhone 安排，你随时可以取消。").font(.caption) }
    }.navigationTitle("通知").navigationBarTitleDisplayMode(.inline).task { await refreshAuthorization() }.onChange(of: scenePhase) { _, value in if value == .active { Task { await refreshAuthorization() } } }.accessibilityIdentifier("SET-7") }
    private func refreshAuthorization() async { authorization = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus }
    private func requestPermission() async { do { let granted = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]); status = granted ? "已允许通知" : "通知未开启，可前往系统设置修改"; await refreshAuthorization() } catch { status = error.localizedDescription } }
    private func scheduleDaily(_ enabled: Bool) async { let center = UNUserNotificationCenter.current(); center.removePendingNotificationRequests(withIdentifiers: ["capture.daily"]); guard enabled else { return }; if authorization == .notDetermined { await requestPermission() }; guard daily else { return }; guard [.authorized, .provisional, .ephemeral].contains(authorization) else { daily = false; status = "请先允许系统通知，再开启记录提醒"; return }; let content = UNMutableNotificationContent(); content.title = "此刻有什么，都可以说说"; content.body = "给今天留下一小段自己的话。"; content.userInfo = ["route": "record"]; do { try await center.add(UNNotificationRequest(identifier: "capture.daily", content: content, trigger: UNCalendarNotificationTrigger(dateMatching: DateComponents(hour: 21), repeats: true))); if !daily { center.removePendingNotificationRequests(withIdentifiers: ["capture.daily"]) } } catch { daily = false; status = error.localizedDescription } }
}
private func openSystemSettings() { if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) } }
struct SpaceSettingsView: View {
    var body: some View { SpaceManagementView() }
}
struct AboutView: View {
    @EnvironmentObject private var model: AppModel
    @State private var taps = 0
    @State private var feedback = false
    private var version: String { Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "development" }
    private var build: String { Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "—" }
    var body: some View { List {
        Section { Text("The Way Here").font(Theme.serif(28)); Text(MobileL10n.format("版本 %@ · 构建 %@", [String(describing: version), String(describing: build)])).onTapGesture { taps += 1 }.accessibilityAddTraits(.isButton); Text("iOS 17+ · 文件协议 1").font(.caption).foregroundStyle(.secondary) }
        Section("帮助与反馈") { Link("使用帮助", destination: URL(string: "https://the-way-here-support.charlielii.chatgpt.site/download/support.html")!); Button("反馈与建议") { feedback = true }; if taps >= 7 { NavigationLink("本机诊断") { DiagnosticsView() } } }
        Section("法律信息") { Link("隐私政策", destination: URL(string: "https://the-way-here-support.charlielii.chatgpt.site/download/privacy.html")!); Link("使用条款 · App Store 标准许可", destination: URL(string: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/")!); NavigationLink("开源许可") { OpenSourceNoticesView() } }
    }.navigationTitle("关于与帮助").navigationBarTitleDisplayMode(.inline).sheet(isPresented: $feedback) { NavigationStack { FeedbackView() } }.accessibilityIdentifier("SET-9") }
}
private func mobileDiagnosticText() -> String {
    let info = Bundle.main.infoDictionary ?? [:]
    return "The Way Here iOS diagnostics\nVersion: \(info["CFBundleShortVersionString"] as? String ?? "development") (\(info["CFBundleVersion"] as? String ?? "0"))\nProtocol: 1\nOS: \(ProcessInfo.processInfo.operatingSystemVersionString)\nNo records, keys, account information, or local paths included."
}
struct DiagnosticsView: View {
    var body: some View { List { Section("分享前预览") { Text(mobileDiagnosticText()).font(.system(.caption, design: .monospaced)).textSelection(.enabled) }; ShareLink(item: mobileDiagnosticText()) { Label("分享诊断信息", systemImage: "square.and.arrow.up") }; Text("诊断信息只在你选择分享时导出。截图或补充操作步骤前，请遮盖私人记录与密钥。").font(.footnote) }.navigationTitle("本机诊断").navigationBarTitleDisplayMode(.inline) }
}
struct FeedbackView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var includeDiagnostic = false
    @State private var bodyText = ""
    @FocusState private var feedbackFocused: Bool
    @State private var composing = false
    var body: some View { Form {
        Section("反馈与建议") { TextEditor(text: $bodyText).focused($feedbackFocused).frame(minHeight: 160); Text("请描述发生了什么、你原本期待什么。请勿填入私人记录或 API Key。").font(.caption); LabeledContent("收件人", value: "644730894@qq.com") }
        Toggle("附上无内容诊断", isOn: $includeDiagnostic)
        if includeDiagnostic { Section("诊断预览") { Text(mobileDiagnosticText()).font(.caption).textSelection(.enabled) } }
        if !MFMailComposeViewController.canSendMail() { Text("这台设备尚未配置系统邮件。你可以复制反馈，再用自己的邮箱发送。").font(.caption) }
    }.scrollDismissesKeyboard(.interactively).navigationTitle("反馈与建议").navigationBarTitleDisplayMode(.inline)
    .safeAreaInset(edge: .bottom, spacing: 0) { BottomActionBar {
        if MFMailComposeViewController.canSendMail() { Button("撰写邮件") { feedbackFocused = false; composing = true }.buttonStyle(PrimaryButton()) }
        else { Button("复制反馈内容") { feedbackFocused = false; UIPasteboard.general.string = bodyText + (includeDiagnostic ? "\n\n" + mobileDiagnosticText() : "") }.buttonStyle(PrimaryButton()); Link("用邮件 App 联系支持", destination: URL(string: "mailto:644730894@qq.com")!).frame(minHeight: 44) }
    } }.toolbar { Button("取消") { dismiss() } }.sheet(isPresented: $composing) { NativeFeedbackMail(bodyText: bodyText, diagnostic: includeDiagnostic ? mobileDiagnosticText() : nil) } }
}
private struct NativeFeedbackMail: UIViewControllerRepresentable {
    var bodyText: String; var diagnostic: String?
    @Environment(\.dismiss) private var dismiss
    final class Coordinator: NSObject, MFMailComposeViewControllerDelegate { var dismiss: () -> Void; init(dismiss: @escaping () -> Void) { self.dismiss = dismiss }; func mailComposeController(_ controller: MFMailComposeViewController, didFinishWith result: MFMailComposeResult, error: Error?) { dismiss() } }
    func makeCoordinator() -> Coordinator { Coordinator { dismiss() } }
    func makeUIViewController(context: Context) -> MFMailComposeViewController { let controller = MFMailComposeViewController(); controller.mailComposeDelegate = context.coordinator; controller.setToRecipients(["644730894@qq.com"]); controller.setSubject("The Way Here iPhone feedback"); controller.setMessageBody(bodyText, isHTML: false); if let diagnostic { controller.addAttachmentData(Data(diagnostic.utf8), mimeType: "text/plain", fileName: "The-Way-Here-diagnostics.txt") }; return controller }
    func updateUIViewController(_ uiViewController: MFMailComposeViewController, context: Context) {}
}
struct OpenSourceNoticesView: View {
    private var license: String { guard let url = Bundle.main.url(forResource: "IOSLegalNotices", withExtension: "json"), let data = try? Data(contentsOf: url), let values = try? JSONDecoder().decode([String: String].self, from: data) else { return "MIT License — the-way-here contributors. See the project repository for the complete license." }; return values["license"] ?? "" }
    var body: some View { ScrollView { Text(license).font(.caption).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading).padding() }.navigationTitle("开源许可").navigationBarTitleDisplayMode(.inline) }
}
struct PermissionsView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var microphone = AVAudioSession.sharedInstance().recordPermission
    @State private var speech = SFSpeechRecognizer.authorizationStatus()
    @State private var photos = PHPhotoLibrary.authorizationStatus(for: .readWrite)
    @State private var notifications = UNAuthorizationStatus.notDetermined
    var body: some View { Form {
        Section("可以稍后再开") {
            VStack(alignment: .leading) { Label("麦克风", systemImage: "mic"); Text(microphone == .granted ? MobileL10n.text("已允许") : microphone == .denied ? MobileL10n.text("麦克风被拒绝，语音录入不可用；仍可键盘记录。") : MobileL10n.text("用于录下你愿意说的一段话。")).font(.caption); Button(microphone == .denied ? MobileL10n.text("打开系统设置") : MobileL10n.text("允许麦克风")) { if microphone == .denied { openSystemSettings() } else { AVAudioSession.sharedInstance().requestRecordPermission { _ in Task { @MainActor in refresh() } } } }.disabled(microphone == .granted) }
            VStack(alignment: .leading) { Label("本机语音识别", systemImage: "waveform"); Text(speech == .authorized ? MobileL10n.text("已允许 · 仅在本机识别") : speech == .denied || speech == .restricted ? MobileL10n.text("语音识别未允许，可前往系统设置开启，或使用键盘。") : MobileL10n.text("把你的话转成文字，识别在本机完成。")).font(.caption); Button(speech == .denied || speech == .restricted ? MobileL10n.text("打开系统设置") : MobileL10n.text("允许语音识别")) { if speech == .denied || speech == .restricted { openSystemSettings() } else { SFSpeechRecognizer.requestAuthorization { _ in Task { @MainActor in refresh() } } } }.disabled(speech == .authorized) }
            PhotoAccessNotice()
            if photos != .limited && photos != .denied && photos != .restricted { VStack(alignment: .leading) { Label("照片", systemImage: "photo"); Text(photos == .limited ? MobileL10n.text("只允许部分照片，系统选择器仍可使用。") : photos == .authorized ? MobileL10n.text("已允许") : photos == .denied || photos == .restricted ? MobileL10n.text("照片访问未允许；你仍可用系统选择器单次选择。") : MobileL10n.text("只访问你允许的照片。")).font(.caption); Button(photos == .denied || photos == .restricted ? MobileL10n.text("打开系统设置") : photos == .limited ? MobileL10n.text("管理可访问的照片") : MobileL10n.text("选择可访问的照片")) { if photos == .denied || photos == .restricted { openSystemSettings() } else if photos == .limited { presentLimitedPhotos() } else { PHPhotoLibrary.requestAuthorization(for: .readWrite) { _ in Task { @MainActor in refresh() } } } }.disabled(photos == .authorized) } }
            VStack(alignment: .leading) { Label("记录提醒", systemImage: "bell"); Text(notifications == .denied ? MobileL10n.text("系统通知被拒绝，仍可在 App 中记录与阅读。") : [.authorized, .provisional, .ephemeral].contains(notifications) ? MobileL10n.text("已允许") : MobileL10n.text("用于你主动开启的本机记录提醒。")).font(.caption); Button(notifications == .denied ? MobileL10n.text("打开系统设置") : MobileL10n.text("允许通知")) { if notifications == .denied { openSystemSettings() } else { model.perform { _ = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]); refresh() } } }.disabled([.authorized, .provisional, .ephemeral].contains(notifications)) }
            Text("拒绝权限不影响文字采集和阅读。我们不会在返回页面时反复请求权限。").font(.footnote)
        }
        NavigationLink("配置 AI 助手") { ModelSettingsView() }
    }.navigationTitle("先打好招呼").navigationBarTitleDisplayMode(.inline)
    .safeAreaInset(edge: .bottom, spacing: 0) { BottomActionBar { AdaptiveActions {
        Button("改用键盘输入") { dismiss(); model.presented = .writing }.buttonStyle(.bordered).frame(minHeight: 44)
        Button("继续") { dismiss() }.buttonStyle(PrimaryButton())
    } } }.task { refresh() }.onChange(of: scenePhase) { _, value in if value == .active { refresh() } }.accessibilityIdentifier("ONB-5") }
    private func refresh() { microphone = AVAudioSession.sharedInstance().recordPermission; speech = SFSpeechRecognizer.authorizationStatus(); photos = PHPhotoLibrary.authorizationStatus(for: .readWrite); Task { notifications = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus } }
    private func presentLimitedPhotos() { guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first, var controller = scene.windows.first(where: \.isKeyWindow)?.rootViewController else { return }; while let presented = controller.presentedViewController { controller = presented }; PHPhotoLibrary.shared().presentLimitedLibraryPicker(from: controller) }
}
struct SystemEntriesView: View {
    @State private var instructions = false
    private var actionButtonSupported: Bool { var system = utsname(); uname(&system); let identifier = withUnsafePointer(to: &system.machine) { $0.withMemoryRebound(to: CChar.self, capacity: 1) { String(cString: $0) } }; guard identifier.hasPrefix("iPhone"), let model = Int(identifier.dropFirst(6).split(separator: ",").first ?? "") else { return false }; if model > 16 { return true }; return identifier == "iPhone16,1" || identifier == "iPhone16,2" }
    var body: some View { List {
        if actionButtonSupported { Section("Action Button") { Label("将操作按钮绑定到“说一段”", systemImage: "button.programmable"); Button("查看设置步骤") { instructions = true }; Text("系统设置 → 操作按钮 → 快捷指令 → 说一段。").font(.caption) } }
        Section("快捷指令与 Siri") { Label("说一段、写一段、找照片、读最近回信", systemImage: "waveform"); Text("在快捷指令 App 中添加 The Way Here 动作，也可以用 Siri 运行命名后的快捷指令。").font(.caption); Text("试试：“嘿 Siri，在 The Way Here 记一笔”。").font(.caption) }
        Section("小组件与控制中心") { Label("锁屏与主屏：说一段、写一段、找照片", systemImage: "rectangle.grid.2x2"); if #available(iOS 18.0, *) { Text("打开控制中心 → 添加控制 → The Way Here → 说一段。").font(.caption) } else { Text("控制中心控件需要 iOS 18；你可以使用锁屏或主屏小组件。").font(.caption) } }
        Section("实时活动与分享") { Text("录音实时活动显示本机录音状态，点按返回 App。"); Text("从其他 App 的系统分享面板选择 The Way Here，文字和附件先保留到本机收件箱。") }
    }.navigationTitle("系统快捷入口").navigationBarTitleDisplayMode(.inline).sheet(isPresented: $instructions) { NavigationStack { List { Label("按住机身左侧的操作按钮", systemImage: "iphone.gen3.radiowaves.left.and.right"); Text("1. 打开系统设置，选择“操作按钮”。"); Text("2. 滑动至“快捷指令”，点按“选取快捷指令”。"); Text("3. 选择 The Way Here 的“说一段”。"); Button("打开应用系统设置") { openSystemSettings() }; Text("iOS 没有公开直达操作按钮设置的链接，请按上方路径选择。").font(.caption) }.navigationTitle("设置操作按钮").navigationBarTitleDisplayMode(.inline).toolbar { Button("完成") { instructions = false } } } }.accessibilityIdentifier("SYS-2") }
}

// Compatibility shells for old view references; no Mac execution surface remains.
struct MacConnectionStatusView: View { var body: some View { EmptyView() } }
struct MacCompatibilityNotice: View { var body: some View { EmptyView() } }
