/* 中国惯用语大全 · 交互逻辑
   筛选/搜索/增量加载 + 释义开关
   移动端：下滑收起标题、点击卡片显隐释义
   展开收起时保持视口顶部词条位置
   深色/浅色主题 + 本地收藏（localStorage） */
(function(){
  "use strict";

  var STORE_FAVS = "cy_favs_v1";
  var STORE_THEME = "cy_theme_v1";
  var STORE_WARNED = "cy_fav_warned_v1";
  var STORE_UNFAV_WARNED = "cy_unfav_warned_v1";

  function storeGet(key){
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function storeSet(key, value){
    try { window.localStorage.setItem(key, value); return true; } catch (e) { return false; }
  }

  /* ---------- 移动端判断（触屏 / UA / 窄屏兜底，桌面宽屏不受影响） ---------- */
  var isCoarse = (function(){
    var mq = null;
    try { mq = window.matchMedia ? window.matchMedia("(hover: none) and (pointer: coarse)") : null; } catch (e) { mq = null; }
    if(mq && mq.matches) return true;
    var touch = false;
    try {
      touch = !!(window.ontouchstart || (window.navigator && window.navigator.maxTouchPoints > 0));
    } catch (e) { touch = false; }
    var ua = "";
    try { ua = String(window.navigator.userAgent || "").toLowerCase(); } catch (e) { ua = ""; }
    if(/android|iphone|ipod|windows phone|mobile/i.test(ua)) return true;
    var vw = 0;
    try { vw = window.innerWidth || 0; } catch (e) { vw = 0; }
    if(touch && vw > 0 && vw <= 1024) return true;
    return vw > 0 && vw <= 760;
  })();

  var rootEl = document.documentElement;
  var bodyEl = document.body;

  var listEl = document.getElementById("list");
  var topbarEl = document.getElementById("topbar");
  var searchEl = document.getElementById("searchInput");
  var countsEl = document.getElementById("counts");
  var guideEl = document.getElementById("guide");
  var toggleEl = document.getElementById("displayToggle");
  var switchLabel = document.getElementById("switchLabel");
  var catChips = document.getElementById("catChips");
  var freqChips = document.getElementById("freqChips");
  var sortChips = document.getElementById("sortChips");
  var favToggleBtn = document.getElementById("favToggle");
  var themeToggleBtn = document.getElementById("themeToggle");

  /* ---------- 深色 / 浅色主题 ---------- */
  function currentTheme(){
    return rootEl && rootEl.getAttribute("data-theme") === "light" ? "light" : "dark";
  }
  function applyTheme(mode){
    var light = mode === "light";
    rootEl.setAttribute("data-theme", light ? "light" : "dark");
    if(themeToggleBtn){
      themeToggleBtn.textContent = light ? "☾" : "☀";
      themeToggleBtn.title = light ? "切换到深色模式" : "切换到浅色模式";
    }
  }
  var savedTheme = storeGet(STORE_THEME) === "light" ? "light" : "dark";
  applyTheme(savedTheme);
  if(themeToggleBtn){
    themeToggleBtn.addEventListener("click", function(){
      var next = currentTheme() === "light" ? "dark" : "light";
      applyTheme(next);
      storeSet(STORE_THEME, next);
    });
  }
  /* ---------- 收藏（本地存储：dkey → 收藏日期 YYYY-MM-DD） ---------- */
  /* 兼容旧版：旧数据是纯键数组，读取时统一归到「网站打开当天」并自动升级落盘 */
  function pad2(n){ return (n < 10 ? "0" : "") + n; }
  function dateStrOf(d){
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }
  function todayStr(){ return dateStrOf(new Date()); }
  function validDateStr(x){
    return typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : todayStr();
  }
  var favMap = {};
  var pendingRemovals = {};
  (function(){
    var raw = storeGet(STORE_FAVS);
    if(!raw) return;
    var migrated = false;
    try {
      var arr = JSON.parse(raw);
      if(Object.prototype.toString.call(arr) === "[object Array]"){
        for(var i = 0; i < arr.length; i++){
          var k = null;
          var d = todayStr();
          var x = arr[i];
          if(typeof x === "string"){
            k = x;
            d = todayStr();
            migrated = true;
          } else if(x && typeof x === "object"){
            if(typeof x.k === "string"){ k = x.k; }
            else if(typeof x.key === "string"){ k = x.key; }
            if(typeof x.d === "string"){ d = validDateStr(x.d); }
            else { migrated = true; }
          }
          if(k && typeof k === "string" && !(k in favMap)){ favMap[k] = d; }
        }
      }
    } catch (e) {
      favMap = {};
    }
    if(migrated){ saveFavs(); }
  })();
  function favCount(){
    var n = 0;
    for(var k in favMap){ if(favMap[k]) n++; }
    return n;
  }
  function saveFavs(){
    var arr = Object.keys(favMap).map(function(k){
      return { k: k, d: validDateStr(favMap[k]) };
    });
    storeSet(STORE_FAVS, JSON.stringify(arr));
  }
  function isFav(key){ return !!favMap[key]; }
  function isFavShown(key){ return isFav(key) && !pendingRemovals[key]; }
  function favDateOf(key){ return validDateStr(favMap[key]); }
  function refreshFavButton(){
    if(!favToggleBtn) return;
    var n = favCount();
    favToggleBtn.textContent = favOnly ? "★ 收藏夹 " + n : "☆ 收藏夹" + (n > 0 ? " " + n : "");
    favToggleBtn.classList.toggle("on", favOnly);
    favToggleBtn.setAttribute("aria-pressed", favOnly ? "true" : "false");
  }
  function commitPendingRemovals(){
    var any = false;
    for(var k in pendingRemovals){
      if(pendingRemovals[k] && favMap[k]){ delete favMap[k]; any = true; }
    }
    pendingRemovals = {};
    if(any){ saveFavs(); refreshFavButton(); }
    return any;
  }

  /* 通用小弹窗（遮罩 + 标题 + 说明 + 按钮组） */
  function openModal(titleText, bodyText, buttons){
    var mask = document.createElement("div");
    mask.className = "modal-mask";
    var box = document.createElement("div");
    box.className = "modal-box";
    var title = document.createElement("p");
    title.className = "modal-title";
    title.textContent = titleText;
    var text = document.createElement("p");
    text.className = "modal-text";
    text.textContent = bodyText;
    var actions = document.createElement("div");
    actions.className = "modal-actions";
    function closeModal(){
      if(mask.parentNode){ mask.parentNode.removeChild(mask); }
    }
    (buttons || []).forEach(function(b){
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "modal-btn" + (b.danger ? " danger" : "");
      btn.textContent = b.label;
      btn.addEventListener("click", function(){ closeModal(); if(b.cb) b.cb(); });
      actions.appendChild(btn);
    });
    mask.addEventListener("click", function(ev){ if(ev.target === mask) closeModal(); });
    box.appendChild(title);
    box.appendChild(text);
    box.appendChild(actions);
    mask.appendChild(box);
    bodyEl.appendChild(mask);
    return closeModal;
  }
  /* 「第一次」判定一律以本地数据里已持久化的标记为准，不在现场用算法推断 */
  function warnOnce(key, title, body){
    if(storeGet(key) === "1") return false;
    storeSet(key, "1");
    openModal(title, body, [{ label: "知道了" }]);
    return true;
  }
  function maybeWarnFirstFav(){
    return warnOnce(STORE_WARNED, "收藏提示", "收藏保存在当前浏览器的本地存储中：请始终用你常用的浏览器打开本页；若更换浏览器、使用隐私浏览或清除浏览器数据，收藏可能会丢失。");
  }
  function maybeWarnFirstUnfav(){
    return warnOnce(STORE_UNFAV_WARNED, "取消收藏提示", "点灰星星后，该词条不会立刻消失，会暂时保留；只有关闭收藏夹或离开网页时，取消收藏才会正式保存。若想反悔，在保存前再点一下星星即可恢复。");
  }
  /* 点亮收藏：记录当天日期并立即保存（首次点亮时按数据标记提醒一次） */
  function addFav(item){
    if(!isFav(item.dkey)){ favMap[item.dkey] = todayStr(); }
    maybeWarnFirstFav();
    saveFavs();
    refreshFavButton();
  }
  /* 点灰取消：只记为「待移除」，不立刻保存；关闭收藏夹或离开网页时才落盘 */
  function scheduleRemoveFav(item){
    pendingRemovals[item.dkey] = 1;
    maybeWarnFirstUnfav();
  }
  function restoreFav(item){
    delete pendingRemovals[item.dkey];
  }
  /* 星标 UI：on=点亮；pending=已点灰待移除（显示灰星） */
  function favStarUI(star, on, pending){
    star.textContent = on ? "★" : "☆";
    star.classList.toggle("on", on);
    star.classList.toggle("pending-remove", !!pending && !on);
    star.setAttribute("aria-pressed", on ? "true" : "false");
    star.title = on
      ? "取消收藏：点灰后关闭收藏夹或离开网页时才生效"
      : pending
        ? "已点灰待移除：再点一下恢复（关闭收藏夹或离开网页后生效）"
        : "收藏（记录为今天的日期，保存在本浏览器）";
  }

  var favOnly = false;
  if(favToggleBtn){
    favToggleBtn.addEventListener("click", function(){
      favOnly = !favOnly;
      if(!favOnly){ commitPendingRemovals(); }  // 关闭收藏夹 → 正式保存点灰的移除
      refreshFavButton();
      render();
    });
  }
  window.addEventListener("beforeunload", function(){ commitPendingRemovals(); });
  window.addEventListener("pagehide", function(){ commitPendingRemovals(); });

  /* ---------- 收藏栏：清除浏览数据 ---------- */
  var favToolsEl = null;
  function ensureFavTools(){
    if(favToolsEl || !listEl.parentNode) return;
    favToolsEl = document.createElement("div");
    favToolsEl.className = "fav-tools hidden";
    function buildBtn(text, cls, cb){
      var b = document.createElement("button");
      b.type = "button";
      b.className = cls;
      b.textContent = text;
      b.addEventListener("click", cb);
      return b;
    }
    var fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".json,application/json";
    fileInput.className = "fav-file-input";
    fileInput.setAttribute("aria-label", "选择收藏夹 JSON 文件");
    fileInput.addEventListener("change", function(ev){
      var file = (ev.target && ev.target.files && ev.target.files[0]) || null;
      try { fileInput.value = ""; } catch(e) {}
      if(!file) return;
      var reader = new FileReader();
      reader.onload = function(){
        var text = typeof reader.result === "string" ? reader.result : "";
        try {
          handleImportedFavs(JSON.parse(text));
        } catch (e) {
          openModal("导入失败", "所选文件不是有效的收藏夹 JSON 文件，请确认后重试。", [{ label: "知道了" }]);
        }
      };
      reader.onerror = function(){
        openModal("导入失败", "读取文件失败，请重试。", [{ label: "知道了" }]);
      };
      try { reader.readAsText(file, "utf-8"); } catch(e) {
        openModal("导入失败", "无法读取所选文件。", [{ label: "知道了" }]);
      }
    });
    var hint = document.createElement("span");
    hint.className = "fav-tools-hint";
    hint.textContent = "收藏保存在本浏览器：可导出文件备份，也可用速传码 / 二维码在设备间快速传输。";
    var bar = document.createElement("div");
    bar.className = "fav-tools-bar";
    var panels = document.createElement("div");
    panels.className = "fav-drop-panels";
    var groups = [
      { g: "transfer", label: "速传码", options: [
        { text: "速传码", cb: showTransferCode },
        { text: "粘贴速传码", cb: showPasteTransfer }
      ]},
      { g: "qr", label: "二维码", options: [
        { text: "生成二维码", cb: showQrModal },
        { text: "扫码导入", cb: startScanImport }
      ]},
      { g: "io", label: "导入导出", options: [
        { text: "导入收藏", cb: function(){ fileInput.click(); } },
        { text: "导出收藏", cb: exportFavs }
      ]}
    ];
    var favOpenGroup = "";
    function refreshPanels(){
      groups.forEach(function(grp){
        var isOpen = favOpenGroup === grp.g;
        grp.head.classList.toggle("open", isOpen);
        grp.head.setAttribute("aria-expanded", isOpen ? "true" : "false");
        grp.row.classList.toggle("open", isOpen);
      });
    }
    groups.forEach(function(grp){
      var head = document.createElement("button");
      head.type = "button";
      head.className = "fav-group-btn";
      head.setAttribute("aria-expanded", "false");
      head.appendChild(document.createTextNode(grp.label));
      var caret = document.createElement("span");
      caret.className = "caret";
      caret.setAttribute("aria-hidden", "true");
      caret.textContent = "▾";
      head.appendChild(caret);
      head.addEventListener("click", function(){
        favOpenGroup = favOpenGroup === grp.g ? "" : grp.g;
        refreshPanels();
      });
      grp.head = head;
      bar.appendChild(head);
      var row = document.createElement("div");
      row.className = "fav-drop-panel";
      row.setAttribute("role", "group");
      row.setAttribute("aria-label", grp.label);
      grp.options.forEach(function(opt){
        row.appendChild(buildBtn(opt.text, "fav-act-btn", function(){
          if(favOpenGroup === grp.g){ favOpenGroup = ""; }
          refreshPanels();
          opt.cb();
        }));
      });
      grp.row = row;
      panels.appendChild(row);
    });
    var clearBtn = buildBtn("清除浏览数据", "fav-clear-btn", openClearModal);
    bar.appendChild(clearBtn);
    favToolsEl.appendChild(bar);
    favToolsEl.appendChild(panels);
    favToolsEl.appendChild(hint);
    // 工具区放在词条列表上方：进入收藏夹时操作面板在最上面
    listEl.parentNode.insertBefore(favToolsEl, listEl);
  }
  function syncFavTools(){
    if(!favToolsEl) return;
    if(favOnly){ favToolsEl.classList.remove("hidden"); }
    else { favToolsEl.classList.add("hidden"); }
  }
  function clearFavsData(){
    favMap = {};
    pendingRemovals = {};
    saveFavs();
    refreshFavButton();
    render();
  }
  function openClearModal(){
    openModal("清除浏览数据", "确定要清除本浏览器中保存的全部收藏数据吗？清除后不可恢复。", [
      { label: "取消" },
      { label: "确定清除", danger: true, cb: clearFavsData }
    ]);
  }
  /* 收藏夹：导出为 JSON 文件 */
  function exportFavs(){
    commitPendingRemovals();
    var keys = Object.keys(favMap).filter(function(k){ return favMap[k]; });
    var list = keys.map(function(k){
      var it = byKey[k];
      return { key: k, kind: it ? it.kind : "", phrase: it ? it.phrase : "", freq: it ? it.freq : "", date: favMap[k] ? favMap[k] : todayStr() };
    });
    var json = JSON.stringify(list, null, 2);
    var blob = null, url = null;
    try { blob = new Blob([json], { type: "application/json;charset=utf-8" }); } catch(e) { blob = null; }
    try { if(blob) url = URL.createObjectURL(blob); } catch(e) { url = null; }
    var a = document.createElement("a");
    var now = new Date();
    function p2(n){ return (n < 10 ? "0" : "") + n; }
    a.download = "惯用语收藏夹-" + now.getFullYear() + p2(now.getMonth() + 1) + p2(now.getDate()) + ".json";
    if(url){
      a.href = url;
    } else {
      a.href = "data:application/json;charset=utf-8," + encodeURIComponent(json);
    }
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){
      try { if(url) URL.revokeObjectURL(url); } catch(e) {}
      try { if(a.parentNode) a.parentNode.removeChild(a); } catch(e) {}
    }, 50);
  }
  /* 解析导入内容：兼容导出对象（含 date）或纯键数组；仅接受当前词库中存在的词条 */
  function collectImportEntries(data){
    var entries = [], seen = {};
    function add(k, d){
      if(typeof k === "string" && k && byKey[k] && !seen[k]){
        seen[k] = 1;
        entries.push({ k: k, d: d });
      }
    }
    if(Object.prototype.toString.call(data) === "[object Array]"){
      for(var i = 0; i < data.length; i++){
        var x = data[i];
        if(typeof x === "string"){
          add(x, todayStr());
        } else if(x && typeof x === "object"){
          var d = validDateStr(x.d);
          if(typeof x.key === "string"){
            add(x.key, d);
          } else if(typeof x.phrase === "string" && (x.kind === "惯用语" || x.kind === "成语")){
            add(x.kind + keyOf(x.phrase), d);
          }
        }
      }
    }
    return entries;
  }
  function handleImportedFavs(data){
    var entries = collectImportEntries(data);
    var rawCount = Object.prototype.toString.call(data) === "[object Array]" ? data.length : 0;
    if(!entries.length){
      openModal("导入失败", "文件中没有可导入的有效收藏（词条不在当前词库中，或文件格式不正确）。", [{ label: "知道了" }]);
      return;
    }
    var note = rawCount > entries.length ? "（另有 " + (rawCount - entries.length) + " 条无法识别或不在词库，已忽略）" : "";
    openModal("导入收藏夹", "文件含 " + entries.length + " 条有效收藏" + note + "。请选择导入方式：", [
      { label: "取消" },
      { label: "合并到当前收藏", cb: function(){ applyImportedFavs(entries, false); } },
      { label: "替换当前收藏", danger: true, cb: function(){ applyImportedFavs(entries, true); } }
    ]);
  }
  function applyImportedFavs(entries, replaceAll){
    if(replaceAll){ favMap = {}; pendingRemovals = {}; }
    for(var i = 0; i < entries.length; i++){
      var e = entries[i];
      if(!favMap[e.k]){ favMap[e.k] = validDateStr(e.d); }  // 已存在的收藏保留原日期
    }
    saveFavs();
    refreshFavButton();
    render();
    openModal("导入完成", "导入成功，当前收藏共 " + favCount() + " 条。", [{ label: "知道了" }]);
  }

  /* ================= 快捷传输：速传码（复制/粘贴）与二维码（生成/扫码） ================= */
  function openCustomModal(titleText, bodyNode, buttons, onClose){
    var mask = document.createElement("div");
    mask.className = "modal-mask";
    var box = document.createElement("div");
    box.className = "modal-box";
    var title = document.createElement("p");
    title.className = "modal-title";
    title.textContent = titleText;
    box.appendChild(title);
    var wrap = document.createElement("div");
    wrap.className = "modal-custom-body";
    if(bodyNode){ wrap.appendChild(bodyNode); }
    box.appendChild(wrap);
    var actions = document.createElement("div");
    actions.className = "modal-actions";
    function closeModal(){
      if(mask.parentNode){ mask.parentNode.removeChild(mask); }
      if(onClose){ onClose(); }
    }
    (buttons || []).forEach(function(b){
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "modal-btn" + (b.danger ? " danger" : "");
      btn.textContent = b.label;
      btn.addEventListener("click", function(){
        closeModal();
        if(b.cb) b.cb();
      });
      actions.appendChild(btn);
    });
    box.appendChild(actions);
    mask.appendChild(box);
    mask.addEventListener("click", function(ev){ if(ev.target === mask) closeModal(); });
    bodyEl.appendChild(mask);
    return closeModal;
  }

  function favKeysList(){
    return Object.keys(favMap).filter(function(k){ return favMap[k]; });
  }
  function utf8Encode(str){ return new TextEncoder().encode(str); }
  function utf8Decode(bytes){ return new TextDecoder("utf-8").decode(bytes); }
  function bytesToB64url(bytes){
    var s = "";
    for(var i = 0; i < bytes.length; i++){ s += String.fromCharCode(bytes[i]); }
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function b64urlToBytes(str){
    var b = String(str || "").replace(/-/g, "+").replace(/_/g, "/");
    while(b.length % 4){ b += "="; }
    var bin = atob(b);
    var out = new Uint8Array(bin.length);
    for(var i = 0; i < bin.length; i++){ out[i] = bin.charCodeAt(i); }
    return out;
  }
  var TRANSFER_TAG = "CYFAV1";
  var TRANSFER_PART_BYTES = 800;
  function buildTransferParts(){
    var payload = JSON.stringify(favKeysList());
    var bytes = utf8Encode(payload);
    var total = Math.max(1, Math.ceil(bytes.length / TRANSFER_PART_BYTES));
    var parts = [];
    for(var i = 0; i < total; i++){
      var start = i * TRANSFER_PART_BYTES;
      var end = Math.min(bytes.length, start + TRANSFER_PART_BYTES);
      var chunk = bytes.subarray(start, end);
      parts.push(TRANSFER_TAG + "|" + (i + 1) + "/" + total + "|" + bytesToB64url(chunk));
    }
    return parts;
  }
  function parsePartLine(line){
    var m = /^CYFAV1\|(\d+)\/(\d+)\|([A-Za-z0-9_\-]+)$/.exec(String(line || "").trim());
    if(!m) return null;
    return { idx: parseInt(m[1], 10), total: parseInt(m[2], 10), b64: m[3] };
  }
  function decodePartsFromLines(lines){
    var parts = {}, total = 0;
    lines.forEach(function(line){
      var p = parsePartLine(line);
      if(!p) return;
      if(total === 0){ total = p.total; }
      else if(total !== p.total){ throw new Error("速传码段数不一致，请重新复制完整内容。"); }
      if(p.idx < 1 || p.idx > p.total){ throw new Error("速传码序号无效。"); }
      parts[p.idx] = p.b64;
    });
    if(total === 0){ throw new Error("没有识别到速传码内容。"); }
    if(Object.keys(parts).length < total){ throw new Error("速传码不完整：已收到 " + Object.keys(parts).length + " / " + total + " 段。"); }
    var byteParts = [];
    for(var i = 1; i <= total; i++){ byteParts.push(b64urlToBytes(parts[i])); }
    var len = 0;
    byteParts.forEach(function(b){ len += b.length; });
    var all = new Uint8Array(len);
    var off = 0;
    byteParts.forEach(function(b){ all.set(b, off); off += b.length; });
    return JSON.parse(utf8Decode(all));
  }
  function linesOfText(text){ return String(text || "").split(/\r?\n/); }
  function legacyCopyText(text){
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch(e) {}
    try { if(ta.parentNode) ta.parentNode.removeChild(ta); } catch(e) {}
  }
  function copyTransferText(text, done){
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(
        function(){ if(done) done(true); },
        function(){ legacyCopyText(text); if(done) done(false); }
      );
    } else {
      legacyCopyText(text);
      if(done) done(false);
    }
  }
  function showTransferCode(){
    var parts = buildTransferParts();
    if(!parts.length){
      openModal("速传码", "当前没有收藏，无法生成速传码。", [{ label: "知道了" }]);
      return;
    }
    var code = parts.join("\n");
    var body = document.createElement("div");
    var tip = document.createElement("p");
    tip.className = "modal-text";
    tip.textContent = parts.length > 1
      ? "速传码共 " + parts.length + " 行（多行要完整复制）。发给另一台设备后，对方在本页点「粘贴速传码」即可导入。"
      : "把下面这行速传码完整复制，发给另一台设备；对方在本页点「粘贴速传码」即可导入。";
    var ta = document.createElement("textarea");
    ta.className = "transfer-code";
    ta.setAttribute("readonly", "");
    ta.value = code;
    var copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "fav-act-btn";
    copyBtn.textContent = "复制代码";
    copyBtn.addEventListener("click", function(){
      copyTransferText(code, function(){ copyBtn.textContent = "已复制 ✓"; });
    });
    body.appendChild(tip);
    body.appendChild(ta);
    body.appendChild(copyBtn);
    openCustomModal("速传码", body, [{ label: "关闭" }]);
    try { ta.focus(); ta.select(); } catch(e) {}
  }
  function showPasteTransfer(){
    var body = document.createElement("div");
    var tip = document.createElement("p");
    tip.className = "modal-text";
    tip.textContent = "把对方发来的速传码粘贴到下面（多行请全部粘贴），然后点「导入」。";
    var ta = document.createElement("textarea");
    ta.className = "transfer-code";
    ta.placeholder = "在此粘贴速传码…";
    body.appendChild(tip);
    body.appendChild(ta);
    openCustomModal("粘贴速传码", body, [
      { label: "取消" },
      { label: "导入", cb: function(){ importFromTransferText(ta.value); } }
    ]);
  }
  function importFromTransferText(text){
    var payload = null;
    try {
      payload = decodePartsFromLines(linesOfText(text));
    } catch(e){
      openModal("导入失败", (e && e.message) ? e.message : "速传码无法识别，请重新复制完整内容。", [{ label: "知道了" }]);
      return;
    }
    if(Object.prototype.toString.call(payload) !== "[object Array]"){
      openModal("导入失败", "速传码内容格式不正确。", [{ label: "知道了" }]);
      return;
    }
    handleImportedFavs(payload);
  }
  function makeQrNode(text){
    var holder = document.createElement("div");
    holder.className = "qr-img";
    try {
      var qr = window.qrcode(0, "M");
      qr.addData(text);
      qr.make();
      holder.innerHTML = qr.createImgTag(3, 2);
    } catch(e){
      holder.textContent = "二维码生成失败（内容可能过长），请改用速传码或导出收藏。";
    }
    return holder;
  }
  function showQrModal(){
    var parts = buildTransferParts();
    if(!parts.length){
      openModal("生成二维码", "当前没有收藏，无法生成二维码。", [{ label: "知道了" }]);
      return;
    }
    if(parts.length > 24){
      openModal("二维码过多", "收藏较多，需要 " + parts.length + " 个二维码，建议改用「速传码」或「导出收藏」。", [{ label: "知道了" }]);
      return;
    }
    var body = document.createElement("div");
    var tip = document.createElement("p");
    tip.className = "modal-text";
    tip.textContent = "让另一台设备在本页点「扫码导入」，对准下方二维码扫描即可。" + (parts.length > 1 ? "收藏较多时已拆成多张二维码，请按顺序逐张扫描。" : "");
    var stage = document.createElement("div");
    stage.className = "qr-stage";
    var counter = document.createElement("p");
    counter.className = "qr-counter";
    var nav = document.createElement("div");
    nav.className = "qr-nav";
    var prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "qr-mini-btn";
    prevBtn.textContent = "上一张";
    var nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "qr-mini-btn";
    nextBtn.textContent = "下一张";
    nav.appendChild(prevBtn);
    nav.appendChild(counter);
    nav.appendChild(nextBtn);
    body.appendChild(tip);
    body.appendChild(stage);
    body.appendChild(nav);
    openCustomModal("生成二维码", body, [{ label: "关闭" }]);
    var cur = 0;

    function render(){
      stage.innerHTML = "";
      stage.appendChild(makeQrNode(parts[cur]));
      counter.textContent = "第 " + (cur + 1) + " / " + parts.length + " 个二维码";
      prevBtn.disabled = (cur === 0);
      nextBtn.disabled = (cur === parts.length - 1);
    }
    prevBtn.addEventListener("click", function(){ if(cur > 0){ cur--; render(); } });
    nextBtn.addEventListener("click", function(){ if(cur < parts.length - 1){ cur++; render(); } });
    render();
  }

  function probeNativeQrCapable(){
    return new Promise(function(resolve){
      try {
        var BD = window.BarcodeDetector;
        if(!BD){ resolve(false); return; }
        if(typeof BD.getSupportedFormats !== "function"){
          // 老实现没有能力查询接口，只能假定可用；运行期异常会自动切到本地识别引擎
          resolve(true);
          return;
        }
        BD.getSupportedFormats().then(function(fmts){
          var ok = false;
          if(fmts && typeof fmts.length === "number"){
            for(var i = 0; i < fmts.length; i++){
              if(String(fmts[i]).toLowerCase().indexOf("qr") === 0){ ok = true; break; }
            }
          }
          resolve(ok);
        }, function(){ resolve(false); });
      } catch(e){
        resolve(false);
      }
    });
  }
  function startScanImport(){
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
      openModal("扫码导入", "当前浏览器不支持摄像头扫码（推荐使用新版 Chrome / Edge）。可改用「粘贴速传码」或「导入收藏」。", [{ label: "知道了" }]);
      return;
    }
    probeNativeQrCapable().then(function(nativeOk){
      var jsqrOk = typeof window.jsQR === "function";
      if(!nativeOk && !jsqrOk){
        openModal("扫码导入", "当前浏览器无法扫码（内置扫码器不可用，本地识别引擎也未加载）。可改用「粘贴速传码」或「导入收藏」。", [{ label: "知道了" }]);
        return;
      }
      runScanner(nativeOk, jsqrOk);
    });
  }
  function runScanner(nativeOk, jsqrOk){
    var body = document.createElement("div");
    var video = document.createElement("video");
    video.className = "scan-video";
    video.setAttribute("autoplay", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("muted", "");
    var status = document.createElement("p");
    status.className = "modal-text scan-status";
    status.textContent = "正在启动摄像头…";
    body.appendChild(video);
    body.appendChild(status);
    var stopped = false;
    var stream = null;
    var scanParts = {};
    var scanTotal = 0;
    var detector = null;
    var canvas = null;
    var canvasCtx = null;
    var watchdog = null;
    var loopTimer = null;
    var busy = false;
    var manualQueued = false;
    var flashTimer = null;
    var nativeActive = false;
    var mode = nativeOk ? "native" : "jsqr";  // 优先内置识别，识别不到或报错自动切本地 jsQR
    function setStatus(text){ if(!stopped){ status.textContent = text; } }
    function clearWatchdog(){ if(watchdog){ clearTimeout(watchdog); watchdog = null; } }
    function videoReady(){ return video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0; }
    function schedule(){
      if(stopped || loopTimer) return;
      loopTimer = setTimeout(function(){ loopTimer = null; tick(); }, 350);
    }
    function armWatchdog(){
      clearWatchdog();
      if(!jsqrOk || stopped || mode !== "native") return;
      watchdog = setTimeout(function(){
        watchdog = null;
        if(stopped || mode !== "native" || nativeActive) return;
        switchToJsqr();
        busy = false;      // 内置 detect 若挂起未返回，强制解除并恢复扫描循环
        schedule();
      }, 6000);
    }
    function switchToJsqr(){
      if(stopped || mode === "jsqr") return;
      mode = "jsqr";
      clearWatchdog();
      manualQueued = false;
      if(typeof window.jsQR !== "function"){
        setStatus("内置扫码器不可用，本地识别引擎也未加载，请改用「粘贴速传码」。");
        return;
      }
      setStatus("内置扫码器未响应，已自动切换到本地识别引擎，请继续对准二维码…");
    }
    if(mode === "native"){
      try { detector = new BarcodeDetector({ formats: ["qr_code"] }); }
      catch(e){ try { detector = new BarcodeDetector(); } catch(e2){ detector = null; } }
      if(!detector){
        if(jsqrOk){ switchToJsqr(); }
        else {
          openModal("扫码导入", "无法初始化扫码器，可改用「粘贴速传码」。", [{ label: "知道了" }]);
          return;
        }
      }
    }
    function stopScanning(){
      if(stopped) return;
      stopped = true;
      clearWatchdog();
      if(loopTimer){ clearTimeout(loopTimer); loopTimer = null; }
      if(flashTimer){ clearTimeout(flashTimer); flashTimer = null; }
      try { if(stream){ stream.getTracks().forEach(function(tr){ tr.stop(); }); } } catch(e){}
    }
    function pulseFlash(){
      if(stopped) return;
      if(flashTimer){ clearTimeout(flashTimer); }
      video.classList.add("scan-flash");
      flashTimer = setTimeout(function(){
        video.classList.remove("scan-flash");
        flashTimer = null;
      }, 240);
    }
    var closeFn = null;
    function doneAndImport(total){
      stopScanning();
      if(closeFn){ closeFn(); }
      var lines = [];
      for(var i = 1; i <= total; i++){ lines.push(TRANSFER_TAG + "|" + i + "/" + total + "|" + (scanParts[i] || "")); }
      importFromTransferText(lines.join("\n"));
    }
    function handleCode(text){
      if(stopped) return;
      var p = parsePartLine(text);
      if(!p) return;
      if(scanTotal === 0){ scanTotal = p.total; }
      else if(scanTotal !== p.total){ scanTotal = p.total; scanParts = {}; }
      if(p.idx < 1 || p.idx > p.total) return;
      scanParts[p.idx] = p.b64;
      var got = Object.keys(scanParts).length;
      setStatus("已识别 " + got + " / " + p.total + " 个码" + (got < p.total ? "，请继续对准下一张…" : ""));
      if(got >= p.total){ doneAndImport(p.total); }
    }
    function readJsqrFrame(){
      if(typeof window.jsQR !== "function") return false;
      if(!videoReady()) return false;
      if(!canvas){
        try {
          canvas = document.createElement("canvas");
          canvasCtx = canvas.getContext ? canvas.getContext("2d", { willReadFrequently: true }) : null;
        } catch(e){ canvasCtx = null; }
      }
      if(!canvasCtx) return false;
      var vw = video.videoWidth, vh = video.videoHeight;
      var maxDim = 800;
      var m = vw > vh ? vw : vh;
      var scale = m > maxDim ? maxDim / m : 1;
      var cw = Math.max(2, Math.round(vw * scale));
      var chh = Math.max(2, Math.round(vh * scale));
      if(canvas.width !== cw){ canvas.width = cw; }
      if(canvas.height !== chh){ canvas.height = chh; }
      var imgData = null;
      try {
        canvasCtx.drawImage(video, 0, 0, cw, chh);
        imgData = canvasCtx.getImageData(0, 0, cw, chh);
      } catch(e){ imgData = null; }
      if(!imgData) return true;
      var res = null;
      try { res = window.jsQR(imgData.data, imgData.width, imgData.height); } catch(e){ res = null; }
      if(res && res.data && typeof res.data === "string" && res.data.indexOf(TRANSFER_TAG) === 0){
        handleCode(res.data);
      }
      return true;
    }
    function digestNativeResult(codes){
      if(!codes || !codes.length) return;
      nativeActive = true;
      clearWatchdog();
      for(var i = 0; i < codes.length; i++){
        var raw = codes[i] && codes[i].rawValue;
        if(typeof raw === "string" && raw.indexOf(TRANSFER_TAG) === 0){ handleCode(raw); return; }
      }
    }
    function attemptDecode(){
      if(stopped || busy) return;
      if(mode === "native" && detector){
        var p = null;
        try { p = detector.detect(video); } catch(e){ p = null; }
        if(p && typeof p.then === "function"){
          busy = true;
          p.then(function(codes){
            busy = false;
            if(stopped) return;
            if(mode !== "native"){ schedule(); return; }
            digestNativeResult(codes);
            if(manualQueued){ manualQueued = false; pulseFlash(); attemptDecode(); return; }
            schedule();
          }).catch(function(){
            busy = false;
            if(stopped) return;
            if(mode !== "native"){ schedule(); return; }
            if(jsqrOk){ switchToJsqr(); }
            else { setStatus("内置扫码器发生错误，请改用「粘贴速传码」或重新打开本页再试。"); }
            if(manualQueued){ manualQueued = false; pulseFlash(); attemptDecode(); return; }
            schedule();
          });
          return;
        }
        // detect 同步抛错或返回了非 Promise
        if(jsqrOk){ switchToJsqr(); }
        else { setStatus("内置扫码器发生错误，请改用「粘贴速传码」或重新打开本页再试。"); }
      } else if(mode === "jsqr"){
        readJsqrFrame();
      } else {
        return;
      }
      schedule();
    }
    function scanNow(){
      if(stopped) return;
      if(!videoReady()){
        setStatus("摄像头尚未就绪，请稍等片刻再点一下画面。");
        return;
      }
      if(busy){ manualQueued = true; return; }
      pulseFlash();
      attemptDecode();
    }
    video.addEventListener("click", function(){ scanNow(); });
    function tick(){
      if(stopped || busy) return;
      if(!videoReady()){ schedule(); return; }
      attemptDecode();
    }
    closeFn = openCustomModal("扫码导入", body, [
      { label: "关闭", cb: stopScanning }
    ], stopScanning);
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then(function(s){
        if(stopped){
          s.getTracks().forEach(function(tr){ tr.stop(); });
          return;
        }
        stream = s;
        video.srcObject = s;
        if(mode === "jsqr"){
          if(isCoarse){
            setStatus("请对准二维码…点一下画面可立即识别，也可等待自动识别（本地识别引擎）");
          } else {
            setStatus("请把另一台设备屏幕上显示的收藏二维码对准摄像头…（点一下画面可立即识别，本地识别引擎）");
          }
        } else {
          if(isCoarse){
            setStatus("请对准二维码…点一下画面可立即识别，也可等待自动识别");
          } else {
            setStatus("请把另一台设备屏幕上显示的收藏二维码对准摄像头…（点一下画面可立即识别）");
          }
          armWatchdog();
        }
        schedule();
      })
      .catch(function(){
        setStatus("无法访问摄像头：请检查浏览器权限后重试，或改用「粘贴速传码」。");
      });
  }
  var FREQ_ORDER = ["常用", "较常用", "一般", "少见"];
  var PAGE = 50;

  var items = [];
  var byKey = {};
  var seen = {};
  function keyOf(phrase){
    return String(phrase || "").replace(/[（()）\s]/g, "");
  }
  function pushRows(arr, kind){
    if(!arr || !arr.length) return;
    arr.forEach(function(r){
      if(!r || !r[0]) return;
      var phrase = String(r[0]).trim();
      var key = keyOf(phrase);
      var dk = kind + key;
      if(!key || seen[dk]) return;
      seen[dk] = 1;
      var freq = String(r[4] || "常用");
      if(FREQ_ORDER.indexOf(freq) === -1) freq = "常用";
      var it = {
        dkey: dk,
        kind: kind,
        phrase: phrase,
        meaning: String(r[1] || ""),
        e1: String(r[2] || ""),
        e2: String(r[3] || ""),
        freq: freq
      };
      byKey[dk] = it;
      items.push(it);
    });
  }
  pushRows(window.HABIT_DATA, "惯用语");
  pushRows(window.HABIT_EXTRA_DATA, "惯用语");
  pushRows(window.HABIT_BULK_DATA, "惯用语");
  pushRows(window.IDIOM_DATA, "成语");
  pushRows(window.IDIOM_EXTRA_DATA, "成语");
  pushRows(window.IDIOM_BULK_DATA, "成语");

  var habitTotal = 0, idiomTotal = 0;
  items.forEach(function(it){
    it.hay = (it.phrase + " " + it.kind + " " + it.meaning + " " + it.e1 + " " + it.e2).toLowerCase();
    if(it.kind === "惯用语") habitTotal++; else idiomTotal++;
  });
  var currentCat = "all";
  var currentFreq = "all";
  var sortKey = "default";
  var sortDir = "asc";
  var currentQuery = "";
  var searchTimer = null;
  var shown = [];
  var rendered = 0;
  var moreBtn = document.createElement("button");
  moreBtn.type = "button";
  moreBtn.className = "more-btn";
  moreBtn.textContent = "加载更多";
  moreBtn.addEventListener("click", function(){ drawMore(); });

  function buildCard(item){
    var card = document.createElement("article");
    card.className = "card";
    card.setAttribute("data-key", item.dkey);

    var top = document.createElement("div");
    top.className = "card-top";
    var phrase = document.createElement("span");
    phrase.className = "phrase";
    phrase.textContent = item.phrase;

    var right = document.createElement("div");
    right.className = "card-top-right";
    var pending = isFav(item.dkey) && !!pendingRemovals[item.dkey];
    var starred = isFavShown(item.dkey);
    var favStar = document.createElement("button");
    favStar.type = "button";
    favStar.className = "fav-btn";
    right.appendChild(favStar);
    favStarUI(favStar, starred, pending);

    var tag = document.createElement("span");
    tag.className = "tag " + (item.kind === "惯用语" ? "habit" : "idiom");
    tag.textContent = item.kind;
    right.appendChild(tag);
    var fi = FREQ_ORDER.indexOf(item.freq);
    var freqTag = document.createElement("span");
    freqTag.className = "freq-tag fq-" + (fi === -1 ? 0 : fi);
    freqTag.textContent = item.freq;
    right.appendChild(freqTag);

    top.appendChild(phrase);
    top.appendChild(right);
    var details = document.createElement("div");
    details.className = "details";

    var meaningRow = document.createElement("div");
    meaningRow.className = "meta";
    var label = document.createElement("b");
    label.textContent = "释义";
    var meaning = document.createElement("p");
    meaning.className = "meaning";
    meaning.textContent = item.meaning;
    meaningRow.appendChild(label);
    meaningRow.appendChild(meaning);
    details.appendChild(meaningRow);

    var examples = [item.e1, item.e2].filter(function(t){ return t && t.trim(); });
    if(examples.length){
      var ul = document.createElement("ul");
      ul.className = "example";
      examples.forEach(function(txt){
        var li = document.createElement("li");
        li.textContent = txt;
        ul.appendChild(li);
      });
      details.appendChild(ul);
    }

    card.appendChild(top);
    card.appendChild(details);
    return card;
  }

  function matches(item){
    if(favOnly && !isFav(item.dkey)) return false;
    if(currentCat !== "all" && item.kind !== currentCat) return false;
    if(currentFreq !== "all" && item.freq !== currentFreq) return false;
    if(!currentQuery) return true;
    return item.hay.indexOf(currentQuery) !== -1;
  }
  /* ---------- 排序：首字拼音首字母 / 字数（升序 / 降序） ---------- */
  function firstCharOf(phrase){ return Array.from(String(phrase || ""))[0] || ""; }
  function sortInitialOf(phrase){
    var ov = window.PINYIN_WORD_OVERRIDES;
    if(ov && ov[phrase]) return ov[phrase];
    var ci = window.PINYIN_CHAR_INITIALS;
    return (ci && ci[firstCharOf(phrase)]) || "ZZ";
  }
  function sortLenOf(phrase){
    return Array.from(String(phrase || "").replace(/[（()）\s]/g, "")).length;
  }
  function compareBySort(a, b){
    var va, vb;
    if(sortKey === "py"){
      va = sortInitialOf(a.phrase);
      vb = sortInitialOf(b.phrase);
    } else {
      va = sortLenOf(a.phrase);
      vb = sortLenOf(b.phrase);
    }
    if(va === vb) return 0;
    var c = va < vb ? -1 : 1;
    return sortDir === "desc" ? -c : c;
  }
  function renderMoreArea(){
    // Remove any wrapper left over from an earlier render (it may be detached).
    var parent = moreBtn.parentNode;
    if(parent && parent.parentNode){
      parent.parentNode.removeChild(parent);
    }
    if(shown.length > rendered){
      var wrap = document.createElement("div");
      wrap.className = "more-wrap";
      wrap.appendChild(moreBtn);
      listEl.appendChild(wrap);
      moreBtn.textContent = "加载更多（还剩 " + (shown.length - rendered) + " 条）";
    }
  }

  function drawMore(){
    if(rendered >= shown.length) return;
    var end = Math.min(shown.length, rendered + PAGE);
    var ref = listEl.lastChild && listEl.lastChild.className === "more-wrap" ? listEl.lastChild : null;
    for(; rendered < end; rendered++){
      listEl.insertBefore(buildCard(shown[rendered]), ref);
    }
    renderMoreArea();
  }

  /* 收藏夹视图：按收藏日期分组、折叠展示；其它视图保持筛选 + 分页 */
  function renderFavs(){
    var favs = items.filter(matches);
    shown = favs;
    listEl.textContent = "";
    if(!favs.length){
      var empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = favCount() > 0
        ? "当前收藏里没有符合条件的词条，试试调整筛选条件。"
        : "还没有收藏任何词条：点开词条卡片，点击右上角的 ☆ 即可收藏。";
      listEl.appendChild(empty);
      return;
    }
    var groups = {};
    favs.forEach(function(it){
      var d = favDateOf(it.dkey);
      if(!groups[d]) groups[d] = [];
      groups[d].push(it);
    });
    var dates = Object.keys(groups).sort().reverse();
    dates.forEach(function(d){
      var arr = groups[d];
      if(sortKey !== "default"){ arr = arr.slice().sort(compareBySort); }
      var det = document.createElement("details");
      det.className = "fav-day";
      // 只有今天的栏目默认展开，其它日期默认折叠
      if(d === todayStr()){ det.setAttribute("open", ""); }
      var sum = document.createElement("summary");
      sum.className = "fav-day-head";
      var chev = document.createElement("span");
      chev.className = "chev";
      chev.setAttribute("aria-hidden", "true");
      chev.textContent = "▾";
      var lab = document.createElement("span");
      lab.className = "day-label";
      lab.textContent = d;
      var cnt = document.createElement("span");
      cnt.className = "day-count";
      cnt.textContent = arr.length + " 条";
      sum.appendChild(chev);
      sum.appendChild(lab);
      sum.appendChild(cnt);
      det.appendChild(sum);
      var bodyWrap = document.createElement("div");
      bodyWrap.className = "fav-day-body";
      arr.forEach(function(it){ bodyWrap.appendChild(buildCard(it)); });
      det.appendChild(bodyWrap);
      listEl.appendChild(det);
    });
  }

  function render(){
    if(favOnly){
      renderFavs();
      syncFavTools();
      updateGuide();
      return;
    }
    shown = items.filter(matches);
    if(sortKey !== "default"){ shown.sort(compareBySort); }
    rendered = 0;
    listEl.textContent = "";

    if(!shown.length){
      var empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = currentQuery || currentFreq !== "all" || currentCat !== "all"
        ? "没有找到符合条件的词条，换一个关键词或筛选条件试试。"
        : "当前词库暂无内容。";
      listEl.appendChild(empty);
    } else {
      drawMore();
    }
    syncFavTools();
    updateGuide();
  }
  function updateGuide(){
    var tips = [];
    if(!toggleEl.checked){
      tips.push(isCoarse ? "释义与例句已隐藏：在手机上点击词条即可查看。" : "释义与例句已隐藏：悬停显示释义，点击切换显隐。");
    }
    var catName = currentCat === "all" ? "全部" : currentCat;
    var freqName = currentFreq === "all" ? "全部" : currentFreq;
    var favNote = favOnly ? " · 仅收藏" : "";
    if(currentQuery){
      var scopes = [];
      if(currentCat !== "all") scopes.push(currentCat);
      if(currentFreq !== "all") scopes.push(currentFreq);
      if(favOnly) scopes.push("仅收藏");
      tips.push("找到 " + shown.length + " 条与「" + currentQuery + "」相关的词条"
        + (scopes.length ? "（" + scopes.join(" / ") + "）" : "") + "。");
    } else {
      tips.push("当前筛选：" + catName + " / " + freqName + favNote + "，共 " + shown.length + " 条。");
    }
    guideEl.textContent = tips.join("　");
  }

  function applyDisplay(){
    var on = toggleEl.checked;
    bodyEl.classList.toggle("compact", !on);
    switchLabel.textContent = on
      ? "当前：释义全部显示"
      : (isCoarse ? "当前：点击卡片显示释义" : "当前：悬停/点击显隐释义");
  }

  /* 记录视口“最上方”词条的判定规则：
     以“中国惯用语大全”标题所在矩形为基准——
     - 标题矩形被隐藏（移动端下滑收起）时：取当前视口内最上方、顶栏之下的那张卡片；
     - 标题矩形可见时：取该矩形正下方对应的那张卡片（顶边位于标题矩形下沿之下）。 */
  function captureAnchor(){
    var cards = listEl.querySelectorAll(".card");
    if(!cards.length) return null;
    var headerBottom = 0;
    if(topbarEl && topbarEl.getBoundingClientRect){
      headerBottom = topbarEl.getBoundingClientRect().bottom;
    }
    var titleEl = document.querySelector(".brand-copy");
    var titleBottom = null;
    if(titleEl && titleEl.getBoundingClientRect){
      try {
        var tr = titleEl.getBoundingClientRect();
        if(tr.height > 1) titleBottom = tr.bottom;
      } catch (e) {}
    }
    var anchorEl = null, top0 = 0;
    for(var i = 0; i < cards.length; i++){
      var r = cards[i].getBoundingClientRect();
      if(r.bottom <= headerBottom) continue;
      if(titleBottom === null){
        /* 标题矩形被隐藏：视口最上方、未完全被顶栏遮住的第一张 */
        anchorEl = cards[i]; top0 = r.top; break;
      }
      /* 标题矩形可见：矩形下方对应的那张（整张在标题矩形之下） */
      if(r.top >= titleBottom - 1){
        anchorEl = cards[i]; top0 = r.top; break;
      }
    }
    if(!anchorEl) return null;
    return function(){
      var r2 = anchorEl.getBoundingClientRect();
      var dy = r2.top - top0;
      if(dy !== 0 && window.scrollBy){ window.scrollBy(0, dy); }
    };
  }
  /* 列表点击：收藏星标 / 释义显隐切换（手机点按、桌面点击） */
  listEl.addEventListener("click", function(ev){
    var t = ev.target;
    if(!t || !t.closest) return;
    var favStar = t.closest(".fav-btn");
    var card = t.closest(".card");
    if(favStar && card){
      var key = card.getAttribute("data-key");
      var item = key ? byKey[key] : null;
      if(item){
        if(isFav(item.dkey)){
          if(pendingRemovals[item.dkey]){
            restoreFav(item);
            favStarUI(favStar, true, false);
          } else {
            scheduleRemoveFav(item);
            favStarUI(favStar, false, true);
          }
        } else {
          addFav(item);
          favStarUI(favStar, true, false);
        }
      }
      return;
    }
    if(bodyEl.classList.contains("compact") && card){
      /* 点击切换释义：展开则隐藏，隐藏则展开（手机与桌面一致） */
      var willOpen = !card.classList.contains("open");
      var openCards = listEl.querySelectorAll(".card.open");
      for(var i = 0; i < openCards.length; i++){
        if(openCards[i] !== card) openCards[i].classList.remove("open");
      }
      card.classList.toggle("open", willOpen);
      if(!willOpen){
        var ae = document.activeElement;
        if(ae && ae !== document.body && card.contains(ae)){
          try { ae.blur(); } catch(e) {}
        }
      }
    }
  });

  /* 桌面端隐藏模式：悬停显示释义、光标离开隐藏；列表点击处理里点击切换显隐 */
  if(!isCoarse){
    function cardFromNode(node){
      return (node && node.closest) ? node.closest(".card") : null;
    }
    function setCardOpen(card, on){
      if(card && bodyEl.classList.contains("compact")){
        card.classList.toggle("open", !!on);
      }
    }
    listEl.addEventListener("pointerenter", function(ev){
      setCardOpen(cardFromNode(ev.target), true);
    }, true);
    listEl.addEventListener("pointerleave", function(ev){
      setCardOpen(cardFromNode(ev.target), false);
    }, true);
    listEl.addEventListener("focusin", function(ev){
      setCardOpen(cardFromNode(ev.target), true);
    });
    listEl.addEventListener("focusout", function(ev){
      setCardOpen(cardFromNode(ev.target), false);
    });
  }
  function bindChips(wrap, attr, cb){
    wrap.addEventListener("click", function(ev){
      var chip = ev.target.closest ? ev.target.closest(".chip") : null;
      if(!chip) return;
      wrap.querySelectorAll(".chip").forEach(function(c){ c.classList.remove("active"); });
      chip.classList.add("active");
      cb(chip.getAttribute(attr));
    });
  }

  bindChips(catChips, "data-cat", function(v){ currentCat = v; render(); });
  bindChips(freqChips, "data-freq", function(v){ currentFreq = v; render(); });
  /* 排序按钮：默认 / 首字拼音 / 字数 / 升序 / 降序
     选“默认”时其余四键置暗（不可排序）；选定键后自动按升序，可再点“降序”切换 */
  function refreshSortChips(){
    if(!sortChips) return;
    var keyOn = sortKey !== "default";
    sortChips.querySelectorAll(".chip").forEach(function(c){
      var v = c.getAttribute("data-sort");
      var active = false, dim = false;
      if(v === "default"){
        active = !keyOn;
      } else if(!keyOn){
        dim = true;
      } else if(v === "py" || v === "len"){
        active = (sortKey === v);
      } else {
        active = (sortDir === v);
      }
      c.classList.toggle("active", active);
      c.classList.toggle("dim", dim);
      if(v === "asc" || v === "desc"){ c.disabled = !keyOn; }
    });
  }
  if(sortChips){
    sortChips.addEventListener("click", function(ev){
      var chip = ev.target.closest ? ev.target.closest(".chip") : null;
      if(!chip || chip.disabled) return;
      var v = chip.getAttribute("data-sort");
      if(v === "default"){
        sortKey = "default";
        sortDir = "asc";
      } else if(v === "py" || v === "len"){
        sortKey = v;
      } else if(v === "asc" || v === "desc"){
        sortDir = v;
      } else {
        return;
      }
      refreshSortChips();
      render();
    });
  }
  refreshSortChips();

  toggleEl.addEventListener("change", function(){
    var anchor = captureAnchor();
    applyDisplay();
    updateGuide();
    if(anchor) anchor();
  });

  searchEl.addEventListener("input", function(){
    currentQuery = searchEl.value.trim().toLowerCase();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(render, 120);
  });
  /* 移动端：手指上滑（页面向下滚动）→ 隐藏整个顶栏；手指下滑 → 显示（电脑端不受影响） */
  if(isCoarse){
    var lastY = window.pageYOffset || 0;
    var rafPending = false;
    function updateTitleState(){
      var y = window.pageYOffset || (rootEl && rootEl.scrollTop) || 0;
      var dy = y - lastY;
      var hiding = bodyEl.classList.contains("title-hide");
      if(y <= 4){
        if(hiding) bodyEl.classList.remove("title-hide");
      } else if(hiding){
        if(dy < -4) bodyEl.classList.remove("title-hide");
      } else if(dy > 8){
        bodyEl.classList.add("title-hide");
      }
      lastY = y;
    }
    function onScroll(){
      if(rafPending) return;
      if(window.requestAnimationFrame){
        rafPending = true;
        window.requestAnimationFrame(function(){
          rafPending = false;
          updateTitleState();
        });
      } else {
        updateTitleState();
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  countsEl.textContent = "共 " + items.length + " 条 · 惯用语 " + habitTotal + " · 成语 " + idiomTotal;
  if(isCoarse && toggleEl){ toggleEl.checked = false; }
  ensureFavTools();
  refreshFavButton();
  applyDisplay();
  render();
})();
