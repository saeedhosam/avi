import { describe, expect, it } from "vitest";
import { terminalSpatialGraphSchema } from "../src/models/terminalMap.js";
import {
  buildOsmIndoorGraph,
  type OsmIndoorElement,
} from "../src/services/osmIndoorGraph.js";

describe("OSM indoor graph builder", () => {
  const elements: OsmIndoorElement[] = [
    {
      type: "node",
      id: 1,
      lat: 30.111,
      lon: 31.405,
      tags: { indoor: "corridor", level: "1" },
    },
    { type: "node", id: 2, lat: 30.1111, lon: 31.4052 },
    {
      type: "node",
      id: 3,
      lat: 30.1112,
      lon: 31.4054,
      tags: { aeroway: "gate", ref: "A12", level: "1" },
    },
    {
      type: "node",
      id: 4,
      lat: 30.1113,
      lon: 31.4056,
      tags: { amenity: "toilets", level: "1" },
    },
    // Unreferenced and untagged: it is not part of any indoor feature.
    { type: "node", id: 5, lat: 30.1114, lon: 31.4058 },
    {
      type: "way",
      id: 100,
      nodes: [1, 2, 3],
      tags: { indoor: "corridor", level: "1" },
    },
    {
      type: "way",
      id: 101,
      nodes: [2, 4],
      tags: { highway: "footway", level: "1" },
    },
    {
      type: "way",
      id: 102,
      center: { lat: 30.1115, lon: 31.406 },
      tags: { amenity: "lounge", name: "Sky Lounge", level: "1" },
    },
    {
      type: "way",
      id: 103,
      nodes: [1, 2, 4],
      center: { lat: 30.1116, lon: 31.4062 },
      tags: {
        indoor: "room",
        shop: "duty_free",
        name: "Duty Free",
        level: "1",
      },
    },
  ];

  it("builds corridor edges from way node sequences, not proximity", () => {
    const graph = buildOsmIndoorGraph(elements, {
      airportCode: "CAI",
      terminalId: "T3",
      now: new Date("2026-11-14T10:00:00Z"),
    });

    expect(graph.source).toBe("osm_indoor");
    expect(graph.airportCode).toBe("CAI");
    expect(graph.terminalId).toBe("T3");
    expect(graph.updatedAt).toBe("2026-11-14T10:00:00.000Z");
    expect(() => terminalSpatialGraphSchema.parse(graph)).not.toThrow();

    const corridorEdges = graph.edges.filter(
      (edge) => edge.kind === "corridor",
    );
    expect(corridorEdges.map((edge) => [edge.from, edge.to])).toEqual([
      ["OSM-NODE-1", "OSM-NODE-2"],
      ["OSM-NODE-2", "OSM-NODE-3"],
    ]);
    expect(corridorEdges.every((edge) => edge.distanceMeters > 0)).toBe(true);
    expect(graph.edges.some((edge) => edge.kind === "walkway")).toBe(true);
    // The gate and restroom are adjacent in way 103, but that is a room
    // outline, not a corridor: no proximity edge may connect them.
    expect(
      graph.edges.some(
        (edge) =>
          (edge.from === "OSM-NODE-3" && edge.to === "OSM-NODE-4") ||
          (edge.from === "OSM-NODE-4" && edge.to === "OSM-NODE-3"),
      ),
    ).toBe(false);
    expect(graph.edges).toHaveLength(3);
  });

  it("keeps OSM tags and category provenance on tagged nodes", () => {
    const graph = buildOsmIndoorGraph(elements, { airportCode: "CAI" });

    const gate = graph.nodes.find((node) => node.id === "OSM-NODE-3");
    expect(gate).toMatchObject({
      kind: "gate",
      category: "GATE",
      label: "Gate A12",
      level: 1,
    });
    expect(gate?.tags?.aeroway).toBe("gate");

    const restroom = graph.nodes.find((node) => node.id === "OSM-NODE-4");
    expect(restroom).toMatchObject({
      kind: "poi",
      category: "RESTROOM",
      level: 1,
    });

    // The untagged corridor vertex inherits the way's level.
    const junction = graph.nodes.find((node) => node.id === "OSM-NODE-2");
    expect(junction).toMatchObject({ kind: "junction", level: 1 });
    expect(junction?.tags).toBeUndefined();

    const lounge = graph.nodes.find((node) => node.id === "OSM-WAY-102");
    expect(lounge).toMatchObject({
      kind: "poi",
      category: "LOUNGE",
      label: "Sky Lounge",
    });
    const shop = graph.nodes.find((node) => node.id === "OSM-WAY-103");
    expect(shop).toMatchObject({ kind: "poi", category: "SHOPPING" });

    // Node 5 is neither tagged nor referenced by a circulation way.
    expect(graph.nodes.some((node) => node.id === "OSM-NODE-5")).toBe(false);
  });

  it("skips missing way geometry and wires the resolvable sequence", () => {
    const payload: OsmIndoorElement[] = [
      { type: "node", id: 10, lat: 30.11, lon: 31.4 },
      { type: "node", id: 11, lat: 30.1101, lon: 31.4001 },
      {
        type: "way",
        id: 200,
        nodes: [10, 999, 11],
        tags: { indoor: "corridor", level: "1" },
      },
    ];
    const graph = buildOsmIndoorGraph(payload, { airportCode: "CAI" });
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toMatchObject({
      from: "OSM-NODE-10",
      to: "OSM-NODE-11",
      kind: "corridor",
    });
  });

  it("rejects an invalid airport code instead of writing a bad graph", () => {
    expect(() => buildOsmIndoorGraph([], { airportCode: "CAIRO" })).toThrow(
      /3-letter IATA/,
    );
  });
});
