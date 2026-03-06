console.log('[Background] Service Worker loaded');
chrome.action.onClicked.addListener(async (tab) => {
    await chrome.sidePanel.open({ tabId: tab.id });
});
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.commands.onCommand.addListener((command) => {
    if (command === 'toggle-inspect') {
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
            if (tab?.id) chrome.tabs.sendMessage(tab.id, { action: 'toggleInspectMode' }).catch(() => {});
        });
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'ping') {
        sendResponse({ status: 'alive', timestamp: Date.now() });
        return true;
    }
    if (request.action === 'openPanel') {
        const tabId = sender.tab?.id;
        if (tabId) {
            chrome.sidePanel.open({ tabId }).then(() => sendResponse({ ok: true })).catch((e) => sendResponse({ ok: false, error: e?.message }));
        } else {
            sendResponse({ ok: false, error: 'No tab' });
        }
        return true;
    }
    return true;
});
