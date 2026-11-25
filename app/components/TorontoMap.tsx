import { useEffect, useRef, useState } from "react";

const TORONTO_CENTER: [number, number] = [-79.3832, 43.6532];
const TORONTO_MAX_BOUNDS: [[number, number], [number, number]] = [
  [-79.64, 43.58],
  [-79.11, 43.86],
];
const OPENFREEMAP_POSITRON_STYLE =
  "https://tiles.openfreemap.org/styles/positron";

export function TorontoMap() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let mapInstance: import("maplibre-gl").Map | null = null;

    void import("maplibre-gl")
      .then((maplibregl) => {
        if (cancelled || !containerRef.current) return;

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: OPENFREEMAP_POSITRON_STYLE,
          center: TORONTO_CENTER,
          zoom: 10.5,
          minZoom: 9.5,
          maxBounds: TORONTO_MAX_BOUNDS,
          attributionControl: { compact: true },
        });

        map.addControl(new maplibregl.NavigationControl(), "top-right");
        map.addControl(
          new maplibregl.ScaleControl({ unit: "metric" }),
          "bottom-left",
        );

        map.on("error", (event) => {
          if (!cancelled && event.error) {
            setMapError("Map tiles failed to load. Check your connection.");
          }
        });

        mapInstance = map;
      })
      .catch(() => {
        if (!cancelled) {
          setMapError("Unable to initialize MapLibre GL JS.");
        }
      });

    return () => {
      cancelled = true;
      mapInstance?.remove();
    };
  }, []);

  return (
    <section
      aria-label="Toronto basemap"
      className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs"
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 text-xs text-slate-600">
        <span className="font-medium text-slate-800">Toronto Map View</span>
        <span>Locked to City of Toronto bounds</span>
      </div>

      <div className="relative h-[420px] w-full bg-slate-100 sm:h-[480px]">
        <div ref={containerRef} className="h-full w-full" />
        {mapError && (
          <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-lg border border-amber-200 bg-amber-50/95 px-3 py-2 text-xs text-amber-900 shadow-xs">
            {mapError}
          </div>
        )}
      </div>
    </section>
  );
}
