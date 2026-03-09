/**
 * ============================================================================
 * ReactorUMG Synthetic Event System
 * ============================================================================
 * 
 * DOM-like synthetic events for the React-to-UMG bridge. Wraps Unreal Engine
 * input event data in a React-compatible API with stopPropagation(),
 * preventDefault(), bubbling phases, etc.
 * 
 * Modeled after React's SyntheticEvent:
 * https://react.dev/reference/react-dom/components/common#react-event-object
 * ============================================================================
 */

import * as UE from 'ue';

/* ------------------------------------------------------------------ */
/*  Event Phase Constants (mirrors DOM EventPhase)                     */
/* ------------------------------------------------------------------ */
export const EVENT_PHASE_NONE      = 0;
export const EVENT_PHASE_CAPTURING = 1;
export const EVENT_PHASE_AT_TARGET = 2;
export const EVENT_PHASE_BUBBLING  = 3;

/* ------------------------------------------------------------------ */
/*  Modifier key extraction from UE InputEvent hierarchy               */
/* ------------------------------------------------------------------ */

/**
 * Extracts common modifier key state from a UE InputEvent.
 * Works for PointerEvent, KeyEvent, and CharacterEvent since they
 * all inherit from InputEvent.
 *
 * NOTE: PuerTS does NOT expose InputEvent methods like IsAltDown()
 * directly on the JS wrapper. We must go through
 * WidgetBlueprintLibrary's static InputEvent_Is*Down() helpers.
 */
function extractModifiers(nativeEvent: any): { altKey: boolean; ctrlKey: boolean; shiftKey: boolean; metaKey: boolean } {
    if (!nativeEvent) {
        return { altKey: false, ctrlKey: false, shiftKey: false, metaKey: false };
    }

    let alt = false, ctrl = false, shift = false, meta = false;
    try {
        // WidgetBlueprintLibrary exposes these as static functions that accept
        // any InputEvent (base class of PointerEvent, KeyEvent, etc.)
        alt   = UE.WidgetBlueprintLibrary.InputEvent_IsAltDown(nativeEvent);
        ctrl  = UE.WidgetBlueprintLibrary.InputEvent_IsControlDown(nativeEvent);
        shift = UE.WidgetBlueprintLibrary.InputEvent_IsShiftDown(nativeEvent);
        meta  = UE.WidgetBlueprintLibrary.InputEvent_IsCommandDown(nativeEvent);
    } catch {
        // Fallback: modifiers unavailable (e.g. synthetic dispatch with no native event)
    }

    return { altKey: alt, ctrlKey: ctrl, shiftKey: shift, metaKey: meta };
}

/* ================================================================== */
/*  Base SyntheticEvent                                                */
/* ================================================================== */

/**
 * Base synthetic event class shared by all event types. Mirrors React's
 * SyntheticEvent interface with stopPropagation / preventDefault support.
 */
export class SyntheticEvent<TNative = any> {
    /** The string event type identifier, e.g. "click", "keydown" */
    public readonly type: string;

    /** The UMGWidget node that originated the event */
    public target: any;

    /** The UMGWidget node currently processing the event (changes during propagation) */
    public currentTarget: any;

    /** The underlying Unreal Engine event object (PointerEvent, KeyEvent, etc.) */
    public readonly nativeEvent: TNative;

    /** Whether this event type bubbles through the tree */
    public readonly bubbles: boolean;

    /** Whether this event can be cancelled via preventDefault() */
    public readonly cancelable: boolean;

    /** Current propagation phase (NONE / CAPTURING / AT_TARGET / BUBBLING) */
    public eventPhase: number;

    /** High-resolution timestamp of when the event occurred */
    public readonly timeStamp: number;

    /** Whether the event was triggered by user interaction (vs synthetic dispatch) */
    public readonly isTrusted: boolean;

    /* -- Internal flags -- */
    private _propagationStopped: boolean;
    private _immediatePropagationStopped: boolean;
    private _defaultPrevented: boolean;

    constructor(type: string, nativeEvent: TNative, bubbles: boolean = true, cancelable: boolean = true) {
        this.type = type;
        this.nativeEvent = nativeEvent;
        this.bubbles = bubbles;
        this.cancelable = cancelable;
        this.eventPhase = EVENT_PHASE_NONE;
        this.timeStamp = Date.now();
        this.isTrusted = true;

        this.target = null;
        this.currentTarget = null;
        this._propagationStopped = false;
        this._immediatePropagationStopped = false;
        this._defaultPrevented = false;
    }

