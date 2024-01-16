var hasLogin = 0 //没登录隐藏编辑归档按钮

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
// 增加memos编辑及归档
var memosOpenId = window.localStorage && window.localStorage.getItem("memos-access-token");
var memosPath = window.localStorage && window.localStorage.getItem("memos-access-path");
var getEditor = window.localStorage && window.localStorage.getItem("memos-editor-display");

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
let tagHtml = `<div id="memos-search-hide" style="display:none">
<div class="memos-search-all img-hide">
<div class="memos-search">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-auto opacity-30 dark:text-gray-200"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>
<input type="text" id="memos-search-input" placeholder="输入关键词，搜索唠叨..." onkeydown="searchMemoevent(event)">
</div>
<!--<div id="tag-list-all"></div>-->
</div>
</div>
<div id="tag-list"></div>` // TAG筛选 memos搜索
bbDom.insertAdjacentHTML('beforebegin', tagHtml); // TAG筛选
// showTaglist(); // 显示所有 TAG
var bbUrl = memos+"api/v1/memo?creatorId="+bbMemo.creatorId+"&rowStatus=NORMAL&limit="+limit;
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
  //在未展开评论时，默认显示评论数
  Artalk.loadCountWidget({
    server: 'https://c.koobai.com/',
    site: '空白唠叨', 
    countEl: '#ArtalkCount'
  });
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
function updateHTMl(data){
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
      var memo_id = data[i].id; //评论调用
      var bbContREG = data[i].content
      .replace(TAG_REG, "")
      .replace(IMG_REG, '')
      .replace(LINK_REG, '<img src="https://img.koobai.com/memos/memos_index_link.svg" class="datacont-link" /><a href="$2" target="_blank">$1</a>')
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
      result += `
      <li class="bb-list-li img-hide" id="${memo_id}">
        <div class="memos-pl">
        <div class="memos-zan"><emoji-reaction class="reactions" reactTargetId="/m/${memo_id}" theme="system" endpoint="https://like.yangle.vip" availableArrayString="👍,thumbs-up;"></emoji-reaction></div>
        ${hasLogin == 0 ? '' : `
        <div class="memos-edit">
         <div class="memos-menu">...</div>
         <div class="memos-menu-d">
         <div class="edit-btn" onclick="editMemo(${JSON.stringify(data[i]).replace(/"/g, '&quot;')})">修改</div>
         <div class="archive-btn" onclick="archiveMemo('${data[i].id}')">归档</div>
         <div class="delete-btn" onclick="deleteMemo('${data[i].id}')">删除</div> 
          </div>
          </div>
        `}
        </div>       
        <div class="datacont" view-image>${bbContREG}</div>
        <div class="memos_diaoyong_top">
        <div class="memos_diaoyong_time">${moment(data[i].createdTs * 1000).twitterLong()}</div>
        <div class="memos-tag-wz">${memosTag}</div>
        <div class="talks_comments">
            <a onclick="loadArtalk('${memo_id}')">
              <span id="ArtalkCount" data-page-key="/m/${memo_id}" class="comment-s"></span> 条评论  <span id="btn_memo_${memo_id}">
              </span>
            </a>
          </div>
        </div>
        <div id="memo_${memo_id}" class="artalk hidden"></div>
      </li>`;    
  } // end for

  var bbBefore = "<section class='bb-timeline'><ul class='bb-list-ul'>";
  var bbAfter = "</ul></section>";
  resultAll = bbBefore + result + bbAfter;
  bbDom.insertAdjacentHTML('beforeend', resultAll);

  animateSummaries(); // 在DOM加载完毕后执行滑动加载动画

  if(document.querySelector('button.button-load')) document.querySelector('button.button-load').textContent = '看更多 ...';
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

  //在未展开评论时，默认显示评论数
  Artalk.loadCountWidget({
    server: 'https://c.koobai.com/',
    site: '空白唠叨', 
    countEl: '#ArtalkCount'
  });
  })
}

// 显示所有 TAG
/* function showTaglist(){
  let bbUrl = 'https://memostag.yangle.vip/'
  let tagListDom = ""
  fetch(bbUrl).then(res => res.json()).then( resdata =>{
    for(let i=0;i < resdata.length;i++){
      tagListDom += `<div class="memos-tag-all img-hide" onclick='getTagNow(this)'># ${resdata[i]}</div>`
    }
    document.querySelector('#tag-list-all').innerHTML = tagListDom

    animateSummaries(); // 加载完毕后执行滑动加载动画
  })
}*/

// 搜索 Memos
function searchMemoevent(event) {
  if (event.key === "Enter") {
      searchMemo();
  }
}

function searchMemo() {
  let searchText = document.querySelector('#memos-search-input').value;
  let tagHtmlNow = `<div class='memos-tag-sc-2' onclick='javascript:location.reload();'><div class='memos-tag-sc-1' >关键词搜索:</div><div class='memos-tag-sc' >${searchText}<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-auto ml-1 opacity-40"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></div></div>`
  document.querySelector('#tag-list').innerHTML = tagHtmlNow;
  let bbUrl = memos + "api/v1/memo?creatorId=" + bbMemo.creatorId + "&content=" + searchText + "&limit=20";
  fetchMemoDOM(bbUrl);
}

function fetchMemoDOM(bbUrl) {
  fetch(bbUrl)
    .then(res => res.json())
    .then(resdata => {
      let arrData = resdata || '';
      if (resdata.data) {
        arrData = resdata.data;
      }
      if (arrData.length > 0) {
        // 清空旧的搜索结果和加载按钮
        document.querySelector(bbMemo.domId).innerHTML = "";
        if (document.querySelector("button.button-load")) {
          document.querySelector("button.button-load").remove();
        }
        updateHTMl(resdata);
      } else {
        alert("搜不到，尝试换一个关键词");
        setTimeout(() => location.reload(), 1000);
      }
    });
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
        allCommentBtns[i].innerHTML = '';
      }
    }

    commentDiv.classList.remove('hidden');
    commentBtn.innerHTML = '';
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
    commentBtn.innerHTML = '';
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

//点击按钮显示搜索框
function toggleSearch() {
  var searchContainer = document.getElementById("memos-search-hide");
  if(searchContainer.style.display === "none") {
    searchContainer.style.display = "block";
    
var input = document.getElementById("memos-search-input");
input.focus(); 
} else {
searchContainer.style.display = "none"; 
}
}