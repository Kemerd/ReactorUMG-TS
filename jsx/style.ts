import * as UE from 'ue';
import { ElementConverter } from '../converter';
import { convertCssToStyles2 } from '../parsers/cssstyle_parser';
import {
    clearInlineStylesForSource,
    parseStyleSheet,
    registerInlineStyles,
    evaluateMediaCondition,
    type MediaRule,
    type KeyframeDefinition
} from '../parsers/inline_style_registry';
import { registerKeyframes } from '../parsers/css_transition_engine';

let styleSourceCounter = 0;

/**
 * Global keyframe registry accessible by the transition engine.
 * Populated each time a <style> tag is parsed.
 */
const globalKeyframeRegistry = new Map<string, KeyframeDefinition>();

/** Retrieves a keyframe definition by name from the global registry. */
export function getGlobalKeyframes(name: string): KeyframeDefinition | undefined {
    return globalKeyframeRegistry.get(name);
}

export class StyleTagConverter extends ElementConverter {
    private readonly sourceId: string;
    private cssText: string;
    /** Cached @media rules from the last parse, re-evaluated on viewport changes */
    private cachedMediaRules: MediaRule[] = [];

    constructor(typeName: string, props: any, outer: any) {
        super(typeName, props, outer);
        this.sourceId = `style-${++styleSourceCounter}`;
        this.cssText = this.extractCssText(props);
    }

    creatWidget(): UE.Widget {
        this.registerCurrentStyles();
        return null;
    }

    createNativeWidget(): UE.Widget {
        return null;
    }

    canUpdateWithoutNative(): boolean {
        return true;
    }

    updateWidget(_widget: UE.Widget, _oldProps: any, newProps: any) {
        const nextCss = this.extractCssText(newProps);
        if (nextCss !== this.cssText) {
            this.cssText = nextCss;
            this.registerCurrentStyles();
        }
        this.props = newProps;
    }

    update(_widget: UE.Widget, _oldProps: any, _changedProps: any): void {
        // no-op; handled in updateWidget
    }

    appendChild(_parent: UE.Widget, _child: UE.Widget, _childTypeName: string, _childProps: any): void {
        // Style tags do not participate in the widget tree
    }

    removeChild(_parent: UE.Widget, _child: UE.Widget): void {
        // Style tags do not participate in the widget tree
    }

    dispose(): void {
        clearInlineStylesForSource(this.sourceId);
    }

    /**
     * Parses the full style sheet including @media and @keyframes,
     * registers the base rules immediately, caches media rules for
     * conditional evaluation, and pushes keyframes to the global registry.
     */
    private registerCurrentStyles(): void {
        const sheet = parseStyleSheet(this.cssText, convertCssToStyles2);

        // Register base (non-conditional) rules
        registerInlineStyles(this.sourceId, sheet.rules);

        // Cache @media rules for conditional application
        this.cachedMediaRules = sheet.mediaRules;

        // Push @keyframes into the global registry and transition engine
        for (const [name, definition] of sheet.keyframes) {
            globalKeyframeRegistry.set(name, definition);
            registerKeyframes(name, definition);
        }

        // Evaluate @media rules against current viewport if we can determine it
        this.applyMediaRules();
    }

    /**
     * Evaluates cached @media rules against the current viewport and registers
     * matching rules as additional inline styles.
     */
    private applyMediaRules(): void {
        if (this.cachedMediaRules.length === 0) {
            return;
        }

        // Get current viewport size for @media evaluation via UE's WidgetLayoutLibrary
        let viewportSize: { width: number; height: number } | null = null;
        try {
            const world = UE.UMGManager.GetCurrentWorld();
            if (world) {
                const size = UE.WidgetLayoutLibrary.GetViewportSize(world);
                if (size && size.X > 0 && size.Y > 0) {
                    viewportSize = { width: size.X, height: size.Y };
                }
            }
        } catch (_e) {
            // Viewport size unavailable; skip media rule evaluation
        }

        if (!viewportSize) {
            return;
        }

        // Evaluate each @media block and register matching rules
        for (const mediaRule of this.cachedMediaRules) {
            if (evaluateMediaCondition(mediaRule.condition, viewportSize)) {
                const mediaSourceId = `${this.sourceId}:media:${mediaRule.condition}`;
                registerInlineStyles(mediaSourceId, mediaRule.rules);
            }
        }
    }

    private extractCssText(props: any): string {
        if (!props) {
            return '';
        }

        if (typeof props.children === 'string') {
            return props.children;
        }

        if (Array.isArray(props.children)) {
            return props.children.filter((child: any) => typeof child === 'string').join('\n');
        }

        if (props.dangerouslySetInnerHTML && typeof props.dangerouslySetInnerHTML.__html === 'string') {
            return props.dangerouslySetInnerHTML.__html;
        }

        return '';
    }
}
