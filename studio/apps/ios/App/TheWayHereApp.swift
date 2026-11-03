import SwiftUI
import TWHCore
import AVFoundation
import AppIntents

private enum AppPresentation: Identifiable, Equatable {
    case modal(AppModel.Modal), system(SystemDestination)
    var id: String { switch self { case .modal(let modal): "modal:" + modal.id; case .system(let route): "system:" + route.id } }
}

@main struct TheWayHereApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var model = AppModel()
    @AppStorage("language.interface") private var language = "system"
    @Environment(\.scenePhase) private var scenePhase
    @State private var errorFailures = 0
    @State private var systemPresentation = SheetPresentationQueue<AppPresentation>()
    private var interfaceLocale: Locale { language == "system" ? .current : Locale(identifier: language) }
    private var requestedPresentation: AppPresentation? {
        guard !model.locked, !model.invalidAcceptanceConfiguration else { return nil }
        if let route = model.systemDestination { return .system(route) }
        if let modal = model.presented { return .modal(modal) }
        return nil
    }
    var body: some Scene {
        WindowGroup {
            Group {
                if model.invalidAcceptanceConfiguration { InvalidAcceptanceConfigurationView() }
            else if model.locked { AppLockGate() }
                else if model.onboarding { WelcomeView() }
                else { MobileShell() }
            }
            .environmentObject(model).tint(Theme.blue)
            .preferredColorScheme(.light)
            .task { if !model.locked { await model.bootstrap() } }
            .task(id: scenePhase) {
                guard scenePhase == .active else { return }
                while !Task.isCancelled {
                    do { try await Task.sleep(for: .seconds(15)) } catch { return }
                    await model.refresh()
                }
            }
            .onOpenURL(perform: model.handleURL)
            .onReceive(NotificationCenter.default.publisher(for: .init("twh.deepLink"))) { notification in if let url = notification.object as? URL { model.handleURL(url) } }
            .overlay { if scenePhase != .active && (UserDefaults.standard.object(forKey: "privacy.hidePreview") as? Bool ?? true) { Theme.canvas.ignoresSafeArea().overlay { Image(systemName: "lock.shield").font(.largeTitle).foregroundStyle(Theme.blue) } } }
            .onChange(of: scenePhase) { _, phase in
                if phase == .background { model.perform { try await model.saveDraft() }; model.enteredBackground() }
                if phase == .active { model.enteredForeground() }
            }
            .onChange(of: model.error) { _, value in if value != nil && !model.locked { errorFailures += 1 } }
            .onChange(of: requestedPresentation, initial: true) { _, route in systemPresentation.request(route) }
            .sheet(item: Binding(get: { systemPresentation.displayed }, set: { value in
                if value == nil {
                    let previous = systemPresentation.displayed
                    if systemPresentation.dismissByUser() {
                        switch previous {
                        case .system(let route) where model.systemDestination == route: model.systemDestination = nil
                        case .modal(let modal) where model.presented == modal: model.presented = nil
                        default: break
                        }
                    }
                }
            }), onDismiss: { systemPresentation.didDismiss() }) { destination in
                Group {
                    if model.locked { AppLockGate() }
                    else {
                        switch destination {
                        case .modal(let modal): AppModalView(modal: modal)
                        case .system(let route):
                            if model.active?.id == route.space { SystemDestinationView(destination: route).modifier(ShellErrorAlert()) }
                            else { ProgressView() }
                        }
                    }
                }.environmentObject(model).environment(\.locale, interfaceLocale).onAppear { systemPresentation.didAppear() }
            }
            .alert(MobileL10n.text(ShellErrorDescription(message: model.error ?? "").title), isPresented: Binding(get: { model.error != nil && !model.locked && !model.invalidAcceptanceConfiguration && model.presented == nil && model.systemDestination == nil }, set: { if !$0 && !model.locked { model.error = nil } })) {
                Button("重新检查同步") { model.error = nil; Task { await model.refresh(); if model.error == nil { errorFailures = 0 } } }
                Button("反馈问题") { model.error = nil; presentShellFeedback(model: model) }
                Button("知道了", role: .cancel) { model.error = nil }
            } message: { Text(ShellErrorDescription(message: model.error ?? "").detail(failures: errorFailures)).accessibilityIdentifier("STA-9") }
            .environment(\.locale, interfaceLocale)
        }
    }
}

