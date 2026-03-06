// sidepanel/sidepanel.js - С диагностикой
console.log('[SidePanel] Script loaded');

const logEl = document.getElementById('log');
const statusEl = document.getElementById('statusText');
const elementInfoEl = document.getElementById('elementInfo');
const elementCodeEl = document.getElementById('elementCode');

function log(msg, type = 'info') {
    console.log('[SidePanel]', msg);
    const div = document.createElement('div');
    div.className = type;
    div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
}

statusEl.textContent = 'Инициализация...';

// Слушаем сообщения от content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    log(`Message received: ${request.action}`, 'debug');
    
    if (request.action === 'elementHovered' && request.element) {
        const el = request.element;
        log(`Element: <${el.tagName}> #${el.id || 'no-id'}`, 'info');
        log(`Classes: ${el.classes?.join(' ') || 'none'}`, 'debug');
        log(`Attributes: ${el.attributes?.length || 0}`, 'debug');
        log(`Text: ${el.text?.substring(0, 30) || 'empty'}`, 'debug');
        
        statusEl.textContent = `Element: ${el.tagName}`;
        
        // Показываем информацию об элементе
        const code = `<${el.tagName}${el.id ? ` id="${el.id}"` : ''}${el.classes?.length ? ` class="${el.classes.join(' ')}"` : ''}>`;
        elementCodeEl.textContent = code;
        elementInfoEl.style.display = 'block';
    }
    
    sendResponse({ received: true });
    return true;
});

// Проверяем соединение с background
chrome.runtime.sendMessage({ action: 'ping' }, (response) => {
    if (chrome.runtime.lastError) {
        log(`Background not responding: ${chrome.runtime.lastError.message}`, 'error');
        statusEl.textContent = 'Error: ' + chrome.runtime.lastError.message;
    } else {
        log('Connected to background ✓', 'info');
        statusEl.textContent = 'Connected ✓';
    }
});

log('Side panel initialized', 'info');
