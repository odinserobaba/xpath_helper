// sidepanel/sidepanel.js
console.log('[SidePanel] Loaded');

const STORAGE_KEY_DEBOUNCE = 'xpath-helper-debounce-ms';
const STORAGE_KEY_EXECUTION_LIST = 'xpath-helper-execution-list';
const STORAGE_KEY_SELECTOR_TIMEOUT = 'xpath-helper-selector-timeout-ms';
const STORAGE_KEY_STEP_DELAY = 'xpath-helper-step-delay-ms';
const STORAGE_KEY_ONLY_UNIQUE = 'xpath-helper-only-unique';
const STORAGE_KEY_SCENARIOS = 'xpath-helper-scenarios';
const STORAGE_KEY_HISTORY = 'xpath-helper-element-history';
const STORAGE_KEY_STOP_ON_ERROR = 'xpath-helper-stop-on-error';
const DEBOUNCE_DEFAULT = 120;
const SELECTOR_TIMEOUT_DEFAULT = 5000;
const STEP_DELAY_DEFAULT = 100;
const MAX_HISTORY = 8;
const MAX_STEPS_WARNING = 100;
const MAX_FILE_SIZE_B64 = 1024 * 1024 * 4 / 3;

const ACTION_LABELS = { click: 'Клик', input: 'Ввод', file_upload: 'Файл', wait: 'Пауза', separator: '—', click_if_exists: 'Клик если есть', branch: 'Ветвление', assert: 'Assert', navigate: 'Переход' };
const BRANCH_CONDITIONS = [
    { value: 'element_exists', label: 'Элемент есть' },
    { value: 'text_equals', label: 'Текст равен' },
    { value: 'text_contains', label: 'Текст содержит' }
];
const SEPARATOR_COLORS = ['#00d4aa', '#667eea', '#f39c12', '#e74c3c', '#9b59b6', '#3498db', '#2ecc71', '#e91e63'];

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
const tabEditor = $('tabEditor');
const tabFlow = $('tabFlow');
const tabLog = $('tabLog');
const flowCanvas = $('flowCanvas');
const flowAddStepBtn = $('flowAddStepBtn');
const flowAddManualBtn = $('flowAddManualBtn');
const flowAddSeparatorBtn = $('flowAddSeparatorBtn');
const flowExecuteBtn = $('flowExecuteBtn');
const flowStopBtn = $('flowStopBtn');
const flowSaveBtn = $('flowSaveBtn');
const editorStepList = $('editorStepList');
const editorEmpty = $('editorEmpty');
const editorDetail = $('editorDetail');
const editorXpath = $('editorXpath');
const editorAction = $('editorAction');
const editorInputValue = $('editorInputValue');
const editorWaitMs = $('editorWaitMs');
const editorFileName = $('editorFileName');
const editorFileLabel = $('editorFileLabel');
const editorFileInput = $('editorFileInput');
const editorChooseFileBtn = $('editorChooseFileBtn');
const editorMinimalPdfBtn = $('editorMinimalPdfBtn');
const editorSeparatorLabel = $('editorSeparatorLabel');
const editorSeparatorColors = $('editorSeparatorColors');
const editorParamsInput = $('editorParamsInput');
const editorParamsWait = $('editorParamsWait');
const editorParamsFile = $('editorParamsFile');
const editorParamsSeparator = $('editorParamsSeparator');
const editorParamsBranch = $('editorParamsBranch');
const editorParamsAssert = $('editorParamsAssert');
const editorParamsNavigate = $('editorParamsNavigate');
const editorAssertCondition = $('editorAssertCondition');
const editorAssertExpected = $('editorAssertExpected');
const editorNavigateUrl = $('editorNavigateUrl');
const editorTimeoutMs = $('editorTimeoutMs');
const editorMandatory = $('editorMandatory');
const editorBranchCondition = $('editorBranchCondition');
const editorBranchExpected = $('editorBranchExpected');
const editorBranchNextId = $('editorBranchNextId');
const editorBranchNextElseId = $('editorBranchNextElseId');
const editorParamsWaitForLoad = $('editorParamsWaitForLoad');
const editorRetryOnError = $('editorRetryOnError');
const editorWaitForLoad = $('editorWaitForLoad');
const editorApplyBtn = $('editorApplyBtn');
const editorTestBtn = $('editorTestBtn');
const editorValidateBtn = $('editorValidateBtn');
const addStepBtn = $('addStepBtn');
const addStepManualBtn = $('addStepManualBtn');
const addSeparatorBtn = $('addSeparatorBtn');
const stopOnErrorEl = $('stopOnError');
const stepParamsSeparator = $('stepParamsSeparator');
const stepParamsWaitForLoad = $('stepParamsWaitForLoad');
const stepSeparatorLabel = $('stepSeparatorLabel');
const stepSeparatorColors = $('stepSeparatorColors');
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
const stepParamsBranch = $('stepParamsBranch');
const stepParamsAssert = $('stepParamsAssert');
const stepParamsNavigate = $('stepParamsNavigate');
const stepTimeoutMs = $('stepTimeoutMs');
const stepMandatory = $('stepMandatory');
const stepAssertCondition = $('stepAssertCondition');
const stepAssertExpected = $('stepAssertExpected');
const stepNavigateUrl = $('stepNavigateUrl');
const stepWaitMs = $('stepWaitMs');
const stepBranchCondition = $('stepBranchCondition');
const stepBranchExpected = $('stepBranchExpected');
const stepBranchNextId = $('stepBranchNextId');
const stepBranchNextElseId = $('stepBranchNextElseId');
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
const executionLog = $('executionLog');
const copyLogBtn = $('copyLogBtn');
const historySection = $('historySection');
const historyList = $('historyList');
const historyCount = $('historyCount');
const copyAllXpathBtn = $('copyAllXpath');
const onlyUniqueMode = $('onlyUniqueMode');
const stepDelayMsEl = $('stepDelayMs');
const stepRetryOnError = $('stepRetryOnError');
const stepWaitForLoad = $('stepWaitForLoad');
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
/** Выбранный шаг в редакторе */
let selectedEditorStepId = null;
/** Индекс для вставки шага (null = в конец) */
let insertStepAtIndex = null;
/** Файл в редакторе (base64) */
let editorFileBase64 = null;

function setStepStatus(id, state, message) {
    stepRunStatus[id] = { state, message: message || '' };
}

function show(el) { if (el) { el.classList.remove('hidden'); el.style.display = ''; } }
function hide(el) { if (el) { el.classList.add('hidden'); el.style.display = 'none'; } }
function setExecutionUIRunning(running) {
    if (running) { hide(executeListBtn); show(stopExecuteBtn); hide(flowExecuteBtn); show(flowStopBtn); }
    else { show(executeListBtn); hide(stopExecuteBtn); show(flowExecuteBtn); hide(flowStopBtn); }
}

/** Ошибка bfcache: страница в кэше, канал закрыт */
function isBfcacheError(e) {
    const msg = String(e?.message || e || '').toLowerCase();
    return msg.includes('back/forward cache') || msg.includes('message channel is closed') || msg.includes('receiving end does not');
}

function getTabErrorMessage(e) {
    if (isBfcacheError(e)) return 'Страница в кэше. Обновите вкладку (F5) и попробуйте снова.';
    return e?.message || e || 'Нет связи';
}

function showBfcacheBanner() {
    const banner = $('bfcacheBanner');
    if (banner) { show(banner); banner.classList.remove('hidden'); }
}

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
            if (tabInspect) { tabInspect.classList.add('active'); tabInspect.hidden = false; }
        } else if (t === 'editor') {
            if (tabEditor) { tabEditor.classList.add('active'); tabEditor.hidden = false; renderEditorStepList(); }
        } else if (t === 'flow') {
            if (tabFlow) { tabFlow.classList.add('active'); tabFlow.hidden = false; renderFlowCanvas(); }
        } else if (t === 'log') {
            if (tabLog) { tabLog.classList.add('active'); tabLog.hidden = false; }
        } else {
            if (tabList) { tabList.classList.add('active'); tabList.hidden = false; renderExecutionList(); }
        }
    });
});

