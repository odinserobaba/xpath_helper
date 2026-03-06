// sidepanel/sidepanel.js
console.log('[SidePanel] Loaded');

const STORAGE_KEY_DEBOUNCE = 'xpath-helper-debounce-ms';
const STORAGE_KEY_EXECUTION_LIST = 'xpath-helper-execution-list';
const STORAGE_KEY_SELECTOR_TIMEOUT = 'xpath-helper-selector-timeout-ms';
const DEBOUNCE_DEFAULT = 120;
const SELECTOR_TIMEOUT_DEFAULT = 5000;

const ACTION_LABELS = { click: 'Клик', input: 'Ввод', file_upload: 'Файл', wait: 'Пауза' };

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
const stepFileLabel = $('stepFileLabel');
const stepFileInput = $('stepFileInput');
const stepModalCancel = $('stepModalCancel');
const stepModalSave = $('stepModalSave');
const exportJsonBtn = $('exportJsonBtn');
const importJsonBtn = $('importJsonBtn');
const importJsonInput = $('importJsonInput');

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

    if (result.nonUniqueOnly?.length > 0) {
        nonUniqueCountEl.textContent = `(${result.nonUniqueOnly.length})`;
        nonUniqueListEl.innerHTML = result.nonUniqueOnly.map((x, i) => renderXpathItem(x, i + 1, false)).join('');
        show(nonUniqueSectionEl);
    } else {
        hide(nonUniqueSectionEl);
    }
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

// ——— Delegated click: copy, highlight ———
document.addEventListener('click', (e) => {
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
    chrome.storage.local.get(STORAGE_KEY_EXECUTION_LIST, (data) => {
        executionList = Array.isArray(data[STORAGE_KEY_EXECUTION_LIST]) ? data[STORAGE_KEY_EXECUTION_LIST] : [];
        renderExecutionList();
    });
}

function saveExecutionList() {
    chrome.storage.local.set({ [STORAGE_KEY_EXECUTION_LIST]: executionList });
}

function renderExecutionList() {
    executionListEl.innerHTML = '';
    if (executionList.length === 0) {
        listHint.classList.remove('hidden');
        listHint.style.display = '';
        return;
    }
    listHint.classList.add('hidden');
    listHint.style.display = 'none';
    executionList.forEach((step, i) => {
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
                <span class="execution-item-idx">${i + 1}</span>
                <span class="execution-item-xpath" title="${escapeHtml(step.xpath)}">${escapeHtml(truncate(step.xpath, 50))}</span>
                <span class="execution-item-badge ${step.action}">${ACTION_LABELS[step.action] || step.action}</span>
                ${statusBadge}
            </div>
            ${paramsText ? `<div class="execution-item-params">${paramsText}</div>` : ''}
            <div class="execution-item-actions">
                <button type="button" class="btn-icon btn-run-step" data-id="${escapeHtml(step.id)}" title="Выполнить шаг" aria-label="Выполнить шаг">▶</button>
                <button type="button" class="btn-icon btn-edit-step" data-id="${escapeHtml(step.id)}" title="Редактировать">✏</button>
                <button type="button" class="btn-icon btn-delete-step" data-id="${escapeHtml(step.id)}" title="Удалить">🗑</button>
                <button type="button" class="btn-icon btn-move-up" data-idx="${i}" title="Вверх" ${i === 0 ? 'disabled' : ''}>↑</button>
                <button type="button" class="btn-icon btn-move-down" data-idx="${i}" title="Вниз" ${i === executionList.length - 1 ? 'disabled' : ''}>↓</button>
            </div>
        `;
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
    stepFileLabel.textContent = stepFileBase64 ? 'Файл прикреплён' : '—';
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
        stepFileBase64 = b64;
        stepFileLabel.textContent = file.name;
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
        if (stepFileBase64) params.fileContentBase64 = stepFileBase64;
    }
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

function importFromJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const data = JSON.parse(reader.result);
            let raw = Array.isArray(data) ? data : (data?.steps || []);
            if (raw.length && raw.some((s) => s.step != null)) {
                raw = [...raw].sort((a, b) => (Number(a.step) || 0) - (Number(b.step) || 0));
            }
            executionList = raw.map((s, i) => ({
                id: 'step-' + Date.now() + '-' + i + '-' + Math.random().toString(36).slice(2),
                xpath: typeof s.xpath === 'string' ? s.xpath : '',
                action: ['click', 'input', 'file_upload', 'wait'].includes(s.action) ? s.action : 'click',
                params: s.params && typeof s.params === 'object' ? s.params : {}
            })).filter((s) => s.xpath);
            saveExecutionList();
            renderExecutionList();
            importJsonBtn.textContent = '✓ Загружено ' + executionList.length;
            setTimeout(() => { importJsonBtn.textContent = '📥 Загрузить шаги'; }, 2000);
        } catch (e) {
            importJsonBtn.textContent = 'Ошибка JSON';
            setTimeout(() => { importJsonBtn.textContent = '📥 Загрузить шаги'; }, 2000);
        }
    };
    reader.readAsText(file, 'UTF-8');
}

if (exportJsonBtn) exportJsonBtn.addEventListener('click', exportToJson);
if (importJsonBtn) importJsonBtn.addEventListener('click', () => importJsonInput.click());
if (importJsonInput) importJsonInput.addEventListener('change', () => {
    const f = importJsonInput.files?.[0];
    if (f) importFromJson(f);
    importJsonInput.value = '';
});

// ——— Execute list ———
executeListBtn.addEventListener('click', () => {
    if (executionList.length === 0) {
        executeListBtn.textContent = 'Список пуст';
        setTimeout(() => { executeListBtn.textContent = '▶ Выполнить'; }, 2000);
        return;
    }
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (!tab?.id) return;
        executionList.forEach((s) => setStepStatus(s.id, 'running', ''));
        currentExecutingStepId = executionList[0]?.id || null;
        renderExecutionList();
        chrome.tabs.sendMessage(tab.id, { action: 'executeList', steps: executionList, continueOnError: true }).then((resp) => {
            const results = resp?.results || [];
            let okCount = 0;
            results.forEach((r) => {
                if (!r?.id) return;
                if (r.ok) {
                    okCount++;
                    setStepStatus(r.id, 'ok', '');
                } else {
                    setStepStatus(r.id, 'error', r.error || 'Ошибка');
                }
            });
            renderExecutionList();
            executeListBtn.textContent = `✓ ${okCount}/${executionList.length}`;
            setTimeout(() => { executeListBtn.textContent = '▶ Выполнить'; }, 2500);
        }).catch((err) => {
            executeListBtn.textContent = 'Ошибка: ' + (err?.message || 'нет связи');
            setTimeout(() => { executeListBtn.textContent = '▶ Выполнить'; }, 3000);
        });
    });
});

loadExecutionList();

chrome.runtime.sendMessage({ action: 'ping' }, () => {
    if (chrome.runtime.lastError) {
        statusEl.textContent = 'Error: ' + chrome.runtime.lastError.message;
    } else {
        statusEl.textContent = 'Готов. Зажмите Ctrl или Alt+X, наведите на элемент.';
    }
});

console.log('[SidePanel] Ready');
