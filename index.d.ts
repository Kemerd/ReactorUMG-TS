declare module "reactorumg" {
    import * as React from 'react';
    import * as UE from 'ue';
    import * as CssType from 'csstype';
    type TArray<T> = UE.TArray<T>;
    type TSet<T> = UE.TSet<T>;
    type TMap<TKey, TValue> = UE.TMap<TKey, TValue>;

    // This type definition creates a recursive partial type, which means that it makes all properties of a given type optional, and if any of those properties are objects or arrays, it applies the same transformation to their properties as well.
    type RecursivePartial<T> = {
        [P in keyof T]?:
        T[P] extends (infer U)[] ? RecursivePartial<U>[] : // If the property is an array, apply RecursivePartial to the array's element type.
        T[P] extends object ? RecursivePartial<T[P]> : // If the property is an object, apply RecursivePartial to the object type.
        T[P]; // Otherwise, keep the property type as is.
    };

    type TextCommitType = 'default' | 'enter' | 'mouse-focus' | 'clear';

    /* ------------------------------------------------------------------ */
    /*  Synthetic Event Types                                              */
    /* ------------------------------------------------------------------ */

    /**
     * Base synthetic event mirroring React's SyntheticEvent.
     * Provides stopPropagation(), preventDefault(), and propagation phases.
     */
    interface BaseSyntheticEvent<TNative = any> {
        type: string;
        target: any;
        currentTarget: any;
        nativeEvent: TNative;
        bubbles: boolean;
        cancelable: boolean;
        eventPhase: number;
        timeStamp: number;
        isTrusted: boolean;
        stopPropagation(): void;
        isPropagationStopped(): boolean;
        stopImmediatePropagation(): void;
        isImmediatePropagationStopped(): boolean;
        preventDefault(): void;
        isDefaultPrevented(): boolean;
        persist(): void;
    }

    /**
     * Mouse event with screen positions, button info, and modifier keys.
     */
    interface MouseEvent extends BaseSyntheticEvent {
        clientX: number;
        clientY: number;
        pageX: number;
        pageY: number;
        screenX: number;
        screenY: number;
        button: number;
        buttons: number;
        movementX: number;
        movementY: number;
        altKey: boolean;
        ctrlKey: boolean;
        shiftKey: boolean;
        metaKey: boolean;
    }

    /**
     * Wheel/scroll event extending mouse event.
     */
    interface WheelEvent extends MouseEvent {
        deltaX: number;
        deltaY: number;
        deltaZ: number;
        deltaMode: number;
    }

    /**
     * Keyboard event with key name, code, and modifier keys.
     */
    interface KeyboardEvent extends BaseSyntheticEvent {
        key: string;
        code: string;
        repeat: boolean;
        altKey: boolean;
        ctrlKey: boolean;
        shiftKey: boolean;
        metaKey: boolean;
    }

    /**
     * Focus event with relatedTarget for the other focus participant.
     */
    interface FocusEvent extends BaseSyntheticEvent {
        relatedTarget: any;
    }

    /**
     * Touch point representing a single finger/pointer contact.
     */
    interface TouchPoint {
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
     * Touch event with touch lists.
     */
    interface TouchEvent extends BaseSyntheticEvent {
        touches: ReadonlyArray<TouchPoint>;
        changedTouches: ReadonlyArray<TouchPoint>;
        targetTouches: ReadonlyArray<TouchPoint>;
        altKey: boolean;
        ctrlKey: boolean;
        shiftKey: boolean;
        metaKey: boolean;
    }

    /**
     * Drag event extending mouse event with dataTransfer.
     */
    interface DragEvent extends MouseEvent {
        dataTransfer: {
            setData(format: string, data: string): void;
            getData(format: string): string;
            clearData(format?: string): void;
        };
    }

    /* ------------------------------------------------------------------ */
    /*  Event Handler Types                                                */
    /* ------------------------------------------------------------------ */

    type MouseEventHandler = (event: MouseEvent) => void;
    type WheelEventHandler = (event: WheelEvent) => void;
    type KeyboardEventHandler = (event: KeyboardEvent) => void;
    type FocusEventHandler = (event: FocusEvent) => void;
    type TouchEventHandler = (event: TouchEvent) => void;
    type DragEventHandler = (event: DragEvent) => void;

    /**
     * All standard DOM-like event handler props supported by ReactorUMG.
     * These are available on all widget types via CommonProps.
     */
    interface EventHandlerProps {
        // --- Mouse Events ---
        onClick?: MouseEventHandler | undefined;
        onClickCapture?: MouseEventHandler | undefined;
        onDoubleClick?: MouseEventHandler | undefined;
        onDoubleClickCapture?: MouseEventHandler | undefined;
        onContextMenu?: MouseEventHandler | undefined;
        onContextMenuCapture?: MouseEventHandler | undefined;
        onMouseDown?: MouseEventHandler | undefined;
        onMouseDownCapture?: MouseEventHandler | undefined;
        onMouseUp?: MouseEventHandler | undefined;
        onMouseUpCapture?: MouseEventHandler | undefined;
        onMouseMove?: MouseEventHandler | undefined;
        onMouseMoveCapture?: MouseEventHandler | undefined;
        onMouseEnter?: MouseEventHandler | undefined;
        onMouseLeave?: MouseEventHandler | undefined;
        onMouseOver?: MouseEventHandler | undefined;
        onMouseOverCapture?: MouseEventHandler | undefined;
        onMouseOut?: MouseEventHandler | undefined;
        onMouseOutCapture?: MouseEventHandler | undefined;

        // --- Wheel Events ---
        onWheel?: WheelEventHandler | undefined;
        onWheelCapture?: WheelEventHandler | undefined;

        // --- Keyboard Events ---
        onKeyDown?: KeyboardEventHandler | undefined;
        onKeyDownCapture?: KeyboardEventHandler | undefined;
        onKeyUp?: KeyboardEventHandler | undefined;
        onKeyUpCapture?: KeyboardEventHandler | undefined;
        onKeyPress?: KeyboardEventHandler | undefined;
        onKeyPressCapture?: KeyboardEventHandler | undefined;

        // --- Focus Events ---
        onFocus?: FocusEventHandler | undefined;
        onFocusCapture?: FocusEventHandler | undefined;
        onBlur?: FocusEventHandler | undefined;
        onBlurCapture?: FocusEventHandler | undefined;
        onFocusIn?: FocusEventHandler | undefined;
        onFocusOut?: FocusEventHandler | undefined;

        // --- Touch Events ---
        onTouchStart?: TouchEventHandler | undefined;
        onTouchStartCapture?: TouchEventHandler | undefined;
        onTouchMove?: TouchEventHandler | undefined;
        onTouchMoveCapture?: TouchEventHandler | undefined;
        onTouchEnd?: TouchEventHandler | undefined;
        onTouchEndCapture?: TouchEventHandler | undefined;
        onTouchCancel?: TouchEventHandler | undefined;
        onTouchCancelCapture?: TouchEventHandler | undefined;

        // --- Drag Events ---
        onDragStart?: DragEventHandler | undefined;
        onDragStartCapture?: DragEventHandler | undefined;
        onDrag?: DragEventHandler | undefined;
        onDragCapture?: DragEventHandler | undefined;
        onDragEnd?: DragEventHandler | undefined;
        onDragEndCapture?: DragEventHandler | undefined;
        onDragEnter?: DragEventHandler | undefined;
        onDragEnterCapture?: DragEventHandler | undefined;
        onDragLeave?: DragEventHandler | undefined;
        onDragLeaveCapture?: DragEventHandler | undefined;
        onDragOver?: DragEventHandler | undefined;
        onDragOverCapture?: DragEventHandler | undefined;
        onDrop?: DragEventHandler | undefined;
        onDropCapture?: DragEventHandler | undefined;
    }

    interface Vector2D {
        x: number;
        y: number;
    }

    interface Margin {
        top: number;
        bottom: number;
        left: number;
        right: number;
    }

    interface Transform {
        translation: Vector2D;
        shear: Vector2D;
        scale: Vector2D;
        angle: number;
    }

    /**
     * Style properties of widget
     */
    interface Style {
        margin?: CssType.Property.Padding | undefined;
        padding?: CssType.Property.Padding | undefined;
        cursor?: CssType.Property.Cursor | undefined; // todo@Caleb196x: 替换成React的cursor定义
        justifySelf?: CssType.Property.JustifySelf | undefined;
        alignSelf?: CssType.Property.AlignSelf | undefined;
        width?: (string & {}) | number | undefined;
        height?: (string & {}) | number | undefined;
        maxWidth?: (string & {}) | number | undefined;
        maxHeight?: (string & {}) | number | undefined;
        minWidth?: (string & {}) | number | undefined;
        minHeight?: (string & {}) | number | undefined;
        aspectRatio?: (string & {}) | number | undefined;
        transform?: CssType.Property.Transform | undefined;
        translate?: CssType.Property.Translate | undefined;
        rotate?: CssType.Property.Rotate | undefined;
        opacity?: CssType.Property.Opacity | undefined;
        objectFit?: CssType.Property.ObjectFit | undefined;
        scale?: CssType.Property.Scale | undefined;
        visibility?: CssType.Property.Visibility | undefined;
        color?: CssType.Property.Color | undefined;
        gridRow?: CssType.Property.GridRow | undefined;
        gridColumn?: CssType.Property.GridColumn | undefined;
        autoSize?: boolean | undefined;
        zIndex?: CssType.Property.ZIndex | undefined;
        disable?: boolean | undefined;
        positionX?: (string & {}) | number | undefined;
        positionY?: (string & {}) | number | undefined;
        positionAnchor?: (string & {})| undefined;
        flex?: CssType.Property.Flex | undefined;
    }

    /**
     * Common properties of widget.
     * Extends EventHandlerProps so all widgets can receive DOM-like
     * mouse, keyboard, focus, touch, drag, and wheel events.
     */
    export interface CommonProps extends EventHandlerProps {
        toolTip?: string | undefined;
        title?: string | undefined;
        disable?: boolean | undefined;
        hitTest?: 'self-invisible' | 'self-children-invisible' | 'none' | undefined;
        volatil?: boolean | undefined;
        pixelSnapping?: boolean | undefined;
        style?: Style;
        clickMethod?: 'down-up' | 'down' | 'up' | 'precise-click' | undefined;
        touchMethod?: 'down-up' | 'down' | 'precise-tap' | undefined;
        pressMethod?: 'down-up' | 'press' | 'release' | undefined;
        /** Whether this widget can receive keyboard focus */
        focusable?: boolean | undefined;
        /** Tab index for focus ordering (lower values receive focus first) */
        tabIndex?: number | undefined;
        toolTipBinding?: () => string;
        titleBinding?: () => string;
        disableBinding?: () => boolean;
        visibilityBinding?: () => string;
    }

    /**
     * Panel widgets properties
     */
    export interface PanelProps extends CommonProps {
        children?: React.ReactNode;
        display?: CssType.Property.Display | undefined;
        flexDirection?: CssType.Property.FlexDirection | undefined;
        justifyContent?: CssType.Property.JustifyContent | undefined;
        alignItems?: CssType.Property.AlignItems | undefined;
        alignContent?: CssType.Property.AlignContent | undefined;
        overflow?: CssType.Property.Overflow | undefined;
        overflowX?: CssType.Property.OverflowX | undefined;
        overflowY?: CssType.Property.OverflowY | undefined;
        flexFlow?: CssType.Property.FlexFlow | undefined;
        gap?: CssType.Property.Gap | undefined;
        rowGap?: CssType.Property.RowGap | undefined;
        columnGap?: CssType.Property.ColumnGap | undefined;
        gridTemplateColumns?: CssType.Property.GridTemplateColumns | undefined;
        gridTemplateRows?: CssType.Property.GridTemplateRows | undefined;
        background?: CssType.Property.Background | undefined;
        backgroundImage?: CssType.Property.BackgroundImage | undefined;
        backgroundSize?: CssType.Property.BackgroundSize | undefined;
        backgroundPosition?: CssType.Property.BackgroundPosition | undefined;
        backgroundRepeat?: CssType.Property.BackgroundRepeat | undefined;
        backgroundAttachment?: CssType.Property.BackgroundAttachment | undefined;
        backgroundColor?: CssType.Property.BackgroundColor | undefined;
    }

    interface ResourceProps extends CommonProps {
        lazyLoad?: boolean | undefined;
    }

    interface OverlayProps extends PanelProps {
    }

    class Overlay extends React.Component<OverlayProps> {
        native: UE.Overlay;
        children: React.ReactNode;
    }

    interface ScaleBoxProps extends PanelProps {
        stretch?: 'contain' | 'cover' | 'fill' | 'scale-y' | 'scale-x' | 'custom';
        scale?: number;
    }

    class ScaleBox extends React.Component<ScaleBoxProps> {
        native: UE.ScaleBox;
        children: React.ReactNode;
    }

    interface UniformGridProps extends PanelProps {
        minCellSize?: RecursivePartial<Vector2D> | undefined;
        cellPadding?: RecursivePartial<Margin> |
                        CssType.Property.Padding | undefined;
    }

    class UniformGrid extends React.Component<UniformGridProps> {
        native: UE.UniformGridPanel;
        children: React.ReactNode;
    }

    interface InvalidationBoxProps extends PanelProps {
        cache?: boolean | undefined;
    }

    class InvalidationBox extends React.Component<InvalidationBoxProps> {
        native: UE.InvalidationBox;
        children: React.ReactNode;
    }

    interface RetainerBoxProps extends PanelProps {
        retainRender?: boolean | undefined;
        renderOnInvalidate?: boolean | undefined;
        renderOnPhase?: boolean | undefined;
        phase?: number | undefined;
        phaseCount?: number | undefined;
    }

    class RetainerBox extends React.Component<RetainerBoxProps> {
        native: UE.RetainerBox;
        children: React.ReactNode;
    }
    
    interface SafeZoneProps extends PanelProps {
        padLeft?: boolean | undefined;
        padRight?: boolean | undefined;
        padTop?: boolean | undefined;
        padBottom?: boolean | undefined;
    }

    class SafeZone extends React.Component<SafeZoneProps> {
        native: UE.SafeZone;
        children: React.ReactNode;
    }
    
    interface SizeBoxProps extends PanelProps {
        width?: (string & {}) | number | undefined;
        height?: (string & {}) | number | undefined;
        minWidth?: (string & {}) | number | undefined;
        minHeight?: (string & {}) | number | undefined;
        maxWidth?: (string & {}) | number | undefined;
        maxHeight?: (string & {}) | number | undefined;
        minAspectRatio?: (string & {}) | number | undefined;
        maxAspectRatio?: (string & {}) | number | undefined;
    }

    class SizeBox extends React.Component<SizeBoxProps> {
        native: UE.SizeBox;
        children: React.ReactNode;
    }

    interface OutlineSetting {
        cornerRadio?: RecursivePartial<Margin> | undefined;
        outlineColor?: CssType.Property.Color | undefined;
        width?: number | undefined;
        type?: 'fix-radius' | 'half-height-radius' | 'none' | undefined;
    }

    interface ImageStyle {
        image?: any | undefined;
        imageSize?: RecursivePartial<Vector2D> | undefined;
        color?: CssType.Property.Color | undefined;
        drawType?: 'box' | 'border' | 'image' | 'rounded-box' | 'none' | undefined;
        tiling?: CssType.Property.BackgroundRepeat | undefined;
        outline?: OutlineSetting | undefined;
        margin?: CssType.Property.Margin | undefined;
        padding?: CssType.Property.Padding | undefined;
    }

    interface FontStyle {
        fontSize?: number | undefined;
        fontColor?: CssType.Property.Color | undefined;
        fontFamily?: string | undefined;
        fontWeight?: string | undefined;
        fontStyle?: string | undefined;
        textShadow?: string | undefined;
        lineHeight?: number | undefined;
        letterSpacing?: number | undefined;
        wordSpacing?: number | undefined;
        whiteSpace?: 'normal' | 'nowrap' | 'pre' | 'pre-wrap' | 'pre-line' | undefined;
        outline?: string | undefined;
        outlineColor?: CssType.Property.Color | undefined;
        outlineWidth?: number | undefined;
        outlineOffset?: number | undefined;
        textAlign?: 'left' | 'center' | 'right' | undefined;
        textOverflow?: 'ellipsis' | 'clip' | 'none' | undefined;
        textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize' | undefined;
        textDecoration?: 'none' | 'underline' | 'overline' | 'line-through' | undefined;
        textDecorationColor?: CssType.Property.Color | undefined;
        textDecorationThickness?: number | undefined;
    }

    interface BorderProps extends PanelProps {
        contentColor?: CssType.Property.Color | undefined;
        contentHorizontalAlign?: 'left' | 'center' | 'right' | 'fill' | undefined;
        contentVerticalAlign?: 'top' | 'center' | 'bottom' | 'fill' | undefined;
        contentPadding?: CssType.Property.Padding | undefined;
        contentMargin?: CssType.Property.Margin | undefined;
        desiredSize?: RecursivePartial<Vector2D> | undefined;

        contentColorBinding?: () => CssType.Property.Color | undefined;
        backgroundColorBinding?: () => CssType.Property.Color | undefined;
        backgroundImageBinding?: () => ImageStyle | undefined;

        onMouseButtonDown?: () => void;
        onMouseButtonUp?: () => void;
        onMouseMove?: () => void;
        onMouseDoubleClick?: () => void;
    }

    class Border extends React.Component<BorderProps> {
        native: UE.Border;
        children: React.ReactNode;
    }

    interface SliderStyle {
        sliderBarColor?: CssType.Property.Color | undefined;
        sliderThumbColor?: CssType.Property.Color | undefined;

        barThickness?: number | undefined;
        normalBarBackground?: ImageStyle | undefined;
        hoverBarBackground?: ImageStyle | undefined;
        disabledBarBackground?: ImageStyle | undefined;
        normalThumbBackground?: ImageStyle | undefined;
        hoveredThumbBackground?: ImageStyle | undefined;
        disabledThumbBackground?: ImageStyle | undefined;
    }

    interface SliderCommonProps extends CommonProps {
        value?: number | undefined;
        stepSize?: number | undefined;

        locked?: boolean | undefined;
        useMouseStep?: boolean | undefined;
        controllerLock?: boolean | undefined;
        focusable?: boolean | undefined;
        sliderStyle?: SliderStyle | undefined;

        valueBinding?: () => number;
        onValueChanged?: (InValue: number) => void;
        onMouseCaptureBegin?: () => void;
        onMouseCaptureEnd?: () => void;
        onControllerCaptureBegin?: () => void;
        onControllerCaptureEnd?: () => void;
    }

    interface RadialSliderProps extends SliderCommonProps {
        defaultValue?: number | undefined;
        thumbStartAngle?: number | undefined;
        thumbEndPointAngle?: number | undefined;
        thumbAngularOffset?: number | undefined;

        showSliderThumb?: boolean | undefined;
        showSliderHand?: boolean | undefined;

        valueTags?: number[] | undefined;
        sliderProgressColor?: CssType.Property.Color | undefined;
        backgroundColor?: CssType.Property.Color | undefined;
    }

    class RadialSlider extends React.Component<RadialSliderProps> {
        native: UE.RadialSlider;
    }

    interface SliderProps extends SliderCommonProps {
        minValue?: number | undefined;
        maxValue?: number | undefined;
        indentHandle?: boolean | undefined;
        orientation?: 'horizontal' | 'vertical' | undefined;
    }

    class Slider extends React.Component<SliderProps> {
        native: UE.Slider;
    }
    
    interface SpinBoxProps extends PanelProps {
        value?: number | undefined;
        minValue?: number | undefined;
        maxValue?: number | undefined;
        minSliderValue?: number | undefined;
        maxSliderValue?: number | undefined;
        minFractionDigits?: number | undefined;
        maxFractionDigits?: number | undefined;
        useDeltaSnap?: boolean | undefined;
        enableSlider?: boolean | undefined;
        deltaValue?: number | undefined;
        sliderExponent?: number | undefined;
        minDesiredWidth?: number | undefined;
        clearKeyboardFocusOnCommit?: boolean | undefined;
        selectAllTextOnCommit?: boolean | undefined;

        keyboardType?: 'number' | 'web' | 'email' | 'password' | 'alpha-numberic' | undefined;
        textAlign?: 'left' | 'center' | 'right' | undefined;

        arrowBackground?: ImageStyle | undefined;
        normalBackground?: ImageStyle | undefined;
        activeBackground?: ImageStyle | undefined;
        hoveredBackground?: ImageStyle | undefined;
        activeFillBackground?: ImageStyle | undefined;
        hoveredFillBackground?: ImageStyle | undefined;
        inactiveFillBackground?: ImageStyle | undefined;
        textPadding?: CssType.Property.Padding | undefined;
        insetPadding?: CssType.Property.Padding | undefined;
        // todo@Caleb196x: 添加字体样式
        foregroundColor?: CssType.Property.Color | undefined;

        valueBinding?: () => number;
        onValueChanged?: (InValue: number) => void;
        onValueCommitted?: (InValue: number, CommitMethod: TextCommitType) => void;
        onBeginSliderMovement?: () => void;
        onEndSliderMovement?: (InValue: number) => void;
    }

    class SpinBox extends React.Component<SpinBoxProps> {
        native: UE.SpinBox;
        children: React.ReactNode;
    }

    interface CircularThrobberProps extends CommonProps {
        radius?: number | undefined;
        pieces?: number | undefined;
        period?: number | undefined;
        enableRadius?: boolean | undefined;
        image?: ImageStyle | undefined;
    }
    
    class CircularThrobber extends React.Component<CircularThrobberProps> {
        native: UE.CircularThrobber;
    }

    interface ThrobberProps extends CommonProps {
        pieces?: number | undefined;
        period?: number | undefined;
        animationHorizontal?: boolean | undefined;
        animationVertical?: boolean | undefined;
        animationOpacity?: boolean | undefined;
        image?: ImageStyle | undefined;
    }

    class Throbber extends React.Component<ThrobberProps> {
        native: UE.Throbber;
    }
    
    interface SpacerProps extends CommonProps {
        size?: RecursivePartial<Vector2D> | undefined;
    }

    class Spacer extends React.Component<SpacerProps> {
        native: UE.Spacer;
    }
    
    interface ExpandableAreaProps extends CommonProps {
        expanded?: boolean | undefined;
        maxHeight?: number | undefined;
        rolloutAnimationLasts?: number | undefined;
        // style
        headerPadding?: CssType.Property.Padding | undefined;
        areaPadding?: CssType.Property.Padding | undefined;

        collapsedIcon?: ImageStyle | undefined;
        expandedIcon?: ImageStyle | undefined;

        borderImage?: ImageStyle | undefined;
        borderColor?: CssType.Property.Color | undefined;

        // content
        header?: React.ReactNode | undefined;
        area?: React.ReactNode | undefined;
        onExpansionChanged?: (IsExpanded: boolean) => void;
    }

    class ExpandableArea extends React.Component<ExpandableAreaProps> {
        native: UE.ExpandableArea;
        header: React.ReactNode;
        area: React.ReactNode;
        SetHeaderContent(InContent: React.ReactNode | undefined): void;
        SetAreaContent(InContent: React.ReactNode | undefined): void;
    }
    
    interface ScrollBoxProps extends PanelProps {
        orientation?: 'horizontal' | 'vertical' | undefined;
        barThickness?: number | undefined;
        barPadding?: RecursivePartial<Margin> | undefined;
        alwaysShowBars?: boolean | undefined;
        alwaysShowBarTrack?: boolean | undefined;
        visibility?: CssType.Property.Visibility | undefined;
        allowDragging?: boolean | undefined;
        allowOverscroll?: boolean | undefined;
        navigationDestination?: 'into-view' | 'center' | 'top-left' | 'bottom-right' | undefined;
        barHorizontalBackground?: ImageStyle | undefined;
        barVerticalBackground?: ImageStyle | undefined;
        normalThumbBackground?: ImageStyle | undefined;
        hoveredThumbBackground?: ImageStyle | undefined;
        draggedThumbBackground?: ImageStyle | undefined;
        verticalTopSlotBackground?: ImageStyle | undefined;
        verticalBottomSlotBackground?: ImageStyle | undefined;
        horizontalLeftSlotBackground?: ImageStyle | undefined;
        horizontalRightSlotBackground?: ImageStyle | undefined;
    }

    class ScrollBox extends React.Component<ScrollBoxProps> {
        native: UE.ScrollBox;
        children: React.ReactNode;
    }

    interface ButtonProps extends PanelProps {
        textColor?: CssType.Property.Color | undefined;
        backgroundColor?: CssType.Property.Color | undefined;

        hoveredBackground?: ImageStyle | undefined;
        pressedBackground?: ImageStyle | undefined;
        disabledBackground?: ImageStyle | undefined;

        normalPadding?: CssType.Property.Padding | undefined;
        pressedPadding?: CssType.Property.Padding | undefined;

        pressedSound?: any | undefined;
        hoveredSound?: any | undefined;

        focusable?: boolean | undefined;
        // event
        onClick?: () => void;
        onPressed?: () => void;
        onReleased?: () => void;
        onHovered?: () => void;
        onUnhovered?: () => void;
    }

    class Button extends React.Component<ButtonProps> {
        native: UE.Button;
        children: React.ReactNode;
    }

    type comboBoxItemSelectionType = 'key-press' | 'navigation' | 'mouse-click' | 'direct' | 'default';
    interface ComboBoxStyle {
        rowPadding?: CssType.Property.Padding | undefined;
        contentPadding?: CssType.Property.Padding | undefined;
        pressedSound?: any | undefined;
        selectionChangeSound?: any | undefined;

        backgroundImage?: ImageStyle | undefined;
        hoveredBackgroundImage?: ImageStyle | undefined;
        pressedBackgroundImage?: ImageStyle | undefined;
        disabledBackgroundImage?: ImageStyle | undefined;

        downArrowBackground?: ImageStyle | undefined;
        downArrowPadding?: CssType.Property.Padding | undefined;
        downArrowAlign?: CssType.Property.AlignSelf | undefined;
    }

    interface ComboBoxItemStyle {
        textColor?: CssType.Property.Color | undefined;
        selectedTextColor?: CssType.Property.Color | undefined;

        focusedBackground?: ImageStyle | undefined;
        activeBackground?: ImageStyle | undefined;
        activeHoveredBackground?: ImageStyle | undefined;
        inactiveBackground?: ImageStyle | undefined;
        inactiveHoveredBackground?: ImageStyle | undefined;

        menuRowBackground?: ImageStyle | undefined;
        evenMenuRowBackground?: ImageStyle | undefined;
        oddMenuRowBackground?: ImageStyle | undefined;
    }

    interface comboBoxScollBarStyle {
        thickness?: number | undefined;
        horizontalBackground?: ImageStyle | undefined;
        verticalBackground?: ImageStyle | undefined;
        normalThumb?: ImageStyle | undefined;
        hoveredThumb?: ImageStyle | undefined;
        draggedThumb?: ImageStyle | undefined;
    }

    interface ComboBoxProps extends CommonProps {
        options?: string[] | undefined;
        selectedOption?: string | undefined;
        contentPadding?: CssType.Property.Padding | undefined;
        maxListHeight?: number | undefined;
        hasDownArrow?: boolean | undefined;
        enableGamepadNavigation?: boolean | undefined;

        comboBoxStyle?: ComboBoxStyle | undefined;
        itemStyle?: ComboBoxItemStyle | undefined;
        scrollBarStyle?: comboBoxScollBarStyle | undefined;
        
        // todo@Caleb196x: 添加字体font

        // events
        onOpened?: () => void;
        onSelectionChanged?: (item: string, selectionType: comboBoxItemSelectionType) => void;
    }

    class ComboBox extends React.Component<ComboBoxProps> {
        native: UE.ComboBoxString;
    }

    interface CheckBoxProps extends CommonProps {
        checked?: boolean | undefined;
        type?: 'checkbox' | 'toggle' | 'default' | undefined;
        padding?: CssType.Property.Padding | undefined;
        color?: CssType.Property.Color | undefined;
        uncheckedBackground?: ImageStyle | undefined;
        uncheckedHoveredBackground?: ImageStyle | undefined;
        uncheckedPressedBackground?: ImageStyle | undefined;
        checkedBackground?: ImageStyle | undefined;
        checkedHoveredBackground?: ImageStyle | undefined;
        checkedPressedBackground?: ImageStyle | undefined;
        undeterminedBackground?: ImageStyle | undefined;
        undeterminedHoveredBackground?: ImageStyle | undefined;
        undeterminedPressedBackground?: ImageStyle | undefined;
        normalBackground?: ImageStyle | undefined;
        normalHoveredBackground?: ImageStyle | undefined;
        normalPressedBackground?: ImageStyle | undefined;

        checkSound?: any | undefined;
        uncheckSound?: any | undefined;
        hoveredSound?: any | undefined;

        // events
        checkStateBinding?: () => boolean;
        onCheckStateChanged?: (InChecked: boolean) => void;
    }

    class CheckBox extends React.Component<CheckBoxProps> {
        native: UE.CheckBox;
    }

    /**
     * ProgressBar components
     */
    type ProgressBarType = 'left-to-right' | 'right-to-left' 
                            | 'top-to-bottom' | 'bottom-to-top' | 'fill-from-center'
                            | 'fill-from-center-x' | 'fill-from-center-y' | 'default';
    interface ProgressBarProps extends CommonProps {
        precent?: number | undefined;
        barType?: ProgressBarType | undefined;
        isMarquee?: boolean | undefined;
        enableFillAnimation?: boolean | undefined;
        fillColor?: CssType.Property.Color | undefined;

        background?: ImageStyle | undefined;
        fillBackground?: ImageStyle | undefined;
        marqueeBackground?: ImageStyle | undefined;

        precentBinding?: () => number;
        fillColorBinding?: () => CssType.Property.Color;
    }

    class ProgressBar extends React.Component<ProgressBarProps> {
        native: UE.ProgressBar;
    }

    /**
     * ListView: scrollable list of React children with item spacing and orientation.
     * Built on UScrollBox for natural React reconciler compatibility.
     */
    interface ListViewProps extends PanelProps {
        /** Scroll direction: 'vertical' (default) or 'horizontal' */
        orientation?: 'vertical' | 'horizontal' | undefined;
        /** Spacing between list items in pixels or CSS length */
        spacing?: number | string | undefined;
        /** Scrollbar thickness in pixels */
        barThickness?: number | undefined;
        /** Whether to show the scrollbar */
        showScrollbar?: boolean | undefined;
        /** Always keep scrollbar visible */
        alwaysShowScrollbar?: boolean | undefined;
        /** Allow overscroll bounce */
        allowOverscroll?: boolean | undefined;
        /** Whether the list can receive focus */
        focusable?: boolean | undefined;
        /** Background brush for the list area */
        backgroundBrush?: ImageStyle | undefined;
        /** Scroll position changed callback */
        onScroll?: (offset: number) => void;
    }

    class ListView extends React.Component<ListViewProps> {
        native: UE.ScrollBox;
        children: React.ReactNode;
    }

    /**
     * TreeView: scrollable container for hierarchical expandable/collapsible content.
     * Express tree structure by nesting TreeViewItem components.
     */
    interface TreeViewProps extends PanelProps {
        /** Scroll direction: 'vertical' (default) or 'horizontal' */
        orientation?: 'vertical' | 'horizontal' | undefined;
        /** Pixels of indentation per depth level (default: 16) */
        indentation?: number | string | undefined;
        /** Spacing between sibling tree nodes */
        spacing?: number | string | undefined;
        /** Scrollbar thickness in pixels */
        barThickness?: number | undefined;
        /** Whether to show the scrollbar */
        showScrollbar?: boolean | undefined;
        /** Always keep scrollbar visible */
        alwaysShowScrollbar?: boolean | undefined;
        /** Allow overscroll bounce */
        allowOverscroll?: boolean | undefined;
        /** Whether the tree can receive focus */
        focusable?: boolean | undefined;
    }

    class TreeView extends React.Component<TreeViewProps> {
        native: UE.ScrollBox;
        children: React.ReactNode;
    }

    /**
     * TreeViewItem: a single node in a TreeView hierarchy.
     * Nest items inside other items to express parent-child relationships.
     */
    interface TreeViewItemProps extends PanelProps {
        /** Depth level for indentation (0 = root, 1 = first child, etc.) */
        depth?: number | undefined;
        /** Override indentation pixels per level */
        indentation?: number | undefined;
        /** Whether this item's children are currently expanded (for conditional rendering) */
        expanded?: boolean | undefined;
    }

    class TreeViewItem extends React.Component<TreeViewItemProps> {
        native: UE.VerticalBox;
        children: React.ReactNode;
    }

    /**
     * TileView: wrapping grid of equally-sized tile children.
     * Built on UWrapBox with optional ScrollBox wrapper for scrollable grids.
     */
    interface TileViewProps extends PanelProps {
        /** Width of each tile entry in pixels or CSS length */
        entryWidth?: number | string | undefined;
        /** Height of each tile entry in pixels or CSS length */
        entryHeight?: number | string | undefined;
        /** Alias for entryWidth */
        tileWidth?: number | string | undefined;
        /** Alias for entryHeight */
        tileHeight?: number | string | undefined;
        /** Spacing between tiles (applies to both axes) */
        spacing?: number | string | undefined;
        /** Horizontal gap between tiles */
        horizontalSpacing?: number | string | undefined;
        /** Vertical gap between tiles */
        verticalSpacing?: number | string | undefined;
        /** Tile alignment: 'left' | 'center' | 'right' | 'fill' */
        tileAlignment?: 'left' | 'center' | 'right' | 'fill' | undefined;
        /** Wrap direction: 'horizontal' (default) or 'vertical' */
        orientation?: 'horizontal' | 'vertical' | undefined;
        /** Wrap in a ScrollBox for scrollable tile grids */
        scrollable?: boolean | undefined;
        /** Enable scrolling (alias for scrollable) */
        enableScrolling?: boolean | undefined;
        /** Scrollbar thickness when scrollable */
        barThickness?: number | undefined;
        /** Whether to show scrollbar when scrollable */
        showScrollbar?: boolean | undefined;
    }

    class TileView extends React.Component<TileViewProps> {
        native: UE.WrapBox;
        children: React.ReactNode;
    }

    /** TileViewItem is just a standard panel child within a TileView */
    interface TileViewItemProps extends PanelProps {
    }

    class TileViewItem extends React.Component<TileViewItemProps> {
        children: React.ReactNode;
    }

    /**
     * Animation components
     */
    interface SpineProps extends ResourceProps {
        initSkin?: string | undefined;
        initAnimation?: string | undefined;
        atlas?: string | undefined;
        skel?: string | undefined;
        color?: CssType.Property.Color | undefined;

        onBeforeUpdateWorldTransform?: () => void;
        onAfterUpdateWorldTransform?: () => void;
        onAnimationStart?: (track: string) => void;
        onAnimationEnd?: (track: string) => void;
        onAnimationComplete?: (track: string) => void;
        onAnimationEvent?: (track: string) => void;
        onAnimationInterrupt?: (track: string) => void;
        onAnimationDispose?: (track: string) => void;
    }
 
    class Spine extends React.Component<SpineProps> {
        native: UE.SpineWidget;
    }

    interface RiveProps extends ResourceProps {
        rive?: string | undefined;
        initStateMachine?: string | undefined;
        artBoard?: string | undefined;
        artBoardIndex?: number | undefined;
        fitType?: 'contain' | 'cover' | 'fill' | 'fit-width' | 'fit-height' | 'none' | 'scale-down' | 'layout' | undefined;
        scale?: number | undefined;
        alignment?: 'top-left' | 'top-center' | 'top-right' | 'center-left' | 'center' | 'center-right' | 'bottom-left' | 'bottom-center' | 'bottom-right' | undefined;

        onRiveReady?: () => void;
        onRiveNamedEvent?: (eventName: string) => void;
    }

    interface ViewportProps extends PanelProps {
    }

    class Viewport extends React.Component<ViewportProps> {
        native: UE.Viewport;
		children: React.ReactNode;
    }

    class Rive extends React.Component<RiveProps> {}
    interface Root {
        removeFromViewport() : void;
        getWidget(): any;
    }

    interface TReactorUMG {
        render(coreWidget: any, element: React.ReactElement) : Root;
        init(coreWidget: any) : void;
        release() : void;

        /**
         * Routes a keyboard event from the C++ widget into the React event system.
         * Call from ReactorUIWidget's OnKeyDown/OnKeyUp overrides.
         * 
         * @param eventType "keydown" or "keyup"
         * @param keyEvent  The native UE.KeyEvent
         * @param repeat    Whether this is a repeated key press
         */
        routeKeyEvent(eventType: string, keyEvent: any, repeat?: boolean): void;

        /**
         * Routes a Tab key press for focus navigation.
         * Returns true if focus was moved (caller should consume the event).
         * 
         * @param shiftHeld True if Shift+Tab (reverse navigation)
         */
        routeTabKey(shiftHeld: boolean): boolean;
    }

    var ReactorUMG : TReactorUMG;
}

declare function getCssStyleFromGlobalCache(className: string, pseudo?: string, mediaQuery?: string | null): Record<string, any> | undefined;
