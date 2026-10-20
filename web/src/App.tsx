import { lazy, Suspense, type ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Shell } from '@/components/Shell';
import { EmptyState, SkeletonRows } from '@/components/ui/primitives';

const Overview = lazy(() => import('@/screens/Overview').then((m) => ({ default: m.Overview })));
const Applications = lazy(() => import('@/screens/Applications').then((m) => ({ default: m.Applications })));
const Workspace = lazy(() => import('@/screens/Workspace').then((m) => ({ default: m.Workspace })));
const Questions = lazy(() => import('@/screens/Questions').then((m) => ({ default: m.Questions })));
const JobDetail = lazy(() => import('@/screens/JobDetail').then((m) => ({ default: m.JobDetail })));
const Discover = lazy(() => import('@/screens/Discover').then((m) => ({ default: m.Discover })));
const Mail = lazy(() => import('@/screens/Mail').then((m) => ({ default: m.Mail })));
const Calendar = lazy(() => import('@/screens/Calendar').then((m) => ({ default: m.Calendar })));
const Tracker = lazy(() => import('@/screens/Tracker').then((m) => ({ default: m.Tracker })));
const Materials = lazy(() => import('@/screens/Materials').then((m) => ({ default: m.Materials })));
const System = lazy(() => import('@/screens/System').then((m) => ({ default: m.System })));

function Screen({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div className="p-5"><SkeletonRows rows={6} /></div>}>{children}</Suspense>;
}

export function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Screen><Overview /></Screen>} />
        <Route path="applications" element={<Screen><Applications /></Screen>} />
        <Route path="applications/:jobId" element={<Screen><Workspace /></Screen>} />
        <Route path="questions" element={<Screen><Questions /></Screen>} />
        <Route path="discover" element={<Screen><Discover /></Screen>} />
        <Route path="discover/:jobId" element={<Screen><JobDetail /></Screen>} />
        <Route path="mail" element={<Screen><Mail /></Screen>} />
        <Route path="calendar" element={<Screen><Calendar /></Screen>} />
        <Route path="tracker" element={<Screen><Tracker /></Screen>} />
        <Route path="materials" element={<Screen><Materials /></Screen>} />
        <Route path="system" element={<Screen><System /></Screen>} />
        <Route path="*" element={<EmptyState title="Page not found" description="That page does not exist. Use the sidebar to get back on track." />} />
      </Route>
    </Routes>
  );
}
