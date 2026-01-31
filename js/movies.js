document.addEventListener("DOMContentLoaded", function() {

  // ==========================================
  // 纯净版：仅包含分页加载更多逻辑
  // ==========================================
  
  // 初始显示的电影数量
  let visibleMovies = 27; 
  
  // 获取关键元素
  const movies_loadMore = document.getElementById('movies_loadMore');
  // 注意：这里只选取内页的电影卡片 (.movies_bankuai)，不影响首页
  const allMovies = document.querySelectorAll('.movies_bankuai'); 

  // 如果页面上没有电影列表（比如在首页），直接退出，不报错
  if (allMovies.length === 0) return;

  // --- 核心函数：控制显示与隐藏 ---
  function updateVisibility() {
    allMovies.forEach((movie, idx) => {
      if (idx < visibleMovies) {
        // 1. 设为块级元素，占据位置
        movie.style.display = 'block';
        
        // 2.【强制显示】添加 visible 类并强制不透明
        // 这一步是为了解决 img-hide 带来的 opacity: 0 问题
        // 稍微延时 10ms 确保浏览器先渲染 display: block
        setTimeout(() => {
            movie.classList.add('visible'); 
            movie.style.opacity = '1'; 
        }, 10);
      } else {
        // 超过限制数量的，全部隐藏
        movie.style.display = 'none';
        movie.classList.remove('visible');
      }
    });

    // --- 按钮逻辑 ---
    if (movies_loadMore) {
      // 如果当前显示的通过数量 >= 总数，隐藏按钮
      if (visibleMovies >= allMovies.length) {
        movies_loadMore.style.display = 'none';
      } else {
        movies_loadMore.style.display = 'block'; // 或 inline-block
      }
    }
  }

  // --- 初始化运行 ---
  // 页面刚加载时，先执行一次，把多余的电影藏起来
  updateVisibility();

  // --- 绑定点击事件 ---
  if (movies_loadMore) {
    movies_loadMore.addEventListener('click', function() {
      // 每次点击增加 27 个
      visibleMovies += 27; 
      // 刷新视图
      updateVisibility(); 
    });
  }

});