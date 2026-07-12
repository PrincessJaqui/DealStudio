import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner@2.0.3';
import { LandingScreen } from './components/screens/LandingScreen';
import { InvestorDealStudioScreen } from './components/screens/InvestorDealStudioScreen';
import { DealStudioScreen } from './components/screens/DealStudioScreen';
import { AdminGate } from './components/dealstudio/AdminGate';

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<LandingScreen />} />
        <Route path="/dealstudio" element={<InvestorDealStudioScreen />} />
        <Route path="/investors" element={<InvestorDealStudioScreen />} />
        <Route path="/admin" element={<AdminGate><DealStudioScreen /></AdminGate>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster position="top-center" richColors />
    </>
  );
}
