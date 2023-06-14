// 首页app模块自动上下滚动

// 获取容器和内容列表
var indexContainer = document.querySelector('.app-gundong');
var appList = document.querySelector('.app-list');

// 复制内容列表，使其重复滚动
appList.innerHTML += appList.innerHTML;

// 动态计算滚动的高度
var listItemHeight = appList.children[0].offsetHeight;
var totalHeight = appList.children.length * listItemHeight;

// 设置容器的高度和滚动速度
indexContainer.style.height = listItemHeight + 'px';
appList.style.animationDuration = (totalHeight / 25) + 's';


// 首页好物随机调用显示
function getRandomData() {
  fetch("/suju/hardware.json")
    .then(response => response.json())
    .then(data => {
      var goods = data.good;
      var randomIndex = Math.floor(Math.random() * goods.length);
      var randomGood = goods[randomIndex];
      document.getElementById("hardware-img").innerHTML = `<img src="${randomGood.image}">`;
      document.getElementById("hardware-jiage").textContent = `购入价格: RMB ${randomGood.jiage}`;
      document.getElementById("hardware-title").innerHTML = `${randomGood.title}`;
      document.getElementById("hardware-note").textContent = randomGood.note;
    });
}

getRandomData();


//首页memos随机头像
function getRandomImage() {
  fetch('/suju/about.json')
    .then(response => response.json())
    .then(data => {
      var imagePaths = data.map(item => item.image_path);

      var imgElements = document.querySelectorAll('.memoImage');
      imgElements.forEach(imgElement => {
        var randomImagePath = imagePaths[Math.floor(Math.random() * imagePaths.length)];
        imgElement.setAttribute('src', randomImagePath);
      });
    })
    .catch(error => {
      console.error('Error:', error);
    });
}

window.onload = getRandomImage;
