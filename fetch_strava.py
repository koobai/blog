import argparse
import hashlib
import json
import os
import re
import tempfile
import time
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


PROJECT_ROOT = Path(__file__).resolve().parent
DEFAULT_ACTIVITIES_FILE = PROJECT_ROOT / "assets" / "activities.json"
DEFAULT_MONTHLY_FILE = PROJECT_ROOT / "assets" / "monthly_insights.json"
DEFAULT_METADATA_FILE = PROJECT_ROOT / "assets" / "activity_ai_meta.json"

CF_ACCOUNT_ID = os.getenv("CF_ACCOUNT_ID")
CF_AI_TOKEN = os.getenv("CF_AI_TOKEN")
CF_AI_MODEL = os.getenv(
    "CF_AI_MODEL",
    "@cf/meta/llama-4-scout-17b-16e-instruct",
)

METADATA_SCHEMA_VERSION = 1
ACTIVITY_PROMPT_VERSION = "activity-copy-v6"
MONTHLY_PROMPT_VERSION = "monthly-copy-v5"
REQUEST_TIMEOUT_SECONDS = 45
NETWORK_RETRIES = 3
RESPONSE_RETRIES = 2
QUALITY_RETRIES = 2
REQUEST_INTERVAL_SECONDS = float(os.getenv("CF_AI_REQUEST_INTERVAL", "0.25"))

ACTIVITY_TYPE_CN = {
    "Run": "跑步",
    "Ride": "骑行",
    "Walk": "步行",
    "Hike": "徒步",
    "StairStepper": "爬楼梯",
    "Swim": "游泳",
}

REQUIRED_ACTIVITY_FIELDS = {
    "run_id",
    "name",
    "ai_title",
    "ai_comment",
    "type",
    "distance",
    "moving_time",
    "start_date_local",
    "average_heartrate",
    "average_speed",
    "pace_num",
    "pace_unit",
    "total_elevation_gain",
    "calories",
    "summary_polyline",
    "source_id",
    "start_date_utc",
    "source_timezone",
    "route_status",
    "is_indoor",
}

TITLE_BANNED_WORDS = {
    "燃烧",
    "极限",
    "律动",
    "光影",
    "暮色",
    "逐风",
    "灵魂",
    "心灵",
    "绽放",
    "激燃",
    "征服",
}

TITLE_GENERIC_WORDS = {
    "傍晚",
    "夜间",
    "夜里",
    "晨间",
    "上午",
    "下午",
    "午后",
    "早上",
    "晚上",
    "骑行",
    "骑出",
    "晨骑",
    "夜骑",
    "快骑",
    "慢骑",
    "长骑",
    "短骑",
    "跑步",
    "短跑",
    "步行",
    "散步",
    "徒步",
    "夜行",
    "记录",
    "日常",
    "练习",
    "小练",
    "运动",
    "活动",
    "锻炼",
}

TITLE_MISMATCH_WORDS = {
    "Ride": ("跑", "步", "走", "游", "爬"),
    "Run": ("骑", "游", "爬"),
    "Walk": ("骑", "跑", "游"),
    "Hike": ("骑", "跑", "游"),
    "StairStepper": ("骑", "跑", "游"),
    "Swim": ("骑", "跑", "走", "步", "爬"),
}

TITLE_FALLBACKS = {
    "first": (
        "先记下这次",
        "从这一笔开始",
        "给以后留底",
        "第一笔先收好",
        "先留个参照",
    ),
    "longer": (
        "今天绕远点",
        "多绕了一圈",
        "这回没早收",
        "把路拉长些",
        "比平时多些",
        "路又长一截",
        "今天多一点",
        "这一趟加量",
        "今天多留一段",
        "再添一段路",
        "比上回更远",
        "路程往上加",
        "这次多绕些",
        "今天没有省",
        "又多了一截",
        "多出来一段",
        "把距离拉开",
        "这回路更长",
        "比上回多点",
        "再远那么一点",
        "多出不少路",
        "今天加一截",
        "路没有白绕",
        "这回多一程",
        "多出来的路",
    ),
    "shorter": (
        "今天少来点",
        "短一点也行",
        "这回早收些",
        "只留一小段",
        "没打算绕远",
        "今天先到这",
        "路短话也少",
        "这一趟精简",
        "少一点收工",
        "这回短不少",
        "路程收回来",
        "今天没有贪多",
        "比上回短些",
        "少绕一点路",
        "距离做减法",
        "早一点收住",
        "这次少一截",
        "路程往回收",
        "短短留一笔",
        "没有绕太远",
        "今天收得早",
        "只取一小段",
        "少一点也记",
        "这回没加量",
    ),
    "faster": (
        "悄悄快一点",
        "今天快半拍",
        "不知不觉提速",
        "这回快了点",
        "速度醒过来",
        "比上回利索",
        "今天没拖沓",
        "这一趟偏快",
        "速度往上提",
        "比上回快些",
        "今天提一档",
        "这一趟利索",
        "快了那么一点",
    ),
    "slower": (
        "今天不赶路",
        "慢一点收尾",
        "这回放慢些",
        "不急着提速",
        "先把速度放下",
        "今天慢慢来",
        "这一趟慢些",
        "慢下来也好",
        "速度往回收",
        "比上回慢些",
        "这次不求快",
        "先慢慢完成",
        "速度低一档",
    ),
    "heart_up": (
        "心率先说话",
        "今天多费点",
        "心率没闲着",
        "心率高一点",
        "这回更费劲",
    ),
    "heart_down": (
        "心率收着点",
        "今天没太冲",
        "这回更克制",
        "心率低一点",
        "收着完成了",
        "心率往下收",
        "比上回低些",
        "这一回没冲",
        "数字安静些",
        "心率更克制",
    ),
    "comeback": (
        "隔些天再来",
        "重新接上了",
        "久违的一笔",
        "回来动一动",
        "中断以后再续",
    ),
    "steady": (
        "今天不加戏",
        "照常记一笔",
        "平常也算数",
        "这一趟照旧",
        "没什么波澜",
        "普通也入账",
        "今天就这样",
        "不必找亮点",
        "照自己的来",
        "这一笔很平常",
        "没快也没慢",
        "起伏不算大",
        "差不多就好",
        "如实记一回",
        "没变化也记",
        "这一回照常",
    ),
}

