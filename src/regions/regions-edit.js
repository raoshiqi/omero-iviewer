// js
import Context from '../app/context';
import Misc from '../utils/misc';
import {Utils} from '../utils/regions';
import {Converters} from '../utils/converters';
import {REGIONS_MODE} from '../utils/constants';
import {
    REGIONS_COPY_SHAPES, REGIONS_GENERATE_SHAPES,
    REGIONS_MODIFY_SHAPES, REGIONS_SET_PROPERTY
} from '../events/events';
import {inject, customElement, bindable, BindingEngine} from 'aurelia-framework';
import {spectrum} from 'spectrum-colorpicker';

/**
 * Represents the regions section in the right hand panel
 */
@customElement('regions-edit')
@inject(Context, Element, BindingEngine)
export default class RegionsEdit {
    /**
     *a bound reference to regions_info
     * @memberof RegionsEdit
     * @type {RegionsEdit}
     */
    @bindable regions_info = null;

    /**
     * a list of keys we want to listen for
     * @memberof RegionsEdit
     * @type {Object}
     */
    key_actions = [
        { key: 65, func: this.selectAllShapes},                     // ctrl - a
        { key: 67, func: this.copyShapes},                          // ctrl - c
        { key: 86, func: this.pasteShapes}                          // ctrl - v
    ];

    /**
     * @memberof RegionsEdit
     * @type {Object}
     */
    last_selected = null;

    /**
     * the list of observers
     * @memberof RegionsEdit
     * @type {Array.<Object>}
     */
    observers = [];

    /**
     * @constructor
     * @param {Context} context the application context (injected)
     * @param {Element} element the associated dom element (injected)
     * @param {BindingEngine} bindingEngine the BindingEngine (injected)
     */
    constructor(context, element, bindingEngine) {
        this.context = context;
        this.element = element;
        this.bindingEngine = bindingEngine;
    }

    /**
     * Overridden aurelia lifecycle method:
     * called whenever the view is bound within aurelia
     * in other words an 'init' hook that happens before 'attached'
     *
     * @memberof RegionsEdit
     */
    bind() {
        this.registerObservers();
    }

    /**
     * Overridden aurelia lifecycle method:
     * called whenever the view is unbound within aurelia
     * in other words a 'destruction' hook that happens after 'detached'
     *
     * @memberof RegionsEdit
     */
    unbind() {
        this.unregisterObservers();
    }

    /**
     * Overridden aurelia lifecycle method:
     * fired when PAL (dom abstraction) is ready for use
     *
     * @memberof RegionsEdit
     */
    attached() {
        // register key listeners
        this.key_actions.map(
            (action) =>
                this.context.addKeyListener(
                    action.key,
                        (event) => {
                            if (!this.context.show_regions ||
                                    !event.ctrlKey) return;
                            action.func.apply(this, action.args);
                        }));

        // set up ui widgets such as color pickers and spinners
        let strokeOptions = this.getColorPickerOptions(false);
        let strokeSpectrum =
            $(this.element).find(".shape-stroke-color .spectrum-input");
        strokeSpectrum.spectrum(strokeOptions);
        let fillOptions = this.getColorPickerOptions(true);
        let fillSpectrum =
            $(this.element).find(".shape-fill-color .spectrum-input");
        fillSpectrum.spectrum(fillOptions);

        let strokeWidthSpinner =
            $(this.element).find(".shape-stroke-width input");
        strokeWidthSpinner.spinner({
            min: 0, disabled: true});
        strokeWidthSpinner.spinner("value", 1);

        let editComment = $(this.element).find(".shape-edit-comment input");
        editComment.prop("disabled", true);
        editComment.addClass("disabled-color");
        let fontSizeSpinner =
            $(this.element).find(".shape-font-size input");
        fontSizeSpinner.spinner({min: 1, disabled: true});
        fontSizeSpinner.spinner("value", 10);

        let shapeAttachments =
            $(this.element).find(".shape-edit-attachments").children();
        shapeAttachments.addClass("disabled-color");
        shapeAttachments.filter('input').prop("disabled", true);
    }

