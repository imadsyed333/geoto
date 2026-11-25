export const CKAN_BASE_URL =
  "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action";

export const GEOSPATIAL_FILTER = "dataset_category:Map";

export interface RawCkanResource {
  id: string;
  name?: string | null;
  format?: string | null;
  url?: string | null;
  datastore_active?: boolean | null;
  created?: string | null;
  last_modified?: string | null;
  size?: number | null;
}

export interface RawCkanPackage {
  id: string;
  name?: string | null;
  title?: string | null;
  excerpt?: string | null;
  notes?: string | null;
  refresh_rate?: string | null;
  last_refreshed?: string | null;
  metadata_modified?: string | null;
  date_published?: string | null;
  dataset_category?: string | null;
  owner_division?: string | null;
  owner_unit?: string | null;
  owner_email?: string | null;
  maintainer_email?: string | null;
  author_email?: string | null;
  organization?: { title?: string | null } | null;
  license_title?: string | null;
  license_id?: string | null;
  formats?: string[] | string | null;
  topics?: string[] | string | null;
  civic_issues?: string[] | string | null;
  resources?: RawCkanResource[] | null;
}

export interface CkanSearchResult {
  id: string;
  slug: string;
  title: string;
  description: string;
  refreshRate: string | null;
  lastRefreshed: string | null;
  publisher: string | null;
  formats: string[];
  topics: string[];
}

export interface CkanSearchResponse {
  count: number;
  results: CkanSearchResult[];
}

export interface DatasetFormatOption {
  key: string;
  label: string;
  format: string;
  crs: string | null;
  apiUrl: string;
  downloadUrl: string;
  resourceId: string;
  isDatastore: boolean;
  sizeBytes: number | null;
}

export interface CkanDataset {
  id: string;
  slug: string;
  title: string;
  description: string;
  datePublished: string | null;
  lastUpdated: string | null;
  refreshRate: string | null;
  dataType: string | null;
  topics: string[];
  licence: string | null;
  publisher: string | null;
  contactInfo: string | null;
  civicIssues: string[];
  formats: string[];
  formatOptions: DatasetFormatOption[];
}

interface CkanEnvelope<T> {
  success: boolean;
  result: T;
  error?: { message?: string; __type?: string };
}

function normalizeStringList(
  value: string[] | string | null | undefined,
  transform?: (item: string) => string,
): string[] {
  if (!value) return [];
  const items = Array.isArray(value) ? value : value.split(",");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const normalized = transform ? transform(trimmed) : trimmed;
    if (!seen.has(normalized)) {
      seen.add(normalized);
      out.push(normalized);
    }
  }
  return out;
}

function cleanText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function detectCrs(resource: RawCkanResource): string | null {
  const haystack = `${resource.name ?? ""} ${resource.url ?? ""}`;
  if (/(?:^|[^\d])4326(?:[^\d]|$)/.test(haystack)) return "EPSG:4326";
  const match = haystack.match(/(?:^|[^\d])(2952|2945|3857|26917)(?:[^\d]|$)/);
  return match ? `EPSG:${match[1]}` : null;
}

function normalizeFormat(resource: RawCkanResource): string {
  const fmt = nonEmpty(resource.format);
  if (fmt) return fmt.toUpperCase();
  const extMatch = resource.url?.match(/\.([a-z0-9]+)(?:\?|$)/i);
  return extMatch ? extMatch[1].toUpperCase() : "FILE";
}

function parseTimestamp(value: string | null | undefined): number {
  if (!value) return 0;
  let iso = value.trim().replace(" ", "T");
  if (/^\d{4}-\d{2}-\d{2}T/.test(iso) && !/(Z|[+-]\d{2}:?\d{2})$/i.test(iso)) {
    iso += "Z";
  }
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : ms;
}

const FORMAT_PRIORITY: Record<string, number> = {
  GEOJSON: 0,
  API: 1,
  CSV: 2,
  SHP: 3,
  GPKG: 4,
};

