"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VideoConverter = void 0;
const UE = require("ue");
const jsx_converter_1 = require("./jsx_converter");
const cssstyle_parser_1 = require("../parsers/cssstyle_parser");
const css_length_parser_1 = require("../parsers/css_length_parser");
const batch_sync_1 = require("../perf/batch_sync");
/**
 * Video converter: maps <video> JSX elements to UE's MediaPlayer + Image pipeline.
 *
 * Rendering chain:
 *   MediaPlayer (plays media) -> MediaTexture (renders frames) -> Image (displays in UMG)
 *
 * Supported props:
 *   src        - URL or asset path to the video file
 *   autoPlay   - Start playing immediately on load (default: false)
 *   loop       - Loop playback (default: false)
 *   muted      - Mute audio (default: false)
 *   width      - Widget width in pixels
 *   height     - Widget height in pixels
 *   poster     - Placeholder image shown before video loads
 *   onPlay     - Callback when playback starts
 *   onPause    - Callback when playback pauses
 *   onEnded    - Callback when playback finishes
 *   onError    - Callback when media fails to open
 *   onLoadedData - Callback when media successfully opens
 */
class VideoConverter extends jsx_converter_1.JSXConverter {
    /* ------------------------------------------------------------------ */
    /*  Internal state: media pipeline references                          */
    /* ------------------------------------------------------------------ */
    mediaPlayer;
    mediaTexture;
    imageWidget;
    sizeBox;
    /* ------------------------------------------------------------------ */
    /*  Event callback handles for proper teardown                         */
    /* ------------------------------------------------------------------ */
    onEndedCallback;
    onOpenedCallback;
    onOpenFailedCallback;
    onPlaybackResumedCallback;
    onPlaybackSuspendedCallback;
    constructor(typeName, props, outer) {
        super(typeName, props, outer);
    }
    /* ================================================================== */
    /*  Media pipeline setup                                               */
    /* ================================================================== */
    /**
     * Creates the MediaPlayer -> MediaTexture -> Image rendering pipeline.
     * This is the UE equivalent of an HTML <video> element.
     */
    setupMediaPipeline() {
        // Create the media player that drives playback
        this.mediaPlayer = new UE.MediaPlayer(this.outer);
        // Create the media texture that receives decoded video frames
        this.mediaTexture = new UE.MediaTexture(this.outer);
        this.mediaTexture.SetMediaPlayer(this.mediaPlayer);
        // Configure playback options
        this.mediaPlayer.PlayOnOpen = !!this.props?.autoPlay;
        this.mediaPlayer.Loop = !!this.props?.loop;
        // Create the UMG Image widget that displays the video texture
        this.imageWidget = new UE.Image(this.outer);
        // Set the media texture as the brush resource so frames render into the Image
        this.imageWidget.Brush.ResourceObject = this.mediaTexture;
        this.imageWidget.Brush.DrawAs = UE.ESlateBrushDrawType.Image;
        // Apply dimensions if specified
        const styles = (0, cssstyle_parser_1.getAllStyles)(this.typeName, this.props);
        const width = this.props?.width ?? styles?.width;
        const height = this.props?.height ?? styles?.height;
        const parseDimension = (v) => {
            if (v === undefined || v === null)
                return null;
            if (typeof v === 'number')
                return v;
            return (0, css_length_parser_1.convertLengthUnitToSlateUnit)(String(v), styles) || null;
        };
        const w = parseDimension(width);
        const h = parseDimension(height);
        // Wrap in SizeBox for explicit dimensions
        if (w !== null || h !== null) {
            this.sizeBox = new UE.SizeBox(this.outer);
            if (w !== null)
                this.sizeBox.SetWidthOverride(w);
            if (h !== null)
                this.sizeBox.SetHeightOverride(h);
            this.sizeBox.AddChild(this.imageWidget);
        }
        // Bind media events
        this.bindMediaEvents(this.mediaPlayer, this.props);
        // Open the media source
        const src = this.props?.src;
        if (src && typeof src === 'string') {
            this.openMediaSource(src);
        }
        // Synchronize widget properties
        (0, batch_sync_1.queueWidgetSync)(this.imageWidget);
        if (this.sizeBox) {
            (0, batch_sync_1.queueWidgetSync)(this.sizeBox);
        }
        return this.sizeBox ?? this.imageWidget;
    }
    /* ================================================================== */
    /*  Media source opening                                               */
    /* ================================================================== */
    openMediaSource(src) {
        if (!this.mediaPlayer)
            return;
        // UE asset paths start with /
        if (src.startsWith('/')) {
            this.mediaPlayer.OpenUrl(src);
        }
        else if (src.startsWith('http://') || src.startsWith('https://')) {
            // Network URL
            this.mediaPlayer.OpenUrl(src);
        }
        else {
            // Local file path -- try as URL which handles file:// and relative
            this.mediaPlayer.OpenUrl(src);
        }
    }
    /* ================================================================== */
    /*  Event binding                                                      */
    /* ================================================================== */
    bindMediaEvents(player, props) {
        // Teardown previous handlers
        this.unbindMediaEvents(player);
        // onEnded
        if (typeof props?.onEnded === 'function') {
            this.onEndedCallback = () => {
                try {
                    props.onEnded();
                }
                catch (e) {
                    console.warn('video onEnded error:', e);
                }
            };
            player.OnEndReached.Add(this.onEndedCallback);
        }
        // onLoadedData / onCanPlay (mapped to OnMediaOpened)
        if (typeof props?.onLoadedData === 'function' || typeof props?.onCanPlay === 'function') {
            this.onOpenedCallback = (_url) => {
                try {
                    if (typeof props.onLoadedData === 'function')
                        props.onLoadedData();
                    if (typeof props.onCanPlay === 'function')
                        props.onCanPlay();
                }
                catch (e) {
                    console.warn('video onLoadedData error:', e);
                }
            };
            player.OnMediaOpened.Add(this.onOpenedCallback);
        }
        // onError (mapped to OnMediaOpenFailed)
        if (typeof props?.onError === 'function') {
            this.onOpenFailedCallback = (failedUrl) => {
                try {
                    props.onError({ target: { src: failedUrl } });
                }
                catch (e) {
                    console.warn('video onError error:', e);
                }
            };
            player.OnMediaOpenFailed.Add(this.onOpenFailedCallback);
        }
        // onPlay (mapped to OnPlaybackResumed)
        if (typeof props?.onPlay === 'function') {
            this.onPlaybackResumedCallback = () => {
                try {
                    props.onPlay();
                }
                catch (e) {
                    console.warn('video onPlay error:', e);
                }
            };
            player.OnPlaybackResumed.Add(this.onPlaybackResumedCallback);
        }
        // onPause (mapped to OnPlaybackSuspended)
        if (typeof props?.onPause === 'function') {
            this.onPlaybackSuspendedCallback = () => {
                try {
                    props.onPause();
                }
                catch (e) {
                    console.warn('video onPause error:', e);
                }
            };
            player.OnPlaybackSuspended.Add(this.onPlaybackSuspendedCallback);
        }
    }
    unbindMediaEvents(player) {
        if (!player)
            return;
        if (this.onEndedCallback) {
            player.OnEndReached.Remove(this.onEndedCallback);
            this.onEndedCallback = undefined;
        }
        if (this.onOpenedCallback) {
            player.OnMediaOpened.Remove(this.onOpenedCallback);
            this.onOpenedCallback = undefined;
        }
        if (this.onOpenFailedCallback) {
            player.OnMediaOpenFailed.Remove(this.onOpenFailedCallback);
            this.onOpenFailedCallback = undefined;
        }
        if (this.onPlaybackResumedCallback) {
            player.OnPlaybackResumed.Remove(this.onPlaybackResumedCallback);
            this.onPlaybackResumedCallback = undefined;
        }
        if (this.onPlaybackSuspendedCallback) {
            player.OnPlaybackSuspended.Remove(this.onPlaybackSuspendedCallback);
            this.onPlaybackSuspendedCallback = undefined;
        }
    }
    /* ================================================================== */
    /*  Lifecycle                                                          */
    /* ================================================================== */
    createNativeWidget() {
        return this.setupMediaPipeline();
    }
    update(widget, _oldProps, changedProps) {
        if (!this.mediaPlayer)
            return;
        // Source change: close and re-open
        const newSrc = changedProps?.src;
        if (newSrc !== undefined && newSrc !== _oldProps?.src) {
            this.mediaPlayer.Close();
            if (newSrc) {
                this.openMediaSource(newSrc);
            }
        }
        // Loop property update
        if (changedProps?.loop !== undefined) {
            this.mediaPlayer.Loop = !!changedProps.loop;
        }
        // Re-bind events if callbacks changed
        if (changedProps?.onEnded !== undefined || changedProps?.onPlay !== undefined ||
            changedProps?.onPause !== undefined || changedProps?.onError !== undefined ||
            changedProps?.onLoadedData !== undefined) {
            this.bindMediaEvents(this.mediaPlayer, { ...this.props, ...changedProps });
        }
        // Dimension updates
        if (this.sizeBox && (changedProps?.width !== undefined || changedProps?.height !== undefined)) {
            const styles = (0, cssstyle_parser_1.getAllStyles)(this.typeName, { ...this.props, ...changedProps });
            if (changedProps.width !== undefined) {
                const w = typeof changedProps.width === 'number'
                    ? changedProps.width
                    : (0, css_length_parser_1.convertLengthUnitToSlateUnit)(String(changedProps.width), styles);
                if (w)
                    this.sizeBox.SetWidthOverride(w);
            }
            if (changedProps.height !== undefined) {
                const h = typeof changedProps.height === 'number'
                    ? changedProps.height
                    : (0, css_length_parser_1.convertLengthUnitToSlateUnit)(String(changedProps.height), styles);
                if (h)
                    this.sizeBox.SetHeightOverride(h);
            }
            (0, batch_sync_1.queueWidgetSync)(this.sizeBox);
        }
    }
    dispose() {
        // Clean up media resources when the component is removed
        if (this.mediaPlayer) {
            this.unbindMediaEvents(this.mediaPlayer);
            this.mediaPlayer.Close();
        }
    }
}
exports.VideoConverter = VideoConverter;
//# sourceMappingURL=video.js.map