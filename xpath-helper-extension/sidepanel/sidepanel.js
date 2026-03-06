// sidepanel/sidepanel.js
console.log('[SidePanel] Loaded');

const STORAGE_KEY_DEBOUNCE = 'xpath-helper-debounce-ms';
const STORAGE_KEY_EXECUTION_LIST = 'xpath-helper-execution-list';
const STORAGE_KEY_SELECTOR_TIMEOUT = 'xpath-helper-selector-timeout-ms';
const STORAGE_KEY_STEP_DELAY = 'xpath-helper-step-delay-ms';
const STORAGE_KEY_ONLY_UNIQUE = 'xpath-helper-only-unique';
const STORAGE_KEY_SCENARIOS = 'xpath-helper-scenarios';
const STORAGE_KEY_HISTORY = 'xpath-helper-element-history';
const DEBOUNCE_DEFAULT = 120;
const SELECTOR_TIMEOUT_DEFAULT = 5000;
const STEP_DELAY_DEFAULT = 100;
const MAX_HISTORY = 8;
const MAX_STEPS_WARNING = 100;
const MAX_FILE_SIZE_B64 = 1024 * 1024 * 4 / 3;

const ACTION_LABELS = { click: 'Клик', input: 'Ввод', file_upload: 'Файл', wait: 'Пауза' };

// Минимальный валидный PDF (~400 байт) для тестирования загрузки файлов
const MINIMAL_PDF_BASE64 = 'JVBERi0xLjQKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMiAwIFIKPj4KZW5kb2JqCjIgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9LaWRzIFszIDAgUl0KL0NvdW50IDEKPj4KZW5kb2JqCjMgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1BhcmVudCAyIDAgUgovTWVkaWFCb3ggWzAgMCA2MTIgNzkyXQo+PgplbmRvYmoKdHJhaWxlcgo8PAovU2l6ZSA0Ci9Sb290IDEgMCBSCj4+CnN0YXJ0eHJlZgoyNTEKJSVFT0YK';

const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const elementInfoEl = $('elementInfo');
const elementTagEl = $('elementTag');
const angularBadgeEl = $('angularBadge');
const elementCodeEl = $('elementCode');
const statsEl = $('stats');
const primarySectionEl = $('primarySection');
const primaryXpathEl = $('primaryXpath');
const primaryUniqueEl = $('primaryUnique');
const primaryScoreEl = $('primaryScore');
const copyPrimaryBtn = $('copyPrimary');
const copyForConsoleBtn = $('copyForConsole');
const addPrimaryToListBtn = $('addPrimaryToList');
const uniqueSectionEl = $('uniqueSection');
const uniqueListEl = $('uniqueList');
const uniqueCountEl = $('uniqueCount');
const nonUniqueSectionEl = $('nonUniqueSection');
const nonUniqueListEl = $('nonUniqueList');
const nonUniqueCountEl = $('nonUniqueCount');
const emptyStateEl = $('emptyState');
const refreshBtn = $('refreshBtn');
const debounceSlider = $('debounceSlider');
const debounceValueEl = $('debounceValue');
const selectorTimeoutMsEl = $('selectorTimeoutMs');
const filterSectionEl = $('filterSection');
const filterChecksEl = $('filterChecks');
const exportSectionEl = $('exportSection');
const copyAllUniqueBtn = $('copyAllUnique');
const exportFileBtn = $('exportFile');
const tabInspect = $('tabInspect');
const tabList = $('tabList');
const addStepBtn = $('addStepBtn');
const addStepManualBtn = $('addStepManualBtn');
const executeListBtn = $('executeListBtn');
const saveListBtn = $('saveListBtn');
const listHint = $('listHint');
const executionListEl = $('executionList');
const stepModal = $('stepModal');
const stepXpath = $('stepXpath');
const stepAction = $('stepAction');
const stepParamsInput = $('stepParamsInput');
const stepInputValue = $('stepInputValue');
const stepParamsWait = $('stepParamsWait');
const stepWaitMs = $('stepWaitMs');
const stepParamsFile = $('stepParamsFile');
const stepFileName = $('stepFileName');
const stepChooseFileBtn = $('stepChooseFileBtn');
const stepUseMinimalPdfBtn = $('stepUseMinimalPdfBtn');
const stepFileLabel = $('stepFileLabel');
const stepFileInput = $('stepFileInput');
const stepModalCancel = $('stepModalCancel');
const stepModalSave = $('stepModalSave');
const exportJsonBtn = $('exportJsonBtn');
const exportTemplatesBtn = $('exportTemplatesBtn');
const importJsonBtn = $('importJsonBtn');
const importJsonInput = $('importJsonInput');
const scenarioName = $('scenarioName');
const scenarioSelect = $('scenarioSelect');
const listSearch = $('listSearch');
const stopExecuteBtn = $('stopExecuteBtn');
const executionLogSection = $('executionLogSection');
const executionLog = $('executionLog');
const copyLogBtn = $('copyLogBtn');
const historySection = $('historySection');
const historyList = $('historyList');
const historyCount = $('historyCount');
const copyAllXpathBtn = $('copyAllXpath');
const onlyUniqueMode = $('onlyUniqueMode');
const stepDelayMsEl = $('stepDelayMs');
const stepRetryOnError = $('stepRetryOnError');
const importModal = $('importModal');
const importPreview = $('importPreview');
const importReplace = $('importReplace');
const importAppend = $('importAppend');
const importCancel = $('importCancel');
const contextInvalidatedBanner = $('contextInvalidatedBanner');
const reloadTabBtn = $('reloadTabBtn');

/** Группы типов для фильтра: ключ — префикс type, значение — подпись */
const TYPE_GROUPS = [
    { key: 'id', label: 'ID' },
    { key: 'attr', label: 'Атрибуты' },
    { key: 'partial:attr', label: 'Частичный атрибут' },
    { key: 'class', label: 'Классы' },
    { key: 'partial:class', label: 'Частичный класс' },
    { key: 'text', label: 'Текст' },
    { key: 'combo', label: 'Комбо' },
    { key: 'mat', label: 'Angular Material' },
    { key: 'context', label: 'Контекст' }
];

function typeMatchesFilter(type, filterKey) {
    if (filterKey === 'class') return type === 'class' || type.startsWith('class:');
    return type === filterKey || type.startsWith(filterKey + ':');
}

let currentResult = null;
/** Set ключей фильтра, которые показываем (пустой = показывать все) */
let filterSelected = new Set();
/** Ключи, доступные для текущего результата (для логики чекбоксов) */
let availableFilterKeys = new Set();

