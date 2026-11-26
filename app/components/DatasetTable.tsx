import { useEffect, useState } from "react";
import type { DatasetFeature } from "~/lib/geojson";

const PAGE_SIZE = 25;

interface DatasetTableProps {
  features: DatasetFeature[];
  columns: string[];
  selectedFeatureId: number | null;
  onRowClick: (feature: DatasetFeature) => void;
  loading?: boolean;
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
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

export function DatasetTable({
  features,
  columns,
  selectedFeatureId,
  onRowClick,
  loading = false,
}: DatasetTableProps) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(features.length / PAGE_SIZE));

  // Reset to first page when loaded feature set changes
  useEffect(() => {
    setPage(0);
  }, [features]);

  // Jump to the page containing a map-selected feature
  useEffect(() => {
    if (selectedFeatureId === null) return;
    const index = features.findIndex((f) => f.id === selectedFeatureId);
    if (index >= 0) {
      setPage(Math.floor(index / PAGE_SIZE));
    }
  }, [selectedFeatureId, features]);

  const safePage = Math.min(page, totalPages - 1);
  const startIdx = safePage * PAGE_SIZE;
  const pageFeatures = features.slice(startIdx, startIdx + PAGE_SIZE);

  return (
    <section
      aria-labelledby="data-table-heading"
      className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3.5">
        <div>
          <h2
            id="data-table-heading"
            className="text-base font-semibold text-slate-900"
          >
            Feature Table
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Click any mapped row to fly to that feature on the map.
          </p>
        </div>

        {features.length > 0 && (
          <span className="text-xs text-slate-500">
            Rows{" "}
            <span className="font-medium text-slate-800">
              {(startIdx + 1).toLocaleString()}–
              {Math.min(startIdx + PAGE_SIZE, features.length).toLocaleString()}
            </span>{" "}
            of{" "}
            <span className="font-medium text-slate-800">
              {features.length.toLocaleString()}
            </span>
          </span>
        )}
      </div>

      {loading && features.length === 0 ? (
        <div className="space-y-2 p-5">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="h-8 animate-pulse rounded bg-slate-100"
            />
          ))}
        </div>
      ) : features.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-slate-500">
          No feature records available for preview.
        </div>
      ) : (
        <>
          <div className="max-h-[420px] overflow-auto">
            <table className="min-w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600 shadow-[inset_0_-1px_0_0_#e2e8f0]">
                <tr>
                  <th
                    scope="col"
                    className="whitespace-nowrap px-3 py-2.5 font-semibold uppercase tracking-wide"
                  >
                    Map
                  </th>
                  {columns.map((column) => (
                    <th
                      key={column}
                      scope="col"
                      className="whitespace-nowrap px-3 py-2.5 font-semibold uppercase tracking-wide"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {pageFeatures.map((feature) => {
                  const isSelected = feature.id === selectedFeatureId;
                  const hasGeometry = feature.geometry !== null;

                  return (
                    <tr
                      key={feature.id}
                      tabIndex={hasGeometry ? 0 : -1}
                      aria-selected={isSelected}
                      onClick={() => onRowClick(feature)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onRowClick(feature);
                        }
                      }}
                      className={[
                        "transition-colors",
                        hasGeometry ? "cursor-pointer" : "cursor-default",
                        isSelected
                          ? "bg-amber-50/90 text-slate-900"
                          : hasGeometry
                            ? "hover:bg-teal-50/50"
                            : "bg-slate-50/40 text-slate-500",
                      ].join(" ")}
                    >
                      <td className="whitespace-nowrap px-3 py-2">
                        {hasGeometry ? (
                          <span
                            title={`Fly to ${feature.geometry?.type}`}
                            className={[
                              "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
                              isSelected
                                ? "bg-amber-200/80 text-amber-950"
                                : "bg-teal-50 text-teal-800",
                            ].join(" ")}
                          >
                            <span
                              aria-hidden="true"
                              className={[
                                "h-1.5 w-1.5 rounded-full",
                                isSelected ? "bg-amber-600" : "bg-teal-600",
                              ].join(" ")}
                            />
                            {feature.geometry?.type}
                          </span>
                        ) : (
                          <span
                            title="No valid map coordinates"
                            className="text-slate-400"
                          >
                            No coords
                          </span>
                        )}
                      </td>
                      {columns.map((column) => {
                        const formatted = formatCellValue(
                          feature.properties[column],
                        );
                        return (
                          <td
                            key={column}
                            title={formatted}
                            className="max-w-[260px] truncate whitespace-nowrap px-3 py-2 text-slate-700"
                          >
                            {formatted}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/60 px-5 py-2.5 text-xs">
              <span className="text-slate-600">
                Page {safePage + 1} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safePage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="cursor-pointer rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45 transition-colors"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={safePage >= totalPages - 1}
                  onClick={() =>
                    setPage((p) => Math.min(totalPages - 1, p + 1))
                  }
                  className="cursor-pointer rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45 transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
