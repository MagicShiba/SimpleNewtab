var _editKey = null;
var _ctxSource = null;
var _wallpaperData = null;
var _wallpaperObjectUrl = null;
var _currentRawUrl = '';
var _historyCache = [];
var _favGroups = [];
var _activeGroupIndex = 0;
var _groupTabContext = -1;
var _groupDragging = false;

function faviconURL(u) {
  var url = new URL(chrome.runtime.getURL('/_favicon/'));
  url.searchParams.set('pageUrl', u);
  url.searchParams.set('size', '32');
  return url.toString();
}

function renderItem(site) {
  var div = document.createElement('div');
  div.className = 'fli';
  div.setAttribute('data-title', site.title);
  div.setAttribute('data-url', site.url);

  var a = document.createElement('a');
  a.className = 'fli-link';
  a.href = site.url;
  a.target = '_self';
  a.draggable = true;
  a.setAttribute('aria-label', site.title);

  var img = document.createElement('img');
  img.src = site.icon || faviconURL(site.url);
  img.alt = '';

  var span = document.createElement('span');
  span.textContent = site.title;

  div.appendChild(a);
  div.appendChild(img);
  div.appendChild(span);

  div.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, div, 'bookmark');
  });

  return div;
}

function renderList(datalist, listId) {
  var list = document.getElementById(listId);
  while (list.firstChild) list.removeChild(list.firstChild);

  if (!datalist) return;

  if (Array.isArray(datalist)) {
    datalist.forEach(function(item) {
      list.appendChild(renderItem(item));
    });
  } else {
    for (var key in datalist) {
      if (datalist.hasOwnProperty(key)) {
        list.appendChild(renderItem({ title: key, url: datalist[key] }));
      }
    }
  }
  applyBlur();
}

// ---- panel toggle ----
function togglePanel(panelId, iconId) {
  var panel = document.getElementById(panelId);
  var icon = document.getElementById(iconId);
  var panels = ['Div_seting_hid', 'Div_history_hid'];
  var icons = ['Div_seting', 'Div_history_icon'];

  var isOpen = panel.style.display === 'block';

  panels.forEach(function(id) {
    document.getElementById(id).style.display = 'none';
  });
  icons.forEach(function(id) {
    document.getElementById(id).classList.remove('active');
  });

  if (!isOpen) {
    panel.style.display = 'block';
    icon.classList.add('active');
  }
}

// ---- history ----
function renderHistoryResults(results) {
  var list = document.getElementById('history-list');
  while (list.firstChild) list.removeChild(list.firstChild);
  results.forEach(function(item) {
    var a = document.createElement('a');
    a.className = 'his-item';
    a.href = item.url;
    a.target = '_self';
    var img = document.createElement('img');
    img.src = faviconURL(item.url);
    img.alt = '';
    var span = document.createElement('span');
    span.textContent = item.title || item.url;
    a.appendChild(img);
    a.appendChild(span);
    a.addEventListener('contextmenu', function(e) {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, a, 'history');
    });
    list.appendChild(a);
  });
  applyBlur();
}

function loadHistory(query) {
  if (!query) {
    chrome.history.search({ text: '', maxResults: 200, startTime: 0 }, function(results) {
      _historyCache = results;
      renderHistoryResults(results);
    });
  } else {
    var q = query.toLowerCase();
    var filtered = _historyCache.filter(function(item) {
      return (item.title || '').toLowerCase().indexOf(q) !== -1 ||
             (item.url || '').toLowerCase().indexOf(q) !== -1;
    });
    renderHistoryResults(filtered);
  }
}

// ---- context menu ----
function showContextMenu(x, y, el, source) {
  var menu = document.getElementById('contextMenu');
  _ctxSource = { el: el, source: source };

  var isRecent = el.closest('#most-visited-list');
  var showActions = (source === 'bookmark' && !isRecent);
  document.getElementById('ctxAddFav').style.display = showActions ? 'none' : 'block';
  document.getElementById('ctxEdit').style.display = showActions ? 'block' : 'none';
  document.getElementById('ctxDelete').style.display = showActions ? 'block' : 'none';

  menu.style.display = 'block';
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
}

function hideContextMenu() {
  document.getElementById('contextMenu').style.display = 'none';
  _ctxSource = null;
}

// ---- bookmark CRUD ----
function saveBookmark(title, url, oldTitle, icon) {
  var items = _favGroups[_activeGroupIndex].items;
  if (oldTitle) {
    var found = items.find(function(item) { return item.title === oldTitle; });
    if (found) {
      found.title = title;
      found.url = url;
      found.icon = icon !== undefined ? icon : '';
    }
  } else {
    items.push({ title: title, url: url, icon: icon || '' });
  }
  saveFavGroups();
  renderList(items, 'fov-list');
}

function deleteBookmark(title) {
  var items = _favGroups[_activeGroupIndex].items;
  var idx = items.findIndex(function(item) { return item.title === title; });
  if (idx !== -1) items.splice(idx, 1);
  saveFavGroups();
  renderList(items, 'fov-list');
}

