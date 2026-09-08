import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { access, chmod, copyFile, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const exec = promisify(execFile);
const studio = fileURLToPath(new URL("../../..", import.meta.url));
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function temporaryWorkspace() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "twh-clean-start-")));
  roots.push(root);
  return root;
}

async function executable(file: string, content: string) {
  await writeFile(file, content);
  await chmod(file, 0o755);
}

async function launcherFixture(installation = "global") {
  const root = await temporaryWorkspace();
  const project = path.join(root, "studio with spaces");
  const bin = path.join(root, "bin");
  const trace = path.join(root, "commands.jsonl");
  for (const directory of ["scripts", "apps/web/src", "packages"]) await mkdir(path.join(project, directory), { recursive: true });
  await mkdir(bin);
  await writeFile(path.join(root, "the-way-here.config.yaml"), "version: 3\n");
  await writeFile(path.join(project, "package.json"), JSON.stringify({ packageManager: "pnpm@11.19.0", dependencies: { "demo-dep": "1.0.0" } }));
  await writeFile(path.join(project, "pnpm-lock.yaml"), "lockfile");
  for (const file of ["start.sh", "scripts/startup-cache.mjs", "scripts/startup-check.mjs"]) await copyFile(path.join(studio, file), path.join(project, file));
  await symlink(process.execPath, path.join(bin, "node"));
  await executable(path.join(bin, "python3"), "#!/bin/sh\necho 'Python 3.12.0'\n");
  const pnpmStub = `#!/usr/bin/env node
const { appendFileSync, mkdirSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
if (args[0] === "--version") console.log("11.19.0");
else {
  appendFileSync(process.env.STARTUP_TEST_TRACE, JSON.stringify({ args, npmRegistry: process.env.npm_config_registry, pnpmRegistry: process.env.pnpm_config_registry }) + "\\n");
  const put = (file, text) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, text); };
  if (args[0] === "install") {
    put("node_modules/.modules.yaml", "modules"); put("node_modules/.pnpm/lock.yaml", "lock");
    put("node_modules/demo-dep/package.json", JSON.stringify({ name: "demo-dep", version: "1.0.0" }));
  }
  if (args[0] === "build") {
    if (process.env.STARTUP_TEST_FAIL_BUILD) process.exit(23);
    put("apps/web/dist/index.html", "<html>demo</html>"); put("apps/web/dist/chunk.js", "export default 1"); put("apps/server/dist/index.js", "export default 1");
  }
}
`;
  await executable(path.join(bin, "pnpm"), installation === "global" ? pnpmStub : pnpmStub.replace('console.log("11.19.0")', 'console.log("10.0.0")'));
  if (installation === "stale-local") {
    const target = path.join(project, ".runtime/pnpm/node_modules/.bin/pnpm");
    await mkdir(path.dirname(target), { recursive: true });
    await executable(target, pnpmStub.replace('console.log("11.19.0")', 'console.log("10.0.0")'));
  }
  await executable(path.join(bin, "npm"), `#!/usr/bin/env node
import { appendFileSync, chmodSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
const args = process.argv.slice(2);
if (args[0] === "--version") { console.log("10.9.0"); process.exit(0); }
appendFileSync(process.env.STARTUP_TEST_TRACE, JSON.stringify({ args: ["npm", ...args], npmRegistry: process.env.npm_config_registry, pnpmRegistry: process.env.pnpm_config_registry }) + "\\n");
const target = path.join(args[args.indexOf("--prefix") + 1], "node_modules/.bin");
mkdirSync(target, { recursive: true });
writeFileSync(path.join(target, "pnpm"), readFileSync(process.env.STARTUP_TEST_PNPM_STUB, "utf8").replace('console.log("10.0.0")', 'console.log("11.19.0")'));
chmodSync(path.join(target, "pnpm"), 0o755);
`);
  await writeFile(path.join(project, "scripts/start.mjs"), `import { appendFileSync } from "node:fs";
appendFileSync(process.env.STARTUP_TEST_TRACE, JSON.stringify({ args: ["server-start", ...process.argv.slice(2)] }) + "\\n");
`);
  // The fixture's preflight resolves YAML with the real existing project dependency.
  await mkdir(path.join(project, "node_modules"), { recursive: true });
  await symlink(path.join(studio, "node_modules/yaml"), path.join(project, "node_modules/yaml"));
  return {
    root, project, bin, trace,
    launch: (extra: string[] = [], env: NodeJS.ProcessEnv = {}) => exec("/bin/bash", [path.join(project, "start.sh"), "--vault", root, "--knowledge-base", "demo", "--port", "5432", ...extra], {
      cwd: root,
      env: { ...process.env, PATH: `${bin}:/usr/bin:/bin`, STARTUP_TEST_TRACE: trace, STARTUP_TEST_PNPM_STUB: path.join(bin, "pnpm"), npm_config_registry: "http://127.0.0.1:9/", pnpm_config_registry: "http://127.0.0.1:9/", NODE_ENV: "production", ...env },
    }),
    commands: async (): Promise<any[]> => (await readFile(trace, "utf8")).trim().split("\n").map((line) => JSON.parse(line)),
  };
}

