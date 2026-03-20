// sidepanel/sidepanel.js
console.log('[SidePanel] Loaded');

const STORAGE_KEY_DEBOUNCE = 'xpath-helper-debounce-ms';
const STORAGE_KEY_EXECUTION_LIST = 'xpath-helper-execution-list';
const STORAGE_KEY_SELECTOR_TIMEOUT = 'xpath-helper-selector-timeout-ms';
const STORAGE_KEY_STEP_DELAY = 'xpath-helper-step-delay-ms';
const STORAGE_KEY_WAIT_READY_MS = 'xpath-helper-wait-ready-ms';
const STORAGE_KEY_WAIT_NETWORK_QUIET_MS = 'xpath-helper-wait-network-quiet-ms';
const STORAGE_KEY_WAIT_NETWORK_TIMEOUT_MS = 'xpath-helper-wait-network-timeout-ms';
const STORAGE_KEY_WAIT_DOM_QUIET_MS = 'xpath-helper-wait-dom-quiet-ms';
const STORAGE_KEY_WAIT_DOM_TIMEOUT_MS = 'xpath-helper-wait-dom-timeout-ms';
const STORAGE_KEY_WAIT_POST_ACTION_MS = 'xpath-helper-wait-post-action-ms';
const WAIT_READY_DEFAULT = 80;
const WAIT_NETWORK_QUIET_DEFAULT = 150;
const WAIT_NETWORK_TIMEOUT_DEFAULT = 2500;
const WAIT_DOM_QUIET_DEFAULT = 100;
const WAIT_DOM_TIMEOUT_DEFAULT = 1500;
const WAIT_POST_ACTION_DEFAULT = 50;
const STORAGE_KEY_ONLY_UNIQUE = 'xpath-helper-only-unique';
const STORAGE_KEY_SCENARIOS = 'xpath-helper-scenarios';
const STORAGE_KEY_HISTORY = 'xpath-helper-element-history';
const STORAGE_KEY_STOP_ON_ERROR = 'xpath-helper-stop-on-error';
const STORAGE_KEY_VARIABLES = 'xpath-helper-variables';
const STORAGE_KEY_ENVIRONMENTS = 'xpath-helper-environments';
const STORAGE_KEY_CURRENT_ENV = 'xpath-helper-current-env';
const STORAGE_KEY_REPORT_PATH = 'xpath-helper-report-path';
const STORAGE_KEY_DATA_ROWS = 'xpath-helper-data-rows';
const STORAGE_KEY_PYTHON_SETTINGS = 'xpath-helper-python-settings';
const STORAGE_KEY_RUNNER_URL = 'xpath-helper-runner-url';
const STORAGE_KEY_RUNNER_TOKEN = 'xpath-helper-runner-token';
const RUNNER_DEFAULT_URL = 'http://127.0.0.1:8000';
const PYTHON_DEFAULTS = {
    executablePath: '/opt/chromium-gost/chromium-gost',
    userDataDir: '/home/nuanred/.config/chromium',
    debugPort: 9222,
    headless: false
};
const DEBOUNCE_DEFAULT = 120;
const SELECTOR_TIMEOUT_DEFAULT = 5000;
const STEP_DELAY_DEFAULT = 100;
const MAX_HISTORY = 8;
const MAX_STEPS_WARNING = 100;
const MAX_FILE_SIZE_B64 = 1024 * 1024 * 4 / 3;

const ACTION_LABELS = { start: 'Начало', end: 'Конец', click: 'Клик', input: 'Ввод', set_date: 'Дата', file_upload: 'Файл', wait: 'Пауза', separator: '—', click_if_exists: 'Клик если есть', branch: 'Ветвление', assert: 'Assert', navigate: 'Переход', user_action: 'Действие пользователя', wait_for_element: 'Ждать элемент' };
const BRANCH_CONDITIONS = [
    { value: 'element_exists', label: 'Элемент есть' },
    { value: 'text_equals', label: 'Текст равен' },
    { value: 'text_contains', label: 'Текст содержит' },
    { value: 'url_equals', label: 'URL равен' },
    { value: 'url_contains', label: 'URL содержит' },
    { value: 'url_matches', label: 'URL совпадает (regex)' },
    { value: 'attribute_equals', label: 'Атрибут равен' },
    { value: 'count_equals', label: 'Количество элементов' }
];
const SEPARATOR_COLORS = ['#00d4aa', '#667eea', '#f39c12', '#e74c3c', '#9b59b6', '#3498db', '#2ecc71', '#e91e63'];
const STEP_COLORS = ['#ff1744', '#ff9100', '#ffd600', '#76ff03', '#00e676', '#1de9b6', '#00b0ff', '#651fff', '#d500f9', '#ff4081'];

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
const primaryLinkedHint = $('primaryLinkedHint');
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
const flowAddUserActionBtn = $('flowAddUserActionBtn');
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
const editorStepColorRow = $('editorStepColorRow');
const editorStepColorColors = $('editorStepColorColors');
const editorParamsInput = $('editorParamsInput');
const editorParamsSetDate = $('editorParamsSetDate');
const editorDateValue = $('editorDateValue');
const editorParamsWait = $('editorParamsWait');
const editorParamsUserAction = $('editorParamsUserAction');
const editorUserActionMessage = $('editorUserActionMessage');
const editorParamsFile = $('editorParamsFile');
const editorParamsSeparator = $('editorParamsSeparator');
const editorParamsBranch = $('editorParamsBranch');
const editorParamsAssert = $('editorParamsAssert');
const editorParamsNavigate = $('editorParamsNavigate');
const editorAssertCondition = $('editorAssertCondition');
const editorAssertExpected = $('editorAssertExpected');
const editorAssertAttributeName = $('editorAssertAttributeName');
const editorAssertWaitMode = $('editorAssertWaitMode');
const editorAssertSoft = $('editorAssertSoft');
const editorNavigateUrl = $('editorNavigateUrl');
const editorTimeoutMs = $('editorTimeoutMs');
const editorMandatory = $('editorMandatory');
const editorBranchCondition = $('editorBranchCondition');
const editorBranchExpected = $('editorBranchExpected');
const editorBranchAttributeName = $('editorBranchAttributeName');
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
const addUserActionBtn = $('addUserActionBtn');
const stopOnErrorEl = $('stopOnError');
const stepParamsSeparator = $('stepParamsSeparator');
const stepParamsWaitForLoad = $('stepParamsWaitForLoad');
const stepSeparatorLabel = $('stepSeparatorLabel');
const stepSeparatorColors = $('stepSeparatorColors');
const stepColorRow = $('stepColorRow');
const stepColorColors = $('stepColorColors');
const executeListBtn = $('executeListBtn');
const saveListBtn = $('saveListBtn');
const listHint = $('listHint');
const executionListEl = $('executionList');
const stepModal = $('stepModal');
const stepXpath = $('stepXpath');
const stepAction = $('stepAction');
const stepParamsInput = $('stepParamsInput');
const stepInputValue = $('stepInputValue');
const stepParamsSetDate = $('stepParamsSetDate');
const stepDateValue = $('stepDateValue');
const stepParamsWait = $('stepParamsWait');
const stepParamsUserAction = $('stepParamsUserAction');
const stepUserActionMessage = $('stepUserActionMessage');
const stepParamsBranch = $('stepParamsBranch');
const stepParamsAssert = $('stepParamsAssert');
const stepParamsNavigate = $('stepParamsNavigate');
const stepTimeoutMs = $('stepTimeoutMs');
const stepMandatory = $('stepMandatory');
const stepAssertCondition = $('stepAssertCondition');
const stepAssertExpected = $('stepAssertExpected');
const stepAssertAttributeName = $('stepAssertAttributeName');
const stepAssertWaitMode = $('stepAssertWaitMode');
const stepAssertSoft = $('stepAssertSoft');
const stepNavigateUrl = $('stepNavigateUrl');
const stepWaitMs = $('stepWaitMs');
const stepBranchCondition = $('stepBranchCondition');
const stepBranchExpected = $('stepBranchExpected');
const stepBranchAttributeName = $('stepBranchAttributeName');
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
const stepModalSaveAddAssert = $('stepModalSaveAddAssert');
const exportJsonBtn = $('exportJsonBtn');
const exportTemplatesBtn = $('exportTemplatesBtn');
const exportPythonPlaywrightBtn = $('exportPythonPlaywrightBtn');
const exportPomTemplateBtn = $('exportPomTemplateBtn');
const importJsonBtn = $('importJsonBtn');
const importJsonInput = $('importJsonInput');
const saveToLocalBtn = $('saveToLocalBtn');
const clearStepsBtn = $('clearStepsBtn');
const stepTitle = $('stepTitle');
const stepTags = $('stepTags');
const scenarioName = $('scenarioName');
const scenarioSelect = $('scenarioSelect');
const listSearch = $('listSearch');
const stopExecuteBtn = $('stopExecuteBtn');
const healthCheckBtn = $('healthCheckBtn');
const executionLog = $('executionLog');
const copyLogBtn = $('copyLogBtn');
const exportReportBtn = $('exportReportBtn');
const reportPathInput = $('reportPathInput');
const importDataBtn = $('importDataBtn');
const importDataInput = $('importDataInput');
const executeDataDrivenBtn = $('executeDataDrivenBtn');
const pythonSettingsBtn = $('pythonSettingsBtn');
const pythonSettingsModal = $('pythonSettingsModal');
const pythonExecutablePath = $('pythonExecutablePath');
const pythonUserDataDir = $('pythonUserDataDir');
const pythonDebugPort = $('pythonDebugPort');
const pythonHeadless = $('pythonHeadless');
const pythonSettingsSave = $('pythonSettingsSave');
const pythonSettingsCancel = $('pythonSettingsCancel');
const historySection = $('historySection');
const historyList = $('historyList');
const historyCount = $('historyCount');
const clearHistoryBtn = $('clearHistoryBtn');
const copyAllXpathBtn = $('copyAllXpath');
const onlyUniqueMode = $('onlyUniqueMode');
const stepDelayMsEl = $('stepDelayMs');
const waitReadyMsEl = $('waitReadyMs');
const waitNetworkQuietMsEl = $('waitNetworkQuietMs');
const waitNetworkTimeoutMsEl = $('waitNetworkTimeoutMs');
const waitDomQuietMsEl = $('waitDomQuietMs');
const waitDomTimeoutMsEl = $('waitDomTimeoutMs');
const waitPostActionMsEl = $('waitPostActionMs');
const stepRetryOnError = $('stepRetryOnError');
const stepRetryCount = $('stepRetryCount');
const stepRetryDelayMs = $('stepRetryDelayMs');
const stepWaitForLoad = $('stepWaitForLoad');
const importModal = $('importModal');
const importPreview = $('importPreview');
const importReplace = $('importReplace');
const importAppend = $('importAppend');
const importCancel = $('importCancel');
const contextInvalidatedBanner = $('contextInvalidatedBanner');
const reloadTabBtn = $('reloadTabBtn');
const envSelect = $('envSelect');
const envEditBtn = $('envEditBtn');
const envModal = $('envModal');
const envVarsEditor = $('envVarsEditor');
const envAddVarBtn = $('envAddVarBtn');
const envModalSave = $('envModalSave');
const envModalCancel = $('envModalCancel');

let environments = { dev: { baseUrl: '' }, stage: { baseUrl: '' }, prod: { baseUrl: '' } };
let currentEnv = '';
let runnerBaseUrl = RUNNER_DEFAULT_URL;
let runnerToken = '';
let lastHoveredElement = null;

function runnerFetch(path, options = {}) {
    const base = (runnerBaseUrl || RUNNER_DEFAULT_URL).replace(/\/+$/, '');
    const url = base + path;
    const headers = { ...(options.headers || {}) };
    if (!headers['Content-Type'] && options.body && typeof options.body === 'string') headers['Content-Type'] = 'application/json';
    if (runnerToken) headers['x-runner-token'] = runnerToken;
    return fetch(url, { ...options, headers });
}

function logEvent(level, event, data) {
    // Best-effort logging to localhost runner. Never fail UI.
    try {
        runnerFetch('/api/logs', {
            method: 'POST',
            body: JSON.stringify({ level, event, data: maskSecrets(data) })
        }).catch(() => {});
    } catch (_) {}
}

function maskSecrets(obj) {
    const secretKeys = ['password', 'passwd', 'pwd', 'token', 'secret', 'authorization', 'auth'];
    if (obj == null) return obj;
    if (Array.isArray(obj)) return obj.map(maskSecrets);
    if (typeof obj === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(obj)) {
            const ks = String(k).toLowerCase();
            if (secretKeys.some((sk) => ks.includes(sk)) && v != null && v !== '' && !(Array.isArray(v) && v.length === 0)) {
                out[k] = '***';
            } else {
                out[k] = maskSecrets(v);
            }
        }
        return out;
    }
    return obj;
}

