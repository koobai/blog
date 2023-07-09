// 首页好物随机调用显示
function getRandomData() {
  fetch("/suju/hardware.json")
    .then(response => response.json())
    .then(data => {
      var goods = data.good;
      var randomIndex = Math.floor(Math.random() * goods.length);
      var randomGood = goods[randomIndex];
      document.getElementById("hardware-img").innerHTML = `<img loading="lazy" decoding="async" src="${randomGood.image}">`;
      document.getElementById("hardware-jiage").textContent = `${randomGood.jiage}`;
      document.getElementById("hardware-title").innerHTML = `${randomGood.title}`;
      document.getElementById("hardware-note").textContent = randomGood.note;
      document.getElementById("hardware-details").innerHTML = `<a href="${randomGood.link}" target="_blank">${randomGood.details}</a>`;

      // 处理tiyi数据
      if (randomGood.tiyi) {
        document.getElementById("hardware-tiyi").innerHTML = `<a href="${randomGood.link_2}">${randomGood.tiyi}</a>`;
      } else {
        document.getElementById("hardware-tiyi").style.display = "none";
      }
    });
}


getRandomData();

// 首页APP随机调用显示
fetch('/suju/app.json')
  .then(response => response.json())
  .then(data => {
    // 随机选择指定数量的应用程序
    const selectedApps = getRandomApps(data.good, 4);

    // 构建应用程序信息的 HTML
    const appHTML = selectedApps.map(app => `
      <div class="app-index img-hide">
        <div class="app-img">
          <img loading="lazy" decoding="async" src="${app.image}">
        </div>
        <div class="appwenben">
        <div class="apptitle"><a href="${app.link}" target="_blank">${app.title}</a></div>
          <div class="appnote-index">${app.info}</div>
        </div>
      </div>
    `).join('');

    // 将应用程序信息插入到容器中
    document.getElementById('app-index').innerHTML = appHTML;

    animateSummaries(); // 在DOM加载完毕后执行滑动加载动画
  })
  .catch(error => {
    console.error('发生错误:', error);
  });

// 从数组中随机选择指定数量的元素
function getRandomApps(array, count) {
  return array.sort(() => 0.5 - Math.random()).slice(0, count);
}