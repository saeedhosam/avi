import type {
  AircraftCabinLayout,
  AirlineCabinLayoutOverride,
  CabinDeck,
  CabinFeature,
  CabinSeat,
  OverheadBinSpec,
  ResolvedSeat,
  SeatClass,
  WindowAlignment,
} from "../models/cabin.js";

interface ClassBand {
  fromRow: number;
  toRow: number;
  seatClass: SeatClass;
  pitchInches: number;
  reclineInches: number;
  power: boolean;
  usb: boolean;
}

interface DeckPreset {
  name: string;
  rows: number;
  columns: string[];
  aisles: number[];
  bands: ClassBand[];
  windowlessRows?: number[];
  misalignedRows?: number[];
}

interface CabinPreset {
  aircraftType: string;
  aliases: string[];
  decks: DeckPreset[];
  bin: Omit<OverheadBinSpec, "aircraftType">;
  isExact: boolean;
}

const COLUMNS_3_3 = ["A", "B", "C", "D", "E", "F"];
const COLUMNS_3_4_3 = ["A", "B", "C", "D", "E", "F", "G", "H", "J", "K"];
const COLUMNS_2_4_2 = ["A", "B", "C", "D", "E", "F", "G", "H", "J"];
const COLUMNS_2_2 = ["A", "C", "D", "F"];

