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
      <div class="photo-home-top img-hide">
        <a href="${img}">
          <img src="${imgSmall}" alt="${title}">
        </a>
        <span class="photo-home-title">${title}</span>
      </div>
    `;
    photoHome.insertAdjacentHTML('beforeend', photoHtml);

    animateSummaries(); // 在DOM加载完毕后执行滑动加载动画
  });
};

fetch('/suju/photo.json')
  .then(response => response.json())
  .then(data => {
    insertRandomImages(getRandomImages(data, 6));
  })
  .catch(error => {
    console.error('无法加载 photo.json 文件:', error);
  });