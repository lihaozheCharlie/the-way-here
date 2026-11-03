// Generate native provider metadata from the desktop's existing catalog.
import { writeFile, readFile, mkdir, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { WikiIndex } from "../packages/wiki-core/src/index.js";
import { buildToday } from "../packages/life-views/src/index.js";
import { enMessages } from "../apps/web/src/shared/i18n/en-messages.js";
import { createRequire } from "node:module";
import { listThirdPartyProviderPresets, piProviderFromPreset } from "../apps/server/src/runtime/agent-runtime/third-party-provider-catalog.js";
const presets = listThirdPartyProviderPresets().filter(p => ["deepseek", "zhipu", "qwen", "kimi", "openai"].includes(p.id)).map(p => {
  const config = piProviderFromPreset(p.id, p.models[0]!.id, "")!;
  return { id: p.id, name: p.displayName, baseURL: config.baseUrl, protocolName: config.protocol, model: p.models[0]!.id, supportsImages: config.models[0]!.inputModalities?.includes("image") || false };
});
await writeFile(new URL("../apps/ios/Resources/ModelProviders.json", import.meta.url), JSON.stringify(presets, null, 2) + "\n");
console.log(`Prepared ${presets.length} native model presets from the shared desktop catalog.`);
const demo = new WikiIndex(fileURLToPath(new URL("../../", import.meta.url)), "demo");
await demo.rebuild();
await writeFile(new URL("../apps/ios/Resources/MobileDemo.json", import.meta.url), JSON.stringify({ pages: demo.list().map(page => ({ path: page.relativePath, markdown: demo.get(page.id)!.markdown, category: page.category })), topics: buildToday(demo).conversationPrompts }, null, 2) + "\n");
console.log("Prepared native anonymous demo from the existing demo library.");
const native = JSON.parse(await readFile(new URL("../apps/ios/Resources/NativeTranslations.json", import.meta.url), "utf8")) as Record<string, string>;
const translations: Record<string, string> = { ...enMessages, ...native };
const nativeKeys = new Set(Object.keys(native));
const fragments = new URL("../apps/ios/Resources/Translations/", import.meta.url);
for (const filename of (await readdir(fragments)).filter(name => name.endsWith(".json")).sort()) {
  const fragment = JSON.parse(await readFile(new URL(filename, fragments), "utf8")) as Record<string, unknown>;
  for (const [key, value] of Object.entries(fragment)) {
    if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid translation in ${filename}: ${key}`);
    translations[key] = value; nativeKeys.add(key);
  }
}
const keys = nativeKeys;
async function scan(directory: URL): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const target = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
    if (entry.isDirectory()) { await scan(target); continue; }
    if (!entry.name.endsWith(".swift") || entry.name === "UXVerificationFixtures.swift") continue; // Explicit --uitest-only scene labels are not product UI.
    const text = await readFile(target, "utf8");
    for (const match of text.matchAll(/(?:(?:Text|Button|Label|Section|Link|NavigationLink|DatePicker|Stepper|DisclosureGroup|alert|confirmationDialog|navigationTitle|Toggle|TextField|SecureField|Picker|LabeledContent|ContentUnavailableView|ProgressView|accessibilityLabel|accessibilityHint|NSLocalizedString|MobileL10n.text|MobileL10n.format|unavailable|invalidData)\s*\(|EmptyMessage\s*\(\s*title:|detail:)\s*"((?:\\.|[^"\\])*)"/g)) {
      const key = match[1]!;
      if (!key.includes('\\(') && /[\u3400-\u9fff]/.test(key)) keys.add(key.replaceAll('\\n', '\n'));
    }
    for (const list of text.matchAll(/ForEach\s*\(\s*\[([\s\S]*?)\]/g)) {
      for (const match of list[1]!.matchAll(/"((?:\\.|[^"\\])*)"/g)) {
        const key = match[1]!;
        if (!key.includes('\\(') && /[\u3400-\u9fff]/.test(key)) keys.add(key.replaceAll('\\n', '\n'));
      }
    }
    for (const match of text.matchAll(/(?:title:|question:|LocalizedStringResource\s*=)\s*"((?:\\.|[^"\\])*)"/g)) {
      const key = match[1]!;
      if (!key.includes('\\(') && /[\u3400-\u9fff]/.test(key)) keys.add(key.replaceAll('\\n', '\n'));
    }
  }
}
await scan(new URL("../apps/ios/App/", import.meta.url));
await scan(new URL("../apps/ios/Extensions/", import.meta.url));
await scan(new URL("../apps/ios/Sources/TWHCore/", import.meta.url));
const sorted = [...keys].sort();
for (const language of ["zh-Hans", "en"]) {
  const directory = new URL(`../apps/ios/Resources/${language}.lproj/`, import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL("Localizable.strings", directory), sorted.filter(key => language === "zh-Hans" || translations[key]).map(key => `${JSON.stringify(key)} = ${JSON.stringify(language === "en" ? translations[key] : key)};`).join("\n") + "\n");
}
const permissionStrings: Record<string, { zh: string; en: string }> = {
  NSMicrophoneUsageDescription: { zh: "仅在你主动说一段时录音，原音频留在本机。", en: "Record only when you choose to speak. Original audio stays on this device." },
  NSSpeechRecognitionUsageDescription: { zh: "在这台 iPhone 上把你说的话转成可编辑文字，不使用服务器识别。", en: "Turn your speech into editable text on this iPhone, without server-based recognition." },
  NSPhotoLibraryUsageDescription: { zh: "只读取你选中的照片，生成压缩副本与本机人脸框，原图不会上传。", en: "Read only the photos you allow, create compressed copies and on-device face boxes. Originals are not uploaded." },
  NSFaceIDUsageDescription: { zh: "在打开 App 时保护你的私人记录。", en: "Protect your private records when you open the app." },
  "说一段": { zh: "说一段", en: "Speak" }, "找照片": { zh: "找照片", en: "Find photos" }, "写一段": { zh: "写一段", en: "Write" },
};
for (const language of ["zh-Hans", "en"]) {
  const target = new URL(`../apps/ios/Resources/${language}.lproj/InfoPlist.strings`, import.meta.url);
  await writeFile(target, Object.entries(permissionStrings).map(([key, value]) => `${JSON.stringify(key)} = ${JSON.stringify(language === "en" ? value.en : value.zh)};`).join("\n") + "\n");
}
// App Intents invocation phrases use a dedicated table and named placeholders.
// Apple: developer.apple.com/videos/play/tech-talks/10168/
const shortcutPhrases: Record<string, string> = {
  "在 ${applicationName} 记一笔": "Record a note in ${applicationName}",
  "用 ${applicationName} 说一段": "Speak in ${applicationName}",
  "用 ${applicationName} 写一段": "Write in ${applicationName}",
  "用 ${applicationName} 讲照片故事": "Tell a photo story in ${applicationName}",
  "读 ${applicationName} 最近回信": "Read the latest letter in ${applicationName}",
};
for (const language of ["zh-Hans", "en"]) {
  await writeFile(new URL(`../apps/ios/Resources/${language}.lproj/AppShortcuts.strings`, import.meta.url), Object.entries(shortcutPhrases).map(([key, value]) => `${JSON.stringify(key)} = ${JSON.stringify(language === "en" ? value : key)};`).join("\n") + "\n");
}
const gaps = sorted.filter(key => !translations[key]);
await mkdir(new URL("../.runtime/ios/", import.meta.url), { recursive: true });
await writeFile(new URL("../.runtime/ios/translation-gaps.json", import.meta.url), JSON.stringify(gaps, null, 2));
console.log(`Prepared native localization; ${gaps.length} static UI strings still need translation.`);
const icons = new URL("../apps/ios/Resources/Assets.xcassets/AppIcon.appiconset/", import.meta.url);
await mkdir(icons, { recursive: true });
const sharp = createRequire(new URL("../apps/server/package.json", import.meta.url))("sharp");
const logo = await readFile(new URL("../apps/desktop/assets/app-icon.svg", import.meta.url));
await sharp(logo).resize(1024, 1024).flatten({ background: "#ffffff" }).png().toFile(fileURLToPath(new URL("AppIcon.png", icons)));
await writeFile(new URL("Contents.json", icons), JSON.stringify({ images: [{ filename: "AppIcon.png", idiom: "universal", platform: "ios", size: "1024x1024" }], info: { author: "The Way Here", version: 1 } }, null, 2));
await writeFile(new URL("../Contents.json", icons), JSON.stringify({ info: { author: "The Way Here", version: 1 } }));