// ---- group management ----
function loadFavGroups() {
  chrome.storage.local.get(['Fav', 'FavGroups', 'activeGroup'], function(result) {
    if (result.Fav && !result.FavGroups) {
      var items = [];
      for (var key in result.Fav) {
        if (result.Fav.hasOwnProperty(key)) items.push({ title: key, url: result.Fav[key] });
      }
      _favGroups = [{ name: '', items: items }];
      chrome.storage.local.remove('Fav');
    } else if (result.FavGroups) {
      _favGroups = result.FavGroups;
    } else {
      _favGroups = [{ name: '', items: [] }];
    }
    _favGroups.forEach(function(g) {
      if (g.items && !Array.isArray(g.items)) {
        var arr = [];
        for (var key in g.items) {
          if (g.items.hasOwnProperty(key)) arr.push({ title: key, url: g.items[key] });
        }
        g.items = arr;
      }
    });
    _activeGroupIndex = result.activeGroup || 0;
    if (_activeGroupIndex >= _favGroups.length) _activeGroupIndex = 0;
    renderGroups();
    renderPopupGroups();
    saveFavGroups();
  });
}

function saveFavGroups() {
  chrome.storage.local.set({ FavGroups: _favGroups, activeGroup: _activeGroupIndex });
}

function renderGroups() {
  document.querySelector('.group-title').classList.toggle('active', _activeGroupIndex === 0);
  renderGroupTabs();
  renderList(_favGroups[_activeGroupIndex].items, 'fov-list');
}

function renderGroupTabs() {
  var tabs = document.getElementById('groupTabs');
  while (tabs.firstChild) tabs.removeChild(tabs.firstChild);
  var dragIndex = -1;
  _favGroups.forEach(function(g, i) {
    if (i === 0) return;
    var tab = document.createElement('div');
    tab.className = 'group-tab' + (i === _activeGroupIndex ? ' active' : '');
    tab.textContent = g.name;
    tab.dataset.index = i;
    tab.draggable = true;
    tab.addEventListener('click', function() { switchGroup(parseInt(this.dataset.index)); });
    tab.addEventListener('contextmenu', function(e) {
      e.preventDefault();
      e.stopPropagation();
      showGroupMenu(e.clientX, e.clientY, i);
    });
    tab.addEventListener('dblclick', function() {
      startInlineRename(parseInt(this.dataset.index));
    });
    tab.addEventListener('dragstart', function(e) {
      dragIndex = i;
      _groupDragging = true;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', 'group');
    });
    tab.addEventListener('dragover', function(e) {
      if (dragIndex === -1 || dragIndex === i) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      tabs.querySelectorAll('.drop-before').forEach(function(el) { el.classList.remove('drop-before'); });
      if (i > dragIndex) {
        tab.classList.add('drop-before');
      } else {
        tab.previousElementSibling && tab.previousElementSibling.classList.add('drop-before');
      }
    });
    tab.addEventListener('dragleave', function(e) {
      tab.classList.remove('drop-before');
    });
    tab.addEventListener('drop', function(e) {
      e.preventDefault();
      e.stopPropagation();
      if (dragIndex === -1 || dragIndex === i) { dragIndex = -1; return; }
      tabs.querySelectorAll('.drop-before').forEach(function(el) { el.classList.remove('drop-before'); });
      var item = _favGroups.splice(dragIndex, 1)[0];
      var targetIndex = i;
      if (dragIndex < targetIndex) targetIndex--;
      _favGroups.splice(targetIndex, 0, item);
      if (_activeGroupIndex === dragIndex) {
        _activeGroupIndex = targetIndex;
      } else if (dragIndex < _activeGroupIndex && targetIndex >= _activeGroupIndex) {
        _activeGroupIndex--;
      } else if (dragIndex > _activeGroupIndex && targetIndex <= _activeGroupIndex) {
        _activeGroupIndex++;
      }
      dragIndex = -1;
      saveFavGroups();
      renderGroups();
    });
    tab.addEventListener('dragend', function(e) {
      dragIndex = -1;
      _groupDragging = false;
      tabs.querySelectorAll('.drop-before').forEach(function(el) { el.classList.remove('drop-before'); });
    });
    tabs.appendChild(tab);
  });
}

function switchGroup(index) {
  if (index === _activeGroupIndex || index < 0 || index >= _favGroups.length) return;
  _activeGroupIndex = index;
  renderGroups();
  saveFavGroups();
}

function addGroup(name) {
  if (!name || !name.trim()) return;
  _favGroups.push({ name: name.trim(), items: [] });
  _activeGroupIndex = _favGroups.length - 1;
  renderGroups();
  saveFavGroups();
  renderPopupGroups();
}

function getUniqueGroupName(baseName) {
  var names = _favGroups.map(function(g) { return g.name; });
  if (!names.includes(baseName)) return baseName;
  var i = 2;
  while (names.includes(baseName + ' ' + i)) i++;
  return baseName + ' ' + i;
}

