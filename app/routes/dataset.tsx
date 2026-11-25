import { isRouteErrorResponse, Link } from "react-router";
import type { Route } from "./+types/dataset";
import { DatasetAccessCard } from "~/components/DatasetAccessCard";
import { TorontoMap } from "~/components/TorontoMap";
import { formatDate, getDataset } from "~/lib/ckan";

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData?.dataset?.title;
  return [
    { title: title ? `${title} — GeoTO` : "Dataset — GeoTO" },
    {
      name: "description",
      content:
        loaderData?.dataset?.description ||
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
      <div className="mt-3 h-4 w-full max-w-2xl rounded bg-slate-200" />
      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="h-[460px] rounded-xl bg-slate-200 lg:col-span-2" />
        <div className="h-64 rounded-xl bg-slate-200" />
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 9 }).map((_, idx) => (
          <div key={idx} className="h-16 rounded-lg bg-slate-200" />
        ))}
      </div>
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

export default function DatasetPage({ loaderData }: Route.ComponentProps) {
  const { dataset } = loaderData;
  const isEmail = dataset.contactInfo?.includes("@") ?? false;

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
        {dataset.description && (
          <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
            {dataset.description}
          </p>
        )}
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-3 lg:items-start">
        <div className="lg:col-span-2">
          <TorontoMap />
        </div>
        <div>
          <DatasetAccessCard options={dataset.formatOptions} />
        </div>
      </div>

      <section
        aria-labelledby="metadata-heading"
        className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-xs"
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