     /**
      * Handles fill/stroke color changes
      *
      * @param {string} color a color in rgba notation
      * @param {boolean} fill the fill color if true, the stroke color otherwise
      * @param {Object} shape the primary shape that the change was invoked on
      * @memberof RegionsEdit
      */
     onColorChange(color, fill=true, shape=null) {
         if (typeof shape !== 'object' || shape === null) return;
         if (typeof fill !== 'boolean') fill = true;

         let deltaProps = {type: shape.type};
         let properties =
             fill ? ['fillColor', 'fillAlpha'] : ['strokeColor', 'strokeAlpha'];
         let values = Converters.rgbaToHexAndAlpha(color);
         if (!Misc.isArray(values) || values.length !== 2) return;

         for (let i=0;i<properties.length;i++)
             deltaProps[properties[i]] = values[i];

         this.modifyShapes(
             deltaProps, this.createUpdateHandler(properties, values));

        this.setDrawColors(color, fill);
     }

     /**
      * Sets default fill/stroke color for drawing
      *
      * @param {string} color a color in rgba notation
      * @param {boolean} fill the fill color if true, the stroke color otherwise
      * @memberof RegionsEdit
      */
     setDrawColors(color, fill=true) {
         if (typeof fill !== 'boolean') fill = true;

         let values = Converters.rgbaToHexAndAlpha(color);
         if (!Misc.isArray(values) || values.length !== 2) return;

         if (fill) {
             this.regions_info.shape_defaults['fillColor'] = values[0];
             this.regions_info.shape_defaults['fillAlpha'] = values[1];
         } else {
             this.regions_info.shape_defaults['strokeColor'] = values[0];
             this.regions_info.shape_defaults['strokeAlpha'] = values[1];
         }
     }

    /**
     * Handles stroke width changes
     *
     * @param {number} width the new stroke width
     * @param {Object} shape the primary shape that the change was invoked on
     * @memberof RegionsEdit
     */
    onStrokeWidthChange(width = 10,shape=null) {
        if (typeof shape !== 'object' || shape === null) return;
        if (typeof width !== 'number' || isNaN(width) || width < 0) return;

        let deltaProps = {type: shape.type};
        deltaProps.strokeWidth = width;

        this.modifyShapes(
            deltaProps, this.createUpdateHandler(['strokeWidth'], [width]));
    }

    /**
     * Handles font size changes
     *
     * @param {number} size the new font size
     * @param {Object} shape the primary shape that the change was invoked on
     * @memberof RegionsEdit
     */
    onFontSizeChange(size = 10,shape=null) {
        if (typeof shape !== 'object' || shape === null) return;
        if (typeof size !== 'number' || isNaN(size) || size < 1) return;

        let deltaProps = {type: shape.type};
        deltaProps.fontStyle =
            typeof shape.fontStyle === 'string' ? shape.fontStyle : 'normal';
        deltaProps.fontFamily =
            typeof shape.fontFamily === 'string' ?
                shape.fontFamily : 'sans-serif';
        deltaProps.fontSize = size;

        this.modifyShapes(
            deltaProps, this.createUpdateHandler(
                ['fontSize', 'fontStyle', 'fontFamily'],
                [size, deltaProps.fontStyle, deltaProps.fontFamily]));
    }

    /**
     * Handles comment changes
     *
     * @param {string} comment the new  text  value
     * @param {Object} shape the primary shape that the change was invoked on
     * @memberof RegionsEdit
     */
    onCommentChange(comment = '',shape=null) {
        if (typeof shape !== 'object' || shape === null) return;
        if (typeof comment !== 'string') return;

        let deltaProps = {type: shape.type};
        deltaProps.textValue = comment;

        this.modifyShapes(
            deltaProps,
            this.createUpdateHandler(['textValue'], [comment]));
    }

    /**
     * Runs checks for an attachment input field and its associated value
     *
     * @param {Element} input the attachment input field element
     * @param {boolean} reset if true we reset to the present attachment
     * @return {number} returns input value or -1 if value was erroneous
     */
    checkAttachmentInput(input, reset=false) {
        let dim = input.attr("dim");
        let dims = this.regions_info.image_info.dimensions;
        let presentValue = dims[dim] + 1;

        // input value check
        let value = input.val().replace(/\s/g, "");
        if (value === "") {
            if (reset) input.val(presentValue);
            return -1;
        }
        value = parseInt(value);
        if (isNaN(value)) {
            if (reset) input.val(presentValue);
            return -1;
        }

        // bounds check
        if (value < 1 || value > dims['max_' + dim]) {
            if (reset) input.val(presentValue);
            return -1;
        }

        // index for user starts with 1, internally we start at 0
        return value-1;
    }

