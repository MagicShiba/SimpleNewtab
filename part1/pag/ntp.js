var _editKey = null;
var _ctxSource = null;
var _wallpaperData = null;
var _wallpaperObjectUrl = null;
var _currentRawUrl = '';
var _historyCache = [];

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

  var img = document.createElement('img');
  img.src = faviconURL(site.url);
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
    chrome.history.search({ text: '', maxResults: 500, startTime: 0 }, function(results) {
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
function saveBookmark(title, url, oldTitle) {
  chrome.storage.local.get('Fav', function(result) {
    var fav = result.Fav || {};
    if (oldTitle && oldTitle !== title) delete fav[oldTitle];
    fav[title] = url;
    chrome.storage.local.set({ 'Fav': fav }, function() {
      renderList(fav, 'fov-list');
    });
  });
}

function deleteBookmark(title) {
  chrome.storage.local.get('Fav', function(result) {
    var fav = result.Fav || {};
    delete fav[title];
    chrome.storage.local.set({ 'Fav': fav }, function() {
      renderList(fav, 'fov-list');
    });
  });
}

function openInputWindow(title, url, oldTitle) {
  _editKey = oldTitle || null;
  document.getElementById('u_title').value = title || '';
  document.getElementById('u_url').value = url || '';
  document.getElementById('inputWindow').style.display = 'block';
}

function closeInputWindow() {
  _editKey = null;
  document.getElementById('inputWindow').style.display = 'none';
}

function addLink() {
  var title = document.getElementById('u_title').value.trim();
  var url = document.getElementById('u_url').value.trim();
  if (!title || !url) return;
  saveBookmark(title, url, _editKey);
  closeInputWindow();
}

// ---- drag & drop ----
function setupDragDrop() {
  var zone = document.getElementById('left-drop-zone');
  var hint = document.getElementById('dropHint');
  var dragCounter = 0;

  zone.addEventListener('dragenter', function(e) {
    e.preventDefault();
    dragCounter++;
    if (dragCounter === 1) hint.classList.add('show');
  });

  zone.addEventListener('dragleave', function(e) {
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) hint.classList.remove('show');
  });

  zone.addEventListener('dragover', function(e) {
    e.preventDefault();
  });

  zone.addEventListener('drop', function(e) {
    e.preventDefault();
    dragCounter = 0;
    hint.classList.remove('show');

    var url = e.dataTransfer.getData('text/uri-list') || '';
    var html = e.dataTransfer.getData('text/html') || '';

    if (!url && html) {
      var temp = document.createElement('div');
      temp.innerHTML = html;
      var link = temp.querySelector('a');
      if (link) url = link.href;
    }

    if (!url) return;

    var title = '';
    if (html) {
      var temp = document.createElement('div');
      temp.innerHTML = html;
      var link = temp.querySelector('a');
      if (link) title = link.getAttribute('aria-label') || link.textContent || '';
    }

    chrome.history.search({ text: url, maxResults: 1 }, function(results) {
      if (results.length > 0 && !title) {
        title = results[0].title || results[0].url;
      }
      if (!title) title = url;
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

  document.addEventListener('click', function(e) {
    if (!e.target.closest('#contextMenu')) hideContextMenu();
  });

  document.getElementById('historySearch').addEventListener('input', function() {
    loadHistory(this.value);
  });

  setupToggles();
  setupBlurToggle();
  setupLightMode();
  setupWallpaper();
  setupDragDrop();

  window.addEventListener('beforeunload', function() {
    if (_wallpaperObjectUrl) URL.revokeObjectURL(_wallpaperObjectUrl);
  });
}

window.onload = function() {
  chrome.topSites.get().then(function(mostVisitedURLs) {
    renderList(mostVisitedURLs, 'most-visited-list');
  });
  chrome.storage.local.get('Fav', function(result) {
    renderList(result.Fav, 'fov-list');
  });
  init();
};
