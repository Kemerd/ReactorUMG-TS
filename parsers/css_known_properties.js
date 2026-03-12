"use strict";
/**
 * CSS Known Properties Registry
 *
 * Comprehensive set of all recognized CSS property names in ReactorUMG.
 * Properties fall into three categories:
 *
 *   1. **Supported**: Actively parsed and mapped to UMG widget properties.
 *   2. **No-op (graceful)**: Recognized but intentionally ignored because
 *      UMG has no equivalent capability. These are silently accepted to
 *      prevent "unsupported property" warnings and keep developer-facing
 *      CSS clean.
 *   3. **Vendor-prefixed**: WebKit/Moz/MS prefixed variants that are
 *      silently ignored (we handle the unprefixed canonical form).
 *
 * This file is the single source of truth for property validation.
 * When a developer uses a CSS property not in this set, we can emit
 * a one-time warning at development time to help them know the property
 * won't have any visual effect.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isKnownCSSProperty = isKnownCSSProperty;
exports.isNoopCSSProperty = isNoopCSSProperty;
exports.isSupportedCSSProperty = isSupportedCSSProperty;
// ---------------------------------------------------------------
//  Properties actively supported (parsed and applied to UMG)
// ---------------------------------------------------------------
const SUPPORTED_PROPERTIES = new Set([
    // Layout
    'display', 'position', 'top', 'right', 'bottom', 'left',
    'float', 'clear', 'zIndex', 'z-index',
    // Flexbox
    'flex', 'flexDirection', 'flex-direction', 'flexWrap', 'flex-wrap',
    'flexFlow', 'flex-flow', 'flexGrow', 'flex-grow', 'flexShrink', 'flex-shrink',
    'flexBasis', 'flex-basis', 'justifyContent', 'justify-content',
    'alignItems', 'align-items', 'alignSelf', 'align-self',
    'alignContent', 'align-content', 'order',
    'gap', 'rowGap', 'row-gap', 'columnGap', 'column-gap',
    // Grid
    'gridTemplateColumns', 'grid-template-columns',
    'gridTemplateRows', 'grid-template-rows',
    'gridColumn', 'grid-column', 'gridRow', 'grid-row',
    'gridColumnStart', 'grid-column-start', 'gridColumnEnd', 'grid-column-end',
    'gridRowStart', 'grid-row-start', 'gridRowEnd', 'grid-row-end',
    'gridAutoFlow', 'grid-auto-flow', 'gridAutoColumns', 'grid-auto-columns',
    'gridAutoRows', 'grid-auto-rows',
    // Sizing
    'width', 'height', 'minWidth', 'min-width', 'maxWidth', 'max-width',
    'minHeight', 'min-height', 'maxHeight', 'max-height', 'aspectRatio', 'aspect-ratio',
    // Spacing
    'margin', 'marginTop', 'margin-top', 'marginRight', 'margin-right',
    'marginBottom', 'margin-bottom', 'marginLeft', 'margin-left',
    'padding', 'paddingTop', 'padding-top', 'paddingRight', 'padding-right',
    'paddingBottom', 'padding-bottom', 'paddingLeft', 'padding-left',
    // Background
    'background', 'backgroundColor', 'background-color',
    'backgroundImage', 'background-image', 'backgroundSize', 'background-size',
    'backgroundPosition', 'background-position', 'backgroundRepeat', 'background-repeat',
    // Border
    'border', 'borderTop', 'border-top', 'borderRight', 'border-right',
    'borderBottom', 'border-bottom', 'borderLeft', 'border-left',
    'borderWidth', 'border-width', 'borderStyle', 'border-style',
    'borderColor', 'border-color', 'borderRadius', 'border-radius',
    'borderTopLeftRadius', 'border-top-left-radius',
    'borderTopRightRadius', 'border-top-right-radius',
    'borderBottomLeftRadius', 'border-bottom-left-radius',
    'borderBottomRightRadius', 'border-bottom-right-radius',
    'boxShadow', 'box-shadow', 'outline', 'outlineColor', 'outline-color',
    'outlineWidth', 'outline-width', 'outlineStyle', 'outline-style',
    // Typography
    'font', 'fontFamily', 'font-family', 'fontSize', 'font-size',
    'fontWeight', 'font-weight', 'fontStyle', 'font-style',
    'letterSpacing', 'letter-spacing', 'wordSpacing', 'word-spacing',
    'textAlign', 'text-align', 'textTransform', 'text-transform',
    'lineHeight', 'line-height', 'whiteSpace', 'white-space',
    'textShadow', 'text-shadow', 'textDecoration', 'text-decoration',
    'textDecorationLine', 'text-decoration-line',
    'textDecorationColor', 'text-decoration-color',
    'textDecorationStyle', 'text-decoration-style',
    'textOverflow', 'text-overflow', 'textIndent', 'text-indent',
    'wordBreak', 'word-break', 'overflowWrap', 'overflow-wrap',
    'color', 'fontColor',
    // Visual
    'opacity', 'visibility', 'overflow', 'overflowX', 'overflow-x',
    'overflowY', 'overflow-y', 'objectFit', 'object-fit',
    'pointerEvents', 'pointer-events',
    // Transform
    'transform', 'transformOrigin', 'transform-origin',
    'translate', 'rotate', 'scale',
    // Transition / Animation
    'transition', 'transitionProperty', 'transition-property',
    'transitionDuration', 'transition-duration',
    'transitionTimingFunction', 'transition-timing-function',
    'transitionDelay', 'transition-delay',
    'animation', 'animationName', 'animation-name',
    'animationDuration', 'animation-duration',
    'animationTimingFunction', 'animation-timing-function',
    'animationDelay', 'animation-delay',
    'animationIterationCount', 'animation-iteration-count',
    'animationDirection', 'animation-direction',
    'animationFillMode', 'animation-fill-mode',
    'animationPlayState', 'animation-play-state',
    // Filter
    'filter', 'backdropFilter', 'backdrop-filter',
    // Cursor / Interaction
    'cursor',
    // Custom / internal
    'content',
]);
// ---------------------------------------------------------------
//  Properties recognized but intentionally no-op in UMG
// ---------------------------------------------------------------
const NOOP_PROPERTIES = new Set([
    // Box model: UMG is inherently border-box
    'boxSizing', 'box-sizing',
    // Blend modes: UMG has no per-widget blend mode control
    'mixBlendMode', 'mix-blend-mode',
    // Multi-column layout: no UMG equivalent
    'columns', 'columnCount', 'column-count',
    'columnWidth', 'column-width', 'columnRule', 'column-rule',
    'columnRuleColor', 'column-rule-color', 'columnRuleStyle', 'column-rule-style',
    'columnRuleWidth', 'column-rule-width', 'columnGap', 'column-gap',
    'columnSpan', 'column-span', 'columnFill', 'column-fill',
    // Resize: no drag-to-resize in UMG
    'resize',
    // Text selection: UMG text is not selectable by default
    'userSelect', 'user-select', '-webkit-user-select', '-moz-user-select',
    // CSS performance hints: no-op in a GPU-rendered engine
    'willChange', 'will-change',
    'contain',
    // Scroll behavior: UMG ScrollBox doesn't support smooth scrolling
    'scrollBehavior', 'scroll-behavior',
    'scrollSnapType', 'scroll-snap-type',
    'scrollSnapAlign', 'scroll-snap-align',
    'scrollSnapStop', 'scroll-snap-stop',
    'scrollMargin', 'scroll-margin', 'scrollPadding', 'scroll-padding',
    // Form control styling
    'appearance', '-webkit-appearance', '-moz-appearance',
    'accentColor', 'accent-color',
    // Text direction / writing mode: limited UMG support
    'direction', 'unicodeBidi', 'unicode-bidi',
    'writingMode', 'writing-mode',
    // Tab stops: no UMG equivalent
    'tabSize', 'tab-size',
    // Content visibility / containment
    'contentVisibility', 'content-visibility',
    // Perspective / 3D transforms: UMG is 2D
    'perspective', 'perspectiveOrigin', 'perspective-origin',
    'backfaceVisibility', 'backface-visibility',
    'transformStyle', 'transform-style',
    // Print-related
    'pageBreakBefore', 'page-break-before',
    'pageBreakAfter', 'page-break-after',
    'pageBreakInside', 'page-break-inside',
    'orphans', 'widows',
    // Misc
    'listStyle', 'list-style', 'listStyleType', 'list-style-type',
    'listStylePosition', 'list-style-position',
    'listStyleImage', 'list-style-image',
    'counterReset', 'counter-reset', 'counterIncrement', 'counter-increment',
    'quotes',
    'isolation',
    'objectPosition', 'object-position',
    'imageRendering', 'image-rendering',
    'shapeOutside', 'shape-outside',
    'clipPath', 'clip-path', 'clip',
    'mask', 'maskImage', 'mask-image',
    'touchAction', 'touch-action',
    'overscrollBehavior', 'overscroll-behavior',
    'caretColor', 'caret-color',
    'wordWrap', 'word-wrap',
    'hyphens',
    'textRendering', 'text-rendering',
    'fontSmoothing', '-webkit-font-smoothing',
    'textSizeAdjust', '-webkit-text-size-adjust',
]);
// ---------------------------------------------------------------
//  Vendor-prefixed properties (silently ignored)
// ---------------------------------------------------------------
const VENDOR_PREFIX_REGEX = /^(-webkit-|-moz-|-ms-|-o-|webkit|moz|ms)/i;
// ---------------------------------------------------------------
//  Public API
// ---------------------------------------------------------------
/**
 * Returns true if the given CSS property name is known to ReactorUMG.
 * This includes both actively supported properties and graceful no-ops.
 */
function isKnownCSSProperty(property) {
    if (!property)
        return false;
    if (SUPPORTED_PROPERTIES.has(property))
        return true;
    if (NOOP_PROPERTIES.has(property))
        return true;
    if (VENDOR_PREFIX_REGEX.test(property))
        return true;
    // Internal props starting with __ or _ are always known
    if (property.startsWith('_'))
        return true;
    return false;
}
/**
 * Returns true if the property is a known no-op (recognized but has
 * no visual effect in UMG).
 */
function isNoopCSSProperty(property) {
    if (!property)
        return false;
    if (NOOP_PROPERTIES.has(property))
        return true;
    if (VENDOR_PREFIX_REGEX.test(property) && !SUPPORTED_PROPERTIES.has(property))
        return true;
    return false;
}
/**
 * Returns true if the property is actively supported and will have
 * a visual effect in UMG.
 */
function isSupportedCSSProperty(property) {
    return SUPPORTED_PROPERTIES.has(property);
}
//# sourceMappingURL=css_known_properties.js.map