    /**
     * Stops the event from propagating further through the tree.
     * Handlers already queued on the current node will still execute.
     */
    stopPropagation(): void {
        this._propagationStopped = true;
    }

    /** Returns true if stopPropagation() was called */
    isPropagationStopped(): boolean {
        return this._propagationStopped;
    }

    /**
     * Stops propagation AND prevents any remaining handlers on the
     * current node from executing.
     */
    stopImmediatePropagation(): void {
        this._propagationStopped = true;
        this._immediatePropagationStopped = true;
    }

    /** Returns true if stopImmediatePropagation() was called */
    isImmediatePropagationStopped(): boolean {
        return this._immediatePropagationStopped;
    }

    /**
     * Prevents the default action associated with this event.
     * In UMG context, this maps to returning an "Unhandled" EventReply
     * so Slate continues default processing.
     */
    preventDefault(): void {
        if (this.cancelable) {
            this._defaultPrevented = true;
        }
    }

    /** Returns true if preventDefault() was called */
    isDefaultPrevented(): boolean {
        return this._defaultPrevented;
    }

    /**
     * Called by the pool/dispatcher after the event is done being used.
     * Nullifies references to allow GC of the native event and node refs.
     */
    persist(): void {
        // In React, persist() opts the event out of pooling. Since we
        // don't pool (JS GC handles it), this is a no-op but we keep
        // the API for compatibility.
    }
}

/* ================================================================== */
/*  SyntheticMouseEvent                                                */
/* ================================================================== */

/**
 * Mouse event wrapping UE.PointerEvent with screen positions, button
 * info, and modifier keys. Covers click, mousedown/up, mousemove,
 * mouseenter/leave, doubleclick, and contextmenu.
 */
export class SyntheticMouseEvent extends SyntheticEvent<UE.PointerEvent> {
    /** Horizontal position in screen space (pixels) */
    public readonly clientX: number;

    /** Vertical position in screen space (pixels) */
    public readonly clientY: number;

    /** Alias for clientX (in UMG there's no page vs client distinction) */
    public readonly pageX: number;

    /** Alias for clientY */
    public readonly pageY: number;

    /** Horizontal position relative to the viewport */
    public readonly screenX: number;

    /** Vertical position relative to the viewport */
    public readonly screenY: number;

    /**
     * Which button was pressed:
     * 0 = primary (left), 1 = auxiliary (middle), 2 = secondary (right)
     */
    public readonly button: number;

    /** Bitmask of currently pressed buttons */
    public readonly buttons: number;

    /** Mouse movement delta X since last event */
    public readonly movementX: number;

    /** Mouse movement delta Y since last event */
    public readonly movementY: number;

    /** Alt key held */
    public readonly altKey: boolean;

    /** Control key held */
    public readonly ctrlKey: boolean;

    /** Shift key held */
    public readonly shiftKey: boolean;

    /** Meta/Command key held */
    public readonly metaKey: boolean;

    constructor(type: string, nativeEvent: UE.PointerEvent, bubbles: boolean = true, cancelable: boolean = true) {
        super(type, nativeEvent, bubbles, cancelable);

        // Extract screen-space position from the UE PointerEvent
        const screenPos = nativeEvent
            ? UE.WidgetBlueprintLibrary.PointerEvent_GetScreenSpacePosition(nativeEvent)
            : null;
        this.clientX = screenPos?.X ?? 0;
        this.clientY = screenPos?.Y ?? 0;
        this.pageX = this.clientX;
        this.pageY = this.clientY;
        this.screenX = this.clientX;
        this.screenY = this.clientY;

        // Extract cursor delta for movementX/Y
        const delta = nativeEvent
            ? UE.WidgetBlueprintLibrary.PointerEvent_GetCursorDelta(nativeEvent)
            : null;
        this.movementX = delta?.X ?? 0;
        this.movementY = delta?.Y ?? 0;

        // Determine which button triggered the event
        this.button = this._resolveButton(nativeEvent);
        this.buttons = this._resolveButtons(nativeEvent);

        // Modifier keys
        const mods = extractModifiers(nativeEvent);
        this.altKey = mods.altKey;
        this.ctrlKey = mods.ctrlKey;
        this.shiftKey = mods.shiftKey;
        this.metaKey = mods.metaKey;
    }

