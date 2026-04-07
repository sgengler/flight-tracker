export function metersToFeet(m: number): number {
  return Math.round(m * 3.28084);
}

export function msToKnots(ms: number): number {
  return Math.round(ms * 1.94384);
}

export function bearingToCardinal(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

export function headingToCardinal(deg: number): string {
  const dirs = [
    'N', 'NNE', 'NE', 'ENE',
    'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW',
    'W', 'WNW', 'NW', 'NNW',
  ];
  return dirs[Math.round(deg / 22.5) % 16];
}

const AIRPORT_NAMES: Record<string, string> = {
  KATL: 'Atlanta', KLAX: 'Los Angeles', KORD: "Chicago O'Hare", KDFW: 'Dallas/Ft Worth',
  KDEN: 'Denver', KJFK: 'New York JFK', KSFO: 'San Francisco', KLAS: 'Las Vegas',
  KMIA: 'Miami', KBOS: 'Boston', KPHL: 'Philadelphia', KSEA: 'Seattle',
  KEWR: 'Newark', KDTW: 'Detroit', KIAH: 'Houston Intl', KHOU: 'Houston Hobby',
  KMSP: 'Minneapolis', KPHX: 'Phoenix', KBWI: 'Baltimore', KDCA: 'Washington Reagan',
  KIAD: 'Washington Dulles', KMCO: 'Orlando', KTPA: 'Tampa', KFLL: 'Ft Lauderdale',
  KPDX: 'Portland', KSLC: 'Salt Lake City', KSTL: 'St Louis', KCLT: 'Charlotte',
  KMEM: 'Memphis', KBNA: 'Nashville', KAUS: 'Austin', KSAN: 'San Diego',
  KSJC: 'San Jose', KLGA: 'New York LGA', KMKE: 'Milwaukee', KMSY: 'New Orleans',
  KRDU: 'Raleigh-Durham', KCLE: 'Cleveland', KPIT: 'Pittsburgh', KBUF: 'Buffalo',
  KSAC: 'Sacramento', KOAK: 'Oakland', KBUR: 'Burbank', KSNA: 'Orange County',
  KABQ: 'Albuquerque', KOMA: 'Omaha', KOKC: 'Oklahoma City', KSAT: 'San Antonio',
  KELP: 'El Paso', KTUL: 'Tulsa', KRIC: 'Richmond', KCVG: 'Cincinnati',
  KINDYINDINDIND: 'Indianapolis', KIND: 'Indianapolis', KMCI: 'Kansas City',
  CYYZ: 'Toronto', CYVR: 'Vancouver', CYUL: 'Montreal', CYYC: 'Calgary', CYEG: 'Edmonton',
  EGLL: 'London Heathrow', EGCC: 'Manchester', EDDM: 'Munich', EDDF: 'Frankfurt',
  LFPG: 'Paris CDG', EHAM: 'Amsterdam', LEMD: 'Madrid', LIRF: 'Rome',
  LEBL: 'Barcelona', LSZH: 'Zurich', LOWW: 'Vienna',
  OMDB: 'Dubai', OTHH: 'Doha', VHHH: 'Hong Kong', WSSS: 'Singapore',
  RJTT: 'Tokyo Haneda', RJAA: 'Tokyo Narita', YSSY: 'Sydney', YMML: 'Melbourne',
  MMMX: 'Mexico City', SBGR: 'São Paulo', FAOR: 'Johannesburg',
};

export function airportName(icao: string): string {
  return AIRPORT_NAMES[icao.toUpperCase()] ?? icao;
}

export const AIRPORT_COORDS: Record<string, [number, number]> = {
  KATL: [33.6407, -84.4277], KLAX: [33.9425, -118.4081], KORD: [41.9742, -87.9073],
  KDFW: [32.8998, -97.0403], KDEN: [39.8561, -104.6737], KJFK: [40.6413, -73.7781],
  KSFO: [37.6213, -122.379], KLAS: [36.0840, -115.1537], KMIA: [25.7959, -80.2870],
  KBOS: [42.3656, -71.0096], KPHL: [39.8721, -75.2411], KSEA: [47.4502, -122.3088],
  KEWR: [40.6925, -74.1687], KDTW: [42.2124, -83.3534], KIAH: [29.9902, -95.3368],
  KHOU: [29.6454, -95.2789], KMSP: [44.8848, -93.2223], KPHX: [33.4373, -112.0078],
  KBWI: [39.1754, -76.6683], KDCA: [38.8521, -77.0377], KIAD: [38.9531, -77.4565],
  KMCO: [28.4294, -81.3089], KTPA: [27.9755, -82.5332], KFLL: [26.0726, -80.1527],
  KPDX: [45.5898, -122.5951], KSLC: [40.7884, -111.9778], KSTL: [38.7487, -90.3700],
  KCLT: [35.2140, -80.9431], KMEM: [35.0424, -89.9767], KBNA: [36.1245, -86.6782],
  KAUS: [30.1975, -97.6664], KSAN: [32.7338, -117.1933], KSJC: [37.3626, -121.9290],
  KLGA: [40.7772, -73.8726], KMKE: [42.9472, -87.8966], KMSY: [29.9934, -90.2580],
  KRDU: [35.8776, -78.7875], KCLE: [41.4117, -81.8498], KPIT: [40.4915, -80.2329],
  KBUF: [42.9405, -78.7322], KOAK: [37.7213, -122.2208], KBUR: [34.2007, -118.3585],
  KSNA: [33.6757, -117.8682], KABQ: [35.0402, -106.6090], KOMA: [41.3032, -95.8941],
  KOKC: [35.3931, -97.6007], KSAT: [29.5337, -98.4698], KTUL: [36.1984, -95.8881],
  KRIC: [37.5052, -77.3197], KCVG: [39.0488, -84.6678], KIND: [39.7173, -86.2944],
  KMCI: [39.2976, -94.7139], KLIT: [34.7294, -92.2243], KTYS: [35.8110, -83.9940],
  KCHS: [32.8986, -80.0405], KGSP: [34.8957, -82.2189], KDSM: [41.5340, -93.6631],
  KFSD: [43.5820, -96.7419], KBOI: [43.5644, -116.2228], KRNO: [39.4991, -119.7681],
  KSMF: [38.6954, -121.5908], KLGB: [33.8177, -118.1516], KSBA: [34.4262, -119.8406],
  KFAT: [36.7762, -119.7181], KEUG: [44.1246, -123.2119], KGEG: [47.6199, -117.5339],
  KBZN: [45.7777, -111.1531], KFCA: [48.3105, -114.2560], KBIL: [45.8077, -108.5428],
  KRDM: [44.2541, -121.1500], KPDX_: [45.5898, -122.5951],
  KMDT: [40.1935, -76.7634], KABE: [40.6521, -75.4408], KTEB: [40.8501, -74.0608],
  KHPN: [41.0670, -73.7076], KISP: [40.7952, -73.0997],
  CYYZ: [43.6777, -79.6248], CYVR: [49.1967, -123.1815], CYUL: [45.4706, -73.7408],
  CYYC: [51.1315, -114.0100], CYEG: [53.3097, -113.5797], CYOW: [45.3225, -75.6692],
  CYWG: [49.9100, -97.2398], CYHZ: [44.8808, -63.5086],
  EGLL: [51.4775, -0.4614], EGCC: [53.3537, -2.2750], EDDM: [48.3538, 11.7861],
  EDDF: [50.0379, 8.5622], LFPG: [49.0097, 2.5479], EHAM: [52.3086, 4.7639],
  LEMD: [40.4983, -3.5676], LIRF: [41.8003, 12.2389], LEBL: [41.2971, 2.0785],
  LSZH: [47.4647, 8.5492], LOWW: [48.1103, 16.5697], LIMC: [45.6306, 8.7281],
  OMDB: [25.2532, 55.3657], OTHH: [25.2609, 51.6138], VHHH: [22.3080, 113.9185],
  WSSS: [1.3644, 103.9915], RJTT: [35.5494, 139.7798], RJAA: [35.7720, 140.3929],
  YSSY: [-33.9461, 151.1772], YMML: [-37.6733, 144.8430],
  MMMX: [19.4363, -99.0721], SBGR: [-23.4356, -46.4731], FAOR: [-26.1392, 28.2460],
};

// ICAO aircraft type code → human-readable name
export const AIRCRAFT_TYPE_NAMES: Record<string, string> = {
  // Narrow-body airliners
  A19N: 'Airbus A319neo', A20N: 'Airbus A320neo', A21N: 'Airbus A321neo',
  A318: 'Airbus A318', A319: 'Airbus A319', A320: 'Airbus A320', A321: 'Airbus A321',
  A124: 'Antonov An-124 Ruslan', A148: 'Antonov An-148',
  B712: 'Boeing 717-200',
  B731: 'Boeing 737-100', B732: 'Boeing 737-200', B733: 'Boeing 737-300',
  B734: 'Boeing 737-400', B735: 'Boeing 737-500', B736: 'Boeing 737-600',
  B737: 'Boeing 737-700', B738: 'Boeing 737-800', B739: 'Boeing 737-900',
  B37M: 'Boeing 737 MAX 7', B38M: 'Boeing 737 MAX 8', B39M: 'Boeing 737 MAX 9',
  B3XM: 'Boeing 737 MAX 10',
  // Wide-body airliners
  A306: 'Airbus A300-600', A310: 'Airbus A310',
  A332: 'Airbus A330-200', A333: 'Airbus A330-300',
  A338: 'Airbus A330-800neo', A339: 'Airbus A330-900neo',
  A342: 'Airbus A340-200', A343: 'Airbus A340-300', A345: 'Airbus A340-500', A346: 'Airbus A340-600',
  A359: 'Airbus A350-900', A35K: 'Airbus A350-1000',
  A388: 'Airbus A380-800',
  B741: 'Boeing 747-100', B742: 'Boeing 747-200', B743: 'Boeing 747-300',
  B744: 'Boeing 747-400', B748: 'Boeing 747-8',
  B752: 'Boeing 757-200', B753: 'Boeing 757-300',
  B762: 'Boeing 767-200', B763: 'Boeing 767-300', B764: 'Boeing 767-400',
  B772: 'Boeing 777-200', B773: 'Boeing 777-300',
  B77L: 'Boeing 777-200LR', B77W: 'Boeing 777-300ER',
  B778: 'Boeing 777X-8', B779: 'Boeing 777X-9',
  B788: 'Boeing 787-8 Dreamliner', B789: 'Boeing 787-9 Dreamliner', B78X: 'Boeing 787-10 Dreamliner',
  // Regional jets
  CRJ1: 'Bombardier CRJ-100', CRJ2: 'Bombardier CRJ-200',
  CRJ7: 'Bombardier CRJ-700', CRJ9: 'Bombardier CRJ-900', CRJX: 'Bombardier CRJ-1000',
  E135: 'Embraer ERJ-135', E145: 'Embraer ERJ-145',
  E170: 'Embraer E170', E175: 'Embraer E175', E190: 'Embraer E190', E195: 'Embraer E195',
  E75L: 'Embraer E175-E2', E290: 'Embraer E190-E2', E295: 'Embraer E195-E2',
  // Turboprops
  AT43: 'ATR 42-300', AT45: 'ATR 42-500', AT46: 'ATR 42-600',
  AT72: 'ATR 72-200', AT73: 'ATR 72-300', AT75: 'ATR 72-500', AT76: 'ATR 72-600',
  DH8A: 'Dash 8-100', DH8B: 'Dash 8-200', DH8C: 'Dash 8-300', DH8D: 'Dash 8-400',
  SF34: 'Saab 340', SB20: 'Saab 2000',
  // Business jets
  C25A: 'Cessna Citation CJ2', C25B: 'Cessna Citation CJ3', C25C: 'Cessna Citation CJ4',
  C500: 'Cessna Citation I', C501: 'Cessna Citation II', C510: 'Cessna Citation Mustang',
  C525: 'Cessna CitationJet', C550: 'Cessna Citation II', C560: 'Cessna Citation V',
  C56X: 'Cessna Citation Excel', C680: 'Cessna Citation Sovereign',
  C700: 'Cessna Citation Longitude', C750: 'Cessna Citation X',
  LJ35: 'Learjet 35', LJ45: 'Learjet 45', LJ60: 'Learjet 60', LJ75: 'Learjet 75',
  GL5T: 'Bombardier Global 5000', GL7T: 'Bombardier Global 7500',
  GLEX: 'Bombardier Global Express',
  CL30: 'Bombardier Challenger 300', CL35: 'Bombardier Challenger 350',
  CL60: 'Bombardier Challenger 600',
  F2TH: 'Dassault Falcon 2000', F900: 'Dassault Falcon 900', FA7X: 'Dassault Falcon 7X',
  FA8X: 'Dassault Falcon 8X',
  G150: 'Gulfstream G150', G280: 'Gulfstream G280',
  G450: 'Gulfstream G450', G500: 'Gulfstream G500', G550: 'Gulfstream G550',
  G600: 'Gulfstream G600', G650: 'Gulfstream G650',
  GALX: 'IAI Galaxy / Gulfstream G200',
  HDJT: 'Honda HA-420 HondaJet',
  PC24: 'Pilatus PC-24',
  // General aviation (piston / light)
  C172: 'Cessna 172 Skyhawk', C182: 'Cessna 182 Skylane', C208: 'Cessna 208 Caravan',
  C210: 'Cessna 210 Centurion',
  P28A: 'Piper PA-28 Cherokee', P28B: 'Piper PA-28 Arrow',
  P46T: 'Piper M600', PA44: 'Piper Seminole', PA46: 'Piper Malibu',
  BE20: 'Beechcraft King Air 200', BE35: 'Beechcraft Bonanza', BE36: 'Beechcraft Bonanza 36',
  BE58: 'Beechcraft Baron', BE9L: 'Beechcraft King Air 90',
  SR20: 'Cirrus SR20', SR22: 'Cirrus SR22',
  DA40: 'Diamond DA40', DA42: 'Diamond DA42 Twin Star', DA62: 'Diamond DA62',
  TBM7: 'Daher TBM 700', TBM8: 'Daher TBM 850', TBM9: 'Daher TBM 900',
  // Helicopters
  AS32: 'Eurocopter AS332 Super Puma', AS3B: 'Eurocopter AS350 B3',
  EC35: 'Eurocopter EC135', EC45: 'Eurocopter EC145',
  H60: 'Sikorsky H-60 Black Hawk',
  R44: 'Robinson R44', R66: 'Robinson R66',
  S76: 'Sikorsky S-76',
  // Military fighters / strike
  F14: 'F-14 Tomcat', F15: 'F-15 Eagle', F16: 'F-16 Fighting Falcon',
  F18: 'F/A-18 Hornet', FA18: 'F/A-18 Hornet',
  F22: 'F-22 Raptor', F35: 'F-35 Lightning II', F117: 'F-117 Nighthawk',
  // Military bombers
  B52: 'B-52 Stratofortress', B1B: 'B-1B Lancer', B2: 'B-2 Spirit',
  // Military attack
  A10: 'A-10 Thunderbolt II', AC13: 'AC-130 Gunship',
  // Military transports
  C130: 'C-130 Hercules', C30J: 'C-130J Super Hercules', C17: 'C-17 Globemaster III',
  SW4: 'Fairchild C-26 Metro',
  C5A: 'C-5A Galaxy', C5M: 'C-5M Super Galaxy',
  // Military tankers
  KC10: 'KC-10 Extender', KC135: 'KC-135 Stratotanker', KC46: 'KC-46 Pegasus',
  // Military surveillance / command
  E3: 'E-3 Sentry (AWACS)', E8: 'E-8 Joint STARS', E6: 'E-6 Mercury',
  P3: 'P-3 Orion', P8: 'P-8 Poseidon',
  RC135: 'RC-135 Rivet Joint', U2: 'U-2 Dragon Lady',
  // Military helicopters
  AH64: 'AH-64 Apache', CH47: 'CH-47 Chinook', H47: 'CH-47 Chinook', UH60: 'UH-60 Black Hawk',
  MH60: 'MH-60 Sea Hawk', V22: 'V-22 Osprey',
  AS65: 'AS-565 Panther', B212: 'Bell 212 Twin Huey',
  // Military trainers
  T38: 'T-38 Talon', T6: 'T-6 Texan II', T45: 'T-45 Goshawk',
  // Cargo
  MD11: 'McDonnell Douglas MD-11',
};

export function aircraftTypeName(typeCode: string | null | undefined): string | null {
  if (!typeCode) return null;
  return AIRCRAFT_TYPE_NAMES[typeCode.toUpperCase()] ?? null;
}

export function formatSecondsAgo(timestamp: number): string {
  const secs = Math.floor((Date.now() - timestamp) / 1000);
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  return `${Math.floor(secs / 60)}m ago`;
}