COMMENT_BANNED_PHRASES = {
    "完美匹配",
    "恰到好处",
    "可圈可点",
    "有目共睹",
    "突破极限",
    "继续保持",
    "期待下一次",
    "越来越强",
    "身体和心灵",
    "多巴胺",
    "无限可能",
    "影子对手",
    "训练成效显著",
    "强大的耐力基础",
    "心血管适应性",
    "状态趋于平稳",
    "整体保持稳定",
    "正常发挥",
}

UNSUPPORTED_SCENE_WORDS = {
    "阳光",
    "微风",
    "湿度",
    "风景",
    "山影",
    "夏风",
    "春风",
    "秋风",
    "夜色",
}

UNSUPPORTED_ACTIVITY_CLAIMS = ("步频", "踏频", "功率", "体感")
STRUCTURAL_ARTIFACT_PATTERN = re.compile(
    r"[{}\[\]]|['\"]?(?:title|comment)['\"]?\s*:",
    re.I,
)

STYLE_HINTS = (
    "像写私人运动日记：平实、具体，不拔高",
    "像熟悉我的朋友随口点评：可以轻微调侃，但不油腻",
    "抓住一个主要变化，用三句完整的话写清楚",
    "语气克制，允许这只是一次普通完成",
)

ACTIVITY_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {
            "type": "string",
            "minLength": 4,
            "maxLength": 8,
            "description": "4至8个纯中文字符，有记忆点，不写时间和运动类型",
        },
        "comment": {
            "type": "string",
            "minLength": 55,
            "maxLength": 115,
            "description": "自然克制、内容完整的三句中文点评",
        },
    },
    "required": ["title", "comment"],
    "additionalProperties": False,
}

MONTHLY_SCHEMA = {
    "type": "object",
    "properties": {
        "comment": {
            "type": "string",
            "minLength": 70,
            "maxLength": 160,
            "description": "自然克制、内容完整的中文月记",
        }
    },
    "required": ["comment"],
    "additionalProperties": False,
}


class AIRequestError(RuntimeError):
    pass


class AIResponseError(RuntimeError):
    pass


class CopyValidationError(ValueError):
    pass


def parse_time(value):
    try:
        return datetime.strptime(value, "%Y-%m-%dT%H:%M:%S")
    except (TypeError, ValueError):
        return datetime.min


def load_json(path, expected_type):
    if not path.exists():
        return expected_type()

    try:
        with path.open("r", encoding="utf-8") as file:
            data = json.load(file)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"{path.name} 格式错误: {error}") from error

    if not isinstance(data, expected_type):
        raise RuntimeError(f"{path.name} 顶层必须是 {expected_type.__name__}")
    return data


def empty_metadata():
    return {
        "schema_version": METADATA_SCHEMA_VERSION,
        "activities": {},
        "monthly": {},
    }


def load_metadata(path):
    if not path.exists():
        return empty_metadata()

    metadata = load_json(path, dict)
    if metadata.get("schema_version") != METADATA_SCHEMA_VERSION:
        raise RuntimeError(
            f"{path.name} schema_version 必须为 {METADATA_SCHEMA_VERSION}"
        )
    if not isinstance(metadata.get("activities"), dict) or not isinstance(
        metadata.get("monthly"), dict
    ):
        raise RuntimeError(f"{path.name} 缺少有效的 activities 或 monthly 对象")
    return metadata


def canonical_hash(value):
    encoded = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def metadata_entry(input_hash, prompt_version):
    return {
        "input_hash": input_hash,
        "model": CF_AI_MODEL,
        "prompt_version": prompt_version,
        "updated_at": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
    }


def metadata_matches(entry, input_hash, prompt_version):
    return (
        isinstance(entry, dict)
        and entry.get("input_hash") == input_hash
        and entry.get("model") == CF_AI_MODEL
        and entry.get("prompt_version") == prompt_version
    )


def write_json_atomic(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_name = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=path.parent,
            prefix=f".{path.name}.",
            delete=False,
        ) as temporary:
            json.dump(data, temporary, ensure_ascii=False, indent=2)
            temporary.flush()
            os.fsync(temporary.fileno())
            temporary_name = temporary.name
        os.replace(temporary_name, path)
    finally:
        if temporary_name and os.path.exists(temporary_name):
            os.unlink(temporary_name)


