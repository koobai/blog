var memosDom = document.querySelector(memosData.dom);
var editIcon = "<div class='load-memos-editor'>唠叨</div>";
var memosEditorCont = `
<div class="memos-editor animate__animated animate__fadeIn d-none col-12">
  <div class="memos-editor-body mb-3 p-3">
    <div class="memos-editor-inner animate__animated animate__fadeIn">
    <div class="memos-editor-content">
    <textarea class="memos-editor-textarea text-sm" rows="1" placeholder="唠叨点什么..."></textarea>
    </div>
    <div id="memos-tag-menu"></div>
      <div class="memos-image-list d-flex flex-fill line-xl"></div>
      <div class="memos-editor-tools pt-3">
        <div class="d-flex">
          <div class="button outline action-btn tag-btn mr-2">
            <img src="https://img.koobai.com/memos/memos_tag.svg">
          </div>
          <div class="button outline action-btn image-btn mr-2" onclick="this.lastElementChild.click()">
            <img src="https://img.koobai.com/memos/memos_img_up.svg">
            <input class="memos-upload-image-input d-none" type="file" accept="image/*">
          </div>
          <div class="button outline p-2 action-btn code-btn mr-2">
            <img src="https://img.koobai.com/memos/memos_code.svg">
          </div>
          <div class="button outline action-btn code-single mr-2">
          <img src="https://img.koobai.com/memos/memos-code-s.svg">
          </div>
          <div class="button outline action-btn mr-2 link-btn">
            <img src="https://img.koobai.com/memos/memos_link.svg">
          </div>
          <div class="button outline action-btn mr-2 link-img">
          <img src="https://img.koobai.com/memos/memos_img_quote.svg">
        </div>
        <div class="button outline action-btn biao-qing mr-2">
        <img src="https://img.koobai.com/memos/memos-emoji.svg">
        </div>
          <div class="button outline action-btn p-2 switchUser-btn">
            <img src="https://img.koobai.com/memos/memos_user.svg">
          </div>
        </div>
        <div class="d-flex flex-fill">
          <div class="memos-tag-list d-none mt-2 animate__animated animate__fadeIn"></div>
        </div>
      </div>
      <div class="memos-editor-footer border-t pt-3 mt-3">
        <div class="editor-selector mr-2">
          <select class="select-memos-value outline px-2 py-1">
            <option value="PUBLIC">所有人可见</option>
            <option value="PROTECTED">仅登录可见</option>
            <option value="PRIVATE">仅自己可见</option>
          </select>
        </div>
        <div class="editor-submit d-flex flex-fill justify-content-end">
        <div class="edit-memos d-none">
        <div class="primary cancel-edit-btn mr-2 px-3 py-2">取消</div>
        <div class="primary edit-memos-btn px-3 py-2">修改完成</div>
        </div>
          <div class="primary submit-memos-btn px-3 py-1">唠叨一下</div>
        </div>
      </div>
    </div>
    <div class="memos-editor-option animate__animated animate__fadeIn">
      <input name="memos-api-url" class="memos-open-api-input input-text flex-fill mr-3 px-2 py-1" type="text" value="" maxlength="120" placeholder="OpenAPI">
      <div class="memos-open-api-submit">
        <div class="primary submit-openapi-btn px-3 py-1">保存</div>
      </div>
    </div>
  </div>
  <div class="memos-random d-none"></div>
</div>
`;


const element = document.querySelector('.intro'); // 选择器是你想要操作的元素的选择器
element.insertAdjacentHTML('afterend', editIcon);
memosDom.insertAdjacentHTML('afterbegin',memosEditorCont);


var memosEditorInner = document.querySelector(".memos-editor-inner"); 
var memosEditorOption = document.querySelector(".memos-editor-option");
var memosRadomCont = document.querySelector(".memos-random");

