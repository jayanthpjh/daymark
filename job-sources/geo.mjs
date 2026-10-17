// Small place lexicon for the location filter. It answers one question: which countries or regions does a posting's
// location text name? Short words are matched as whole words, and two-letter US state codes only count after a comma
// ("Austin, TX"), so "in", "it" or "ca" in running text never count as places.
const US_STATES = ['alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut', 'delaware', 'florida', 'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota', 'mississippi', 'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey', 'new mexico', 'new york', 'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon', 'pennsylvania', 'rhode island', 'south carolina', 'south dakota', 'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington', 'west virginia', 'wisconsin', 'wyoming', 'district of columbia'];
const US_CODES = new Set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' '));

// country id -> names people write. Order does not matter.
export const COUNTRIES = {
  us: ['united states', 'united states of america', 'usa', 'u.s.', 'u.s.a.', 'us', 'america'],
  uk: ['united kingdom', 'uk', 'u.k.', 'great britain', 'england', 'scotland', 'wales', 'northern ireland'],
  ca: ['canada'], mx: ['mexico'], br: ['brazil', 'brasil'], ar: ['argentina'], co: ['colombia'], cl: ['chile'], pe: ['peru'],
  de: ['germany', 'deutschland'], fr: ['france'], es: ['spain'], it: ['italy'], nl: ['netherlands', 'the netherlands'], be: ['belgium'], ie: ['ireland'], pt: ['portugal'], ch: ['switzerland'], at: ['austria'],
  se: ['sweden'], no: ['norway'], dk: ['denmark'], fi: ['finland'], pl: ['poland'], ro: ['romania'], cz: ['czech republic', 'czechia'], ua: ['ukraine'], gr: ['greece'], tr: ['turkey', 'türkiye'], il: ['israel'],
  in: ['india'], cn: ['china'], jp: ['japan'], kr: ['south korea', 'korea'], sg: ['singapore'], au: ['australia'], nz: ['new zealand'], ph: ['philippines'], id: ['indonesia'], my: ['malaysia'], vn: ['vietnam'], th: ['thailand'], pk: ['pakistan'], bd: ['bangladesh'], hk: ['hong kong'], tw: ['taiwan'],
  ae: ['united arab emirates', 'uae', 'dubai'], sa: ['saudi arabia'], eg: ['egypt'], za: ['south africa'], ng: ['nigeria'], ke: ['kenya'],
};
// Regions that exclude the United States. "North America", "Americas", "Global" and "Worldwide" are deliberately absent.
export const FOREIGN_REGIONS = ['emea', 'apac', 'latam', 'eu', 'europe', 'european union', 'asia', 'africa', 'latin america', 'middle east', 'oceania', 'anz', 'dach', 'nordics', 'benelux'];
const BROAD = ['north america', 'americas', 'global', 'worldwide', 'anywhere'];

