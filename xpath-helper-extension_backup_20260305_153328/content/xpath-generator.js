// content/xpath-generator.js
class XPathGenerator {
    constructor(options = {}) {
        this.options = {
            maxAttrLength: 50,
            minClassPartLength: 3,
            maxClassParts: 5,           // Увеличили с 3 до 5
            useWordBoundary: true,
            preferPrefix: true,
            maxCandidates: 500,         // Увеличили с 100 до 500
            maxClassesToProcess: 15,    // Новый параметр
            ...options
        };
        
        this.angularMatSelectors = new Set([
            "mat-button", "mat-raised-button", "mat-flat-button", "mat-stroked-button",
            "mat-icon-button", "mat-fab", "mat-mini-fab", "mat-button-toggle",
            "mat-input-element", "mat-form-field", "mat-form-field-infix",
            "mat-form-field-outline", "mat-form-field-label", "mat-form-field-underline",
            "mat-form-field-subscript-wrapper", "mat-form-field-flex",
            "mat-textarea-autosize", "mat-button-base",
            "mat-checkbox", "mat-checkbox-inner-container", "mat-checkbox-layout",
            "mat-checkbox-label",
            "mat-radio-button", "mat-radio-container", "mat-radio-label",
            "mat-radio-label-content", "mat-radio-group",
            "mat-slide-toggle", "mat-slide-toggle-bar", "mat-slide-toggle-thumb",
            "mat-slide-toggle-content",
            "mat-select", "mat-select-panel", "mat-select-trigger", "mat-select-value",
            "mat-select-placeholder", "mat-option", "mat-option-text",
            "mat-focus-indicator",
            "mat-datepicker", "mat-datepicker-toggle", "mat-datepicker-content",
            "mat-calendar",
            "mat-slider", "mat-slider-track", "mat-slider-thumb", "mat-slider-thumb-label",
            "mat-menu", "mat-menu-panel", "mat-menu-item", "mat-tooltip",
            "mat-card", "mat-card-header", "mat-card-title", "mat-card-subtitle",
            "mat-card-content", "mat-card-actions", "mat-card-image",
            "mat-table", "mat-header-cell", "mat-cell", "mat-row", "mat-header-row",
            "mat-paginator",
            "mat-tab-group", "mat-tab-header", "mat-tab-label", "mat-tab-body", "mat-tab",
            "mat-list", "mat-list-item", "mat-list-option", "mat-selection-list",
            "mat-expansion-panel", "mat-expansion-panel-header",
            "mat-expansion-panel-content", "mat-accordion",
            "mat-progress-bar", "mat-progress-spinner",
            "mat-icon",
            "mat-chip", "mat-chip-list",
            "mat-badge",
            "mat-dialog", "mat-dialog-container", "mat-dialog-content",
            "mat-dialog-actions", "mat-dialog-title",
            "mat-snack-bar", "mat-snack-bar-container",
            "mat-toolbar", "mat-sidenav", "mat-sidenav-container",
            "mat-sidenav-content",
            "mat-tree", "mat-tree-node", "mat-nested-tree-node",
            "mat-autocomplete", "mat-autocomplete-panel",
            "mat-sort", "mat-sort-header",
            "mat-grid-list", "mat-grid-tile"
        ]);
        
        this.priorityAttrs = ['data-test-id', 'data-testid', 'data-qa', 'id', 'name'];
        this.secondaryAttrs = ['href', 'src', 'placeholder', 'alt', 'title', 'type', 'role', 'aria-label', 'aria-labelledby', 'aria-describedby'];
        this.textTags = ['BUTTON', 'A', 'LABEL', 'TH', 'SPAN', 'H1', 'H2', 'H3', 'P', 'DIV'];
    }

