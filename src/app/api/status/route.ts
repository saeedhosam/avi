import { NextResponse } from "next/server";

function hasValidKey(value: string | undefined) {
  if (!value) return false;
  const key = value.trim();
  return (
    key.length >= 16 &&
    !key.startsWith("DEFAULT_") &&
    !["null", "YOUR_AERODATABOX_KEY", "REPLACE_WITH_YOUR_KEY"].includes(key)
  );
}

export async function GET() {
  return NextResponse.json({
    aeroDataBoxConfigured: hasValidKey(process.env.AERODATABOX_API_KEY),
    mapsConfigured: hasValidKey(process.env.MAPS_API_KEY),
    firebaseConfigured: Boolean(
      process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
        process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    ),
    weatherProvider: "open-meteo",
    timestamp: new Date().toISOString(),
  });
}
