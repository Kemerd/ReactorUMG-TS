"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpineConverter = void 0;
const css_color_parser_1 = require("../../parsers/css_color_parser");
const umg_converter_1 = require("../umg_converter");
const UE = require("ue");
const batch_sync_1 = require("../../perf/batch_sync");
class SpineConverter extends umg_converter_1.UMGConverter {
    constructor(typeName, props, outer) {
        super(typeName, props, outer);
    }
    initSpineProps(spine, props) {
        let propsInit = false;
        const initSkin = props?.initSkin;
        if (initSkin && initSkin !== '') {
            spine.InitialSkin = initSkin;
            spine.SetSkin(initSkin);
        }
        const color = props?.color;
        if (color) {
            const rgba = (0, css_color_parser_1.parseToLinearColor)(color);
            spine.Color.R = rgba.r;
            spine.Color.G = rgba.g;
            spine.Color.B = rgba.b;
            spine.Color.A = rgba.a;
            propsInit = true;
        }
        let atlasLoaded = false;
        const atlas = props?.atlas;
        if (atlas) {
            spine.Atlas = UE.UMGManager.LoadSpineAtlas(spine, atlas, __dirname);
            atlasLoaded = true;
            propsInit = true;
        }
        const skel = props?.skel;
        if (skel) {
            spine.SkeletonData = UE.UMGManager.LoadSpineSkeleton(spine, skel, __dirname);
            if (!atlasLoaded) {
                const atlasPath = skel.replace('.json', '.atlas').replace('.skel', '.atlas');
                spine.Atlas = UE.UMGManager.LoadSpineAtlas(spine, atlasPath, __dirname);
                atlasLoaded = true;
                propsInit = true;
            }
        }
        const initAnimation = props?.initAnimation;
        if (initAnimation && initAnimation !== '') {
            spine.SetAnimation(0, initAnimation, true);
        }
        const eventKeyMap = {
            'onAnimationStart': 'AnimationStart',
            'onAnimationEnd': 'AnimationEnd',
            'onAnimationComplete': 'AnimationComplete',
            'onAnimationEvent': 'AnimationEvent',
            'onAnimationInterrupt': 'AnimationInterrupt',
            'onAnimationDispose': 'AnimationDispose',
            'onBeforeUpdateWorldTransform': 'BeforeUpdateWorldTransform',
            'onAfterUpdateWorldTransform': 'AfterUpdateWorldTransform',
        };
        for (const [key, value] of Object.entries(props)) {
            if (eventKeyMap[key] && typeof value === 'function') {
                spine[eventKeyMap[key]].Add(value);
                propsInit = true;
            }
        }
        return propsInit;
    }
    createNativeWidget() {
        const spine = new UE.SpineWidget(this.outer);
        const propsInit = this.initSpineProps(spine, this.props);
        if (propsInit) {
            (0, batch_sync_1.queueWidgetSync)(spine);
        }
        return spine;
    }
    update(widget, oldProps, changedProps) {
        const spine = widget;
        const propsInit = this.initSpineProps(spine, changedProps);
        if (propsInit) {
            (0, batch_sync_1.queueWidgetSync)(spine);
        }
    }
}
exports.SpineConverter = SpineConverter;
//# sourceMappingURL=Spine.js.map