const PRESETS: CabinPreset[] = [
  {
    aircraftType: "A320",
    aliases: ["A320", "A20N", "A319", "A321", "AIRBUS A320", "AIRBUS A320NEO"],
    decks: [
      {
        name: "Main deck",
        rows: 30,
        columns: COLUMNS_3_3,
        aisles: [3],
        bands: [
          {
            fromRow: 1,
            toRow: 4,
            seatClass: "BUSINESS",
            pitchInches: 36,
            reclineInches: 6,
            power: true,
            usb: true,
          },
          {
            fromRow: 5,
            toRow: 30,
            seatClass: "ECONOMY",
            pitchInches: 30,
            reclineInches: 4,
            power: false,
            usb: true,
          },
        ],
        misalignedRows: [9, 10, 11],
      },
    ],
    bin: {
      widthCm: 55,
      heightCm: 40,
      depthCm: 25,
      carryOnCapacity: 3,
      note: "Approximate A320 Family overhead bin; actual fit varies by retrofit.",
    },
    isExact: false,
  },
  {
    aircraftType: "B738",
    aliases: [
      "B738",
      "B737",
      "738",
      "737-800",
      "B737-800",
      "BOEING 737-800",
      "BOEING737800",
      "737800",
    ],
    decks: [
      {
        name: "Main deck",
        rows: 31,
        columns: COLUMNS_3_3,
        aisles: [3],
        bands: [
          {
            fromRow: 1,
            toRow: 4,
            seatClass: "BUSINESS",
            pitchInches: 36,
            reclineInches: 6,
            power: true,
            usb: true,
          },
          {
            fromRow: 5,
            toRow: 31,
            seatClass: "ECONOMY",
            pitchInches: 30,
            reclineInches: 4,
            power: false,
            usb: true,
          },
        ],
        misalignedRows: [12, 13],
      },
    ],
    bin: {
      widthCm: 55,
      heightCm: 40,
      depthCm: 25,
      carryOnCapacity: 3,
      note: "Approximate 737-800 overhead bin; actual fit varies by retrofit.",
    },
    isExact: false,
  },
  {
    aircraftType: "B789",
    aliases: ["B789", "B787-9", "B787", "BOEING 787-9", "B78X"],
    decks: [
      {
        name: "Main deck",
        rows: 42,
        columns: COLUMNS_2_4_2,
        aisles: [2, 6],
        bands: [
          {
            fromRow: 1,
            toRow: 8,
            seatClass: "BUSINESS",
            pitchInches: 44,
            reclineInches: 78,
            power: true,
            usb: true,
          },
          {
            fromRow: 9,
            toRow: 13,
            seatClass: "PREMIUM_ECONOMY",
            pitchInches: 38,
            reclineInches: 8,
            power: true,
            usb: true,
          },
          {
            fromRow: 14,
            toRow: 42,
            seatClass: "ECONOMY",
            pitchInches: 32,
            reclineInches: 5,
            power: true,
            usb: true,
          },
        ],
        misalignedRows: [21, 22],
      },
    ],
    bin: {
      widthCm: 60,
      heightCm: 45,
      depthCm: 30,
      carryOnCapacity: 4,
      note: "Approximate 787-9 overhead bin; 55×40×20 cm reference bag.",
    },
    isExact: false,
  },
  {
    aircraftType: "B77W",
    aliases: ["B77W", "B777-300ER", "B777", "BOEING 777-300ER", "B773"],
    decks: [
      {
        name: "Main deck",
        rows: 57,
        columns: COLUMNS_3_4_3,
        aisles: [3, 7],
        bands: [
          {
            fromRow: 1,
            toRow: 2,
            seatClass: "FIRST",
            pitchInches: 78,
            reclineInches: 80,
            power: true,
            usb: true,
          },
          {
            fromRow: 3,
            toRow: 8,
            seatClass: "BUSINESS",
            pitchInches: 42,
            reclineInches: 70,
            power: true,
            usb: true,
          },
          {
            fromRow: 9,
            toRow: 14,
            seatClass: "PREMIUM_ECONOMY",
            pitchInches: 38,
            reclineInches: 8,
            power: true,
            usb: true,
          },
          {
            fromRow: 15,
            toRow: 57,
            seatClass: "ECONOMY",
            pitchInches: 32,
            reclineInches: 5,
            power: true,
            usb: true,
          },
        ],
        misalignedRows: [30, 31],
      },
    ],
    bin: {
      widthCm: 62,
      heightCm: 45,
      depthCm: 32,
      carryOnCapacity: 5,
      note: "Approximate 777-300ER overhead bin; 55×40×20 cm reference bag.",
    },
    isExact: false,
  },
  {
    aircraftType: "A388",
    aliases: ["A388", "A380", "A380-800", "AIRBUS A380", "A38X"],
    decks: [
      {
        name: "Main deck",
        rows: 55,
        columns: COLUMNS_3_4_3,
        aisles: [3, 7],
        bands: [
          {
            fromRow: 1,
            toRow: 6,
            seatClass: "PREMIUM_ECONOMY",
            pitchInches: 38,
            reclineInches: 8,
            power: true,
            usb: true,
          },
          {
            fromRow: 7,
            toRow: 55,
            seatClass: "ECONOMY",
            pitchInches: 32,
            reclineInches: 5,
            power: true,
            usb: true,
          },
        ],
      },
      {
        name: "Upper deck",
        rows: 30,
        columns: COLUMNS_2_2,
        aisles: [2],
        bands: [
          {
            fromRow: 1,
            toRow: 4,
            seatClass: "FIRST",
            pitchInches: 80,
            reclineInches: 82,
            power: true,
            usb: true,
          },
          {
            fromRow: 5,
            toRow: 30,
            seatClass: "BUSINESS",
            pitchInches: 44,
            reclineInches: 74,
            power: true,
            usb: true,
          },
        ],
      },
    ],
    bin: {
      widthCm: 65,
      heightCm: 48,
      depthCm: 34,
      carryOnCapacity: 5,
      note: "Approximate A380 overhead bin; actual fit varies by deck and retrofit.",
    },
    isExact: false,
  },
];

const GENERIC_PRESET: CabinPreset = {
  aircraftType: "GENERIC",
  aliases: [],
  decks: [
    {
      name: "Main deck",
      rows: 30,
      columns: COLUMNS_3_3,
      aisles: [3],
      bands: [
        {
          fromRow: 1,
          toRow: 30,
          seatClass: "ECONOMY",
          pitchInches: 31,
          reclineInches: 4,
          power: false,
          usb: false,
        },
      ],
    },
  ],
  bin: {
    widthCm: 55,
    heightCm: 40,
    depthCm: 25,
    carryOnCapacity: 3,
    note: "Generic narrowbody overhead bin. Select a known aircraft for a closer fit.",
  },
  isExact: false,
};

