// sidepanel/sidepanel.js
class XPathHelperPanel {
    constructor() {
        this.generator = new XPathGenerator();
        this.currentElement = null;
        this.currentResult = null;
        this.init();
    }

    init() {
        this.cacheElements();
        this.setupEventListeners();
        this.setupMessageListener();
        this.updateUI();
    }

    cacheElements() {
        this.elements = {
            modeInfo: document.getElementById('modeInfo'),
            toggleHighlight: document.getElementById('toggleHighlight'),
            refreshBtn: document.getElementById('refreshBtn'),
            elementInfo: document.getElementById('elementInfo'),
            elementTag: document.getElementById('elementTag'),
            elementComponent: document.getElementById('elementComponent'),
            elementPreview: document.getElementById('elementPreview'),
            elementStats: document.getElementById('elementStats'),
            primarySection: document.getElementById('primarySection'),
            primaryXpath: document.getElementById('primaryXpath'),
            primaryUnique: document.getElementById('primaryUnique'),
            primaryScore: document.getElementById('primaryScore'),
            primaryType: document.getElementById('primaryType'),
            uniqueSection: document.getElementById('uniqueSection'),
            uniqueList: document.getElementById('uniqueList'),
            uniqueCount: document.getElementById('uniqueCount'),
            nonUniqueSection: document.getElementById('nonUniqueSection'),
            nonUniqueList: document.getElementById('nonUniqueList'),
            nonUniqueCount: document.getElementById('nonUniqueCount'),
            emptyState: document.getElementById('emptyState'),
            loading: document.getElementById('loading')
        };
    }