// ——— Editor tab ———
function renderEditorStepList() {
    if (!editorStepList) return;
    editorStepList.innerHTML = '';
    executionList.forEach((step, i) => {
        const li = document.createElement('li');
        li.className = 'editor-step-item' + (step.id === selectedEditorStepId ? ' selected' : '') + (step.action === 'separator' ? ' separator-item' : '');
        li.dataset.stepId = step.id;
        const badge = step.action === 'separator' ? '—' : (ACTION_LABELS[step.action] || step.action);
        let preview = step.xpath || '—';
        if (step.action === 'input' && step.params?.value) preview += ` → "${step.params.value.substring(0, 20)}${step.params.value.length > 20 ? '…' : ''}"`;
        else if (step.action === 'wait') preview += ` (${step.params?.delayMs ?? 500} мс)`;
        else if (step.action === 'branch' || step.action === 'assert') preview += ` [${BRANCH_CONDITIONS.find((x) => x.value === step.params?.condition)?.label || step.params?.condition || '?'}]`;
        else if (step.action === 'navigate') preview = step.params?.url || '—';
        else if (step.action === 'separator' && step.params?.label) preview = step.params.label;
        li.innerHTML = `<span class="step-badge">${i + 1}. ${badge}</span><div class="step-preview" title="${escapeHtml(step.xpath || '')}">${escapeHtml(preview)}</div>`;
        li.addEventListener('click', () => selectEditorStep(step.id));
        editorStepList.appendChild(li);
    });
}

function selectEditorStep(stepId) {
    selectedEditorStepId = stepId;
    renderEditorStepList();
    const step = executionList.find((s) => s.id === stepId);
    if (!step) {
        if (editorEmpty) show(editorEmpty);
        if (editorDetail) hide(editorDetail);
        return;
    }
    if (editorEmpty) hide(editorEmpty);
    if (editorDetail) show(editorDetail);
    editorXpath.value = step.xpath || '';
    editorAction.value = step.action || 'click';
    editorInputValue.value = step.params?.value || '';
    editorWaitMs.value = step.params?.delayMs ?? 500;
    editorFileName.value = step.params?.fileName || '';
    editorFileBase64 = step.params?.fileContentBase64 || null;
    editorFileLabel.textContent = editorFileBase64 ? 'Файл прикреплён' : '—';
    editorSeparatorLabel.value = step.params?.label || '';
    editorRetryOnError.checked = !!step.params?.retryOnError;
    editorWaitForLoad.checked = step.params?.waitForLoad !== false;
    if (editorMandatory) editorMandatory.checked = step.params?.mandatory !== false;
    if (editorTimeoutMs) editorTimeoutMs.value = step.params?.timeoutMs ?? 0;
    if (editorBranchCondition) editorBranchCondition.value = step.params?.condition || 'element_exists';
    if (editorAssertCondition) editorAssertCondition.value = step.params?.condition || 'element_exists';
    if (editorAssertExpected) editorAssertExpected.value = step.params?.expectedValue || '';
    if (editorNavigateUrl) editorNavigateUrl.value = step.params?.url || '';
    if (editorBranchExpected) editorBranchExpected.value = step.params?.expectedValue || '';
    renderEditorSeparatorColors(step.params?.color || SEPARATOR_COLORS[0]);
    toggleEditorParams();
    if (step.action === 'branch') {
        if (editorBranchNextId) editorBranchNextId.value = step.params?.nextId || '';
        if (editorBranchNextElseId) editorBranchNextElseId.value = step.params?.nextElseId || '';
    }
}

function toggleEditorParams() {
    const action = editorAction.value;
    if (editorParamsInput) { editorParamsInput.classList.toggle('hidden', action !== 'input'); editorParamsInput.style.display = action === 'input' ? '' : 'none'; }
    if (editorParamsWait) { editorParamsWait.classList.toggle('hidden', action !== 'wait'); editorParamsWait.style.display = action === 'wait' ? '' : 'none'; }
    if (editorParamsFile) { editorParamsFile.classList.toggle('hidden', action !== 'file_upload'); editorParamsFile.style.display = action === 'file_upload' ? '' : 'none'; }
    if (editorParamsSeparator) { editorParamsSeparator.classList.toggle('hidden', action !== 'separator'); editorParamsSeparator.style.display = action === 'separator' ? '' : 'none'; }
    if (editorParamsBranch) { editorParamsBranch.classList.toggle('hidden', action !== 'branch'); editorParamsBranch.style.display = action === 'branch' ? '' : 'none'; if (action === 'branch') populateEditorBranchSelects(); }
    if (editorParamsAssert) { editorParamsAssert.classList.toggle('hidden', action !== 'assert'); editorParamsAssert.style.display = action === 'assert' ? '' : 'none'; }
    if (editorParamsNavigate) { editorParamsNavigate.classList.toggle('hidden', action !== 'navigate'); editorParamsNavigate.style.display = action === 'navigate' ? '' : 'none'; }
    const hideEditorWaitForLoad = action === 'separator' || action === 'wait' || action === 'branch' || action === 'navigate';
    if (editorParamsWaitForLoad) { editorParamsWaitForLoad.classList.toggle('hidden', hideEditorWaitForLoad); editorParamsWaitForLoad.style.display = hideEditorWaitForLoad ? 'none' : ''; }
    const xpathRow = editorDetail?.querySelector('.form-row:first-child');
    if (xpathRow) xpathRow.style.display = (action === 'separator' || action === 'navigate') ? 'none' : '';
}

function renderEditorSeparatorColors(selected) {
    if (!editorSeparatorColors) return;
    editorSeparatorColors.innerHTML = SEPARATOR_COLORS.map((c) =>
        `<button type="button" class="separator-color-btn ${c === selected ? 'selected' : ''}" data-color="${escapeHtml(c)}" style="background:${c}"></button>`
    ).join('');
    editorSeparatorColors.querySelectorAll('.separator-color-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            editorSeparatorColors.querySelectorAll('.separator-color-btn').forEach((b) => b.classList.remove('selected'));
            btn.classList.add('selected');
        });
    });
}

function applyEditorStep() {
    const step = executionList.find((s) => s.id === selectedEditorStepId);
    if (!step) return;
    const action = editorAction.value;
    step.xpath = action === 'separator' ? '—' : (action === 'navigate' ? '—' : (editorXpath.value || '').trim());
    step.action = action;
    step.params = step.params || {};
    if (action === 'input') step.params.value = editorInputValue.value;
    if (action === 'wait') step.params.delayMs = Math.max(0, parseInt(editorWaitMs.value, 10) || 500);
    if (action === 'file_upload') {
        step.params.fileName = editorFileName.value.trim() || 'file';
        if (editorFileBase64) step.params.fileContentBase64 = editorFileBase64;
    }
    if (action === 'separator') {
        step.params.label = (editorSeparatorLabel.value || '').trim();
        step.params.color = editorSeparatorColors?.querySelector('.separator-color-btn.selected')?.dataset.color || SEPARATOR_COLORS[0];
    }
    if (action === 'assert') {
        step.params.condition = editorAssertCondition?.value || 'element_exists';
        step.params.expectedValue = (editorAssertExpected?.value || '').trim();
    }
    if (action === 'navigate') step.params.url = (editorNavigateUrl?.value || '').trim();
    if (action === 'branch') {
        step.params.condition = editorBranchCondition?.value || 'element_exists';
        step.params.expectedValue = (editorBranchExpected?.value || '').trim();
        if (editorBranchNextId?.value) step.params.nextId = editorBranchNextId.value;
        else delete step.params.nextId;
        if (editorBranchNextElseId?.value) step.params.nextElseId = editorBranchNextElseId.value;
        else delete step.params.nextElseId;
    }
    const toVal = parseInt(editorTimeoutMs?.value, 10);
    if (toVal > 0) step.params.timeoutMs = toVal;
    else delete step.params.timeoutMs;
    step.params.mandatory = editorMandatory?.checked !== false;
    if (editorRetryOnError?.checked) step.params.retryOnError = true;
    else delete step.params.retryOnError;
    step.params.waitForLoad = !!editorWaitForLoad?.checked;
    saveExecutionList();
    renderEditorStepList();
    renderExecutionList();
}

