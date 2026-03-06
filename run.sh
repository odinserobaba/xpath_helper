#!/bin/bash

# =============================================================================
# XPath Helper Chrome Extension - FULL VERSION v3.0
# =============================================================================
# Восстанавливает полную генерацию XPath с рабочим UI
# Использование: ./update-xpath-extension.sh
# =============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

EXTENSION_DIR="xpath-helper-extension"

echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     XPath Helper Pro - FULL VERSION v3.0              ║${NC}"
echo -e "${BLUE}║        (Полная генерация XPath + рабочий UI)          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

# Бэкап
if [ -d "$EXTENSION_DIR" ]; then
    echo -e "${CYAN}📦 Создание резервной копии...${NC}"
    BACKUP_DIR="${EXTENSION_DIR}_backup_$(date +%Y%m%d_%H%M%S)"
    mv "$EXTENSION_DIR" "$BACKUP_DIR"
    echo -e "${GREEN}✓ Резервная копия: $BACKUP_DIR${NC}"
fi

echo -e "${GREEN}📁 Создание структуры...${NC}"
mkdir -p "$EXTENSION_DIR/content"
mkdir -p "$EXTENSION_DIR/sidepanel"

# =============================================================================
# 1. manifest.json
# =============================================================================
cat > "$EXTENSION_DIR/manifest.json" << 'EOF'
{
  "manifest_version": 3,
  "name": "XPath Helper Pro",
  "version": "3.0.0",
  "description": "Полная генерация XPath для Angular Material",
  "permissions": ["sidePanel", "activeTab", "scripting", "clipboardWrite"],
  "host_permissions": ["<all_urls>"],
  "action": {"default_title": "XPath Helper"},
  "side_panel": {"default_path": "sidepanel/sidepanel.html"},
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content/xpath-generator.js", "content/content.js"],
    "run_at": "document_idle",
    "all_frames": false
  }],
  "background": {"service_worker": "background.js"}
}
EOF

# =============================================================================
# 2. background.js
# =============================================================================
cat > "$EXTENSION_DIR/background.js" << 'EOF'
console.log('[Background] Service Worker loaded');
chrome.action.onClicked.addListener(async (tab) => {
    await chrome.sidePanel.open({ tabId: tab.id });
});
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'ping') sendResponse({ status: 'alive', timestamp: Date.now() });
    return true;
});
EOF

# =============================================================================
# 3. content/xpath-generator.js (ПОЛНАЯ ВЕРСИЯ)
# =============================================================================
cat > "$EXTENSION_DIR/content/xpath-generator.js" << 'EOF'
// content/xpath-generator.js - ПОЛНАЯ ГЕНЕРАЦИЯ XPath
class XPathGenerator {
    constructor(options = {}) {
        this.options = {
            maxAttrLength: 50,
            minClassPartLength: 3,
            maxClassParts: 5,
            maxCandidates: 500,
            maxClassesToProcess: 20,
            ...options
        };
        
        this.angularMatSelectors = new Set([
            "mat-button","mat-raised-button","mat-flat-button","mat-stroked-button",
            "mat-icon-button","mat-fab","mat-mini-fab","mat-button-toggle",
            "mat-input-element","mat-form-field","mat-form-field-infix",
            "mat-form-field-outline","mat-form-field-label","mat-form-field-underline",
            "mat-checkbox","mat-checkbox-inner-container","mat-checkbox-layout",
            "mat-radio-button","mat-radio-container","mat-radio-label",
            "mat-slide-toggle","mat-slide-toggle-bar","mat-slide-toggle-thumb",
            "mat-select","mat-select-panel","mat-select-trigger","mat-select-value",
            "mat-option","mat-option-text","mat-focus-indicator",
            "mat-datepicker","mat-calendar","mat-slider","mat-menu",
            "mat-card","mat-card-header","mat-card-title","mat-card-content",
            "mat-table","mat-header-cell","mat-cell","mat-row","mat-header-row",
            "mat-tab-group","mat-tab-label","mat-tab-body","mat-list","mat-list-item",
            "mat-expansion-panel","mat-progress-bar","mat-progress-spinner",
            "mat-icon","mat-chip","mat-dialog","mat-snack-bar",
            "mat-toolbar","mat-sidenav","mat-tree","mat-autocomplete"
        ]);
        
        this.priorityAttrs = ['data-test-id','data-testid','data-qa','id','name'];
        this.secondaryAttrs = ['href','src','placeholder','alt','title','type','role','aria-label','aria-labelledby'];
        this.textTags = ['BUTTON','A','LABEL','TH','SPAN','H1','H2','H3','P'];
    }

