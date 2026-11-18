export interface ExploreAirport {
  iata: string;
  name: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  destCount: number;
}

export type ExploreView = { kind: "world" } | { kind: "airport"; iata: string };