function highlightElementOnPage(xpath) {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (!tab?.id) return;
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (xp) => {
                try {
                    const r = document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                    const el = r.singleNodeValue;
                    if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        const orig = el.style.outline;
                        el.style.outline = '3px solid #00d4aa';
                        setTimeout(() => { el.style.outline = orig; }, 2000);
                    }
                } catch (_) {}
            },
            args: [xpath]
        });
    });
}

// ——— Execution list: load, save, render ———
function loadExecutionList() {
    chrome.storage.local.get([STORAGE_KEY_EXECUTION_LIST, STORAGE_KEY_SCENARIOS], (data) => {
        executionList = Array.isArray(data[STORAGE_KEY_EXECUTION_LIST]) ? data[STORAGE_KEY_EXECUTION_LIST] : [];
        scenarios = Array.isArray(data[STORAGE_KEY_SCENARIOS]) ? data[STORAGE_KEY_SCENARIOS] : [];
        renderScenarioSelect();
        renderExecutionList();
        renderEditorStepList();
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
            (ACTION_LABELS[s.action] || '').toLowerCase().includes(searchQ) ||
            (s.action === 'separator' && 'разделитель'.includes(searchQ)))
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
        li.className = 'execution-item' + (step.id === currentExecutingStepId ? ' current' : '') + (step.action === 'separator' ? ' execution-item-separator' : '');
        li.dataset.stepId = step.id;
        if (step.action === 'separator') {
            const color = step.params?.color || SEPARATOR_COLORS[0];
            const label = (step.params?.label || '').trim();
            li.innerHTML = `
                <div class="execution-separator-wrap">
                    <div class="execution-separator-line" style="--sep-color: ${escapeHtml(color)}">
                        ${label ? `<span class="execution-separator-label" style="color: ${escapeHtml(color)}">${escapeHtml(label)}</span>` : ''}
                    </div>
                    <div class="execution-item-actions execution-separator-actions">
                        <button type="button" class="btn-icon btn-edit-step" data-id="${escapeHtml(step.id)}" title="Редактировать цвет">✏</button>
                        <button type="button" class="btn-icon btn-delete-step" data-id="${escapeHtml(step.id)}" title="Удалить">🗑</button>
                        <button type="button" class="btn-icon btn-move-up" data-idx="${actualIdx}" title="Вверх" ${actualIdx === 0 ? 'disabled' : ''}>↑</button>
                        <button type="button" class="btn-icon btn-move-down" data-idx="${actualIdx}" title="Вниз" ${actualIdx === executionList.length - 1 ? 'disabled' : ''}>↓</button>
                    </div>
                </div>
            `;
        } else {
            const s = stepRunStatus[step.id];
            const statusBadge = s?.state
                ? `<span class="execution-item-badge ${s.state === 'ok' ? 'click' : s.state === 'error' ? 'file_upload' : 'wait'}" title="${escapeHtml(s.message || '')}">${escapeHtml(s.state.toUpperCase())}</span>`
                : '';
            let paramsText = '';
            if (step.action === 'input' && step.params?.value) paramsText = `"${escapeHtml(step.params.value.substring(0, 30))}${step.params.value.length > 30 ? '…' : ''}"`;
            else if (step.action === 'wait') paramsText = `${step.params?.delayMs ?? 500} мс`;
            else if (step.action === 'file_upload' && step.params?.fileName) paramsText = step.params.fileContentBase64 ? `📎 ${escapeHtml(step.params.fileName)}` : `📎 ${escapeHtml(step.params.fileName)} (пустой)`;
            else if (step.action === 'branch' || step.action === 'assert') {
                const c = BRANCH_CONDITIONS.find((x) => x.value === step.params?.condition)?.label || step.params?.condition || '?';
                paramsText = step.params?.expectedValue ? `${c}: "${escapeHtml(step.params.expectedValue.substring(0, 15))}…"` : c;
            }
            else if (step.action === 'navigate') paramsText = escapeHtml((step.params?.url || '').substring(0, 40));
            const listDisplayText = step.action === 'navigate' ? (step.params?.url || '—') : step.xpath;
            li.innerHTML = `
                <div class="execution-item-header">
                    ${!searchQ ? `<span class="execution-item-drag" title="Перетащить" aria-label="Перетащить">⋮⋮</span>` : ''}
                    <span class="execution-item-idx">${displayIdx + 1}</span>
                    <span class="execution-item-xpath" title="${escapeHtml(listDisplayText)}">${escapeHtml(truncate(listDisplayText, 50))}</span>
                    <span class="execution-item-badge ${step.action}">${ACTION_LABELS[step.action] || step.action}</span>
                    ${statusBadge}
                </div>
                ${paramsText ? `<div class="execution-item-params">${paramsText}</div>` : ''}
                <div class="execution-item-actions">
                    <button type="button" class="btn-icon btn-run-step" data-id="${escapeHtml(step.id)}" title="Выполнить шаг" aria-label="Выполнить шаг">▶</button>
                    <button type="button" class="btn-icon btn-run-from-step" data-id="${escapeHtml(step.id)}" title="Выполнить с этого шага" aria-label="Выполнить с этого шага">▶▶</button>
                    <button type="button" class="btn-icon btn-clone-step" data-id="${escapeHtml(step.id)}" title="Клонировать">⧉</button>
                    <button type="button" class="btn-icon btn-edit-step" data-id="${escapeHtml(step.id)}" title="Редактировать">✏</button>
                    <button type="button" class="btn-icon btn-delete-step" data-id="${escapeHtml(step.id)}" title="Удалить">🗑</button>
                    <button type="button" class="btn-icon btn-move-up" data-idx="${actualIdx}" title="Вверх" ${actualIdx === 0 ? 'disabled' : ''}>↑</button>
                    <button type="button" class="btn-icon btn-move-down" data-idx="${actualIdx}" title="Вниз" ${actualIdx === executionList.length - 1 ? 'disabled' : ''}>↓</button>
                </div>
            `;
        }
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
    if (tabFlow?.classList.contains('active')) renderFlowCanvas();
}

function renderFlowCanvas() {
    if (!flowCanvas) return;
    flowCanvas.innerHTML = '';
    if (executionList.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'editor-empty';
        empty.style.padding = '24px';
        empty.textContent = 'Нет шагов. Используйте кнопки выше или «+ Вручную» для добавления.';
        flowCanvas.appendChild(empty);
        return;
    }
    const stepsWrap = document.createElement('div');
    stepsWrap.className = 'flow-steps';
    executionList.forEach((step, idx) => {
        const arrow = document.createElement('div');
        arrow.className = 'flow-arrow';
        arrow.title = 'Вставить шаг между карточками';
        arrow.dataset.insertAt = String(idx);
        arrow.innerHTML = '<svg width="12" height="24" viewBox="0 0 12 24"><path d="M6 0 L6 18 L2 14 M6 18 L10 14" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        if (idx > 0) {
            arrow.addEventListener('click', (e) => {
                e.stopPropagation();
                const at = parseInt(arrow.dataset.insertAt, 10);
                showStepModal(null, at);
            });
            stepsWrap.appendChild(arrow);
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'flow-step-wrapper';
        wrapper.dataset.idx = String(idx);

        const card = document.createElement('div');
        card.className = 'flow-card' + (step.action === 'separator' ? ' separator-card' : '') + (step.id === currentExecutingStepId ? ' current' : '');
        card.dataset.stepId = step.id;
        card.dataset.idx = String(idx);
        card.draggable = true;

        if (step.action === 'separator') {
            const color = step.params?.color || SEPARATOR_COLORS[0];
            const label = (step.params?.label || '').trim();
            card.innerHTML = `
                <div class="flow-separator-line" style="--sep-color: ${escapeHtml(color)}"></div>
                ${label ? `<span class="flow-separator-label" style="color: ${escapeHtml(color)}">${escapeHtml(label)}</span>` : ''}
                <div class="flow-card-actions">
                    <button type="button" class="btn-icon btn-edit-step" data-id="${escapeHtml(step.id)}" title="Редактировать">✏</button>
                    <button type="button" class="btn-icon btn-delete-step" data-id="${escapeHtml(step.id)}" title="Удалить">🗑</button>
                    <button type="button" class="btn-icon btn-move-up" data-idx="${idx}" title="Вверх" ${idx === 0 ? 'disabled' : ''}>↑</button>
                    <button type="button" class="btn-icon btn-move-down" data-idx="${idx}" title="Вниз" ${idx === executionList.length - 1 ? 'disabled' : ''}>↓</button>
                </div>
            `;
        } else {
            const s = stepRunStatus[step.id];
            const statusBadge = s?.state ? `<span class="flow-card-badge ${s.state === 'ok' ? 'click' : s.state === 'error' ? 'file_upload' : 'wait'}" title="${escapeHtml(s.message || '')}">${escapeHtml(s.state.toUpperCase())}</span>` : '';
            let paramsText = '';
            if (step.action === 'input' && step.params?.value) paramsText = `"${escapeHtml(step.params.value.substring(0, 25))}${step.params.value.length > 25 ? '…' : ''}"`;
            else if (step.action === 'wait') paramsText = `${step.params?.delayMs ?? 500} мс`;
            else if (step.action === 'file_upload' && step.params?.fileName) paramsText = `📎 ${escapeHtml(step.params.fileName)}`;
            else if (step.action === 'branch' || step.action === 'assert') {
                const c = BRANCH_CONDITIONS.find((x) => x.value === step.params?.condition)?.label || step.params?.condition || '?';
                paramsText = step.params?.expectedValue ? `${c}: "${escapeHtml(step.params.expectedValue.substring(0, 15))}…"` : c;
            }
            else if (step.action === 'navigate') paramsText = escapeHtml((step.params?.url || '').substring(0, 35));
            const displayText = step.action === 'navigate' ? (step.params?.url || '—') : step.xpath;
            card.innerHTML = `
                <div class="flow-card-header">
                    <span class="flow-card-drag" title="Перетащить">⋮⋮</span>
                    <span class="flow-card-idx">${idx + 1}</span>
                    <span class="flow-card-xpath" title="${escapeHtml(displayText)}">${escapeHtml(truncate(displayText, 45))}</span>
                    <span class="flow-card-badge ${step.action}">${ACTION_LABELS[step.action] || step.action}</span>
                    ${statusBadge}
                </div>
                ${paramsText ? `<div class="flow-card-params">${paramsText}</div>` : ''}
                <div class="flow-card-actions">
                    <button type="button" class="btn-icon btn-run-step" data-id="${escapeHtml(step.id)}" title="Выполнить">▶</button>
                    <button type="button" class="btn-icon btn-run-from-step" data-id="${escapeHtml(step.id)}" title="С этого шага">▶▶</button>
                    <button type="button" class="btn-icon btn-clone-step" data-id="${escapeHtml(step.id)}" title="Клонировать">⧉</button>
                    <button type="button" class="btn-icon btn-edit-step" data-id="${escapeHtml(step.id)}" title="Редактировать">✏</button>
                    <button type="button" class="btn-icon btn-delete-step" data-id="${escapeHtml(step.id)}" title="Удалить">🗑</button>
                    <button type="button" class="btn-icon btn-move-up" data-idx="${idx}" title="Вверх" ${idx === 0 ? 'disabled' : ''}>↑</button>
                    <button type="button" class="btn-icon btn-move-down" data-idx="${idx}" title="Вниз" ${idx === executionList.length - 1 ? 'disabled' : ''}>↓</button>
                </div>
            `;
        }

        card.addEventListener('click', (e) => {
            if (e.target.closest('.btn-icon')) return;
            const step = executionList.find((s) => s.id === card.dataset.stepId);
            if (step && step.action !== 'separator') showStepModal(step);
        });
        card.addEventListener('dragstart', onFlowCardDragStart);
        card.addEventListener('dragover', onFlowCardDragOver);
        card.addEventListener('drop', onFlowCardDrop);
        card.addEventListener('dragend', onFlowCardDragEnd);

        wrapper.appendChild(card);
        stepsWrap.appendChild(wrapper);
    });
    const endArrow = document.createElement('div');
    endArrow.className = 'flow-arrow';
    endArrow.title = 'Добавить шаг в конец';
    endArrow.dataset.insertAt = String(executionList.length);
    endArrow.innerHTML = '<svg width="12" height="24" viewBox="0 0 12 24"><path d="M6 0 L6 18 L2 14 M6 18 L10 14" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    endArrow.addEventListener('click', (e) => {
        e.stopPropagation();
        showStepModal(null, executionList.length);
    });
    stepsWrap.appendChild(endArrow);
    flowCanvas.appendChild(stepsWrap);
}

