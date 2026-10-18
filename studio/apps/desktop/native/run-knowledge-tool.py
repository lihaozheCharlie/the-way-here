"""Run immutable bundled tools against an explicitly bound user workspace."""
import argparse
import importlib.util
from pathlib import Path
import runpy
import sys

parser = argparse.ArgumentParser()
parser.add_argument('--engine', required=True)
parser.add_argument('--workspace', required=True)
parser.add_argument('--script', required=True)
args, remaining = parser.parse_known_args()
engine = Path(args.engine).resolve(strict=True)
workspace = Path(args.workspace).resolve(strict=True)
script = Path(args.script).resolve(strict=True)
if not script.is_relative_to(engine) or script.suffix != '.py':
    raise RuntimeError('Tool is outside the signed engine')
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
