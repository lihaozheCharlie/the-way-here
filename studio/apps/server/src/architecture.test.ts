import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const allowedPackages: Record<string, string[]> = {
  "apps/web": ["shared"],
  "apps/server": ["shared", "wiki-core", "life-views", "run-manager", "codex-bridge"],
  "packages/shared": [],
  "packages/wiki-core": ["shared"],
  "packages/life-views": ["shared", "wiki-core"],
  "packages/run-manager": ["shared"],
  "packages/codex-bridge": ["shared"],
};

function sourceFiles(directory: string): string[] {
  return readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(relative);
    return /\.tsx?$/.test(relative) && !/\.(?:test|d)\.tsx?$/.test(relative) ? [relative] : [];
  });
}

const files = Object.keys(allowedPackages).flatMap((owner) => sourceFiles(`${owner}/src`));
const ownerOf = (file: string) => file.split("/").slice(0, 2).join("/");

function dependencies(file: string, runtimeOnly = false): string[] {
  let content = readFileSync(path.join(root, file), "utf8");
  if (runtimeOnly) content = ts.transpileModule(content, {
    fileName: file,
    compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const imports: string[] = [];
  function visit(node: ts.Node): void {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) imports.push(node.arguments[0].text);
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) imports.push(node.argument.literal.text);
    if (ts.isNewExpression(node) && node.expression.getText(source) === "URL" && node.arguments?.[0] && ts.isStringLiteral(node.arguments[0])) imports.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return imports;
}

function resolve(file: string, specifier: string): string | undefined {
  if (specifier.startsWith("@the-way-here/")) {
    const name = specifier.slice("@the-way-here/".length);
    return `packages/${name}/src/index.ts`;
  }
  if (!specifier.startsWith(".")) return undefined;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
  const stem = base.replace(/\.js$/, "");
  return [base, `${stem}.ts`, `${stem}.tsx`, `${stem}/index.ts`, `${stem}/index.tsx`]
    .find((candidate) => existsSync(path.join(root, candidate)) && /\.tsx?$/.test(candidate));
}

const edges = new Map(files.map((file) => [file, dependencies(file)]));

describe("Studio dependency boundaries", () => {
  it("keeps packages behind their public contracts and the browser away from Node and backend code", () => {
    const violations: string[] = [];
    for (const [file, imports] of edges) for (const specifier of imports) {
      const owner = ownerOf(file);
      const target = resolve(file, specifier);
      if (specifier.startsWith("@the-way-here/") && !allowedPackages[owner]!.includes(specifier.slice("@the-way-here/".length))) violations.push(`${file} -> ${specifier}`);
      if (target && ownerOf(target) !== owner && !specifier.startsWith("@the-way-here/")) violations.push(`${file} bypasses a package entry: ${specifier}`);
      if ((owner === "apps/web" || owner === "packages/shared") && /^(?:node:|fs$|path$|child_process$)/.test(specifier)) violations.push(`${file} uses Node: ${specifier}`);
    }
    expect(violations).toEqual([]);
  });

  it("keeps shared frontend code below features and the application shell", () => {
    const violations: string[] = [];
    for (const [file, imports] of edges) {
      if (!file.startsWith("apps/web/src/")) continue;
      for (const specifier of imports) {
        const target = resolve(file, specifier);
        if (!target) continue;
        if (file.includes("/shared/") && /\/src\/(?:app|features)\//.test(target)) violations.push(`${file} -> ${target}`);
        if (file.includes("/features/") && target.includes("/src/app/")) violations.push(`${file} -> ${target}`);
      }
      if (file === "apps/web/src/api.ts" && imports.some((entry) => entry === "react")) violations.push("HTTP transport depends on React");
    }
    expect(violations).toEqual([]);
  });

  it("keeps domain modules independent of server orchestration and concrete agent adapters", () => {
    const violations: string[] = [];
    for (const [file, imports] of edges) for (const specifier of imports) {
      const target = resolve(file, specifier);
      if (!target) continue;
      if (file.startsWith("apps/server/src/modules/") && /\/src\/(?:runtime|routes|services)\//.test(target)) violations.push(`${file} -> ${target}`);
      if (file === "apps/server/src/runtime/run-coordinator.ts" && (target.includes("/modules/imports/") || /\/(?:registry|codex-runtime-adapter|pi-runtime-adapter)\.ts$/.test(target))) violations.push(`${file} -> ${target}`);
    }
    expect(violations).toEqual([]);
  });

  it("has no runtime import cycles", () => {
    const graph = new Map(files.map((file) => [file, dependencies(file, true).flatMap((specifier) => {
      const target = resolve(file, specifier);
      return target && files.includes(target) ? [target] : [];
    })]));
    const visited = new Set<string>();
    const active: string[] = [];
    const cycles: string[] = [];
    function visit(file: string): void {
      const start = active.indexOf(file);
      if (start !== -1) { cycles.push([...active.slice(start), file].join(" -> ")); return; }
      if (visited.has(file)) return;
      active.push(file);
      for (const dependency of graph.get(file) || []) visit(dependency);
      active.pop();
      visited.add(file);
    }
    for (const file of files) visit(file);
    expect(cycles).toEqual([]);
  });

  it("has no orphan source files outside the application and worker entry graphs", () => {
    const reached = new Set<string>();
    function visit(file: string): void {
      if (reached.has(file)) return;
      reached.add(file);
      for (const specifier of edges.get(file) || []) {
        const target = resolve(file, specifier);
        if (target) visit(target);
      }
    }
    visit("apps/web/src/main.tsx");
    visit("apps/server/src/index.ts");
    expect(files.filter((file) => !reached.has(file))).toEqual([]);
  });
});
