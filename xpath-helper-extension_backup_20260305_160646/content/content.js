// content/content.js - С максимальной диагностикой
console.log('[Content] ════════════════════════════════════════');
console.log('[Content] Script started');
console.log('[Content] document:', typeof document);
console.log('[Content] chrome:', typeof chrome);
console.log('[Content] chrome.runtime:', chrome?.runtime);
console.log('[Content] chrome.runtime.id:', chrome?.runtime?.id);
console.log('[Content] ════════════════════════════════════════');

if (typeof document === 'undefined') {
    console.error('[Content] ABORT: document is undefined');
    throw new Error('No document');
}

if (!chrome?.runtime?.id) {
    console.error('[Content] ABORT: chrome.runtime.id is missing');
    throw new Error('No extension context');
}

function initWhenReady() {
    console.log('[Content] initWhenReady called, readyState:', document.readyState);
    
    if (document.readyState === 'loading') {
        console.log('[Content] Waiting for DOMContentLoaded...');
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        console.log('[Content] DOM already ready, initializing now');
        init();
    }
}

function init() {
    console.log('[Content] init() called');
    
    try {
        if (typeof XPathGenerator === 'undefined') {
            console.error('[Content] XPathGenerator is not defined!');
            return;
        }
        console.log('[Content] XPathGenerator:', typeof XPathGenerator);
        
        createIndicator();
        setupListeners();
        
        console.log('[Content] ✓ Initialization complete');
        console.log('[Content] ════════════════════════════════════════');
    } catch (err) {
        console.error('[Content] ✗ Init error:', err);
    }
}

function createIndicator() {
    console.log('[Content] Creating indicator...');
    
    // Проверяем не создан ли уже
    if (document.getElementById('xpath-test-indicator')) {
        console.log('[Content] Indicator already exists, skipping');
        return;
    }
    
    const indicator = document.createElement('div');
    indicator.id = 'xpath-test-indicator';
    indicator.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 10px 20px;
        background: linear-gradient(135deg, #00d4aa, #0099ff);
        color: white;
        border-radius: 8px;
        font-family: sans-serif;
        font-size: 14px;
        font-weight: bold;
        z-index: 2147483647;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        transition: transform 0.2s;
    `;
    indicator.innerHTML = '✦ XPath Helper';
    indicator.title = 'Нажмите чтобы открыть панель • Зажмите Ctrl для выделения';
    
    indicator.addEventListener('click', () => {
        console.log('[Content] Indicator clicked');
        chrome.runtime.sendMessage({ action: 'openPanel' });
        indicator.style.transform = 'scale(0.95)';
        setTimeout(() => indicator.style.transform = 'scale(1)', 100);
    });
    
    indicator.addEventListener('mouseenter', () => {
        indicator.style.transform = 'scale(1.05)';
    });
    
    indicator.addEventListener('mouseleave', () => {
        indicator.style.transform = 'scale(1)';
    });
    
    document.documentElement.appendChild(indicator);
    console.log('[Content] ✓ Indicator created');
}

function setupListeners() {
    console.log('[Content] Setting up listeners...');
    
    let isCtrlPressed = false;
    let currentElement = null;
    let hoverTimeout = null;
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Control') {
            isCtrlPressed = true;
            console.log('[Content] Ctrl pressed');
        }
    });
    
    document.addEventListener('keyup', (e) => {
        if (e.key === 'Control') {
            isCtrlPressed = false;
            console.log('[Content] Ctrl released');
            if (currentElement) {
                currentElement.style.outline = '';
                currentElement = null;
            }
        }
    });
    
    window.addEventListener('blur', () => {
        isCtrlPressed = false;
        if (currentElement) {
            currentElement.style.outline = '';
            currentElement = null;
        }
    });
    
    document.addEventListener('mouseover', (e) => {
        if (!isCtrlPressed) return;
        if (!e.target) return;
        
        const el = e.target;
        if (el.id === 'xpath-test-indicator') return;
        
        clearTimeout(hoverTimeout);
        hoverTimeout = setTimeout(() => {
            console.log('[Content] Hovering element:', el.tagName, el.id || el.className?.split(' ')[0]);
            
            if (currentElement && currentElement !== el) {
                currentElement.style.outline = '';
            }
            currentElement = el;
            el.style.outline = '3px solid #00d4aa';
            
            const info = {
                tagName: el.tagName.toLowerCase(),
                id: el.id || null,
                classes: Array.from(el.classList),
                text: el.textContent?.trim().substring(0, 50) || '',
                attributes: Array.from(el.attributes).map(a => ({ name: a.name, value: a.value }))
            };
            
            console.log('[Content] Sending element info to side panel');
            chrome.runtime.sendMessage({ 
                action: 'elementHovered',
                element: info 
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.warn('[Content] Message error:', chrome.runtime.lastError.message);
                } else {
                    console.log('[Content] ✓ Message sent successfully');
                }
            });
        }, 100);
    }, true);
    
    console.log('[Content] ✓ Listeners setup complete');
}

// Запускаем
initWhenReady();
console.log('[Content] Script loaded successfully');
