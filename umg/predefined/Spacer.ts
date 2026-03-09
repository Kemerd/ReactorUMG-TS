import * as UE from 'ue';
import { UMGConverter } from '../umg_converter';
import { queueWidgetSync } from '../../perf/batch_sync';

export class SpacerConverter extends UMGConverter {
    constructor(typeName: string, props: any, outer: any) {
        super(typeName, props, outer);
    }

    createNativeWidget(): UE.Widget {
        const spacer = new UE.Spacer(this.outer);
        const size = this.props?.size;
        if (size) {
            spacer.Size.X = size.x;
            spacer.Size.Y = size.y;
            queueWidgetSync(spacer);
        }

        return spacer;
    }

    update(widget: UE.Widget, oldProps: any, changedProps: any): void {
        const spacer = widget as UE.Spacer;
        const size = changedProps?.size;
        if (size) {
            spacer.Size.X = size.x;
            spacer.Size.Y = size.y;
            queueWidgetSync(spacer);
        }
    }
    
}
