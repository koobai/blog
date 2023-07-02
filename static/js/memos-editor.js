var memosDom = document.querySelector("#memos");
var editIcon = "<div class='load-memos-editor'>唠叨</div>";
var editorCont = "<div class='memos-editor animate__animated animate__fadeIn d-none col-12'><div class='memos-editor-body mb-3 p-3'><div class='memos-editor-inner animate__animated animate__fadeIn'><div class='memos-editor-content'><textarea class='memos-editor-inputer text-sm' rows='1' placeholder='唠叨一下...'></textarea></div><div class='memos-editor-tools pt-3'><div class='d-flex'><div class='button outline action-btn tag-btn mr-2'><img src='https://img.koobai.com/memos/memos-tag.svg'></div><div class='button outline action-btn todo-btn mr-2'><img src='https://img.koobai.com/memos/memos-list.svg'></i></div><div class='button outline action-btn code-btn mr-2'><img src='https://img.koobai.com/memos/memos-code.svg'></div><div class='button outline action-btn link-btn'><img src='https://img.koobai.com/memos/memos-link.svg'></div></div><div class='d-flex flex-fill'><div class='memos-tag-list d-none mt-2 animate__animated animate__fadeIn'></div></div></div><div class='memos-editor-footer border-t pt-3 mt-3'><div class='editor-selector mr-2'><select class='select-memos-value outline px-2 py-1'><option value='PUBLIC'>所有人可见</option><option value='PROTECTED'>登录用户可见</option><option value='PRIVATE'>仅自己可见</option></select></div><div class='editor-submit d-flex flex-fill justify-content-end'><div class='primary submit-memos-btn px-3 py-1'>保存</div></div></div></div><div class='memos-editor-option animate__animated animate__fadeIn'><input name='memos-api-url' class='memos-open-api-input input-text flex-fill mr-3 px-2 py-1' type='text' value='' maxlength='120' placeholder='OpenAPI'><div class='memos-open-api-submit'><div class='primary submit-openapi-btn px-3 py-1'>保存</div></div></div></div></div>";

const element = document.querySelector('.intro'); // 选择器是你想要操作的元素的选择器
element.insertAdjacentHTML('afterend', editIcon);
memosDom.insertAdjacentHTML('afterbegin',editorCont);

var memosEditorInner = document.querySelector(".memos-editor-inner"); 
var memosEditorOption = document.querySelector(".memos-editor-option");

var taglistBtn = document.querySelector(".tag-btn");
var todoBtn = document.querySelector(".todo-btn");
var todoBtn = document.querySelector(".todo-btn");
var codeBtn = document.querySelector(".code-btn");
var linkBtn = document.querySelector(".link-btn");
var loadEditorBtn = document.querySelector(".load-memos-editor");
var submitApiBtn = document.querySelector(".submit-openapi-btn");
var submitMemoBtn = document.querySelector(".submit-memos-btn");

var memosVisibilitySelect = document.querySelector(".select-memos-value");
var memosTextarea = document.querySelector(".memos-editor-inputer");
var openApiInput = document.querySelector(".memos-open-api-input");

document.addEventListener("DOMContentLoaded", () => {
  getEditIcon();
});

