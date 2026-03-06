// background.js - Service Worker с диагностикой
console.log('[Background] Service Worker loaded');

chrome.action.onClicked.addListener(async (tab) => {
    console.log('[Background] Action clicked, opening side panel for tab:', tab.id);
    try {
        await chrome.sidePanel.open({ tabId: tab.id });
        console.log('[Background] Side panel opened');
    } catch (err) {
        console.error('[Background] Error opening side panel:', err);
    }
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[Background] Message received:', request.action, 'from:', sender.id);
    if (request.action === 'ping') {
        sendResponse({ status: 'alive', timestamp: Date.now() });
    }
    return true;
});

console.log('[Background] Service Worker ready');