function startInlineCreate() {
  var tabs = document.getElementById('groupTabs');
  var wrapper = document.createElement('div');
  wrapper.className = 'group-tab';
  var input = document.createElement('input');
  input.className = 'group-input';
  input.value = '新建组';
  wrapper.appendChild(input);
  tabs.appendChild(wrapper);
  var finished = false;
  function finish() {
    if (finished) return;
    finished = true;
    var val = input.value.trim() || '新建组';
    val = getUniqueGroupName(val);
    addGroup(val);
  }
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); finish(); }
    if (e.key === 'Escape') { e.preventDefault(); if (wrapper.parentNode) wrapper.remove(); finished = true; }
  });
  input.addEventListener('blur', finish);
  input.focus();
  input.select();
}

function startInlineRename(index) {
  if (index <= 0 || index >= _favGroups.length) return;
  var tab = document.getElementById('groupTabs').children[index - 1];
  if (!tab) return;
  var oldName = _favGroups[index].name;
  tab.textContent = '';
  var input = document.createElement('input');
  input.className = 'group-input';
  input.value = oldName;
  tab.appendChild(input);
  var finished = false;
  function finish() {
    if (finished) return;
    finished = true;
    var val = input.value.trim();
    if (val && val !== _favGroups[index].name) {
      renameGroup(index, val);
    } else {
      renderGroups();
    }
  }
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); finish(); }
    if (e.key === 'Escape') { e.preventDefault(); renderGroups(); finished = true; }
  });
  input.addEventListener('blur', finish);
  input.focus();
  input.select();
}

function renameGroup(index, name) {
  if (index === 0 || !name || !name.trim()) return;
  name = name.trim();
  if (name === _favGroups[index].name) return;
  _favGroups[index].name = name;
  renderGroups();
  saveFavGroups();
  renderPopupGroups();
}

function deleteGroup(index) {
  if (index === 0 || _favGroups.length <= 1) return;
  _favGroups.splice(index, 1);
  if (_activeGroupIndex >= _favGroups.length) _activeGroupIndex = _favGroups.length - 1;
  renderGroups();
  saveFavGroups();
  renderPopupGroups();
}

function showGroupMenu(x, y, index) {
  _groupTabContext = index;
  var menu = document.getElementById('groupMenu');
  menu.style.display = 'block';
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
}

function hideGroupMenu() {
  document.getElementById('groupMenu').style.display = 'none';
  _groupTabContext = -1;
}

function iconDomain(url) {
  var m = url.match(/:\/\/([^\/]+)/);
  return m ? m[1] : url;
}

function openInputWindow(title, url, oldTitle) {
  _editKey = oldTitle || null;
  document.getElementById('u_title').value = title || '';
  document.getElementById('u_url').value = url || '';
  document.getElementById('inputWindow').style.display = 'block';
  document.getElementById('btndelete').style.display = oldTitle ? '' : 'none';

  var iconOptions = document.getElementById('iconOptions');
  iconOptions.innerHTML = '';
  document.getElementById('u_icon').value = '';
  var selectedIcon = '';
  if (oldTitle) {
    var items = _favGroups[_activeGroupIndex].items;
    var found = items.find(function(item) { return item.title === oldTitle; });
    if (found && found.icon) selectedIcon = found.icon;
  }
  chrome.history.search({ text: '', maxResults: 100, startTime: 0 }, function(results) {
    var noneDiv = document.createElement('div');
    noneDiv.className = 'icon-option' + (!selectedIcon ? ' selected' : '');
    noneDiv.textContent = '×';
    noneDiv.title = '使用默认图标';
    noneDiv.addEventListener('click', function() {
      iconOptions.querySelectorAll('.selected').forEach(function(el) { el.classList.remove('selected'); });
      noneDiv.classList.add('selected');
      document.getElementById('u_icon').value = '';
    });
    iconOptions.appendChild(noneDiv);
    var seen = {};
    results.forEach(function(site) {
      if (!site.url) return;
      var domain = iconDomain(site.url);
      if (seen[domain]) return;
      seen[domain] = true;
      var div = document.createElement('div');
      div.className = 'icon-option';
      var img = document.createElement('img');
      img.src = faviconURL(site.url);
      img.alt = site.title || domain;
      img.title = site.title || domain;
      if (faviconURL(site.url) === selectedIcon) div.classList.add('selected');
      div.appendChild(img);
      div.addEventListener('click', function() {
        iconOptions.querySelectorAll('.selected').forEach(function(el) { el.classList.remove('selected'); });
        div.classList.add('selected');
        document.getElementById('u_icon').value = faviconURL(site.url);
      });
      iconOptions.appendChild(div);
    });
  });
}

function closeInputWindow() {
  _editKey = null;
  document.getElementById('inputWindow').style.display = 'none';
  document.getElementById('iconOptions').innerHTML = '';
  document.getElementById('u_icon').value = '';
}

function addLink() {
  var title = document.getElementById('u_title').value.trim();
  var url = document.getElementById('u_url').value.trim();
  var icon = document.getElementById('u_icon').value.trim();
  if (!title || !url) return;
  saveBookmark(title, url, _editKey, icon);
  closeInputWindow();
}

// ---- drag & drop + reorder ----
var _dragSourceIndex = -1;

