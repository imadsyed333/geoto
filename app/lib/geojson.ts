import type {
  Feature,
  FeatureCollection,
  Geometry,
  Position,
} from "geojson";
import type { DatasetFormatOption } from "./ckan.ts";

export const FEATURE_LIMIT_OPTIONS = [100, 500, 1000, 5000] as const;
export type FeatureLimit = (typeof FEATURE_LIMIT_OPTIONS)[number];
export const DEFAULT_FEATURE_LIMIT: FeatureLimit = 500;

export interface DatasetFeature
  extends Feature<Geometry | null, Record<string, unknown>> {
  id: number;
}

export type DatasetDataSource =
  | { kind: "datastore"; resourceId: string; label: string }
  | {
      kind: "geojson";
      url: string;
      label: string;
      sizeBytes: number | null;
    };

export interface LoadedDatasetFeatures {
  features: DatasetFeature[];
  columns: string[];
  total: number | null;
  mappedCount: number;
  sourceKind: "datastore" | "geojson";
  truncated: boolean;
}

const VALID_GEOMETRY_TYPES = new Set<Geometry["type"]>([
  "Point",
  "MultiPoint",
  "LineString",
  "MultiLineString",
  "Polygon",
  "MultiPolygon",
  "GeometryCollection",
]);

const GEOMETRY_KEY_PATTERN = /^(geometry|geom|the_geom)$/i;
const HIDDEN_COLUMN_PATTERN = /^(_full_text|geometry|geom|the_geom)$/i;
const LAT_KEYS = ["lat", "latitude", "lat_wgs84", "y"];
const LNG_KEYS = ["lng", "lon", "long", "longitude", "long_wgs84", "x"];

function visitPositions(
  geometry: Geometry,
  visitor: (pos: Position) => boolean | void,
): boolean {
  const walkCoords = (coords: unknown): boolean => {
    if (!Array.isArray(coords) || coords.length === 0) return false;
    if (typeof coords[0] === "number") {
      return visitor(coords as Position) !== false;
    }
    for (const item of coords) {
      if (!walkCoords(item)) return false;
    }
    return true;
  };

  if (geometry.type === "GeometryCollection") {
    for (const child of geometry.geometries ?? []) {
      if (!visitPositions(child, visitor)) return false;
    }
    return true;
  }
  return walkCoords(geometry.coordinates);
}

/**
 * Validates that a GeoJSON geometry has finite WGS84 coordinates and is not
 * purely null-island `[0, 0]` (common in Toronto Open Data redacted rows).
 */
export function isValidGeometry(value: unknown): value is Geometry {
  if (!value || typeof value !== "object") return false;
  const geom = value as Partial<Geometry>;
  if (!geom.type || !VALID_GEOMETRY_TYPES.has(geom.type)) return false;

  let count = 0;
  let hasNonZero = false;
  let valid = true;

  visitPositions(geom as Geometry, (pos) => {
    if (pos.length < 2) {
      valid = false;
      return false;
    }
    const [lng, lat] = pos;
    if (
      typeof lng !== "number" ||
      typeof lat !== "number" ||
      !Number.isFinite(lng) ||
      !Number.isFinite(lat) ||
      lng < -180 ||
      lng > 180 ||
      lat < -90 ||
      lat > 90
    ) {
      valid = false;
      return false;
    }
    count++;
    if (lng !== 0 || lat !== 0) {
      hasNonZero = true;
    }
  });

  return valid && count > 0 && hasNonZero;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function extractGeometryFromRecord(record: Record<string, unknown>): {
  geometry: Geometry | null;
  geometryKey: string | null;
} {
  for (const key of Object.keys(record)) {
    if (!GEOMETRY_KEY_PATTERN.test(key)) continue;
    const raw = record[key];
    let parsed: unknown = raw;
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (!trimmed || trimmed === "None" || trimmed === "null") {
        return { geometry: null, geometryKey: key };
      }
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        return { geometry: null, geometryKey: key };
      }
    }
    return {
      geometry: isValidGeometry(parsed) ? parsed : null,
      geometryKey: key,
    };
  }

  // Fallback for tabular datasets exposing lat/lng columns instead of GeoJSON geometry
  const lowerKeys = new Map<string, string>();
  for (const key of Object.keys(record)) {
    lowerKeys.set(key.toLowerCase(), key);
  }
  const latKey = LAT_KEYS.map((k) => lowerKeys.get(k)).find(Boolean);
  const lngKey = LNG_KEYS.map((k) => lowerKeys.get(k)).find(Boolean);
  if (latKey && lngKey) {
    const lat = toFiniteNumber(record[latKey]);
    const lng = toFiniteNumber(record[lngKey]);
    if (lat !== null && lng !== null) {
      const point: Geometry = { type: "Point", coordinates: [lng, lat] };
      if (isValidGeometry(point)) {
        return { geometry: point, geometryKey: null };
      }
    }
  }

  return { geometry: null, geometryKey: null };
}

