#!/usr/bin/env python3
"""Deterministic, dependency-free Xcode project. Run from any directory."""
import hashlib
import json
import os
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1] / 'apps/ios'
team_file = root.parents[1] / '.runtime/ios/signing-team.txt'
team = os.environ.get('TWH_APPLE_DEVELOPMENT_TEAM', team_file.read_text().strip() if team_file.exists() else '')
if team and not re.fullmatch(r'[A-Z0-9]{10}', team): raise ValueError('Invalid local signing team')
objects = {}
def uid(key): return hashlib.sha256(key.encode()).hexdigest()[:24].upper()
def add(key, value):
    identity = uid(key)
    objects[identity] = value
    return identity
def quote(value): return json.dumps(str(value), ensure_ascii=False)
def refs(values): return '(' + ', '.join(values) + (',' if values else '') + ')'

file_ids = {}
for file in sorted(list((root / 'App').glob('*.swift')) + list((root / 'UITests').glob('*.swift')) + list((root / 'Extensions').rglob('*.swift')) + list((root / 'Resources').glob('*.json'))):
    path = file.relative_to(root).as_posix()
    file_ids[path] = add('file:' + path, '{isa = PBXFileReference; lastKnownFileType = ' + ('sourcecode.swift' if file.suffix == '.swift' else 'text.json') + '; path = ' + quote(path) + '; sourceTree = "<group>"; }')
for path in ['Resources/en.lproj', 'Resources/zh-Hans.lproj']:
    if (root / path).exists(): file_ids[path] = add('file:' + path, '{isa = PBXFileReference; lastKnownFileType = folder; path = ' + quote(path) + '; sourceTree = "<group>"; }')
asset = 'Resources/Assets.xcassets'
if (root / asset).exists(): file_ids[asset] = add('file:' + asset, '{isa = PBXFileReference; lastKnownFileType = folder.assetcatalog; path = ' + quote(asset) + '; sourceTree = "<group>"; }')

package = add('package', '{isa = XCLocalSwiftPackageReference; relativePath = "."; }')
target_ids = {name: uid('target:' + name) for name in ['TheWayHere', 'Share', 'Widgets', 'UITests']}
product_ids = {}
for name in target_ids:
    app = name == 'TheWayHere'
    product_ids[name] = add('product:' + name, '{isa = PBXFileReference; explicitFileType = ' + ('wrapper.application' if app else 'wrapper.cfbundle' if name == 'UITests' else 'wrapper.app-extension') + '; includeInIndex = 0; path = ' + quote(name + ('.app' if app else '.xctest' if name == 'UITests' else '.appex')) + '; sourceTree = BUILT_PRODUCTS_DIR; }')
products = add('products', '{isa = PBXGroup; name = Products; children = ' + refs(list(product_ids.values())) + '; sourceTree = "<group>"; }')
group = add('main-group', '{isa = PBXGroup; children = ' + refs(list(file_ids.values()) + [products]) + '; sourceTree = "<group>"; }')