/** Список шагов на выполнение: { id, xpath, action, params: { value?, delayMs? } } */
let executionList = [];
/** id шага при редактировании (null = добавление) */
let editingStepId = null;
/** Статусы последнего выполнения по шагам: id -> { state: 'running'|'ok'|'error', message?: string } */
let stepRunStatus = {};
/** Текущий выполняемый шаг (для подсветки) */
let currentExecutingStepId = null;
/** Флаг остановки выполнения */
let stopExecutionRequested = false;
/** История элементов { tag, xpath, primary } */
let elementHistory = [];
/** Только уникальные в инспекторе */
let onlyUniqueModeVal = false;
/** Пауза между шагами (мс) */
let stepDelayMsVal = STEP_DELAY_DEFAULT;
/** Сценарии { id, name, steps } */
let scenarios = [];
let currentScenarioId = null;
/** Ожидающий импорт (для модалки) */
let pendingImportData = null;

function setStepStatus(id, state, message) {
    stepRunStatus[id] = { state, message: message || '' };
}

function show(el) { el.classList.remove('hidden'); el.style.display = ''; }
function hide(el) { el.classList.add('hidden'); el.style.display = 'none'; }

function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}

/** Собирает уникальные ключи фильтра по типам из result.all */
function getFilterKeysFromResult(result) {
    const keys = new Set();
    if (!result?.all) return keys;
    result.all.forEach((c) => {
        const t = c.type || '';
        for (const { key } of TYPE_GROUPS) {
            if (typeMatchesFilter(t, key)) keys.add(key);
        }
    });
    return keys;
}

/** Проверяет, проходит ли кандидат по текущему фильтру */
function passesFilter(candidate) {
    if (filterSelected.size === 0) return true;
    const t = candidate.type || '';
    for (const key of filterSelected) {
        if (typeMatchesFilter(t, key)) return true;
    }
    return false;
}

/** Применяет фильтр к result, возвращает { all, uniqueOnly, nonUniqueOnly, primary, summary } */
function applyFilter(result) {
    if (!result?.all) return result;
    const filtered = result.all.filter(passesFilter);
    const unique = filtered.filter((c) => c.isUnique);
    const nonUnique = filtered.filter((c) => !c.isUnique);
    return {
        primary: unique[0] || filtered[0] || null,
        uniqueOnly: unique,
        nonUniqueOnly: nonUnique,
        all: filtered,
        summary: {
            total: filtered.length,
            unique: unique.length,
            nonUnique: nonUnique.length,
            partialBased: filtered.filter((c) => c.usesPartial).length,
            angularSelectors: filtered.filter((c) => c.isAngular).length
        }
    };
}

function buildFilterCheckboxes(availableKeys) {
    availableFilterKeys = new Set(availableKeys);
    filterChecksEl.innerHTML = '';
    TYPE_GROUPS.forEach(({ key, label }) => {
        if (!availableKeys.has(key)) return;
        const checked = filterSelected.size === 0 || filterSelected.has(key);
        const id = `filter-${key}`;
        const labelEl = document.createElement('label');
        labelEl.className = 'filter-check';
        labelEl.innerHTML = `
            <input type="checkbox" id="${id}" data-key="${escapeHtml(key)}" ${checked ? 'checked' : ''}>
            <span>${escapeHtml(label)}</span>
        `;
        labelEl.querySelector('input').addEventListener('change', () => {
            const box = labelEl.querySelector('input');
            if (box.checked) {
                filterSelected.add(key);
                if (filterSelected.size === availableFilterKeys.size) filterSelected = new Set();
            } else {
                if (filterSelected.size === 0) filterSelected = new Set(availableFilterKeys);
                filterSelected.delete(key);
            }
            if (currentResult) renderResults(applyFilter(currentResult));
        });
        filterChecksEl.appendChild(labelEl);
    });
}

function renderXpathItem(xpath, index, isUnique) {
    return `
        <div class="xpath-item">
            <div class="xpath-idx ${isUnique ? 'unique' : ''}">${index}</div>
            <div class="xpath-content">
                <div class="xpath-text">${escapeHtml(xpath.xpath)}</div>
                <div style="display:flex;gap:4px;">
                    <span class="badge ${isUnique ? 'unique' : ''}" style="background:${isUnique ? 'rgba(46,204,113,0.2)' : 'rgba(243,156,18,0.2)'}">${isUnique ? '✓' : '×'+xpath.matchCount}</span>
                    <span class="badge score">${xpath.score}</span>
                    ${xpath.isAngular ? '<span class="badge" style="background:rgba(102,126,234,0.2);color:#667eea">MAT</span>' : ''}
                </div>
            </div>
            <div class="xpath-actions">
                <button class="btn-icon btn-copy-xpath" data-xpath="${escapeHtml(xpath.xpath)}" title="Копировать" aria-label="Копировать XPath">📋</button>
                <button class="btn-icon btn-highlight" data-xpath="${escapeHtml(xpath.xpath)}" title="Подсветить" aria-label="Подсветить элемент на странице">👁</button>
                <button class="btn-icon btn-add-step" data-xpath="${escapeHtml(xpath.xpath)}" title="Добавить в список" aria-label="Добавить XPath в список">➕</button>
            </div>
        </div>
    `;
}

function renderResults(result) {
    if (!result || !result.all || result.all.length === 0) {
        show(emptyStateEl);
        hide(elementInfoEl);
        hide(primarySectionEl);
        hide(uniqueSectionEl);
        hide(nonUniqueSectionEl);
        hide(filterSectionEl);
        hide(exportSectionEl);
        return;
    }

    hide(emptyStateEl);
    show(elementInfoEl);
    show(filterSectionEl);
    show(exportSectionEl);

    const availableKeys = getFilterKeysFromResult(currentResult || result);
    buildFilterCheckboxes(availableKeys);

    // Stats
    statsEl.innerHTML = `
        <span>Всего: <strong>${result.summary.total}</strong></span>
        <span style="color:var(--success)">Уникальных: <strong>${result.summary.unique}</strong></span>
        ${result.summary.nonUnique > 0 ? `<span style="color:var(--warning)">Неуникальных: <strong>${result.summary.nonUnique}</strong></span>` : ''}
        ${result.summary.angularSelectors > 0 ? `<span>Angular: ${result.summary.angularSelectors}</span>` : ''}
    `;

    if (result.primary) {
        primaryXpathEl.textContent = result.primary.xpath;
        primaryUniqueEl.textContent = result.primary.isUnique ? '✓ Уникальный' : '×' + result.primary.matchCount;
        primaryUniqueEl.className = `badge ${result.primary.isUnique ? 'unique' : ''}`;
        primaryScoreEl.textContent = result.primary.score;
        show(primarySectionEl);
    } else {
        hide(primarySectionEl);
    }

    const uniqueOthers = result.uniqueOnly?.slice(1) || [];
    if (uniqueOthers.length > 0) {
        uniqueCountEl.textContent = `(${uniqueOthers.length})`;
        uniqueListEl.innerHTML = uniqueOthers.map((x, i) => renderXpathItem(x, i + 1, true)).join('');
        show(uniqueSectionEl);
    } else {
        hide(uniqueSectionEl);
    }

    if (result.nonUniqueOnly?.length > 0 && !onlyUniqueModeVal) {
        nonUniqueCountEl.textContent = `(${result.nonUniqueOnly.length})`;
        nonUniqueListEl.innerHTML = result.nonUniqueOnly.map((x, i) => renderXpathItem(x, i + 1, false)).join('');
        show(nonUniqueSectionEl);
    } else {
        hide(nonUniqueSectionEl);
    }
}

