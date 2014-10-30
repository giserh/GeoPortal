﻿/*global define */
// Copyright ©2012 Washington State Department of Transportation (WSDOT).  Released under the MIT license (http://opensource.org/licenses/MIT).

// Creates a dojo Filtering Select dijit that allows the user to zoom to a predefined extend in an ArcGIS JavaScript API web application.

define([
	"dijit/form/FilteringSelect",
	"dojo/data/ItemFileReadStore",
	"esri/graphic",
	"esri/geometry/jsonUtils",
	"esri/geometry/Point",
	"esri/tasks/FeatureSet",
	"esri/SpatialReference",
	"esri/InfoTemplate"
], function (FilteringSelect, ItemFileReadStore, Graphic, geometryJsonUtils, Point, FeatureSet, SpatialReference, InfoTemplate) {
	"use strict";

	/**
	 * Returns the name of the first attribute of a graphic that is of type "string".
	 * @param {Graphic}
	 * @returns {(string|null)} - Returns a string if a string attribute is found, null otherwise.
	 */
	function getFirstStringAttribute(graphic) {
		var propName, output = null;
		for (propName in graphic.attributes) {
			if (graphic.attributes.hasOwnProperty(propName)) {
				if (typeof graphic.attributes[propName] === "string") {
					output = propName;
					break;
				}
			}
		}
		return output;
	}

	/**
	 * Creates a dijit.form.FilteringSelect from a feature set.
	 * @param {esri/tasks/FeatureSet} featureSet - A set of features returned from a query.
	 * @param {esri/Map} map - The map that will be zoomed when an extent is selected from this control.
	 * @param {number} levelOrFactor - See the levelOrFactor parameter of the esri.Map.centerAndZoom function.
	 * @returns {dijit/form/FilteringSelect}
	 */
	function createExtentSelect(domElement, featureSet, map, levelOrFactor) {

		if (!domElement) {
			throw new TypeError("domElement not provided.");
		} else if (typeof domElement === "string") {
			domElement = document.getElementById(domElement);
		}

		// Set up the zoom select boxes.
		var sortByName, data, extentSpatialReference, filteringSelect;
		if (levelOrFactor === undefined || levelOrFactor === null) {
			levelOrFactor = 10;
		}
		sortByName = function (a, b) { return (a.name < b.name) ? -1 : (a.name > b.name) ? 1 : 0; };
		extentSpatialReference = new SpatialReference({ wkid: 102100 });


		if (featureSet.isInstanceOf && featureSet.isInstanceOf(FeatureSet)) {
			(function () {
				var i, l, graphic, nameAttribute = "NAME";
				data = { identifier: "name", label: "name", items: [] };
				for (i = 0, l = featureSet.features.length; i < l; i += 1) {
					graphic = featureSet.features[i];
					if (!graphic.attributes.hasOwnProperty(nameAttribute)) {
						nameAttribute = getFirstStringAttribute(graphic);
					}
					if (graphic.geometry.isInstanceOf(Point)) {
						data.items.push({
							name: graphic.attributes[nameAttribute],
							point: graphic.geometry,
							extent: null,
							levelOrFactor: levelOrFactor
						});
					} else {
						data.items.push({
							name: graphic.attributes[nameAttribute],
							point: null,
							extent: graphic.geometry.getExtent()
						});
					}
				}
				data.items.sort(sortByName);
				data = new ItemFileReadStore({ data: data });
			}());
		} else {
			// Convert items to Extents.
			data = { identifier: "name", label: "name", items: [] };
			(function (featureSet) {
				var i;
				for (i in featureSet) {
					if (featureSet.hasOwnProperty(i)) {
						if (featureSet[i].isInstanceOf === undefined) {
							data.items.push({
								name: i,
								extent: geometryJsonUtils.fromJson(featureSet[i])
							});
						}
					}
				}
			}(featureSet));
			data.items.sort(sortByName);
			data = new ItemFileReadStore({ data: data });
		}
		filteringSelect = new FilteringSelect({
			id: domElement.id,
			name: "name",
			store: data,
			searchAttr: "name",
			required: false,
			onChange: function (newValue) {
				var extent, point;

				function showInfoWindow() {
					var infoWindow, geometry, graphic;
					geometry = extent || point || null;
					if (geometry) {
						graphic = new Graphic(geometry, null, {name: newValue}, new InfoTemplate("${name}", "${name}"));
						infoWindow = map.infoWindow;
						infoWindow.clearFeatures();
						infoWindow.setFeatures([graphic]);
						infoWindow.show(point || extent.getCenter());
					}
				}

				if (this.item && this.item.extent) {
					extent = this.item.extent[0];
					point = this.item.point ? this.item.point[0] : null;

					// Set the extent of the map if a map has been defined.
					if (map) {
						try {
							if (point) {
								map.centerAndZoom(point, this.item.levelOrFactor).then(showInfoWindow);
							} else {
								extent.spatialReference.wkid = 3857;
								map.setExtent(extent).then(showInfoWindow);
							}
						} catch (e) {
							/*jslint devel:true*/
							if (!!console && !!console.error) {
								console.error(e);
							}
							/*jslint devel:false*/
						}
					}
				}
				this.reset();
			}
		}, domElement);

		return filteringSelect;
	}

	return createExtentSelect;
});