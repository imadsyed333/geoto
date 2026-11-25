import { Link } from "react-router";
import { type CkanSearchResult, formatDate } from "~/lib/ckan";

interface SearchResultCardProps {
  dataset: CkanSearchResult;
}

export function SearchResultCard({ dataset }: SearchResultCardProps) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition-colors hover:border-teal-300">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-lg font-semibold leading-snug text-slate-900">
          <Link
            to={`/datasets/${encodeURIComponent(dataset.slug)}`}
            className="hover:text-teal-700 hover:underline focus:outline-none focus:underline"
          >
            {dataset.title}
          </Link>
        </h2>
        {dataset.refreshRate && (
          <span className="inline-flex items-center rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-800">
            {dataset.refreshRate}
          </span>
        )}
      </div>

      {dataset.description && (
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-600">
          {dataset.description}
        </p>
      )}

      <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
        <div className="flex gap-1">
          <dt className="font-medium text-slate-700">Publisher:</dt>
          <dd>{dataset.publisher ?? "City of Toronto"}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="font-medium text-slate-700">Last refreshed:</dt>
          <dd>{formatDate(dataset.lastRefreshed)}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="font-medium text-slate-700">Refresh rate:</dt>
          <dd>{dataset.refreshRate ?? "—"}</dd>
        </div>
      </dl>

      {(dataset.formats.length > 0 || dataset.topics.length > 0) && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="sr-only">Formats:</span>
            {dataset.formats.map((format) => (
              <span
                key={format}
                className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] font-medium text-slate-700"
              >
                {format}
              </span>
            ))}
          </div>

          {dataset.topics.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="sr-only">Topics:</span>
              {dataset.topics.map((topic) => (
                <span
                  key={topic}
                  className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600"
                >
                  {topic}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
