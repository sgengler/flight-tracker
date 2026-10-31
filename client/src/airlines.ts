// Airline ICAO codes common over the US Northeast → display name and IATA code
// (the IATA code keys the logo). Owner records from ADS-B aren't usable for
// names — many airliners are registered to leasing banks and trustees.
export const AIRLINES: Record<string, { name: string; iata?: string }> = {
  AAL: { name: 'American', iata: 'AA' }, DAL: { name: 'Delta', iata: 'DL' }, UAL: { name: 'United', iata: 'UA' },
  SWA: { name: 'Southwest', iata: 'WN' }, JBU: { name: 'JetBlue', iata: 'B6' }, ASA: { name: 'Alaska', iata: 'AS' },
  NKS: { name: 'Spirit', iata: 'NK' }, FFT: { name: 'Frontier', iata: 'F9' }, AAY: { name: 'Allegiant', iata: 'G4' },
  SCX: { name: 'Sun Country', iata: 'SY' }, HAL: { name: 'Hawaiian', iata: 'HA' }, MXY: { name: 'Breeze', iata: 'MX' },
  ENY: { name: 'Envoy (American Eagle)', iata: 'MQ' }, JIA: { name: 'PSA (American Eagle)' },
  PDT: { name: 'Piedmont (American Eagle)', iata: 'PT' }, RPA: { name: 'Republic', iata: 'YX' },
  SKW: { name: 'SkyWest', iata: 'OO' }, EDV: { name: 'Endeavor (Delta Connection)', iata: '9E' },
  ASH: { name: 'Mesa', iata: 'YV' }, GJS: { name: 'GoJet', iata: 'G7' }, CPZ: { name: 'Commutair', iata: 'C5' },
  AWI: { name: 'Air Wisconsin', iata: 'ZW' }, QXE: { name: 'Horizon', iata: 'QX' },
  FDX: { name: 'FedEx', iata: 'FX' }, UPS: { name: 'UPS', iata: '5X' }, GTI: { name: 'Atlas Air', iata: '5Y' },
  ABX: { name: 'ABX Air', iata: 'GB' }, ATN: { name: 'Air Transport Intl', iata: '8C' }, CKS: { name: 'Kalitta', iata: 'K4' },
  EJA: { name: 'NetJets' }, LXJ: { name: 'Flexjet' }, XOJ: { name: 'XOJet' }, JRE: { name: 'JetReady' },
  TWY: { name: 'Solairus' }, EJM: { name: 'Executive Jet Mgmt' },
  ACA: { name: 'Air Canada', iata: 'AC' }, JZA: { name: 'Jazz', iata: 'QK' }, WJA: { name: 'WestJet', iata: 'WS' },
  BAW: { name: 'British Airways', iata: 'BA' }, VIR: { name: 'Virgin Atlantic', iata: 'VS' },
  AFR: { name: 'Air France', iata: 'AF' }, KLM: { name: 'KLM', iata: 'KL' }, DLH: { name: 'Lufthansa', iata: 'LH' },
  SWR: { name: 'Swiss', iata: 'LX' }, AUA: { name: 'Austrian', iata: 'OS' }, IBE: { name: 'Iberia', iata: 'IB' },
  EIN: { name: 'Aer Lingus', iata: 'EI' }, AZA: { name: 'ITA', iata: 'AZ' }, TAP: { name: 'TAP Portugal', iata: 'TP' },
  SAS: { name: 'SAS', iata: 'SK' }, FIN: { name: 'Finnair', iata: 'AY' }, ICE: { name: 'Icelandair', iata: 'FI' },
  UAE: { name: 'Emirates', iata: 'EK' }, QTR: { name: 'Qatar', iata: 'QR' }, ETD: { name: 'Etihad', iata: 'EY' },
  THY: { name: 'Turkish', iata: 'TK' }, ELY: { name: 'El Al', iata: 'LY' }, SVA: { name: 'Saudia', iata: 'SV' },
  AMX: { name: 'Aeromexico', iata: 'AM' }, VOI: { name: 'Volaris', iata: 'Y4' }, CMP: { name: 'Copa', iata: 'CM' },
  AVA: { name: 'Avianca', iata: 'AV' }, LAN: { name: 'LATAM', iata: 'LA' }, CPA: { name: 'Cathay Pacific', iata: 'CX' },
  KAL: { name: 'Korean Air', iata: 'KE' }, JAL: { name: 'JAL', iata: 'JL' }, ANA: { name: 'ANA', iata: 'NH' },
  CCA: { name: 'Air China', iata: 'CA' }, SIA: { name: 'Singapore', iata: 'SQ' },
};

export function airlineName(icao: string | null | undefined): string | null {
  return icao ? AIRLINES[icao.toUpperCase()]?.name ?? null : null;
}

// Wordmark logo (dark on transparent). Requested at 3x the display height for sharpness.
export function airlineLogoUrl(icao: string | null | undefined): string | null {
  const iata = icao ? AIRLINES[icao.toUpperCase()]?.iata : undefined;
  return iata ? `https://pics.avs.io/240/80/${iata}.png` : null;
}
