import * as UE from 'ue';
import { JSXConverter } from './jsx_converter';

/**
 * Audio converter: maps <audio> JSX elements to UE's MediaPlayer for audio-only playback.
 *
 * Since audio has no visual representation, this converter creates a minimal
 * invisible Spacer widget as a placeholder in the widget tree. The actual
 * audio playback is handled by a MediaPlayer instance.
 *
 * Supported props:
 *   src        - URL or asset path to the audio file
 *   autoPlay   - Start playing immediately on load (default: false)
 *   loop       - Loop playback (default: false)
 *   muted      - Mute audio (default: false)
 *   volume     - Volume level 0.0 to 1.0 (default: 1.0)
 *   onPlay     - Callback when playback starts
 *   onPause    - Callback when playback pauses
 *   onEnded    - Callback when playback finishes
 *   onError    - Callback when media fails to open
 *   onLoadedData - Callback when media successfully opens
 */
export class AudioConverter extends JSXConverter {

    /* ------------------------------------------------------------------ */
    /*  Internal state                                                     */
    /* ------------------------------------------------------------------ */
    private mediaPlayer?: UE.MediaPlayer;
    private spacerWidget?: UE.Spacer;

    /* ------------------------------------------------------------------ */
    /*  Event callback handles                                             */
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
    /*  Media source opening                                               */
    /* ================================================================== */
    private openMediaSource(src: string): void {
        if (!this.mediaPlayer) return;

        // All source types go through OpenUrl -- UE handles asset paths,
        // HTTP URLs, and file paths internally
        this.mediaPlayer.OpenUrl(src);
    }

    /* ================================================================== */
    /*  Event binding                                                      */
    /* ================================================================== */
    private bindMediaEvents(player: UE.MediaPlayer, props: any): void {
        this.unbindMediaEvents(player);

        // onEnded
        if (typeof props?.onEnded === 'function') {
            this.onEndedCallback = () => {
                try { props.onEnded(); } catch (e) { console.warn('audio onEnded error:', e); }
            };
            player.OnEndReached.Add(this.onEndedCallback);
        }

        // onLoadedData (mapped to OnMediaOpened)
        if (typeof props?.onLoadedData === 'function' || typeof props?.onCanPlay === 'function') {
            this.onOpenedCallback = (_url: string) => {
                try {
                    if (typeof props.onLoadedData === 'function') props.onLoadedData();
                    if (typeof props.onCanPlay === 'function') props.onCanPlay();
                } catch (e) { console.warn('audio onLoadedData error:', e); }
            };
            player.OnMediaOpened.Add(this.onOpenedCallback);
        }

        // onError (mapped to OnMediaOpenFailed)
        if (typeof props?.onError === 'function') {
            this.onOpenFailedCallback = (failedUrl: string) => {
                try { props.onError({ target: { src: failedUrl } }); } catch (e) { console.warn('audio onError error:', e); }
            };
            player.OnMediaOpenFailed.Add(this.onOpenFailedCallback);
        }

        // onPlay
        if (typeof props?.onPlay === 'function') {
            this.onPlaybackResumedCallback = () => {
                try { props.onPlay(); } catch (e) { console.warn('audio onPlay error:', e); }
            };
            player.OnPlaybackResumed.Add(this.onPlaybackResumedCallback);
        }

        // onPause
        if (typeof props?.onPause === 'function') {
            this.onPlaybackSuspendedCallback = () => {
                try { props.onPause(); } catch (e) { console.warn('audio onPause error:', e); }
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
        // Create the media player for audio playback
        this.mediaPlayer = new UE.MediaPlayer(this.outer);
        this.mediaPlayer.PlayOnOpen = !!this.props?.autoPlay;
        this.mediaPlayer.Loop = !!this.props?.loop;

        // Audio elements have no visual -- return a collapsed Spacer
        this.spacerWidget = new UE.Spacer(this.outer);
        this.spacerWidget.SetVisibility(UE.ESlateVisibility.Collapsed);

        // Bind event handlers
        this.bindMediaEvents(this.mediaPlayer, this.props);

        // Open the audio source
        const src = this.props?.src;
        if (src && typeof src === 'string') {
            this.openMediaSource(src);
        }

        return this.spacerWidget;
    }

    update(_widget: UE.Widget, _oldProps: any, changedProps: any): void {
        if (!this.mediaPlayer) return;

        // Source change
        const newSrc = changedProps?.src;
        if (newSrc !== undefined && newSrc !== _oldProps?.src) {
            this.mediaPlayer.Close();
            if (newSrc) {
                this.openMediaSource(newSrc);
            }
        }

        // Loop
        if (changedProps?.loop !== undefined) {
            this.mediaPlayer.Loop = !!changedProps.loop;
        }

        // Playback control via play/pause props
        if (changedProps?.paused === true) {
            this.mediaPlayer.Pause();
        } else if (changedProps?.paused === false && !this.mediaPlayer.IsPlaying()) {
            this.mediaPlayer.Play();
        }

        // Re-bind events if callbacks changed
        if (changedProps?.onEnded !== undefined || changedProps?.onPlay !== undefined ||
            changedProps?.onPause !== undefined || changedProps?.onError !== undefined ||
            changedProps?.onLoadedData !== undefined) {
            this.bindMediaEvents(this.mediaPlayer, { ...this.props, ...changedProps });
        }
    }

    dispose(): void {
        if (this.mediaPlayer) {
            this.unbindMediaEvents(this.mediaPlayer);
            this.mediaPlayer.Close();
        }
    }
}