    /**
     * Handles fill/stroke color changes
     *
     * @param {number} value the new attachment value
     * @param {string} dim the dimension we attach to
     * @param {Object} shape the primary shape that the change was invoked on
     * @memberof RegionsEdit
     */
    onAttachmentChange(value, dim = 't', shape = null) {
        if (typeof value !== 'number' ||
            typeof shape !== 'object' || shape === null) return;

        let prop = 'the' + dim.toUpperCase();
        let deltaProps = { type: shape.type };
        deltaProps[prop] = value;

        this.modifyShapes(
            deltaProps, this.createUpdateHandler([prop], [value], true), true);
    }

    /**
     * Notifies the viewer to change the shaape according to the new shape
     * definition
     *
     * @param {Object} shape_definition the object definition incl. attributes
     *                                  to be changed
     * @param {function} callback a callback function on success
     * @param {boolean} modifies_attachment does definition alter z/t attachment
     * @memberof RegionsEdit
     */
    modifyShapes(shape_definition, callback = null, modifies_attachment = false) {
        if (typeof shape_definition !== 'object' ||
                shape_definition === null) return;

        this.context.publish(
           REGIONS_MODIFY_SHAPES, {
               config_id: this.regions_info.image_info.config_id,
               shapes: this.regions_info.selected_shapes,
               modifies_attachment: modifies_attachment,
               definition: shape_definition,
                callback: callback});
    }

    /**
     * Registers observers to watch the selected shapes and whether we
     * are presently drawing for the purpose of adjusting
     * the fill and line color options
     *
     * @memberof RegionsEdit
     */
    registerObservers() {
        this.unregisterObservers();

        let createObservers = () => {
            this.observers.push(
                this.bindingEngine.collectionObserver(
                    this.regions_info.selected_shapes)
                        .subscribe(
                            (newValue, oldValue) => {
                                if (this.regions_info.shape_to_be_drawn === null &&
                                    this.regions_info.selected_shapes.length === 0)
                                        this.regions_info.shape_defaults = {};
                                this.adjustEditWidgets();
                            }));
            this.observers.push(
                this.bindingEngine.propertyObserver(
                    this.regions_info, 'shape_to_be_drawn')
                        .subscribe(
                            (newValue, oldValue) => {
                                if (oldValue !== null && newValue === null)
                                    this.regions_info.shape_defaults = {};
                                this.adjustEditWidgets();
                            }));
        };
        if (this.regions_info === null) {
            this.observers.push(
                this.bindingEngine.propertyObserver(this, 'regions_info')
                    .subscribe((newValue, oldValue) => {
                        if (oldValue === null && newValue) {
                            this.unregisterObservers();
                            createObservers();
                    }}));
        } else createObservers();
    }

    /**
     * Unregisters all observers
     *
     * @memberof RegionsEdit
     */
    unregisterObservers() {
        this.observers.map((o) => {
            if (o) o.dispose();
        });
        this.observers = [];
    }

    /**
     * Selects all shapes
     *
     * @memberof RegionsEdit
     */
    selectAllShapes() {
        let ids = this.regions_info.unsophisticatedShapeFilter();
        this.context.publish(
           REGIONS_SET_PROPERTY, {
               config_id: this.regions_info.image_info.config_id,
               property: 'selected',
               shapes : ids, clear: true,
               value : true, center : false});
    }

    /**
     * Overridden aurelia lifecycle method:
     * called when the view and its elemetns are detached from the PAL
     * (dom abstraction)
     *
     * @memberof RegionsEdit
     */
    detached() {
        this.key_actions.map(
            (action) => this.context.removeKeyListener(action.key));
         $(this.element).find(".spectrum-input").spectrum("destroy");
         $(this.element).find(".shape-stroke-width input").spinner("destroy");
    }