export function normalizeGeoJsonFeature(
  raw: unknown,
  id: number,
): DatasetFeature | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as {
    type?: unknown;
    geometry?: unknown;
    properties?: unknown;
  };
  if (candidate.type !== "Feature") return null;

  const geometry = isValidGeometry(candidate.geometry)
    ? candidate.geometry
    : null;
  const rawProps =
    candidate.properties && typeof candidate.properties === "object"
      ? (candidate.properties as Record<string, unknown>)
      : {};

  const properties: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawProps)) {
    if (!HIDDEN_COLUMN_PATTERN.test(k)) {
      properties[k] = v;
    }
  }

  return {
    type: "Feature",
    id,
    geometry,
    properties,
  };
}

export function deriveFeatureColumns(
  features: DatasetFeature[],
  fieldIds?: string[],
): string[] {
  const seen = new Set<string>();
  const columns: string[] = [];

  if (fieldIds) {
    for (const id of fieldIds) {
      if (!HIDDEN_COLUMN_PATTERN.test(id) && !seen.has(id)) {
        seen.add(id);
        columns.push(id);
      }
    }
  }

  for (const feature of features) {
    for (const key of Object.keys(feature.properties)) {
      if (!HIDDEN_COLUMN_PATTERN.test(key) && !seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }

  return columns;
}

export interface RawDatastoreResult {
  records?: Record<string, unknown>[];
  fields?: Array<{ id: string; type?: string }>;
  total?: number;
}

export function datastoreResultToFeatures(
  result: RawDatastoreResult,
): LoadedDatasetFeatures {
  const records = result.records ?? [];
  const features: DatasetFeature[] = [];
  let mappedCount = 0;

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const { geometry, geometryKey } = extractGeometryFromRecord(record);
    if (geometry) mappedCount++;

    const properties: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      if (key === geometryKey || HIDDEN_COLUMN_PATTERN.test(key)) continue;
      properties[key] = value;
    }

    features.push({
      type: "Feature",
      id: i + 1,
      geometry,
      properties,
    });
  }

  const fieldIds = result.fields?.map((f) => f.id);
  const total = typeof result.total === "number" ? result.total : null;

  return {
    features,
    columns: deriveFeatureColumns(features, fieldIds),
    total,
    mappedCount,
    sourceKind: "datastore",
    truncated: total !== null && total > features.length,
  };
}

/**
 * Picks the fastest zero-storage data source for a dataset:
 * 1. CKAN Datastore API (server-side limit, avoids downloading huge files)
 * 2. EPSG:4326 GeoJSON stream (parsed incrementally in a Web Worker and aborted early)
 */
