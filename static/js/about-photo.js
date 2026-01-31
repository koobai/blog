//头部背景图随机显示
(function() {
  const data = [
    { text: '拍摄于杭州西湖', image: 'https://img.koobai.com/about.webp' },
    { text: '拍摄于北京长城', image: 'https://img.koobai.com/about-beij.webp' },
    { text: '拍摄于杭州千岛湖', image: 'https://img.koobai.com/about-qdh.webp' }
  ];

  const random = data[Math.floor(Math.random() * data.length)];
  const img = document.querySelector('.about-img img');
  const intro = document.querySelector('.about-img-intro');

  if (img && intro) {
    img.src = random.image;
    intro.textContent = random.text;
  }
})();