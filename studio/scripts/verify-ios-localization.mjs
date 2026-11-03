import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
const resourceRoot = new URL("../apps/ios/Resources/", import.meta.url);
async function table(language, name = "Localizable") {
  const text = await readFile(new URL(`${language}.lproj/${name}.strings`, resourceRoot), "utf8");
  return new Map(text.split("\n").filter(Boolean).map(line => {
    const match = line.match(/^("(?:\\.|[^"\\])*") = ("(?:\\.|[^"\\])*");$/);
    assert(match, `Malformed ${name}.strings line: ${line}`);
    return [JSON.parse(match[1]), JSON.parse(match[2])];
  }));
}
const [en, zh] = await Promise.all([table("en"), table("zh-Hans")]);
const gaps = JSON.parse(await readFile(new URL("../.runtime/ios/translation-gaps.json", import.meta.url), "utf8"));
assert.deepEqual(gaps, [], "Native UI localization gaps remain; run prepare-ios-resources.ts");
for (const [key, value] of en) {
  assert(value.trim(), `Empty English translation: ${key}`);
  assert(!/[\u3400-\u9fff]/u.test(value), `Untranslated Chinese in English value: ${key}`);
  const placeholders = text => [...text.matchAll(/%(?:\d+\$)?(?:@|lld|ld|d|f)/g)].map(match => match[0]).sort();
  assert.deepEqual(placeholders(value), placeholders(key), `Format placeholders differ: ${key}`);
}
for (const filename of (await readdir(new URL("Translations/", resourceRoot))).filter(value => value.endsWith(".json"))) {
  const values = JSON.parse(await readFile(new URL(`Translations/${filename}`, resourceRoot), "utf8"));
  for (const key of Object.keys(values)) { assert(en.has(key), `Missing English key: ${key}`); assert(zh.has(key), `Missing Chinese key: ${key}`); }
}
for (const language of ["en", "zh-Hans"]) {
  const permissions = await table(language, "InfoPlist");
  for (const key of ["NSMicrophoneUsageDescription", "NSSpeechRecognitionUsageDescription", "NSPhotoLibraryUsageDescription", "NSFaceIDUsageDescription"]) assert(permissions.has(key));
  const shortcuts = await table(language, "AppShortcuts");
  assert.equal(shortcuts.size, 5);
  for (const [key, value] of shortcuts) { assert(key.includes("${applicationName}")); assert(value.includes("${applicationName}")); }
}
console.log(`Native localization verified: ${en.size} English keys, ${zh.size} Chinese keys, permissions and 5 Siri phrases.`);
