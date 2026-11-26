import type { Route } from "./+types/api.ckan";
import { CKAN_BASE_URL } from "~/lib/ckan";

const VALID_CKAN_ID = /^[a-zA-Z0-9_-]{1,200}$/;
const ALLOWED_CKAN_ORIGIN = "https://ckan0.cf.opendata.inter.prod-toronto.ca";
const MAX_DATASTORE_LIMIT = 5000;

function parseAllowedGeoJsonUrl(raw: string): URL | null {
  try {
    const parsed = new URL(raw);
    if (parsed.origin !== ALLOWED_CKAN_ORIGIN) return null;
    if (parsed.username || parsed.password || parsed.port) return null;
    if (
      !parsed.pathname.startsWith("/dataset/") &&
      !parsed.pathname.startsWith("/datastore/")
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Minimal pass-through proxy for Toronto CKAN endpoints.
 * Required because ckan0.cf.opendata.inter.prod-toronto.ca omits CORS headers,
 * so the client-rendered /datasets/:id route fetches metadata, datastore rows,
 * and streaming GeoJSON chunks through this same-origin endpoint.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action") ?? "package_show";

  if (action === "datastore") {
    const resourceId = url.searchParams.get("resource_id")?.trim() ?? "";
    if (!VALID_CKAN_ID.test(resourceId)) {
      return Response.json(
        { success: false, error: { message: "Invalid resource_id" } },
        { status: 400 },
      );
    }

    const rawLimit = Number(url.searchParams.get("limit") ?? "500");
    const limit = Number.isFinite(rawLimit)
      ? Math.min(MAX_DATASTORE_LIMIT, Math.max(1, Math.floor(rawLimit)))
      : 500;

    const upstream = await fetch(
      `${CKAN_BASE_URL}/datastore_search?resource_id=${encodeURIComponent(resourceId)}&limit=${limit}`,
      {
        headers: { Accept: "application/json" },
        signal: request.signal,
      },
    );

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": upstream.ok ? "public, max-age=120" : "no-store",
      },
    });
  }

  if (action === "geojson") {
    const rawTarget = url.searchParams.get("url")?.trim() ?? "";
    const targetUrl = parseAllowedGeoJsonUrl(rawTarget);
    if (!targetUrl) {
      return Response.json(
        { success: false, error: { message: "Invalid GeoJSON resource URL" } },
        { status: 400 },
      );
    }

    const upstream = await fetch(targetUrl, {
      headers: { Accept: "application/geo+json, application/json, */*" },
      redirect: "error",
      signal: request.signal,
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": "application/geo+json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  const id = url.searchParams.get("id")?.trim() ?? "";
  if (!VALID_CKAN_ID.test(id)) {
    return Response.json(
      { success: false, error: { message: "Invalid dataset ID" } },
      { status: 400 },
    );
  }

  const upstream = await fetch(
    `${CKAN_BASE_URL}/package_show?id=${encodeURIComponent(id)}`,
    {
      headers: { Accept: "application/json" },
      signal: request.signal,
    },
  );

  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": upstream.ok ? "public, max-age=300" : "no-store",
    },
  });
}
