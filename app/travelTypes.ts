export type Location = { lng: number; lat: number; coord_system: string } | null;

export type MapView = {
  center: { lng: number; lat: number };
  zoom: number;
  bounds?: {
    southwest: { lng: number; lat: number };
    northeast: { lng: number; lat: number };
  };
};

export type Verification = {
  status: string;
  verified_at: string | null;
  match_confidence: number | null;
};

export type Poi = {
  id: string;
  name: string;
  address: string;
  location: Location;
  themes?: string[];
  business: { rating: number | null; cost: number | null; open_hours: string | null };
  content: { why_visit: string; watch_for: string[]; stay_minutes: number };
  verification: Verification;
};

export type Assignment = {
  poi_id: string;
  order_index: number;
  arrival_time: string | null;
  departure_time: string | null;
  notes: string;
  locked: boolean;
};

export type Segment = {
  from_poi_id: string;
  to_poi_id: string;
  mode: string;
  distance_m: number | null;
  duration_s: number | null;
  status: string;
};

export type Day = {
  id: string;
  day_number: number;
  title: string;
  window: { start: string; end: string };
  assignments: Assignment[];
  route_segments: Segment[];
};

export type TripData = {
  trip: { title: string; city: string; assumptions: string[]; map_view?: MapView };
  pois: Poi[];
  days: Day[];
  quality: {
    status: string;
    warnings: string[];
    unverified_poi_count: number;
    verified_poi_count?: number;
    verified_route_count?: number;
  };
  provenance: { research_documents?: string[]; updated_at: string };
};
