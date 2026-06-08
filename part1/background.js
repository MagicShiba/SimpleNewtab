const DEFAULT_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';

function buildUARule(ua) {
  return {
    id: 1,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [{ header: 'User-Agent', operation: 'set', value: ua }]
    },
    condition: { resourceTypes: ['sub_frame'], urlFilter: '*' }
  };
}

async function setUAMode(isMobile) {
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [1] });
  if (isMobile) {
    var result = await chrome.storage.local.get('customUA');
    var ua = result.customUA || DEFAULT_UA;
    await chrome.declarativeNetRequest.updateSessionRules({ addRules: [buildUARule(ua)] });
  }
  await chrome.storage.local.set({ uaMobile: isMobile });
}

chrome.runtime.onInstalled.addListener(async function() {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(function() {});
  var result = await chrome.storage.local.get('uaMobile');
  if (result.uaMobile !== false) {
    await setUAMode(true);
  }
});

chrome.runtime.onStartup.addListener(async function() {
  var result = await chrome.storage.local.get('uaMobile');
  if (result.uaMobile !== false) {
    await setUAMode(true);
  }
});

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'setUAMode') {
    setUAMode(request.isMobile).then(function() { sendResponse({ success: true }); });
    return true;
  }
  if (request.action === 'setSidebarUA') {
    chrome.storage.local.get('uaMobile', async function(result) {
      await chrome.storage.local.set({ customUA: request.ua || '' });
      if (result.uaMobile !== false) {
        await setUAMode(true);
      }
      sendResponse({ success: true });
    });
    return true;
  }
});
