"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStylesFromClassSelector = getStylesFromClassSelector;
exports.getStyleFromIdSelector = getStyleFromIdSelector;
exports.getStyleFromTypeSelector = getStyleFromTypeSelector;
exports.getAllStyles = getAllStyles;
exports.convertCssToStyles = convertCssToStyles;
exports.convertCssToStyles2 = convertCssToStyles2;
const inline_style_registry_1 = require("./inline_style_registry");
const css_variable_registry_1 = require("./css_variable_registry");
function mergeStyleRecords(target, addition) {
    if (addition && Object.keys(addition).length > 0) {
        Object.assign(target, addition);
    }
}
function fetchCssSelector(selector, pseudo) {
    let style = getCssStyleFromGlobalCache(selector, pseudo);
    if (!style && pseudo.startsWith(':')) {
        style = getCssStyleFromGlobalCache(selector, pseudo.slice(1));
    }
    return style || undefined;
}
function buildAttributeSelectorsFromProps(props) {
    if (!props) {
        return [];
    }
    const selectors = [];
    const attributeKeys = Object.keys(props);
    for (let i = 0; i < attributeKeys.length; i++) {
        const key = attributeKeys[i];
        if (key === 'children' || key.startsWith('_')) {
            continue;
        }
        const value = props[key];
        if (value === undefined || value === null || typeof value === 'function') {
            continue;
        }
        const normalizedValue = String(value).trim();
        if (!normalizedValue || normalizedValue === '[object Object]') {
            continue;
        }
        const escapedValue = normalizedValue.replace(/"/g, '\\"');
        selectors.push(`${key}="${escapedValue}"`);
    }
    return selectors;
}
function getDescendantStylesForClass(className, childType, attributeSelectors, pseudo) {
    if (!className || !childType) {
        return {};
    }
    const normalizedChildType = childType.trim().toLowerCase();
    if (!normalizedChildType) {
        return {};
    }
    const normalizedPseudo = (0, inline_style_registry_1.normalizePseudo)(pseudo);
    const baseSelector = className.startsWith('uniquescope_') ? className : `.${className}`;
    const descendantSelector = `${baseSelector} ${normalizedChildType}`;
    const result = {};
    const selectors = [descendantSelector];
    for (const attributeSelector of attributeSelectors) {
        selectors.push(`${descendantSelector}[${attributeSelector}]`);
    }
    for (const selector of selectors) {
        mergeStyleRecords(result, fetchCssSelector(selector, normalizedPseudo));
    }
    mergeStyleRecords(result, (0, inline_style_registry_1.getInlineStyles)('class', `${className} ${normalizedChildType}`, normalizedPseudo));
    return result;
}
function getParentDescendantStyles(childType, props, attributeSelectors, pseudo) {
    const parentClassName = props?.__parentProps?.className ?? undefined;
    if (!parentClassName || typeof parentClassName !== 'string') {
        return {};
    }
    const classTokens = parentClassName.split(/\s+/).filter(token => token);
    if (classTokens.length === 0) {
        return {};
    }
    const result = {};
    for (const parentClass of classTokens) {
        mergeStyleRecords(result, getDescendantStylesForClass(parentClass, childType, attributeSelectors, pseudo));
    }
    return result;
}
function getAttributeSelectorStylesForType(childType, attributeSelectors, pseudo) {
    if (!childType || attributeSelectors.length === 0) {
        return {};
    }
    const normalizedChildType = childType.trim().toLowerCase();
    if (!normalizedChildType) {
        return {};
    }
    const normalizedPseudo = (0, inline_style_registry_1.normalizePseudo)(pseudo);
    const result = {};
    for (const attributeSelector of attributeSelectors) {
        mergeStyleRecords(result, fetchCssSelector(`${normalizedChildType}[${attributeSelector}]`, normalizedPseudo));
    }
    return result;
}
function getStylesFromClassSelector(className, pseudo) {
    if (!className) {
        return {};
    }
    let classNameStyles = {};
    const normalizedPseudo = (0, inline_style_registry_1.normalizePseudo)(pseudo);
    // Split multiple classes
    const classNames = className.split(' ');
    for (const token of classNames) {
        if (!token)
            continue;
        const baseSelector = token.startsWith('uniquescope_') ? token : `.${token}`;
        const classStyle = fetchCssSelector(baseSelector, normalizedPseudo);
        mergeStyleRecords(classNameStyles, classStyle);
        const inlineStyle = (0, inline_style_registry_1.getInlineStyles)('class', token, normalizedPseudo);
        mergeStyleRecords(classNameStyles, inlineStyle);
    }
    return classNameStyles;
}
function getStyleFromIdSelector(id, pseudo) {
    if (!id) {
        return {};
    }
    const normalizedPseudo = (0, inline_style_registry_1.normalizePseudo)(pseudo);
    const idStyle = getCssStyleFromGlobalCache(`#${id}`, normalizedPseudo)
        || (normalizedPseudo.startsWith(':') ? getCssStyleFromGlobalCache(`#${id}`, normalizedPseudo.slice(1)) : undefined);
    const inlineStyle = (0, inline_style_registry_1.getInlineStyles)('id', id, normalizedPseudo);
    if (inlineStyle) {
        return { ...(idStyle || {}), ...inlineStyle };
    }
    return idStyle;
}
function getStyleFromTypeSelector(type, pseudo) {
    if (!type) {
        return {};
    }
    const normalizedPseudo = (0, inline_style_registry_1.normalizePseudo)(pseudo);
    const typeStyle = getCssStyleFromGlobalCache(type, normalizedPseudo)
        || (normalizedPseudo.startsWith(':') ? getCssStyleFromGlobalCache(type, normalizedPseudo.slice(1)) : undefined);
    const inlineStyle = (0, inline_style_registry_1.getInlineStyles)('type', type, normalizedPseudo);
    if (inlineStyle) {
        return { ...(typeStyle || {}), ...inlineStyle };
    }
    return typeStyle;
}
/* c8 ignore start */
function parseClassName(props) {
    if (!props) {
        return "";
    }
    let currentPropsClassName = props?.className;
    if (currentPropsClassName) {
        return currentPropsClassName;
    }
    else {
        const type = props?.type;
        const parentClassName = props?.__parentProps.className ?? "";
        if (parentClassName && type
            && typeof parentClassName === 'string'
            && typeof type === 'string') {
            return parentClassName + " " + type;
        }
    }
    return "";
}
/* c8 ignore end */
/**
 * 从props中获取所有渠道定义的样式
 * @param type 元素类型
 * @param props 组件属性
 * @param pseudo 是否获取伪类属性
 * @returns
 */
function getAllStyles(type, props, pseudo) {
    if (!props) {
        return {};
    }
    // get all the styles from css selector and jsx style
    const classNameStyles = getStylesFromClassSelector(props?.className, pseudo);
    const attributeSelectors = buildAttributeSelectorsFromProps(props);
    const attributeTypeStyles = getAttributeSelectorStylesForType(type, attributeSelectors, pseudo);
    const parentDescendantStyles = getParentDescendantStyles(type, props, attributeSelectors, pseudo);
    const idStyle = getStyleFromIdSelector(props?.id, pseudo);
    const typeStyle = getStyleFromTypeSelector(type, pseudo);
    const inlineStyles = props?.style || {};
    // When merging styles, properties from objects later in the spread order
    // will override properties from earlier objects if they have the same key.
    // This follows CSS specificity rules where:
    // 1. Type selectors (element) have lowest priority
    // 2. Class selectors have higher priority than type selectors
    // 3. ID selectors have higher priority than class selectors
    // 4. Inline styles have the highest priority
    //
    // So the order of precedence (from lowest to highest) is:
    // typeStyle < attributeTypeStyles < classNameStyles < parentDescendantStyles < idStyle < inlineStyles
    const merged = { ...typeStyle, ...attributeTypeStyles, ...classNameStyles, ...parentDescendantStyles, ...idStyle, ...inlineStyles };
    // Evaluate structural pseudo-classes (:first-child, :last-child, :nth-child)
    // when rendering base styles (no explicit pseudo parameter).
    // These are position-dependent and use __childIndex / __childCount injected by the renderer.
    if (!pseudo || pseudo === 'base') {
        const childIndex = props.__childIndex;
        const childCount = props.__childCount;
        if (childIndex !== undefined && childCount !== undefined) {
            // :first-child -> index 0
            if (childIndex === 0) {
                mergeStyleRecords(merged, getStylesFromClassSelector(props?.className, 'first-child'));
                mergeStyleRecords(merged, getStyleFromIdSelector(props?.id, 'first-child'));
                mergeStyleRecords(merged, getStyleFromTypeSelector(type, 'first-child'));
            }
            // :last-child -> index === count - 1
            if (childIndex === childCount - 1) {
                mergeStyleRecords(merged, getStylesFromClassSelector(props?.className, 'last-child'));
                mergeStyleRecords(merged, getStyleFromIdSelector(props?.id, 'last-child'));
                mergeStyleRecords(merged, getStyleFromTypeSelector(type, 'last-child'));
            }
            // :nth-child(odd) and :nth-child(even)
            const isOdd = (childIndex % 2 === 0); // 0-indexed, so index 0 = 1st child = odd
            mergeStyleRecords(merged, getStylesFromClassSelector(props?.className, isOdd ? 'nth-child(odd)' : 'nth-child(even)'));
            mergeStyleRecords(merged, getStyleFromTypeSelector(type, isOdd ? 'nth-child(odd)' : 'nth-child(even)'));
        }
    }
    // Resolve any CSS custom property references (var(--name)) in the merged styles.
    // Build a scope chain from most-specific to least-specific for cascading lookup.
    const scopeChain = (0, css_variable_registry_1.buildScopeChain)(props?.id, props?.className, type);
    return (0, css_variable_registry_1.resolveStyleVariables)(merged, scopeChain);
}
function convertCssToStyles(css) {
    if (!css || typeof css !== 'object') {
        return {};
    }
    const result = {};
    const base = css.base;
    if (base && typeof base === 'object') {
        Object.assign(result, base);
    }
    for (const key in css) {
        if (!Object.prototype.hasOwnProperty.call(css, key) || key === 'base') {
            continue;
        }
        result[key] = css[key];
    }
    if (base !== undefined && typeof base !== 'object') {
        result.base = base;
    }
    return result;
}
/**
 * 将CSS样式的字符串格式转换为JSX样式对象
 * @param css
 * @returns
 */
function convertCssToStyles2(css) {
    const styles = {};
    if (!css || typeof css !== 'string') {
        return styles;
    }
    // Remove curly braces if they exist
    let cleanCss = css.trim();
    if (cleanCss.startsWith('{') && cleanCss.endsWith('}')) {
        cleanCss = cleanCss.substring(1, cleanCss.length - 1).trim();
    }
    // Split by semicolons to get individual declarations
    const declarations = cleanCss.split(';').filter(decl => decl.trim() !== '');
    for (const declaration of declarations) {
        // Split on the FIRST colon only; values may contain colons (e.g. url(data:...))
        const colonIndex = declaration.indexOf(':');
        if (colonIndex === -1)
            continue;
        const property = declaration.substring(0, colonIndex).trim();
        const value = declaration.substring(colonIndex + 1).trim();
        if (property && value) {
            // CSS custom properties (--*) must preserve their original name
            if (property.startsWith('--')) {
                styles[property] = value;
            }
            else {
                // Convert kebab-case to camelCase for standard properties
                const camelCaseProperty = property.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
                styles[camelCaseProperty] = value;
            }
        }
    }
    return styles;
}
//# sourceMappingURL=cssstyle_parser.js.map