    async generateAll(element, doc = document) {
        if (!element || element.nodeType !== 1) return null;
        this.doc = doc;

        const candidates = [];
        const data = this.extractElementData(element);
        const isMat = this.isAngularMaterialElement(element, data);

        if (isMat) candidates.push(...this.generateMatSelectors(element, data));
        candidates.push(...this.generateClassSelectors(data));
        candidates.push(...this.generateAttrSelectors(data));
        candidates.push(...this.generateTextSelectors(data));
        candidates.push(...this.generateCombinedSelectors(data));
        candidates.push(...this.generateContextSelectors(element, isMat));

        // Дедупликация и валидация
        const seen = new Set();
        const validated = [];
        
        for (const c of candidates) {
            if (seen.has(c.xpath)) continue;
            seen.add(c.xpath);
            
            const count = this.countMatches(c.xpath);
            if (count >= 1) {
                validated.push({
                    ...c, matchCount: count, isUnique: count === 1,
                    usesPartial: c.usesPartial || false,
                    isAngular: c.isAngular || false,
                    complexity: this.calcComplexity(c.xpath)
                });
            }
            if (validated.length % 20 === 0) await new Promise(r => setTimeout(r, 0));
        }

        // Сортировка: уникальные → score → сложность → длина
        validated.sort((a, b) => {
            if (a.isUnique && !b.isUnique) return -1;
            if (!a.isUnique && b.isUnique) return 1;
            if (a.isAngular && !b.isAngular) return -1;
            if (a.score !== b.score) return b.score - a.score;
            return a.xpath.length - b.xpath.length;
        });

        const unique = validated.filter(c => c.isUnique);
        const nonUnique = validated.filter(c => !c.isUnique);

        return {
            primary: unique[0] || validated[0] || null,
            uniqueOnly: unique,
            nonUniqueOnly: nonUnique,
            all: validated,
            summary: {
                total: validated.length,
                unique: unique.length,
                nonUnique: nonUnique.length,
                partialBased: validated.filter(c => c.usesPartial).length,
                angularSelectors: validated.filter(c => c.isAngular).length
            }
        };
    }

    extractElementData(el) {
        return {
            tag: el.tagName.toLowerCase(),
            id: el.id || null,
            classes: Array.from(el.classList),
            text: el.textContent?.trim().substring(0, 150) || '',
            attributes: Array.from(el.attributes).map(a => ({ name: a.name, value: a.value }))
        };
    }

    generateClassSelectors(data) {
        const selectors = [];
        const tag = data.tag;
        
        // ID (высший приоритет)
        if (data.id) {
            selectors.push(this.createCandidate(`//*[@id='${data.id}']`, 'id', 100));
        }
        
        // Priority атрибуты
        this.priorityAttrs.forEach(attr => {
            const val = data.attributes.find(a => a.name === attr)?.value;
            if (val) selectors.push(this.createCandidate(`//*[@${attr}='${val}']`, `attr:${attr}`, 95));
        });
        
        // Классы
        data.classes.slice(0, this.options.maxClassesToProcess).forEach(cls => {
            if (cls.length < 50 && !cls.startsWith('ng-') && !cls.startsWith('cdk-')) {
                selectors.push(this.createCandidate(
                    `//${tag}[contains(concat(' ', normalize-space(@class), ' '), ' ${cls} ')]`,
                    `class:${cls}`, 75
                ));
            }
        });
        
        // Частичные классы
        data.classes.slice(0, 10).forEach(fullClass => {
            if (fullClass.length < 4 || fullClass.startsWith('ng-')) return;
            const parts = fullClass.split('-');
            if (parts.length >= 2 && parts[0] === 'mat') {
                const base = `${parts[0]}-${parts[1]}`;
                selectors.push(this.createCandidate(
                    `//${tag}[contains(@class, '${base}')]`,
                    `partial:class:${base}`, 80, { usesPartial: true, isAngular: true }
                ));
            }
        });
        
        return selectors;
    }