    setupEventListeners() {
        this.elements.toggleHighlight.addEventListener('click', () => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'toggleHighlight',
                    enabled: !this.elements.toggleHighlight.classList.contains('active')
                });
            });
            this.elements.toggleHighlight.classList.toggle('active');
        });

        this.elements.refreshBtn.addEventListener('click', () => {
            if (this.currentElement) this.handleElementHover(this.currentElement);
        });

        document.addEventListener('click', (e) => {
            if (e.target.closest('.btn-copy')) {
                const btn = e.target.closest('.btn-copy');
                const targetId = btn.dataset.target || btn.closest('.fallback-item')?.querySelector('.btn-copy')?.dataset?.xpath;
                const xpath = targetId ? document.getElementById(targetId)?.textContent : btn.dataset.xpath;
                if (xpath) this.copyToClipboard(xpath, btn);
            }
            if (e.target.closest('.btn-highlight')) {
                const btn = e.target.closest('.btn-highlight');
                const xpath = btn.dataset.xpath;
                this.highlightOnPage(xpath);
            }
        });
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'elementHovered' && request.element) {
                this.handleElementHover(request.element);
            }
        });
    }

    async handleElementHover(elementInfo) {
        this.currentElement = elementInfo;
        this.showLoading();
        this.updateElementInfo(elementInfo);
        
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const response = await chrome.tabs.sendMessage(tab.id, {
                action: 'generateForElement',
                elementInfo: elementInfo
            });
            this.currentResult = response.result;
            this.renderResults(response.result);
        } catch (error) {
            console.error('XPath generation error:', error);
            this.showError('Ошибка генерации XPath');
        } finally {
            this.hideLoading();
        }
    }

    updateElementInfo(info) {
        this.elements.elementTag.textContent = `<${info.tagName}>`;
        if (info.classes?.some(c => c.startsWith('mat-') || c.startsWith('cdk-'))) {
            this.elements.elementComponent.textContent = 'Angular Material';
            this.elements.elementComponent.classList.remove('hidden');
        } else {
            this.elements.elementComponent.classList.add('hidden');
        }
        const attrs = info.attributes?.slice(0, 3).map(a => `${a.name}="${a.value.substring(0, 20)}${a.value.length > 20 ? '...' : ''}"`).join(' ') || '';
        this.elements.elementPreview.textContent = `<${info.tagName} ${attrs}${info.text ? `>${info.text.substring(0, 30)}...` : '>'}`;
        this.elements.elementInfo.classList.remove('hidden');
        this.elements.modeInfo.classList.add('hidden');
    }

    renderResults(result) {
        if (!result?.primary) {
            this.showEmpty('XPath не найден');
            return;
        }

        // Primary
        this.elements.primaryXpath.textContent = result.primary.xpath;
        this.elements.primaryUnique.textContent = result.primary.isUnique ? '✓ Уникальный' : `⚠ Найдено: ${result.primary.matchCount}`;
        this.elements.primaryUnique.className = `badge ${result.primary.isUnique ? 'unique' : 'warning'}`;
        this.elements.primaryScore.textContent = `Score: ${result.primary.score}`;
        this.elements.primaryType.textContent = result.primary.type;
        this.elements.primarySection.classList.remove('hidden');

        // === ВСЕ УНИКАЛЬНЫЕ (БЕЗ ОГРАНИЧЕНИЙ) ===
        if (result.uniqueOnly && result.uniqueOnly.length > 1) {
            const otherUnique = result.uniqueOnly.slice(1); // Все кроме primary
            this.elements.uniqueCount.textContent = `(${otherUnique.length})`;
            this.elements.uniqueList.innerHTML = otherUnique.map((fb, i) => this.renderFallbackItem(fb, i + 1, true)).join('');
            this.elements.uniqueSection.classList.remove('hidden');
        } else {
            this.elements.uniqueSection.classList.add('hidden');
        }

        // === ВСЕ НЕУНИКАЛЬНЫЕ (БЕЗ ОГРАНИЧЕНИЙ) ===
        if (result.nonUniqueOnly && result.nonUniqueOnly.length > 0) {
            this.elements.nonUniqueCount.textContent = `(${result.nonUniqueOnly.length})`;
            this.elements.nonUniqueList.innerHTML = result.nonUniqueOnly.map((fb, i) => this.renderFallbackItem(fb, i + 1, false)).join('');
            this.elements.nonUniqueSection.classList.remove('hidden');
        } else {
            this.elements.nonUniqueSection.classList.add('hidden');
        }

        // Stats
        this.elements.elementStats.innerHTML = `
            <span>Всего: <strong style="color:var(--text-primary)">${result.summary.total}</strong></span>
            <span style="color: var(--success)">Уникальных: <strong>${result.summary.unique}</strong></span>
            ${result.summary.nonUnique ? `<span style="color: var(--warning)">Неуникальных: <strong>${result.summary.nonUnique}</strong></span>` : ''}
            ${result.summary.partialBased ? `<span>Partial: ${result.summary.partialBased}</span>` : ''}
            ${result.summary.angularSelectors ? `<span>Angular: ${result.summary.angularSelectors}</span>` : ''}
        `;

        this.elements.emptyState.classList.add('hidden');
    }

    renderFallbackItem(fb, index, isUnique) {
        const uniqueBadge = isUnique 
            ? '<span class="badge unique">✓</span>' 
            : `<span class="badge warning">×${fb.matchCount}</span>`;
        const angularBadge = fb.isAngular ? '<span class="badge angular">MAT</span>' : '';
        const partialBadge = fb.usesPartial ? '<span class="badge partial">∿</span>' : '';
        
        return `
            <div class="fallback-item">
                <div class="fallback-index ${isUnique ? 'unique' : ''}">${index}</div>
                <div class="fallback-content">
                    <div class="fallback-xpath">${this.escapeHtml(fb.xpath)}</div>
                    <div class="fallback-meta">
                        ${uniqueBadge}
                        <span class="badge score">${fb.score}</span>
                        <span class="badge type">${fb.type}</span>
                        ${angularBadge}
                        ${partialBadge}
                    </div>
                </div>
                <div class="fallback-actions">
                    <button class="btn-icon btn-copy" data-xpath="${this.escapeHtml(fb.xpath)}" title="Копировать">📋</button>
                    <button class="btn-icon btn-highlight highlight" data-xpath="${this.escapeHtml(fb.xpath)}" title="Подсветить">👁</button>
                </div>
            </div>
        `;
    }

    async copyToClipboard(text, btnElement) {
        try {
            await navigator.clipboard.writeText(text);
            const originalText = btnElement.innerHTML;
            btnElement.innerHTML = '✓';
            btnElement.style.background = 'var(--success)';
            setTimeout(() => {
                btnElement.innerHTML = originalText;
                btnElement.style.background = '';
            }, 1500);
        } catch (err) {
            console.error('Copy failed:', err);
        }
    }

    async highlightOnPage(xpath) {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (xpath) => {
                    const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                    const element = result.singleNodeValue;
                    if (element) {
                        const original = element.style.outline;
                        element.style.outline = '3px solid #00d4aa';
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        setTimeout(() => { element.style.outline = original; }, 2000);
                        return true;
                    }
                    return false;
                },
                args: [xpath]
            });
        } catch (error) {
            console.error('Highlight error:', error);
        }
    }

    showLoading() {
        this.elements.loading.classList.remove('hidden');
        this.elements.primarySection.classList.add('hidden');
        this.elements.uniqueSection.classList.add('hidden');
        this.elements.nonUniqueSection.classList.add('hidden');
    }

    hideLoading() {
        this.elements.loading.classList.add('hidden');
    }

    showEmpty(message = 'Наведите на элемент') {
        this.elements.emptyState.querySelector('p').textContent = message;
        this.elements.emptyState.classList.remove('hidden');
        this.elements.primarySection.classList.add('hidden');
        this.elements.uniqueSection.classList.add('hidden');
        this.elements.nonUniqueSection.classList.add('hidden');
    }

    showError(message) {
        this.elements.emptyState.querySelector('p').innerHTML = `❌ ${message}`;
        this.elements.emptyState.classList.remove('hidden');
    }

    updateUI() {
        this.elements.primarySection.classList.add('hidden');
        this.elements.uniqueSection.classList.add('hidden');
        this.elements.nonUniqueSection.classList.add('hidden');
        this.elements.elementInfo.classList.add('hidden');
        this.elements.modeInfo.classList.remove('hidden');
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new XPathHelperPanel());
} else {
    new XPathHelperPanel();
}
