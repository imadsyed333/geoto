import type { FeatureCollection, Point } from "geojson";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getGeometryFocus,
  splitFeaturesForMap,
  type DatasetFeature,
} from "~/lib/geojson";

const TORONTO_CENTER: [number, number] = [-79.3832, 43.6532];
const TORONTO_MAX_BOUNDS: [[number, number], [number, number]] = [
  [-79.64, 43.58],
  [-79.11, 43.86],
];
const OPENFREEMAP_POSITRON_STYLE =
  "https://tiles.openfreemap.org/styles/positron";

const EMPTY_FC: FeatureCollection = { type: "FeatureCollection", features: [] };

const INTERACTIVE_LAYERS = [
  "dataset-unclustered-point",
  "dataset-multipoint",
  "dataset-line",
  "dataset-polygon-fill",
] as const;

export interface MapFocusRequest {
  featureId: number;
  nonce: number;
}

interface TorontoMapProps {
  features?: DatasetFeature[];
  selectedFeatureId?: number | null;
  focusRequest?: MapFocusRequest | null;
  onSelectFeature?: (featureId: number | null) => void;
  loading?: boolean;
  loadingLabel?: string | null;
}

function formatPropValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function buildPopupElement(feature: DatasetFeature): HTMLElement {
  const root = document.createElement("div");
  root.className = "max-w-[280px] text-xs text-slate-800";

  const entries = Object.entries(feature.properties).filter(([, value]) => {
    const str = formatPropValue(value).trim();
    return str.length > 0;
  });

  if (entries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "text-slate-500";
    empty.textContent = `Feature #${feature.id}`;
    root.appendChild(empty);
    return root;
  }

  const maxRows = 8;
  const list = document.createElement("dl");
  list.className = "max-h-56 space-y-1.5 overflow-y-auto pr-1";

  for (const [key, value] of entries.slice(0, maxRows)) {
    const row = document.createElement("div");
    row.className = "border-b border-slate-100 pb-1 last:border-b-0 last:pb-0";

    const dt = document.createElement("dt");
    dt.className =
      "text-[10px] font-semibold uppercase tracking-wide text-slate-500";
    dt.textContent = key;

    const dd = document.createElement("dd");
    dd.className = "mt-0.5 break-words text-slate-900";
    const text = formatPropValue(value);
    dd.textContent = text.length > 160 ? `${text.slice(0, 157)}…` : text;

    row.appendChild(dt);
    row.appendChild(dd);
    list.appendChild(row);
  }

  root.appendChild(list);

  if (entries.length > maxRows) {
    const more = document.createElement("p");
    more.className = "mt-1.5 text-[11px] text-slate-500";
    more.textContent = `+${entries.length - maxRows} more attributes in table`;
    root.appendChild(more);
  }

  return root;
}

