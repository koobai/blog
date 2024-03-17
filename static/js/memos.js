var hasLogin = 0 //没登录隐藏编辑归档按钮

var memosData = {
    dom:'#memos',
  }
  
var bbMemo = {
  memos: 'https://memos.koobai.com/',
  limit: '5',
  creatorId: '1',
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
// 增加memos编辑及归档
var memosOpenId = window.localStorage && window.localStorage.getItem("memos-access-token");
var memosPath = window.localStorage && window.localStorage.getItem("memos-access-path");
var getEditor = window.localStorage && window.localStorage.getItem("memos-editor-display");
var memoChangeDate = 0;
var getSelectedValue = window.localStorage && window.localStorage.getItem("memos-visibility-select") || "PUBLIC";


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
let tagHtml = `<div id="tag-list"></div>` // TAG筛选 memos搜索
bbDom.insertAdjacentHTML('beforebegin', tagHtml); // TAG筛选
var bbUrl = memos+"api/v1/memo?creatorId="+bbMemo.creatorId+"&rowStatus=NORMAL&limit="+limit;
let memosOpenId = window.localStorage && window.localStorage.getItem("memos-access-token");
let oneDay = window.localStorage && window.localStorage.getItem("memos-oneday");
if(memosOpenId && memosOpenId != null){
  fetch(bbUrl,{
    headers:{
      'Authorization': `Bearer ${memosOpenId}`,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
    cache: 'no-store',
  }).then(res => res.json()).then( resdata =>{
    updateHTMl(resdata);
    var nowLength = resdata.length;
    if(nowLength < limit){ //返回数据条数小于 limit 则直接移除“加载更多”按钮，中断预加载
      document.querySelector("button.button-load").remove()
      return
    }
    mePage++
    offset = limit*(mePage-1)
    getNextList()
  });
  if(oneDay == "open"){
    reloadList("ONEDAY");
  }
}else{
  fetch(bbUrl).then(res => res.json()).then( resdata =>{
    updateHTMl(resdata);
    var nowLength = resdata.length;
    if(nowLength < limit){ //返回数据条数小于 limit 则直接移除“加载更多”按钮，中断预加载
      document.querySelector("button.button-load").remove()
      return
    }
    mePage++
    offset = limit*(mePage-1)
    getNextList()
  });
}
}
//预加载下一页数据
function getNextList(){
var bbUrl = memos+"api/v1/memo?creatorId="+bbMemo.creatorId+"&rowStatus=NORMAL&limit="+limit+"&offset="+offset;
fetch(bbUrl).then(res => res.json()).then( resdata =>{
  nextDom = resdata;
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
  var bbUrl = memos + "api/v1/memo/stats?creatorId=" + bbMemo.creatorId;
  fetch(bbUrl).then(res => res.json()).then(resdata => {
    if (Array.isArray(resdata)) {
     // var allnums = ' ( 目前共唠叨了 ' + resdata.length + ' 条 )';
      //bbLoad.insertAdjacentHTML('afterend', allnums);
    }
  });
}

// 插入 html 
function updateHTMl(data,mode){
  var result="",resultAll="";
  //登录显示编辑归档按钮
  if(memosOpenId && getEditor == "show"){ 
    hasLogin = 1
  } 
  const TAG_REG = /#([^#\s!.,;:?"'()]+)(?= )/g
  , IMG_REG = /\!\[(.*?)\]\((.*?)\)/g //content 内 md 格式图片
  , LINK_REG = /\[(.*?)\]\((.*?)\)/g //链接新窗口打开
  marked.setOptions({
    breaks: false,
    smartypants: false,
    langPrefix: 'language-',
    headerIds: false,
    mangle: false
  });
  for(var i=0;i < data.length;i++){
      var memoString = JSON.stringify(data[i]).replace(/"/g, '&quot;');
      var memo_id = data[i].id; //评论调用
      var memoVis = data[i].visibility
      var bbContREG = data[i].content
      .replace(TAG_REG, "")
      .replace(IMG_REG, '')
      .replace(LINK_REG, '<a href="$2" target="_blank">$1</a>')
      bbContREG = marked.parse(bbContREG)

      //解析 content 内 md 格式图片
      var IMG_ARR = data[i].content.match(IMG_REG) || '',IMG_ARR_Grid='';
      if(IMG_ARR){
        var IMG_ARR_Length = IMG_ARR.length,IMG_ARR_Url = '';
        if(IMG_ARR_Length !== 1){var IMG_ARR_Grid = " grid grid-"+IMG_ARR_Length}
        IMG_ARR.forEach(item => {
            let imgSrc = item.replace(/!\[.*?\]\((.*?)\)/g,'$1')
            IMG_ARR_Url += '<figure class="gallery-thumbnail"><img loading="lazy" decoding="async" class="img thumbnail-image" loading="lazy" decoding="async" src="'+imgSrc+'"/></figure>'
        });
        bbContREG += '<div class="resimg'+IMG_ARR_Grid+'">'+IMG_ARR_Url+'</div>';
      }
      //TAG 解析
      var tagArr = data[i].content.match(TAG_REG);
      var memosTag = '';
      
      if (tagArr) {
        memosTag = tagArr.map(function(tag) {
          var tagText = String(tag).replace(/[#]/g, '');
          return '<div class="memos-tag-dg" onclick="getTagNow(this)">#' + tagText + '</div>';
        }).join('');
      } else {
        memosTag = '<div class="memos-tag-dg">#日常</div>';
      }
      
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
            resLink = memos+'o/r/'+resourceList[j].id //+'/'+fileId
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
      result += `
      <li class="bb-list-li img-hide" id="${memo_id}">
        <div class="memos-pl">
        <div class="memos_diaoyong_time">${moment(data[i].createdTs * 1000).twitterLong()}</div>`

      if(hasLogin !== 0){
        result += `<div class="memos-edit">
          <div class="memos-menu">...</div>
          <div class="memos-menu-d">
            <div class="edit-btn" data-form="${memoString}" onclick="editMemo(this)">修改</div>
            <div class="archive-btn" onclick="archiveMemo('${data[i].id}')">归档</div>
            <div class="delete-btn" onclick="deleteMemo('${data[i].id}')">删除</div> 
          </div>
        </div>
        `
      }

      result += `</div>       
        <div class="datacont" view-image>${bbContREG}</div>
        <div class="memos_diaoyong_top">
        <div class="memos-tag-wz">${memosTag}</div>`

      if(memoVis == "PUBLIC"){
        result += `<div class="talks_comments">
            <a onclick="loadArtalk('${memo_id}')"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M12 11.25a.75.75 0 1 0 0 1.5a.75.75 0 0 0 0-1.5m-3 0a.75.75 0 1 0 0 1.5a.75.75 0 0 0 0-1.5m6 0a.75.75 0 1 0 0 1.5a.75.75 0 0 0 0-1.5m4.415-5.96C15.71 1.195 9.385.88 5.29 4.584C1.195 8.289.88 14.614 4.584 18.709l-2.438 2.437A.5.5 0 0 0 2.5 22H12a10 10 0 0 0 6.709-2.585c4.096-3.705 4.412-10.03.706-14.125M12 21H3.707l1.929-1.929a.5.5 0 0 0 0-.707a8.999 8.999 0 0 1 6.362-15.362A8.999 8.999 0 0 1 12 21"/></svg><span id="btn_memo_${memo_id}"></span></a>
          </div>
        </div>
        <div id="memo_${memo_id}" class="artalk hidden"></div>
        </li>`;  
      }else if(memoVis !== "PUBLIC"){
        result += `<div class="memos-hide" onclick="reloadList("NOPUBLIC")"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 14 14"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M1.68 4.206C2.652 6.015 4.67 7.258 7 7.258c2.331 0 4.348-1.243 5.322-3.052M2.75 5.596L.5 7.481m4.916-.415L4.333 9.794m6.917-4.198l2.25 1.885m-4.92-.415l1.083 2.728"/></svg></idv></div></li>`;  
      }else{
        result += `</div></li>`;
      }        
  } // end for
  if(mode == "ONEDAY"){
    var bbBefore = "<li class='memos-oneday'><ul class='bb-list-ul'>";
    var bbAfter = "</ul></li>";
    resultAll = bbBefore + result + bbAfter;
    bbDom.insertAdjacentHTML('afterbegin', resultAll);
  }else{
    var bbBefore = "<section class='bb-timeline'><ul class='bb-list-ul'>";
    var bbAfter = "</ul></section>";
    resultAll = bbBefore + result + bbAfter;
    bbDom.insertAdjacentHTML('beforeend', resultAll);
  
    // 在动画执行之前调整 z-index
    document.querySelector('.memos-more-ico').style.zIndex = '1';
    // 在DOM加载完毕后执行滑动加载动画
    animateSummaries();
  
    if(document.querySelector('button.button-load')) document.querySelector('button.button-load').textContent = '看更多 ...';
  }
}

// TAG 筛选
function getTagNow(e){
  //console.log(e.innerHTML)
  let tagName = e.innerHTML.replace('#','')
  let domClass = document.getElementById("bber")
  window.scrollTo({
    top: domClass.offsetTop - 30,
    behavior: "smooth"
  });
  let tagHtmlNow = `<div class='memos-tag-sc-2' onclick='javascript:location.reload();'><div class='memos-tag-sc-1' >标签筛选:</div><div class='memos-tag-sc' >${e.innerHTML}<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-auto ml-1 opacity-40"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></div></div>`
  document.querySelector('#tag-list').innerHTML = tagHtmlNow
  let bbUrl = memos+"api/v1/memo?creatorId="+bbMemo.creatorId+"&tag="+tagName+"&limit=20";
  fetch(bbUrl).then(res => res.json()).then( resdata =>{
    document.querySelector(bbMemo.domId).innerHTML = ""
    if(document.querySelector("button.button-load")) document.querySelector("button.button-load").remove()
    updateHTMl(resdata)
  })
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

    commentDiv.classList.remove('hidden');
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
      // 不支持平滑滚动的情况下，使用滚动容器的平滑滚动方法
      // 例如：document.documentElement.scrollTop = offset;
      // 或者使用第三方的平滑滚动库
    }
    const artalk = Artalk.init({
      el: '#memo_' + memo_id,
      pageKey: '/m/' + memo_id,
      pageTitle: '',
      server: 'https://c.koobai.com/',
      site: '空白唠叨',
      darkMode: 'auto'
    });
  } else {
    commentDiv.classList.add('hidden');
  }
}

//调用coco-message插件暗黑模式
const darkModeMatcher = window.matchMedia('(prefers-color-scheme: dark)'); 
darkModeMatcher.addEventListener('change', handleDarkModeChange);
function handleDarkModeChange(e) {
  if (e.matches) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');  
  }
}
handleDarkModeChange(darkModeMatcher);

// memos-editor唠叨编辑开始 
var memosDom = document.querySelector(memosData.dom);
var editIcon = "<div class='load-memos-editor'>唠叨一下</div>";
var memosEditorCont = `
<div class="memos-editor animate__animated animate__fadeIn d-none col-12">
  <div class="memos-editor-body">
    <div class="memos-editor-inner animate__animated animate__fadeIn d-none">
      <div class="memos-editor-content">
        <textarea class="memos-editor-textarea text-sm" rows="1" placeholder="唠叨点什么..."></textarea>
      </div>
      <div id="memos-tag-menu"></div>
      <div class="memos-image-list d-flex flex-fill line-xl"></div>
      <div class="memos-tag-list d-none animate__animated animate__fadeIn"></div>
      <div class="memos-editor-footer border-t">
        <div class="d-flex">
          <div class="button outline action-btn code-single">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-highlighter">
              <path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>
            </svg>
          </div>
          <div class="button outline action-btn link-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24">
              <path fill="currentColor" d="M10.59 13.41c.41.39.41 1.03 0 1.42c-.39.39-1.03.39-1.42 0a5.003 5.003 0 0 1 0-7.07l3.54-3.54a5.003 5.003 0 0 1 7.07 0a5.003 5.003 0 0 1 0 7.07l-1.49 1.49c.01-.82-.12-1.64-.4-2.42l.47-.48a2.982 2.982 0 0 0 0-4.24a2.982 2.982 0 0 0-4.24 0l-3.53 3.53a2.982 2.982 0 0 0 0 4.24m2.82-4.24c.39-.39 1.03-.39 1.42 0a5.003 5.003 0 0 1 0 7.07l-3.54 3.54a5.003 5.003 0 0 1-7.07 0a5.003 5.003 0 0 1 0-7.07l1.49-1.49c-.01.82.12 1.64.4 2.43l-.47.47a2.982 2.982 0 0 0 0 4.24a2.982 2.982 0 0 0 4.24 0l3.53-3.53a2.982 2.982 0 0 0 0-4.24a.973.973 0 0 1 0-1.42"/>
            </svg>
          </div>
          <div class="button outline action-btn link-img">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24">
              <path fill="currentColor" d="M21 3H3C2 3 1 4 1 5v14c0 1.1.9 2 2 2h18c1 0 2-1 2-2V5c0-1-1-2-2-2m0 15.92c-.02.03-.06.06-.08.08H3V5.08L3.08 5h17.83c.03.02.06.06.08.08v13.84zm-10-3.41L8.5 12.5L5 17h14l-4.5-6z"/>
            </svg>
          </div>
          <div class="button outline action-btn biao-qing">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-smile">
              <circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/>
            </svg>
          </div>
          <div class="memos-more-ico">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24">
              <g fill="none">
                <path d="M24 0v24H0V0zM12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035c-.01-.004-.019-.001-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427c-.002-.01-.009-.017-.017-.018m.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093c.012.004.023 0 .029-.008l.004-.014l-.034-.614c-.003-.012-.01-.02-.02-.022m-.715.002a.023.023 0 0 0-.027.006l-.006.014l-.034.614c0 .012.007.02.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01z"/>
                <path fill="currentColor" d="M5 10a2 2 0 1 1 0 4a2 2 0 0 1 0-4m7 0a2 2 0 1 1 0 4a2 2 0 0 1 0-4m7 0a2 2 0 1 1 0 4a2 2 0 0 1 0-4"/>
              </g>
            </svg>
            <div class="memos-xiala">
              <div class="code-btn"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="m24 12l-5.657 5.657l-1.414-1.414L21.172 12l-4.243-4.243l1.414-1.414zM2.828 12l4.243 4.243l-1.414 1.414L0 12l5.657-5.657L7.07 7.757zm6.96 9H7.66l6.552-18h2.128z"/></svg>代码</div>
              <div class="image-btn" onclick="this.lastElementChild.click()"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-camera"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>图片
                <input class="memos-upload-image-input d-none" type="file" accept="image/*">
              </div>
              <div class="switchUser-btn"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user-round-cog"><path d="M2 21a8 8 0 0 1 10.434-7.62"/><circle cx="10" cy="8" r="5"/><circle cx="18" cy="18" r="3"/><path d="m19.5 14.3-.4.9"/><path d="m16.9 20.8-.4.9"/><path d="m21.7 19.5-.9-.4"/><path d="m15.2 16.9-.9-.4"/><path d="m21.7 16.5-.9.4"/><path d="m15.2 19.1-.9.4"/><path d="m19.5 21.7-.4-.9"/><path d="m16.9 15.2-.4-.9"/></svg>帐户</div>
              <div class="private-btn"> <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="m9.343 18.782l-1.932-.518l.787-2.939a10.99 10.99 0 0 1-3.237-1.872l-2.153 2.154l-1.414-1.414l2.153-2.154a10.957 10.957 0 0 1-2.371-5.07l1.968-.359a9.002 9.002 0 0 0 17.713 0l1.968.358a10.958 10.958 0 0 1-2.372 5.071l2.154 2.154l-1.414 1.414l-2.154-2.154a10.991 10.991 0 0 1-3.237 1.872l.788 2.94l-1.932.517l-.788-2.94a11.068 11.068 0 0 1-3.74 0z"/></svg>私有</div>
              <div class="oneday-btn"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><g fill="none"><path d="M24 0v24H0V0zM12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035c-.01-.004-.019-.001-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427c-.002-.01-.009-.017-.017-.018m.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093c.012.004.023 0 .029-.008l.004-.014l-.034-.614c-.003-.012-.01-.02-.02-.022m-.715.002a.023.023 0 0 0-.027.006l-.006.014l-.034.614c0 .012.007.02.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01z"/><path fill="currentColor" d="M17 2a4 4 0 0 1 4 4v9a4.002 4.002 0 0 1-3.127 3.904L19.6 20.2a1 1 0 0 1-1.2 1.6L14.667 19H9.333L5.6 21.8a1 1 0 1 1-1.2-1.6l1.727-1.296A4.001 4.001 0 0 1 3 15V6a4 4 0 0 1 4-4zm2 10H5v3a2 2 0 0 0 1.85 1.995L7 17h10a2 2 0 0 0 1.995-1.85L19 15zm-7 1a1.5 1.5 0 1 1 0 3a1.5 1.5 0 0 1 0-3m7-5H5v2h14zm-2-4H7a2 2 0 0 0-1.995 1.85L5 6h14a2 2 0 0 0-1.85-1.995z"/></g></svg>回忆</div>
            </div>
          </div>
        </div>
        <div class="editor-submit d-flex flex-fill justify-content-end">
          <div class="editor-selector select outline">
            <select class="select-memos-value">
              <option value="PUBLIC">公开</option>
              <!--<option value="PROTECTED">仅登录可见</option>-->
              <option value="PRIVATE">私有</option>
            </select>
          </div>
          <div class="edit-memos d-none">
            <div class="primary cancel-edit-btn">取消</div>
            <div class="primary edit-memos-btn">修改完成</div>
          </div>
          <div class="primary submit-memos-btn">唠叨一下</div>
        </div>
      </div>
    </div>
    <div class="memos-editor-option animate__animated animate__fadeIn d-none">
      <input name="memos-path-url" class="memos-path-input input-text col-6" type="text" value="" placeholder="Memos 地址">
      <input name="memos-token-url" class="memos-token-input input-text col-6" type="text" value="" placeholder="Token">
      <div class="memos-open-api-submit">
        <div class="primary submit-openapi-btn">保存</div>
      </div>
    </div>
  </div>
  <div class="memos-random d-none"></div>
</div>
`;
const element = document.querySelector('.index-laodao-titile'); // 选择器是你想要操作的元素的选择器
element.insertAdjacentHTML('afterend', editIcon);
memosDom.insertAdjacentHTML('afterbegin',memosEditorCont);

var memosEditorInner = document.querySelector(".memos-editor-inner"); 
var memosEditorOption = document.querySelector(".memos-editor-option");
var memosRadomCont = document.querySelector(".memos-random");

var codeBtn = document.querySelector(".code-btn");
var codesingle = document.querySelector(".code-single");
var linkBtn = document.querySelector(".link-btn");
var linkimg = document.querySelector(".link-img");
var privateBtn = document.querySelector(".private-btn");
var oneDayBtn = document.querySelector(".oneday-btn");
var switchUserBtn = document.querySelector(".switchUser-btn");
var loadEditorBtn = document.querySelector(".load-memos-editor");
var submitApiBtn = document.querySelector(".submit-openapi-btn");
var submitMemoBtn = document.querySelector(".submit-memos-btn");
var memosVisibilitySelect = document.querySelector(".select-memos-value");
var pathInput = document.querySelector(".memos-path-input");
var tokenInput = document.querySelector(".memos-token-input");
var uploadImageInput = document.querySelector(".memos-upload-image-input");
var memosTextarea = document.querySelector(".memos-editor-textarea");
var editMemoDom = document.querySelector(".edit-memos");
var editMemoBtn = document.querySelector(".edit-memos-btn");
var cancelEditBtn = document.querySelector(".cancel-edit-btn");
var biaoqing = document.querySelector(".biao-qing");

document.addEventListener("DOMContentLoaded", () => {
  getEditIcon();
});

function getEditIcon() {
  let memosContent = '',memosVisibility = '',memosResource = [],memosRelation=[];
  let memosCount = window.localStorage && window.localStorage.getItem("memos-response-count");
  let memosPath = window.localStorage && window.localStorage.getItem("memos-access-path");
  let memosOpenId = window.localStorage && window.localStorage.getItem("memos-access-token");
  let getEditor = window.localStorage && window.localStorage.getItem("memos-editor-display");
  let isHide = getEditor === "hide";

  let getSelectedValue = window.localStorage && window.localStorage.getItem("memos-visibility-select") || "PUBLIC";
  memosVisibilitySelect.value = getSelectedValue;

  window.localStorage && window.localStorage.setItem("memos-resource-list",  JSON.stringify(memosResource));
  window.localStorage && window.localStorage.setItem("memos-relation-list",  JSON.stringify(memosRelation));

  memosTextarea.addEventListener('input', (e) => {
    memosTextarea.style.height = 'inherit';
    memosTextarea.style.height = e.target.scrollHeight + 'px';
  });

  if (getEditor !== null) {
    document.querySelector(".memos-editor").classList.toggle("d-none",isHide);
    getEditor == "show" ? hasMemosOpenId() : '';
  };

  loadEditorBtn.addEventListener("click", function () {
    getEditor != "show" ? hasMemosOpenId() : '';
    document.querySelector(".memos-editor").classList.toggle("d-none"); 
    window.localStorage && window.localStorage.setItem("memos-editor-display", document.querySelector(".memos-editor").classList.contains("d-none") ? "hide" : "show");
    getEditor = window.localStorage && window.localStorage.getItem("memos-editor-display");

     // 点击唠叨一下，平滑滚动到.index-laodao
     let editorBody = document.querySelector('.index-laodao');
     if (editorBody && !document.querySelector(".memos-editor").classList.contains("d-none")) {
         editorBody.scrollIntoView({ behavior: 'smooth' });
     }
     
  });

  //标签数据
  document.addEventListener("DOMContentLoaded", function () {
    memosPath = window.localStorage && window.localStorage.getItem("memos-access-path");
    memosOpenId = window.localStorage && window.localStorage.getItem("memos-access-token");
    if (memosPath && memosOpenId) {
        document.querySelector(".memos-tag-list").classList.remove("d-none"); 
    }
 });

 //代码
  codeBtn.addEventListener("click", function () {
    let memoCode = "```\n\n```";
    insertValue(memoCode,"",4);
  });

  //代码单反引号
  codesingle.addEventListener("click", function () {
    insertValue("``","`",1)
  });

  //超级链接
  linkBtn.addEventListener("click", function () {
    insertValue("[]()","[",1)
  });
  
  //图片外链引用
  linkimg.addEventListener("click", function () {
    insertValue("![]()","!",1)
  });

  //以上四项的光标定位
  function insertValue(text,wrap,back) {
    memosTextarea.focus();
    const start = memosTextarea.selectionStart;
    const end = memosTextarea.selectionEnd;
    const selectedText = memosTextarea.value.substring(start, end);
    if(selectedText == ""){
      memosTextarea.value = memosTextarea.value.substring(0, start) + text + memosTextarea.value.substring(end);
      memosTextarea.selectionStart = start + text.length - back;
      memosTextarea.selectionEnd = start + text.length - back;
    }else{
      let wrapSelText;
      if( wrap == "`" ){
        wrapSelText = "`" + selectedText + "`";
        back = 0;
      }
      if( wrap == "[" ){
        wrapSelText = "[" + selectedText + "]()";
      }
      if( wrap == "!" ){
        wrapSelText = "![" + selectedText + "]()";
      }
      const newText = memosTextarea.value.substring(0, start) + wrapSelText + memosTextarea.value.substring(end);
      memosTextarea.value = newText;
      memosTextarea.selectionStart = start + wrapSelText.length - back;
      memosTextarea.selectionEnd = end + wrapSelText.length - back - selectedText.length;
    }
  }

  memosVisibilitySelect.addEventListener('change', function() {
    memoNowSelct = window.localStorage && window.localStorage.getItem("memos-visibility-select");
    var selectedValue = memosVisibilitySelect.value;
    window.localStorage && window.localStorage.setItem("memos-visibility-select",selectedValue);
    if(memoNowSelct == "PRIVATE" && selectedValue == "PUBLIC"){
      memoChangeDate = 1;
    }
  });
  
  //私有模式筛选浏览
  privateBtn.addEventListener("click", async function () {
    if (!privateBtn.classList.contains("private")) {
      privateBtn.classList.add("private")
      memosVisibilitySelect.value = "PRIVATE"
      window.localStorage && window.localStorage.setItem("memos-mode",  "NOPUBLIC");
      reloadList("NOPUBLIC")
      cocoMessage.success("已进入私有浏览")
    }else{
      memosVisibilitySelect.value = "PUBLIC"
      window.localStorage && window.localStorage.setItem("memos-mode",  "");
      privateBtn.classList.remove("private")
      reloadList()
      cocoMessage.success("已退出私有浏览")
    }
  });

  //开启回忆一条
  oneDayBtn.addEventListener("click", async function () {
    let oneDay = window.localStorage && window.localStorage.getItem("memos-oneday");
    if (oneDay == null ) {
      window.localStorage && window.localStorage.setItem("memos-oneday","open");
      cocoMessage.success("已开启回忆，请刷新页面")
    }else{
      window.localStorage && window.localStorage.removeItem("memos-oneday");
      reloadList()
      cocoMessage.success("已退出回忆")
    }
  });

  //图片上传
  uploadImageInput.addEventListener('change', () => {
    memosPath = window.localStorage && window.localStorage.getItem("memos-access-path");
    memosOpenId = window.localStorage && window.localStorage.getItem("memos-access-token");
      if (memosPath && memosOpenId) {
      let filesData = uploadImageInput.files[0];
      if (uploadImageInput.files.length !== 0){
        uploadImage(filesData);
        cocoMessage.info('图片上传中……');
      }
    }
  });

  async function uploadImage(data) {
        let memosResourceListNow = JSON.parse(window.localStorage && window.localStorage.getItem("memos-resource-list")) || [];
    let imageData = new FormData();
    let blobUrl = `${memosPath}/api/v1/resource/blob`;
    imageData.append('file', data, data.name)
    let resp = await fetch(blobUrl, {
      method: "POST",
      body: imageData,
      headers: {
        'Authorization': `Bearer ${memosOpenId}`
      }
    })
    let res = await resp.json();
    if(res.id){
      let resexlink = res.externalLink;
      let imgLink = '', fileId = '';
      if (resexlink) {
          imgLink = resexlink
      } else {
          fileId = res.publicId || res.filename
          imgLink = `${memosPath}/o/r/${res.id}`;///${fileId}
      }
      let imageList = "";
      imageList += `<div data-id="${res.id}" class="imagelist-item d-flex text-xs mt-2 mr-2" onclick="deleteImage(this)"><div class="d-flex memos-up-image" style="background-image:url(${imgLink})"><span class="d-none">${fileId}</span></div></div>`;
      document.querySelector(".memos-image-list").insertAdjacentHTML('afterbegin', imageList);
      cocoMessage.success(
      '上传成功',
      ()=>{
        memosResourceListNow.push(res.id);
        window.localStorage && window.localStorage.setItem("memos-resource-list",  JSON.stringify(memosResourceListNow));
        imageListDrag()
      })
    }
  };

  switchUserBtn.addEventListener("click", function () {
    memosPath = window.localStorage && window.localStorage.getItem("memos-access-path");
    memosOpenId = window.localStorage && window.localStorage.getItem("memos-access-token");
    if (memosPath && memosOpenId) {
      memosEditorOption.classList.remove("d-none");
      memosEditorInner.classList.add("d-none");
      memosRadomCont.innerHTML = '';
      tokenInput.value = '';
      pathInput.value = '';
    }
  });

  submitApiBtn.addEventListener("click", function () {
    if(tokenInput.value == null || tokenInput.value == ''){
      cocoMessage.info('请输入 Token');
    }else if(pathInput.value == null || pathInput.value == ''){
      cocoMessage.info('请输入 Memos 地址');
    }else{
      getMemosData(pathInput.value,tokenInput.value);
    }
  });

  submitMemoBtn.addEventListener("click", function () {
    memosContent = memosTextarea.value;
    memosVisibility = memosVisibilitySelect.value;
    memosResource = window.localStorage && JSON.parse(window.localStorage.getItem("memos-resource-list"));
    memosOpenId = window.localStorage && window.localStorage.getItem("memos-access-token");
    let TAG_REG = /(?<=#)([^#\s!.,;:?"'()]+)(?= )/g;
    let memosTag = memosContent.match(TAG_REG);
    let  hasContent = memosContent.length !== 0;
    if (memosOpenId && hasContent) {
      let memoUrl = `${memosPath}/api/v1/memo`;
      let memoBody = {content:memosContent,relationList:memosRelation,resourceIdList:memosResource,visibility:memosVisibility}
      fetch(memoUrl, {
        method: 'POST',
        body: JSON.stringify(memoBody),
        headers: {
          'Authorization': `Bearer ${memosOpenId}`,
          'Content-Type': 'application/json'
        }
      }).then(function (res) {
        if (res.status == 200) {
          if (memosTag !== null) {
            let memoTagUrl = `${memosPath}/api/v1/tag`;
            (async () => {
              for await (const i of memosTag) {
                const response = await fetch(memoTagUrl, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${memosOpenId}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    name: i
                  })
                });
              }
            })();
          }
          cocoMessage.success(
            '唠叨成功',
            () => {
              document.querySelector(".memos-image-list").innerHTML = '';
              window.localStorage && window.localStorage.removeItem("memos-resource-list");
              window.localStorage && window.localStorage.removeItem("memos-relation-list");
              memosTextarea.value = '';
              memosTextarea.style.height = 'inherit';
              let memosMode = window.localStorage && window.localStorage.getItem("memos-mode");
              reloadList(memosMode)
            })
        }
      });
      
    }else if(!hasContent){
      cocoMessage.info('内容不能为空');
    }else{
      cocoMessage.info(
        '请设置 Access Tokens',
        () => {
          memosEditorInner.classList.add("d-none");
          memosEditorOption.classList.remove("d-none");
        }
      );
    }
  });

  function hasMemosOpenId() {
    if (!memosOpenId) {
      memosEditorOption.classList.remove("d-none"); 
      cocoMessage.info('请设置 Access Tokens');
    }else{
      const tagUrl = `${memosPath}/api/v1/tag`;
      const response = fetch(tagUrl,{
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${memosOpenId}`,
          'Content-Type': 'application/json'
        } 
      }).then(response => response.json()).then(resdata => {
        return resdata
      }).then(response => {
        let taglist = "";
        response.map((t)=>{
          taglist += `<div class="memos-tag d-flex text-xs mt-2 mr-2"><a class="d-flex px-2 justify-content-center" onclick="setMemoTag(this)">#${t}</a></div>`;
        })
        document.querySelector(".memos-tag-list").innerHTML = taglist;
        // cocoMessage.success('准备就绪');
        memosEditorInner.classList.remove("d-none");
        memosEditorOption.classList.add("d-none"); 
        memosRadomCont.classList.remove("d-none");
      }).catch(err => {
        memosEditorOption.classList.remove("d-none");
        cocoMessage.error('Access Tokens 有误，请重新输入!');
      });
    }
  }

  function random(a,b) {
    let choices = b - a + 1;
    return Math.floor(Math.random() * choices + a);
  }

  async function getMemosData(p,t) {
    try {
      let response = await fetch(`${p}/api/v1/memo`,{
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${t}`,
          'Content-Type': 'application/json'
        } 
      });
      if (response.ok) {
        let resdata = await response.json();
        if (resdata) {
          memosCount = resdata.length;
          window.localStorage && window.localStorage.setItem("memos-access-path", p);
          window.localStorage && window.localStorage.setItem("memos-access-token", t);
          window.localStorage && window.localStorage.setItem("memos-response-count", memosCount);
          cocoMessage.success('保存成功', () => {
            memosPath = window.localStorage && window.localStorage.getItem("memos-access-path");
            memosOpenId = window.localStorage && window.localStorage.getItem("memos-access-token");
            location.reload();
            hasMemosOpenId();
          });
        }
      } else {
        cocoMessage.error('出错了，再检查一下吧!');
      }
    } catch (error) {
      cocoMessage.error('出错了，再检查一下吧!');
    }
  }

  async function updateAvatarUrl(e) {
    try {
      let response = await fetch(`${memosPath}/api/v1/user/me`,{
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${memosOpenId}`,
          'Content-Type': 'application/json'
        }
      });
      if (response.ok) {
        let resdata = await response.json();
        e.forEach(item => {
          item.avatarUrl = resdata.avatarUrl;
        });
        updateRadom(e);
      } else {
        cocoMessage.error('出错了，再检查一下吧!');
      }
    } catch (error) {
      cocoMessage.error('出错了，再检查一下吧!');
    }
  }
}

