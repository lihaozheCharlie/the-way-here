"""Anonymous compatibility fixtures; never read or write the user's knowledge files."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import yaml

PROJECT = Path(__file__).resolve().parents[3]

class LinkedSourceCompatibility(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="twh-link-contract-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "workspace"
        self.root.mkdir()
        shutil.copytree(PROJECT / "knowledge-engine", self.root / "knowledge-engine", ignore=shutil.ignore_patterns("__pycache__"))
        self.kb = os.environ["THE_WAY_HERE_KNOWLEDGE_BASE"]
        self.base = self.root / "app" / self.kb
        self.sources = self.base / "sources"
        self.wiki = self.base / "wiki"
        self.wiki.mkdir(parents=True)
        self.original = Path(self.temp.name) / "original"
        self.original.mkdir()
        self.ref_dir = self.sources / "外部来源" / "library-one"
        self.ref_dir.mkdir(parents=True)
        config = {"version": 3, "defaultKnowledgeBase": self.kb, "knowledgeBases": {self.kb: {"paths": {"wiki": str(self.wiki.relative_to(self.root)), "sources": str(self.sources.relative_to(self.root))}, "sourceConnections": [{"id": "library-one", "name": "Original", "path": str(self.original.resolve()), "autoBuild": False}]}}}
        (self.root / "the-way-here.config.yaml").write_text(yaml.safe_dump(config, allow_unicode=True))
        self.a = self.source("日记/A.md", "---\ntype: diary\n---\n# A\n我和林青在北京散步。\n[[./B|下一篇]]")
        self.b = self.source("日记/B.md", '# B\n[[./A|上一篇]]')
        self.page = self.wiki / "01 主线" / "理解.md"
        self.page.parent.mkdir()
        self.page.write_text(f"# 理解\n[[{self.link(self.a)}|A]]\n[[{self.b.relative_to(self.root).with_suffix('')}|B]]\n")
        self.env = {**os.environ, "THE_WAY_HERE_KNOWLEDGE_BASE": self.kb, "PYTHONPATH": str(self.root / "knowledge-engine/tools")}

    def source(self, name, body):
        original = self.original / name
        original.parent.mkdir(parents=True, exist_ok=True)
        original.write_text(body)
        ref = self.ref_dir / (name + ".source.md")
        ref.parent.mkdir(parents=True, exist_ok=True)
        ref.write_text("---\n" + yaml.safe_dump({"twh_external": {"connectionId": "library-one", "relativePath": name}}, allow_unicode=True) + "---\n来源引用，不是原文。\n")
        return ref

    def link(self, path):
        return path.relative_to(self.base).with_suffix("").as_posix()

    def run_tool(self, name, *args):
        return subprocess.run([sys.executable, str(self.root / "knowledge-engine/tools" / name), *args], cwd=self.root, env=self.env, text=True, capture_output=True)

    def test_read_real_source_and_stable_target(self):
        result = self.run_tool("source_access.py", str(self.a.relative_to(self.root)))
        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads(result.stdout)
        self.assertIn("林青", data["markdown"])
        self.assertEqual(data["linkTarget"], self.link(self.a))
        self.assertNotIn("林青", self.a.read_text())

    def test_full_scoped_relative_and_alias_links(self):
        self.page.write_text(self.page.read_text() + "[[./理解|自身]]\n")
        result = self.run_tool("validate_wiki_links.py")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("missing=0 ambiguous=0", result.stdout)

    def test_quality_failure_is_not_reported_as_success(self):
        self.page.write_text("# 理解\n[[不存在的页面]]\n")
        result = self.run_tool("validate_wiki_links.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("missing=1", result.stdout)

    def test_ambiguous_short_alias_is_rejected(self):
        self.source("别处/B.md", "# B\n另一个同名来源。")
        self.page.write_text("# 理解\n[[B]]\n")
        result = self.run_tool("validate_wiki_links.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("ambiguous=1", result.stdout)

    def test_tags_preserve_sources_and_reference_bytes(self):
        original = (self.original / "日记/A.md").read_bytes()
        reference = self.a.read_bytes()
        first = self.run_tool("update_obsidian_tags.py")
        second = self.run_tool("update_obsidian_tags.py")
        self.assertEqual(first.returncode, 0, first.stderr)
        self.assertIn("updated=0", second.stdout)
        data = yaml.safe_load(self.page.read_text().split("\n---", 1)[0][4:])
        self.assertIn(self.link(self.a), data["source"])
        self.assertIn(self.link(self.b), data["source"])
        self.assertEqual(reference, self.a.read_bytes())
        self.assertEqual(original, (self.original / "日记/A.md").read_bytes())

    def test_deleted_source_retains_resolvable_reference_but_is_not_evidence(self):
        (self.original / "日记/B.md").unlink()
        read = self.run_tool("source_access.py", str(self.b.relative_to(self.root)))
        self.assertEqual(read.returncode, 2)
        self.assertFalse(json.loads(read.stdout)["available"])
        links = self.run_tool("validate_wiki_links.py")
        self.assertEqual(links.returncode, 0, links.stdout + links.stderr)

    def test_source_read_rejects_symlink_escape(self):
        secret = Path(self.temp.name) / "outside.md"
        secret.write_text("DO NOT READ")
        (self.original / "日记/A.md").unlink()
        (self.original / "日记/A.md").symlink_to(secret)
        result = self.run_tool("source_access.py", str(self.a.relative_to(self.root)))
        self.assertEqual(result.returncode, 2)
        self.assertNotIn("DO NOT READ", result.stdout)

    def test_people_collector_follows_connected_sources(self):
        script = self.root / "knowledge-engine/skills/build/people/scripts/collect_person_evidence.py"
        result = subprocess.run([sys.executable, str(script), "--person", "林青", "--format", "json"], cwd=self.root, env=self.env, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertGreater(json.loads(result.stdout)["evidence_count"], 0)
        self.assertIn(".source", result.stdout)

    def test_entity_helpers_read_original_words(self):
        program = "from source_access import diary_files; from diary_entity_audit import scan_diary; from diary_entity_deep_audit import extract_diary; files=list(diary_files()); assert len(files)==2; text=str(scan_diary(files[0], {'林青'})); assert '林青' in text, text; assert '北京' in str(extract_diary(files[0]))"
        result = subprocess.run([sys.executable, "-c", program], cwd=self.root, env=self.env, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)

if __name__ == "__main__":
    unittest.main()
