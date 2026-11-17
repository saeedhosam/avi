"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import { createBaseMap } from "./maplibre";

export function useMapLibre(
  options: {
    center?: [number, number];
    zoom?: number;
    minZoom?: number;
    maxZoom?: number;
    attribution?: boolean;
    navigation?: boolean;
    style?: StyleSpecification | string | (() => StyleSpecification | string);
  } = {},
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const instance = createBaseMap(containerRef.current, options);
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
    // Callers update sources imperatively after the initial style load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { containerRef, map };
}
