import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildFormatOptions,
  CKAN_BASE_URL,
  formatBytes,
  formatDate,
  normalizeDataset,
  normalizeSearchResult,
  type RawCkanPackage,
} from "./ckan.ts";

describe("CKAN normalization", () => {
  it("normalizes search card fields with fallbacks", () => {
    const pkg: RawCkanPackage = {
      id: "abc-123",
      name: "traffic-collisions",
      title: "Traffic Collisions",
      excerpt: "Motor vehicle [collisions](https://example.com) since 2014.",
      notes: "Longer notes",
      refresh_rate: "Annually",
      metadata_modified: "2026-11-23T22:21:19.508558",
      organization: { title: "City of Toronto" },
      formats: ["csv", "GeoJSON", "CSV"],
      topics: ["Public safety", "Public safety"],
    };

    const result = normalizeSearchResult(pkg);
    assert.equal(result.slug, "traffic-collisions");
    assert.equal(result.title, "Traffic Collisions");
    assert.equal(result.description, "Motor vehicle collisions since 2014.");
    assert.equal(result.refreshRate, "Annually");
    assert.equal(result.lastRefreshed, "2026-11-23T22:21:19.508558");
    assert.equal(result.publisher, "City of Toronto");
    assert.deepEqual(result.formats, ["CSV", "GEOJSON"]);
    assert.deepEqual(result.topics, ["Public safety"]);
  });

  it("handles missing optional dataset metadata gracefully and preserves markdown descriptions", () => {
    const markdownNotes =
      "A **minimal** layer.\n\n- Includes [docs](https://example.com)";
    const pkg: RawCkanPackage = {
      id: "min-1",
      name: "minimal-layer",
      notes: `  ${markdownNotes}  `,
      license_id: "open-government-licence-toronto",
      maintainer_email: "gis@toronto.ca",
      owner_division: "Transportation Services",
      owner_unit: "Cycling",
    };

    const dataset = normalizeDataset(pkg);
    assert.equal(dataset.title, "minimal-layer");
    assert.equal(dataset.description, markdownNotes);
    assert.equal(dataset.publisher, "Transportation Services — Cycling");
    assert.equal(dataset.contactInfo, "gis@toronto.ca");
    assert.equal(dataset.licence, "open-government-licence-toronto");
    assert.equal(dataset.datePublished, null);
    assert.deepEqual(dataset.civicIssues, []);
    assert.deepEqual(dataset.formatOptions, []);
  });

  it("deduplicates historical resources, prioritizes EPSG:4326, and exposes Datastore API", () => {
    const options = buildFormatOptions([
      {
        id: "ds-old",
        name: "Old Datastore",
        format: "GeoJSON",
        url: "https://ckan0.cf.opendata.inter.prod-toronto.ca/datastore/dump/ds-old",
        datastore_active: true,
        created: "2020-01-01T00:00:00",
      },
      {
        id: "ds-new",
        name: "Current Datastore",
        format: "GeoJSON",
        url: "https://ckan0.cf.opendata.inter.prod-toronto.ca/datastore/dump/ds-new",
        datastore_active: true,
        created: "2024-01-01T00:00:00",
      },
      {
        id: "g-2952",
        name: "Layer - 2952.geojson",
        format: "GeoJSON",
        url: "https://example.com/layer-2952.geojson",
        last_modified: "2026-11-20T00:00:00",
      },
      {
        id: "g-4326-old",
        name: "Layer - 4326.geojson",
        format: "GeoJSON",
        url: "https://example.com/layer-4326-old.geojson",
        last_modified: "2024-01-01T00:00:00",
      },
      {
        id: "g-4326-new",
        name: "Layer - 4326.geojson",
        format: "geojson",
        url: "https://example.com/layer-4326-new.geojson",
        last_modified: "2026-11-23T00:00:00",
        size: 1048576,
      },
      {
        id: "shp-4326",
        name: "Layer - 4326.zip",
        format: "SHP",
        url: "https://example.com/layer-4326.zip",
        last_modified: "2026-11-23T00:00:00",
      },
    ]);

    assert.equal(options.length, 4);
    assert.equal(options[0].label, "GeoJSON (EPSG:4326)");
    assert.equal(options[0].downloadUrl, "https://example.com/layer-4326-new.geojson");
    assert.equal(options[0].sizeBytes, 1048576);

    assert.equal(options[1].label, "Datastore JSON API");
    assert.equal(
      options[1].apiUrl,
      `${CKAN_BASE_URL}/datastore_search?resource_id=ds-new`,
    );
    assert.equal(
      options[1].downloadUrl,
      "https://ckan0.cf.opendata.inter.prod-toronto.ca/datastore/dump/ds-new",
    );

    assert.equal(options[2].label, "SHP (EPSG:4326)");
    assert.equal(options[3].label, "GeoJSON (EPSG:2952)");
  });

  it("formats CKAN timestamps and byte counts", () => {
    assert.equal(formatDate("2026-11-23 22:20:07.576899"), "Nov 23, 2026");
    assert.equal(formatDate(null), "—");
    assert.equal(formatBytes(1048576), "1.0 MB");
    assert.equal(formatBytes(null), null);
  });
});