    /**
     * Maps UE effecting button Key to DOM button index.
     * LeftMouseButton=0, MiddleMouseButton=1, RightMouseButton=2
     */
    private _resolveButton(nativeEvent: UE.PointerEvent): number {
        if (!nativeEvent) return 0;
        try {
            const effectingButton = UE.WidgetBlueprintLibrary.PointerEvent_GetEffectingButton(nativeEvent);
            if (!effectingButton) return 0;
            const keyName = effectingButton.KeyName ?? '';
            if (keyName === 'RightMouseButton') return 2;
            if (keyName === 'MiddleMouseButton') return 1;
            return 0; // LeftMouseButton or default
        } catch {
            return 0;
        }
    }

    /**
     * Builds a DOM-style button bitmask from the native event.
     * 1=left, 2=right, 4=middle
     */
    private _resolveButtons(nativeEvent: UE.PointerEvent): number {
        if (!nativeEvent) return 0;
        let mask = 0;
        try {
            if (UE.WidgetBlueprintLibrary.PointerEvent_IsMouseButtonDown(nativeEvent, new UE.Key('LeftMouseButton'))) mask |= 1;
            if (UE.WidgetBlueprintLibrary.PointerEvent_IsMouseButtonDown(nativeEvent, new UE.Key('RightMouseButton'))) mask |= 2;
            if (UE.WidgetBlueprintLibrary.PointerEvent_IsMouseButtonDown(nativeEvent, new UE.Key('MiddleMouseButton'))) mask |= 4;
        } catch {
            // PointerEvent_IsMouseButtonDown may not be available in all contexts
        }
        return mask;
    }
}

/* ================================================================== */
/*  SyntheticWheelEvent                                                */
/* ================================================================== */

/**
 * Wheel/scroll event extending mouse event with delta values.
 */
export class SyntheticWheelEvent extends SyntheticMouseEvent {
    /** Horizontal scroll amount */
    public readonly deltaX: number;

    /** Vertical scroll amount (positive = scroll down) */
    public readonly deltaY: number;

    /** Z-axis scroll amount (rare, usually 0) */
    public readonly deltaZ: number;

    /** 0 = pixels, 1 = lines, 2 = pages */
    public readonly deltaMode: number;

    constructor(type: string, nativeEvent: UE.PointerEvent) {
        super(type, nativeEvent, true, true);

        // UE exposes wheel delta as a single float via PointerEvent
        const wheelDelta = nativeEvent
            ? UE.WidgetBlueprintLibrary.PointerEvent_GetWheelDelta(nativeEvent)
            : 0;
        this.deltaX = 0;
        this.deltaY = wheelDelta ?? 0;
        this.deltaZ = 0;
        this.deltaMode = 0; // pixels
    }
}

/* ================================================================== */
/*  SyntheticKeyboardEvent                                             */
/* ================================================================== */

/**
 * Keyboard event wrapping UE.KeyEvent. Provides key name, code,
 * and modifier state.
 */
export class SyntheticKeyboardEvent extends SyntheticEvent<UE.KeyEvent> {
    /** The logical key value (e.g., "a", "Enter", "ArrowUp") */
    public readonly key: string;

    /** The physical key code (e.g., "KeyA", "Enter", "ArrowUp") */
    public readonly code: string;

    /** Whether this is a repeated key event (key held down) */
    public readonly repeat: boolean;

    /** Alt key held */
    public readonly altKey: boolean;

    /** Control key held */
    public readonly ctrlKey: boolean;

    /** Shift key held */
    public readonly shiftKey: boolean;

    /** Meta/Command key held */
    public readonly metaKey: boolean;

    constructor(type: string, nativeEvent: UE.KeyEvent, repeat: boolean = false) {
        super(type, nativeEvent, true, true);

        // Extract key identity from the native KeyEvent
        let keyName = '';
        try {
            const keyObj = nativeEvent ? UE.WidgetBlueprintLibrary.GetKey(nativeEvent) : null;
            keyName = keyObj?.KeyName ?? '';
        } catch {
            // Fallback if GetKey is not available
        }

        this.key = mapUEKeyToDOM(keyName);
        this.code = keyName;
        this.repeat = repeat;

        const mods = extractModifiers(nativeEvent);
        this.altKey = mods.altKey;
        this.ctrlKey = mods.ctrlKey;
        this.shiftKey = mods.shiftKey;
        this.metaKey = mods.metaKey;
    }
}

/* ================================================================== */
/*  SyntheticFocusEvent                                                */
/* ================================================================== */

/**
 * Focus event wrapping UE.FocusEvent. Covers focus/blur/focusin/focusout.
 */
export class SyntheticFocusEvent extends SyntheticEvent<UE.FocusEvent> {
    /** The other element involved in the focus change (gaining or losing focus) */
    public relatedTarget: any;

