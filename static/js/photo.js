const getRandomImages = (arr, num) => {
  const randomIndices = new Set();
  while (randomIndices.size < num) {
    randomIndices.add(Math.floor(Math.random() * arr.length));
  }
  return Array.from(randomIndices).map(randomIndex => {
    const { img, imgSmall, title } = arr[randomIndex];
    return { img, imgSmall, title };
  });
};

const insertRandomImages = images => {
  const photoHome = document.querySelector('.photo-home');
  images.forEach(({ img, imgSmall, title }) => {
    const photoHtml = `
      <div class="photo-home-top">
        <a href="${img}">
          <img src="${imgSmall}" alt="${title}">
        </a>
        <span class="photo-home-title">${title}</span>
      </div>
    `;
    photoHome.insertAdjacentHTML('beforeend', photoHtml);

  });
};

fetch('/suju/photo.json')
  .then(response => response.json())
  .then(data => {
    insertRandomImages(getRandomImages(data, 3));
  })
  .catch(error => {
    console.error('无法加载 photo.json 文件:', error);
  });

// 唠叨博文菜单切换js

// 在页面加载时执行一次showContent，根据默认显示的内容设置初始菜单项颜色
document.addEventListener("DOMContentLoaded", function () {
  showContent('1');
});
function showContent(contentId) {
  // 隐藏所有内容块
  var contents = document.querySelectorAll('.index-article-page');
  contents.forEach(function (content) {
    content.classList.remove('index-article-memos', 'index-menu-current');
  });
  // 显示指定的内容块
  var selectedContent = document.getElementById('index-article-page' + contentId);
  selectedContent.classList.add('index-article-memos');
  // 设置菜单项颜色
  var menuItems = document.querySelectorAll('.index-menu-tab');
  menuItems.forEach(function (menuItem) {
    menuItem.classList.remove('index-menu-current');
  });
  var selectedMenuItem = document.querySelector('[onclick="showContent(\'' + contentId + '\')"]');
  selectedMenuItem.classList.add('index-menu-current');
}