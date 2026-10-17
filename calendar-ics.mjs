// Reads calendar invites (.ics) from mail and builds iTIP replies. Invite text is untrusted data:
// it is parsed with ical.js, size-limited, stripped of control characters, and never executed or followed.
import ICAL from 'ical.js';

export const MAX_ICS_BYTES = 200_000;
const MAX_EVENTS = 50;
const MAX_OCCURRENCES = 60;
const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const mailAddress = value => { const m = /^mailto:(.+)$/i.exec(String(value || '').trim()); const a = (m ? m[1] : '').toLowerCase().split('?')[0]; return /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(a) && a.length <= 254 ? a : ''; };
const MEETING = /https:\/\/[^\s<>"')]*(?:zoom\.us|meet\.google\.com|teams\.microsoft\.com|teams\.live\.com|webex\.com|gotomeeting\.com|whereby\.com)[^\s<>"')]*/i;
const safeHttps = value => { try { const u = new URL(String(value)); return u.protocol === 'https:' && !u.username && !u.password ? u.href.slice(0, 500) : ''; } catch { return ''; } };

function register(vcalendar) {
  for (const tz of vcalendar.getAllSubcomponents('vtimezone')) {
    try { const zone = new ICAL.Timezone(tz); if (!ICAL.TimezoneService.has(zone.tzid)) ICAL.TimezoneService.register(zone.tzid, zone); } catch { /* an unreadable zone falls back to floating time */ }
  }
}
const iso = time => time.toJSDate().toISOString();
function describe(event, method, startTime, endTime) {
  const vevent = event.component;
  const organizer = vevent.getFirstProperty('organizer');
  const location = clean(event.location, 300);
  const description = clean(event.description, 600);
  const url = safeHttps(vevent.getFirstPropertyValue('url')) || (MEETING.exec(`${location} ${event.description || ''}`) || [''])[0];
  const allDay = startTime.isDate;
  return {
    uid: clean(event.uid, 255), recurrenceId: event.recurrenceId ? iso(event.recurrenceId) : '',
    summary: clean(event.summary, 200) || '(No title)', description, location, url: safeHttps(url),
    start: iso(startTime), end: iso(endTime || startTime), allDay,
    status: clean(vevent.getFirstPropertyValue('status'), 20).toUpperCase() || 'CONFIRMED', method,
    sequence: Number(vevent.getFirstPropertyValue('sequence')) || 0,
    organizer: organizer ? { email: mailAddress(organizer.getFirstValue()), name: clean(organizer.getParameter('cn'), 120) } : null,
    attendees: vevent.getAllProperties('attendee').slice(0, 20).map(p => ({ email: mailAddress(p.getFirstValue()), name: clean(p.getParameter('cn'), 120), partstat: clean(p.getParameter('partstat'), 20).toUpperCase() })).filter(a => a.email),
  };
}

// Returns {events, method, error}. Recurring events are expanded from `from` for up to `days` days (default one year).
export function parseIcs(text, { from = new Date(), days = 365 } = {}) {
  const source = String(text ?? '');
  if (Buffer.byteLength(source) > MAX_ICS_BYTES) return { events: [], method: '', error: 'This invite is too large to read.' };
  if (!/BEGIN:VCALENDAR/i.test(source)) return { events: [], method: '', error: 'This is not a calendar invite.' };
  try {
    const calendar = new ICAL.Component(ICAL.parse(source.replace(/\r?\n/g, '\r\n')));
    register(calendar);
    const method = clean(calendar.getFirstPropertyValue('method'), 20).toUpperCase();
    const until = new Date(from.getTime() + days * 86_400_000);
    const events = [];
    const vevents = calendar.getAllSubcomponents('vevent');
    const overrides = new Set(vevents.filter(v => v.hasProperty('recurrence-id')).map(v => `${v.getFirstPropertyValue('uid')}|${new ICAL.Event(v).recurrenceId?.toJSDate().toISOString()}`));
    for (const vevent of vevents.slice(0, MAX_EVENTS)) {
      const event = new ICAL.Event(vevent);
      if (!event.startDate) continue;
      if (!event.isRecurring()) { events.push(describe(event, method, event.startDate, event.endDate)); continue; }
      const iterator = event.iterator();
      const length = event.duration;
      let step = null, count = 0;
      while ((step = iterator.next()) && count < MAX_OCCURRENCES) {
        const when = step.toJSDate();
        if (when > until) break;
        if (when < from) continue;
        if (overrides.has(`${vevent.getFirstPropertyValue('uid')}|${when.toISOString()}`)) continue;
        const end = step.clone(); end.addDuration(length);
        events.push({ ...describe(event, method, step, end), recurrenceId: when.toISOString() });
        count++;
      }
    }
    return { events: events.slice(0, 200), method, error: '' };
  } catch {
    return { events: [], method: '', error: 'This calendar invite could not be read.' };
  }
}

const stamp = date => new Date(date).toISOString().replace(/[-:]|\.\d{3}/g, '');
const esc = value => String(value ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line) {
  const out = []; let rest = line;
  while (Buffer.byteLength(rest) > 75) { let n = 75; while (Buffer.byteLength(rest.slice(0, n)) > 75) n--; out.push(rest.slice(0, n)); rest = ' ' + rest.slice(n); }
  out.push(rest); return out.join('\r\n');
}
export const RSVP = Object.freeze({ accept: 'ACCEPTED', decline: 'DECLINED', tentative: 'TENTATIVE' });

// iTIP REPLY for one invite. Needs the organizer's address; without it there is nobody to answer, so no reply is built.
export function buildReplyIcs({ event, attendee, response, now = new Date() }) {
  const partstat = RSVP[response];
  if (!partstat) return { error: 'Choose accept, decline or tentative.' };
  if (!event?.organizer?.email || !event.uid) return { error: 'This invite does not say who to reply to.' };
  if (!mailAddress(`mailto:${attendee?.email}`)) return { error: 'Set the address you apply with before replying.' };
  const lines = ['BEGIN:VCALENDAR', 'PRODID:-//Daymark//Calendar//EN', 'VERSION:2.0', 'METHOD:REPLY', 'BEGIN:VEVENT', `UID:${esc(event.uid)}`, `DTSTAMP:${stamp(now)}`,
    ...(event.allDay ? [`DTSTART;VALUE=DATE:${stamp(event.start).slice(0, 8)}`] : [`DTSTART:${stamp(event.start)}`, `DTEND:${stamp(event.end)}`]),
    ...(event.recurrenceId ? [`RECURRENCE-ID:${stamp(event.recurrenceId)}`] : []), `SEQUENCE:${Number(event.sequence) || 0}`, `SUMMARY:${esc(event.summary)}`,
    `ORGANIZER:mailto:${event.organizer.email}`, `ATTENDEE;PARTSTAT=${partstat};CN=${esc(attendee.name || attendee.email)}:mailto:${attendee.email}`, 'END:VEVENT', 'END:VCALENDAR'];
  return { ics: lines.map(fold).join('\r\n') + '\r\n', partstat };
}

// Two events conflict when their times overlap. All-day events do not block a time slot.
export function findConflicts(events) {
  const timed = events.filter(e => !e.allDay && e.status !== 'CANCELLED').map(e => ({ id: e.id, s: Date.parse(e.start), e: Date.parse(e.end) || Date.parse(e.start) + 3_600_000 })).sort((a, b) => a.s - b.s);
  const pairs = [];
  for (let i = 0; i < timed.length; i++) for (let j = i + 1; j < timed.length && timed[j].s < timed[i].e; j++) pairs.push([timed[i].id, timed[j].id]);
  return pairs;
}
