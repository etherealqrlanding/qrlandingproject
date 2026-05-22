import { useEffect, useState } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { useRefCapture } from './hooks/useRefCapture';
import { AdminAuthProvider } from './hooks/useAdminAuth';
import { SellerAuthProvider } from './hooks/useSellerAuth';
import SellerWelcomeModal from './components/SellerWelcomeModal';

import Home from './pages/Home';
import ShowsList from './pages/ShowsList';
import ProductPage from './pages/ProductPage';
import CheckoutReturn from './pages/CheckoutReturn';
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
import OrdersList from './pages/admin/OrdersList';
import OrderDetail from './pages/admin/OrderDetail';
import SettingsPage from './pages/admin/SettingsPage';

import SellerLogin from './pages/seller/SellerLogin';
import SellerLayout from './components/seller/SellerLayout';
import ProtectedSellerRoute from './components/seller/ProtectedSellerRoute';
import SellerDashboard from './pages/seller/SellerDashboard';
import SellerOrders from './pages/seller/SellerOrders';
import SellerCommissions from './pages/seller/SellerCommissions';
import SellerBooking from './pages/seller/SellerBooking';
import SellerNotifications from './pages/seller/SellerNotifications';
import SellerCatalog from './pages/seller/SellerCatalog';

export default function App() {
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');
  const isSellerRoute = location.pathname.startsWith('/seller');

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
            <Route path="orders" element={<OrdersList />} />
            <Route path="orders/:publicId" element={<OrderDetail />} />
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
          </Route>
        </Routes>
      </SellerAuthProvider>
    );
  }

  return <PublicApp />;
}

function PublicApp() {
  const { freshCode, freshTick } = useRefCapture();
  const [welcomeCode, setWelcomeCode] = useState<string | null>(null);

  useEffect(() => {
    if (freshCode) setWelcomeCode(freshCode);
  }, [freshCode, freshTick]);

  return (
    <div className="min-h-screen flex flex-col pb-16 md:pb-0">
      <Navbar />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/shows" element={<ShowsList />} />
          <Route path="/shows/:slug" element={<ProductPage />} />
          <Route path="/checkout/success" element={<CheckoutReturn variant="success" />} />
          <Route path="/checkout/pending" element={<CheckoutReturn variant="pending" />} />
          <Route path="/checkout/failure" element={<CheckoutReturn variant="failure" />} />
          <Route path="/checkout/cash" element={<CheckoutReturn variant="cash" />} />
        </Routes>
      </main>
      <Footer />
      {welcomeCode && (
        <SellerWelcomeModal code={welcomeCode} onClose={() => setWelcomeCode(null)} />
      )}
      <BottomNavPublic />
    </div>
  );
}
