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

  // Handle the first image separately
  const { img, imgSmall, title } = images[0];
  const firstPhotoHtml = `
    <div class="photo-home-top-1">
      <a href="${img}">
        <img loading="lazy" decoding="async" src="${imgSmall}" alt="${title}">
      </a>
      <span class="photo-home-title-1">${title}</span>
    </div>
  `;
  photoHome.insertAdjacentHTML('beforeend', firstPhotoHtml);

  // Handle the remaining images
  const remainingImages = images.slice(1);
  const photoContainer = document.createElement('div'); // 创建一个新的<div>元素
  photoContainer.classList.add('photo-home-top-2'); // 添加CSS类名

  remainingImages.forEach(({ img, imgSmall, title }) => {
    const photoHtml = `
      <div class="photo-home-top">
        <a href="${img}">
          <img loading="lazy" decoding="async" src="${imgSmall}" alt="${title}">
        </a>
        <span class="photo-home-title">${title}</span>
      </div>
    `;
    photoContainer.insertAdjacentHTML('beforeend', photoHtml);
  });

  photoHome.appendChild(photoContainer); // 将包含所有照片的容器添加到photoHome元素中
};

fetch('/suju/photo.json')
  .then(response => response.json())
  .then(data => {
    insertRandomImages(getRandomImages(data, 4));
  })
  .catch(error => {
    console.error('无法加载 photo.json 文件:', error);
  });