def load_activities(path):
    activities = load_json(path, list)
    seen_source_ids = set()

    for index, item in enumerate(activities):
        if not isinstance(item, dict):
            raise RuntimeError(f"activities.json 第 {index + 1} 条不是对象")
        missing = REQUIRED_ACTIVITY_FIELDS - set(item)
        if missing:
            raise RuntimeError(
                f"activities.json 第 {index + 1} 条缺少字段: {', '.join(sorted(missing))}"
            )
        source_id = item.get("source_id")
        if not isinstance(source_id, str) or not source_id:
            raise RuntimeError(f"activities.json 第 {index + 1} 条 source_id 无效")
        if source_id in seen_source_ids:
            raise RuntimeError(f"activities.json source_id 重复: {source_id}")
        seen_source_ids.add(source_id)

    activities.sort(
        key=lambda item: parse_time(item.get("start_date_local")),
        reverse=True,
    )
    return activities


def normalize_text(value):
    if not isinstance(value, str):
        return ""
    return (
        value.strip()
        .strip('"“”\'‘’')
        .replace("\r", " ")
        .replace("\n", " ")
        .replace(",", "，")
        .replace("!", "！")
    )


def normalize_comment(value):
    text = normalize_text(value)
    return re.sub(r"(?:\s*[{}\[\]]\s*[，,、]?\s*)+$", "", text).strip()


def strip_reasoning_and_fences(value):
    text = re.sub(r"<think>.*?</think>", "", value, flags=re.DOTALL).strip()
    text = text.replace("```json", "").replace("```", "").strip()
    first_brace = text.find("{")
    last_brace = text.rfind("}")
    if first_brace >= 0 and last_brace > first_brace:
        return text[first_brace : last_brace + 1]
    return text


def decode_structured_text(value):
    cleaned = strip_reasoning_and_fences(value)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as error:
        preview = cleaned[:240].replace("\n", " ").replace("\r", " ")
        raise AIResponseError(f"{error}；内容预览: {preview!r}") from error


def extract_structured_result(response_payload):
    result = response_payload.get("result", response_payload)

    if isinstance(result, dict):
        response_value = result.get("response")
        if isinstance(response_value, dict):
            return response_value
        if isinstance(response_value, str):
            return decode_structured_text(response_value)

        choices = result.get("choices")
        if isinstance(choices, list) and choices:
            message = choices[0].get("message", {})
            content = message.get("content")
            if isinstance(content, dict):
                return content
            if isinstance(content, str):
                return decode_structured_text(content)

        if all(key in result for key in ("title", "comment")) or "comment" in result:
            return result

    raise AIResponseError("Cloudflare 返回内容中没有可解析的结构化结果")


def call_cloudflare(messages, schema, temperature, max_tokens):
    if not CF_ACCOUNT_ID or not CF_AI_TOKEN:
        raise AIRequestError("缺少 CF_ACCOUNT_ID 或 CF_AI_TOKEN")

    url = (
        f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}"
        f"/ai/run/{CF_AI_MODEL}"
    )
    payload = {
        "messages": messages,
        "temperature": temperature,
        "top_p": 0.9,
        "repetition_penalty": 1.08,
        "max_tokens": max_tokens,
        "guided_json": schema,
    }

    last_error = None

    for attempt in range(1, NETWORK_RETRIES + 1):
        attempt_payload = dict(payload)
        if attempt > 1:
            attempt_payload["temperature"] = min(temperature, 0.35)
        encoded_payload = json.dumps(
            attempt_payload,
            ensure_ascii=False,
        ).encode("utf-8")
        request = Request(
            url,
            data=encoded_payload,
            headers={
                "Authorization": f"Bearer {CF_AI_TOKEN}",
                "Content-Type": "application/json",
                "User-Agent": "koobai-activity-insights/2",
            },
            method="POST",
        )

        try:
            with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
                response_payload = json.loads(response.read().decode("utf-8"))
            if not response_payload.get("success", True):
                raise AIRequestError(
                    f"Cloudflare API 返回失败: {response_payload.get('errors', [])}"
                )
            structured = extract_structured_result(response_payload)
            if not isinstance(structured, dict):
                raise AIResponseError("Cloudflare 结构化结果必须是 JSON 对象")
            if REQUEST_INTERVAL_SECONDS > 0:
                time.sleep(REQUEST_INTERVAL_SECONDS)
            return structured
        except HTTPError as error:
            body = error.read().decode("utf-8", errors="replace")
            last_error = AIRequestError(f"Cloudflare HTTP {error.code}: {body[:500]}")
            should_retry = error.code == 429 or error.code >= 500
        except (URLError, TimeoutError) as error:
            last_error = AIRequestError(f"Cloudflare 网络请求失败: {error}")
            should_retry = True
        except AIRequestError as error:
            last_error = error
            should_retry = attempt < NETWORK_RETRIES
        except AIResponseError as error:
            last_error = error
            should_retry = attempt < min(NETWORK_RETRIES, RESPONSE_RETRIES)
        except (json.JSONDecodeError, KeyError, TypeError) as error:
            last_error = AIResponseError(f"Cloudflare 响应解析失败: {error}")
            should_retry = attempt < min(NETWORK_RETRIES, RESPONSE_RETRIES)

        if not should_retry or attempt == NETWORK_RETRIES:
            break
        if isinstance(last_error, AIResponseError):
            print(f"   ↳ 响应格式异常，立即重试（{attempt}/{RESPONSE_RETRIES}）")
            continue
        wait_seconds = min(2 ** attempt, 8)
        print(f"   ↳ 请求失败，{wait_seconds} 秒后重试（{attempt}/{NETWORK_RETRIES}）")
        time.sleep(wait_seconds)

    raise last_error or AIRequestError("Cloudflare 请求失败")


