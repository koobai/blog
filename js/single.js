//评论默认隐藏
function loadComments() {
  var articlecomments = document.getElementById("articlecomments");
  var MoreComments = document.getElementById("MoreComments");      
  articlecomments.style.display = "block";
  MoreComments.style.display = "none";     
  var buttonRect = MoreComments.getBoundingClientRect();
  window.scroll({
    top: window.scrollY + buttonRect.top + 300,
    behavior: 'smooth'
  });
}

//评论跳转中间页
document.body.addEventListener('click', function(e) {
  let target = e.target.closest('.atk-comment-wrap a');
  if (target && !target.href.includes('koobai.com')) {
      e.preventDefault();
      let encodedUrl = btoa(target.href);
      let url = '/tiaozhuan?target=' + encodedUrl;
      window.open(url, '_blank');
  }
});

//段落目录导航
document.addEventListener("DOMContentLoaded", () => {
    const postTOC = document.querySelector('.paragraph-dh');

    const headingObserver = new IntersectionObserver(headings => {
        headings.forEach(({ target, isIntersecting }) => {
            const link = postTOC.querySelector(`a[href="#${target.id}"]`);
            if (isIntersecting && link) {
                postTOC.querySelectorAll('a').forEach(a => a.classList.remove('active'));
                link.classList.add('active');
            }
        });
    }, { rootMargin: '0px 0px -75%' });

    document.querySelectorAll('.content h2[id], .content h3[id]').forEach(heading => headingObserver.observe(heading));

    window.addEventListener('scroll', () => postTOC.style.opacity = (window.pageYOffset > 400) ? 1 : 0);

    postTOC.addEventListener('click', (e) => {
        e.preventDefault();
        const targetElement = document.getElementById(e.target.getAttribute('href').substring(1));
        if (targetElement) targetElement.scrollIntoView({ behavior: 'smooth' });
    });
});