let flowDraggedIdx = null;

function onFlowCardDragStart(e) {
    const card = e.target.closest('.flow-card');
    if (!card || card.dataset.idx === undefined) return;
    flowDraggedIdx = parseInt(card.dataset.idx, 10);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(flowDraggedIdx));
    card.classList.add('dragging');
}

function onFlowCardDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    flowCanvas.querySelectorAll('.flow-card').forEach((el) => el.classList.remove('drag-over'));
    const card = e.target.closest('.flow-card');
    if (card && card.dataset.idx !== undefined) card.classList.add('drag-over');
}

function onFlowCardDrop(e) {
    e.preventDefault();
    flowCanvas.querySelectorAll('.flow-card').forEach((el) => el.classList.remove('drag-over'));
    const card = e.target.closest('.flow-card');
    if (!card || card.dataset.idx === undefined || flowDraggedIdx == null) return;
    const dropIdx = parseInt(card.dataset.idx, 10);
    if (dropIdx === flowDraggedIdx) return;
    const step = executionList[flowDraggedIdx];
    executionList.splice(flowDraggedIdx, 1);
    const newIdx = dropIdx > flowDraggedIdx ? dropIdx - 1 : dropIdx;
    executionList.splice(newIdx, 0, step);
    saveExecutionList();
    renderExecutionList();
}

