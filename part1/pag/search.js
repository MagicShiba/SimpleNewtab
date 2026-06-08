var _searchEngines = [];
var _currentEngine = 0;
var _multiEngines = [];
var _sugItems = [];
var _activeSug = -1;
var _searchFlags = { searchBookmarks: false, searchHistory: false, searchKeywords: true };
var _recentKeywordsCache = [];
var _historySearchCache = [];
var _editingEngineIdx = -1;
var _bookmarkCache = [];
var _blurTimer = null;

var DEFAULT_ENGINES = [
  { name: 'Google',    url: 'https://www.google.com/search?q=',     enabled: true,  isDefault: true },
  { name: '百度',      url: 'https://www.baidu.com/s?wd=',          enabled: true,  isDefault: true },
  { name: 'Bing',      url: 'https://www.bing.com/search?q=',       enabled: true,  isDefault: true },
  { name: 'DuckDuckGo',url: 'https://duckduckgo.com/?q=',           enabled: false, isDefault: true },
  { name: '搜狗',      url: 'https://www.sogou.com/web?query=',     enabled: false, isDefault: true }
];

function initSearch() {
  updateSearchFlags();
  loadSearchSettings(function() {
    renderEngines();
  });
  loadSearchHistory();
  loadBookmarks();
  setupSearchEvents();
  setupSearchSettings();
  chrome.storage.onChanged.addListener(function(changes, area) {
    if (area === 'local' && changes.settings) { updateSearchFlags(); loadSearchHistory(); }
  });
}

function loadBookmarks() {
  hasPerm('bookmarks', function(granted) {
    if (!granted) { _bookmarkCache = []; return; }
    try {
      chrome.bookmarks.search('', function(results) {
        _bookmarkCache = results || [];
      });
    } catch(e) { _bookmarkCache = []; }
  });
}

function loadSearchHistory() {
  hasPerm('history', function(granted) {
    if (!granted) { _historySearchCache = []; return; }
    chrome.storage.local.get('settings', function(result) {
      var s = result.settings || {};
      var maxResults = s.searchHistoryMax || 300;
      chrome.history.search({ text: '', maxResults: maxResults, startTime: 0 }, function(results) {
        _historySearchCache = results || [];
      });
    });
  });
}

function updateSearchFlags() {
  chrome.storage.local.get('settings', function(result) {
    var s = result.settings || {};
    _searchFlags.searchBookmarks = s.searchBookmarks === true;
    _searchFlags.searchHistory = s.searchHistory === true;
    _searchFlags.searchKeywords = s.searchKeywords !== false;
    _recentKeywordsCache = s.recentKeywords || [];
  });
}

function getEnabledEngines() {
  return _searchEngines.filter(function(e) { return e.enabled; });
}

function renderEngines() {
  var bar = document.getElementById('searchEngines');
  var enabled = getEnabledEngines();
  bar.innerHTML = '';
  enabled.forEach(function(e, i) {
    var btn = document.createElement('button');
    var cls = 'engine-btn';
    if (i === _currentEngine) cls += ' active';
    if (_multiEngines.indexOf(i) !== -1) cls += ' multi';
    btn.className = cls;
    btn.textContent = e.name;
    btn.addEventListener('click', function(e2) { e2.preventDefault(); switchEngine(i); });
    btn.addEventListener('contextmenu', function(e2) { e2.preventDefault(); toggleMultiEngine(i); });
    bar.appendChild(btn);
  });
}

function switchEngine(idx) {
  _currentEngine = idx;
  _multiEngines = [];
  renderEngines();
  saveEngineState();
  document.getElementById('searchInput').focus();
}

function toggleMultiEngine(idx) {
  if (idx === _currentEngine) return;
  var i = _multiEngines.indexOf(idx);
  if (i === -1) _multiEngines.push(idx); else _multiEngines.splice(i, 1);
  renderEngines();
  saveEngineState();
}

function saveEngineState() {
  chrome.storage.local.get('settings', function(result) {
    var s = result.settings || {};
    s.currentEngine = _currentEngine;
    s.multiEngines = _multiEngines;
    chrome.storage.local.set({ 'settings': s });
  });
}

function setupSearchEvents() {
  var input = document.getElementById('searchInput');
  input.addEventListener('input', onSearchInput);
  input.addEventListener('keydown', onSearchKeydown);
  input.addEventListener('focus', onSearchFocus);
  input.addEventListener('blur', function() { _blurTimer = setTimeout(hideAll, 500); });
  input.addEventListener('paste', onSearchPaste);
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.search-input-wrap')) hideAll();
  });
}

