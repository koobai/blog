import urllib.request
import urllib.parse
import json
import os
import re
import time
import random
from io import BytesIO
from PIL import Image
import concurrent.futures

# ====== 核心配置区 ======
DOUBAN_ID = "jnnsu" # 你的豆瓣 ID
TMDB_API_KEY = os.environ.get("TMDB_API_KEY")
os.makedirs('temp_posters', exist_ok=True)
# ========================

def chn_to_arabic(chn_str):
    chn_num = {'一':1, '二':2, '三':3, '四':4, '五':5, '六':6, '七':7, '八':8, '九':9, '十':10}
    if chn_str.isdigit(): return int(chn_str)
    if len(chn_str) == 1: return chn_num.get(chn_str, 1)
    if len(chn_str) == 2 and chn_str[0] == '十': return 10 + chn_num.get(chn_str[1], 0)
    return 1

# 处理单部电影的 TMDB 海报抓取
def fetch_tmdb_poster(movie):
    title = movie.get('title')
    file_id = str(movie.get('id'))
    csv_year = movie.get('year')
    webp_name = f"{file_id}.webp"

    # 1. 极速跳过又拍云已有海报
    upyun_url = f"https://img.koobai.com/movie/{webp_name}"
    try:
        req = urllib.request.Request(upyun_url, method='HEAD')
        urllib.request.urlopen(req, timeout=3)
        return 
    except:
        pass 

    season_match = re.search(r'\s*第([一二三四五六七八九十\d]+)季', title)
    season_num = chn_to_arabic(season_match.group(1)) if season_match else None
    clean_title = re.sub(r'\s*第[一二三四五六七八九十\d]+季.*', '', title).strip()

    search_queries = [clean_title]
    if '：' in clean_title or ':' in clean_title:
        main_title = re.split(r'[:：]', clean_title)[0].strip()
        if main_title:
            search_queries.append(main_title)

    best_item = None

    for search_title in search_queries:
        if best_item: break 
        
        print(f"🔍 搜海报: {search_title} " + (f"[{csv_year}]" if csv_year else ""))
        query = urllib.parse.quote(search_title)
        tmdb_api = f"https://api.themoviedb.org/3/search/multi?api_key={TMDB_API_KEY}&query={query}&language=zh-CN"
        
        try:
            res = urllib.request.urlopen(tmdb_api, timeout=5)
            data = json.loads(res.read())
            
            for item in data.get('results', []):
                media_type = item.get('media_type')
                if media_type not in ['movie', 'tv'] or not item.get('poster_path'):
                    continue
                    
                item_year_str = item.get('release_date') if media_type == 'movie' else item.get('first_air_date')
                item_year = int(item_year_str[:4]) if (item_year_str and len(item_year_str) >= 4) else None

                is_match = True
                if media_type == 'movie' and csv_year and item_year:
                    try:
                        is_match = abs(int(csv_year) - item_year) <= 1
                    except ValueError:
                        is_match = True 

                if is_match:
                    best_item = item
                    break

            if not best_item:
                for item in data.get('results', []):
                    if item.get('poster_path'):
                        best_item = item
                        break
        except Exception as e:
            continue

    if not best_item:
        print(f"❌ TMDB 无海报，跳过: {clean_title}")
        return

    try:
        poster_path = best_item.get('poster_path')
        tmdb_id = best_item.get('id')
        media_type = best_item.get('media_type')

        if media_type == 'tv' and season_num:
            tv_api = f"https://api.themoviedb.org/3/tv/{tmdb_id}?api_key={TMDB_API_KEY}&language=zh-CN"
            try:
                tv_res = urllib.request.urlopen(tv_api, timeout=5)
                tv_data = json.loads(tv_res.read())
                for season in tv_data.get('seasons', []):
                    if season.get('season_number') == season_num and season.get('poster_path'):
                        poster_path = season.get('poster_path')
                        break
            except:
                pass

        tmdb_img_url = f"https://image.tmdb.org/t/p/w500{poster_path}"
        img_data = urllib.request.urlopen(tmdb_img_url, timeout=10).read()
        
        image = Image.open(BytesIO(img_data)).convert("RGB")
        image.save(f"temp_posters/{webp_name}", "WEBP", quality=82, method=6)
        print(f"✅ 下载成功: {webp_name}")
        
    except Exception as e:
        print(f"❌ 海报处理失败 {clean_title}: {e}")