function onFlowCardDragEnd(e) {
    flowCanvas.querySelectorAll('.flow-card').forEach((el) => el.classList.remove('dragging', 'drag-over'));
    flowDraggedIdx = null;
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

function showStepModal(step, insertAt) {
    editingStepId = step ? step.id : null;
    insertStepAtIndex = insertAt ?? null;
    stepXpath.value = step ? step.xpath : (primaryXpathEl ? primaryXpathEl.textContent : '') || '';
    stepAction.value = step ? step.action : 'click';
    const sepColor = step?.params?.color || SEPARATOR_COLORS[0];
    const sepLabel = step?.params?.label || '';
    if (stepSeparatorLabel) stepSeparatorLabel.value = sepLabel;
    renderSeparatorColorButtons(sepColor);
    stepInputValue.value = (step?.params?.value) || '';
    stepWaitMs.value = (step?.params?.delayMs) ?? 500;
    stepFileName.value = (step?.params?.fileName) || '';
    stepFileBase64 = (step?.params?.fileContentBase64) || null;
    if (stepFileLabel) {
        stepFileLabel.textContent = stepFileBase64 ? 'Файл прикреплён' : '—';
        delete stepFileLabel.dataset.minimalPdf;
    }
    if (stepRetryOnError) stepRetryOnError.checked = !!step?.params?.retryOnError;
    if (stepWaitForLoad) stepWaitForLoad.checked = step?.params?.waitForLoad !== false;
    if (stepMandatory) stepMandatory.checked = step?.params?.mandatory !== false;
    if (stepTimeoutMs) stepTimeoutMs.value = step?.params?.timeoutMs ?? 0;
    if (stepBranchCondition) stepBranchCondition.value = step?.params?.condition || 'element_exists';
    if (stepBranchExpected) stepBranchExpected.value = step?.params?.expectedValue || '';
    if (stepAssertCondition) stepAssertCondition.value = step?.params?.condition || 'element_exists';
    if (stepAssertExpected) stepAssertExpected.value = step?.params?.expectedValue || '';
    if (stepNavigateUrl) stepNavigateUrl.value = step?.params?.url || '';
    toggleStepParams();
    if (step?.action === 'branch') {
        if (stepBranchNextId) stepBranchNextId.value = step?.params?.nextId || '';
        if (stepBranchNextElseId) stepBranchNextElseId.value = step?.params?.nextElseId || '';
    }
    stepModal.classList.remove('hidden');
    stepModal.querySelector('.modal-title').textContent = step ? 'Редактировать шаг' : 'Добавить шаг';
}

function hideStepModal() {
    stepModal.classList.add('hidden');
    editingStepId = null;
    insertStepAtIndex = null;
}

function toggleStepParams() {
    const action = stepAction.value;
    const isSeparator = action === 'separator';
    stepParamsInput.classList.toggle('hidden', action !== 'input');
    stepParamsInput.style.display = action === 'input' ? '' : 'none';
    stepParamsWait.classList.toggle('hidden', action !== 'wait');
    stepParamsWait.style.display = action === 'wait' ? '' : 'none';
    stepParamsBranch.classList.toggle('hidden', action !== 'branch');
    stepParamsBranch.style.display = action === 'branch' ? '' : 'none';
    if (action === 'branch') populateStepNextSelects();
    if (stepParamsAssert) { stepParamsAssert.classList.toggle('hidden', action !== 'assert'); stepParamsAssert.style.display = action === 'assert' ? '' : 'none'; }
    if (stepParamsNavigate) { stepParamsNavigate.classList.toggle('hidden', action !== 'navigate'); stepParamsNavigate.style.display = action === 'navigate' ? '' : 'none'; }
    stepParamsFile.classList.toggle('hidden', action !== 'file_upload');
    stepParamsFile.style.display = action === 'file_upload' ? '' : 'none';
    if (stepParamsSeparator) {
        stepParamsSeparator.classList.toggle('hidden', !isSeparator);
        stepParamsSeparator.style.display = isSeparator ? '' : 'none';
        if (isSeparator) renderSeparatorColorButtons(selectedSeparatorColor);
    }
    const hideWaitForLoad = action === 'separator' || action === 'wait' || action === 'branch' || action === 'navigate';
    if (stepParamsWaitForLoad) {
        stepParamsWaitForLoad.classList.toggle('hidden', hideWaitForLoad);
        stepParamsWaitForLoad.style.display = hideWaitForLoad ? 'none' : '';
    }
    const xpathRow = stepModal?.querySelector('.form-row:first-child');
    if (xpathRow) xpathRow.style.display = (isSeparator || action === 'navigate') ? 'none' : '';
    const hideCommon = isSeparator;
    const commonRow = stepModal?.querySelector('#stepParamsCommon');
    const mandatoryRow = stepModal?.querySelector('#stepParamsMandatory');
    if (commonRow) { commonRow.classList.toggle('hidden', hideCommon); commonRow.style.display = hideCommon ? 'none' : ''; }
    if (mandatoryRow) { mandatoryRow.classList.toggle('hidden', hideCommon); mandatoryRow.style.display = hideCommon ? 'none' : ''; }
}

function populateStepNextSelects() {
    const steps = executionList.filter((s) => s.action !== 'separator');
    const opts = steps.map((s, i) => `<option value="${escapeHtml(s.id)}">${i + 1}. ${escapeHtml(truncate(s.xpath || s.action, 30))}</option>`).join('');
    const def = '<option value="">— Следующий по порядку —</option>';
    if (stepBranchNextId) stepBranchNextId.innerHTML = def + opts;
    if (stepBranchNextElseId) stepBranchNextElseId.innerHTML = def + opts;
}

function populateEditorBranchSelects() {
    const steps = executionList.filter((s) => s.action !== 'separator');
    const opts = steps.map((s, i) => `<option value="${escapeHtml(s.id)}">${i + 1}. ${escapeHtml(truncate(s.xpath || s.action, 30))}</option>`).join('');
    const def = '<option value="">— Следующий по порядку —</option>';
    if (editorBranchNextId) editorBranchNextId.innerHTML = def + opts;
    if (editorBranchNextElseId) editorBranchNextElseId.innerHTML = def + opts;
}

stepAction.addEventListener('change', toggleStepParams);

let selectedSeparatorColor = SEPARATOR_COLORS[0];

function renderSeparatorColorButtons(selected) {
    if (!stepSeparatorColors) return;
    selectedSeparatorColor = selected || selectedSeparatorColor;
    stepSeparatorColors.innerHTML = SEPARATOR_COLORS.map((c) =>
        `<button type="button" class="separator-color-btn ${c === selectedSeparatorColor ? 'selected' : ''}" data-color="${escapeHtml(c)}" style="background:${c}" title="${c}"></button>`
    ).join('');
    stepSeparatorColors.querySelectorAll('.separator-color-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            selectedSeparatorColor = btn.dataset.color;
            renderSeparatorColorButtons(selectedSeparatorColor);
        });
    });
}

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
    const action = stepAction.value;
    const navUrl = (stepNavigateUrl?.value || '').trim();
    let xpath = action === 'separator' ? '—' : (action === 'navigate' ? navUrl : stepXpath.value.trim());
    if (action === 'navigate') {
        if (!navUrl) return;
        xpath = '—';
    } else if (!xpath && action !== 'separator') return;
    const params = {};
    const timeoutVal = parseInt(stepTimeoutMs?.value, 10);
    if (timeoutVal > 0) params.timeoutMs = timeoutVal;
    params.mandatory = stepMandatory?.checked !== false;
    if (action === 'input') params.value = stepInputValue.value;
    if (action === 'wait') params.delayMs = Math.max(0, parseInt(stepWaitMs.value, 10) || 500);
    if (action === 'separator') {
        params.color = selectedSeparatorColor || SEPARATOR_COLORS[0];
        params.label = (stepSeparatorLabel?.value || '').trim();
    }
    if (action === 'file_upload') {
        params.fileName = stepFileName.value.trim() || 'file';
        const hasMinimalPdf = stepFileLabel?.dataset?.minimalPdf === '1';
        const fileB64 = stepFileBase64 || (hasMinimalPdf ? MINIMAL_PDF_BASE64 : null);
        if (fileB64) params.fileContentBase64 = fileB64;
    }
    if (action === 'assert') {
        params.condition = stepAssertCondition?.value || 'element_exists';
        params.expectedValue = (stepAssertExpected?.value || '').trim();
    }
    if (action === 'navigate') params.url = navUrl;
    if (action === 'branch') {
        params.condition = stepBranchCondition?.value || 'element_exists';
        params.expectedValue = (stepBranchExpected?.value || '').trim();
        if (stepBranchNextId?.value) params.nextId = stepBranchNextId.value;
        if (stepBranchNextElseId?.value) params.nextElseId = stepBranchNextElseId.value;
    }
    if (stepRetryOnError?.checked) params.retryOnError = true;
    params.waitForLoad = !!stepWaitForLoad?.checked;
    if (editingStepId) {
        const idx = executionList.findIndex((s) => s.id === editingStepId);
        if (idx !== -1) {
            executionList[idx] = { ...executionList[idx], xpath, action, params };
        }
    } else {
        const newStep = { id: 'step-' + Date.now() + '-' + Math.random().toString(36).slice(2), xpath, action, params };
        if (insertStepAtIndex != null && insertStepAtIndex >= 0 && insertStepAtIndex <= executionList.length) {
            executionList.splice(insertStepAtIndex, 0, newStep);
        } else {
            executionList.push(newStep);
        }
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

    const runFromBtn = e.target.closest('.btn-run-from-step');
    if (runFromBtn) {
        const step = executionList.find((s) => s.id === runFromBtn.dataset.id);
        if (!step || step.action === 'separator') return;
        runExecutionFromStep(step.id);
        return;
    }

    const runBtn = e.target.closest('.btn-run-step');
    if (runBtn) {
        const step = executionList.find((s) => s.id === runBtn.dataset.id);
        if (!step || step.action === 'separator') return;
        currentExecutingStepId = step.id;
        setStepStatus(step.id, 'running', '');
        renderExecutionList();
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
            if (!tab?.id) return;
            if (step.action === 'navigate') {
                const url = (step.params?.url || '').trim();
                if (!url) {
                    setStepStatus(step.id, 'error', 'URL не указан');
                    currentExecutingStepId = null;
                    renderExecutionList();
                    return;
                }
                chrome.tabs.update(tab.id, { url: url.startsWith('http') ? url : 'https://' + url }).then(() => {
                    setStepStatus(step.id, 'ok', '');
                    currentExecutingStepId = null;
                    renderExecutionList();
                }).catch((e) => {
                    setStepStatus(step.id, 'error', e?.message || 'Ошибка перехода');
                    currentExecutingStepId = null;
                    renderExecutionList();
                });
                return;
            }
            chrome.tabs.sendMessage(tab.id, { action: 'executeList', steps: [step], continueOnError: true }).then((resp) => {
                const r = resp?.results?.[0];
                if (r?.ok) setStepStatus(step.id, 'ok', '');
                else setStepStatus(step.id, 'error', r?.error || resp?.error || 'Ошибка');
                currentExecutingStepId = null;
                renderExecutionList();
            }).catch((err) => {
                const msg = getTabErrorMessage(err);
                setStepStatus(step.id, 'error', msg);
                currentExecutingStepId = null;
                renderExecutionList();
                if (isBfcacheError(err)) showBfcacheBanner();
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

if (stopOnErrorEl) {
    chrome.storage.local.get(STORAGE_KEY_STOP_ON_ERROR, (d) => {
        stopOnErrorEl.checked = !!d[STORAGE_KEY_STOP_ON_ERROR];
    });
    stopOnErrorEl.addEventListener('change', () => {
        chrome.storage.local.set({ [STORAGE_KEY_STOP_ON_ERROR]: stopOnErrorEl.checked });
    });
}

if (addSeparatorBtn) {
    addSeparatorBtn.addEventListener('click', () => {
        openListTab();
        showStepModal({ xpath: '—', action: 'separator', params: { color: SEPARATOR_COLORS[0] } });
    });
}

// ——— Flow tab toolbar ———
if (flowAddStepBtn) {
    flowAddStepBtn.addEventListener('click', () => {
        const xpath = (currentResult?.primary?.xpath || (primaryXpathEl && primaryXpathEl.textContent) || '').trim();
        if (!xpath) {
            flowAddStepBtn.textContent = 'Сначала выберите элемент';
            setTimeout(() => { flowAddStepBtn.textContent = '+ Добавить текущий'; }, 2000);
            return;
        }
        showStepModal({ xpath, action: 'click', params: {} });
    });
}
if (flowAddManualBtn) flowAddManualBtn.addEventListener('click', () => showStepModal(null));
if (flowAddSeparatorBtn) {
    flowAddSeparatorBtn.addEventListener('click', () => {
        showStepModal({ xpath: '—', action: 'separator', params: { color: SEPARATOR_COLORS[0] } });
    });
}
if (flowExecuteBtn) flowExecuteBtn.addEventListener('click', () => executeListBtn?.click());
if (flowStopBtn) flowStopBtn.addEventListener('click', () => stopExecuteBtn?.click());
if (flowSaveBtn) {
    flowSaveBtn.addEventListener('click', () => {
        saveExecutionList();
        flowSaveBtn.textContent = '✓ Сохранено';
        setTimeout(() => { flowSaveBtn.textContent = '💾 Сохранить'; }, 1500);
    });
}

// ——— Editor tab handlers ———
if (editorAction) editorAction.addEventListener('change', toggleEditorParams);
if (editorApplyBtn) editorApplyBtn.addEventListener('click', applyEditorStep);
if (editorValidateBtn) editorValidateBtn.addEventListener('click', () => {
    const xpath = editorXpath?.value?.trim();
    if (!xpath) return;
    highlightElementOnPage(xpath);
    editorValidateBtn.textContent = '✓ Подсвечено';
    setTimeout(() => { editorValidateBtn.textContent = 'Проверить'; }, 1500);
});
if (editorTestBtn) editorTestBtn.addEventListener('click', () => {
    const step = executionList.find((s) => s.id === selectedEditorStepId);
    if (!step || step.action === 'separator') return;
    applyEditorStep();
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (!tab?.id) return;
        const stepToRun = executionList.find((s) => s.id === selectedEditorStepId);
        if (!stepToRun) return;
        currentExecutingStepId = stepToRun.id;
        setStepStatus(stepToRun.id, 'running', '');
        renderExecutionList();
        renderEditorStepList();
        chrome.tabs.sendMessage(tab.id, { action: 'executeList', steps: [stepToRun], continueOnError: true }).then((resp) => {
            const r = resp?.results?.[0];
            if (r?.ok) setStepStatus(stepToRun.id, 'ok', '');
            else setStepStatus(stepToRun.id, 'error', r?.error || resp?.error || 'Ошибка');
            currentExecutingStepId = null;
            renderExecutionList();
            renderEditorStepList();
            editorTestBtn.textContent = r?.ok ? '✓ Выполнено' : '✗ Ошибка';
            setTimeout(() => { editorTestBtn.textContent = 'Тест шага'; }, 2000);
        }).catch((err) => {
            const msg = getTabErrorMessage(err);
            setStepStatus(stepToRun.id, 'error', msg);
            currentExecutingStepId = null;
            renderExecutionList();
            renderEditorStepList();
            editorTestBtn.textContent = '✗ Ошибка';
            setTimeout(() => { editorTestBtn.textContent = 'Тест шага'; }, 2000);
            if (isBfcacheError(err)) showBfcacheBanner();
        });
    });
});
if (editorChooseFileBtn) editorChooseFileBtn.addEventListener('click', () => editorFileInput?.click());
if (editorFileInput) editorFileInput.addEventListener('change', () => {
    const file = editorFileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        const b64 = reader.result?.split(',')?.[1] || '';
        const sizeBytes = b64 ? Math.ceil(b64.length * 3 / 4) : 0;
        editorFileBase64 = sizeBytes <= 1024 * 1024 ? b64 : null;
        editorFileLabel.textContent = editorFileBase64 ? file.name : file.name + ' (>1 MB)';
        if (!editorFileName.value.trim()) editorFileName.value = file.name;
    };
    reader.readAsDataURL(file);
    editorFileInput.value = '';
});
if (editorMinimalPdfBtn) editorMinimalPdfBtn.addEventListener('click', () => {
    editorFileBase64 = MINIMAL_PDF_BASE64;
    if (!editorFileName.value.trim()) editorFileName.value = 'test.pdf';
    editorFileLabel.textContent = 'test.pdf (минимальный PDF)';
});

// ——— Export JSON (формат для автотестов) ———
const EXPORT_JSON_VERSION = 1;

function exportToJson() {
    const stepsToExport = executionList.filter((s) => s.action !== 'separator');
    const payload = {
        name: 'XPath Helper — сценарий',
        version: EXPORT_JSON_VERSION,
        exportedAt: new Date().toISOString(),
        steps: stepsToExport.map((s, i) => ({
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
        xpath: typeof s.xpath === 'string' ? s.xpath : (s.action === 'separator' ? '—' : ''),
        action: ['click', 'click_if_exists', 'input', 'file_upload', 'wait', 'assert', 'branch', 'navigate', 'separator'].includes(s.action) ? s.action : 'click',
        params: s.params && typeof s.params === 'object' ? s.params : {}
    })).filter((s) => s.xpath || s.action === 'separator');
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
    const steps = executionList.filter((s) => s.action !== 'separator');
    if (steps.length === 0) {
        if (exportTemplatesBtn) exportTemplatesBtn.textContent = 'Список пуст';
        setTimeout(() => { if (exportTemplatesBtn) exportTemplatesBtn.textContent = '📤 Шаблоны'; }, 2000);
        return;
    }
    const pw = steps.map((s, i) => {
        if (s.action === 'click' || s.action === 'click_if_exists') return s.action === 'click_if_exists'
            ? `  await page.locator('xpath=${s.xpath.replace(/'/g, "\\'")}').click({ timeout: 500 }).catch(() => {});`
            : `  await page.locator('xpath=${s.xpath.replace(/'/g, "\\'")}').click();`;
        if (s.action === 'input') return `  await page.locator('xpath=${s.xpath.replace(/'/g, "\\'")}').fill('${(s.params?.value || '').replace(/'/g, "\\'")}');`;
        if (s.action === 'wait') return `  await page.waitForTimeout(${s.params?.delayMs ?? 500});`;
        if (s.action === 'branch') return `  // branch: ${s.params?.condition || '?'} ${s.params?.expectedValue ? `"${s.params.expectedValue}"` : ''}`;
        if (s.action === 'assert') return `  // assert: ${s.params?.condition || '?'} ${s.params?.expectedValue ? `"${s.params.expectedValue}"` : ''}`;
        if (s.action === 'navigate') return `  await page.goto('${(s.params?.url || '').replace(/'/g, "\\'")}');`;
        if (s.action === 'file_upload') return `  await page.locator('xpath=${s.xpath.replace(/'/g, "\\'")}').setInputFiles({ path: '${(s.params?.fileName || 'file').replace(/'/g, "\\'")}' });`;
        return `  // ${s.action}: ${s.xpath}`;
    }).join('\n');
    const cyp = steps.map((s, i) => {
        if (s.action === 'click' || s.action === 'click_if_exists') return s.action === 'click_if_exists'
            ? `  cy.xpath('${s.xpath.replace(/'/g, "\\'")}').click({ timeout: 500 }).catch(() => {});`
            : `  cy.xpath('${s.xpath.replace(/'/g, "\\'")}').click();`;
        if (s.action === 'input') return `  cy.xpath('${s.xpath.replace(/'/g, "\\'")}').type('${(s.params?.value || '').replace(/'/g, "\\'")}');`;
        if (s.action === 'wait') return `  cy.wait(${s.params?.delayMs ?? 500});`;
        if (s.action === 'branch') return `  // branch: ${s.params?.condition || '?'} ${s.params?.expectedValue ? `"${s.params.expectedValue}"` : ''}`;
        if (s.action === 'assert') return `  // assert: ${s.params?.condition || '?'} ${s.params?.expectedValue ? `"${s.params.expectedValue}"` : ''}`;
        if (s.action === 'navigate') return `  cy.visit('${(s.params?.url || '').replace(/'/g, "\\'")}');`;
        if (s.action === 'file_upload') return `  cy.xpath('${s.xpath.replace(/'/g, "\\'")}').attachFile('${(s.params?.fileName || 'file').replace(/'/g, "\\'")}');`;
        return `  // ${s.action}: ${s.xpath}`;
    }).join('\n');
    const sel = steps.map((s, i) => {
        if (s.action === 'click' || s.action === 'click_if_exists') return s.action === 'click_if_exists'
            ? `  try { driver.findElement(By.xpath("${s.xpath.replace(/"/g, '\\"')}")).click(); } catch (Exception e) {}`
            : `  driver.findElement(By.xpath("${s.xpath.replace(/"/g, '\\"')}")).click();`;
        if (s.action === 'input') return `  driver.findElement(By.xpath("${s.xpath.replace(/"/g, '\\"')}")).sendKeys("${(s.params?.value || '').replace(/"/g, '\\"')}");`;
        if (s.action === 'wait') return `  Thread.sleep(${s.params?.delayMs ?? 500});`;
        if (s.action === 'branch') return `  // branch: ${s.params?.condition || '?'} ${s.params?.expectedValue ? `"${s.params.expectedValue}"` : ''}`;
        if (s.action === 'assert') return `  // assert: ${s.params?.condition || '?'} ${s.params?.expectedValue ? `"${s.params.expectedValue}"` : ''}`;
        if (s.action === 'navigate') return `  driver.get("${(s.params?.url || '').replace(/"/g, '\\"')}");`;
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
        setTimeout(() => { copyLogBtn.textContent = 'Копировать'; }, 1500);
    });
});

const clearLogBtn = $('clearLogBtn');
if (clearLogBtn) clearLogBtn.addEventListener('click', () => {
    if (executionLog) executionLog.textContent = '';
    document.querySelector('.tab[data-tab="log"]')?.classList.remove('log-has-content');
});

if (exportJsonBtn) exportJsonBtn.addEventListener('click', exportToJson);
if (importJsonBtn) importJsonBtn.addEventListener('click', () => importJsonInput.click());
if (importJsonInput) importJsonInput.addEventListener('change', () => {
    const f = importJsonInput.files?.[0];
    if (f) importFromJson(f);
    importJsonInput.value = '';
});

// ——— Execute list ———
function hasBranching() {
    return executionList.some((s) => s.params?.nextId || s.params?.nextElseId);
}

function needsStepByStepExecution() {
    return hasBranching() || executionList.some((s) => s.action === 'navigate') || executionList.some((s) => s.params?.mandatory === false);
}

async function runExecutionWithBranching(tabId, fromStepId) {
    const stepsToRun = executionList.filter((s) => s.action !== 'separator');
    if (stepsToRun.length === 0) return;
    let currentIdx = fromStepId ? executionList.findIndex((s) => s.id === fromStepId) : 0;
    if (currentIdx < 0) currentIdx = 0;
    const continueOnError = !stopOnErrorEl?.checked;
    const stepDelay = Math.max(0, parseInt(stepDelayMsEl?.value, 10) || STEP_DELAY_DEFAULT);
    const selectorTimeout = parseInt(selectorTimeoutMsEl?.value, 10) || 5000;
    let okCount = 0;
    const visited = new Set();
    stopExecutionRequested = false;

    while (currentIdx >= 0 && currentIdx < executionList.length && !stopExecutionRequested) {
        const step = executionList[currentIdx];
        if (step.action === 'separator') {
            currentIdx++;
            continue;
        }
        if (visited.has(step.id)) {
            appendExecutionLog('Предупреждение: цикл в ветвлении, выход');
            break;
        }
        visited.add(step.id);
        setStepStatus(step.id, 'running', '');
        currentExecutingStepId = step.id;
        renderExecutionList();
        if (stepDelay > 0 && okCount > 0) await new Promise((r) => setTimeout(r, stepDelay));
        try {
            if (step.action === 'navigate') {
                const url = (step.params?.url || '').trim();
                if (!url) {
                    setStepStatus(step.id, 'error', 'URL не указан');
                    appendExecutionLog(`✗ ${step.id}: URL не указан`);
                    if (step.params?.mandatory !== false && !continueOnError) break;
                    currentIdx++;
                    continue;
                }
                await new Promise((resolve, reject) => {
                    const listener = (id, info) => {
                        if (id === tabId && info.status === 'complete') {
                            chrome.tabs.onUpdated.removeListener(listener);
                            resolve();
                        }
                    };
                    chrome.tabs.onUpdated.addListener(listener);
                    chrome.tabs.update(tabId, { url: url.startsWith('http') ? url : 'https://' + url }).catch((e) => {
                        chrome.tabs.onUpdated.removeListener(listener);
                        reject(e);
                    });
                    setTimeout(() => {
                        chrome.tabs.onUpdated.removeListener(listener);
                        resolve();
                    }, 30000);
                });
                okCount++;
                setStepStatus(step.id, 'ok', '');
                appendExecutionLog(`✓ ${step.id} → ${url}`);
                currentIdx++;
                continue;
            }
            const resp = await chrome.tabs.sendMessage(tabId, {
                action: 'executeStep',
                step,
                selectorTimeoutMs: step.params?.timeoutMs ?? selectorTimeout
            });
            if (!resp?.ok) {
                setStepStatus(step.id, 'error', resp?.error || 'Ошибка');
                appendExecutionLog(`✗ ${step.id}: ${resp?.error || 'Ошибка'}`);
                const mandatory = step.params?.mandatory !== false;
                if (mandatory && !continueOnError) break;
                currentIdx++;
                continue;
            }
            okCount++;
            setStepStatus(step.id, 'ok', '');
            appendExecutionLog(`✓ ${step.id}`);
            let nextId = null;
            if (step.action === 'branch' && (step.params?.nextId || step.params?.nextElseId)) {
                nextId = resp.conditionResult ? step.params.nextId : step.params.nextElseId;
            }
            if (nextId) {
                const nextIdx = executionList.findIndex((s) => s.id === nextId);
                currentIdx = nextIdx >= 0 ? nextIdx : currentIdx + 1;
            } else {
                currentIdx++;
            }
        } catch (err) {
            const msg = getTabErrorMessage(err);
            setStepStatus(step.id, 'error', msg);
            appendExecutionLog(`✗ ${step.id}: ${msg}`);
            if (isBfcacheError(err)) showBfcacheBanner();
            if (!continueOnError) break;
            currentIdx++;
        }
    }
    currentExecutingStepId = null;
    setExecutionUIRunning(false);
    renderExecutionList();
    appendExecutionLog(stopExecutionRequested ? 'Остановлено' : `Готово: ${okCount} шагов`);
    executeListBtn.textContent = `✓ ${okCount}`;
    setTimeout(() => { executeListBtn.textContent = '▶ Выполнить'; }, 2500);
}

function runExecutionFromStep(fromStepId) {
    const idx = executionList.findIndex((s) => s.id === fromStepId);
    if (idx < 0) return;
    const stepsToRun = executionList.slice(idx).filter((s) => s.action !== 'separator');
    if (stepsToRun.length === 0) return;
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (!tab?.id) return;
        if (needsStepByStepExecution()) {
            if (executionLog) executionLog.textContent = '';
            setExecutionUIRunning(true);
            runExecutionWithBranching(tab.id, fromStepId);
            return;
        }
        const continueOnError = !stopOnErrorEl?.checked;
        const stepDelay = Math.max(0, parseInt(stepDelayMsEl?.value, 10) || STEP_DELAY_DEFAULT);
        if (executionLog) executionLog.textContent = '';
        appendExecutionLog(`Старт с шага ${idx + 1}: ${stepsToRun.length} шагов`);
        stepsToRun.forEach((s) => setStepStatus(s.id, 'running', ''));
        currentExecutingStepId = stepsToRun[0]?.id || null;
        setExecutionUIRunning(true);
        renderExecutionList();
        chrome.tabs.sendMessage(tab.id, {
            action: 'executeList',
            steps: stepsToRun,
            continueOnError,
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
            appendExecutionLog(`Готово: ${okCount}/${stepsToRun.length}`);
            renderExecutionList();
            setExecutionUIRunning(false);
            executeListBtn.textContent = `✓ ${okCount}/${stepsToRun.length}`;
            setTimeout(() => { executeListBtn.textContent = '▶ Выполнить'; }, 2500);
        }).catch((err) => {
            const msg = getTabErrorMessage(err);
            appendExecutionLog(`Ошибка: ${msg}`);
            setExecutionUIRunning(false);
            executeListBtn.textContent = 'Ошибка: ' + msg.substring(0, 30);
            setTimeout(() => { executeListBtn.textContent = '▶ Выполнить'; }, 3000);
            if (isBfcacheError(err)) showBfcacheBanner();
        });
    });
}

