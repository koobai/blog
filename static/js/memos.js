/*
Last Modified time : 20230608 13:00 by https://immmmm.com
最新js https://immmmm.com/bb-lmm-mk.js
*/
var memosData = {
    dom:'#memos',
	}
  
var bbMemo = {
  memos: 'https://memos.koobai.com/',
  limit: '15',
  creatorId: '101',
  domId: '#bber',
};
if(typeof(bbMemos) !=="undefined"){
  for(var key in bbMemos) {
    if(bbMemos[key]){
      bbMemo[key] = bbMemos[key];
    }
  }
}
function loadCssCode(code){
var style = document.createElement('style');
style.type = 'text/css';
style.rel = 'stylesheet';
style.appendChild(document.createTextNode(code));
var head = document.getElementsByTagName('head')[0];
head.appendChild(style);
}

var limit = bbMemo.limit
var memos = bbMemo.memos
var mePage = 1,offset = 0,nextLength = 0,nextDom='';
var bbDom = document.querySelector(bbMemo.domId);
var load = '<div class="bb-load"><button class="load-btn button-load">加载中……</button></div>'
if(bbDom){
getFirstList() //首次加载数据
meNums() //加载总数
var btn = document.querySelector("button.button-load");
btn.addEventListener("click", function () {
  btn.textContent= '加载中……';
  updateHTMl(nextDom)
  if(nextLength < limit){ //返回数据条数小于限制条数，隐藏
    document.querySelector("button.button-load").remove()
    return
  }
  getNextList()
});
}
function getFirstList(){
bbDom.insertAdjacentHTML('afterend', load);
var bbUrl = memos+"api/memo?creatorId="+bbMemo.creatorId+"&rowStatus=NORMAL&limit="+limit;
fetch(bbUrl).then(res => res.json()).then( resdata =>{
  updateHTMl(resdata.data)
  var nowLength = resdata.data.length
  if(nowLength < limit){ //返回数据条数小于 limit 则直接移除“加载更多”按钮，中断预加载
    document.querySelector("button.button-load").remove()
    return
  }
  mePage++
  offset = limit*(mePage-1)
  getNextList()
});
}
//预加载下一页数据
function getNextList(){
var bbUrl = memos+"api/memo?creatorId="+bbMemo.creatorId+"&rowStatus=NORMAL&limit="+limit+"&offset="+offset;
fetch(bbUrl).then(res => res.json()).then( resdata =>{
  nextDom = resdata.data
  nextLength = nextDom.length
  mePage++
  offset = limit*(mePage-1)
  if(nextLength < 1){ //返回数据条数为 0 ，隐藏
    document.querySelector("button.button-load").remove()
    return
  }
})
}

//加载总 Memos 数
function meNums() {
  var bbLoad = document.querySelector('.bb-load');
  var bbUrl = memos + "api/memo/stats?creatorId=" + bbMemo.creatorId;
  fetch(bbUrl).then(res => res.json()).then(resdata => {
    if (resdata.data) {
      var allnums = ' ( 目前共唠叨了 ' + resdata.data.length + ' 条 )';
      bbLoad.insertAdjacentHTML('afterend', allnums);
    }
  });
}

