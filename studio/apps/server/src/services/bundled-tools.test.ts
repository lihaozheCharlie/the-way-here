import { mkdtemp, mkdir, writeFile, rm, symlink, realpath, access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi } from "vitest";
import { executableTool, validationCommand } from "./bundled-tools.js";

describe("signed knowledge tools",()=>{
  it("redirects transitive scripts into the bundle and isolates Python startup and runner arguments",async()=>{
    const root=await realpath(await mkdtemp(path.join(os.tmpdir(),"twh-child-tools-")));
    try {
      const engine=path.join(root,"signed/knowledge-engine"), workspace=path.join(root,"user"), mutable=path.join(workspace,"knowledge-engine/tools");
      await mkdir(path.join(engine,"tools"),{recursive:true});await mkdir(mutable,{recursive:true});
      const marker=path.join(root,"mutable-ran");
      const hostile=`from pathlib import Path\nPath(${JSON.stringify(marker)}).write_text('executed')\n`;
      await writeFile(path.join(mutable,"child.py"),hostile);
      await writeFile(path.join(workspace,"sitecustomize.py"),hostile);
      await writeFile(path.join(engine,"tools/vault_context.py"),'from pathlib import Path\nROOT=Path(__file__).resolve().parents[2]\n');
      await writeFile(path.join(engine,"tools/child.py"),'import sys,vault_context\nprint("signed-child",vault_context.ROOT,sys.argv[1:])\n');
      await writeFile(path.join(engine,"tools/check.py"),'import subprocess,sys,vault_context\nsubprocess.run([sys.executable,str(vault_context.ROOT/"knowledge-engine/tools/child.py"),"--help"],check=True)\nprint("parent-args",sys.argv[1:])\n');
      vi.stubEnv("TWH_BUNDLED_ENGINE",engine);vi.stubEnv("TWH_BUNDLED_PYTHON","python3");
      vi.stubEnv("TWH_KNOWLEDGE_RUNNER",path.resolve(import.meta.dirname,"../../../../apps/desktop/native/run-knowledge-tool.py"));
      const command=validationCommand(["python3","knowledge-engine/tools/check.py","--workspace","/forged"],workspace);
      const result=spawnSync(command[0]!,command.slice(1),{encoding:"utf8",cwd:workspace,env:{...process.env,PYTHONPATH:workspace}});
      expect(result.stderr).toBe("");expect(result.status).toBe(0);expect(result.stdout).toContain(`signed-child ${workspace} ['--help']`);expect(result.stdout).toContain("['--workspace', '/forged']");
      await expect(access(marker)).rejects.toThrow();
      for(const program of ['import subprocess,sys; subprocess.run([sys.executable,"-c","print(123)"])','import os; os.system("echo forbidden")','import subprocess; subprocess.run(["/bin/sh","-c","echo forbidden"])','import os,sys; os.posix_spawn(sys.executable,[sys.executable,"-c","print(123)"],{})']){
        await writeFile(path.join(engine,"tools/check.py"),program);
        const blocked=spawnSync(command[0]!,command.slice(1),{encoding:"utf8",cwd:workspace});
        expect(blocked.status).not.toBe(0);expect(blocked.stdout).not.toContain("forbidden");
      }
      // A runner-mediated posix_spawn must stay allowed: Python 3.14 executes Popen
      // through posix_spawn on Linux, so the sandbox would otherwise reject the very
      // child it rewrote above. The forged executable case above keeps this closed.
      const runner=path.resolve(import.meta.dirname,"../../../../apps/desktop/native/run-knowledge-tool.py");
      const posixSpawn=`from pathlib import Path\nimport os,sys\npython=str(Path(sys.executable).resolve())\nargv=[python,"-I","-B",${JSON.stringify(runner)},"--engine",${JSON.stringify(engine)},"--workspace",${JSON.stringify(workspace)},"--script",${JSON.stringify(path.join(engine,"tools/child.py"))},"--","--help"]\npid=os.posix_spawn(python,argv,dict(os.environ))\nos.waitpid(pid,0)\nprint("posix-spawn-ok")\n`;
      await writeFile(path.join(engine,"tools/check.py"),posixSpawn);
      const allowed=spawnSync(command[0]!,command.slice(1),{encoding:"utf8",cwd:workspace});
      expect(allowed.stderr).toBe("");expect(allowed.status).toBe(0);expect(allowed.stdout).toContain("posix-spawn-ok");expect(allowed.stdout).toContain("signed-child");
    }finally{vi.unstubAllEnvs();await rm(root,{recursive:true,force:true});}
  });
  it("runs bundled code with the frozen workspace as data root, ignoring mutable Python",async()=>{
    const root=await realpath(await mkdtemp(path.join(os.tmpdir(),"twh-signed-tools-")));
    try {
      const engine=path.join(root,"signed/knowledge-engine"), workspace=path.join(root,"user");
      await mkdir(path.join(engine,"tools"),{recursive:true}); await mkdir(path.join(workspace,"knowledge-engine/tools"),{recursive:true});
      await writeFile(path.join(engine,"tools/vault_context.py"),'from pathlib import Path\nROOT = Path(__file__).resolve().parents[2]\n');
      await writeFile(path.join(engine,"tools/check.py"),'import vault_context\nprint(vault_context.ROOT)\n');
      await writeFile(path.join(workspace,"knowledge-engine/tools/vault_context.py"),'raise RuntimeError("mutable code executed")\n');
      vi.stubEnv("TWH_BUNDLED_ENGINE",engine);vi.stubEnv("TWH_BUNDLED_PYTHON","python3");
      vi.stubEnv("TWH_KNOWLEDGE_RUNNER",path.resolve(import.meta.dirname,"../../../../apps/desktop/native/run-knowledge-tool.py"));
      const command=validationCommand(["python3","knowledge-engine/tools/check.py"],workspace);
      const result=spawnSync(command[0]!,command.slice(1),{encoding:"utf8",cwd:workspace});
      expect(result.stderr).toBe("");expect(result.status).toBe(0);expect(result.stdout.trim()).toBe(workspace);
      await symlink(path.join(workspace,"knowledge-engine/tools/vault_context.py"),path.join(engine,"tools/escape.py"));
      expect(()=>executableTool("knowledge-engine/tools/escape.py",workspace)).toThrow("应用包外");
      expect(()=>executableTool("../outside.py",workspace)).toThrow();
      expect(()=>validationCommand(["sh","script.sh"],workspace)).toThrow();
    } finally {vi.unstubAllEnvs();await rm(root,{recursive:true,force:true});}
  });
});