function appendExecutionLog(line) {
    if (!executionLog) return;
    const t = new Date().toLocaleTimeString('ru-RU', { hour12: false });
    executionLog.textContent += `[${t}] ${line}\n`;
    executionLog.scrollTop = executionLog.scrollHeight;
    const logTab = document.querySelector('.tab[data-tab="log"]');
    if (logTab && !logTab.classList.contains('log-has-content')) {
        logTab.classList.add('log-has-content');
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
        const stepsToRun = executionList.filter((s) => s.action !== 'separator');
        if (stepsToRun.length === 0) {
            executeListBtn.textContent = 'Нет шагов для выполнения';
            setTimeout(() => { executeListBtn.textContent = '▶ Выполнить'; }, 2000);
            return;
        }
        if (needsStepByStepExecution()) {
            if (executionLog) executionLog.textContent = '';
            appendExecutionLog(`Старт (пошагово): ${stepsToRun.length} шагов`);
            setExecutionUIRunning(true);
            runExecutionWithBranching(tab.id, null);
            return;
        }
        const continueOnError = !stopOnErrorEl?.checked;
        const stepDelay = Math.max(0, parseInt(stepDelayMsEl?.value, 10) || STEP_DELAY_DEFAULT);
        if (executionLog) executionLog.textContent = '';
        appendExecutionLog(`Старт: ${stepsToRun.length} шагов`);
        stepsToRun.forEach((s) => setStepStatus(s.id, 'running', ''));
        currentExecutingStepId = stepsToRun[0]?.id || null;
        setExecutionUIRunning(true);
        renderExecutionList();
        chrome.tabs.sendMessage(tab.id, {
            action: 'executeList',
            steps: stepsToRun,
            continueOnError,
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
            appendExecutionLog(`Готово: ${okCount}/${stepsToRun.length}`);
            renderExecutionList();
            setExecutionUIRunning(false);
            executeListBtn.textContent = `✓ ${okCount}/${stepsToRun.length}`;
            setTimeout(() => { executeListBtn.textContent = '▶ Выполнить'; }, 2500);
        }).catch((err) => {
            const msg = getTabErrorMessage(err);
            appendExecutionLog(`Ошибка: ${msg}`);
            setExecutionUIRunning(false);
            executeListBtn.textContent = 'Ошибка: ' + msg.substring(0, 30);
            setTimeout(() => { executeListBtn.textContent = '▶ Выполнить'; }, 3000);
            if (isBfcacheError(err)) showBfcacheBanner();
        });
    });
});

if (stopExecuteBtn) {
    stopExecuteBtn.addEventListener('click', () => {
        stopExecutionRequested = true;
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
            if (tab?.id) chrome.tabs.sendMessage(tab.id, { action: 'stopExecution' });
            setExecutionUIRunning(false);
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

function reloadActiveTab() {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (tab?.id) chrome.tabs.reload(tab.id);
    });
}
if (reloadTabBtn) reloadTabBtn.addEventListener('click', reloadActiveTab);
const reloadTabBtnBfcache = $('reloadTabBtnBfcache');
if (reloadTabBtnBfcache) {
    reloadTabBtnBfcache.addEventListener('click', () => {
        reloadActiveTab();
        hide($('bfcacheBanner'));
    });
}

console.log('[SidePanel] Ready');
