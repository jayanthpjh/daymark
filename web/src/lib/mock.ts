// Mock data for Mail and Calendar until their APIs land (Phases 5-6). Clearly labelled in the UI.
export interface MockMail { id: string; from: string; address: string; subject: string; preview: string; body: string; at: string; unread: boolean; label: 'Inbox' | 'Interviews' | 'Updates' | 'Sent'; company: string; role: string; starred?: boolean }
const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
export const mockMail: MockMail[] = [
  { id: 'm1', from: 'Dana Whitfield', address: 'dana@northwind.example', subject: 'Interview invitation: Data Engineer', preview: 'We would love to schedule a 45 minute call with the data platform team…', body: 'Hi Alex,\n\nThanks for applying. We would love to schedule a 45 minute call with the data platform team next week. Please reply with two windows that work for you.\n\nBest,\nDana', at: ago(2), unread: true, label: 'Interviews', company: 'Northwind', role: 'Data Engineer' },
  { id: 'm2', from: 'Greenhouse', address: 'no-reply@greenhouse.example', subject: 'Thanks for applying to Figma', preview: 'We received your application for Data Platform Engineer.', body: 'We received your application for Data Platform Engineer. A recruiter will review it shortly.', at: ago(7), unread: true, label: 'Updates', company: 'Figma', role: 'Data Platform Engineer' },
  { id: 'm3', from: 'Priya Raman', address: 'priya@robinhood.example', subject: 'Re: Senior Software Engineer, Data Engineering', preview: 'Quick question on your availability for a screening call.', body: 'Quick question on your availability for a screening call this Thursday or Friday.', at: ago(26), unread: false, label: 'Inbox', company: 'Robinhood', role: 'Senior Software Engineer' },
  { id: 'm4', from: 'Airbnb Recruiting', address: 'jobs@airbnb.example', subject: 'Your application update', preview: 'After careful consideration we will not be moving forward.', body: 'After careful consideration we will not be moving forward at this time.', at: ago(70), unread: false, label: 'Updates', company: 'Airbnb', role: 'Sr Staff Data Engineer' },
];
export interface MockEvent { id: string; title: string; company: string; start: string; end: string; kind: 'Interview' | 'Screening' | 'Assessment' | 'Follow-up'; join?: string; prep: string[]; rsvp: 'accepted' | 'pending' | 'declined' }
const at = (d: number, h: number, m = 0) => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(h, m, 0, 0); return x.toISOString(); };
export const mockEvents: MockEvent[] = [
  { id: 'e1', title: 'Data platform team call', company: 'Northwind', start: at(1, 10), end: at(1, 10, 45), kind: 'Interview', join: 'https://meet.example/northwind', prep: ['Review the tailored resume variant', 'Pipeline migration story (STAR)', 'Ask about on-call load'], rsvp: 'pending' },
  { id: 'e2', title: 'Recruiter screening', company: 'Robinhood', start: at(2, 14), end: at(2, 14, 30), kind: 'Screening', join: 'https://meet.example/rh', prep: ['Confirm salary expectations', 'Work authorization answer'], rsvp: 'accepted' },
  { id: 'e3', title: 'Take-home due', company: 'Figma', start: at(4, 17), end: at(4, 18), kind: 'Assessment', prep: ['Block 3 hours', 'Re-read the brief'], rsvp: 'accepted' },
  { id: 'e4', title: 'Follow up with Airbnb', company: 'Airbnb', start: at(0, 16), end: at(0, 16, 15), kind: 'Follow-up', prep: [], rsvp: 'accepted' },
];
