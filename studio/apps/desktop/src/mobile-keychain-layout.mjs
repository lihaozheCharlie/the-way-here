import path from 'node:path';
export const MOBILE_KEYCHAIN_BUNDLE_ID='com.thewayhere.desktop.mobile-keychain';
export const MOBILE_KEYCHAIN_BUNDLE_NAME='MobileKeychain.app';
export const MOBILE_KEYCHAIN_EXECUTABLE='mobile-keychain';
export const MOBILE_KEYCHAIN_SIGN_IGNORE='/Contents/Helpers/MobileKeychain\\.app(?:/|$)';
export function packagedMobileKeychainBundle(resourcesPath) {return path.resolve(resourcesPath,'../Helpers',MOBILE_KEYCHAIN_BUNDLE_NAME);}
export function mobileKeychainExecutable(bundle) {return path.join(bundle,'Contents/MacOS',MOBILE_KEYCHAIN_EXECUTABLE);}
