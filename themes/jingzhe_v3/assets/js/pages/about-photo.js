//头部背景图随机显示
(function() {
  const data = Array.isArray(window.JINGZHE_ABOUT_PHOTOS)
    ? window.JINGZHE_ABOUT_PHOTOS
    : [];

  if (data.length === 0) return;

  const random = data[Math.floor(Math.random() * data.length)];
  const img = document.querySelector('.about-img img');
  const intro = document.querySelector('.about-img-intro');

  if (img && intro) {
    img.src = random.image;
    intro.textContent = random.text;
  }
})();
