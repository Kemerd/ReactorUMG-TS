type SelectorKind = 'class' | 'id' | 'type';

interface BucketEntry {
    sourceId: string;
    styles: Record<string, any>;
}

interface SourceEntry {
    bucketKey: string;
    styles: Record<string, any>;
}

interface ParsedRule {
    kind: SelectorKind;
    key: string;
    pseudo: string;
    styles: Record<string, any>;
}

const inlineStyleBuckets = new Map<string, BucketEntry[]>();
const sourceEntries = new Map<string, SourceEntry[]>();

function buildBucketKey(kind: SelectorKind, key: string, pseudo: string): string {
    return `${kind}:${key}|${pseudo}`;
}

export function normalizePseudo(pseudo?: string): string {
    if (!pseudo || pseudo === 'base') {
        return 'base';
    }

    const trimmed = pseudo.trim();
    if (!trimmed) {
        return 'base';
    }

    return trimmed.startsWith(':') ? trimmed : `:${trimmed}`;
}

export function clearInlineStylesForSource(sourceId: string): void {
    const entries = sourceEntries.get(sourceId);
    if (!entries || entries.length === 0) {
        sourceEntries.delete(sourceId);
        return;
    }

    for (const { bucketKey, styles } of entries) {
        const bucket = inlineStyleBuckets.get(bucketKey);
        if (!bucket) continue;

        const nextBucket = bucket.filter(entry => entry.sourceId !== sourceId || entry.styles !== styles);
        if (nextBucket.length === 0) {
            inlineStyleBuckets.delete(bucketKey);
        } else {
            inlineStyleBuckets.set(bucketKey, nextBucket);
        }
    }

    sourceEntries.delete(sourceId);
}

export function registerInlineStyles(sourceId: string, rules: ParsedRule[]): void {
    clearInlineStylesForSource(sourceId);
    if (!rules || rules.length === 0) {
        return;
    }

    const recorded: SourceEntry[] = [];
    for (const rule of rules) {
        if (!rule.key || !rule.styles) continue;
        const pseudo = normalizePseudo(rule.pseudo);
        const bucketKey = buildBucketKey(rule.kind, rule.key, pseudo);
        let bucket = inlineStyleBuckets.get(bucketKey);
        if (!bucket) {
            bucket = [];
            inlineStyleBuckets.set(bucketKey, bucket);
        }

        const stylesCopy = { ...rule.styles };
        bucket.push({ sourceId, styles: stylesCopy });
        recorded.push({ bucketKey, styles: stylesCopy });
    }

    if (recorded.length > 0) {
        sourceEntries.set(sourceId, recorded);
    }
}

export function getInlineStyles(kind: SelectorKind, key: string, pseudo?: string): Record<string, any> | undefined {
    if (!key) {
        return undefined;
    }

    const normalizedPseudo = normalizePseudo(pseudo);
    const bucketKey = buildBucketKey(kind, key, normalizedPseudo);
    let bucket = inlineStyleBuckets.get(bucketKey);

    if (!bucket && normalizedPseudo.startsWith(':')) {
        const fallbackKey = buildBucketKey(kind, key, normalizedPseudo.slice(1));
        bucket = inlineStyleBuckets.get(fallbackKey);
    }

    if (!bucket || bucket.length === 0) {
        return undefined;
    }

    const result: Record<string, any> = {};
    for (const entry of bucket) {
        Object.assign(result, entry.styles);
    }

    return result;
}

/**
 * Parsed @media rule containing a condition string and the nested CSS rules.
 */
export interface MediaRule {
    condition: string;
    rules: ParsedRule[];
}

/**
 * Result of parsing a <style> block: regular rules plus any @media blocks.
 */
export interface ParsedStyleSheet {
    rules: ParsedRule[];
    mediaRules: MediaRule[];
    keyframes: Map<string, KeyframeDefinition>;
}

/**
 * A single keyframe step with a percentage offset and associated styles.
 */
export interface KeyframeStep {
    offset: number; // 0.0 to 1.0
    styles: Record<string, any>;
}

/**
 * Complete @keyframes definition: an ordered list of steps.
 */
export interface KeyframeDefinition {
    name: string;
    steps: KeyframeStep[];
}

/**
 * Parses inline CSS text into structured rules, extracting @media blocks,
 * @keyframes definitions, and regular selector rules.
 *
 * Custom properties (--*) are automatically extracted and registered in the
 * CSS variable registry during parsing.
 */
