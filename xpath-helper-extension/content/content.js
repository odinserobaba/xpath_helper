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
    // Поднимаем индикатор выше, чтобы не перекрывал системные/чат-виджеты
    indicator.style.cssText = 'position:fixed;bottom:96px;right:20px;padding:10px 20px;background:linear-gradient(135deg,#00d4aa,#0099ff);color:white;border-radius:8px;font-family:sans-serif;font-weight:bold;z-index:2147483647;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.3);transition:background .2s, box-shadow .2s;';
    indicator.innerHTML = '✦ XPath Helper';
    indicator.addEventListener('click', () => sendToPanel({ action: 'openPanel' }));
    document.documentElement.appendChild(indicator);
    updateIndicatorActive();

    // Отключаем bfcache — страница не будет кэшироваться при навигации,
    // канал связи с расширением останется активным
    window.addEventListener('beforeunload', () => {});
    window.addEventListener('unload', () => {});

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
                const requestId = request.requestId;
                const token = ++runToken;
                const steps = Array.isArray(request.steps) ? request.steps : [];
                const continueOnError = request.continueOnError !== false;
                const stepDelayMs = request.stepDelayMs ?? 100;
                const waitOpts = {
                    waitReadyMs: Math.max(0, request.waitReadyMs ?? 80),
                    waitNetworkQuietMs: Math.max(0, request.waitNetworkQuietMs ?? 150),
                    waitNetworkTimeoutMs: Math.max(0, request.waitNetworkTimeoutMs ?? 2500),
                    waitDomQuietMs: Math.max(0, request.waitDomQuietMs ?? 100),
                    waitDomTimeoutMs: Math.max(0, request.waitDomTimeoutMs ?? 1500),
                    waitPostActionMs: Math.max(0, request.waitPostActionMs ?? 50),
                };
                runExecutionList(steps, token, { continueOnError, stepDelayMs, ...waitOpts })
                    .then((results) => {
                        try { chrome.runtime.sendMessage({ action: 'executionResult', requestId, result: { ok: true, results } }); } catch (_) {}
                    })
                    .catch((e) => {
                        try { chrome.runtime.sendMessage({ action: 'executionResult', requestId, result: { ok: false, error: e?.message || 'Unknown error' } }); } catch (_) {}
                    });
                return false;
            }
            if (request.action === 'executeStep') {
                const requestId = request.requestId;
                const step = request.step;
                const token = ++runToken;
                const selectorTimeoutMs = Math.max(0, request.selectorTimeoutMs ?? SELECTOR_TIMEOUT_DEFAULT);
                const waitOpts = {
                    waitReadyMs: Math.max(0, request.waitReadyMs ?? 80),
                    waitNetworkQuietMs: Math.max(0, request.waitNetworkQuietMs ?? 150),
                    waitNetworkTimeoutMs: Math.max(0, request.waitNetworkTimeoutMs ?? 2500),
                    waitDomQuietMs: Math.max(0, request.waitDomQuietMs ?? 100),
                    waitDomTimeoutMs: Math.max(0, request.waitDomTimeoutMs ?? 1500),
                    waitPostActionMs: Math.max(0, request.waitPostActionMs ?? 50),
                };
                runExecutionList([step], token, { continueOnError: false, stepDelayMs: 0, selectorTimeoutMs, ...waitOpts })
                    .then((results) => {
                        const r = results[0];
                        const res = r ? { ok: r.soft ? true : r.ok, error: r.error, conditionResult: r.conditionResult } : { ok: false, error: 'No result' };
                        try { chrome.runtime.sendMessage({ action: 'executionResult', requestId, result: res }); } catch (_) {}
                    })
                    .catch((e) => {
                        try { chrome.runtime.sendMessage({ action: 'executionResult', requestId, result: { ok: false, error: e?.message || 'Unknown error' } }); } catch (_) {}
                    });
                return false;
            }
            if (request.action === 'stopExecution') {
                runToken++;
                sendResponse({ ok: true });
                return false;
            }
            if (request.action === 'validateXpath') {
                try {
                    const r = document.evaluate(request.xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
                    sendResponse({ ok: true, count: r.snapshotLength });
                } catch (e) {
                    sendResponse({ ok: false, error: e?.message });
                }
                return false;
            }
            if (request.action === 'highlightXpath') {
                try {
                    const r = document.evaluate(request.xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                    const el = r.singleNodeValue;
                    if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        const orig = el.style.outline;
                        el.style.outline = '4px solid #e74c3c';
                        el.style.boxShadow = '0 0 20px rgba(231,76,60,0.6)';
                        setTimeout(() => { el.style.outline = orig; el.style.boxShadow = ''; }, 5000);
                    }
                    sendResponse({ ok: true, found: !!el });
                } catch (e) {
                    sendResponse({ ok: false, error: e?.message });
                }
                return false;
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
            generator.generateAll(el).then(async (result) => {
                // Если наведён <label for="id"> — подставляем связанный input/textarea для ввода/даты
                if (result && el.tagName === 'LABEL' && el.htmlFor) {
                    const control = document.getElementById(el.htmlFor);
                    if (control && (control.tagName === 'INPUT' || control.tagName === 'TEXTAREA')) {
                        try {
                            const controlResult = await generator.generateAll(control);
                            const primary = controlResult?.primary?.xpath;
                            if (primary) {
                                result = { ...result, linkedControl: { xpath: primary, tagName: control.tagName.toLowerCase(), type: (control.type || '').toLowerCase() } };
                            }
                        } catch (_) {}
                    }
                }
                sendToPanel({ action: 'elementHovered', element: info, xpathResult: result });
            });
        }, getDebounceMs());
    }, true);

    /** Выполняет список шагов на странице по очереди и возвращает результаты по каждому шагу */
    async function runExecutionList(
        steps,
        token,
        {
            continueOnError,
            stepDelayMs = 100,
            selectorTimeoutMs: defaultTimeout,
            waitReadyMs = 80,
            waitNetworkQuietMs = 150,
            waitNetworkTimeoutMs = 2500,
            waitDomQuietMs = 100,
            waitDomTimeoutMs = 1500,
            waitPostActionMs = 50,
        } = { continueOnError: true }
    ) {
        const baseTimeout = defaultTimeout ?? selectorTimeoutMs;
        const results = [];
        // Настройки ожидания приходят из панели (см. executeList/executeStep)
        async function waitForNetworkIdle(quietMs = waitNetworkQuietMs, timeoutMs = waitNetworkTimeoutMs) {
            let lastCount = -1;
            let stableSince = Date.now();
            const deadline = Date.now() + timeoutMs;
            while (Date.now() < deadline) {
                if (!isContextValid() || token !== runToken) return;
                try {
                    const entries = performance.getEntriesByType?.('resource') || [];
                    const count = entries.length;
                    if (count === lastCount) {
                        if (Date.now() - stableSince >= quietMs) return;
                    } else {
                        lastCount = count;
                        stableSince = Date.now();
                    }
                } catch (_) {}
                await new Promise((r) => setTimeout(r, 50));
            }
        }
        async function waitForDomStable(quietMs = waitDomQuietMs, timeoutMs = waitDomTimeoutMs) {
            return new Promise((resolve) => {
                let timer = null;
                const observer = new MutationObserver(() => {
                    if (timer) clearTimeout(timer);
                    timer = setTimeout(() => {
                        observer.disconnect();
                        resolve();
                    }, quietMs);
                });
                observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
                setTimeout(() => { observer.disconnect(); if (timer) clearTimeout(timer); resolve(); }, timeoutMs);
            });
        }
        async function waitForPageLoad(timeoutMs = 10000, { networkIdle = false, domStable = false } = {}) {
            const deadline = Date.now() + timeoutMs;
            while (document.readyState !== 'complete' && Date.now() < deadline) {
                await new Promise((r) => setTimeout(r, 50));
                if (!isContextValid() || token !== runToken) return;
            }
            await new Promise((r) => setTimeout(r, Math.max(0, waitReadyMs)));
            if (networkIdle) await waitForNetworkIdle(waitNetworkQuietMs, waitNetworkTimeoutMs);
            if (domStable) await waitForDomStable(waitDomQuietMs, waitDomTimeoutMs);
        }
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

        function selectorCandidates(step) {
            const primary = (step?.xpath || '').trim();
            const fx = Array.isArray(step?.params?.fallbackXPaths) ? step.params.fallbackXPaths.map((x) => String(x).trim()).filter(Boolean) : [];
            const out = [];
            if (primary) out.push(primary);
            for (const x of fx) if (x && !out.includes(x)) out.push(x);
            return out;
        }

        for (let i = 0; i < steps.length; i++) {
            if (!isContextValid() || token !== runToken) break;
            if (i > 0 && stepDelayMs > 0) await new Promise((r) => setTimeout(r, stepDelayMs));
            const step = steps[i];
            const id = step?.id || null;
            const stepT0 = Date.now();
            const retryCount = step?.params?.retryCount ?? (step?.params?.retryOnError ? 3 : 1);
            const retryDelayMs = step?.params?.retryDelayMs ?? 300;
            sendExecutionProgress({ phase: 'start', stepId: id, index: i, total: steps.length });
            let lastErr = null;
            for (let attempt = 0; attempt < retryCount; attempt++) {
                try {
                    if (step.action === 'wait') {
                    const delayMs = step.params?.delayMs ?? 500;
                    await new Promise((r) => setTimeout(r, Math.max(0, delayMs)));
                    results.push({ id, ok: true, durationMs: Date.now() - stepT0 });
                    sendExecutionProgress({ phase: 'end', stepId: id, ok: true });
                    lastErr = null;
                    break;
                }

                if (step.action === 'wait_for_element') {
                    const timeout = step.params?.timeoutMs ?? baseTimeout;
                    let found = null;
                    for (const cand of selectorCandidates(step)) {
                        found = await findElementByXPath(cand, timeout);
                        if (found) break;
                    }
                    if (!found) throw new Error('Элемент не появился за ' + timeout + 'мс: ' + (step.xpath || '').substring(0, 80));
                    results.push({ id, ok: true, durationMs: Date.now() - stepT0 });
                    sendExecutionProgress({ phase: 'end', stepId: id, ok: true });
                    lastErr = null;
                    break;
                }

                if (step.action === 'click_if_exists') {
                    const elOpt = await findElementByXPath(step.xpath, 0);
                    if (elOpt) {
                        elOpt.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        elOpt.click();
                        await new Promise((r) => setTimeout(r, Math.max(0, waitPostActionMs)));
                        if (step.params?.waitForLoad !== false) await waitForPageLoad(10000, { networkIdle: true, domStable: true });
                    }
                    results.push({ id, ok: true, durationMs: Date.now() - stepT0 });
                    sendExecutionProgress({ phase: 'end', stepId: id, ok: true });
                    lastErr = null;
                    break;
                }

                if (step.action === 'branch') {
                    const cond = step.params?.condition || 'element_exists';
                    const expected = (step.params?.expectedValue || '').trim();
                    const attrName = (step.params?.attributeName || '').trim();
                    let conditionResult = false;
                    if (cond === 'url_equals') conditionResult = window.location.href === expected;
                    else if (cond === 'url_contains') conditionResult = window.location.href.includes(expected);
                    else if (cond === 'url_matches') { try { conditionResult = new RegExp(expected).test(window.location.href); } catch (_) {} }
                    else if (cond === 'count_equals') {
                        try {
                            const r = document.evaluate(step.xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
                            conditionResult = r.snapshotLength === parseInt(expected, 10);
                        } catch (_) {}
                    } else {
                        const elOpt = await findElementByXPath(step.xpath, 0);
                        if (cond === 'element_exists') conditionResult = !!elOpt;
                        else if (cond === 'attribute_equals' && elOpt) conditionResult = (elOpt.getAttribute(attrName) || '') === expected;
                        else if (elOpt) {
                            const text = (elOpt.textContent || '').trim();
                            if (cond === 'text_equals') conditionResult = text === expected;
                            else if (cond === 'text_contains') conditionResult = text.includes(expected);
                        }
                    }
                    results.push({ id, ok: true, conditionResult, durationMs: Date.now() - stepT0 });
                    sendExecutionProgress({ phase: 'end', stepId: id, ok: true, conditionResult });
                    lastErr = null;
                    break;
                }

                if (step.action === 'assert') {
                    const cond = step.params?.condition || 'element_exists';
                    const expected = (step.params?.expectedValue || '').trim();
                    const attrName = (step.params?.attributeName || '').trim();
                    const stepTimeout = step.params?.timeoutMs ?? baseTimeout;
                    const waitMode = step.params?.waitMode === true;
                    const softAssert = step.params?.softAssert === true;
                    let ok = false;
                    let msg = '';
                    const check = () => {
                        if (cond === 'url_equals') return window.location.href === expected;
                        if (cond === 'url_contains') return window.location.href.includes(expected);
                        if (cond === 'url_matches') { try { return new RegExp(expected).test(window.location.href); } catch (_) { return false; } }
                        if (cond === 'count_equals') {
                            try {
                                const r = document.evaluate(step.xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
                                return r.snapshotLength === parseInt(expected, 10);
                            } catch (_) { return false; }
                        }
                        const elOpt = (() => { try { const r = document.evaluate(step.xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null); return r.singleNodeValue; } catch (_) { return null; } })();
                        if (cond === 'element_exists') return !!elOpt;
                        if (cond === 'attribute_equals' && elOpt) return (elOpt.getAttribute(attrName) || '') === expected;
                        if (elOpt) {
                            const text = (elOpt.textContent || '').trim();
                            if (cond === 'text_equals') return text === expected;
                            if (cond === 'text_contains') return text.includes(expected);
                        }
                        return false;
                    };
                    if (waitMode) {
                        const deadline = Date.now() + stepTimeout;
                        while (Date.now() < deadline) {
                            if (check()) { ok = true; break; }
                            await new Promise((r) => setTimeout(r, 200));
                            if (!isContextValid() || token !== runToken) break;
                        }
                    } else {
                        if (['url_equals', 'url_contains', 'url_matches'].includes(cond)) ok = check();
                        else if (cond === 'count_equals') ok = check();
                        else {
                            const elOpt = await findElementByXPath(step.xpath, stepTimeout);
                            if (cond === 'element_exists') ok = !!elOpt;
                            else if (cond === 'attribute_equals') ok = elOpt && (elOpt.getAttribute(attrName) || '') === expected;
                            else if (elOpt) {
                                const text = (elOpt.textContent || '').trim();
                                if (cond === 'text_equals') ok = text === expected;
                                else if (cond === 'text_contains') ok = text.includes(expected);
                            }
                        }
                    }
                    if (!ok) {
                        msg = cond === 'element_exists' ? 'Элемент не найден' : cond.startsWith('url_') ? `URL: ${window.location.href}` : `Условие не выполнено: ${cond}`;
                        if (!softAssert) {
                            results.push({ id, ok: false, error: msg, durationMs: Date.now() - stepT0 });
                            sendExecutionProgress({ phase: 'end', stepId: id, ok: false, error: msg });
                        } else {
                            results.push({ id, ok: false, error: msg, durationMs: Date.now() - stepT0, soft: true });
                            sendExecutionProgress({ phase: 'end', stepId: id, ok: true });
                        }
                    } else {
                        results.push({ id, ok: true, durationMs: Date.now() - stepT0 });
                        sendExecutionProgress({ phase: 'end', stepId: id, ok: true });
                    }
                    lastErr = null;
                    break;
                }

                const stepTimeout = step.params?.timeoutMs ?? baseTimeout;
                let el = null;
                let usedXpath = '';
                for (const cand of selectorCandidates(step)) {
                    el = await findElementByXPath(cand, stepTimeout);
                    if (el) { usedXpath = cand; break; }
                }
                if (!el) throw new Error('Элемент не найден (таймаут ' + stepTimeout + 'мс): ' + (step.xpath || '').substring(0, 80));

                if (step.action === 'click') {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.click();
                    await new Promise((r) => setTimeout(r, Math.max(0, waitPostActionMs)));
                    if (step.params?.waitForLoad !== false) await waitForPageLoad(10000, { networkIdle: true, domStable: true });
                    results.push({ id, ok: true, durationMs: Date.now() - stepT0 });
                    sendExecutionProgress({ phase: 'end', stepId: id, ok: true });
                    lastErr = null;
                    break;
                }

                if (step.action === 'file_upload') {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    let fileInput = el;
                    const isFileInput = (el.tagName || '').toLowerCase() === 'input' && (el.type || '').toLowerCase() === 'file';
                    if (!isFileInput) {
                        const findFileInput = (root) => {
                            const inp = root.querySelector?.('input[type="file"]');
                            if (inp) return inp;
                            let p = root.parentElement;
                            while (p) {
                                const i = p.querySelector?.('input[type="file"]');
                                if (i) return i;
                                p = p.parentElement;
                            }
                            return null;
                        };
                        fileInput = findFileInput(el) || document.querySelector('input[type="file"]');
                        if (!fileInput) throw new Error('Рядом с кнопкой не найден input[type="file"]. Укажите XPath на сам input.');
                    }
                    const fileName = step.params?.fileName || 'file';
                    const base64 = step.params?.fileContentBase64;
                    const mime = /\.pdf$/i.test(fileName) ? 'application/pdf' : 'application/octet-stream';
                    let file;
                    if (base64 && typeof base64 === 'string') {
                        try {
                            const bin = atob(base64);
                            const bytes = new Uint8Array(bin.length);
                            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                            file = new File([bytes], fileName, { type: mime });
                        } catch (_) {
                            file = new File([], fileName, { type: mime });
                        }
                    } else {
                        file = new File([], fileName, { type: mime });
                    }
                    const dt = new DataTransfer();
                    dt.items.add(file);
                    fileInput.files = dt.files;
                    fileInput.dispatchEvent(new Event('input', { bubbles: true }));
                    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                    await new Promise((r) => setTimeout(r, Math.max(0, waitPostActionMs)));
                    if (step.params?.waitForLoad !== false) await waitForPageLoad(10000, { networkIdle: true, domStable: true });
                    results.push({ id, ok: true, durationMs: Date.now() - stepT0 });
                    sendExecutionProgress({ phase: 'end', stepId: id, ok: true });
                    lastErr = null;
                    break;
                }

                if (step.action === 'input' || step.action === 'set_date') {
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
                    await new Promise((r) => setTimeout(r, Math.max(0, waitPostActionMs)));
                    if (step.params?.waitForLoad !== false) await waitForPageLoad(10000, { networkIdle: true, domStable: true });
                    results.push({ id, ok: true, durationMs: Date.now() - stepT0 });
                    sendExecutionProgress({ phase: 'end', stepId: id, ok: true });
                    lastErr = null;
                    break;
                }

                const err = 'Неизвестное действие: ' + String(step.action);
                results.push({ id, ok: false, error: err, durationMs: Date.now() - stepT0 });
                sendExecutionProgress({ phase: 'end', stepId: id, ok: false, error: err });
                if (!continueOnError) break;
                lastErr = null;
                break;
            } catch (e) {
                if (isContextInvalidatedError(e)) break;
                lastErr = e;
                if (attempt < retryCount - 1) await new Promise((r) => setTimeout(r, retryDelayMs));
            }
            }
            if (lastErr) {
                const err = lastErr?.message || String(lastErr);
                results.push({ id, ok: false, error: err, durationMs: Date.now() - stepT0 });
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
