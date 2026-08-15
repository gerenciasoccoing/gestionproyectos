import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import ProjectsListPage from './pages/ProjectsListPage';
import ProjectLayout from './pages/ProjectLayout';

import ContractualPage from './pages/contractual/ContractualPage';

import ExecutionLayout from './pages/execution/ExecutionLayout';
import ExecutionDashboardPage from './pages/execution/ExecutionDashboardPage';
import MinutesPage from './pages/execution/MinutesPage';
import MilestonesPage from './pages/execution/MilestonesPage';
import BudgetProgressPage from './pages/execution/BudgetProgressPage';
import PurchaseOrdersPage from './pages/execution/PurchaseOrdersPage';

import PersonnelListPage from './pages/personnel/PersonnelListPage';
import EmployeeDetailPage from './pages/personnel/EmployeeDetailPage';

import ExpensesPage from './pages/expenses/ExpensesPage';
import ReportsPage from './pages/reports/ReportsPage';

import QuotationsListPage from './pages/quotations/QuotationsListPage';
import QuotationDetailPage from './pages/quotations/QuotationDetailPage';
import PriceBookPage from './pages/quotations/PriceBookPage';
import ApuPage from './pages/quotations/ApuPage';

import ThirdPartiesPage from './pages/thirdparties/ThirdPartiesPage';

import InventoryLayout from './pages/inventory/InventoryLayout';
import InventoryCatalogPage from './pages/inventory/InventoryCatalogPage';
import InventoryCheckoutsPage from './pages/inventory/InventoryCheckoutsPage';

import AdminLayout from './pages/admin/AdminLayout';
import UsersPage from './pages/admin/UsersPage';
import RolesPage from './pages/admin/RolesPage';
import LaborParametersPage from './pages/admin/LaborParametersPage';
import CompanySettingsPage from './pages/admin/CompanySettingsPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<ProjectsListPage />} />

        <Route path="quotations" element={<QuotationsListPage />} />
        <Route path="quotations/:id" element={<QuotationDetailPage />} />
        <Route path="price-book" element={<PriceBookPage />} />
        <Route path="apus" element={<ApuPage />} />
        <Route path="third-parties" element={<ThirdPartiesPage />} />

        <Route path="inventory" element={<ProtectedRoute module="inventario" action="view"><InventoryLayout /></ProtectedRoute>}>
          <Route index element={<Navigate to="catalog" replace />} />
          <Route path="catalog" element={<InventoryCatalogPage />} />
          <Route path="checkouts" element={<InventoryCheckoutsPage />} />
        </Route>

        <Route path="admin" element={<ProtectedRoute module="admin" action="view"><AdminLayout /></ProtectedRoute>}>
          <Route index element={<Navigate to="users" replace />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="roles" element={<RolesPage />} />
          <Route path="labor-parameters" element={<LaborParametersPage />} />
          <Route path="company" element={<CompanySettingsPage />} />
        </Route>

        <Route path="projects/:projectId" element={<ProjectLayout />}>
          <Route index element={<Navigate to="contractual" replace />} />
          <Route path="contractual" element={<ContractualPage />} />

          <Route path="execution" element={<ExecutionLayout />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<ExecutionDashboardPage />} />
            <Route path="minutes" element={<MinutesPage />} />
            <Route path="milestones" element={<MilestonesPage />} />
            <Route path="progress" element={<BudgetProgressPage />} />
            <Route path="purchase-orders" element={<PurchaseOrdersPage />} />
          </Route>

          <Route path="personnel" element={<PersonnelListPage />} />
          <Route path="personnel/:employeeId" element={<EmployeeDetailPage />} />

          <Route path="expenses" element={<ExpensesPage />} />
          <Route path="reports" element={<ReportsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
