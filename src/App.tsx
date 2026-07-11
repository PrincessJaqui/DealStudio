/**
 * DealStudio — standalone deal studio.
 *   /            investor-facing deal studio (public, gated by access rules)
 *   /dealstudio    same as /
 *   /admin       admin editor + investor pipeline (requires an authenticated admin)
 */
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner@2.0.3';
import { InvestorDealStudioScreen } from './components/screens/InvestorDealStudioScreen';
import { DealStudioScreen } from './components/screens/DealStudioScreen';
import { AdminGate } from './components/dealstudio/AdminGate';

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<InvestorDealStudioScreen />} />
        <Route path="/dealstudio" element={<InvestorDealStudioScreen />} />
        <Route path="/admin" element={<AdminGate><DealStudioScreen /></AdminGate>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster position="top-center" richColors />
    </>
  );
}
