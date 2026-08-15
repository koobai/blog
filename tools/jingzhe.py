#!/usr/bin/env python3
"""AI-friendly maintenance CLI for the Jingzhe Hugo project.

The CLI intentionally uses only the Python standard library. It never sends
data to external services and never writes to the production repository unless
the user explicitly asks `init` or `starter` to create a new output path.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import zipfile
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple
from urllib.parse import unquote, urljoin, urlparse


ROOT = Path(__file__).resolve().parents[1]
SUPPORTED_PROFILES = ("core",)
MINIMUM_HUGO_VERSION = (0, 158, 0)
TEXT_SUFFIXES = {
    ".css", ".html", ".js", ".json", ".md", ".py", ".scss",
    ".toml", ".txt", ".webmanifest", ".xml", ".yaml", ".yml",
}
SKIP_PARTS = {".git", "public", "resources", "__pycache__"}
CORE_EXCLUDED_LAYOUTS = {
    "layouts/about.html",
    "layouts/exercise.html",
    "layouts/movies.html",
    "layouts/newlaodao.html",
    "layouts/newsuibi.html",
    "layouts/_partials/comments.html",
    "layouts/_partials/exercise-food-icons.html",
}
STARTER_BANNED_MARKERS = {
    "koobai.com": "production domain",
    "qiszy.taobao.com": "production shop",
    "hi@koobai.com": "production email",
    "newlaodao.koobai.com": "publisher endpoint",
    "comments.koobai.com": "comments endpoint",
    "likes.koobai.com": "likes endpoint",
    "pk.eyJ1Ijoia29vYmFp": "production Mapbox token",
    "Eileen": "personal identity",
    "婺源": "personal location",
}
SECRET_PATTERNS = {
    "private key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "GitHub token": re.compile(r"\b(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b"),
    "AWS access key": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    "model API key": re.compile(r"\bsk-[A-Za-z0-9_-]{24,}\b"),
}


def run_command(
    args: Sequence[str],
    cwd: Path = ROOT,
    env: Optional[Dict[str, str]] = None,
    timeout: int = 180,
) -> subprocess.CompletedProcess:
    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)
    return subprocess.run(
        list(args),
        cwd=str(cwd),
        env=merged_env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=timeout,
        check=False,
    )


def add_check(
    checks: List[dict],
    check_id: str,
    ok: bool,
    message: str,
    level: str = "error",
    detail: Optional[dict] = None,
) -> None:
    item = {"id": check_id, "ok": bool(ok), "level": level, "message": message}
    if detail:
        item["detail"] = detail
    checks.append(item)


def payload(command: str, checks: List[dict], **data: object) -> dict:
    failed = [item for item in checks if not item["ok"] and item["level"] == "error"]
    warnings = [item for item in checks if not item["ok"] and item["level"] == "warning"]
    result = {
        "ok": not failed,
        "command": command,
        "checks": checks,
        "errors": [item["message"] for item in failed],
        "warnings": [item["message"] for item in warnings],
    }
    result.update(data)
    return result


def emit(result: dict, as_json: bool) -> int:
    if as_json:
        print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    else:
        print("惊蛰 Jingzhe · {}".format(result["command"]))
        for item in result["checks"]:
            if item["ok"]:
                symbol = "✓"
            elif item["level"] == "warning":
                symbol = "!"
            else:
                symbol = "✗"
            print("{} {}: {}".format(symbol, item["id"], item["message"]))
        if result.get("next"):
            print("下一步：{}".format(result["next"]))
    return 0 if result["ok"] else 1


def load_json(path: Path) -> object:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def parse_hugo_version(value: str) -> Optional[Tuple[int, int, int]]:
    match = re.search(r"\bv?(\d+)\.(\d+)\.(\d+)\b", value)
    if not match:
        return None
    return tuple(int(part) for part in match.groups())


def format_version(version: Tuple[int, int, int]) -> str:
    return ".".join(str(part) for part in version)


def resolved_config(environment: str) -> Tuple[Optional[dict], str]:
    result = run_command(
        ["hugo", "config", "--environment", environment, "--format", "json"],
        timeout=60,
    )
    if result.returncode != 0:
        return None, result.stdout.strip()
    try:
        return json.loads(result.stdout), ""
    except json.JSONDecodeError as exc:
        return None, "Hugo config JSON 无法解析：{}".format(exc)


def feature_enabled(config: dict, name: str) -> bool:
    features = config.get("params", {}).get("features", {})
    return bool(features.get(name.lower(), False))


def required_public_config(config: dict) -> List[str]:
    missing: List[str] = []
    params = config.get("params", {})
    services = params.get("services", {})
    repository = params.get("repository", {})

    if feature_enabled(config, "publisher"):
        required = {
            "params.repository.owner": repository.get("owner"),
            "params.repository.name": repository.get("name"),
            "params.repository.branch": repository.get("branch"),
            "params.services.publisher.workerUrl": services.get("publisher", {}).get("workerurl"),
            "params.services.publisher.imageBaseUrl": services.get("publisher", {}).get("imagebaseurl"),
        }
        missing.extend(key for key, value in required.items() if not value)

    if feature_enabled(config, "social"):
        social = services.get("social", {})
        required = {
            "params.services.social.commentsApi": social.get("commentsapi"),
            "params.services.social.likesApi": social.get("likesapi"),
            "params.services.social.likesSubmitUrl": social.get("likessubmiturl"),
            "params.services.social.turnstileSiteKey": social.get("turnstilesitekey"),
        }
        missing.extend(key for key, value in required.items() if not value)

    if feature_enabled(config, "exercise"):
        token = services.get("exercise", {}).get("mapboxtoken")
        if not token:
            missing.append("params.services.exercise.mapboxToken")
    return missing


def command_doctor(args: argparse.Namespace) -> dict:
    checks: List[dict] = []
    versions: Dict[str, str] = {}
    for executable in ("git", "hugo", "python3", "node"):
        path = shutil.which(executable)
        add_check(
            checks,
            "runtime.{}".format(executable),
            bool(path),
            "{} 可用".format(executable) if path else "缺少 {}".format(executable),
        )

    if shutil.which("hugo"):
        version = run_command(["hugo", "version"], timeout=30)
        versions["hugo"] = version.stdout.strip().splitlines()[0] if version.stdout else ""
        extended = "extended" in version.stdout.lower()
        add_check(checks, "hugo.extended", extended, "Hugo Extended 已启用" if extended else "需要 Hugo Extended")
        detected = parse_hugo_version(version.stdout)
        minimum_label = format_version(MINIMUM_HUGO_VERSION)
        minimum_ok = detected is not None and detected >= MINIMUM_HUGO_VERSION
        add_check(
            checks,
            "hugo.minimum",
            minimum_ok,
            (
                "Hugo {} 满足最低版本 {}".format(format_version(detected), minimum_label)
                if minimum_ok and detected
                else "需要 Hugo {} 或更高版本".format(minimum_label)
            ),
            detail={
                "minimum": minimum_label,
                "detected": format_version(detected) if detected else None,
            },
        )

    config, error = resolved_config(args.environment)
    if config is None:
        add_check(checks, "config.resolve", False, error or "无法解析 Hugo 配置")
        return payload("doctor", checks, environment=args.environment, versions=versions)

    profile = config.get("params", {}).get("profile", "core")
    add_check(checks, "config.resolve", True, "{} 配置可解析，Profile={}".format(args.environment, profile))
    missing = required_public_config(config)
    add_check(
        checks,
        "config.required",
        not missing,
        "已启用功能的公开配置完整" if not missing else "缺少公开配置：{}".format(", ".join(missing)),
        detail={"missing": missing} if missing else None,
    )

    status = run_command(["git", "status", "--short"], timeout=30) if shutil.which("git") else None
    dirty = bool(status and status.stdout.strip())
    add_check(
        checks,
        "git.worktree",
        not dirty,
        "工作区干净" if not dirty else "工作区存在未提交改动；工具不会覆盖这些改动",
        level="warning",
    )
    return payload(
        "doctor",
        checks,
        environment=args.environment,
        profile=profile,
        versions=versions,
        next="运行 `python3 tools/jingzhe.py validate` 检查配置和数据。",
    )


def validate_activity_items(items: object) -> List[str]:
    if not isinstance(items, list):
        return ["根节点必须是数组"]
    required = {
        "run_id", "name", "type", "distance", "moving_time", "start_date_local",
        "route_status", "display_name", "sport_display_name", "card_achievement",
        "calendar_achievements"
    }
    allowed_status = {"available", "privacy_hidden", "unavailable", "indoor"}
    errors: List[str] = []
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            errors.append("第 {} 项必须是对象".format(index))
            continue
        missing = sorted(required - set(item))
        if missing:
            errors.append("第 {} 项缺少 {}".format(index, ", ".join(missing)))
        if item.get("route_status") not in allowed_status:
            errors.append("第 {} 项 route_status 无效".format(index))
    return errors


def validate_movie_items(items: object) -> List[str]:
    if not isinstance(items, list):
        return ["根节点必须是数组"]
    required = {"id", "title", "rating", "create_time"}
    errors: List[str] = []
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            errors.append("第 {} 项必须是对象".format(index))
            continue
        missing = sorted(required - set(item))
        if missing:
            errors.append("第 {} 项缺少 {}".format(index, ", ".join(missing)))
        rating = item.get("rating")
        if not isinstance(rating, (int, float)) or not 0 <= rating <= 5:
            errors.append("第 {} 项 rating 必须在 0-5 之间".format(index))
    return errors


def validate_monthly_items(items: object) -> List[str]:
    if not isinstance(items, dict):
        return ["根节点必须是对象"]
    required = {"month_str", "stats", "report_phase"}
    errors: List[str] = []
    for month, item in items.items():
        if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", month):
            errors.append("月份键无效：{}".format(month))
        if not isinstance(item, dict):
            errors.append("{} 必须是对象".format(month))
            continue
        missing = sorted(required - set(item))
        if missing:
            errors.append("{} 缺少 {}".format(month, ", ".join(missing)))
    return errors


def validate_exercise_contract(value: object) -> List[str]:
    if not isinstance(value, dict):
        return ["根节点必须是对象"]
    sports = value.get("sports")
    groups = value.get("groups")
    foods = value.get("foods")
    if not isinstance(sports, dict) or not isinstance(groups, dict) or not isinstance(foods, list):
        return ["sports、groups、foods 类型无效"]

    errors: List[str] = []
    required_sport_fields = {"name", "displayName", "color", "fallbackTitle"}
    for sport, details in sports.items():
        if not isinstance(details, dict):
            errors.append("运动 {} 必须是对象".format(sport))
            continue
        missing = sorted(required_sport_fields - set(details))
        if missing:
            errors.append("运动 {} 缺少 {}".format(sport, ", ".join(missing)))
        if not re.fullmatch(r"#[0-9A-Fa-f]{6}", str(details.get("color", ""))):
            errors.append("运动 {} color 无效".format(sport))

    known_sports = set(sports) | {"Trail Run"}
    for group, members in groups.items():
        if not isinstance(members, list) or len(members) != len(set(members)):
            errors.append("分组 {} 必须是无重复数组".format(group))
        elif not set(members) <= known_sports:
            errors.append("分组 {} 引用了未知运动".format(group))

    food_keys = [food.get("key") for food in foods if isinstance(food, dict)]
    if len(food_keys) != len(foods) or len(food_keys) != len(set(food_keys)):
        errors.append("foods key 缺失或重复")
    if not any(isinstance(food, dict) and food.get("monthly") for food in foods):
        errors.append("foods 至少需要一个 monthly 候选")
    return errors


def scan_starter_markers(root: Path) -> List[dict]:
    findings: List[dict] = []
    for path in iter_source_files(root):
        text = path.read_text(encoding="utf-8", errors="ignore")
        for marker, label in STARTER_BANNED_MARKERS.items():
            if marker.lower() in text.lower():
                findings.append({"file": str(path.relative_to(root)), "kind": label})
    return findings


def validation_checks() -> List[dict]:
    checks: List[dict] = []
    json_paths = sorted((ROOT / "schemas").glob("**/*.json"))
    json_paths += [
        ROOT / "data/jingzhe/exercise.json",
        ROOT / "data/jingzhe/features.json",
        ROOT / "data/jingzhe/linkcheck_allowlist.json",
    ]
    json_errors: List[str] = []
    for path in json_paths:
        try:
            load_json(path)
        except (OSError, json.JSONDecodeError) as exc:
            json_errors.append("{}: {}".format(path.relative_to(ROOT), exc))
    add_check(
        checks,
        "json.parse",
        not json_errors,
        "{} 个 JSON/Schema 文件可解析".format(len(json_paths)) if not json_errors else "JSON 解析失败：{}".format("; ".join(json_errors)),
    )

    registry = load_json(ROOT / "data/jingzhe/features.json")
    ids = [item.get("id") for item in registry.get("features", [])] if isinstance(registry, dict) else []
    expected = {"core", "publisher", "social", "movies", "exercise", "aiCoach", "externalShop"}
    registry_ok = len(ids) == len(set(ids)) and set(ids) == expected
    add_check(checks, "features.registry", registry_ok, "功能注册表包含 7 个唯一功能" if registry_ok else "功能注册表 ID 不完整或重复")

    exercise_errors = validate_exercise_contract(load_json(ROOT / "data/jingzhe/exercise.json"))
    add_check(
        checks,
        "data.exercise-contract",
        not exercise_errors,
        "运动类型、颜色、分组和食物契约有效" if not exercise_errors else "; ".join(exercise_errors),
    )

    config_errors: List[str] = []
    for environment in ("production", "development"):
        config, error = resolved_config(environment)
        if config is None:
            config_errors.append("{}: {}".format(environment, error))
            continue
        missing = required_public_config(config)
        if missing:
            config_errors.append("{} 缺少 {}".format(environment, ", ".join(missing)))
    add_check(checks, "config.environments", not config_errors, "Production 与 Development 配置均可解析" if not config_errors else "; ".join(config_errors))

    prod_params = ROOT / "config/production/params.toml"
    dev_params = ROOT / "config/development/params.toml"
    prod_hugo = ROOT / "config/production/hugo.toml"
    dev_hugo = ROOT / "config/development/hugo.toml"
    same_instance = prod_params.read_bytes() == dev_params.read_bytes() and prod_hugo.read_bytes() == dev_hugo.read_bytes()
    add_check(checks, "config.instance-sync", same_instance, "Production 与 Development 公开配置一致" if same_instance else "Production 与 Development 配置发生漂移")

    worker_names = ("publisher", "drafts", "comments", "likes")
    worker_files = [ROOT / "workers/openapi.yaml", ROOT / "workers/README.md"]
    for worker in worker_names:
        base = ROOT / "workers" / worker
        worker_files.extend([
            base / "src/index.js",
            base / "package.json",
            base / "wrangler.example.toml",
            base / ".dev.vars.example",
            base / "README.md",
        ])
    worker_files.extend([
        ROOT / "workers/drafts/migrations/0001_initial.sql",
        ROOT / "workers/comments/migrations/0001_initial.sql",
        ROOT / "workers/likes/migrations/0001_initial.sql",
    ])
    missing_worker_files = [str(path.relative_to(ROOT)) for path in worker_files if not path.is_file()]
    add_check(
        checks,
        "workers.artifacts",
        not missing_worker_files,
        "四个 Worker 的源码、示例配置、契约和迁移完整" if not missing_worker_files else "Worker 文件缺失：{}".format(", ".join(missing_worker_files)),
    )
    migration_errors: List[str] = []
    for path in sorted((ROOT / "workers").glob("*/migrations/*.sql")):
        try:
            connection = sqlite3.connect(":memory:")
            connection.executescript(path.read_text(encoding="utf-8"))
            connection.close()
        except (OSError, sqlite3.Error) as exc:
            migration_errors.append("{}: {}".format(path.relative_to(ROOT), exc))
    add_check(
        checks,
        "workers.migrations",
        not migration_errors,
        "三套 D1 初始迁移可执行" if not migration_errors else "D1 迁移失败：{}".format("; ".join(migration_errors)),
    )

    data_checks = [
        ("production.activities", ROOT / "assets/activities.json", validate_activity_items),
        ("production.movies", ROOT / "assets/movie.json", validate_movie_items),
        ("production.monthly", ROOT / "assets/monthly_insights.json", validate_monthly_items),
    ]
    for check_id, path, validator in data_checks:
        errors = validator(load_json(path))
        add_check(checks, "data.{}".format(check_id), not errors, "{} 结构有效".format(path.relative_to(ROOT)) if not errors else "{}: {}".format(path.relative_to(ROOT), "; ".join(errors[:5])))

    return checks


def command_validate(args: argparse.Namespace) -> dict:
    checks = validation_checks()
    return payload(
        "validate",
        checks,
        next="运行 `python3 tools/jingzhe.py check` 执行构建、链接、测试和 Secret 检查。",
    )


class LinkCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.links: List[str] = []

    def handle_starttag(self, tag: str, attrs: List[Tuple[str, Optional[str]]]) -> None:
        for name, value in attrs:
            if name.lower() in {"href", "src"} and value:
                self.links.append(value)


def output_path_exists(root: Path, url_path: str) -> bool:
    path = unquote(url_path)
    if path.endswith("/"):
        candidates = [root / path.lstrip("/") / "index.html"]
    elif Path(path).suffix:
        candidates = [root / path.lstrip("/")]
    else:
        relative = path.lstrip("/")
        candidates = [root / relative, root / relative / "index.html", root / (relative + ".html")]
    return any(candidate.exists() for candidate in candidates)


def check_internal_links(output_root: Path, environment: str, base_url: str) -> List[dict]:
    allowlist_data = load_json(ROOT / "data/jingzhe/linkcheck_allowlist.json")
    allowed = set(allowlist_data.get(environment, [])) if isinstance(allowlist_data, dict) else set()
    site_host = urlparse(base_url).hostname or ""
    missing: Dict[str, Set[str]] = {}
    for html_path in output_root.glob("**/*.html"):
        parser = LinkCollector()
        parser.feed(html_path.read_text(encoding="utf-8", errors="ignore"))
        route = "/" + str(html_path.relative_to(output_root)).replace(os.sep, "/")
        base_route = route[:-10] if route.endswith("index.html") else route
        page_url = "{}{}".format(base_url.rstrip("/"), base_route)
        for raw in parser.links:
            if raw.startswith(("#", "mailto:", "tel:", "javascript:", "data:", "//")):
                continue
            parsed = urlparse(urljoin(page_url, raw))
            if parsed.scheme not in {"", "http", "https"}:
                continue
            if parsed.hostname and parsed.hostname != site_host:
                continue
            path = unquote(parsed.path or "/")
            if path in allowed or output_path_exists(output_root, path):
                continue
            missing.setdefault(path, set()).add(route)
    return [
        {"path": path, "sources": sorted(sources)[:5]}
        for path, sources in sorted(missing.items())
    ]


def build_site(environment: str, temp_root: Path, source: Path = ROOT) -> Tuple[Optional[Path], str]:
    output = temp_root / "output"
    cache = temp_root / "cache"
    resources = temp_root / "resources"
    output.mkdir(parents=True, exist_ok=True)
    cache.mkdir(parents=True, exist_ok=True)
    resources.mkdir(parents=True, exist_ok=True)
    command = [
        "hugo", "--source", str(source), "--destination", str(output),
        "--cacheDir", str(cache), "--noBuildLock", "--minify", "--panicOnWarning",
    ]
    if environment != "production":
        command.extend(["--environment", environment])
    result = run_command(command, cwd=source, env={"HUGO_RESOURCEDIR": str(resources)})
    if result.returncode != 0:
        return None, result.stdout.strip()
    return output, result.stdout.strip()


def iter_source_files(root: Path) -> Iterable[Path]:
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        if any(part in SKIP_PARTS for part in path.parts):
            continue
        if path.name == ".DS_Store" or path.stat().st_size > 2_000_000:
            continue
        yield path


def scan_suspected_secrets(root: Path) -> List[dict]:
    findings: List[dict] = []
    for path in iter_source_files(root):
        text = path.read_text(encoding="utf-8", errors="ignore")
        for label, pattern in SECRET_PATTERNS.items():
            for match in pattern.finditer(text):
                line = text.count("\n", 0, match.start()) + 1
                findings.append({"file": str(path.relative_to(root)), "line": line, "kind": label})
    return findings


def js_source_files() -> List[Path]:
    roots = [ROOT / "static/js", ROOT / "themes/jingzhe_v3/assets/js"]
    result: List[Path] = []
    for source_root in roots:
        if source_root.exists():
            result.extend(sorted(source_root.glob("*.js")))
    workers_root = ROOT / "workers"
    if workers_root.exists():
        result.extend(sorted(workers_root.glob("*/src/*.js")))
    return result


def command_check(args: argparse.Namespace) -> dict:
    checks = validation_checks()

    for executable in ("hugo", "node", "python3"):
        add_check(checks, "runtime.{}".format(executable), bool(shutil.which(executable)), "{} 可用".format(executable) if shutil.which(executable) else "缺少 {}".format(executable))

    if shutil.which("hugo"):
        with tempfile.TemporaryDirectory(prefix="jingzhe-check-production-") as temp:
            output, log = build_site("production", Path(temp))
            add_check(
                checks,
                "build.production",
                output is not None,
                "production 严格构建通过" if output else "production 构建失败：{}".format(log[-800:]),
            )
            if output:
                missing = check_internal_links(output, "production", "https://koobai.com")
                add_check(
                    checks,
                    "links.production",
                    not missing,
                    "production 内部链接与资源有效" if not missing else "production 存在 {} 个失效路径".format(len(missing)),
                    detail={"missing": missing} if missing else None,
                )

        with tempfile.TemporaryDirectory(prefix="jingzhe-check-core-") as temp:
            core_site = Path(temp) / "site"
            try:
                scaffold_core(core_site, "Core Check", "https://example.org/", "", "Core build fixture.")
                markers = scan_starter_markers(core_site)
                add_check(checks, "build.core", True, "临时 Core Starter 严格构建通过")
                add_check(
                    checks,
                    "privacy.core",
                    not markers,
                    "临时 Core Starter 未发现生产身份或服务" if not markers else "临时 Core Starter 发现生产标记",
                    detail={"findings": markers} if markers else None,
                )
                with tempfile.TemporaryDirectory(prefix="jingzhe-check-core-output-") as build_temp:
                    core_output, core_log = build_site("production", Path(build_temp), source=core_site)
                    core_missing = check_internal_links(core_output, "core", "https://example.org/") if core_output else []
                    add_check(
                        checks,
                        "links.core",
                        core_output is not None and not core_missing,
                        "临时 Core Starter 内部链接与资源有效" if core_output and not core_missing else "临时 Core Starter 链接检查失败：{}".format(core_log[-500:] if not core_output else len(core_missing)),
                        detail={"missing": core_missing} if core_missing else None,
                    )
            except (OSError, ValueError, RuntimeError) as exc:
                add_check(checks, "build.core", False, "临时 Core Starter 失败：{}".format(exc))

    if shutil.which("node"):
        js_failures: List[str] = []
        for path in js_source_files():
            result = run_command(["node", "--check", str(path)], timeout=60)
            if result.returncode != 0:
                js_failures.append(str(path.relative_to(ROOT)))
        add_check(checks, "javascript.syntax", not js_failures, "{} 个 JavaScript 文件语法有效".format(len(js_source_files())) if not js_failures else "语法失败：{}".format(", ".join(js_failures)))
        js_test_failures: List[str] = []
        js_tests = sorted(
            list((ROOT / "tests").glob("test_*.js"))
            + list((ROOT / "tests").glob("test_*.mjs"))
        )
        for path in js_tests:
            result = run_command(["node", str(path)], timeout=60)
            if result.returncode != 0:
                js_test_failures.append("{}: {}".format(path.relative_to(ROOT), result.stdout[-500:]))
        add_check(
            checks,
            "javascript.tests",
            not js_test_failures,
            "{} 个 JavaScript 契约测试通过".format(len(js_tests)) if not js_test_failures else "JavaScript 测试失败：{}".format("; ".join(js_test_failures)),
        )

    if shutil.which("python3") and not args.skip_tests:
        result = run_command(
            ["python3", "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py"],
            env={"PYTHONDONTWRITEBYTECODE": "1"},
            timeout=180,
        )
        add_check(checks, "python.tests", result.returncode == 0, "Python 单元测试通过" if result.returncode == 0 else "Python 测试失败：{}".format(result.stdout[-800:]))

    all_secret_findings = scan_suspected_secrets(ROOT)
    secret_findings = [item for item in all_secret_findings if not item["file"].startswith("content/")]
    historical_findings = [item for item in all_secret_findings if item["file"].startswith("content/")]
    add_check(
        checks,
        "secrets.scan",
        not secret_findings,
        "未发现高置信度私密 Secret" if not secret_findings else "发现 {} 个疑似 Secret".format(len(secret_findings)),
        detail={"findings": secret_findings} if secret_findings else None,
    )
    add_check(
        checks,
        "secrets.historical-content",
        not historical_findings,
        "旧内容未发现 Secret 特征" if not historical_findings else "旧内容有 {} 个教程代码特征；按内容只读规则报告但不阻断".format(len(historical_findings)),
        level="warning",
        detail={"findings": historical_findings} if historical_findings else None,
    )
    return payload("check", checks, next="所有检查通过后再提交或进入下一阶段。")


def toml_quote(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def replace_top_level_setting(text: str, key: str, value: str) -> str:
    pattern = re.compile(r"^{}\s*=\s*.*$".format(re.escape(key)), re.MULTILINE)
    result, count = pattern.subn("{} = {}".format(key, toml_quote(value)), text, count=1)
    if count != 1:
        raise ValueError("找不到配置项 {}".format(key))
    return result


def replace_section_setting(text: str, section: str, key: str, value: str) -> str:
    pattern = re.compile(
        r"(^\[{}\]\s*$[\s\S]*?^\s*{}\s*=\s*)[^\r\n]*".format(re.escape(section), re.escape(key)),
        re.MULTILINE,
    )
    result, count = pattern.subn(lambda match: match.group(1) + toml_quote(value), text, count=1)
    if count != 1:
        raise ValueError("找不到 [{}].{}".format(section, key))
    return result


def copy_tree(source: Path, destination: Path) -> None:
    shutil.copytree(
        str(source),
        str(destination),
        ignore=shutil.ignore_patterns(".DS_Store", "__pycache__", "*.pyc"),
    )


def copy_core_theme(destination: Path) -> None:
    copy_tree(ROOT / "themes/jingzhe_v3", destination)
    for relative in CORE_EXCLUDED_LAYOUTS:
        path = destination / relative
        if path.exists():
            path.unlink()


def write_core_fixture(output: Path) -> None:
    content_files = {
        "content/_index.md": "---\ntitle: 首页\n---\n",
        "content/posts/_index.md": "---\ntitle: 随笔\n---\n",
        "content/posts/welcome.md": (
            "---\n"
            "title: 欢迎使用惊蛰\n"
            "date: 2026-01-01T09:00:00+08:00\n"
            "description: 这是一篇由 Core 初始化工具生成的合成内容。\n"
            "draft: false\n"
            "---\n\n"
            "这是一个最小 Core 站点。请删除本文并开始写自己的内容。\n"
        ),
        "content/laodao/_index.md": "---\ntitle: 唠叨\n---\n",
        "content/laodao/2026/01/20260101-100000.md": (
            "---\n"
            "date: 2026-01-01T10:00:00+08:00\n"
            "draft: false\n"
            "---\n\n"
            "第一条合成短动态。\n"
        ),
    }
    for relative, text in content_files.items():
        path = output / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    static_js = output / "static/js"
    static_js.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / "static/js/laodao.js", static_js / "laodao.js")
    shutil.copy2(ROOT / "static/js/view-image.min.js", static_js / "view-image.min.js")

    manifest = {
        "name": "Jingzhe Core",
        "short_name": "Jingzhe",
        "start_url": "/",
        "display": "standalone",
        "background_color": "#ffffff",
        "theme_color": "#ffffff",
    }
    (output / "static/manifest.webmanifest").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def write_core_licenses(output: Path) -> None:
    shutil.copy2(ROOT / "LICENSE", output / "LICENSE")
    license_dir = output / "licenses"
    license_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / "licenses/ViewImage-MIT.txt", license_dir / "ViewImage-MIT.txt")
    notices = """# Third-party Notices

