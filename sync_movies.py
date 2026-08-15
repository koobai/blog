import json
import os
import random
import re
import sys
import tempfile
import time
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Dict, Iterable, List, Optional, Tuple


DEFAULT_DOUBAN_ID = "jnnsu"
LOCAL_FILE = Path("assets/movie.json")
PAGE_SIZE = 50
MAX_PAGES = 100
REQUEST_RETRIES = 3


@dataclass(frozen=True)
class SyncResult:
    changed: bool
    new_count: int
    updated_count: int
    total_count: int


def normalize_interest(item: dict) -> dict:
    subject = item.get("subject") or {}
    douban_id = str(subject.get("id") or "").strip()
    if not douban_id:
        raise ValueError("豆瓣返回了缺少 subject.id 的观影记录")

    rating_data = item.get("rating")
    if isinstance(rating_data, dict):
        personal_rating = rating_data.get("value", 0)
    elif isinstance(rating_data, (int, float)):
        personal_rating = int(rating_data)
    else:
        personal_rating = 0

    pub_year = ""
    pubdates = subject.get("pubdate") or []
    if isinstance(pubdates, str):
        pubdates = [pubdates]
    if pubdates:
        year_match = re.search(r"(\d{4})", str(pubdates[0]))
        if year_match:
            pub_year = year_match.group(1)
    elif subject.get("year"):
        pub_year = subject.get("year")

    color_scheme = subject.get("color_scheme")
    if not isinstance(color_scheme, dict):
        color_scheme = {}

    return {
        "id": douban_id,
        "type": subject.get("type", ""),
        "title": subject.get("title", ""),
        "year": pub_year,
        "rating": personal_rating,
        "comment": item.get("comment", ""),
        "link": subject.get("url", ""),
        "create_time": item.get("create_time", ""),
        "color_scheme": color_scheme,
    }


def load_local_movies(path: Path) -> List[dict]:
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError("本地观影数据无法读取：{}".format(path)) from exc
    if not isinstance(data, list) or any(not isinstance(item, dict) for item in data):
        raise ValueError("本地观影数据必须是对象数组：{}".format(path))
    return data


def build_request(douban_id: str, start: int, count: int) -> urllib.request.Request:
    api = (
        "https://m.douban.com/rexxar/api/v2/user/{}/interests"
        "?type=movie&status=done&start={}&count={}"
    ).format(douban_id, start, count)
    return urllib.request.Request(
        api,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 "
                "Mobile/15E148 Safari/604.1"
            ),
            "Referer": "https://m.douban.com/people/{}/interests".format(douban_id),
            "Accept": "application/json",
            "Connection": "keep-alive",
        },
    )


def fetch_page(
    douban_id: str,
    start: int,
    count: int,
    opener: Callable = urllib.request.urlopen,
) -> dict:
    request = build_request(douban_id, start, count)
    with opener(request, timeout=15) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if (
        not isinstance(payload, dict)
        or "interests" not in payload
        or not isinstance(payload.get("interests"), list)
    ):
        raise ValueError("豆瓣 API 返回结构异常")
    return payload


def fetch_remote_movies(
    douban_id: str,
    page_size: int = PAGE_SIZE,
    sleep_fn: Callable[[float], None] = time.sleep,
    jitter_fn: Callable[[float, float], float] = random.uniform,
) -> List[dict]:
    movies: List[dict] = []
    seen_ids = set()
    start = 0

    for page_number in range(1, MAX_PAGES + 1):
        print("🔄 正在拉取第 {} 页（从第 {} 条开始）...".format(page_number, start))
        payload: Optional[dict] = None
        last_error: Optional[Exception] = None
        for attempt in range(1, REQUEST_RETRIES + 1):
            try:
                payload = fetch_page(douban_id, start, page_size)
                break
            except Exception as exc:
                last_error = exc
                if attempt < REQUEST_RETRIES:
                    delay = float(attempt)
                    print("⚠️ 豆瓣请求失败，第 {} 次重试将在 {:.0f} 秒后进行：{}".format(attempt, delay, exc))
                    sleep_fn(delay)
        if payload is None:
            raise RuntimeError("豆瓣 API 连续请求失败") from last_error

        interests = payload.get("interests", [])
        if not interests:
            break
        for item in interests:
            movie = normalize_interest(item)
            if movie["id"] in seen_ids:
                continue
            seen_ids.add(movie["id"])
            movies.append(movie)

        start += len(interests)
        total = payload.get("total")
        if (isinstance(total, int) and start >= total) or len(interests) < page_size:
            break
        sleep_fn(jitter_fn(1.5, 3.0))
    else:
        raise RuntimeError("豆瓣分页超过安全上限 {} 页，已停止同步".format(MAX_PAGES))

    return movies


