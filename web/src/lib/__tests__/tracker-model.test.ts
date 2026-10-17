import { describe, expect, it } from 'vitest';
import { eventsOn, pct, rangeAround, rsvpLabel, sameDay, stageTone, type CalEvent } from '../tracker-model';

const event = (extra: Partial<CalEvent> = {}): CalEvent => ({ id: 'e', uid: 'u', summary: 'Interview', description: '', location: '', url: '', start: '2026-10-20T15:00:00Z', end: '2026-10-20T16:00:00Z', allDay: false, status: 'CONFIRMED', source: 'mail', kind: 'Interview', jobId: null, company: '', role: '', notes: '', organizer: null, rsvp: null, ...extra });

describe('rsvpLabel', () => {
  it('says when nothing was answered, and when a reply is only a draft', () => {
    expect(rsvpLabel(event())).toBe('No reply yet');
    expect(rsvpLabel(event({ rsvp: { response: 'accept', draftId: 'd', sent: false } }))).toBe('Accepted (draft, not sent)');
    expect(rsvpLabel(event({ rsvp: { response: 'decline', draftId: 'd', sent: true } }))).toBe('Declined');
    expect(rsvpLabel(event({ rsvp: { response: 'tentative', draftId: 'd', sent: true } }))).toBe('Tentative');
  });
  it('cancelled wins over any reply', () => {
    expect(rsvpLabel(event({ status: 'CANCELLED', rsvp: { response: 'accept', draftId: 'd', sent: true } }))).toBe('Cancelled');
  });
});
describe('calendar helpers', () => {
  it('rangeAround covers the month before through the month after', () => {
    const { from, to } = rangeAround(new Date(2026, 9, 15));
    expect(new Date(from).getMonth()).toBe(8);
    expect(new Date(to).getMonth()).toBe(11);
  });
  it('eventsOn returns that day only, earliest first', () => {
    const day = new Date('2026-10-20T12:00:00');
    const list = eventsOn([event({ id: 'b', start: new Date('2026-10-20T14:00:00').toISOString() }), event({ id: 'a', start: new Date('2026-10-20T09:00:00').toISOString() }), event({ id: 'c', start: new Date('2026-10-21T09:00:00').toISOString() })], day);
    expect(list.map(e => e.id)).toEqual(['a', 'b']);
  });
  it('sameDay compares calendar days, not instants', () => {
    expect(sameDay(new Date('2026-10-20T00:01:00'), new Date('2026-10-20T23:59:00'))).toBe(true);
    expect(sameDay(new Date('2026-10-20T23:59:00'), new Date('2026-10-21T00:01:00'))).toBe(false);
  });
});
describe('tracker display helpers', () => {
  it('formats rates as whole percentages', () => {
    expect(pct(0)).toBe('0%');
    expect(pct(0.3333)).toBe('33%');
    expect(pct(1)).toBe('100%');
  });
  it('shows good outcomes green, bad red, early stages neutral', () => {
    expect(stageTone('offer')).toBe('success');
    expect(stageTone('rejected')).toBe('danger');
    expect(stageTone('ghosted')).toBe('danger');
    expect(stageTone('saved')).toBe('neutral');
    expect(stageTone('interviewing')).toBe('info');
  });
});
