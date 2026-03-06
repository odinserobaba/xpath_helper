// utils/messenger.js
class Messenger {
    constructor() { this.listeners = new Map(); }
    send(action, data = {}, target = 'runtime') {
        const message = { action, data, timestamp: Date.now() };
        if (target === 'runtime') return chrome.runtime.sendMessage(message);
        else if (target === 'tab') return chrome.tabs.sendMessage(data.tabId, message);
    }
    on(action, callback) {
        if (!this.listeners.has(action)) this.listeners.set(action, []);
        this.listeners.get(action).push(callback);
    }
    listen() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            const callbacks = this.listeners.get(request.action) || [];
            callbacks.forEach(cb => cb(request.data, sender, sendResponse));
            return callbacks.length > 0;
        });
    }
}
if (typeof module !== 'undefined' && module.exports) module.exports = Messenger;