function renderHistory() {
    if (!historyList || !historyCount) return;
    if (elementHistory.length === 0) {
        hide(historySection);
        return;
    }
    show(historySection);
    historyCount.textContent = `(${elementHistory.length})`;
    historyList.innerHTML = elementHistory.map((h) => `
        <div class="xpath-item">
            <div class="xpath-idx unique">${escapeHtml(h.tag)}</div>
            <div class="xpath-content">
                <div class="xpath-text" title="${escapeHtml(h.xpath)}">${escapeHtml(truncate(h.xpath, 60))}</div>
            </div>
            <div class="xpath-actions">
                <button class="btn-icon btn-copy-xpath" data-xpath="${escapeHtml(h.xpath)}" title="Копировать">📋</button>
                <button class="btn-icon btn-add-step" data-xpath="${escapeHtml(h.xpath)}" title="В список">➕</button>
            </div>
        </div>
    `).join('');
}

function copyToClipboard(text) {
    return navigator.clipboard.writeText(text);
}

/** Строка для вставки в консоль DevTools: $x("...") */
function toConsoleSnippet(xpath) {
    const escaped = (xpath || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `$x("${escaped}")`;
}

// ——— Debounce ———
chrome.storage.local.get(STORAGE_KEY_DEBOUNCE, (data) => {
    const v = data[STORAGE_KEY_DEBOUNCE];
    if (typeof v === 'number' && v >= 80 && v <= 200) {
        debounceSlider.value = v;
        debounceValueEl.textContent = v;
    }
});
debounceSlider.addEventListener('input', () => {
    const val = parseInt(debounceSlider.value, 10);
    debounceValueEl.textContent = val;
    chrome.storage.local.set({ [STORAGE_KEY_DEBOUNCE]: val });
});

// ——— Step delay, only unique ———
if (stepDelayMsEl) {
    chrome.storage.local.get(STORAGE_KEY_STEP_DELAY, (d) => {
        const v = d[STORAGE_KEY_STEP_DELAY];
        if (typeof v === 'number' && v >= 0) stepDelayMsEl.value = v;
    });
    stepDelayMsEl.addEventListener('input', () => {
        const v = Math.max(0, parseInt(stepDelayMsEl.value || '0', 10) || 0);
        chrome.storage.local.set({ [STORAGE_KEY_STEP_DELAY]: v });
    });
}
if (onlyUniqueMode) {
    chrome.storage.local.get(STORAGE_KEY_ONLY_UNIQUE, (d) => {
        onlyUniqueModeVal = !!d[STORAGE_KEY_ONLY_UNIQUE];
        onlyUniqueMode.checked = onlyUniqueModeVal;
        if (currentResult) renderResults(applyFilter(currentResult));
    });
    onlyUniqueMode.addEventListener('change', () => {
        onlyUniqueModeVal = onlyUniqueMode.checked;
        chrome.storage.local.set({ [STORAGE_KEY_ONLY_UNIQUE]: onlyUniqueModeVal });
        if (currentResult) renderResults(applyFilter(currentResult));
    });
}

// ——— History load ———
chrome.storage.local.get(STORAGE_KEY_HISTORY, (d) => {
    elementHistory = Array.isArray(d[STORAGE_KEY_HISTORY]) ? d[STORAGE_KEY_HISTORY] : [];
    renderHistory();
});

// ——— Selector timeout ———
chrome.storage.local.get(STORAGE_KEY_SELECTOR_TIMEOUT, (data) => {
    const v = data[STORAGE_KEY_SELECTOR_TIMEOUT];
    if (typeof v === 'number' && v >= 0 && v <= 60000) {
        selectorTimeoutMsEl.value = v;
    } else {
        selectorTimeoutMsEl.value = SELECTOR_TIMEOUT_DEFAULT;
    }
});
selectorTimeoutMsEl.addEventListener('input', () => {
    const val = Math.max(0, Math.min(60000, parseInt(selectorTimeoutMsEl.value || '0', 10) || 0));
    selectorTimeoutMsEl.value = val;
    chrome.storage.local.set({ [STORAGE_KEY_SELECTOR_TIMEOUT]: val });
});

// ——— Copy for Console ———
copyForConsoleBtn.addEventListener('click', () => {
    const xpath = primaryXpathEl.textContent;
    if (!xpath) return;
    copyToClipboard(toConsoleSnippet(xpath)).then(() => {
        const orig = copyForConsoleBtn.textContent;
        copyForConsoleBtn.textContent = '✓ Скопировано';
        setTimeout(() => { copyForConsoleBtn.textContent = orig; }, 1500);
    });
});

if (addPrimaryToListBtn) {
    addPrimaryToListBtn.addEventListener('click', () => {
        const xpath = (currentResult?.primary?.xpath || primaryXpathEl.textContent || '').trim();
        if (!xpath) return;
        openListTab();
        showStepModal({ xpath, action: 'click', params: {} });
    });
}

// ——— Export: copy all unique ———
copyAllUniqueBtn.addEventListener('click', () => {
    if (!currentResult) return;
    const displayResult = applyFilter(currentResult);
    const allUnique = displayResult.uniqueOnly || [];
    const lines = allUnique.map((c) => c.xpath);
    const text = lines.join('\n');
    copyToClipboard(text).then(() => {
        const orig = copyAllUniqueBtn.textContent;
        copyAllUniqueBtn.textContent = `✓ ${lines.length} шт.`;
        setTimeout(() => { copyAllUniqueBtn.textContent = orig; }, 2000);
    });
});

// ——— Copy all XPath (unique + non-unique) ———
if (copyAllXpathBtn) {
    copyAllXpathBtn.addEventListener('click', () => {
        if (!currentResult) return;
        const displayResult = applyFilter(currentResult);
        const all = (displayResult.uniqueOnly || []).concat(displayResult.nonUniqueOnly || []);
        const text = all.map((c) => c.xpath).join('\n');
        copyToClipboard(text).then(() => {
            const orig = copyAllXpathBtn.textContent;
            copyAllXpathBtn.textContent = `✓ ${all.length} шт.`;
            setTimeout(() => { copyAllXpathBtn.textContent = orig; }, 2000);
        });
    });
}

// ——— Export: download file ———
exportFileBtn.addEventListener('click', () => {
    if (!currentResult) return;
    const displayResult = applyFilter(currentResult);
    const all = (displayResult.uniqueOnly || []).concat(displayResult.nonUniqueOnly || []);
    const text = all.map((c) => c.xpath).join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `xpath-export-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
});

// ——— Messages ———
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'elementHovered') {
        const el = request.element;
        const result = request.xpathResult;
        const primary = result?.primary?.xpath;
        if (primary) {
            elementHistory = elementHistory.filter((h) => h.xpath !== primary);
            elementHistory.unshift({ tag: el.tagName?.toLowerCase(), xpath: primary, primary: true });
            if (elementHistory.length > MAX_HISTORY) elementHistory.pop();
            chrome.storage.local.set({ [STORAGE_KEY_HISTORY]: elementHistory });
            renderHistory();
        }
        statusEl.textContent = `Element: <${el.tagName}>`;
        elementTagEl.textContent = `<${el.tagName}>`;
        if (el.classes?.some((c) => c.startsWith('mat-') || c.startsWith('cdk-'))) {
            angularBadgeEl.classList.remove('hidden');
        } else {
            angularBadgeEl.classList.add('hidden');
        }
        const cls = el.classes?.slice(0, 3).join(' ') || '';
        elementCodeEl.textContent = `<${el.tagName}${el.id ? ` id="${el.id}"` : ''}${cls ? ` class="${cls}"` : ''}>`;
        currentResult = result;
        filterSelected = new Set();
        renderResults(applyFilter(result));
    }
    if (request.action === 'executionProgress') {
        const phase = request.phase;
        const stepId = request.stepId || null;
        if (phase === 'start') {
            currentExecutingStepId = stepId;
            if (stepId) setStepStatus(stepId, 'running', '');
            appendExecutionLog(`▶ Шаг ${(request.index ?? 0) + 1}/${request.total ?? 0}`);
            renderExecutionList();
        } else if (phase === 'end') {
            if (stepId) {
                if (request.ok) setStepStatus(stepId, 'ok', '');
                else setStepStatus(stepId, 'error', request.error || 'Ошибка');
            }
            renderExecutionList();
        } else if (phase === 'done') {
            currentExecutingStepId = null;
            renderExecutionList();
        }
    }
    sendResponse({ received: true });
    return true;
});

// ——— Delegated click: copy, highlight, minimal PDF ———
document.addEventListener('click', (e) => {
    const minimalPdfBtn = e.target.closest('#stepUseMinimalPdfBtn');
    if (minimalPdfBtn && stepModal && !stepModal.classList.contains('hidden')) {
        stepFileBase64 = MINIMAL_PDF_BASE64;
        if (stepFileName) stepFileName.value = (stepFileName.value || '').trim() || 'test.pdf';
        if (stepFileLabel) {
            stepFileLabel.textContent = '✓ test.pdf (минимальный PDF)';
            stepFileLabel.dataset.minimalPdf = '1';
        }
        return;
    }

    const addBtn = e.target.closest('.btn-add-step');
    if (addBtn) {
        const xp = (addBtn.dataset.xpath || '').trim();
        if (xp) {
            openListTab();
            showStepModal({ xpath: xp, action: 'click', params: {} });
        }
        return;
    }

    const copyBtn = e.target.closest('.btn-copy-xpath, #copyPrimary');
    if (copyBtn && !copyBtn.id) {
        const xpath = copyBtn.dataset.xpath;
        if (xpath) {
            copyToClipboard(xpath).then(() => {
                const orig = copyBtn.textContent;
                copyBtn.textContent = '✓';
                setTimeout(() => { copyBtn.textContent = orig; }, 1500);
            });
        }
    }
    if (copyBtn && copyBtn.id === 'copyPrimary') {
        const xpath = primaryXpathEl.textContent;
        if (xpath) {
            copyToClipboard(xpath).then(() => {
                const orig = copyBtn.textContent;
                copyBtn.textContent = '✓';
                setTimeout(() => { copyBtn.textContent = orig; }, 1500);
            });
        }
    }

    const highlightBtn = e.target.closest('.btn-highlight');
    if (highlightBtn) {
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
            if (!tab?.id) return;
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (xp) => {
                    const r = document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                    const el = r.singleNodeValue;
                    if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        const orig = el.style.outline;
                        el.style.outline = '3px solid #00d4aa';
                        setTimeout(() => { el.style.outline = orig; }, 2000);
                    }
                },
                args: [highlightBtn.dataset.xpath]
            });
        });
    }
});

refreshBtn.addEventListener('click', () => location.reload());

// ——— Tabs ———
document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
        const t = tab.dataset.tab;
        document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach((x) => { x.classList.remove('active'); x.hidden = true; });
        tab.classList.add('active');
        if (t === 'inspect') {
            tabInspect.classList.add('active');
            tabInspect.hidden = false;
        } else {
            tabList.classList.add('active');
            tabList.hidden = false;
            renderExecutionList();
        }
    });
});

// ——— Execution list: load, save, render ———
function loadExecutionList() {
    chrome.storage.local.get([STORAGE_KEY_EXECUTION_LIST, STORAGE_KEY_SCENARIOS], (data) => {
        executionList = Array.isArray(data[STORAGE_KEY_EXECUTION_LIST]) ? data[STORAGE_KEY_EXECUTION_LIST] : [];
        scenarios = Array.isArray(data[STORAGE_KEY_SCENARIOS]) ? data[STORAGE_KEY_SCENARIOS] : [];
        renderScenarioSelect();
        renderExecutionList();
    });
}

function renderScenarioSelect() {
    if (!scenarioSelect) return;
    const cur = scenarioSelect.value;
    scenarioSelect.innerHTML = '<option value="">— Сценарий —</option>' +
        scenarios.map((s) => `<option value="${escapeHtml(s.id)}" ${s.id === cur ? 'selected' : ''}>${escapeHtml(s.name || 'Без имени')}</option>`).join('');
}

function saveExecutionList() {
    chrome.storage.local.set({ [STORAGE_KEY_EXECUTION_LIST]: executionList });
    const name = (scenarioName?.value || '').trim();
    if (name) {
        const idx = scenarios.findIndex((s) => s.id === currentScenarioId);
        if (idx >= 0) {
            scenarios[idx] = { ...scenarios[idx], name, steps: [...executionList] };
        } else {
            currentScenarioId = 'scn-' + Date.now();
            scenarios.push({ id: currentScenarioId, name, steps: [...executionList] });
        }
        chrome.storage.local.set({ [STORAGE_KEY_SCENARIOS]: scenarios });
        renderScenarioSelect();
    }
}

if (scenarioSelect) {
    scenarioSelect.addEventListener('change', () => {
        const id = scenarioSelect.value;
        if (!id) {
            currentScenarioId = null;
            return;
        }
        const s = scenarios.find((sc) => sc.id === id);
        if (s?.steps) {
            currentScenarioId = id;
            executionList = s.steps.map((st) => ({ ...st, id: st.id || 'step-' + Date.now() + '-' + Math.random().toString(36).slice(2) }));
            if (scenarioName) scenarioName.value = s.name || '';
            chrome.storage.local.set({ [STORAGE_KEY_EXECUTION_LIST]: executionList });
            renderExecutionList();
        }
    });
}

let draggedStepIdx = null;

function onStepDragStart(e) {
    const li = e.target.closest('.execution-item');
    if (!li || li.dataset.idx === undefined) return;
    draggedStepIdx = parseInt(li.dataset.idx, 10);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(draggedStepIdx));
    li.classList.add('dragging');
}

function onStepDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    executionListEl.querySelectorAll('.execution-item').forEach((el) => el.classList.remove('drag-over'));
    const li = e.target.closest('.execution-item');
    if (li && li.dataset.idx !== undefined) li.classList.add('drag-over');
}

function onStepDrop(e) {
    e.preventDefault();
    document.querySelectorAll('.execution-item').forEach((el) => el.classList.remove('drag-over'));
    const li = e.target.closest('.execution-item');
    if (!li || li.dataset.idx === undefined || draggedStepIdx == null) return;
    const dropIdx = parseInt(li.dataset.idx, 10);
    if (dropIdx === draggedStepIdx) return;
    const step = executionList[draggedStepIdx];
    executionList.splice(draggedStepIdx, 1);
    const newIdx = dropIdx > draggedStepIdx ? dropIdx - 1 : dropIdx;
    executionList.splice(newIdx, 0, step);
    saveExecutionList();
    renderExecutionList();
}

function onStepDragEnd(e) {
    document.querySelectorAll('.execution-item').forEach((el) => { el.classList.remove('dragging', 'drag-over'); });
    draggedStepIdx = null;
}

function renderExecutionList() {
    executionListEl.innerHTML = '';
    const searchQ = (listSearch?.value || '').trim().toLowerCase();
    const filtered = searchQ
        ? executionList.filter((s) =>
            (s.xpath || '').toLowerCase().includes(searchQ) ||
            (s.action || '').toLowerCase().includes(searchQ) ||
            (ACTION_LABELS[s.action] || '').toLowerCase().includes(searchQ))
        : executionList;
    if (filtered.length === 0) {
        listHint.classList.remove('hidden');
        listHint.style.display = '';
        listHint.textContent = searchQ ? 'Нет совпадений' : 'Наведите на элемент в инспекторе, затем «Добавить текущий».';
        return;
    }
    listHint.classList.add('hidden');
    listHint.style.display = 'none';
    filtered.forEach((step, displayIdx) => {
        const actualIdx = executionList.indexOf(step);
        const li = document.createElement('li');
        li.className = 'execution-item' + (step.id === currentExecutingStepId ? ' current' : '');
        li.dataset.stepId = step.id;
        const s = stepRunStatus[step.id];
        const statusBadge = s?.state
            ? `<span class="execution-item-badge ${s.state === 'ok' ? 'click' : s.state === 'error' ? 'file_upload' : 'wait'}" title="${escapeHtml(s.message || '')}">${escapeHtml(s.state.toUpperCase())}</span>`
            : '';
        let paramsText = '';
        if (step.action === 'input' && step.params?.value) paramsText = `"${escapeHtml(step.params.value.substring(0, 30))}${step.params.value.length > 30 ? '…' : ''}"`;
        else if (step.action === 'wait') paramsText = `${step.params?.delayMs ?? 500} мс`;
        else if (step.action === 'file_upload' && step.params?.fileName) paramsText = step.params.fileContentBase64 ? `📎 ${escapeHtml(step.params.fileName)}` : `📎 ${escapeHtml(step.params.fileName)} (пустой)`;
        li.innerHTML = `
            <div class="execution-item-header">
                ${!searchQ ? `<span class="execution-item-drag" title="Перетащить" aria-label="Перетащить">⋮⋮</span>` : ''}
                <span class="execution-item-idx">${displayIdx + 1}</span>
                <span class="execution-item-xpath" title="${escapeHtml(step.xpath)}">${escapeHtml(truncate(step.xpath, 50))}</span>
                <span class="execution-item-badge ${step.action}">${ACTION_LABELS[step.action] || step.action}</span>
                ${statusBadge}
            </div>
            ${paramsText ? `<div class="execution-item-params">${paramsText}</div>` : ''}
            <div class="execution-item-actions">
                <button type="button" class="btn-icon btn-run-step" data-id="${escapeHtml(step.id)}" title="Выполнить шаг" aria-label="Выполнить шаг">▶</button>
                <button type="button" class="btn-icon btn-clone-step" data-id="${escapeHtml(step.id)}" title="Клонировать">⧉</button>
                <button type="button" class="btn-icon btn-edit-step" data-id="${escapeHtml(step.id)}" title="Редактировать">✏</button>
                <button type="button" class="btn-icon btn-delete-step" data-id="${escapeHtml(step.id)}" title="Удалить">🗑</button>
                <button type="button" class="btn-icon btn-move-up" data-idx="${actualIdx}" title="Вверх" ${actualIdx === 0 ? 'disabled' : ''}>↑</button>
                <button type="button" class="btn-icon btn-move-down" data-idx="${actualIdx}" title="Вниз" ${actualIdx === executionList.length - 1 ? 'disabled' : ''}>↓</button>
            </div>
        `;
        if (!searchQ) {
            li.draggable = true;
            li.dataset.idx = String(actualIdx);
            li.addEventListener('dragstart', onStepDragStart);
            li.addEventListener('dragover', onStepDragOver);
            li.addEventListener('drop', onStepDrop);
            li.addEventListener('dragend', onStepDragEnd);
        }
        executionListEl.appendChild(li);
    });

    if (currentExecutingStepId && tabList.classList.contains('active')) {
        const activeRow = executionListEl.querySelector(`[data-step-id="${CSS.escape(currentExecutingStepId)}"]`);
        if (activeRow) activeRow.scrollIntoView({ block: 'nearest' });
    }
}

function truncate(str, len) {
    if (!str || str.length <= len) return str || '';
    return str.substring(0, len) + '…';
}

function openListTab() {
    const btn = document.querySelector('.tab[data-tab="list"]');
    if (btn) btn.click();
}

// ——— Step modal ———
let stepFileBase64 = null;

function showStepModal(step) {
    editingStepId = step ? step.id : null;
    stepXpath.value = step ? step.xpath : (primaryXpathEl ? primaryXpathEl.textContent : '') || '';
    stepAction.value = step ? step.action : 'click';
    stepInputValue.value = (step?.params?.value) || '';
    stepWaitMs.value = (step?.params?.delayMs) ?? 500;
    stepFileName.value = (step?.params?.fileName) || '';
    stepFileBase64 = (step?.params?.fileContentBase64) || null;
    if (stepFileLabel) {
        stepFileLabel.textContent = stepFileBase64 ? 'Файл прикреплён' : '—';
        delete stepFileLabel.dataset.minimalPdf;
    }
    if (stepRetryOnError) stepRetryOnError.checked = !!step?.params?.retryOnError;
    toggleStepParams();
    stepModal.classList.remove('hidden');
    stepModal.querySelector('.modal-title').textContent = step ? 'Редактировать шаг' : 'Добавить шаг';
}

function hideStepModal() {
    stepModal.classList.add('hidden');
    editingStepId = null;
}

function toggleStepParams() {
    const action = stepAction.value;
    stepParamsInput.classList.toggle('hidden', action !== 'input');
    stepParamsInput.style.display = action === 'input' ? '' : 'none';
    stepParamsWait.classList.toggle('hidden', action !== 'wait');
    stepParamsWait.style.display = action === 'wait' ? '' : 'none';
    stepParamsFile.classList.toggle('hidden', action !== 'file_upload');
    stepParamsFile.style.display = action === 'file_upload' ? '' : 'none';
}

stepAction.addEventListener('change', toggleStepParams);

stepChooseFileBtn.addEventListener('click', () => stepFileInput.click());

stepFileInput.addEventListener('change', () => {
    const file = stepFileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        const b64 = reader.result?.split(',')?.[1] || '';
        const sizeBytes = b64 ? Math.ceil(b64.length * 3 / 4) : 0;
        const warn = sizeBytes > 1024 * 1024 ? ' (>1 MB — будет только имя файла)' : '';
        stepFileBase64 = sizeBytes <= 1024 * 1024 ? b64 : null;
        if (stepFileLabel) {
            stepFileLabel.textContent = file.name + warn;
            delete stepFileLabel.dataset.minimalPdf;
        }
        if (!stepFileName.value.trim()) stepFileName.value = file.name;
    };
    reader.readAsDataURL(file);
    stepFileInput.value = '';
});

stepModalCancel.addEventListener('click', hideStepModal);
stepModalSave.addEventListener('click', () => {
    const xpath = stepXpath.value.trim();
    if (!xpath) return;
    const action = stepAction.value;
    const params = {};
    if (action === 'input') params.value = stepInputValue.value;
    if (action === 'wait') params.delayMs = Math.max(0, parseInt(stepWaitMs.value, 10) || 500);
    if (action === 'file_upload') {
        params.fileName = stepFileName.value.trim() || 'file';
        const hasMinimalPdf = stepFileLabel?.dataset?.minimalPdf === '1';
        const fileB64 = stepFileBase64 || (hasMinimalPdf ? MINIMAL_PDF_BASE64 : null);
        if (fileB64) params.fileContentBase64 = fileB64;
    }
    if (stepRetryOnError?.checked) params.retryOnError = true;
    if (editingStepId) {
        const idx = executionList.findIndex((s) => s.id === editingStepId);
        if (idx !== -1) {
            executionList[idx] = { ...executionList[idx], xpath, action, params };
        }
    } else {
        executionList.push({ id: 'step-' + Date.now() + '-' + Math.random().toString(36).slice(2), xpath, action, params });
    }
    saveExecutionList();
    hideStepModal();
    renderExecutionList();
});

addStepBtn.addEventListener('click', () => {
    const xpath = (currentResult?.primary?.xpath || (primaryXpathEl && primaryXpathEl.textContent) || '').trim();
    if (!xpath) {
        addStepBtn.textContent = 'Сначала выберите элемент';
        setTimeout(() => { addStepBtn.textContent = '+ Добавить текущий'; }, 2000);
        return;
    }
    showStepModal({ xpath, action: 'click', params: {} });
});

addStepManualBtn.addEventListener('click', () => {
    showStepModal(null);
});

document.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.btn-edit-step');
    if (editBtn) {
        const step = executionList.find((s) => s.id === editBtn.dataset.id);
        if (step) showStepModal(step);
    }

    const runBtn = e.target.closest('.btn-run-step');
    if (runBtn) {
        const step = executionList.find((s) => s.id === runBtn.dataset.id);
        if (!step) return;
        currentExecutingStepId = step.id;
        setStepStatus(step.id, 'running', '');
        renderExecutionList();
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
            if (!tab?.id) return;
            chrome.tabs.sendMessage(tab.id, { action: 'executeList', steps: [step], continueOnError: true }).then((resp) => {
                const r = resp?.results?.[0];
                if (r?.ok) setStepStatus(step.id, 'ok', '');
                else setStepStatus(step.id, 'error', r?.error || resp?.error || 'Ошибка');
                currentExecutingStepId = null;
                renderExecutionList();
            }).catch((err) => {
                setStepStatus(step.id, 'error', err?.message || 'нет связи');
                currentExecutingStepId = null;
                renderExecutionList();
            });
        });
        return;
    }

    const cloneBtn = e.target.closest('.btn-clone-step');
    if (cloneBtn) {
        const step = executionList.find((s) => s.id === cloneBtn.dataset.id);
        if (step) {
            const clone = {
                ...step,
                id: 'step-' + Date.now() + '-' + Math.random().toString(36).slice(2),
                params: step.params ? { ...step.params } : {}
            };
            const idx = executionList.indexOf(step);
            executionList.splice(idx + 1, 0, clone);
            saveExecutionList();
            renderExecutionList();
        }
        return;
    }

    const delBtn = e.target.closest('.btn-delete-step');
    if (delBtn) {
        executionList = executionList.filter((s) => s.id !== delBtn.dataset.id);
        saveExecutionList();
        renderExecutionList();
    }
    const upBtn = e.target.closest('.btn-move-up');
    if (upBtn && !upBtn.disabled) {
        const idx = parseInt(upBtn.dataset.idx, 10);
        if (idx > 0) {
            [executionList[idx - 1], executionList[idx]] = [executionList[idx], executionList[idx - 1]];
            saveExecutionList();
            renderExecutionList();
        }
    }
    const downBtn = e.target.closest('.btn-move-down');
    if (downBtn && !downBtn.disabled) {
        const idx = parseInt(downBtn.dataset.idx, 10);
        if (idx < executionList.length - 1) {
            [executionList[idx], executionList[idx + 1]] = [executionList[idx + 1], executionList[idx]];
            saveExecutionList();
            renderExecutionList();
        }
    }
});

saveListBtn.addEventListener('click', () => {
    saveExecutionList();
    saveListBtn.textContent = '✓ Сохранено';
    setTimeout(() => { saveListBtn.textContent = '💾 Сохранить'; }, 1500);
});

if (listSearch) listSearch.addEventListener('input', renderExecutionList);

// ——— Export JSON (формат для автотестов) ———
const EXPORT_JSON_VERSION = 1;

function exportToJson() {
    const payload = {
        name: 'XPath Helper — сценарий',
        version: EXPORT_JSON_VERSION,
        exportedAt: new Date().toISOString(),
        steps: executionList.map((s, i) => ({
            step: i + 1,
            xpath: s.xpath,
            action: s.action,
            params: s.params || {}
        }))
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `xpath-autotest-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function parseImportFile(data) {
    let raw = Array.isArray(data) ? data : (data?.steps || []);
    if (raw.length && raw.some((s) => s.step != null)) {
        raw = [...raw].sort((a, b) => (Number(a.step) || 0) - (Number(b.step) || 0));
    }
    return raw.map((s, i) => ({
        id: 'step-' + Date.now() + '-' + i + '-' + Math.random().toString(36).slice(2),
        xpath: typeof s.xpath === 'string' ? s.xpath : '',
        action: ['click', 'input', 'file_upload', 'wait'].includes(s.action) ? s.action : 'click',
        params: s.params && typeof s.params === 'object' ? s.params : {}
    })).filter((s) => s.xpath);
}

function showImportModal(steps) {
    if (!importModal || !importPreview) return;
    pendingImportData = steps;
    const count = steps.length;
    const warn = count > MAX_STEPS_WARNING ? ` ⚠️ Больше ${MAX_STEPS_WARNING} шагов` : '';
    importPreview.textContent = `Найдено шагов: ${count}${warn}. Выберите действие:`;
    importModal.classList.remove('hidden');
}

function hideImportModal() {
    if (importModal) importModal.classList.add('hidden');
    pendingImportData = null;
}

function applyImport(mode) {
    if (!pendingImportData) return;
    if (mode === 'replace') {
        executionList = [...pendingImportData];
    } else {
        executionList = executionList.concat(pendingImportData);
    }
    saveExecutionList();
    renderExecutionList();
    hideImportModal();
    if (importJsonBtn) {
        importJsonBtn.textContent = '✓ Загружено ' + executionList.length;
        setTimeout(() => { importJsonBtn.textContent = '📥 Загрузить шаги'; }, 2000);
    }
}

if (importReplace) importReplace.addEventListener('click', () => applyImport('replace'));
if (importAppend) importAppend.addEventListener('click', () => applyImport('append'));
if (importCancel) importCancel.addEventListener('click', hideImportModal);

function importFromJson(file) {
    if (file.size > 1024 * 1024) {
        importJsonBtn.textContent = 'Файл >1 MB';
        setTimeout(() => { importJsonBtn.textContent = '📥 Загрузить шаги'; }, 2000);
        return;
    }
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const data = JSON.parse(reader.result);
            const steps = parseImportFile(data);
            if (steps.length === 0) {
                importJsonBtn.textContent = 'Нет шагов';
                setTimeout(() => { importJsonBtn.textContent = '📥 Загрузить шаги'; }, 2000);
                return;
            }
            showImportModal(steps);
        } catch (e) {
            importJsonBtn.textContent = 'Ошибка JSON';
            setTimeout(() => { importJsonBtn.textContent = '📥 Загрузить шаги'; }, 2000);
        }
    };
    reader.readAsText(file, 'UTF-8');
}

// ——— Export templates (Playwright, Cypress, Selenium) ———
function exportToTemplates() {
    const name = (scenarioName?.value || 'scenario').trim() || 'scenario';
    const steps = executionList;
    if (steps.length === 0) {
        if (exportTemplatesBtn) exportTemplatesBtn.textContent = 'Список пуст';
        setTimeout(() => { if (exportTemplatesBtn) exportTemplatesBtn.textContent = '📤 Шаблоны'; }, 2000);
        return;
    }
    const pw = steps.map((s, i) => {
        if (s.action === 'click') return `  await page.locator('xpath=${s.xpath.replace(/'/g, "\\'")}').click();`;
        if (s.action === 'input') return `  await page.locator('xpath=${s.xpath.replace(/'/g, "\\'")}').fill('${(s.params?.value || '').replace(/'/g, "\\'")}');`;
        if (s.action === 'wait') return `  await page.waitForTimeout(${s.params?.delayMs ?? 500});`;
        if (s.action === 'file_upload') return `  await page.locator('xpath=${s.xpath.replace(/'/g, "\\'")}').setInputFiles({ path: '${(s.params?.fileName || 'file').replace(/'/g, "\\'")}' });`;
        return `  // ${s.action}: ${s.xpath}`;
    }).join('\n');
    const cyp = steps.map((s, i) => {
        if (s.action === 'click') return `  cy.xpath('${s.xpath.replace(/'/g, "\\'")}').click();`;
        if (s.action === 'input') return `  cy.xpath('${s.xpath.replace(/'/g, "\\'")}').type('${(s.params?.value || '').replace(/'/g, "\\'")}');`;
        if (s.action === 'wait') return `  cy.wait(${s.params?.delayMs ?? 500});`;
        if (s.action === 'file_upload') return `  cy.xpath('${s.xpath.replace(/'/g, "\\'")}').attachFile('${(s.params?.fileName || 'file').replace(/'/g, "\\'")}');`;
        return `  // ${s.action}: ${s.xpath}`;
    }).join('\n');
    const sel = steps.map((s, i) => {
        if (s.action === 'click') return `  driver.findElement(By.xpath("${s.xpath.replace(/"/g, '\\"')}")).click();`;
        if (s.action === 'input') return `  driver.findElement(By.xpath("${s.xpath.replace(/"/g, '\\"')}")).sendKeys("${(s.params?.value || '').replace(/"/g, '\\"')}");`;
        if (s.action === 'wait') return `  Thread.sleep(${s.params?.delayMs ?? 500});`;
        if (s.action === 'file_upload') return `  driver.findElement(By.xpath("${s.xpath.replace(/"/g, '\\"')}")).sendKeys("${(s.params?.fileName || 'file').replace(/"/g, '\\"')}");`;
        return `  // ${s.action}: ${s.xpath}`;
    }).join('\n');
    const content = `# Playwright\n\ntest('${name}', async ({ page }) => {\n${pw}\n});\n\n# Cypress\n\ndescribe('${name}', () => {\n  it('should run', () => {\n${cyp}\n  });\n});\n\n# Selenium (Java)\n\n@Test\npublic void ${name.replace(/[^a-zA-Z0-9]/g, '_')}() {\n${sel}\n}\n`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `xpath-templates-${name}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    if (exportTemplatesBtn) {
        exportTemplatesBtn.textContent = '✓ Скачано';
        setTimeout(() => { exportTemplatesBtn.textContent = '📤 Шаблоны'; }, 1500);
    }
}

if (exportTemplatesBtn) exportTemplatesBtn.addEventListener('click', exportToTemplates);

// ——— Copy log ———
if (copyLogBtn) copyLogBtn.addEventListener('click', () => {
    const text = executionLog?.textContent || '';
    if (!text) return;
    copyToClipboard(text).then(() => {
        copyLogBtn.textContent = '✓ Скопировано';
        setTimeout(() => { copyLogBtn.textContent = 'Копировать лог'; }, 1500);
    });
});

if (exportJsonBtn) exportJsonBtn.addEventListener('click', exportToJson);
if (importJsonBtn) importJsonBtn.addEventListener('click', () => importJsonInput.click());
if (importJsonInput) importJsonInput.addEventListener('change', () => {
    const f = importJsonInput.files?.[0];
    if (f) importFromJson(f);
    importJsonInput.value = '';
});

// ——— Execute list ———
function appendExecutionLog(line) {
    if (!executionLog) return;
    const t = new Date().toLocaleTimeString('ru-RU', { hour12: false });
    executionLog.textContent += `[${t}] ${line}\n`;
    executionLog.scrollTop = executionLog.scrollHeight;
    if (executionLogSection) {
        show(executionLogSection);
        executionLogSection.classList.remove('hidden');
    }
}

executeListBtn.addEventListener('click', () => {
    if (executionList.length === 0) {
        executeListBtn.textContent = 'Список пуст';
        setTimeout(() => { executeListBtn.textContent = '▶ Выполнить'; }, 2000);
        return;
    }
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (!tab?.id) return;
        if (executionLog) executionLog.textContent = '';
        appendExecutionLog(`Старт: ${executionList.length} шагов`);
        executionList.forEach((s) => setStepStatus(s.id, 'running', ''));
        currentExecutingStepId = executionList[0]?.id || null;
        show(stopExecuteBtn);
        hide(executeListBtn);
        renderExecutionList();
        const stepDelay = Math.max(0, parseInt(stepDelayMsEl?.value, 10) || STEP_DELAY_DEFAULT);
        chrome.tabs.sendMessage(tab.id, {
            action: 'executeList',
            steps: executionList,
            continueOnError: true,
            stepDelayMs: stepDelay
        }).then((resp) => {
            const results = resp?.results || [];
            let okCount = 0;
            results.forEach((r) => {
                if (!r?.id) return;
                if (r.ok) {
                    okCount++;
                    setStepStatus(r.id, 'ok', '');
                    appendExecutionLog(`✓ ${r.id}`);
                } else {
                    setStepStatus(r.id, 'error', r.error || 'Ошибка');
                    appendExecutionLog(`✗ ${r.id}: ${r.error || 'Ошибка'}`);
                }
            });
            appendExecutionLog(`Готово: ${okCount}/${executionList.length}`);
            renderExecutionList();
            hide(stopExecuteBtn);
            show(executeListBtn);
            executeListBtn.textContent = `✓ ${okCount}/${executionList.length}`;
            setTimeout(() => { executeListBtn.textContent = '▶ Выполнить'; }, 2500);
        }).catch((err) => {
            appendExecutionLog(`Ошибка: ${err?.message || 'нет связи'}`);
            hide(stopExecuteBtn);
            show(executeListBtn);
            executeListBtn.textContent = 'Ошибка: ' + (err?.message || 'нет связи');
            setTimeout(() => { executeListBtn.textContent = '▶ Выполнить'; }, 3000);
        });
    });
});

if (stopExecuteBtn) {
    stopExecuteBtn.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
            if (tab?.id) chrome.tabs.sendMessage(tab.id, { action: 'stopExecution' });
            appendExecutionLog('Остановлено пользователем');
            hide(stopExecuteBtn);
            show(executeListBtn);
            currentExecutingStepId = null;
            renderExecutionList();
        });
    });
}

loadExecutionList();

chrome.runtime.sendMessage({ action: 'ping' }, () => {
    if (chrome.runtime.lastError) {
        const err = chrome.runtime.lastError.message || '';
        if (err.includes('Extension context invalidated') || err.includes('context invalidated')) {
            if (contextInvalidatedBanner) {
                show(contextInvalidatedBanner);
                contextInvalidatedBanner.classList.remove('hidden');
            }
        }
        statusEl.textContent = 'Error: ' + err;
    } else {
        statusEl.textContent = 'Готов. Зажмите Ctrl или Alt+X, наведите на элемент.';
    }
});

if (reloadTabBtn) {
    reloadTabBtn.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
            if (tab?.id) chrome.tabs.reload(tab.id);
        });
    });
}

console.log('[SidePanel] Ready');