def time_of_day_label(date_value):
    hour = date_value.hour
    if hour < 5:
        return "凌晨"
    if hour < 9:
        return "早上"
    if hour < 12:
        return "上午"
    if hour < 14:
        return "中午"
    if hour < 18:
        return "下午"
    if hour < 20:
        return "傍晚"
    return "晚上"


def percentage_change(current, previous):
    try:
        current_number = float(current)
        previous_number = float(previous)
    except (TypeError, ValueError):
        return None
    if previous_number <= 0:
        return None
    return ((current_number - previous_number) / previous_number) * 100


def build_comparison_notes(item, global_previous, same_type_previous):
    notes = []
    current_date = parse_time(item.get("start_date_local"))

    if global_previous:
        gap_days = (current_date - parse_time(global_previous.get("start_date_local"))).days
        if gap_days >= 7:
            notes.append(f"距离上次任何运动相隔 {gap_days} 天")
        elif gap_days == 0:
            notes.append("当天还有另一条更早的运动记录")

    if not same_type_previous:
        notes.append("没有更早的同类运动可比较")
        return notes

    same_gap_days = (
        current_date - parse_time(same_type_previous.get("start_date_local"))
    ).days
    if same_gap_days >= 14:
        notes.append(f"距离上次同类运动相隔 {same_gap_days} 天")

    distance_change = percentage_change(
        item.get("distance"), same_type_previous.get("distance")
    )
    if distance_change is not None and abs(distance_change) >= 8:
        direction = "更长" if distance_change > 0 else "更短"
        notes.append(f"距离比上次同类运动{direction}约 {abs(distance_change):.0f}%")

    speed_change = percentage_change(
        item.get("average_speed"), same_type_previous.get("average_speed")
    )
    if speed_change is not None and abs(speed_change) >= 4:
        direction = "更快" if speed_change > 0 else "更慢"
        notes.append(f"平均速度比上次同类运动{direction}约 {abs(speed_change):.0f}%")

    current_hr = item.get("average_heartrate") or 0
    previous_hr = same_type_previous.get("average_heartrate") or 0
    if current_hr > 0 and previous_hr > 0 and abs(current_hr - previous_hr) >= 5:
        direction = "高" if current_hr > previous_hr else "低"
        notes.append(f"平均心率比上次同类运动{direction} {abs(current_hr - previous_hr)} bpm")

    if not notes:
        notes.append("与上次同类运动相比没有特别明显的变化")
    return notes


def build_activity_facts(item, global_previous, same_type_previous):
    source_id = item.get("source_id", "")
    style_index = sum(source_id.encode("utf-8")) % len(STYLE_HINTS)
    return {
        "运动类型": ACTIVITY_TYPE_CN.get(item.get("type"), "运动"),
        "是否室内": bool(item.get("is_indoor")),
        "距离公里": item.get("distance"),
        "平均心率": item.get("average_heartrate") or None,
        "配速或速度展示": f"{item.get('pace_num', '')}{item.get('pace_unit', '')}",
        "爬升米": item.get("total_elevation_gain"),
        "可使用的比较结论": build_comparison_notes(
            item, global_previous, same_type_previous
        ),
        "本条语气": STYLE_HINTS[style_index],
    }


def activity_input_hash(facts):
    return canonical_hash({"facts": facts})


def title_theme(facts):
    comparison = "；".join(facts.get("可使用的比较结论", []))
    if "没有更早的同类运动" in comparison:
        return "first"
    if "距离比上次同类运动更长" in comparison:
        return "longer"
    if "距离比上次同类运动更短" in comparison:
        return "shorter"
    if "平均速度比上次同类运动更快" in comparison:
        return "faster"
    if "平均速度比上次同类运动更慢" in comparison:
        return "slower"
    if "平均心率比上次同类运动高" in comparison:
        return "heart_up"
    if "平均心率比上次同类运动低" in comparison:
        return "heart_down"
    if "相隔" in comparison:
        return "comeback"
    return "steady"


def title_is_usable(title, used_titles=None, activity_type=None):
    used_titles = used_titles or set()
    return (
        bool(re.fullmatch(r"[\u3400-\u9fff]{4,8}", title))
        and not any(word in title for word in TITLE_BANNED_WORDS)
        and not any(word in title for word in TITLE_GENERIC_WORDS)
        and not any(
            word in title for word in TITLE_MISMATCH_WORDS.get(activity_type, ())
        )
        and title not in used_titles
    )


def fallback_activity_title(item, facts, used_titles):
    candidates = TITLE_FALLBACKS[title_theme(facts)]
    source_id = item.get("source_id", "")
    offset = int(hashlib.sha256(source_id.encode("utf-8")).hexdigest()[:8], 16)
    offset %= len(candidates)
    ordered = candidates[offset:] + candidates[:offset]
    return next(
        (candidate for candidate in ordered if candidate not in used_titles),
        ordered[0],
    )


def prepare_activity_title(value, item, facts, used_titles):
    title = normalize_text(value)
    if title_is_usable(title, used_titles, item.get("type")):
        return title
    return fallback_activity_title(item, facts, used_titles)


