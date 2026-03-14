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

def process_movie(row):
    title = row.get('title')
    douban_poster = row.get('poster')
    if not title or not douban_poster:
        return

    # 提取豆瓣 ID 作为唯一标识
    file_id = douban_poster.split('/')[-1].split('.')[0]
    webp_name = f"{file_id}.webp"

    # 1. 极速增量检查 (坚决保留 HEAD，省流量省时间)
    upyun_url = f"https://img.koobai.com/movie/{webp_name}"
    try:
        req = urllib.request.Request(upyun_url, method='HEAD')
        urllib.request.urlopen(req, timeout=3)
        return # 图片已存在，瞬间跳过
    except:
        pass 

    # 2. 剧集名称清洗 (保留 .* 以彻底剔除 TMDB 无法识别的杂乱后缀)
    clean_title = re.sub(r'\s*第[一二三四五六七八九十\d]+季.*', '', title).strip()
    print(f"🔍 准备搜索: {clean_title}")
    
    query = urllib.parse.quote(clean_title)
    tmdb_api = f"https://api.themoviedb.org/3/search/multi?api_key={TMDB_API_KEY}&query={query}&language=zh-CN"
    
    try:
        res = urllib.request.urlopen(tmdb_api, timeout=5)
        data = json.loads(res.read())
        
        # 🚀 吸收建议一：遍历寻找第一张存在的图片，提高命中率
        poster_path = None
        for item in data.get('results', []):
            if item.get('poster_path'):
                poster_path = item['poster_path']
                break
                
        if not poster_path:
            print(f"⚠️ TMDB 暂无【{clean_title}】的海报，跳过")
            return

        tmdb_img_url = f"https://image.tmdb.org/t/p/w500{poster_path}"
        img_data = urllib.request.urlopen(tmdb_img_url, timeout=10).read()
        
        # 🚀 吸收建议二：强转 RGB，防止 RGBA/P 模式导致 WebP 转换崩溃
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