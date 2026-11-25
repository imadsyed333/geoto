import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import type { Route } from "./+types/root";
import maplibreStyles from "maplibre-gl/dist/maplibre-gl.css?url";
import appStyles from "./app.css?url";

export const links: Route.LinksFunction = () => [
  { rel: "stylesheet", href: appStyles },
  { rel: "stylesheet", href: maplibreStyles },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="min-h-screen flex flex-col">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
            <Link
              to="/"
              className="flex items-center gap-2 font-semibold tracking-tight text-slate-900 hover:text-teal-700 transition-colors"
            >
              <span
                aria-hidden="true"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-teal-600 text-xs font-bold text-white"
              >
                GT
              </span>
              <span className="text-lg">GeoTO</span>
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link
                to="/search"
                className="text-slate-600 hover:text-slate-900 transition-colors"
              >
                Browse datasets
              </Link>
              <a
                href="https://open.toronto.ca/"
                target="_blank"
                rel="noreferrer"
                className="text-slate-500 hover:text-slate-800 transition-colors"
              >
                Toronto Open Data
              </a>
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-slate-200 bg-white py-5 text-xs text-slate-500">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-2 px-4 sm:px-6">
            <span>Data sourced live from the City of Toronto CKAN API</span>
          </div>
        </footer>

        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred.";

  if (isRouteErrorResponse(error)) {
    title = error.status === 404 ? "Page not found" : `Error ${error.status}`;
    message =
      error.status === 404
        ? "The page you requested could not be found."
        : error.statusText || message;
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
      <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
      <p className="mt-2 text-sm text-slate-600">{message}</p>
      <div className="mt-6">
        <Link
          to="/"
          className="inline-flex items-center rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 transition-colors"
        >
          Back to GeoTO
        </Link>
      </div>
    </div>
  );
}