function optionSortScore(option: DatasetFormatOption): number {
  if (option.isDatastore) return FORMAT_PRIORITY.API;
  const formatRank = FORMAT_PRIORITY[option.format] ?? 10;
  const crsRank =
    option.crs === "EPSG:4326" ? 0 : option.crs === null ? 1 : 2;
  return crsRank * 100 + formatRank;
}

function displayFormatLabel(format: string): string {
  if (format === "GEOJSON") return "GeoJSON";
  return format;
}

export function buildFormatOptions(
  resources: RawCkanResource[] | null | undefined,
): DatasetFormatOption[] {
  if (!resources || resources.length === 0) return [];

  let newestDatastore: RawCkanResource | null = null;
  let newestDatastoreTs = -1;

  const deduped = new Map<string, { resource: RawCkanResource; ts: number; format: string; crs: string | null }>();

  for (const res of resources) {
    if (!res.id || !nonEmpty(res.url)) continue;
    const ts = parseTimestamp(res.last_modified ?? res.created);

    if (res.datastore_active) {
      if (ts >= newestDatastoreTs) {
        newestDatastore = res;
        newestDatastoreTs = ts;
      }
      continue;
    }

    const format = normalizeFormat(res);
    const crs = detectCrs(res);
    const key = `${format}|${crs ?? "NONE"}`;
    const existing = deduped.get(key);
    if (!existing || ts > existing.ts) {
      deduped.set(key, { resource: res, ts, format, crs });
    }
  }

  const options: DatasetFormatOption[] = [];

  if (newestDatastore && newestDatastore.url) {
    options.push({
      key: `datastore-api:${newestDatastore.id}`,
      label: "Datastore JSON API",
      format: "API",
      crs: null,
      apiUrl: `${CKAN_BASE_URL}/datastore_search?resource_id=${encodeURIComponent(newestDatastore.id)}`,
      downloadUrl: newestDatastore.url,
      resourceId: newestDatastore.id,
      isDatastore: true,
      sizeBytes: typeof newestDatastore.size === "number" ? newestDatastore.size : null,
    });
  }

  for (const { resource, format, crs } of deduped.values()) {
    if (!resource.url) continue;
    const labelBase = displayFormatLabel(format);
    const label = crs ? `${labelBase} (${crs})` : labelBase;
    options.push({
      key: `${format}:${crs ?? "default"}:${resource.id}`,
      label,
      format,
      crs,
      apiUrl: resource.url,
      downloadUrl: resource.url,
      resourceId: resource.id,
      isDatastore: false,
      sizeBytes: typeof resource.size === "number" ? resource.size : null,
    });
  }

  options.sort((a, b) => {
    const diff = optionSortScore(a) - optionSortScore(b);
    return diff !== 0 ? diff : a.label.localeCompare(b.label);
  });

  return options;
}

export function normalizeSearchResult(pkg: RawCkanPackage): CkanSearchResult {
  const formats = normalizeStringList(pkg.formats, (f) => f.toUpperCase());
  const fallbackFormats =
    formats.length > 0
      ? formats
      : normalizeStringList(
          (pkg.resources ?? []).map((r) => normalizeFormat(r)),
          (f) => f.toUpperCase(),
        );

  return {
    id: pkg.id,
    slug: nonEmpty(pkg.name) ?? pkg.id,
    title: nonEmpty(pkg.title) ?? nonEmpty(pkg.name) ?? pkg.id,
    description: cleanText(pkg.excerpt) || cleanText(pkg.notes),
    refreshRate: nonEmpty(pkg.refresh_rate),
    lastRefreshed: nonEmpty(pkg.last_refreshed) ?? nonEmpty(pkg.metadata_modified),
    publisher:
      nonEmpty(pkg.owner_division) ?? nonEmpty(pkg.organization?.title),
    formats: fallbackFormats,
    topics: normalizeStringList(pkg.topics),
  };
}