    async generateAll(element, doc = document) {
        if (!element || element.nodeType !== 1) return null;
        this.doc = doc;

        const candidates = [];
        const data = this.extractElementData(element);
        const isMat = this.isAngularMaterialElement(element, data);

        // Генерируем больше кандидатов
        if (isMat) candidates.push(...this.generateMatPartialSelectors(element, data));
        candidates.push(...this.generatePartialClassSelectors(data));
        candidates.push(...this.generatePartialAttrSelectors(data));
        candidates.push(...this.generatePartialCombinations(data));
        candidates.push(...this.generateStandardSelectors(data));
        candidates.push(...this.generateContextualSelectors(element, isMat));
        candidates.push(...this.generateTextBasedSelectors(data));
        candidates.push(...this.generateAttributeCombinations(data));

        // Валидация с дедупликацией
        const seenXpaths = new Set();
        const validated = [];
        
        for (const c of candidates) {
            // Пропускаем дубликаты XPath
            if (seenXpaths.has(c.xpath)) continue;
            seenXpaths.add(c.xpath);
            
            const count = this.countMatches(c.xpath);
            if (count >= 1) {
                validated.push({
                    ...c,
                    matchCount: count,
                    isUnique: count === 1,
                    exists: true,
                    usesPartial: c.usesPartial || false,
                    isAngular: c.isAngular || false,
                    complexity: this.calculateComplexity(c.xpath)
                });
            }
            // Пауза для responsiveness
            if (validated.length % 20 === 0) await new Promise(r => setTimeout(r, 0));
        }

        // Сортировка
        validated.sort((a, b) => {
            if (a.isUnique && !b.isUnique) return -1;
            if (!a.isUnique && b.isUnique) return 1;
            if (a.isAngular && !b.isAngular) return -1;
            if (!a.isAngular && b.isAngular) return 1;
            if (a.score !== b.score) return b.score - a.score;
            if (a.complexity !== b.complexity) return a.complexity - b.complexity;
            return a.xpath.length - b.xpath.length;
        });

        const unique = validated.filter(c => c.isUnique);
        const nonUnique = validated.filter(c => !c.isUnique);

        return {
            primary: unique[0] || validated[0] || null,
            fallbacks: validated.slice(1, this.options.maxCandidates),
            all: validated,
            uniqueOnly: unique,
            nonUniqueOnly: nonUnique,
            isAngularMaterial: isMat,
            summary: {
                total: validated.length,
                unique: unique.length,
                nonUnique: nonUnique.length,
                partialBased: validated.filter(c => c.usesPartial).length,
                angularSelectors: validated.filter(c => c.isAngular).length,
                element: element.tagName.toLowerCase(),
                component: isMat ? this.detectAngularComponent(element) : null
            }
        };
    }

    extractElementData(el) {
        return {
            tag: el.tagName.toLowerCase(),
            id: el.id || null,
            classes: Array.from(el.classList),
            text: el.textContent?.trim().substring(0, 150) || '',
            attributes: Array.from(el.attributes).map(a => ({ name: a.name, value: a.value })),
            parent: el.parentElement,
            rect: el.getBoundingClientRect()
        };
    }

    generateStandardSelectors(data) {
        const selectors = [];
        if (data.id) selectors.push(this.createCandidate(`//*[@id='${data.id}']`, 'id', 100));
        
        this.priorityAttrs.forEach(attr => {
            const val = this.getAttrValue(data.attributes, attr);
            if (val) selectors.push(this.createCandidate(`//*[@${attr}='${val}']`, `attr:${attr}`, 95));
        });
        
        if (this.textTags.includes(data.tag.toUpperCase()) && data.text) {
            selectors.push(this.createCandidate(`//${data.tag}[normalize-space()='${data.text}']`, 'text', 90));
            // Вариант с contains для текста
            if (data.text.length > 5) {
                const shortText = data.text.substring(0, 30);
                selectors.push(this.createCandidate(`//${data.tag}[contains(normalize-space(), '${shortText}')]`, 'text:contains', 85));
            }
        }
        
        // Все классы по отдельности
        data.classes.slice(0, this.options.maxClassesToProcess).forEach(cls => {
            if (cls.length < 50 && !cls.startsWith('ng-') && !cls.startsWith('cdk-')) {
                const xpath = `//${data.tag}[contains(concat(' ', normalize-space(@class), ' '), ' ${cls} ')]`;
                selectors.push(this.createCandidate(xpath, `class:${cls}`, 70));
            }
        });
        
        return selectors;
    }