def validate_activity_copy(
    title,
    comment,
    activity_type,
    used_comments=None,
):
    title = normalize_text(title)
    comment = normalize_comment(comment)
    used_comments = used_comments or set()
    errors = []

    if not re.fullmatch(r"[\u3400-\u9fff]{4,8}", title):
        errors.append("标题必须是 4 至 8 个纯中文字符，不能有标点")
    if any(word in title for word in TITLE_BANNED_WORDS):
        errors.append("标题包含陈词滥调")
    if any(word in title for word in TITLE_GENERIC_WORDS):
        errors.append("标题不能只是时间、运动类型或流水账标签")
    if any(word in title for word in TITLE_MISMATCH_WORDS.get(activity_type, ())):
        errors.append("标题混入了其他运动类型的词汇")

    if not 55 <= len(comment) <= 115:
        errors.append(f"评论必须为 55 至 115 个字符，当前为 {len(comment)}")
    if comment.count("！") > 1:
        errors.append("评论最多使用一个感叹号")
    if any(phrase in comment for phrase in COMMENT_BANNED_PHRASES):
        errors.append("评论包含常见 AI 套话")
    if any(word in comment for word in UNSUPPORTED_SCENE_WORDS):
        errors.append("评论虚构了未提供的天气或景色")
    if any(word in comment for word in UNSUPPORTED_ACTIVITY_CLAIMS):
        errors.append("评论使用了数据中没有提供的指标或感受")
    if STRUCTURAL_ARTIFACT_PATTERN.search(comment):
        errors.append("评论混入了 JSON 或字段残片")
    if comment in used_comments:
        errors.append("评论与已有评论完全重复")

    mismatch_words = {
        "Ride": ("跑步", "脚步", "步伐", "徒步"),
        "Run": ("骑行", "车轮", "骑车"),
        "Walk": ("骑行", "车轮", "跑步"),
        "Hike": ("骑行", "车轮", "跑步"),
        "StairStepper": ("骑行", "车轮", "跑步"),
        "Swim": ("骑行", "车轮", "跑步", "脚步"),
    }
    if any(word in comment for word in mismatch_words.get(activity_type, ())):
        errors.append("评论混入了其他运动类型的词汇")

    if errors:
        raise CopyValidationError("；".join(errors))
    return title, comment


def activity_prompt(
    facts,
    recent_titles,
    previous_errors=None,
    previous_output=None,
):
    prompt = f"""
请根据下面的事实，为我的个人运动记录写标题和短评。

事实：
{json.dumps(facts, ensure_ascii=False, indent=2)}

最近使用过的标题，尽量不要完全重复：
{json.dumps(recent_titles[:12], ensure_ascii=False)}

硬性要求：
1. title 只能是 4 至 8 个中文字符，不要标点、数字和空格。它要像日记边上的一句话，有一点态度或反差，不能只是活动标签。
2. title 禁止出现时间词和运动类型。坏例子：傍晚骑行、夜间跑步、晨间徒步、骑行日常、骑行小练、夜行记录。语气方向可以像“今天不加戏”“慢一点收尾”“多绕了一圈”，但不要照抄。
3. comment 写 65 至 95 个中文字符，必须是内容完整、前后连贯的三句话。
4. 全文只挑一个核心数据和一项比较变化，不复述时长，不写成运动数据播报。
5. 第一句自然交代这次最值得记的一点；第二句写有依据的变化；第三句像本人给日记收尾，可以平淡、轻微自嘲，但不能虚构身体感受。
6. 只使用给出的事实。没有天气、路线风景和身体感受数据时，不得自行想象。
7. 不做医疗判断，不使用“燃脂区间”“心血管适应性”“耐力基础”等诊断式表达。
8. 不要每次都夸进步，表现普通时可以直接说普通；通常不用感叹号。
9. 禁止使用：完美匹配、恰到好处、可圈可点、有目共睹、突破极限、继续保持、期待下一次、越来越强、身体和心灵、多巴胺、影子对手、状态趋于平稳、整体保持稳定、正常发挥、这是一次普通的、运动结束、感觉还不错、就当日常锻炼、我会继续观察。
10. 不要写数据中没有的步频、踏频、功率和体感。

理想语气：先抓住一个真实变化，再说一句不端着的判断；允许没亮点，但不能没意思，也不要把普通完成写成励志故事。

只返回符合 schema 的 JSON，不要解释。
""".strip()
    if previous_errors:
        prompt += (
            f"\n\n上一次输出：{json.dumps(previous_output, ensure_ascii=False)}"
            f"\n未通过原因：{previous_errors}。保留自然语气，针对原因改写；"
            "如果太短，只补充一个来自事实的观察，不要添加套话。"
        )
    return prompt


def generate_activity_copy(item, facts, recent_titles, recent_comments):
    used_titles = set(recent_titles)
    used_comments = set(recent_comments)
    previous_errors = None
    previous_output = None

    for _ in range(QUALITY_RETRIES):
        result = call_cloudflare(
            messages=[
                {
                    "role": "system",
                    "content": (
                        "你是中文母语的私人运动记录编辑。语气自然、克制、具体，"
                        "不是热血教练，也不是广告文案。严格区分事实和推测。"
                    ),
                },
                {
                    "role": "user",
                    "content": activity_prompt(
                        facts,
                        recent_titles,
                        previous_errors,
                        previous_output,
                    ),
                },
            ],
            schema=ACTIVITY_SCHEMA,
            temperature=0.2 if previous_errors else 0.45,
            max_tokens=360,
        )

        try:
            title = prepare_activity_title(
                result.get("title"),
                item,
                facts,
                used_titles,
            )
            return validate_activity_copy(
                title,
                result.get("comment"),
                item.get("type"),
                used_comments,
            )
        except CopyValidationError as error:
            previous_errors = str(error)
            previous_output = {
                "title": prepare_activity_title(
                    result.get("title"),
                    item,
                    facts,
                    used_titles,
                ),
                "comment": normalize_comment(result.get("comment")),
            }

    detail = previous_errors or "活动文案未通过质量检查"
    if previous_output:
        detail += f"；最后输出：{json.dumps(previous_output, ensure_ascii=False)}"
    raise CopyValidationError(detail)