struct MobileShell: View {
    @EnvironmentObject private var model: AppModel
    @State private var captureMenu = false
    @State private var captureSelection: CaptureQuickAction?
    @State private var captureFrames: [CaptureQuickAction: CGRect] = [:]
    @State private var badgeRevision = 0
    @State private var keyboardVisible = false
    private let tabs = [("此刻", "clock"), ("聊聊", "bubble.left.and.bubble.right"), ("记录", "book"), ("理解", "sparkles")]
    var body: some View {
        VStack(spacing: 0) {
        if showGlobalSync { ShellSyncSummary(compact: true).padding(.horizontal).background(Theme.canvas) }
        TabView(selection: $model.selectedTab) {
            NavigationStack { NowView().modifier(RootToolbar()).navigationBarTitleDisplayMode(.inline).toolbar(.hidden, for: .tabBar) }.toolbar(.hidden, for: .tabBar).tag(0)
            NavigationStack { TopicsView().modifier(RootToolbar()).navigationBarTitleDisplayMode(.inline).toolbar(.hidden, for: .tabBar) }.toolbar(.hidden, for: .tabBar).tag(1)
            NavigationStack { RecordsView().modifier(RootToolbar()).navigationBarTitleDisplayMode(.inline).toolbar(.hidden, for: .tabBar) }.toolbar(.hidden, for: .tabBar).tag(2)
            NavigationStack { UnderstandingView().modifier(RootToolbar()).navigationBarTitleDisplayMode(.inline).toolbar(.hidden, for: .tabBar) }.toolbar(.hidden, for: .tabBar).tag(3)
        }
        .toolbar(.hidden, for: .tabBar)
        .id(model.active?.id)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
            if !keyboardVisible { HStack(spacing: 0) {
                tab(0); tab(1)
                CaptureTriggerButton(disabled: recordingActive, tap: { choose(.speak) }, begin: { guard !recordingActive else { return }; captureSelection = nil; captureMenu = true }, hover: updateSelection, end: { point in
                    guard let point else { captureMenu = false; return }; updateSelection(point)
                    if let action = captureSelection { choose(action) }
                }).frame(width: 56, height: 56).frame(maxWidth: .infinity)
                tab(2); tab(3)
            }.padding(.top, 6).padding(.bottom, 2).background(.bar).overlay(alignment: .top) { Divider() } }
        }.background(Theme.canvas)
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in keyboardVisible = true; captureMenu = false }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in keyboardVisible = false }
        .onAppear { model.processPendingURL() }
        .onReceive(NotificationCenter.default.publisher(for: UserDefaults.didChangeNotification)) { _ in badgeRevision &+= 1 }
        .onChange(of: model.active?.id) { _, _ in captureMenu = false }
        .overlay { if captureMenu { CaptureQuickMenu(selected: captureSelection, choose: choose, close: { captureMenu = false }).onPreferenceChange(CaptureActionFrames.self) { captureFrames = $0 }.transition(.opacity) } }
        .overlay(alignment: .bottom) { if let undo = model.recordingUndo { HStack { Text("语音已加入草稿"); Button("撤销") { model.perform { try await model.undoRecording() } } }.font(.footnote).padding(12).background(.regularMaterial, in: Capsule()).padding(.bottom, 70).task(id: undo.expires) { try? await Task.sleep(for: .seconds(3)); if model.recordingUndo?.expires == undo.expires { model.recordingUndo = nil } } } }
        .overlay(alignment: .top) { if let message = model.message { Text(MobileL10n.text(message)).font(.footnote).padding(12).background(Theme.pale, in: Capsule()).padding().onTapGesture { model.message = nil }.task(id: message) { try? await Task.sleep(for: .seconds(4)); if model.message == message { model.message = nil } } } }
    }
    private var recordingActive: Bool { model.presented == .recording || LiveCapture.activity != nil }
    private var showGlobalSync: Bool { !model.online || model.latestSyncReport?.cloudQuotaExceeded == true || !(model.latestSyncReport?.pendingFiles.isEmpty ?? true) }
    private func updateSelection(_ point: CGPoint) { let next = captureFrames.first { $0.value.insetBy(dx: -8, dy: -8).contains(point) }?.key; if next != captureSelection { UISelectionFeedbackGenerator().selectionChanged(); captureSelection = next } }
    private func choose(_ action: CaptureQuickAction) {
        captureMenu = false; captureSelection = nil; guard !recordingActive else { return }
        switch action {
        case .speak: model.presented = .recording
        case .photos: model.presented = .photos
        case .importFile: model.presented = .importMaterials
        case .write:
            let space = model.active?.id
            model.perform { try await model.saveDraft(); guard model.active?.id == space else { return }; model.draftText = ""; model.draftId = UUID().uuidString.lowercased(); model.presented = .writing }
        }
    }
    private func unread(_ index: Int) -> Int {
        _ = badgeRevision
        guard let space = model.active?.id else { return 0 }
        if index == 1 {
            let seen = UserDefaults.standard.string(forKey: "topics.seenAt." + space) ?? ""
            guard let snapshot = model.snapshot, snapshot.updatedAt > seen else { return 0 }
            let visited = Set(UserDefaults.standard.stringArray(forKey: "topics.state." + space + ".visited") ?? [])
            let hidden = Set(UserDefaults.standard.stringArray(forKey: "topics.state." + space + ".hidden") ?? [])
            return snapshot.topics.filter { !visited.contains($0.id) && !hidden.contains($0.id) }.count
        }
        if index == 3 { return model.documents.filter { $0.category == "letters" && !model.documentFlag("read", document: $0) }.count }
        return 0
    }
    private func tab(_ index: Int) -> some View {
        let count = unread(index)
        return Button { model.selectedTab = index } label: { VStack(spacing: 4) {
            Image(systemName: tabs[index].1).font(.title3).overlay(alignment: .topTrailing) { if count > 0 { Text(count > 9 ? "9+" : String(count)).font(.caption2.weight(.semibold)).foregroundStyle(.white).padding(.horizontal, 4).frame(minWidth: 16, minHeight: 16).background(.red, in: Capsule()).offset(x: 13, y: -8).accessibilityHidden(true) } }
            Text(LocalizedStringKey(tabs[index].0)).font(.caption2).multilineTextAlignment(.center).lineLimit(2)
        }.foregroundStyle(model.selectedTab == index ? Theme.blue : .secondary).frame(maxWidth: .infinity, minHeight: 48) }
        .accessibilityLabel(MobileL10n.text(tabs[index].0) + (count > 0 ? MobileL10n.format("，%@ 项未读", [String(count)]) : ""))
        .accessibilityAddTraits(model.selectedTab == index ? .isSelected : [])
    }
}
private struct AppModalView: View {
    @EnvironmentObject private var model: AppModel
    let modal: AppModel.Modal
    var body: some View {
        NavigationStack {
            Group { switch modal {
            case .recording: RecordingView()
            case .writing: WritingView()
            case .photos: PhotoFlowView()
            case .history: HistoryView()
            case .spaces: SpacesView()
            case .settings: SettingsView()
            case .search: SearchView()
            case .tasks: RecordsView()
            case .folder: FolderPickerView { model.folder = $0 }
            case .newSpace: CreateSpaceView()
            case .cloudConnection: CloudConnectionView()
            case .permissions: PermissionsView()
            case .letters: LettersView()
            case .future: FutureView()
            case .importMaterials: ImportView().toolbar { ToolbarItem(placement: .cancellationAction) { Button("完成") { model.presented = nil } } }
            } }.navigationBarTitleDisplayMode(.inline)
        }.modifier(ShellErrorAlert())
    }
}
struct RootToolbar: ViewModifier {
    @EnvironmentObject private var model: AppModel
    func body(content: Content) -> some View {
        content.toolbar {
            ToolbarItem(placement: .topBarLeading) { Button { model.presented = .spaces } label: { HStack(spacing: 6) { Circle().fill(model.latestSyncReport?.cloudQuotaExceeded == true ? .red : model.online && model.active?.cloud != nil ? .green : Theme.orange).frame(width: 7,height: 7).accessibilityHidden(true); Label(model.active?.manifest.name ?? MobileL10n.text("我的空间"), systemImage: "books.vertical").font(.subheadline.weight(.semibold)).lineLimit(1).frame(maxWidth: 150, alignment: .leading) } }.accessibilityLabel("选择空间") }
            ToolbarItemGroup(placement: .topBarTrailing) { Button("搜索", systemImage: "magnifyingglass") { model.presented = .search }; Button("设置", systemImage: "slider.horizontal.3") { model.presented = .settings } }
        }
    }
}
struct SyncStatusLine: View { var body: some View { ShellSyncSummary() } }
struct WelcomeView: View {
    @EnvironmentObject private var model: AppModel
    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 24) {
                Spacer(); Image(systemName: "waveform.path").font(.system(size: 56)).foregroundStyle(Theme.blue)
                Text("把生活说出来，\n慢慢被理解").font(Theme.serif(36)).fixedSize(horizontal: false, vertical: true).accessibilityIdentifier("welcome-headline")
                Text("在生活现场记下来，在碎片时间读回自己的理解。").font(.body).foregroundStyle(.secondary)
                Label("文字先保存在本机，iCloud 负责同步到其他设备。模型只收到你确认发送的材料。", systemImage: "lock.shield").font(.footnote).foregroundStyle(.secondary)
                Spacer()
                NavigationLink("开始我的空间") { CloudConnectionView() }.buttonStyle(PrimaryButton()).accessibilityIdentifier("welcome-start-own-space")
                Button("先看匿名演示故事") { model.perform { try await model.openDemo(); finish() } }.frame(maxWidth: .infinity, minHeight: 44)
            }.padding(24).background(Theme.canvas).accessibilityElement(children:.contain).accessibilityIdentifier("ONB-1")
        }
    }
    private func finish() { UserDefaults.standard.set(true, forKey: "onboarding.complete"); model.onboarding = false }
}
struct CloudConnectionView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.scenePhase) private var phase
    @State private var checking = false
    @State private var timedOut = false
    @State private var lookup: Task<Void, Never>?
    @State private var timeout: Task<Void, Never>?
    var body: some View {
        Screen {
            Text("连接 iCloud").font(Theme.serif(30))
            Paper {
                if checking { ProgressView("正在查找你的空间…") }
                else { Label(model.cloudRoot == nil ? MobileL10n.text("尚未登录 iCloud") : model.spaces.contains { $0.cloud != nil } ? MobileL10n.text("找到你的 iCloud 空间") : MobileL10n.text("尚未找到空间"), systemImage: model.cloudRoot == nil ? "icloud.slash" : "icloud"); Text("选择已有 iCloud 空间，或在这台 iPhone 新建。内容以 Markdown 文件同步。").font(.subheadline).foregroundStyle(.secondary) }
                if timedOut { Text("系统仍在查找。你可以先在本机试用，查找完成后再重新核对。").font(.footnote) }
            }
            ForEach(model.spaces.filter { $0.cloud != nil }) { space in Button(MobileL10n.format("使用 %@", [String(describing: space.manifest.name)])) { model.perform { try await model.activate(space); finish() } }.buttonStyle(PrimaryButton()) }
            if model.cloudRoot == nil { Button("打开系统设置登录") { UIApplication.shared.open(URL(string: UIApplication.openSettingsURLString)!) }.buttonStyle(.bordered) }
            NavigationLink("新建空间") { CreateSpaceView() }.buttonStyle(.bordered)
            Button("重新查找") { detect() }.disabled(checking)
            Button("稍后再说，先在本机试用") { model.perform { if model.active == nil || model.active?.manifest.readOnly == true { try await model.createSpace(name: availableLocalName, nickname: "", cloud: false) }; finish() } }.frame(minHeight: 44)
        }.navigationTitle("连接空间").accessibilityIdentifier("ONB-2").onAppear { detect() }.onChange(of: phase) { _, value in if value == .active { detect() } }
    }
    private var availableLocalName: String { let base = MobileL10n.text("我的空间"); var name = base, number = 2; while model.spaces.contains(where: { $0.manifest.name == name }) { name = base + " " + String(number); number += 1 }; return name }
    private func detect() {
        guard lookup == nil else { return }; checking = true; timedOut = false
        lookup = Task { await model.bootstrap(); checking = false; lookup = nil; timeout?.cancel(); timeout = nil }
        timeout = Task { do { try await Task.sleep(for: .seconds(8)); try Task.checkCancellation(); if checking { timedOut = true } } catch {} }
    }
    private func finish() { UserDefaults.standard.set(true, forKey: "onboarding.complete"); model.onboarding = false; model.presented = .permissions }
}
struct CreateSpaceView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var name = MobileL10n.text("我的空间"); @State private var nickname = ""; @State private var busy = false
    @State private var failure: String?
    var body: some View {
        Form {
            Section("空间名称") { TextField("我的空间", text: $name) }
            Section("你希望被怎么称呼") { TextField("例如：舟舟", text: $nickname) }
            Section("存放位置") { Label(model.cloudRoot == nil ? MobileL10n.text("本机试用 · 稍后可连接 iCloud") : MobileL10n.text("iCloud · The Way Here（固定）"), systemImage: "icloud") }
            if let failure { Section { Text(MobileL10n.text(failure)).foregroundStyle(.red) } }
            Button(busy ? MobileL10n.text("正在创建…") : failure == nil ? MobileL10n.text("创建空间") : MobileL10n.text("重试创建")) {
                let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !model.spaces.contains(where: { $0.manifest.name == trimmed }) else { failure = "已有同名空间"; return }
                busy = true; failure = nil
                Task { defer { busy = false }; do { try await model.createSpace(name: trimmed, nickname: nickname, cloud: model.cloudRoot != nil); UserDefaults.standard.set(true, forKey: "onboarding.complete"); model.onboarding = false; dismiss(); Task { try? await Task.sleep(for: .milliseconds(350)); model.presented = .permissions } } catch { failure = error.localizedDescription } }
            }.disabled(busy || name.trimmingCharacters(in: .whitespaces).isEmpty)
        }.navigationTitle("新建空间").navigationBarBackButtonHidden(busy).interactiveDismissDisabled(busy).accessibilityIdentifier("ONB-4")
    }
}
struct SpacesView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var switching: String?
    @State private var failure: String?
    @State private var syncRevision = 0
    var body: some View {
        List {
            if switching != nil { ProgressView("正在切换…") }
            if let failure { Text(MobileL10n.text(failure)).foregroundStyle(.red) }
            if let warning = model.spaceRegistry.conflictDescription { Text(warning).font(.footnote).foregroundStyle(Theme.orange).accessibilityIdentifier("space-identity-warning") }
            ForEach(model.spaces) { space in
                Button { switching = space.id; failure = nil; Task { do { try await model.activate(space); switching = nil; if model.onboarding { UserDefaults.standard.set(true, forKey: "onboarding.complete"); model.onboarding = false; model.presented = .permissions } else { dismiss() } } catch { switching = nil; failure = MobileL10n.format("切换失败，仍在原空间：%@", [MobileL10n.text(error.localizedDescription)]) } } } label: {
                    HStack { VStack(alignment: .leading) { Text(space.manifest.name); Text(space.manifest.readOnly ? MobileL10n.text("匿名演示 · 只读") : space.cloud == nil ? MobileL10n.text("仅本机 · 尚未连接 iCloud") : MobileL10n.text("iCloud 空间")).font(.caption).foregroundStyle(.secondary); if !space.manifest.readOnly { syncTime(space.id) } }; Spacer(); if switching == space.id { ProgressView() } else if model.active?.id == space.id { Image(systemName: "checkmark") } }
                }.disabled(switching != nil || model.syncing)
            }
            if !model.spaces.contains(where: { $0.manifest.readOnly }) { Button("匿名演示 · 只读") { model.perform { try await model.openDemo(); dismiss() } } }
            NavigationLink("新建空间") { CreateSpaceView() }; NavigationLink("空间设置") { SpaceSettingsView() }; NavigationLink("最近删除的空间") { DeletedSpacesView() }
        }.onReceive(NotificationCenter.default.publisher(for: UserDefaults.didChangeNotification)) { _ in syncRevision &+= 1 }.navigationTitle("选择空间").toolbar { Button("完成") { dismiss() } }.presentationDetents([.medium, .large]).accessibilityElement(children: .contain).accessibilityIdentifier("ONB-3")
    }
    @ViewBuilder private func syncTime(_ id: String) -> some View {
        let _ = syncRevision
        if let raw = UserDefaults.standard.string(forKey: "sync.lastCheckedAt." + id), let date = MobileProtocol.date(raw) {
            HStack(spacing: 4) { Text("最近同步核对"); Text(date, style: .relative) }.font(.caption2).foregroundStyle(.secondary)
        } else { Text("尚未完成同步核对").font(.caption2).foregroundStyle(.secondary) }
    }

}
