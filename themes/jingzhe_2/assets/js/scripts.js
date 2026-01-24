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
window.ViewImage && ViewImage.init('.content_zhengwen img, .top-img,.gallery-thumbnail img,.posts_photo a,.photo-moment a');

// 页面上滑加载动画
function animateSummaries() {
  const articles = document.querySelectorAll('.img-hide,.retu-hide'); // 包含新的类
  const shuffledArticles = Array.from(articles).sort(() => Math.random() - 0.5);

  function animate(article, delay) {
    setTimeout(() => {
      article.classList.add('visible');
    }, delay);
  }

  const options = {
    rootMargin: '0px 0px -70px 0px',
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, index) => {
      if (entry.isIntersecting) {
         // 类名 retu-hide 延迟 100 默认 img-hide 延迟 8，实现错落效果
        const delay = entry.target.classList.contains('retu-hide') ? index * 100 : index * 8; 
        animate(entry.target, delay);
        observer.unobserve(entry.target);
      }
    });
  }, options);

  shuffledArticles.forEach((article) => {
    observer.observe(article);
  });
}

animateSummaries();