var taglistBtn = document.querySelector(".tag-btn");
var codeBtn = document.querySelector(".code-btn");
var codesingle = document.querySelector(".code-single");
var linkBtn = document.querySelector(".link-btn");
var linkimg = document.querySelector(".link-img");
var switchUserBtn = document.querySelector(".switchUser-btn");
var loadEditorBtn = document.querySelector(".load-memos-editor");
var submitApiBtn = document.querySelector(".submit-openapi-btn");
var submitMemoBtn = document.querySelector(".submit-memos-btn");
var memosVisibilitySelect = document.querySelector(".select-memos-value");
var openApiInput = document.querySelector(".memos-open-api-input");
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
  var memosContent = '',memosVisibility = '',memosResource = [],memosRelation=[];
  var memosCount = window.localStorage && window.localStorage.getItem("memos-response-count");
  var memosPath = window.localStorage && window.localStorage.getItem("memos-access-path");
  var memosOpenId = window.localStorage && window.localStorage.getItem("memos-access-token");
  var getEditor = window.localStorage && window.localStorage.getItem("memos-editor-display");
  var isHide = getEditor === "hide";
  window.localStorage && window.localStorage.setItem("memos-resource-list",  JSON.stringify(memosResource));
  window.localStorage && window.localStorage.setItem("memos-relation-list",  JSON.stringify(memosRelation));
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
    window.localStorage && window.localStorage.setItem("memos-editor-display", document.querySelector(".memos-editor").classList.contains("d-none") ? "hide" : "show");
    getEditor = window.localStorage && window.localStorage.getItem("memos-editor-display");
  });

  taglistBtn.addEventListener("click", function () {
    memosPath = window.localStorage && window.localStorage.getItem("memos-access-path");
    memosOpenId = window.localStorage && window.localStorage.getItem("memos-access-token");
    if (memosPath && memosOpenId) {
      document.querySelector(".memos-tag-list").classList.toggle("d-none"); 
    }
  });

  codeBtn.addEventListener("click", function() {
    const memosPath = window.localStorage?.getItem("memos-access-path");
    const memosOpenId = window.localStorage?.getItem("memos-access-token");
    if (memosPath && memosOpenId) {
      const memoCode = '```\n\n```';
      const textareaValue = memosTextarea.value;
      const lastBacktickIndex = textareaValue.lastIndexOf('```');
      const caretPos = lastBacktickIndex !== -1 ? lastBacktickIndex : textareaValue.length; // 将光标定位到最后一个 ``` 的位置
      memosTextarea.value = textareaValue.substring(0, caretPos) + memoCode;
      memosTextarea.style.height = memosTextarea.scrollHeight + 'px';
      memosTextarea.setSelectionRange(caretPos + 4, caretPos + 4); // 将光标定位到 ``` 中间
      memosTextarea.focus();
    }
  });