function setupDragDrop() {
  var zone = document.getElementById('left-drop-zone');
  var hint = document.getElementById('dropHint');
  var dragCounter = 0;
  var fovList = document.getElementById('fov-list');

  // ---- internal reorder ----
  fovList.addEventListener('dragstart', function(e) {
    var fli = e.target.closest('.fli');
    if (!fli) return;
    _dragSourceIndex = Array.prototype.indexOf.call(fovList.children, fli);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'reorder');
  });

  fovList.addEventListener('dragover', function(e) {
    if (_dragSourceIndex === -1) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    fovList.querySelectorAll('.drop-before').forEach(function(el) { el.classList.remove('drop-before'); });
    var target = e.target.closest('.fli');
    if (target) target.classList.add('drop-before');
  });

  fovList.addEventListener('drop', function(e) {
    if (_dragSourceIndex === -1) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounter = 0;
    hint.classList.remove('show');
    fovList.querySelectorAll('.drop-before').forEach(function(el) { el.classList.remove('drop-before'); });
    var target = e.target.closest('.fli');
    if (!target) return;
    var targetIndex = Array.prototype.indexOf.call(fovList.children, target);
    if (_dragSourceIndex === targetIndex) { _dragSourceIndex = -1; return; }
    var items = _favGroups[_activeGroupIndex].items;
    var item = items.splice(_dragSourceIndex, 1)[0];
    items.splice(targetIndex, 0, item);
    _dragSourceIndex = -1;
    saveFavGroups();
    renderList(items, 'fov-list');
  });

  fovList.addEventListener('dragend', function(e) {
    if (_dragSourceIndex === -1) return;
    _dragSourceIndex = -1;
    dragCounter = 0;
    hint.classList.remove('show');
    fovList.querySelectorAll('.drop-before').forEach(function(el) { el.classList.remove('drop-before'); });
  });

  // ---- external drop ----
  zone.addEventListener('dragenter', function(e) {
    if (_dragSourceIndex !== -1 || _groupDragging) return;
    e.preventDefault();
    dragCounter++;
    if (dragCounter === 1) hint.classList.add('show');
  });

  zone.addEventListener('dragleave', function(e) {
    if (_dragSourceIndex !== -1 || _groupDragging) return;
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) hint.classList.remove('show');
  });

  zone.addEventListener('dragover', function(e) {
    e.preventDefault();
  });

  function showToast(msg) {
    var toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(function() { toast.classList.add('show'); }, 10);
    setTimeout(function() {
      toast.classList.remove('show');
      setTimeout(function() { toast.remove(); }, 300);
    }, 4000);
  }

  function getTitleFromDrop(e, url, callback) {
    var html = e.dataTransfer.getData('text/html') || '';
    if (html) {
      var temp = document.createElement('div');
      temp.innerHTML = html;
      var link = temp.querySelector('a');
      if (link) {
        var t = link.textContent || '';
        if (t.trim() && t.indexOf('javascript:') !== 0) { callback(t.trim()); return; }
      }
    }
    var plain = e.dataTransfer.getData('text/plain') || '';
    if (plain && plain.indexOf('http') !== 0 && plain.indexOf('://') === -1) {
      var lines = plain.split('\n');
      if (lines[0] && lines[0].trim() && lines[0].indexOf('http') !== 0 && lines[0].indexOf('javascript:') !== 0) {
        callback(lines[0].trim()); return;
      }
    }
    if (url.indexOf('javascript:') === 0) { callback('无标题'); return; }
    chrome.bookmarks.search({ url: url }, function(marks) {
      if (marks && marks.length > 0 && marks[0].title) {
        callback(marks[0].title); return;
      }
      chrome.history.search({ text: url, maxResults: 1 }, function(results) {
        if (results.length > 0 && results[0].title) {
          callback(results[0].title); return;
        }
        callback(url);
      });
    });
  }

  zone.addEventListener('drop', function(e) {
    if (_dragSourceIndex !== -1) { _dragSourceIndex = -1; return; }
    e.preventDefault();
    dragCounter = 0;
    hint.classList.remove('show');

    var url = e.dataTransfer.getData('text/uri-list') || '';
    var html = e.dataTransfer.getData('text/html') || '';
    var plain = e.dataTransfer.getData('text/plain') || '';
    var isJS = false;

    if (url === 'about:blank#blocked' || !url) {
      if (plain && plain.indexOf('javascript:') === 0) {
        url = plain;
        isJS = true;
      } else if (html) {
        var temp = document.createElement('div');
        temp.innerHTML = html;
        var link = temp.querySelector('a');
        if (link) {
          var rawHref = link.getAttribute('href');
          if (rawHref && rawHref.indexOf('javascript:') === 0) {
            url = rawHref;
            isJS = true;
          } else if (!url) {
            url = rawHref || link.href;
          }
        }
      }
    }

    if (!url) return;

    if (isJS) showToast('javascript脚本已添加，但受浏览器限制，此类型的网址在插件环境下无法执行。');
    getTitleFromDrop(e, url, function(title) {
      saveBookmark(title, url);
    });
  });
}

// ---- blur ----
function applyBlur() {
  var enabled = document.getElementById('enableBlur').checked;
  var items = document.querySelectorAll('.fli, .his-item');
  items.forEach(function(el) {
    if (enabled) el.classList.add('blurred');
    else el.classList.remove('blurred');
  });
}

