//分页加载更多
let visibleMovies = 18; // 最初可见的电影数量
const movies_page = document.getElementById('movies_page');
const movies_loadMore = document.getElementById('movies_loadMore');

// 根据可见性计数显示/隐藏电影的函数
function updateVisibility() {
  const movies = document.querySelectorAll('.movies_bankuai');
  movies.forEach((movie, idx) => {
    movie.style.display = idx < visibleMovies ? 'block' : 'none';
  });

// 如果所有电影都变为可见，则隐藏“加载更多”按钮
if (visibleMovies >= movies.length) {
  movies_loadMore.style.display = 'none';
}
}

// “加载更多”按钮点击事件
movies_loadMore.addEventListener('click', () => {
  visibleMovies += 18; // 增加可见数量
  updateVisibility(); // 更新电影可见性
});

// 初始可见性设置
updateVisibility();

  
//背景随机视频
document.addEventListener("DOMContentLoaded", function () {
  const videoElement = document.querySelector(".video-source");
  const videoSource = videoElement.querySelector("source");

  const movieVideos = [
    'https://img.koobai.com/douban/video01.mp4', 
    'https://img.koobai.com/douban/video02.mp4', 
    'https://img.koobai.com/douban/video03.mp4', 
    'https://img.koobai.com/douban/video04.mp4', 
    'https://img.koobai.com/douban/video005.mp4', 
    // ...更多电影视频...
  ];

  function playRandomVideo(videos) {
    const randomIndex = Math.floor(Math.random() * videos.length);
    videoSource.src = videos[randomIndex];
    videoElement.load();
  }

  // 初始随机播放一个电影视频
  playRandomVideo(movieVideos);
});