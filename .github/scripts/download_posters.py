import pandas as pd
import requests
import os
import time

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Referer': 'https://movie.douban.com/'
}

def download_posters():
    csv_path = 'assets/movie.csv'
    poster_dir = 'img_repo/douban'
    
    if not os.path.exists(poster_dir):
        os.makedirs(poster_dir)

    df = pd.read_csv(csv_path)
    
    for index, row in df.iterrows():
        img_url = str(row['poster'])
        if "nan" in img_url or not img_url.startswith('http'):
            continue
            
        # --- 修复逻辑：还原镜像站链接为豆瓣原链接 ---
        if "lithub.cc" in img_url:
            movie_id = img_url.split('/')[-1].replace('.jpg', '')
            # 注意：豆瓣原图通常需要在 ID 前加个 'p'
            img_url = f"https://img1.doubanio.com/view/photo/l/public/p{movie_id}.jpg"
        
        img_name = img_url.split('/')[-1].split('?')[0]
        save_path = os.path.join(poster_dir, img_name)

        if os.path.exists(save_path):
            df.at[index, 'poster'] = f"douban/{img_name}"
            continue

        try:
            print(f"正在尝试下载: {img_url}")
            r = requests.get(img_url, headers=HEADERS, timeout=15)
            if r.status_code == 200:
                with open(save_path, 'wb') as f:
                    f.write(r.content)
                df.at[index, 'poster'] = f"douban/{img_name}"
                print(f"✅ 下载成功: {img_name}")
                time.sleep(1) 
            else:
                print(f"❌ 下载失败，状态码: {r.status_code} URL: {img_url}")
        except Exception as e:
            print(f"⚠️ 出错: {e}")

    df.to_csv(csv_path, index=False)

if __name__ == "__main__":
    download_posters()
