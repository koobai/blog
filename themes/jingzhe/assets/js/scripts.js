var body = document.querySelector('body');
var menuTrigger = document.querySelector('#toggle-menu-main-mobile');
var menuContainer = document.querySelector('#menu-main-mobile');
var hamburgerIcon = document.querySelector('.hamburger');

if (menuTrigger !== null) {
  menuTrigger.addEventListener('click', function(e) {
    menuContainer.classList.toggle('open');
    hamburgerIcon.classList.toggle('is-active');
    body.classList.toggle('lock-scroll');
  });
}
// 回到顶部
window.onscroll=function(){(document.body.scrollTop>500||document.documentElement.scrollTop>500)?document.getElementById("gotop").style.display="block":document.getElementById("gotop").style.display="none"};function smoothScrollTop(){var e=null;cancelAnimationFrame(e),e=requestAnimationFrame(function n(){var o=document.body.scrollTop||document.documentElement.scrollTop;o>0?(document.body.scrollTop=document.documentElement.scrollTop=o-150,e=requestAnimationFrame(n)):cancelAnimationFrame(e)})}

// 灯箱调用(首页顶部/Memos页面)
window.ViewImage && ViewImage.init('.photo-home a, .datacont img, .content_zhengwen img, .top-img');

// 导航自动隐藏及显示
const e=document.querySelector(".header-background"),t=window.scrollY,a=200,n=100;let o=0,r=t;window.addEventListener("scroll",()=>{const t=window.scrollY;t>r&&t>a?e.classList.add("hidden"):t<r&&(o+=r-t,o>n&&(e.classList.remove("hidden"),o=0)),r=t})

// 页面下滑加载动画
function animateSummaries() {
  const articles = document.querySelectorAll('.img-hide');

  function animate(article) {
    article.classList.add('fade-in-up'); /* 添加 fade-in-up 类名 */
  }

  const options = {
    rootMargin: '0px 0px -80px 0px', // 元素进入视窗 100px 时触发回调
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        animate(entry.target);
      }
    });
  }, options);

  articles.forEach((article) => {
    observer.observe(article);
  });
}

animateSummaries();

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


function getRandomData() {
  fetch("js/hardware.json")
    .then(response => response.json())
    .then(data => {
      var goods = data.good;
      var randomIndex = Math.floor(Math.random() * goods.length);
      var randomGood = goods[randomIndex];
      document.getElementById("hardware-img").innerHTML = `<img src="${randomGood.image}">`;
      document.getElementById("hardware-jiage").textContent = `购入价格: RMB ${randomGood.jiage}`;
      document.getElementById("hardware-title").innerHTML = `<a href="/hardware">${randomGood.title}</a>`;
      document.getElementById("hardware-note").textContent = randomGood.note;
    });
}

getRandomData();