    generatePartialClassSelectors(data) {
        const selectors = [];
        const tag = data.tag;
        
        for (const fullClass of data.classes.slice(0, this.options.maxClassesToProcess)) {
            if (fullClass.length < this.options.minClassPartLength) continue;
            if (['ng-star-inserted', 'ng-tns-c', 'cdk-', '_ngcontent'].some(p => fullClass.startsWith(p) || fullClass.includes(p))) continue;

            const parts = this.extractMeaningfulParts(fullClass);
            for (const part of parts.slice(0, this.options.maxClassParts)) {
                // contains с частичным классом
                const xpath1 = `//${tag}[contains(@class, '${part}')]`;
                selectors.push(this.createCandidate(xpath1, `partial:class:${part}`, 75, { usesPartial: true }));
                
                // contains с пробелами для точности
                const xpath2 = `//${tag}[contains(concat(' ', normalize-space(@class), ' '), ' ${part} ')]`;
                selectors.push(this.createCandidate(xpath2, `partial:class-exact:${part}`, 78, { usesPartial: true }));
            }
        }
        return selectors;
    }

    generatePartialAttrSelectors(data) {
        const selectors = [];
        const tag = data.tag;
        
        for (const attr of data.attributes) {
            if (attr.value.length <= 5) continue;
            if (this.priorityAttrs.includes(attr.name)) continue;
            
            const partialValue = this.smartTruncate(attr.value, this.options.maxAttrLength);
            if (!partialValue || partialValue.length < 3) continue;
            
            // contains для атрибута
            const xpath = `//${tag}[contains(@${attr.name}, '${partialValue}')]`;
            selectors.push(this.createCandidate(xpath, `partial:attr:${attr.name}`, 73, { usesPartial: true }));
            
            // starts-with для атрибута
            if (attr.value.startsWith(partialValue)) {
                const xpath2 = `//${tag}[starts-with(@${attr.name}, '${partialValue}')]`;
                selectors.push(this.createCandidate(xpath2, `partial:attr-starts:${attr.name}`, 71, { usesPartial: true }));
            }
        }
        return selectors;
    }

    generatePartialCombinations(data) {
        const selectors = [];
        const tag = data.tag;
        const classParts = data.classes.flatMap(c => this.extractMeaningfulParts(c)).slice(0, 5);
        const longAttrs = data.attributes.filter(a => a.value.length > 10 && !this.priorityAttrs.includes(a.name)).slice(0, 3);
        
        // Комбинации class + attr
        for (const cp of classParts) {
            for (const attr of longAttrs) {
                const pv = this.smartTruncate(attr.value, 30);
                if (pv) {
                    const xpath = `//${tag}[contains(@class, '${cp}') and contains(@${attr.name}, '${pv}')]`;
                    selectors.push(this.createCandidate(xpath, `partial:combo:class+attr`, 88, { usesPartial: true }));
                }
            }
        }
        
        // Комбинации 2 классов
        if (classParts.length >= 2) {
            for (let i = 0; i < Math.min(classParts.length, 3); i++) {
                for (let j = i + 1; j < Math.min(classParts.length, 4); j++) {
                    if (classParts[i] !== classParts[j]) {
                        const xpath = `//${tag}[contains(@class, '${classParts[i]}') and contains(@class, '${classParts[j]}')]`;
                        selectors.push(this.createCandidate(xpath, `partial:combo:2classes`, 85, { usesPartial: true }));
                    }
                }
            }
        }
        
        // Комбинации 3 классов
        if (classParts.length >= 3) {
            const xpath = `//${tag}[contains(@class, '${classParts[0]}') and contains(@class, '${classParts[1]}') and contains(@class, '${classParts[2]}')]`;
            selectors.push(this.createCandidate(xpath, `partial:combo:3classes`, 90, { usesPartial: true }));
        }
        
        // Комбинация: class + text
        if (this.textTags.includes(tag.toUpperCase()) && data.text && classParts.length > 0) {
            const shortText = data.text.substring(0, 30);
            const xpath = `//${tag}[contains(@class, '${classParts[0]}') and normalize-space()='${shortText}']`;
            selectors.push(this.createCandidate(xpath, `partial:combo:class+text`, 90, { usesPartial: true }));
        }
        
        return selectors;
    }

