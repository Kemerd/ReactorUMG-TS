import * as UE from 'ue';
import { JSXConverter } from './jsx_converter';
import { getAllStyles } from '../parsers/cssstyle_parser';
import { convertLengthUnitToSlateUnit } from '../parsers/css_length_parser';

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
export class VideoConverter extends JSXConverter {

    /* ------------------------------------------------------------------ */
    /*  Internal state: media pipeline references                          */
    /* ------------------------------------------------------------------ */
    private mediaPlayer?: UE.MediaPlayer;
    private mediaTexture?: UE.MediaTexture;
    private imageWidget?: UE.Image;
    private sizeBox?: UE.SizeBox;

    /* ------------------------------------------------------------------ */
    /*  Event callback handles for proper teardown                         */
    /* ------------------------------------------------------------------ */
    private onEndedCallback?: () => void;
    private onOpenedCallback?: (url: string) => void;
    private onOpenFailedCallback?: (url: string) => void;
    private onPlaybackResumedCallback?: () => void;
    private onPlaybackSuspendedCallback?: () => void;

    constructor(typeName: string, props: any, outer: any) {
        super(typeName, props, outer);
    }

    /* ================================================================== */
    /*  Media pipeline setup                                               */
    /* ================================================================== */

    /**
     * Creates the MediaPlayer -> MediaTexture -> Image rendering pipeline.
     * This is the UE equivalent of an HTML <video> element.
     */
    private setupMediaPipeline(): UE.Widget {
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
        const styles = getAllStyles(this.typeName, this.props);
        const width = this.props?.width ?? styles?.width;
        const height = this.props?.height ?? styles?.height;

        const parseDimension = (v: any): number | null => {
            if (v === undefined || v === null) return null;
            if (typeof v === 'number') return v;
            return convertLengthUnitToSlateUnit(String(v), styles) || null;
        };

        const w = parseDimension(width);
        const h = parseDimension(height);

        // Wrap in SizeBox for explicit dimensions
        if (w !== null || h !== null) {
            this.sizeBox = new UE.SizeBox(this.outer);
            if (w !== null) this.sizeBox.SetWidthOverride(w);
            if (h !== null) this.sizeBox.SetHeightOverride(h);
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
        UE.UMGManager.SynchronizeWidgetProperties(this.imageWidget);
        if (this.sizeBox) {
            UE.UMGManager.SynchronizeWidgetProperties(this.sizeBox);
        }

        return this.sizeBox ?? this.imageWidget;
    }

    /* ================================================================== */
    /*  Media source opening                                               */
    /* ================================================================== */
    private openMediaSource(src: string): void {
        if (!this.mediaPlayer) return;

        // UE asset paths start with /
        if (src.startsWith('/')) {
            this.mediaPlayer.OpenUrl(src);
        } else if (src.startsWith('http://') || src.startsWith('https://')) {
            // Network URL
            this.mediaPlayer.OpenUrl(src);
        } else {
            // Local file path -- try as URL which handles file:// and relative
            this.mediaPlayer.OpenUrl(src);
        }
    }

    /* ================================================================== */
    /*  Event binding                                                      */
    /* ================================================================== */
    private bindMediaEvents(player: UE.MediaPlayer, props: any): void {
        // Teardown previous handlers
        this.unbindMediaEvents(player);

        // onEnded
        if (typeof props?.onEnded === 'function') {
            this.onEndedCallback = () => {
                try { props.onEnded(); } catch (e) { console.warn('video onEnded error:', e); }
            };
            player.OnEndReached.Add(this.onEndedCallback);
        }

        // onLoadedData / onCanPlay (mapped to OnMediaOpened)
        if (typeof props?.onLoadedData === 'function' || typeof props?.onCanPlay === 'function') {
            this.onOpenedCallback = (_url: string) => {
                try {
                    if (typeof props.onLoadedData === 'function') props.onLoadedData();
                    if (typeof props.onCanPlay === 'function') props.onCanPlay();
                } catch (e) { console.warn('video onLoadedData error:', e); }
            };
            player.OnMediaOpened.Add(this.onOpenedCallback);
        }

        // onError (mapped to OnMediaOpenFailed)
        if (typeof props?.onError === 'function') {
            this.onOpenFailedCallback = (failedUrl: string) => {
                try { props.onError({ target: { src: failedUrl } }); } catch (e) { console.warn('video onError error:', e); }
            };
            player.OnMediaOpenFailed.Add(this.onOpenFailedCallback);
        }

        // onPlay (mapped to OnPlaybackResumed)
        if (typeof props?.onPlay === 'function') {
            this.onPlaybackResumedCallback = () => {
                try { props.onPlay(); } catch (e) { console.warn('video onPlay error:', e); }
            };
            player.OnPlaybackResumed.Add(this.onPlaybackResumedCallback);
        }

        // onPause (mapped to OnPlaybackSuspended)
        if (typeof props?.onPause === 'function') {
            this.onPlaybackSuspendedCallback = () => {
                try { props.onPause(); } catch (e) { console.warn('video onPause error:', e); }
            };
            player.OnPlaybackSuspended.Add(this.onPlaybackSuspendedCallback);
        }
    }

    private unbindMediaEvents(player: UE.MediaPlayer): void {
        if (!player) return;

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
    createNativeWidget(): UE.Widget {
        return this.setupMediaPipeline();
    }

    update(widget: UE.Widget, _oldProps: any, changedProps: any): void {
        if (!this.mediaPlayer) return;

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
            const styles = getAllStyles(this.typeName, { ...this.props, ...changedProps });
            if (changedProps.width !== undefined) {
                const w = typeof changedProps.width === 'number'
                    ? changedProps.width
                    : convertLengthUnitToSlateUnit(String(changedProps.width), styles);
                if (w) this.sizeBox.SetWidthOverride(w);
            }
            if (changedProps.height !== undefined) {
                const h = typeof changedProps.height === 'number'
                    ? changedProps.height
                    : convertLengthUnitToSlateUnit(String(changedProps.height), styles);
                if (h) this.sizeBox.SetHeightOverride(h);
            }
            UE.UMGManager.SynchronizeWidgetProperties(this.sizeBox);
        }
    }

    dispose(): void {
        // Clean up media resources when the component is removed
        if (this.mediaPlayer) {
            this.unbindMediaEvents(this.mediaPlayer);
            this.mediaPlayer.Close();
        }
    }
}
