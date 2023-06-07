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
          <img loading="lazy" decoding="async" src="${imgSmall}" alt="${title}">
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
    insertRandomImages(getRandomImages(data, 12));
  })
  .catch(error => {
    console.error('无法加载 photo.json 文件:', error);
  });

//头部背景图随机显示
var data = [
  { text: '拍摄于杭州西湖', image: 'https://img.koobai.com/about.webp' },
  { text: '拍摄于北京长城', image: 'https://img.koobai.com/about-beij.webp' },
  { text: '拍摄于杭州千岛湖', image: 'https://img.koobai.com/about-qdh.webp' }
];

var randomIndex = Math.floor(Math.random() * data.length);
var randomItem = data[randomIndex];

document.querySelector('.about-img img').src = randomItem.image;
document.querySelector('.about-img-intro').textContent = randomItem.text;