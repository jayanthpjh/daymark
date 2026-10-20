// What the Discover filter pills and the job cards say about a job: level, workplace, type, skills, visa.
// Uses the fields the collector already stored; where one is missing it is read from the title, location and description.
import { ROLE_FAMILIES, roleFamiliesForTitle } from '../../../job-sources/role-families.mjs';
export { ROLE_FAMILIES };
export const familyIdsOf = (job: any): string[] => Array.isArray(job.roleFamilies) && job.roleFamilies.length ? job.roleFamilies : roleFamiliesForTitle(job.role || '');
export type Level = 'Internship' | 'Entry Level' | 'Mid Level' | 'Experienced';
export type Workplace = 'Remote' | 'Hybrid' | 'Onsite';
export type JobType = 'Full Time' | 'Part Time' | 'Contract';
export interface Facets { level: Level | ''; workplace: Workplace | ''; type: JobType | ''; skills: string[]; sponsors: boolean }

const has = (text: string, re: RegExp) => re.test(text);

export function levelOf(job: any): Level | '' {
  const title = String(job.role || ''), seniority = String(job.seniority || '').toLowerCase();
  if (has(title, /\bintern(ship)?\b|\bco-?op\b|\bworking student\b/i)) return 'Internship';
  if (has(title, /\b(junior|jr\.?|associate|entry|graduate|new grad|trainee|apprentice)\b|\b(i|1)\b$/i) || ['junior', 'entry', 'intern'].includes(seniority) || (Number(job.yearsExperience) > 0 && Number(job.yearsExperience) <= 1)) return 'Entry Level';
  if (has(title, /\b(senior|sr\.?|staff|principal|lead|director|head of|vp|manager|architect)\b/i) || ['senior', 'staff', 'principal', 'lead', 'director', 'manager'].includes(seniority) || Number(job.yearsExperience) >= 5) return 'Experienced';
  if (Number(job.yearsExperience) >= 2 || has(title, /\b(ii|iii|2|3)\b$/i) || seniority === 'mid') return 'Mid Level';
  return '';
}
export function workplaceOf(job: any): Workplace | '' {
  const kind = String(job.remoteType || '').toLowerCase();
  if (kind === 'remote' || kind === 'hybrid') return kind === 'remote' ? 'Remote' : 'Hybrid';
  if (kind === 'onsite') return 'Onsite';
  const text = `${job.location || ''} ${job.role || ''}`;
  if (has(text, /\bhybrid\b/i)) return 'Hybrid';
  if (has(text, /\bremote\b|\bwork from home\b|\banywhere\b/i)) return 'Remote';
  return job.location && !/not listed|review location/i.test(job.location) ? 'Onsite' : '';
}
export function typeOf(job: any): JobType | '' {
  const text = `${job.role || ''} ${job.employmentType || ''} ${(job.tags || []).join(' ')}`;
  if (has(text, /\bcontract(or)?\b|\bfreelance\b|\btemporary\b|\bC2H\b/i)) return 'Contract';
  if (has(text, /\bpart[- ]?time\b/i)) return 'Part Time';
  return 'Full Time';
}