export function pickDatasetDataSources(options: DatasetFormatOption[]): {
  primary: DatasetDataSource | null;
  geojsonFallback: Extract<DatasetDataSource, { kind: "geojson" }> | null;
} {
  const datastore = options.find((opt) => opt.isDatastore);
  const geojson =
    options.find(
      (opt) => opt.format === "GEOJSON" && opt.crs === "EPSG:4326",
    ) ??
    options.find((opt) => opt.format === "GEOJSON" && opt.crs === null) ??
    null;

  const geojsonSource: Extract<DatasetDataSource, { kind: "geojson" }> | null =
    geojson
      ? {
          kind: "geojson",
          url: geojson.downloadUrl,
          label: geojson.label,
          sizeBytes: geojson.sizeBytes,
        }
      : null;

  if (datastore) {
    return {
      primary: {
        kind: "datastore",
        resourceId: datastore.resourceId,
        label: datastore.label,
      },
      geojsonFallback: geojsonSource,
    };
  }

  return {
    primary: geojsonSource,
    geojsonFallback: null,
  };
}

export interface GeometryFocus {
  center: [number, number];
  bounds: [[number, number], [number, number]] | null;
}

export function getGeometryFocus(geometry: Geometry | null): GeometryFocus | null {
  if (!geometry) return null;

  if (geometry.type === "Point") {
    const [lng, lat] = geometry.coordinates;
    return { center: [lng, lat], bounds: null };
  }

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  let firstPoint: [number, number] | null = null;

  visitPositions(geometry, (pos) => {
    const [lng, lat] = pos;
    if (!firstPoint) firstPoint = [lng, lat];
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  });

  if (!firstPoint || !Number.isFinite(minLng)) return null;

  const center: [number, number] = [
    (minLng + maxLng) / 2,
    (minLat + maxLat) / 2,
  ];

  if (minLng === maxLng && minLat === maxLat) {
    return { center, bounds: null };
  }

  return {
    center,
    bounds: [
      [minLng, minLat],
      [maxLng, maxLat],
    ],
  };
}

/**
 * Splits loaded features into MapLibre sources:
 * - `points` for clustered Point layers (Supercluster only indexes Point)
 * - `shapes` for LineString, Polygon, Multi*, and GeometryCollection layers
 */
export function splitFeaturesForMap(features: DatasetFeature[]): {
  points: FeatureCollection;
  shapes: FeatureCollection;
} {
  const pointFeatures: Feature<Geometry, Record<string, unknown>>[] = [];
  const shapeFeatures: Feature<Geometry, Record<string, unknown>>[] = [];

  for (const feature of features) {
    const { geometry } = feature;
    if (!geometry) continue;
    const mapped: Feature<Geometry, Record<string, unknown>> = {
      type: "Feature",
      id: feature.id,
      geometry,
      properties: feature.properties,
    };
    if (geometry.type === "Point") {
      pointFeatures.push(mapped);
    } else {
      shapeFeatures.push(mapped);
    }
  }

  return {
    points: { type: "FeatureCollection", features: pointFeatures },
    shapes: { type: "FeatureCollection", features: shapeFeatures },
  };
}

export interface GeoJsonFeatureStreamParser {
  push: (chunk: string) => DatasetFeature[];
  readonly count: number;
  readonly done: boolean;
  readonly hitLimit: boolean;
  readonly foundFeaturesArray: boolean;
}

/**
 * Incremental streaming extractor for GeoJSON `FeatureCollection` streams.
 * Extracts up to `limit` items from the top-level `"features": [...]` array
 * without buffering or parsing the entire file.
 *
 * ponytail: streams up to 5,000 features client-side then aborts the fetch;
 * full-catalog rendering of 500k+ feature datasets (e.g. Traffic Collisions
 * at 825k rows, SolarTO at 566 MB) requires pre-converting to PMTiles via
 * tippecanoe + object storage.
 */
