"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StyleTagConverter = void 0;
exports.getGlobalKeyframes = getGlobalKeyframes;
const UE = require("ue");
const converter_1 = require("../converter");
const cssstyle_parser_1 = require("../parsers/cssstyle_parser");
const inline_style_registry_1 = require("../parsers/inline_style_registry");
const css_transition_engine_1 = require("../parsers/css_transition_engine");
let styleSourceCounter = 0;
/**
 * Global keyframe registry accessible by the transition engine.
 * Populated each time a <style> tag is parsed.
 */
const globalKeyframeRegistry = new Map();
/** Retrieves a keyframe definition by name from the global registry. */
function getGlobalKeyframes(name) {
    return globalKeyframeRegistry.get(name);
}
class StyleTagConverter extends converter_1.ElementConverter {
    sourceId;
    cssText;
    /** Cached @media rules from the last parse, re-evaluated on viewport changes */
    cachedMediaRules = [];
    constructor(typeName, props, outer) {
        super(typeName, props, outer);
        this.sourceId = `style-${++styleSourceCounter}`;
        this.cssText = this.extractCssText(props);
    }
    creatWidget() {
        this.registerCurrentStyles();
        return null;
    }
    createNativeWidget() {
        // Register CSS rules on initial creation so styles are available
        // before any child elements are mounted. Returns null because
        // <style> tags don't produce a visible widget in the tree.
        this.registerCurrentStyles();
        return null;
    }
    canUpdateWithoutNative() {
        return true;
    }
    updateWidget(_widget, _oldProps, newProps) {
        const nextCss = this.extractCssText(newProps);
        if (nextCss !== this.cssText) {
            this.cssText = nextCss;
            this.registerCurrentStyles();
        }
        this.props = newProps;
    }
    update(_widget, _oldProps, _changedProps) {
        // no-op; handled in updateWidget
    }
    appendChild(_parent, _child, _childTypeName, _childProps) {
        // Style tags do not participate in the widget tree
    }
    removeChild(_parent, _child) {
        // Style tags do not participate in the widget tree
    }
    dispose() {
        (0, inline_style_registry_1.clearInlineStylesForSource)(this.sourceId);
        super.dispose();
    }
    /**
     * Parses the full style sheet including @media and @keyframes,
     * registers the base rules immediately, caches media rules for
     * conditional evaluation, and pushes keyframes to the global registry.
     */
    registerCurrentStyles() {
        const sheet = (0, inline_style_registry_1.parseStyleSheet)(this.cssText, cssstyle_parser_1.convertCssToStyles2);
        // Register base (non-conditional) rules
        (0, inline_style_registry_1.registerInlineStyles)(this.sourceId, sheet.rules);
        // Cache @media rules for conditional application
        this.cachedMediaRules = sheet.mediaRules;
        // Push @keyframes into the global registry and transition engine
        for (const [name, definition] of sheet.keyframes) {
            globalKeyframeRegistry.set(name, definition);
            (0, css_transition_engine_1.registerKeyframes)(name, definition);
        }
        // Register @font-face declarations with the UE font system
        this.applyFontFaces(sheet.fontFaces);
        // Evaluate @media rules against current viewport if we can determine it
        this.applyMediaRules();
    }
    /**
     * Registers @font-face declarations with UE's font family resolver.
     * Each declaration maps a CSS font-family name to a UE font asset
     * via UMGManager::FindFontFamily.
     */
    applyFontFaces(fontFaces) {
        if (!fontFaces || fontFaces.length === 0) {
            return;
        }
        for (const face of fontFaces) {
            try {
                // Build a font family name array for UMGManager::FindFontFamily
                let familyNames = UE.NewArray(UE.BuiltinString);
                familyNames.Add(face.fontFamily);
                // Attempt to load/register the font. FindFontFamily will look for
                // the font in /ReactorUMG/FontFamily/ and fall back to engine fonts.
                const fontObj = UE.UMGManager.FindFontFamily(familyNames, this.outer);
                if (fontObj) {
                    console.log(`[ReactorUMG] @font-face registered: "${face.fontFamily}"`);
                }
            }
            catch (e) {
                console.warn(`[ReactorUMG] @font-face failed for "${face.fontFamily}":`, e);
            }
        }
    }
    /**
     * Evaluates cached @media rules against the current viewport and registers
     * matching rules as additional inline styles.
     */
    applyMediaRules() {
        if (this.cachedMediaRules.length === 0) {
            return;
        }
        // Get current viewport size for @media evaluation via UE's WidgetLayoutLibrary
        let viewportSize = null;
        try {
            const world = UE.UMGManager.GetCurrentWorld();
            if (world) {
                const size = UE.WidgetLayoutLibrary.GetViewportSize(world);
                if (size && size.X > 0 && size.Y > 0) {
                    viewportSize = { width: size.X, height: size.Y };
                }
            }
        }
        catch (_e) {
            // Viewport size unavailable; skip media rule evaluation
        }
        if (!viewportSize) {
            return;
        }
        // Evaluate each @media block and register matching rules
        for (const mediaRule of this.cachedMediaRules) {
            if ((0, inline_style_registry_1.evaluateMediaCondition)(mediaRule.condition, viewportSize)) {
                const mediaSourceId = `${this.sourceId}:media:${mediaRule.condition}`;
                (0, inline_style_registry_1.registerInlineStyles)(mediaSourceId, mediaRule.rules);
            }
        }
    }
    extractCssText(props) {
        if (!props) {
            return '';
        }
        if (typeof props.children === 'string') {
            return props.children;
        }
        if (Array.isArray(props.children)) {
            return props.children.filter((child) => typeof child === 'string').join('\n');
        }
        if (props.dangerouslySetInnerHTML && typeof props.dangerouslySetInnerHTML.__html === 'string') {
            return props.dangerouslySetInnerHTML.__html;
        }
        return '';
    }
}
exports.StyleTagConverter = StyleTagConverter;
//# sourceMappingURL=style.js.map