/*global require,$, dojo*/
/*jslint browser:true, windows:true, nomen:true, white:true*/

/**
 * A layer list that only creates a layer object when the user checks the associated checkbox.
 * @author Jeff Jacobson
 */

require([
    "esri/layers/layer",
    "esri/layers/ArcGISTiledMapServiceLayer",
    "esri/layers/ArcGISDynamicMapServiceLayer",
    "esri/layers/ArcGISImageServiceLayer",
    "esri/layers/FeatureLayer",
    "esri/layers/LabelLayer",
    "esri/layers/KMLLayer",
    "esri/layers/ImageParameters",
    "geoportal/layerUtils",
    "dojo/_base/connect",
    "extensions/map"
], function (
    Layer,
    ArcGISTiledMapServiceLayer,
    ArcGISDynamicMapServiceLayer,
    ArcGISImageServiceLayer,
    FeatureLayer,
    LabelLayer,
    KMLLayer,
    ImageParameters,
    layerUtils,
    connect
) {
    "use strict";

    var _defaultContextMenuIcon, _defaultLoadingIcon, onLayerLoad, onLayerError, updateIsInScaleStatus, toggleSublayer;
    _defaultContextMenuIcon = "<span style='cursor:pointer'>&Rrightarrow;</span>"; //"<img src='images/layerList/contextMenu.png' style='cursor:pointer' height='11' width='11' alt='context menu icon' title='Layer Options' />";
    _defaultLoadingIcon = "<img src='images/ajax-loader.gif' height='16' width='16' alt='Loading icon' />";

    /**
     *
     * @param {Object} jsonObject - An object.
     * @param {boolean} jsonObject.ignoreSoe - Specifies that the metadata list provided by the Layer Metadata SOE is to be ignored. Only the "additionalMetadata" links will be used.
     * @param {Object.<string, string>} jsonObject.additionalMetadata - A dictionary of metadata URLs.
     */
    function MetadataOptions(jsonObject) {
        this.ignoreSoe = Boolean(jsonObject.ignoreSoe);
        this.additionalMetadata = jsonObject.additionalMetadata;
    }

    /**
     * Creates a list of links.
     * @returns {HTMLUListElement} - An HTML unordered list containing links.
     */
    MetadataOptions.prototype.createListOfLinks = function () {
        var ul, li, a;

        ul = document.createElement("ul");

        for (var name in this.additionalMetadata) {
            if (this.additionalMetadata.hasOwnProperty(name)) {
                li = document.createElement("li");
                a = document.createElement("a");
                li.appendChild(a);
                a.textContent = name;
                a.href = this.additionalMetadata[name];
                a.target = "_blank";
                ul.appendChild(li);
            }
        }

        return ul;
    };

    /**
     * Makes a string safe to use as an HTML id property.
     * @param {string} s - a string
     * @param {string} [replacement="-"] - Optional.  The string that will be used to replace invalid characters.  Defaults to "-".
     * @param {string} [prefix="z-"] - Optional.  A string that will be prepended to the output if the input starts with a non-alpha character.  Defaults to "z-".
     * @param {Boolean} [alwaysUsePrefix=false] Set to true to always prepend the prefix to the output, false to only use it when the first character of s is non-alpha.
     * @returns {string} Returns a string that is safe to be used as an HTML id attribute value.
     */
    function makeIdSafeString(s, replacement, prefix, alwaysUsePrefix) {
        // Replace invalid characters with hyphen.
        s = s.replace(/\W/gi, replacement || "-");
        // Append a prefix if non-alpha character
        if (alwaysUsePrefix || /^[^a-z]/i.test(s)) { // JSLint will complain about this Regex's "insecure ^", but this is not used for security purposes so it should be fine.
            s = [prefix || "z-", s].join("");
        }

        return s;
    }

    /**
     * Returns a constructor for a specific type of layer.
     * @param {(string|Function)} layerType - layer type. If the type is a function, this function will simply be returned as the output.
     * @returns {Function} - A constructor for an esri/layers/Layer.
     */
    function getLayerConstructor(layerType) {
        var ctor;
        if (typeof layerType === "string") {
            if (/(?:esri\.layers\.)?ArcGISTiledMapServiceLayer/i.test(layerType)) {
                ctor = ArcGISTiledMapServiceLayer;
            } else if (/(?:esri\.layers\.)?ArcGISDynamicMapServiceLayer/i.test(layerType)) {
                ctor = ArcGISDynamicMapServiceLayer;
            } else if (/(?:esri\.layers\.)?ArcGISImageServiceLayer/i.test(layerType)) {
                ctor = ArcGISImageServiceLayer;
            } else if (/(?:esri\.layers\.)?FeatureLayer/i.test(layerType)) {
                ctor = FeatureLayer;
            } else if (/(?:esri\.layers\.)?LabelLayer/i.test(layerType)) {
                ctor = LabelLayer;
            } else if (/(?:esri\.layers\.)?KMLLayer/i.test(layerType)) {
                ctor = KMLLayer;
            } else {
                ctor = null;
            }

            if (ctor === null) {
                throw new Error("Unsupported layer type.");
            } else {
                return ctor;
            }
        } else if (typeof layerType === "function") {
            return layerType;
        }
    }

    /**
     * Toggles the visibility of a sublayer associated with a checkbox.
     * @param {Event} evt - An event object.  Must have a data.list property defined.
     */
    toggleSublayer = function (evt) {
        // Initialize variables.  The currentId is the ID corresponding to the checkbox (this).
        var layers, currentId = Number(this.value), layer = evt.data.layer, id, i, l, layerInfo;

        // Initialize the list of layers that will be sent to the setVisibleLayers method.
        layers = this.checked ? [currentId] : [];

        // Copy the ids of the currently visible layers (excluding "currentId") into a new array.
        for (i = 0, l = layer.visibleLayers.length; i < l; i += 1) {
            id = layer.visibleLayers[i];
            layerInfo = layer.layerInfos[id];
            // Omit layers that have subLayers.
            if (id !== currentId && layerInfo && layerInfo.subLayerIds === null) {
                layers.push(id);
            }
        }

        // If the array is empty, add the value -1 to make the setVisibleLayers query valid.
        if (layers.length === 0) {
            layers.push(-1);
        }

        // Call the setVisibleLayers function.
        layer.setVisibleLayers(layers);
    };

    /**
     * Adds either an "expanded" or "collaped" class to the specified elements based on the visibility of its child elements.
     * @param {DOMElement} element - A list item element.
     * @param {Boolean} [isCollapsed] - Optional.  Use this to explicitly specify what state the element is in.  If omitted, the expanded/collapsed state will be determined automatically.
     */
    function setTreeIcon(element, isCollapsed) {
        if (!element) {
            // Exit if element not specified.
            return;
        }

        // Determine the value of "isCollapsed" if not provided.
        if (typeof isCollapsed === "undefined") {
            isCollapsed = $("> ul", element).css("display") === "none";
        }

        // Set the class to either expanded or collapsed depending on the value of isCollapsed.
        if (isCollapsed) {
            $(element).addClass("collapsed").removeClass("expanded");
        } else {
            $(element).addClass("expanded").removeClass("collapsed");
        }
    }

    /**
     * Toggles the child list of a list item on or off.
     * @param {Object} evt - An event object.  The evt must have a data property that has a parent property.
     * @returns {Boolean} Returns false.
     */
    function toggleChildList(evt) {
        var parent, childLists, hidden;
        parent = evt.data.parent;
        childLists = $("> ul", parent);
        hidden = childLists.css("display") !== "none";

        setTreeIcon(parent, hidden);
        childLists.toggle("blind");
        return false;
    }

    function createSublayerControls(layer) {
        var i, l, layerInfo, output, li, parentLi, parentUl, checkbox;
        if (typeof layer.layerInfos === "undefined") {
            // Layer does not have sublayer infos.
            return null;
        }

        output = $("<ul>").hide();

        // Create heirarchy for sublayers.
        for (i = 0, l = layer.layerInfos.length; i < l; i += 1) {
            layerInfo = layer.layerInfos[i];
            li = $("<li>").attr({ "data-sublayerId": layerInfo.id });

            // Create a checkbox only if this is not a parent layer.
            checkbox = layerInfo.subLayerIds !== null ? null : $("<input>").attr({
                type: "checkbox",
                value: layerInfo.id,
                checked: layerInfo.defaultVisibility
            }).appendTo(li).addClass('ui-layer-list-sublayer');
            if (layerInfo.subLayerIds === null) {
                $("<label>").text(layerInfo.name).appendTo(li);
            } else {
                // Attach an event to the label link that will toggle the child list.
                li.addClass("ui-layer-list-has-children");
                $("<label>").text(layerInfo.name).appendTo(li).click({
                    parent: li
                }, toggleChildList);
                setTreeIcon(li);
            }

            // If its a parent layer, add directly to the output list.
            if (layerInfo.parentLayerId === -1) {
                output.append(li);
            } else {
                // Find the parent li
                parentLi = $(["li[data-subLayerId=", layerInfo.parentLayerId, "]"].join(""), output);
                // Get the parent list items child list.
                parentUl = $("ul", parentLi);
                // If a child list hasn't been created, create one now.
                if (parentUl.length === 0) {
                    parentUl = $("<ul>").appendTo(parentLi);
                }
                parentUl.append(li);
            }

            // Attach an event to the checkbox.
            if (checkbox) {
                checkbox.change({
                    layer: layer,
                    list: parentUl
                }, toggleSublayer);
            }
        }

        return output;
    }

    function jsonToImageParameters(json) {
        var output = json ? new ImageParameters() : null;
        if (output) {
            for (var propName in json) {
                if (json.hasOwnProperty(propName)) {
                    output[propName] = json[propName];
                }
            }
        }
        return output;
    }

    function processLayerOptions(layerOptions) {
        var output = layerOptions ? {} : null;
        if (output) {
            for (var propName in layerOptions) {
                if (layerOptions.hasOwnProperty(propName)) {
                    if (propName === "imageParameters") {
                        output[propName] = jsonToImageParameters(layerOptions[propName]);
                    } else {
                        output[propName] = layerOptions[propName];
                    }
                }
            }
        }
        return output;
    }

    /**
     * Creates an esri.layer.Layer based on information in layerInfo.
     * @param {Object} layerInfo - An object containing parameters for a Layer constructor.
     * @returns {esri/layer/Layer} - A layer.
     */
    function createLayer(layerInfo) {
        var constructor, layer;
        // If layerInfo is already an Layer, just return it.
        if (typeof layerInfo !== "undefined" && typeof layerInfo.isInstanceOf !== "undefined" && layerInfo.isInstanceOf(Layer)) {
            return layerInfo;
        }

        constructor = getLayerConstructor(layerInfo.type || layerInfo.layerType);

        /*jshint newcap:false*/
        layer = new constructor(layerInfo.url, processLayerOptions(layerInfo.options));
        /*jshint newcap:true*/

        // Add metadata options to layer object.
        layer.metadataOptions = layerInfo.metadataOptions ? new MetadataOptions(layerInfo.metadataOptions) : null;
        return layer;
    }

    function setOpacity(event, ui) {
        var value = event.target.valueAsNumber || ui.value, layer = event.data.layer;
        layer.setOpacity(value);
    }

    //function toggleOpacity(event) {
    //	event.data.slider.toggle();
    //}

    function showTools(event) {
        event.data.tools.show();
    }

    function hideTools(event) {
        event.data.tools.hide();
    }

    //function supportsInputRange() {
    //	/// <summary>Determines if the browser supports the HTML5 input range type element.</summary>
    //	/// <returns type="Boolean" />
    //	var input = $("<input type='range'>")[0];
    //	return typeof input.min !== "undefined";
    //}

    $.widget("ui.layerOptions", {
        options: {
            layer: null
        },
        /**
         * Adds a metadata link if the layer has metadata ids specified.
         */
        _addMetadataLink: function () {
            var layer = this.options.layer, id, i, l, url, a, docfrag, ul, li, label, heading;
            if ($.isArray(layer.metadataLayers) && layer.metadataLayers.length > 0) {
                //  && !(layer.metadataOptions && !layer.metadataOptions.ignoreSoe
                docfrag = document.createElement("div");
                docfrag.classList.add("metadata-list-container");
                heading = document.createElement("h3");
                heading.textContent = "Metadata";
                docfrag.appendChild(heading);
                // Add metadata links from SOE
                if (!(layer.metadataOptions && layer.metadataOptions.ignoreSoe === true)) {
                    ul = document.createElement("ul");
                    docfrag.appendChild(ul);
                    // Loop through each of the metadata ids and create an array of metadata info objects.
                    for (i = 0, l = layer.metadataLayers.length; i < l; i += 1) {
                        id = layer.metadataLayers[i];
                        try {
                            url = layer.getMetadataUrl(id, "html");
                        } catch (e) {
                            console.error("Error getting metadata URL", e);
                            url = null;
                        }
                        if (url) {
                            if (layer.layerInfos) {
                                label = layer.layerInfos[id].name;
                            }
                            // Add a link that will open metadata urls in a new window.
                            li = document.createElement("li");
                            ul.appendChild(li);
                            a = document.createElement("a");
                            a.href = url;
                            a.textContent = label || "Metadata for sublayer " + id;
                            a.setAttribute("class", "ui-layer-options-metadata-link");
                            a.target = "_blank";
                            li.appendChild(a);
                        }
                    }
                }
                // Add additional metadata links
                if (layer.metadataOptions && layer.metadataOptions instanceof MetadataOptions) {
                    ul = layer.metadataOptions.createListOfLinks();
                    docfrag.appendChild(ul);
                }
                this.element[0].appendChild(docfrag);
            }
        },
        _create: function () {
            var $this = this, layer, slider, sliderContainer;
            if (this.options.layer === null) {
                throw new Error("No layer specified");
            }

            layer = $this.options.layer;

            // Add the opacity slider if the layer supports the setOpacity function.
            if (typeof layer.setOpacity === "function") {
                $("<label>").text("Transparency").appendTo($this.element);
                sliderContainer = $("<div>").addClass("ui-layer-list-opacity-slider-container").appendTo($this.element);
                // Add opacity slider

                // Convert into a jQuery UI slider.  (HTML5 slider doesn't work in many browsers.)
                // Firefox and Chrome support it.
                slider = $("<div>").appendTo(sliderContainer).slider({
                    value: layer.opacity,
                    min: 0,
                    max: 1,
                    step: 0.1
                }).appendTo(sliderContainer).bind("slidechange", {
                    layer: layer
                }, setOpacity);
            }

            // Add metadata links.
            $this._addMetadataLink();
        },
        _destroy: function () {
            // Call the base destroy method.
            $.Widget.prototype.destroy.apply(this, arguments);
        }
    });

    function showOptions(event) {
        var layer = event.data.layer, dialog;

        // Create the options widget inside a dialog.
        dialog = $("<div>").layerOptions({
            layer: layer
        }).dialog({
            title: [layer.id, "Options"].join(" "),
            position: [
                event.clientX,
                event.clientY
            ],
            modal: true,
            close: function (/*event, ui*/) {
                // Remove the dialog from the DOM and dispose of it.
                $(this).dialog("destroy").remove();
            }
        });
        return false;
    }

    /**
     * Removes the "layer not loaded" class and (if appropriate) sets up controls for the child layers.
     * @param {esri/layers/Layer} layer - A map service layer.
     */
    onLayerLoad = function (layer) {
        // The "this" object is a ui.layerListItem widget.
        var $element = $(this.element), label, tools;
        this._hideLoading();
        $element.removeClass("ui-layer-list-not-loaded");

        try {
            // Check to see if layer supports metadata by attempting to retrieve a list of feature layers from the Metadata SOE.
            // Add a "metadataLayers" property and set the value appropriately.
            // Add a "metadataUrl property to each layerInfo.
            if (typeof layer.getIdsOfLayersWithMetadata === "function") {
                layer.getIdsOfLayersWithMetadata(function (layerIds) {
                    var id, i, l, layerInfo;

                    layer.metadataLayers = layerIds;

                    if (layerIds && layerIds.length) {
                        for (i = 0, l = layerIds.length; i < l; i += 1) {
                            id = layerIds[i];
                            layerInfo = layer.layerInfos[id];
                            layerInfo.metadataUrl = layer.getMetadataUrl(id);
                        }
                    }
                }, function (/*error*/) {
                    layer.metadataLayers = null;
                });
            } else if (typeof layer.supportsMetadata === "function") {
                layer.supportsMetadata(function (metadataSupportInfo) {
                    console.log("supports metadata", metadataSupportInfo);
                }, function (error) {
                    console.error(error);
                });
            }
        } catch (e) {
            console.error("Error creating metadata list for layer", {
                error: e,
                layer: layer
            });
        }

        // Add options link
        tools = $(this.options.contextMenuIcon).appendTo($element).click({
            layer: layer
        }, showOptions);

        // Setup the mouse over and mouse out events.
        $element.mouseover({
            tools: tools
        }, showTools).mouseout({
            tools: tools
        }, hideTools);

        // Add sublayers if the layer supports sub-layer visibility setting, and has more than one sub-layer.
        if (!this.options.layer.omitSublayers && typeof layer.setVisibleLayers === "function" && layer.layerInfos.length > 1) {
            // Set the label to toggle sublayer list when clicked.
            $element.addClass("ui-layer-list-has-children");
            label = $("> label", $element).click({ parent: $element }, toggleChildList);
            $(createSublayerControls(layer)).appendTo($element);
            setTreeIcon($element[0]);
            // Expand the child list.
            label.click();
        }

        try {
            this.setIsInScale();
        } catch (e) {
            if (typeof console !== "undefined" && typeof console.error === "function") {
                console.error(e);
            }
        }
    };

    /**
     * Converts an error object into a string.
     * @param {Error} error - An error that occurs when loading a layer.
     * @returns {string} An error message
     */
    function formatError(error) {
        if (typeof error.details !== "undefined") {
            error = error.details.join("\n");
        } else if (typeof error.message !== "undefined") {
            error = error.message;
        }
        return error;
    }

    /**
     * Modify the control to show that an error has occured with this layer.
     * @param {Error} error - an error
     */
    onLayerError = function (error) {
        // The "this" keyword will be a layerListItem widget.
        var layer = this._layer;
        if (!layer.loaded) {
            this.disable();
            this._hideLoading();
            $(this.element).removeClass("ui-layer-list-not-loaded").addClass("ui-state-error").attr("title", "Error\n" + formatError(error));
        }
        // Trigger an event that can be used by consumers of this control..
        this._trigger("layerError", {
            error: error
        });
    };

    /**
     * Toggles the layer associated with a checkbox on or off.
     * @param {Object} eventObject - Contains information about the checkbox change event.
     */
    function toggleLayer(eventObject) {
        var $this;

        $this = eventObject.data.widget;
        // Turn the layer on if it is checked, off if not.
        if (eventObject.currentTarget.checked) {
            // If the layer hasn't been created yet, create it and add it to the map.
            // Otherwise, show the layer.
            if (!$this._layer) {
                $this._showLoading();
                $this._layer = createLayer($this.options.layer);
                $this.options.map.addLayer($this._layer);
                // Connect the layer load event.
                dojo.connect($this._layer, "onError", $this, onLayerError);
                dojo.connect($this._layer, "onLoad", $this, onLayerLoad);
            } else {
                $this._layer.show();
            }
        } else {
            if ($this._layer) {
                $this._layer.hide();
            }
        }
    }

    /**
     * Update the "is in scale" status for each layerListItem in a layerList.
     * Although delta and extent parameters are not used, they are necessary for the method signature.
     * @param {esri/geometry/Extent} extent - unused
     * @param {number} delta - unused
     * @param {number} levelChange - unused
     * @param {number} lod - unused.
     * @this {ui.layerList}
     */
    updateIsInScaleStatus = function (extent, delta, levelChange, lod) {
        // Get all of the layer list items in the current list.
        var layerListItems, layerListItem, i, l;

        if (levelChange) {
            layerListItems = $(".ui-layer-list-item", this.element);

            for (i = 0, l = layerListItems.length; i < l; i += 1) {
                layerListItem = layerListItems.eq(i);
                layerListItem.layerListItem("setIsInScale", lod.scale);
            }
        }
    };

    $.widget("ui.layerListItem", {
        options: {
            layer: null, // An object that is used to create an layer.  Has an id, url, and layerType.
            map: null,
            label: null, // The label to be used instead of the layer's "id" property.
            contextMenuIcon: _defaultContextMenuIcon,
            loadingIcon: _defaultLoadingIcon
        },
        _showLoading: function () {
            $(".ui-layer-list-item-loading-icon", this.element).show();
        },
        _hideLoading: function () {
            $(".ui-layer-list-item-loading-icon", this.element).hide();
        },
        _checkbox: null,
        _layer: null, // This is where the Layer object will be stored.
        getLayer: function () {
            return this._layer;
        },
        _sublayerDiv: null,
        /**
         * Sets the "is in scale" status of this control
         * @param {number} scale - The current scale of the map.
         * @returns {ui.layerListItem} - Returns the calling layer list item.
         */
        setIsInScale: function (scale) {
            var layer, scales, minScale, maxScale, isInScale, outOfScaleClass = "ui-layer-list-out-of-scale";

            if (!this._layer) {
                return this;
            }

            layer = this._layer;

            // If scale is not provided, get it from the map.
            if (scale === null || typeof scale === "undefined") {
                scale = this.options.map.__LOD.scale;
            }

            // Check to see if the layer has a scales property that is an array.
            scales = this._layer.scales;
            if (typeof scales !== "undefined" && $.isArray(scales)) {
                minScale = scales[0];
                maxScale = scales[scales.length - 1];
                isInScale = (minScale === 0 || minScale >= scale) && (maxScale === 0 || maxScale <= scale);
                if (isInScale) {
                    $(this.element).removeClass(outOfScaleClass);
                } else {
                    $(this.element).addClass(outOfScaleClass);
                }
            }

            return this;
        },
        _addInfoFromLoadedLayer: onLayerLoad,
        _create: function () {
            var $this = this;

            $this.element.addClass("ui-layer-list-item ui-layer-list-not-loaded");

            // Add the layer checkbox to the widget and add change event handler.
            $this._checkbox = $("<input>").attr({
                type: "checkbox",
                "data-layer-id": $this.options.layer.id || $this.options.layer.options.id
            }).appendTo($this.element).change({ widget: $this }, toggleLayer);

            // Add the label for the checkbox.
            $("<label>").text($this.options.label || $this.options.layer.id || $this.options.layer.options.id || "Unnamed").appendTo($this.element);

            ////// Add the loading progress bar.
            ////$("<progress>").text("Loading...").css({
            ////    "display": "block"
            ////}).appendTo($this.element).hide();

            $($this.options.loadingIcon).addClass("ui-layer-list-item-loading-icon").appendTo($this.element).hide();

            // If this layer has already been loaded, call the layer load event handler.
            if (typeof $this.options.layer !== "undefined" && $this.options.layer !== null && typeof $this.options.layer.isInstanceOf === "function" && $this.options.layer.isInstanceOf(Layer)) {
                $this._layer = $this.options.layer;
                $this._addInfoFromLoadedLayer($this._layer);
                // Set the checkbox to match the layer's visibility.

                $this._checkbox[0].checked = $this._layer.visible;
                $($this.element).mouseout();
            }

            return this;
        },
        disable: function () {
            // Remove the change event handler, disable and uncheck the checkbox.
            this._checkbox.change(null).attr("disabled", true)[0].checked = false;
            $.Widget.prototype.disable.apply(this, arguments);
        },
        _destroy: function () {
            // Call the base destroy method.
            $.Widget.prototype.destroy.apply(this, arguments);
        }
    });

    $.widget("ui.layerListGroup", {
        options: {
            map: null,
            groupName: null,
            layers: null,
            startCollapsed: false,
            contextMenuIcon: _defaultContextMenuIcon,
            loadingIcon: _defaultLoadingIcon
        },
        _list: null,
        /**
         * Toggles the list of layers or subgroups on or off.
         * @returns {ui.layerListGroup} the calling layer list group returns itself.
         */
        toggle: function () {
            // Get the list.  If called from a click event, "this" will not be referencing the widget, so we need to get the list an alternate way.
            var hidden = $("ul", this.element).css("display") === "none";
            // Expand the list if it is hidden, or collapse it if it is currently visible.  Then trigger the appropriate event.
            if (hidden) {
                this._list.show("blind");
                $(this.element).removeClass("collapsed");
                this._trigger("collapse", this);
            } else {
                this._list.hide("blind");
                $(this.element).addClass("collapsed");
                this._trigger("expand", this);
            }
            return this;
        },
        /**
         * Adds a layer to the layer list group.
         * @param {esri/layers/Layer} layer - a layer to be added to the group
         * @returns {ui.layerListGroup} the calling layer list group returns itself.
         */
        _addLayer: function (layer) {
            var layerListItem = $("<li>").appendTo(this._list).layerListItem({
                layer: layer,
                map: this.options.map,
                contextMenuIcon: this.options.contextMenuIcon,
                loadingIcon: this.options.loadingIcon
            });
            this._trigger("layerAdd", this, {
                layer: layer,
                layerListItem: layerListItem.data("layerListItem")
            });
            return this;
        },
        /**
         * Adds a child group to this group.
         * @param {string} name - The name that will be given to the group.
         * @param {Array} layers - An array of layer description objects that will be added to the new group.
         * @returns {ui.layerListGroup} the calling layer list group returns itself.
         */
        _addGroup: function (name, layers) {
            var group = $("<li>").appendTo(this._list).layerListGroup({
                groupName: name,
                startCollapsed: this.options.startCollapsed,
                layers: layers,
                map: this.options.map,
                contextMenuIcon: this.options.contextMenuIcon,
                loadingIcon: this.options.loadingIcon
            });
            this._trigger("groupAdd", this, {
                name: name,
                layers: layers,
                group: group.data("layerListGroup")
            });
            return this;
        },
        _create: function () {
            var $this = this, layers = this.options.layers, link, i, l, name;

            // Add a class indicating that this is a layer list group.
            $($this.element).addClass("ui-layer-list-group");
            // Add the group header link.
            link = $(["<a href='#'>", $this.options.groupName, "</a>"].join("")).attr("href", "#").appendTo($this.element);

            // Add a list to hold the child elements or arrays.
            $this._list = $("<ul>").appendTo($this.element);

            // Add the click event to the link which will toggle the list.
            link.click(function () {
                $this.toggle();
                return false;
            });

            // If layers is an array, it contains layers.  Otherwise it contains groups of layers.
            if ($.type(layers) === "array") {
                // For each layer in layers, add a list item and turn it into a layerListItem.
                for (i = 0, l = layers.length; i < l; i += 1) {
                    $this._addLayer(layers[i]);
                }
            } else if ($.type(layers) === "object") {
                // Add layer list groups for each property in the layers object.
                for (name in layers) {
                    if (layers.hasOwnProperty(name)) {
                        $this._addGroup(name, layers[name]);
                    }
                }
            }

            if ($this.options.startCollapsed) {
                $this.toggle();
            }

            return this;
        },
        _destroy: function () {
            $.Widget.prototype.destroy.apply(this, arguments);
        }
    });

    function getLayerId(layer) {
        var type = $.type(layer), output;
        if (type === "string") {
            output = layer;
        } else {
            output = layer.id ? layer.id : layer.options && layer.options.id ? layer.options.id : null;
        }
        return output;
    }

    $.widget("ui.layerList", {
        options: {
            map: null,
            layers: null,
            startCollapsed: false,
            contextMenuIcon: _defaultContextMenuIcon,
            loadingIcon: _defaultLoadingIcon,
            startLayers: null,
            basemapRe: /layer((?:\d+)|(?:_osm)|(?:_bing))/i,
            bingRe: /layer_bing/i,
            osmRe: /layer_osm/i,
            bingLabel: "Bing",
            osmLabel: "OpenStreetMap",
            defaultBasemapLabel: "Basemap Layer",
            basemapGroupName: "Basemap",
            addAdditionalLayers: true
        },
        getWidget: function () {
            return this;
        },

        /**
         * Checks to see if a layer already exists in the layer list.
         * @param {Object} layer - a layer
         * @return {Boolean} Returns true if it exists, false otherwise.
         */
        _layerExistsInToc: function (layer) {
            var listItemElements, exists = false, i, l, currentLayer;
            listItemElements = $(".ui-layer-list-item");
            for (i = 0, l = listItemElements.length; i < l; i += 1) {
                currentLayer = $(listItemElements.eq(i)).layerListItem("getLayer");
                if (currentLayer === layer) {
                    exists = true;
                    break;
                }
            }

            return exists;
        },
        _selectStartLayers: function () {
            /// <summary>Turns on all of the layers specified in the options.startLayers array.</summary>
            var startLayerNames, listItems, i, l, listItem, j, nameCount, name, checkbox;
            startLayerNames = this.options.startLayers;
            listItems = $("li.ui-layer-list-item", this.element);
            for (i = 0, l = listItems.length; i < l; i += 1) {
                listItem = listItems[i];
                // Loop through all of the names to see if there is a match.
                for (j = 0, nameCount = startLayerNames.length; j < nameCount; j += 1) {
                    name = startLayerNames[j];
                    if ($("label", listItem).text() === name) {
                        // Get the checkbox
                        checkbox = $("> input", listItem);
                        checkbox = checkbox.length ? checkbox[0] : null;

                        // Click the checkbox.  This will check it and activate the associated layer.
                        if (checkbox) {
                            checkbox.click();
                            $(checkbox).change(); // This line is necessary to turn the layer on in IE.
                        }
                        break; // Match found.  Go to the next list item.
                    }
                }
            }
        },
        _childNodeType: null,
        _addGroup: function (name) {
            var group = $(this._childNodeType).appendTo(this.element).layerListGroup({
                map: this.options.map,
                startCollapsed: this.options.startCollapsed,
                groupName: name,
                layers: this.options.layers[name],
                contextMenuIcon: this.options.contextMenuIcon,
                loadingIcon: this.options.loadingIcon
            });
            this._trigger("groupAdd", this, {
                group: group
            });
            return group;
        },
        _addLayer: function (layer, error) {
            var parent = this.element, groups, group, groupWidget, i, l, basemapGroupFound = false, layerListItem, label, layerId;
            layerId = getLayerId(layer);
            if (this.options.basemapRe.test(layerId)) {
                // Check to see if a "Basemap" group exists.  Create one if it does not.  Set "parent" to the "Basemap" group.
                // $(".ui-layer-list-group").first().data("layerListGroup").options.groupName
                groups = $(".ui-layer-list-group", this.element);
                for (i = 0, l = groups.length; i < l; i += 1) {
                    group = groups.eq(i);
                    groupWidget = group.data("layerListGroup");
                    if (Boolean(groupWidget.options) && typeof groupWidget.options.groupName === "string" && groupWidget.options.groupName === this.options.basemapGroupName) {
                        parent = group[0];
                        basemapGroupFound = true;
                        break;
                    }
                }
                // Create "Basemap" group if it does not already exist.  Assign this group to parent.
                if (!basemapGroupFound) {
                    parent = this._addGroup(this.options.basemapGroupName);
                    parent.addClass("basemap-group");
                }

                parent = $("ul", parent);

                // Set the label.
                if (this.options.bingRe.test(layerId)) {
                    label = this.options.bingLabel;
                } else if (this.options.osmRe.test(layerId)) {
                    label = this.options.osmLabel;
                } else {
                    label = layerUtils.createLayerNameFromUrl(layer) || this.options.defaultBasemapLabel;
                }
            }
            if (!error && !this._layerExistsInToc(layer)) {
                // Add the layer list item
                layerListItem = $(this._childNodeType).appendTo(parent).layerListItem({
                    layer: layer,
                    map: this.options.map,
                    contextMenuIcon: this.options.contextMenuIcon,
                    loadingIcon: this.options.loadingIcon,
                    label: label
                });

                // Trigger an event.
                this._trigger("layerAdd", this, {
                    layer: layer,
                    layerListItem: layerListItem.data("layerListItem")
                });
            }
            return this;
        },
        _removeLayer: function (layer) {
            /// <summary>Removes the list item corresponding to the given layer from the layerList.  Intended to be called from the map's removeLayer event.</summary>
            /// <param name="layer" type="Layer">The layer that will have its corresponding item removed.</param>
            var listItems, i, l, item;
            // Get all of the layer list items that have had their layers loaded.
            listItems = $(".ui-layer-list-item").filter(":not(.ui-layer-list-not-loaded)");
            // Find the one that matches the removed layer and remove it.
            for (i = 0, l = listItems.length; i < l; i += 1) {
                // Get the item at the current index in a jQuery object.
                item = listItems.eq(i);
                if (item.layerListItem("getLayer") === layer) {
                    item.remove();
                    break;
                }
            }
            this._trigger("layerRemove", this, {
                layer: layer
            });
        },
        _addLayersAlreadyInMap: function () {
            var i, l, map = this.options.map, layerIds = map.layerIds.concat(map.graphicsLayerIds);
            // Add layers already in map to the TOC.
            for (i = 0, l = layerIds.length; i < l; i += 1) {
                this._addLayer(map.getLayer(layerIds[i]));
            }
        },
        _create: function () {
            var $this = this, baseNode, map = this.options.map, i, l, name;

            // Add classes to this element for jQuery UI styling and for custom styling.
            $($this.element).addClass('ui-layer-list');

            // Get the base node DOM element.
            baseNode = this.element.nodeName ? this.element : this.element[0];
            // Determine the type of DOM element.  If the baseNode is either an OL or UL, we will be adding LI elements.
            // Otherwise we will be adding DIV elements.
            $this._childNodeType = /[uo]l/i.test(baseNode.nodeName) ? "<li>" : "<div>";

            if ($.isArray($this.options.layers)) {
                // If the "layers" option is an array, add a layerListItem for each element in the array.
                for (i = 0, l = $this.options.layers.length; i < l; i += 1) {
                    $this._addLayer($this.options.layers[i]);
                }
            } else {
                // For each property in the "layers" object, add a layerListGroup.
                for (name in $this.options.layers) {
                    if ($this.options.layers.hasOwnProperty(name)) {
                        $this._addGroup(name);
                    }

                }
            }

            // Check the layers specified in the startLayers option.
            if ($.isArray($this.options.startLayers)) {
                $this._selectStartLayers();
            }

            // Setup zoom events to show if layer is out of scale.
            connect.connect(map, "extent-change", this, updateIsInScaleStatus);

            if ($this.options.addAdditionalLayers === true) {
                // Add an event to add layers to the TOC as they are added to the map.
                connect.connect(map, "onLayerAddResult", $this, this._addLayer);
                connect.connect(map, "onLayerRemove", $this, this._removeLayer);

                // Add layers already in map to the TOC.
                $this._addLayersAlreadyInMap();
            }

            return this;
        },
        _destroy: function () {
            // Call the base destroy method.
            // TODO: destroy the layer list items.
            $.Widget.prototype.destroy.apply(this, arguments);
        }
    });

    $.widget("ui.tabbedLayerList", {
        options: {
            map: null,
            layers: null,
            startCollapsed: false,
            contextMenuIcon: _defaultContextMenuIcon,
            loadingIcon: _defaultLoadingIcon,
            startLayers: null,
            basemapRe: /layer((?:\d+)|(?:_osm)|(?:_bing))/i,
            basemapGroupName: "Basemap",
            addAdditionalLayers: true
        },
        _create: function () {
            var $this = this, tabList, tabId, tabDiv, tabName;

            function createTabDiv(tabName, addAdditionalLayers) {
                var layers = $this.options.layers[tabName] || [];
                // Create the ID for the current tab.
                tabId = makeIdSafeString(tabName, "-", "ui-tabbed-layer-list-tab-", true);
                // Add a link for the current tab.
                tabList.append(["<li><a href='#", tabId, "'>", tabName, "</a></li>"].join(""));
                // Create the currrent tab.
                tabDiv = $("<div>").attr("id", tabId).appendTo($this.element).layerList({
                    map: $this.options.map,
                    layers: layers,
                    startCollapsed: $this.options.startCollapsed,
                    contextMenuIcon: $this.options.contextMenuIcon,
                    loadingIcon: $this.options.loadingIcon,
                    startLayers: $this.options.startLayers,
                    basemapRe: $this.options.basemapRe,
                    basemapGroupName: $this.options.basemapGroupName,
                    addAdditionalLayers: Boolean(addAdditionalLayers)
                });
            }

            tabList = $("<ul>").appendTo($this.element);

            // Loop through each property in layers option and create a corresponding list item and div for each.
            for (tabName in $this.options.layers) {
                if ($this.options.layers.hasOwnProperty(tabName)) {
                    createTabDiv(tabName);
                }
            }

            // Add a group for additional layers
            if ($this.options.addAdditionalLayers) {
                createTabDiv("Additional", true);
            }

            $(this.element).tabs();

            return this;
        },
        _destroy: function () {
            $.Widget.prototype.destroy.apply(this, arguments);
        }
    });

});