// 插入 html 
function updateHTMl(data){
  var result="",resultAll="";
  const TAG_REG = /#([^\s#]+?) /g
  , BILIBILI_REG = /<a.*?href="https:\/\/www\.bilibili\.com\/video\/((av[\d]{1,10})|(BV([\w]{10})))\/?".*?>.*<\/a>/g
  , NETEASE_MUSIC_REG = /<a.*?href="https:\/\/music\.163\.com\/.*id=([0-9]+)".*?>.*<\/a>/g
  , QQMUSIC_REG = /<a.*?href="https\:\/\/y\.qq\.com\/.*(\/[0-9a-zA-Z]+)(\.html)?".*?>.*?<\/a>/g
  , QQVIDEO_REG = /<a.*?href="https:\/\/v\.qq\.com\/.*\/([a-z|A-Z|0-9]+)\.html".*?>.*<\/a>/g
  , YOUKU_REG = /<a.*?href="https:\/\/v\.youku\.com\/.*\/id_([a-z|A-Z|0-9|==]+)\.html".*?>.*<\/a>/g
  , YOUTUBE_REG = /<a.*?href="https:\/\/www\.youtube\.com\/watch\?v\=([a-z|A-Z|0-9]{11})\".*?>.*<\/a>/g;
  marked.setOptions({
    breaks: false,
    smartypants: false,
    langPrefix: 'language-',
    headerIds: false,
    mangle: false
  });
  for(var i=0;i < data.length;i++){
      var memo_id = data[i].id; //评论调用
      var bbContREG = data[i].content.replace(TAG_REG, "<span class='tag-span'>#$1</span> ")
      bbContREG = marked.parse(bbContREG)
        .replace(BILIBILI_REG, "<div class='video-wrapper'><iframe src='//player.bilibili.com/player.html?bvid=$1&as_wide=1&high_quality=1&danmaku=0' scrolling='no' border='0' frameborder='no' framespacing='0' allowfullscreen='true'></iframe></div>")
        .replace(NETEASE_MUSIC_REG, "<meting-js auto='https://music.163.com/#/song?id=$1'></meting-js>")
        .replace(QQMUSIC_REG, "<meting-js auto='https://y.qq.com/n/yqq/song$1.html'></meting-js>")
        .replace(QQVIDEO_REG, "<div class='video-wrapper'><iframe src='//v.qq.com/iframe/player.html?vid=$1' allowFullScreen='true' frameborder='no'></iframe></div>")
        .replace(YOUKU_REG, "<div class='video-wrapper'><iframe src='https://player.youku.com/embed/$1' frameborder=0 'allowfullscreen'></iframe></div>")
        .replace(YOUTUBE_REG, "<div class='video-wrapper'><iframe src='https://www.youtube.com/embed/$1' title='YouTube video player' frameborder='0' allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture' allowfullscreen title='YouTube Video'></iframe></div>")

      //解析内置资源文件
      if(data[i].resourceList && data[i].resourceList.length > 0){
        var resourceList = data[i].resourceList;
        var imgUrl='',resUrl='',resImgLength = 0;
        for(var j=0;j < resourceList.length;j++){
          var restype = resourceList[j].type.slice(0,5)
          var resexlink = resourceList[j].externalLink
          var resLink = '',fileId=''
          if(resexlink){
            resLink = resexlink
          }else{
            fileId = resourceList[j].publicId || resourceList[j].filename
            resLink = memos+'o/r/'+resourceList[j].id+'/'+fileId
          }
          if(restype == 'image'){
            imgUrl += '<figure class="gallery-thumbnail"><img loading="lazy" decoding="async" class="img thumbnail-image" src="'+resLink+'"/></figure>'
            resImgLength = resImgLength + 1 
          }
          if(restype !== 'image'){
            resUrl += '<a target="_blank" rel="noreferrer" href="'+resLink+'">'+resourceList[j].filename+'</a>'
          }
        }
        if(imgUrl){
          var resImgGrid = ""
          if(resImgLength !== 1){var resImgGrid = "grid grid-"+resImgLength}
          bbContREG += '<div class="resimg '+resImgGrid+'">'+imgUrl+'</div></div>'
        }
        if(resUrl){
          bbContREG += '<p class="datasource">'+resUrl+'</p>'
        }
      }
    result += '<li class="bb-list-li" id="' + memo_id + '"><div class="memos-zuoz"><div class="memos-logo2"><img src="https://img.koobai.com/koobai.svg" alt="koobai" /></div><div><div class="memos_diaoyong_from"><a href="/memos">koobai</a></div><span class="memos_diaoyong_time">' + moment(data[i].createdTs * 1000).twitterLong() + '</span></div><div class="talks_comments"><a onclick=\"loadArtalk(\'' + memo_id + '\')\"><span id="btn_memo_' + memo_id + '"><svg viewBox="0 0 426.666667 384" xmlns="http://www.w3.org/2000/svg"><g fill-rule="evenodd"><path d="M234.666667,0 C340.706133,0 426.666667,85.9613867 426.666667,192 C426.666667,298.039467 340.706133,384 234.666667,384 L21.3333333,384 C9.55136,384 0,374.449067 0,362.666667 L0,192 C0,85.9613867 85.9613867,0 192,0 L234.666667,0 Z M234.666667,42.6666667 L192,42.6666667 C109.525547,42.6666667 42.6666667,109.525547 42.6666667,192 L42.6666667,341.333333 L234.666667,341.333333 C317.141333,341.333333 384,274.474667 384,192 C384,109.525547 317.141333,42.6666667 234.666667,42.6666667 Z M128,170.666667 C139.782187,170.666667 149.333333,180.2176 149.333333,192 C149.333333,203.7824 139.782187,213.333333 128,213.333333 C116.218027,213.333333 106.666667,203.7824 106.666667,192 C106.666667,180.2176 116.218027,170.666667 128,170.666667 Z M213.333333,170.666667 C225.115733,170.666667 234.666667,180.2176 234.666667,192 C234.666667,203.7824 225.115733,213.333333 213.333333,213.333333 C201.550933,213.333333 192,203.7824 192,192 C192,180.2176 201.550933,170.666667 213.333333,170.666667 Z M298.666667,170.666667 C310.449067,170.666667 320,180.2176 320,192 C320,203.7824 310.449067,213.333333 298.666667,213.333333 C286.884267,213.333333 277.333333,203.7824 277.333333,192 C277.333333,180.2176 286.884267,170.666667 298.666667,170.666667 Z" fill-rule="nonzero"></path></g></svg></span></a></div></div><div class="datacont">' + bbContREG + '</div><div id="memo_' + memo_id + '" class="artalk hidden"></div></li>';
  } // end for

  var bbBefore = "<section class='bb-timeline'><ul class='bb-list-ul'>";
  var bbAfter = "</ul></section>";
  resultAll = bbBefore + result + bbAfter;
  bbDom.insertAdjacentHTML('beforeend', resultAll);

  document.querySelector('button.button-load').textContent = '看更多 ...';
}

