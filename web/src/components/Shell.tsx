import { AgentPanel } from './AgentPanel';
import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import * as Dialog from '@radix-ui/react-dialog';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { Bell, Moon, Sun, SunMoon, BriefcaseBusiness, CalendarDays, Compass, FolderOpen, Gauge, KanbanSquare, LayoutDashboard, Mail as MailIcon, Menu, MessageSquareMore, Search, Server, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { liveStream, stateKey, useDaymarkState } from '@/api/client';
import { applicationRows, needsYou } from '@/lib/derive';
import { buildQuestionInbox } from '@/lib/questions-model';
import { cn } from '@/lib/cn';
import { Badge, Button } from '@/components/ui/primitives';

const groups = [
  { label: 'Work', items: [
    { to: '/', label: 'Overview', icon: LayoutDashboard, end: true }, { to: '/discover', label: 'Discover', icon: Compass },
    { to: '/applications', label: 'Applications', icon: BriefcaseBusiness }, { to: '/questions', label: 'Questions', icon: MessageSquareMore, badge: 'questions' },
    { to: '/tracker', label: 'Tracker', icon: KanbanSquare } ] },
  { label: 'Mail & Calendar', items: [{ to: '/mail', label: 'Mail', icon: MailIcon }, { to: '/calendar', label: 'Calendar', icon: CalendarDays }] },
  { label: 'Materials', items: [{ to: '/materials', label: 'Materials', icon: FolderOpen }] },
  { label: 'System', items: [{ to: '/system', label: 'System', icon: Server }] },
];
const allItems = groups.flatMap(g => g.items);
const primaryItems = [
  { ...groups[0].items[0], label: 'Dashboard' }, { ...groups[0].items[1], label: 'Browse jobs' },
  groups[0].items[2], groups[0].items[4], groups[1].items[0],
];
const moreItems = [groups[0].items[3], groups[1].items[1], groups[2].items[0], { ...groups[3].items[0], label: 'Settings' }];



// Refetches as soon as the server says something changed. If the stream drops, the browser reconnects on its own and polling covers the gap.
function useLiveState() {
  const qc = useQueryClient();
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const source = new EventSource('/api/events');
    source.onopen = () => { liveStream.connected = true; };
    source.onerror = () => { liveStream.connected = false; };
    source.addEventListener('state', () => { qc.invalidateQueries({ queryKey: stateKey }); });
    return () => { liveStream.connected = false; source.close(); };
  }, [qc]);
}

type Theme = 'system' | 'light' | 'dark';
const themes: Theme[] = ['system', 'light', 'dark'];
function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => { try { const t = localStorage.getItem('dm.theme'); return t === 'light' || t === 'dark' ? t : 'system'; } catch { return 'system'; } });
  useEffect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', theme);
    try { if (theme === 'system') localStorage.removeItem('dm.theme'); else localStorage.setItem('dm.theme', theme); } catch { /* private mode */ }
  }, [theme]);
  const next = themes[(themes.indexOf(theme) + 1) % themes.length];
  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : SunMoon;
  return <Button variant="ghost" size="icon" aria-label={`Colour theme: ${theme}. Switch to ${next}`} onClick={() => setTheme(next)}><Icon size={17} aria-hidden /></Button>;
}

