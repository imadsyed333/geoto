import {
  createGeoJsonFeatureStreamParser,
  deriveFeatureColumns,
  type DatasetFeature,
} from "../lib/geojson.ts";

export type GeoJsonWorkerRequest =
  | { type: "start"; url: string; limit: number }
  | { type: "abort" };

export type GeoJsonWorkerResponse =
  | { type: "progress"; loaded: number; bytesRead: number }
  | {
      type: "complete";
      features: DatasetFeature[];
      columns: string[];
      mappedCount: number;
      truncated: boolean;
      bytesRead: number;
    }
  | { type: "error"; message: string };

let activeController: AbortController | null = null;

/**
 * Streams an EPSG:4326 GeoJSON resource off the main thread, extracting up to
 * `limit` features incrementally and aborting the HTTP stream immediately once
 * the limit is reached.
 *
 * ponytail: client-side streaming caps interactive previews at 5,000 features;
 * full-catalog rendering of 500k+ feature datasets (e.g., Traffic Collisions
 * at 825k rows, SolarTO at 566 MB) requires pre-converting to PMTiles via
 * tippecanoe + object storage.
 */
self.onmessage = async (event: MessageEvent<GeoJsonWorkerRequest>) => {
  const msg = event.data;

  if (msg.type === "abort") {
    activeController?.abort();
    activeController = null;
    return;
  }

  if (msg.type !== "start") return;

  activeController?.abort();
  const controller = new AbortController();
  activeController = controller;

  const features: DatasetFeature[] = [];
  let mappedCount = 0;
  let bytesRead = 0;
  let lastProgressCount = 0;

  try {
    const response = await fetch(msg.url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Failed to stream GeoJSON (${response.status})`);
    }
    if (!response.body) {
      throw new Error("Streaming response body is unavailable in this browser");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    const parser = createGeoJsonFeatureStreamParser(msg.limit);

    try {
      while (!parser.done) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;

        bytesRead += value.byteLength;
        const text = decoder.decode(value, { stream: true });
        const batch = parser.push(text);
        for (const feature of batch) {
          if (feature.geometry) mappedCount++;
          features.push(feature);
        }

        if (features.length - lastProgressCount >= 50) {
          lastProgressCount = features.length;
          self.postMessage({
            type: "progress",
            loaded: features.length,
            bytesRead,
          } satisfies GeoJsonWorkerResponse);
        }

        if (parser.done) {
          controller.abort();
          await reader.cancel().catch(() => {});
          break;
        }
      }

      if (!parser.done) {
        const tail = decoder.decode();
        if (tail) {
          for (const feature of parser.push(tail)) {
            if (feature.geometry) mappedCount++;
            features.push(feature);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (!parser.foundFeaturesArray && features.length === 0) {
      throw new Error("GeoJSON resource did not contain a FeatureCollection");
    }

    if (activeController === controller) {
      activeController = null;
      self.postMessage({
        type: "complete",
        features,
        columns: deriveFeatureColumns(features),
        mappedCount,
        truncated: parser.hitLimit,
        bytesRead,
      } satisfies GeoJsonWorkerResponse);
    }
  } catch (error) {
    if (controller.signal.aborted) {
      return;
    }
    if (activeController === controller) {
      activeController = null;
      self.postMessage({
        type: "error",
        message:
          error instanceof Error ? error.message : "Failed to stream GeoJSON",
      } satisfies GeoJsonWorkerResponse);
    }
  }
};