    generateAttrSelectors(data) {
        const selectors = [];
        const tag = data.tag;
        
        data.attributes.forEach(attr => {
            if (attr.value.length < 3 || this.priorityAttrs.includes(attr.name)) return;
            
            const shortVal = attr.value.length > this.options.maxAttrLength 
                ? attr.value.substring(0, this.options.maxAttrLength) 
                : attr.value;
            
            selectors.push(this.createCandidate(
                `//${tag}[contains(@${attr.name}, '${shortVal}')]`,
                `partial:attr:${attr.name}`, 70, { usesPartial: true }
            ));
        });
        
        return selectors;
    }

    generateTextSelectors(data) {
        const selectors = [];
        if (!this.textTags.includes(data.tag.toUpperCase()) || !data.text) return selectors;
        
        selectors.push(this.createCandidate(
            `//${data.tag}[normalize-space()='${data.text}']`,
            'text:exact', 85
        ));
        
        if (data.text.length > 5) {
            selectors.push(this.createCandidate(
                `//${data.tag}[contains(normalize-space(), '${data.text.substring(0, 30)}')]`,
                'text:contains', 80, { usesPartial: true }
            ));
        }
        
        return selectors;
    }

    generateCombinedSelectors(data) {
        const selectors = [];
        const tag = data.tag;
        const classParts = data.classes.filter(c => c.startsWith('mat-')).slice(0, 3);
        
        // Класс + текст
        if (this.textTags.includes(tag.toUpperCase()) && data.text && classParts.length > 0) {
            selectors.push(this.createCandidate(
                `//${tag}[contains(@class, '${classParts[0]}') and normalize-space()='${data.text.substring(0, 30)}']`,
                'combo:class+text', 90, { usesPartial: true }
            ));
        }
        
        // 2 класса
        if (classParts.length >= 2) {
            selectors.push(this.createCandidate(
                `//${tag}[contains(@class, '${classParts[0]}') and contains(@class, '${classParts[1]}')]`,
                'combo:2classes', 88, { usesPartial: true }
            ));
        }
        
        // Класс + атрибут
        const ariaLabel = data.attributes.find(a => a.name === 'aria-label')?.value;
        if (classParts.length > 0 && ariaLabel) {
            selectors.push(this.createCandidate(
                `//${tag}[contains(@class, '${classParts[0]}') and contains(@aria-label, '${ariaLabel.substring(0, 30)}')]`,
                'combo:class+aria', 87, { usesPartial: true }
            ));
        }
        
        return selectors;
    }

    generateMatSelectors(element, data) {
        const selectors = [];
        const tag = element.tagName.toLowerCase();
        
        data.classes.filter(c => c.startsWith('mat-')).forEach(matClass => {
            const match = matClass.match(/^mat-([a-z-]+)/);
            if (match) {
                const base = `mat-${match[1]}`;
                selectors.push(this.createCandidate(
                    `//*[contains(@class, '${base}')]`,
                    `mat:base:${base}`, 92, { usesPartial: true, isAngular: true }
                ));
                selectors.push(this.createCandidate(
                    `//${tag}[contains(@class, '${matClass}')]`,
                    `mat:class:${matClass}`, 88, { usesPartial: true, isAngular: true }
                ));
            }
        });
        
        return selectors;
    }

    generateContextSelectors(element, isMat, maxDepth = 3) {
        const selectors = [];
        let current = element.parentElement;
        let path = [];
        
        for (let depth = 0; current && depth < maxDepth; depth++) {
            let part = current.tagName.toLowerCase();
            if (current.id) {
                part = `${part}[@id='${current.id}']`;
            } else {
                const matCls = Array.from(current.classList).find(c => c.startsWith('mat-'));
                if (matCls) part = `${part}[contains(@class, '${matCls}')]`;
            }
            path.unshift(part);
            
            selectors.push(this.createCandidate(
                '//' + path.join('/') + `//${element.tagName.toLowerCase()}`,
                `context:d${depth+1}`, 65 - depth * 5, { isAngular: isMat }
            ));
            
            current = current.parentElement;
        }
        return selectors;
    }

