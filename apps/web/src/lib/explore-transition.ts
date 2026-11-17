/**
 * Carries the world-map camera through the `/explore` -> `/explore/[iata]`
 * navigation so the new globe starts exactly where the old one left off.
 */
const TRANSITION_KEY = "avi:explore-transition";
const TRANSITION_TTL_MS = 15000;

export interface ExploreTransitionState {
  iata: string;
  center: [number, number];
  zoom: number;
  createdAt: number;
}

export function storeExploreTransition(
  state: Omit<ExploreTransitionState, "createdAt">,
): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      TRANSITION_KEY,
      JSON.stringify({ ...state, createdAt: Date.now() }),
    );
  } catch {
    // Session storage can be unavailable in privacy modes.
  }
}

export function readExploreTransition(
  iata: string,
): { center: [number, number]; zoom: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(TRANSITION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ExploreTransitionState>;
    if (
      parsed.iata !== iata ||
      !Array.isArray(parsed.center) ||
      parsed.center.length !== 2 ||
      typeof parsed.center[0] !== "number" ||
      typeof parsed.center[1] !== "number" ||
      typeof parsed.zoom !== "number" ||
      typeof parsed.createdAt !== "number" ||
      Date.now() - parsed.createdAt > TRANSITION_TTL_MS
    ) {
      return null;
    }
    return {
      center: [parsed.center[0], parsed.center[1]],
      zoom: Math.min(6, Math.max(1, parsed.zoom)),
    };
  } catch {
    return null;
  }
}