export function normalizeDataset(pkg: RawCkanPackage): CkanDataset {
  const division = nonEmpty(pkg.owner_division);
  const unit = nonEmpty(pkg.owner_unit);
  const publisher = division
    ? unit && unit !== division
      ? `${division} — ${unit}`
      : division
    : nonEmpty(pkg.organization?.title);

  return {
    id: pkg.id,
    slug: nonEmpty(pkg.name) ?? pkg.id,
    title: nonEmpty(pkg.title) ?? nonEmpty(pkg.name) ?? pkg.id,
    description: cleanText(pkg.notes) || cleanText(pkg.excerpt),
    datePublished: nonEmpty(pkg.date_published),
    lastUpdated: nonEmpty(pkg.last_refreshed) ?? nonEmpty(pkg.metadata_modified),
    refreshRate: nonEmpty(pkg.refresh_rate),
    dataType: nonEmpty(pkg.dataset_category),
    topics: normalizeStringList(pkg.topics),
    licence: nonEmpty(pkg.license_title) ?? nonEmpty(pkg.license_id),
    publisher,
    contactInfo:
      nonEmpty(pkg.owner_email) ??
      nonEmpty(pkg.maintainer_email) ??
      nonEmpty(pkg.author_email),
    civicIssues: normalizeStringList(pkg.civic_issues),
    formats: normalizeStringList(pkg.formats, (f) => f.toUpperCase()),
    formatOptions: buildFormatOptions(pkg.resources),
  };
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const ts = parseTimestamp(value);
  if (!ts) return value;
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(ts));
}

export function formatBytes(bytes: number | null | undefined): string | null {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return null;
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx++;
  }
  return `${value >= 10 || idx === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[idx]}`;
}

export async function searchDatasets(params: {
  query?: string;
  start?: number;
  rows?: number;
  signal?: AbortSignal;
}): Promise<CkanSearchResponse> {
  const url = new URL(`${CKAN_BASE_URL}/package_search`);
  url.searchParams.set("fq", GEOSPATIAL_FILTER);
  const trimmedQuery = params.query?.trim();
  if (trimmedQuery) {
    url.searchParams.set("q", trimmedQuery);
  }
  url.searchParams.set("start", String(Math.max(0, params.start ?? 0)));
  url.searchParams.set("rows", String(Math.min(50, Math.max(1, params.rows ?? 12))));

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: params.signal,
  });

  if (!response.ok) {
    throw new Error(`Toronto Open Data search failed (${response.status})`);
  }

  const payload = (await response.json()) as CkanEnvelope<{
    count: number;
    results: RawCkanPackage[];
  }>;

  if (!payload.success || !payload.result) {
    throw new Error(payload.error?.message ?? "CKAN search returned an error");
  }

  return {
    count: payload.result.count,
    results: payload.result.results.map(normalizeSearchResult),
  };
}

export async function fetchRawDataset(
  id: string,
  options?: { endpoint?: string; signal?: AbortSignal },
): Promise<RawCkanPackage> {
  const trimmedId = id.trim();
  if (!trimmedId) {
    throw new Error("Dataset ID is required");
  }

  const endpoint = options?.endpoint ?? `${CKAN_BASE_URL}/package_show`;
  const separator = endpoint.includes("?") ? "&" : "?";
  const url = `${endpoint}${separator}id=${encodeURIComponent(trimmedId)}`;

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: options?.signal,
  });

  if (response.status === 404) {
    throw new Response("Dataset not found", { status: 404 });
  }

  if (!response.ok) {
    throw new Error(`Failed to load dataset (${response.status})`);
  }

  const payload = (await response.json()) as CkanEnvelope<RawCkanPackage>;
  if (!payload.success || !payload.result) {
    if (payload.error?.__type === "Not Found Error") {
      throw new Response("Dataset not found", { status: 404 });
    }
    throw new Error(payload.error?.message ?? "CKAN dataset lookup failed");
  }

  return payload.result;
}

export async function getDataset(
  id: string,
  options?: { endpoint?: string; signal?: AbortSignal },
): Promise<CkanDataset> {
  const raw = await fetchRawDataset(id, options);
  return normalizeDataset(raw);
}
