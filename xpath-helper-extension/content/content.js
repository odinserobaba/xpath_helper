// content/content.js
(function xpathHelperContentMain() {
    const g = typeof globalThis !== 'undefined' ? globalThis : window;
    if (g.__XPATH_HELPER_CONTENT_INITIALIZED__) {
        console.log('[Content] Skip duplicate injection');
        return;
    }
    g.__XPATH_HELPER_CONTENT_INITIALIZED__ = true;

    console.log('[Content] Script started');

    if (typeof document === 'undefined' || !chrome?.runtime?.id) {
        console.error('[Content] ABORT');
        return;
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
    const GeneratorCls = g.__XPATH_HELPER_XPATH_GENERATOR__;
    if (!GeneratorCls) {
        console.error('[Content] XPathGenerator not loaded!');
        return;
    }

    const generator = new GeneratorCls();
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
        const dragHint = ' Перетащите виджет; двойной клик — компактный вид.';
        if (active) {
            indicator.title = 'Режим инспекции включён. Клик — открыть панель. Alt+X — выключить.' + dragHint;
        } else {
            indicator.title = 'XPath Helper. Зажмите Ctrl или нажмите Alt+X. Клик — открыть панель.' + dragHint;
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
    const INDICATOR_LAYOUT_KEY = 'xpath-helper-indicator-layout';
    let suppressIndicatorClick = false;
    function readIndicatorLayout(raw) {
        const o = raw && typeof raw === 'object' ? raw : {};
        const bottom = Math.min(400, Math.max(8, Number(o.bottom) || 96));
        const right = Math.min(800, Math.max(8, Number(o.right) || 20));
        return { bottom, right, compact: !!o.compact };
    }
    function applyIndicatorLayout(layout) {
        const L = readIndicatorLayout(layout);
        indicator.style.left = '';
        indicator.style.right = `${L.right}px`;
        indicator.style.bottom = `${L.bottom}px`;
        indicator.style.padding = L.compact ? '6px 10px' : '10px 20px';
        indicator.style.fontSize = L.compact ? '12px' : '13px';
        indicator.innerHTML = L.compact ? '✦' : '✦ XPath Helper';
        indicator.dataset.compact = L.compact ? '1' : '';
    }
    function persistIndicatorLayout(partial) {
        chrome.storage.local.get([INDICATOR_LAYOUT_KEY], (d) => {
            const cur = readIndicatorLayout(d[INDICATOR_LAYOUT_KEY]);
            const next = { ...cur, ...partial };
            chrome.storage.local.set({ [INDICATOR_LAYOUT_KEY]: next });
        });
    }
    try {
        chrome.storage.local.get([INDICATOR_LAYOUT_KEY], (d) => {
            applyIndicatorLayout(d[INDICATOR_LAYOUT_KEY]);
        });
        chrome.storage.onChanged.addListener((changes, area) => {
            if (!isContextValid()) return;
            if (area === 'local' && changes[INDICATOR_LAYOUT_KEY]) applyIndicatorLayout(changes[INDICATOR_LAYOUT_KEY].newValue);
        });
    } catch (e) {
        if (!isContextInvalidatedError(e)) throw e;
    }
    indicator.addEventListener('dblclick', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        chrome.storage.local.get([INDICATOR_LAYOUT_KEY], (d) => {
            const cur = readIndicatorLayout(d[INDICATOR_LAYOUT_KEY]);
            persistIndicatorLayout({ compact: !cur.compact });
        });
    });
    let dragIx = null;
    indicator.addEventListener('mousedown', (ev) => {
        if (ev.button !== 0) return;
        ev.preventDefault();
        const rect = indicator.getBoundingClientRect();
        dragIx = { sx: ev.clientX, sy: ev.clientY, startRight: window.innerWidth - rect.right, startBottom: window.innerHeight - rect.bottom, moved: false };
        const onMove = (e2) => {
            if (!dragIx) return;
            const dx = e2.clientX - dragIx.sx;
            const dy = e2.clientY - dragIx.sy;
            if (Math.abs(dx) + Math.abs(dy) > 4) dragIx.moved = true;
            const right = Math.min(window.innerWidth - 8, Math.max(8, dragIx.startRight - dx));
            const bottom = Math.min(window.innerHeight - 8, Math.max(8, dragIx.startBottom - dy));
            indicator.style.right = `${right}px`;
            indicator.style.bottom = `${bottom}px`;
        };
        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            if (dragIx?.moved) {
                suppressIndicatorClick = true;
                setTimeout(() => { suppressIndicatorClick = false; }, 320);
                const r = parseFloat(indicator.style.right) || 20;
                const b = parseFloat(indicator.style.bottom) || 96;
                persistIndicatorLayout({ right: r, bottom: b });
            }
            dragIx = null;
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    });
    indicator.addEventListener('click', (ev) => {
        if (suppressIndicatorClick) return;
        sendToPanel({ action: 'openPanel' });
    });
    document.documentElement.appendChild(indicator);
    updateIndicatorActive();

    // Отключаем bfcache — страница не будет кэшироваться при навигации,
    // канал связи с расширением останется активным
    window.addEventListener('beforeunload', () => {});
    window.addEventListener('unload', () => {});

    try {
        chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
            if (!isContextValid()) return;
            if (request.action === 'xpathHelperPing') {
                sendResponse({ ok: true, href: typeof location?.href === 'string' ? location.href : '' });
                return false;
            }
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
        let execHighlightEl = null;
        function clearExecutionStepHighlight() {
            if (!execHighlightEl) return;
            try {
                if (execHighlightEl.isConnected) {
                    execHighlightEl.style.outline = execHighlightEl.dataset.xphExecO ?? '';
                    execHighlightEl.style.boxShadow = execHighlightEl.dataset.xphExecS ?? '';
                }
                delete execHighlightEl.dataset.xphExecO;
                delete execHighlightEl.dataset.xphExecS;
            } catch (_) {}
            execHighlightEl = null;
        }
        /** Подсветка целевого элемента во время выполнения шага (до следующего шага или снятия). */
        function highlightExecutionStepTarget(el) {
            if (!el || el.nodeType !== 1) return;
            clearExecutionStepHighlight();
            execHighlightEl = el;
            try {
                execHighlightEl.dataset.xphExecO = execHighlightEl.style.outline || '';
                execHighlightEl.dataset.xphExecS = execHighlightEl.style.boxShadow || '';
                execHighlightEl.style.outline = '4px solid #00c9a7';
                execHighlightEl.style.boxShadow =
                    '0 0 0 3px rgba(0, 201, 167, 0.35), 0 4px 22px rgba(0, 102, 204, 0.22)';
                execHighlightEl.scrollIntoView({ behavior: 'auto', block: 'center' });
            } catch (_) {}
        }
        // Настройки ожидания приходят из панели (см. executeList/executeStep)
        /** После клика на активном SPA «затихание» resource может не наступать минутами — не блокируем ответ панели. */
        const POST_ACTION_NETWORK_IDLE_MAX_MS = 15000;
        const POST_ACTION_DOM_STABLE_MAX_MS = 10000;

        async function waitForNetworkIdle(quietMs = waitNetworkQuietMs, timeoutMs = waitNetworkTimeoutMs, stepIdForPulse = null) {
            let lastCount = -1;
            let stableSince = Date.now();
            const deadline = Date.now() + timeoutMs;
            const waitStart = Date.now();
            let lastPulse = waitStart;
            while (Date.now() < deadline) {
                if (!isContextValid() || token !== runToken) return;
                if (stepIdForPulse && Date.now() - lastPulse >= 12000) {
                    lastPulse = Date.now();
                    sendExecutionProgress({
                        phase: 'waiting',
                        stepId: stepIdForPulse,
                        detail: 'ожидание затихания сети (performance.resource)',
                        elapsedMs: Date.now() - waitStart,
                    });
                }
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
        async function waitForDomStable(quietMs = waitDomQuietMs, timeoutMs = waitDomTimeoutMs, stepIdForPulse = null) {
            const waitStart = Date.now();
            let lastPulse = waitStart;
            return new Promise((resolve) => {
                let timer = null;
                let pulseIv = null;
                if (stepIdForPulse) {
                    pulseIv = setInterval(() => {
                        if (Date.now() - waitStart >= timeoutMs) return;
                        sendExecutionProgress({
                            phase: 'waiting',
                            stepId: stepIdForPulse,
                            detail: 'ожидание стабильности DOM',
                            elapsedMs: Date.now() - waitStart,
                        });
                    }, 12000);
                }
                const observer = new MutationObserver(() => {
                    if (timer) clearTimeout(timer);
                    timer = setTimeout(() => {
                        observer.disconnect();
                        if (pulseIv) clearInterval(pulseIv);
                        resolve();
                    }, quietMs);
                });
                observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
                setTimeout(() => {
                    observer.disconnect();
                    if (timer) clearTimeout(timer);
                    if (pulseIv) clearInterval(pulseIv);
                    resolve();
                }, timeoutMs);
            });
        }
        async function waitForPageLoad(
            timeoutMs = 10000,
            {
                networkIdle = false,
                domStable = false,
                networkTimeoutMs: netTimeoutOverride,
                domTimeoutMs: domTimeoutOverride,
                stepIdForPulse = null,
            } = {}
        ) {
            const deadline = Date.now() + timeoutMs;
            while (document.readyState !== 'complete' && Date.now() < deadline) {
                await new Promise((r) => setTimeout(r, 50));
                if (!isContextValid() || token !== runToken) return;
            }
            await new Promise((r) => setTimeout(r, Math.max(0, waitReadyMs)));
            const netTo = netTimeoutOverride ?? waitNetworkTimeoutMs;
            const domTo = domTimeoutOverride ?? waitDomTimeoutMs;
            if (networkIdle) await waitForNetworkIdle(waitNetworkQuietMs, netTo, stepIdForPulse);
            if (domStable) await waitForDomStable(waitDomQuietMs, domTo, stepIdForPulse);
        }
        /** После клика/ввода ошибки ожидания не пробрасываем — иначе retry шага выполнит действие повторно. */
        async function safePostMutationWaits(currentStep) {
            const sid = currentStep?.id || null;
            try {
                await new Promise((r) => setTimeout(r, Math.max(0, waitPostActionMs)));
                if (currentStep.params?.waitForLoad !== false) {
                    const netCap = Math.min(waitNetworkTimeoutMs, POST_ACTION_NETWORK_IDLE_MAX_MS);
                    const domCap = Math.min(waitDomTimeoutMs, POST_ACTION_DOM_STABLE_MAX_MS);
                    await waitForPageLoad(10000, {
                        networkIdle: true,
                        domStable: true,
                        networkTimeoutMs: netCap,
                        domTimeoutMs: domCap,
                        stepIdForPulse: sid,
                    });
                }
            } catch (postErr) {
                console.warn('[XPath Helper] Ожидание после действия (игнор для предотвращения повтора):', postErr?.message || postErr);
            }
        }
        async function findElementByXPath(xpath, timeoutMs, stepIdForPulse = null) {
            const maxWait = Math.max(0, timeoutMs || 0);
            const deadline = Date.now() + maxWait;
            const waitStart = Date.now();
            let lastPulse = waitStart;
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
                if (stepIdForPulse && maxWait >= 5000 && Date.now() - lastPulse >= 12000) {
                    lastPulse = Date.now();
                    sendExecutionProgress({
                        phase: 'waiting',
                        stepId: stepIdForPulse,
                        detail: 'поиск элемента по XPath',
                        elapsedMs: Date.now() - waitStart,
                    });
                }
                await new Promise((r) => setTimeout(r, 200));
                if (!isContextValid() || token !== runToken) return null;
            }
        }

        function escapeXPathLiteralSegment(str) {
            return String(str).replace(/'/g, "''");
        }

        /** Если основной XPath вида //tag[contains(normalize-space(), '…')] — добавляем варианты с contains(.) и короткими фрагментами (Mat: текст в span, склейка без пробела). */
        function deriveAutoRelaxedXpaths(primaryXpath) {
            const raw = String(primaryXpath || '').trim();
            const bracket = raw.indexOf('[contains(');
            if (bracket < 0 || !/normalize-space\s*\(\s*\)/.test(raw)) return [];
            const prefix = raw.slice(0, bracket);
            const tagOk = /^\/\/[\w:*.-]+$/.test(prefix);
            if (!tagOk) return [];
            const litMatch = raw.match(/normalize-space\s*\(\s*\)\s*,\s*'((?:[^']|'')*)'/);
            if (!litMatch) return [];
            let inner = litMatch[1].replace(/''/g, "'");
            const q = escapeXPathLiteralSegment;
            const uniq = [];
            const add = (xp) => {
                if (xp && xp !== raw && !uniq.includes(xp)) uniq.push(xp);
            };
            add(`${prefix}[contains(., '${q(inner)}')]`);
            const glued = inner.split(/(?<=[а-яёa-z])(?=[А-ЯЁA-Z])/);
            for (const seg of glued) {
                const t = seg.trim();
                if (t.length >= 4) add(`${prefix}[contains(., '${q(t)}')]`);
            }
            const words = inner.split(/\s+/).map((w) => w.trim()).filter((w) => w.length >= 3);
            for (const w of words.slice(0, 8)) {
                add(`${prefix}[contains(normalize-space(.), '${q(w)}')]`);
                add(`${prefix}[contains(., '${q(w)}')]`);
            }
            for (let n = Math.min(inner.length, 28); n >= 7; n -= 5) {
                const pref = inner.slice(0, n).trim();
                if (pref.length >= 6) add(`${prefix}[contains(., '${q(pref)}')]`);
            }
            return uniq;
        }

        /** Варианты для //tag[contains(concat(' ', normalize-space(@class), ' '), ' token ')] — часто ломается лишним пробелом; добавляем contains(@class, 'token'). */
        function deriveClassConcatRelaxedXpaths(primaryXpath) {
            const raw = String(primaryXpath || '').trim();
            if (!raw.includes('normalize-space(@class)') || !raw.includes('concat(')) return [];
            const pref = raw.match(/^(\/\/[\w:*.-]+)\[/);
            if (!pref) return [];
            const prefix = pref[1];
            const litMatch = raw.match(/\)\s*,\s*'((?:[^']|'')*)'\s*\)\s*\]\s*$/);
            if (!litMatch) return [];
            const blob = litMatch[1].replace(/''/g, "'").trim();
            const q = escapeXPathLiteralSegment;
            const uniq = [];
            const add = (xp) => {
                if (xp && xp !== raw && !uniq.includes(xp)) uniq.push(xp);
            };
            const tokens = blob.split(/\s+/).filter((t) => t.length >= 2);
            for (const t of tokens) add(`${prefix}[contains(@class, '${q(t)}')]`);
            if (tokens.length === 0 && blob.length >= 2) add(`${prefix}[contains(@class, '${q(blob)}')]`);
            return uniq;
        }

        function selectorCandidateEntries(step) {
            const primary = (step?.xpath || '').trim();
            const fx = Array.isArray(step?.params?.fallbackXPaths) ? step.params.fallbackXPaths.map((x) => String(x).trim()).filter(Boolean) : [];
            const autoRelax = step?.params?.autoRelaxedXPathContains !== false;
            const relaxed = autoRelax ? deriveAutoRelaxedXpaths(primary) : [];
            const relaxedClass = autoRelax ? deriveClassConcatRelaxedXpaths(primary) : [];
            const seen = new Set();
            const out = [];
            const add = (xpath, mode) => {
                if (!xpath || seen.has(xpath)) return;
                seen.add(xpath);
                out.push({ xpath, mode });
            };
            add(primary, 'full');
            for (const x of fx) add(x, 'full');
            for (const x of relaxed) add(x, 'auto');
            for (const x of relaxedClass) add(x, 'auto');
            return out;
        }

        /** Полный лимит — только основной XPath и fallbackXPaths; авто-варианты получают короткое окно (иначе после перезагрузки сумма даёт минуты ожидания). */
        function xpathSearchBudgetMs(mode, fullMs) {
            const cap = Math.max(0, fullMs);
            if (mode === 'full') return cap;
            return Math.min(1600, Math.max(450, Math.floor(cap / 3)));
        }

        async function findElementViaSelectors(step, fullTimeoutMs, stepIdForPulse) {
            for (const { xpath, mode } of selectorCandidateEntries(step)) {
                const ms = xpathSearchBudgetMs(mode, fullTimeoutMs);
                const el = await findElementByXPath(xpath, ms, stepIdForPulse);
                if (el) return el;
            }
            return null;
        }

        execSteps: for (let i = 0; i < steps.length; i++) {
            if (!isContextValid() || token !== runToken) break;
            if (i > 0 && stepDelayMs > 0) await new Promise((r) => setTimeout(r, stepDelayMs));
            const step = steps[i];
            const id = step?.id || null;
            const stepT0 = Date.now();
            const retryCount = step?.params?.retryCount ?? (step?.params?.retryOnError ? 3 : 1);
            const retryDelayMs = step?.params?.retryDelayMs ?? 300;
            clearExecutionStepHighlight();
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

                if (step.action === 'start') {
                    results.push({ id, ok: true, durationMs: Date.now() - stepT0 });
                    sendExecutionProgress({ phase: 'end', stepId: id, ok: true });
                    lastErr = null;
                    break;
                }

                if (step.action === 'end') {
                    results.push({ id, ok: true, durationMs: Date.now() - stepT0 });
                    sendExecutionProgress({ phase: 'end', stepId: id, ok: true });
                    lastErr = null;
                    break execSteps;
                }

                if (step.action === 'wait_for_element') {
                    const timeout = step.params?.timeoutMs ?? baseTimeout;
                    const found = await findElementViaSelectors(step, timeout, id);
                    if (!found) throw new Error('Элемент не появился за отведённое время (основной лимит ' + timeout + 'мс): ' + (step.xpath || '').substring(0, 80));
                    highlightExecutionStepTarget(found);
                    results.push({ id, ok: true, durationMs: Date.now() - stepT0 });
                    sendExecutionProgress({ phase: 'end', stepId: id, ok: true });
                    lastErr = null;
                    break;
                }

                if (step.action === 'click_if_exists') {
                    const elOpt = await findElementByXPath(step.xpath, 0);
                    if (elOpt) {
                        highlightExecutionStepTarget(elOpt);
                        elOpt.click();
                        await safePostMutationWaits(step);
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
                        if (elOpt) highlightExecutionStepTarget(elOpt);
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
                            const elOpt = await findElementByXPath(step.xpath, stepTimeout, id);
                            if (elOpt) highlightExecutionStepTarget(elOpt);
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
                let el = await findElementViaSelectors(step, stepTimeout, id);
                if (!el) throw new Error('Элемент не найден (основной таймаут ' + stepTimeout + 'мс на XPath; авто-варианты короче): ' + (step.xpath || '').substring(0, 80));
                highlightExecutionStepTarget(el);

                if (step.action === 'click') {
                    el.click();
                    await safePostMutationWaits(step);
                    results.push({ id, ok: true, durationMs: Date.now() - stepT0 });
                    sendExecutionProgress({ phase: 'end', stepId: id, ok: true });
                    lastErr = null;
                    break;
                }

                if (step.action === 'file_upload') {
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
                    highlightExecutionStepTarget(fileInput);
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
                    await safePostMutationWaits(step);
                    results.push({ id, ok: true, durationMs: Date.now() - stepT0 });
                    sendExecutionProgress({ phase: 'end', stepId: id, ok: true });
                    lastErr = null;
                    break;
                }

                if (step.action === 'input' || step.action === 'set_date') {
                    highlightExecutionStepTarget(el);
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
                    await safePostMutationWaits(step);
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
        clearExecutionStepHighlight();
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

})();