for name in target_ids:
    app = name == 'TheWayHere'
    source_paths = [path for path in file_ids if path.endswith('.swift') and (path.startswith('App/') if app else path.startswith('UITests/') if name == 'UITests' else path.startswith('Extensions/' + name + '/'))]
    if app or name == 'Widgets': source_paths += [path for path in file_ids if path.startswith('Extensions/Shared/')]
    if name == 'Share': source_paths += ['App/PhotoPreparation.swift', 'App/ShareImportCoordinator.swift']
    sources = [add('build:' + name + ':' + path, '{isa = PBXBuildFile; fileRef = ' + file_ids[path] + '; }') for path in source_paths]
    source_phase = add('sources:' + name, '{isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = ' + refs(sources) + '; runOnlyForDeploymentPostprocessing = 0; }')
    resources = [add('resource:' + name + ':' + path, '{isa = PBXBuildFile; fileRef = ' + file_ids[path] + '; }') for path in file_ids if (app and path.startswith('Resources/')) or (name != 'UITests' and path.endswith('.lproj'))]
    resource_phase = add('resources:' + name, '{isa = PBXResourcesBuildPhase; buildActionMask = 2147483647; files = ' + refs(resources) + '; runOnlyForDeploymentPostprocessing = 0; }')
    package_product = []
    framework_files = []
    if name in ['TheWayHere', 'Share']:
        product = add('package-product:' + name, '{isa = XCSwiftPackageProductDependency; package = ' + package + '; productName = TWHCore; }')
        package_product.append(product)
        framework_files.append(add('framework:' + name, '{isa = PBXBuildFile; productRef = ' + product + '; }'))
    frameworks = add('frameworks:' + name, '{isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = ' + refs(framework_files) + '; runOnlyForDeploymentPostprocessing = 0; }')
    dependencies, phases = [], [source_phase, frameworks, resource_phase]
    if name == 'UITests':
        proxy = add('proxy:ui-app', '{isa = PBXContainerItemProxy; containerPortal = ' + uid('project') + '; proxyType = 1; remoteGlobalIDString = ' + target_ids['TheWayHere'] + '; remoteInfo = TheWayHere; }')
        dependencies.append(add('dependency:ui-app', '{isa = PBXTargetDependency; target = ' + target_ids['TheWayHere'] + '; targetProxy = ' + proxy + '; }'))
    if app:
        embedded = []
        for extension in ['Share', 'Widgets']:
            embedded.append(add('embed:' + extension, '{isa = PBXBuildFile; fileRef = ' + product_ids[extension] + '; settings = {ATTRIBUTES = (RemoveHeadersOnCopy,); }; }'))
            proxy = add('proxy:' + extension, '{isa = PBXContainerItemProxy; containerPortal = ' + uid('project') + '; proxyType = 1; remoteGlobalIDString = ' + target_ids[extension] + '; remoteInfo = ' + quote(extension) + '; }')
            dependencies.append(add('dependency:' + extension, '{isa = PBXTargetDependency; target = ' + target_ids[extension] + '; targetProxy = ' + proxy + '; }'))
        phases.append(add('embed-phase', '{isa = PBXCopyFilesBuildPhase; buildActionMask = 2147483647; dstPath = ""; dstSubfolderSpec = 13; files = ' + refs(embedded) + '; name = "Embed App Extensions"; runOnlyForDeploymentPostprocessing = 0; }'))
    configs = []
    for config in ['Debug', 'Release']:
        settings = {
            **({'DEVELOPMENT_TEAM': team} if team else {}), 'CODE_SIGN_STYLE': 'Automatic', 'SWIFT_VERSION': '5.0', 'IPHONEOS_DEPLOYMENT_TARGET': '17.0',
            'PRODUCT_NAME': '$(TARGET_NAME)', 'PRODUCT_BUNDLE_IDENTIFIER': 'com.thewayhere.mobile' + ('' if app else '.' + name.lower()),
            'TARGETED_DEVICE_FAMILY': '1', 'SDKROOT': 'iphoneos', 'SUPPORTED_PLATFORMS': 'iphoneos iphonesimulator',
            'INFOPLIST_FILE': 'Configuration/' + ('App' if app else name) + '-Info.plist',
            'CODE_SIGN_ENTITLEMENTS': 'Configuration/' + ('Mobile' if app or name == 'Share' else 'Extension') + '.entitlements',
            'MARKETING_VERSION': '0.1.0', 'CURRENT_PROJECT_VERSION': '2', 'GENERATE_INFOPLIST_FILE': 'NO',
            'SWIFT_EMIT_LOC_STRINGS': 'YES', 'CLANG_ENABLE_MODULES': 'YES', 'LD_RUNPATH_SEARCH_PATHS': '$(inherited) @executable_path/Frameworks' + ('' if app else ' @executable_path/../../Frameworks'),
            'ONLY_ACTIVE_ARCH': 'YES' if config == 'Debug' else 'NO',
            'SWIFT_OPTIMIZATION_LEVEL': '-Onone' if config == 'Debug' else '-O', 'DEBUG_INFORMATION_FORMAT': 'dwarf' if config == 'Debug' else 'dwarf-with-dsym',
        }
        if not app: settings.update({'APPLICATION_EXTENSION_API_ONLY': 'YES', 'SKIP_INSTALL': 'YES'})
        if app: settings['ASSETCATALOG_COMPILER_APPICON_NAME'] = 'AppIcon'
        if name == 'UITests':
            settings.update({'GENERATE_INFOPLIST_FILE': 'YES', 'TEST_TARGET_NAME': 'TheWayHere', 'APPLICATION_EXTENSION_API_ONLY': 'NO'})
            settings.pop('INFOPLIST_FILE', None); settings.pop('CODE_SIGN_ENTITLEMENTS', None)
        build_settings = '{' + ' '.join(key + ' = ' + quote(value) + ';' for key, value in settings.items()) + '}'
        configs.append(add('config:' + name + ':' + config, '{isa = XCBuildConfiguration; buildSettings = ' + build_settings + '; name = ' + quote(config) + '; }'))
    config_list = add('config-list:' + name, '{isa = XCConfigurationList; buildConfigurations = ' + refs(configs) + '; defaultConfigurationIsVisible = 0; defaultConfigurationName = Release; }')
    add('target:' + name, '{isa = PBXNativeTarget; buildConfigurationList = ' + config_list + '; buildPhases = ' + refs(phases) + '; buildRules = (); dependencies = ' + refs(dependencies) + '; name = ' + quote(name) + '; packageProductDependencies = ' + refs(package_product) + '; productName = ' + quote(name) + '; productReference = ' + product_ids[name] + '; productType = ' + quote('com.apple.product-type.application' if app else 'com.apple.product-type.bundle.ui-testing' if name == 'UITests' else 'com.apple.product-type.app-extension') + '; }')

