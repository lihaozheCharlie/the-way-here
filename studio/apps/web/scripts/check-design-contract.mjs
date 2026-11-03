import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = fileURLToPath(new URL("../src", import.meta.url));
const files = collectFiles(sourceRoot);
const css = files.filter((file) => extname(file) === ".css").map(read).join("\n");
const source = files.filter((file) => [".ts", ".tsx"].includes(extname(file))).map(read).join("\n");
const violations = [];

// Keep every renderer surface on the shared palette, including utility windows.
const literalColor = /#[\da-f]{3,8}\b|\brgba?\(\s*[\d.]/i;
const unthemed = files.filter(file => extname(file) === ".css" && !file.endsWith("/theme-tokens.css") && literalColor.test(read(file)));
assert(!unthemed.length, "component colors must use theme-tokens.css semantic roles", unthemed.map(file => file.slice(sourceRoot.length)));


const pageLevelSelectors = [
  ".page-hero", ".workspace-page-head", ".layer-hero", ".knowledge-hero", ".focus-workspace-head",
  ".now-board", ".stage-focus-turns", ".life-map-note", ".model-definition",
  ".collection-detail-head", ".person-relationship-context", ".letter-date-context", ".advanced-safety",
  ".intent-selector button.active", ".session-steps li.current", ".route-sign", ".section-tabs",
  ".people-index", ".letter-index", ".model-index",
];
const warmFill = /background(?:-color)?\s*:[^;]*(?:var\(--(?:signal|accent-attention)\)|#ffd60a|#ffe77a|#f2c94c)/i;
const lifestyleDarkSelectors = [".growth-route", ".stage-focus", ".advanced-safety"];
const darkFill = /background(?:-color)?\s*:[^;]*(?:var\(--ink\)|#(?:151515|202020|22262d))/i;

for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const selector = match[1].trim();
  const declarations = match[2];
  if (pageLevelSelectors.some((name) => selector.includes(name)) && warmFill.test(declarations)) violations.push(selector.replace(/\s+/g, " "));
  if (lifestyleDarkSelectors.some((name) => selector.includes(name)) && darkFill.test(declarations)) violations.push(selector.replace(/\s+/g, " "));
}

assert(!violations.length, "attention colors cannot fill page-level surfaces", violations);
assert(!/\beyebrow\s*=|\beyebrow\s*:/.test(source), "generic decorative eyebrow labels are not part of the page hierarchy");
assert(!/provenance-band|(?:01|02|03) · (?:所在阶段|同时出现|直接相连)/.test(source), "evidence relationships cannot be presented as a decorative process strip");
assert(!/local-navigation-inner[^}]*box-shadow\s*:(?!\s*none)/s.test(css), "secondary navigation cannot return to a floating card treatment");
assert(!/font-size\s*:\s*[89]px\b|font\s*:[^;{}]*\b[89]px\//.test(css), "visible interface metadata cannot fall below the 10px floor");
assert(/aria-current=/.test(source) && /addEventListener\("scroll"/.test(source), "the Markdown outline must expose and track the currently read section");
assert(/function EditableDocument/.test(source) && /setTimeout\(\(\) => void persist\(draft\), 800\)/.test(source), "Markdown editing must keep one shared autosave implementation");
assert(/shouldEnterDocumentEditMode/.test(source) && /onClick=\{requestEditing\}/.test(source), "shared Markdown editing must activate on a single click");
assert(/\.record-document-scroll[^}]*overflow:\s*auto/.test(css) && /\.document-surface\.outline-pinned/.test(css), "all documents must share a scrolling reading column and docked outline");
assert(!/function CollapsibleIndexPane/.test(source) && /relationships-person-detail/.test(source), "document browsers share the current list while relationships keep their inline detail");
assert(["features/knowledge/Cards.tsx", "features/knowledge/MentalModels.tsx", "features/knowledge/Letters.tsx", "features/sources/Sources.tsx"].every(file => {
  const component = read(join(sourceRoot, file));
  return /<FileBrowserWorkspace\b/.test(component) && /<FileBrowserPane\b/.test(component) && /<(DocumentPreview|ReadOnlyDocument)\b/.test(component);
}), "indexed document views must share the file workspace and document renderer");
assert(/function PageAgentContext/.test(source) && [...source.matchAll(/<PageAgentContext\b/g)].length >= 12, "pages must publish context to the shared inspector");
assert(/\/api\/agent-settings/.test(source) && /"agent-settings"/.test(source) && /window\.setTimeout\(\(\) => \{ void save\(false\)/.test(source) && !/className="ai-config-footer"/.test(source), "Agent settings must autosave globally without an apply footer and refresh every entry");
assert(/agent-settings\.css/.test(read(join(sourceRoot, "features/collaboration/AgentSettings.tsx"))) && !/\.ai-(?:runtime|config-fields|model|key)|\.agent-key-/.test(read(join(sourceRoot, "features/desktop/preferences.css"))) && !/\.agent-settings-dialog \.ai-(?:runtime|config-fields|model|key)|\.agent-settings-dialog \.agent-key-/.test(read(join(sourceRoot, "styles/agent-conversation.css"))), "AI settings controls must use one shared stylesheet in preferences and the conversation dialog");
assert(/\/api\/agent-provider-presets/.test(source) && /模型厂商/.test(source) && /模型与思考/.test(source) && /selectedProvider/.test(source), "third-party Agent settings must use the shared vendor catalog without asking for an endpoint");

console.log(`Design contract passed across ${files.length} modular source files.`);

function collectFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(absolute) : [absolute];
  });
}

function read(file) {
  return readFileSync(file, "utf8");
}

function assert(condition, message, details = []) {
  if (condition) return;
  console.error(`Design contract failed: ${message}.`);
  for (const detail of details) console.error(`- ${detail}`);
  process.exit(1);
}
