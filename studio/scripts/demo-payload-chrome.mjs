/**
 * English display of the demo pages the shell renders.
 * Stored files stay Chinese. A leak is Chinese that would still reach the screen.
 *
 *   node studio/scripts/demo-payload-chrome.mjs [vault/demo]
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ts = createRequire(path.join(studio, "apps/web/package.json"))("typescript");
const webRequire = createRequire(path.join(studio, "apps/web/package.json"));
const CJK = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/;
const loaded = new Map();

function loadTs(abs) {
  if (loaded.has(abs)) return loaded.get(abs).exports;
  const source = readFileSync(abs, "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
    fileName: abs,
  }).outputText.replaceAll("import.meta", "({ env: { DEV: false }, url: '' })");
  const mod = { exports: {} };
  loaded.set(abs, mod);
  const dirname = path.dirname(abs);
  const localRequire = (spec) => {
    if (spec.startsWith("node:")) return createRequire(import.meta.url)(spec);
    if (!spec.startsWith(".")) return webRequire(spec);
    const resolved = path.resolve(dirname, spec);
    const hit = [resolved, `${resolved}.ts`, `${resolved}.tsx`, `${resolved}.js`].find((item) => existsSync(item) && statSync(item).isFile());
    if (!hit) throw new Error(`Cannot resolve ${spec} from ${abs}`);
    if (hit.endsWith(".ts") || hit.endsWith(".tsx")) return loadTs(hit);
    return webRequire(hit);
  };
  const run = new Function("exports", "require", "module", "__filename", "__dirname", js);
  run(mod.exports, localRequire, mod, abs, dirname);
  return mod.exports;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith(".md")) out.push(full);
  }
  return out;
}

function frontmatterTags(markdown) {
  const fence = /^---\n([\s\S]*?)\n---/.exec(markdown);
  if (!fence) return [];
  const tags = [];
  let inTags = false;
  for (const line of fence[1].split("\n")) {
    if (line.startsWith("tags:")) { inTags = true; continue; }
    if (!inTags) continue;
    const item = /^ {2}- ["']?(.+?)["']?\s*$/.exec(line);
    if (item) tags.push(item[1]);
    else if (line && !line.startsWith(" ")) inTags = false;
  }
  return tags;
}

function headingOf(markdown, relativePath) {
  const body = markdown.replace(/^---\n[\s\S]*?\n---\n?/, "");
  return body.match(/^#\s+(.+)$/m)?.[1]?.trim() || relativePath.split("/").at(-1).replace(/\.md$/, "");
}

/** Chinese still visible after the demo display overlay. Each leak is where, marks, snippet. */
export function demoPayloadChromeLeaks(vaultRoot) {
  const i18n = path.join(studio, "apps/web/src/shared/i18n");
  const { demoListExcerpt, demoEnglishHeading, demoExcerptFromMarkdown, demoEnglishSections } = loadTs(path.join(i18n, "demo-body.ts"));
  const { demoPathTooltip, demoTitleLabel, demoExactTitleLabel, demoFileLabel, shownDemoRecord, demoLibraryLabel, demoSectionHeadingLabel } = loadTs(path.join(i18n, "demo-overlay.ts"));
  const { demoTagLabel } = loadTs(path.join(i18n, "demo-titles.ts"));
  const { translate } = loadTs(path.join(i18n, "locale.tsx"));
  const leaks = [];
  const note = (where, value) => {
    if (value && CJK.test(value)) {
      const marks = [...value].filter((char) => CJK.test(char));
      leaks.push(`${where}\t${[...new Set(marks)].join("")}\t${value.replace(/\s+/g, " ").slice(0, 140)}`);
    }
  };
  for (const reason of ["运行时未启用", "Pi 运行时未启用"]) note(`runtime ${reason}`, translate("en", reason));
  note("library The Way Here", demoLibraryLabel("demo", "en", "The Way Here"));
  note("library seed", demoLibraryLabel("demo", "en", "The Way Here 演示 Wiki"));
  for (const heading of ["模型定义", "它解释什么", "适用条件", "边界与反例", "行动规则", "模型说明"]) note(`section-chrome ${heading}`, demoSectionHeadingLabel("demo", "en", heading));
  for (const file of walk(vaultRoot)) {
    const relative = path.relative(vaultRoot, file).split(path.sep).join("/");
    if (!relative.startsWith("wiki/") && !relative.startsWith("sources/")) continue;
    const markdown = readFileSync(file, "utf8");
    const excerpt = demoExcerptFromMarkdown(markdown);
    const title = headingOf(markdown, relative);
    note(`${relative} excerpt`, demoListExcerpt("demo", "en", relative, excerpt));
    note(`${relative} title`, demoEnglishHeading("demo", "en", relative, excerpt) || demoTitleLabel("demo", "en", title));
    note(`${relative} path`, demoPathTooltip("demo", "en", relative));
    note(`${relative} original`, demoPathTooltip("demo", "en", `app/demo/${relative}`));
    const storedName = relative.split("/").at(-1) || title;
    note(`${relative} search-title`, demoEnglishHeading("demo", "en", relative, excerpt) || demoFileLabel("demo", "en", storedName));
    note(`${relative} search-path`, demoPathTooltip("demo", "en", relative));
    note(`${relative} search-excerpt`, demoListExcerpt("demo", "en", relative, excerpt));
    const indexed = shownDemoRecord("demo", "en", { title, relativePath: `vault/demo/${relative}`, excerpt });
    note(`${relative} indexed-search-title`, indexed.title);
    note(`${relative} indexed-search-path`, indexed.path);
    note(`${relative} indexed-search-excerpt`, indexed.excerpt);
    if (/\/(01 个人主线|04 反复循环|06 现实系统|09 思维模型|05 人物关系图谱|07 人物与城市)\//.test(relative)) {
      for (const section of demoEnglishSections("demo", "en", relative, excerpt) || []) {
        note(`${relative} section ${section.heading}`, section.heading);
        note(`${relative} section-body`, section.body);
      }
    }
    for (const tag of frontmatterTags(markdown)) note(`${relative} tag ${tag}`, demoTagLabel("demo", "en", tag));
    for (const value of frontmatterPeriods(markdown)) note(`${relative} period`, demoExactTitleLabel("demo", "en", value));
  }
  const importsDir = path.join(vaultRoot, "sources/.imports");
  if (existsSync(importsDir)) {
    for (const name of readdirSync(importsDir)) {
      if (!name.endsWith(".json")) continue;
      const payload = JSON.parse(readFileSync(path.join(importsDir, name), "utf8"));
      for (const cluster of payload.journey?.clusters || []) {
        note(`${name} question`, demoExactTitleLabel("demo", "en", cluster.question || ""));
        note(`${name} topic`, translate("en", "账单线索"));
      }
    }
  }
  return leaks;
}

function frontmatterPeriods(markdown) {
  const fence = /^---\n([\s\S]*?)\n---/.exec(markdown);
  if (!fence) return [];
  const values = [];
  for (const line of fence[1].split("\n")) {
    const item = /^period:\s+["'](.+)["']\s*$/.exec(line);
    if (item) values.push(item[1]);
  }
  return values;
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  const vault = process.argv[2] || path.resolve(studio, "../vault/demo");
  process.stdout.write(JSON.stringify(demoPayloadChromeLeaks(vault)));
}
