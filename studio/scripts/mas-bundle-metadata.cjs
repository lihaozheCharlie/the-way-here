const {spawnSync} = require('node:child_process');
const path = require('node:path');

// Electron supplies generic privacy strings and an unrestricted ATS default.
// This app uses native microphone/speech helpers, not camera, Bluetooth or
// system-audio capture. Keep only descriptions for implemented capabilities.
module.exports = function applyMasBundleMetadata(app) {
  const file = path.join(app,'Contents/Info.plist');
  for (const key of ['NSCameraUsageDescription','NSBluetoothAlwaysUsageDescription','NSBluetoothPeripheralUsageDescription','NSAudioCaptureUsageDescription','NSAppTransportSecurity']) {
    const result=spawnSync('/usr/libexec/PlistBuddy',['-c',`Delete :${key}`,file],{encoding:'utf8'});
    if (result.status !== 0 && !/Does Not Exist/.test(result.stderr)) throw new Error(`Could not remove unused MAS metadata: ${key}`);
  }
};