/**
 * Real airline-specific layouts with provenance.
 *
 * This registry is intentionally empty until the repo has a verifiable source
 * for a carrier's cabin plan. Do not add a row just to make an airline look
 * certified: the parametric fallback already covers unknown or unsourced
 * airlines and remains `isExact: false`.
 */
export const CURATED_AIRLINE_CABIN_LAYOUTS: readonly AirlineCabinLayoutOverride[] =
  [];

function normalizeAirlineCode(raw: string | null | undefined): string {
  return (raw ?? "").trim().toUpperCase();
}

/**
 * Looks up an explicit airline override. Unknown airlines — and airlines with
 * no curated row — return null so the caller falls back to the parametric
 * aircraft preset.
 */
export function findCuratedAirlineLayout(
  aircraftType: string | null | undefined,
  airlineCode: string | null | undefined,
  overrides: readonly AirlineCabinLayoutOverride[] = CURATED_AIRLINE_CABIN_LAYOUTS,
): AirlineCabinLayoutOverride | null {
  const code = normalizeAirlineCode(airlineCode);
  if (!code) return null;
  const normalizedType = normalizeAircraftType(aircraftType);
  return (
    overrides.find(
      (entry) =>
        normalizeAirlineCode(entry.airlineCode) === code &&
        normalizeAircraftType(entry.aircraftType) === normalizedType,
    ) ?? null
  );
}

export function normalizeAircraftType(raw: string | null | undefined): string {
  if (!raw) return "GENERIC";
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  for (const preset of PRESETS) {
    if (
      preset.aliases.some(
        (alias) => alias.toUpperCase().replace(/[^A-Z0-9]/g, "") === compact,
      )
    ) {
      return preset.aircraftType;
    }
  }
  // Common partial matches, e.g. "BOEING777300ER".
  for (const preset of PRESETS) {
    if (
      preset.aliases.some((alias) => {
        const normalized = alias.toUpperCase().replace(/[^A-Z0-9]/g, "");
        return compact.includes(normalized) || normalized.includes(compact);
      })
    ) {
      return preset.aircraftType;
    }
  }
  return "GENERIC";
}

function bandForRow(
  preset: CabinPreset,
  deckIndex: number,
  row: number,
): ClassBand {
  const deck = preset.decks[deckIndex]!;
  return (
    deck.bands.find((band) => row >= band.fromRow && row <= band.toRow) ??
    deck.bands[deck.bands.length - 1]!
  );
}

function windowAlignmentFor(
  preset: CabinPreset,
  deckIndex: number,
  row: number,
  columnIndex: number,
  columnCount: number,
): WindowAlignment {
  const isWindowColumn = columnIndex === 0 || columnIndex === columnCount - 1;
  if (!isWindowColumn) return "NO_WINDOW";
  if (preset.decks[deckIndex]?.windowlessRows?.includes(row))
    return "NO_WINDOW";
  if (preset.decks[deckIndex]?.misalignedRows?.includes(row)) {
    return "MISALIGNED_WINDOW";
  }
  return "FULL_WINDOW";
}

