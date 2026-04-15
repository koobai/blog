import urllib.request
import json
import os
import re
import time
import random

# ====== 核心配置区 ======
DOUBAN_ID = "jnnsu" # 你的豆瓣 ID
# ========================

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

    # 3. 数据保存
    if new_movies:
        print(f"🎉 成功拉取到 {len(new_movies)} 条新记录！保存到本地...")
        final_movies = new_movies + local_movies
        
        # 覆写统一的 movie.json
        with open(local_file, 'w', encoding='utf-8') as f:
            json.dump(final_movies, f, ensure_ascii=False, indent=2)
    else:
        print("☕ 没有新记录，本地已是最新。")

    # 4. 吹哨人逻辑 (控制 GitHub Action 步骤)
    github_env = os.environ.get('GITHUB_ENV')
    if github_env:
        with open(github_env, 'a') as f:
            # 现在只需要告诉 Action 是否有新数据需要提交即可
            f.write(f"HAS_NEW_DATA={'true' if new_movies else 'false'}\n")