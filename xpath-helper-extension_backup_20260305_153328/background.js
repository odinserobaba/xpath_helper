// background.js
chrome.action.onClicked.addListener(async (tab) => {
    await chrome.sidePanel.open({ tabId: tab.id });
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'generate-xpath',
        title: 'Сгенерировать XPath',
        contexts: ['all'],
        documentUrlPatterns: ['<all_urls>']
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'generate-xpath') {
        chrome.sidePanel.open({ tabId: tab.id });
    }
});

console.log('[XPath Helper] Background loaded');
