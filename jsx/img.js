"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImageConverter = void 0;
const UE = require("ue");
const jsx_converter_1 = require("./jsx_converter");
const image_loader_1 = require("../misc/image_loader");
const css_color_parser_1 = require("../parsers/css_color_parser");
const cssstyle_parser_1 = require("../parsers/cssstyle_parser");
const batch_sync_1 = require("../perf/batch_sync");
/**
 * 支持的图片源src类型：
 * 1. 本地图片路径； 2. 网络图片路径； 3. UE纹理资源路径；4. 材质资源；
 * 图片资源的加载方式均采用异步加载的方式进行。
 */
class ImageConverter extends jsx_converter_1.JSXConverter {
    source;
    width;
    height;
    color;
    onClick;
    image;
    scaleBox;
    currentReloadTime;
    reloadMaxTimesWhenError;
    constructor(typeName, props, outer) {
        super(typeName, props, outer);
        this.source = props?.src;
        this.width = props?.width;
        this.height = props?.height;
        this.color = props?.color;
        this.image = undefined;
        this.scaleBox = undefined;
        this.onClick = props?.onClick;
        this.currentReloadTime = 0;
        this.reloadMaxTimesWhenError = 5;
    }
    onLoad(object) {
        if (this.image && object) {
            this.image.SetBrushResourceObject(object);
            if (this.props?.onLoad &&
                typeof this.props.onLoad === 'function') {
                this.props.onLoad();
            }
        }
    }
    onError = () => {
        if (this.props?.onError && typeof this.props.onError === 'function') {
            // Provide a minimal event-like object with target.src setter to allow fallback
            const self = this;
            const evt = {
                target: {
                    get src() { return self.source; },
                    set src(v) {
                        self.source = v;
                        if (self.image && this.currentReloadTime < this.reloadMaxTimesWhenError) {
                            this.currentReloadTime++;
                            image_loader_1.ImageLoader.loadBrushImageObject(self.image, v, __dirname, false, self.onLoad.bind(self), self.onError);
                        }
                    }
                }
            };
            try {
                this.props.onError(evt);
            }
            catch (e) {
                // swallow to avoid breaking render chains
                console.warn('img onError handler threw:', e);
            }
        }
    };
    createNativeWidget() {
        this.image = new UE.Image(this.outer);
        if (this.source) {
            image_loader_1.ImageLoader.loadBrushImageObject(this.image, this.source, __dirname, false, this.onLoad.bind(this), this.onError);
        }
        let setupProps = false;
        const parseSize = (v) => {
            if (v === undefined || v === null)
                return null;
            if (typeof v === 'number')
                return v;
            const n = parseFloat(v);
            return isNaN(n) ? null : n;
        };
        const w = parseSize(this.width);
        const h = parseSize(this.height);
        if (w !== null || h !== null) {
            const actualWidth = w !== null ? w : (h !== null ? h : 0);
            const actualHeight = h !== null ? h : (w !== null ? w : 0);
            this.image.Brush.ImageSize.X = actualWidth;
            this.image.Brush.ImageSize.Y = actualHeight;
            // Hint the layout size as well
            this.image.SetDesiredSizeOverride(new UE.Vector2D(actualWidth, actualHeight));
            setupProps = true;
        }
        if (this.color) {
            const rgba = (0, css_color_parser_1.parseToLinearColor)(this.color);
            this.image.ColorAndOpacity.R = rgba.r;
            this.image.ColorAndOpacity.G = rgba.g;
            this.image.ColorAndOpacity.B = rgba.b;
            this.image.ColorAndOpacity.A = rgba.a;
            setupProps = true;
        }
        if (this.onClick) {
            this.image.OnMouseButtonDownEvent.Bind((MyGeometry, MouseEvent) => {
                this.onClick();
                return new UE.EventReply();
            });
            setupProps = true;
        }
        // object-fit support via ScaleBox wrapper
        const styles = (0, cssstyle_parser_1.getAllStyles)(this.typeName, this.props);
        const objectFit = styles?.objectFit;
        if (objectFit) {
            this.scaleBox = new UE.ScaleBox(this.outer);
            switch (objectFit) {
                case 'contain':
                    this.scaleBox.SetStretch(UE.EStretch.ScaleToFit);
                    break;
                case 'cover':
                    this.scaleBox.SetStretch(UE.EStretch.ScaleToFill);
                    break;
                case 'fill':
                    this.scaleBox.SetStretch(UE.EStretch.Fill);
                    break;
                case 'none':
                    this.scaleBox.SetStretch(UE.EStretch.None);
                    break;
                case 'scale-down':
                    this.scaleBox.SetStretch(UE.EStretch.UserSpecifiedWithClipping);
                    break;
                default:
                    this.scaleBox.SetStretch(UE.EStretch.ScaleToFit);
            }
            this.scaleBox.AddChild(this.image);
        }
        if (setupProps) {
            (0, batch_sync_1.queueWidgetSync)(this.image);
        }
        return this.scaleBox ? this.scaleBox : this.image;
    }
    update(widget, oldProps, changedProps) {
        if (!this.image)
            return;
        if (changedProps.src && changedProps.src !== this.source) {
            const changedSrc = changedProps.src;
            this.source = changedSrc;
            image_loader_1.ImageLoader.loadBrushImageObject(this.image, changedSrc, __dirname, false, this.onLoad.bind(this), this.onError);
        }
        if (changedProps.width || changedProps.height) {
            const w = changedProps.width !== undefined ? changedProps.width : this.width;
            const h = changedProps.height !== undefined ? changedProps.height : this.height;
            const parseSize = (v) => {
                if (v === undefined || v === null)
                    return null;
                if (typeof v === 'number')
                    return v;
                const n = parseFloat(v);
                return isNaN(n) ? null : n;
            };
            const wv = parseSize(w);
            const hv = parseSize(h);
            if (wv !== null || hv !== null) {
                const actualWidth = wv !== null ? wv : (hv !== null ? hv : 0);
                const actualHeight = hv !== null ? hv : (wv !== null ? wv : 0);
                this.image.Brush.ImageSize.X = actualWidth;
                this.image.Brush.ImageSize.Y = actualHeight;
                this.image.SetDesiredSizeOverride(new UE.Vector2D(actualWidth, actualHeight));
                (0, batch_sync_1.queueWidgetSync)(this.image);
            }
        }
        if (changedProps.color) {
            const rgba = (0, css_color_parser_1.parseToLinearColor)(changedProps.color);
            this.image.ColorAndOpacity.R = rgba.r;
            this.image.ColorAndOpacity.G = rgba.g;
            this.image.ColorAndOpacity.B = rgba.b;
            this.image.ColorAndOpacity.A = rgba.a;
            (0, batch_sync_1.queueWidgetSync)(this.image);
        }
        // Update object-fit if style changed
        const styles = (0, cssstyle_parser_1.getAllStyles)(this.typeName, { ...this.props, ...changedProps });
        const objectFit = styles?.objectFit;
        if (this.scaleBox && objectFit) {
            switch (objectFit) {
                case 'contain':
                    this.scaleBox.SetStretch(UE.EStretch.ScaleToFit);
                    break;
                case 'cover':
                    this.scaleBox.SetStretch(UE.EStretch.ScaleToFill);
                    break;
                case 'fill':
                    this.scaleBox.SetStretch(UE.EStretch.Fill);
                    break;
                case 'none':
                    this.scaleBox.SetStretch(UE.EStretch.None);
                    break;
                case 'scale-down':
                    this.scaleBox.SetStretch(UE.EStretch.UserSpecifiedWithClipping);
                    break;
            }
            (0, batch_sync_1.queueWidgetSync)(this.scaleBox);
        }
    }
}
exports.ImageConverter = ImageConverter;
//# sourceMappingURL=img.js.map