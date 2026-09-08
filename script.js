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
  /* ---------- 收藏（本地存储） ---------- */
  var favMap = {};
  (function(){
    var raw = storeGet(STORE_FAVS);
    if(!raw) return;
    try {
      var arr = JSON.parse(raw);
      if(Object.prototype.toString.call(arr) === "[object Array]"){
        for(var i = 0; i < arr.length; i++){
          if(typeof arr[i] === "string") favMap[arr[i]] = 1;
        }
      }
    } catch (e) {
      favMap = {};
    }
  })();
  function favCount(){
    var n = 0;
    for(var k in favMap){ if(favMap[k]) n++; }
    return n;
  }
  function saveFavs(){
    storeSet(STORE_FAVS, JSON.stringify(Object.keys(favMap)));
  }
  function isFav(key){
    return !!favMap[key];
  }
  function refreshFavButton(){
    if(!favToggleBtn) return;
    var n = favCount();
    favToggleBtn.textContent = favOnly ? "★ 收藏夹 " + n : "☆ 收藏夹" + (n > 0 ? " " + n : "");
    favToggleBtn.classList.toggle("on", favOnly);
    favToggleBtn.setAttribute("aria-pressed", favOnly ? "true" : "false");
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
  var warnShownThisSession = false;
  function maybeWarnFirstFav(){
    if(warnShownThisSession) return;
    warnShownThisSession = true;
    storeSet(STORE_WARNED, "1");
    openModal("收藏提示", "收藏保存在当前浏览器的本地存储中：请始终用你常用的浏览器打开本页；若更换浏览器、使用隐私浏览或清除浏览器数据，收藏可能会丢失。", [
      { label: "知道了" }
    ]);
  }
  function toggleFav(item){
    var had = isFav(item.dkey);
    if(had){
      delete favMap[item.dkey];
    } else {
      var wasEmpty = favCount() === 0;
      var neverWarned = !storeGet(STORE_WARNED);
      favMap[item.dkey] = 1;
      if(wasEmpty || neverWarned) maybeWarnFirstFav();
    }
    saveFavs();
    refreshFavButton();
    return !had;
  }

  var favOnly = false;
  if(favToggleBtn){
    favToggleBtn.addEventListener("click", function(){
      favOnly = !favOnly;
      refreshFavButton();
      render();
    });
  }
  /* ---------- 收藏栏：清除浏览数据 ---------- */
  var favToolsEl = null;
  function ensureFavTools(){
    if(favToolsEl || !listEl.parentNode) return;
    favToolsEl = document.createElement("div");
    favToolsEl.className = "fav-tools hidden";
    var hint = document.createElement("span");
    hint.className = "fav-tools-hint";
    hint.textContent = "收藏保存在本浏览器，可导出为文件备份，或从文件导入。";
    var actions = document.createElement("div");
    actions.className = "fav-actions";
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
    var exportBtn = buildBtn("导出收藏", "fav-act-btn", exportFavs);
    var importBtn = buildBtn("导入收藏", "fav-act-btn", function(){ fileInput.click(); });
    var clearBtn = buildBtn("清除浏览数据", "fav-clear-btn", openClearModal);
    actions.appendChild(importBtn);
    actions.appendChild(exportBtn);
    actions.appendChild(fileInput);
    actions.appendChild(clearBtn);
    favToolsEl.appendChild(hint);
    favToolsEl.appendChild(actions);
    if(listEl.nextSibling){
      listEl.parentNode.insertBefore(favToolsEl, listEl.nextSibling);
    } else {
      listEl.parentNode.appendChild(favToolsEl);
    }
  }
  function syncFavTools(){
    if(!favToolsEl) return;
    if(favOnly){ favToolsEl.classList.remove("hidden"); }
    else { favToolsEl.classList.add("hidden"); }
  }
  function clearFavsData(){
    favMap = {};
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
    var keys = Object.keys(favMap).filter(function(k){ return favMap[k]; });
    var list = keys.map(function(k){
      var it = byKey[k];
      return { key: k, kind: it ? it.kind : "", phrase: it ? it.phrase : "", freq: it ? it.freq : "" };
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
  /* 解析导入内容：兼容导出对象或纯键数组，仅接受当前词库中存在的词条 */
  function collectImportKeys(data){
    var keys = [], seenKey = {};
    function add(k){
      if(typeof k === "string" && k && byKey[k] && !seenKey[k]){
        seenKey[k] = 1;
        keys.push(k);
      }
    }
    if(Object.prototype.toString.call(data) === "[object Array]"){
      for(var i = 0; i < data.length; i++){
        var x = data[i];
        if(typeof x === "string"){
          add(x);
        } else if(x && typeof x === "object"){
          if(typeof x.key === "string"){
            add(x.key);
          } else if(typeof x.phrase === "string" && (x.kind === "惯用语" || x.kind === "成语")){
            add(x.kind + keyOf(x.phrase));
          }
        }
      }
    }
    return keys;
  }
  function handleImportedFavs(data){
    var keys = collectImportKeys(data);
    var rawCount = Object.prototype.toString.call(data) === "[object Array]" ? data.length : 0;
    if(!keys.length){
      openModal("导入失败", "文件中没有可导入的有效收藏（词条不在当前词库中，或文件格式不正确）。", [{ label: "知道了" }]);
      return;
    }
    var note = rawCount > keys.length ? "（另有 " + (rawCount - keys.length) + " 条无法识别或不在词库，已忽略）" : "";
    openModal("导入收藏夹", "文件含 " + keys.length + " 条有效收藏" + note + "。请选择导入方式：", [
      { label: "取消" },
      { label: "合并到当前收藏", cb: function(){ applyImportedFavs(keys, false); } },
      { label: "替换当前收藏", danger: true, cb: function(){ applyImportedFavs(keys, true); } }
    ]);
  }
  function applyImportedFavs(keys, replaceAll){
    if(replaceAll){ favMap = {}; }
    for(var i = 0; i < keys.length; i++){ favMap[keys[i]] = 1; }
    saveFavs();
    refreshFavButton();
    render();
    openModal("导入完成", "导入成功，当前收藏共 " + favCount() + " 条。", [{ label: "知道了" }]);
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
    var starred = isFav(item.dkey);
    var favStar = document.createElement("button");
    favStar.type = "button";
    favStar.className = "fav-btn" + (starred ? " on" : "");
    favStar.title = starred ? "取消收藏（保存在本浏览器）" : "收藏（保存在本浏览器）";
    favStar.setAttribute("aria-pressed", starred ? "true" : "false");
    favStar.textContent = starred ? "★" : "☆";
    right.appendChild(favStar);

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

  function render(){
    shown = items.filter(matches);
    if(sortKey !== "default"){ shown.sort(compareBySort); }
    rendered = 0;
    listEl.textContent = "";

    if(!shown.length){
      var empty = document.createElement("div");
      empty.className = "empty";
      var msg;
      if(favOnly){
        msg = favCount() > 0
          ? "当前收藏里没有符合条件的词条，试试调整筛选条件。"
          : "还没有收藏任何词条：点开词条卡片，点击右上角的 ☆ 即可收藏。";
      } else if(currentQuery || currentFreq !== "all" || currentCat !== "all"){
        msg = "没有找到符合条件的词条，换一个关键词或筛选条件试试。";
      } else {
        msg = "当前词库暂无内容。";
      }
      empty.textContent = msg;
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
        var added = toggleFav(item);
        favStar.textContent = added ? "★" : "☆";
        favStar.classList.toggle("on", added);
        favStar.setAttribute("aria-pressed", added ? "true" : "false");
        favStar.title = added ? "取消收藏（保存在本浏览器）" : "收藏（保存在本浏览器）";
        if(!added && favOnly){ render(); }
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