def duration_seconds(value):
    try:
        parts = [int(part) for part in value.split(":")]
    except (AttributeError, ValueError):
        return 0
    if len(parts) == 3:
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    if len(parts) == 2:
        return parts[0] * 60 + parts[1]
    return 0


def calculate_monthly_stats(month_activities):
    stats = {
        "total_count": len(month_activities),
        "total_distance": 0.0,
        "total_duration_minutes": 0,
        "sports_count": defaultdict(int),
        "sports_distance": defaultdict(float),
        "time_preferences": defaultdict(int),
        "longest_ride_km": 0.0,
        "longest_run_km": 0.0,
        "hardest_session": {
            "date": None,
            "type": None,
            "hr": 0,
            "zone": "仅按平均心率排序",
        },
        "hr_sums": defaultdict(list),
        "active_days": set(),
    }

    for activity in month_activities:
        activity_type = activity.get("type", "Unknown")
        type_cn = ACTIVITY_TYPE_CN.get(activity_type, "运动")
        distance = float(activity.get("distance") or 0)
        heart_rate = int(activity.get("average_heartrate") or 0)
        start_date = activity.get("start_date_local", "")

        stats["total_distance"] += distance
        stats["total_duration_minutes"] += round(
            duration_seconds(activity.get("moving_time", "")) / 60
        )
        stats["sports_count"][type_cn] += 1
        stats["sports_distance"][type_cn] += distance

        date_value = parse_time(start_date)
        if date_value != datetime.min:
            stats["active_days"].add(date_value.date())
            stats["time_preferences"][time_of_day_label(date_value)] += 1

        if activity_type == "Ride":
            stats["longest_ride_km"] = max(stats["longest_ride_km"], distance)
        if activity_type == "Run":
            stats["longest_run_km"] = max(stats["longest_run_km"], distance)

        if heart_rate > stats["hardest_session"]["hr"]:
            stats["hardest_session"] = {
                "date": date_value.strftime("%-d号") if date_value != datetime.min else "未知",
                "type": type_cn,
                "hr": heart_rate,
                "zone": "仅按平均心率排序",
            }
        if heart_rate > 0:
            stats["hr_sums"][type_cn].append(heart_rate)

    sorted_days = sorted(stats["active_days"])
    max_streak = 1 if sorted_days else 0
    current_streak = max_streak
    for index in range(1, len(sorted_days)):
        if sorted_days[index] == sorted_days[index - 1] + timedelta(days=1):
            current_streak += 1
            max_streak = max(max_streak, current_streak)
        else:
            current_streak = 1

    stats["total_distance"] = round(stats["total_distance"], 2)
    stats["sports_count"] = dict(stats["sports_count"])
    stats["sports_distance"] = {
        key: round(value, 2) for key, value in stats["sports_distance"].items()
    }
    stats["favorite_time"] = (
        max(stats["time_preferences"], key=stats["time_preferences"].get)
        if stats["time_preferences"]
        else "未知"
    )
    stats["avg_hr"] = {
        type_cn: f"{round(sum(values) / len(values))}bpm"
        for type_cn, values in stats["hr_sums"].items()
    }
    stats["max_streak_days"] = max_streak
    stats["active_days_count"] = len(stats["active_days"])
    stats["longest_ride_km"] = round(stats["longest_ride_km"], 2)
    stats["longest_run_km"] = round(stats["longest_run_km"], 2)

    del stats["active_days"], stats["time_preferences"], stats["hr_sums"]
    return stats


def previous_month_key(month_key):
    year, month = [int(value) for value in month_key.split("-")]
    if month == 1:
        return f"{year - 1}-12"
    return f"{year}-{month - 1:02d}"


def build_monthly_inputs(activities):
    months_data = defaultdict(list)
    for activity in activities:
        date_text = activity.get("start_date_local", "")
        if len(date_text) >= 7:
            months_data[date_text[:7]].append(activity)

    inputs = {}
    for month_key in sorted(months_data):
        stats = calculate_monthly_stats(months_data[month_key])
        previous_key = previous_month_key(month_key)
        previous_stats = (
            calculate_monthly_stats(months_data[previous_key])
            if previous_key in months_data
            else None
        )
        input_hash = canonical_hash(
            {
                "month": month_key,
                "stats": stats,
                "previous_stats": previous_stats,
            }
        )
        inputs[month_key] = (stats, previous_stats, input_hash)
    return inputs


def validate_monthly_comment(value):
    comment = normalize_text(value)
    if not 70 <= len(comment) <= 160:
        raise CopyValidationError(
            f"月报评论必须为 70 至 160 个字符，当前为 {len(comment)}"
        )
    if any(phrase in comment for phrase in COMMENT_BANNED_PHRASES):
        raise CopyValidationError("月报包含常见 AI 套话")
    if any(word in comment for word in UNSUPPORTED_SCENE_WORDS):
        raise CopyValidationError("月报虚构了未提供的信息")
    if comment.count("！") > 1:
        raise CopyValidationError("月报最多使用一个感叹号")
    return comment


