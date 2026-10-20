import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Empty } from './components/ui';
import { homeFor, RequireAuth, useAuth } from './lib/auth';
import { ActivityPage } from './pages/Admin';
import { OwnersPage } from './pages/Owners';
import { PeoplePage } from './pages/People';
import { ForgotPasswordPage, LoginPage, SetPasswordPage } from './pages/AuthPages';
import { DashboardPage } from './pages/Dashboard';
import { ExpensesPage } from './pages/Expenses';
import { LeaseDetailPage, LeasesPage, NewLeasePage } from './pages/Leases';
import { MaintenancePage } from './pages/Maintenance';
import { PortalHome, PortalLayout, PortalProfile, PortalRent, PortalRequests } from './pages/Portal';
import { PropertiesPage } from './pages/Properties';
import { PropertyDetailPage } from './pages/PropertyDetail';
import { RentPage } from './pages/Rent';
import { ReportsPage } from './pages/Reports';
import { TenantDetailPage, TenantsPage } from './pages/Tenants';
import { UnitDetailPage } from './pages/UnitDetail';

function Home() {
  const { me } = useAuth();
  if (me && !me.permissions.includes('dashboard:read')) return <Navigate to={homeFor(me)} replace />;
  return <DashboardPage />;
}

function NotFound() {
  return <Empty title="Page not found" action={<Link className="btn primary" to="/">Go to dashboard</Link>}>The link may be old or mistyped.</Empty>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/accept-invite" element={<SetPasswordPage mode="invite" />} />
      <Route path="/reset-password" element={<SetPasswordPage mode="reset" />} />

      <Route
        path="/portal"
        element={
          <RequireAuth area="portal">
            <PortalLayout />
          </RequireAuth>
        }
      >
        <Route index element={<PortalHome />} />
        <Route path="rent" element={<PortalRent />} />
        <Route path="requests" element={<PortalRequests />} />
        <Route path="profile" element={<PortalProfile />} />
      </Route>

      <Route
        element={
          <RequireAuth area="app">
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Home />} />
        <Route path="properties" element={<RequireAuth area="app" permission="properties:read"><PropertiesPage /></RequireAuth>} />
        <Route path="properties/:id" element={<RequireAuth area="app" permission="properties:read"><PropertyDetailPage /></RequireAuth>} />
        <Route path="units/:id" element={<RequireAuth area="app" permission="properties:read"><UnitDetailPage /></RequireAuth>} />
        <Route path="tenants" element={<RequireAuth area="app" permission="tenants:read"><TenantsPage /></RequireAuth>} />
        <Route path="tenants/:id" element={<RequireAuth area="app" permission="tenants:read"><TenantDetailPage /></RequireAuth>} />
        <Route path="leases" element={<RequireAuth area="app" permission="leases:read"><LeasesPage /></RequireAuth>} />
        <Route path="leases/new" element={<RequireAuth area="app" permission="leases:write"><NewLeasePage /></RequireAuth>} />
        <Route path="leases/:id" element={<RequireAuth area="app" permission="leases:read"><LeaseDetailPage /></RequireAuth>} />
        <Route path="rent" element={<RequireAuth area="app" permission="rent:read"><RentPage /></RequireAuth>} />
        <Route path="maintenance" element={<RequireAuth area="app" permission="maintenance:read"><MaintenancePage /></RequireAuth>} />
        <Route path="expenses" element={<RequireAuth area="app" permission="expenses:read"><ExpensesPage /></RequireAuth>} />
        <Route path="reports" element={<RequireAuth area="app" permission="reports:read"><ReportsPage /></RequireAuth>} />
        <Route path="owners" element={<RequireAuth area="app" permission="owners:write"><OwnersPage /></RequireAuth>} />
        <Route path="users" element={<RequireAuth area="app" permission="team:manage"><PeoplePage /></RequireAuth>} />
        <Route path="activity" element={<RequireAuth area="app" permission="activity:read"><ActivityPage /></RequireAuth>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
