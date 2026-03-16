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

# 辅助函数：将中文季数转为阿拉伯数字
def chn_to_arabic(chn_str):
    chn_num = {'一':1, '二':2, '三':3, '四':4, '五':5, '六':6, '七':7, '八':8, '九':9, '十':10}
    if chn_str.isdigit(): return int(chn_str)
    if len(chn_str) == 1: return chn_num.get(chn_str, 1)
    if len(chn_str) == 2 and chn_str[0] == '十': return 10 + chn_num.get(chn_str[1], 0)
    return 1

# 核心处理函数（增量更新，纯净数据）
def process_movie(row):
    title = row.get('title')
    douban_id = row.get('id')
    csv_year = row.get('year')

    if not title or not douban_id:
        return

    file_id = str(douban_id)
    webp_name = f"{file_id}.webp"

    # 1. 极速增量检查：如果又拍云有了，瞬间跳过，绝不浪费 TMDB API (这就是最强的缓存！)
    upyun_url = f"https://img.koobai.com/movie/{webp_name}"
    try:
        req = urllib.request.Request(upyun_url, method='HEAD')
        urllib.request.urlopen(req, timeout=3)
        return 
    except:
        pass 

    # 2. 提取“第几季”并清洗标题
    season_match = re.search(r'\s*第([一二三四五六七八九十\d]+)季', title)
    season_num = chn_to_arabic(season_match.group(1)) if season_match else None
    clean_title = re.sub(r'\s*第[一二三四五六七八九十\d]+季.*', '', title).strip()

    # 🚀 优化 3：构建搜索策略（加入主副标题 Fallback 机制）
    search_queries = [clean_title]
    if '：' in clean_title or ':' in clean_title:
        main_title = re.split(r'[:：]', clean_title)[0].strip()
        if main_title:
            search_queries.append(main_title)

    best_item = None

    # 开始执行带兜底的搜索循环
    for search_title in search_queries:
        if best_item: break # 如果上一次已经搜到了，直接跳出兜底循环
        
        print(f"🔍 准备搜索: {search_title} " + (f"(第{season_num}季)" if season_num else "") + (f" [{csv_year}]" if csv_year else ""))
        query = urllib.parse.quote(search_title)
        tmdb_api = f"https://api.themoviedb.org/3/search/multi?api_key={TMDB_API_KEY}&query={query}&language=zh-CN"
        
        try:
            res = urllib.request.urlopen(tmdb_api, timeout=5)
            data = json.loads(res.read())
            
            # 优先匹配带年份的
            for item in data.get('results', []):
                media_type = item.get('media_type')
                if media_type not in ['movie', 'tv'] or not item.get('poster_path'):
                    continue
                    
                item_year_str = item.get('release_date') if media_type == 'movie' else item.get('first_air_date')
                item_year = int(item_year_str[:4]) if (item_year_str and len(item_year_str) >= 4) else None

                is_match = True
                
                # 🚀 优化 2：极其稳健的年份比对逻辑 (安全捕获异常)
                if media_type == 'movie' and csv_year and item_year:
                    try:
                        is_match = abs(int(csv_year) - item_year) <= 1
                    except ValueError:
                        is_match = True # 如果年份不是合法数字，放宽条件直接过

                if is_match:
                    best_item = item
                    break

            # 如果按年份没匹配上，退一步直接拿第一个有海报的
            if not best_item:
                for item in data.get('results', []):
                    if item.get('poster_path'):
                        best_item = item
                        break
        except Exception as e:
            print(f"⚠️ 搜索请求异常 [{search_title}]: {e}")
            continue

    # 如果所有策略都跑完还是没有，放弃
    if not best_item:
        print(f"❌ TMDB 暂无【{clean_title}】的海报，跳过")
        return

    # 3. 提取海报并下载
    try:
        poster_path = best_item.get('poster_path')
        tmdb_id = best_item.get('id')
        media_type = best_item.get('media_type')

        # 剧集专属海报抓取
        if media_type == 'tv' and season_num:
            tv_api = f"https://api.themoviedb.org/3/tv/{tmdb_id}?api_key={TMDB_API_KEY}&language=zh-CN"
            try:
                tv_res = urllib.request.urlopen(tv_api, timeout=5)
                tv_data = json.loads(tv_res.read())
                for season in tv_data.get('seasons', []):
                    if season.get('season_number') == season_num and season.get('poster_path'):
                        poster_path = season.get('poster_path')
                        print(f"🎯 成功匹配到专属海报: 《{clean_title}》第 {season_num} 季")
                        break
            except Exception as tv_e:
                print(f"⚠️ 抓取特定季数海报失败，使用剧集默认海报: {tv_e}")

        # 开始下载 TMDB 原图并转换 WebP
        tmdb_img_url = f"https://image.tmdb.org/t/p/w500{poster_path}"
        img_data = urllib.request.urlopen(tmdb_img_url, timeout=10).read()
        
        image = Image.open(BytesIO(img_data)).convert("RGB")
        
        # 🚀 优化 1：Google 官方推荐的最佳 WebP 压缩参数（体积更小，画质不损）
        image.save(f"temp_posters/{webp_name}", "WEBP", quality=82, method=6)
        print(f"✅ 下载并转换成功: {webp_name}")
        
    except Exception as e:
        print(f"❌ 处理失败 {clean_title}: {e}")

if __name__ == "__main__":
    # ==========================================
    # 步骤 A：拦截并瘦身豆瓣原始 JSON
    # ==========================================
    with open('assets/movie.json', 'r', encoding='utf-8') as f:
        raw_data = json.load(f)

    clean_movies = []
    
    for item in raw_data:
        subject = item.get('subject', {})
        
        personal_rating = 0
        if item.get('rating'):
            personal_rating = item['rating'].get('value', 0)

        pubdate = subject.get('pubdate', [])
        pub_year = ""
        if pubdate:
            year_match = re.search(r'(\d{4})', pubdate[0])
            if year_match:
                pub_year = year_match.group(1)
        elif subject.get('year'):
            pub_year = subject.get('year')

        clean_item = {
            "id": subject.get('id', ''),
            "type": subject.get('type', ''),
            "title": subject.get('title', ''),
            "year": pub_year,
            "rating": personal_rating,
            "comment": item.get('comment', ''),
            "link": subject.get('url', ''),
            "create_time": item.get('create_time', ''),
            "color_scheme": subject.get('color_scheme', {})
        }
        
        if clean_item['id'] and clean_item['title']:
            clean_movies.append(clean_item)

    with open('assets/movie.json', 'w', encoding='utf-8') as f:
        json.dump(clean_movies, f, ensure_ascii=False, indent=2)
    
    print(f"✨ 数据瘦身完成！共保留 {len(clean_movies)} 条纯净数据。")

    # ==========================================
    # 步骤 B：执行 TMDB 海报处理
    # ==========================================
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        executor.map(process_movie, clean_movies)