    constructor(type: string, nativeEvent: UE.FocusEvent, relatedTarget?: any) {
        // focus and blur don't bubble; focusin and focusout do
        const doesBubble = (type === 'focusin' || type === 'focusout');
        super(type, nativeEvent, doesBubble, false);
        this.relatedTarget = relatedTarget ?? null;
    }
}

/* ================================================================== */
/*  SyntheticDragEvent                                                 */
/* ================================================================== */

/**
 * Minimal DataTransfer-like object for drag-and-drop operations.
 * Wraps UE.DragDropOperation payload data.
 */
export class ReactDataTransfer {
    private _data: Map<string, string>;
    private _operation: UE.DragDropOperation | null;

    constructor(operation?: UE.DragDropOperation) {
        this._data = new Map();
        this._operation = operation ?? null;
    }

    setData(format: string, data: string): void {
        this._data.set(format, data);
    }

    getData(format: string): string {
        return this._data.get(format) ?? '';
    }

    clearData(format?: string): void {
        if (format) {
            this._data.delete(format);
        } else {
            this._data.clear();
        }
    }

    /** Access the underlying UE DragDropOperation */
    get operation(): UE.DragDropOperation | null {
        return this._operation;
    }
}

/**
 * Drag event extending mouse event with dataTransfer.
 */
export class SyntheticDragEvent extends SyntheticMouseEvent {
    /** The drag data transfer object */
    public readonly dataTransfer: ReactDataTransfer;

    constructor(
        type: string,
        nativePointerEvent: UE.PointerEvent,
        operation?: UE.DragDropOperation
    ) {
        super(type, nativePointerEvent, true, true);
        this.dataTransfer = new ReactDataTransfer(operation);
    }
}

/* ================================================================== */
/*  SyntheticTouchEvent                                                */
/* ================================================================== */

/**
 * Represents a single touch point, equivalent to a DOM Touch object.
 */
export interface TouchPoint {
    identifier: number;
    clientX: number;
    clientY: number;
    screenX: number;
    screenY: number;
    pageX: number;
    pageY: number;
    target: any;
}

/**
 * Touch event wrapping UE.PointerEvent for touch-based input.
 */
export class SyntheticTouchEvent extends SyntheticEvent<UE.PointerEvent> {
    /** All active touches */
    public readonly touches: ReadonlyArray<TouchPoint>;

    /** Touches that changed in this event */
    public readonly changedTouches: ReadonlyArray<TouchPoint>;

    /** Touches on the target element */
    public readonly targetTouches: ReadonlyArray<TouchPoint>;

    /** Alt key held */
    public readonly altKey: boolean;

    /** Control key held */
    public readonly ctrlKey: boolean;

    /** Shift key held */
    public readonly shiftKey: boolean;

    /** Meta/Command key held */
    public readonly metaKey: boolean;

    constructor(type: string, nativeEvent: UE.PointerEvent, target?: any) {
        super(type, nativeEvent, true, true);

        // Build a single TouchPoint from the UE PointerEvent
        const screenPos = nativeEvent
            ? UE.WidgetBlueprintLibrary.PointerEvent_GetScreenSpacePosition(nativeEvent)
            : null;
        const touch: TouchPoint = {
            identifier: 0,
            clientX: screenPos?.X ?? 0,
            clientY: screenPos?.Y ?? 0,
            screenX: screenPos?.X ?? 0,
            screenY: screenPos?.Y ?? 0,
            pageX: screenPos?.X ?? 0,
            pageY: screenPos?.Y ?? 0,
            target: target ?? null,
        };

        this.changedTouches = [touch];

        // For start/move events, the touch is still active
        if (type === 'touchstart' || type === 'touchmove') {
            this.touches = [touch];
            this.targetTouches = [touch];
        } else {
            // For touchend, the ended touch is NOT in touches
            this.touches = [];
            this.targetTouches = [];
        }

        const mods = extractModifiers(nativeEvent);
        this.altKey = mods.altKey;
        this.ctrlKey = mods.ctrlKey;
        this.shiftKey = mods.shiftKey;
        this.metaKey = mods.metaKey;
    }
}

/* ================================================================== */
/*  Key Name Mapping: UE Key Names -> DOM Key Values                   */
/* ================================================================== */

/**
 * Maps Unreal Engine key names to standard DOM KeyboardEvent.key values.
 * Handles the most common keys; unmapped keys pass through as-is.
 */
