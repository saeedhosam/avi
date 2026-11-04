# Full-Screen Flight Connections Map & Minimized Floating Overlays Plan

## Goal
Transform the **Routes (`ConnectionsScreen`)** tab so the interactive geodesic world map occupies **100% of the screen**, with minimal, floating translucent controls layered cleanly over the top and bottom of the map.

---

## 1. Full-Screen Interactive Geodesic Map Canvas
- **Edge-to-Edge Map Container**:
  - Replace the vertical `Scaffold` + `Column` split layout in `ConnectionsScreen.kt` with a root `Box(modifier = Modifier.fillMaxSize())` where `FlightConnectionsMapCanvas` fills the entire screen (`Modifier.fillMaxSize()`).
  - Remove the outer horizontal/vertical margins, rounded clipping, and box border from `FlightConnectionsMapCanvas` so the map spans seamlessly edge-to-edge behind the floating controls.
- **Unobstructed Map Controls & Legend**:
  - Position the map zoom (`+` / `-`) and re-center buttons along the **center-right edge** (`Alignment.CenterEnd`) so they never overlap with the top pill or bottom route bar.
  - Integrate the compact haul-distance color legend (Short / Medium / Long Haul) neatly just below the top floating pill so it doesn't clutter the map canvas.

---

## 2. Compact Floating Top Pill with Collapsible Filter Drawer
- **Floating Top Hub Pill (`Alignment.TopCenter`)**:
  - A single compact, translucent glassmorphic pill (`CockpitDark.copy(alpha = 0.90f)` with `InstrumentBorder`) anchored at the top of the map with `statusBarsPadding()`.
  - **Hub Selector (`origin_hub_selector_bar`)**: Displays the active IATA badge (e.g., `DXB` or `CAI`), airport name, and single-line route count summary (`210 Routes · 69 Airlines`). Tapping opens the airport search bottom sheet.
  - **Quick Action Icons**:
    - **Undo Hub (`connections_back_hub_btn`)**: Compact pill to return to the previous hub when hub history is non-empty.
    - **Search Icon (`open_hub_search_btn`)**: Opens the airport search bottom sheet.
    - **Collapsible Filter Drawer Toggle (`toggle_top_filters_btn`)**: Toggles the inline filter drawer open/closed, displaying an active filter indicator dot when any direction, haul, region, or airline filter is applied.
    - **Region & Haul Modal Button (`open_connections_filters_btn`)**: Opens the full filter sheet.
- **Collapsible Filter Drawer (`AnimatedVisibility`)**:
  - **Collapsed by default** so the map is maximally visible immediately upon opening the tab.
  - Expanding the drawer smoothly reveals:
    1. Quick Hub switcher row (`CAI`, `DXB`, `LHR`, `IST`, `JFK`, etc.).
    2. Direction (`All`, `Departures`, `Arrivals`) and Haul (`Short-Haul`, `Medium-Haul`, `Long-Haul`) chips.
    3. Operating Airline filter chips (`All Airlines`, `EK · Emirates`, etc.).

---

## 3. Compact Floating Bottom Bar That Expands on Route Tap
- **Floating Bottom Overlay (`Alignment.BottomCenter`)**:
  - Anchored at the bottom of the full-screen map with translucent dark styling.
- **Compact Default State (`isInspectorExpanded = false` initially)**:
  - Displays a single compact horizontal strip of direct destination chips (`dest_route_chip_${iata}`) + a sleek single-line active route summary bar (`DXB ➔ BOM · Mumbai · 2h 54m · 15x/d`) with a quick **Pivot** action and an expand toggle (`toggle_route_inspector_btn`).
- **Expanded Route Details State (On Route Tap)**:
  - Tapping any destination pin on the map or any destination chip in the bottom bar automatically expands the floating route card (`selected_connection_card`).
  - Displays the full route telemetry (`FLIGHT TIME`, `DISTANCE`, `HAUL CLASS` in a single non-wrapping row), operating airlines and flight numbers, and the **Pivot Map to [IATA]** (`pivot_to_destination_btn`) and **View Flights** (`view_route_flights_btn`) buttons.
  - Tapping the close/collapse chevron (`toggle_route_inspector_btn`) or tapping empty map space minimizes the card back to the compact bottom bar.

---

## 4. Verification
- Ensure all existing functionality (searching hubs like `CAI`/`DXB`, pivoting hubs on double-tap or button click, filtering by airline/haul/region/direction, and viewing flights on a route) and Compose `testTag` identifiers remain intact.
- Run `compile_applet` to verify a clean build with zero errors.
