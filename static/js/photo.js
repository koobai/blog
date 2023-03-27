const imageList = [
  {img: 'https://img.koobai.com/photo/caihong.webp', imgSmall: 'https://img.koobai.com/photo/caihong-small.webp', title: '雨后'},
  {img: 'https://img.koobai.com/photo/dazi.webp', imgSmall: 'https://img.koobai.com/photo/dazi-small.webp', title: '学起来'},
  {img: 'https://img.koobai.com/photo/gz.webp', imgSmall: 'https://img.koobai.com/photo/gz-small.webp', title: '广州塔'},
  {img: 'https://img.koobai.com/photo/kouan.webp', imgSmall: 'https://img.koobai.com/photo/kouan-small.webp', title: '对面就是澳门了'},
  {img: 'https://img.koobai.com/photo/q1.webp', imgSmall: 'https://img.koobai.com/photo/q1-small.webp', title: '第一把客制化'},
  {img: 'https://img.koobai.com/photo/xueche.webp', imgSmall: 'https://img.koobai.com/photo/xueche-small.webp', title: '学会了就不骑'},
  {img: 'https://img.koobai.com/photo/zhuhai.webp', imgSmall: 'https://img.koobai.com/photo/zhuhai-small.webp', title: '珠海灯塔'},
  {img: 'https://img.koobai.com/photo/xihu.webp', imgSmall: 'https://img.koobai.com/photo/xihu-small.webp', title: '周末的西湖'},
  {img: 'https://img.koobai.com/photo/taohua.webp', imgSmall: 'https://img.koobai.com/photo/taohua-small.webp', title: '春暖花开'},
  {img: 'https://img.koobai.com/photo/lego.webp', imgSmall: 'https://img.koobai.com/photo/lego-small.webp', title: '喜欢拼装的过程'},
  {img: 'https://img.koobai.com/photo/birthday.webp', imgSmall: 'https://img.koobai.com/photo/birthday-small.webp', title: '快乐的成长'},
  {img: 'https://img.koobai.com/article/zoom.jpg', imgSmall: 'https://img.koobai.com/photo/jianpan-small.webp', title: '客制化机械键盘'},
  {img: 'https://img.koobai.com/photo/haobaba.webp', imgSmall: 'https://img.koobai.com/photo/haobaba-small.webp', title: '来自闺女的奖励'},
  {img: 'https://img.koobai.com/photo/nguang.webp', imgSmall: 'https://img.koobai.com/photo/nguang-small.webp', title: '逆光'}
];
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
          <img loading="lazy" decoding="async" src="${imgSmall}" alt="${title}" class="photo">
        </a>
        <span class="photo-home-title">${title}</span>
      </div>
    `;
    photoHome.insertAdjacentHTML('beforeend', photoHtml);
  });
};

insertRandomImages(getRandomImages(imageList, 6));