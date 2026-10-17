import * as greenhouse from './greenhouse.mjs';
import * as lever from './lever.mjs';
import * as ashby from './ashby.mjs';
import * as smartrecruiters from './smartrecruiters.mjs';
import * as workable from './workable.mjs';
import * as workday from './workday.mjs';
import * as recruitee from './recruitee.mjs';
export const ATS_SOURCES = Object.freeze({ greenhouse, lever, ashby, smartrecruiters, workable, workday, recruitee });
export const sourceFor = ats => ATS_SOURCES[ats] ?? null;