//代码单反引号
  codesingle.addEventListener("click", function() {
    const memosPath = window.localStorage?.getItem("memos-access-path");
    const memosOpenId = window.localStorage?.getItem("memos-access-token");
    if (memosPath && memosOpenId) {
      const memoCode = '`'; // 行内代码的起始和结束标记为单个反引号
      const textareaValue = memosTextarea.value;
      const selectionStart = memosTextarea.selectionStart;
      const selectionEnd = memosTextarea.selectionEnd;
      const selectedText = textareaValue.substring(selectionStart, selectionEnd);
      const insertCode = `${memoCode}${selectedText}${memoCode}`;
      const caretPos = selectionStart !== selectionEnd ? selectionEnd + memoCode.length * 2 : selectionStart + memoCode.length;
      
      memosTextarea.setRangeText(
        insertCode,
        selectionStart,
        selectionEnd,
        "end"
      ); 
      // 根据是否有选中内容，决定光标位置
      memosTextarea.setSelectionRange(caretPos, caretPos);
  
      memosTextarea.style.height = memosTextarea.scrollHeight + 'px';
      memosTextarea.focus();
    }
  });
  
  linkBtn.addEventListener("click", function() {
    const memosPath = window.localStorage?.getItem("memos-access-path");
    const memosOpenId = window.localStorage?.getItem("memos-access-token");
    if (memosPath && memosOpenId) {
      const memoLink = '[]()';
      const selectedText = memosTextarea.value.substring(memosTextarea.selectionStart, memosTextarea.selectionEnd);
      let caretPos;
  
      if (selectedText) {
        // 如果有选中的文本，则插入到 [] 中
        const startText = memosTextarea.value.substring(0, memosTextarea.selectionStart);
        const endText = memosTextarea.value.substring(memosTextarea.selectionEnd);
        caretPos = startText.length + '['.length + selectedText.length + ']'.length + 1;
        memosTextarea.value = startText + '[' + selectedText + ']' + memoLink.substring(2) + endText;
      } else {
        // 如果没有选中文本，则将光标定位在 ()
        const startText = memosTextarea.value.substring(0, memosTextarea.selectionStart);
        const endText = memosTextarea.value.substring(memosTextarea.selectionEnd);
        caretPos = startText.length + memoLink.indexOf("()") + 1;
        memosTextarea.value = startText + memoLink + endText;
      }
  
      memosTextarea.setSelectionRange(caretPos, caretPos);
      memosTextarea.focus();
    }
  });

  linkimg.addEventListener("click", function() {
    const memosPath = window.localStorage?.getItem("memos-access-path");
    const memosOpenId = window.localStorage?.getItem("memos-access-token");
    if (memosPath && memosOpenId) {
      const memoLink = '![]()';
      const caretPos = memosTextarea.selectionStart + memoLink.indexOf("()") + 1;
      memosTextarea.value = memosTextarea.value.substring(0, memosTextarea.selectionStart) + memoLink + memosTextarea.value.substring(memosTextarea.selectionEnd);
      memosTextarea.setSelectionRange(caretPos, caretPos);
      memosTextarea.focus();
    }
  });

  uploadImageInput.addEventListener('change', () => {
    memosPath = window.localStorage && window.localStorage.getItem("memos-access-path");
    memosOpenId = window.localStorage && window.localStorage.getItem("memos-access-token");
      if (memosPath && memosOpenId) {
      let filesData = uploadImageInput.files[0];
      if (uploadImageInput.files.length !== 0){
        uploadImage(filesData);
      }
    }
  });

  async function uploadImage(data) {
    const imageData = new FormData();
    const blobUrl = memosPath+"/api/v1/resource/blob?openId="+memosOpenId;
    imageData.append('file', data, data.name)
    const resp = await fetch(blobUrl, {
      method: "POST",
      body: imageData
    })
    const res = await resp.json().then(res => {
      if(res.id){
        let imageList = "";
        imageList += '<div data-id="'+res.id+'" class="memos-img-edit d-flex text-xs mt-2 mr-2" onclick="deleteImage(this)"><div class="d-flex px-2 justify-content-center">'+res.filename+'</div></div>'
        document.querySelector(".memos-image-list").insertAdjacentHTML('afterbegin', imageList);
        cocoMessage.success(
        '上传成功',
        ()=>{
          memosResource.push(res.id);
          window.localStorage && window.localStorage.setItem("memos-resource-list",  JSON.stringify(memosResource));
        })
      }
    })
  };

  switchUserBtn.addEventListener("click", function () {
    memosPath = window.localStorage && window.localStorage.getItem("memos-access-path");
    memosOpenId = window.localStorage && window.localStorage.getItem("memos-access-token");
    if (memosPath && memosOpenId) {
      memosEditorOption.classList.remove("d-none");
      memosEditorInner.classList.add("d-none");
      memosRadomCont.innerHTML = '';
      openApiInput.value = '';
    }
  });

  submitApiBtn.addEventListener("click", function () {
    if(openApiInput.value == null || openApiInput.value == ''){
      cocoMessage.info('内容不能为空');
    }else{
      getMemosData(openApiInput.value);
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
      let memoUrl = memosPath+"/api/v1/memo?openId="+memosOpenId;
      let memoBody = {content:memosContent,relationList:memosRelation,resourceIdList:memosResource,visibility:memosVisibility}
      fetch(memoUrl, {
        method: 'POST',
        body: JSON.stringify(memoBody),
        headers: {
          'Content-Type': 'application/json'
        }
      }).then(function (res) {
        if (res.status == 200) {
          if (memosTag !== null) {
            const memoTagUrl = memosPath + "/api/v1/tag?openId=" + memosOpenId;
            (async () => {
              for await (const i of memosTag) {
                const response = await fetch(memoTagUrl, {
                  method: 'POST',
                  headers: {
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
              location.reload();
            })
        }
      });
    }else if(!hasContent){
      cocoMessage.info('内容不能为空');
    }else{
      cocoMessage.info(
        '请设置 Memos Open API',
        () => {
          memosEditorInner.classList.add("d-none");
          memosEditorOption.classList.remove("d-none");
        }
      );
    }
  });

  function hasMemosOpenId() {
    if (!memosOpenId) {
      memosEditorInner.classList.add("d-none"); 
      cocoMessage.info('请设置 Memos Open API');
    }else{
      memosEditorOption.classList.add("d-none"); 
      // cocoMessage.success('准备就绪');
      let tagUrl = memosPath+"/api/v1/tag?openId="+memosOpenId;
      let response = fetch(tagUrl).then(response => response.json()).then(resdata => {
        return resdata
      }).then(response => {
        let taglist = "";
        response.map((t)=>{
          taglist += '<div class="memos-tag d-flex text-xs mt-2 mr-2"><a class="d-flex px-2 justify-content-center" onclick="setMemoTag(this)">#'+t+'</a></div>'
        })
        document.querySelector(".memos-tag-list").innerHTML = taglist;
        memosRadomCont.classList.remove("d-none");
      }).catch(err => cocoMessage.error('Memos Open API 有误，请重新输入!'));
    }
  }

  function random(a,b) {
    var choices = b - a + 1;
    return Math.floor(Math.random() * choices + a);
  }

  function getMemosData(e) {
    let apiReg = /openId=([^&]*)/,urlReg = /(.+?)(?:\/api)/;
    fetch(e).then(res => {
      if (res.status == 200) {
        return res.json()
      }else{
        cocoMessage.error('出错了，再检查一下吧!')
      }
    }).then(resdata => {
      if(typeof(resdata) !== "undefined"){
        let apiRes = e.match(apiReg),urlRes = e.match(urlReg)[1];
        memosOpenId = apiRes[1];
        memosPath = urlRes;
        memosCount = resdata.length;
        window.localStorage && window.localStorage.setItem("memos-access-path", urlRes);
        window.localStorage && window.localStorage.setItem("memos-access-token", memosOpenId);
        window.localStorage && window.localStorage.setItem("memos-response-count", memosCount);
        cocoMessage.success(
        '保存成功',
        ()=>{
          memosEditorOption.classList.add("d-none");
          memosEditorInner.classList.remove("d-none"); 
          memosPath = window.localStorage && window.localStorage.getItem("memos-access-path");
          memosOpenId = window.localStorage && window.localStorage.getItem("memos-access-token");
          hasMemosOpenId();
        })
      }
    })
  };
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

//增加memos编辑功能
function editMemo(e) {
  var memoContent = e.content,memoId = e.id,memoRelationList = e.relationList,memoResourceList = e.resourceList,memoVisibility = e.visibility;
  getEditor = window.localStorage && window.localStorage.getItem("memos-editor-display"),
  memosOpenId = window.localStorage && window.localStorage.getItem("memos-access-token");
  if(memosOpenId && getEditor == "show"){
    memosTextarea.value = memoContent;
    memosTextarea.style.height = memosTextarea.scrollHeight + 'px';
    submitMemoBtn.classList.add("d-none");
    editMemoDom.classList.remove("d-none");
    document.body.scrollIntoView({behavior: 'smooth'});
  }
  editMemoBtn.addEventListener("click", function () {
    memosOpenId = window.localStorage && window.localStorage.getItem("memos-access-token"),
    memoContent = memosTextarea.value;
    memoResourceList = window.localStorage && JSON.parse(window.localStorage.getItem("memos-resource-list")) ? window.localStorage && JSON.parse(window.localStorage.getItem("memos-resource-list")) : e.resourceList,
    memoVisibility = memosVisibilitySelect.value;
    let TAG_REG = /(?<=#)([^#\s!.,;:?"'()]+)(?= )/g;
    let memosTag = memoContent.match(TAG_REG);
    let hasContent = memoContent.length !== 0;
    if (hasContent) {
      var memoUrl = memosPath+"/api/v1/memo/"+memoId+"?openId="+memosOpenId;
      var memoBody = {content:memoContent,id:memoId,relationList:memoRelationList,resourceList:memoResourceList,visibility:memoVisibility}
      fetch(memoUrl, {
        method: 'PATCH',
        body: JSON.stringify(memoBody),
        headers: {
          'Content-Type': 'application/json'
        }
      }).then(function(res) {
        if (res.status == 200) {
          if (memosTag !== null) {
            const memoTagUrl = memosPath + "/api/v1/tag?openId=" + memosOpenId;
            (async () => {
              for await (const i of memosTag) {
                const response = await fetch(memoTagUrl, {
                  method: 'POST',
                  headers: {
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
          '修改成功',
          ()=>{
            submitMemoBtn.classList.remove("d-none");
            editMemoDom.classList.add("d-none");
            location.reload();
          })
        }
      })
    }
  })
}

//增加memo编辑的时候取消功能
cancelEditBtn.addEventListener("click", function () {
  if (!editMemoDom.classList.contains("d-none")) {
    memosTextarea.value = '';
    memosTextarea.style.height = 'inherit';
    editMemoDom.classList.add("d-none");
    submitMemoBtn.classList.remove("d-none");
  }
})

//增加memos归档功能
function archiveMemo(memoId) { //获取Memos的ID值
  memosOpenId = window.localStorage && window.localStorage.getItem("memos-access-token"); //登录信息
  if(memosOpenId && memoId){ //判断是否登录以及获取到Memos的ID值
    var memoUrl = memosPath+"/api/v1/memo/"+memoId+"?openId="+memosOpenId;
    var memoBody = {id:memoId,rowStatus:"ARCHIVED"};
    fetch(memoUrl, {
      method: 'PATCH',
      body: JSON.stringify(memoBody),
      headers: {
        'Content-Type': 'application/json'
      }
    }).then(function(res) {
      if (res.status == 200) {
        cocoMessage.success(
        '归档成功',
        ()=>{
          location.reload();
        })
      }
    })
  }
}

//增加memo删除功能
function deleteMemo(memoId) {
  memosOpenId = window.localStorage && window.localStorage.getItem("memos-access-token");
  if(memosOpenId && memoId){
    var memoUrl = memosPath+"/api/v1/memo/"+memoId+"?openId="+memosOpenId;
    fetch(memoUrl, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      }
    }).then(function(res) {
      if (res.status == 200) {
        cocoMessage.success(
        '删除成功',
        ()=>{
          location.reload();
        })
      }
    }).catch(err => {
      cocoMessage.error('出错了，再检查一下吧')
    })
  }
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
  const memosEditorTools = document.querySelector(".memos-editor-tools");
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

const tags = [];
const tagMenu = document.getElementById('memos-tag-menu');
let selectedTagIndex = -1;

const getMatchingTags = (tagPrefix) => tags.filter(tag => tag.toLowerCase().includes(tagPrefix.toLowerCase()));
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
  const wordsBeforeCursor = textBeforeCursor.split(/\s+/);
  wordsBeforeCursor.pop();
  const newValue = `${wordsBeforeCursor.join(' ')} ${tag} ${inputValue.substring(cursorPosition)}`;

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