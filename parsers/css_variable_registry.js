"use strict";
/**
 * CSS Custom Properties (CSS Variables) Registry
 *
 * Implements a cascading variable resolution system that supports:
 *   - Registering variables from :root, element selectors, and inline styles
 *   - Resolving var(--name) and var(--name, fallback) references
 *   - Nested variable references (var(--a) referencing var(--b))
 *   - Circular reference detection to prevent infinite loops
 *   - Scoped variable overrides via class/id specificity
 *
 * Variables are stored in a two-level map:
 *   scope -> variableName -> value
 * where scope is ':root' for global variables or a selector string for scoped ones.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCssVariables = registerCssVariables;
exports.clearCssVariablesForScope = clearCssVariablesForScope;
exports.clearAllCssVariables = clearAllCssVariables;
exports.lookupCssVariable = lookupCssVariable;
exports.resolveCssVariables = resolveCssVariables;
exports.extractAndRegisterVariables = extractAndRegisterVariables;
exports.resolveStyleVariables = resolveStyleVariables;
exports.buildScopeChain = buildScopeChain;
/** Maximum depth for nested var() resolution to prevent runaway recursion */
const MAX_VAR_RESOLUTION_DEPTH = 10;
/**
 * Two-level map: scope -> (variableName -> value)
 * The ':root' scope holds global defaults; more specific scopes override.
 */
const variableScopes = new Map();
/**
 * Registers a batch of CSS custom properties under a given scope.
 * Existing variables in the same scope are overwritten; other scopes are untouched.
 *
 * @param scope   - The CSS selector scope (e.g. ':root', '.my-class', '#my-id')
 * @param vars    - A record of variable names (with '--' prefix) to their values
 */
function registerCssVariables(scope, vars) {
    if (!scope || !vars) {
        return;
    }
    let scopeMap = variableScopes.get(scope);
    if (!scopeMap) {
        scopeMap = new Map();
        variableScopes.set(scope, scopeMap);
    }
    const keys = Object.keys(vars);
    for (let i = 0; i < keys.length; i++) {
        const name = keys[i];
        if (name.startsWith('--')) {
            scopeMap.set(name, vars[name]);
        }
    }
}
/**
 * Removes all variables registered under the given scope.
 *
 * @param scope - The scope to clear
 */
function clearCssVariablesForScope(scope) {
    variableScopes.delete(scope);
}
/**
 * Wipes the entire variable registry. Useful for test teardown or full reloads.
 */
function clearAllCssVariables() {
    variableScopes.clear();
}
/**
 * Looks up a single variable by name, walking from most-specific scope
 * to :root. Returns undefined if no matching variable is found.
 *
 * @param name    - The variable name including '--' prefix (e.g. '--primary-color')
 * @param scopes  - Ordered array of scopes to search, most-specific first
 */
function lookupCssVariable(name, scopes) {
    if (!name) {
        return undefined;
    }
    // Walk the provided scopes in order, most specific first
    if (scopes && scopes.length > 0) {
        for (let i = 0; i < scopes.length; i++) {
            const scopeMap = variableScopes.get(scopes[i]);
            if (scopeMap && scopeMap.has(name)) {
                return scopeMap.get(name);
            }
        }
    }
    // Fall back to :root scope as the global default
    const rootMap = variableScopes.get(':root');
    if (rootMap && rootMap.has(name)) {
        return rootMap.get(name);
    }
    return undefined;
}
/**
 * Regex that matches a single var() expression, including nested parentheses
 * in the fallback value. Captures:
 *   [1] = variable name (e.g. '--my-var')
 *   [2] = fallback value after the comma (may itself contain var() calls)
 */
const VAR_REGEX = /var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,\s*((?:[^)(]*|\((?:[^)(]*|\([^)(]*\))*\))*))?\s*\)/;
/**
 * Resolves all var() references in a CSS value string.
 * Supports nested var() references up to MAX_VAR_RESOLUTION_DEPTH levels.
 *
 * @param value   - The CSS value string that may contain var() references
 * @param scopes  - Ordered array of scopes to search, most-specific first
 * @returns The value with all var() references resolved, or the original if no vars found
 */
function resolveCssVariables(value, scopes) {
    if (!value || typeof value !== 'string') {
        return value;
    }
    // Quick check: if the string doesn't contain 'var(' at all, skip regex work
    if (value.indexOf('var(') === -1) {
        return value;
    }
    return resolveVarsRecursive(value, scopes, 0, new Set());
}
/**
 * Internal recursive resolver with depth limit and circular reference detection.
 *
 * @param value        - Current CSS value string to resolve
 * @param scopes       - Scope chain for variable lookup
 * @param depth        - Current recursion depth
 * @param resolving    - Set of variable names currently being resolved (cycle detection)
 */
