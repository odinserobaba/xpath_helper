// sidepanel/sidepanel.js - FIXED: Force display of all sections
class XPathHelperPanel {
    constructor() { 
        this.generator = new XPathGenerator(); 
        this.currentElement = null; 
        this.currentResult = null; 
        this.init(); 
    }
    
    init() { 
        console.log('[SidePanel] Initializing...');
        this.cacheElements(); 
        this.setupEventListeners(); 
        this.setupMessageListener(); 
        this.updateUI(); 
        console.log('[SidePanel] Ready');
    }
    
    cacheElements() {
        // Кэшируем элементы с проверкой на null
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
        
        // Лог для отладки: какие элементы найдены
        console.log('[SidePanel] Elements cached:', Object.entries(this.elements)
            .filter(([k,v]) => v !== null).length + '/' + Object.keys(this.elements).length + ' found');
    }
    
    setupEventListeners() {
        if (this.elements.toggleHighlight) {
            this.elements.toggleHighlight.addEventListener('click', () => { 
                chrome.tabs.query({active:true, currentWindow:true}, (tabs) => { 
                    chrome.tabs.sendMessage(tabs[0].id, {action:'toggleHighlight', enabled:!this.elements.toggleHighlight.classList.contains('active')}); 
                }); 
                this.elements.toggleHighlight.classList.toggle('active'); 
            });
        }
        
        if (this.elements.refreshBtn) {
            this.elements.refreshBtn.addEventListener('click', () => { 
                if (this.currentElement) this.handleElementHover(this.currentElement); 
            });
        }
        
        document.addEventListener('click', (e) => {
            if (e.target.closest?.('.btn-copy')) { 
                const btn = e.target.closest('.btn-copy'); 
                const xpath = btn.dataset.xpath;
                if (xpath) this.copyToClipboard(xpath, btn); 
            }
            if (e.target.closest?.('.btn-highlight')) { 
                const btn = e.target.closest('.btn-highlight'); 
                if (btn.dataset.xpath) this.highlightOnPage(btn.dataset.xpath); 
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
        console.log('[SidePanel] ✓ Element hovered:', elementInfo.tagName, elementInfo.id || elementInfo.classes?.[0]);
        this.currentElement = elementInfo; 
        this.showLoading(); 
        this.updateElementInfo(elementInfo);
        
        try {
            const [tab] = await chrome.tabs.query({active:true, currentWindow:true});
            console.log('[SidePanel] Sending message to tab:', tab.id);
            
            const response = await chrome.tabs.sendMessage(tab.id, {action:'generateForElement', elementInfo});
            
            console.log('[SidePanel] ✓ Received response:', {
                hasResult: !!response?.result,
                total: response?.result?.summary?.total,
                unique: response?.result?.summary?.unique,
                primary: !!response?.result?.primary
            });
            
            this.currentResult = response.result; 
            
            if (!response?.result) {
                console.warn('[SidePanel] No result in response');
                this.showEmpty('XPath не сгенерирован');
                return;
            }
            
            this.renderResults(response.result);
        } catch (error) { 
            console.error('[SidePanel] ✗ Error:', error); 
            this.showError('Ошибка: ' + error.message); 
        } finally { 
            this.hideLoading(); 
        }
    }
    
    updateElementInfo(info) {
        if (this.elements.elementTag) this.elements.elementTag.textContent = `<${info.tagName}>`;
        
        if (this.elements.elementComponent) {
            if (info.classes?.some(c => c.startsWith('mat-') || c.startsWith('cdk-'))) { 
                this.elements.elementComponent.textContent = 'Angular Material'; 
                this.elements.elementComponent.classList.remove('hidden'); 
            } else { 
                this.elements.elementComponent.classList.add('hidden'); 
            }
        }
        
        if (this.elements.elementPreview) {
            const attrs = info.attributes?.slice(0,3).map(a => `${a.name}="${a.value.substring(0,20)}${a.value.length>20?'...':''}"`).join(' ') || '';
            this.elements.elementPreview.textContent = `<${info.tagName} ${attrs}${info.text ? `>${info.text.substring(0,30)}...` : '>'}`;
        }
        
        if (this.elements.elementInfo) {
            this.elements.elementInfo.classList.remove('hidden');
            this.elements.elementInfo.style.display = 'block';
        }
        if (this.elements.modeInfo) {
            this.elements.modeInfo.classList.add('hidden');
            this.elements.modeInfo.style.display = 'none';
        }
    }
    
    renderResults(result) {
        console.log('[SidePanel] renderResults() called with:', {
            primary: result?.primary ? '✓' : '✗',
            uniqueOnly: result?.uniqueOnly?.length || 0,
            nonUniqueOnly: result?.nonUniqueOnly?.length || 0,
            all: result?.all?.length || 0
        });
        
        // Проверяем есть ли ХОТЯ БЫ ОДИН результат
        const hasAnyResults = result?.all?.length > 0 || result?.uniqueOnly?.length > 0 || result?.nonUniqueOnly?.length > 0 || result?.primary;
        
        if (!hasAnyResults) { 
            console.log('[SidePanel] No results to render');
            this.showEmpty('XPath не найден'); 
            return; 
        }
        
        // === ПОКАЗЫВАЕМ PRIMARY (если есть) ===
        if (result?.primary && this.elements.primarySection) {
            console.log('[SidePanel] Rendering primary:', result.primary.xpath.substring(0, 60) + '...');
            
            if (this.elements.primaryXpath) this.elements.primaryXpath.textContent = result.primary.xpath;
            if (this.elements.primaryUnique) {
                this.elements.primaryUnique.textContent = result.primary.isUnique ? '✓ Уникальный' : `⚠ Найдено: ${result.primary.matchCount}`;
                this.elements.primaryUnique.className = `badge ${result.primary.isUnique ? 'unique' : 'warning'}`;
            }
            if (this.elements.primaryScore) this.elements.primaryScore.textContent = `Score: ${result.primary.score}`;
            if (this.elements.primaryType) this.elements.primaryType.textContent = result.primary.type;
            
            // === КЛЮЧЕВОЕ: принудительно показываем секцию ===
            this.elements.primarySection.classList.remove('hidden');
            this.elements.primarySection.style.display = 'block';
            this.elements.primarySection.style.visibility = 'visible';
            this.elements.primarySection.style.opacity = '1';
            
            console.log('[SidePanel] ✓ Primary section displayed');
        } else if (this.elements.primarySection) {
            this.elements.primarySection.classList.add('hidden');
            this.elements.primarySection.style.display = 'none';
        }
        
        // === ПОКАЗЫВАЕМ ВСЕ УНИКАЛЬНЫЕ ===
        const uniqueList = result?.uniqueOnly || [];
        const uniqueToDisplay = result?.primary ? uniqueList.slice(1) : uniqueList;
        
        if (uniqueToDisplay.length > 0 && this.elements.uniqueSection) {
            console.log(`[SidePanel] Rendering ${uniqueToDisplay.length} unique variants`);
            
            if (this.elements.uniqueCount) this.elements.uniqueCount.textContent = `(${uniqueToDisplay.length})`;
            
            // Генерируем HTML
            const html = uniqueToDisplay.map((fb, i) => this.renderFallbackItem(fb, i + 1, true)).join('');
            console.log('[SidePanel] Generated HTML length:', html.length);
            
            if (this.elements.uniqueList) {
                this.elements.uniqueList.innerHTML = html;
                // Принудительно показываем
                this.elements.uniqueSection.classList.remove('hidden');
                this.elements.uniqueSection.style.display = 'block';
                this.elements.uniqueSection.style.visibility = 'visible';
                this.elements.uniqueSection.style.opacity = '1';
                // Убеждаемся что список прокручивается
                this.elements.uniqueList.style.maxHeight = 'none';
                this.elements.uniqueList.style.overflowY = 'visible';
                console.log('[SidePanel] ✓ Unique section displayed');
            }
        } else if (this.elements.uniqueSection) {
            this.elements.uniqueSection.classList.add('hidden');
            this.elements.uniqueSection.style.display = 'none';
        }
        
        // === ПОКАЗЫВАЕМ ВСЕ НЕУНИКАЛЬНЫЕ ===
        const nonUniqueList = result?.nonUniqueOnly || [];
        if (nonUniqueList.length > 0 && this.elements.nonUniqueSection) {
            console.log(`[SidePanel] Rendering ${nonUniqueList.length} non-unique variants`);
            
            if (this.elements.nonUniqueCount) this.elements.nonUniqueCount.textContent = `(${nonUniqueList.length})`;
            
            const html = nonUniqueList.map((fb, i) => this.renderFallbackItem(fb, i + 1, false)).join('');
            
            if (this.elements.nonUniqueList) {
                this.elements.nonUniqueList.innerHTML = html;
                // Принудительно показываем
                this.elements.nonUniqueSection.classList.remove('hidden');
                this.elements.nonUniqueSection.style.display = 'block';
                this.elements.nonUniqueSection.style.visibility = 'visible';
                this.elements.nonUniqueSection.style.opacity = '1';
                this.elements.nonUniqueList.style.maxHeight = 'none';
                this.elements.nonUniqueList.style.overflowY = 'visible';
                console.log('[SidePanel] ✓ Non-unique section displayed');
            }
        } else if (this.elements.nonUniqueSection) {
            this.elements.nonUniqueSection.classList.add('hidden');
            this.elements.nonUniqueSection.style.display = 'none';
        }
        
        // === СТАТИСТИКА ===
        if (result?.summary && this.elements.elementStats) {
            this.elements.elementStats.innerHTML = `
                <span>Всего: <strong style="color:var(--text-primary)">${result.summary.total || 0}</strong></span>
                <span style="color:var(--success)">Уникальных: <strong>${result.summary.unique || 0}</strong></span>
                ${result.summary.nonUnique ? `<span style="color:var(--warning)">Неуникальных: <strong>${result.summary.nonUnique}</strong></span>` : ''}
                ${result.summary.partialBased ? `<span>Partial: ${result.summary.partialBased}</span>` : ''}
                ${result.summary.angularSelectors ? `<span>Angular: ${result.summary.angularSelectors}</span>` : ''}
            `;
        }
        
        // Скрываем empty state
        if (this.elements.emptyState) {
            this.elements.emptyState.classList.add('hidden');
            this.elements.emptyState.style.display = 'none';
        }
        
        console.log('[SidePanel] ✓ renderResults complete');
    }
    
    renderFallbackItem(fb, index, isUnique) {
        if (!fb || !fb.xpath) { 
            console.warn('[SidePanel] Invalid fallback item:', fb); 
            return ''; 
        }
        
        const uniqueBadge = isUnique 
            ? '<span class="badge unique">✓</span>' 
            : `<span class="badge warning">×${fb.matchCount}</span>`;
        const angularBadge = fb.isAngular ? '<span class="badge angular">MAT</span>' : '';
        const partialBadge = fb.usesPartial ? '<span class="badge partial">∿</span>' : '';
        
        const html = `
            <div class="fallback-item" data-index="${index}" data-unique="${isUnique}">
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
        
        return html.trim();
    }
    
    async copyToClipboard(text, btnElement) {
        try { 
            await navigator.clipboard.writeText(text); 
            if (btnElement) {
                const orig = btnElement.innerHTML; 
                btnElement.innerHTML = '✓'; 
                btnElement.style.background = 'var(--success)'; 
                setTimeout(() => {
                    btnElement.innerHTML = orig;
                    btnElement.style.background = '';
                }, 1500); 
            }
        } catch(err) { 
            console.error('Copy failed:', err); 
        }
    }
    
    async highlightOnPage(xpath) {
        try { 
            const [tab] = await chrome.tabs.query({active:true, currentWindow:true}); 
            await chrome.scripting.executeScript({
                target: {tabId: tab.id},
                func: (xp) => {
                    const r = document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                    const el = r.singleNodeValue;
                    if (el) {
                        const orig = el.style.outline;
                        el.style.outline = '3px solid #00d4aa';
                        el.scrollIntoView({behavior:'smooth', block:'center'});
                        setTimeout(() => { el.style.outline = orig; }, 2000);
                        return true;
                    }
                    return false;
                },
                args: [xpath]
            }); 
        } catch(error) { 
            console.error('Highlight error:', error); 
        }
    }
    
    showLoading() { 
        if (this.elements.loading) {
            this.elements.loading.classList.remove('hidden');
            this.elements.loading.style.display = 'flex';
        }
        this.hideSection(this.elements.primarySection);
        this.hideSection(this.elements.uniqueSection);
        this.hideSection(this.elements.nonUniqueSection);
    }
    
    hideLoading() { 
        if (this.elements.loading) {
            this.elements.loading.classList.add('hidden');
            this.elements.loading.style.display = 'none';
        }
    }
    
    hideSection(section) {
        if (!section) return;
        section.classList.add('hidden');
        section.style.display = 'none';
        section.style.visibility = 'hidden';
    }
    
    showEmpty(msg = 'Наведите на элемент') { 
        if (this.elements.emptyState) {
            this.elements.emptyState.querySelector('p').textContent = msg; 
            this.elements.emptyState.classList.remove('hidden');
            this.elements.emptyState.style.display = 'block';
        }
        this.hideSection(this.elements.primarySection);
        this.hideSection(this.elements.uniqueSection);
        this.hideSection(this.elements.nonUniqueSection);
    }
    
    showError(msg) { 
        if (this.elements.emptyState) {
            this.elements.emptyState.querySelector('p').innerHTML = `❌ ${msg}`; 
            this.elements.emptyState.classList.remove('hidden');
            this.elements.emptyState.style.display = 'block';
        }
    }
    
    updateUI() { 
        // Скрываем всё при старте
        this.hideSection(this.elements.primarySection);
        this.hideSection(this.elements.uniqueSection);
        this.hideSection(this.elements.nonUniqueSection);
        if (this.elements.elementInfo) {
            this.elements.elementInfo.classList.add('hidden');
            this.elements.elementInfo.style.display = 'none';
        }
        if (this.elements.modeInfo) {
            this.elements.modeInfo.classList.remove('hidden');
            this.elements.modeInfo.style.display = 'flex';
        }
        if (this.elements.emptyState) {
            this.elements.emptyState.classList.remove('hidden');
            this.elements.emptyState.style.display = 'block';
        }
    }
    
    escapeHtml(str) { 
        if (!str) return '';
        const d = document.createElement('div'); 
        d.textContent = str; 
        return d.innerHTML; 
    }
}

// === DEBUG: Глобальная проверка ===
console.log('[SidePanel] Script loaded, DOM ready:', document.readyState);

// Инициализация
if (document.readyState === 'loading') { 
    document.addEventListener('DOMContentLoaded', () => {
        console.log('[SidePanel] DOMContentLoaded, initializing...');
        new XPathHelperPanel(); 
    }, { once: true });
} else { 
    console.log('[SidePanel] DOM already ready, initializing...');
    new XPathHelperPanel(); 
}