/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Koobai
 */
(function (root) {
  "use strict";

  const defaults = {
    duration: 2000,
    showClose: false,
  };
  const activeMessages = new Set();
  let stage = null;
  let styleReady = false;

  const icons = {
    info: "i",
    success: "✓",
    warning: "!",
    error: "×",
    loading: "",
  };

  function ensureStyle() {
    if (styleReady || typeof document === "undefined") return;
    const style = document.createElement("style");
    style.id = "jingzhe-message-style";
    style.textContent = `
      .coco-msg-stage *{box-sizing:border-box}
      .coco-msg-stage{position:fixed;top:20px;left:50%;width:auto;max-width:calc(100vw - 24px);transform:translateX(-50%);z-index:3000;padding-top:constant(safe-area-inset-top);padding-top:env(safe-area-inset-top)}
      .coco-msg-wrapper{position:relative;left:50%;height:auto;transform:translateX(-50%);transition:height .3s ease,padding .3s ease;padding:8px 0}
      .coco-msg{position:relative;left:50%;display:inline-flex;align-items:center;max-width:calc(100vw - 24px);padding:10px 1rem;border-radius:7px;transform:translateX(-50%);box-shadow:0 4px 1rem rgba(15,15,15,.15);color:rgba(44,44,44,.9);background:#fff}
      .dark .coco-msg{color:rgba(255,255,255,.9);background:rgba(36,36,36,.95);box-shadow:0 0 1px rgba(55,55,55,.3)}
      .coco-msg-icon{flex:0 0 1rem;width:1rem;height:1rem;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:.72rem;font-weight:700;line-height:1}
      .coco-msg-content{margin-left:10px;text-align:left;font-size:.85rem;font-weight:400;overflow-wrap:anywhere;line-height:1.57143;display:inline-block}
      .coco-msg.info .coco-msg-icon{background:#3491fa}.coco-msg.success .coco-msg-icon{background:#00b42a}.coco-msg.warning .coco-msg-icon{background:#f7ba1e}.coco-msg.error .coco-msg-icon{background:#f53f3f}
      .dark .coco-msg.info .coco-msg-icon{background:#1d4dd2}.dark .coco-msg.success .coco-msg-icon{background:#129a37}.dark .coco-msg.warning .coco-msg-icon{background:#cc961f}.dark .coco-msg.error .coco-msg-icon{background:#cb2e34}
      .coco-msg-wait{flex:0 0 20px;width:20px;height:20px;position:relative;display:inline-flex;justify-content:center;align-items:center;margin-left:10px;padding:0;border:0;color:inherit;background:transparent;cursor:pointer}
      .coco-msg-wait-hidden{display:none}.coco-msg-close{width:.85rem;height:.85rem;fill:currentColor}.coco-msg-loading{width:1rem;height:1rem;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:coco-msg-rotate .8s linear infinite}
      .coco-msg.loading .coco-msg-icon{color:#3491fa;background:transparent}.dark .coco-msg.loading .coco-msg-icon{color:#1d4dd2}
      .coco-msg-fade-in{animation:coco-msg-fade .22s ease-out both}.coco-msg-fade-out{animation:coco-msg-fade .22s linear reverse both}
      @keyframes coco-msg-fade{from{opacity:0;transform:translate(-50%,-80%)}to{opacity:1;transform:translate(-50%,0)}}@keyframes coco-msg-rotate{to{transform:rotate(360deg)}}
      @media (prefers-reduced-motion:reduce){.coco-msg-fade-in,.coco-msg-fade-out,.coco-msg-loading{animation-duration:.01ms;animation-iteration-count:1}}
    `;
    (document.head || document.documentElement).appendChild(style);
    styleReady = true;
  }

  function ensureStage() {
    if (typeof document === "undefined") return null;
    ensureStyle();
    if (!stage) {
      stage = document.createElement("div");
      stage.className = "coco-msg-stage";
      stage.setAttribute("role", "status");
      stage.setAttribute("aria-live", "polite");
    }
    if (!stage.isConnected && document.body) document.body.appendChild(stage);
    return stage;
  }

  function parseArguments(args, type) {
    const options = { ...defaults, type, msg: "", onClose: null };
    Array.from(args).forEach((value) => {
      if (value === undefined) return;
      if (typeof value === "string" || (value && typeof value === "object")) options.msg = value;
      else if (typeof value === "number") options.duration = value;
      else if (typeof value === "boolean") options.showClose = value;
      else if (typeof value === "function") options.onClose = value;
    });
    if (type === "loading") {
      if (options.msg === "") options.msg = "正在加载";
      options.duration = 0;
      options.showClose = true;
    } else if (options.duration === 0) {
      options.showClose = true;
    }
    return options;
  }

  function closeIcon() {
    const namespace = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(namespace, "svg");
    svg.setAttribute("class", "coco-msg-close");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(namespace, "path");
    path.setAttribute("d", "M18.3 5.7 12 12l6.3 6.3-1.4 1.4-6.3-6.3-6.3 6.3-1.4-1.4L9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3z");
    svg.appendChild(path);
    return svg;
  }

  function show(type, args) {
    const options = parseArguments(args, type);
    const target = ensureStage();
    if (!target) return function () {};

    const wrapper = document.createElement("div");
    const message = document.createElement("div");
    const icon = document.createElement("span");
    const content = document.createElement("span");
    const closeButton = document.createElement("button");
    let timer = null;
    let closed = false;

    wrapper.className = "coco-msg-wrapper";
    message.className = `coco-msg coco-msg-fade-in ${type}`;
    icon.className = "coco-msg-icon";
    content.className = "coco-msg-content";
    closeButton.className = options.showClose ? "coco-msg-wait" : "coco-msg-wait coco-msg-wait-hidden";
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "关闭提示");

    if (type === "loading") {
      const spinner = document.createElement("span");
      spinner.className = "coco-msg-loading";
      icon.appendChild(spinner);
    } else {
      icon.textContent = icons[type];
    }
    if (options.msg && typeof options.msg === "object" && options.msg.nodeType) content.appendChild(options.msg);
    else content.textContent = String(options.msg || "");
    closeButton.appendChild(closeIcon());
    message.append(icon, content, closeButton);
    wrapper.appendChild(message);
    target.appendChild(wrapper);

    function close() {
      if (closed) return;
      closed = true;
      if (timer) root.clearTimeout(timer);
      activeMessages.delete(close);
      message.classList.remove("coco-msg-fade-in");
      message.classList.add("coco-msg-fade-out");
      wrapper.style.height = `${wrapper.offsetHeight}px`;
      root.requestAnimationFrame(function () {
        wrapper.style.height = "0";
        wrapper.style.padding = "0";
      });
      root.setTimeout(function () {
        wrapper.remove();
        if (stage && !stage.children.length) stage.remove();
      }, 300);
      if (options.onClose) options.onClose();
    }

    closeButton.addEventListener("click", close);
    activeMessages.add(close);
    if (options.duration !== 0) timer = root.setTimeout(close, Math.max(0, options.duration));
    return close;
  }

  function info() { return show("info", arguments); }
  const api = info;
  ["info", "success", "warning", "error", "loading"].forEach(function (type) {
    api[type] = function () { return show(type, arguments); };
  });
  api.destroyAll = function () {
    Array.from(activeMessages).forEach(function (close) { close(); });
  };
  api.config = function (options) {
    if (!options || typeof options !== "object") return { ...defaults };
    if (typeof options.duration === "number") defaults.duration = options.duration;
    if (typeof options.showClose === "boolean") defaults.showClose = options.showClose;
    return { ...defaults };
  };

  root.cocoMessage = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
