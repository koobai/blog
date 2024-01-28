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
window.ViewImage && ViewImage.init('.photo-home a, .content_zhengwen img, .top-img,.gallery-thumbnail img,.posts_photo a,.photo-moment a');

// 页面上滑加载动画
function animateSummaries() {
  const articles = document.querySelectorAll('.img-hide');
  const shuffledArticles = Array.from(articles).sort(() => Math.random() - 0.5);

  function animate(article, delay) {
    setTimeout(() => {
      article.classList.add('visible');
    }, delay);
  }

  const options = {
    rootMargin: '0px 0px -80px 0px',
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, index) => {
      if (entry.isIntersecting) {
        animate(entry.target, index * 8); // 添加延迟，实现错落效果
        observer.unobserve(entry.target); // 动画触发后停止观察
      }
    });
  }, options);

  shuffledArticles.forEach((article) => {
    observer.observe(article);
  });
}

animateSummaries();