function setupBlurToggle() {
  var cb = document.getElementById('enableBlur');
  chrome.storage.local.get('settings', function(result) {
    var s = result.settings || {};
    if (s.enableBlur !== undefined) cb.checked = s.enableBlur;
    applyBlur();
  });
  cb.addEventListener('change', function() {
    applyBlur();
    chrome.storage.local.get('settings', function(result) {
      var s = result.settings || {};
      s.enableBlur = cb.checked;
      chrome.storage.local.set({ 'settings': s });
    });
  });
}

// ---- light mode ----
function applyLightMode() {
  document.documentElement.classList.toggle('light', document.getElementById('lightMode').checked);
  applyPanelOpacity();
}

function applyPanelOpacity() {
  document.documentElement.style.setProperty('--panel-bg-a', parseInt(document.getElementById('panelOpacity').value) / 100);
}

function setupLightMode() {
  var cb = document.getElementById('lightMode');
  chrome.storage.local.get('settings', function(result) {
    var s = result.settings || {};
    if (s.lightMode !== undefined) cb.checked = s.lightMode;
    applyLightMode();
  });
  cb.addEventListener('change', function() {
    applyLightMode();
    chrome.storage.local.get('settings', function(result) {
      var s = result.settings || {};
      s.lightMode = cb.checked;
      chrome.storage.local.set({ 'settings': s });
    });
  });
}

// ---- wallpaper ----
function base64ToBlobUrl(dataUrl) {
  var parts = dataUrl.split(',');
  var mime = parts[0].match(/:(.*?);/)[1];
  var raw = atob(parts[1]);
  var len = raw.length;
  var u8 = new Uint8Array(len);
  for (var i = 0; i < len; i++) u8[i] = raw.charCodeAt(i);
  return URL.createObjectURL(new Blob([u8], { type: mime }));
}

function compressImage(file, quality, maxSize, callback) {
  var objUrl = URL.createObjectURL(file);
  var img = new Image();
  img.onload = function() {
    URL.revokeObjectURL(objUrl);
    var w = img.width, h = img.height;
    if (maxSize > 0 && Math.max(w, h) > maxSize) {
      if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
      else { w = Math.round(w * maxSize / h); h = maxSize; }
    }
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    callback(canvas.toDataURL('image/jpeg', quality));
  };
  img.onerror = function() {
    URL.revokeObjectURL(objUrl);
    callback(null);
  };
  img.src = objUrl;
}

function applyWallpaperStyle() {
  var fit = document.getElementById('wallpaperFit').value;
  var blur = document.getElementById('wallpaperBlur').value;
  var brightness = document.getElementById('wallpaperBrightness').value;
  var bg = document.getElementById('wallpaper-bg');
  var fitMap = { cover: 'cover', contain: 'contain', fill: '100% 100%', none: 'auto', repeat: 'auto' };
  bg.style.backgroundSize = fitMap[fit] || fit;
  bg.style.backgroundRepeat = fit === 'repeat' ? 'repeat' : 'no-repeat';
  bg.style.filter = 'brightness(' + (brightness / 100) + ') blur(' + blur + 'px)';
}

