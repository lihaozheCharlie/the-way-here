import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const messagesPath = path.join(here, "../../web/src/shared/i18n/en-messages.ts");

function loadMessages() {
  const src = readFileSync(messagesPath, "utf8");
  const expr = src.replace(/export const enMessages:\s*Record<string,\s*string>\s*=\s*/, "return ").replace(/;\s*$/, "");
  return new Function(expr)();
}

const enMessages = loadMessages();
let locale = "zh";

export function getLocale() {
  return locale;
}

export function setLocale(next) {
  locale = next === "en" ? "en" : "zh";
}

export function readPersistedLocale(file) {
  try {
    const stored = JSON.parse(readFileSync(file, "utf8")).locale;
    return stored === "en" ? "en" : "zh";
  } catch {
    return "zh";
  }
}

export function persistLocale(file, next) {
  writeFileSync(file, JSON.stringify({ locale: next === "en" ? "en" : "zh" }));
}

function fillTemplate(template, params) {
  if (!params) return template;
  return template.replace(/\$\{([^}]+)\}/g, (full, expr) => {
    const key = expr.trim();
    if (Object.prototype.hasOwnProperty.call(params, key) && params[key] != null) return String(params[key]);
    return full;
  });
}

const CJK = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/;
let compiledTemplates;

function matchTemplate(message) {
  if (!CJK.test(message)) return undefined;
  if (!compiledTemplates) {
    compiledTemplates = [];
    for (const [key, english] of Object.entries(enMessages)) {
      if (!key.includes("${")) continue;
      const names = [];
      let pattern = "^";
      let staticText = "";
      const placeholder = /\$\{([^}]+)\}/g;
      let last = 0;
      let found;
      while ((found = placeholder.exec(key))) {
        const staticPart = key.slice(last, found.index);
        staticText += staticPart;
        pattern += staticPart.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([\\s\\S]+?)";
        names.push(found[1].trim());
        last = found.index + found[0].length;
      }
      staticText += key.slice(last);
      pattern += key.slice(last).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$";
      if (!CJK.test(staticText)) continue;
      compiledTemplates.push({ english, re: new RegExp(pattern), names, staticLength: staticText.length });
    }
    compiledTemplates.sort((a, b) => b.staticLength - a.staticLength);
  }
  for (const item of compiledTemplates) {
    const found = item.re.exec(message);
    if (!found) continue;
    const params = {};
    item.names.forEach((name, index) => { params[name] = found[index + 1] ?? ""; });
    return fillTemplate(item.english, params);
  }
  return undefined;
}

export function translateLocale(active, message, params) {
  if (!message) return message;
  if (active === "en" && Object.prototype.hasOwnProperty.call(enMessages, message)) return fillTemplate(enMessages[message], params);
  if (active === "en" && !params) {
    const matched = matchTemplate(message);
    if (matched) return matched;
  }
  return fillTemplate(message, params);
}

export function t(message, params) {
  return translateLocale(locale, message, params);
}
