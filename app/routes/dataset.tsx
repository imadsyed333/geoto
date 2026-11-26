import { useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import { isRouteErrorResponse, Link } from "react-router";
import remarkGfm from "remark-gfm";
import type { Route } from "./+types/dataset";
import { DatasetAccessCard } from "~/components/DatasetAccessCard";
import { DatasetTable } from "~/components/DatasetTable";
import { TorontoMap, type MapFocusRequest } from "~/components/TorontoMap";
import { cleanText, formatBytes, formatDate, getDataset } from "~/lib/ckan";
import {
  datastoreResultToFeatures,
  DEFAULT_FEATURE_LIMIT,
  FEATURE_LIMIT_OPTIONS,
  pickDatasetDataSources,
  type DatasetFeature,
  type FeatureLimit,
  type LoadedDatasetFeatures,
  type RawDatastoreResult,
} from "~/lib/geojson";
import type {
  GeoJsonWorkerRequest,
  GeoJsonWorkerResponse,
} from "~/workers/geojson-stream.worker";

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData?.dataset?.title;
  return [
    { title: title ? `${title} — GeoTO` : "Dataset — GeoTO" },
    {
      name: "description",
      content:
        cleanText(loaderData?.dataset?.description) ||
        "Geospatial dataset details from Toronto Open Data.",
    },
  ];
}

export async function clientLoader({ params, request }: Route.ClientLoaderArgs) {
  const id = params.id;
  if (!id) {
    throw new Response("Dataset ID missing", { status: 400 });
  }
  const dataset = await getDataset(id, {
    endpoint: "/api/ckan",
    signal: request.signal,
  });
  return { dataset };
}
clientLoader.hydrate = true as const;

export function HydrateFallback() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse px-4 py-8 sm:px-6">
      <div className="h-4 w-32 rounded bg-slate-200" />
      <div className="mt-4 h-9 w-2/3 rounded bg-slate-200" />
      <div className="mt-6 grid gap-4 rounded-xl bg-slate-200/60 p-6 sm:grid-cols-3">
        {Array.from({ length: 9 }).map((_, idx) => (
          <div key={idx} className="h-16 rounded-lg bg-slate-200" />
        ))}
      </div>
      <div className="mt-6 space-y-2.5 max-w-2xl">
        <div className="h-4 w-full rounded bg-slate-200" />
        <div className="h-4 w-5/6 rounded bg-slate-200" />
      </div>
      <div className="mt-6 h-[480px] rounded-xl bg-slate-200" />
      <div className="mt-6 h-56 rounded-xl bg-slate-200" />
      <div className="mt-6 h-36 rounded-xl bg-slate-200" />
    </div>
  );
}

function MetadataItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-3.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-slate-900 break-words">{children}</dd>
    </div>
  );
}

interface DataLoadState {
  datasetId: string;
  status: "idle" | "loading" | "ready" | "unsupported" | "error";
  data: LoadedDatasetFeatures | null;
  progress: { loaded: number; bytesRead: number } | null;
  error: string | null;
}

