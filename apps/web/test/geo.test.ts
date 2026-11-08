import { describe, expect, it } from "vitest";
import {
  destinationAlong,
  greatCircle,
  headingDestination,
  midpoint,
  routeCoordinates,
  unwrap,
  type LngLat,
} from "../src/lib/geo";

describe("Web Geo Utilities", () => {
  const origin: LngLat = [-0.4543, 51.47]; // LHR [lon, lat]
  const destination: LngLat = [-73.7781, 40.6413]; // JFK [lon, lat]

  describe("greatCircle & routeCoordinates", () => {
    it("generates interpolated coordinates along the route", () => {
      const path = routeCoordinates(origin, destination);
      expect(path.length).toBe(129); // steps = 128 -> 129 points
      expect(path[0]![0]).toBeCloseTo(origin[0], 2);
      expect(path[0]![1]).toBeCloseTo(origin[1], 2);
      expect(path[path.length - 1]![0]).toBeCloseTo(destination[0], 2);
      expect(path[path.length - 1]![1]).toBeCloseTo(destination[1], 2);
    });

    it("returns origin and destination when points are identical", () => {
      const same = greatCircle(origin, origin);
      expect(same).toEqual([origin, origin]);
    });
  });

  describe("unwrap", () => {
    it("preserves continuous longitude across the international antimeridian", () => {
      const crossed: LngLat[] = [
        [179, 10],
        [-179, 11],
      ];
      const unwrapped = unwrap(crossed);
      expect(unwrapped[0]![0]).toBe(179);
      expect(unwrapped[1]![0]).toBe(181); // continuous instead of jumping -358
    });
  });

  describe("midpoint", () => {
    it("picks the middle point of an array of coordinates", () => {
      const pts: LngLat[] = [
        [0, 0],
        [10, 10],
        [20, 20],
      ];
      expect(midpoint(pts)).toEqual([10, 10]);
    });
  });

  describe("destinationAlong", () => {
    it("finds intermediate point along great circle path", () => {
      const half = destinationAlong(origin, destination, 0.5);
      expect(half[0]).toBeLessThan(origin[0]);
      expect(half[0]).toBeGreaterThan(destination[0]);
      expect(half[1]).toBeGreaterThan(destination[1]);
    });
  });

  describe("headingDestination", () => {
    it("projects point given heading and distance in nm", () => {
      const north = headingDestination([0, 0], 0, 60); // 60 nm north ~ 1 deg lat
      expect(north[0]).toBeCloseTo(0, 2);
      expect(north[1]).toBeCloseTo(1, 1);
    });
  });
});