    generateMatPartialSelectors(element, data) {
        const selectors = [];
        const tag = element.tagName.toLowerCase();
        
        // Все mat-классы
        const matClasses = data.classes.filter(c => c.startsWith('mat-'));
        for (const matClass of matClasses) {
            // Базовый компонент
            const baseMatch = matClass.match(/^mat-([a-z-]+)/);
            if (baseMatch) {
                const base = `mat-${baseMatch[1]}`;
                selectors.push(this.createCandidate(
                    `//*[contains(@class, ' ${base} ') or contains(@class, '${base}-')]`,
                    `mat:partial-base:${base}`, 95, { usesPartial: true, isAngular: true }
                ));
                selectors.push(this.createCandidate(
                    `//${tag}[contains(@class, '${base}')]`,
                    `mat:tag+base:${base}`, 92, { usesPartial: true, isAngular: true }
                ));
            }
            
            // Полный класс
            const xpath = `//${tag}[contains(@class, '${matClass}')]`;
            selectors.push(this.createCandidate(xpath, `mat:class:${matClass}`, 88, { usesPartial: true, isAngular: true }));
        }
        
        // Angular атрибуты
        const matAttrs = data.attributes.filter(a => a.name.startsWith('mat-') || a.name.startsWith('_ngcontent'));
        for (const attr of matAttrs) {
            selectors.push(this.createCandidate(
                `//${tag}[@${attr.name}]`,
                `mat:attr-exists:${attr.name}`, 85, { usesPartial: true, isAngular: true }
            ));
            if (attr.value) {
                selectors.push(this.createCandidate(
                    `//${tag}[@${attr.name}='${attr.value}']`,
                    `mat:attr:${attr.name}`, 90, { usesPartial: true, isAngular: true }
                ));
            }
        }
        
        // aria-label partial
        const ariaLabel = this.getAttrValue(data.attributes, 'aria-label');
        if (ariaLabel && ariaLabel.length > 10) {
            const words = ariaLabel.split(' ');
            for (let i = 1; i <= Math.min(words.length, 3); i++) {
                const keyWords = words.slice(0, i).join(' ');
                selectors.push(this.createCandidate(
                    `//*[contains(@aria-label, '${keyWords}')]`,
                    `mat:partial-aria:${i}words`, 85, { usesPartial: true, isAngular: true }
                ));
            }
        }
        
        return selectors;
    }

    generateContextualSelectors(element, isMat, maxDepth = 5) {
        const selectors = [];
        let current = element.parentElement;
        let path = [];
        
        for (let depth = 0; current && depth < maxDepth; depth++) {
            const cData = this.extractElementData(current);
            let part = current.tagName.toLowerCase();
            
            if (this.isAngularMaterialElement(current, cData)) {
                const matCls = cData.classes.find(c => c.startsWith('mat-'));
                if (matCls) part = `${current.tagName.toLowerCase()}[contains(@class, '${matCls}')]`;
            } else if (current.id) {
                part = `${current.tagName.toLowerCase()}[@id='${current.id}']`;
            } else if (cData.classes.length > 0) {
                const cls = cData.classes.find(c => !c.startsWith('ng-') && !c.startsWith('cdk-'));
                if (cls) part = `${current.tagName.toLowerCase()}[contains(@class, '${cls}')]`;
            }
            
            path.unshift(part);
            
            // Прямой потомок
            const xpath1 = '//' + path.join('/') + `/${element.tagName.toLowerCase()}`;
            selectors.push(this.createCandidate(xpath1, `context:direct:d${depth + 1}`, 65 - depth * 5, { isAngular: isMat }));
            
            // Любой потомок
            const xpath2 = '//' + path.join('/') + `//${element.tagName.toLowerCase()}`;
            selectors.push(this.createCandidate(xpath2, `context:any:d${depth + 1}`, 60 - depth * 5, { isAngular: isMat }));
            
            current = current.parentElement;
        }
        return selectors;
    }

    generateTextBasedSelectors(data) {
        const selectors = [];
        if (!this.textTags.includes(data.tag.toUpperCase()) || !data.text) return selectors;
        
        const text = data.text;
        
        // Полное совпадение
        selectors.push(this.createCandidate(`//${data.tag}[normalize-space()='${text}']`, 'text:exact', 90));
        
        // contains
        if (text.length > 5) {
            selectors.push(this.createCandidate(`//${data.tag}[contains(normalize-space(), '${text.substring(0, 30)}')]`, 'text:contains', 85));
        }
        
        // starts-with
        if (text.length > 3) {
            selectors.push(this.createCandidate(`//${data.tag}[starts-with(normalize-space(), '${text.substring(0, 20)}')]`, 'text:starts', 82));
        }
        
        return selectors;
    }

