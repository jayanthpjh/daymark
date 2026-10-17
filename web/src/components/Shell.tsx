import { AgentPanel } from './AgentPanel';
import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import * as Dialog from '@radix-ui/react-dialog';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { Bell, Moon, Sun, SunMoon, BriefcaseBusiness, CalendarDays, ChevronsLeft, ChevronsRight, Compass, FolderOpen, Gauge, KanbanSquare, LayoutDashboard, Mail as MailIcon, Menu, MessageSquareMore, Search, Server, X } from 'lucide-react';
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
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('dm.nav') === '1'; } catch { return false; } });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const loc = useLocation();
  const navigate = useNavigate();
  useEffect(() => setMobileOpen(false), [loc.pathname]);
  useEffect(() => { try { localStorage.setItem('dm.nav', collapsed ? '1' : '0'); } catch { /* private mode */ } }, [collapsed]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(o => !o); } };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, []);

  const questionCount = useMemo(() => data ? buildQuestionInbox(data.tasks, data.jobs).counts.questions : 0, [data]);
  const alerts = useMemo(() => data ? needsYou(data) : [], [data]);
  const queued = data?.tasks?.filter(t => t.status === 'queued').length ?? 0;
  const running = data?.tasks?.filter(t => t.status === 'running').length ?? 0;
  const workerOk = data?.worker?.status === 'ready';

  const nav = (isDrawer: boolean) => (
    <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 py-4">
      {groups.map(g => (
        <div key={g.label} className="mb-5">
          <div className={cn('px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-faint', collapsed && !isDrawer && 'sr-only')}>{g.label}</div>
          {g.items.map(i => {
            const count = i.badge === 'questions' ? questionCount : 0;
            return (
              <NavLink key={i.to} to={i.to} end={i.end} title={collapsed && !isDrawer ? i.label : undefined}
                className={({ isActive }) => cn('mb-1 flex h-10 items-center gap-3 rounded-control px-3 text-[13.5px] font-medium transition-colors', isActive ? 'bg-brand text-on-brand shadow-sm' : 'text-muted hover:bg-surface/80 hover:text-ink', collapsed && !isDrawer && 'justify-center px-0')}>
                <i.icon size={17} aria-hidden /><span className={cn(collapsed && !isDrawer && 'sr-only')}>{i.label}</span>
                {count > 0 && (!collapsed || isDrawer) && <span className="ml-auto rounded-full bg-surface px-1.5 text-[11px] text-brand ring-1 ring-brand/15">{count}</span>}
              </NavLink>
            );
          })}
        </div>
      ))}
    </nav>
  );
  const brand = <div className="flex min-h-20 items-center gap-3 border-b border-brand/10 px-4 py-4"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-card bg-brand text-lg font-bold text-on-brand shadow-sm" aria-hidden>D</span><div className={cn('min-w-0', collapsed && 'md:sr-only')}><span className="block text-lg font-semibold tracking-tight">Daymark</span><span className="block text-xs text-muted">A little closer to your next role.</span></div></div>;
  const searchSummary = <div className="mx-3 mb-3 rounded-card border border-brand/15 bg-surface/80 p-3">
    <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-brand"><BriefcaseBusiness size={14} aria-hidden />YOUR SEARCH</div>
    <p className="text-sm font-semibold">{data ? `${applicationRows(data).length} applications in view` : 'Loading your applications…'}</p>
    <p className="mt-1 text-xs leading-relaxed text-muted">{alerts.length ? `${alerts.length} applications need your attention. Pick up where you left off.` : 'Your next steps will appear here when an application needs attention.'}</p>
    <NavLink to={alerts[0]?.href || '/discover'} className="mt-3 inline-flex min-h-9 items-center gap-2 text-sm font-semibold text-brand hover:underline">{alerts.length ? 'Review next step' : 'Explore opportunities'}<ChevronsRight size={14} aria-hidden /></NavLink>
  </div>;

  return (
    <AgentPanel><div className="flex h-full">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:bg-surface focus:p-2">Skip to main content</a>
      <aside className={cn('hidden shrink-0 flex-col border-r border-brand/15 bg-muted-surface md:flex', collapsed ? 'w-16' : 'w-[248px]')}>
        {brand}{nav(false)}{!collapsed && searchSummary}
        <div className="border-t border-brand/10 p-3"><Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => setCollapsed(c => !c)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{collapsed ? <ChevronsRight size={16} /> : <><ChevronsLeft size={16} />Collapse</>}</Button></div>
      </aside>

      <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 md:hidden" />
          <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col bg-muted-surface shadow-xl md:hidden">
            <Dialog.Title className="sr-only">Navigation</Dialog.Title><Dialog.Description className="sr-only">Main navigation</Dialog.Description>
            <div className="flex items-center justify-between pr-2">{brand}<Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Close navigation"><X size={18} /></Button></Dialog.Close></div>
            {nav(true)}{searchSummary}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-3 md:px-5">
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={18} /></Button>
          <button type="button" onClick={() => setPaletteOpen(true)} className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-control border border-line bg-bg px-3 text-left text-faint md:max-w-md" aria-label="Search or jump to (Command K)">
            <Search size={15} aria-hidden /><span className="truncate">Search applications, questions, mail…</span><kbd className="ml-auto hidden rounded border border-line bg-surface px-1.5 text-[11px] md:block">⌘K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <Badge tone={workerOk ? 'success' : 'warning'} title="Worker status"><span className={cn('h-1.5 w-1.5 rounded-full', workerOk ? 'bg-success' : 'bg-warning')} />Worker<span className="hidden sm:inline"> {data ? (workerOk ? 'ready' : data.worker?.status || 'unknown') : '…'}</span></Badge>
            <Badge className="hidden sm:inline-flex" title="Queue depth"><Gauge size={12} aria-hidden />{running} running · {queued} queued</Badge>
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
        <main id="main" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto focus:outline-none"><div className="mx-auto w-full max-w-[1240px] px-4 py-5 md:px-6 md:py-6"><Outlet /></div></main>
      </div>
      <Palette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div></AgentPanel>
  );
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
          {groups.flatMap(g => g.items).map(i => <PItem key={i.to} onSelect={() => go(i.to)}>{i.label}</PItem>)}
        </Command.Group>
        {rows.length > 0 && <Command.Group heading="Applications" className="text-[11px] text-faint [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1">{rows.map(r => <PItem key={r.id} value={`${r.job.company} ${r.job.role}`} onSelect={() => go(`/applications/${r.id}`)}>{r.job.company} · {r.job.role}</PItem>)}</Command.Group>}
        {inbox && inbox.groups.length > 0 && <Command.Group heading="Questions" className="text-[11px] text-faint [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1">{inbox.groups.slice(0, 20).map(g => <PItem key={g.key} value={`question ${g.label}`} onSelect={() => go('/questions')}>{g.label}</PItem>)}</Command.Group>}
      </Command.List>
    </Command.Dialog>
  );
}
const PItem = ({ children, ...p }: any) => <Command.Item {...p} className="flex min-h-10 cursor-pointer items-center rounded-control px-2 text-[13.5px] text-ink data-[selected=true]:bg-brand-soft data-[selected=true]:text-brand">{children}</Command.Item>;
