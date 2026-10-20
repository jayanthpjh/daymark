import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { MessageSquareMore, X } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, useDaymarkState } from '@/api/client';
import { Button, Textarea } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';

type Entry = { id: string; role: string; text: string; results?: any[]; context?: any; status?: string; waiting?: { id: string; summary: string; name?: string }[] };
type Approval = { id: string; action: string; summary: string; status: string; outcome?: { message: string; link?: string } };
const transcript = (c:any):Entry[] => (c.turns || []).flatMap((t:any)=>[
  {id:t.id+'-you',role:'You',text:t.message,context:t.context},
  {id:t.id+'-assistant',role:'Daymark',text:t.reply || 'Checking your application…',results:[...(t.ran||[]),...(t.refused||[]).map((r:any)=>({...r,status:'refused'}))],waiting:t.waiting||[],status:t.status},
]);

const statusText: Record<string, string> = { pending: 'Waiting for you', running: 'Working…', done: 'Done', failed: 'Did not run', declined: 'Declined', expired: 'Expired', conflict: 'Changed, not run', not_pending: 'Already handled' };
// A proposed action. Nothing happens until the applicant presses the button; the card shows what will happen in plain words.
function ApprovalCard({ id, summary, approval, onNavigate, onDone }: { id: string; summary: string; approval?: Approval; onNavigate: (to: string) => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const status = approval?.status || 'pending';
  const act = async (kind: 'confirm' | 'decline') => {
    setBusy(true); setError('');
    try { await api(`/api/agent/${kind}`, { id }); onDone(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div role="group" aria-label="Action waiting for your approval" className="mt-2 rounded-control border border-line bg-bg p-3">
      <p className="text-sm font-medium">{summary}</p>
      <p className={`mt-1 text-xs ${status === 'done' ? 'text-success' : status === 'pending' ? 'text-warning' : 'text-muted'}`}><span className="sr-only">Status: </span>{statusText[status] || status}</p>
      {status === 'pending' && <div className="mt-2 flex gap-2"><Button size="sm" variant="primary" disabled={busy} onClick={() => act('confirm')}>Approve</Button><Button size="sm" disabled={busy} onClick={() => act('decline')}>Not now</Button></div>}
      {approval?.outcome?.message && status !== 'pending' && <p className="mt-1 text-sm text-muted">{approval.outcome.message}{approval.outcome.link && <> <button type="button" className="text-brand underline" onClick={() => onNavigate(approval.outcome!.link!)}>Open</button></>}</p>}
      {error && <p role="alert" className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  );
}
// One mounted conversation shared by the floating launcher and expanded panel.
export function AgentPanel({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(() => {
    const desktop = window.matchMedia('(min-width: 1100px)').matches;
    try { return desktop && localStorage.getItem('dm.assistant.open') !== '0'; } catch { return desktop; }
  });
  const [wide, setWide] = useState(false);
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 1100px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1100px)');
    const update = () => {
      setDesktop(media.matches);
      if (!media.matches) setOpen(false);
      else { try { setOpen(localStorage.getItem('dm.assistant.open') !== '0'); } catch { setOpen(true); } }
    };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const setDesktopOpen = (value: boolean) => { setOpen(value); try { localStorage.setItem('dm.assistant.open', value ? '1' : '0'); } catch { /* private mode */ } };
  const [input, setInput] = useState('');
  const [conversationId,setConversationId]=useState('');
  const [conversations,setConversations]=useState<any[]>([]);
  const [loading,setLoading]=useState(false);
  const activeId=useRef('');const historyEpoch=useRef(0);
  const pendingRequest=useRef<{id:string;message:string;jobId?:string}|null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = useRef(location.pathname);
  currentPath.current = location.pathname;
  const { data } = useDaymarkState();
  const qc = useQueryClient();
  const approvals = useQuery<{ pending: Approval[]; recent: Approval[] }>({ queryKey: ['agent-approvals'], queryFn: () => api('/api/agent/approvals'), enabled: open, refetchInterval: 4000, retry: false });
  const approvalById = new Map([...(approvals.data?.recent || []), ...(approvals.data?.pending || [])].map(a => [a.id, a]));
  const jobId = location.pathname.match(/^\/applications\/([^/]+)$/)?.[1];
  const job = data?.jobs.find(j => j.id === jobId);
  useEffect(() => {
    const toggle = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); setOpen(v => { const next = !v; try { localStorage.setItem('dm.assistant.open', next ? '1' : '0'); } catch { /* private mode */ } return next; }); }
    };
    window.addEventListener('keydown', toggle);
    return () => window.removeEventListener('keydown', toggle);
  }, []);
  function install(c:any) {
    activeId.current=c.id;setConversationId(c.id);setEntries(transcript(c));
    try {localStorage.setItem('dm.active-chat',c.id);setInput(sessionStorage.getItem('dm.chat-draft.'+c.id)||'');}catch{setInput('');}
    setConversations(items=>[{id:c.id,title:c.title},...items.filter(i=>i.id!==c.id)].slice(0,50));
    pendingRequest.current=null;
  }
  async function load(id?:string) {
    const epoch=++historyEpoch.current;setLoading(true);setError('');
    try {
      const list=await api('/api/agent/conversations');if(epoch!==historyEpoch.current)return;setConversations(list.conversations);
      let wanted=id;try{wanted ||= localStorage.getItem('dm.active-chat')||undefined;}catch{}
      if(!list.conversations.some((c:any)=>c.id===wanted))wanted=list.conversations[0]?.id;
      const result=wanted?await api(`/api/agent/conversations/${wanted}`):await api('/api/agent/conversations',{});
      if(epoch===historyEpoch.current)install(result.conversation);
    }catch(e){if(epoch===historyEpoch.current)setError((e as Error).message);}finally{if(epoch===historyEpoch.current)setLoading(false);}
  }
  useEffect(()=>{if(open)void load(activeId.current||undefined);},[open]);
  useEffect(()=>{if(conversationId)try{sessionStorage.setItem('dm.chat-draft.'+conversationId,input);}catch{}},[conversationId,input]);
  useEffect(()=>{
    if(!open||!conversationId||!entries.some(e=>e.status==='running'))return;
    const id=conversationId;const timer=setInterval(()=>{void api(`/api/agent/conversations/${id}`).then(r=>{if(activeId.current===id)setEntries(transcript(r.conversation));}).catch(()=>setError('Could not refresh the saved reply. Reopen the assistant to reconnect.'));},3000);
    return ()=>clearInterval(timer);
  },[open,conversationId,entries.some(e=>e.status==='running')]);
  async function newChat(){if(inFlight.current||loading)return;setLoading(true);setError('');try{const r=await api('/api/agent/conversations',{});install(r.conversation);}catch(e){setError((e as Error).message);}finally{setLoading(false);}}
  async function send() {
    if (!input.trim() || inFlight.current || !conversationId || loading) return;
    inFlight.current = true; setBusy(true); setError('');
    const message = input.trim();const target=jobId;const startedOn=location.pathname;const id=conversationId;
    const request=pendingRequest.current?.message===message&&pendingRequest.current.jobId===target?pendingRequest.current:{id:crypto.randomUUID(),message,jobId:target};pendingRequest.current=request;
    setInput('');
    try {
      const result=await api('/api/agent/message',{message,jobId:target,conversationId:id,requestId:request.id});
      if(activeId.current!==id)return;
      setEntries(transcript(result.conversation));
      setConversations(items=>items.map(c=>c.id===id?{...c,title:result.conversation.title}:c));
      if(result.status==='failed'||result.status==='interrupted'){pendingRequest.current=null;setError(result.reply);setInput(current=>current||message);}else if(result.status==='complete')pendingRequest.current=null;
      const navigation = result.ran?.find((item: any) => item.status === 'done' && item.result?.navigation)?.result.navigation;
      if (navigation && currentPath.current === startedOn && data?.jobs.some(j => j.id === navigation.jobId) && ['live', 'form', 'resume', 'cover', 'job', 'mail', 'timeline', 'prep'].includes(navigation.section)) {
        navigate(`/applications/${encodeURIComponent(navigation.jobId)}?section=${navigation.section}`);if(!desktop)setOpen(false);
      }
    } catch(e){setError((e as Error).message);setInput(current=>current||message);}
    finally{inFlight.current=false;setBusy(false);}
  }
  const content = <>
    <div className="flex items-center justify-between gap-2">
      <h2 id="assistant-title" className="text-lg font-semibold">Daymark assistant</h2>
      <div className="flex gap-2"><Button size="sm" onClick={() => setWide(v => !v)}>{wide ? 'Compact' : 'Expand'}</Button><Button size="icon" variant="ghost" aria-label="Close assistant" onClick={() => setDesktopOpen(false)}><X size={18} /></Button></div>
    </div>
    <div className="mt-3 flex gap-2"><label className="min-w-0 flex-1"><span className="sr-only">Saved conversation</span><select aria-label="Saved conversation" disabled={busy||loading} value={conversationId} onChange={e=>void load(e.target.value)} className="h-10 w-full rounded-control border border-line bg-bg px-2 text-sm"><option value="" disabled>Choose a conversation</option>{conversations.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label><Button size="sm" disabled={busy||loading} onClick={()=>void newChat()}>New chat</Button></div>
    <p id="assistant-description" className="mt-2 text-muted">Your job search, one step at a time. Find answers and review your next move.</p>
    <div className="my-3 rounded-control border border-line bg-bg p-3 text-sm"><span className="block text-xs text-muted">Helping you with</span>{job ? `${job.company} · ${job.role}` : 'Job search overview'}</div>
    {jobId && <div className="flex flex-wrap gap-2" aria-label="Application shortcuts">
      <Button size="sm" onClick={() => { navigate(`/applications/${jobId}?section=form`); if (!desktop) setOpen(false); }}>Show questions</Button>
      <Button size="sm" onClick={() => { navigate(`/applications/${jobId}?section=resume`); if (!desktop) setOpen(false); }}>Review resume</Button>
    </div>}
    <div className="my-3 min-h-0 flex-1 overflow-y-auto" role="log" aria-label="Conversation" aria-relevant="additions">
      {loading&&<p role="status" className="py-3 text-muted">Loading saved conversation…</p>}
      {!loading&&entries.length === 0 && <div className="py-6"><h3 className="font-medium">Let’s move your search forward.</h3><p className="mt-2 text-muted">Find a saved role, understand an application, or see what needs your attention.</p><div className="mt-4 grid gap-2" aria-label="Suggested prompts">{[
        ['Explain my recommendations', 'Explain why these jobs match my profile.'],
        ['Find my next step', 'Which application needs my attention next?'],
        [job ? 'Prepare for this role' : 'Review my top matches', job ? `Help me prepare for ${job.company} · ${job.role}.` : 'Show my best saved job matches.'],
      ].map(([label, prompt]) => <Button key={label} variant="secondary" size="sm" className="justify-start whitespace-normal text-left" onClick={() => { setInput(prompt); document.getElementById('assistant-message')?.focus(); }}>{label}</Button>)}</div><p className="mt-2 text-xs text-muted">Suggestions fill the message box; they are not sent until you choose Ask Daymark.</p></div>}
      {entries.map(entry => <article key={`${entry.role}-${entry.id}`} className="mb-4 border-b border-line pb-4"><h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{entry.role}</h3><p className="whitespace-pre-wrap">{entry.text}</p>{entry.context?.company&&<p className="mt-1 text-xs text-muted">About {entry.context.company} · {entry.context.role}</p>}{entry.results?.map((r, i) => <div key={i} className="mt-3 rounded-control border border-line p-3">
        <p className="text-sm font-medium">{r.name.replaceAll('_', ' ')} · {r.status === 'done' ? 'Read complete' : r.status}</p>
        {r.result?.navigation && <p className="text-sm text-muted">{r.result.company} · {r.result.navigation.section}</p>}
        {r.reason && <p className="mt-1 text-sm text-muted">{r.reason}</p>}
        {r.result?.status === 'not_found' && <p className="text-muted">That application could not be found.</p>}
        {r.result?.jobs?.length === 0 && <p className="text-muted">No matching saved roles.</p>}
        {r.result?.jobs?.map((j: any) => <button key={j.id} className="mt-2 block text-left text-brand underline" onClick={() => { navigate(`/applications/${encodeURIComponent(j.id)}`); if (!desktop) setOpen(false); }}>{j.company} · {j.role}</button>)}
        {r.result?.tasks?.map((t: any) => <p key={t.id} className="mt-2 text-sm">{t.stage || t.type}: {String(t.status).replaceAll('_', ' ')}</p>)}
        {r.result?.applications?.length === 0 && <p className="text-muted">No applications are waiting for you.</p>}
        {r.result?.applications?.map((t: any) => <button key={t.taskId} className="mt-2 block text-left text-brand underline" onClick={() => { navigate(`/applications/${encodeURIComponent(t.jobId)}?section=form`); if (!desktop) setOpen(false); }}>{t.stage || 'Open application needing attention'}</button>)}
      </div>)}{entry.waiting?.map(w => <ApprovalCard key={w.id} id={w.id} summary={w.summary} approval={approvalById.get(w.id)} onNavigate={to => { navigate(to); if (!desktop) setOpen(false); }} onDone={() => { qc.invalidateQueries({ queryKey: ['agent-approvals'] }); qc.invalidateQueries({ queryKey: ['state'] }); }} />)}</article>)}
    </div>
    {error && <div role="alert" className="mb-2 text-danger"><p>{error}</p><Button size="sm" disabled={busy||loading} onClick={()=>void load(activeId.current||undefined)}>Reconnect history</Button></div>}
    <form onSubmit={e => { e.preventDefault(); void send(); }}>
      <label htmlFor="assistant-message" className="mb-1 block font-medium">Message</label><Textarea id="assistant-message" disabled={loading||!conversationId} value={input} onChange={e => setInput(e.target.value)} maxLength={2000} />
      <Button type="submit" className="mt-2 w-full" variant="primary" disabled={busy || loading || !conversationId || entries.some(e=>e.status==='running') || !input.trim()}>{busy ? 'Checking your applications…' : 'Ask Daymark'}</Button>
    </form>
    <p className="mt-2 text-xs text-muted">Conversations and action results are saved in Daymark. Unsent text stays in this browser tab.</p>
  </>;
  return <div className="application-workbench flex h-full min-w-0">
    {desktop ? open && <aside aria-labelledby="assistant-title" className={`flex h-full shrink-0 flex-col border-r border-line bg-surface p-4 ${wide ? 'w-[400px]' : 'w-[320px]'}`}>{content}</aside> : <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" /><Dialog.Content aria-describedby="assistant-description" className="fixed inset-y-0 left-0 z-50 flex w-full max-w-sm flex-col bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl"><Dialog.Title className="sr-only">Daymark assistant</Dialog.Title>{content}</Dialog.Content></Dialog.Portal></Dialog.Root>}
    <div className="relative min-w-0 flex-1">{children}
      {!open && <Button className={cn('fixed z-30 shadow-lg', desktop ? 'bottom-4 left-4' : 'bottom-20 right-4')} variant="primary" aria-label="Open Daymark assistant" aria-expanded={false} onClick={() => setDesktopOpen(true)}><MessageSquareMore size={17} />Assistant</Button>}
    </div>
  </div>;
}