    /**
     * Reacts to shape selections, adjusting the edit widgets accordingly
     *
     * @memberof RegionsEdit
     */
    adjustEditWidgets() {
        let ids = this.regions_info.getLastSelectedShapeIds();
        let roi = ids !== null ? this.regions_info.data.get(ids.roi_id) : null;
        this.last_selected = roi ? roi.shapes.get(ids.shape_id) : null;
        let type =
            this.last_selected ? this.last_selected.type.toLowerCase() : null;

        // COMMENT
        let editComment = $(this.element).find(".shape-edit-comment input");
        editComment.off('input');
        editComment.val('Comment');
        if (this.last_selected) {
            editComment.prop("disabled", false);
            editComment.removeClass("disabled-color");
            editComment.val(
                typeof this.last_selected.textValue === 'string' ?
                    this.last_selected.textValue : '');
            editComment.on('input',
                (event) =>
                    this.onCommentChange(event.target.value, this.last_selected));
        } else {
            editComment.prop("disabled", true);
            editComment.addClass("disabled-color");
        }
        // FONT SIZE
        let fontSize =
            this.last_selected ?
                (typeof this.last_selected.fontSize === 'number' ?
                this.last_selected.fontSize : 10) : 10;
        let fontSizeSpinner = $(this.element).find(".shape-font-size input");
        fontSizeSpinner.off("input spinstop");
        fontSizeSpinner.spinner("value", fontSize);
        if (this.last_selected) {
            fontSizeSpinner.spinner("enable");
            fontSizeSpinner.on("input spinstop",
               (event, ui) => this.onFontSizeChange(
                   parseInt(event.target.value), this.last_selected));
        } else fontSizeSpinner.spinner("disable");

        // DIMENSION ATTACHMENT
        let dims = this.regions_info.image_info.dimensions;
        if (dims.max_t > 1 || dims.max_z > 1) {
            let shapeAttachments =
                $(this.element).find(".shape-edit-attachments").children();
            shapeAttachments.addClass("disabled-color");
            let shapeAttachmentsInput = shapeAttachments.filter('input');
            let shapeAttachmentsTextInput =
                shapeAttachmentsInput.filter('[type="text"]');
            let shapeAttachmentsRadioInput =
                shapeAttachmentsInput.filter('[type="radio"]');
            shapeAttachmentsInput.prop("disabled", true);
            shapeAttachmentsInput.off();
            shapeAttachmentsInput.val('');

            if (this.last_selected) {
                // enable
                shapeAttachmentsInput.prop("disabled", false);
                shapeAttachments.removeClass("disabled-color");
                // initialize attachments of last selected shape
                ['t', 'z'].map(
                    (d) => {
                        let prop = 'the' + d.toUpperCase();
                        let unattached = this.last_selected[prop] === -1;
                        let filter = "[dim='" + d + "']";
                        shapeAttachmentsRadioInput.filter(
                            filter)[unattached ? 1 : 0].checked = "checked";
                        shapeAttachmentsTextInput.filter(filter).val(
                            unattached ?
                            this.regions_info.image_info.dimensions[d] + 1 :
                            this.last_selected[prop] + 1);
                });

                // set up various event handlers for attachment changes
                // both for radio buttons (attached/unattached) state as well as
                // the actual text input changes plus a focus handler for
                // toggling the attached state if we click into the input field
                let checkAttachmentInput0 =
                    (event, reset = false) => {
                        let dim = event.target.getAttribute('dim');
                        let respectiveTextInput =
                            shapeAttachmentsTextInput.filter('[dim="' + dim + '"]');
                        return this.checkAttachmentInput(respectiveTextInput, reset);
                    };
                shapeAttachmentsTextInput.on('focus',
                    (event) => {
                        let radioSelector =
                            '[name="shape-edit-attachments-' +
                            event.target.getAttribute('dim') + '"]';
                        let respectiveRadioInput =
                            shapeAttachmentsInput.filter(radioSelector);
                        if (!respectiveRadioInput[0].checked)
                            respectiveRadioInput[0].click();
                    });
                // reset on blur (if check of input value check fails)
                shapeAttachmentsTextInput.on('blur',
                    (event) => checkAttachmentInput0(event, true));
                // change attachment value (if input value check succeeds)
                shapeAttachmentsTextInput.on('change keyup',
                    (event) => {
                        if (event.type === 'keyup' && event.keyCode !== 13) return;
                        let dim = event.target.getAttribute('dim');
                        let value = checkAttachmentInput0(event);
                        if (value >= 0)
                            this.onAttachmentChange(value, dim, this.last_selected);
                    });
                // change between un/attached states
                shapeAttachmentsRadioInput.on('change',
                    (event) => {
                        if (!event.target.checked) return;
                        let attached =
                            event.target.getAttribute('attached') === 'attached';
                        let dim = event.target.getAttribute('dim');
                        let value = -1
                        if (attached) {
                            // we switched to attached => check present input value
                            value = checkAttachmentInput0(event);
                            let respectiveTextInput =
                                shapeAttachmentsTextInput.filter(
                                    '[dim="' + dim + '"]');
                            if (value === -1) // we fetch the reset value
                                value = parseInt(respectiveTextInput.val())-1;
                            setTimeout(() => respectiveTextInput.focus(), 50);
                        }
                        this.onAttachmentChange(value, dim, this.last_selected);
                    });
            }
        }

        // STROKE COLOR & WIDTH
        let strokeOptions =
            this.getColorPickerOptions(false, this.last_selected);
        let strokeSpectrum =
            $(this.element).find(".shape-stroke-color .spectrum-input");
        let strokeWidthSpinner =
            $(this.element).find(".shape-stroke-width input");
        let strokeColor =
            this.last_selected ?
                this.last_selected.strokeColor :
                typeof this.regions_info.shape_defaults.strokeColor === 'string' ?
                    this.regions_info.shape_defaults.strokeColor : '#0099FF';
        let strokeAlpha =
            this.last_selected ?
                this.last_selected.strokeAlpha :
                typeof this.regions_info.shape_defaults.strokeAlpha === 'number' ?
                this.regions_info.shape_defaults.strokeAlpha : 0.9;
        let strokeWidth =
            this.last_selected ?
                (typeof this.last_selected.strokeWidth === 'number' ?
                    this.last_selected.strokeWidth : 1) : 1;
        if ((type === 'line' || type === 'polyline') && strokeWidth === 0)
            strokeWidth = 1;
        strokeOptions.color =
            Converters.hexColorToRgba(strokeColor, strokeAlpha);
        strokeSpectrum.spectrum(strokeOptions);
        // STROKE width
        strokeWidthSpinner.off("input spinstop");
        strokeWidthSpinner.spinner("value", strokeWidth);
        if (this.regions_info.shape_to_be_drawn === null)
            strokeSpectrum.spectrum("enable");
        if (this.last_selected) {
            strokeWidthSpinner.spinner("enable");
            strokeWidthSpinner.on("input spinstop",
               (event, ui) => this.onStrokeWidthChange(
                   parseInt(event.target.value), this.last_selected));
        } else strokeWidthSpinner.spinner("disable");
        this.setDrawColors(strokeOptions.color, false);

        // ARROW
        let arrowButton = $(this.element).find(".arrow-button button");
        if (type && type.indexOf('line') >= 0) {
            arrowButton.prop('disabled', false);
            arrowButton.removeClass('disabled-color');
            $('.marker_start').html(
                typeof this.last_selected['markerStart'] === 'string' &&
                    this.last_selected['markerStart'] === 'Arrow' ?
                        '&#10003;' : '&nbsp;');
            $('.marker_end').html(
                typeof this.last_selected['markerEnd'] === 'string' &&
                    this.last_selected['markerEnd'] === 'Arrow' ?
                        '&#10003;' : '&nbsp;');
        } else {
            arrowButton.prop('disabled', true);
            arrowButton.addClass('disabled-color');
        }

        // FILL COLOR
        let fillOptions = this.getColorPickerOptions(true, this.last_selected);
        let fillSpectrum =
            $(this.element).find(".shape-fill-color .spectrum-input");
        let fillColor =
            this.last_selected ?
                this.last_selected.fillColor :
                typeof this.regions_info.shape_defaults.fillColor === 'string' ?
                    this.regions_info.shape_defaults.fillColor : '#FFFFFF';
        let fillAlpha =
            this.last_selected ?
                this.last_selected.fillAlpha :
                typeof this.regions_info.shape_defaults.fillAlpha === 'number' ?
                    this.regions_info.shape_defaults.fillAlpha : 0.5;
        fillOptions.color = Converters.hexColorToRgba(fillColor, fillAlpha);
        fillSpectrum.spectrum(fillOptions);
        // set fill (if not disabled)
        let fillDisabled =
            this.regions_info.shape_to_be_drawn !== null ||
                type === 'line' || type === 'polyline' || type === 'label';
        if (fillDisabled) {
            //fillOptions.color = 'rgba(255, 255, 255, 0)';
            //fillSpectrum.spectrum(fillOptions);
            fillSpectrum.spectrum("disable");
            return;
        }
        this.setDrawColors(fillOptions.color, true);
        fillSpectrum.spectrum("enable");
    }

