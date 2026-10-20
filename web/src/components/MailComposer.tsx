import { useEffect, useRef, useState } from 'react';
import { api } from '@/api/client';
import { Button, Input, Textarea } from '@/components/ui/primitives';
import { Modal, ConfirmDialog } from '@/components/ui/overlays';
export type MailDraft = { id?: string; revision?: number; to: string; cc?: string; bcc?: string; subject: string; body: string; replyTo?: string; attachments: { filename: string; base64: string; size?: number }[]; sendAttemptId?: string; status?: string };
export function MailComposer({ initial, onClose, onSaved }: { initial: MailDraft; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState(initial);
  const [showMoreRecipients,setShowMoreRecipients]=useState(Boolean(initial.cc||initial.bcc));
  const [signature,setSignature]=useState(()=>{try{return localStorage.getItem('dm.mail.signature')||'';}catch{return '';}});
  const bodyRef=useRef<HTMLTextAreaElement>(null);
  const current = useRef(initial); const saved = useRef(initial.id ? JSON.stringify(initial) : '');
  const identity = useRef({ id: initial.id || crypto.randomUUID(), revision: initial.revision || 0 });
  const saving = useRef<Promise<any> | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [status, setStatus] = useState(initial.id ? 'Draft saved' : 'New draft');
  const [review, setReview] = useState<any>(null); const [attempt, setAttempt] = useState<any>(null); const [discard, setDiscard] = useState(false); const [resolveUnsent, setResolveUnsent] = useState(false); const [reloadSaved,setReloadSaved]=useState(false);
  const locked = ['sending','unknown','sent'].includes(attempt?.status);
  const patch = (v: Partial<MailDraft>) => { const next = { ...current.current, ...v }; current.current = next; setDraft(next); setReview(null); setStatus('Unsaved changes'); };
  async function save(): Promise<any> {
    if (saving.current) { await saving.current; if (JSON.stringify(current.current) !== saved.current) return save(); return { ...current.current, ...identity.current }; }
    if (JSON.stringify(current.current) === saved.current) return { ...current.current, ...identity.current };
    const snapshot = current.current;
    const promise = api(`/api/mailbox/drafts${identity.current.id ? '/'+identity.current.id : ''}`, { ...snapshot, revision: identity.current.revision }).then(result => {
      identity.current = { id: result.draft.id, revision: result.draft.revision }; saved.current = JSON.stringify(snapshot); setStatus(current.current === snapshot ? 'Draft saved' : 'Saving latest changes…'); onSaved(); return result.draft;
    });
    saving.current = promise;
    try { return await promise; } finally { saving.current = null; }
  }
  useEffect(() => { if (locked) return; const t = setTimeout(() => { void save().catch(e => { setError(e.message); setStatus('Draft not saved'); }); }, 800); return () => clearTimeout(t); }, [draft, locked]);
  useEffect(() => () => { if(JSON.stringify(current.current)!==saved.current)void save().catch(()=>{}); }, []);
  useEffect(() => { const warn = (e: BeforeUnloadEvent) => { if (JSON.stringify(current.current) !== saved.current) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload',warn); return () => window.removeEventListener('beforeunload',warn); }, []);
  useEffect(() => { if (!initial.sendAttemptId) return; void api(`/api/mailbox/attempts/${initial.sendAttemptId}/reconcile`,{}).then(r=>setAttempt(r.attempt)).catch(e=>setError(e.message)); }, []);
  async function run(fn: () => Promise<void>) { if(busy)return;setBusy(true);setError('');try { await fn(); }catch(e){setError((e as Error).message);}finally{setBusy(false);} }
  const close = () => void run(async()=>{if(!locked)await save();onClose();});
  async function attach(files: FileList | null) {
    if(!files)return;
    const added = [...files]; if(added.length+current.current.attachments.length>5||added.reduce((s,f)=>s+f.size,0)+current.current.attachments.reduce((s,f)=>s+(f.size||Math.floor(f.base64.length*3/4)),0)>10*1024*1024){setError('Attach up to five files, totaling 10 MB or less.');return;}
    const values = await Promise.all(added.map(f => new Promise<{filename:string;base64:string;size:number}>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve({filename:f.name,base64:String(r.result).split(',')[1],size:f.size});r.onerror=()=>reject(new Error('Could not read attachment.'));r.readAsDataURL(f);})));patch({attachments:[...current.current.attachments,...values]});
  }
  return <>
    <Modal side open onOpenChange={o=>!o&&close()} title="Write a message" description="Drafts save to Daymark. Sending requires a separate review." footer={<><Button disabled={busy} onClick={close}>Save & close</Button><Button disabled={busy||locked} variant="primary" onClick={()=>void run(async()=>{const d=await save();const r=await api(`/api/mailbox/drafts/${d.id}/review`,{revision:d.revision});setReview(r);})}>Review before sending</Button></>}>
      <div className="space-y-4"><p role="status" className="text-xs text-muted">{status}</p>{error&&<div role="alert" className="text-danger"><p>{error}</p>{error.includes('another tab')&&<div className="mt-2 flex gap-2"><Button size="sm" onClick={()=>void navigator.clipboard.writeText(current.current.body).then(()=>setStatus('Message copied')).catch(()=>setStatus('Select your message text and copy it before reloading.'))}>Copy my message</Button><Button size="sm" onClick={()=>setReloadSaved(true)}>Load saved version</Button></div>}</div>}
        <label className="block">To<Input type="email" value={draft.to} disabled={locked||busy} onChange={e=>patch({to:e.target.value})} maxLength={254}/></label>
        <Button size="sm" variant="ghost" aria-expanded={showMoreRecipients} onClick={()=>setShowMoreRecipients(v=>!v)}>{showMoreRecipients?'Hide':'Add'} Cc/Bcc</Button>
        {showMoreRecipients&&<div className="space-y-3"><label className="block">Cc<Input type="text" value={draft.cc||''} disabled={locked||busy} onChange={e=>patch({cc:e.target.value})} placeholder="name@example.com, another@example.com" maxLength={2000}/></label><label className="block">Bcc<Input type="text" value={draft.bcc||''} disabled={locked||busy} onChange={e=>patch({bcc:e.target.value})} placeholder="name@example.com" maxLength={2000}/></label></div>}
        <label className="block">Subject<Input value={draft.subject} disabled={locked||busy} onChange={e=>patch({subject:e.target.value})} maxLength={300}/></label>
        <label className="block">Message<Textarea ref={bodyRef} className="min-h-60" value={draft.body} disabled={locked||busy} onChange={e=>patch({body:e.target.value})} maxLength={60000}/></label>
        {signature&&<Button size="sm" variant="ghost" disabled={locked||busy} onClick={()=>patch({body:`${current.current.body.replace(/\s*$/,'')}\n\n${signature}`})}>Insert saved signature</Button>}
        <Button size="sm" variant="ghost" disabled={locked||busy} onClick={()=>{const el=bodyRef.current;const selected=el&&el.selectionEnd>el.selectionStart?current.current.body.slice(el.selectionStart,el.selectionEnd).trim():'';if(!selected){setError('Select text in your message to save it as a signature.');return;}try{localStorage.setItem('dm.mail.signature',selected);setSignature(selected);setStatus('Signature saved on this device');}catch{setError('Could not save the signature in this browser.');}}}>Save selected text as signature</Button>
        <label className="block text-sm">Attachments · up to 10 MB<input type="file" multiple disabled={locked||busy} className="mt-2 block w-full text-xs" onChange={e=>void attach(e.target.files).catch(err=>setError(err.message))}/></label>
        <ul>{draft.attachments.map((a,i)=><li key={i} className="flex items-center justify-between gap-2 py-1"><span className="truncate">{a.filename}</span><Button size="sm" disabled={locked||busy} onClick={()=>patch({attachments:draft.attachments.filter((_,n)=>n!==i)})}>Remove</Button></li>)}</ul>
        {attempt&&<div role="status" className="rounded-card border border-line bg-bg p-3"><p className="font-medium">{attempt.status==='sent'?'Accepted by the mail server':attempt.status==='unknown'?'Send outcome uncertain':attempt.status==='failed'?'Message was not sent':attempt.status==='prepared'?'Ready for review':'Sending is in progress'}</p><p className="mt-1 text-muted">{attempt.status==='unknown'?'Daymark will not resend automatically. Check Proton Sent mail, then reconcile.':attempt.status==='sent'?'Server acceptance does not guarantee delivery to the recipient.':''}</p>{['unknown','sending'].includes(attempt.status)&&<Button className="mt-2" disabled={busy} onClick={()=>void run(async()=>{const r=await api(`/api/mailbox/attempts/${attempt.id}/reconcile`,{});setAttempt(r.attempt);onSaved();})}>Check Sent mail</Button>}{attempt.status==='unknown'&&<Button className="mt-2" disabled={busy} onClick={()=>setResolveUnsent(true)}>I checked; it was not sent</Button>}</div>}
        <Button size="sm" variant="danger" disabled={busy||locked} onClick={()=>setDiscard(true)}>Discard draft</Button>
      </div>
    </Modal>
    <Modal open={!!review} onOpenChange={o=>!o&&setReview(null)} title="Review this email" description="Check the exact recipient, message, and files before sending." footer={<><Button disabled={busy} onClick={()=>setReview(null)}>Keep editing</Button><Button variant="primary" disabled={busy} onClick={()=>void run(async()=>{const r=await api(`/api/mailbox/attempts/${review.attempt.id}/send`,{});setAttempt(r.attempt);setReview(null);onSaved();})}>{busy?'Sending…':'Send this email'}</Button></>}>
      {review&&<div className="space-y-3 break-words"><p><strong>From:</strong> {review.preview.from}</p><p><strong>To:</strong> {review.preview.to}</p>{review.preview.cc&&<p><strong>Cc:</strong> {review.preview.cc}</p>}{review.preview.bcc&&<p><strong>Bcc:</strong> {review.preview.bcc}</p>}<p><strong>Subject:</strong> {review.preview.subject}</p><p className="whitespace-pre-wrap">{review.preview.body}</p><ul>{review.preview.attachments.map((a:any,i:number)=><li key={i}>{a.filename} · {Math.ceil(a.size/1024)} KB</li>)}</ul>{error&&<p role="alert" className="text-danger">{error}</p>}</div>}
    </Modal>
    <ConfirmDialog open={reloadSaved} onOpenChange={setReloadSaved} title="Load the saved draft?" description="Your unsaved edits will be replaced. Copy your message first if you want to keep both versions." confirmLabel="Load saved draft" onConfirm={()=>void run(async()=>{const r=await api(`/api/mailbox/drafts/${identity.current.id}`);identity.current={id:r.draft.id,revision:r.draft.revision};current.current=r.draft;saved.current=JSON.stringify(r.draft);setDraft(r.draft);setReview(null);setStatus('Saved draft loaded');})}/>
    <ConfirmDialog open={resolveUnsent} onOpenChange={setResolveUnsent} danger title="Allow another send review?" description="Only continue after checking Proton Sent and confirming the email was not sent. If the previous send actually succeeded, sending again could create a duplicate." confirmLabel="Confirm not sent" onConfirm={()=>void run(async()=>{const r=await api(`/api/mailbox/attempts/${attempt.id}/resolve-not-sent`,{confirmed:true});setAttempt(r.attempt);onSaved();})}/>
    <ConfirmDialog open={discard} onOpenChange={setDiscard} danger title="Discard this draft?" description="This removes the saved draft from Daymark." confirmLabel="Discard draft" onConfirm={()=>void run(async()=>{const d=await save();await api(`/api/mailbox/drafts/${d.id}/discard`,{revision:d.revision});onSaved();onClose();})}/>
  </>;
}