function resolveVarsRecursive(value, scopes, depth, resolving) {
    // Bail on excessive depth to prevent stack overflow
    if (depth >= MAX_VAR_RESOLUTION_DEPTH) {
        return value;
    }
    let result = value;
    let match;
    let iterations = 0;
    const maxIterations = 50; // safety valve for pathological inputs
    // Iteratively replace var() from the inside out
    while ((match = VAR_REGEX.exec(result)) !== null && iterations < maxIterations) {
        iterations++;
        const fullMatch = match[0];
        const varName = match[1];
        const fallback = match[2] !== undefined ? match[2].trim() : undefined;
        // Circular reference guard
        if (resolving.has(varName)) {
            // Replace with fallback if available, otherwise remove the var() entirely
            result = result.replace(fullMatch, fallback ?? '');
            continue;
        }
        // Look up the variable value through the scope chain
        const resolved = lookupCssVariable(varName, scopes);
        if (resolved !== undefined) {
            // Mark this variable as being resolved to detect cycles
            resolving.add(varName);
            // The resolved value might itself contain var() references
            const deepResolved = resolveVarsRecursive(resolved, scopes, depth + 1, resolving);
            resolving.delete(varName);
            result = result.replace(fullMatch, deepResolved);
        }
        else if (fallback !== undefined) {
            // No variable found; use fallback, which might also have var() references
            const resolvedFallback = resolveVarsRecursive(fallback, scopes, depth + 1, resolving);
            result = result.replace(fullMatch, resolvedFallback);
        }
        else {
            // No variable and no fallback; strip the var() call entirely
            result = result.replace(fullMatch, '');
        }
    }
    return result;
}
/**
 * Processes a parsed CSS declaration block and extracts any custom property
 * declarations (--*) into the variable registry, returning the remaining
 * non-variable declarations.
 *
 * @param scope        - The selector scope these declarations belong to
 * @param declarations - Record of property->value from a CSS rule
 * @returns A new record with custom property declarations removed
 */
function extractAndRegisterVariables(scope, declarations) {
    if (!declarations || typeof declarations !== 'object') {
        return declarations;
    }
    const variables = {};
    const remaining = {};
    let hasVariables = false;
    const keys = Object.keys(declarations);
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (key.startsWith('--')) {
            variables[key] = String(declarations[key]);
            hasVariables = true;
        }
        else {
            remaining[key] = declarations[key];
        }
    }
    if (hasVariables) {
        registerCssVariables(scope, variables);
    }
    return remaining;
}
/**
 * Resolves all var() references within every value of a style record.
 * Non-string values are left untouched.
 *
 * @param styles  - A record of CSS property -> value
 * @param scopes  - Ordered scope chain for variable lookup
 * @returns A new record with all var() references resolved
 */
function resolveStyleVariables(styles, scopes) {
    if (!styles || typeof styles !== 'object') {
        return styles;
    }
    const result = {};
    const keys = Object.keys(styles);
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const value = styles[key];
        if (typeof value === 'string' && value.indexOf('var(') !== -1) {
            result[key] = resolveCssVariables(value, scopes);
        }
        else {
            result[key] = value;
        }
    }
    return result;
}
/**
 * Builds a scope chain from element context for variable resolution.
 * The chain goes from most-specific to least-specific:
 *   [ '#elementId', '.class1', '.class2', ':root' ]
 *
 * @param id         - The element's id attribute
 * @param className  - The element's class attribute (space-separated)
 * @param typeName   - The element's tag name
 * @returns Ordered scope chain array
 */
function buildScopeChain(id, className, typeName) {
    const chain = [];
    // ID selector (highest specificity)
    if (id) {
        chain.push(`#${id}`);
    }
    // Class selectors
    if (className && typeof className === 'string') {
        const classes = className.split(/\s+/).filter(c => c.length > 0);
        for (let i = 0; i < classes.length; i++) {
            chain.push(`.${classes[i]}`);
        }
    }
    // Type selector
    if (typeName) {
        chain.push(typeName.toLowerCase());
    }
    // :root is always the final fallback (added by lookupCssVariable automatically)
    return chain;
}
//# sourceMappingURL=css_variable_registry.js.map