    /**
     * Gets the appropriate color picker options for the given needs
     *
     * @memberof RegionsEdit
     * @param {boolean} fill true if we want fill color options, otherwise stroke
     * @param {Object} shape the last selection to be used for the change handler
     * @private
     */
    getColorPickerOptions(fill=true, shape=null) {
        let options =  {
            disabled: this.regions_info === null ||
                      this.regions_info.shape_to_be_drawn !== null,
            color: fill ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 153, 255, 0.7)',
            showInput: true,
            showAlpha: true,
            showInitial: true,
            preferredFormat: "rgb",
            containerClassName: 'color-spectrum-container',
            replacerClassName:
                fill ? 'shape-fill-color-replacer' :
                        'shape-stroke-color-replacer',
            appendTo: fill ?
                $(this.element).find('.shape-fill-color') :
                $(this.element).find('.shape-stroke-color')
        };
        if (shape)
            options.change =
                (color) => this.onColorChange(color.toRgbString(), fill, shape);
        else options.change =
            (color) => this.setDrawColors(color.toRgbString(), fill);

        return options;
    }

    /**
     * Toggles if line has an arrow
     *
     * @param {boolean} head if true we append arrow at head, otherwise tail
     * @memberof RegionsEdit
     */
    toggleArrow(head=true) {
        if (this.last_selected === null) return;

        if (typeof head !== 'boolean') head = true;

        let deltaProps = {type: 'polyline'};
        let property = head ? 'markerEnd' : 'markerStart';
        let hasArrowMarker =
            typeof this.last_selected[property] === 'string' &&
                this.last_selected[property] === 'Arrow';

        let value = hasArrowMarker ? "" : "Arrow";
        deltaProps[property] = value;

        this.modifyShapes(
            deltaProps, this.createUpdateHandler([property], [value]));
    }

    /**
     * Creates a more custom update handler than the standard one
     *
     * @private
     * @param {Array.<string>} properties the properties that changed
     * @param {Array.<?>} value the values of the properties that changed
     * @param {boolean} modifies_attachment if true dimension attachment changed
     * @return {function} the wrapped standard update handler
     * @memberof RegionsEdit
     */
    createUpdateHandler(properties, values, modifies_attachment = false) {
        let updates = { properties: properties, values: values };
        let history = {
            hist: this.regions_info.history,
            hist_id: this.regions_info.history.getHistoryId()
        };
        return Utils.createUpdateHandler(
                    updates, history,
                    this.adjustEditWidgets.bind(this), modifies_attachment);
    }

    /**
     * Copy Shapes
     *
     * @memberof RegionsEdit
     */
    copyShapes() {
        this.context.publish(
            REGIONS_COPY_SHAPES,
            {config_id : this.regions_info.image_info.config_id});
   }

    /**
     * Paste Shapes
     *
     * @memberof RegionsEdit
     */
    pasteShapes() {
        let hist_id = this.regions_info.history.getHistoryId();
        this.context.publish(
            REGIONS_GENERATE_SHAPES,
            {config_id : this.regions_info.image_info.config_id,
                shapes : this.regions_info.copied_shapes,
                number : 1, random : true, hist_id : hist_id
            });
    }
}
