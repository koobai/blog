/*
Last Modified time : 20230326 13:00 by https://immmmm.
最新js https://immmmm.com/bb-lmm-mk.js
*/
var bbMemo = {
  memos: 'https://demo.usememos.com/',
  limit: '10',
  creatorId: '101',
  domId: '#bber',
}
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
var page = 1,offset = 0,nextLength = 0,nextDom='';
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
  page++
  offset = limit*(page-1)
  getNextList()
});
}
//预加载下一页数据
function getNextList(){
var bbUrl = memos+"api/memo?creatorId="+bbMemo.creatorId+"&rowStatus=NORMAL&limit="+limit+"&offset="+offset;
fetch(bbUrl).then(res => res.json()).then( resdata =>{
  nextDom = resdata.data
  nextLength = nextDom.length
  page++
  offset = limit*(page-1)
  if(nextLength < 1){ //返回数据条数为 0 ，隐藏
    document.querySelector("button.button-load").remove()
    return
  }
})
}
//加载总 Memos 数
function meNums(){
var bbLoad = document.querySelector('.bb-load')
var bbUrl = memos+"api/memo/stats?creatorId="+bbMemo.creatorId
fetch(bbUrl).then(res => res.json()).then( resdata =>{
  if(resdata.data){
    var allnums = ' ( 目前共唠叨了 '+resdata.data.length+' 条 )'
    bbLoad.insertAdjacentHTML('afterend', allnums);
  }
})
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
  breaks: !0,
  smartypants: !0,
  langPrefix: 'language-'
});
for(var i=0;i < data.length;i++){
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
        var resLink = ''
        if(resexlink){
          resLink = resexlink
        }else{
          resLink = memos+'o/r/'+resourceList[j].id+'/'+resourceList[j].filename
        }
        if(restype == 'image'){
          imgUrl += '<figure class="gallery-thumbnail"><img class="img thumbnail-image" src="'+resLink+'"/></figure>'
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
    result += "<li class='bb-list-li' data-module='fade-in-up'><div class='memos-zuoz'><div class='memos-logo2'><img src='https://img.koobai.com/koobai.svg' alt='koobai' /></div><div><div class='memos_diaoyong_from'><a href='/memos'>koobai</a></div><span class='memos_diaoyong_time'>"+ moment(data[i].createdTs * 1000).twitterLong() +"</span></div><div class='memos-tubiao'><svg viewBox='0 0 32 26' xmlns='http://www.w3.org/2000/svg'><g fill-rule='evenodd'><path d='M32,3.07526882 C30.8,3.59447005 29.56,3.95391705 28.24,4.11367127 C29.6,3.31490015 30.64,2.03686636 31.12,0.479262673 C29.84,1.23809524 28.44,1.75729647 26.96,2.07680492 C25.76,0.798771121 24.04,0 22.16,0 C18.52,0 15.6,2.95545315 15.6,6.5499232 C15.6,7.06912442 15.64,7.5483871 15.76,8.02764977 C10.32,7.78801843 5.52,5.15207373 2.28,1.19815668 C-0.04,5.35176651 2.56,8.78648233 4.28,9.94470046 C3.24,9.94470046 2.2,9.62519201 1.32,9.14592934 C1.32,12.3809524 3.6,15.0568356 6.56,15.655914 C5.92,15.8556068 4.48,15.9754224 3.6,15.7757296 C4.44,18.3717358 6.88,20.2887865 9.72,20.328725 C7.48,22.0860215 4.2,23.483871 0,23.0445469 C2.92,24.921659 6.36,26 10.08,26 C22.16,26 28.72,16.015361 28.72,7.38863287 C28.72,7.10906298 28.72,6.82949309 28.68,6.5499232 C30.04,5.55145929 31.16,4.39324117 32,3.07526882 L32,3.07526882 Z' fill-rule='nonzero'></path></g></svg></div></div><div class='datacont'>"+bbContREG+"</div></li>"
}// end for
var bbBefore = "<section class='bb-timeline'><ul class='bb-list-ul'>"
var bbAfter = "</ul></section>"
resultAll = bbBefore + result + bbAfter
bbDom.insertAdjacentHTML('beforeend', resultAll);

document.querySelector('button.button-load').textContent= '看更多 ...';
}