﻿using Google.KML;
using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace Wsdot.Gis.Conversion
{
	/// <summary>
	/// Converts ArcGIS Server JSON representations of graphics to other formats.
	/// </summary>
	public static class ConversionUtilities
	{
		private static readonly Regex _geometryInNameRe = new Regex("(?in)Geometry$");

		public static geKML LayersDictionaryToKml(this Dictionary<string, object> layers)
		{
			var kmlDocument = new geDocument();

			foreach (var kvp in layers)
			{
				var folder = new geFolder { Name = kvp.Key };
				kmlDocument.Features.Add(folder);
				var graphics = kvp.Value as ArrayList;
				foreach (Dictionary<string, object> graphic in graphics)
				{
					var placemark = new gePlacemark();
					folder.Features.Add(placemark);
					placemark.Geometry = JsonToKmlGeometry(graphic["geometry"] as Dictionary<string, object>);
					var attributesJson = (Dictionary<string, object>)graphic["attributes"];
					attributesJson.Remove("RouteGeometry");
					////if (attributesJson.Keys.Contains("BufferedGeometry") && attributesJson.Keys.Contains("BufferSize") && Convert.ToDouble(attributesJson["BufferSize"]) > 0)
					////{
					////    // TODO: Set the placemark geometry to a multi-geometry containing both the main and buffered geometries.
					////}
					string desc = ToHtmlDL(attributesJson);
					placemark.Description = desc;

				}
			}

			var kml = new geKML(kmlDocument);
			return kml;
		}

		public static geGeometry JsonToKmlGeometry(Dictionary<string, object> geometry)
		{
			geGeometry placemarkGeometry;
			if (geometry.Keys.Contains("x"))
			{
				// Create point geometry
				// x and y are decimals;
				var x = Convert.ToDouble(geometry["x"]);
				var y = Convert.ToDouble(geometry["y"]);
				placemarkGeometry = new gePoint(new geCoordinates(new geAngle90(y), new geAngle180(x)));
			}
			else if (geometry.Keys.Contains("rings"))
			{
				// Create polygon geometry
				var rings = (ArrayList)geometry["rings"];

				var linearRings = from ArrayList ring in rings
								  select new geLinearRing((from ArrayList point in ring
														   select new geCoordinates(
															   new geAngle90(Convert.ToDouble(point[1])),
															   new geAngle180(Convert.ToDouble(point[0]))
															)).ToList());
				if (linearRings.Count() > 1)
				{
					var polygon = new gePolygon(new geOuterBoundaryIs(linearRings.ElementAt(0)));
					polygon.InnerBoundaries.AddRange(from ring in linearRings.Skip(1)
													 select new geInnerBoundaryIs(ring));
					placemarkGeometry = polygon;
				}
				else
				{
					placemarkGeometry = linearRings.First();
				}
			}
			else if (geometry.Keys.Contains("paths"))
			{
				// Create line geometry
				var paths = (ArrayList)geometry["paths"];

				var lineStrings = from ArrayList ring in paths
								  select new geLineString((from ArrayList point in ring
														   select new geCoordinates(
															   new geAngle90(Convert.ToDouble(point[1])),
															   new geAngle180(Convert.ToDouble(point[0]))
															)).ToList());
				if (lineStrings.Count() > 1)
				{
					var multiGeo = new geMultiGeometry();
					multiGeo.Geometries.AddRange(lineStrings);
					placemarkGeometry = multiGeo;
				}
				else
				{
					placemarkGeometry = lineStrings.First();
				}

			}
			else
			{
				placemarkGeometry = null;
			}
			return placemarkGeometry;
		}

		public static string ToHtmlDL(Dictionary<string, object> attributes)
		{
			var descriptionBuilder = new StringBuilder("<dl>");
			foreach (var attribute in attributes)
			{
				if (_geometryInNameRe.IsMatch(attribute.Key))
				{
					// Ignore geometry fields.
					continue;
				}
				else if (string.Compare("QueryResults", attribute.Key, StringComparison.OrdinalIgnoreCase) == 0)
				{
					descriptionBuilder.Append("<dt>Query Results</dt>");
					descriptionBuilder.Append("<dd>");
					var queryResults = (ArrayList)attribute.Value;
					foreach (Dictionary<string, object> qr in queryResults)
					{
						var layerInfo = qr["LayerInfo"] as Dictionary<string, object>;
						var resultTable = ((ArrayList)qr["ResultTable"]).Cast<Dictionary<string, object>>();
						if (resultTable != null && resultTable.Count() > 0)
						{
							descriptionBuilder.Append(ToHtmlTable(resultTable));
						}
					}
					descriptionBuilder.Append("</dd>");
				}
				else
				{
					descriptionBuilder.AppendFormat("<dt>{0}</dt><dd>{1}</dd>", attribute.Key, attribute.Value);
				}
			}
			descriptionBuilder.Append("</dl>");


			return descriptionBuilder.ToString();
		}

		/// <summary>
		/// Converts a list of dictionaries to an HTML table.  The keys of the dictionaries are assumed to be identical.
		/// </summary>
		/// <param name="attributes"></param>
		/// <returns></returns>
		public static string ToHtmlTable(IEnumerable<Dictionary<string, object>> attributes)
		{
			StringBuilder builder = new StringBuilder("<table>");
			string[] keys = attributes.First(o => o != null).Select(o => o.Key).ToArray();
			builder.Append("<thead><tr>");
			foreach (var key in keys)
			{
				builder.AppendFormat("<th>{0}</th>", key);
			}
			builder.Append("</tr></thead>");

			builder.Append("<tbody>");

			foreach (var attr in attributes)
			{
				builder.Append("<tr>");
				foreach (var key in keys)
				{
					builder.AppendFormat("<td>{0}</td>", attr[key]);
				}
				builder.Append("</tr>");
			}
			builder.Append("</tbody></table>");


			return builder.ToString();
		}
	}
}