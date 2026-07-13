/**
 * DealStudio routes.
 *   /              public landing page
 *   /d/:slug       an investor-facing deal room (public, gated by its own rules)
 *   /dealstudio    legacy alias for the default deal
 *   /investors     legacy alias for the default deal
 *   /admin         the editor for the company's default deal
 *   /admin/d/:slug the editor for a specific deal
 */
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner@2.0.3';
import { LandingScreen } from './components/screens/LandingScreen';
import { InvestorDealStudioScreen } from './components/screens/InvestorDealStudioScreen';
import { DealStudioScreen } from './components/screens/DealStudioScreen';
import { InterfaceStudioScreen } from './components/screens/InterfaceStudioScreen';
import { SystemSettingsScreen } from './components/screens/SystemSettingsScreen';
import { BillingScreen } from './components/screens/BillingScreen';
import { MasterAdminScreen } from './components/screens/MasterAdminScreen';
import { SignupScreen } from './components/screens/SignupScreen';
import { ResetPasswordScreen } from './components/screens/ResetPasswordScreen';
import { TermsScreen } from './components/screens/TermsScreen';
import { PrivacyScreen } from './components/screens/PrivacyScreen';
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
        <Route path="/signup" element={<SignupScreen />} />
        {/* People type /login. /admin already shows the sign-in form when signed
            out and the dashboard when signed in, so redirect rather than render a
            bare gate, which would be a blank page for anyone already signed in. */}
        <Route path="/login" element={<Navigate to="/admin" replace />} />
        <Route path="/reset-password" element={<ResetPasswordScreen />} />
        <Route path="/terms" element={<TermsScreen />} />
        <Route path="/privacy" element={<PrivacyScreen />} />

        <Route path="/d/:slug" element={<InvestorDealStudioScreen />} />
        <Route path="/dealstudio" element={<InvestorDealStudioScreen />} />
        <Route path="/investors" element={<InvestorDealStudioScreen />} />

        <Route path="/admin" element={<Admin><DealStudioScreen /></Admin>} />
        <Route path="/admin/d/:slug" element={<Admin><DealStudioScreen /></Admin>} />
        <Route path="/admin/interface" element={<Admin><InterfaceStudioScreen /></Admin>} />
        <Route path="/admin/settings" element={<Admin><SystemSettingsScreen /></Admin>} />
        <Route path="/admin/billing" element={<Admin><BillingScreen /></Admin>} />
        <Route path="/admin/master" element={<Admin><MasterAdminScreen /></Admin>} />

        {/* The company handle route: dealstudio.io/{handle}/{deck}.
            It sits last on purpose. React Router ranks static segments above
            dynamic ones, so /admin/settings still wins over /:handle/:deck, and the
            reserved-word list in SQL means no company can take a handle that
            would shadow a real route anyway. Belt and braces, because getting
            this wrong locks someone out of /admin. */}
        <Route path="/:handle/:deck" element={<InvestorDealStudioScreen />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster position="top-center" richColors />
    </>
  );
}
