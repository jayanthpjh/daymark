import { Route, Routes } from 'react-router-dom';
import { Shell } from '@/components/Shell';
import { Overview } from '@/screens/Overview';
import { Applications } from '@/screens/Applications';
import { Workspace } from '@/screens/Workspace';
import { Questions } from '@/screens/Questions';
import { JobDetail } from '@/screens/JobDetail';
import { Discover } from '@/screens/Discover';
import { Mail } from '@/screens/Mail';
import { Calendar } from '@/screens/Calendar';
import { Tracker } from '@/screens/Tracker';
import { Materials } from '@/screens/Materials';
import { System } from '@/screens/System';
import { EmptyState } from '@/components/ui/primitives';

export function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Overview />} />
        <Route path="applications" element={<Applications />} />
        <Route path="applications/:jobId" element={<Workspace />} />
        <Route path="questions" element={<Questions />} />
        <Route path="discover" element={<Discover />} />
        <Route path="discover/:jobId" element={<JobDetail />} />
        <Route path="mail" element={<Mail />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="tracker" element={<Tracker />} />
        <Route path="materials" element={<Materials />} />
        <Route path="system" element={<System />} />
        <Route path="*" element={<EmptyState title="Page not found" description="That page does not exist. Use the sidebar to get back on track." />} />
      </Route>
    </Routes>
  );
}
