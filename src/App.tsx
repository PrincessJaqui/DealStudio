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

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<InvestorDealStudioScreen />} />
        <Route path="/dealstudio" element={<InvestorDealStudioScreen />} />
        <Route path="/admin" element={<DealStudioScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster position="top-center" richColors />
    </>
  );
}
