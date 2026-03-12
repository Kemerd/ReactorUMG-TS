"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ElementConverter = void 0;
exports.createElementConverter = createElementConverter;
const UE = require("ue");
const utils_1 = require("./misc/utils");
const cssstyle_parser_1 = require("./parsers/cssstyle_parser");
const common_props_parser_1 = require("./parsers/common_props_parser");
const css_transition_engine_1 = require("./parsers/css_transition_engine");
const batch_sync_1 = require("./perf/batch_sync");
const puerts = require("puerts");
class ElementConverter {
    typeName;
    props;
    outer;
    PropMaps;
    translators;
    constructor(typeName, props, outer) {
        this.typeName = typeName;
        this.props = props;
        this.outer = outer;
        this.PropMaps = {
            "Cursor": "cursor",
            "RenderTransform": "transform",
            "RenderTransformPivot": "transformOrigin",
            "Translate": "translate",
            "RenderOpacity": "opacity",
            "Visibility": "visibility",
            "ToolTipText": "toolTip",
            "bIsEnabled": "disable",
            "bIsVolatile": "volatil",
            "PixelSnapping": "pixelSnapping",
            "bIsEnabledDelegate": "disableBinding",
            "ToolTipTextDelegate": "toolTipBinding",
            "VisibilityDelegate": "visibilityBinding",
        };
        this.translators = {
            "Cursor": (styles, changeProps) => { return (0, common_props_parser_1.parseCursor)(styles?.cursor); },
            "RenderTransform": (styles, changeProps) => { return (0, common_props_parser_1.parseTransform)(styles?.transform); },
            "RenderTransformPivot": (styles, changeProps) => { return (0, common_props_parser_1.parseTransformPivot)(styles?.transformOrigin); },
            "Translate": (styles, changeProps) => { return (0, common_props_parser_1.parseTranslate)(styles?.translate); },
            "RenderOpacity": (styles, changeProps) => {
                if (styles && styles.opacity !== undefined && styles.opacity !== null) {
                    return (0, utils_1.safeParseFloat)(styles.opacity);
                }
                if ((0, utils_1.isKeyOfRecord)("opacity", changeProps)) {
                    return (0, utils_1.safeParseFloat)(changeProps.opacity);
                }
                return null;
            },
            "Visibility": (styles, changeProps) => { return (0, common_props_parser_1.parseVisibility)(styles?.visible || styles?.visibility, changeProps?.hitTest, styles?.pointerEvents); },
            "ToolTipText": (_styles, changeProps) => {
                if (changeProps && (0, utils_1.isKeyOfRecord)("toolTip", changeProps)) {
                    return changeProps.toolTip ?? "";
                }
                if (changeProps && (0, utils_1.isKeyOfRecord)("title", changeProps)) {
                    return changeProps.title ?? "";
                }
                return null;
            },
            "bIsEnabled": (_styles, changeProps) => {
                if (changeProps && (0, utils_1.isKeyOfRecord)("disable", changeProps)) {
                    return changeProps.disable ? false : true;
                }
                return null;
            },
            "bIsVolatile": (_styles, changeProps) => {
                if (changeProps && (0, utils_1.isKeyOfRecord)("volatil", changeProps)) {
                    return !!changeProps.volatil;
                }
                return null;
            },
            "PixelSnapping": (_styles, changeProps) => {
                if (changeProps && (0, utils_1.isKeyOfRecord)("pixelSnapping", changeProps)) {
                    return changeProps.pixelSnapping ? UE.EWidgetPixelSnapping.SnapToPixel : UE.EWidgetPixelSnapping.Disabled;
                }
                return null;
            },
            "bIsEnabledDelegate": (_styles, changeProps) => {
                if (changeProps && (0, utils_1.isKeyOfRecord)("disableBinding", changeProps) && changeProps.disableBinding) {
                    return () => { return !changeProps.disableBinding(); };
                }
                return null;
            },
            "ToolTipTextDelegate": (_styles, changeProps) => {
                if (changeProps && (0, utils_1.isKeyOfRecord)("toolTipBinding", changeProps)) {
                    return changeProps.toolTipBinding ?? null;
                }
                if (changeProps && (0, utils_1.isKeyOfRecord)("titleBinding", changeProps)) {
                    return changeProps.titleBinding ?? null;
                }
                return null;
            },
            "VisibilityDelegate": (_styles, changeProps) => {
                if (changeProps && (0, utils_1.isKeyOfRecord)("visibilityBinding", changeProps) && changeProps.visibilityBinding) {
                    return () => { return (0, common_props_parser_1.parseVisibility)(changeProps.visibilityBinding()); };
                }
                return null;
            },
        };
    }
    canUpdateWithoutNative() { return false; }
    /**
     * Ensures internal converter state (proxy chain, etc.) is fully
     * initialized without creating a native widget.  Called on the
     * recycled-widget path so that updateWidget can properly delegate
     * to type-specific update logic.
     *
     * Default is a no-op.  Converters with lazy initialization
     * (UMGConverter, ContainerConverter) override this.
     */
    ensureReady() { }
    /** Reference to the native widget, kept for transition cleanup on dispose */
    _nativeRef = null;
    dispose() {
        // Cancel any in-flight CSS transitions/animations on this widget
        if (this._nativeRef) {
            (0, css_transition_engine_1.cancelWidgetTransitions)(this._nativeRef);
            this._nativeRef = null;
        }
    }
    createWidget() {
        let widget = this.createNativeWidget();
        this._nativeRef = widget;
        this.initOrUpdateCommonProperties(widget, this.props);
        return widget;
    }
    updateWidget(widget, oldProps, newProps) {
        // Find changed properties between oldProps and newProps
        const changedProps = (0, utils_1.findChangedProps)(oldProps, newProps);
        // Check for CSS transition/animation properties and start any needed animations.
        // This must happen before applying the new values so the engine can capture
        // the "from" state for interpolation.
        if (widget) {
            const oldStyles = (0, cssstyle_parser_1.getAllStyles)(this.typeName, oldProps);
            const newStyles = (0, cssstyle_parser_1.getAllStyles)(this.typeName, newProps);
            (0, css_transition_engine_1.processStyleTransitions)(widget, oldStyles, newStyles);
        }
        // Update common properties
        this.initOrUpdateCommonProperties(widget, changedProps);
        // Update the widget with changed properties
        this.update(widget, oldProps, changedProps);
    }
    initOrUpdateCommonProperties(widget, changeProps) {
        const styles = (0, cssstyle_parser_1.getAllStyles)(this.typeName, changeProps);
        const widgetProps = {};
        for (const key in this.translators) {
            const propName = this.PropMaps[key];
            // pointerEvents affects Visibility but has its own CSS property name,
            // so we check for it explicitly alongside the normal visibility prop.
            const pointerEventsTriggersVisibility = key === 'Visibility' &&
                ((0, utils_1.isKeyOfRecord)('pointerEvents', styles) || (0, utils_1.isKeyOfRecord)('pointerEvents', changeProps));
            if ((0, utils_1.isKeyOfRecord)(propName, styles) || (0, utils_1.isKeyOfRecord)(propName, changeProps) || pointerEventsTriggersVisibility) {
                const value = this.translators[key](styles, changeProps);
                if (value !== null) {
                    widgetProps[key] = value;
                }
            }
        }
        if (!(0, utils_1.isEmpty)(widgetProps)) {
            puerts.merge(widget, widgetProps);
            // Queued for batched flush instead of immediate sync.
            // All widgets touched in one reconciler commit are synced
            // together in resetAfterCommit, eliminating redundant calls.
            (0, batch_sync_1.queueWidgetSync)(widget);
        }
    }
}
exports.ElementConverter = ElementConverter;
const containerKeywords = [
    'div', 'Grid', 'grid', 'Overlay', 'overlay', 'Canvas', 'canvas',
    'form', 'section', 'article', 'main', 'header', 'footer', 'nav', 'aside',
    'ListViewItem', 'TileViewItem',
    // List elements: VerticalBox containers with child list-item wrappers
    'ul', 'ol', 'li',
    // Table elements: GridPanel-based layout
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
    // Structural block elements
    'blockquote', 'figure', 'figcaption', 'details', 'summary', 'dialog',
    'fieldset', 'legend', 'dl', 'dt', 'dd'
];
const jsxComponentsKeywords = [
    'button', 'input', 'textarea', 'select', 'label', 'span', 'p', 'text',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'video', 'audio', 'progress',
    'a',
    // Inline formatting elements
    'strong', 'b', 'em', 'i', 'u', 's', 'code', 'mark', 'small', 'sub', 'sup',
    // Structural / list / table elements
    'hr', 'br',
];
function createElementConverter(typeName, props, outer) {
    const lowerType = typeName?.toLowerCase?.() ?? typeName;
    const ignoredElements = new Set(['option', 'script', 'link', 'meta', 'title']);
    const shouldBeAppendedElements = new Set(['option']);
    if (lowerType === 'style') {
        const Module = require(`./jsx/style`);
        if (Module) {
            return new Module["StyleTagConverter"](typeName, props, outer);
        }
    }
    if (ignoredElements.has(lowerType)) {
        class NullConverter extends ElementConverter {
            ignore = true;
            forceAppend = false;
            constructor(typeName, props, outer, shouldBeAppend = false) { super(typeName, props, outer); this.forceAppend = shouldBeAppend; }
            createNativeWidget() { return null; }
            creatWidget() { return null; }
            updateWidget(_widget, _oldProps, _newProps) { }
            update(_widget, _oldProps, _changedProps) { }
            appendChild(_parent, _child, _childTypeName, _childProps) { }
            removeChild(_parent, _child) { }
        }
        if (shouldBeAppendedElements.has(lowerType)) {
            return new NullConverter(typeName, props, outer, true);
        }
        return new NullConverter(typeName, props, outer);
    }
    if (containerKeywords.includes(typeName) || containerKeywords.includes(lowerType)) {
        const Module = require(`./container/container_converter`);
        if (Module) {
            return new Module["ContainerConverter"](typeName, props, outer);
        }
    }
    if (jsxComponentsKeywords.includes(typeName)) {
        const Module = require(`./jsx/jsx_converter`);
        if (Module) {
            return new Module["JSXConverter"](typeName, props, outer);
        }
    }
    const Module = require(`./umg/umg_converter`);
    if (Module) {
        return new Module["UMGConverter"](typeName, props, outer);
    }
}
//# sourceMappingURL=converter.js.map