export function Shell() {
  useLiveState();
  const { data, isError, isFetching, refetch } = useDaymarkState();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const loc = useLocation();
  const navigate = useNavigate();
  useEffect(() => setMobileOpen(false), [loc.pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(o => !o); } };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, []);

  const questionCount = useMemo(() => data ? buildQuestionInbox(data.tasks, data.jobs).counts.questions : 0, [data]);
  const alerts = useMemo(() => data ? needsYou(data) : [], [data]);
  const queued = data?.tasks?.filter(t => t.status === 'queued').length ?? 0;
  const running = data?.tasks?.filter(t => t.status === 'running').length ?? 0;
  const workerOk = data?.worker?.status === 'ready';

  return (
    <AgentPanel><div className="flex h-full">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:bg-surface focus:p-2">Skip to main content</a>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex min-h-14 shrink-0 items-center gap-2 border-b border-line bg-surface/95 px-3 backdrop-blur md:px-4">
          <NavLink to="/" aria-label="Daymark home" className="flex shrink-0 items-center gap-2 pr-2"><span className="grid h-8 w-8 place-items-center rounded-control bg-brand text-sm font-bold text-on-brand">D</span><span className="hidden font-semibold tracking-tight sm:inline">Daymark</span></NavLink>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={18} /></Button>
          <nav aria-label="Primary" className="hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto md:flex">
            {primaryItems.map(item => <PrimaryNavItem key={item.to} item={item} questionCount={questionCount} />)}
            <Dropdown.Root><Dropdown.Trigger className={cn('inline-flex h-9 shrink-0 items-center gap-1.5 rounded-control px-3 text-[13px] font-medium text-muted hover:bg-muted-surface hover:text-ink', moreItems.some(i => loc.pathname === i.to || loc.pathname.startsWith(`${i.to}/`)) && 'bg-brand-soft text-brand')}>More<Menu size={14}/></Dropdown.Trigger><Dropdown.Portal><Dropdown.Content align="start" sideOffset={6} className="z-50 min-w-48 rounded-card border border-line bg-surface p-1 shadow-lg">{moreItems.map(item => <Dropdown.Item key={item.to} asChild><NavLink to={item.to} className="flex h-10 items-center gap-2 rounded-control px-3 text-sm text-ink outline-none hover:bg-muted-surface"><item.icon size={15}/>{item.label}{item.badge === 'questions' && questionCount > 0 && <Badge className="ml-auto">{questionCount}</Badge>}</NavLink></Dropdown.Item>)}</Dropdown.Content></Dropdown.Portal></Dropdown.Root>
          </nav>
          <button type="button" onClick={() => setPaletteOpen(true)} className="grid h-9 w-9 shrink-0 place-items-center rounded-control text-muted hover:bg-muted-surface hover:text-ink" aria-label="Search or jump to (Command K)"><Search size={17} aria-hidden /></button>
          <div className="ml-auto flex items-center gap-2">
            <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 md:hidden"/><Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-72 flex-col border-l border-line bg-surface p-4 shadow-xl md:hidden"><div className="mb-3 flex items-center justify-between"><Dialog.Title className="font-semibold">Navigate Daymark</Dialog.Title><Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Close navigation"><X size={18}/></Button></Dialog.Close></div><Dialog.Description className="sr-only">Choose a page</Dialog.Description><nav aria-label="Primary" className="flex flex-col gap-1">{allItems.map(item=><PrimaryNavItem key={item.to} item={item} questionCount={questionCount} mobile />)}</nav></Dialog.Content></Dialog.Portal></Dialog.Root>
            <Badge className="hidden 2xl:inline-flex" tone={workerOk ? 'success' : 'warning'} title="Worker status"><span className={cn('h-1.5 w-1.5 rounded-full', workerOk ? 'bg-success' : 'bg-warning')} />{data ? (workerOk ? 'Ready' : data.worker?.status || 'Unknown') : '…'}</Badge>
            <Badge className="hidden 2xl:inline-flex" title="Queue depth"><Gauge size={12} aria-hidden />{running} running · {queued} queued</Badge>
            <ThemeToggle />
            <Dropdown.Root>
              <Dropdown.Trigger asChild><Button variant="ghost" size="icon" aria-label={`Notifications, ${alerts.length} need you`} className="relative"><Bell size={17} />{alerts.length > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger" />}</Button></Dropdown.Trigger>
              <Dropdown.Portal><Dropdown.Content align="end" sideOffset={6} className="z-50 w-80 max-w-[calc(100vw-24px)] rounded-card border border-line bg-surface p-1 shadow-lg">
                {alerts.length === 0 ? <div className="p-4 text-center text-muted">Nothing needs you right now.</div> : alerts.slice(0, 8).map(a => (
                  <Dropdown.Item key={a.id} onSelect={() => navigate(a.href)} className="cursor-pointer rounded-control p-2 outline-none data-[highlighted]:bg-muted-surface"><div className="font-medium">{a.title}</div><div className="text-[12px] text-muted">{a.detail}</div></Dropdown.Item>
                ))}
              </Dropdown.Content></Dropdown.Portal>
            </Dropdown.Root>
          </div>
        </header>
        {isError && <div role="status" className="flex flex-wrap items-center gap-3 border-b border-warning/30 bg-warning/10 px-5 py-3"><div className="min-w-0 flex-1"><p className="font-semibold">Daymark is reconnecting</p><p className="text-sm text-muted">Saved data is temporarily unavailable. We’ll keep trying. Review the latest state before sending or submitting.</p></div><Button variant="secondary" size="sm" disabled={isFetching} onClick={() => void refetch()}>{isFetching ? 'Reconnecting…' : 'Try again'}</Button></div>}
        <main id="main" tabIndex={-1} className="job-board-container min-h-0 flex-1 overflow-y-auto focus:outline-none"><div className="mx-auto w-full max-w-none px-4 py-4 md:px-5 md:py-5"><Outlet /></div></main>
      </div>
      <Palette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div></AgentPanel>
  );
}