function getEditIcon() {
  var memosOpenId = getCookie("open-api");
  var memosContent = '',memosVisibility = '';
  var getEditor = window.localStorage && window.localStorage.getItem("memos-editor");
  var isHide = getEditor === "hide";
  memosTextarea.addEventListener('input', (e) => {
    memosTextarea.style.height = 'inherit';
    memosTextarea.style.height = e.target.scrollHeight + 'px';
  });

  if (getEditor !== null) {
		document.querySelector(".memos-editor").classList.toggle("d-none",isHide);
    getEditor == "show" ? hasMemosOpenId() : ''
	};

  loadEditorBtn.addEventListener("click", function () {
    getEditor != "show" ? hasMemosOpenId() : ''
    document.querySelector(".memos-editor").classList.toggle("d-none"); 
    window.localStorage && window.localStorage.setItem("memos-editor", document.querySelector(".memos-editor").classList.contains("d-none") ? "hide" : "show");
    getEditor = window.localStorage && window.localStorage.getItem("memos-editor");
  });

  taglistBtn.addEventListener("click", function () {
    if (memosOpenId) {
      document.querySelector(".memos-tag-list").classList.toggle("d-none"); 
    }
  });

  todoBtn.addEventListener("click", function () {
    if (memosOpenId) {
      let memoTodo = "- [ ] ";
      memosTextarea.value += memoTodo
    }
  });

  codeBtn.addEventListener("click", function () {
    if (memosOpenId) {
      let memoCode = "```\n\n```";
      let textareaH = memosTextarea.clientHeight;
      memosTextarea.value += memoCode;
      memosTextarea.style.height = textareaH * 3 + 'px';
    }
  });

  linkBtn.addEventListener("click", function () {
    if (memosOpenId) {
      let memoLink = "[]()";
    memosTextarea.value += memoLink;
    }
  });

  submitApiBtn.addEventListener("click", function () {
    getMemosData(openApiInput.value)
  });

  submitMemoBtn.addEventListener("click", function () {
    memosContent = memosTextarea.value
    memosVisibility = memosVisibilitySelect.value
    let  hasContent = memosContent.length !== 0;
    if (memosOpenId && hasContent) {
      let memoUrl = bbMemo.memos+"api/memo?openId="+memosOpenId;
      let memoBody = {content:memosContent,visibility:memosVisibility}
      fetch(memoUrl, {
        method: 'post',
        body: JSON.stringify(memoBody),
        headers: {
          'Content-Type': 'application/json'
        }
      }).then(function(res) {
        if (res.status == 200) {
          cocoMessage.success(
          '发送成功',
          ()=>{
            location.reload();
          })
        }
      })
    }else{
      cocoMessage.info('内容不能为空');
    }
  });

  function hasMemosOpenId() {
    if (!memosOpenId) {
      memosEditorInner.classList.add("d-none"); 
      cocoMessage.info('请设置 Memos Open API');
    }else{
      memosEditorOption.classList.add("d-none"); 
     // cocoMessage.success('准备就绪');
      let tagUrl = bbMemo.memos+"api/tag?openId="+memosOpenId;
      let response = fetch(tagUrl).then(response => response.json()).then(resdata => {
        return resdata.data
      }).then(response => {
        let taglist = "";
        response.map((t)=>{
          taglist += "<div class='memos-tag d-flex text-xs mt-2 mr-2'><a class='d-flex px-2 justify-content-center' onclick='setMemoTag(this)'>#"+t+"</a></div>"
        })
        document.querySelector(".memos-tag-list").insertAdjacentHTML('beforeend', taglist);
      }).catch(err => cocoMessage.error('Memos Open API 有误，请重新输入!'));
    }
  }

  function getMemosData(e) {
    let apiReg = /openId=([^&]*)/;
    fetch(e).then(res => {
      if (res.status == 200) {
        let apiRes = e.match(apiReg);
        memosOpenId = apiRes[1]
        setCookie("open-api",memosOpenId);
        cocoMessage.success(
        '保存成功',
        ()=>{
          memosEditorOption.classList.add("d-none");
          memosEditorInner.classList.remove("d-none"); 
          memosOpenId = getCookie("open-api");
          hasMemosOpenId()
        })
      }else{
        cocoMessage.error('出错了，再检查一下吧!')
      }
    })
    .catch(err => {cocoMessage.error('出错了，再检查一下吧!')});
  }

  function getCookie(name) {
    var allcookies = document.cookie;
    var cookie_pos = allcookies.indexOf(name);
    // 如果找到了索引，就代表cookie存在,否则不存在
    if (cookie_pos != -1) {
        cookie_pos = cookie_pos + name.length + 1;
        //计算取cookie值得结束索引
        var cookie_end = allcookies.indexOf(";", cookie_pos);
        if (cookie_end == -1) {
          cookie_end = allcookies.length;
        }
        //得到想要的cookie的值
        var value = unescape(allcookies.substring(cookie_pos, cookie_end));
    }
    return value;
  }

  function setCookie(name, val) {
    var data = new Date();
    data.setTime(data.getTime() + 7 * 24 * 3600 * 1000)
    document.cookie = name + '=' + val + ';expires=' + data.toUTCString()
  }
}

function setMemoTag(e){
  let memoTag = e.textContent + " "
  memosTextarea.value += memoTag
}