/**
 * Converter for <hr> and <br> HTML elements.
 *
 * <hr> renders as a Border widget with 1px height and full width,
 * functioning as a horizontal rule / divider line.
 *
 * <br> renders as a Spacer widget with a configurable height gap
 * (defaults to ~16px, roughly one line height).
 */

import * as UE from 'ue';
import { JSXConverter } from './jsx_converter';
import { parseToLinearColor } from '../parsers/css_color_parser';
import { convertLengthUnitToSlateUnit } from '../parsers/css_length_parser';
import { getAllStyles } from '../parsers/cssstyle_parser';
import { queueWidgetSync } from '../perf/batch_sync';

export class HrBrConverter extends JSXConverter {
    private readonly loweredTypeName: string;

    constructor(typeName: string, props: any, outer: any) {
        super(typeName, props, outer);
        this.loweredTypeName = (typeName ?? '').toLowerCase();
    }

    createNativeWidget(): UE.Widget {
        if (this.loweredTypeName === 'hr') {
            return this.createHorizontalRule();
        }
        if (this.loweredTypeName === 'br') {
            return this.createLineBreak();
        }
        return null;
    }

    /**
     * Creates a horizontal rule: a Border widget with 1px height
     * and a subtle gray color. Respects CSS overrides for color,
     * height, margin, etc. via the style prop.
     */
    private createHorizontalRule(): UE.Widget {
        const styles = getAllStyles(this.typeName, this.props) ?? {};

        // Create a SizeBox to enforce the exact height
        const sizeBox = new UE.SizeBox(this.outer);
        const height = styles.height
            ? convertLengthUnitToSlateUnit(styles.height, styles)
            : 1;
        sizeBox.SetHeightOverride(height);

        // Create the visible border line inside the size box
        const border = new UE.Border(this.outer);

        // Default HR color: semi-transparent white (like a subtle divider)
        const color = styles.borderColor ?? styles.backgroundColor ?? styles.color ?? 'rgba(255,255,255,0.3)';
        const rgba = parseToLinearColor(color);
        border.SetBrushColor(new UE.LinearColor(rgba.r, rgba.g, rgba.b, rgba.a));

        sizeBox.AddChild(border);
        queueWidgetSync(border);
        queueWidgetSync(sizeBox);

        return sizeBox;
    }

    /**
     * Creates a line break: a Spacer widget with configurable height.
     * Default height is ~16px (one line).
     */
    private createLineBreak(): UE.Widget {
        const styles = getAllStyles(this.typeName, this.props) ?? {};
        const spacer = new UE.Spacer(this.outer);

        const height = styles.height
            ? convertLengthUnitToSlateUnit(styles.height, styles)
            : 16;
        spacer.SetSize(new UE.Vector2D(0, height));

        queueWidgetSync(spacer);
        return spacer;
    }

    update(widget: UE.Widget, _oldProps: any, _changedProps: any): void {
        // HR and BR are typically static; no-op for updates
    }

    appendChild(_parent: UE.Widget, _child: UE.Widget, _childTypeName: string, _childProps: any): void {
        // HR and BR are void elements, no children
    }

    removeChild(_parent: UE.Widget, _child: UE.Widget): void {
        // No-op
    }
}
