// Types and small helpers for the Tracker and Calendar screens. The server decides stages; this only shapes them for display.
export type StageId = 'saved' | 'applied' | 'screening' | 'assessment' | 'interviewing' | 'offer' | 'rejected' | 'withdrawn' | 'ghosted';
export interface TrackerRow { jobId: string; applicationId: string; company: string; role: string; stage: StageId; flags: string[]; quietDays: number; submittedAt: string | null; lastActivityAt: string | null; source: string; url: string; ats: string; tailoringMode: string; resume: string; notes: number; nextEvent: string | null }
export interface GroupStat { n: number; replied: number; interviewed: number; replyRate: number; interviewRate: number; lowSample: boolean }
export interface TrackerView {
  rows: TrackerRow[]; stages: { id: StageId; label: string; count: number }[]; ghostDays: number;
  funnel: { total: GroupStat; stages: Record<StageId, number>; ghosted: number; weekly: { week: string; submitted: number; replied: number; interviewed: number }[]; byAts: Record<string, GroupStat>; bySource: Record<string, GroupStat>; byTailoring: Record<string, GroupStat>; byResume: Record<string, GroupStat> };
}
export interface TimelineItem { at: string; kind: 'status' | 'mail' | 'event' | 'task' | 'note'; text: string; id?: string; cancelled?: boolean }
export interface CalEvent {
  id: string; uid: string; summary: string; description: string; location: string; url: string; start: string; end: string; allDay: boolean; status: string; source: 'mail' | 'manual'; kind: 'Interview' | 'Screening' | 'Assessment' | 'Follow-up' | 'Other';
  jobId: string | null; company: string; role: string; notes: string; organizer: { email: string; name: string } | null; rsvp: { response: string; draftId: string; sent: boolean } | null;
}

export const pct = (value: number) => `${Math.round(value * 100)}%`;
export const stageTone = (stage: StageId) => (stage === 'offer' ? 'success' : stage === 'rejected' || stage === 'ghosted' ? 'danger' : stage === 'withdrawn' ? 'neutral' : stage === 'saved' ? 'neutral' : 'info') as 'success' | 'danger' | 'neutral' | 'info';
export const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
// The calendar fetches one month of data around the cursor so month, week and agenda views share a single request.
export function rangeAround(cursor: Date) {
  const from = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
  const to = new Date(cursor.getFullYear(), cursor.getMonth() + 2, 1);
  return { from: from.toISOString(), to: to.toISOString() };
}
export const eventsOn = (events: CalEvent[], day: Date) => events.filter(e => (e.allDay ? sameDay(new Date(e.start), day) : sameDay(new Date(e.start), day))).sort((a, b) => a.start.localeCompare(b.start));
export const rsvpLabel = (e: CalEvent) => (e.status === 'CANCELLED' ? 'Cancelled' : !e.rsvp ? 'No reply yet' : `${e.rsvp.response === 'accept' ? 'Accepted' : e.rsvp.response === 'decline' ? 'Declined' : 'Tentative'}${e.rsvp.sent ? '' : ' (draft, not sent)'}`);