describe("fresh-clone startup", () => {
  it("builds a server that starts and serves HTTP using plain Node", async () => {
    const root = await temporaryWorkspace();
    const server = path.join(studio, "apps/server");
    const dist = path.join(root, "dist");
    const vault = path.join(root, "workspace");
    await mkdir(vault);
    await writeFile(path.join(vault, "the-way-here.config.yaml"), "version: 3\ndefaultKnowledgeBase: demo\nknowledgeBases:\n  demo:\n    name: Startup demo\n");
    await symlink(path.join(server, "node_modules"), path.join(root, "node_modules"), "dir");
    const manifest = JSON.parse(await readFile(path.join(server, "package.json"), "utf8"));
    await exec("/bin/sh", ["-c", `${manifest.scripts.build} --out-dir "$STARTUP_TEST_DIST"`], {
      cwd: server,
      env: { ...process.env, PATH: `${path.join(server, "node_modules/.bin")}:${process.env.PATH}`, STARTUP_TEST_DIST: dist },
    });
    const child = spawn(process.execPath, ["--input-type=module", "--eval", `
      import os from "node:os";
      import { pathToFileURL } from "node:url";
      os.homedir = () => process.env.STARTUP_TEST_ROOT;
      await import(pathToFileURL(process.env.STARTUP_TEST_ENTRY).href);
    `], {
      env: {
        ...process.env,
        NODE_OPTIONS: "",
        STARTUP_TEST_ROOT: root,
        STARTUP_TEST_ENTRY: path.join(dist, "index.js"),
        THE_WAY_HERE_VAULT: vault,
        THE_WAY_HERE_KNOWLEDGE_BASE: "demo",
        THE_WAY_HERE_PORT: "0",
        THE_WAY_HERE_DEV: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    const exited = new Promise<void>((resolve) => child.once("close", () => resolve()));
    try {
      await expect.poll(() => {
        if (child.exitCode !== null) throw new Error(output);
        return output.match(/Server listening at (http:\/\/127\.0\.0\.1:\d+)/)?.[1];
      }, { timeout: 10_000 }).toBeTruthy();
      const address = output.match(/Server listening at (http:\/\/127\.0\.0\.1:\d+)/)![1];
      const response = await fetch(`${address}/api/health`);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true, vaultRoot: vault });
    } finally {
      child.kill("SIGTERM");
      await exited;
    }
  }, 20_000);

  it.each(["global", "bootstrap", "stale-local"])("reuses dependencies and build outputs with %s pnpm", async (installation) => {
    const fixture = await launcherFixture(installation);
    const result = await fixture.launch();
    expect(result.stdout, result.stderr).toContain("正在启动服务");
    const commands = await fixture.commands();
    const registry = "https://registry.npmjs.org/";
    if (installation !== "global") {
      const bootstrap = commands.shift();
      expect(bootstrap.args).toEqual([
        "npm", "install", "--registry", registry,
        "--prefix", path.join(fixture.project, ".runtime/pnpm"),
        "--include=dev", "--no-save", "--no-package-lock", "--ignore-scripts", "--loglevel=error", "pnpm@11.19.0",
      ]);
      expect(bootstrap).toMatchObject({ npmRegistry: registry, pnpmRegistry: registry });
    }
    expect(commands.map((command) => command.args)).toEqual([
      ["install", "--frozen-lockfile", "--prefer-offline", "--prod=false", "--registry", registry],
      ["build"],
      ["server-start", "--vault", fixture.root, "--port", "5432", "--knowledge-base", "demo"],
    ]);
    for (const command of commands.slice(0, 2)) expect(command).toMatchObject({ npmRegistry: registry, pnpmRegistry: registry });
    const warm = await fixture.launch();
    expect(warm.stdout).toContain("跳过安装");
    expect(warm.stdout).toContain("跳过构建");
    expect((await fixture.commands()).slice(-1)[0].args[0]).toBe("server-start");
    expect((await fixture.commands()).filter((command) => command.args[0] === "install")).toHaveLength(1);
  }, 20_000);

  it.each([{ corrupt: false, npmOnly: false }, { corrupt: true, npmOnly: false }, { corrupt: false, npmOnly: true }])("bootstraps missing Node/npm and verifies its download (%j)", async ({ corrupt, npmOnly }) => {
    const fixture = await launcherFixture(npmOnly ? "bootstrap" : "global");
    const platform = process.platform === "darwin" ? "darwin" : "linux";
    const architecture = process.arch === "arm64" ? "arm64" : "x64";
    const archive = `node-v22.19.0-${platform}-${architecture}.tar.gz`;
    const payload = path.join(fixture.root, "node-payload");
    await mkdir(path.join(payload, "bin"), { recursive: true });
    await symlink(process.execPath, path.join(payload, "bin/node"));
    await copyFile(path.join(fixture.bin, "npm"), path.join(payload, "bin/npm"));
    await exec("tar", ["-czf", path.join(fixture.root, archive), "-C", fixture.root, "node-payload"]);
    const checksum = createHash("sha256").update(await readFile(path.join(fixture.root, archive))).digest("hex");
    await writeFile(path.join(fixture.root, "SHASUMS256.txt"), `${corrupt ? "0".repeat(64) : checksum}  ${archive}\n`);
    if (npmOnly) await executable(path.join(fixture.bin, "npm"), "#!/bin/sh\nexit 1\n");
    else {
      await rm(path.join(fixture.bin, "node"));
      await executable(path.join(fixture.bin, "node"), "#!/bin/sh\nexit 1\n");
    }
    await executable(path.join(fixture.bin, "curl"), `#!${process.execPath}
const { copyFileSync, appendFileSync } = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2), url = args.find((arg) => arg.startsWith("https://"));
appendFileSync(process.env.STARTUP_TEST_TRACE, JSON.stringify({ args: ["download", url] }) + "\\n");
copyFileSync(path.join(${JSON.stringify(fixture.root)}, path.basename(url)), args[args.indexOf("-o") + 1]);
`);
    if (corrupt) {
      await expect(fixture.launch()).rejects.toThrow("安装包校验失败");
      await expect(access(path.join(fixture.project, ".runtime/node/bin/node"))).rejects.toThrow();
    } else {
      await fixture.launch();
      const warm = await fixture.launch();
      expect(warm.stdout).toContain("跳过安装");
      expect(warm.stdout).toContain("跳过构建");
      const downloads = (await fixture.commands()).filter((command) => command.args[0] === "download");
      expect(downloads.map((command) => command.args[1])).toEqual([
        "https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt",
        `https://nodejs.org/dist/v22.19.0/${archive}`,
      ]);
    }
  }, 20_000);

  it("prepares missing Python and pip dependencies locally, then reuses them", async () => {
    const fixture = await launcherFixture();
    await mkdir(path.join(fixture.root, "knowledge-engine"));
    await writeFile(path.join(fixture.root, "knowledge-engine/requirements.txt"), "PyYAML>=6,<7\n");
    await executable(path.join(fixture.bin, "python3"), "#!/bin/sh\nexit 1\n");
    const managedPython = path.join(fixture.root, "managed-python");
    await executable(managedPython, `#!${process.execPath}
const { existsSync } = require("node:fs");
const args = process.argv.slice(2);
if (args[0] === "--version") console.log("Python 3.12.0");
if (args[0] === "-m") process.exit(1);
if (args[1]?.includes("import yaml")) process.exit(existsSync(${JSON.stringify(path.join(fixture.project, ".runtime/python-packages/installed"))}) ? 0 : 1);
`);
    await executable(path.join(fixture.bin, "uv"), `#!${process.execPath}
const { appendFileSync, mkdirSync, writeFileSync } = require("node:fs");
const args = process.argv.slice(2);
if (args[0] === "--version") console.log("uv 0.11.22");
else {
  appendFileSync(process.env.STARTUP_TEST_TRACE, JSON.stringify({ args: ["uv", ...args], pythonDir: process.env.UV_PYTHON_INSTALL_DIR }) + "\\n");
  if (args.includes("find")) console.log(${JSON.stringify(managedPython)});
  if (args.includes("pip")) {
    const target = args[args.indexOf("--target") + 1];
    mkdirSync(target, { recursive: true }); writeFileSync(target + "/installed", "yaml6");
  }
}
`);
    await fixture.launch();
    const warm = await fixture.launch();
    expect(warm.stdout).toContain("跳过安装");
    const uv = (await fixture.commands()).filter((command) => command.args[0] === "uv");
    expect(uv).toHaveLength(3);
    expect(uv[0]).toMatchObject({ args: ["uv", "--no-config", "python", "install", "3.12", "--no-bin"], pythonDir: path.join(fixture.project, ".runtime/python") });
    expect(uv[2].args).toContain("https://pypi.org/simple");
    expect(uv[2].args).toContain(path.join(fixture.project, ".runtime/python-packages"));
  }, 20_000);

  it("invalidates only the necessary cache and repairs a removed dependency", async () => {
    const fixture = await launcherFixture();
    await fixture.launch();
    await writeFile(path.join(fixture.project, "apps/web/src/new.ts"), "export const changed = true;");
    let result = await fixture.launch();
    expect(result.stdout).toContain("跳过安装");
    expect(result.stdout).not.toContain("跳过构建");
    await rm(path.join(fixture.project, "apps/web/dist/chunk.js"));
    result = await fixture.launch();
    expect(result.stdout).toContain("跳过安装");
    expect(result.stdout).not.toContain("跳过构建");
    await rm(path.join(fixture.project, "node_modules/demo-dep"), { recursive: true });
    result = await fixture.launch();
    expect(result.stdout).not.toContain("跳过安装");
    expect(result.stdout).not.toContain("跳过构建");
    await writeFile(path.join(fixture.project, "pnpm-lock.yaml"), "lockfile changed");
    result = await fixture.launch();
    expect(result.stdout).not.toContain("跳过安装");
    expect((await fixture.commands()).filter((command) => command.args[0] === "install")).toHaveLength(3);
  }, 20_000);

  it("never caches a failed build and accepts explicit rebuild/reinstall", async () => {
    const fixture = await launcherFixture();
    await expect(fixture.launch([], { STARTUP_TEST_FAIL_BUILD: "1" })).rejects.toThrow();
    await expect(access(path.join(fixture.project, ".runtime/build-state.json"))).rejects.toThrow();
    const retry = await fixture.launch();
    expect(retry.stdout).toContain("跳过安装");
    expect(retry.stdout).not.toContain("跳过构建");
    const rebuild = await fixture.launch(["--rebuild"]);
    expect(rebuild.stdout).toContain("跳过安装");
    expect(rebuild.stdout).not.toContain("跳过构建");
    await expect(fixture.launch(["--rebuild"], { STARTUP_TEST_FAIL_BUILD: "1" })).rejects.toThrow();
    await expect(access(path.join(fixture.project, ".runtime/build-state.json"))).rejects.toThrow();
    expect((await fixture.launch()).stdout).not.toContain("跳过构建");
    const reinstall = await fixture.launch(["--reinstall"]);
    expect(reinstall.stdout).not.toContain("跳过安装");
  }, 20_000);

  it("resolves relative vault paths from the caller and accepts leading-zero ports", async () => {
    const fixture = await launcherFixture();
    await fixture.launch(["--vault", ".", "--port", "05432"]);
    expect((await fixture.commands()).at(-1).args).toContain(fixture.root);
    expect((await fixture.commands()).at(-1).args).toContain("5432");
    await expect(fixture.launch(["--port", "999999999999999999999"])).rejects.toThrow("端口必须");
    await expect(fixture.launch(["--vault", "missing"])).rejects.toThrow("找不到工作区");
  }, 20_000);

  it("stops before package installation when a port or startup lock is occupied", async () => {
    const fixture = await launcherFixture();
    const { createServer } = await import("node:net");
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address() as { port: number };
      await expect(fixture.launch(["--port", String(address.port)])).rejects.toThrow("已被占用");
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
    await mkdir(path.join(fixture.project, ".runtime"), { recursive: true });
    await writeFile(path.join(fixture.project, ".runtime/startup.lock"), String(process.pid));
    await expect(fixture.launch()).rejects.toThrow("已有启动过程");
    await expect(access(fixture.trace)).rejects.toThrow();
  }, 20_000);

  it("uses shipped demo directories when an unshipped personal vault is configured", async () => {
    const fixture = await launcherFixture();
    await mkdir(path.join(fixture.project, "node_modules"), { recursive: true });
    await mkdir(path.join(fixture.root, "vault/demo/wiki"), { recursive: true });
    await mkdir(path.join(fixture.root, "vault/demo/sources"), { recursive: true });
    await writeFile(path.join(fixture.root, "the-way-here.config.yaml"), `version: 3
defaultKnowledgeBase: personal
knowledgeBases:
  personal:
    paths: {wiki: vault/personal/wiki, sources: vault/personal/sources}
  demo:
    paths: {wiki: vault/demo/wiki, sources: vault/demo/sources}
`);
    const check = (...args: string[]) => exec(process.execPath, [path.join(fixture.project, "scripts/startup-check.mjs"), "knowledge-base", fixture.root, ...args]);
    expect((await check()).stdout.trim()).toBe("demo");
    await mkdir(path.join(fixture.root, "vault/personal/wiki"), { recursive: true });
    await mkdir(path.join(fixture.root, "vault/personal/sources"), { recursive: true });
    expect((await check()).stdout.trim()).toBe("personal");
    expect((await check("demo")).stdout.trim()).toBe("demo");
    await expect(check("missing")).rejects.toThrow("知识库不存在");
  }, 20_000);

  it("prepares module-worker and grouping assets without pre-existing public files", async () => {
    const root = await temporaryWorkspace();
    await mkdir(path.join(root, "scripts"));
    await copyFile(path.join(studio, "apps/web/scripts/prepare-photo-assets.mjs"), path.join(root, "scripts/prepare-photo-assets.mjs"));
    await symlink(path.join(studio, "apps/web/node_modules"), path.join(root, "node_modules"), "dir");
    await expect(access(path.join(root, "public"))).rejects.toThrow();

    await exec(process.execPath, [path.join(root, "scripts/prepare-photo-assets.mjs")]);

    const loader = await readFile(path.join(root, "public/mediapipe/vision_wasm_module_internal.js"), "utf8");
    expect(loader).toContain("export default");
    for (const file of ["mediapipe/vision_wasm_module_internal.wasm", "onnx/ort-wasm-simd-threaded.wasm"]) {
      expect((await readFile(path.join(root, "public", file))).subarray(0, 4)).toEqual(Buffer.from([0, 97, 115, 109]));
    }
    expect((await readFile(path.join(root, "public/onnx/ort-wasm-simd-threaded.mjs"))).length).toBeGreaterThan(0);
    const webPackage = JSON.parse(await readFile(path.join(studio, "apps/web/package.json"), "utf8"));
    for (const script of [webPackage.scripts.build, webPackage.scripts.dev]) {
      expect(script.indexOf("node scripts/prepare-photo-assets.mjs")).toBe(0);
    }
  });
});
