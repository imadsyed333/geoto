import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildFormatOptions } from "./ckan.ts";
import {
  createGeoJsonFeatureStreamParser,
  datastoreResultToFeatures,
  getGeometryFocus,
  pickDatasetDataSources,
  splitFeaturesForMap,
} from "./geojson.ts";

describe("GeoJSON datastore conversion & streaming", () => {
  it("converts datastore records, excludes geometry column, rejects [0,0], and supports lat/lng fallback", () => {
    const loaded = datastoreResultToFeatures({
      total: 42,
      fields: [
        { id: "_id", type: "int" },
        { id: "name", type: "text" },
        { id: "geometry", type: "text" },
      ],
      records: [
        {
          _id: 1,
          name: "Nathan Phillips Square",
          geometry: '{"type":"Point","coordinates":[-79.3835,43.6525]}',
        },
        {
          _id: 2,
          name: "Redacted Incident",
          geometry: '{"type":"Point","coordinates":[0.0,0.0]}',
        },
        {
          _id: 3,
          name: "Tabular Fallback",
          lat: "43.6426",
          lng: "-79.3871",
        },
      ],
    });

    assert.equal(loaded.total, 42);
    assert.equal(loaded.truncated, true);
    assert.equal(loaded.features.length, 3);
    assert.equal(loaded.mappedCount, 2);
    assert.deepEqual(loaded.columns, ["_id", "name", "lat", "lng"]);

    assert.deepEqual(loaded.features[0].geometry, {
      type: "Point",
      coordinates: [-79.3835, 43.6525],
    });
    assert.equal("geometry" in loaded.features[0].properties, false);
    assert.equal(loaded.features[1].geometry, null);
    assert.deepEqual(loaded.features[2].geometry, {
      type: "Point",
      coordinates: [-79.3871, 43.6426],
    });
  });

  it("streams GeoJSON features across arbitrary tiny chunks with escaped braces and stops early at limit", () => {
    const sampleGeoJson = JSON.stringify({
      type: "FeatureCollection",
      name: "features",
      crs: { type: "name", properties: { features: "nested-decoy" } },
      features: [
        {
          type: "Feature",
          properties: {
            note: 'Escaped "quote" and } brace { inside string \\\\',
          },
          geometry: { type: "Point", coordinates: [-79.4, 43.65] },
        },
        {
          type: "Feature",
          properties: { street: "Bloor St W" },
          geometry: {
            type: "LineString",
            coordinates: [
              [-79.41, 43.66],
              [-79.39, 43.67],
            ],
          },
        },
        {
          type: "Feature",
          properties: { shouldNotLoad: true },
          geometry: { type: "Point", coordinates: [-79.38, 43.65] },
        },
      ],
    });

    // Feed 3-character chunks to torture-test every boundary split
    const parser = createGeoJsonFeatureStreamParser(2);
    const collected = [];
    let chunksConsumed = 0;

    for (let i = 0; i < sampleGeoJson.length; i += 3) {
      chunksConsumed++;
      collected.push(...parser.push(sampleGeoJson.slice(i, i + 3)));
      if (parser.done) break;
    }

    assert.equal(parser.foundFeaturesArray, true);
    assert.equal(parser.hitLimit, true);
    assert.equal(collected.length, 2);
    assert.equal(
      collected[0].properties.note,
      'Escaped "quote" and } brace { inside string \\\\',
    );
    assert.equal(collected[1].geometry?.type, "LineString");
    assert.ok(chunksConsumed < Math.ceil(sampleGeoJson.length / 3));
  });

  it("splits points vs shapes and computes focus bounds for lines and points", () => {
    const loaded = datastoreResultToFeatures({
      records: [
        {
          _id: 1,
          geometry: '{"type":"Point","coordinates":[-79.4,43.65]}',
        },
        {
          _id: 2,
          geometry:
            '{"type":"Polygon","coordinates":[[[-79.5,43.6],[-79.4,43.6],[-79.4,43.7],[-79.5,43.7],[-79.5,43.6]]]}',
        },
      ],
    });

    const split = splitFeaturesForMap(loaded.features);
    assert.equal(split.points.features.length, 1);
    assert.equal(split.shapes.features.length, 1);

    const ptFocus = getGeometryFocus(loaded.features[0].geometry);
    assert.deepEqual(ptFocus, { center: [-79.4, 43.65], bounds: null });

    const polyFocus = getGeometryFocus(loaded.features[1].geometry);
    assert.ok(polyFocus);
    assert.ok(Math.abs(polyFocus.center[0] - -79.45) < 1e-9);
    assert.ok(Math.abs(polyFocus.center[1] - 43.65) < 1e-9);
    assert.deepEqual(polyFocus.bounds, [
      [-79.5, 43.6],
      [-79.4, 43.7],
    ]);
  });

  it("prefers Datastore primary with EPSG:4326 GeoJSON fallback and ignores EPSG:2952-only", () => {
    const withBoth = pickDatasetDataSources(
      buildFormatOptions([
        {
          id: "ds-1",
          format: "GeoJSON",
          url: "https://ckan0.cf.opendata.inter.prod-toronto.ca/datastore/dump/ds-1",
          datastore_active: true,
        },
        {
          id: "gj-4326",
          name: "layer-4326.geojson",
          format: "GeoJSON",
          url: "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/x/resource/y/download/layer-4326.geojson",
        },
      ]),
    );
    assert.equal(withBoth.primary?.kind, "datastore");
    assert.equal(withBoth.geojsonFallback?.kind, "geojson");

    const geojsonOnly = pickDatasetDataSources(
      buildFormatOptions([
        {
          id: "gj-2952",
          name: "layer-2952.geojson",
          format: "GeoJSON",
          url: "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/x/resource/y/download/layer-2952.geojson",
        },
      ]),
    );
    assert.equal(geojsonOnly.primary, null);
  });
});