    countMatches(xpath) {
        try {
            const result = this.doc.evaluate(xpath, this.doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            return result.snapshotLength;
        } catch (e) { return 0; }
    }

    createCandidate(xpath, type, score, extras = {}) {
        return { xpath, type, score, length: xpath.length, ...extras };
    }

    calcComplexity(xpath) {
        let s = 0;
        s += (xpath.match(/\[/g) || []).length * 2;
        s += (xpath.match(/\/\//g) || []).length;
        s += (xpath.match(/contains|normalize-space/g) || []).length;
        return Math.round(s * 10) / 10;
    }

    isAngularMaterialElement(element, data) {
        if (this.angularMatSelectors.has(element.tagName.toLowerCase())) return true;
        return data.classes.some(c => c.startsWith('mat-') || c.startsWith('cdk-'));
    }
}
console.log('[XPathGenerator] Loaded');
EOF

# =============================================================================
# 4. content/content.js
# =============================================================================
cat > "$EXTENSION_DIR/content/content.js" << 'EOF'
// content/content.js
console.log('[Content] Script started');

if (typeof document === 'undefined' || !chrome?.runtime?.id) {
    console.error('[Content] ABORT');
    throw new Error('No context');
}

function init() {
    console.log('[Content] Initializing...');
    if (typeof XPathGenerator === 'undefined') {
        console.error('[Content] XPathGenerator not loaded!');
        return;
    }
    
    const generator = new XPathGenerator();
    let isCtrlPressed = false;
    let currentElement = null;
    
    // Индикатор
    const indicator = document.createElement('div');
    indicator.id = 'xpath-indicator';
    indicator.style.cssText = 'position:fixed;bottom:20px;right:20px;padding:10px 20px;background:linear-gradient(135deg,#00d4aa,#0099ff);color:white;border-radius:8px;font-family:sans-serif;font-weight:bold;z-index:2147483647;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
    indicator.innerHTML = '✦ XPath Helper';
    indicator.addEventListener('click', () => chrome.runtime.sendMessage({ action: 'openPanel' }));
    document.documentElement.appendChild(indicator);
    
    // Слушатели
    document.addEventListener('keydown', (e) => { if (e.key === 'Control') isCtrlPressed = true; });
    document.addEventListener('keyup', (e) => {
        if (e.key === 'Control') {
            isCtrlPressed = false;
            if (currentElement) currentElement.style.outline = '';
            currentElement = null;
        }
    });
    
    document.addEventListener('mouseover', (e) => {
        if (!isCtrlPressed || !e.target) return;
        const el = e.target;
        if (el.id === 'xpath-indicator') return;
        
        if (currentElement && currentElement !== el) currentElement.style.outline = '';
        currentElement = el;
        el.style.outline = '3px solid #00d4aa';
        
        const info = {
            tagName: el.tagName.toLowerCase(),
            id: el.id || null,
            classes: Array.from(el.classList),
            text: el.textContent?.trim().substring(0, 50) || '',
            attributes: Array.from(el.attributes).map(a => ({ name: a.name, value: a.value }))
        };
        
        // Генерируем XPath
        generator.generateAll(el).then(result => {
            chrome.runtime.sendMessage({
                action: 'elementHovered',
                element: info,
                xpathResult: result
            });
        });
    }, true);
    
    console.log('[Content] ✓ Ready');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
    init();
}
EOF

# =============================================================================
# 5. sidepanel/sidepanel.html
# =============================================================================
cat > "$EXTENSION_DIR/sidepanel/sidepanel.html" << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>XPath Helper</title>
    <link rel="stylesheet" href="sidepanel.css">
</head>
<body>
    <div class="panel-container">
        <header class="header">
            <h1>✦ XPath Helper</h1>
            <div class="controls">
                <button id="refreshBtn" class="btn">↻</button>
            </div>
        </header>
        
        <div id="status" class="status">Ожидание элемента...</div>
        
        <section id="elementInfo" class="info-section hidden">
            <div class="element-badge">
                <span id="elementTag" class="tag">element</span>
                <span id="angularBadge" class="angular-badge hidden">Angular</span>
            </div>
            <code id="elementCode" class="element-code"></code>
            <div id="stats" class="stats"></div>
        </section>
        
        <section id="primarySection" class="xpath-section hidden">
            <h3>🎯 Основной XPath</h3>
            <div class="xpath-card primary">
                <code id="primaryXpath" class="xpath-code"></code>
                <div class="xpath-meta">
                    <span id="primaryUnique" class="badge unique">✓</span>
                    <span id="primaryScore" class="badge score">100</span>
                </div>
                <button id="copyPrimary" class="btn-copy">📋 Копировать</button>
            </div>
        </section>
        
        <section id="uniqueSection" class="xpath-section hidden">
            <h3>✅ Уникальные <span id="uniqueCount" class="count">(0)</span></h3>
            <div id="uniqueList" class="xpath-list"></div>
        </section>
        
        <section id="nonUniqueSection" class="xpath-section hidden">
            <h3>⚠️ Неуникальные <span id="nonUniqueCount" class="count">(0)</span></h3>
            <div id="nonUniqueList" class="xpath-list"></div>
        </section>
        
        <div id="emptyState" class="empty-state">
            <div class="empty-icon">🔍</div>
            <p>Зажмите <strong>Ctrl</strong> и наведите на элемент</p>
        </div>
    </div>
    <script src="../content/xpath-generator.js"></script>
    <script src="sidepanel.js"></script>
</body>
</html>
EOF

# =============================================================================
# 6. sidepanel/sidepanel.css
# =============================================================================
cat > "$EXTENSION_DIR/sidepanel/sidepanel.css" << 'EOF'
:root {
    --bg: #0f0f1a; --bg2: #1a1a2e; --bg3: #16213e;
    --text: #eee; --text2: #aaa; --accent: #00d4aa;
    --success: #2ecc71; --warning: #f39c12; --error: #e74c3c;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: sans-serif; background: var(--bg); color: var(--text); font-size: 13px; }
.panel-container { padding: 12px; max-height: 600px; overflow-y: auto; }
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.header h1 { font-size: 16px; color: var(--accent); }
.btn { background: var(--bg3); border: 1px solid #2a2a4a; color: var(--text); padding: 4px 10px; border-radius: 4px; cursor: pointer; }
.btn:hover { background: var(--accent); color: #000; }
.status { background: var(--bg2); padding: 10px; border-radius: 6px; margin-bottom: 12px; border: 1px solid #2a2a4a; }
.hidden { display: none !important; }
.info-section { background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 12px; }
.element-badge { display: flex; gap: 8px; margin-bottom: 8px; }
.tag { background: var(--accent); color: #000; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: bold; }
.angular-badge { background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 2px 8px; border-radius: 10px; font-size: 11px; }
.element-code { display: block; background: var(--bg3); padding: 8px; border-radius: 4px; font-family: monospace; font-size: 11px; word-break: break-all; margin-bottom: 8px; }
.stats { display: flex; gap: 10px; font-size: 11px; color: var(--text2); flex-wrap: wrap; }
.xpath-section { background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 12px; }
.xpath-section h3 { font-size: 12px; color: var(--text2); margin-bottom: 10px; text-transform: uppercase; display: flex; justify-content: space-between; }
.count { background: #2a2a4a; padding: 2px 8px; border-radius: 10px; font-size: 10px; }
.xpath-card { background: var(--bg3); padding: 12px; border-radius: 6px; margin-bottom: 8px; border: 1px solid #2a2a4a; }
.xpath-card.primary { border-color: var(--accent); }
.xpath-code { display: block; background: #0a0a14; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 11px; color: var(--accent); word-break: break-all; margin-bottom: 8px; max-height: 100px; overflow-y: auto; }
.xpath-meta { display: flex; gap: 6px; margin-bottom: 8px; }
.badge { padding: 2px 6px; border-radius: 3px; font-size: 10px; }
.badge.unique { background: rgba(46,204,113,0.2); color: var(--success); }
.badge.score { background: rgba(243,156,18,0.2); color: var(--warning); }
.btn-copy { width: 100%; padding: 8px; background: linear-gradient(135deg, var(--accent), #00b894); border: none; border-radius: 4px; color: #000; font-weight: bold; cursor: pointer; }
.btn-copy:hover { transform: translateY(-1px); }
.xpath-list { display: flex; flex-direction: column; gap: 6px; max-height: 300px; overflow-y: auto; }
.xpath-item { display: flex; gap: 8px; padding: 8px; background: var(--bg3); border-radius: 6px; border: 1px solid #2a2a4a; align-items: flex-start; }
.xpath-item:hover { border-color: var(--accent); }
.xpath-idx { min-width: 24px; height: 24px; background: #2a2a4a; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold; }
.xpath-idx.unique { background: rgba(46,204,113,0.2); color: var(--success); }
.xpath-content { flex: 1; min-width: 0; }
.xpath-text { font-family: monospace; font-size: 11px; color: var(--text2); word-break: break-all; margin-bottom: 4px; }
.xpath-actions { display: flex; gap: 4px; }
.btn-icon { width: 24px; height: 24px; border-radius: 4px; background: #2a2a4a; border: none; color: var(--text); cursor: pointer; font-size: 12px; }
.btn-icon:hover { background: var(--accent); color: #000; }
.empty-state { text-align: center; padding: 40px 20px; color: var(--text2); }
.empty-icon { font-size: 48px; margin-bottom: 16px; opacity: 0.5; }
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: var(--bg); }
::-webkit-scrollbar-thumb { background: #2a2a4a; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--accent); }
EOF

# =============================================================================
# 7. sidepanel/sidepanel.js
# =============================================================================
cat > "$EXTENSION_DIR/sidepanel/sidepanel.js" << 'EOF'
// sidepanel/sidepanel.js
console.log('[SidePanel] Loaded');

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
const uniqueSectionEl = $('uniqueSection');
const uniqueListEl = $('uniqueList');
const uniqueCountEl = $('uniqueCount');
const nonUniqueSectionEl = $('nonUniqueSection');
const nonUniqueListEl = $('nonUniqueList');
const nonUniqueCountEl = $('nonUniqueCount');
const emptyStateEl = $('emptyState');
const refreshBtn = $('refreshBtn');

let currentResult = null;

function show(el) { el.classList.remove('hidden'); el.style.display = 'block'; }
function hide(el) { el.classList.add('hidden'); el.style.display = 'none'; }

function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
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
                <button class="btn-icon btn-copy-xpath" data-xpath="${escapeHtml(xpath.xpath)}" title="Копировать">📋</button>
                <button class="btn-icon btn-highlight" data-xpath="${escapeHtml(xpath.xpath)}" title="Подсветить">👁</button>
            </div>
        </div>
    `;
}

function renderResults(result) {
    console.log('[SidePanel] renderResults:', result);
    
    if (!result || !result.all || result.all.length === 0) {
        show(emptyStateEl);
        hide(elementInfoEl);
        hide(primarySectionEl);
        hide(uniqueSectionEl);
        hide(nonUniqueSectionEl);
        return;
    }
    
    hide(emptyStateEl);
    show(elementInfoEl);
    
    // Stats
    statsEl.innerHTML = `
        <span>Всего: <strong>${result.summary.total}</strong></span>
        <span style="color:var(--success)">Уникальных: <strong>${result.summary.unique}</strong></span>
        ${result.summary.nonUnique > 0 ? `<span style="color:var(--warning)">Неуникальных: <strong>${result.summary.nonUnique}</strong></span>` : ''}
        ${result.summary.angularSelectors > 0 ? `<span>Angular: ${result.summary.angularSelectors}</span>` : ''}
    `;
    
    // Primary
    if (result.primary) {
        primaryXpathEl.textContent = result.primary.xpath;
        primaryUniqueEl.textContent = result.primary.isUnique ? '✓ Уникальный' : '×' + result.primary.matchCount;
        primaryUniqueEl.className = `badge ${result.primary.isUnique ? 'unique' : ''}`;
        primaryScoreEl.textContent = result.primary.score;
        show(primarySectionEl);
    } else {
        hide(primarySectionEl);
    }
    
    // Unique (кроме primary)
    const uniqueOthers = result.uniqueOnly?.slice(1) || [];
    if (uniqueOthers.length > 0) {
        uniqueCountEl.textContent = `(${uniqueOthers.length})`;
        uniqueListEl.innerHTML = uniqueOthers.map((x, i) => renderXpathItem(x, i + 1, true)).join('');
        show(uniqueSectionEl);
    } else {
        hide(uniqueSectionEl);
    }
    
    // Non-unique
    if (result.nonUniqueOnly?.length > 0) {
        nonUniqueCountEl.textContent = `(${result.nonUniqueOnly.length})`;
        nonUniqueListEl.innerHTML = result.nonUniqueOnly.map((x, i) => renderXpathItem(x, i + 1, false)).join('');
        show(nonUniqueSectionEl);
    } else {
        hide(nonUniqueSectionEl);
    }
}

// Слушаем сообщения
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[SidePanel] Message:', request.action);
    
    if (request.action === 'elementHovered') {
        const el = request.element;
        const result = request.xpathResult;
        
        statusEl.textContent = `Element: <${el.tagName}>`;
        elementTagEl.textContent = `<${el.tagName}>`;
        
        // Angular badge
        if (el.classes?.some(c => c.startsWith('mat-') || c.startsWith('cdk-'))) {
            angularBadgeEl.classList.remove('hidden');
        } else {
            angularBadgeEl.classList.add('hidden');
        }
        
        // Element code
        const cls = el.classes?.slice(0, 3).join(' ') || '';
        elementCodeEl.textContent = `<${el.tagName}${el.id ? ` id="${el.id}"` : ''}${cls ? ` class="${cls}"` : ''}>`;
        
        currentResult = result;
        renderResults(result);
    }
    
    sendResponse({ received: true });
    return true;
});

// Копирование
document.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('.btn-copy-xpath, #copyPrimary');
    if (copyBtn) {
        const xpath = copyBtn.dataset.xpath || primaryXpathEl.textContent;
        navigator.clipboard.writeText(xpath).then(() => {
            const orig = copyBtn.textContent;
            copyBtn.textContent = '✓';
            setTimeout(() => copyBtn.textContent = orig, 1500);
        });
    }
    
    const highlightBtn = e.target.closest('.btn-highlight');
    if (highlightBtn) {
        chrome.tabs.query({active: true, currentWindow: true}, ([tab]) => {
            chrome.scripting.executeScript({
                target: {tabId: tab.id},
                func: (xp) => {
                    const r = document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                    const el = r.singleNodeValue;
                    if (el) {
                        el.scrollIntoView({behavior: 'smooth', block: 'center'});
                        const orig = el.style.outline;
                        el.style.outline = '3px solid #00d4aa';
                        setTimeout(() => el.style.outline = orig, 2000);
                    }
                },
                args: [highlightBtn.dataset.xpath]
            });
        });
    }
});

// Refresh
refreshBtn.addEventListener('click', () => {
    location.reload();
});

// Ping background
chrome.runtime.sendMessage({action: 'ping'}, (resp) => {
    if (chrome.runtime.lastError) {
        statusEl.textContent = 'Error: ' + chrome.runtime.lastError.message;
    } else {
        statusEl.textContent = 'Connected ✓';
    }
});

console.log('[SidePanel] Ready');
EOF

# =============================================================================
# Завершение
# =============================================================================
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         ✅ Готово! XPath Helper v3.0                   ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}📁 Путь:${NC} $(pwd)/$EXTENSION_DIR"
echo ""
echo -e "${YELLOW}📋 УСТАНОВКА:${NC}"
echo "   1. ${BLUE}chrome://extensions/${NC} → Режим разработчика"
echo "   2. Удалите старое XPath Helper"
echo "   3. Загрузить распакованное → ${BLUE}$EXTENSION_DIR${NC}"
echo ""
echo -e "${YELLOW}🎮 ИСПОЛЬЗОВАНИЕ:${NC}"
echo "   1. Откройте любую страницу"
echo "   2. Нажмите на иконку расширения"
echo "   3. Зажмите ${GREEN}Ctrl${NC} и наведите на элемент"
echo "   4. XPath появятся в панели автоматически"
echo ""
echo -e "${GREEN}🚀 Удачи!${NC}"