export default function DatasetPage({ loaderData }: Route.ComponentProps) {
  const { dataset } = loaderData;
  const isEmail = dataset.contactInfo?.includes("@") ?? false;

  const [featureLimit, setFeatureLimit] = useState<FeatureLimit>(
    DEFAULT_FEATURE_LIMIT,
  );
  const [reloadNonce, setReloadNonce] = useState(0);
  const [selectedFeatureId, setSelectedFeatureId] = useState<number | null>(
    null,
  );
  const [focusRequest, setFocusRequest] = useState<MapFocusRequest | null>(
    null,
  );
  const mapSectionRef = useRef<HTMLDivElement | null>(null);

  const dataSources = useMemo(
    () => pickDatasetDataSources(dataset.formatOptions),
    [dataset.formatOptions],
  );

  const [loadState, setLoadState] = useState<DataLoadState>({
    datasetId: dataset.id,
    status: "idle",
    data: null,
    progress: null,
    error: null,
  });

  // Reset selection when navigating to a different dataset
  useEffect(() => {
    setSelectedFeatureId(null);
    setFocusRequest(null);
  }, [dataset.id]);

  // Two-tier zero-storage data loader:
  // 1) Datastore API fast path (?action=datastore&limit=N)
  // 2) GeoJSON ReadableStream Web Worker fallback (?action=geojson&url=...)
  //
  // ponytail: interactive preview caps at 5,000 features; full-catalog
  // rendering of 500k+ feature datasets (e.g. Traffic Collisions at 825k rows,
  // SolarTO at 566 MB) requires pre-converting to PMTiles via tippecanoe +
  // object storage.
  useEffect(() => {
    const { primary, geojsonFallback } = dataSources;
    if (!primary) {
      setLoadState({
        datasetId: dataset.id,
        status: "unsupported",
        data: null,
        progress: null,
        error: null,
      });
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    let worker: Worker | null = null;

    setLoadState((prev) => ({
      datasetId: dataset.id,
      status: "loading",
      data: prev.datasetId === dataset.id ? prev.data : null,
      progress: null,
      error: null,
    }));

    function startGeoJsonWorker(geojsonUrl: string) {
      const streamUrl = `/api/ckan?action=geojson&url=${encodeURIComponent(geojsonUrl)}`;
      worker = new Worker(
        new URL("../workers/geojson-stream.worker.ts", import.meta.url),
        { type: "module" },
      );

      worker.onmessage = (event: MessageEvent<GeoJsonWorkerResponse>) => {
        if (cancelled) return;
        const msg = event.data;

        if (msg.type === "progress") {
          setLoadState((prev) => ({
            ...prev,
            progress: { loaded: msg.loaded, bytesRead: msg.bytesRead },
          }));
          return;
        }

        if (msg.type === "complete") {
          setLoadState({
            datasetId: dataset.id,
            status: "ready",
            data: {
              features: msg.features,
              columns: msg.columns,
              total: null,
              mappedCount: msg.mappedCount,
              sourceKind: "geojson",
              truncated: msg.truncated,
            },
            progress: null,
            error: null,
          });
          worker?.terminate();
          worker = null;
          return;
        }

        if (msg.type === "error") {
          setLoadState((prev) => ({
            datasetId: dataset.id,
            status: "error",
            data: prev.datasetId === dataset.id ? prev.data : null,
            progress: null,
            error: msg.message,
          }));
          worker?.terminate();
          worker = null;
        }
      };

      worker.onerror = (event) => {
        if (cancelled) return;
        setLoadState((prev) => ({
          datasetId: dataset.id,
          status: "error",
          data: prev.datasetId === dataset.id ? prev.data : null,
          progress: null,
          error: event.message || "GeoJSON stream worker failed",
        }));
      };

      worker.postMessage({
        type: "start",
        url: streamUrl,
        limit: featureLimit,
      } satisfies GeoJsonWorkerRequest);
    }

    async function loadDatastore(resourceId: string) {
      try {
        const response = await fetch(
          `/api/ckan?action=datastore&resource_id=${encodeURIComponent(resourceId)}&limit=${featureLimit}`,
          {
            headers: { Accept: "application/json" },
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          throw new Error(`Datastore request failed (${response.status})`);
        }

        const payload = (await response.json()) as {
          success?: boolean;
          result?: RawDatastoreResult;
          error?: { message?: string };
        };

        if (!payload.success || !payload.result) {
          throw new Error(
            payload.error?.message ?? "CKAN datastore query returned an error",
          );
        }

        if (cancelled) return;
        const loaded = datastoreResultToFeatures(payload.result);

        // If a datastore table omitted geometry columns, fall back to EPSG:4326 GeoJSON stream
        if (
          loaded.features.length > 0 &&
          loaded.mappedCount === 0 &&
          geojsonFallback
        ) {
          startGeoJsonWorker(geojsonFallback.url);
          return;
        }

        setLoadState({
          datasetId: dataset.id,
          status: "ready",
          data: loaded,
          progress: null,
          error: null,
        });
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;

        // Fall back to GeoJSON stream if datastore endpoint fails
        if (geojsonFallback) {
          startGeoJsonWorker(geojsonFallback.url);
          return;
        }

        setLoadState((prev) => ({
          datasetId: dataset.id,
          status: "error",
          data: prev.datasetId === dataset.id ? prev.data : null,
          progress: null,
          error:
            error instanceof Error
              ? error.message
              : "Failed to load dataset features",
        }));
      }
    }

    if (primary.kind === "datastore") {
      void loadDatastore(primary.resourceId);
    } else {
      startGeoJsonWorker(primary.url);
    }

    return () => {
      cancelled = true;
      controller.abort();
      if (worker) {
        worker.postMessage({ type: "abort" } satisfies GeoJsonWorkerRequest);
        worker.terminate();
      }
    };
  }, [dataset.id, dataSources, featureLimit, reloadNonce]);

  const features = loadState.data?.features ?? [];
  const columns = loadState.data?.columns ?? [];

  function handleTableRowClick(feature: DatasetFeature) {
    setSelectedFeatureId(feature.id);
    if (feature.geometry) {
      setFocusRequest((prev) => ({
        featureId: feature.id,
        nonce: (prev?.nonce ?? 0) + 1,
      }));
      mapSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }

  const loadingLabel = loadState.progress
    ? `Streaming GeoJSON… ${loadState.progress.loaded.toLocaleString()} / ${featureLimit.toLocaleString()} (${formatBytes(loadState.progress.bytesRead) ?? "0 B"})`
    : `Loading up to ${featureLimit.toLocaleString()} features…`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-4">
        <Link
          to="/search"
          className="text-sm font-medium text-teal-700 hover:underline"
        >
          &larr; Back to search results
        </Link>
      </div>

      <header className="max-w-4xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {dataset.title}
        </h1>
      </header>

      <section
        aria-labelledby="metadata-heading"
        className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-xs"
      >
        <h2
          id="metadata-heading"
          className="text-base font-semibold text-slate-900"
        >
          Dataset Metadata
        </h2>

        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <MetadataItem label="Date published">
            {formatDate(dataset.datePublished)}
          </MetadataItem>

          <MetadataItem label="Date of last update">
            {formatDate(dataset.lastUpdated)}
          </MetadataItem>

          <MetadataItem label="Refresh rate">
            {dataset.refreshRate ?? "—"}
          </MetadataItem>

          <MetadataItem label="Data type">
            {dataset.dataType ?? "—"}
          </MetadataItem>

          <MetadataItem label="Topics">
            {dataset.topics.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {dataset.topics.map((topic) => (
                  <span
                    key={topic}
                    className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            ) : (
              "—"
            )}
          </MetadataItem>

          <MetadataItem label="Licence">
            {dataset.licence ?? "—"}
          </MetadataItem>

          <MetadataItem label="Publisher">
            {dataset.publisher ?? "City of Toronto"}
          </MetadataItem>

          <MetadataItem label="Contact info">
            {dataset.contactInfo ? (
              isEmail ? (
                <a
                  href={`mailto:${dataset.contactInfo}`}
                  className="text-teal-700 hover:underline"
                >
                  {dataset.contactInfo}
                </a>
              ) : (
                dataset.contactInfo
              )
            ) : (
              "—"
            )}
          </MetadataItem>

          <MetadataItem label="Civic issues">
            {dataset.civicIssues.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {dataset.civicIssues.map((issue) => (
                  <span
                    key={issue}
                    className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-800"
                  >
                    {issue}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-slate-500">Not specified</span>
            )}
          </MetadataItem>
        </dl>
      </section>

      {dataset.description && (
        <div className="markdown mt-6 max-w-4xl text-sm leading-relaxed text-slate-600 sm:text-base">
          <Markdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ node: _node, ...props }) => (
                <a {...props} target="_blank" rel="noreferrer" />
              ),
              h1: ({ node: _node, ...props }) => <h2 {...props} />,
            }}
          >
            {dataset.description}
          </Markdown>
        </div>
      )}

      <div ref={mapSectionRef} className="mt-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3.5 shadow-xs">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-slate-900">
              Map &amp; Table Preview
            </span>

            {loadState.status === "ready" && loadState.data && (
              <>
                <span className="text-slate-300" aria-hidden="true">
                  &middot;
                </span>
                <span className="text-xs text-slate-600">
                  Showing{" "}
                  <strong className="font-semibold text-slate-900">
                    {loadState.data.features.length.toLocaleString()}
                  </strong>
                  {loadState.data.total !== null ? (
                    <>
                      {" "}
                      of{" "}
                      <strong className="font-semibold text-slate-900">
                        {loadState.data.total.toLocaleString()}
                      </strong>
                    </>
                  ) : loadState.data.truncated ? (
                    "+"
                  ) : null}{" "}
                  features
                  {loadState.data.mappedCount <
                    loadState.data.features.length && (
                    <span className="text-slate-500">
                      {" "}
                      ({loadState.data.mappedCount.toLocaleString()} mapped)
                    </span>
                  )}
                </span>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600">
                  {loadState.data.sourceKind === "datastore"
                    ? "Datastore API"
                    : "GeoJSON Stream"}
                </span>
              </>
            )}

            {loadState.status === "unsupported" && (
              <span className="text-xs text-slate-500">
                No Datastore or WGS84 GeoJSON resource available for live map
                preview.
              </span>
            )}
          </div>

          {dataSources.primary && (
            <div className="flex items-center gap-2">
              <label
                htmlFor="feature-limit-select"
                className="text-xs font-medium uppercase tracking-wide text-slate-500"
              >
                Show up to
              </label>
              <select
                id="feature-limit-select"
                value={featureLimit}
                onChange={(event) => {
                  const next = Number(event.target.value) as FeatureLimit;
                  setSelectedFeatureId(null);
                  setFocusRequest(null);
                  setFeatureLimit(next);
                }}
                className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
              >
                {FEATURE_LIMIT_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option.toLocaleString()} features
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {loadState.status === "error" && loadState.error && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span>Could not load dataset preview: {loadState.error}</span>
            <button
              type="button"
              onClick={() => setReloadNonce((n) => n + 1)}
              className="cursor-pointer rounded-md border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        <TorontoMap
          features={features}
          selectedFeatureId={selectedFeatureId}
          focusRequest={focusRequest}
          onSelectFeature={setSelectedFeatureId}
          loading={loadState.status === "loading"}
          loadingLabel={loadingLabel}
        />

        <DatasetTable
          features={features}
          columns={columns}
          selectedFeatureId={selectedFeatureId}
          onRowClick={handleTableRowClick}
          loading={loadState.status === "loading"}
        />
      </div>

      <div className="mt-6">
        <DatasetAccessCard options={dataset.formatOptions} />
      </div>
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const isNotFound = isRouteErrorResponse(error) && error.status === 404;

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
      <h1 className="text-2xl font-semibold text-slate-900">
        {isNotFound ? "Dataset not found" : "Could not load dataset"}
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        {isNotFound
          ? "We could not find a Toronto Open Data dataset matching that ID."
          : error instanceof Error
            ? error.message
            : "An error occurred while fetching dataset details."}
      </p>
      <div className="mt-6">
        <Link
          to="/search"
          className="inline-flex items-center rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 transition-colors"
        >
          Back to search
        </Link>
      </div>
    </div>
  );
}
