import { useEffect, useState } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { useRefCapture } from './hooks/useRefCapture';
import { AdminAuthProvider } from './hooks/useAdminAuth';
import { SellerAuthProvider } from './hooks/useSellerAuth';
import SellerWelcomeModal from './components/SellerWelcomeModal';
import AccessGate from './components/AccessGate';
import { LoadingScreen } from './components/Spinner';
import { api, ApiError } from './lib/api';
import { getStoredRef, clearRef, storeRef } from './lib/referral';

import Home from './pages/Home';
import ShowsList from './pages/ShowsList';
import ProductPage from './pages/ProductPage';
import About from './pages/About';
import Faq from './pages/Faq';
import Contact from './pages/Contact';
import CheckoutReturn from './pages/CheckoutReturn';
import PixCheckoutPage from './pages/PixCheckoutPage';
import VerifyOrder from './pages/VerifyOrder';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import BottomNavPublic from './components/BottomNavPublic';

import AdminLogin from './pages/admin/AdminLogin';
import AdminLayout from './components/admin/AdminLayout';
import ProtectedRoute from './components/admin/ProtectedRoute';
import AdminDashboard from './pages/admin/AdminDashboard';
import ProductsList from './pages/admin/ProductsList';
import ProductForm from './pages/admin/ProductForm';
import BulkCapacityPage from './pages/admin/BulkCapacityPage';
import SellersList from './pages/admin/SellersList';
import SellerForm from './pages/admin/SellerForm';
import AdminsList from './pages/admin/AdminsList';
import HoldsList from './pages/admin/HoldsList';
import OrdersList from './pages/admin/OrdersList';
import OrderDetail from './pages/admin/OrderDetail';
import OrdersArchive from './pages/admin/OrdersArchive';
import SettingsPage from './pages/admin/SettingsPage';
import ContentPage from './pages/admin/ContentPage';

import SellerLogin from './pages/seller/SellerLogin';
import SellerLayout from './components/seller/SellerLayout';
import ProtectedSellerRoute from './components/seller/ProtectedSellerRoute';
import SellerDashboard from './pages/seller/SellerDashboard';
import SellerOrders from './pages/seller/SellerOrders';
import SellerCommissions from './pages/seller/SellerCommissions';
import SellerBooking from './pages/seller/SellerBooking';
import SellerNotifications from './pages/seller/SellerNotifications';
import SellerCatalog from './pages/seller/SellerCatalog';
import SellerHelp from './pages/seller/SellerHelp';
import SellerSettings from './pages/seller/SellerSettings';
import SellerArchive from './pages/seller/SellerArchive';
import ActionPage from './pages/ActionPage';
import ResetMemberPinPage from './pages/ResetMemberPinPage';

export default function App() {
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');
  const isSellerRoute = location.pathname.startsWith('/seller');
  const isActionRoute = location.pathname.startsWith('/accion/');
  const isResetPinRoute = location.pathname.startsWith('/reset-pin/');

  useEffect(() => {
    // Si venimos del selector rápido de la home con un servicio elegido (?option=),
    // no reseteamos el scroll: ProductPage lleva la vista directo a ese servicio.
    if (new URLSearchParams(location.search).has('option')) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [location.pathname]);

  if (isActionRoute) {
    return (
      <Routes>
        <Route path="/accion/:token" element={<ActionPage />} />
      </Routes>
    );
  }

  if (isResetPinRoute) {
    return (
      <Routes>
        <Route path="/reset-pin/:token" element={<ResetMemberPinPage />} />
      </Routes>
    );
  }

  if (isAdminRoute) {
    return (
      <AdminAuthProvider>
        <Routes>
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route
            path="/admin"
            element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}
          >
            <Route index element={<AdminDashboard />} />
            <Route path="products" element={<ProductsList />} />
            <Route path="products/new" element={<ProductForm />} />
            <Route path="products/bulk-capacity" element={<BulkCapacityPage />} />
            <Route path="products/:id" element={<ProductForm />} />
            <Route path="sellers" element={<SellersList />} />
            <Route path="sellers/new" element={<SellerForm />} />
            <Route path="sellers/:id" element={<SellerForm />} />
            <Route path="admins" element={<AdminsList />} />
            <Route path="holds" element={<HoldsList />} />
            <Route path="orders" element={<OrdersList />} />
            <Route path="orders/archivo" element={<OrdersArchive />} />
            <Route path="orders/:publicId" element={<OrderDetail />} />
            <Route path="content" element={<ContentPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </AdminAuthProvider>
    );
  }

  if (isSellerRoute) {
    return (
      <SellerAuthProvider>
        <Routes>
          <Route path="/seller/login" element={<SellerLogin />} />
          <Route
            path="/seller"
            element={<ProtectedSellerRoute><SellerLayout /></ProtectedSellerRoute>}
          >
            <Route index element={<SellerDashboard />} />
            <Route path="catalogo" element={<SellerCatalog />} />
            <Route path="ventas" element={<SellerOrders />} />
            <Route path="liquidaciones" element={<SellerCommissions />} />
            <Route path="nueva-reserva" element={<SellerBooking />} />
            <Route path="notificaciones" element={<SellerNotifications />} />
            <Route path="archivo" element={<SellerArchive />} />
            <Route path="configuracion" element={<SellerSettings />} />
            <Route path="ayuda" element={<SellerHelp />} />
          </Route>
        </Routes>
      </SellerAuthProvider>
    );
  }

  return <PublicApp />;
}

function MaintenanceScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-ink px-6 text-center">
      <p className="text-5xl mb-6">🔧</p>
      <h1 className="font-display text-3xl md:text-4xl text-cream mb-3">Sitio en mantenimiento</h1>
      <p className="text-cream/60 max-w-sm text-sm leading-relaxed">
        Estamos realizando tareas de mantenimiento. Volvemos en breve.
      </p>
      <p className="mt-6 text-xs text-cream/30 uppercase tracking-widest">Tangos y Milongas Tickets</p>
    </div>
  );
}