function buildDeck(
  preset: CabinPreset,
  deckIndex: number,
): {
  deck: CabinDeck;
  seats: CabinSeat[];
  features: CabinFeature[];
} {
  const source = preset.decks[deckIndex]!;
  const rowStartY = 0.16;
  const rowEndY = 0.9;
  const deck: CabinDeck = {
    index: deckIndex,
    name: source.name,
    seatClasses: [...new Set(source.bands.map((band) => band.seatClass))],
    rows: source.rows,
    columns: source.columns,
    rowStartY,
    rowEndY,
    aisles: source.aisles,
  };
  const seats: CabinSeat[] = [];
  for (let row = 1; row <= source.rows; row += 1) {
    const band = bandForRow(preset, deckIndex, row);
    const y =
      source.rows === 1
        ? rowStartY
        : rowStartY + ((row - 1) / (source.rows - 1)) * (rowEndY - rowStartY);
    source.columns.forEach((letter, columnIndex) => {
      const x =
        0.1 + (columnIndex / Math.max(1, source.columns.length - 1)) * 0.8;
      seats.push({
        id: `${row}${letter}`,
        deck: deckIndex,
        row,
        letter,
        seatClass: band.seatClass,
        position: { x, y },
        windowAlignment: windowAlignmentFor(
          preset,
          deckIndex,
          row,
          columnIndex,
          source.columns.length,
        ),
        hasPowerOutlet: band.power,
        hasUsb: band.usb,
        pitchInches: band.pitchInches,
        reclineInches: band.reclineInches,
        isExitRow: row === 1 || row === source.rows,
        hasExtraLegroom: band.pitchInches >= 38,
      });
    });
  }

  const features: CabinFeature[] = [
    {
      id: `deck-${deckIndex}-lav-front`,
      deck: deckIndex,
      kind: "LAVATORY",
      label: "Forward lavatories",
      position: { x: 0.2, y: 0.08 },
      rowRange: [1, 2],
    },
    {
      id: `deck-${deckIndex}-lav-rear`,
      deck: deckIndex,
      kind: "LAVATORY",
      label: "Rear lavatories",
      position: { x: 0.78, y: 0.95 },
      rowRange: [source.rows - 1, source.rows],
    },
    {
      id: `deck-${deckIndex}-galley-front`,
      deck: deckIndex,
      kind: "GALLEY",
      label: "Forward galley",
      position: { x: 0.5, y: 0.06 },
      rowRange: [1, 1],
    },
    {
      id: `deck-${deckIndex}-galley-rear`,
      deck: deckIndex,
      kind: "GALLEY",
      label: "Rear galley",
      position: { x: 0.5, y: 0.97 },
      rowRange: [source.rows, source.rows],
    },
    {
      id: `deck-${deckIndex}-exit-front`,
      deck: deckIndex,
      kind: "EMERGENCY_EXIT",
      label: "Forward emergency exits",
      position: { x: 0.08, y: 0.16 },
      rowRange: [1, 1],
    },
    {
      id: `deck-${deckIndex}-exit-overwing`,
      deck: deckIndex,
      kind: "EMERGENCY_EXIT",
      label: "Overwing exits",
      position: { x: 0.08, y: 0.52 },
      rowRange: [Math.round(source.rows * 0.4), Math.round(source.rows * 0.45)],
    },
    {
      id: `deck-${deckIndex}-exit-rear`,
      deck: deckIndex,
      kind: "EMERGENCY_EXIT",
      label: "Rear emergency exits",
      position: { x: 0.08, y: 0.9 },
      rowRange: [source.rows, source.rows],
    },
  ];
  return { deck, seats, features };
}

export interface CabinLayoutOptions {
  source?: AircraftCabinLayout["source"];
  /** Optional airline code; only a sourced CURATED override can change the plan. */
  airlineCode?: string | null;
  now?: () => Date;
}

/**
 * Parametric, renderer-ready cabin layout.
 *
 * Aircraft types with a preset (A320, B738, B789, B77W, A388) get an
 * approximate deck plan; unknown types fall back to a generic narrowbody.
 * `isExact` is false for every generated layout, and the disclaimer must remain
 * visible in the UI. An airline code is accepted only to check the explicit
 * curated-override registry; unknown airlines still receive the parametric
 * layout.
 */
