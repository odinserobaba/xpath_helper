// content/xpath-generator.js
class XPathGenerator {
    constructor() {
        console.log('[XPathGenerator] Created');
    }
    
    async generateAll(element) {
        console.log('[XPathGenerator] generateAll called for:', element.tagName);
        
        // Простой тестовый XPath
        const tag = element.tagName.toLowerCase();
        const xpath = element.id 
            ? `//*[@id='${element.id}']`
            : `//${tag}[contains(@class, '${Array.from(element.classList)[0] || 'test'}')]`;
        
        return {
            primary: { 
                xpath: xpath, 
                score: 100, 
                isUnique: true, 
                type: 'generated', 
                matchCount: 1,
                isAngular: element.className?.includes('mat-') || false,
                usesPartial: false
            },
            uniqueOnly: [],
            nonUniqueOnly: [],
            all: [],
            summary: { 
                total: 1, 
                unique: 1, 
                nonUnique: 0,
                partialBased: 0,
                angularSelectors: element.className?.includes('mat-') ? 1 : 0
            }
        };
    }
}
console.log('[XPathGenerator] Class defined');
