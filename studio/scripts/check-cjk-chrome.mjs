/**
 * Report Chinese that can still reach the English UI.
 *
 * Resolved catalog keys, agent prompts, demo body tables, and tests are excluded.
 * Everything else is a failure unless it is on the explicit whitelist.
 *
 *   node studio/scripts/check-cjk-chrome.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ts = createRequire(path.join(studio, "apps/web/package.json"))("typescript");

const roots = ["apps/web/src", "apps/desktop/src", "apps/server/src"].map((dir) => path.join(studio, dir));
const CJK = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/;
const skipFiles = new Set([
  "apps/web/src/shared/i18n/demo-body-data.ts",
  "apps/web/src/shared/i18n/demo-json-data.ts",
  "apps/web/src/shared/i18n/demo-overlay.ts",
  "apps/web/src/shared/i18n/en-messages.ts",
]);
const whitelistFiles = new Set([
  "apps/server/src/modules/imports/payment-statement.ts",
  "apps/server/src/services/storage-policy.ts",
  "apps/server/src/runtime/agent-runtime/pi/pi-tools.ts",
]);
const promptFiles = new Set([
  "apps/web/src/features/overview/conversation-prompts.ts",
  "apps/web/src/features/sources/journey-conversation.ts",
  "apps/web/src/features/sources/memory-writing.ts",
  "apps/web/src/features/sources/photo-stories.ts",
  "apps/server/src/modules/imports/photo-person-bindings.ts",
  "apps/server/src/runtime/agent-runtime/pi/pi-runtime-adapter.ts",
  "apps/server/src/modules/content/capture-history-store.ts",
  "apps/server/src/services/run-policy.ts",
  "apps/server/src/runtime/agent-runtime/codex-runtime-adapter.ts",
  "apps/server/src/cli/search-wiki.ts",
]);
const contentFiles = new Set([
  "apps/server/src/modules/imports/photo-memory-store.ts",
  "apps/server/src/modules/imports/journey-report-store.ts",
  "apps/server/src/modules/imports/chat/index.ts",
  "apps/server/src/modules/imports/chat/chatgpt-adapter.ts",
  "apps/server/src/modules/imports/chat/claude-adapter.ts",
  "apps/server/src/routes/capture-routes.ts",
  "apps/server/src/modules/imports/import-store.ts",
  "apps/server/src/runtime/source-connections.ts",
  "apps/server/src/modules/content/source-folder-catalog.ts",
  "apps/server/src/modules/content/capture-record-store.ts",
]);
const storedProps = new Set(["prompt", "displayPrompt", "agentPrompt", "sourceModule", "folder", "channel", "kind", "phase", "command", "accelerator"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|mjs|cjs)$/.test(name) && !/\.test\.|\.d\.ts$/.test(name)) out.push(full);
  }
  return out;
}

const enPath = path.join(studio, "apps/web/src/shared/i18n/en-messages.ts");
const enSource = readFileSync(enPath, "utf8");
const enFile = ts.createSourceFile(enPath, enSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const catalog = new Set();
(function collect(node) {
  if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.name)) catalog.add(node.name.text);
  ts.forEachChild(node, collect);
})(enFile);

function scriptKind(file) {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".ts")) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

function isTranslateCall(node) {
  return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ["t", "tr", "translate", "translateLocale"].includes(node.expression.text);
}

function literalText(node) {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) return node.text;
  return undefined;
}

const failures = [];
const whitelist = [];

function record(bucket, file, line, reason, text) {
  bucket.push({ file, line, reason, text: text.replace(/\s+/g, " ").slice(0, 180) });
}

for (const root of roots) {
  for (const file of walk(root)) {
    const rel = path.relative(studio, file);
    if (skipFiles.has(rel)) continue;
    const source = readFileSync(file, "utf8");
    if (!CJK.test(source)) continue;
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind(file));
    const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

    function visit(node) {
      const text = ts.isJsxText(node) ? node.getText(sf) : literalText(node);
      const interesting = text && CJK.test(text) && text.trim();
      if (interesting) {
        let parent = node.parent;
        let translated = false;
        while (parent) {
          if (isTranslateCall(parent)) { translated = true; break; }
          parent = parent.parent;
        }
        const templatePart = ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node);
        const reason = classify(node, rel, text, translated && !templatePart);
        if (reason === "resolved") {
          /* Catalog keys are the English UI. */
        } else if (reason) record(whitelist, rel, lineOf(node), reason, text.trim());
        else record(failures, rel, lineOf(node), "visible", text.trim());
      }
      ts.forEachChild(node, visit);
    }
    visit(sf);
  }
}

