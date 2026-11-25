import { Link } from "react-router";
import type { Route } from "./+types/home";
import { SearchBar } from "~/components/SearchBar";

const SUGGESTED_QUERIES = [
  "Traffic collisions",
  "Green spaces",
  "Parks",
  "Bikeways",
  "Fire stations",
  "Street trees",
];

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "GeoTO — Toronto Open Data Geospatial Explorer" },
    {
      name: "description",
      content:
        "Search, explore, and download geospatial datasets from the City of Toronto Open Data catalog.",
    },
  ];
}

export default function HomePage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-20 text-center sm:px-6 sm:py-28">
      <h1 className="mt-5 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
        GeoTO
      </h1>

      <p className="mt-3 max-w-xl text-base text-slate-600 sm:text-lg">
        The home of Toronto geospatial open data
      </p>

      <div className="mt-8 w-full max-w-2xl">
        <SearchBar size="lg" autoFocus />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs">
        <span className="text-slate-500">Try:</span>
        {SUGGESTED_QUERIES.map((term) => (
          <Link
            key={term}
            to={`/search?q=${encodeURIComponent(term)}`}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-slate-700 hover:border-teal-300 hover:text-teal-700 transition-colors"
          >
            {term}
          </Link>
        ))}
      </div>
    </div>
  );
}