//发布框 TAG
function setMemoTag(e){
  let memoTag = e.textContent + " ";
  memosTextarea.value += memoTag;
}

function deleteImage(e){
  if(e){
    let memoId = e.getAttribute("data-id")
    let memosResource = window.localStorage && JSON.parse(window.localStorage.getItem("memos-resource-list"));
    let memosResourceList = memosResource.filter(function(item){ return item != memoId});
    window.localStorage && window.localStorage.setItem("memos-resource-list",  JSON.stringify(memosResourceList));
    e.remove()
  } 
}

//图片上传缩略图拖动顺序
function imageListDrag(){// 获取包含所有图像元素的父元素
  const imageList = document.querySelector('.memos-image-list');
  // 存储被拖动的元素
  let draggedItem = null;
  let memosResourceList;
  // 为每个图像元素添加拖动事件监听器
  imageList.querySelectorAll('.imagelist-item').forEach(item => {
    item.draggable = true;
    // 当拖动开始时
    item.addEventListener('dragstart', function(e) {
      // 存储被拖动的元素
      draggedItem = this;
      memosResourceList = [];
    });
    // 当拖动元素进入目标区域时
    item.addEventListener('dragover', function(e) {
      e.preventDefault(); // 阻止默认行为
      this.classList.add('dragover'); // 添加拖动进入样式
    });
  
    // 当拖动元素离开目标区域时
    item.addEventListener('dragleave', function() {
      this.classList.remove('dragover'); // 移除拖动进入样式
    });
  
    // 当拖动元素放置到目标区域时
    item.addEventListener('drop', function(e) {
      e.preventDefault(); // 阻止默认行为
      this.classList.remove('dragover'); // 移除拖动进入样式
      // 计算拖动元素中心点
      const rect = this.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      // 判断鼠标相对中心点的位置
      const isLeft = e.clientX < centerX;
      if (isLeft) {
        // 插入到前一个元素前
        this.parentNode.insertBefore(draggedItem, this.previousElementSibling);
      } else {
        // 插入到后一个元素后  
        this.parentNode.insertBefore(draggedItem, this.nextElementSibling); 
      }
      document.querySelectorAll('.memos-image-list .imagelist-item').forEach((item) => {
        let itemId = Number(item.dataset.id)
        memosResourceList.push(itemId);
      })
      window.localStorage && window.localStorage.setItem("memos-resource-list",  JSON.stringify(memosResourceList));
    });
  });
}

