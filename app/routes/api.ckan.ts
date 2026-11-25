import type { Route } from "./+types/api.ckan";
import { CKAN_BASE_URL } from "~/lib/ckan";

const VALID_CKAN_ID = /^[a-zA-Z0-9_-]{1,200}$/;

/**
 * Minimal pass-through proxy for Toronto CKAN `package_show`.
 * Required because ckan0.cf.opendata.inter.prod-toronto.ca omits CORS headers,
 * so the client-rendered /datasets/:id route fetches through this same-origin endpoint.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
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
      "Cache-Control": upstream.ok
        ? "public, max-age=300"
        : "no-store",
    },
  });
}