type GateState = 'checking' | 'ok' | 'missing' | 'invalid';

function PublicApp() {
  const { freshCode, freshTick } = useRefCapture();
  const location = useLocation();
  const [welcomeCode, setWelcomeCode] = useState<string | null>(null);
  const [gate, setGate] = useState<GateState>('checking');
  const [maintenance, setMaintenance] = useState<boolean>(false);

  useEffect(() => {
    if (freshCode) setWelcomeCode(freshCode);
  }, [freshCode, freshTick]);

  // Chequeo de modo mantenimiento (fail open: si falla la llamada, el sitio sigue visible).
  useEffect(() => {
    api.status.maintenance()
      .then((s) => setMaintenance(s.maintenance))
      .catch(() => {});
  }, []);

  // Exclusividad de venta: solo se accede con el código de un vendedor activo.
  useEffect(() => {
    const code = getStoredRef();
    if (!code) { setGate('missing'); return; }
    let cancelled = false;
    setGate('checking');
    api.checkout.sellerInfo(code)
      .then(() => { if (!cancelled) setGate('ok'); })
      .catch((err) => {
        if (cancelled) return;
        // 404 (no existe) o 410 (inactivo) => código inválido: limpiamos y bloqueamos.
        if (err instanceof ApiError && (err.status === 404 || err.status === 410)) {
          clearRef();
          setGate('invalid');
        } else {
          // Ante cualquier otro error bloqueamos igual (fail closed).
          setGate('missing');
        }
      });
    return () => { cancelled = true; };
  }, [freshTick]);

  // Los retornos de pago (/checkout/*) siempre pasan, para no atrapar al que vuelve de MP.
  // La verificación (/verificar/*) también: la abre la casa de tango desde el QR del
  // voucher, no tiene por qué tener un código de vendedor guardado.
  const isCheckoutReturn = location.pathname.startsWith('/checkout');
  const isVerifyPage = location.pathname.startsWith('/verificar');
  if (!isCheckoutReturn && !isVerifyPage) {
    if (maintenance) return <MaintenanceScreen />;
    if (gate === 'checking') return <LoadingScreen />;
    if (gate === 'missing' || gate === 'invalid') {
      return (
        <AccessGate
          reason={gate === 'invalid' ? 'invalid' : 'missing'}
          onValid={(code) => { storeRef(code); setWelcomeCode(code); setGate('ok'); }}
        />
      );
    }
  }

  return (
    <div className="min-h-screen flex flex-col pb-24 md:pb-0">
      <Navbar />
      <main className="flex-1">
        <div key={location.pathname} className="animate-page-enter">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/shows" element={<ShowsList />} />
            <Route path="/shows/:slug" element={<ProductPage />} />
            <Route path="/nosotros" element={<About />} />
            <Route path="/preguntas-frecuentes" element={<Faq />} />
            <Route path="/contacto" element={<Contact />} />
            <Route path="/verificar/:publicId" element={<VerifyOrder />} />
            <Route path="/checkout/pix" element={<PixCheckoutPage />} />
            <Route path="/checkout/success" element={<CheckoutReturn variant="success" />} />
            <Route path="/checkout/pending" element={<CheckoutReturn variant="pending" />} />
            <Route path="/checkout/failure" element={<CheckoutReturn variant="failure" />} />
            <Route path="/checkout/cash" element={<CheckoutReturn variant="cash" />} />
          </Routes>
        </div>
      </main>
      <Footer />
      {welcomeCode && (
        <SellerWelcomeModal code={welcomeCode} onClose={() => setWelcomeCode(null)} />
      )}
      <BottomNavPublic />
    </div>
  );
}