// Major cities outside the United States that show up alone ("Berlin") in aggregator feeds. A city names its country.
const CITIES = {
  uk: ['london', 'manchester', 'edinburgh', 'bristol', 'birmingham', 'glasgow', 'leeds', 'cambridge', 'oxford', 'belfast', 'cardiff'],
  de: ['berlin', 'munich', 'münchen', 'hamburg', 'frankfurt', 'cologne', 'köln', 'stuttgart', 'düsseldorf', 'leipzig', 'dresden'],
  fr: ['paris', 'lyon', 'marseille', 'toulouse', 'nantes', 'lille', 'bordeaux'], es: ['madrid', 'barcelona', 'valencia', 'seville', 'málaga'], pt: ['lisbon', 'lisboa', 'porto'], it: ['milan', 'milano', 'rome', 'roma', 'turin'],
  nl: ['amsterdam', 'rotterdam', 'utrecht', 'eindhoven', 'the hague'], be: ['brussels', 'antwerp'], ie: ['dublin', 'cork', 'galway'], ch: ['zurich', 'zürich', 'geneva', 'basel'], at: ['vienna', 'wien'],
  se: ['stockholm', 'gothenburg', 'malmö'], no: ['oslo', 'bergen'], dk: ['copenhagen', 'aarhus'], fi: ['helsinki', 'espoo', 'tampere'], pl: ['warsaw', 'krakow', 'kraków', 'wroclaw', 'gdansk', 'poznan'], cz: ['prague'], ro: ['bucharest', 'cluj'],
  ua: ['kyiv', 'kiev'], gr: ['athens'], tr: ['istanbul', 'ankara'], il: ['tel aviv', 'jerusalem', 'haifa'], in: ['bangalore', 'bengaluru', 'hyderabad', 'mumbai', 'delhi', 'new delhi', 'pune', 'chennai', 'gurgaon', 'gurugram', 'noida', 'kolkata'],
  ca: ['toronto', 'vancouver', 'montreal', 'montréal', 'ottawa', 'calgary', 'waterloo'], au: ['sydney', 'melbourne', 'brisbane', 'perth', 'canberra'], nz: ['auckland', 'wellington'], sg: [], jp: ['tokyo', 'osaka', 'kyoto'], kr: ['seoul'], cn: ['beijing', 'shanghai', 'shenzhen', 'guangzhou'],
  ae: ['abu dhabi'], br: ['são paulo', 'sao paulo', 'rio de janeiro', 'campinas', 'belo horizonte'], ar: ['buenos aires'], mx: ['mexico city', 'guadalajara', 'monterrey'], co: ['bogotá', 'bogota', 'medellín', 'medellin'], cl: ['santiago'],
  za: ['cape town', 'johannesburg'], ng: ['lagos'], ke: ['nairobi'], ph: ['manila'], vn: ['hanoi', 'ho chi minh'], id: ['jakarta'], my: ['kuala lumpur'], th: ['bangkok'], pk: ['karachi', 'lahore'], eg: ['cairo'],
};
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = names => new RegExp(`(?<![\\p{L}\\p{N}])(?:${names.map(escape).join('|')})(?![\\p{L}\\p{N}])`, 'iu');
const cityRes = Object.fromEntries(Object.entries(CITIES).filter(([, names]) => names.length).map(([id, names]) => [id, wordRe(names)]));
const countryRes = Object.fromEntries(Object.entries(COUNTRIES).map(([id, names]) => [id, wordRe(names)]));
const regionRe = wordRe(FOREIGN_REGIONS);
const broadRe = wordRe(BROAD);
const stateRe = wordRe(US_STATES);
const dcRe = /\bwashington,?\s*d\.?c\.?\b|\bd\.c\.|\bdc\b/i;

/** Country ids named in a location text. A US state, state code or D.C. counts as the United States. */
export function countriesIn(text) {
  const value = String(text ?? '');
  const found = new Set();
  for (const [id, re] of Object.entries(countryRes)) if (re.test(value)) found.add(id);
  for (const [id, re] of Object.entries(cityRes)) if (re.test(value)) found.add(id);
  // "Georgia" is also a country, so a bare "Georgia" does not count; "Atlanta, GA" and "Georgia, United States" still do.
  if (stateRe.test(value.replace(/\bgeorgia\b/gi, ''))) found.add('us');
  // "Berlin, DE" is Germany far more often than "Wilmington, DE" is Delaware, so DE needs the word Delaware to count as a US state.
  for (const m of value.matchAll(/,\s*([A-Z]{2})(?![A-Za-z])/g)) {
    if (m[1] === 'DE' && !/delaware/i.test(value)) found.add('de');
    else if (US_CODES.has(m[1])) found.add('us');
  }
  if (dcRe.test(value)) found.add('us');
  return found;
}
export const mentionsForeignRegion = text => regionRe.test(String(text ?? ''));
export const mentionsBroadRegion = text => broadRe.test(String(text ?? ''));

/** "de" -> "Germany". Used where an ATS gives an ISO country code, so the location text names the country in full. */
export function countryName(code) {
  const id = String(code ?? '').toLowerCase() === 'gb' ? 'uk' : String(code ?? '').toLowerCase();
  const name = COUNTRIES[id]?.find(n => n.length > 3 && !n.includes('.')) ?? COUNTRIES[id]?.[0];
  return name ? name.replace(/\b\w/g, c => c.toUpperCase()) : String(code ?? '').toUpperCase();
}