function maskSecretsInText(s) {
    if (!s || typeof s !== 'string') return s;
    return s
        .replace(/(password|passwd|pwd|token|secret|authorization)\s*[:=]\s*([^\s,;]+)/gi, '$1=***')
        .replace(/(\"(password|passwd|pwd|token|secret|authorization)\"\\s*:\\s*\")([^\"]+)(\")/gi, '$1***$4');
}

function parseTags(text) {
    return (text || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 12);
}

function suggestStepTitle(el) {
    if (!el) return '';
    const attrs = Array.isArray(el.attributes) ? el.attributes : [];
    const getAttr = (name) => attrs.find((a) => String(a.name).toLowerCase() === name)?.value || '';
    const aria = (getAttr('aria-label') || '').trim();
    const placeholder = (getAttr('placeholder') || '').trim();
    const title = (getAttr('title') || '').trim();
    const value = (getAttr('value') || '').trim();
    const text = (el.text || '').trim();
    return aria || placeholder || title || text || value || (el.id ? `#${el.id}` : '') || (el.tagName ? `<${el.tagName}>` : '');
}

function suggestFallbackXPaths(el) {
    if (!el) return [];
    const attrs = Array.isArray(el.attributes) ? el.attributes : [];
    const getAttr = (name) => attrs.find((a) => String(a.name).toLowerCase() === name)?.value || '';
    const candidates = [];
    const testId = (getAttr('data-testid') || getAttr('data-test-id') || getAttr('data-test') || '').trim();
    const aria = (getAttr('aria-label') || '').trim();
    const placeholder = (getAttr('placeholder') || '').trim();
    const name = (getAttr('name') || '').trim();
    const role = (getAttr('role') || '').trim();
    const text = (el.text || '').trim();
    const tag = (el.tagName || '').toLowerCase();

    const esc1 = (s) => String(s).replace(/'/g, "\\'");

    if (testId) candidates.push(`//*[@data-testid='${esc1(testId)}']`);
    if (aria) candidates.push(`//*[@aria-label='${esc1(aria)}']`);
    if (placeholder) candidates.push(`//*[@placeholder='${esc1(placeholder)}']`);
    if (name) candidates.push(`//*[@name='${esc1(name)}']`);
    if (role && aria) candidates.push(`//*[@role='${esc1(role)}' and @aria-label='${esc1(aria)}']`);
    if (tag && aria) candidates.push(`//${tag}[@aria-label='${esc1(aria)}']`);
    if (tag && placeholder) candidates.push(`//${tag}[@placeholder='${esc1(placeholder)}']`);
    if (text && text.length <= 40) candidates.push(`//*[normalize-space()='${esc1(text)}']`);
    if (tag && text && text.length <= 40) candidates.push(`//${tag}[normalize-space()='${esc1(text)}']`);

    // Dedup + cap
    const seen = new Set();
    const out = [];
    for (const x of candidates) {
        if (!x || seen.has(x)) continue;
        seen.add(x);
        out.push(x);
        if (out.length >= 6) break;
    }
    return out;
}

function replaceVariables(str, vars) {
    if (typeof str !== 'string') return str;
    return str.replace(/\{\{(\w+)\}\}/g, (_, key) => (vars[key] != null ? String(vars[key]) : '{{' + key + '}}'));
}

function replaceVariablesInStep(step, vars) {
    if (!step || !vars || Object.keys(vars).length === 0) return step;
    const s = { ...step, xpath: replaceVariables(step.xpath, vars), params: step.params ? { ...step.params } : {} };
    if (s.params.url) s.params.url = replaceVariables(s.params.url, vars);
    if (s.params.value) s.params.value = replaceVariables(s.params.value, vars);
    if (s.params.expectedValue) s.params.expectedValue = replaceVariables(s.params.expectedValue, vars);
    if (s.params.message) s.params.message = replaceVariables(s.params.message, vars);
    return s;
}

function buildExportPayload() {
    const stepsToExport = executionList.filter((s) => s.action !== 'separator');
    const name = (scenarioName?.value || 'XPath Helper — сценарий').trim() || 'XPath Helper — сценарий';
    return {
        name,
        version: 1,
        exportedAt: new Date().toISOString(),
        steps: stepsToExport.map((s, i) => ({
            step: i + 1,
            xpath: s.xpath,
            action: s.action,
            title: s.title || '',
            tags: Array.isArray(s.tags) ? s.tags : [],
            params: s.params || {}
        }))
    };
}

function getCurrentVariables(rowData = null) {
    const envVars = currentEnv && environments[currentEnv] ? { ...environments[currentEnv] } : {};
    return rowData ? { ...envVars, ...rowData } : envVars;
}

function isFragileXPath(xpath) {
    if (!xpath || typeof xpath !== 'string') return false;
    const s = xpath.trim();
    return /\[\s*1\s*\]/.test(s) || /position\s*\(\s*\)\s*=\s*1/.test(s) || /position\s*\(\s*\)\s*<\s*2/.test(s) || /last\s*\(\s*\)\s*-\s*1/.test(s) || /\/\w+\[\d+\](\/\w+\[\d+\])+/.test(s);
}

function highlightElementOnError(tabId, step) {
    const xpath = step?.xpath?.trim();
    if (!xpath || step?.action === 'separator' || step?.action === 'navigate' || step?.action === 'user_action' || step?.action === 'start' || step?.action === 'end') return;
    try {
        chrome.tabs.sendMessage(tabId, { action: 'highlightXpath', xpath }, () => { if (chrome.runtime.lastError) {} });
    } catch (_) {}
}

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
let dataRows = [];
let pythonSettings = { ...PYTHON_DEFAULTS };
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
    if (running) { hide(executeListBtn); hide(executeDataDrivenBtn); show(stopExecuteBtn); hide(flowExecuteBtn); show(flowStopBtn); }
    else { show(executeListBtn); show(executeDataDrivenBtn); hide(stopExecuteBtn); show(flowExecuteBtn); hide(flowStopBtn); }
}

/** Ошибка bfcache / закрытый канал: страница в кэше или навигация прервала ответ */
function isBfcacheError(e) {
    const msg = String(e?.message || e || '').toLowerCase();
    return msg.includes('back/forward cache') || msg.includes('message channel') || msg.includes('receiving end does not') || msg.includes('asynchronous response');
}

function getTabErrorMessage(e) {
    if (isBfcacheError(e)) return 'Связь с вкладкой потеряна. Обновите страницу (F5) и попробуйте снова.';
    const msg = e?.message || e || 'Нет связи';
    if (String(msg).includes('Таймаут') || String(msg).includes('timeout')) return 'Связь с вкладкой потеряна (таймаут). Обновите страницу и попробуйте снова.';
    return msg;
}

function showBfcacheBanner() {
    const banner = $('bfcacheBanner');
    if (banner) { show(banner); banner.classList.remove('hidden'); }
}

let lastExecutionReport = [];

async function captureScreenshotOnError(tabId) {
    try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab?.windowId) return null;
        await chrome.tabs.update(tabId, { active: true });
        await new Promise((r) => setTimeout(r, 200));
        const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
        return dataUrl;
    } catch (_) {
        return null;
    }
}

function waitForUserAction(message) {
    return new Promise((resolve) => {
        const overlay = $('userActionOverlay');
        const msgEl = $('userActionMessage');
        const btn = $('userActionContinueBtn');
        if (!overlay || !msgEl || !btn) { resolve(); return; }
        msgEl.textContent = message || 'Выполните действие и нажмите Продолжить';
        overlay.classList.remove('hidden');
        const done = () => {
            overlay.classList.add('hidden');
            btn.removeEventListener('click', done);
            resolve();
        };
        btn.addEventListener('click', done);
    });
}

/** Отправка в content script без ожидания sendResponse — результат приходит через executionResult.
 *  Устраняет ошибку "message channel closed" при навигации/bfcache. */
const executionPending = new Map();
function sendToContentAndWait(tabId, msg, timeoutMs = 120000) {
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            executionPending.delete(requestId);
            reject(new Error('Таймаут: страница не ответила'));
        }, timeoutMs);
        const finish = (r) => { clearTimeout(timer); executionPending.delete(requestId); resolve(r); };
        executionPending.set(requestId, { resolve: finish, reject: (e) => { clearTimeout(timer); executionPending.delete(requestId); reject(e); } });
        chrome.tabs.sendMessage(tabId, { ...msg, requestId }).catch((e) => {
            executionPending.delete(requestId);
            clearTimeout(timer);
            reject(e);
        });
    });
}
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'session') return;
    for (const key of Object.keys(changes || {})) {
        if (!key.startsWith('exec_result_')) continue;
        const requestId = key.slice('exec_result_'.length);
        const p = executionPending.get(requestId);
        if (p) {
            const v = changes[key]?.newValue;
            if (v !== undefined) p.resolve(v);
            chrome.storage.session.remove(key).catch(() => {});
        }
    }
});

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
        if (primaryLinkedHint) {
            if (result.linkedControl) {
                primaryLinkedHint.textContent = result.linkedControl.type === 'date' ? 'При добавлении шага → связанный input (дата).' : 'При добавлении шага → связанный input (ввод).';
                show(primaryLinkedHint);
            } else {
                hide(primaryLinkedHint);
            }
        }
        show(primarySectionEl);
    } else {
        hide(primarySectionEl);
        if (primaryLinkedHint) hide(primaryLinkedHint);
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

function getWaitAfterStepOptions() {
    return {
        waitReadyMs: Math.max(0, parseInt(waitReadyMsEl?.value, 10) || WAIT_READY_DEFAULT),
        waitNetworkQuietMs: Math.max(0, parseInt(waitNetworkQuietMsEl?.value, 10) || WAIT_NETWORK_QUIET_DEFAULT),
        waitNetworkTimeoutMs: Math.max(0, parseInt(waitNetworkTimeoutMsEl?.value, 10) || WAIT_NETWORK_TIMEOUT_DEFAULT),
        waitDomQuietMs: Math.max(0, parseInt(waitDomQuietMsEl?.value, 10) || WAIT_DOM_QUIET_DEFAULT),
        waitDomTimeoutMs: Math.max(0, parseInt(waitDomTimeoutMsEl?.value, 10) || WAIT_DOM_TIMEOUT_DEFAULT),
        waitPostActionMs: Math.max(0, parseInt(waitPostActionMsEl?.value, 10) || WAIT_POST_ACTION_DEFAULT),
    };
}

const WAIT_STORAGE_KEYS = [
    STORAGE_KEY_WAIT_READY_MS, STORAGE_KEY_WAIT_NETWORK_QUIET_MS, STORAGE_KEY_WAIT_NETWORK_TIMEOUT_MS,
    STORAGE_KEY_WAIT_DOM_QUIET_MS, STORAGE_KEY_WAIT_DOM_TIMEOUT_MS, STORAGE_KEY_WAIT_POST_ACTION_MS,
];
const WAIT_EL_IDS = ['waitReadyMs', 'waitNetworkQuietMs', 'waitNetworkTimeoutMs', 'waitDomQuietMs', 'waitDomTimeoutMs', 'waitPostActionMs'];
const WAIT_DEFAULTS = [WAIT_READY_DEFAULT, WAIT_NETWORK_QUIET_DEFAULT, WAIT_NETWORK_TIMEOUT_DEFAULT, WAIT_DOM_QUIET_DEFAULT, WAIT_DOM_TIMEOUT_DEFAULT, WAIT_POST_ACTION_DEFAULT];
chrome.storage.local.get(WAIT_STORAGE_KEYS, (d) => {
    WAIT_EL_IDS.forEach((id, i) => {
        const el = document.getElementById(id);
        if (!el) return;
        const v = d[WAIT_STORAGE_KEYS[i]];
        if (typeof v === 'number' && v >= 0) el.value = v;
    });
});
WAIT_EL_IDS.forEach((id, i) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
        const v = Math.max(0, parseInt(el.value || '0', 10) || WAIT_DEFAULTS[i]);
        chrome.storage.local.set({ [WAIT_STORAGE_KEYS[i]]: v });
    });
});
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

if (clearHistoryBtn) clearHistoryBtn.addEventListener('click', () => {
    elementHistory = [];
    chrome.storage.local.set({ [STORAGE_KEY_HISTORY]: [] });
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
        let xpath = (currentResult?.primary?.xpath || primaryXpathEl.textContent || '').trim();
        let action = 'click';
        let params = {};
        if (currentResult?.linkedControl?.xpath) {
            xpath = currentResult.linkedControl.xpath;
            action = currentResult.linkedControl.type === 'date' ? 'set_date' : 'input';
            if (action === 'set_date') params = { value: new Date().toISOString().slice(0, 10) };
        }
        if (!xpath) return;
        openListTab();
        showStepModal({ xpath, action, params });
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
    if (request.action === 'executionResult') {
        const p = executionPending.get(request.requestId);
        if (p) p.resolve(request.result);
        return false;
    }
    if (request.action === 'elementHovered') {
        const el = request.element;
        lastHoveredElement = el || null;
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

// ——— Hotkeys (panel) ———
// Ctrl+Enter: run list, Esc: stop, Ctrl+S: save, Ctrl+F: focus search, M: toggle mini view
document.addEventListener('keydown', (e) => {
    const tag = (e.target?.tagName || '').toLowerCase();
    const inInput = tag === 'input' || tag === 'textarea' || e.target?.isContentEditable;
    if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); executeListBtn?.click(); return; }
    if (e.key === 'Escape') { stopExecuteBtn?.click(); return; }
    if (e.ctrlKey && (e.key === 's' || e.key === 'S')) { e.preventDefault(); saveListBtn?.click(); return; }
    if (e.ctrlKey && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); listSearch?.focus(); return; }
    if (!inInput && (e.key === 'm' || e.key === 'M')) {
        document.body.classList.toggle('mini-view');
    }
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
        else if (step.action === 'wait_for_element') preview += ` (до ${step.params?.timeoutMs ?? 5000}мс)`;
        else if (step.action === 'branch' || step.action === 'assert') preview += ` [${BRANCH_CONDITIONS.find((x) => x.value === step.params?.condition)?.label || step.params?.condition || '?'}]`;
        else if (step.action === 'navigate') preview = step.params?.url || '—';
        else if (step.action === 'user_action') preview = (step.params?.message || 'Ожидание действий').substring(0, 40);
        else if (step.action === 'start') preview = (step.params?.message || 'точка входа').substring(0, 48);
        else if (step.action === 'end') preview = (step.params?.message || 'конец').substring(0, 48);
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
    const isoDate = /^\d{4}-\d{2}-\d{2}$/;
    if (editorDateValue) editorDateValue.value = (step.action === 'set_date' && step.params?.value && isoDate.test(String(step.params.value))) ? step.params.value : new Date().toISOString().slice(0, 10);
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
    if (editorAssertAttributeName) editorAssertAttributeName.value = step.params?.attributeName || '';
    if (editorAssertWaitMode) editorAssertWaitMode.checked = !!step.params?.waitMode;
    if (editorAssertSoft) editorAssertSoft.checked = !!step.params?.softAssert;
    if (editorNavigateUrl) editorNavigateUrl.value = step.params?.url || '';
    if (editorUserActionMessage) editorUserActionMessage.value = step.params?.message || '';
    if (editorBranchExpected) editorBranchExpected.value = step.params?.expectedValue || '';
    renderEditorSeparatorColors(step.params?.color || SEPARATOR_COLORS[0]);
    renderEditorStepColorButtons(step.params?.stepColor || STEP_COLORS[0]);
    toggleEditorParams();
    if (step.action === 'branch') {
        if (editorBranchNextId) editorBranchNextId.value = step.params?.nextId || '';
        if (editorBranchNextElseId) editorBranchNextElseId.value = step.params?.nextElseId || '';
        if (editorBranchAttributeName) editorBranchAttributeName.value = step.params?.attributeName || '';
    }
}

function toggleEditorParams() {
    const action = editorAction.value;
    const hideStepColor = action === 'separator';
    if (editorStepColorRow) { editorStepColorRow.classList.toggle('hidden', hideStepColor); editorStepColorRow.style.display = hideStepColor ? 'none' : ''; }
    if (editorParamsInput) { editorParamsInput.classList.toggle('hidden', action !== 'input'); editorParamsInput.style.display = action === 'input' ? '' : 'none'; }
    const isSetDate = action === 'set_date';
    if (editorParamsSetDate) { editorParamsSetDate.classList.toggle('hidden', !isSetDate); editorParamsSetDate.style.display = isSetDate ? '' : 'none'; }
    if (isSetDate && editorDateValue && !editorDateValue.value) editorDateValue.value = new Date().toISOString().slice(0, 10);
    if (editorParamsWait) { editorParamsWait.classList.toggle('hidden', action !== 'wait'); editorParamsWait.style.display = action === 'wait' ? '' : 'none'; }
    if (editorParamsUserAction) {
        const showUa = action === 'user_action' || action === 'start' || action === 'end';
        editorParamsUserAction.classList.toggle('hidden', !showUa);
        editorParamsUserAction.style.display = showUa ? '' : 'none';
    }
    if (editorParamsFile) { editorParamsFile.classList.toggle('hidden', action !== 'file_upload'); editorParamsFile.style.display = action === 'file_upload' ? '' : 'none'; }
    if (editorParamsSeparator) { editorParamsSeparator.classList.toggle('hidden', action !== 'separator'); editorParamsSeparator.style.display = action === 'separator' ? '' : 'none'; }
    if (editorParamsBranch) { editorParamsBranch.classList.toggle('hidden', action !== 'branch'); editorParamsBranch.style.display = action === 'branch' ? '' : 'none'; if (action === 'branch') populateEditorBranchSelects(); }
    if (editorBranchAttributeName) { editorBranchAttributeName.classList.toggle('hidden', action !== 'branch' || editorBranchCondition?.value !== 'attribute_equals'); editorBranchAttributeName.style.display = (action === 'branch' && editorBranchCondition?.value === 'attribute_equals') ? '' : 'none'; }
    if (editorParamsAssert) { editorParamsAssert.classList.toggle('hidden', action !== 'assert'); editorParamsAssert.style.display = action === 'assert' ? '' : 'none'; }
    if (editorAssertAttributeName) { editorAssertAttributeName.classList.toggle('hidden', action !== 'assert' || editorAssertCondition?.value !== 'attribute_equals'); editorAssertAttributeName.style.display = (action === 'assert' && editorAssertCondition?.value === 'attribute_equals') ? '' : 'none'; }
    if (editorParamsNavigate) { editorParamsNavigate.classList.toggle('hidden', action !== 'navigate'); editorParamsNavigate.style.display = action === 'navigate' ? '' : 'none'; }
    const hideEditorWaitForLoad = action === 'separator' || action === 'wait' || action === 'user_action' || action === 'start' || action === 'end' || action === 'branch' || action === 'navigate';
    if (editorParamsWaitForLoad) { editorParamsWaitForLoad.classList.toggle('hidden', hideEditorWaitForLoad); editorParamsWaitForLoad.style.display = hideEditorWaitForLoad ? 'none' : ''; }
    const xpathRow = editorDetail?.querySelector('.form-row:first-child');
    if (xpathRow) xpathRow.style.display = (action === 'separator' || action === 'navigate' || action === 'user_action' || action === 'start' || action === 'end') ? 'none' : '';
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

function renderEditorStepColorButtons(selected) {
    if (!editorStepColorColors) return;
    const sel = selected || STEP_COLORS[0];
    editorStepColorColors.innerHTML = STEP_COLORS.map((c) =>
        `<button type="button" class="step-color-btn ${c === sel ? 'selected' : ''}" data-color="${escapeHtml(c)}" style="background:${c}" title="${escapeHtml(c)}"></button>`
    ).join('');
    editorStepColorColors.querySelectorAll('.step-color-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            editorStepColorColors.querySelectorAll('.step-color-btn').forEach((b) => b.classList.remove('selected'));
            btn.classList.add('selected');
        });
    });
}

