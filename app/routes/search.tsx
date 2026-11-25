import { Link } from "react-router";
import type { Route } from "./+types/search";
import { SearchBar } from "~/components/SearchBar";
import { SearchResultCard } from "~/components/SearchResultCard";
import { searchDatasets } from "~/lib/ckan";

const PAGE_SIZE = 12;

export function meta({ loaderData }: Route.MetaArgs) {
  const q = loaderData?.query;
  return [
    { title: q ? `Search: ${q} — GeoTO` : "Browse Datasets — GeoTO" },
    {
      name: "description",
      content: "Geospatial datasets from Toronto Open Data.",
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const rawStart = Number.parseInt(url.searchParams.get("start") ?? "0", 10);
  const rawRows = Number.parseInt(
    url.searchParams.get("rows") ?? String(PAGE_SIZE),
    10,
  );

  const start = Number.isFinite(rawStart) && rawStart > 0 ? rawStart : 0;
  const rows =
    Number.isFinite(rawRows) && rawRows >= 1 && rawRows <= 50
      ? rawRows
      : PAGE_SIZE;

  try {
    const data = await searchDatasets({
      query,
      start,
      rows,
      signal: request.signal,
    });
    return {
      query,
      start,
      rows,
      count: data.count,
      results: data.results,
      error: null as string | null,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Unable to reach Toronto Open Data right now.";
    return {
      query,
      start,
      rows,
      count: 0,
      results: [],
      error: message,
    };
  }
}

function buildSearchUrl(query: string, start: number, rows: number): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (start > 0) params.set("start", String(start));
  if (rows !== PAGE_SIZE) params.set("rows", String(rows));
  const qs = params.toString();
  return qs ? `/search?${qs}` : "/search";
}

export default function SearchPage({ loaderData }: Route.ComponentProps) {
  const { query, start, rows, count, results, error } = loaderData;

  const rangeStart = count === 0 ? 0 : start + 1;
  const rangeEnd = Math.min(start + results.length, count);
  const hasPrev = start > 0;
  const hasNext = start + rows < count;
  const currentPage = Math.floor(start / rows) + 1;
  const totalPages = Math.max(1, Math.ceil(count / rows));

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="space-y-4">
        <SearchBar initialQuery={query} />

        {!error && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
            <p>
              {count === 0 ? (
                <>
                  No geospatial datasets found
                  {query ? (
                    <>
                      {" "}
                      for <span className="font-medium text-slate-900">&ldquo;{query}&rdquo;</span>
                    </>
                  ) : null}
                  .
                </>
              ) : (
                <>
                  Showing{" "}
                  <span className="font-medium text-slate-900">
                    {rangeStart}–{rangeEnd}
                  </span>{" "}
                  of{" "}
                  <span className="font-medium text-slate-900">{count}</span>{" "}
                  geospatial dataset{count === 1 ? "" : "s"}
                  {query ? (
                    <>
                      {" "}
                      for <span className="font-medium text-slate-900">&ldquo;{query}&rdquo;</span>
                    </>
                  ) : null}
                </>
              )}
            </p>
            {query && (
              <Link
                to="/search"
                className="text-xs font-medium text-teal-700 hover:underline"
              >
                Clear search
              </Link>
            )}
          </div>
        )}
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-8 rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-900"
        >
          <h2 className="font-semibold">Could not load search results</h2>
          <p className="mt-1 text-red-800">{error}</p>
          <Link
            to={buildSearchUrl(query, start, rows)}
            className="mt-4 inline-flex rounded-lg bg-red-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-red-800 transition-colors"
          >
            Try again
          </Link>
        </div>
      ) : results.length === 0 ? (
        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-10 text-center">
          <h2 className="text-base font-semibold text-slate-900">
            No matching map datasets
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Try a broader keyword like &ldquo;parks&rdquo;, &ldquo;transit&rdquo;,
            or browse all Toronto geospatial datasets.
          </p>
          <Link
            to="/search"
            className="mt-5 inline-flex rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 transition-colors"
          >
            Browse all geospatial datasets
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-6 space-y-4">
            {results.map((dataset) => (
              <SearchResultCard key={dataset.id} dataset={dataset} />
            ))}
          </div>

          {totalPages > 1 && (
            <nav
              aria-label="Search results pagination"
              className="mt-8 flex items-center justify-between border-t border-slate-200 pt-5 text-sm"
            >
              <div>
                {hasPrev ? (
                  <Link
                    to={buildSearchUrl(query, Math.max(0, start - rows), rows)}
                    className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Previous
                  </Link>
                ) : (
                  <span className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 font-medium text-slate-400">
                    Previous
                  </span>
                )}
              </div>

              <span className="text-xs text-slate-500">
                Page {currentPage} of {totalPages}
              </span>

              <div>
                {hasNext ? (
                  <Link
                    to={buildSearchUrl(query, start + rows, rows)}
                    className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Next
                  </Link>
                ) : (
                  <span className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 font-medium text-slate-400">
                    Next
                  </span>
                )}
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
