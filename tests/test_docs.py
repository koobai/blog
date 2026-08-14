import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LINK_PATTERN = re.compile(r"!?\[[^\]]*\]\(([^)]+)\)")


def documentation_files():
    roots = [
        ROOT / "README.md",
        ROOT / "AGENTS.md",
        ROOT / "CONTRIBUTING.md",
        ROOT / "SECURITY.md",
        ROOT / "CONTENT_LICENSE.md",
        ROOT / "BRAND.md",
        ROOT / "THIRD_PARTY_NOTICES.md",
    ]
    roots.extend(sorted((ROOT / "docs").rglob("*.md")))
    roots.extend(sorted((ROOT / "workers").rglob("README.md")))
    return roots


class DocumentationTests(unittest.TestCase):
    def test_local_markdown_links_resolve(self):
        failures = []
        for source in documentation_files():
            text = source.read_text(encoding="utf-8")
            for raw_target in LINK_PATTERN.findall(text):
                target = raw_target.strip().strip("<>").split("#", 1)[0]
                if not target or "://" in target or target.startswith(("mailto:", "tel:")):
                    continue
                path = (source.parent / target).resolve()
                if not path.exists():
                    failures.append(f"{source.relative_to(ROOT)} -> {raw_target}")
        self.assertEqual(failures, [])

    def test_readme_prioritizes_ai_quick_start(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        feature_end = readme.index("## 功能层级")
        introduction = readme[:feature_end]

        self.assertIn("直接交给 AI", introduction)
        self.assertIn("docs/ai/quick-start.md", introduction)

    def test_ai_prompt_preserves_external_authorization_boundary(self):
        guide = (ROOT / "docs/ai/quick-start.md").read_text(encoding="utf-8")

        self.assertIn("AGENTS.md", guide)
        self.assertIn("不要复制根仓库的 content/、assets/", guide)
        self.assertIn("单独征得我的同意", guide)


if __name__ == "__main__":
    unittest.main()
