// content/content.js
console.log('[Content] Script started');

if (typeof document === 'undefined' || !chrome?.runtime?.id) {
    console.error('[Content] ABORT');
    throw new Error('No context');
}

const STORAGE_KEY_DEBOUNCE = 'xpath-helper-debounce-ms';
const STORAGE_KEY_SELECTOR_TIMEOUT = 'xpath-helper-selector-timeout-ms';
const DEBOUNCE_DEFAULT = 120;
const DEBOUNCE_MIN = 80;
const DEBOUNCE_MAX = 200;
const SELECTOR_TIMEOUT_DEFAULT = 5000;
const SELECTOR_TIMEOUT_MIN = 0;
const SELECTOR_TIMEOUT_MAX = 60000;

function isContextValid() {
    return !!chrome?.runtime?.id;
}

function isContextInvalidatedError(e) {
    return String(e?.message || e || '').includes('Extension context invalidated');
}

function init() {
    console.log('[Content] Initializing...');
    if (typeof XPathGenerator === 'undefined') {
        console.error('[Content] XPathGenerator not loaded!');
        return;
    }

    const generator = new XPathGenerator();
    let isCtrlPressed = false;
    let isInspectMode = false;
    let currentElement = null;
    let hoverDebounceTimer = null;
    let hoverDebounceMs = DEBOUNCE_DEFAULT;
    let selectorTimeoutMs = SELECTOR_TIMEOUT_DEFAULT;
    let runToken = 0;

    function getDebounceMs() {
        return Math.max(DEBOUNCE_MIN, Math.min(DEBOUNCE_MAX, hoverDebounceMs));
    }

    try {
        chrome.storage.local.get([STORAGE_KEY_DEBOUNCE, STORAGE_KEY_SELECTOR_TIMEOUT], (data) => {
            const v = data?.[STORAGE_KEY_DEBOUNCE];
            if (typeof v === 'number' && v >= DEBOUNCE_MIN && v <= DEBOUNCE_MAX) hoverDebounceMs = v;
            const t = data?.[STORAGE_KEY_SELECTOR_TIMEOUT];
            if (typeof t === 'number' && t >= SELECTOR_TIMEOUT_MIN && t <= SELECTOR_TIMEOUT_MAX) selectorTimeoutMs = t;
        });
        chrome.storage.onChanged.addListener((changes, area) => {
            if (!isContextValid()) return;
            if (area === 'local' && changes?.[STORAGE_KEY_DEBOUNCE]) {
                const v = changes[STORAGE_KEY_DEBOUNCE].newValue;
                if (typeof v === 'number') hoverDebounceMs = v;
            }
            if (area === 'local' && changes?.[STORAGE_KEY_SELECTOR_TIMEOUT]) {
                const t = changes[STORAGE_KEY_SELECTOR_TIMEOUT].newValue;
                if (typeof t === 'number') selectorTimeoutMs = t;
            }
        });
    } catch (e) {
        if (!isContextInvalidatedError(e)) throw e;
        return;
    }

    function sendToPanel(payload) {
        try {
            if (!isContextValid()) return;
            const p = chrome.runtime.sendMessage(payload);
            if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch (e) {
            if (isContextInvalidatedError(e)) return;
            throw e;
        }
    }

    function sendExecutionProgress(msg) {
        sendToPanel({ action: 'executionProgress', ...msg });
    }

    function isHoverActive() {
        return isCtrlPressed || isInspectMode;
    }

    function updateIndicatorActive() {
        const active = isHoverActive();
        indicator.classList.toggle('xpath-indicator-active', active);
        indicator.setAttribute('aria-pressed', active ? 'true' : 'false');
        if (active) {
            indicator.title = 'Режим инспекции включён. Клик — открыть панель. Alt+X — выключить.';
        } else {
            indicator.title = 'XPath Helper. Зажмите Ctrl или нажмите Alt+X. Клик — открыть панель.';
        }
    }

    // Стили для активного индикатора
    const style = document.createElement('style');
    style.textContent = `
        #xpath-indicator.xpath-indicator-active {
            background: linear-gradient(135deg, #00b894, #0066cc) !important;
            box-shadow: 0 0 16px rgba(0, 212, 170, 0.6) !important;
        }
        #xpath-indicator.xpath-indicator-active::after {
            content: ' ●';
            font-size: 10px;
            opacity: 0.9;
        }
    `;
    document.documentElement.appendChild(style);

    // Индикатор
    const indicator = document.createElement('div');
    indicator.id = 'xpath-indicator';
    indicator.setAttribute('role', 'button');
    indicator.setAttribute('aria-label', 'Открыть панель XPath Helper');
    indicator.setAttribute('aria-pressed', 'false');
    indicator.style.cssText = 'position:fixed;bottom:20px;right:20px;padding:10px 20px;background:linear-gradient(135deg,#00d4aa,#0099ff);color:white;border-radius:8px;font-family:sans-serif;font-weight:bold;z-index:2147483647;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.3);transition:background .2s, box-shadow .2s;';
    indicator.innerHTML = '✦ XPath Helper';
    indicator.addEventListener('click', () => sendToPanel({ action: 'openPanel' }));
    document.documentElement.appendChild(indicator);
    updateIndicatorActive();

    try {
        chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
            if (!isContextValid()) return;
            if (request.action === 'toggleInspectMode') {
                isInspectMode = !isInspectMode;
                if (!isInspectMode && currentElement) {
                    currentElement.style.outline = '';
                    currentElement = null;
                }
                updateIndicatorActive();
                return;
            }
            if (request.action === 'executeList') {
                const token = ++runToken;
                const steps = Array.isArray(request.steps) ? request.steps : [];
                const continueOnError = request.continueOnError !== false;
                runExecutionList(steps, token, { continueOnError })
                    .then((results) => sendResponse({ ok: true, results }))
                    .catch((e) => sendResponse({ ok: false, error: e?.message || 'Unknown error' }));
                return true;
            }
        });
    } catch (e) {
        if (isContextInvalidatedError(e)) return;
        throw e;
    }

    window.addEventListener('pagehide', () => {
        runToken++;
        if (hoverDebounceTimer) {
            clearTimeout(hoverDebounceTimer);
            hoverDebounceTimer = null;
        }
    }, { once: true });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Control') {
            isCtrlPressed = true;
            updateIndicatorActive();
        }
    });
    document.addEventListener('keyup', (e) => {
        if (e.key === 'Control') {
            isCtrlPressed = false;
            if (currentElement && !isInspectMode) currentElement.style.outline = '';
            if (!isInspectMode) currentElement = null;
            updateIndicatorActive();
        }
    });

    document.addEventListener('mouseover', (e) => {
        if (!isHoverActive() || !e.target) return;
        const el = e.target;
        if (el.id === 'xpath-indicator') return;

        if (currentElement && currentElement !== el) currentElement.style.outline = '';
        currentElement = el;
        el.style.outline = '3px solid #00d4aa';

        if (hoverDebounceTimer) clearTimeout(hoverDebounceTimer);
        hoverDebounceTimer = setTimeout(() => {
            hoverDebounceTimer = null;
            const info = {
                tagName: el.tagName.toLowerCase(),
                id: el.id || null,
                classes: Array.from(el.classList),
                text: el.textContent?.trim().substring(0, 50) || '',
                attributes: Array.from(el.attributes).map(a => ({ name: a.name, value: a.value }))
            };
            generator.generateAll(el).then(result => {
                sendToPanel({ action: 'elementHovered', element: info, xpathResult: result });
            });
        }, getDebounceMs());
    }, true);

    /** Выполняет список шагов на странице по очереди и возвращает результаты по каждому шагу */
    async function runExecutionList(steps, token, { continueOnError } = { continueOnError: true }) {
        const results = [];
        async function findElementByXPath(xpath, timeoutMs) {
            const deadline = Date.now() + Math.max(0, timeoutMs || 0);
            while (true) {
                let el;
                try {
                    const r = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                    el = r.singleNodeValue;
                } catch (_) {
                    throw new Error('Неверный XPath: ' + (xpath || '').substring(0, 80));
                }
                if (el) return el;
                if (timeoutMs <= 0 || Date.now() >= deadline) return null;
                await new Promise((r) => setTimeout(r, 200));
                if (!isContextValid() || token !== runToken) return null;
            }
        }

        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            if (!isContextValid() || token !== runToken) break;
            const id = step?.id || null;
            sendExecutionProgress({ phase: 'start', stepId: id, index: i, total: steps.length });
            try {
                if (step.action === 'wait') {
                    const delayMs = step.params?.delayMs ?? 500;
                    await new Promise((r) => setTimeout(r, Math.max(0, delayMs)));
                    results.push({ id, ok: true });
                    sendExecutionProgress({ phase: 'end', stepId: id, ok: true });
                    continue;
                }

                const el = await findElementByXPath(step.xpath, selectorTimeoutMs);
                if (!el) throw new Error('Элемент не найден (таймаут ' + selectorTimeoutMs + 'мс): ' + (step.xpath || '').substring(0, 80));

                if (step.action === 'click') {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.click();
                    await new Promise((r) => setTimeout(r, 150));
                    results.push({ id, ok: true });
                    sendExecutionProgress({ phase: 'end', stepId: id, ok: true });
                    continue;
                }

                if (step.action === 'file_upload') {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.click();
                    await new Promise((r) => setTimeout(r, 200));
                    results.push({ id, ok: true });
                    sendExecutionProgress({ phase: 'end', stepId: id, ok: true });
                    continue;
                }

                if (step.action === 'input') {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    const value = step.params?.value ?? '';
                    const tag = (el.tagName || '').toLowerCase();
                    if (tag === 'input' || tag === 'textarea') {
                        el.focus();
                        el.value = value;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    } else if (el.isContentEditable) {
                        el.focus();
                        document.execCommand('selectAll', false, null);
                        document.execCommand('insertText', false, value);
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                    } else {
                        el.value = value;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    await new Promise((r) => setTimeout(r, 100));
                    results.push({ id, ok: true });
                    sendExecutionProgress({ phase: 'end', stepId: id, ok: true });
                    continue;
                }

                const err = 'Неизвестное действие: ' + String(step.action);
                results.push({ id, ok: false, error: err });
                sendExecutionProgress({ phase: 'end', stepId: id, ok: false, error: err });
                if (!continueOnError) break;
            } catch (e) {
                if (isContextInvalidatedError(e)) break;
                const err = e?.message || String(e);
                results.push({ id, ok: false, error: err });
                sendExecutionProgress({ phase: 'end', stepId: id, ok: false, error: err });
                if (!continueOnError) break;
            }
        }
        sendExecutionProgress({ phase: 'done' });
        return results;
    }

    console.log('[Content] ✓ Ready');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
    init();
}