    generateAttributeCombinations(data) {
        const selectors = [];
        const tag = data.tag;
        
        // Комбинации атрибутов
        const attrs = data.attributes.filter(a => !this.priorityAttrs.includes(a.name) && a.value.length > 0);
        
        for (let i = 0; i < Math.min(attrs.length, 3); i++) {
            for (let j = i + 1; j < Math.min(attrs.length, 4); j++) {
                const xpath = `//${tag}[@${attrs[i].name}='${attrs[i].value}' and @${attrs[j].name}='${attrs[j].value}']`;
                selectors.push(this.createCandidate(xpath, `attr:combo:${attrs[i].name}+${attrs[j].name}`, 87));
            }
        }
        
        return selectors;
    }

    extractMeaningfulParts(fullClass) {
        const parts = [];
        if (fullClass.length <= 30) parts.push(fullClass);
        
        const segments = fullClass.split('-');
        if (segments.length >= 2 && segments[0] === 'mat') {
            parts.push(`${segments[0]}-${segments[1]}`);
            if (segments.length >= 3) {
                parts.push(`${segments[0]}-${segments[1]}-${segments[2]}`);
            }
        }
        if (segments.length >= 3) {
            parts.push(segments.slice(-2).join('-'));
            parts.push(segments.slice(-3).join('-'));
        }
        const longest = segments.reduce((a, b) => a.length > b.length ? a : b, '');
        if (longest.length >= this.options.minClassPartLength) parts.push(longest);
        
        if (/\d/.test(fullClass)) {
            const letters = fullClass.replace(/[\d_]/g, '');
            if (letters.length >= this.options.minClassPartLength) parts.push(letters);
        }
        
        return [...new Set(parts)].filter(p => 
            p.length >= this.options.minClassPartLength && 
            !['ng', 'star', 'inserted', 'cdk', 'zen', 'content'].includes(p)
        );
    }

    smartTruncate(value, maxLength) {
        if (value.length <= maxLength) return value;
        if (this.options.useWordBoundary && value.includes(' ')) {
            const words = value.split(' ');
            let result = '';
            for (const word of words) {
                if ((result + word + ' ').length <= maxLength) result += word + ' ';
                else break;
            }
            return result.trim() || value.substring(0, maxLength).split(' ').slice(0, -1).join(' ');
        }
        if (value.includes('-')) {
            const parts = value.split('-');
            let result = '';
            for (const part of parts) {
                if ((result + part + '-').length <= maxLength) result += part + '-';
                else break;
            }
            return result.replace(/-$/, '') || value.substring(0, maxLength);
        }
        return value.substring(0, maxLength);
    }

    calculateComplexity(xpath) {
        let score = 0;
        score += (xpath.match(/\[\w*[\^$*]?=/g) || []).length * 2;
        score += (xpath.match(/\/\//g) || []).length;
        score += (xpath.match(/contains|starts-with|normalize-space/g) || []).length;
        score += xpath.length / 60;
        return Math.round(score * 10) / 10;
    }

    createCandidate(xpath, type, baseScore, extras = {}) {
        return { xpath, type, score: baseScore, length: xpath.length, ...extras };
    }

    getAttrValue(attrs, name) {
        return attrs.find(a => a.name === name)?.value || null;
    }

    countMatches(xpath) {
        try {
            const result = this.doc.evaluate(xpath, this.doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            return result.snapshotLength;
        } catch (e) { return 0; }
    }

    isAngularMaterialElement(element, data) {
        if (this.angularMatSelectors.has(element.tagName.toLowerCase())) return true;
        for (const cls of data.classes) {
            if (this.angularMatSelectors.has(cls) || cls.startsWith('mat-') || cls.startsWith('cdk-')) return true;
        }
        return false;
    }

    detectAngularComponent(element) {
        const tag = element.tagName.toLowerCase();
        if (this.angularMatSelectors.has(tag)) return tag;
        for (const cls of element.classList) {
            if (this.angularMatSelectors.has(cls)) return cls;
            const match = cls.match(/^mat-([a-z-]+)/);
            if (match && this.angularMatSelectors.has(`mat-${match[1]}`)) return `mat-${match[1]}`;
        }
        return null;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = XPathGenerator;
}