function PrimaryNavItem({ item, questionCount, mobile = false }: { item: any; questionCount: number; mobile?: boolean }) {
  const count = item.badge === 'questions' ? questionCount : 0;
  const label = ({ '/': 'Dashboard', '/discover': 'Browse jobs', '/system': 'Settings' } as Record<string,string>)[item.to] || item.label;
  return <NavLink to={item.to} end={item.end} className={({isActive})=>cn(mobile ? 'flex h-11 items-center gap-3 rounded-control px-3 text-sm' : 'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-control px-3 text-[13px] font-medium transition-colors', isActive ? 'bg-brand-soft font-semibold text-brand' : 'text-muted hover:bg-muted-surface hover:text-ink')}><item.icon size={mobile ? 17 : 15} aria-hidden/>{label}{count>0&&<span className={cn('rounded-full bg-surface px-1.5 text-[10px] ring-1 ring-brand/15', mobile && 'ml-auto')}>{count}</span>}</NavLink>;
}

function Palette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data } = useDaymarkState();
  const navigate = useNavigate();
  const go = (to: string) => { onOpenChange(false); navigate(to); };
  const rows = data ? applicationRows(data) : [];
  const inbox = data ? buildQuestionInbox(data.tasks, data.jobs) : null;
  return (
    <Command.Dialog open={open} onOpenChange={onOpenChange} label="Command palette" className="fixed left-1/2 top-[12vh] z-50 w-[calc(100%-24px)] max-w-xl -translate-x-1/2 overflow-hidden rounded-card border border-line bg-surface shadow-2xl" overlayClassName="fixed inset-0 z-40 bg-black/30">
      <Command.Input placeholder="Jump to a page, application or question…" className="h-12 w-full border-b border-line px-4 text-[14px] outline-none" />
      <Command.List className="max-h-[50vh] overflow-y-auto p-2">
        <Command.Empty className="p-4 text-center text-muted">No matches.</Command.Empty>
        <Command.Group heading="Actions" className="text-[11px] text-faint [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1">
          <PItem onSelect={() => go('/mail?compose=1')}>Compose mail</PItem>
          <PItem onSelect={() => go('/discover')}>Find new roles</PItem>
        </Command.Group>
        <Command.Group heading="Pages" className="text-[11px] text-faint [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1">
          {allItems.map(i => <PItem key={i.to} onSelect={() => go(i.to)}>{i.label}</PItem>)}
        </Command.Group>
        {rows.length > 0 && <Command.Group heading="Applications" className="text-[11px] text-faint [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1">{rows.map(r => <PItem key={r.id} value={`${r.job.company} ${r.job.role}`} onSelect={() => go(`/applications/${r.id}`)}>{r.job.company} · {r.job.role}</PItem>)}</Command.Group>}
        {inbox && inbox.groups.length > 0 && <Command.Group heading="Questions" className="text-[11px] text-faint [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1">{inbox.groups.slice(0, 20).map(g => <PItem key={g.key} value={`question ${g.label}`} onSelect={() => go('/questions')}>{g.label}</PItem>)}</Command.Group>}
      </Command.List>
    </Command.Dialog>
  );
}
const PItem = ({ children, ...p }: any) => <Command.Item {...p} className="flex min-h-10 cursor-pointer items-center rounded-control px-2 text-[13.5px] text-ink data-[selected=true]:bg-brand-soft data-[selected=true]:text-brand">{children}</Command.Item>;
