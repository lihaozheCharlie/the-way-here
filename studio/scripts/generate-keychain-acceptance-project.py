#!/usr/bin/env python3
"""Generate an isolated signed macOS wrapper for the actual Keychain helper.

The wrapper reuses the production Swift source. Test requests must supply a UUID
acceptanceRun and use anonymous accounts; no provider credentials are needed.
"""
import hashlib
import json
import os
import plistlib
import re
from pathlib import Path

studio = Path(__file__).resolve().parents[1]
folder = studio / '.runtime/keychain-acceptance'
folder.mkdir(parents=True, exist_ok=True)
team_file = studio / '.runtime/ios/signing-team.txt'
team = os.environ.get('TWH_APPLE_DEVELOPMENT_TEAM') or (team_file.read_text().strip() if team_file.exists() else '')
if not re.fullmatch(r'[A-Z0-9]{10}', team): raise ValueError('A confirmed local development team is required')
objects = {}
def add(key, body):
    identity = hashlib.sha256(key.encode()).hexdigest()[:24].upper()
    objects[identity] = body
    return identity
def quote(value): return json.dumps(str(value))
# Xcode requires the executable entry file to be named main.swift.
# This generated copy is never independently maintained.
helper = studio / 'apps/desktop/native/MobileKeychain.swift'
(folder / 'main.swift').write_bytes(helper.read_bytes())
(folder / 'source.sha256').write_text(hashlib.sha256(helper.read_bytes()).hexdigest() + '\n')
source = add('source', '{isa=PBXFileReference; lastKnownFileType=sourcecode.swift; path=' + quote(folder / 'main.swift') + '; sourceTree="<absolute>";}')
product = add('product', '{isa=PBXFileReference; explicitFileType=wrapper.application; path=KeychainAcceptance.app; sourceTree=BUILT_PRODUCTS_DIR;}')
build = add('build', '{isa=PBXBuildFile; fileRef=' + source + ';}')
phase = add('phase', '{isa=PBXSourcesBuildPhase; buildActionMask=2147483647; files=(' + build + ',); runOnlyForDeploymentPostprocessing=0;}')
group = add('group', '{isa=PBXGroup; children=(' + source + ',' + product + ',); sourceTree="<group>";}')
settings = {
    'PRODUCT_NAME':'KeychainAcceptance', 'PRODUCT_BUNDLE_IDENTIFIER':'com.thewayhere.keychain.acceptance',
    'DEVELOPMENT_TEAM':team, 'CODE_SIGN_STYLE':'Automatic', 'CODE_SIGN_IDENTITY':'Apple Development',
    'CODE_SIGN_ENTITLEMENTS':'Acceptance.entitlements', 'INFOPLIST_FILE':'Info.plist',
    'SDKROOT':'macosx', 'SUPPORTED_PLATFORMS':'macosx', 'MACOSX_DEPLOYMENT_TARGET':'13.0',
    'SWIFT_VERSION':'5.0', 'ENABLE_HARDENED_RUNTIME':'YES', 'CLANG_ENABLE_MODULES':'YES',
}
config = add('config', '{isa=XCBuildConfiguration; name=Debug; buildSettings={' + ''.join(k+'='+quote(v)+';' for k,v in settings.items()) + '};}')
configs = add('configs', '{isa=XCConfigurationList; buildConfigurations=(' + config + ',); defaultConfigurationName=Debug; defaultConfigurationIsVisible=0;}')
target = add('target', '{isa=PBXNativeTarget; buildConfigurationList=' + configs + '; buildPhases=(' + phase + ',); buildRules=(); dependencies=(); name=KeychainAcceptance; productName=KeychainAcceptance; productReference=' + product + '; productType="com.apple.product-type.application";}')
project = add('project', '{isa=PBXProject; attributes={LastUpgradeCheck=2700;}; buildConfigurationList=' + configs + '; compatibilityVersion="Xcode 14.0"; developmentRegion=en; knownRegions=(en,); mainGroup=' + group + '; projectDirPath=""; projectRoot=""; targets=(' + target + ',);}')
project_folder = folder / 'KeychainAcceptance.xcodeproj'
project_folder.mkdir(exist_ok=True)
(project_folder / 'project.pbxproj').write_text('// !$*UTF8*$!\n{archiveVersion=1; classes={}; objectVersion=56; objects={' + ''.join(k+'='+v+';' for k,v in objects.items()) + '}; rootObject=' + project + ';}\n')
with (folder / 'Info.plist').open('wb') as file:
    plistlib.dump({'CFBundleIdentifier':'$(PRODUCT_BUNDLE_IDENTIFIER)','CFBundleExecutable':'$(EXECUTABLE_NAME)','CFBundleName':'KeychainAcceptance','CFBundlePackageType':'APPL','CFBundleVersion':'1','CFBundleShortVersionString':'1.0','LSUIElement':True},file)
with (folder / 'Acceptance.entitlements').open('wb') as file:
    plistlib.dump({'keychain-access-groups':['$(AppIdentifierPrefix)com.thewayhere.shared']},file)
print(project_folder)
