import { Form } from "react-router";

interface SearchBarProps {
  initialQuery?: string;
  placeholder?: string;
  size?: "md" | "lg";
  autoFocus?: boolean;
}

export function SearchBar({
  initialQuery = "",
  placeholder = "Search Toronto geospatial datasets (e.g. collisions, parks, bikeways)...",
  size = "md",
  autoFocus = false,
}: SearchBarProps) {
  const isLarge = size === "lg";

  return (
    <Form method="get" action="/search" role="search" className="w-full">
      <label htmlFor="geoto-search-input" className="sr-only">
        Search Toronto Open Data geospatial datasets
      </label>
      <div className="flex w-full gap-2">
        <input
          key={initialQuery}
          id="geoto-search-input"
          name="q"
          type="search"
          defaultValue={initialQuery}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={`w-full rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 shadow-xs focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20 ${
            isLarge ? "px-4 py-3.5 text-base" : "px-3.5 py-2.5 text-sm"
          }`}
        />
        <button
          type="submit"
          className={`shrink-0 cursor-pointer rounded-xl bg-teal-600 font-medium text-white shadow-xs hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-600/40 transition-colors ${
            isLarge ? "px-6 py-3.5 text-base" : "px-5 py-2.5 text-sm"
          }`}
        >
          Search
        </button>
      </div>
    </Form>
  );
}
