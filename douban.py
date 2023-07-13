import requests
import json
import os
import csv
save_folder = './static/images/douban/'

# Json 和 CSV 文件和.github\workflows\douban.yml保持一致
# 只能二选一，不用的那个留空，否则会报错

# 如果是 Json 文件使用下面这一行
json_file_path = ''
# json_file_path = ''

# 如果是 CSV 文件使用下面这一行
# csv_file_path = './data/douban/movie.csv'
csv_file_path = './data/douban/movie.csv'

def dowoloadFile(image_url):
  # 确保文件夹路径存在
  os.makedirs(save_folder, exist_ok=True)
  if image_url.startswith("https://") and "koobai.com" in image_url:
    # 请求头
    headers = {
    'Referer': 'https://koobai.com'
    } 
  else:
    headers = {
    'Referer': 'https://doubanio.com'
    }
  response = requests.get(image_url, headers=headers, timeout=10)
  file_name = image_url.split('/')[-1]
  save_path = os.path.join(save_folder, file_name)
  if os.path.exists(save_path):
    print('文件已存在')
  else:
    print('文件不存在')
    with open(save_path, 'wb') as file:
      file.write(response.content)
    print(f'图片已保存为 {file_name}')


if(json_file_path):
  print('我是Json文件，开始执行。。。。。')
  with open(json_file_path, 'r', encoding='utf-8') as file:
    data_json = json.load(file)
  # 提取URL字段的值
  for i in data_json:
    image_url = i['subject']['cover_url']
    dowoloadFile(image_url)
else:
  print('我是CSV文件，开始执行。。。。。')
  data_csv = []  # 存储数据的列表
  with open(csv_file_path, 'r', encoding='utf-8') as file:
      csv_reader = csv.reader(file)  # 创建 CSV 读取器对象
      next(csv_reader)  # 跳过标题行
      for row in csv_reader:  # 逐行读取数据
          data_csv.append(row)  # 将每行数据添加到列表中
  # 打印数据
  for row in data_csv:
    image_url = row[3]
    dowoloadFile(image_url)