function enclosingTemplateText(node) {
  let cursor = node.parent;
  while (cursor && !ts.isTemplateExpression(cursor)) cursor = cursor.parent;
  if (!cursor || !ts.isTemplateExpression(cursor)) return "";
  const source = cursor.getSourceFile();
  let text = cursor.head.text;
  for (const span of cursor.templateSpans) text += "${" + span.expression.getText(source) + "}" + span.literal.text;
  return text;
}

function isThrown(node) {
  let cursor = node.parent;
  while (cursor) {
    if (ts.isThrowStatement(cursor)) return true;
    if (ts.isNewExpression(cursor)) {
      const name = ts.isIdentifier(cursor.expression) ? cursor.expression.text : ts.isPropertyAccessExpression(cursor.expression) ? cursor.expression.name.text : "";
      if (/Error$/.test(name)) return true;
    }
    cursor = cursor.parent;
  }
  return false;
}

function classify(node, rel, text, translated) {
  if (whitelistFiles.has(rel)) return "whitelist-file";
  if (promptFiles.has(rel) && !isThrown(node)) return "agent-prompt";
  const templatePart = ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node);
  if (translated && catalog.has(text)) return "resolved";
  if (catalog.has(text) && !ts.isJsxText(node) && !templatePart) return "resolved";
  const templateText = (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) ? enclosingTemplateText(node) : "";
  if (templateText && catalog.has(templateText)) return "resolved";
  if (text === "外部来源/" || text.startsWith("随手记")) return "stored-id";
  if (contentFiles.has(rel) && !isThrown(node)) return "stored-content";
  if (rel.endsWith("prediction-service.ts") && !isThrown(node) && !templateText.includes("正在展开第")) return "agent-prompt";
  if (rel.endsWith("run-coordinator.ts") && !isThrown(node) && /用户：|用户补充：|Agent：|只输出 JSON|对话材料|本轮是纯聊天/.test(templateText)) return "agent-prompt";
  const parent = node.parent;
  if (parent && (ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent)) && parent.name === node) return "stored-id";
  if (parent && ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name) && storedProps.has(parent.name.text)) return "stored-id";
  if (parent && (ts.isCallExpression(parent) || ts.isBinaryExpression(parent))) {
    const callee = ts.isCallExpression(parent) && ts.isPropertyAccessExpression(parent.expression) ? parent.expression.name.text : "";
    if (["includes", "startsWith", "endsWith", "indexOf"].includes(callee)) return "stored-id";
    if (ts.isBinaryExpression(parent) && (parent.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken || parent.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken || parent.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken)) return "stored-id";
  }
  let cursor = parent;
  while (cursor) {
    if (ts.isPropertyAssignment(cursor) && ts.isIdentifier(cursor.name) && ["prompt", "displayPrompt", "agentPrompt"].includes(cursor.name.text)) return "agent-prompt";
    cursor = cursor.parent;
  }
  if (rel.endsWith("features/collaboration/model.ts") && !translated) return "agent-prompt";
  let branch = node.parent;
  while (branch) {
    if (ts.isConditionalExpression(branch)) {
      const condition = branch.condition.getText();
      if (/[Ll]ocale(?:\(\))?\s*===\s*['"]en['"]/.test(condition)) {
        const inChinese = branch.whenFalse.getStart(branch.getSourceFile()) <= node.getStart(node.getSourceFile()) && node.getEnd() <= branch.whenFalse.getEnd();
        if (inChinese) return "zh-locale-branch";
      }
    }
    branch = branch.parent;
  }
  let fn = parent;
  while (fn) {
    if ((ts.isFunctionDeclaration(fn) || ts.isFunctionExpression(fn)) && fn.name && /Prompt|prompt/.test(fn.name.text)) return "agent-prompt";
    fn = fn.parent;
  }
  if (rel.endsWith("talking-questions.ts") && (text.includes("请先") || text.includes("一次只问"))) return "agent-prompt";
  return "";
}

const byReason = new Map();
for (const hit of whitelist) {
  const key = `${hit.reason}\t${hit.file}`;
  byReason.set(key, (byReason.get(key) || 0) + 1);
}
console.log(`catalog=${catalog.size} whitelist=${whitelist.length} visible=${failures.length}`);
if (failures.length) {
  console.log("\n# visible Chinese still outside the catalog");
  for (const hit of failures) console.log(`${hit.file}:${hit.line}\t${hit.text}`);
}
console.log("\n# whitelist");
for (const [key, count] of [...byReason.entries()].sort()) console.log(`${count}\t${key}`);
if (failures.length) process.exit(1);
