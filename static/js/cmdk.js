const commandMenuSelector = '.command-menu';
const commandMenuLinksSelector = '.group-option:not([hidden]) .group-option-link';
let commandMenuLinks = document.querySelectorAll(commandMenuLinksSelector);
let isVisible = false;
let isMenuClosing = false;

// 设置默认为隐藏
document.querySelector(commandMenuSelector).style.display = 'none';

document.addEventListener('keydown', handleKeyPress);

document.addEventListener('keyup', function() {
  commandMenuLinks = document.querySelectorAll(commandMenuLinksSelector);
});

document.addEventListener('click', function(e) {
  const commandMenu = document.querySelector(commandMenuSelector);
  const clickedInsideCommandMenu = e.target.closest(commandMenuSelector) !== null;

  if (!clickedInsideCommandMenu && isVisible) {
    if (!isMenuClosing) {
      hideCommandMenu();
      isVisible = false;
    } else {
      isMenuClosing = false;
    }
  }
});

function handleKeyPress(e) {
  const commandToggle = ((e.altKey || e.metaKey) && e.code == 'KeyK');
  const isDigitKey = e.key >= '1' && e.key <= '9';
  const isEscKey = e.code === 'Escape';

  if (isEscKey && isVisible) {
    hideCommandMenu();
    isVisible = false;
    return;
  }

  if (commandToggle) {
    if (!isVisible || isMenuClosing) {
      isVisible = true;
      isMenuClosing = false;
      showCommandMenu();
    } else {
      isMenuClosing = true;
      hideCommandMenu();
      isVisible = false;
    }
  }

  if (isDigitKey && isVisible) {
    e.preventDefault();
    handleDigitKey(e.key);
  }

  focusLink(e);
}

function toggleCommandMenu() {
  const commandMenu = document.querySelector(commandMenuSelector);
  isVisible = !isVisible;

  if (isVisible) {
    showCommandMenu();
  } else {
    hideCommandMenu();
  }
}

function showCommandMenu() {
  const commandMenu = document.querySelector(commandMenuSelector);
  commandMenu.style.display = 'flex';
  commandMenu.querySelector('.command-menu-content').scrollTo(0, 0);
  const focused = document.querySelector('.focused');
  if (focused) {
    focused.classList.remove('focused');
  }
}

function hideCommandMenu() {
  const commandMenu = document.querySelector(commandMenuSelector);
  isVisible = false;
  commandMenu.style.display = 'none';
}

function handleDigitKey(key) {
  const commandMenu = document.querySelector(commandMenuSelector);

  if (commandMenu) {
    const index = parseInt(key) - 1;
    const link = commandMenuLinks[index];

    if (link) {
      simulateClick(link);
    }
  }
}

function simulateClick(element) {
  const event = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    view: window
  });

  element.dispatchEvent(event);
}

function focusLink(e) {
  if (e.code == 'ArrowUp' || e.code == 'ArrowDown') {
    e.preventDefault();
    
    const links = document.querySelectorAll(commandMenuLinksSelector);
    const currentIndex = Array.from(links).indexOf(document.activeElement);

    let nextIndex;
    if (e.code == 'ArrowDown') {
      nextIndex = currentIndex + 1;
      if (nextIndex >= links.length) {
        nextIndex = 0; 
      }
    } else if (e.code == 'ArrowUp') {
      nextIndex = currentIndex - 1;
      if (nextIndex < 0) {
        nextIndex = links.length - 1;
      }
    }

    if (nextIndex >= 0 && nextIndex < links.length) {
      links[nextIndex].focus(); 
    }

    if (nextIndex >= 0 && nextIndex < links.length) {
    
      links.forEach(link => link.closest('.group-option').classList.remove('focused'));
      
      const nextLink = links[nextIndex];
      nextLink.focus();  
      nextLink.closest('.group-option').classList.add('focused');
    }
  }
}

// 关闭cmdk窗口
/*document.addEventListener("click", function (e) {
  const commandMenu = document.querySelector(".command-menu");
  if (
    commandMenu &&
    !e.target.closest(".command-menu") &&
    !commandMenu.hidden
  ) {
    console.log("Click outside menu, hiding menu.");

    hideCommandMenu(); // 调用你的隐藏菜单的函数
  }
});*/