function applyEditorStep() {
    const step = executionList.find((s) => s.id === selectedEditorStepId);
    if (!step) return;
    const action = editorAction.value;
    step.xpath = action === 'separator' || action === 'user_action' || action === 'start' || action === 'end' ? '—' : (action === 'navigate' ? '—' : (editorXpath.value || '').trim());
    step.action = action;
    step.params = step.params || {};
    if (action === 'input') step.params.value = editorInputValue.value;
    if (action === 'set_date') step.params.value = (editorDateValue?.value || new Date().toISOString().slice(0, 10)).trim();
    if (action === 'wait') step.params.delayMs = Math.max(0, parseInt(editorWaitMs.value, 10) || 500);
    if (action === 'user_action') step.params.message = (editorUserActionMessage?.value || '').trim() || 'Выполните действие и нажмите Продолжить';
    if (action === 'start') step.params.message = (editorUserActionMessage?.value || '').trim();
    if (action === 'end') step.params.message = (editorUserActionMessage?.value || '').trim();
    if (action === 'file_upload') {
        step.params.fileName = editorFileName.value.trim() || 'file';
        if (editorFileBase64) step.params.fileContentBase64 = editorFileBase64;
    }
    if (action === 'separator') {
        step.params.label = (editorSeparatorLabel.value || '').trim();
        step.params.color = editorSeparatorColors?.querySelector('.separator-color-btn.selected')?.dataset.color || SEPARATOR_COLORS[0];
    }
    if (action !== 'separator') {
        step.params.stepColor = editorStepColorColors?.querySelector('.step-color-btn.selected')?.dataset.color || step.params.stepColor || STEP_COLORS[0];
    } else {
        delete step.params.stepColor;
    }
    if (action === 'assert') {
        step.params.condition = editorAssertCondition?.value || 'element_exists';
        step.params.expectedValue = (editorAssertExpected?.value || '').trim();
        if (step.params.condition === 'attribute_equals') step.params.attributeName = (editorAssertAttributeName?.value || '').trim();
        if (editorAssertWaitMode?.checked) step.params.waitMode = true;
        if (editorAssertSoft?.checked) step.params.softAssert = true;
    }
    if (action === 'navigate') step.params.url = (editorNavigateUrl?.value || '').trim();
    if (action === 'branch') {
        step.params.condition = editorBranchCondition?.value || 'element_exists';
        step.params.expectedValue = (editorBranchExpected?.value || '').trim();
        if (step.params.condition === 'attribute_equals') step.params.attributeName = (editorBranchAttributeName?.value || '').trim();
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

// ——— Environments & variables ———
function loadEnvironments() {
    chrome.storage.local.get([STORAGE_KEY_ENVIRONMENTS, STORAGE_KEY_CURRENT_ENV], (data) => {
        if (data[STORAGE_KEY_ENVIRONMENTS]) {
            environments = { ...{ dev: {}, stage: {}, prod: {} }, ...data[STORAGE_KEY_ENVIRONMENTS] };
        }
        currentEnv = data[STORAGE_KEY_CURRENT_ENV] || '';
        if (envSelect) {
            envSelect.value = currentEnv;
        }
    });
}

function saveEnvironments() {
    chrome.storage.local.set({
        [STORAGE_KEY_ENVIRONMENTS]: environments,
        [STORAGE_KEY_CURRENT_ENV]: currentEnv
    });
}

let envModalActiveEnv = 'dev';
function openEnvModal() {
    if (!envModal) return;
    envModalActiveEnv = currentEnv || 'dev';
    envModal.querySelectorAll('.env-tab').forEach((t) => {
        t.classList.toggle('active', t.dataset.env === envModalActiveEnv);
    });
    renderEnvVarsEditor(envModalActiveEnv);
    envModal.classList.remove('hidden');
}
if (envModal) {
    envModal.addEventListener('click', (e) => {
        const t = e.target.closest('.env-tab');
        if (!t) return;
        envModalActiveEnv = t.dataset.env;
        envModal.querySelectorAll('.env-tab').forEach((tb) => tb.classList.toggle('active', tb.dataset.env === envModalActiveEnv));
        renderEnvVarsEditor(envModalActiveEnv);
    });
}

function renderEnvVarsEditor(env) {
    if (!envVarsEditor) return;
    const vars = environments[env] || {};
    const keys = Object.keys(vars);
    envVarsEditor.innerHTML = keys.map((k) => `
        <div class="env-var-row" data-key="${escapeHtml(k)}">
            <input type="text" class="env-var-key" value="${escapeHtml(k)}" placeholder="baseUrl">
            <input type="text" class="env-var-val" value="${escapeHtml(String(vars[k]))}" placeholder="https://dev.example.com">
            <button type="button" class="btn btn-icon env-var-del" title="Удалить">✕</button>
        </div>
    `).join('');
    envVarsEditor.querySelectorAll('.env-var-row').forEach((row) => {
        const keyInp = row.querySelector('.env-var-key');
        const valInp = row.querySelector('.env-var-val');
        const delBtn = row.querySelector('.env-var-del');
        keyInp.addEventListener('change', () => {
            const old = row.dataset.key;
            const n = keyInp.value.trim();
            if (n && n !== old) {
                delete vars[old];
                vars[n] = valInp.value;
                row.dataset.key = n;
            }
        });
        valInp.addEventListener('change', () => { vars[row.dataset.key] = valInp.value; });
        delBtn.addEventListener('click', () => {
            delete vars[row.dataset.key];
            row.remove();
        });
    });
}

function closeEnvModal(save) {
    if (!envModal) return;
    if (save) {
        const env = envModalActiveEnv || envModal.querySelector('.env-tab.active')?.dataset.env || 'dev';
        const vars = {};
        envVarsEditor.querySelectorAll('.env-var-row').forEach((row) => {
            const k = (row.querySelector('.env-var-key')?.value || '').trim();
            const v = row.querySelector('.env-var-val')?.value ?? '';
            if (k) vars[k] = v;
        });
        environments[env] = vars;
        saveEnvironments();
    }
    envModal.classList.add('hidden');
}

// ——— Execution list: load, save, render ———
function loadExecutionList() {
    chrome.storage.local.get([STORAGE_KEY_EXECUTION_LIST, STORAGE_KEY_SCENARIOS, STORAGE_KEY_ENVIRONMENTS, STORAGE_KEY_CURRENT_ENV, STORAGE_KEY_DATA_ROWS, STORAGE_KEY_REPORT_PATH, STORAGE_KEY_PYTHON_SETTINGS, STORAGE_KEY_RUNNER_URL, STORAGE_KEY_RUNNER_TOKEN], (data) => {
        executionList = Array.isArray(data[STORAGE_KEY_EXECUTION_LIST]) ? data[STORAGE_KEY_EXECUTION_LIST] : [];
        if (ensureStartStepInExecutionList()) {
            chrome.storage.local.set({ [STORAGE_KEY_EXECUTION_LIST]: executionList });
        }
        scenarios = Array.isArray(data[STORAGE_KEY_SCENARIOS]) ? data[STORAGE_KEY_SCENARIOS] : [];
        if (data[STORAGE_KEY_ENVIRONMENTS]) {
            environments = { ...{ dev: {}, stage: {}, prod: {} }, ...data[STORAGE_KEY_ENVIRONMENTS] };
        }
        currentEnv = data[STORAGE_KEY_CURRENT_ENV] || '';
        dataRows = Array.isArray(data[STORAGE_KEY_DATA_ROWS]) ? data[STORAGE_KEY_DATA_ROWS] : [];
        runnerBaseUrl = (data[STORAGE_KEY_RUNNER_URL] || RUNNER_DEFAULT_URL).trim() || RUNNER_DEFAULT_URL;
        runnerToken = (data[STORAGE_KEY_RUNNER_TOKEN] || '').trim();
        if (envSelect) envSelect.value = currentEnv;
        if (reportPathInput) reportPathInput.value = data[STORAGE_KEY_REPORT_PATH] || 'report.html';
        if (data[STORAGE_KEY_PYTHON_SETTINGS]) {
            pythonSettings = { ...PYTHON_DEFAULTS, ...data[STORAGE_KEY_PYTHON_SETTINGS] };
        }
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
    ensureStartStepInExecutionList();
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

if (envSelect) {
    envSelect.addEventListener('change', () => {
        currentEnv = envSelect.value || '';
        chrome.storage.local.set({ [STORAGE_KEY_CURRENT_ENV]: currentEnv });
    });
}
if (envEditBtn) {
    envEditBtn.addEventListener('click', openEnvModal);
}
if (envAddVarBtn) {
    envAddVarBtn.addEventListener('click', () => {
        const env = envModalActiveEnv || 'dev';
        if (!environments[env]) environments[env] = {};
        const k = 'var' + (Object.keys(environments[env]).length + 1);
        environments[env][k] = '';
        renderEnvVarsEditor(env);
    });
}
if (envModalSave) envModalSave.addEventListener('click', () => closeEnvModal(true));
if (envModalCancel) envModalCancel.addEventListener('click', () => closeEnvModal(false));

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
            ensureStartStepInExecutionList();
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
            (s.title || '').toLowerCase().includes(searchQ) ||
            (Array.isArray(s.tags) ? s.tags.join(' ').toLowerCase().includes(searchQ) : false) ||
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
        const stepColor = step?.params?.stepColor;
        li.className = 'execution-item' + (step.id === currentExecutingStepId ? ' current' : '') + (step.action === 'separator' ? ' execution-item-separator' : '') + (stepColor ? ' has-step-color' : '');
        if (stepColor) li.style.setProperty('--step-color', stepColor);
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
                ? `<span class="execution-item-badge ${s.state === 'ok' ? 'click' : s.state === 'error' ? 'file_upload' : 'wait'}" title="${escapeHtml(s.message || '')}">${escapeHtml(s.state.toUpperCase())}</span>${s?.state === 'error' ? `<button type="button" class="btn-icon btn-copy-xpath" data-step-id="${escapeHtml(step.id)}" title="Копировать XPath/URL">📋</button>` : ''}`
                : '';
            let paramsText = '';
            if ((step.action === 'input' || step.action === 'set_date') && step.params?.value) paramsText = `"${escapeHtml(step.params.value.substring(0, 30))}${step.params.value.length > 30 ? '…' : ''}"`;
            else if (step.action === 'wait') paramsText = `${step.params?.delayMs ?? 500} мс`;
            else if (step.action === 'wait_for_element') paramsText = `до ${step.params?.timeoutMs ?? 5000}мс`;
            else if (step.action === 'file_upload' && step.params?.fileName) paramsText = step.params.fileContentBase64 ? `📎 ${escapeHtml(step.params.fileName)}` : `📎 ${escapeHtml(step.params.fileName)} (пустой)`;
            else if (step.action === 'branch' || step.action === 'assert') {
                const c = BRANCH_CONDITIONS.find((x) => x.value === step.params?.condition)?.label || step.params?.condition || '?';
                paramsText = step.params?.expectedValue ? `${c}: "${escapeHtml(step.params.expectedValue.substring(0, 15))}…"` : c;
            }
            else if (step.action === 'navigate') paramsText = escapeHtml((step.params?.url || '').substring(0, 40));
            else if (step.action === 'user_action') paramsText = escapeHtml((step.params?.message || 'Ожидание действий').substring(0, 40));
            const fallbackText = step.action === 'navigate'
                ? (step.params?.url || '—')
                : (step.action === 'user_action' ? (step.params?.message || '—') : step.xpath);
            const listDisplayText = (step.title || '').trim() || fallbackText;
            const fragileWarn = (step.action !== 'separator' && step.action !== 'navigate' && step.action !== 'user_action' && step.xpath && isFragileXPath(step.xpath)) ? '<span class="fragile-xpath-warn" title="Хрупкий XPath (//div[1], position() и т.п.)">⚠</span>' : '';
            const tagsLine = Array.isArray(step.tags) && step.tags.length
                ? `<div class="execution-item-params">🏷 ${step.tags.map((t) => `<span class="execution-item-badge wait">${escapeHtml(String(t))}</span>`).join(' ')}</div>`
                : '';
            const fallbackXPaths = Array.isArray(step.params?.fallbackXPaths) ? step.params.fallbackXPaths : [];
            const showSelectors = step.action !== 'navigate' && step.action !== 'user_action' && step.action !== 'separator' && (step.xpath || fallbackXPaths.length);
            const selectorBlock = showSelectors ? (() => {
                const rows = [];
                const primary = (step.xpath || '').trim();
                const mk = (label, xp, kind, idx) => `
                    <div class="selector-row">
                        <span class="selector-label">${escapeHtml(label)}</span>
                        <span class="selector-xpath" title="${escapeHtml(xp)}">${escapeHtml(truncate(xp, 80))}</span>
                        <span class="selector-count" data-count-for="${escapeHtml(step.id)}:${escapeHtml(kind)}:${idx}">—</span>
                        <button type="button" class="btn-icon btn-validate-xpath" title="Проверить (count)" data-step-id="${escapeHtml(step.id)}" data-kind="${escapeHtml(kind)}" data-idx="${idx}" data-xpath="${escapeHtml(xp)}">✓?</button>
                    </div>`;
                if (primary) rows.push(mk('Primary', primary, 'primary', 0));
                fallbackXPaths.slice(0, 3).forEach((xp, i) => { if (xp) rows.push(mk('Fallback', String(xp), 'fallback', i)); });
                return rows.length ? `<div class="selector-block">${rows.join('')}</div>` : '';
            })() : '';
            li.innerHTML = `
                <div class="execution-item-header">
                    ${!searchQ ? `<span class="execution-item-drag" title="Перетащить" aria-label="Перетащить">⋮⋮</span>` : ''}
                    <span class="execution-item-idx">${displayIdx + 1}</span>
                    <span class="execution-item-xpath" title="${escapeHtml(listDisplayText)}">${escapeHtml(truncate(listDisplayText, 50))}</span>${fragileWarn}
                    <span class="execution-item-badge ${step.action}">${ACTION_LABELS[step.action] || step.action}</span>
                    ${statusBadge}
                </div>
                ${paramsText ? `<div class="execution-item-params">${paramsText}</div>` : ''}
                ${tagsLine}
                ${selectorBlock}
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
        const stepColor = step?.params?.stepColor;
        card.className = 'flow-card' + (step.action === 'separator' ? ' separator-card' : '') + (stepColor ? ' has-step-color' : '') + (step.id === currentExecutingStepId ? ' current' : '');
        if (stepColor) card.style.setProperty('--step-color', stepColor);
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
            if ((step.action === 'input' || step.action === 'set_date') && step.params?.value) paramsText = `"${escapeHtml(step.params.value.substring(0, 25))}${step.params.value.length > 25 ? '…' : ''}"`;
            else if (step.action === 'wait') paramsText = `${step.params?.delayMs ?? 500} мс`;
            else if (step.action === 'wait_for_element') paramsText = `до ${step.params?.timeoutMs ?? 5000}мс`;
            else if (step.action === 'file_upload' && step.params?.fileName) paramsText = `📎 ${escapeHtml(step.params.fileName)}`;
            else if (step.action === 'branch' || step.action === 'assert') {
                const c = BRANCH_CONDITIONS.find((x) => x.value === step.params?.condition)?.label || step.params?.condition || '?';
                paramsText = step.params?.expectedValue ? `${c}: "${escapeHtml(step.params.expectedValue.substring(0, 15))}…"` : c;
            }
            else if (step.action === 'navigate') paramsText = escapeHtml((step.params?.url || '').substring(0, 35));
            else if (step.action === 'user_action') paramsText = escapeHtml((step.params?.message || 'Ожидание действий').substring(0, 35));
            const displayText = step.action === 'navigate' ? (step.params?.url || '—') : (step.action === 'user_action' ? (step.params?.message || '—') : step.xpath);
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
    if (stepTitle) {
        const suggested = (!step?.title && !editingStepId) ? suggestStepTitle(lastHoveredElement) : '';
        stepTitle.value = (step?.title || suggested || '').toString();
    }
    if (stepTags) stepTags.value = Array.isArray(step?.tags) ? step.tags.join(', ') : '';
    renderStepColorButtons(step?.params?.stepColor || STEP_COLORS[0]);
    const sepColor = step?.params?.color || SEPARATOR_COLORS[0];
    const sepLabel = step?.params?.label || '';
    if (stepSeparatorLabel) stepSeparatorLabel.value = sepLabel;
    renderSeparatorColorButtons(sepColor);
    stepInputValue.value = (step?.params?.value) || '';
    const isoDate = /^\d{4}-\d{2}-\d{2}$/;
    if (stepDateValue) stepDateValue.value = (step?.action === 'set_date' && step?.params?.value && isoDate.test(String(step.params.value))) ? step.params.value : new Date().toISOString().slice(0, 10);
    stepWaitMs.value = (step?.params?.delayMs) ?? 500;
    stepFileName.value = (step?.params?.fileName) || '';
    stepFileBase64 = (step?.params?.fileContentBase64) || null;
    if (stepFileLabel) {
        stepFileLabel.textContent = stepFileBase64 ? 'Файл прикреплён' : '—';
        delete stepFileLabel.dataset.minimalPdf;
    }
    if (stepRetryOnError) stepRetryOnError.checked = !!step?.params?.retryOnError;
    if (stepRetryCount) stepRetryCount.value = step?.params?.retryCount ?? 3;
    if (stepRetryDelayMs) stepRetryDelayMs.value = step?.params?.retryDelayMs ?? 300;
    if (stepWaitForLoad) stepWaitForLoad.checked = step?.params?.waitForLoad !== false;
    if (stepMandatory) stepMandatory.checked = step?.params?.mandatory !== false;
    if (stepTimeoutMs) stepTimeoutMs.value = step?.params?.timeoutMs ?? 0;
    if (stepBranchCondition) stepBranchCondition.value = step?.params?.condition || 'element_exists';
    if (stepBranchExpected) stepBranchExpected.value = step?.params?.expectedValue || '';
    if (stepAssertCondition) stepAssertCondition.value = step?.params?.condition || 'element_exists';
    if (stepAssertExpected) stepAssertExpected.value = step?.params?.expectedValue || '';
    if (stepAssertAttributeName) stepAssertAttributeName.value = step?.params?.attributeName || '';
    if (stepAssertWaitMode) stepAssertWaitMode.checked = !!step?.params?.waitMode;
    if (stepAssertSoft) stepAssertSoft.checked = !!step?.params?.softAssert;
    if (stepNavigateUrl) stepNavigateUrl.value = step?.params?.url || '';
    if (stepUserActionMessage) stepUserActionMessage.value = step?.params?.message || '';
    toggleStepParams();
    if (step?.action === 'branch') {
        if (stepBranchNextId) stepBranchNextId.value = step?.params?.nextId || '';
        if (stepBranchNextElseId) stepBranchNextElseId.value = step?.params?.nextElseId || '';
        if (stepBranchAttributeName) stepBranchAttributeName.value = step?.params?.attributeName || '';
    }
    stepModal.classList.remove('hidden');
    stepModal.querySelector('.modal-title').textContent = step ? 'Редактировать шаг' : 'Добавить шаг';
    setTimeout(updateFragileXpathWarn, 0);
}

function hideStepModal() {
    stepModal.classList.add('hidden');
    editingStepId = null;
    insertStepAtIndex = null;
}

function toggleStepParams() {
    const action = stepAction.value;
    const isSeparator = action === 'separator';
    const hideStepColor = isSeparator;
    if (stepColorRow) { stepColorRow.classList.toggle('hidden', hideStepColor); stepColorRow.style.display = hideStepColor ? 'none' : ''; }
    stepParamsInput.classList.toggle('hidden', action !== 'input');
    stepParamsInput.style.display = action === 'input' ? '' : 'none';
    const isSetDate = action === 'set_date';
    if (stepParamsSetDate) { stepParamsSetDate.classList.toggle('hidden', !isSetDate); stepParamsSetDate.style.display = isSetDate ? '' : 'none'; }
    if (isSetDate && stepDateValue && !stepDateValue.value) stepDateValue.value = new Date().toISOString().slice(0, 10);
    stepParamsWait.classList.toggle('hidden', action !== 'wait');
    stepParamsWait.style.display = action === 'wait' ? '' : 'none';
    const isWaitForElement = action === 'wait_for_element';
    if (stepParamsUserAction) {
        const showUa = action === 'user_action' || action === 'start' || action === 'end';
        stepParamsUserAction.classList.toggle('hidden', !showUa);
        stepParamsUserAction.style.display = showUa ? '' : 'none';
    }
    stepParamsBranch.classList.toggle('hidden', action !== 'branch');
    stepParamsBranch.style.display = action === 'branch' ? '' : 'none';
    if (stepBranchAttributeName) { stepBranchAttributeName.classList.toggle('hidden', action !== 'branch' || stepBranchCondition?.value !== 'attribute_equals'); stepBranchAttributeName.style.display = (action === 'branch' && stepBranchCondition?.value === 'attribute_equals') ? '' : 'none'; }
    if (action === 'branch') populateStepNextSelects();
    if (stepParamsAssert) { stepParamsAssert.classList.toggle('hidden', action !== 'assert'); stepParamsAssert.style.display = action === 'assert' ? '' : 'none'; }
    if (stepAssertAttributeName) { stepAssertAttributeName.classList.toggle('hidden', action !== 'assert' || stepAssertCondition?.value !== 'attribute_equals'); stepAssertAttributeName.style.display = (action === 'assert' && stepAssertCondition?.value === 'attribute_equals') ? '' : 'none'; }
    if (stepParamsNavigate) { stepParamsNavigate.classList.toggle('hidden', action !== 'navigate'); stepParamsNavigate.style.display = action === 'navigate' ? '' : 'none'; }
    stepParamsFile.classList.toggle('hidden', action !== 'file_upload');
    stepParamsFile.style.display = action === 'file_upload' ? '' : 'none';
    if (stepParamsSeparator) {
        stepParamsSeparator.classList.toggle('hidden', !isSeparator);
        stepParamsSeparator.style.display = isSeparator ? '' : 'none';
        if (isSeparator) renderSeparatorColorButtons(selectedSeparatorColor);
    }
    const hideWaitForLoad = action === 'separator' || action === 'wait' || action === 'wait_for_element' || action === 'user_action' || action === 'start' || action === 'end' || action === 'branch' || action === 'navigate';
    if (stepParamsWaitForLoad) {
        stepParamsWaitForLoad.classList.toggle('hidden', hideWaitForLoad);
        stepParamsWaitForLoad.style.display = hideWaitForLoad ? 'none' : '';
    }
    const xpathRow = stepModal?.querySelector('.form-row:first-child');
    if (xpathRow) xpathRow.style.display = (isSeparator || action === 'navigate' || action === 'user_action' || action === 'start' || action === 'end') ? 'none' : '';
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
const stepXpathFragileWarn = $('stepXpathFragileWarn');
function updateFragileXpathWarn() {
    if (!stepXpathFragileWarn) return;
    const action = stepAction?.value;
    const xpath = stepXpath?.value?.trim() || '';
    const show = action && action !== 'separator' && action !== 'navigate' && action !== 'user_action' && action !== 'start' && action !== 'end' && xpath && isFragileXPath(xpath);
    stepXpathFragileWarn.classList.toggle('hidden', !show);
}
if (stepXpath) stepXpath.addEventListener('input', updateFragileXpathWarn);
if (stepXpath) stepXpath.addEventListener('change', updateFragileXpathWarn);
if (stepAssertCondition) stepAssertCondition.addEventListener('change', toggleStepParams);
if (stepBranchCondition) stepBranchCondition.addEventListener('change', toggleStepParams);

let selectedSeparatorColor = SEPARATOR_COLORS[0];
let selectedStepColor = STEP_COLORS[0];

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

function renderStepColorButtons(selected) {
    if (!stepColorColors) return;
    selectedStepColor = selected || selectedStepColor || STEP_COLORS[0];
    stepColorColors.innerHTML = STEP_COLORS.map((c) =>
        `<button type="button" class="step-color-btn ${c === selectedStepColor ? 'selected' : ''}" data-color="${escapeHtml(c)}" style="background:${c}" title="${escapeHtml(c)}"></button>`
    ).join('');
    stepColorColors.querySelectorAll('.step-color-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            selectedStepColor = btn.dataset.color;
            renderStepColorButtons(selectedStepColor);
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
function upsertStepFromModal({ alsoAddAssert = false } = {}) {
    const action = stepAction.value;
    const navUrl = (stepNavigateUrl?.value || '').trim();
    let xpath = action === 'separator' || action === 'user_action' || action === 'start' || action === 'end' ? '—' : (action === 'navigate' ? navUrl : stepXpath.value.trim());
    if (action === 'navigate') {
        if (!navUrl) return;
        xpath = '—';
    } else if (action === 'user_action' || action === 'start' || action === 'end') {
        xpath = '—';
    } else if (!xpath && action !== 'separator') return;
    const params = {};
    const timeoutVal = parseInt(stepTimeoutMs?.value, 10);
    if (timeoutVal > 0) params.timeoutMs = timeoutVal;
    params.mandatory = stepMandatory?.checked !== false;
    if (action === 'input') params.value = stepInputValue.value;
    if (action === 'set_date') params.value = (stepDateValue?.value || new Date().toISOString().slice(0, 10)).trim();
    if (action === 'wait') params.delayMs = Math.max(0, parseInt(stepWaitMs.value, 10) || 500);
    if (action === 'separator') {
        params.color = selectedSeparatorColor || SEPARATOR_COLORS[0];
        params.label = (stepSeparatorLabel?.value || '').trim();
    }
    if (action !== 'separator') {
        params.stepColor = selectedStepColor || STEP_COLORS[0];
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
        if (params.condition === 'attribute_equals') params.attributeName = (stepAssertAttributeName?.value || '').trim();
        if (stepAssertWaitMode?.checked) params.waitMode = true;
        if (stepAssertSoft?.checked) params.softAssert = true;
    }
    if (action === 'navigate') params.url = navUrl;
    if (action === 'user_action') params.message = (stepUserActionMessage?.value || '').trim() || 'Выполните действие и нажмите Продолжить';
    if (action === 'start') params.message = (stepUserActionMessage?.value || '').trim();
    if (action === 'end') params.message = (stepUserActionMessage?.value || '').trim();
    if (action === 'branch') {
        params.condition = stepBranchCondition?.value || 'element_exists';
        params.expectedValue = (stepBranchExpected?.value || '').trim();
        if (params.condition === 'attribute_equals') params.attributeName = (stepBranchAttributeName?.value || '').trim();
        if (stepBranchNextId?.value) params.nextId = stepBranchNextId.value;
        if (stepBranchNextElseId?.value) params.nextElseId = stepBranchNextElseId.value;
    }
    if (stepRetryOnError?.checked) {
        params.retryOnError = true;
        params.retryCount = Math.max(1, parseInt(stepRetryCount?.value, 10) || 3);
        params.retryDelayMs = Math.max(0, parseInt(stepRetryDelayMs?.value, 10) || 300);
    }
    params.waitForLoad = !!stepWaitForLoad?.checked;
    const titleVal = (stepTitle?.value || '').trim();
    const tagsVal = parseTags(stepTags?.value || '');
    // Attach fallback selectors (do not override main xpath).
    // Strategy: store ALL unique selectors (excluding primary) + attribute-based fallbacks.
    const fallbackXPaths = Array.isArray(params.fallbackXPaths) ? params.fallbackXPaths : [];
    const isSelectorAction = (action === 'click' || action === 'click_if_exists' || action === 'input' || action === 'set_date' || action === 'file_upload' || action === 'wait_for_element' || action === 'assert' || action === 'branch');
    const uniquePool = (!editingStepId && isSelectorAction && Array.isArray(currentResult?.uniqueOnly))
        ? currentResult.uniqueOnly.map((x) => x?.xpath).filter(Boolean)
        : [];
    const uniqueFallbacks = uniquePool.filter((x) => String(x).trim() && String(x).trim() !== String(xpath).trim()).slice(0, 25);
    const autoFallbacks = (!editingStepId && isSelectorAction)
        ? suggestFallbackXPaths(lastHoveredElement)
        : [];
    const mergedFallbacks = [...fallbackXPaths, ...uniqueFallbacks, ...autoFallbacks]
        .map((x) => String(x).trim())
        .filter(Boolean)
        .filter((x, i, arr) => arr.indexOf(x) === i)
        .slice(0, 30);
    if (mergedFallbacks.length) params.fallbackXPaths = mergedFallbacks;
    let savedIdx = -1;
    if (editingStepId) {
        const idx = executionList.findIndex((s) => s.id === editingStepId);
        if (idx !== -1) {
            executionList[idx] = { ...executionList[idx], xpath, action, params, title: titleVal, tags: tagsVal };
            savedIdx = idx;
        }
    } else {
        const newStep = { id: 'step-' + Date.now() + '-' + Math.random().toString(36).slice(2), xpath, action, params, title: titleVal, tags: tagsVal };
        if (insertStepAtIndex != null && insertStepAtIndex >= 0 && insertStepAtIndex <= executionList.length) {
            executionList.splice(insertStepAtIndex, 0, newStep);
            savedIdx = insertStepAtIndex;
        } else {
            executionList.push(newStep);
            savedIdx = executionList.length - 1;
        }
    }

    if (alsoAddAssert) {
        const baseIdx = savedIdx >= 0 ? savedIdx : (executionList.length - 1);
        const baseStep = executionList[baseIdx];
        if (baseStep) {
            let assertCondition = 'element_exists';
            let assertExpected = '';
            let assertXpath = baseStep.xpath;
            let insertOffset = 0; // 0 => before baseStep, 1 => after baseStep
            if (baseStep.action === 'navigate') {
                assertCondition = 'url_contains';
                const u = (baseStep.params?.url || '').trim();
                try {
                    const urlObj = new URL(u);
                    assertExpected = urlObj.pathname && urlObj.pathname !== '/' ? urlObj.pathname : urlObj.hostname;
                } catch (_) {
                    // fallback: strip protocol and query
                    assertExpected = u.replace(/^https?:\/\//, '').split('?')[0].split('#')[0].slice(0, 60);
                }
                assertXpath = '—';
                // For navigate, post-condition is more useful than pre-condition.
                insertOffset = 1;
            } else {
                // Pre-condition: ensure element exists before action.
                assertCondition = 'element_exists';
                assertExpected = '';
                assertXpath = baseStep.xpath;
            }
            const assertStep = {
                id: 'step-' + Date.now() + '-assert-' + Math.random().toString(36).slice(2),
                xpath: assertXpath,
                action: 'assert',
                title: baseStep.action === 'navigate' ? 'Проверить URL (после)' : 'Проверить элемент (до)',
                tags: ['assert'],
                params: {
                    condition: assertCondition,
                    expectedValue: assertExpected,
                    // wait mode makes assertion stable after navigation/click
                    waitMode: true,
                    timeoutMs: Math.max(0, parseInt(stepTimeoutMs?.value, 10) || 5000),
                    softAssert: false,
                }
            };
            executionList.splice(baseIdx + insertOffset, 0, assertStep);
        }
    }

    saveExecutionList();
    hideStepModal();
    renderExecutionList();
}

stepModalSave.addEventListener('click', () => upsertStepFromModal({ alsoAddAssert: false }));
if (stepModalSaveAddAssert) stepModalSaveAddAssert.addEventListener('click', () => upsertStepFromModal({ alsoAddAssert: true }));

addStepBtn.addEventListener('click', () => {
    let xpath = (currentResult?.primary?.xpath || (primaryXpathEl && primaryXpathEl.textContent) || '').trim();
    let action = 'click';
    let params = {};
    if (currentResult?.linkedControl?.xpath) {
        xpath = currentResult.linkedControl.xpath;
        action = currentResult.linkedControl.type === 'date' ? 'set_date' : 'input';
        if (action === 'set_date') params = { value: new Date().toISOString().slice(0, 10) };
    }
    if (!xpath) {
        addStepBtn.textContent = 'Сначала выберите элемент';
        setTimeout(() => { addStepBtn.textContent = '+ Добавить текущий'; }, 2000);
        return;
    }
    showStepModal({ xpath, action, params });
});

addStepManualBtn.addEventListener('click', () => {
    showStepModal(null);
});

document.addEventListener('click', (e) => {
    const validateBtn = e.target.closest('.btn-validate-xpath');
    if (validateBtn) {
        const stepId = validateBtn.dataset.stepId;
        const xpathRaw = validateBtn.dataset.xpath || '';
        const kind = validateBtn.dataset.kind || 'primary';
        const idx = validateBtn.dataset.idx || '0';
        const step = executionList.find((s) => s.id === stepId);
        if (!step) return;
        const xpath = replaceVariables(String(xpathRaw), getCurrentVariables());
        const countEl = document.querySelector(`[data-count-for="${CSS.escape(stepId)}:${CSS.escape(kind)}:${CSS.escape(idx)}"]`);
        if (countEl) { countEl.textContent = '...'; countEl.className = 'selector-count'; }
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
            if (!tab?.id) return;
            try {
                chrome.tabs.sendMessage(tab.id, { action: 'validateXpath', xpath }, (resp) => {
                    const err = chrome.runtime.lastError;
                    if (err) {
                        if (countEl) { countEl.textContent = 'err'; countEl.classList.add('err'); }
                        appendExecutionLog(`validateXpath error: ${err.message || err}`);
                        return;
                    }
                    const ok = resp?.ok;
                    const c = resp?.count;
                    if (!countEl) return;
                    if (!ok) {
                        countEl.textContent = 'err';
                        countEl.classList.add('err');
                        return;
                    }
                    countEl.textContent = String(c);
                    if (c === 1) countEl.classList.add('ok');
                    else if (c > 1) countEl.classList.add('warn');
                    else countEl.classList.add('err');
                });
            } catch (ex) {
                if (countEl) { countEl.textContent = 'err'; countEl.classList.add('err'); }
            }
        });
        return;
    }

    const editBtn = e.target.closest('.btn-edit-step');
    if (editBtn) {
        const step = executionList.find((s) => s.id === editBtn.dataset.id);
        if (step) showStepModal(step);
    }

    const copyXpathBtn = e.target.closest('.btn-copy-xpath');
    if (copyXpathBtn) {
        const step = executionList.find((s) => s.id === copyXpathBtn.dataset.stepId);
        const text = step ? (step.action === 'navigate' ? step.params?.url : step.xpath) || '' : '';
        if (text) {
            copyToClipboard(text).then(() => {
                const orig = copyXpathBtn.textContent;
                copyXpathBtn.textContent = '✓';
                setTimeout(() => { copyXpathBtn.textContent = orig; }, 1000);
            });
        }
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
            const stepWithVars = replaceVariablesInStep(step, getCurrentVariables());
            sendToContentAndWait(tab.id, { action: 'executeList', steps: [stepWithVars], continueOnError: true, ...getWaitAfterStepOptions() }).then((resp) => {
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
if (addUserActionBtn) {
    addUserActionBtn.addEventListener('click', () => {
        openListTab();
        showStepModal({ xpath: '—', action: 'user_action', params: { message: 'Подпишите документ ключом в открывшемся окне, затем нажмите Продолжить' } });
    });
}

// ——— Flow tab toolbar ———
if (flowAddStepBtn) {
    flowAddStepBtn.addEventListener('click', () => {
        let xpath = (currentResult?.primary?.xpath || (primaryXpathEl && primaryXpathEl.textContent) || '').trim();
        let action = 'click';
        let params = {};
        if (currentResult?.linkedControl?.xpath) {
            xpath = currentResult.linkedControl.xpath;
            action = currentResult.linkedControl.type === 'date' ? 'set_date' : 'input';
            if (action === 'set_date') params = { value: new Date().toISOString().slice(0, 10) };
        }
        if (!xpath) {
            flowAddStepBtn.textContent = 'Сначала выберите элемент';
            setTimeout(() => { flowAddStepBtn.textContent = '+ Добавить текущий'; }, 2000);
            return;
        }
        showStepModal({ xpath, action, params });
    });
}
if (flowAddManualBtn) flowAddManualBtn.addEventListener('click', () => showStepModal(null));
if (flowAddSeparatorBtn) {
    flowAddSeparatorBtn.addEventListener('click', () => {
        showStepModal({ xpath: '—', action: 'separator', params: { color: SEPARATOR_COLORS[0] } });
    });
}
if (flowAddUserActionBtn) {
    flowAddUserActionBtn.addEventListener('click', () => {
        showStepModal({ xpath: '—', action: 'user_action', params: { message: 'Подпишите документ ключом в открывшемся окне, затем нажмите Продолжить' } });
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
if (editorAssertCondition) editorAssertCondition.addEventListener('change', toggleEditorParams);
if (editorBranchCondition) editorBranchCondition.addEventListener('change', toggleEditorParams);
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
        const stepWithVars = replaceVariablesInStep(stepToRun, getCurrentVariables());
        sendToContentAndWait(tab.id, { action: 'executeList', steps: [stepWithVars], continueOnError: true, ...getWaitAfterStepOptions() }).then((resp) => {
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
        name: (scenarioName?.value || 'XPath Helper — сценарий').trim() || 'XPath Helper — сценарий',
        version: EXPORT_JSON_VERSION,
        exportedAt: new Date().toISOString(),
        steps: stepsToExport.map((s, i) => ({
            step: i + 1,
            xpath: s.xpath,
            action: s.action,
            title: s.title || '',
            tags: Array.isArray(s.tags) ? s.tags : [],
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

async function saveScenarioToLocalRunner() {
    if (!saveToLocalBtn) return;
    const stepsToExport = executionList.filter((s) => s.action !== 'separator');
    if (stepsToExport.length === 0) {
        saveToLocalBtn.textContent = 'Список пуст';
        setTimeout(() => { saveToLocalBtn.textContent = '💾 В раннер'; }, 2000);
        return;
    }
    const payload = buildExportPayload();
    const prev = saveToLocalBtn.textContent;
    saveToLocalBtn.textContent = 'Сохраняю...';
    logEvent('info', 'save_to_runner_click', { stepsCount: stepsToExport.length });
    try {
        const resp = await runnerFetch('/api/scenarios', { method: 'POST', body: JSON.stringify(payload) });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data.ok) throw new Error(data.error || `HTTP ${resp.status}`);
        appendExecutionLog(`💾 Сохранено в раннер: ${data.scenario?.id || 'ok'}`);
        saveToLocalBtn.textContent = '✓ Сохранено';
        setTimeout(() => { saveToLocalBtn.textContent = '💾 В раннер'; }, 1500);
    } catch (e) {
        const msg = String(e?.message || e || 'Ошибка').slice(0, 80);
        appendExecutionLog(`Ошибка сохранения в раннер: ${msg}`);
        logEvent('error', 'save_to_runner_failed', { error: msg });
        saveToLocalBtn.textContent = '✗ Ошибка';
        setTimeout(() => { saveToLocalBtn.textContent = '💾 В раннер'; }, 2000);
    } finally {
        // keep button enabled
    }
}

function parseImportFile(data) {
    let raw = Array.isArray(data) ? data : (data?.steps || []);
    if (raw.length && raw.some((s) => s.step != null)) {
        raw = [...raw].sort((a, b) => (Number(a.step) || 0) - (Number(b.step) || 0));
    }
    return raw.map((s, i) => ({
        id: 'step-' + Date.now() + '-' + i + '-' + Math.random().toString(36).slice(2),
        xpath: typeof s.xpath === 'string' ? s.xpath : (s.action === 'separator' ? '—' : ''),
        action: ['start', 'end', 'click', 'click_if_exists', 'input', 'set_date', 'file_upload', 'wait', 'wait_for_element', 'user_action', 'assert', 'branch', 'navigate', 'separator'].includes(s.action) ? s.action : 'click',
        title: typeof s.title === 'string' ? s.title : '',
        tags: Array.isArray(s.tags) ? s.tags.map((t) => String(t)).filter(Boolean).slice(0, 12) : [],
        params: s.params && typeof s.params === 'object' ? s.params : {}
    })).filter((s) => s.xpath || s.action === 'separator' || s.action === 'start' || s.action === 'end');
}

function clearAllSteps() {
    if (!clearStepsBtn) return;
    if (executionList.length === 0) {
        clearStepsBtn.textContent = 'Пусто';
        setTimeout(() => { clearStepsBtn.textContent = '🗑 Очистить'; }, 1500);
        return;
    }
    const ok = confirm(`Очистить все шаги? (${executionList.length})`);
    if (!ok) return;
    executionList = [makeDefaultStartStep()];
    lastExecutionReport = [];
    currentExecutingStepId = null;
    saveExecutionList();
    renderExecutionList();
    renderEditorStepList();
    if (tabFlow?.classList?.contains('active')) renderFlowCanvas();
    if (executionLog) executionLog.textContent = '';
    document.querySelector('.tab[data-tab="log"]')?.classList.remove('log-has-content');
    appendExecutionLog('Список шагов очищен');
    logEvent('info', 'steps_cleared', { count: 0 });
    clearStepsBtn.textContent = '✓ Очищено';
    setTimeout(() => { clearStepsBtn.textContent = '🗑 Очистить'; }, 1500);
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
    ensureStartStepInExecutionList();
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
        if (s.action === 'input' || s.action === 'set_date') return `  await page.locator('xpath=${s.xpath.replace(/'/g, "\\'")}').fill('${(s.params?.value || '').replace(/'/g, "\\'")}');`;
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
        if (s.action === 'input' || s.action === 'set_date') return `  cy.xpath('${s.xpath.replace(/'/g, "\\'")}').type('${(s.params?.value || '').replace(/'/g, "\\'")}');`;
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
        if (s.action === 'input' || s.action === 'set_date') return `  driver.findElement(By.xpath("${s.xpath.replace(/"/g, '\\"')}")).sendKeys("${(s.params?.value || '').replace(/"/g, '\\"')}");`;
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

// ——— Python Playwright settings ———
function savePythonSettings() {
    pythonSettings = {
        executablePath: (pythonExecutablePath?.value || '').trim() || PYTHON_DEFAULTS.executablePath,
        userDataDir: (pythonUserDataDir?.value || '').trim() || PYTHON_DEFAULTS.userDataDir,
        debugPort: parseInt(pythonDebugPort?.value, 10) || PYTHON_DEFAULTS.debugPort,
        headless: !!pythonHeadless?.checked
    };
    chrome.storage.local.set({ [STORAGE_KEY_PYTHON_SETTINGS]: pythonSettings });
}

function getPythonLaunchCode() {
    const esc = (s) => (s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const ep = esc(pythonSettings.executablePath || PYTHON_DEFAULTS.executablePath);
    const ud = esc(pythonSettings.userDataDir || PYTHON_DEFAULTS.userDataDir);
    const port = pythonSettings.debugPort ?? PYTHON_DEFAULTS.debugPort;
    const headless = pythonSettings.headless ? 'True' : 'False';
    const pad = '        ';
    return `${pad}browser = p.chromium.launch(
${pad}    executable_path="${ep}",
${pad}    args=[
${pad}        "--remote-debugging-port=${port}",
${pad}        "--user-data-dir=${ud}",
${pad}    ],
${pad}    headless=${headless},
${pad})`;
}

if (pythonSettingsBtn) pythonSettingsBtn.addEventListener('click', () => {
    if (pythonExecutablePath) pythonExecutablePath.value = pythonSettings.executablePath || PYTHON_DEFAULTS.executablePath;
    if (pythonUserDataDir) pythonUserDataDir.value = pythonSettings.userDataDir || PYTHON_DEFAULTS.userDataDir;
    if (pythonDebugPort) pythonDebugPort.value = pythonSettings.debugPort ?? PYTHON_DEFAULTS.debugPort;
    if (pythonHeadless) pythonHeadless.checked = !!pythonSettings.headless;
    if (pythonSettingsModal) pythonSettingsModal.classList.remove('hidden');
});
if (pythonSettingsSave) pythonSettingsSave.addEventListener('click', () => {
    savePythonSettings();
    if (pythonSettingsModal) pythonSettingsModal.classList.add('hidden');
});
if (pythonSettingsCancel) pythonSettingsCancel.addEventListener('click', () => {
    if (pythonSettingsModal) pythonSettingsModal.classList.add('hidden');
});

// ——— Export Python Playwright (chromium-gost) ———
function stepToPythonPlaywright(s) {
    const esc = (str) => (str || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const pad = '            ';
    if (s.action === 'click') return `${pad}page.locator("xpath=${esc(s.xpath)}").click()`;
    if (s.action === 'click_if_exists') return `${pad}try:\n${pad}    page.locator("xpath=${esc(s.xpath)}").click(timeout=500)\n${pad}except Exception:\n${pad}    pass`;
    if (s.action === 'input' || s.action === 'set_date') return `${pad}page.locator("xpath=${esc(s.xpath)}").fill("${esc(s.params?.value || '')}")`;
    if (s.action === 'wait') return `${pad}page.wait_for_timeout(${s.params?.delayMs ?? 500})`;
    if (s.action === 'wait_for_element') return `${pad}page.locator("xpath=${esc(s.xpath)}").wait_for(timeout=${s.params?.timeoutMs ?? 5000})`;
    if (s.action === 'navigate') return `${pad}page.goto("${esc(s.params?.url || '')}")`;
    if (s.action === 'file_upload') return `${pad}page.locator("xpath=${esc(s.xpath)}").set_input_files("${esc(s.params?.fileName || 'file')}")`;
    if (s.action === 'user_action') return `${pad}input("${esc(s.params?.message || 'Выполните действие и нажмите Enter')}")`;
    if (s.action === 'branch') return `${pad}# branch: ${s.params?.condition || '?'} ${s.params?.expectedValue ? `"${s.params.expectedValue}"` : ''}`;
    if (s.action === 'assert') return `${pad}# assert: ${s.params?.condition || '?'} ${s.params?.expectedValue ? `"${s.params.expectedValue}"` : ''}`;
    return `${pad}# ${s.action}: ${s.xpath}`;
}

function exportToPythonPlaywright() {
    const name = (scenarioName?.value || 'scenario').trim().replace(/[^a-zA-Z0-9_]/g, '_') || 'scenario';
    const steps = executionList.filter((s) => s.action !== 'separator');
    if (steps.length === 0) {
        if (exportPythonPlaywrightBtn) exportPythonPlaywrightBtn.textContent = 'Список пуст';
        setTimeout(() => { if (exportPythonPlaywrightBtn) exportPythonPlaywrightBtn.textContent = '📤 Python Playwright'; }, 2000);
        return;
    }
    const rows = dataRows.length > 0 ? dataRows : null;
    const stepsCode = steps.map(stepToPythonPlaywright).join('\n');
    const launchCode = getPythonLaunchCode();

    const conftestContent = `"""
XPath Helper Pro — conftest.py (pytest fixtures)
Положите в ту же папку, что и тесты.
Настройки: кнопка ⚙ Python в панели.
"""

import pytest
from playwright.sync_api import sync_playwright


@pytest.fixture(scope="function")
def page():
    with sync_playwright() as p:
        ${launchCode}
        context = browser.new_context()
        pg = context.new_page()
        try:
            yield pg
        finally:
            browser.close()
`;

    let testContent;
    if (rows && rows.length > 0) {
        const esc = (x) => (x || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const stepsCodeData = steps.map((s) => {
            const pad = '    ';
            if (s.action === 'click') return `${pad}page.locator("xpath=" + _sub("${esc(s.xpath)}", data) + "").click()`;
            if (s.action === 'click_if_exists') return `${pad}try:\n${pad}    page.locator("xpath=" + _sub("${esc(s.xpath)}", data) + "").click(timeout=500)\n${pad}except Exception:\n${pad}    pass`;
            if (s.action === 'input' || s.action === 'set_date') return `${pad}page.locator("xpath=" + _sub("${esc(s.xpath)}", data) + "").fill(_sub("${esc(s.params?.value || '')}", data))`;
            if (s.action === 'wait') return `${pad}page.wait_for_timeout(${s.params?.delayMs ?? 500})`;
            if (s.action === 'wait_for_element') return `${pad}page.locator("xpath=" + _sub("${esc(s.xpath)}", data) + "").wait_for(timeout=${s.params?.timeoutMs ?? 5000})`;
            if (s.action === 'navigate') return `${pad}page.goto(_sub("${esc(s.params?.url || '')}", data))`;
            if (s.action === 'file_upload') return `${pad}page.locator("xpath=" + _sub("${esc(s.xpath)}", data) + "").set_input_files(_sub("${esc(s.params?.fileName || 'file')}", data))`;
            if (s.action === 'user_action') return `${pad}input(_sub("${esc(s.params?.message || 'Выполните действие')}", data))`;
            if (s.action === 'branch') return `${pad}# branch: ${s.params?.condition || '?'}`;
            if (s.action === 'assert') return `${pad}# assert: ${s.params?.condition || '?'}`;
            return pad + stepToPythonPlaywright(s).trim();
        }).join('\n');
        testContent = `"""
XPath Helper Pro — экспорт в Python Playwright (data-driven)
Запуск: pytest test_${name}.py -v
Или: python test_${name}.py
Exit code: 0 при успехе, 1 при ошибке.
"""

import sys
import pytest
from playwright.sync_api import sync_playwright

DATA_ROWS = ${JSON.stringify(rows)}

def _sub(s, data):
    if not s: return ""
    for k, v in data.items():
        s = s.replace("{{" + k + "}}", str(v))
    return s

@pytest.fixture
def page():
    with sync_playwright() as p:
        ${launchCode}
        context = browser.new_context()
        pg = context.new_page()
        try:
            yield pg
        finally:
            browser.close()


@pytest.mark.parametrize("data", DATA_ROWS, ids=[f"row_{i+1}" for i in range(len(DATA_ROWS))])
def test_${name}(page, data):
${stepsCodeData}


if __name__ == "__main__":
    exit_code = pytest.main([__file__, "-v", "--tb=short"])
    sys.exit(exit_code)
`;
    } else {
        testContent = `"""
XPath Helper Pro — экспорт в Python Playwright (chromium-gost)
Запуск: pytest test_${name}.py -v  (с conftest.py)
Или: python test_${name}.py
Exit code: 0 при успехе, 1 при ошибке.
"""

import sys
import pytest
from playwright.sync_api import sync_playwright


@pytest.fixture
def page():
    with sync_playwright() as p:
        ${launchCode}
        context = browser.new_context()
        pg = context.new_page()
        try:
            yield pg
        finally:
            browser.close()


def test_${name}(page):
${stepsCode}


if __name__ == "__main__":
    exit_code = pytest.main([__file__, "-v", "--tb=short"])
    sys.exit(exit_code)
`;
    }

    const downloadFile = (content, filename) => {
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    downloadFile(testContent, `test_${name}.py`);
    downloadFile(conftestContent, 'conftest.py');
    if (exportPythonPlaywrightBtn) {
        exportPythonPlaywrightBtn.textContent = '✓ Скачано';
        setTimeout(() => { exportPythonPlaywrightBtn.textContent = '📤 Python Playwright'; }, 1500);
    }
}

if (exportPythonPlaywrightBtn) exportPythonPlaywrightBtn.addEventListener('click', exportToPythonPlaywright);

// ——— Export full POM template ———
function b64EncodeUtf8(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

function stepToPomAction(s) {
    const esc = (x) => (x || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const pad = '        ';
    if (s.action === 'click') return `${pad}self.click_with_wait("xpath=${esc(s.xpath)}", "${esc((s.xpath || '').substring(0, 40))}")`;
    if (s.action === 'click_if_exists') return `${pad}self.click_if_exists("xpath=${esc(s.xpath)}")`;
    if (s.action === 'input' || s.action === 'set_date') return `${pad}self.fill_with_validation("xpath=${esc(s.xpath)}", "${esc(s.params?.value || '')}")`;
    if (s.action === 'wait') return `${pad}self.page.wait_for_timeout(${s.params?.delayMs ?? 500})`;
    if (s.action === 'wait_for_element') return `${pad}self.wait_for_element("xpath=${esc(s.xpath)}", ${s.params?.timeoutMs ?? 5000})`;
    if (s.action === 'navigate') return `${pad}self.page.goto("${esc(s.params?.url || '')}")`;
    if (s.action === 'file_upload') return `${pad}self.page.locator("xpath=${esc(s.xpath)}").set_input_files("${esc(s.params?.fileName || 'file')}")`;
    if (s.action === 'user_action') return `${pad}input("${esc(s.params?.message || 'Выполните действие')}")`;
    if (s.action === 'branch') return `${pad}# branch: ${s.params?.condition || '?'}`;
    if (s.action === 'assert') return `${pad}# assert: ${s.params?.condition || '?'}`;
    return `${pad}# ${s.action}`;
}

function exportToPomTemplate() {
    const name = (scenarioName?.value || 'scenario').trim().replace(/[^a-zA-Z0-9_]/g, '_') || 'scenario';
    const steps = executionList.filter((s) => s.action !== 'separator');
    const launchCode = getPythonLaunchCode();
    const esc = (x) => (x || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const ep = esc(pythonSettings.executablePath || PYTHON_DEFAULTS.executablePath);
    const ud = esc(pythonSettings.userDataDir || PYTHON_DEFAULTS.userDataDir);
    const port = pythonSettings.debugPort ?? PYTHON_DEFAULTS.debugPort;
    const rows = dataRows.length > 0 ? dataRows : [];
    const hasData = rows.length > 0;

    const stepsCode = steps.map(stepToPomAction).join('\n');
    const stepsCodeData = hasData ? steps.map((s) => {
        const pad = '        ';
        if (s.action === 'click') return `${pad}self.click_with_wait("xpath=" + _sub("${esc(s.xpath)}", data), "click")`;
        if (s.action === 'input' || s.action === 'set_date') return `${pad}self.fill_with_validation("xpath=" + _sub("${esc(s.xpath)}", data), _sub("${esc(s.params?.value || '')}", data))`;
        if (s.action === 'navigate') return `${pad}self.page.goto(_sub("${esc(s.params?.url || '')}", data))`;
        if (s.action === 'file_upload') return `${pad}self.page.locator("xpath=" + _sub("${esc(s.xpath)}", data) + "").set_input_files(_sub("${esc(s.params?.fileName || 'file')}", data))`;
        return stepToPomAction(s);
    }).join('\n') : stepsCode;

    const files = {
        'config/__init__.py': '',
        'config/test_config.py': `"""Конфигурация тестов. Сгенерировано XPath Helper Pro."""

from dataclasses import dataclass
from pathlib import Path

@dataclass
class TestConfig:
    CHROMIUM_PATH: str = "${ep}"
    USER_DATA_DIR: str = "${ud}"
    DEBUG_PORT: int = ${port}
    DEFAULT_TIMEOUT: int = 30000
    TEST_FILES_DIR: Path = Path("test_data/files")

    @classmethod
    def get_certificate_data(cls):
        return {
            "number": "ЕАЭС RU С-RU.НЦ01.В.00403/24",
            "date": "20.02.2026",
            "file": cls.TEST_FILES_DIR / "certificate.pdf"
        }
`,
        'pages/__init__.py': '',
        'pages/base_page.py': `"""Базовый класс страницы с явными ожиданиями. XPath Helper Pro."""

import logging
from playwright.sync_api import Page, expect

logger = logging.getLogger(__name__)

class BasePage:
    def __init__(self, page: Page):
        self.page = page

    def click_with_wait(self, locator: str, description: str = "", timeout: int = 15000):
        """Клик с ожиданием видимости и scroll."""
        logger.info(f"🔘 Клик: {description or locator[:50]}")
        el = self.page.locator(locator)
        el.wait_for(state="visible", timeout=timeout)
        el.scroll_into_view_if_needed()
        el.click(timeout=5000)
        return self

    def click_if_exists(self, locator: str, timeout: int = 500):
        try:
            self.page.locator(locator).click(timeout=timeout)
        except Exception:
            pass
        return self

    def fill_with_validation(self, locator: str, value: str):
        """Заполнение с проверкой."""
        logger.info(f"✏️ Заполнение: {value[:30]}...")
        field = self.page.locator(locator)
        field.wait_for(state="visible", timeout=15000)
        field.fill(value)
        return self

    def wait_for_element(self, locator: str, timeout: int = 5000):
        self.page.locator(locator).wait_for(timeout=timeout)
        return self

    def wait_and_click_text(self, text: str):
        """Клик по тексту с normalize-space."""
        self.click_with_wait(f"//span[normalize-space()='{text}']", text)
        return self
`,
        'pages/scenario_page.py': `"""Page Object для сценария ${name}. Сгенерировано XPath Helper Pro."""

from .base_page import BasePage

class ScenarioPage(BasePage):
    def run_scenario(self):
        """Выполнение сценария."""
${stepsCode}
        return self
`,
        'tests/__init__.py': '',
        'tests/conftest.py': `"""Pytest fixtures. XPath Helper Pro."""

import pytest
from playwright.sync_api import sync_playwright
from config.test_config import TestConfig

@pytest.fixture(scope="function")
def browser_context():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=TestConfig.CHROMIUM_PATH,
            args=[
                f"--remote-debugging-port={TestConfig.DEBUG_PORT}",
                f"--user-data-dir={TestConfig.USER_DATA_DIR}",
            ],
            headless=False,
        )
        context = browser.new_context(
            viewport={"width": 1920, "height": 1080},
            locale="ru-RU"
        )
        yield context
        context.close()
        browser.close()

@pytest.fixture
def page(browser_context):
    return browser_context.new_page()
`,
        'test_data/__init__.py': '',
        'test_data/applicant_data.py': `"""Тестовые данные. Сгенерировано XPath Helper Pro."""

APPLICANT_DATA = {
    "inn": "784133001",
    "address": "143968, обл. Московская, г. Реутов, ш. Автомагистраль Москва-Нижний Новгород, д. 1, кв. 5",
    "suggested_address": "Московская обл, г Реутов, шоссе Автомагистраль Москва-Нижний Новгород, д 1, кв 5"
}

DATA_ROWS = ${JSON.stringify(rows)}
`,
        'utils/__init__.py': '',
        'utils/helpers.py': `"""Вспомогательные функции. XPath Helper Pro."""

def _sub(s: str, data: dict) -> str:
    if not s:
        return ""
    for k, v in data.items():
        s = s.replace("{{" + k + "}}", str(v))
    return s
`,
        'requirements.txt': `pytest>=7.4.0
playwright>=1.40.0
pytest-html>=4.0.0
allure-pytest>=2.13.0
python-dotenv>=1.0.0
`,
        'pytest.ini': `[pytest]
testpaths = tests
python_files = test_*.py
python_functions = test_*
addopts = -v --tb=short
markers =
    scenario: сценарии из XPath Helper
`,
        'README.md': `# Проект автотестов (POM)

Сгенерировано XPath Helper Pro.

## Установка

\`\`\`bash
pip install -r requirements.txt
playwright install chromium
\`\`\`

## Запуск

\`\`\`bash
pytest tests/ -v -m scenario
pytest tests/ --headed --screenshot=only-on-failure
allure serve allure-results  # если используете allure
\`\`\`

## Структура

- config/ — конфигурация
- pages/ — Page Object Model
- tests/ — тесты
- test_data/ — тестовые данные
- utils/ — хелперы
`
    };

    const testContent = hasData ? `"""Тест ${name} (data-driven). XPath Helper Pro."""

import sys
import logging
import pytest
from pages.scenario_page import ScenarioPage
from utils.helpers import _sub
from test_data.applicant_data import DATA_ROWS

logger = logging.getLogger(__name__)

@pytest.mark.scenario
@pytest.mark.parametrize("data", DATA_ROWS, ids=[f"row_{i+1}" for i in range(len(DATA_ROWS))])
def test_${name}(page, data):
    app = ScenarioPage(page)
    app.run_scenario_with_data(data)

if __name__ == "__main__":
    exit_code = pytest.main([__file__, "-v", "--tb=short"])
    sys.exit(exit_code)
` : `"""Тест ${name}. XPath Helper Pro."""

import sys
import logging
import pytest
from pages.scenario_page import ScenarioPage

logger = logging.getLogger(__name__)

@pytest.mark.scenario
def test_${name}(page):
    app = ScenarioPage(page)
    app.run_scenario()

if __name__ == "__main__":
    exit_code = pytest.main([__file__, "-v", "--tb=short"])
    sys.exit(exit_code)
`;

    if (hasData) {
        files['pages/scenario_page.py'] = `"""Page Object для сценария ${name} (data-driven). XPath Helper Pro."""

from .base_page import BasePage
from utils.helpers import _sub

class ScenarioPage(BasePage):
    def run_scenario_with_data(self, data):
        """Выполнение сценария с подстановкой переменных из data."""
${stepsCodeData}
        return self
`;
    }
    files['tests/test_' + name + '.py'] = testContent;

    const fileEntries = Object.entries(files);
    const b64Contents = fileEntries.map(([, c]) => b64EncodeUtf8(c));
    const createScript = `#!/usr/bin/env python3
# XPath Helper Pro — создание POM-проекта
# Запуск: python create_project_${name}.py

import base64
import os

FILES = {
${fileEntries.map(([path], i) => `    r"${path.replace(/\\/g, '/')}": r"${b64Contents[i]}",`).join('\n')}
}

def main():
    os.makedirs("test_results/screenshots", exist_ok=True)
    os.makedirs("test_data/files", exist_ok=True)
    for path, b64 in FILES.items():
        d = os.path.dirname(path)
        if d:
            os.makedirs(d, exist_ok=True)
        content = base64.b64decode(b64).decode("utf-8")
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Created: {path}")
    print("\\nГотово! Запустите: pytest tests/ -v -m scenario")

if __name__ == "__main__":
    main()
`;

    const blob = new Blob([createScript], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `create_project_${name}.py`;
    a.click();
    URL.revokeObjectURL(url);

    if (exportPomTemplateBtn) {
        exportPomTemplateBtn.textContent = '✓ Скачано';
        setTimeout(() => { exportPomTemplateBtn.textContent = '📦 POM-шаблон'; }, 1500);
    }
}

if (exportPomTemplateBtn) exportPomTemplateBtn.addEventListener('click', () => {
    const steps = executionList.filter((s) => s.action !== 'separator');
    if (steps.length === 0) {
        exportPomTemplateBtn.textContent = 'Список пуст';
        setTimeout(() => { exportPomTemplateBtn.textContent = '📦 POM-шаблон'; }, 2000);
        return;
    }
    exportToPomTemplate();
});

// ——— Copy log ———
if (copyLogBtn) copyLogBtn.addEventListener('click', () => {
    const text = executionLog?.textContent || '';
    if (!text) return;
    copyToClipboard(text).then(() => {
        copyLogBtn.textContent = '✓ Скопировано';
        setTimeout(() => { copyLogBtn.textContent = 'Копировать'; }, 1500);
    });
});

function exportReport(format) {
    const name = (scenarioName?.value || 'report').trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'report';
    const reportPath = (reportPathInput?.value || 'report.html').trim() || 'report.html';
    const report = lastExecutionReport;
    if (report.length === 0) {
        if (exportReportBtn) exportReportBtn.textContent = 'Нет отчёта';
        setTimeout(() => { if (exportReportBtn) exportReportBtn.textContent = '📤 Отчёт'; }, 2000);
        return;
    }
    const okCount = report.filter((r) => r.ok).length;
    const failCount = report.filter((r) => !r.ok).length;
    const totalMs = report.reduce((s, r) => s + (r.durationMs || 0), 0);
    if (format === 'json') {
        const data = { scenario: name, okCount, failCount, totalMs, timestamp: new Date().toISOString(), steps: report.map((r) => ({ ...r, screenshotBase64: r.screenshotBase64 ? '[base64]' : undefined })) };
        const blob = new Blob([JSON.stringify({ ...data, steps: report }, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (reportPath.replace(/\.html$/i, '') || 'report') + '.json';
        a.click();
        URL.revokeObjectURL(url);
    } else {
        const rows = report.map((r) => {
            const status = r.ok ? '✓' : '✗';
            const err = r.error ? ` — ${escapeHtml(r.error)}` : '';
            const screenshot = r.screenshotBase64 ? `<br><img src="${r.screenshotBase64}" alt="screenshot" style="max-width:100%;max-height:300px;border:1px solid #333;">` : '';
            return `<tr class="${r.ok ? 'ok' : 'fail'}"><td>${status}</td><td>${escapeHtml(r.step?.id || '')}</td><td>${escapeHtml(r.step?.action || '')}</td><td>${escapeHtml((r.step?.xpath || r.step?.params?.url || '').substring(0, 60))}</td><td>${r.durationMs || 0}мс</td><td>${escapeHtml(r.error || '')}${screenshot}</td></tr>`;
        }).join('');
        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Отчёт ${escapeHtml(name)}</title><style>body{font-family:sans-serif;background:#1a1a2e;color:#eee;padding:20px;}.ok{color:#2ecc71}.fail{color:#e74c3c}table{border-collapse:collapse;width:100%}th,td{border:1px solid #333;padding:8px;text-align:left}th{background:#16213e}</style></head><body><h1>Отчёт: ${escapeHtml(name)}</h1><p>Успешно: ${okCount} | Ошибок: ${failCount} | Время: ${totalMs}мс</p><table><thead><tr><th>Статус</th><th>ID</th><th>Действие</th><th>XPath/URL</th><th>Время</th><th>Ошибка</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = /\.html$/i.test(reportPath) ? reportPath : (reportPath || 'report') + (reportPath && reportPath.includes('.') ? '' : '.html');
        a.click();
        URL.revokeObjectURL(url);
    }
    if (exportReportBtn) {
        exportReportBtn.textContent = '✓ Скачано';
        setTimeout(() => { exportReportBtn.textContent = '📤 Отчёт'; }, 1500);
    }
}

if (reportPathInput) reportPathInput.addEventListener('change', () => {
    const v = reportPathInput.value?.trim();
    if (v) chrome.storage.local.set({ [STORAGE_KEY_REPORT_PATH]: v });
});
if (exportReportBtn) {
    exportReportBtn.addEventListener('click', () => {
        const report = lastExecutionReport;
        if (report.length === 0) {
            exportReportBtn.textContent = 'Нет отчёта';
            setTimeout(() => { exportReportBtn.textContent = '📤 Отчёт'; }, 2000);
            return;
        }
        exportReport('html');
    });
}

const clearLogBtn = $('clearLogBtn');
if (clearLogBtn) clearLogBtn.addEventListener('click', () => {
    if (executionLog) executionLog.textContent = '';
    document.querySelector('.tab[data-tab="log"]')?.classList.remove('log-has-content');
});

if (exportJsonBtn) exportJsonBtn.addEventListener('click', exportToJson);
if (saveToLocalBtn) saveToLocalBtn.addEventListener('click', saveScenarioToLocalRunner);
if (clearStepsBtn) clearStepsBtn.addEventListener('click', clearAllSteps);
if (importJsonBtn) importJsonBtn.addEventListener('click', () => importJsonInput.click());
if (importJsonInput) importJsonInput.addEventListener('change', () => {
    const f = importJsonInput.files?.[0];
    if (f) importFromJson(f);
    importJsonInput.value = '';
});

// ——— Data-driven: CSV/JSON ———
function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map((h) => h.trim().replace(/^["']|["']$/g, ''));
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(',').map((v) => v.trim().replace(/^["']|["']$/g, ''));
        const obj = {};
        headers.forEach((h, j) => { obj[h] = vals[j] ?? ''; });
        rows.push(obj);
    }
    return rows;
}

function parseDataFile(data) {
    if (Array.isArray(data)) return data;
    if (data?.data && Array.isArray(data.data)) return data.data;
    if (data?.rows && Array.isArray(data.rows)) return data.rows;
    return [];
}

function importFromData(file) {
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const text = reader.result;
            let rows = [];
            if (file.name.toLowerCase().endsWith('.csv')) {
                rows = parseCSV(text);
            } else {
                const data = JSON.parse(text);
                rows = parseDataFile(data);
            }
            if (rows.length === 0) {
                if (importDataBtn) importDataBtn.textContent = 'Нет данных';
                setTimeout(() => { if (importDataBtn) importDataBtn.textContent = '📊 Данные'; }, 2000);
                return;
            }
            dataRows = rows;
            chrome.storage.local.set({ [STORAGE_KEY_DATA_ROWS]: dataRows });
            if (importDataBtn) importDataBtn.textContent = `✓ ${rows.length} строк`;
            setTimeout(() => { if (importDataBtn) importDataBtn.textContent = '📊 Данные'; }, 2000);
        } catch (e) {
            if (importDataBtn) importDataBtn.textContent = 'Ошибка';
            setTimeout(() => { if (importDataBtn) importDataBtn.textContent = '📊 Данные'; }, 2000);
        }
    };
    reader.readAsText(file, 'UTF-8');
}

if (importDataBtn) importDataBtn.addEventListener('click', () => importDataInput?.click());
if (importDataInput) importDataInput.addEventListener('change', () => {
    const f = importDataInput.files?.[0];
    if (f) importFromData(f);
    importDataInput.value = '';
});

async function runDataDrivenExecution(tabId) {
    const startIx = findScenarioStartIndex(executionList);
    const stepsToRun = executionList.slice(startIx).filter((s) => s.action !== 'separator');
    if (stepsToRun.length === 0) {
        if (executeDataDrivenBtn) executeDataDrivenBtn.textContent = 'Нет шагов';
        setTimeout(() => { if (executeDataDrivenBtn) executeDataDrivenBtn.textContent = '▶ Data-driven'; }, 2000);
        return;
    }
    const rows = dataRows.length > 0 ? dataRows : [{}];
    if (executionLog) executionLog.textContent = '';
    appendExecutionLog(`Data-driven: ${rows.length} итераций`);
    setExecutionUIRunning(true);
    let totalOk = 0;
    let totalFail = 0;
    const allReports = [];
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        appendExecutionLog(`——— Итерация ${i + 1}/${rows.length} ———`);
        const vars = getCurrentVariables(row);
        const stepsWithVars = stepsToRun.map((s) => replaceVariablesInStep(s, vars));
        if (needsStepByStepExecution()) {
            lastExecutionReport = [];
            await runExecutionWithBranchingForDataRow(tabId, stepsWithVars, stepsToRun);
            allReports.push(...lastExecutionReport.map((r) => ({ ...r, iteration: i + 1, row })));
            const ok = lastExecutionReport.filter((r) => r.ok).length;
            const fail = lastExecutionReport.filter((r) => !r.ok).length;
            totalOk += ok;
            totalFail += fail;
        } else {
            const resp = await sendToContentAndWait(tabId, {
                action: 'executeList',
                steps: stepsWithVars,
                continueOnError: !stopOnErrorEl?.checked,
                stepDelayMs: Math.max(0, parseInt(stepDelayMsEl?.value, 10) || STEP_DELAY_DEFAULT),
                ...getWaitAfterStepOptions()
            });
            const results = resp?.results || [];
            results.forEach((r) => {
                const step = stepsToRun.find((s) => s.id === r.id);
                allReports.push({ stepId: r.id, step, ok: r.ok, error: r.error, durationMs: r.durationMs, iteration: i + 1, row });
            });
            const ok = results.filter((r) => r.ok).length;
            const fail = results.filter((r) => !r.ok).length;
            totalOk += ok;
            totalFail += fail;
            results.forEach((r) => appendExecutionLog(r.ok ? `✓ ${r.id}` : `✗ ${r.id}: ${r.error || ''}`));
        }
    }
    lastExecutionReport = allReports;
    setExecutionUIRunning(false);
    appendExecutionLog(`Готово: ${totalOk} ок, ${totalFail} ошибок`);
    if (executeDataDrivenBtn) {
        executeDataDrivenBtn.textContent = `✓ ${totalOk}`;
        setTimeout(() => { executeDataDrivenBtn.textContent = '▶ Data-driven'; }, 2500);
    }
}

async function runExecutionWithBranchingForDataRow(tabId, stepsWithVars, originalSteps) {
    const continueOnError = !stopOnErrorEl?.checked;
    const stepDelay = Math.max(0, parseInt(stepDelayMsEl?.value, 10) || STEP_DELAY_DEFAULT);
    const selectorTimeout = parseInt(selectorTimeoutMsEl?.value, 10) || 5000;
    const runSteps = normalizeRunOrderForExecution(stepsWithVars);
    let currentIdx = findScenarioStartIndex(runSteps);
    const visited = new Set();
    while (currentIdx >= 0 && currentIdx < runSteps.length && !stopExecutionRequested) {
        const step = runSteps[currentIdx];
        if (step.action === 'separator') { currentIdx++; continue; }
        if (visited.has(step.id)) break;
        visited.add(step.id);
        setStepStatus(step.id, 'running', '');
        currentExecutingStepId = step.id;
        renderExecutionList();
        if (stepDelay > 0 && currentIdx > 0) await new Promise((r) => setTimeout(r, stepDelay));
        try {
            if (step.action === 'start') {
                lastExecutionReport.push({ stepId: step.id, step, ok: true, durationMs: 0, timestamp: new Date().toISOString() });
                currentIdx++;
                continue;
            }
            if (step.action === 'end') {
                lastExecutionReport.push({ stepId: step.id, step, ok: true, durationMs: 0, timestamp: new Date().toISOString() });
                break;
            }
            if (step.action === 'user_action') {
                await waitForUserAction(step.params?.message || 'Выполните действие');
                lastExecutionReport.push({ stepId: step.id, step, ok: true, durationMs: 0, timestamp: new Date().toISOString() });
                currentIdx++;
                continue;
            }
            if (step.action === 'navigate') {
                const url = (step.params?.url || '').trim();
                if (!url) { currentIdx++; continue; }
                await new Promise((resolve) => {
                    const listener = (id, info) => { if (id === tabId && info.status === 'complete') { chrome.tabs.onUpdated.removeListener(listener); resolve(); } };
                    chrome.tabs.onUpdated.addListener(listener);
                    chrome.tabs.update(tabId, { url: url.startsWith('http') ? url : 'https://' + url });
                    setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); resolve(); }, 30000);
                });
                lastExecutionReport.push({ stepId: step.id, step, ok: true, durationMs: 0, timestamp: new Date().toISOString() });
                currentIdx++;
                await new Promise((r) => setTimeout(r, 1500));
                continue;
            }
            const stepTimeout = Math.max(60000, (step.params?.timeoutMs ?? selectorTimeout) + 15000);
            const resp = await sendToContentAndWait(tabId, { action: 'executeStep', step, selectorTimeoutMs: step.params?.timeoutMs ?? selectorTimeout, ...getWaitAfterStepOptions() }, stepTimeout);
            if (!resp?.ok) {
                lastExecutionReport.push({ stepId: step.id, step, ok: false, error: resp?.error, durationMs: 0, timestamp: new Date().toISOString() });
                highlightElementOnError(tabId, step);
                if (step.params?.mandatory !== false && !continueOnError) break;
            } else {
                lastExecutionReport.push({ stepId: step.id, step, ok: true, durationMs: 0, timestamp: new Date().toISOString() });
                let nextId = null;
                if (step.action === 'branch' && (step.params?.nextId || step.params?.nextElseId)) nextId = resp.conditionResult ? step.params.nextId : step.params.nextElseId;
                if (nextId) {
                    const nextIdx = runSteps.findIndex((s) => s.id === nextId);
                    currentIdx = nextIdx >= 0 ? nextIdx : currentIdx + 1;
                } else currentIdx++;
            }
        } catch (err) {
            lastExecutionReport.push({ stepId: step.id, step, ok: false, error: getTabErrorMessage(err), durationMs: 0, timestamp: new Date().toISOString() });
            if (!continueOnError) break;
            currentIdx++;
        }
    }
    currentExecutingStepId = null;
}

if (executeDataDrivenBtn) executeDataDrivenBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (!tab?.id) return;
        runDataDrivenExecution(tab.id);
    });
});

// ——— Execute list ———
function findScenarioStartIndex(list) {
    const i = list.findIndex((s) => s.action === 'start');
    return i >= 0 ? i : 0;
}

/** start — в начало, end — в конец (ветки могут вести к «Конец»), прочие — между ними в исходном порядке. */
function normalizeRunOrderForExecution(list) {
    if (!Array.isArray(list) || list.length === 0) return list;
    const starts = list.filter((s) => s.action === 'start');
    const ends = list.filter((s) => s.action === 'end');
    const rest = list.filter((s) => s.action !== 'start' && s.action !== 'end');
    if (starts.length === 0 && ends.length === 0) return list;
    return [...starts, ...rest, ...ends];
}

function makeDefaultStartStep() {
    return {
        id: 'step-start-' + Date.now() + '-' + Math.random().toString(36).slice(2),
        xpath: '—',
        action: 'start',
        title: 'Начало',
        params: { mandatory: true, stepColor: '#00e676', waitForLoad: false }
    };
}

/** Гарантирует один шаг «Начало» в начале списка (для всех сценариев в расширении). */
function ensureStartStepInExecutionList() {
    if (executionList.some((s) => s.action === 'start')) return false;
    executionList.unshift(makeDefaultStartStep());
    return true;
}

function hasBranching() {
    return executionList.some((s) => s.params?.nextId || s.params?.nextElseId);
}

function needsStepByStepExecution() {
    return hasBranching() || executionList.some((s) => s.action === 'navigate') || executionList.some((s) => s.action === 'user_action') || executionList.some((s) => s.params?.mandatory === false);
}

async function runExecutionWithBranching(tabId, fromStepId) {
    const stepsToRun = executionList.filter((s) => s.action !== 'separator');
    if (stepsToRun.length === 0) return;
    const runList = fromStepId ? executionList : normalizeRunOrderForExecution(executionList);
    let currentIdx = fromStepId ? executionList.findIndex((s) => s.id === fromStepId) : findScenarioStartIndex(runList);
    if (currentIdx < 0) currentIdx = 0;
    const continueOnError = !stopOnErrorEl?.checked;
    const stepDelay = Math.max(0, parseInt(stepDelayMsEl?.value, 10) || STEP_DELAY_DEFAULT);
    const selectorTimeout = parseInt(selectorTimeoutMsEl?.value, 10) || 5000;
    let okCount = 0;
    const visited = new Set();
    stopExecutionRequested = false;
    lastExecutionReport = [];
    const reportStart = Date.now();

    while (currentIdx >= 0 && currentIdx < runList.length && !stopExecutionRequested) {
        const step = runList[currentIdx];
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
            if (step.action === 'start') {
                const t0 = Date.now();
                const note = (step.params?.message || '').trim();
                appendExecutionLog(`▶ ${step.id}: начало сценария${note ? ` — ${note}` : ''}`);
                okCount++;
                setStepStatus(step.id, 'ok', '');
                lastExecutionReport.push({ stepId: step.id, step, ok: true, durationMs: Date.now() - t0, timestamp: new Date().toISOString() });
                currentIdx++;
                continue;
            }
            if (step.action === 'end') {
                const t0 = Date.now();
                const note = (step.params?.message || '').trim();
                appendExecutionLog(`■ ${step.id}: конец сценария${note ? ` — ${note}` : ''}`);
                okCount++;
                setStepStatus(step.id, 'ok', '');
                lastExecutionReport.push({ stepId: step.id, step, ok: true, durationMs: Date.now() - t0, timestamp: new Date().toISOString() });
                break;
            }
            if (step.action === 'user_action') {
                const t0 = Date.now();
                appendExecutionLog(`⏸ ${step.id}: ожидание действий пользователя`);
                await waitForUserAction(step.params?.message || 'Выполните действие (подпись, выбор сертификата и т.д.) и нажмите Продолжить');
                okCount++;
                setStepStatus(step.id, 'ok', '');
                appendExecutionLog(`✓ ${step.id} (${Date.now() - t0}мс)`);
                lastExecutionReport.push({ stepId: step.id, step, ok: true, durationMs: Date.now() - t0, timestamp: new Date().toISOString() });
                currentIdx++;
                continue;
            }
            if (step.action === 'navigate') {
                const t0 = Date.now();
                const stepWithVars = replaceVariablesInStep(step, getCurrentVariables());
                const url = (stepWithVars.params?.url || '').trim();
                if (!url) {
                    setStepStatus(step.id, 'error', 'URL не указан');
                    appendExecutionLog(`✗ ${step.id}: URL не указан`);
                    lastExecutionReport.push({ stepId: step.id, step, ok: false, error: 'URL не указан', durationMs: Date.now() - t0, timestamp: new Date().toISOString() });
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
                appendExecutionLog(`✓ ${step.id} → ${url} (${Date.now() - t0}мс)`);
                lastExecutionReport.push({ stepId: step.id, step, ok: true, durationMs: Date.now() - t0, timestamp: new Date().toISOString() });
                currentIdx++;
                await new Promise((r) => setTimeout(r, 1500)); // даём content script загрузиться на новой странице
                continue;
            }
            const stepTimeout = Math.max(60000, (step.params?.timeoutMs ?? selectorTimeout) + 15000);
            const t0 = Date.now();
            const stepWithVars = replaceVariablesInStep(step, getCurrentVariables());
            const resp = await sendToContentAndWait(tabId, {
                action: 'executeStep',
                step: stepWithVars,
                selectorTimeoutMs: stepWithVars.params?.timeoutMs ?? selectorTimeout,
                ...getWaitAfterStepOptions()
            }, stepTimeout);
            if (!resp?.ok) {
                const errMsg = resp?.error || 'Ошибка';
                setStepStatus(step.id, 'error', errMsg);
                appendExecutionLog(`✗ ${step.id}: ${errMsg} (${Date.now() - t0}мс)`);
                highlightElementOnError(tabId, step);
                const screenshot = await captureScreenshotOnError(tabId);
                lastExecutionReport.push({ stepId: step.id, step, ok: false, error: errMsg, durationMs: Date.now() - t0, screenshotBase64: screenshot, timestamp: new Date().toISOString() });
                const mandatory = step.params?.mandatory !== false;
                if (mandatory && !continueOnError) break;
                currentIdx++;
                continue;
            }
            okCount++;
            setStepStatus(step.id, 'ok', '');
            appendExecutionLog(`✓ ${step.id} (${Date.now() - t0}мс)`);
            lastExecutionReport.push({ stepId: step.id, step, ok: true, durationMs: Date.now() - t0, timestamp: new Date().toISOString() });
            let nextId = null;
            if (step.action === 'branch' && (step.params?.nextId || step.params?.nextElseId)) {
                nextId = resp.conditionResult ? step.params.nextId : step.params.nextElseId;
            }
            if (nextId) {
                const nextIdx = runList.findIndex((s) => s.id === nextId);
                currentIdx = nextIdx >= 0 ? nextIdx : currentIdx + 1;
            } else {
                currentIdx++;
            }
        } catch (err) {
            const msg = getTabErrorMessage(err);
            const durationMs = typeof t0 !== 'undefined' ? Date.now() - t0 : 0;
            setStepStatus(step.id, 'error', msg);
            appendExecutionLog(`✗ ${step.id}: ${msg} (${durationMs}мс)`);
            highlightElementOnError(tabId, step);
            const screenshot = await captureScreenshotOnError(tabId);
            lastExecutionReport.push({ stepId: step.id, step, ok: false, error: msg, durationMs, screenshotBase64: screenshot, timestamp: new Date().toISOString() });
            if (isBfcacheError(err)) showBfcacheBanner();
            if (!continueOnError) break;
            currentIdx++;
        }
    }
    currentExecutingStepId = null;
    setExecutionUIRunning(false);
    renderExecutionList();
    const totalDuration = Date.now() - reportStart;
    appendExecutionLog(stopExecutionRequested ? 'Остановлено' : `Готово: ${okCount} шагов (всего ${totalDuration}мс)`);
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
        lastExecutionReport = [];
        const batchStart = Date.now();
        const stepsWithVars = stepsToRun.map((s) => replaceVariablesInStep(s, getCurrentVariables()));
        sendToContentAndWait(tab.id, {
            action: 'executeList',
            steps: stepsWithVars,
            continueOnError,
            stepDelayMs: stepDelay
        }).then(async (resp) => {
            const results = resp?.results || [];
            let okCount = 0;
            let firstFailedStep = null;
            for (const r of results) {
                if (!r?.id) continue;
                const step = stepsToRun.find((s) => s.id === r.id);
                lastExecutionReport.push({ stepId: r.id, step, ok: r.ok, error: r.error, durationMs: r.durationMs || 0, timestamp: new Date().toISOString() });
                if (r.ok) {
                    okCount++;
                    setStepStatus(r.id, 'ok', '');
                    appendExecutionLog(`✓ ${r.id}${r.durationMs ? ` (${r.durationMs}мс)` : ''}`);
                } else {
                    if (!firstFailedStep) firstFailedStep = r;
                    setStepStatus(r.id, 'error', r.error || 'Ошибка');
                    appendExecutionLog(`✗ ${r.id}: ${r.error || 'Ошибка'}${r.durationMs ? ` (${r.durationMs}мс)` : ''}`);
                }
            }
            if (firstFailedStep) {
                const failedEntry = lastExecutionReport.find((e) => e.stepId === firstFailedStep.id && !e.ok);
                const step = failedEntry?.step || stepsToRun.find((s) => s.id === firstFailedStep.id);
                if (step) highlightElementOnError(tab.id, step);
                const screenshot = await captureScreenshotOnError(tab.id);
                const entry = lastExecutionReport.find((e) => e.stepId === firstFailedStep.id && !e.ok);
                if (entry) entry.screenshotBase64 = screenshot;
            }
            appendExecutionLog(`Готово: ${okCount}/${stepsToRun.length} (всего ${Date.now() - batchStart}мс)`);
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
    executionLog.textContent += `[${t}] ${maskSecretsInText(String(line))}\n`;
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
        const startIx = findScenarioStartIndex(executionList);
        const stepsToRun = executionList.slice(startIx).filter((s) => s.action !== 'separator');
        if (stepsToRun.length === 0) {
            executeListBtn.textContent = 'Нет шагов для выполнения';
            setTimeout(() => { executeListBtn.textContent = '▶ Выполнить'; }, 2000);
            return;
        }
        if (needsStepByStepExecution()) {
            if (executionLog) executionLog.textContent = '';
            appendExecutionLog(`Старт (пошагово) с позиции ${startIx + 1}: ${stepsToRun.length} шагов`);
            setExecutionUIRunning(true);
            runExecutionWithBranching(tab.id, null);
            return;
        }
        const continueOnError = !stopOnErrorEl?.checked;
        const stepDelay = Math.max(0, parseInt(stepDelayMsEl?.value, 10) || STEP_DELAY_DEFAULT);
        if (executionLog) executionLog.textContent = '';
        appendExecutionLog(`Старт с позиции ${startIx + 1}: ${stepsToRun.length} шагов`);
        stepsToRun.forEach((s) => setStepStatus(s.id, 'running', ''));
        currentExecutingStepId = stepsToRun[0]?.id || null;
        setExecutionUIRunning(true);
        renderExecutionList();
        lastExecutionReport = [];
        const batchStart = Date.now();
        const stepsWithVars = stepsToRun.map((s) => replaceVariablesInStep(s, getCurrentVariables()));
        sendToContentAndWait(tab.id, {
            action: 'executeList',
            steps: stepsWithVars,
            continueOnError,
            stepDelayMs: stepDelay
        }).then(async (resp) => {
            const results = resp?.results || [];
            let okCount = 0;
            let firstFailedStep = null;
            for (const r of results) {
                if (!r?.id) continue;
                const step = stepsToRun.find((s) => s.id === r.id);
                lastExecutionReport.push({ stepId: r.id, step, ok: r.ok, error: r.error, durationMs: r.durationMs || 0, timestamp: new Date().toISOString() });
                if (r.ok) {
                    okCount++;
                    setStepStatus(r.id, 'ok', '');
                    appendExecutionLog(`✓ ${r.id}${r.durationMs ? ` (${r.durationMs}мс)` : ''}`);
                } else {
                    if (!firstFailedStep) firstFailedStep = r;
                    setStepStatus(r.id, 'error', r.error || 'Ошибка');
                    appendExecutionLog(`✗ ${r.id}: ${r.error || 'Ошибка'}${r.durationMs ? ` (${r.durationMs}мс)` : ''}`);
                }
            }
            if (firstFailedStep) {
                const failedEntry = lastExecutionReport.find((e) => e.stepId === firstFailedStep.id && !e.ok);
                const step = failedEntry?.step || stepsToRun.find((s) => s.id === firstFailedStep.id);
                if (step) highlightElementOnError(tab.id, step);
                const screenshot = await captureScreenshotOnError(tab.id);
                const entry = lastExecutionReport.find((e) => e.stepId === firstFailedStep.id && !e.ok);
                if (entry) entry.screenshotBase64 = screenshot;
            }
            appendExecutionLog(`Готово: ${okCount}/${stepsToRun.length} (всего ${Date.now() - batchStart}мс)`);
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

async function runHealthCheck(tabId) {
    const steps = executionList.filter((s) => s.action !== 'separator' && s.action !== 'navigate' && s.action !== 'user_action');
    if (steps.length === 0) {
        appendExecutionLog('Health-check: нет шагов с XPath');
        return;
    }
    appendExecutionLog(`Health-check: ${steps.length} шагов…`);
    let ok = 0, warn = 0, bad = 0;
    for (const step of steps) {
        const xps = [];
        if (step.xpath) xps.push({ kind: 'primary', idx: 0, xp: step.xpath });
        const fx = Array.isArray(step.params?.fallbackXPaths) ? step.params.fallbackXPaths : [];
        fx.slice(0, 5).forEach((xp, i) => { if (xp) xps.push({ kind: 'fallback', idx: i, xp: String(xp) }); });
        for (const item of xps) {
            const xp = replaceVariables(item.xp, getCurrentVariables());
            const resp = await sendToContentAndWait(tabId, { action: 'validateXpath', xpath: xp }, 8000).catch((e) => ({ ok: false, error: e?.message || String(e) }));
            const count = resp?.count;
            const line = `HC #${step.id} ${item.kind}${item.kind === 'fallback' ? '[' + item.idx + ']' : ''} → ${typeof count === 'number' ? count : 'err'}: ${truncate(xp, 80)}`;
            if (!resp?.ok) { bad++; appendExecutionLog(line + ` (${resp?.error || 'error'})`); continue; }
            if (count === 1) { ok++; appendExecutionLog(line); }
            else if (count === 0) { bad++; appendExecutionLog(line + ' (NOT FOUND)'); }
            else { warn++; appendExecutionLog(line + ' (NOT UNIQUE)'); }
        }
    }
    appendExecutionLog(`Health-check done: ok=${ok} warn=${warn} bad=${bad}`);
}

if (healthCheckBtn) {
    healthCheckBtn.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
            if (!tab?.id) return;
            const prev = healthCheckBtn.textContent;
            healthCheckBtn.textContent = '…';
            try {
                await runHealthCheck(tab.id);
            } finally {
                healthCheckBtn.textContent = prev;
            }
        });
    });
}

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
