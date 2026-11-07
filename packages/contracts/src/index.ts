// AerodataBox → console `Flight` types + the shared client-independent mapping.
// The gateway, the web dev fallback, and (later) mobile clients all consume
// the same transformation, so provider fixes have exactly one place to land.
export * from "./types.js";
export * from "./mapping.js";