export function parseInlineCss(cssText: string, declarationParser: (block: string) => Record<string, any>): ParsedRule[] {
    const sheet = parseStyleSheet(cssText, declarationParser);
    return sheet.rules;
}

/**
 * Full-fidelity style sheet parser that returns rules, @media blocks,
 * and @keyframes definitions.
 */
export function parseStyleSheet(cssText: string, declarationParser: (block: string) => Record<string, any>): ParsedStyleSheet {
    const result: ParsedStyleSheet = {
        rules: [],
        mediaRules: [],
        keyframes: new Map()
    };

    if (!cssText || typeof cssText !== 'string') {
        return result;
    }

    // Strip C-style comments
    const sanitized = cssText.replace(/\/\*[\s\S]*?\*\//g, '');

    // Extract and process @keyframes blocks before the main parse
    const afterKeyframes = extractKeyframes(sanitized, declarationParser, result.keyframes);

    // Extract and process @media blocks
    const afterMedia = extractMediaBlocks(afterKeyframes, declarationParser, result.mediaRules);

    // Parse remaining top-level rules
    result.rules = parseRuleBlock(afterMedia, declarationParser);

    return result;
}

/**
 * Extracts @keyframes blocks from CSS text. Returns the text with those blocks removed.
 */
function extractKeyframes(
    css: string,
    declarationParser: (block: string) => Record<string, any>,
    target: Map<string, KeyframeDefinition>
): string {
    // Match @keyframes <name> { ... } including nested braces for individual stops
    const keyframesRegex = /@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\}\s*\}/g;
    let remaining = css;
    let match: RegExpExecArray | null;

    while ((match = keyframesRegex.exec(css)) !== null) {
        const name = match[1];
        const body = match[2];
        remaining = remaining.replace(match[0], '');

        const steps: KeyframeStep[] = [];
        // Parse individual keyframe stops: "0% { ... }" or "from { ... }" or "to { ... }"
        const stopRegex = /([\d.]+%|from|to)\s*\{([^}]*)\}/g;
        let stopMatch: RegExpExecArray | null;

        while ((stopMatch = stopRegex.exec(body)) !== null) {
            const offsetStr = stopMatch[1].trim().toLowerCase();
            const declarations = declarationParser(stopMatch[2].trim());

            let offset = 0;
            if (offsetStr === 'from') {
                offset = 0;
            } else if (offsetStr === 'to') {
                offset = 1;
            } else {
                offset = parseFloat(offsetStr) / 100;
            }

            if (!isNaN(offset) && declarations && Object.keys(declarations).length > 0) {
                steps.push({ offset, styles: declarations });
            }
        }

        // Sort steps by offset for correct interpolation ordering
        steps.sort((a, b) => a.offset - b.offset);

        if (steps.length > 0) {
            target.set(name, { name, steps });
        }
    }

    return remaining;
}

/**
 * Extracts @media blocks from CSS text. Returns the text with those blocks removed.
 * Each @media block is parsed into its own set of rules that can be conditionally applied.
 */
function extractMediaBlocks(
    css: string,
    declarationParser: (block: string) => Record<string, any>,
    target: MediaRule[]
): string {
    // Match @media <condition> { <body> } handling nested braces
    const mediaRegex = /@media\s+([^{]+)\{([\s\S]*?)\}\s*\}/g;
    let remaining = css;
    let match: RegExpExecArray | null;

    while ((match = mediaRegex.exec(css)) !== null) {
        const condition = match[1].trim();
        const body = match[2].trim();
        remaining = remaining.replace(match[0], '');

        const rules = parseRuleBlock(body, declarationParser);
        if (rules.length > 0) {
            target.push({ condition, rules });
        }
    }

    return remaining;
}

/**
 * Parses a block of CSS text (without @-rules) into an array of ParsedRule objects.
 * Custom property declarations (--*) are extracted and registered automatically.
 */