def generate_monthly_comment(month_key, stats, previous_stats):
    comparison = (
        {"上一个自然月": previous_stats}
        if previous_stats
        else {"上一个自然月": "没有数据，禁止进行环比"}
    )
    facts = {
        "月份": month_key,
        "本月统计": stats,
        **comparison,
    }
    previous_errors = None
    previous_output = None

    for _ in range(QUALITY_RETRIES):
        prompt = f"""
请根据事实写一段私人运动月记。

{json.dumps(facts, ensure_ascii=False, indent=2)}

要求：
1. 目标为 90 至 140 个中文字符，写成三到四句，语气平实、具体，最多谈三个重点。
2. 有上月数据才允许环比；没有上月数据时必须只谈本月。
3. 不虚构训练目标，不给 HIIT、减脂或医疗建议。
4. 不把平均心率直接解释为燃脂区间或训练水平。
5. 不使用“表现亮眼、可圈可点、突破极限、继续保持、期待下月”等套话。
6. 允许指出运动偏科、间隔过长或本月很普通，但不要训话。
7. 只返回符合 schema 的 JSON，不要解释。
""".strip()
        if previous_errors:
            prompt += (
                f"\n\n上一次输出：{json.dumps(previous_output, ensure_ascii=False)}"
                f"\n未通过原因：{previous_errors}。针对原因改写；如果太短，"
                "只补充一个已有统计里的观察，不要添加套话。"
            )

        result = call_cloudflare(
            messages=[
                {
                    "role": "system",
                    "content": "你是中文母语的私人运动月记编辑，只基于给定事实写作。",
                },
                {"role": "user", "content": prompt},
            ],
            schema=MONTHLY_SCHEMA,
            temperature=0.2 if previous_errors else 0.4,
            max_tokens=480,
        )
        try:
            return validate_monthly_comment(result.get("comment"))
        except CopyValidationError as error:
            previous_errors = str(error)
            previous_output = normalize_text(result.get("comment"))

    detail = previous_errors or "月报未通过质量检查"
    if previous_output:
        detail += f"；最后输出：{previous_output}"
    raise CopyValidationError(detail)


def update_monthly_insights(activities, monthly_path, metadata_path, metadata):
    if not activities:
        return 0, []

    existing = load_json(monthly_path, dict)
    monthly_inputs = build_monthly_inputs(activities)

    updated = 0
    failures = []
    for month_key, (stats, previous_stats, input_hash) in monthly_inputs.items():
        old_entry = existing.get(month_key, {})
        old_comment = old_entry.get("ai_comment", "")
        stats_changed = old_entry.get("stats") != stats
        needs_comment = (
            stats_changed
            or not normalize_text(old_comment)
            or not metadata_matches(
                metadata["monthly"].get(month_key),
                input_hash,
                MONTHLY_PROMPT_VERSION,
            )
        )

        if not needs_comment:
            continue

        try:
            comment = generate_monthly_comment(month_key, stats, previous_stats)
            existing[month_key] = {
                "month_str": month_key,
                "last_update": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
                "stats": stats,
                "ai_comment": comment,
            }
            metadata["monthly"][month_key] = metadata_entry(
                input_hash,
                MONTHLY_PROMPT_VERSION,
            )
            write_json_atomic(monthly_path, existing)
            write_json_atomic(metadata_path, metadata)
            updated += 1
            print(f"📈 {month_key} 月记已更新")
        except (AIRequestError, AIResponseError, CopyValidationError) as error:
            if stats_changed:
                existing[month_key] = {
                    "month_str": month_key,
                    "last_update": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
                    "stats": stats,
                    "ai_comment": old_comment,
                }
                metadata["monthly"].pop(month_key, None)
                write_json_atomic(monthly_path, existing)
                write_json_atomic(metadata_path, metadata)
            failures.append(f"{month_key}: {error}")
            print(f"⚠️ {month_key} 月记生成失败: {error}")
            if isinstance(error, AIRequestError):
                print("⏸️ AI 服务当前不可用，停止后续月记请求")
                break

    return updated, failures


def activity_needs_copy(item, metadata, input_hash):
    return (
        not normalize_text(item.get("ai_title"))
        or not normalize_text(item.get("ai_comment"))
        or not metadata_matches(
            metadata,
            input_hash,
            ACTIVITY_PROMPT_VERSION,
        )
    )


def iter_activity_contexts(activities):
    for index, item in enumerate(activities):
        older_history = activities[index + 1 :]
        global_previous = older_history[0] if older_history else None
        same_type_previous = next(
            (
                candidate
                for candidate in older_history
                if candidate.get("type") == item.get("type")
            ),
            None,
        )
        facts = build_activity_facts(item, global_previous, same_type_previous)
        yield index, item, facts, activity_input_hash(facts)


