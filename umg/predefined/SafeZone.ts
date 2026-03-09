import { UMGConverter } from '../umg_converter';
import * as UE from 'ue';
import { queueWidgetSync } from '../../perf/batch_sync';

export class SafeZoneConverter extends UMGConverter {
    constructor(typeName: string, props: any, outer: any) {
        super(typeName, props, outer);
    }

    private initSafeZoneProps(safeZone: UE.SafeZone, props: any): boolean {
        let propsInit = false;
        
        const padLeft = props?.padLeft;
        if (padLeft) {
            safeZone.PadLeft = padLeft;
            propsInit = true;
        }

        const padRight = props?.padRight;
        if (padRight) {
            safeZone.PadRight = padRight;
            propsInit = true;
        }

        const padTop = props?.padTop;
        if (padTop) {
            safeZone.PadTop = padTop;
            propsInit = true;
        }

        const padBottom = props?.padBottom;
        if (padBottom) {
            safeZone.PadBottom = padBottom;
            propsInit = true;
        }

        return propsInit;
    }

    createNativeWidget(): UE.Widget {
        const safeZone = new UE.SafeZone(this.outer);
        const propsInit = this.initSafeZoneProps(safeZone, this.props);
        if (propsInit) {
            queueWidgetSync(safeZone);
        }
        return safeZone;
    }

    update(widget: UE.Widget, oldProps: any, changedProps: any): void {
        const safeZone = widget as UE.SafeZone;
        const propsChanged = this.initSafeZoneProps(safeZone, changedProps);
        if (propsChanged) {
            queueWidgetSync(safeZone);
        }
    }
}
