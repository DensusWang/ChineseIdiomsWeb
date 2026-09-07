/* 中国惯用语大全 · 交互逻辑（支持词类/常用度双筛选 + 增量加载） */
(function(){
  "use strict";
  var listEl = document.getElementById("list");
  var searchEl = document.getElementById("searchInput");
  var countsEl = document.getElementById("counts");
  var guideEl = document.getElementById("guide");
  var toggleEl = document.getElementById("displayToggle");
  var switchLabel = document.getElementById("switchLabel");
  var catChips = document.getElementById("catChips");
  var freqChips = document.getElementById("freqChips");

  var FREQ_ORDER = ["常用","较常用","一般","少见"];
  var PAGE = 400;

  var items = [];
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
      items.push({
        kind: kind,
        phrase: phrase,
        meaning: String(r[1] || ""),
        e1: String(r[2] || ""),
        e2: String(r[3] || ""),
        freq: freq
      });
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

    var top = document.createElement("div");
    top.className = "card-top";
    var phrase = document.createElement("span");
    phrase.className = "phrase";
    phrase.textContent = item.phrase;

    var right = document.createElement("div");
    right.className = "card-top-right";
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
    if(currentCat !== "all" && item.kind !== currentCat) return false;
    if(currentFreq !== "all" && item.freq !== currentFreq) return false;
    if(!currentQuery) return true;
    return item.hay.indexOf(currentQuery) !== -1;
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
    rendered = 0;
    listEl.textContent = "";

    if(!shown.length){
      var empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = (currentQuery || currentFreq !== "all" || currentCat !== "all")
        ? "没有找到符合条件的词条，换一个关键词或筛选条件试试。"
        : "当前词库暂无内容。";
      listEl.appendChild(empty);
    } else {
      drawMore();
    }
    updateGuide();
  }

  function updateGuide(){
    var tips = [];
    if(!toggleEl.checked) tips.push("释义与例子已隐藏，将鼠标悬停或键盘聚焦到词条上即可查看。");
    var catName = currentCat === "all" ? "全部" : currentCat;
    var freqName = currentFreq === "all" ? "全部" : currentFreq;
    if(currentQuery){
      var scopes = [];
      if(currentCat !== "all") scopes.push(currentCat);
      if(currentFreq !== "all") scopes.push(currentFreq);
      tips.push("找到 " + shown.length + " 条与「" + currentQuery + "」相关的词条" + (scopes.length ? "（" + scopes.join(" / ") + "）" : "") + "。");
    } else {
      tips.push("当前筛选：" + catName + " / " + freqName + "，共 " + shown.length + " 条。");
    }
    guideEl.textContent = tips.join("　");
  }

  function applyDisplay(){
    var on = toggleEl.checked;
    document.body.classList.toggle("compact", !on);
    switchLabel.textContent = on ? "当前：释义全部显示" : "当前：悬停显示释义";
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

  toggleEl.addEventListener("change", function(){
    applyDisplay();
    render();
  });

  searchEl.addEventListener("input", function(){
    currentQuery = searchEl.value.trim().toLowerCase();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(render, 120);
  });

  countsEl.textContent = "共 " + items.length + " 条 · 惯用语 " + habitTotal + " · 成语 " + idiomTotal;
  applyDisplay();
  render();
})();