// Emoji表情选择

let emojiSelectorVisible = false;
let emojiSelector;
let emojis = []; // 缓存表情数据

// 页面加载时获取表情数据
window.addEventListener("DOMContentLoaded", async () => {
  try {
    emojis = await getEmojisData(); // 获取表情数据
  } catch (error) {
    console.error('Failed to fetch emojis data:', error);
  }
});

// 表情选择器点击事件处理
biaoqing.addEventListener("click", function (event) {
  event.stopPropagation();
  emojiSelectorVisible = !emojiSelectorVisible;
  const memosPath = window.localStorage && window.localStorage.getItem("memos-access-path");
  const memosOpenId = window.localStorage && window.localStorage.getItem("memos-access-token");

  if (emojiSelectorVisible && memosPath && memosOpenId) {
    displayEmojiSelector();
  } else {
    emojiSelector?.remove();
  }
});

// 显示表情选择器
function displayEmojiSelector() {
  if (!emojiSelector) {
    emojiSelector = document.createElement('div');
    emojiSelector.classList.add('emoji-selector');

    // 使用事件代理，将事件监听器添加到父元素上
    emojiSelector.addEventListener('click', (event) => {
      const target = event.target;
      if (target.classList.contains('emoji-item')) {
        insertEmoji(target.innerHTML); // 直接插入emoji图标
      }
    });
  }

  emojiSelector.innerHTML = ''; // 清空表情选择器内容

  emojis.forEach(emoji => {
    const emojiItem = document.createElement('div');
    emojiItem.classList.add('emoji-item');
    emojiItem.innerHTML = emoji.icon;
    emojiItem.title = emoji.text;
    emojiSelector.appendChild(emojiItem);
  });

  // 将表情下拉框插入到对应位置
  const memosEditorTools = document.querySelector(".memos-editor-footer");
  if (memosEditorTools) {
    memosEditorTools.insertAdjacentElement('afterend', emojiSelector);
  }
}