export function createGeoJsonFeatureStreamParser(
  limit: number,
): GeoJsonFeatureStreamParser {
  const safeLimit = Math.max(1, Math.floor(limit));

  let stage: "SEARCHING" | "IN_FEATURES" | "DONE" = "SEARCHING";
  let hitLimit = false;
  let foundFeaturesArray = false;
  let count = 0;

  // Header scanning state (before entering "features": [)
  let objectDepth = 0;
  let arrayDepth = 0;
  let inString = false;
  let escaped = false;
  let capturingKey = false;
  let currentKey = "";
  let sawFeaturesKey = false;
  let expectFeaturesArray = false;

  // Feature object extraction state (inside "features": [)
  let featureDepth = 0;
  let featureBuffer = "";

  function push(chunk: string): DatasetFeature[] {
    if (stage === "DONE" || chunk.length === 0) return [];
    const extracted: DatasetFeature[] = [];
    let i = 0;

    if (stage === "SEARCHING") {
      while (i < chunk.length && stage === "SEARCHING") {
        const ch = chunk[i++];

        if (inString) {
          if (escaped) {
            if (capturingKey) currentKey += ch;
            escaped = false;
            continue;
          }
          if (ch === "\\") {
            if (capturingKey) currentKey += ch;
            escaped = true;
            continue;
          }
          if (ch === '"') {
            inString = false;
            if (capturingKey) {
              capturingKey = false;
              sawFeaturesKey = currentKey === "features";
              currentKey = "";
            }
            continue;
          }
          if (capturingKey) {
            currentKey += ch;
          }
          continue;
        }

        if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
          continue;
        }

        if (expectFeaturesArray) {
          if (ch === "[") {
            stage = "IN_FEATURES";
            foundFeaturesArray = true;
            expectFeaturesArray = false;
            sawFeaturesKey = false;
            break;
          }
          expectFeaturesArray = false;
          sawFeaturesKey = false;
        } else if (sawFeaturesKey) {
          if (ch === ":") {
            expectFeaturesArray = true;
            sawFeaturesKey = false;
            continue;
          }
          sawFeaturesKey = false;
        }

        if (ch === '"') {
          inString = true;
          if (objectDepth === 1 && arrayDepth === 0) {
            capturingKey = true;
            currentKey = "";
          }
        } else if (ch === "{") {
          objectDepth++;
        } else if (ch === "}") {
          objectDepth = Math.max(0, objectDepth - 1);
        } else if (ch === "[") {
          arrayDepth++;
        } else if (ch === "]") {
          arrayDepth = Math.max(0, arrayDepth - 1);
        }
      }
    }

    if (stage === "IN_FEATURES") {
      let sliceStart = featureDepth > 0 ? i : -1;

      while (i < chunk.length && stage === "IN_FEATURES") {
        const ch = chunk[i];

        if (featureDepth === 0) {
          if (ch === "{") {
            featureDepth = 1;
            featureBuffer = "";
            sliceStart = i;
          } else if (ch === "]") {
            stage = "DONE";
            break;
          }
          i++;
          continue;
        }

        if (inString) {
          if (escaped) {
            escaped = false;
          } else if (ch === "\\") {
            escaped = true;
          } else if (ch === '"') {
            inString = false;
          }
          i++;
          continue;
        }

        if (ch === '"') {
          inString = true;
        } else if (ch === "{") {
          featureDepth++;
        } else if (ch === "}") {
          featureDepth--;
          if (featureDepth === 0) {
            const rawJson = featureBuffer + chunk.slice(sliceStart, i + 1);
            featureBuffer = "";
            sliceStart = -1;

            try {
              const parsed = JSON.parse(rawJson);
              const normalized = normalizeGeoJsonFeature(parsed, count + 1);
              if (normalized) {
                count++;
                extracted.push(normalized);
                if (count >= safeLimit) {
                  hitLimit = true;
                  stage = "DONE";
                  break;
                }
              }
            } catch {
              // Skip malformed feature rather than failing the whole stream
            }
          }
        }
        i++;
      }

      if (stage === "IN_FEATURES" && featureDepth > 0 && sliceStart >= 0) {
        featureBuffer += chunk.slice(sliceStart);
      }
    }

    return extracted;
  }

  return {
    push,
    get count() {
      return count;
    },
    get done() {
      return stage === "DONE";
    },
    get hitLimit() {
      return hitLimit;
    },
    get foundFeaturesArray() {
      return foundFeaturesArray;
    },
  };
}
