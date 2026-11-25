import { useEffect, useState } from "react";
import { type DatasetFormatOption, formatBytes } from "~/lib/ckan";

interface DatasetAccessCardProps {
  options: DatasetFormatOption[];
}

export function DatasetAccessCard({ options }: DatasetAccessCardProps) {
  const [selectedKey, setSelectedKey] = useState<string>(
    options[0]?.key ?? "",
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setSelectedKey(options[0]?.key ?? "");
    setCopied(false);
  }, [options]);

  const selected =
    options.find((opt) => opt.key === selectedKey) ?? options[0] ?? null;

  async function handleCopy() {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected.apiUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: focus/select the read-only input manually
    }
  }

  if (!selected) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <h2 className="text-base font-semibold text-slate-900">
          Data Access &amp; Download
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          No downloadable resources are currently listed for this dataset.
        </p>
      </section>
    );
  }

  const sizeLabel = formatBytes(selected.sizeBytes);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">
          Data Access &amp; Download
        </h2>
        {sizeLabel && (
          <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">
            {sizeLabel}
          </span>
        )}
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <label
            htmlFor="dataset-format-select"
            className="block text-xs font-medium uppercase tracking-wide text-slate-500"
          >
            Format
          </label>
          <select
            id="dataset-format-select"
            value={selected.key}
            onChange={(event) => {
              setSelectedKey(event.target.value);
              setCopied(false);
            }}
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
          >
            {options.map((option) => {
              const optSize = formatBytes(option.sizeBytes);
              return (
                <option key={option.key} value={option.key}>
                  {optSize ? `${option.label} — ${optSize}` : option.label}
                </option>
              );
            })}
          </select>
        </div>

        <div>
          <label
            htmlFor="dataset-api-url"
            className="block text-xs font-medium uppercase tracking-wide text-slate-500"
          >
            {selected.isDatastore ? "CKAN Datastore API URL" : "Direct Resource URL"}
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              id="dataset-api-url"
              type="text"
              readOnly
              value={selected.apiUrl}
              onFocus={(event) => event.currentTarget.select()}
              className="w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700 focus:border-teal-600 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="shrink-0 cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-600/20 transition-colors"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        <div className="pt-1">
          <a
            href={selected.downloadUrl}
            target="_blank"
            rel="noreferrer"
            download
            className="inline-flex w-full items-center justify-center rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-medium text-white shadow-xs hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-600/40 transition-colors"
          >
            Download {selected.label}
          </a>
        </div>
      </div>
    </section>
  );
}