Jingzhe Core includes `static/js/view-image.min.js`, based on [ViewImage 2.0.2](https://github.com/Tokinx/ViewImage) and distributed under the MIT License.

The complete upstream license is available at `licenses/ViewImage-MIT.txt`. All other files generated by the Core Profile, including its synthetic example content, are licensed under the root MIT License.
"""
    (output / "THIRD_PARTY_NOTICES.md").write_text(notices, encoding="utf-8")


def ensure_new_output(path: Path) -> None:
    resolved = path.expanduser().resolve()
    forbidden = {Path("/").resolve(), Path.home().resolve(), ROOT.resolve()}
    if resolved in forbidden:
        raise ValueError("拒绝把输出写入高风险目录：{}".format(resolved))
    if resolved.exists():
        raise ValueError("输出路径已存在；为保护已有文件，请选择一个新目录：{}".format(resolved))


def scaffold_core(
    output: Path,
    title: str,
    base_url: str,
    author: str,
    description: str,
) -> None:
    ensure_new_output(output)
    output.mkdir(parents=True)
    try:
        copy_tree(ROOT / "config/_default", output / "config/_default")
        hugo_config = output / "config/_default/hugo.toml"
        hugo_text = hugo_config.read_text(encoding="utf-8")
        hugo_text = replace_top_level_setting(hugo_text, "baseURL", base_url)
        hugo_text = replace_top_level_setting(hugo_text, "title", title)
        hugo_text += (
            "\n[menu]\n"
            "  [[menu.main]]\n"
            "    identifier = \"home\"\n"
            "    name = \"首页\"\n"
            "    url = \"/\"\n"
            "    weight = 1\n"
            "  [[menu.main]]\n"
            "    identifier = \"posts\"\n"
            "    name = \"随笔\"\n"
            "    url = \"/posts/\"\n"
            "    weight = 2\n"
        )
        hugo_config.write_text(hugo_text, encoding="utf-8")

        params_path = output / "config/_default/params.toml"
        params_text = params_path.read_text(encoding="utf-8")
        params_text = replace_top_level_setting(params_text, "description", description)
        params_text = replace_section_setting(params_text, "author", "name", author)
        params_text = replace_section_setting(params_text, "brand", "name", title)
        params_text = replace_section_setting(params_text, "brand", "footerName", title)
        params_text = replace_section_setting(params_text, "brand", "webAppTitle", title)
        params_path.write_text(params_text, encoding="utf-8")

        copy_core_theme(output / "themes/jingzhe_v3")
        write_core_fixture(output)
        write_core_licenses(output)
        copy_tree(ROOT / "data/jingzhe", output / "data/jingzhe")
        copy_tree(ROOT / "schemas", output / "schemas")
        copy_tree(ROOT / "archetypes", output / "archetypes")

        (output / ".gitignore").write_text(".DS_Store\n.hugo_build.lock\npublic/\nresources/\n", encoding="utf-8")
        readme = """# {title}\n\n由惊蛰 Core Profile 生成。\n\n```bash\nhugo server\n```\n\nCore 不依赖 Worker。需要部署、评论、网页发布或运动模块时，请先阅读上游项目的功能注册表与隐私文档。此目录的程序代码与合成示例内容采用根目录 `LICENSE` 中的 MIT License；第三方组件见 `THIRD_PARTY_NOTICES.md`。\n""".format(title=title)
        (output / "README.md").write_text(readme, encoding="utf-8")

        with tempfile.TemporaryDirectory(prefix="jingzhe-init-build-") as temp:
            built, log = build_site("production", Path(temp), source=output)
            if built is None:
                raise RuntimeError("生成站点构建失败：{}".format(log[-1000:]))
    except Exception:
        shutil.rmtree(str(output))
        raise


def command_init(args: argparse.Namespace) -> dict:
    checks: List[dict] = []
    if args.profile not in SUPPORTED_PROFILES:
        add_check(checks, "init.profile", False, "当前安全初始化只支持 Core Profile；{} 尚未开放".format(args.profile))
        return payload("init", checks, profile=args.profile, output=str(args.output))
    if not shutil.which("hugo"):
        add_check(checks, "runtime.hugo", False, "初始化后自动验证需要 Hugo Extended")
        return payload("init", checks, profile=args.profile, output=str(args.output))
    try:
        scaffold_core(args.output, args.title, args.base_url, args.author, args.description)
        add_check(checks, "init.scaffold", True, "Core 站点已生成并通过严格构建")
        findings = scan_starter_markers(args.output)
        add_check(checks, "init.privacy", not findings, "生成目录未发现生产身份或服务" if not findings else "生成目录发现生产标记", detail={"findings": findings} if findings else None)
    except (OSError, ValueError, RuntimeError) as exc:
        add_check(checks, "init.scaffold", False, str(exc))
    return payload(
        "init",
        checks,
        profile=args.profile,
        output=str(args.output),
        next="进入生成目录运行 `hugo server`。" if checks and checks[0]["ok"] else "修正错误后选择新的输出目录重试。",
    )


def zip_directory(source: Path, output: Path, archive_root: str) -> None:
    with zipfile.ZipFile(str(output), "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(source.rglob("*")):
            if path.is_file():
                relative = path.relative_to(source)
                archive.write(str(path), str(Path(archive_root) / relative))


def command_starter(args: argparse.Namespace) -> dict:
    checks: List[dict] = []
    output = args.output.expanduser().resolve()
    if output.suffix.lower() != ".zip":
        add_check(checks, "starter.output", False, "Starter 输出必须以 .zip 结尾")
        return payload("starter", checks, output=str(output))
    if output.exists():
        add_check(checks, "starter.output", False, "输出文件已存在；不会覆盖：{}".format(output))
        return payload("starter", checks, output=str(output))
    output.parent.mkdir(parents=True, exist_ok=True)
    try:
        with tempfile.TemporaryDirectory(prefix="jingzhe-starter-") as temp:
            site = Path(temp) / "jingzhe-starter"
            scaffold_core(site, args.title, "https://example.org/", "", "Jingzhe Core starter site.")
            findings = scan_starter_markers(site)
            if findings:
                raise RuntimeError("Starter 隐私扫描失败")
            manifest = {
                "name": "jingzhe-starter",
                "profile": "core",
                "license": "MIT",
                "generatedAt": datetime.now(timezone.utc).isoformat(),
                "containsProductionContent": False,
                "containsSecrets": False,
            }
            (site / "STARTER_MANIFEST.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            zip_directory(site, output, "jingzhe-starter")
        add_check(checks, "starter.archive", True, "Core Starter 已生成并通过构建与隐私扫描")
    except (OSError, ValueError, RuntimeError) as exc:
        if output.exists():
            output.unlink()
        add_check(checks, "starter.archive", False, str(exc))
    return payload("starter", checks, output=str(output), profile="core")


def parser_with_json(subparsers: argparse._SubParsersAction, name: str, help_text: str) -> argparse.ArgumentParser:
    parser = subparsers.add_parser(name, help=help_text)
    parser.add_argument("--json", action="store_true", dest="json_output", help="输出稳定 JSON")
    return parser


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="惊蛰 AI 友好维护工具")
    subparsers = parser.add_subparsers(dest="command", required=True)

    doctor = parser_with_json(subparsers, "doctor", "检查运行时和 Profile 配置")
    doctor.add_argument("--environment", choices=("production", "development"), default="production")

    parser_with_json(subparsers, "validate", "校验配置、注册表、数据和示例隐私")

    check = parser_with_json(subparsers, "check", "运行完整质量门禁")
    check.add_argument("--skip-tests", action="store_true", help="跳过 Python 单元测试")

    init = parser_with_json(subparsers, "init", "在新目录生成 Core 站点")
    init.add_argument("--output", type=Path, required=True)
    init.add_argument("--profile", default="core")
    init.add_argument("--title", default="我的惊蛰站点")
    init.add_argument("--base-url", default="https://example.org/")
    init.add_argument("--author", default="")
    init.add_argument("--description", default="")

    starter = parser_with_json(subparsers, "starter", "生成经过隐私扫描的 Core Starter zip")
    starter.add_argument("--output", type=Path, required=True)
    starter.add_argument("--title", default="惊蛰 Starter")
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "doctor":
        result = command_doctor(args)
    elif args.command == "validate":
        result = command_validate(args)
    elif args.command == "check":
        result = command_check(args)
    elif args.command == "init":
        result = command_init(args)
    elif args.command == "starter":
        result = command_starter(args)
    else:
        raise AssertionError("unknown command")
    return emit(result, args.json_output)


if __name__ == "__main__":
    sys.exit(main())