function hideAll() {
  document.getElementById('searchSuggestions').style.display = 'none';
  document.getElementById('searchRecentDropdown').style.display = 'none';
}

function getInput() {
  return document.getElementById('searchInput').value.trim();
}

function onSearchInput() {
  _activeSug = -1;
  document.getElementById('searchRecentDropdown').style.display = 'none';
  buildAndShow();
}

function buildAndShow() {
  var val = getInput();
  if (!val) { hideSuggestions(); showRecent(); return; }
  var items = buildSuggestions(val);
  renderSuggestions(items);
}

function onSearchFocus() {
  hideSuggestions();
  var val = getInput();
  if (val) showRecent(val); else showRecent();
}

function onSearchPaste(e) {
  setTimeout(function() {
    var val = getInput();
    var links = extractLinks(val);
    if (links.length > 0) {
      var items = [{
        type: '链接', text: links[0], action: 'url', url: links[0],
        extra: links.length > 1 ? '共 ' + links.length + ' 个链接' : ''
      }];
      renderSuggestions(items);
    }
  }, 0);
}

function onSearchKeydown(e) {
  var sug = document.getElementById('searchSuggestions');
  var recent = document.getElementById('searchRecentDropdown');
  var visSug = sug.style.display === 'block';
  var visRecent = recent.style.display === 'block';
  var items = visSug ? sug.querySelectorAll('.sug-item') : (visRecent ? recent.querySelectorAll('.sug-item') : []);
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (!visSug && !visRecent) { buildAndShow(); return; }
    _activeSug = Math.min(_activeSug + 1, items.length - 1);
    highlightSug(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (!visSug && !visRecent) return;
    _activeSug = Math.max(_activeSug - 1, -1);
    highlightSug(items);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (_activeSug >= 0 && _activeSug < items.length) {
      if (visSug && _activeSug < _sugItems.length) {
        acceptSuggestion(_sugItems[_activeSug]);
      } else if (visRecent) {
        var kw = items[_activeSug].querySelector('.text');
        if (kw) {
          document.getElementById('searchInput').value = kw.textContent;
          hideAll();
          doSearch(kw.textContent);
        }
      }
    } else {
      var q = getInput();
      if (_multiEngines.length > 0) doMultiSearch(q); else doSearch(q);
    }
  } else if (e.key === 'Tab') {
    e.preventDefault();
    if (items.length > 0) {
      if (visSug && _sugItems.length > 0) {
        var idx = _activeSug >= 0 ? _activeSug : 0;
        document.getElementById('searchInput').value = _sugItems[idx].text;
      } else if (visRecent) {
        var kw = items[_activeSug >= 0 ? _activeSug : 0];
        if (kw) document.getElementById('searchInput').value = kw.querySelector('.text').textContent;
      }
      onSearchInput();
    }
  } else if (e.key === 'Escape') {
    hideAll();
    document.getElementById('searchInput').blur();
  }
}

function highlightSug(items) {
  items.forEach(function(el, i) { el.classList.toggle('active', i === _activeSug); });
  if (_activeSug >= 0 && items[_activeSug]) items[_activeSug].scrollIntoView({ block: 'nearest' });
}

// === Suggest building ===
function buildSuggestions(val) {
  var items = [];
  var v = val.toLowerCase();

  // Math (always first)
  var mathResult = evalMath(val);
  if (mathResult !== null) items.push({ type: '计算', text: val, action: 'none', preview: '= ' + mathResult });

  // Color
  var colorResult = parseColor(val);
  if (colorResult) items.push({ type: '颜色', text: colorResult.hex, action: 'none', preview: colorResult.rgb + ' ' + colorResult.dec, color: colorResult.hex });

  // URL
  if (isURL(val)) items.push({ type: '网址', text: val, action: 'url', url: val });

  // Recent keywords
  if (_searchFlags.searchKeywords) {
    _recentKeywordsCache.forEach(function(kw) {
      if (kw.toLowerCase().indexOf(v) !== -1) {
        items.push({ type: '最近', text: kw, action: 'search' });
      }
    });
  }

  // Bookmarks (extension custom + Chrome API)
  if (_searchFlags.searchBookmarks) {
    if (typeof _favGroups !== 'undefined' && _favGroups) {
      _favGroups.forEach(function(g) {
        (g.items || []).forEach(function(b) {
          if ((b.title || '').toLowerCase().indexOf(v) !== -1 || (b.url || '').toLowerCase().indexOf(v) !== -1) {
            items.push({ type: '书签', text: b.title || b.url, action: 'url', url: b.url });
          }
        });
      });
    }
    _bookmarkCache.forEach(function(m) {
      if (m.url) {
        var text = m.title || m.url;
        if (text.toLowerCase().indexOf(v) !== -1 || m.url.toLowerCase().indexOf(v) !== -1) {
          items.push({ type: '书签', text: text, action: 'url', url: m.url });
        }
      }
    });
  }

  // History
  if (_searchFlags.searchHistory && _historySearchCache.length > 0) {
    _historySearchCache.forEach(function(h) {
      if (((h.title || '') + ' ' + (h.url || '')).toLowerCase().indexOf(v) !== -1) {
        items.push({ type: '历史', text: h.title || h.url, action: 'url', url: h.url });
      }
    });
  }

  // Search with current engine
  var eng = getEnabledEngines()[_currentEngine];
  items.push({ type: '搜索', text: val, action: 'search', engine: eng ? eng.name : '' });

  // Multi-engine
  if (_multiEngines.length > 0 || val.indexOf(' ') !== -1) {
    items.push({ type: '多搜', text: val, action: 'multisearch', engine: (_multiEngines.length + 1) + '个引擎' });
  }

  return items;
}

