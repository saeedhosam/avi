# Avi iOS

Native SwiftUI placeholder for the Avi platform.

## Generate the Xcode project

```bash
brew install xcodegen
cd apps/ios
xcodegen generate
open Avi.xcodeproj
```

XcodeGen is used so the project file stays reviewable and does not create source-control churn.

## Configuration

`Config/Secrets.xcconfig` contains public client configuration only:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `AVI_API_BASE_URL`

Do not put a Supabase secret key, AeroDataBox key, or Apple signing secret in this file. For local overrides, create `Config/Secrets.local.xcconfig` and point `project.yml` at it.

## Current scope

- SwiftUI tab shell: Search, Radar, Routes, Airports, Terminals, Watchlist, Account.
- MapLibre Native preview using the OpenFreeMap Positron style.
- Supabase Swift client bootstrap.
- Shared Avi colour tokens.

The real iOS implementation follows after the web and Android client contracts stabilise.
