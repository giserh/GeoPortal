﻿/*global esri, dojo, jQuery */
/*jslint white: true, undef: true, nomen: true, regexp: true, plusplus: true, bitwise: true, newcap: true, maxerr: 50, indent: 4 */

/*
Copyright (c) 2011 Washington State Department of Transportation

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>
*/

/*
This jQuery plugin is used to create a layer list control for an ArcGIS JavaScript API web application.
Prerequisites:
ArcGIS JavaScript API
*/
/// <reference path="dojo.js.uncompressed.js" />


dojo.require("esri.layers.graphics");

dojo.declare("wsdot.layers.CameraGraphicsLayer", esri.layers.GraphicsLayer, {
    onRefreshStart: function () {
    },
    onRefreshEnd: function (error) {
    },
    constructor: function (options) {
        this.url = options.url;
        this._options = options;
        this.refresh();
    },
    refresh: function () {
        this.clear();
        this.onRefreshStart();

        var layer = this;
        if (this._options.renderer) {
            layer.setRenderer(this._options.renderer);
        }

        return dojo.xhrGet({
            url: layer.url,
            handleAs: "json",
            load: function (data) {
                try {

                    var graphic;
                    var point;
                    dojo.forEach(data, function (graphicJson, index, array) {
                        point = esri.geometry.fromJson(graphicJson.geometry);
                        // Convert the point from geo. to WebMercator if that option was specified.
                        if (layer._options.toWebMercator) {
                            point = esri.geometry.geographicToWebMercator(point)
                        }
                        graphic = new esri.Graphic({ geometry: point, attributes: graphicJson.attributes });
                        layer.add(graphic);
                    }, layer);

                    layer.onRefreshEnd();
                } catch (e) {
                    layer.onRefreshEnd(e);
                }
            },
            error: function (error) {
                layer.onRefreshEnd(error);
            }
        }, { useProxy: false });
    }
});