function parseRuleBlock(css: string, declarationParser: (block: string) => Record<string, any>): ParsedRule[] {
    const rules: ParsedRule[] = [];
    if (!css) return rules;

    const regex = /([^{}]+)\{([^{}]*)\}/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(css)) !== null) {
        const selectorGroup = match[1].trim();
        const declarationBlock = match[2].trim();
        if (!selectorGroup || !declarationBlock) continue;

        let declarationMap = declarationParser(declarationBlock);
        if (!declarationMap || Object.keys(declarationMap).length === 0) continue;

        // Extract and register CSS custom properties (--*) from the declarations
        const { extractAndRegisterVariables } = require('./css_variable_registry');
        const selectors = selectorGroup.split(',').map(sel => sel.trim()).filter(Boolean);

        for (const selector of selectors) {
            if (!selector) continue;
            const { kind, key, pseudo } = dissectSelector(selector);
            if (!key) continue;

            // Build the scope string for variable registration
            const scope = kind === 'class' ? `.${key}` : kind === 'id' ? `#${key}` : key;
            const cleanedDeclarations = extractAndRegisterVariables(scope, { ...declarationMap });

            if (Object.keys(cleanedDeclarations).length > 0) {
                rules.push({
                    kind,
                    key,
                    pseudo,
                    styles: cleanedDeclarations
                });
            }
        }
    }

    return rules;
}

/**
 * Evaluates a @media condition string against the current viewport dimensions.
 * Supports: min-width, max-width, min-height, max-height, orientation.
 *
 * @param condition     - The media query condition (e.g. "(min-width: 800px)")
 * @param viewportSize  - Current viewport dimensions { width, height }
 * @returns true if the condition matches
 */
export function evaluateMediaCondition(
    condition: string,
    viewportSize: { width: number; height: number }
): boolean {
    if (!condition || !viewportSize) {
        return false;
    }

    const normalized = condition.toLowerCase().trim();

    // Check for orientation queries
    if (normalized.includes('orientation')) {
        const isLandscape = viewportSize.width >= viewportSize.height;
        if (normalized.includes('landscape') && !isLandscape) return false;
        if (normalized.includes('portrait') && isLandscape) return false;
    }

    // Parse dimensional conditions: (min-width: 800px), (max-height: 600px), etc.
    const dimensionRegex = /\(\s*(min|max)-(width|height)\s*:\s*(\d+(?:\.\d+)?)(px|em|rem)?\s*\)/g;
    let dimMatch: RegExpExecArray | null;
    let allConditionsMet = true;

    while ((dimMatch = dimensionRegex.exec(normalized)) !== null) {
        const minOrMax = dimMatch[1];
        const widthOrHeight = dimMatch[2];
        let threshold = parseFloat(dimMatch[3]);
        const unit = dimMatch[4] || 'px';

        // Convert em/rem to px (using standard 16px base)
        if (unit === 'em' || unit === 'rem') {
            threshold *= 16;
        }

        const actual = widthOrHeight === 'width' ? viewportSize.width : viewportSize.height;

        if (minOrMax === 'min' && actual < threshold) {
            allConditionsMet = false;
        }
        if (minOrMax === 'max' && actual > threshold) {
            allConditionsMet = false;
        }
    }

    return allConditionsMet;
}

function dissectSelector(selector: string): { kind: SelectorKind; key: string; pseudo: string } {
    let base = selector;
    let pseudo = 'base';

    const separatorIndex = findPseudoSeparator(selector);
    if (separatorIndex >= 0) {
        base = selector.slice(0, separatorIndex).trim();
        pseudo = selector.slice(separatorIndex).trim() || 'base';
    } else {
        base = selector.trim();
    }

    if (!base) {
        return { kind: 'type', key: '', pseudo };
    }

    if (base.startsWith('.')) {
        return { kind: 'class', key: base.slice(1).trim(), pseudo };
    }

    if (base.startsWith('#')) {
        return { kind: 'id', key: base.slice(1).trim(), pseudo };
    }

    return { kind: 'type', key: base.toLowerCase(), pseudo };
}

function findPseudoSeparator(selector: string): number {
    let paren = 0;
    let bracket = 0;
    for (let i = 0; i < selector.length; i++) {
        const ch = selector[i];
        if (ch === '(') {
            paren++;
        } else if (ch === ')') {
            paren = Math.max(0, paren - 1);
        } else if (ch === '[') {
            bracket++;
        } else if (ch === ']') {
            bracket = Math.max(0, bracket - 1);
        } else if (ch === ':' && paren === 0 && bracket === 0) {
            return i;
        }
    }
    return -1;
}

export function clearAllInlineStyles(): void {
    inlineStyleBuckets.clear();
    sourceEntries.clear();
}

export type { SelectorKind, ParsedRule };
