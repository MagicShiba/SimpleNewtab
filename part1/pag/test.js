function faviconURL(u) {
  var url = new URL(chrome.runtime.getURL('/_favicon/'));
  url.searchParams.set('pageUrl', u);
  url.searchParams.set('size', '32');
  return url.toString();
}

function renderPopup() {
  chrome.storage.local.get(['FavGroups', 'settings'], function(result) {
    var groups = result.FavGroups || [{ name: '', items: [] }];
    var settings = result.settings || {};
    document.documentElement.classList.toggle('light', !!settings.lightMode);

    var popupIndices = settings.popupGroups;
    var visibleGroups = [];
    if (popupIndices && popupIndices.length > 0) {
      popupIndices.forEach(function(idx) {
        if (groups[idx]) visibleGroups.push(groups[idx]);
      });
    } else {
      visibleGroups = [groups[0]];
    }

    var container = document.getElementById('groupsContainer');
    container.innerHTML = '';

    visibleGroups.forEach(function(group) {
      var col = document.createElement('div');
      col.className = 'group';
      var title = document.createElement('h2');
      title.textContent = group.name || '默认';
      col.appendChild(title);

      var items = group.items || [];
      if (items.length === 0) {
        var empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = '暂无收藏';
        col.appendChild(empty);
      } else {
        items.forEach(function(item) {
          var a = document.createElement('a');
          a.className = 'group-item';
          a.href = item.url;
          a.target = '_blank';
          var img = document.createElement('img');
          img.src = item.icon || faviconURL(item.url);
          img.alt = '';
          var span = document.createElement('span');
          span.textContent = item.title;
          a.appendChild(img);
          a.appendChild(span);
          col.appendChild(a);
        });
      }
      container.appendChild(col);
    });
  });
}

renderPopup();
