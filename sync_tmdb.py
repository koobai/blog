import csv
import urllib.request
import urllib.parse
import json
import os
import re
from io import BytesIO
from PIL import Image
import concurrent.futures

TMDB_API_KEY = os.environ.get("TMDB_API_KEY")
os.makedirs('temp_posters', exist_ok=True)

# 辅助函数：将中文季数转为阿拉伯数字（第一季 -> 1，第十一季 -> 11）
def chn_to_arabic(chn_str):
    chn_num = {'一':1, '二':2, '三':3, '四':4, '五':5, '六':6, '七':7, '八':8, '九':9, '十':10}
    if chn_str.isdigit(): return int(chn_str)
    if len(chn_str) == 1: return chn_num.get(chn_str, 1)
    if len(chn_str) == 2 and chn_str[0] == '十': return 10 + chn_num.get(chn_str[1], 0)
    return 1

def process_movie(row):
    title = row.get('title')
    douban_poster = row.get('poster')
    pubdate = row.get('pubdate', '')  # 例如：2026-01-23(中国大陆)

    if not title or not douban_poster:
        return

    # 提取豆瓣 ID 作为唯一标识
    file_id = douban_poster.split('/')[-1].split('.')[0]
    webp_name = f"{file_id}.webp"

    # 1. 极速增量检查
    upyun_url = f"https://img.koobai.com/movie/{webp_name}"
    try:
        req = urllib.request.Request(upyun_url, method='HEAD')
        urllib.request.urlopen(req, timeout=3)
        return # 图片已存在，瞬间跳过
    except:
        pass 

    # 2. 提取“第几季”并转换为数字
    season_match = re.search(r'\s*第([一二三四五六七八九十\d]+)季', title)
    season_num = chn_to_arabic(season_match.group(1)) if season_match else None

    # 清洗标题用于搜索
    clean_title = re.sub(r'\s*第[一二三四五六七八九十\d]+季.*', '', title).strip()

    # 3. 提取上映年份 (例如从 2026-01-23 中提取 2026)
    csv_year = None
    year_match = re.search(r'(\d{4})', pubdate)
    if year_match:
        csv_year = int(year_match.group(1))

    print(f"🔍 准备搜索: {clean_title} " + (f"(第{season_num}季)" if season_num else "") + (f" [{csv_year}]" if csv_year else ""))
    
    query = urllib.parse.quote(clean_title)
    tmdb_api = f"https://api.themoviedb.org/3/search/multi?api_key={TMDB_API_KEY}&query={query}&language=zh-CN"
    
    try:
        res = urllib.request.urlopen(tmdb_api, timeout=5)
        data = json.loads(res.read())
        
        best_item = None
        
        # 🚀 优化：年份精准校验 & 寻找最佳匹配
        for item in data.get('results', []):
            media_type = item.get('media_type')
            if media_type not in ['movie', 'tv'] or not item.get('poster_path'):
                continue
                
            item_year_str = item.get('release_date') if media_type == 'movie' else item.get('first_air_date')
            item_year = int(item_year_str[:4]) if (item_year_str and len(item_year_str) >= 4) else None

            # 电影严格校验年份 (允许1年误差，处理国内晚上映的情况)
            # 剧集不强校验年份 (因为TMDB的年份是第一季首播年份，而豆瓣可能是第三季的年份)
            is_match = True
            if media_type == 'movie' and csv_year and item_year:
                is_match = abs(csv_year - item_year) <= 1

            if is_match:
                best_item = item
                break

        # 兜底：如果年份严格校验没找到，就取默认第一个带海报的
        if not best_item:
            for item in data.get('results', []):
                if item.get('poster_path'):
                    best_item = item
                    break
                
        if not best_item:
            print(f"⚠️ TMDB 暂无【{clean_title}】的海报，跳过")
            return

        poster_path = best_item.get('poster_path')
        tmdb_id = best_item.get('id')
        media_type = best_item.get('media_type')

        # 🚀 史诗级优化：如果是剧集，且我们知道是第几季，去精准抓取该季海报！
        if media_type == 'tv' and season_num:
            tv_api = f"https://api.themoviedb.org/3/tv/{tmdb_id}?api_key={TMDB_API_KEY}&language=zh-CN"
            try:
                tv_res = urllib.request.urlopen(tv_api, timeout=5)
                tv_data = json.loads(tv_res.read())
                for season in tv_data.get('seasons', []):
                    # 匹配对应季数
                    if season.get('season_number') == season_num and season.get('poster_path'):
                        poster_path = season.get('poster_path')
                        print(f"🎯 成功匹配到专属海报: 《{clean_title}》第 {season_num} 季")
                        break
            except Exception as tv_e:
                print(f"⚠️ 抓取特定季数海报失败，使用剧集默认海报: {tv_e}")

        # 开始下载和转换
        tmdb_img_url = f"https://image.tmdb.org/t/p/w500{poster_path}"
        img_data = urllib.request.urlopen(tmdb_img_url, timeout=10).read()
        
        image = Image.open(BytesIO(img_data)).convert("RGB")
        image.save(f"temp_posters/{webp_name}", "WEBP", quality=85)
        print(f"✅ 下载并转换成功: {webp_name}")
        
    except Exception as e:
        print(f"❌ 处理失败 {clean_title}: {e}")

with open('assets/movie.csv', 'r', encoding='utf-8') as f:
    movies = list(csv.DictReader(f))

# 保持 10 个线程，足够快且绝不会触发 TMDB/又拍云 风控限制
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
    executor.map(process_movie, movies)