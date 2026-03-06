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

    /** Экранирует значение для подстановки в XPath-строку в одинарных кавычках */
    escapeXPathString(val) {
        if (val == null || typeof val !== 'string') return '';
        return val.replace(/'/g, "''");
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
            selectors.push(this.createCandidate(`//*[@id='${this.escapeXPathString(data.id)}']`, 'id', 100));
        }
        
        // Priority атрибуты
        this.priorityAttrs.forEach(attr => {
            const val = data.attributes.find(a => a.name === attr)?.value;
            if (val) selectors.push(this.createCandidate(`//*[@${attr}='${this.escapeXPathString(val)}']`, `attr:${attr}`, 95));
        });
        
        // Классы
        data.classes.slice(0, this.options.maxClassesToProcess).forEach(cls => {
            if (cls.length < 50 && !cls.startsWith('ng-') && !cls.startsWith('cdk-')) {
                selectors.push(this.createCandidate(
                    `//${tag}[contains(concat(' ', normalize-space(@class), ' '), ' ${this.escapeXPathString(cls)} ')]`,
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
                    `//${tag}[contains(@class, '${this.escapeXPathString(base)}')]`,
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
                `//${tag}[contains(@${attr.name}, '${this.escapeXPathString(shortVal)}')]`,
                `partial:attr:${attr.name}`, 70, { usesPartial: true }
            ));
        });
        
        return selectors;
    }

    generateTextSelectors(data) {
        const selectors = [];
        if (!this.textTags.includes(data.tag.toUpperCase()) || !data.text) return selectors;
        
        selectors.push(this.createCandidate(
            `//${data.tag}[normalize-space()='${this.escapeXPathString(data.text)}']`,
            'text:exact', 85
        ));
        
        if (data.text.length > 5) {
            selectors.push(this.createCandidate(
                `//${data.tag}[contains(normalize-space(), '${this.escapeXPathString(data.text.substring(0, 30))}')]`,
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
                `//${tag}[contains(@class, '${this.escapeXPathString(classParts[0])}') and normalize-space()='${this.escapeXPathString(data.text.substring(0, 30))}']`,
                'combo:class+text', 90, { usesPartial: true }
            ));
        }
        
        // 2 класса
        if (classParts.length >= 2) {
            selectors.push(this.createCandidate(
                `//${tag}[contains(@class, '${this.escapeXPathString(classParts[0])}') and contains(@class, '${this.escapeXPathString(classParts[1])}')]`,
                'combo:2classes', 88, { usesPartial: true }
            ));
        }
        
        // Класс + атрибут
        const ariaLabel = data.attributes.find(a => a.name === 'aria-label')?.value;
        if (classParts.length > 0 && ariaLabel) {
            selectors.push(this.createCandidate(
                `//${tag}[contains(@class, '${this.escapeXPathString(classParts[0])}') and contains(@aria-label, '${this.escapeXPathString(ariaLabel.substring(0, 30))}')]`,
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
                    `//*[contains(@class, '${this.escapeXPathString(base)}')]`,
                    `mat:base:${base}`, 92, { usesPartial: true, isAngular: true }
                ));
                selectors.push(this.createCandidate(
                    `//${tag}[contains(@class, '${this.escapeXPathString(matClass)}')]`,
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
                part = `${part}[@id='${this.escapeXPathString(current.id)}']`;
            } else {
                const matCls = Array.from(current.classList).find(c => c.startsWith('mat-'));
                if (matCls) part = `${part}[contains(@class, '${this.escapeXPathString(matCls)}')]`;
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
