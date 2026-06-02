var msg = document.getElementById('msg');
var frame = document.getElementById('frame');
var modeToggle = document.getElementById('modeToggle');
var textToggle = document.getElementById('textToggle');
var bookmarkBar = document.getElementById('bookmarkBar');

var groupColors = [
  'rgba(80,80,80,0.4)', 'rgba(100,70,70,0.4)', 'rgba(70,100,70,0.4)',
  'rgba(70,70,100,0.4)', 'rgba(100,100,70,0.4)', 'rgba(100,70,100,0.4)', 'rgba(70,100,100,0.4)'
];

function faviconURL(u) {
  var url = new URL(chrome.runtime.getURL('/_favicon/'));
  url.searchParams.set('pageUrl', u);
  url.searchParams.set('size', '32');
  return url.toString();
}

function loadUrl(url) {
  if (!url) return;
  chrome.storage.local.remove('sidePanelUrl');
  msg.style.display = 'none';
  frame.style.display = 'block';
  frame.src = url;
}

function applyUAMode(isMobile) {
  if (isMobile) {
    modeToggle.textContent = '📱';
    modeToggle.classList.add('on');
    frame.classList.add('mobile');
  } else {
    modeToggle.textContent = '🖥️';
    modeToggle.classList.remove('on');
    frame.classList.remove('mobile');
  }
}

function renderBookmarks() {
  chrome.storage.local.get(['FavGroups', 'settings'], function(result) {
    var groups = result.FavGroups || [{ name: '', items: [] }];
    var settings = result.settings || {};
    var popupIndices = settings.popupGroups;
    var showText = settings.sidebarShowText === true;

    textToggle.classList.toggle('on', showText);

    var visibleGroups = [];
    if (popupIndices && popupIndices.length > 0) {
      popupIndices.forEach(function(idx) {
        if (groups[idx]) visibleGroups.push(groups[idx]);
      });
    } else {
      visibleGroups = [groups[0]];
    }

    bookmarkBar.innerHTML = '';

    visibleGroups.forEach(function(group, gi) {
      (group.items || []).forEach(function(item) {
        var el = document.createElement('div');
        el.className = 'bookmark-item';
        el.style.backgroundColor = groupColors[gi % groupColors.length];

        var img = document.createElement('img');
        img.src = item.icon || faviconURL(item.url);
        img.alt = '';
        el.appendChild(img);

        if (showText) {
          var span = document.createElement('span');
          span.className = 'bookmark-text';
          span.textContent = item.title;
          el.appendChild(span);
        }

        el.addEventListener('click', function() { loadUrl(item.url); });
        bookmarkBar.appendChild(el);
      });
    });
  });
}

modeToggle.addEventListener('click', function() {
  var isMobile = modeToggle.classList.contains('on');
  applyUAMode(!isMobile);
  chrome.runtime.sendMessage({ action: 'setUAMode', isMobile: !isMobile });
});

textToggle.addEventListener('click', function() {
  chrome.storage.local.get('settings', function(result) {
    var s = result.settings || {};
    s.sidebarShowText = !s.sidebarShowText;
    chrome.storage.local.set({ 'settings': s }, function() {
      renderBookmarks();
    });
  });
});

chrome.storage.local.get(['sidePanelUrl', 'uaMobile', 'FavGroups', 'settings'], function(result) {
  var isMobile = result.uaMobile !== false;
  applyUAMode(isMobile);
  renderBookmarks();
  loadUrl(result.sidePanelUrl);
});

chrome.storage.onChanged.addListener(function(changes, area) {
  if (area !== 'local') return;
  if (changes.sidePanelUrl) loadUrl(changes.sidePanelUrl.newValue);
  if (changes.uaMobile) applyUAMode(changes.uaMobile.newValue);
  if (changes.FavGroups || changes.settings) renderBookmarks();
});
