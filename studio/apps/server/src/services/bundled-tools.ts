import { realpathSync } from "node:fs";
import path from "node:path";

export function executableTool(requested: string, vaultRoot: string): string {
  const engine = process.env.TWH_BUNDLED_ENGINE;
  if (!engine) return requested;
  const logical = path.resolve(vaultRoot, "knowledge-engine");
  const relative = path.relative(logical, path.resolve(vaultRoot, requested));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || !relative.endsWith(".py")) throw new Error("只能执行随应用分发的知识工具");
  const root = realpathSync(engine);
  const resolved = realpathSync(path.join(root, relative));
  const actual = path.relative(root, resolved);
  if (actual.startsWith("..") || path.isAbsolute(actual)) throw new Error("知识工具不能指向应用包外");
  return resolved;
}

export function validationCommand(command: string[], vaultRoot: string): string[] {
  if (!process.env.TWH_BUNDLED_ENGINE) return command;
  if (command[0] !== "python3" || command.length < 2) throw new Error("桌面版只执行随包 Python 知识校验工具");
  if (!process.env.TWH_BUNDLED_PYTHON) throw new Error("随包 Python 不可用");
  if (!process.env.TWH_KNOWLEDGE_RUNNER) throw new Error("随包工具执行入口不可用");
  return [process.env.TWH_BUNDLED_PYTHON, "-I", "-B", process.env.TWH_KNOWLEDGE_RUNNER, "--engine", process.env.TWH_BUNDLED_ENGINE, "--workspace", vaultRoot, "--script", executableTool(command[1]!, vaultRoot), "--", ...command.slice(2)];
}
