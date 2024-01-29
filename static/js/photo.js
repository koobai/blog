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
  const photoHome = document.querySelector('.photo-quanju');
  images.forEach(({ img, imgSmall, title }) => {
    const photoHtml = `
      <div class="photo-moment">
        <a href="${img}">
          <img src="${imgSmall}" alt="${title}">
        </a>
        <div class="photo-moment-title">${title}</div>
      </div>
    `;
    photoHome.insertAdjacentHTML('beforeend', photoHtml);

  });
};

fetch('/suju/photoindex.json')
  .then(response => response.json())
  .then(data => {
    insertRandomImages(getRandomImages(data, 3));
  })
  .catch(error => {
    console.error('无法加载 photo.json 文件:', error);
  });