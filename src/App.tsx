/**
 * DealStudio routes.
 *   /              public landing page
 *   /d/:slug       an investor-facing deal room (public, gated by its own rules)
 *   /dealstudio    legacy alias for the default deal
 *   /investors     legacy alias for the default deal
 *   /admin         the editor for the company's default deal
 *   /admin/deals   Deal Manager: every deal the company owns
 *   /admin/d/:slug the editor for a specific deal
 */
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner@2.0.3';
import { LandingScreen } from './components/screens/LandingScreen';
import { InvestorDealStudioScreen } from './components/screens/InvestorDealStudioScreen';
import { DealStudioScreen } from './components/screens/DealStudioScreen';
import { DealManagerScreen } from './components/screens/DealManagerScreen';
import { AdminGate } from './components/dealstudio/AdminGate';
import { AdminShell } from './components/dealstudio/AdminShell';

/** Every authenticated screen shares the gate and the sidebar chrome. */
function Admin({ children }: { children: React.ReactNode }) {
  return (
    <AdminGate>
      <AdminShell>{children}</AdminShell>
    </AdminGate>
  );
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<LandingScreen />} />

        <Route path="/d/:slug" element={<InvestorDealStudioScreen />} />
        <Route path="/dealstudio" element={<InvestorDealStudioScreen />} />
        <Route path="/investors" element={<InvestorDealStudioScreen />} />

        <Route path="/admin" element={<Admin><DealStudioScreen /></Admin>} />
        <Route path="/admin/deals" element={<Admin><DealManagerScreen /></Admin>} />
        <Route path="/admin/d/:slug" element={<Admin><DealStudioScreen /></Admin>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster position="top-center" richColors />
    </>
  );
}
