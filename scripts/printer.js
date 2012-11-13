﻿/*global require, jQuery*/
/*jslint plusplus:true,nomen:true*/
(function ($) {
	"use strict";

	function splitWords(s) {
		/// <summary>Splits a camel-case or Pascal-case variable name into individual words.</summary>
		/// <param name="s" type="String">A string</param>
		/// <returns type="Array" />
		var re, match, output = [];
		// re = /[A-Z]?[a-z]+/g
		re = /([A-Za-z]?)([a-z]+)/g;

		/*
		matches example: "oneTwoThree"
		["one", "o", "ne"]
		["Two", "T", "wo"]
		["Three", "T", "hree"]
		*/

		match = re.exec(s);
		while (match) {
			// output.push(match.join(""));
			output.push([match[1].toUpperCase(), match[2]].join(""));
			match = re.exec(s);
		}

		return output;

	}

	require(["esri/tasks/PrintTask"], function (PrintTask) {
		$.widget("ui.printer", {
			options: {
				map: null,
				templates: null, //templates,
				url: null,
				layoutOptions: {
					authorText: null,
					copyrightText: ["©", new Date().getFullYear(), " WSDOT"].join(""),
					//"legendLayers": [],
					titleText: null, //"Airport",
					scalebarUnit: "Miles"
				},
				additionalParameters: [
					{
						"name": "Resolution",
						"dataType": "GPLong",
						"displayName": "Resolution",
						"description": "Resolution (DPI)",
						"direction": "esriGPParameterDirectionInput",
						"defaultValue": 96,
						"parameterType": "esriGPParameterTypeOptional",
						"category": "Advanced"
					},
					{
						"name": "Image_Quality",
						"dataType": "GPString",
						"displayName": "Image Quality",
						"description": "Image Quality",
						"direction": "esriGPParameterDirectionInput",
						"defaultValue": "BEST",
						"parameterType": "esriGPParameterTypeOptional",
						"category": "Advanced",
						"choiceList": [
							"BEST",
							"BETTER",
							"NORMAL",
							"FASTER",
							"FASTEST"
						]
					},
					{
						"name": "Colorspace",
						"dataType": "GPString",
						"displayName": "Color Space",
						"description": "RGB or CYMK",
						"direction": "esriGPParameterDirectionInput",
						"defaultValue": "RGB",
						"parameterType": "esriGPParameterTypeOptional",
						"category": "Advanced",
						"choiceList": [
							"CMYK",
							"RGB"
						]
					},
					{
						"name": "Image_Compression",
						"dataType": "GPString",
						"displayName": "Image Compression",
						"description": "Image compression",
						"direction": "esriGPParameterDirectionInput",
						"defaultValue": "ADAPTIVE",
						"parameterType": "esriGPParameterTypeOptional",
						"category": "Advanced",
						"choiceList": [
							"ADAPTIVE",
							"JPEG",
							"DEFLATE",
							"LZW",
							"NONE",
							"RLE"
						]
					},
					{
						"name": "JPEG_Compression_Quality",
						"dataType": "GPLong",
						"displayName": "JPEG Compression Quality",
						"description": "JPEG compression quality",
						"direction": "esriGPParameterDirectionInput",
						"defaultValue": 80,
						"parameterType": "esriGPParameterTypeOptional",
						"category": "Advanced"
					}
				],
				////additionalParameters: {
				////	"Resolution": {
				////		type: "range",
				////		values: [96, 300],
				////		value: 96
				////	},
				////	"Image_Quality": {
				////		label: "Image Quality",
				////		type: "choice",
				////		values: ["BEST", "BETTER", "NORMAL", "FASTER", "FASTEST"],
				////		value: "BEST"
				////	},
				////	"Color_Space": {
				////		label: "Color Space",
				////		type: "choice",
				////		values: ["RGB", "CMYK"],
				////		value: "RGB"
				////	},
				////	"Image_Compression": {
				////		label: "Image Compression",
				////		type: "choice",
				////		values: ["ADAPTIVE", "JPEG", "DEFLATE", "LZW", "NONE", "RLE"],
				////		value: "ADAPTIVE"
				////	},
				////	"JPEG_Compression_Quality": {
				////		label: "JPEG Compression Quality",
				////		type: "range",
				////		values: [1, 100],
				////		value: 80
				////	}
				////},
				async: false
			},
			_layoutOptionsSection: null,
			_printButton: null,
			_cancelButton: null,
			_templateSelect: null,
			_printTask: null,
			_create: function () {
				var $this = this;

				function addAdditionalParameters() {
					var additionalParams, i, l, param, label, control, output;

					function createSelect(param) {
						var j, jl, choice;
						if (param.choiceList) {
							control = $("<select>").appendTo(output);
							for (j = 0, jl = param.choiceList.length; j < jl; j += 1) {
								choice = param.choiceList[j];
								$("<option>").text(choice).attr({
									value: choice,
									selected: choice === param.defaultValue
								}).appendTo(control);
							}
						}
					}

					function createInput(param) {
						control = $("<input>");
						if (param.dataType === "GPString") {
							control.attr({
								type: "text"
							});
						} else if (param.dataType === "GPLong") {
							control.attr({
								type: "range",
								step: 1
							});
							if (param.name === "Resolution") {
								control.attr({
									min: 96,
									max: 300
								});
							} else if (param.name === "JPEG_Compression_Quality") {
								control.attr({
									min: 1,
									max: 100
								});
							}
						}
						if (param.defaultValue) {
							control.val(param.defaultValue);
						}
						control.appendTo(output);
					}

					if ($this.options.additionalParameters) {
						output = $("<div>").addClass("ui-printer-additional-parameters");
						additionalParams = $this.options.additionalParameters;
						for (i = 0, l = additionalParams.length; i < l; i += 1) {
							param = additionalParams[i];
							// TODO: handle label's "for" attribute.
							label = $("<label>").text(param.displayName).appendTo(output);
							if (param.choiceList) {
								createSelect(param);
							} else {
								createInput(param);
							}
						}
					}
					return output;
				}

				function addLayoutOptions(container, layoutOptions) {
					/// <summary>Adds layout options to an element.</summary>
					/// <param name="container" type="jQuery">A container element</param>
					/// <param name="layoutOptions" type="Object">An object with properties.</param>
					var optionName, optionValue;
					for (optionName in layoutOptions) {
						if (layoutOptions.hasOwnProperty(optionName)) {
							optionValue = layoutOptions[optionName];
							$("<label>").text(splitWords(optionName).join(" ")).appendTo(container);
							$("<input>").attr({
								type: "text",
								name: optionName
							}).appendTo(container).val(optionValue);
						}
					}
				}

				function createTemplateSelect() {
					var output, i, l, tName;

					output = $("<select>");
					for (i = 0, l = $this.options.templates.length; i < l; i += 1) {
						tName = $this.options.templates[i];
						$("<option>").attr({
							value: tName
						}).text(tName).appendTo(output);
					}

					return output;
				}

				// Add controls for all of the layout options.
				$("<label>").text("Template").appendTo($this.element);
				$this._templateSelect = createTemplateSelect().appendTo($this.element);
				$this._layoutOptionsSection = $("<div>").addClass("ui-printer-layout-options").appendTo($this.element);
				addLayoutOptions($this._layoutOptionsSection, $this.options.layoutOptions);
				addAdditionalParameters().appendTo($this.element);


				$("<button>").attr({
					type: "button"
				}).appendTo($this.element).button({
					label: "Print",
					icons: {
						primary: "ui-icon-print"
					}

				}).click(function () {
					var printParameters, printTemplate;
					printParameters = new esri.tasks.PrintParameters();
					printParameters.map = $this.options.map;
					printTemplate = new esri.tasks.PrintTemplate();
					printTemplate.format = "PDF";
					printTemplate.layout = $this._templateSelect.val();
					printParameters.template = printTemplate;

					// Create the print task if it does not already exist.
					if (!$this.printTask) {
						$this.printTask = new PrintTask($this.options.url, {
							async: $this.options.async
						});
						dojo.connect($this.printTask, "onComplete", function (result) {
							$this._trigger("printComplete", null, {
								printParameters: printParameters,
								date: Date(),
								result: result
							});
						});
						dojo.connect($this.printTask, "onError", function (error) {
							$this._trigger("printError", null, {
								printParameters: printParameters,
								date: Date(),
								error: error
							});
						});
					}

					$this.printTask.execute(printParameters);
					$this._trigger("printSubmit", null, { parameters: printParameters });
				});

				return this;
			},
			_destroy: function () {
				$.Widget.prototype.destroy.apply(this, arguments);
			}
		});
	});
} (jQuery));