configs = [add('project-config:' + name, '{isa = XCBuildConfiguration; buildSettings = {CLANG_ENABLE_MODULES = YES; SWIFT_VERSION = 5.0;}; name = ' + quote(name) + '; }') for name in ['Debug', 'Release']]
config_list = add('project-config-list', '{isa = XCConfigurationList; buildConfigurations = ' + refs(configs) + '; defaultConfigurationIsVisible = 0; defaultConfigurationName = Release; }')
add('project', '{isa = PBXProject; attributes = {BuildIndependentTargetsInParallel = YES; LastUpgradeCheck = 1600;}; buildConfigurationList = ' + config_list + '; compatibilityVersion = "Xcode 14.0"; developmentRegion = "zh-Hans"; knownRegions = ("zh-Hans", en, Base); mainGroup = ' + group + '; packageReferences = (' + package + ',); productRefGroup = ' + products + '; projectDirPath = ""; projectRoot = ""; targets = ' + refs(list(target_ids.values())) + '; }')
project = root / 'TheWayHere.xcodeproj'
project.mkdir(exist_ok=True)
(project / 'project.pbxproj').write_text('// !$*UTF8*$!\n{ archiveVersion = 1; classes = {}; objectVersion = 56; objects = {\n' + '\n'.join(key + ' = ' + value + ';' for key, value in sorted(objects.items())) + '\n}; rootObject = ' + uid('project') + '; }\n')
schemes = project / 'xcshareddata/xcschemes'
schemes.mkdir(parents=True, exist_ok=True)
(schemes / 'TheWayHere.xcscheme').write_text('''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1600" version="1.3"><BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="''' + target_ids['TheWayHere'] + '''" BuildableName="TheWayHere.app" BlueprintName="TheWayHere" ReferencedContainer="container:TheWayHere.xcodeproj"/></BuildActionEntry></BuildActionEntries></BuildAction><LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" debugServiceExtension="internal" allowLocationSimulation="YES"><BuildableProductRunnable runnableDebuggingMode="0"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="''' + target_ids['TheWayHere'] + '''" BuildableName="TheWayHere.app" BlueprintName="TheWayHere" ReferencedContainer="container:TheWayHere.xcodeproj"/></BuildableProductRunnable></LaunchAction><ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/></Scheme>
''')
scheme_path = schemes / 'TheWayHere.xcscheme'
scheme = scheme_path.read_text().replace('</BuildAction>', '</BuildAction><TestAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv="YES"><Testables><TestableReference skipped="NO"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="' + target_ids['UITests'] + '" BuildableName="UITests.xctest" BlueprintName="UITests" ReferencedContainer="container:TheWayHere.xcodeproj"/></TestableReference></Testables></TestAction>')
scheme_path.write_text(scheme)
print('Generated TheWayHere.xcodeproj: iPhone app, share extension, widgets, local TWHCore package.')
