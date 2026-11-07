import type { AircraftCabinSpec, CabinClass, SeatInfo, SeatFeature } from "./types";

function createSeat(
  row: number,
  letter: string,
  cabin: CabinClass,
  isWindow: boolean,
  isAisle: boolean,
  isMiddle: boolean,
  options: {
    pitch: number;
    width: number;
    recline: number;
    isExitRow?: boolean;
    isBulkhead?: boolean;
    status?: "AVAILABLE" | "OCCUPIED" | "SELECTED" | "BLOCKED";
    extraFeatures?: SeatFeature[];
    rating?: "GOOD" | "STANDARD" | "CAUTION";
    notes?: string;
  },
): SeatInfo {
  const features: SeatFeature[] = [...(options.extraFeatures ?? [])];
  if (cabin === "FIRST" || cabin === "BUSINESS") {
    features.push("LIE_FLAT", "POWER_OUTLET", "USB_C");
    if (isAisle || cabin === "FIRST") features.push("DIRECT_AISLE");
  } else {
    features.push("POWER_OUTLET", "USB_C");
  }
  if (options.isExitRow) features.push("EXIT_ROW", "EXTRA_LEGROOM");
  if (options.isBulkhead) features.push("EXTRA_LEGROOM", "BASSINET");

  // Determine review rating and notes if not provided
  let rating = options.rating ?? "STANDARD";
  let notes = options.notes ?? `Standard ${cabin.toLowerCase().replace("_", " ")} seat with good legroom and personal entertainment display.`;

  if (options.isExitRow) {
    rating = "GOOD";
    notes = "Extra legroom exit row seat. Quick access to aisle, tray table in armrest.";
  } else if (options.isBulkhead) {
    rating = "GOOD";
    notes = "Bulkhead seat with generous knee space. No underseat storage during taxi, takeoff, and landing.";
  } else if (isWindow) {
    notes = "Window seat with scenic views and wall headrest support.";
  } else if (isAisle) {
    notes = "Aisle seat with direct access to cabin walkway and easy overhead bin access.";
  } else if (isMiddle) {
    notes = "Middle seat positioned between aisle and window passengers.";
  }

  return {
    id: `${row}${letter}`,
    row,
    letter,
    cabin,
    isWindow,
    isAisle,
    isMiddle,
    isExitRow: options.isExitRow,
    isBulkhead: options.isBulkhead,
    status: options.status ?? (Math.random() > 0.4 ? "AVAILABLE" : "OCCUPIED"),
    pitchInches: options.pitch,
    widthInches: options.width,
    reclineInches: options.recline,
    features,
    review: {
      rating,
      notes,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// 1. EgyptAir Airbus A320neo (Short-to-Medium Haul)
// ─────────────────────────────────────────────────────────────
function buildEgyptAirA320neo(): AircraftCabinSpec {
  const exitRows = [11, 12];
  const wingsRowRange: [number, number] = [9, 17];
  const rows: AircraftCabinSpec["rows"] = [];

  // Business Class: Rows 1 to 4 (2-2 layout: A, C - D, F)
  for (let r = 1; r <= 4; r++) {
    const isBulkhead = r === 1;
    const seats: SeatInfo[] = [
      createSeat(r, "A", "BUSINESS", true, false, false, {
        pitch: 38,
        width: 21,
        recline: 7,
        isBulkhead,
        extraFeatures: isBulkhead ? ["EXTRA_LEGROOM"] : [],
        notes: isBulkhead ? "Front row Business seat with priority service and dedicated coat hook." : "Comfortable recliner with footrest and AC power.",
      }),
      createSeat(r, "C", "BUSINESS", false, true, false, {
        pitch: 38,
        width: 21,
        recline: 7,
        isBulkhead,
      }),
      createSeat(r, "D", "BUSINESS", false, true, false, {
        pitch: 38,
        width: 21,
        recline: 7,
        isBulkhead,
      }),
      createSeat(r, "F", "BUSINESS", true, false, false, {
        pitch: 38,
        width: 21,
        recline: 7,
        isBulkhead,
        extraFeatures: isBulkhead ? ["EXTRA_LEGROOM"] : [],
      }),
    ];
    rows.push({
      rowNumber: r,
      cabin: "BUSINESS",
      isBulkhead,
      hasGalleyAhead: r === 1,
      seats,
    });
  }

  // Economy Class: Rows 6 to 26 (3-3 layout: A, B, C - D, E, F)
  for (let r = 6; r <= 26; r++) {
    const isExitRow = exitRows.includes(r);
    const isBulkhead = r === 6;
    const isLast = r === 26;
    const letters = ["A", "B", "C", "D", "E", "F"];
    const seats: SeatInfo[] = letters.map((letter) => {
      const isWindow = letter === "A" || letter === "F";
      const isAisle = letter === "C" || letter === "D";
      const isMiddle = letter === "B" || letter === "E";
      let rating: "GOOD" | "STANDARD" | "CAUTION" = "STANDARD";
      let notes = "Standard comfortable Economy seat with 10.1\" HD touchscreen.";

      if (isExitRow) {
        rating = "GOOD";
        notes = "Overwing emergency exit row with 37\" pitch. Must be willing to assist in emergency.";
      } else if (isBulkhead) {
        rating = "GOOD";
        notes = "Bulkhead row with extra knee clearance and bassinet attachments.";
      } else if (isLast) {
        rating = "CAUTION";
        notes = "Last row near aft lavatories and galley. Limited recline and potential noise.";
      }

      return createSeat(r, letter, "ECONOMY", isWindow, isAisle, isMiddle, {
        pitch: isExitRow ? 37 : isBulkhead ? 34 : 31,
        width: 18,
        recline: isLast ? 2 : 5,
        isExitRow,
        isBulkhead,
        rating,
        notes,
      });
    });

    rows.push({
      rowNumber: r,
      cabin: "ECONOMY",
      isExitRow,
      isBulkhead,
      hasLavatoryBehind: isLast,
      seats,
    });
  }

  return {
    id: "MS-A320NEO",
    airlineCode: "MS",
    airlineName: "EgyptAir",
    aircraftModel: "Airbus A320neo",
    manufacturer: "Airbus",
    tailNumberSample: "SU-GFK",
    totalSeats: 142,
    wingsRowRange,
    exitRows,
    cabins: [
      {
        name: "Business Class",
        classType: "BUSINESS",
        rowStart: 1,
        rowEnd: 4,
        layout: "2-2",
        aislesAfterLetters: ["C"],
        letters: ["A", "C", "D", "F"],
        pitchInches: 38,
        widthInches: 21,
      },
      {
        name: "Economy Class",
        classType: "ECONOMY",
        rowStart: 6,
        rowEnd: 26,
        layout: "3-3",
        aislesAfterLetters: ["C"],
        letters: ["A", "B", "C", "D", "E", "F"],
        pitchInches: 31,
        widthInches: 18,
      },
    ],
    amenities: {
      wifi: "High-speed Inmarsat GX satellite broadband",
      power: "Universal 110V AC power outlet at every seat",
      ife: "EgyptAir OnAir personal 10.1\" HD screen with 200+ movies",
      usb: "USB-A and USB-C fast charging ports",
      overheadBins: "Airbus XL Bins with 60% more rollaboard capacity",
    },
    rows,
  };
}

// ─────────────────────────────────────────────────────────────
// 2. EgyptAir Boeing 787-9 Dreamliner (Long-Haul Flagship)
// ─────────────────────────────────────────────────────────────
function buildEgyptAirB789(): AircraftCabinSpec {
  const exitRows = [16, 30];
  const wingsRowRange: [number, number] = [14, 28];
  const rows: AircraftCabinSpec["rows"] = [];

  // Super Diamond Business: Rows 1 to 8 (1-2-1 direct aisle access: A - D, G - K)
  for (let r = 1; r <= 8; r++) {
    const isBulkhead = r === 1;
    const letters = ["A", "D", "G", "K"];
    const seats: SeatInfo[] = letters.map((letter) => {
      const isWindow = letter === "A" || letter === "K";
      const isAisle = true;
      return createSeat(r, letter, "BUSINESS", isWindow, isAisle, false, {
        pitch: 78,
        width: 23,
        recline: 180,
        isBulkhead,
        extraFeatures: ["LIE_FLAT", "DIRECT_AISLE", "POWER_OUTLET", "USB_C", "QUIET_ZONE"],
        notes: isWindow
          ? "Collins Super Diamond reverse-herringbone suite with complete privacy and window view."
          : "Center suite with privacy divider, ideal for solo travellers or couples.",
      });
    });
    rows.push({
      rowNumber: r,
      cabin: "BUSINESS",
      isBulkhead,
      hasGalleyAhead: r === 1,
      seats,
    });
  }

  // Economy Class: Rows 15 to 45 (3-3-3 layout: A, B, C - D, E, F - H, J, K)
  for (let r = 15; r <= 45; r++) {
    // Skip row 29 (galley gap)
    if (r === 29) continue;
    const isExitRow = exitRows.includes(r);
    const isBulkhead = r === 15 || r === 30;
    const isLast = r === 45;
    const letters = ["A", "B", "C", "D", "E", "F", "H", "J", "K"];
    const seats: SeatInfo[] = letters.map((letter) => {
      const isWindow = letter === "A" || letter === "K";
      const isAisle = letter === "C" || letter === "D" || letter === "F" || letter === "H";
      const isMiddle = letter === "B" || letter === "E" || letter === "J";
      let rating: "GOOD" | "STANDARD" | "CAUTION" = "STANDARD";
      let notes = "Dreamliner economy seat with electrochromic dimmable windows and 12\" 4K screen.";

      if (isExitRow) {
        rating = "GOOD";
        notes = "Emergency exit row with immense legroom. Window view may be obstructed by door slide.";
      } else if (isBulkhead) {
        rating = "GOOD";
        notes = "Bulkhead seat with extra knee space and no reclining seat ahead.";
      } else if (isLast) {
        rating = "CAUTION";
        notes = "Rear fuselage row close to galleys and lavatories with reduced recline.";
      }

      return createSeat(r, letter, "ECONOMY", isWindow, isAisle, isMiddle, {
        pitch: isExitRow ? 38 : isBulkhead ? 35 : 32,
        width: 17.5,
        recline: isLast ? 3 : 6,
        isExitRow,
        isBulkhead,
        rating,
        notes,
      });
    });

    rows.push({
      rowNumber: r,
      cabin: "ECONOMY",
      isExitRow,
      isBulkhead,
      hasLavatoryBehind: r === 28 || isLast,
      seats,
    });
  }

  return {
    id: "MS-B789",
    airlineCode: "MS",
    airlineName: "EgyptAir",
    aircraftModel: "Boeing 787-9 Dreamliner",
    manufacturer: "Boeing",
    tailNumberSample: "SU-GEV",
    totalSeats: 309,
    wingsRowRange,
    exitRows,
    cabins: [
      {
        name: "Super Diamond Business",
        classType: "BUSINESS",
        rowStart: 1,
        rowEnd: 8,
        layout: "1-2-1",
        aislesAfterLetters: ["A", "G"],
        letters: ["A", "D", "G", "K"],
        pitchInches: 78,
        widthInches: 23,
      },
      {
        name: "Economy Class",
        classType: "ECONOMY",
        rowStart: 15,
        rowEnd: 45,
        layout: "3-3-3",
        aislesAfterLetters: ["C", "F"],
        letters: ["A", "B", "C", "D", "E", "F", "H", "J", "K"],
        pitchInches: 32,
        widthInches: 17.5,
      },
    ],
    amenities: {
      wifi: "Panasonic Ku-band satellite high-speed internet",
      power: "Universal 110V AC outlet and dual 60W USB-C at all seats",
      ife: "12-inch 4K touchscreen with Bluetooth audio streaming",
      usb: "USB-A & USB-C ports with wireless device charging in Business",
      overheadBins: "Dreamliner Pivot Bins accommodating 2+ carry-ons per passenger",
    },
    rows,
  };
}

// ─────────────────────────────────────────────────────────────
// 3. Emirates Airbus A380-800 (Superjumbo Flagship)
// ─────────────────────────────────────────────────────────────
function buildEmiratesA380(): AircraftCabinSpec {
  const exitRows = [45, 67, 80];
  const wingsRowRange: [number, number] = [48, 75];
  const rows: AircraftCabinSpec["rows"] = [];

  // First Class Private Suites (Upper Deck): Rows 1 to 4 (1-2-1)
  for (let r = 1; r <= 4; r++) {
    const letters = ["A", "E", "F", "K"];
    const seats: SeatInfo[] = letters.map((letter) => {
      const isWindow = letter === "A" || letter === "K";
      return createSeat(r, letter, "FIRST", isWindow, true, false, {
        pitch: 86,
        width: 29,
        recline: 180,
        isBulkhead: r === 1,
        extraFeatures: ["LIE_FLAT", "DIRECT_AISLE", "POWER_OUTLET", "QUIET_ZONE"],
        rating: "GOOD",
        notes: "Emirates Private Suite with electronically closing sliding doors, personal minibar, ambient lighting, and Shower Spa access.",
      });
    });
    rows.push({
      rowNumber: r,
      cabin: "FIRST",
      isBulkhead: r === 1,
      hasGalleyAhead: r === 1,
      seats,
    });
  }

  // Business Class (Upper Deck): Rows 6 to 14 (1-2-1 staggered lie-flat)
  for (let r = 6; r <= 14; r++) {
    const letters = ["A", "E", "F", "K"];
    const seats: SeatInfo[] = letters.map((letter) => {
      const isWindow = letter === "A" || letter === "K";
      return createSeat(r, letter, "BUSINESS", isWindow, true, false, {
        pitch: 79,
        width: 24,
        recline: 180,
        isBulkhead: r === 6,
        extraFeatures: ["LIE_FLAT", "DIRECT_AISLE", "POWER_OUTLET"],
        rating: "GOOD",
        notes: "Staggered flatbed with direct aisle access, personal minibar, and access to Onboard Lounge & Bar.",
      });
    });
    rows.push({
      rowNumber: r,
      cabin: "BUSINESS",
      isBulkhead: r === 6,
      seats,
    });
  }

  // Economy Class (Main Deck): Rows 43 to 72 (3-4-3 layout: A, B, C - D, E, F, G - H, J, K)
  for (let r = 43; r <= 72; r++) {
    const isExitRow = exitRows.includes(r);
    const isBulkhead = r === 43 || r === 58;
    const letters = ["A", "B", "C", "D", "E", "F", "G", "H", "J", "K"];
    const seats: SeatInfo[] = letters.map((letter) => {
      const isWindow = letter === "A" || letter === "K";
      const isAisle = letter === "C" || letter === "D" || letter === "G" || letter === "H";
      const isMiddle = letter === "B" || letter === "E" || letter === "F" || letter === "J";
      let rating: "GOOD" | "STANDARD" | "CAUTION" = "STANDARD";
      let notes = "Ultra-quiet A380 Main Deck seat with 13.3\" HD ice digital widescreen.";

      if (isExitRow) {
        rating = "GOOD";
        notes = "Emergency exit door row with unlimited leg space.";
      } else if (isBulkhead) {
        rating = "GOOD";
        notes = "Bulkhead seat with extra knee room and baby bassinet anchors.";
      }

      return createSeat(r, letter, "ECONOMY", isWindow, isAisle, isMiddle, {
        pitch: isExitRow ? 38 : 33,
        width: 18,
        recline: 6,
        isExitRow,
        isBulkhead,
        rating,
        notes,
      });
    });

    rows.push({
      rowNumber: r,
      cabin: "ECONOMY",
      isExitRow,
      isBulkhead,
      seats,
    });
  }

  return {
    id: "EK-A388",
    airlineCode: "EK",
    airlineName: "Emirates",
    aircraftModel: "Airbus A380-800",
    manufacturer: "Airbus",
    tailNumberSample: "A6-EVN",
    totalSeats: 489,
    wingsRowRange,
    exitRows,
    cabins: [
      {
        name: "First Class Private Suites",
        classType: "FIRST",
        rowStart: 1,
        rowEnd: 4,
        layout: "1-2-1",
        aislesAfterLetters: ["A", "F"],
        letters: ["A", "E", "F", "K"],
        pitchInches: 86,
        widthInches: 29,
      },
      {
        name: "Business Class Lie-Flat",
        classType: "BUSINESS",
        rowStart: 6,
        rowEnd: 14,
        layout: "1-2-1",
        aislesAfterLetters: ["A", "F"],
        letters: ["A", "E", "F", "K"],
        pitchInches: 79,
        widthInches: 24,
      },
      {
        name: "Economy Class",
        classType: "ECONOMY",
        rowStart: 43,
        rowEnd: 72,
        layout: "3-4-3",
        aislesAfterLetters: ["C", "G"],
        letters: ["A", "B", "C", "D", "E", "F", "G", "H", "J", "K"],
        pitchInches: 33,
        widthInches: 18,
      },
    ],
    amenities: {
      wifi: "OnAir satellite Wi-Fi with unlimited messaging for Emirates Skywards members",
      power: "AC power outlets, USB ports, and wireless charging pads in premium cabins",
      ife: "Award-winning 'ice' system with 6,500+ channels and Live TV (BBC, CNN, Sport)",
      usb: "Dual fast-charge ports at every seat",
      overheadBins: "Spacious overhead stowage plus personal in-suite wardrobe closets",
    },
    rows,
  };
}

// ─────────────────────────────────────────────────────────────
// 4. Qatar Airways Airbus A350-1000 (Qsuite Innovator)
// ─────────────────────────────────────────────────────────────
function buildQatarA350(): AircraftCabinSpec {
  const exitRows = [18, 32];
  const wingsRowRange: [number, number] = [16, 28];
  const rows: AircraftCabinSpec["rows"] = [];

  // Qsuite Business Class: Rows 1 to 11 (1-2-1 quad suites with privacy sliding doors)
  for (let r = 1; r <= 11; r++) {
    const letters = ["A", "B", "J", "K"];
    const isBulkhead = r === 1;
    const seats: SeatInfo[] = letters.map((letter) => {
      const isWindow = letter === "A" || letter === "K";
      return createSeat(r, letter, "BUSINESS", isWindow, true, false, {
        pitch: 80,
        width: 22.5,
        recline: 180,
        isBulkhead,
        extraFeatures: ["LIE_FLAT", "DIRECT_AISLE", "POWER_OUTLET", "QUIET_ZONE"],
        rating: "GOOD",
        notes: isWindow
          ? "Rearward/forward facing private Qsuite with sliding full-height door and DND indicator."
          : "Quad center Qsuite capable of converting into a private double bed or 4-person meeting quad.",
      });
    });
    rows.push({
      rowNumber: r,
      cabin: "BUSINESS",
      isBulkhead,
      seats,
    });
  }

  // Economy Class: Rows 16 to 42 (3-3-3 layout: A, B, C - D, E, F - H, J, K)
  for (let r = 16; r <= 42; r++) {
    const isExitRow = exitRows.includes(r);
    const isBulkhead = r === 16 || r === 32;
    const letters = ["A", "B", "C", "D", "E", "F", "H", "J", "K"];
    const seats: SeatInfo[] = letters.map((letter) => {
      const isWindow = letter === "A" || letter === "K";
      const isAisle = letter === "C" || letter === "D" || letter === "F" || letter === "H";
      const isMiddle = letter === "B" || letter === "E" || letter === "J";
      return createSeat(r, letter, "ECONOMY", isWindow, isAisle, isMiddle, {
        pitch: isExitRow ? 37 : isBulkhead ? 34 : 32,
        width: 17.8,
        recline: 6,
        isExitRow,
        isBulkhead,
        notes: "Airbus A350 Airspace cabin with vertical sidewalls and lower cabin altitude (6,000 ft).",
      });
    });
    rows.push({
      rowNumber: r,
      cabin: "ECONOMY",
      isExitRow,
      isBulkhead,
      seats,
    });
  }

  return {
    id: "QR-A35K",
    airlineCode: "QR",
    airlineName: "Qatar Airways",
    aircraftModel: "Airbus A350-1000",
    manufacturer: "Airbus",
    tailNumberSample: "A7-ANA",
    totalSeats: 327,
    wingsRowRange,
    exitRows,
    cabins: [
      {
        name: "Qsuite Business Class",
        classType: "BUSINESS",
        rowStart: 1,
        rowEnd: 11,
        layout: "1-2-1",
        aislesAfterLetters: ["A", "J"],
        letters: ["A", "B", "J", "K"],
        pitchInches: 80,
        widthInches: 22.5,
      },
      {
        name: "Economy Class",
        classType: "ECONOMY",
        rowStart: 16,
        rowEnd: 42,
        layout: "3-3-3",
        aislesAfterLetters: ["C", "F"],
        letters: ["A", "B", "C", "D", "E", "F", "H", "J", "K"],
        pitchInches: 32,
        widthInches: 17.8,
      },
    ],
    amenities: {
      wifi: "Super Wi-Fi with speeds up to 50 Mbps via Inmarsat GX aviation network",
      power: "Universal AC power, HDMI port, and dual USB-A / USB-C fast charging",
      ife: "Oryx One entertainment with 4,000+ choices on 21.5\" Qsuite screens",
      usb: "USB-C Power Delivery 65W and NFC wireless pairing",
      overheadBins: "Extra-large pivoting bins holding up to 5 bags each",
    },
    rows,
  };
}

export const AIRCRAFT_PRESETS: AircraftCabinSpec[] = [
  buildEgyptAirA320neo(),
  buildEgyptAirB789(),
  buildEmiratesA380(),
  buildQatarA350(),
];

export function getAircraftById(id: string): AircraftCabinSpec {
  return (
    AIRCRAFT_PRESETS.find((spec) => spec.id.toLowerCase() === id.toLowerCase()) ??
    AIRCRAFT_PRESETS[0]
  );
}

export function findAircraft(airlineCode?: string, model?: string): AircraftCabinSpec {
  if (airlineCode) {
    const code = airlineCode.toUpperCase();
    const matched = AIRCRAFT_PRESETS.find((a) => a.airlineCode === code);
    if (matched) {
      if (model) {
        const cleanModel = model.toLowerCase();
        const modelMatch = AIRCRAFT_PRESETS.find(
          (a) => a.airlineCode === code && a.aircraftModel.toLowerCase().includes(cleanModel),
        );
        if (modelMatch) return modelMatch;
      }
      return matched;
    }
  }
  if (model) {
    const cleanModel = model.toLowerCase();
    const match = AIRCRAFT_PRESETS.find((a) =>
      a.aircraftModel.toLowerCase().includes(cleanModel),
    );
    if (match) return match;
  }
  return AIRCRAFT_PRESETS[0];
}
