export interface FlightState {
  icao24: string;
  callsign: string | null;
  originCountry: string;
  latitude: number;
  longitude: number;
  baroAltitude: number | null;
  onGround: boolean;
  velocity: number | null;
  trueTrack: number | null;
  verticalRate: number | null;
  geoAltitude: number | null;
  distanceMiles: number;
  bearingDeg: number;
  route: RouteInfo | null;
  aircraftType: string | null;
  isPolice: boolean;
}

export interface StreamMessage {
  flight: FlightState | null;
  flights: FlightState[];
  timestamp: number;
  error?: string;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface RouteInfo {
  origin: string;
  originCity: string;
  destination: string;
  destinationCity: string;
  airline: string | null;
}