// 获取json文件中的数据
async function getEmojisData() {
  const response = await fetch('/suju/owo.json');
  const data = await response.json();
  return data.Emoji.container;
}

// 表情光标位置
function insertEmoji(emojiText) {
  const selectionStart = memosTextarea.selectionStart;
  const newValue = `${memosTextarea.value.substring(0, selectionStart)}${emojiText}${memosTextarea.value.substring(memosTextarea.selectionEnd)}`;
  memosTextarea.value = newValue;
  memosTextarea.dispatchEvent(new Event('input'));
  const newCursorPosition = selectionStart + emojiText.length;
  memosTextarea.setSelectionRange(newCursorPosition, newCursorPosition);
  memosTextarea.focus();
}


// 标签自动补全

const tagListElement = document.querySelector('.memos-tag-list');
const tagMenu = document.getElementById('memos-tag-menu');
let selectedTagIndex = -1;

const getMatchingTags = (tagPrefix) => {
  const allTags = Array.from(tagListElement.querySelectorAll('.memos-tag a')).map(tagLink => tagLink.textContent);
  return allTags.filter(tag => tag.toLowerCase().includes(tagPrefix.toLowerCase()));
};

const hideTagMenu = () => tagMenu.style.display = 'none';

const showTagMenu = (matchingTags) => {
  tagMenu.innerHTML = matchingTags.map(tag => `<div class="tag-option">${tag}</div>`).join('');
  const { left, bottom } = memosTextarea.getBoundingClientRect();
  tagMenu.style.cssText = `display: block;`;
  selectedTagIndex = -1;
};

