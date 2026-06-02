const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

const MOBILE_RULE = {
  id: 1,
  priority: 1,
  action: {
    type: 'modifyHeaders',
    requestHeaders: [{ header: 'User-Agent', operation: 'set', value: MOBILE_UA }]
  },
  condition: { resourceTypes: ['sub_frame'], urlFilter: '*' }
};

async function setUAMode(isMobile) {
  if (isMobile) {
    await chrome.declarativeNetRequest.updateSessionRules({ addRules: [MOBILE_RULE] });
  } else {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [1] });
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
});
