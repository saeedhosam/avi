import type { CabinDimensions } from "../models/cabin.js";

export interface BagDimensionsCm extends CabinDimensions {}

export interface CarryOnFitResult {
  fits: boolean;
  /** The rotation that best fits, or null when none fits. */
  orientation: "upright" | "on_side" | "flat" | null;
  bagVolumeLiters: number;
  binVolumeLiters: number;
  /** Largest overage in cm across the three axes; 0 when it fits. */
  excessCm: number;
  /** Dimension pair that caused the overage, when any. */
  limitingAxis: "width" | "height" | "depth" | null;
  advice: string;
}

export interface CarryOnCompareOptions {
  /** Fit tolerance for soft-sided bags, in cm. Default 1.5 cm. */
  toleranceCm?: number;
}

const VOLUME_LITERS = (dimensions: BagDimensionsCm) =>
  (dimensions.widthCm * dimensions.heightCm * dimensions.depthCm) / 1000;

function orientations(bag: BagDimensionsCm): Array<{
  name: CarryOnFitResult["orientation"];
  dimensions: [number, number, number];
}> {
  const [a, b, c] = [bag.widthCm, bag.heightCm, bag.depthCm];
  return [
    { name: "upright", dimensions: [a, b, c] },
    { name: "on_side", dimensions: [b, a, c] },
    { name: "flat", dimensions: [c, b, a] },
  ];
}

/**
 * Compares an AR-measured bag against the aircraft's overhead bin. Dimensions
 * are approximate (camera calibration error), so the UI must present this as a
 * fit check, not an airline guarantee.
 */
export function compareBagToBin(
  bag: BagDimensionsCm,
  bin: CabinDimensions,
  options: CarryOnCompareOptions = {},
): CarryOnFitResult {
  const tolerance = options.toleranceCm ?? 1.5;
  const binDims = [bin.widthCm, bin.heightCm, bin.depthCm] as const;
  const axes = ["width", "height", "depth"] as const;
  const bagVolume = VOLUME_LITERS(bag);
  const binVolume = VOLUME_LITERS(bin);

  let best: {
    orientation: CarryOnFitResult["orientation"];
    excess: number;
    axis: CarryOnFitResult["limitingAxis"];
    fits: boolean;
  } | null = null;

  for (const orientation of orientations(bag)) {
    let maxExcess = 0;
    let limitingAxis: CarryOnFitResult["limitingAxis"] = null;
    orientation.dimensions.forEach((value, index) => {
      const excess = value - binDims[index]!;
      if (excess > maxExcess) {
        maxExcess = excess;
        limitingAxis = axes[index]!;
      }
    });
    const fits = maxExcess <= tolerance;
    const candidate = {
      orientation: orientation.name,
      excess: Math.max(0, Math.round(maxExcess * 10) / 10),
      axis: limitingAxis,
      fits,
    };
    if (fits) {
      best = candidate;
      break;
    }
    if (!best || candidate.excess < best.excess) best = candidate;
  }

  const fits = best?.fits ?? false;
  const excessCm = best?.excess ?? 0;
  return {
    fits,
    orientation: best?.orientation ?? null,
    bagVolumeLiters: Math.round(bagVolume * 10) / 10,
    binVolumeLiters: Math.round(binVolume * 10) / 10,
    excessCm,
    limitingAxis: best?.axis ?? null,
    advice: fits
      ? `Fits in the overhead bin (${excessCm === 0 ? "within dimensions" : `${excessCm} cm over but within soft-bag tolerance`}).`
      : `Does not fit: ${excessCm} cm over on the ${best?.axis ?? "largest"} axis. Check it at the gate or use a smaller bag.`,
  };
}

export interface ArCalibration {
  /** Known real-world width of the reference object in centimetres. */
  referenceWidthCm: number;
  /** Pixel width of the same object in the camera frame. */
  referencePixelWidth: number;
}

export interface ArBagMeasurement {
  pixelWidth: number;
  pixelHeight: number;
  pixelDepth: number;
  calibration: ArCalibration;
}

/**
 * Converts a camera bounding box to centimetres using a known reference object
 * (e.g. a credit card, 8.56 cm). This is a planar approximation for the AR
 * overlay; depth is inferred from the box's vertical perspective.
 */
export function measureBagFromBoundingBox(
  measurement: ArBagMeasurement,
): BagDimensionsCm | null {
  const { referenceWidthCm, referencePixelWidth } = measurement.calibration;
  if (referencePixelWidth <= 0 || referenceWidthCm <= 0) return null;
  const cmPerPixel = referenceWidthCm / referencePixelWidth;
  const width = measurement.pixelWidth * cmPerPixel;
  const height = measurement.pixelHeight * cmPerPixel;
  // A bag is rarely deeper than it is wide; use a conservative 0.65 ratio.
  const depth = measurement.pixelDepth * cmPerPixel * 0.65;
  if (![width, height, depth].every((value) => Number.isFinite(value) && value > 0)) {
    return null;
  }
  return {
    widthCm: Math.round(width * 10) / 10,
    heightCm: Math.round(height * 10) / 10,
    depthCm: Math.round(depth * 10) / 10,
  };
}