const insertSelectedTag = (tag) => {
  const inputValue = memosTextarea.value;
  const cursorPosition = memosTextarea.selectionStart;

  const textBeforeCursor = inputValue.substring(0, cursorPosition);
  const lines = textBeforeCursor.split('\n');
  const lastLine = lines[lines.length - 1];
  const wordsBeforeCursor = lastLine.split(/\s+/);

  wordsBeforeCursor.pop();

  const newLastLine = `${wordsBeforeCursor.join(' ')} ${tag} `;  
  const newValue = inputValue.replace(lastLine, newLastLine);

  memosTextarea.value = newValue;

  const newCursorPosition = newValue.lastIndexOf(tag) + tag.length + 1;

  hideTagMenu();
  selectedTagIndex = -1;

  memosTextarea.focus();
  memosTextarea.setSelectionRange(newCursorPosition, newCursorPosition);
};

memosTextarea.addEventListener('input', () => {
  const inputValue = memosTextarea.value;
  const cursorPosition = memosTextarea.selectionStart;

  const lastWord = inputValue.substring(0, cursorPosition).split(/\s+/).pop();

  if (lastWord && lastWord.includes('#')) {
    const matchingTags = getMatchingTags(lastWord);
    matchingTags.length > 0 ? showTagMenu(matchingTags) : hideTagMenu();
  } else {
    hideTagMenu();
  }
});

