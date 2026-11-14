import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { airportTerminalLayoutSchema } from "../src/models/terminalMap.js";
import {
  buildTerminalGraph,
  emptyFogOfWarState,
  evaluateSprintMode,
  findGateNode,
  findNearestAmenity,
  recordFogVisit,
} from "../src/services/terminalNavigation.js";

const layouts = JSON.parse(
  readFileSync(new URL("../../catalog/terminal-layouts.json", import.meta.url), "utf8"),
) as unknown[];

const jfk = airportTerminalLayoutSchema.parse(
  layouts.find((layout) => (layout as { airportCode?: string }).airportCode === "JFK"),
);

describe("terminal spatial graph", () => {
  it("parses the bundled terminal catalog (concourseSections schema)", () => {
    expect(jfk.airportCode).toBe("JFK");
    expect(jfk.floors["1"]?.concourseSections.length).toBeGreaterThan(0);
    expect(jfk.amenities.length).toBeGreaterThan(10);
  });

  it("builds a connected multi-level graph", () => {
    const graph = buildTerminalGraph(jfk);
    expect(graph.nodes.length).toBeGreaterThan(20);
    expect(graph.edges.length).toBeGreaterThan(20);
    expect(graph.nodes.some((node) => node.id.startsWith("HUB-1"))).toBe(true);
    expect(graph.edges.some((edge) => edge.kind === "elevator")).toBe(true);
    expect(findGateNode(graph, "B22")?.label).toContain("B22");
  });

  it("finds the nearest restroom from a gate with a walk estimate", () => {
    const graph = buildTerminalGraph(jfk);
    const gate = findGateNode(graph, "B22");
    expect(gate).not.toBeNull();
    const nearest = findNearestAmenity(graph, jfk, gate!.id, "RESTROOM");
    expect(nearest).not.toBeNull();
    expect(nearest!.route.totalDistanceMeters).toBeGreaterThan(0);
    expect(nearest!.route.estimatedMinutes).toBeGreaterThan(0);
    expect(nearest!.route.path[0]?.id).toBe(gate!.id);
  });

  it("activates sprint mode under 45 minutes and routes between gates", () => {
    const graph = buildTerminalGraph(jfk);
    const state = evaluateSprintMode({
      layout: jfk,
      graph,
      arrivalGate: "B22",
      departureGate: "B36",
      arrivalTime: "12:00",
      boardingTime: "12:30",
    });
    expect(state.active).toBe(true);
    expect(state.urgency).toBe("sprint");
    expect(state.route).not.toBeNull();
    expect(state.route!.estimatedMinutes).toBeGreaterThan(0);
    expect(state.headline).toContain("30 min");
  });

  it("does not activate sprint mode for a comfortable connection", () => {
    const graph = buildTerminalGraph(jfk);
    const state = evaluateSprintMode({
      layout: jfk,
      graph,
      arrivalGate: "B22",
      departureGate: "B36",
      arrivalTime: "12:00",
      boardingTime: "14:00",
    });
    expect(state.active).toBe(false);
    expect(state.urgency).toBe("normal");
  });

  it("clears terminal fog and unlocks deterministic badges", () => {
    let state = emptyFogOfWarState("2026-11-14T12:00:00Z");
    state = recordFogVisit(state, {
      airportCode: "JFK",
      terminalId: "T4",
      level: 1,
      aircraftType: "B77W",
      now: "2026-11-14T12:05:00Z",
    });
    expect(state.visitedAirportCodes).toEqual(["JFK"]);
    expect(state.visitedTerminalKeys).toEqual(["JFK-T4-L1"]);
    expect(state.badges).toContain("FIRST_TERMINAL_CLEARED");
  });
});
