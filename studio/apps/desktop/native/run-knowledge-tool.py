"""Run immutable bundled tools against an explicitly bound user workspace."""
import argparse
import importlib.util
import os
from pathlib import Path
import runpy
import sys
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--engine', required=True)
parser.add_argument('--workspace', required=True)
parser.add_argument('--script', required=True)
args, remaining = parser.parse_known_args()
if remaining[:1] == ['--']:
    remaining = remaining[1:]
engine = Path(args.engine).resolve(strict=True)
workspace = Path(args.workspace).resolve(strict=True)
script = Path(args.script).resolve(strict=True)
if not script.is_relative_to(engine) or script.suffix != '.py':
    raise RuntimeError('Tool is outside the signed engine')
runner = Path(__file__).resolve(strict=True)
python = Path(sys.executable).resolve(strict=True)


def signed_script(requested):
    candidate = Path(requested)
    if not candidate.is_absolute():
        candidate = Path.cwd() / candidate
    # Match the logical workspace path before resolving its possibly hostile
    # symlinks. Code is always loaded from the corresponding signed engine.
    candidate = Path(os.path.abspath(candidate))
    logical = workspace / 'knowledge-engine'
    if candidate.is_relative_to(logical):
        candidate = engine / candidate.relative_to(logical)
    candidate = candidate.resolve(strict=True)
    if not candidate.is_relative_to(engine) or candidate.suffix != '.py':
        raise RuntimeError('Child tool is outside the signed engine')
    return candidate


original_popen = subprocess.Popen


class SignedToolProcess(original_popen):
    def __init__(self, command, *positional, **kwargs):
        if positional or kwargs.get('shell') or kwargs.get('executable') is not None:
            raise RuntimeError('Shell and executable overrides are unavailable')
        if (not isinstance(command, (list, tuple)) or len(command) < 2
                or not all(isinstance(value, str) for value in command)
                or Path(command[0]).resolve() != python):
            raise RuntimeError('Only bundled Python child tools are available')
        child = signed_script(command[1])
        safe = [str(python), '-I', '-B', str(runner), '--engine', str(engine),
                '--workspace', str(workspace), '--script', str(child), '--', *command[2:]]
        super().__init__(safe, **kwargs)


subprocess.Popen = SignedToolProcess


def check_process(event, values):
    if event in ('os.system', 'os.exec', 'os.posix_spawn', 'os.fork', 'pty.spawn'):
        raise RuntimeError('External process execution is unavailable')
    if event == 'subprocess.Popen':
        executable, command = values[:2]
        prefix = [str(python), '-I', '-B', str(runner), '--engine', str(engine),
                  '--workspace', str(workspace), '--script']
        if (Path(executable).resolve() != python or not isinstance(command, (list, tuple))
                or list(command[:len(prefix)]) != prefix or len(command) <= len(prefix)):
            raise RuntimeError('Child process must use the signed tool runner')
        signed_script(command[len(prefix)])


sys.addaudithook(check_process)
tools = engine / 'tools'
# Do not import executable Python from the user's mutable workspace.
sys.path = [str(tools)] + [entry for entry in sys.path if entry and not Path(entry).resolve().is_relative_to(workspace)]
spec = importlib.util.spec_from_file_location('vault_context', tools / 'vault_context.py')
context = importlib.util.module_from_spec(spec)
# The shared resolver uses __file__ to derive the workspace. The loader still
# reads its code from the signed bundle; only its data context is rebound.
context.__file__ = str(workspace / 'knowledge-engine/tools/vault_context.py')
sys.modules['vault_context'] = context
spec.loader.exec_module(context)
sys.argv = [str(script)] + remaining
runpy.run_path(str(script), run_name='__main__')
