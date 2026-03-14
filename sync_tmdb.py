import csv
import urllib.request
import urllib.parse
import json
import os
import re  # 🚀 新增：正则表达式库
from io import BytesIO
from PIL import Image

TMDB_API_KEY = os.environ.get("TMDB_API_KEY")
os.makedirs('temp_posters', exist_ok=True)

with open('assets/movie.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        title = row.get('title')
        douban_poster = row.get('poster')
        if not title or not douban_poster:
            continue

        # 提取豆瓣原本的图片ID
        file_id = douban_poster.split('/')[-1].split('.')[0]
        webp_name = f"{file_id}.webp"

        # 1. 检查又拍云是否已有该图片
        upyun_url = f"https://img.koobai.com/movie/{webp_name}"
        try:
            req = urllib.request.Request(upyun_url, method='HEAD')
            urllib.request.urlopen(req)
            continue # 已存在，直接跳过
        except:
            pass 

        # 🚀 2. 黑魔法：清洗剧集名称
        # 把 "曼达洛人 第三季" 变成 "曼达洛人"
        # 把 "黄石 第五季" 变成 "黄石"
        clean_title = re.sub(r'\s*第[一二三四五六七八九十\d]+季.*', '', title).strip()

        print(f"🔍 原标题: {title} | 实际搜索词: {clean_title}")
        query = urllib.parse.quote(clean_title)
        
        # 调用 TMDB multi 搜索接口
        tmdb_api = f"https://api.themoviedb.org/3/search/multi?api_key={TMDB_API_KEY}&query={query}&language=zh-CN"
        
        try:
            res = urllib.request.urlopen(tmdb_api)
            data = json.loads(res.read())
            
            if data['results'] and data['results'][0].get('poster_path'):
                poster_path = data['results'][0]['poster_path']
                tmdb_img_url = f"https://image.tmdb.org/t/p/w500{poster_path}"
                
                print(f"⬇️ 找到海报，正在下载并转换为真正的 WebP: {webp_name}")
                img_data = urllib.request.urlopen(tmdb_img_url).read()
                
                image = Image.open(BytesIO(img_data))
                image.save(f"temp_posters/{webp_name}", "WEBP", quality=85)
                print("✅ 转换保存成功！")
            else:
                print(f"⚠️ TMDB 暂无【{clean_title}】的海报，跳过。")
        except Exception as e:
            print(f"❌ 搜索或下载失败 {clean_title}: {e}")