//增加memos评论
function loadArtalk(memo_id) {
  const commentDiv = document.getElementById('memo_' + memo_id);
  const commentBtn = document.getElementById('btn_memo_' + memo_id);
  const allCommentDivs = document.querySelectorAll("[id^='memo_']");
  const allCommentBtns = document.querySelectorAll("[id^='btn_memo_']");

  if (commentDiv.classList.contains('hidden')) {
    // 收起其他评论
    for (let i = 0; i < allCommentDivs.length; i++) {
      if (allCommentDivs[i] !== commentDiv) {
        allCommentDivs[i].classList.add('hidden');
      }
    }
    // 修改其他评论按钮文字
    for (let i = 0; i < allCommentBtns.length; i++) {
      if (allCommentBtns[i] !== commentBtn) {
        allCommentBtns[i].innerHTML = '<svg viewBox="0 0 426.666667 384" xmlns="http://www.w3.org/2000/svg"><g fill-rule="evenodd"><path d="M234.666667,0 C340.706133,0 426.666667,85.9613867 426.666667,192 C426.666667,298.039467 340.706133,384 234.666667,384 L21.3333333,384 C9.55136,384 0,374.449067 0,362.666667 L0,192 C0,85.9613867 85.9613867,0 192,0 L234.666667,0 Z M234.666667,42.6666667 L192,42.6666667 C109.525547,42.6666667 42.6666667,109.525547 42.6666667,192 L42.6666667,341.333333 L234.666667,341.333333 C317.141333,341.333333 384,274.474667 384,192 C384,109.525547 317.141333,42.6666667 234.666667,42.6666667 Z M128,170.666667 C139.782187,170.666667 149.333333,180.2176 149.333333,192 C149.333333,203.7824 139.782187,213.333333 128,213.333333 C116.218027,213.333333 106.666667,203.7824 106.666667,192 C106.666667,180.2176 116.218027,170.666667 128,170.666667 Z M213.333333,170.666667 C225.115733,170.666667 234.666667,180.2176 234.666667,192 C234.666667,203.7824 225.115733,213.333333 213.333333,213.333333 C201.550933,213.333333 192,203.7824 192,192 C192,180.2176 201.550933,170.666667 213.333333,170.666667 Z M298.666667,170.666667 C310.449067,170.666667 320,180.2176 320,192 C320,203.7824 310.449067,213.333333 298.666667,213.333333 C286.884267,213.333333 277.333333,203.7824 277.333333,192 C277.333333,180.2176 286.884267,170.666667 298.666667,170.666667 Z" fill-rule="nonzero"></path></g></svg>';
      }
    }

    commentDiv.classList.remove('hidden');
    commentBtn.innerHTML = '<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><g fill-rule="evenodd"><path d="M256,0 C397.167,0 512,114.853 512,256 C512,397.147 397.167,512 256,512 C114.833,512 0,397.167 0,256 C0,114.833 114.833,0 256,0 Z M256,39.659 C136.725,39.659 39.659,136.705 39.659,256 C39.659,375.295 136.725,472.341 256,472.341 C375.275,472.341 472.341,375.295 472.341,256 C472.341,136.705 375.295,39.659 256,39.659 Z M242.119,184.217 C249.853,176.523 262.345,176.523 270.079,184.217 L369.227,283.365 C376.921,291.098 376.921,303.591 369.227,311.325 C361.493,319.019 349.001,319.019 341.267,311.325 L256,226.256 L170.931,311.324 C162.622,318.443 150.09,317.472 142.971,309.163 C136.606,301.747 136.606,290.781 142.971,283.365 Z" fill-rule="nonzero"></path></g></svg>';
    //增加评论平滑定位
    const commentLi = document.getElementById(memo_id);
    const commentLiPosition = commentLi.getBoundingClientRect().top + window.pageYOffset;
    const offset = commentLiPosition - 3.5 * parseFloat(getComputedStyle(document.documentElement).fontSize);
    if ('scrollBehavior' in document.documentElement.style) {
      // 支持平滑滚动的情况下，使用 window.scrollTo
      window.scrollTo({
        top: offset,
        behavior: 'smooth'
      });
    } else {
      // 不支持平滑滚动的情况下，使用滚动容器的平滑滚动方法（如需要滚动到具体的容器内）
      // 例如：document.documentElement.scrollTop = offset;
      // 或者使用第三方的平滑滚动库
    }
    const artalk = new Artalk({
      el: '#memo_' + memo_id,
      pageKey: '/m/' + memo_id,
      pageTitle: '',
      server: 'https://c.koobai.com/',
      site: '空白唠叨',
      darkMode: 'auto'
    });
  } else {
    commentDiv.classList.add('hidden');
    commentBtn.innerHTML = '<svg viewBox="0 0 426.666667 384" xmlns="http://www.w3.org/2000/svg"><g fill-rule="evenodd"><path d="M234.666667,0 C340.706133,0 426.666667,85.9613867 426.666667,192 C426.666667,298.039467 340.706133,384 234.666667,384 L21.3333333,384 C9.55136,384 0,374.449067 0,362.666667 L0,192 C0,85.9613867 85.9613867,0 192,0 L234.666667,0 Z M234.666667,42.6666667 L192,42.6666667 C109.525547,42.6666667 42.6666667,109.525547 42.6666667,192 L42.6666667,341.333333 L234.666667,341.333333 C317.141333,341.333333 384,274.474667 384,192 C384,109.525547 317.141333,42.6666667 234.666667,42.6666667 Z M128,170.666667 C139.782187,170.666667 149.333333,180.2176 149.333333,192 C149.333333,203.7824 139.782187,213.333333 128,213.333333 C116.218027,213.333333 106.666667,203.7824 106.666667,192 C106.666667,180.2176 116.218027,170.666667 128,170.666667 Z M213.333333,170.666667 C225.115733,170.666667 234.666667,180.2176 234.666667,192 C234.666667,203.7824 225.115733,213.333333 213.333333,213.333333 C201.550933,213.333333 192,203.7824 192,192 C192,180.2176 201.550933,170.666667 213.333333,170.666667 Z M298.666667,170.666667 C310.449067,170.666667 320,180.2176 320,192 C320,203.7824 310.449067,213.333333 298.666667,213.333333 C286.884267,213.333333 277.333333,203.7824 277.333333,192 C277.333333,180.2176 286.884267,170.666667 298.666667,170.666667 Z" fill-rule="nonzero"></path></g></svg>';
  }
}