export function resolveCabinLayout(
  aircraftType: string | null | undefined,
  options: CabinLayoutOptions = {},
): AircraftCabinLayout {
  const override = findCuratedAirlineLayout(aircraftType, options.airlineCode);
  if (override) {
    return {
      ...override.layout,
      source: "CURATED",
    };
  }

  const normalized = normalizeAircraftType(aircraftType);
  const preset =
    PRESETS.find((item) => item.aircraftType === normalized) ?? GENERIC_PRESET;
  const decks: CabinDeck[] = [];
  const seats: CabinSeat[] = [];
  const features: CabinFeature[] = [];
  preset.decks.forEach((_, index) => {
    const built = buildDeck(preset, index);
    decks.push(built.deck);
    seats.push(...built.seats);
    features.push(...built.features);
  });
  const now = (options.now ?? (() => new Date()))().toISOString();
  return {
    aircraftType: preset.aircraftType,
    layoutKey: `${preset.aircraftType}-v1`,
    source: options.source ?? "PARAMETRIC",
    updatedAt: now,
    decks,
    seats,
    features,
    overheadBins: [{ aircraftType: preset.aircraftType, ...preset.bin }],
    isExact: preset.isExact,
    disclaimer:
      "Seat map is a parametric reconstruction from the aircraft type, not a certified cabin plan. Verify at the gate.",
  };
}

export function parseSeatNumber(
  seatNumber: string | null | undefined,
): { row: number; letter: string } | null {
  const match = seatNumber
    ?.trim()
    .toUpperCase()
    .match(/^(\d{1,3})\s*([A-K])$/);
  if (!match) return null;
  const row = Number(match[1]);
  if (!Number.isFinite(row) || row <= 0) return null;
  return { row, letter: match[2]! };
}

function seatDistanceMeters(a: CabinSeat, b: CabinFeature): number {
  // Deck plans are ~60 m long and ~6 m wide; normalized distances are scaled
  // to approximate metres for the "nearby" labels.
  const dx = (a.position.x - b.position.x) * 6;
  const dy = (a.position.y - b.position.y) * 55;
  if (a.deck !== b.deck) return Number.POSITIVE_INFINITY;
  return Math.hypot(dx, dy);
}

export function resolveSeat(
  layout: AircraftCabinLayout,
  seatNumber: string,
): ResolvedSeat {
  const parsed = parseSeatNumber(seatNumber);
  const seat =
    parsed == null
      ? null
      : (layout.seats.find(
          (candidate) =>
            candidate.row === parsed.row && candidate.letter === parsed.letter,
        ) ?? null);

  if (!seat) {
    return {
      layout,
      seat: null,
      nearbyFeatures: [],
      distanceToLavatoryMeters: null,
      distanceToExitMeters: null,
      windowNote: "Seat not found in the parametric cabin layout.",
      legroomNote: "Legroom not reported.",
      powerNote: "Power availability not reported.",
    };
  }

  const features = layout.features
    .filter((feature) => feature.deck === seat.deck)
    .map((feature) => ({
      feature,
      distance: seatDistanceMeters(seat, feature),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 4)
    .map((entry) => entry.feature);

  const lavatory = layout.features
    .filter((feature) => feature.kind === "LAVATORY")
    .map((feature) => seatDistanceMeters(seat, feature))
    .filter(Number.isFinite)
    .sort((a, b) => a - b)[0];
  const exit = layout.features
    .filter((feature) => feature.kind === "EMERGENCY_EXIT")
    .map((feature) => seatDistanceMeters(seat, feature))
    .filter(Number.isFinite)
    .sort((a, b) => a - b)[0];

  return {
    layout,
    seat,
    nearbyFeatures: features,
    distanceToLavatoryMeters: lavatory == null ? null : Math.round(lavatory),
    distanceToExitMeters: exit == null ? null : Math.round(exit),
    windowNote:
      seat.windowAlignment === "FULL_WINDOW"
        ? "Full window aligned with this seat."
        : seat.windowAlignment === "MISALIGNED_WINDOW"
          ? "Window is misaligned with this row."
          : seat.windowAlignment === "NO_WINDOW"
            ? "No window at this seat."
            : "Window position not known.",
    legroomNote: seat.pitchInches
      ? `${seat.pitchInches} in pitch${seat.hasExtraLegroom ? " · extra legroom" : ""}.`
      : "Legroom not reported.",
    powerNote: seat.hasPowerOutlet
      ? `Power outlet${seat.hasUsb ? " + USB" : ""} available.`
      : seat.hasUsb
        ? "USB only; no AC outlet reported."
        : "No seat power reported.",
  };
}