memosTextarea.addEventListener('keydown', event => {
  const keyCode = event.keyCode;

  if (tagMenu.style.display === 'block') {
    const matchingTags = Array.from(tagMenu.querySelectorAll('.tag-option')).map(tag => tag.textContent);

    if (keyCode === 38 || keyCode === 40 || keyCode === 37 || keyCode === 39) { // 添加左右方向键的处理
      event.preventDefault();
      if (keyCode === 37 || keyCode === 39) { // 处理左右方向键
        const direction = keyCode === 37 ? -1 : 1;
        selectedTagIndex = (selectedTagIndex + direction + matchingTags.length) % matchingTags.length;
      } else { // 处理上下方向键
        selectedTagIndex = (selectedTagIndex + (keyCode === 38 ? -1 : 1) + matchingTags.length) % matchingTags.length;
      }
      Array.from(tagMenu.querySelectorAll('.tag-option')).forEach((option, index) => option.classList.toggle('selected', index === selectedTagIndex));
    } else if (keyCode === 13 && selectedTagIndex !== -1) {
      event.preventDefault();
      insertSelectedTag(matchingTags[selectedTagIndex]);
    }
  }
});

tagMenu.addEventListener('click', event => {
  insertSelectedTag(event.target.textContent);
});


//修改
let memosOldSelect;
function editMemo(memo) {
  memosOldSelect = memosVisibilitySelect.value;
  getEditor = window.localStorage && window.localStorage.getItem("memos-editor-display");
  memosOpenId = window.localStorage && window.localStorage.getItem("memos-access-token");
  if(memosOpenId && getEditor == "show"){
    document.querySelector(".memos-image-list").innerHTML = '';
    let e = JSON.parse(memo.getAttribute("data-form"));
    memoResList = e.resourceList,memosResource = [],imageList = "";
    memosVisibilitySelect.value = e.visibility;
    window.localStorage && window.localStorage.setItem("memos-editor-dataform",JSON.stringify(e));
    window.localStorage && window.localStorage.setItem("memos-visibility-select",memosVisibilitySelect.value);
    memosTextarea.value = e.content;
    memosTextarea.style.height = memosTextarea.scrollHeight + 'px';
    submitMemoBtn.classList.add("d-none");
    editMemoDom.classList.remove("d-none");
    if(memoResList.length > 0){
      for (let i = 0; i < memoResList.length; i++) {
        let imgLink = '', fileId = '',resexlink = memoResList[i].externalLink;
        if (resexlink) {
            imgLink = resexlink
        } else {
            fileId = memoResList[i].publicId || memoResList[i].filename
            imgLink = `${memosPath}/o/r/${memoResList[i].id}`;///${fileId}
        }
        memosResource.push(memoResList[i].id);
        imageList += `<div data-id="${memoResList[i].id}" class="imagelist-item d-flex text-xs mt-2 mr-2" onclick="deleteImage(this)"><div class="d-flex memos-up-image" style="background-image:url(${imgLink})"><span class="d-none">${fileId}</span></div></div>`;
      }


      window.localStorage && window.localStorage.setItem("memos-resource-list",  JSON.stringify(memosResource));
      document.querySelector(".memos-image-list").insertAdjacentHTML('afterbegin', imageList);
    }
    //平滑滚动到对应的class
    let editorBody = document.querySelector('.index-laodao');
    if (editorBody) {
    editorBody.scrollIntoView({ behavior: 'smooth' });
    }
  }
}

