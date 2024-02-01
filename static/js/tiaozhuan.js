function checkParent(element, classNames) {
    while (element) {
        if (element.classList && classNames.some(cn => element.classList.contains(cn))) {
            return true;
        }
        element = element.parentElement;
    }
    return false;
}
var excludedClasses = ['talks_comments']; // 添加你需要排除的类名到
window.addEventListener('load', (event) => {
    document.body.addEventListener('click', function(e) {
        let target = e.target;
        while (target && target.nodeName !== 'A') {
            target = target.parentNode;
        }
        if (target && target.nodeName === 'A' && 
            !checkParent(target, excludedClasses) && 
            !target.href.includes('koobai.com') && 
            !target.href.includes('douban.com') && 
            target.hostname !== window.location.hostname) {
            e.preventDefault();
            let encodedUrl = btoa(target.href); // Base64 encode the URL
            let url = '/tiaozhuan?target=' + encodeURIComponent(encodedUrl);
            window.open(url, '_blank');
        }
    });
});