export function TorontoMap({
  features = [],
  selectedFeatureId = null,
  focusRequest = null,
  onSelectFeature,
  loading = false,
  loadingLabel = null,
}: TorontoMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const maplibreglRef = useRef<typeof import("maplibre-gl") | null>(null);
  const popupRef = useRef<import("maplibre-gl").Popup | null>(null);
  const mapReadyRef = useRef(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const onSelectFeatureRef = useRef(onSelectFeature);
  onSelectFeatureRef.current = onSelectFeature;

  const { points, shapes, featuresById } = useMemo(() => {
    const split = splitFeaturesForMap(features);
    const byId = new Map<number, DatasetFeature>();
    for (const feature of features) {
      byId.set(feature.id, feature);
    }
    return { ...split, featuresById: byId };
  }, [features]);

  const latestDataRef = useRef({ points, shapes, featuresById });
  latestDataRef.current = { points, shapes, featuresById };

  const selectedFeature =
    selectedFeatureId !== null
      ? (featuresById.get(selectedFeatureId) ?? null)
      : null;
  const selectedFeatureRef = useRef(selectedFeature);
  selectedFeatureRef.current = selectedFeature;

  function openFeaturePopup(feature: DatasetFeature, lngLat: [number, number]) {
    const map = mapRef.current;
    const maplibregl = maplibreglRef.current;
    if (!map || !maplibregl) return;

    popupRef.current?.remove();
    const popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: true,
      maxWidth: "300px",
    })
      .setLngLat(lngLat)
      .setDOMContent(buildPopupElement(feature))
      .addTo(map);
    popupRef.current = popup;
  }

  function syncSources() {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;

    const pointsSource = map.getSource("dataset-points") as
      | import("maplibre-gl").GeoJSONSource
      | undefined;
    const shapesSource = map.getSource("dataset-shapes") as
      | import("maplibre-gl").GeoJSONSource
      | undefined;
    const selectedSource = map.getSource("dataset-selected") as
      | import("maplibre-gl").GeoJSONSource
      | undefined;

    pointsSource?.setData(latestDataRef.current.points);
    shapesSource?.setData(latestDataRef.current.shapes);

    const sel = selectedFeatureRef.current;
    selectedSource?.setData(
      sel && sel.geometry
        ? {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                id: sel.id,
                geometry: sel.geometry,
                properties: sel.properties,
              },
            ],
          }
        : EMPTY_FC,
    );
  }

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let mapInstance: import("maplibre-gl").Map | null = null;

    void import("maplibre-gl")
      .then((maplibregl) => {
        if (cancelled || !containerRef.current) return;
        maplibreglRef.current = maplibregl;

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: OPENFREEMAP_POSITRON_STYLE,
          center: TORONTO_CENTER,
          zoom: 10.5,
          minZoom: 9.5,
          maxBounds: TORONTO_MAX_BOUNDS,
          attributionControl: { compact: true },
        });

        map.addControl(new maplibregl.NavigationControl(), "top-right");
        map.addControl(
          new maplibregl.ScaleControl({ unit: "metric" }),
          "bottom-left",
        );

        map.on("load", () => {
          if (cancelled) return;

          map.addSource("dataset-points", {
            type: "geojson",
            data: latestDataRef.current.points,
            cluster: true,
            clusterMaxZoom: 14,
            clusterRadius: 48,
          });

          map.addSource("dataset-shapes", {
            type: "geojson",
            data: latestDataRef.current.shapes,
          });

          map.addSource("dataset-selected", {
            type: "geojson",
            data: EMPTY_FC,
          });

          // Polygons
          map.addLayer({
            id: "dataset-polygon-fill",
            type: "fill",
            source: "dataset-shapes",
            filter: ["==", ["geometry-type"], "Polygon"],
            paint: {
              "fill-color": "#0d9488",
              "fill-opacity": 0.22,
            },
          });

          map.addLayer({
            id: "dataset-polygon-outline",
            type: "line",
            source: "dataset-shapes",
            filter: ["==", ["geometry-type"], "Polygon"],
            paint: {
              "line-color": "#0f766e",
              "line-width": 1.5,
            },
          });

          // Lines
          map.addLayer({
            id: "dataset-line",
            type: "line",
            source: "dataset-shapes",
            filter: ["==", ["geometry-type"], "LineString"],
            paint: {
              "line-color": "#0d9488",
              "line-width": 2.5,
              "line-opacity": 0.85,
            },
          });

          // MultiPoint features (Supercluster only indexes single Point)
          map.addLayer({
            id: "dataset-multipoint",
            type: "circle",
            source: "dataset-shapes",
            filter: ["==", ["geometry-type"], "Point"],
            paint: {
              "circle-color": "#0d9488",
              "circle-radius": 5.5,
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 1.5,
            },
          });

          // Point clusters
          map.addLayer({
            id: "dataset-clusters",
            type: "circle",
            source: "dataset-points",
            filter: ["has", "point_count"],
            paint: {
              "circle-color": [
                "step",
                ["get", "point_count"],
                "#14b8a6",
                25,
                "#0f766e",
                150,
                "#115e59",
              ],
              "circle-radius": [
                "step",
                ["get", "point_count"],
                15,
                25,
                20,
                150,
                25,
              ],
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 2,
            },
          });

          map.addLayer({
            id: "dataset-cluster-count",
            type: "symbol",
            source: "dataset-points",
            filter: ["has", "point_count"],
            layout: {
              "text-field": ["get", "point_count_abbreviated"],
              "text-font": ["Noto Sans Bold"],
              "text-size": 12,
            },
            paint: {
              "text-color": "#ffffff",
            },
          });

          // Unclustered points
          map.addLayer({
            id: "dataset-unclustered-point",
            type: "circle",
            source: "dataset-points",
            filter: ["!", ["has", "point_count"]],
            paint: {
              "circle-color": "#0d9488",
              "circle-radius": 5.5,
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 1.5,
            },
          });

          // Selected feature highlight layers (renders on top of clusters & shapes)
          map.addLayer({
            id: "dataset-selected-polygon-fill",
            type: "fill",
            source: "dataset-selected",
            filter: ["==", ["geometry-type"], "Polygon"],
            paint: {
              "fill-color": "#f59e0b",
              "fill-opacity": 0.35,
            },
          });

          map.addLayer({
            id: "dataset-selected-line",
            type: "line",
            source: "dataset-selected",
            filter: [
              "any",
              ["==", ["geometry-type"], "LineString"],
              ["==", ["geometry-type"], "Polygon"],
            ],
            paint: {
              "line-color": "#d97706",
              "line-width": 3.5,
            },
          });

          map.addLayer({
            id: "dataset-selected-point",
            type: "circle",
            source: "dataset-selected",
            filter: ["==", ["geometry-type"], "Point"],
            paint: {
              "circle-color": "#f59e0b",
              "circle-radius": 8,
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 2.5,
            },
          });

          // Cluster zoom-in click handler
          map.on("click", "dataset-clusters", (event) => {
            const clusterFeature = event.features?.[0];
            if (!clusterFeature) return;
            const clusterId = Number(clusterFeature.properties?.cluster_id);
            const source = map.getSource("dataset-points") as
              | import("maplibre-gl").GeoJSONSource
              | undefined;
            if (!source || Number.isNaN(clusterId)) return;

            const coords = (clusterFeature.geometry as Point).coordinates as [
              number,
              number,
            ];
            void source
              .getClusterExpansionZoom(clusterId)
              .then((zoom) => {
                if (!cancelled) {
                  map.easeTo({ center: coords, zoom });
                }
              })
              .catch(() => {});
          });

          // Feature click handler (single listener over interactive layers)
          map.on("click", (event) => {
            const clusterHits = map.queryRenderedFeatures(event.point, {
              layers: ["dataset-clusters"],
            });
            if (clusterHits.length > 0) return;

            const hits = map.queryRenderedFeatures(event.point, {
              layers: [...INTERACTIVE_LAYERS],
            });
            const hit = hits[0];
            if (!hit || hit.id === undefined) return;

            const id = Number(hit.id);
            const fullFeature = latestDataRef.current.featuresById.get(id);
            if (!fullFeature) return;

            onSelectFeatureRef.current?.(fullFeature.id);
            openFeaturePopup(fullFeature, [
              event.lngLat.lng,
              event.lngLat.lat,
            ]);
          });

          // Pointer cursor on hover
          for (const layerId of [...INTERACTIVE_LAYERS, "dataset-clusters"]) {
            map.on("mouseenter", layerId, () => {
              map.getCanvas().style.cursor = "pointer";
            });
            map.on("mouseleave", layerId, () => {
              map.getCanvas().style.cursor = "";
            });
          }

          mapReadyRef.current = true;
          syncSources();
        });

        map.on("error", (event) => {
          if (!cancelled && event.error) {
            setMapError("Map tiles failed to load. Check your connection.");
          }
        });

        mapInstance = map;
        mapRef.current = map;
      })
      .catch(() => {
        if (!cancelled) {
          setMapError("Unable to initialize MapLibre GL JS.");
        }
      });

    return () => {
      cancelled = true;
      mapReadyRef.current = false;
      popupRef.current?.remove();
      popupRef.current = null;
      mapRef.current = null;
      mapInstance?.remove();
    };
  }, []);

  // Sync GeoJSON sources whenever features or selection changes
  useEffect(() => {
    syncSources();
    if (selectedFeatureId === null) {
      popupRef.current?.remove();
    }
  }, [points, shapes, selectedFeatureId]);

  // Fly/fit to feature when requested (e.g., table row click)
  useEffect(() => {
    if (!focusRequest || !mapReadyRef.current || !mapRef.current) return;
    const feature = featuresById.get(focusRequest.featureId);
    if (!feature?.geometry) return;

    const focus = getGeometryFocus(feature.geometry);
    if (!focus) return;

    const map = mapRef.current;
    if (focus.bounds) {
      map.fitBounds(focus.bounds, {
        padding: 80,
        maxZoom: 16,
        duration: 700,
      });
    } else {
      map.flyTo({
        center: focus.center,
        zoom: Math.max(map.getZoom(), 14.5),
        duration: 700,
      });
    }

    openFeaturePopup(feature, focus.center);
  }, [focusRequest, featuresById]);

  function handleResetView() {
    popupRef.current?.remove();
    onSelectFeature?.(null);
    mapRef.current?.easeTo({
      center: TORONTO_CENTER,
      zoom: 10.5,
      duration: 500,
    });
  }

  return (
    <section
      aria-label="Toronto dataset map"
      className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs"
    >
      <div className="relative h-[420px] w-full bg-slate-100 sm:h-[480px]">
        <div ref={containerRef} className="h-full w-full" />

        <div className="pointer-events-none absolute top-3 left-3 flex flex-wrap items-center gap-2">
          {loading && (
            <div className="pointer-events-auto inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-xs backdrop-blur-xs">
              <span
                aria-hidden="true"
                className="h-3 w-3 animate-spin rounded-full border-2 border-teal-600 border-t-transparent"
              />
              <span>{loadingLabel ?? "Loading features…"}</span>
            </div>
          )}

          {!loading && features.length > 0 && (
            <button
              type="button"
              onClick={handleResetView}
              className="pointer-events-auto cursor-pointer rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-600/30 transition-colors"
            >
              Reset view
            </button>
          )}
        </div>

        {mapError && (
          <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-lg border border-amber-200 bg-amber-50/95 px-3 py-2 text-xs text-amber-900 shadow-xs">
            {mapError}
          </div>
        )}
      </div>
    </section>
  );
}
