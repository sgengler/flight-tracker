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

export function formatSecondsAgo(timestamp: number): string {
  const secs = Math.floor((Date.now() - timestamp) / 1000);
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  return `${Math.floor(secs / 60)}m ago`;
}