function applyWallpaper() {
  var rawUrl = _wallpaperData || document.getElementById('wallpaperUrl').value.trim();
  var wrap = document.getElementById('wallpaper-bg-wrap');
  var bg = document.getElementById('wallpaper-bg');

  if (rawUrl) {
    wrap.style.display = 'block';
    if (rawUrl !== _currentRawUrl) {
      if (_wallpaperObjectUrl) {
        URL.revokeObjectURL(_wallpaperObjectUrl);
        _wallpaperObjectUrl = null;
      }
      if (rawUrl.indexOf('data:') === 0) {
        _wallpaperObjectUrl = base64ToBlobUrl(rawUrl);
        bg.style.backgroundImage = 'url("' + _wallpaperObjectUrl + '")';
      } else {
        bg.style.backgroundImage = 'url("' + rawUrl.replace(/["\\]/g, '\\$&') + '")';
      }
      _currentRawUrl = rawUrl;
    }
    applyWallpaperStyle();
  } else {
    wrap.style.display = 'none';
    bg.style.backgroundImage = '';
    _currentRawUrl = '';
  }
}

function saveWallpaper() {
  applyWallpaper();
  chrome.storage.local.get('settings', function(result) {
    var s = result.settings || {};
    s.wallpaperUrl = document.getElementById('wallpaperUrl').value;
    s.wallpaperData = _wallpaperData || '';
    s.wallpaperFit = document.getElementById('wallpaperFit').value;
    s.wallpaperBlur = parseInt(document.getElementById('wallpaperBlur').value, 10);
    s.wallpaperBrightness = parseInt(document.getElementById('wallpaperBrightness').value, 10);
    s.wallpaperMaxSize = parseInt(document.getElementById('wallpaperMaxSize').value, 10) || 0;
    s.panelOpacity = parseInt(document.getElementById('panelOpacity').value, 10);
    chrome.storage.local.set({ 'settings': s });
  });
}

function setupWallpaper() {
  var urlInput = document.getElementById('wallpaperUrl');
  var fitSelect = document.getElementById('wallpaperFit');
  var blurRange = document.getElementById('wallpaperBlur');
  var brightnessRange = document.getElementById('wallpaperBrightness');
  var opacityRange = document.getElementById('panelOpacity');
  var maxSizeInput = document.getElementById('wallpaperMaxSize');

  chrome.storage.local.get('settings', function(result) {
    var s = result.settings || {};
    if (s.wallpaperUrl !== undefined) urlInput.value = s.wallpaperUrl;
    if (s.wallpaperData) {
      _wallpaperData = s.wallpaperData;
      urlInput.value = '[本地图片]';
      urlInput.readOnly = true;
    }
    if (s.wallpaperFit !== undefined) fitSelect.value = s.wallpaperFit;
    if (s.wallpaperBlur !== undefined) blurRange.value = s.wallpaperBlur;
    if (s.wallpaperBrightness !== undefined) brightnessRange.value = s.wallpaperBrightness;
    if (s.wallpaperMaxSize !== undefined) maxSizeInput.value = s.wallpaperMaxSize;
    if (s.panelOpacity !== undefined) opacityRange.value = s.panelOpacity;
    applyWallpaper();
    applyPanelOpacity();
    document.getElementById('wallpaperBlurVal').textContent = blurRange.value + 'px';
    document.getElementById('wallpaperBrightnessVal').textContent = brightnessRange.value + '%';
    document.getElementById('panelOpacityVal').textContent = opacityRange.value + '%';
  });

  urlInput.addEventListener('change', function() {
    _wallpaperData = null;
    urlInput.readOnly = false;
    saveWallpaper();
  });
  fitSelect.addEventListener('change', saveWallpaper);
  blurRange.addEventListener('input', function() {
    document.getElementById('wallpaperBlurVal').textContent = this.value + 'px';
    applyWallpaperStyle();
  });
  blurRange.addEventListener('change', saveWallpaper);
  brightnessRange.addEventListener('input', function() {
    document.getElementById('wallpaperBrightnessVal').textContent = this.value + '%';
    applyWallpaperStyle();
  });
  brightnessRange.addEventListener('change', saveWallpaper);
  opacityRange.addEventListener('input', function() {
    document.getElementById('panelOpacityVal').textContent = this.value + '%';
    applyPanelOpacity();
  });
  opacityRange.addEventListener('change', saveWallpaper);
  maxSizeInput.addEventListener('change', saveWallpaper);

  document.getElementById('wallpaperFileBtn').addEventListener('click', function() {
    document.getElementById('wallpaperFile').click();
  });

  document.getElementById('wallpaperFile').addEventListener('change', function() {
    var file = this.files[0];
    if (!file) return;
    var maxSize = parseInt(document.getElementById('wallpaperMaxSize').value, 10) || 0;
    compressImage(file, 0.85, maxSize, function(dataUrl) {
      if (!dataUrl) return;
      _wallpaperData = dataUrl;
      urlInput.value = '[本地图片]';
      urlInput.readOnly = true;
      saveWallpaper();
    });
    this.value = '';
  });

  document.getElementById('clearWallpaper').addEventListener('click', function() {
    _wallpaperData = null;
    urlInput.value = '';
    urlInput.readOnly = false;
    saveWallpaper();
  });
}

// ---- visibility toggles ----
function setupToggles() {
  var showFav = document.getElementById('showFav');
  var showRecent = document.getElementById('showRecent');

  chrome.storage.local.get('settings', function(result) {
    var s = result.settings || {};
    if (s.showFav !== undefined) showFav.checked = s.showFav;
    if (s.showRecent !== undefined) showRecent.checked = s.showRecent;
    applyVisibility();
  });

  showFav.addEventListener('change', function() { applyVisibility(); saveVisState(); });
  showRecent.addEventListener('change', function() { applyVisibility(); saveVisState(); });
}

function applyVisibility() {
  document.querySelector('.left-div').style.display = document.getElementById('showFav').checked ? '' : 'none';
  document.querySelector('.right-div').style.display = document.getElementById('showRecent').checked ? '' : 'none';
}

function saveVisState() {
  chrome.storage.local.get('settings', function(result) {
    var s = result.settings || {};
    s.showFav = document.getElementById('showFav').checked;
    s.showRecent = document.getElementById('showRecent').checked;
    chrome.storage.local.set({ 'settings': s });
  });
}

// ---- lunar calendar ----
var lunarInfo = [0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2,0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977,0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970,0x06566,0x0d4a0,0x0ea50,0x16a95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950,0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557,0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0,0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0,0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6,0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570,0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x05ac0,0x0ab60,0x096d5,0x092e0,0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530,0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45,0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0,0x14b63];
var lunarMonths = ['正','二','三','四','五','六','七','八','九','十','冬','腊'];
var lunarDays = ['初一','初二','初三','初四','初五','初六','初七','初八','初九','初十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];

function lYearDays(y) { var i, s = 348; for (i = 0x8000; i > 0x8; i >>= 1) s += (lunarInfo[y-1900] & i) ? 1 : 0; return s + leapDays(y); }
function leapMonth(y) { return lunarInfo[y-1900] & 0xf; }
function leapDays(y) { return leapMonth(y) ? (lunarInfo[y-1900] & 0x10000 ? 30 : 29) : 0; }
function monthDays(y, m) { return (lunarInfo[y-1900] & (0x10000 >> m)) ? 30 : 29; }

function solar2lunar(y, m, d) {
  var base = new Date(1900, 0, 31);
  var target = new Date(y, m - 1, d);
  var offset = Math.floor((target - base) / 86400000);
  var i, temp = 0, lunarYear;
  for (i = 1900; i < 2101 && offset > 0; i++) { temp = lYearDays(i); offset -= temp; }
  if (offset < 0) { offset += temp; i--; }
  lunarYear = i;
  var leap = leapMonth(i);
  var months = [];
  for (i = 1; i <= 12; i++) { months.push({ m: i, leap: false }); if (leap === i) months.push({ m: i, leap: true }); }
  for (i = 0; i < months.length && offset >= 0; i++) {
    temp = months[i].leap ? leapDays(lunarYear) : monthDays(lunarYear, months[i].m);
    if (offset < temp) break;
    offset -= temp;
  }
  return { year: lunarYear, month: months[i].m, day: offset + 1, isLeap: months[i].leap };
}

// ---- clock ----
function updateClock() {
  var now = new Date();
  var y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate();
  var w = ['日','一','二','三','四','五','六'][now.getDay()];
  var h = ('0' + now.getHours()).slice(-2);
  var mi = ('0' + now.getMinutes()).slice(-2);
  var s = ('0' + now.getSeconds()).slice(-2);
  var lunar = solar2lunar(y, m, d);
  var lunarStr = (lunar.isLeap ? '闰' : '') + lunarMonths[lunar.month - 1] + '月' + lunarDays[lunar.day - 1];
  var timeStr = h + ':' + mi + ':' + s;
  var dateStr = y + '年' + m + '月' + d + '日\n星期' + w;
  document.getElementById('clockTime').textContent = timeStr + '\n' + dateStr + '\n' + lunarStr;
}

function applyClockVisibility() {
  document.getElementById('datetime').style.display = document.getElementById('showClock').checked ? '' : 'none';
}

function setupClock() {
  var cb = document.getElementById('showClock');
  chrome.storage.local.get('settings', function(result) {
    var s = result.settings || {};
    if (s.showClock !== undefined) cb.checked = s.showClock;
    applyClockVisibility();
  });
  cb.addEventListener('change', function() {
    applyClockVisibility();
    chrome.storage.local.get('settings', function(result) {
      var s = result.settings || {};
      s.showClock = cb.checked;
      chrome.storage.local.set({ 'settings': s });
    });
  });
  updateClock();
  setInterval(updateClock, 1000);
}

// ---- popup group selection ----
function renderPopupGroups() {
  var container = document.getElementById('popupGroupList');
  if (!container) return;
  container.innerHTML = '';
  chrome.storage.local.get('settings', function(result) {
    var s = result.settings || {};
    var selected = s.popupGroups || [0];
    _favGroups.forEach(function(g, i) {
      var label = document.createElement('label');
      label.className = 'toggle-label';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = selected.indexOf(i) !== -1;
      cb.addEventListener('change', function() {
        if (cb.checked) {
          if (selected.indexOf(i) === -1) selected.push(i);
        } else {
          selected = selected.filter(function(v) { return v !== i; });
        }
        s.popupGroups = selected;
        chrome.storage.local.set({ 'settings': s });
      });
      label.appendChild(cb);
      label.appendChild(document.createTextNode(g.name || '默认'));
      container.appendChild(label);
    });
  });
}

// ---- export / import ----
function exportFav() {
  var lines = [];
  _favGroups.forEach(function(g, i) {
    if (i > 0) lines.push('# ' + g.name);
    g.items.forEach(function(item) {
      var t = item.title.replace(/\[/g, '\\[').replace(/\]/g, '\\]');
      lines.push('[' + t + '](' + item.url + ')');
    });
    if (i > 0 && i < _favGroups.length - 1) lines.push('');
  });
  var blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'favorites.md';
  document.body.appendChild(a);
  a.click();
  setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 100);
}

function importFav(content) {
  var lines = content.split('\n');
  var importedGroups = [];
  var groupItems = [];
  var currentGroup = '';

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    if (line.indexOf('# ') === 0) {
      importedGroups.push({ name: currentGroup, items: groupItems });
      groupItems = [];
      currentGroup = line.slice(2).trim();
      continue;
    }
    var m = line.match(/^\[([\s\S]*?)\]\(([\s\S]*?)\)$/);
    if (m) {
      var title = m[1].replace(/\\\[/g, '[').replace(/\\\]/g, ']');
      groupItems.push({ title: title, url: m[2] });
    }
  }
  importedGroups.push({ name: currentGroup, items: groupItems });

  var seen = {};
  var newGroups = [];

  importedGroups.forEach(function(ig) {
    var key = ig.name || '\0';
    if (seen[key]) return;
    seen[key] = true;

    var merged;
    if (ig.name) {
      var existing = _favGroups.find(function(g) { return g.name === ig.name; });
      merged = existing ? existing.items.slice() : [];
    } else {
      merged = _favGroups[0].items.slice();
    }
    ig.items.forEach(function(item) {
      if (!merged.find(function(mi) { return mi.url === item.url; })) merged.push(item);
    });
    newGroups.push({ name: ig.name, items: merged });
  });

  _favGroups.forEach(function(g, i) {
    if (i === 0 && seen['\0']) return;
    if (!g.name || seen[g.name]) return;
    seen[g.name] = true;
    newGroups.push({ name: g.name, items: g.items.slice() });
  });

  _favGroups = newGroups;
  if (_activeGroupIndex >= _favGroups.length) _activeGroupIndex = 0;
  saveFavGroups();
  renderGroups();
  renderPopupGroups();
}

