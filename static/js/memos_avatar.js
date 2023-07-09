//footer logo 随机表情
function getRandomImage() {
  fetch('/suju/about.json')
    .then(response => response.json())
    .then(data => {
      var imagePaths = data.map(item => item.image_path);

      var imgElements = document.querySelectorAll('.memoImage');
      imgElements.forEach(imgElement => {
        var randomImagePath = imagePaths[Math.floor(Math.random() * imagePaths.length)];
        imgElement.setAttribute('src', randomImagePath);
      });
    })
    .catch(error => {
      console.error('Error:', error);
    });
}

window.onload = getRandomImage;