function renderSuggestions(items) {
  _sugItems = items;
  _activeSug = -1;
  var el = document.getElementById('searchSuggestions');
  el.innerHTML = '';
  if (!items.length) { el.style.display = 'none'; return; }
  items.forEach(function(item, i) {
    var div = document.createElement('div');
    div.className = 'sug-item';
    var type = document.createElement('span');
    type.className = 'type';
    type.textContent = item.type;
    div.appendChild(type);
    if (item.color) {
      var swatch = document.createElement('span');
      swatch.className = 'color-swatch';
      swatch.style.backgroundColor = item.color;
      div.appendChild(swatch);
    }
    var body = document.createElement('span');
    body.className = 'body';
    var text = document.createElement('span');
    text.className = 'text';
    text.textContent = item.text;
    body.appendChild(text);
    if (item.preview) {
      var prev = document.createElement('span');
      prev.className = 'preview';
      prev.textContent = item.preview;
      body.appendChild(prev);
    }
    if (item.extra) {
      var ext = document.createElement('span');
      ext.className = 'preview';
      ext.textContent = item.extra;
      body.appendChild(ext);
    }
    div.appendChild(body);
    var handler = function(e) {
      if (_blurTimer) { clearTimeout(_blurTimer); _blurTimer = null; }
      if (item.action === 'none') {
        if (window.getSelection().toString()) return;
        acceptSuggestion(item);
      } else {
        acceptSuggestion(item);
      }
    };
    if (item.action === 'none') {
      div.addEventListener('mousedown', function(e) {
        if (_blurTimer) { clearTimeout(_blurTimer); _blurTimer = null; }
      });
      div.addEventListener('click', handler);
    } else {
      div.addEventListener('mousedown', function(e) {
        e.preventDefault();
        handler(e);
      });
    }
    div.addEventListener('mouseenter', function() { _activeSug = i; el.querySelectorAll('.sug-item').forEach(function(s, j) { s.classList.toggle('active', j === i); }); });
    el.appendChild(div);
  });
  el.style.display = 'block';
}

function hideSuggestions() {
  document.getElementById('searchSuggestions').style.display = 'none';
}

function acceptSuggestion(item) {
  hideAll();
  if (item.action === 'url') {
    openUrl(item.url);
  } else if (item.action === 'search') {
    doSearch(item.text);
  } else if (item.action === 'multisearch') {
    doMultiSearch(item.text);
  } else if (item.action === 'none') {
    document.getElementById('searchInput').value = item.text;
  }
}

// === Math (CSP-safe) ===
function evalMath(expr) {
  var s = expr.replace(/\s+/g, '');
  if (!s || !/^[0-9+\-*/.%^x()]+$/.test(s)) return null;
  if (/[+\-*/%^]\s*[+\-*/%^]/.test(s)) return null;
  if ((s.match(/\(/g) || []).length !== (s.match(/\)/g) || []).length) return null;
  s = s.replace(/x/gi, '*').replace(/\^/g, '**');
  try {
    var result = safeEval(s);
    if (typeof result === 'number' && isFinite(result)) {
      return result % 1 === 0 ? result : parseFloat(result.toFixed(10));
    }
  } catch(e) {}
  return null;
}