const UE_KEY_TO_DOM_MAP: Record<string, string> = {
    // Letters (UE uses uppercase single chars)
    'A': 'a', 'B': 'b', 'C': 'c', 'D': 'd', 'E': 'e', 'F': 'f',
    'G': 'g', 'H': 'h', 'I': 'i', 'J': 'j', 'K': 'k', 'L': 'l',
    'M': 'm', 'N': 'n', 'O': 'o', 'P': 'p', 'Q': 'q', 'R': 'r',
    'S': 's', 'T': 't', 'U': 'u', 'V': 'v', 'W': 'w', 'X': 'x',
    'Y': 'y', 'Z': 'z',

    // Digits
    'Zero': '0', 'One': '1', 'Two': '2', 'Three': '3', 'Four': '4',
    'Five': '5', 'Six': '6', 'Seven': '7', 'Eight': '8', 'Nine': '9',

    // Arrow keys
    'Up': 'ArrowUp', 'Down': 'ArrowDown', 'Left': 'ArrowLeft', 'Right': 'ArrowRight',

    // Navigation / editing
    'Enter': 'Enter', 'SpaceBar': ' ', 'BackSpace': 'Backspace', 'Delete': 'Delete',
    'Tab': 'Tab', 'Escape': 'Escape', 'Home': 'Home', 'End': 'End',
    'PageUp': 'PageUp', 'PageDown': 'PageDown', 'Insert': 'Insert',

    // Modifier keys
    'LeftShift': 'Shift', 'RightShift': 'Shift',
    'LeftControl': 'Control', 'RightControl': 'Control',
    'LeftAlt': 'Alt', 'RightAlt': 'Alt',
    'LeftCommand': 'Meta', 'RightCommand': 'Meta',
    'CapsLock': 'CapsLock',

    // Function keys
    'F1': 'F1', 'F2': 'F2', 'F3': 'F3', 'F4': 'F4', 'F5': 'F5', 'F6': 'F6',
    'F7': 'F7', 'F8': 'F8', 'F9': 'F9', 'F10': 'F10', 'F11': 'F11', 'F12': 'F12',

    // Numpad
    'NumPadZero': '0', 'NumPadOne': '1', 'NumPadTwo': '2', 'NumPadThree': '3',
    'NumPadFour': '4', 'NumPadFive': '5', 'NumPadSix': '6', 'NumPadSeven': '7',
    'NumPadEight': '8', 'NumPadNine': '9',
    'Multiply': '*', 'Add': '+', 'Subtract': '-', 'Decimal': '.', 'Divide': '/',

    // Punctuation
    'Semicolon': ';', 'Equals': '=', 'Comma': ',', 'Hyphen': '-',
    'Period': '.', 'Slash': '/', 'Tilde': '`',
    'LeftBracket': '[', 'Backslash': '\\', 'RightBracket': ']', 'Apostrophe': "'",

    // Gamepad (mapped to descriptive strings)
    'Gamepad_LeftX': 'GamepadLeftStickX',
    'Gamepad_LeftY': 'GamepadLeftStickY',
    'Gamepad_RightX': 'GamepadRightStickX',
    'Gamepad_RightY': 'GamepadRightStickY',
    'Gamepad_FaceButton_Bottom': 'GamepadA',
    'Gamepad_FaceButton_Right': 'GamepadB',
    'Gamepad_FaceButton_Left': 'GamepadX',
    'Gamepad_FaceButton_Top': 'GamepadY',
    'Gamepad_LeftShoulder': 'GamepadLeftBumper',
    'Gamepad_RightShoulder': 'GamepadRightBumper',
    'Gamepad_LeftTrigger': 'GamepadLeftTrigger',
    'Gamepad_RightTrigger': 'GamepadRightTrigger',
    'Gamepad_Special_Left': 'GamepadSelect',
    'Gamepad_Special_Right': 'GamepadStart',
    'Gamepad_LeftThumbstick': 'GamepadLeftStickButton',
    'Gamepad_RightThumbstick': 'GamepadRightStickButton',
    'Gamepad_DPad_Up': 'GamepadDPadUp',
    'Gamepad_DPad_Down': 'GamepadDPadDown',
    'Gamepad_DPad_Left': 'GamepadDPadLeft',
    'Gamepad_DPad_Right': 'GamepadDPadRight',
};

/**
 * Converts a UE key name string to the equivalent DOM KeyboardEvent.key value.
 */
function mapUEKeyToDOM(ueKeyName: string): string {
    if (!ueKeyName) return '';
    return UE_KEY_TO_DOM_MAP[ueKeyName] ?? ueKeyName;
}