def merge_movies(local_movies: Iterable[dict], remote_movies: Iterable[dict]) -> Tuple[List[dict], int, int]:
    local_list = list(local_movies)
    remote_list = list(remote_movies)
    local_by_id: Dict[str, dict] = {
        str(item.get("id")): item for item in local_list if item.get("id")
    }
    remote_ids = set()
    merged: List[dict] = []
    new_count = 0
    updated_count = 0

    for movie in remote_list:
        movie_id = str(movie.get("id") or "")
        if not movie_id or movie_id in remote_ids:
            continue
        remote_ids.add(movie_id)
        if movie_id not in local_by_id:
            new_count += 1
        elif local_by_id[movie_id] != movie:
            updated_count += 1
        merged.append(movie)

    for movie in local_list:
        movie_id = str(movie.get("id") or "")
        if not movie_id or movie_id not in remote_ids:
            merged.append(movie)

    return merged, new_count, updated_count


def atomic_write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    previous_mode = path.stat().st_mode & 0o777 if path.exists() else 0o644
    temporary_path: Optional[Path] = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=str(path.parent),
            prefix=".{}.".format(path.name),
            suffix=".tmp",
            delete=False,
        ) as handle:
            temporary_path = Path(handle.name)
            json.dump(value, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(str(temporary_path), previous_mode)
        os.replace(str(temporary_path), str(path))
        temporary_path = None
    finally:
        if temporary_path and temporary_path.exists():
            temporary_path.unlink()


def synchronize_movies(
    douban_id: str,
    local_file: Path = LOCAL_FILE,
    fetcher: Callable[[str], List[dict]] = fetch_remote_movies,
) -> SyncResult:
    local_movies = load_local_movies(local_file)
    remote_movies = fetcher(douban_id)
    final_movies, new_count, updated_count = merge_movies(local_movies, remote_movies)
    changed = final_movies != local_movies
    if changed:
        atomic_write_json(local_file, final_movies)
    return SyncResult(
        changed=changed,
        new_count=new_count,
        updated_count=updated_count,
        total_count=len(final_movies),
    )


def write_github_environment(path: Path, result: SyncResult) -> None:
    with path.open("a", encoding="utf-8") as handle:
        handle.write("HAS_NEW_DATA={}\n".format("true" if result.changed else "false"))
        handle.write("MOVIES_NEW_COUNT={}\n".format(result.new_count))
        handle.write("MOVIES_UPDATED_COUNT={}\n".format(result.updated_count))
        handle.write("MOVIES_TOTAL_COUNT={}\n".format(result.total_count))


def main() -> int:
    douban_id = os.getenv("DOUBAN_ID", DEFAULT_DOUBAN_ID).strip()
    if not douban_id:
        print("❌ 缺少 DOUBAN_ID：请在环境变量或 GitHub Actions Variables 中配置豆瓣 ID。", file=sys.stderr)
        return 1

    print("📡 开始直连豆瓣 API 获取【{}】的观影记录...".format(douban_id))
    try:
        result = synchronize_movies(douban_id)
    except Exception as exc:
        print("❌ 豆瓣同步失败，本地 movie.json 保持不变：{}".format(exc), file=sys.stderr)
        return 1

    if result.changed:
        print(
            "🎉 观影数据已更新：新增 {} 条，更新 {} 条，共 {} 条。".format(
                result.new_count, result.updated_count, result.total_count
            )
        )
    else:
        print("☕ 没有变化，本地已是最新。")

    github_env = os.environ.get("GITHUB_ENV")
    if github_env:
        write_github_environment(Path(github_env), result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