def run(args):
    activities_path = Path(args.activities).resolve()
    monthly_path = Path(args.monthly).resolve()
    metadata_path = Path(args.metadata).resolve()
    activities = load_activities(activities_path)
    metadata = load_metadata(metadata_path)
    activity_contexts = list(iter_activity_contexts(activities))
    pending_count = sum(
        activity_needs_copy(
            item,
            metadata["activities"].get(item["source_id"]),
            input_hash,
        )
        for _, item, _, input_hash in activity_contexts
    )
    monthly_inputs = build_monthly_inputs(activities)
    existing_monthly = load_json(monthly_path, dict)
    pending_months = sum(
        existing_monthly.get(month_key, {}).get("stats") != stats
        or not normalize_text(existing_monthly.get(month_key, {}).get("ai_comment"))
        or not metadata_matches(
            metadata["monthly"].get(month_key),
            input_hash,
            MONTHLY_PROMPT_VERSION,
        )
        for month_key, (stats, _, input_hash) in monthly_inputs.items()
    )

    print(
        f"🎯 已读取 {len(activities)} 条运动，待生成活动 {pending_count} 条，"
        f"待生成月记 {pending_months} 个月，模型 {CF_AI_MODEL}，"
        f"提示词 {ACTIVITY_PROMPT_VERSION}/{MONTHLY_PROMPT_VERSION}"
    )

    if args.validate_only:
        return 0

    if not CF_ACCOUNT_ID or not CF_AI_TOKEN:
        print("❌ 缺少 CF_ACCOUNT_ID 或 CF_AI_TOKEN")
        return 2

    activity_failures = []
    generated = 0
    ai_unavailable = False

    valid_source_ids = {item["source_id"] for item in activities}
    metadata["activities"] = {
        source_id: entry
        for source_id, entry in metadata["activities"].items()
        if source_id in valid_source_ids
    }

    for index, item, facts, input_hash in activity_contexts:
        source_id = item["source_id"]
        if not activity_needs_copy(
            item,
            metadata["activities"].get(source_id),
            input_hash,
        ):
            continue
        if args.max_activities and generated >= args.max_activities:
            break

        recent_titles = [
            normalize_text(candidate.get("ai_title"))
            for candidate_index, candidate in enumerate(activities)
            if candidate_index != index and normalize_text(candidate.get("ai_title"))
        ]
        recent_comments = []
        for candidate_index, candidate in enumerate(activities):
            if candidate_index == index:
                continue
            candidate_comment = normalize_text(candidate.get("ai_comment"))
            if not candidate_comment:
                continue
            if STRUCTURAL_ARTIFACT_PATTERN.search(candidate_comment):
                continue
            if any(
                word in candidate_comment for word in UNSUPPORTED_ACTIVITY_CLAIMS
            ):
                continue
            recent_comments.append(candidate_comment)
        time_text = item.get("start_date_local", "未知时间")

        try:
            title, comment = generate_activity_copy(
                item,
                facts,
                recent_titles,
                recent_comments,
            )
            item["ai_title"] = title
            item["ai_comment"] = comment
            metadata["activities"][source_id] = metadata_entry(
                input_hash,
                ACTIVITY_PROMPT_VERSION,
            )
            generated += 1
            write_json_atomic(activities_path, activities)
            write_json_atomic(metadata_path, metadata)
            print(f"✅ {time_text}：{title}")
        except AIRequestError as error:
            activity_failures.append(f"{time_text}: {error}")
            print(f"⚠️ {time_text} 生成失败: {error}")
            print("⏸️ AI 服务当前不可用，停止后续请求，避免重复消耗时间和额度")
            ai_unavailable = True
            break
        except (AIResponseError, CopyValidationError) as error:
            activity_failures.append(f"{time_text}: {error}")
            print(f"⚠️ {time_text} 文案未通过质量检查: {error}")

    monthly_updated = 0
    monthly_failures = []
    if not args.skip_monthly and not ai_unavailable:
        monthly_updated, monthly_failures = update_monthly_insights(
            activities,
            monthly_path,
            metadata_path,
            metadata,
        )

    all_failures = activity_failures + monthly_failures
    print(
        f"✨ 处理完成：活动文案 {generated} 条，月记 {monthly_updated} 个月，"
        f"失败 {len(all_failures)} 项"
    )
    for failure in all_failures:
        print(f"   - {failure}")
    made_progress = generated + monthly_updated > 0
    total_failure = bool(all_failures) and not made_progress
    if all_failures and os.getenv("GITHUB_ACTIONS") == "true":
        annotation = all_failures[0].replace("%", "%25").replace("\r", "%0D")
        annotation = annotation.replace("\n", "%0A")
        level = "error" if total_failure else "warning"
        title = "Activity insights failed" if total_failure else "Activity insights partial"
        print(f"::{level} title={title}::{annotation}")
    return 2 if total_failure else 0


def build_parser():
    parser = argparse.ArgumentParser(description="为运动数据生成中文文案和月记")
    parser.add_argument(
        "--activities",
        default=str(DEFAULT_ACTIVITIES_FILE),
        help="activities.json 路径",
    )
    parser.add_argument(
        "--monthly",
        default=str(DEFAULT_MONTHLY_FILE),
        help="monthly_insights.json 路径",
    )
    parser.add_argument(
        "--metadata",
        default=str(DEFAULT_METADATA_FILE),
        help="AI 增量元数据 JSON 路径",
    )
    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="只验证数据并统计待生成数量，不调用 AI",
    )
    parser.add_argument(
        "--skip-monthly",
        action="store_true",
        help="不处理月记",
    )
    parser.add_argument(
        "--max-activities",
        type=int,
        default=0,
        help="本次最多生成多少条活动；0 表示不限制",
    )
    return parser


if __name__ == "__main__":
    raise SystemExit(run(build_parser().parse_args()))