editMemoBtn.addEventListener("click", function () {
  let dataformNow = JSON.parse(window.localStorage && window.localStorage.getItem("memos-editor-dataform"));
  let memoId = dataformNow.id,memoRelationList = dataformNow.relationList,
  memosOpenId = window.localStorage && window.localStorage.getItem("memos-access-token"),
  memoContent = memosTextarea.value,
  memocreatedTs = dataformNow.createdTs,
  memoVisibility = memosVisibilitySelect.value,
  memoResourceList = window.localStorage && JSON.parse(window.localStorage.getItem("memos-resource-list"));
  if(memoChangeDate == 1){
    memocreatedTs = Math.floor(Date.now() / 1000);;
  }
  let hasContent = memoContent.length !== 0;
  if (hasContent) {
    let memoUrl = `${memosPath}/api/v1/memo/${memoId}`;
    let memoBody = {content:memoContent,id:memoId,createdTs:memocreatedTs,relationList:memoRelationList,resourceIdList:memoResourceList,visibility:memoVisibility}
    fetch(memoUrl, {
      method: 'PATCH',
      body: JSON.stringify(memoBody),
      headers: {
        'Authorization': `Bearer ${memosOpenId}`,
        'Content-Type': 'application/json'
      }
    }).then(function(res) {
      if (res.ok) {
        cocoMessage.success(
        '修改成功',
        ()=>{
            memoChangeDate = 0;
            memosVisibilitySelect.value = memosOldSelect;
            submitMemoBtn.classList.remove("d-none");
            editMemoDom.classList.add("d-none");
            document.querySelector(".memos-image-list").innerHTML = '';
            window.localStorage && window.localStorage.removeItem("memos-resource-list");
            window.localStorage && window.localStorage.removeItem("memos-relation-list");
            memosTextarea.value = '';
            memosTextarea.style.height = 'inherit';
            window.localStorage && window.localStorage.removeItem("memos-editor-dataform");
            let memosMode = window.localStorage && window.localStorage.getItem("memos-mode");
            reloadList(memosMode)
        })
      }
    })
  }
})

