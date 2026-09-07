import { execFile, spawn } from "node:child_process";
import { access, chmod, copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
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
  const root = await mkdtemp(path.join(os.tmpdir(), "twh-clean-start-"));
  roots.push(root);
  return root;
}

async function executable(file: string, content: string) {
  await writeFile(file, content);
  await chmod(file, 0o755);
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

  it("uses the workspace build pipeline before starting the server", async () => {
    const root = await temporaryWorkspace();
    const project = path.join(root, "studio");
    const bin = path.join(root, "bin");
    const trace = path.join(root, "commands.jsonl");
    await mkdir(path.join(project, "scripts"), { recursive: true });
    await mkdir(bin);
    await writeFile(path.join(root, "the-way-here.config.yaml"), "version: 3\n");
    await copyFile(path.join(studio, "start.sh"), path.join(project, "start.sh"));
    await symlink(process.execPath, path.join(bin, "node"));
    await executable(path.join(bin, "python3"), "#!/bin/sh\necho 'Python 3.12.0'\n");
    await executable(path.join(bin, "pnpm"), `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
if (args[0] === "--version") console.log("11.19.0");
else appendFileSync(process.env.STARTUP_TEST_TRACE, JSON.stringify(args) + "\\n");
`);
    await writeFile(path.join(project, "scripts/start.mjs"), `import { appendFileSync } from "node:fs";
appendFileSync(process.env.STARTUP_TEST_TRACE, JSON.stringify(["server-start", ...process.argv.slice(2)]) + "\\n");
`);

    await exec("/bin/bash", [path.join(project, "start.sh"), "--vault", root, "--knowledge-base", "demo", "--port", "5432"], {
      env: { ...process.env, PATH: `${bin}:/usr/bin:/bin`, STARTUP_TEST_TRACE: trace },
    });
    const commands = (await readFile(trace, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    expect(commands).toEqual([
      ["install", "--frozen-lockfile"],
      ["build"],
      ["server-start", "--vault", root, "--port", "5432", "--knowledge-base", "demo"],
    ]);
  });

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
