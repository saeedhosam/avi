"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { createBaseMap, type MapTheme } from "./maplibre";

export function useMapLibre(
  theme: MapTheme = "light",
  options: {
    center?: [number, number];
    zoom?: number;
    minZoom?: number;
    maxZoom?: number;
    attribution?: boolean;
  } = {},
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const instance = createBaseMap(containerRef.current, options, theme);
    let disposed = false;

    const handleLoad = () => {
      if (disposed) return;
      instance.resize();
      setMap(instance);
    };
    instance.on("load", handleLoad);

    const resizeObserver = new ResizeObserver(() => instance.resize());
    resizeObserver.observe(containerRef.current);

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      instance.off("load", handleLoad);
      instance.remove();
      setMap(null);
    };
    // Recreate on theme change; callers update sources imperatively.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  return { containerRef, map };
}