//增加memo编辑的时候取消功能
cancelEditBtn.addEventListener("click", function () {
  if (!editMemoDom.classList.contains("d-none")) {
    memosVisibilitySelect.value = memosOldSelect;
    document.querySelector(".memos-image-list").innerHTML = '';
    window.localStorage && window.localStorage.removeItem("memos-resource-list");
    window.localStorage && window.localStorage.removeItem("memos-relation-list");
    memosTextarea.value = '';
    memosTextarea.style.height = 'inherit';
    window.localStorage && window.localStorage.removeItem("memos-editor-dataform");
    editMemoDom.classList.add("d-none");
    submitMemoBtn.classList.remove("d-none");
  }
})

//增加memos归档功能
function archiveMemo(memoId) {
  memosOpenId = window.localStorage && window.localStorage.getItem("memos-access-token");
  if(memosOpenId && memoId){
    let memoUrl = `${memosPath}/api/v1/memo/${memoId}`;
    let memoBody = {id:memoId,rowStatus:"ARCHIVED"};
    fetch(memoUrl, {
      method: 'PATCH',
      body: JSON.stringify(memoBody),
      headers: {
        'Authorization': `Bearer ${memosOpenId}`,
        'Content-Type': 'application/json'
      }
    }).then(function(res) {
      if (res.ok) {
        cocoMessage.success(
        '归档成功',
        ()=>{
          let memosMode = window.localStorage && window.localStorage.getItem("memos-mode");
          reloadList(memosMode)
        })
      }
    })
  }
}

//增加memo删除功能
function deleteMemo(memoId) {
  let isOk = confirm("确定要删除此条唠叨吗？");
  if(isOk){
  memosOpenId = window.localStorage && window.localStorage.getItem("memos-access-token");
  if(memosOpenId && memoId){
    let memoUrl = `${memosPath}/api/v1/memo/${memoId}`;
    fetch(memoUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${memosOpenId}`,
        'Content-Type': 'application/json'
      }
    }).then(function(res) {
      if (res.ok) {
        cocoMessage.success(
        '删除成功',
        ()=>{
          let memosMode = window.localStorage && window.localStorage.getItem("memos-mode");
          reloadList(memosMode)
        })
      }
    }).catch(err => {
      cocoMessage.error('出错了，再检查一下吧')
    })
  }
}
}

//无刷新
function reloadList(mode){
  var bberDom = document.querySelector("#bber");
  bberDom.innerHTML = '';
  memosOpenId = window.localStorage && window.localStorage.getItem("memos-access-token");
  var bbUrl;
  if(mode == "NOPUBLIC"){
    bbUrl = memos+"api/v1/memo";
  }if(mode == "ONEDAY"){
    let memosCount = window.localStorage && window.localStorage.getItem("memos-response-count");
    let random = Math.floor(Math.random() * memosCount)
    bbUrl = memos+"api/v1/memo?creatorId="+bbMemo.creatorId+"&limit=1&offset="+random;
  }else{
    bbUrl = memos+"api/v1/memo?creatorId="+bbMemo.creatorId+"&rowStatus=NORMAL&limit="+limit;
  }
  fetch(bbUrl,{
    headers: {
      'Authorization': `Bearer ${memosOpenId}`,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
    cache: 'no-store',
  }).then(res => res.json()).then( resdata =>{
    if (mode == "NOPUBLIC") {
      resdata = resdata.filter((item) => item.visibility !== "PUBLIC");
    }
    if(mode == "ONEDAY"){
      updateHTMl(resdata,"ONEDAY");
    }else{
      updateHTMl(resdata);
      var nowLength = resdata.length;
      if(nowLength < limit){ //返回数据条数小于 limit 则直接移除“加载更多”按钮，中断预加载
        document.querySelector("button.button-load").remove()
        return
      }
      mePage++
      offset = limit*(mePage-1)
      getNextList(mode)
    }
  });
}

//发布框中无内容时，唠叨一下按钮为透明度0.4
function handleTextareaInput() {
  var textarea = document.querySelector('.memos-editor-textarea');
  var submitButton = document.querySelector('.submit-memos-btn');
  submitButton.style.opacity = textarea.value.trim() !== '' ? 1 : 0.4;
}
handleTextareaInput();
document.querySelector('.memos-editor-textarea').addEventListener('input', handleTextareaInput);


//memos、评论链接跳转中间页
document.body.addEventListener('click', function(e) {
  let target = e.target.closest('.atk-comment-wrap a, .datacont a');
  if (target && !target.href.includes('koobai.com')) {
      e.preventDefault();
      let encodedUrl = btoa(target.href);
      let url = '/tiaozhuan?target=' + encodedUrl;
      window.open(url, '_blank');
  }
});