function safeEval(expr) {
  var tokens = expr.match(/(\d+\.?\d*|\*\*|[+\-*/%()])/g);
  if (!tokens) return NaN;
  var ops = [];
  var vals = [];
  var prec = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '**': 3 };
  function apply() {
    var op = ops.pop();
    var b = vals.pop(), a = vals.pop();
    switch (op) {
      case '+': vals.push(a + b); break;
      case '-': vals.push(a - b); break;
      case '*': vals.push(a * b); break;
      case '/': vals.push(a / b); break;
      case '%': vals.push(a % b); break;
      case '**': vals.push(Math.pow(a, b)); break;
    }
  }
  for (var i = 0; i < tokens.length; i++) {
    var t = tokens[i];
    if (t === '(') { ops.push(t); }
    else if (t === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') apply();
      ops.pop();
    } else if ('+-*/%'.indexOf(t) !== -1 || t === '**') {
      while (ops.length && prec[ops[ops.length - 1]] >= prec[t]) apply();
      ops.push(t);
    } else {
      vals.push(parseFloat(t));
    }
  }
  while (ops.length) apply();
  return vals[0];
}

// === Color ===
function parseColor(text) {
  var m = text.match(/^(#?)([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
  if (!m) return null;
  var hex = m[2];
  if (hex.length === 3 || hex.length === 4) {
    hex = hex.split('').map(function(c) { return c + c; }).join('');
  }
  var r = parseInt(hex.substr(0,2), 16);
  var g = parseInt(hex.substr(2,2), 16);
  var b = parseInt(hex.substr(4,2), 16);
  var dec = r * 65536 + g * 256 + b;
  return { hex: '#' + hex, rgb: 'RGB(' + r + ',' + g + ',' + b + ')', dec: String(dec) };
}

// === URL ===
function isURL(str) {
  return /^https?:\/\/./i.test(str) || /^[a-z0-9]([-a-z0-9]*[a-z0-9])?\.(com|cn|net|org|io|gov|edu|me|dev|app|co)\/?.+/i.test(str);
}

function extractLinks(text) {
  var urls = [];
  var re = /(https?:\/\/[^\s<>"']+)/gi;
  var m;
  while ((m = re.exec(text)) !== null) urls.push(m[1]);
  return urls;
}

// === History ===
function showRecent(filter) {
  var recent = (_recentKeywordsCache && _recentKeywordsCache.length) ? _recentKeywordsCache.slice() : [];
  if (!recent.length) {
    chrome.storage.local.get('settings', function(result) {
      var s = result.settings || {};
      _recentKeywordsCache = s.recentKeywords || [];
      renderRecent(_recentKeywordsCache.slice(0, 10));
    });
    return;
  }
  if (filter) {
    var f = filter.toLowerCase();
    recent = recent.filter(function(kw) { return kw.toLowerCase().indexOf(f) !== -1; });
  }
  renderRecent(recent.slice(0, 10));
}

function renderRecent(items) {
  var el = document.getElementById('searchRecentDropdown');
  el.innerHTML = '';
  if (!items.length) { el.style.display = 'none'; return; }
  items.forEach(function(kw) {
    var div = document.createElement('div');
    div.className = 'sug-item';
    var type = document.createElement('span');
    type.className = 'type';
    type.textContent = '最近';
    div.appendChild(type);
    var body = document.createElement('span');
    body.className = 'body';
    var text = document.createElement('span');
    text.className = 'text';
    text.textContent = kw;
    body.appendChild(text);
    div.appendChild(body);
    var del = document.createElement('span');
    del.className = 'del-btn';
    del.textContent = 'x';
    del.addEventListener('mousedown', function(e) {
      e.stopPropagation();
      e.preventDefault();
      deleteRecent(kw);
    });
    div.appendChild(del);
    div.addEventListener('mousedown', function(e) {
      e.preventDefault();
      document.getElementById('searchInput').value = kw;
      hideAll();
      doSearch(kw);
    });
    el.appendChild(div);
  });
  el.style.display = 'block';
}

function deleteRecent(kw) {
  chrome.storage.local.get('settings', function(result) {
    var s = result.settings || {};
    var list = s.recentKeywords || [];
    var i = list.indexOf(kw);
    if (i !== -1) list.splice(i, 1);
    s.recentKeywords = list;
    _recentKeywordsCache = list;
    chrome.storage.local.set({ 'settings': s });
    showRecent(document.getElementById('searchInput').value);
  });
}

function addRecent(kw) {
  chrome.storage.local.get('settings', function(result) {
    var s = result.settings || {};
    var list = s.recentKeywords || [];
    var i = list.indexOf(kw);
    if (i !== -1) list.splice(i, 1);
    list.unshift(kw);
    if (list.length > 30) list = list.slice(0, 30);
    s.recentKeywords = list;
    _recentKeywordsCache = list;
    chrome.storage.local.set({ 'settings': s });
  });
}

// === Search ===
function doSearch(query) {
  if (!query) return;
  addRecent(query);
  var enabled = getEnabledEngines();
  var eng = enabled[_currentEngine];
  if (!eng) return;
  if (isURL(query) && !query.match(/^https?:\/\//i)) query = 'https://' + query;
  if (isURL(query)) { openUrl(query); return; }
  openUrl(eng.url + encodeURIComponent(query));
}

function doMultiSearch(query) {
  if (!query) return;
  addRecent(query);
  if (isURL(query) && !query.match(/^https?:\/\//i)) query = 'https://' + query;
  if (isURL(query)) { openUrl(query); return; }
  var indices = [_currentEngine].concat(_multiEngines);
  var seen = {};
  indices.forEach(function(i) {
    var eng = getEnabledEngines()[i];
    if (eng && !seen[eng.name]) {
      seen[eng.name] = true;
      openUrl(eng.url + encodeURIComponent(query));
    }
  });
}

function openUrl(url) {
  var a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// === Settings ===
function loadSearchSettings(callback) {
  chrome.storage.local.get('settings', function(result) {
    var s = result.settings || {};
    _searchEngines = (s.customEngines && s.customEngines.length > 0) ? s.customEngines : DEFAULT_ENGINES.map(function(e) { return Object.assign({}, e); });
    if (s.currentEngine !== undefined) _currentEngine = s.currentEngine;
    if (s.multiEngines) _multiEngines = s.multiEngines.slice();
    if (callback) callback();
  });
}

function saveSearchEngines() {
  chrome.storage.local.get('settings', function(result) {
    var s = result.settings || {};
    s.customEngines = _searchEngines;
    chrome.storage.local.set({ 'settings': s });
  });
}

function renderEngineSettings() {
  var list = document.getElementById('searchEngineList');
  list.innerHTML = '';
  _searchEngines.forEach(function(e, i) {
    var row = document.createElement('div');
    row.className = 'engine-row';
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = e.enabled;
    cb.addEventListener('change', function() {
      e.enabled = cb.checked;
      saveSearchEngines();
      renderEngines();
    });
    row.appendChild(cb);
    var name = document.createElement('span');
    name.className = 'name';
    name.textContent = e.name;
    name.style.cursor = 'pointer';
    name.addEventListener('click', function() {
      _editingEngineIdx = i;
      document.getElementById('engineName').value = e.name;
      document.getElementById('engineUrl').value = e.url;
      document.getElementById('engineDialog').style.display = 'block';
    });
    row.appendChild(name);
    var urlSpan = document.createElement('span');
    urlSpan.className = 'url';
    urlSpan.textContent = e.url;
    urlSpan.style.cursor = 'pointer';
    urlSpan.addEventListener('click', function() {
      _editingEngineIdx = i;
      document.getElementById('engineName').value = e.name;
      document.getElementById('engineUrl').value = e.url;
      document.getElementById('engineDialog').style.display = 'block';
    });
    row.appendChild(urlSpan);
    if (!e.isDefault) {
      var del = document.createElement('span');
      del.className = 'del-btn';
      del.textContent = 'x';
      del.addEventListener('click', function() {
        _searchEngines.splice(i, 1);
        saveSearchEngines();
        renderEngineSettings();
        renderEngines();
      });
      row.appendChild(del);
    }
    list.appendChild(row);
  });
}

function setupSearchSettings() {
  renderEngineSettings();

  document.getElementById('addEngineBtn').addEventListener('click', function() {
    _editingEngineIdx = -1;
    document.getElementById('engineName').value = '';
    document.getElementById('engineUrl').value = '';
    document.getElementById('engineDialog').style.display = 'block';
  });
  document.getElementById('engineCancel').addEventListener('click', function() {
    document.getElementById('engineDialog').style.display = 'none';
    _editingEngineIdx = -1;
  });
  document.getElementById('engineOk').addEventListener('click', function() {
    var name = document.getElementById('engineName').value.trim();
    var url = document.getElementById('engineUrl').value.trim();
    if (name && url) {
      if (_editingEngineIdx >= 0 && _editingEngineIdx < _searchEngines.length) {
        var e = _searchEngines[_editingEngineIdx];
        e.name = name;
        e.url = url;
      } else {
        _searchEngines.push({ name: name, url: url, enabled: true });
      }
      saveSearchEngines();
      renderEngineSettings();
      renderEngines();
    }
    document.getElementById('engineDialog').style.display = 'none';
    _editingEngineIdx = -1;
  });
}