if __name__ == "__main__":
    # 1. 加载本地已有数据
    local_file = 'assets/movie.json'
    os.makedirs(os.path.dirname(local_file), exist_ok=True)
    
    try:
        with open(local_file, 'r', encoding='utf-8') as f:
            local_movies = json.load(f)
    except:
        local_movies = []

    # 提取已存在的电影 ID，用于秒级排重断点
    existing_ids = {str(m.get('id')) for m in local_movies if m.get('id')}
    
    new_movies = []
    
    # ====== 🚀 核心更新：智能分页循环抓取 ======
    start = 0
    count = 50
    is_incremental_done = False # 增量断点标记

    print(f"📡 开始直连豆瓣 API 获取【{DOUBAN_ID}】的观影记录...")

    while not is_incremental_done:
        print(f"🔄 正在拉取第 {start} 到 {start + count} 条记录...")
        douban_api = f"https://m.douban.com/rexxar/api/v2/user/{DOUBAN_ID}/interests?type=movie&status=done&start={start}&count={count}"
        
        req = urllib.request.Request(douban_api, headers={
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
            'Referer': f'https://m.douban.com/people/{DOUBAN_ID}/interests',
            'Accept': 'application/json',
            'Connection': 'keep-alive'
        })

        try:
            res = urllib.request.urlopen(req, timeout=10)
            data = json.loads(res.read())
            interests = data.get('interests', [])
            
            if not interests:
                print("✅ 已经拉取到豆瓣尽头，抓取结束。")
                break
            
            for item in interests:
                subject = item.get('subject', {})
                douban_id = str(subject.get('id', ''))
                
                # ✨ 增量魔法：如果这条记录本地已经有了，说明后面的全都有了，直接刹车！
                if douban_id and douban_id in existing_ids:
                    print(f"🛑 遇到已存在的记录《{subject.get('title')}》，停止向后翻页。")
                    is_incremental_done = True
                    break
                    
                print(f"✨ 新发现: 《{subject.get('title', '未知')}》")

                # 清洗数据
                personal_rating = 0
                rating_data = item.get('rating')
                if isinstance(rating_data, dict):
                    personal_rating = rating_data.get('value', 0)
                elif isinstance(rating_data, (int, float)):
                    personal_rating = int(rating_data)

                pubdate = subject.get('pubdate', [])
                pub_year = ""
                if pubdate:
                    year_match = re.search(r'(\d{4})', pubdate[0])
                    if year_match:
                        pub_year = year_match.group(1)
                elif subject.get('year'):
                    pub_year = subject.get('year')

                clean_item = {
                    "id": douban_id,
                    "type": subject.get('type', ''),
                    "title": subject.get('title', ''),
                    "year": pub_year,
                    "rating": personal_rating,
                    "comment": item.get('comment', ''),
                    "link": subject.get('url', ''),
                    "create_time": item.get('create_time', ''),
                    "color_scheme": subject.get('color_scheme', {})
                }
                new_movies.append(clean_item)
                
            # 准备翻下一页
            start += count
            
            # 贴心防风控：每次翻页休息 1.5 到 3 秒，防止豆瓣封杀 IP
            if not is_incremental_done:
                time.sleep(random.uniform(1.5, 3.0))
                
        except Exception as e:
            print(f"❌ 请求豆瓣 API 失败: {e}")
            break

    # 3. 数据保存与海报抓取
    if new_movies:
        print(f"🎉 成功拉取到 {len(new_movies)} 条新记录！开始匹配海报...")
        final_movies = new_movies + local_movies
        
        # 覆写统一的 movie.json！
        with open(local_file, 'w', encoding='utf-8') as f:
            json.dump(final_movies, f, ensure_ascii=False, indent=2)
            
        # 多线程处理海报
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            executor.map(fetch_tmdb_poster, new_movies)
    else:
        print("☕ 没有新记录，本地已是最新。")

    # 4. 吹哨人逻辑 (控制 Action 步骤跳过)
    downloaded_count = len(os.listdir('temp_posters'))
    github_env = os.environ.get('GITHUB_ENV')
    if github_env:
        with open(github_env, 'a') as f:
            f.write(f"HAS_NEW_POSTERS={'true' if downloaded_count > 0 else 'false'}\n")
            f.write(f"HAS_NEW_DATA={'true' if new_movies else 'false'}\n")