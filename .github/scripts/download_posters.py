import pandas as pd
import requests
import os
import time

# 伪装请求头，绕过豆瓣防盗链检测
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Referer': 'https://movie.douban.com/'
}

def download_posters():
    csv_path = 'assets/movie.csv'
    # 路径指向待会儿 Actions 克隆下来的 img 仓库子目录
    poster_dir = 'img_repo/douban'
    
    if not os.path.exists(poster_dir):
        os.makedirs(poster_dir)

    if not os.path.exists(csv_path):
        print("❌ 未发现 movie.csv 文件")
        return

    # 读取 CSV 数据
    df = pd.read_csv(csv_path)
    
    for index, row in df.iterrows():
        img_url = row['poster']
        if pd.isna(img_url) or not str(img_url).startswith('http'):
            continue
            
        # 提取文件名，例如 35774681.jpg
        img_name = img_url.split('/')[-1].split('?')[0]
        save_path = os.path.join(poster_dir, img_name)

        # 【核心逻辑】如果图片已存在，更新路径并跳过下载
        if os.path.exists(save_path):
            # 先将 CSV 路径改为你以后服务器上的预定路径（此处建议先设为相对路径）
            df.at[index, 'poster'] = f"douban/{img_name}"
            continue

        try:
            print(f"正在下载新海报: {img_name}")
            r = requests.get(img_url, headers=HEADERS, timeout=15)
            if r.status_code == 200:
                with open(save_path, 'wb') as f:
                    f.write(r.content)
                df.at[index, 'poster'] = f"douban/{img_name}"
                time.sleep(1) # 礼貌下载
            else:
                print(f"❌ 下载失败: {img_url} (状态码: {r.status_code})")
        except Exception as e:
            print(f"⚠️ 下载过程中出错: {e}")

    # 保存修改后的 CSV，这样你的博客就知道去哪找图了
    df.to_csv(csv_path, index=False)
    print("✅ CSV 数据和图片同步逻辑处理完成！")

if __name__ == "__main__":
    download_posters()
