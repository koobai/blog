import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LINK_PATTERN = re.compile(r"!?\[[^\]]*\]\(([^)]+)\)")


def documentation_files():
    roots = [
        ROOT / "README.md",
        ROOT / "README_EN.md",
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
        self.assertIn("docs/quick-start.md", introduction)

    def test_ai_prompt_preserves_external_authorization_boundary(self):
        guide = (ROOT / "docs/quick-start.md").read_text(encoding="utf-8")

        self.assertIn("AGENTS.md", guide)
        self.assertIn("不要复制根仓库的 content/、assets/", guide)
        self.assertIn("单独征得我的同意", guide)

    def test_zouguo_docs_match_the_current_contract(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        guide = (ROOT / "docs/zouguo.md").read_text(encoding="utf-8")
        ai_protocol = (ROOT / "docs/ai-protocol.md").read_text(encoding="utf-8")
        contract = (ROOT / "docs/zouguo-data-contract.md").read_text(encoding="utf-8")

        self.assertIn("docs/zouguo.md", readme)
        self.assertIn("Markdown 是唯一正式事实来源", guide)
        self.assertIn("不会自动安装走过页面", guide)
        self.assertIn("走过地图 / Feed / 边界子集", readme)
        self.assertIn("data/jingzhe/zouguo_boundary_catalog.json", guide)
        self.assertIn("页面只下载当前记录实际引用的边界子集", guide)
        self.assertIn("不得虚构", ai_protocol)
        self.assertIn('"schemaVersion": 2', contract)
        for stale_name in (
            "zouguo-content-pipeline.md",
            "zouguo-source-aggregation.md",
            "zouguo-place-boundaries.md",
            "zouguo-worker-drafts.md",
            "zouguo-roadmap.md",
        ):
            self.assertFalse((ROOT / "docs" / stale_name).exists(), stale_name)

    def test_workflows_use_consistent_action_versions_and_latest_hugo(self):
        workflows = sorted((ROOT / ".github/workflows").glob("*.yml"))
        combined = "\n".join(path.read_text(encoding="utf-8") for path in workflows)

        self.assertNotIn("actions/checkout@master", combined)
        self.assertNotIn("actions/setup-python@v4", combined)
        self.assertNotIn("peaceiris/actions-hugo@v2", combined)
        for path in workflows:
            text = path.read_text(encoding="utf-8")
            if "hugo-version:" in text:
                self.assertRegex(text, r"hugo-version:\s*['\"]?latest['\"]?")

    def test_public_docs_use_current_minimum_hugo_version(self):
        for relative in (
            "README.md",
            "README_EN.md",
            "CONTRIBUTING.md",
            "docs/deployment.md",
        ):
            text = (ROOT / relative).read_text(encoding="utf-8")
            self.assertIn("0.158.0", text, relative)
            self.assertNotIn("0.120.0", text, relative)

    def test_exercise_workflow_keeps_runtime_tests_scoped(self):
        workflow = (ROOT / ".github/workflows/process-activities.yml").read_text(encoding="utf-8")

        self.assertIn(
            "tests.test_exercise_contract\n"
            "          tests.test_exercise_sync_contract\n"
            "          tests.test_activity_store\n"
            "          tests.test_process_activities\n"
            "          tests.test_monthly_coach",
            workflow,
        )
        self.assertNotIn("unittest discover", workflow)

    def test_deploy_workflow_has_a_strict_predeploy_gate(self):
        workflow = (ROOT / ".github/workflows/githubblog.yml").read_text(encoding="utf-8")
        validate = "python3 tools/jingzhe.py check --skip-tests"
        build = "hugo --minify --panicOnWarning"
        deploy = "pages deploy ./public"
        self.assertIn(validate, workflow)
        self.assertIn(build, workflow)
        self.assertLess(workflow.index(validate), workflow.index(build))
        self.assertLess(workflow.index(build), workflow.index(deploy))

    def test_exercise_workflow_guards_are_stable(self):
        deploy = (ROOT / ".github/workflows/githubblog.yml").read_text(encoding="utf-8")
        process = (ROOT / ".github/workflows/process-activities.yml").read_text(encoding="utf-8")
        gateway = (ROOT / "workers/activity-sync/src/index.js").read_text(encoding="utf-8")

        self.assertIn("const COMMIT_MARKER = 'Auto-sync activity facts'", gateway)
        self.assertIn("branches:\n      - main", process)
        self.assertIn("- 'data/exercise/activities.json'", process)
        self.assertIn("paths-ignore:\n      - 'data/exercise/activities.json'", deploy)
        self.assertNotIn("contains(github.event.head_commit.message", deploy)
        self.assertIn(
            "git add assets/data/exercise/activities.json assets/data/exercise/monthly-insights.json",
            process,
        )
        self.assertNotIn("git add assets/\n", process)
        self.assertNotIn("git add data/exercise/activities.json", process)
        self.assertIn("Auto-generate monthly coaching report", process)
        self.assertIn("token: ${{ secrets.PAT }}", process)
        self.assertIn("ref: main", process)
        self.assertIn("workflow_dispatch:", process)
        self.assertIn("schedule:", process)
        self.assertIn("cancel-in-progress: true", process)
        self.assertNotIn("if: secrets.DEEPSEEK_API_KEY", process)
        self.assertIn("ACTIVITY_CHANGED_FILES", process)
        self.assertIn("git fetch origin main:refs/remotes/origin/main", process)
        self.assertIn("git rev-parse origin/main:data/exercise/activities.json", process)
        self.assertIn("git rebase origin/main", process)
        self.assertIn("for attempt in 1 2 3", process)
        self.assertIn("superseded_by_new_facts", process)
        self.assertIn("ACTIVITY_PUSH_RESULT", process)

    def test_sync_workflows_publish_human_readable_summaries(self):
        for relative in ("douban.yml", "process-activities.yml", "githubblog.yml"):
            workflow = (ROOT / ".github/workflows" / relative).read_text(encoding="utf-8")
            self.assertIn("GITHUB_STEP_SUMMARY", workflow, relative)
            self.assertIn("if: always()", workflow, relative)

    def test_douban_dispatch_and_commit_contracts_are_unchanged(self):
        workflow = (ROOT / ".github/workflows/douban.yml").read_text(encoding="utf-8")
        script = (ROOT / "sync_movies.py").read_text(encoding="utf-8")
        self.assertIn("types: [douban-sync]", workflow)
        self.assertIn("message: 'chore: sync new movies data'", workflow)
        self.assertIn("if: env.HAS_NEW_DATA == 'true'", workflow)
        self.assertIn('handle.write("HAS_NEW_DATA={}', script)

    def test_editor_templates_only_inject_config_and_load_page_modules(self):
        for template_name, module_name in (
            ("newlaodao.html", "editor-laodao.js"),
            ("newsuibi.html", "editor-post.js"),
        ):
            template = (
                ROOT / "themes/jingzhe_v3/layouts/pages" / template_name
            ).read_text(encoding="utf-8")
            self.assertIn("window.JINGZHE_EDITOR_CONFIG", template)
            self.assertIn(module_name, template)
            self.assertNotIn("function publishPost", template)
            self.assertLess(len(template.splitlines()), 120)


if __name__ == "__main__":
    unittest.main()