// ---- init ----
function init() {
  document.getElementById('Div_seting').addEventListener('click', function() {
    togglePanel('Div_seting_hid', 'Div_seting');
  });

  document.getElementById('Div_history_icon').addEventListener('click', function() {
    togglePanel('Div_history_hid', 'Div_history_icon');
    if (document.getElementById('Div_history_hid').style.display === 'block') loadHistory('');
  });

  document.getElementById('btnok').addEventListener('click', addLink);
  document.getElementById('btncancel').addEventListener('click', closeInputWindow);
  document.getElementById('btndelete').addEventListener('click', function() {
    if (_editKey) deleteBookmark(_editKey);
    closeInputWindow();
  });

  document.getElementById('ctxAddFav').addEventListener('click', function() {
    if (_ctxSource) {
      var el = _ctxSource.el;
      var title = el.getAttribute('data-title') || el.textContent || '';
      var url = el.getAttribute('data-url') || el.href || '';
      if (url) openInputWindow(title, url);
    }
    hideContextMenu();
  });

  document.getElementById('ctxEdit').addEventListener('click', function() {
    if (_ctxSource) {
      var el = _ctxSource.el;
      openInputWindow(el.getAttribute('data-title'), el.getAttribute('data-url'), el.getAttribute('data-title'));
    }
    hideContextMenu();
  });

  document.getElementById('ctxDelete').addEventListener('click', function() {
    if (_ctxSource) {
      deleteBookmark(_ctxSource.el.getAttribute('data-title'));
    }
    hideContextMenu();
  });

  document.querySelector('.group-title').addEventListener('click', function() {
    switchGroup(0);
  });

  document.getElementById('groupAddBtn').addEventListener('click', function() {
    startInlineCreate();
  });

  document.getElementById('groupRename').addEventListener('click', function() {
    if (_groupTabContext >= 0) {
      var index = _groupTabContext;
      hideGroupMenu();
      setTimeout(function() { startInlineRename(index); }, 0);
    } else {
      hideGroupMenu();
    }
  });

  document.getElementById('groupDelete').addEventListener('click', function() {
    if (_groupTabContext >= 0 && _favGroups.length > 1) deleteGroup(_groupTabContext);
    hideGroupMenu();
  });

  document.addEventListener('click', function(e) {
    if (!e.target.closest('#contextMenu')) hideContextMenu();
    if (!e.target.closest('#groupMenu')) hideGroupMenu();
  });

  document.getElementById('left-drop-zone').addEventListener('wheel', function(e) {
    if (_favGroups.length <= 1) return;
    if (e.target.closest('#fov-list') && Math.abs(e.deltaY) > Math.abs(e.deltaX)) return;
    e.preventDefault();
    var dir = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? (e.deltaX > 0 ? 1 : -1) : (e.deltaY > 0 ? 1 : -1);
    var newIndex = _activeGroupIndex + dir;
    if (newIndex < 0) newIndex = _favGroups.length - 1;
    if (newIndex >= _favGroups.length) newIndex = 0;
    switchGroup(newIndex);
  });

  document.getElementById('historySearch').addEventListener('input', function() {
    loadHistory(this.value);
  });

  document.getElementById('exportBtn').addEventListener('click', exportFav);
  document.getElementById('importBtn').addEventListener('click', function() {
    document.getElementById('importFile').click();
  });
  document.getElementById('importFile').addEventListener('change', function() {
    var file = this.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
      importFav(e.target.result);
      var groupLen = _favGroups.length;
      showToast('导入完成，共 ' + groupLen + ' 个分组');
      renderList(_favGroups[_activeGroupIndex].items, 'fov-list');
    };
    reader.readAsText(file);
    this.value = '';
  });

  setupToggles();
  setupBlurToggle();
  setupLightMode();
  setupWallpaper();
  setupClock();
  setupDragDrop();

  window.addEventListener('beforeunload', function() {
    if (_wallpaperObjectUrl) URL.revokeObjectURL(_wallpaperObjectUrl);
  });
}

window.onload = function() {
  chrome.topSites.get().then(function(mostVisitedURLs) {
    renderList(mostVisitedURLs, 'most-visited-list');
  });
  loadFavGroups();
  init();
};