// Generic skill vocabulary (technologies and business tools). It names things, not companies, so it needs no upkeep per employer.
const SKILLS = ['Python', 'SQL', 'Java', 'JavaScript', 'TypeScript', 'Go', 'Rust', 'Scala', 'C++', 'C#', 'Ruby', 'PHP', 'Kotlin', 'Swift', 'R', 'Spark', 'Kafka', 'Airflow', 'dbt', 'Snowflake', 'Databricks', 'BigQuery', 'Redshift', 'Hadoop', 'Flink', 'Terraform', 'Kubernetes', 'Docker', 'AWS', 'Azure', 'GCP', 'Linux', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch', 'Looker', 'Tableau', 'Power BI', 'Excel', 'React', 'Node.js', 'Django', 'Flask', 'Spring', 'GraphQL', 'REST', 'CI/CD', 'Git', 'Machine Learning', 'Deep Learning', 'NLP', 'PyTorch', 'TensorFlow', 'Pandas', 'ETL', 'Data Modeling', 'Data Warehouse', 'Salesforce', 'SAP', 'Jira', 'Figma', 'SEO', 'Agile', 'Scrum'];
const skillRe = new Map(SKILLS.map(s => [s, new RegExp(`(?<![A-Za-z0-9+#.])${s.replace(/[.+*?^${}()|[\]\\/]/g, '\\$&')}(?![A-Za-z0-9+#])`, s.length <= 2 ? '' : 'i')]));
export function skillsOf(job: any, max = 12): string[] {
  const fromTags = (job.tags || []).map((t: string) => String(t).trim()).filter((t: string) => t && t.length <= 30);
  const text = `${job.role || ''}\n${String(job.description || '').slice(0, 6000)}`;
  const found = SKILLS.filter(s => skillRe.get(s)!.test(text));
  return [...new Set([...found, ...fromTags])].slice(0, max);
}
export function sponsorsVisa(job: any): boolean {
  if (job.sponsorship === 'yes') return true;
  if (job.sponsorship === 'no') return false;
  return has(String(job.description || '').slice(0, 8000), /\b(visa sponsorship (is )?(available|provided)|we (do )?sponsor (work )?visas?|will sponsor|sponsorship (is )?available)\b/i) && !has(String(job.description || ''), /\b(no|not|unable to|cannot|can't|do not|don't) (offer |provide )?(visa )?sponsor/i);
}
export const facetsOf = (job: any): Facets => ({ level: levelOf(job), workplace: workplaceOf(job), type: typeOf(job), skills: skillsOf(job), sponsors: sponsorsVisa(job) });

export const LEVELS: Level[] = ['Internship', 'Entry Level', 'Experienced'];
export const WORKPLACES: Workplace[] = ['Remote', 'Hybrid', 'Onsite'];
export const TYPES: JobType[] = ['Contract', 'Part Time', 'Full Time'];
export const FRESHNESS: { label: string; days: number }[] = [{ label: 'Past 6 hours', days: 0.25 }, { label: '24h', days: 1 }, { label: '7d', days: 7 }, { label: '14d', days: 14 }, { label: '30d', days: 30 }];

export interface PillFilters { levels: string[]; workplaces: string[]; types: string[]; roleFamilies: string[]; sponsors: boolean }
export const emptyPills = (): PillFilters => ({ levels: [], workplaces: [], types: [], roleFamilies: [], sponsors: false });
/** Within a group any chosen pill may match; across groups all must. A job with an unknown value in a chosen group is left out. */
export function matchesPills(job: any, pills: PillFilters): boolean {
  const f = facetsOf(job);
  const pick = (chosen: string[], value: string) => !chosen.length || chosen.includes(value) || (chosen.includes('Experienced') && value === 'Mid Level');
  const familyIds = familyIdsOf(job);
  const selectedFamiliesMatch = !pills.roleFamilies.length || familyIds.some(id => pills.roleFamilies.includes(id)) || (!familyIds.length && pills.roleFamilies.includes('other'));
  return pick(pills.levels, f.level) && pick(pills.workplaces, f.workplace) && pick(pills.types, f.type) && selectedFamiliesMatch && (!pills.sponsors || f.sponsors);
}
// Tsenta-style pastel card tints (colors live in index.css as .tint-0 to .tint-5, light and dark), chosen by company so it always looks the same.
export const TINT_COUNT = 6;
export const tintIndex = (company: string) => [...String(company || '')].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7) % TINT_COUNT;

/** A short place name. Some sources put a whole sentence in the location field; keep only the part before the first separator. */
export function placeOf(job: any, max = 48): string {
  const raw = String(job?.location || '').replace(/\s+/g, ' ').trim();
  if (!raw || /not listed|review location/i.test(raw)) return '';
  if (raw.length <= max) return raw;
  const head = raw.split(/\s+[·|]\s+|\s+[-–—]\s+|\s\$|\s\(?\bUS only\b/)[0].trim();
  const cut = head.length > max ? head.slice(0, max).replace(/[\s,;:(]+\S*$/, '') : head;
  return cut.replace(/[\s,;:(]+$/, '');
}
