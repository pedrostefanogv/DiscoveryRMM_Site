import { createBrowserRouter, Navigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { lazy, Suspense } from 'react';
import { Loading } from '@/components/ui';
import { ErrorPage } from '@/components/ErrorPage';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { PublicOnlyAuth, RequireAuth } from '@/auth/AuthGuards';

// Lazy load all pages for code splitting
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const ClientList = lazy(() => import('@/pages/clients/ClientList'));
const ClientDetail = lazy(() => import('@/pages/clients/ClientDetail'));
const SiteList = lazy(() => import('@/pages/clients/SiteList'));
const SiteDetail = lazy(() => import('@/pages/clients/SiteDetail'));
const AgentList = lazy(() => import('@/pages/agents/AgentList'));
const AgentDetail = lazy(() => import('@/pages/agents/AgentDetail'));
const TicketList = lazy(() => import('@/pages/tickets/TicketList'));
const TicketDetail = lazy(() => import('@/pages/tickets/TicketDetail'));
const LogViewer = lazy(() => import('@/pages/logs/LogViewer'));
const DeployTokens = lazy(() => import('@/pages/deploy/DeployTokens'));
const SoftwareHome = lazy(() => import('@/pages/software/SoftwareHome'));
const SoftwareInventory = lazy(() => import('@/pages/software/SoftwareInventory'));
const SoftwareStore = lazy(() => import('@/pages/software/SoftwareStore'));
const AutomationHome = lazy(() => import('@/pages/automation/AutomationHome'));
const AutomationScriptsPage = lazy(() => import('@/pages/automation/AutomationScriptsPage'));
const AutomationTasksPage = lazy(() => import('@/pages/automation/AutomationTasksPage'));
const AutomationOperationsPage = lazy(() => import('@/pages/automation/AutomationOperationsPage'));
const AutomationAuditPage = lazy(() => import('@/pages/automation/AutomationAuditPage'));
const BrandingSettings = lazy(() => import('@/pages/settings/BrandingSettings'));
const WorkflowSettings = lazy(() => import('@/pages/settings/WorkflowSettings'));
const DepartmentSettings = lazy(() => import('@/pages/settings/DepartmentSettings'));
const WorkflowProfileSettings = lazy(() => import('@/pages/settings/WorkflowProfileSettings'));
const ConfigurationSettings = lazy(() => import('@/pages/settings/ConfigurationSettings'));
const ServerConfigurationPage = lazy(() => import('@/pages/settings/ServerConfigurationPage'));
const ClientConfigurationPage = lazy(() => import('@/pages/settings/ClientConfigurationPage'));
const SiteConfigurationPage = lazy(() => import('@/pages/settings/SiteConfigurationPage'));
const ConfigurationAudit = lazy(() => import('@/pages/settings/ConfigurationAudit'));
const AgentLabelsSettings = lazy(() => import('@/pages/settings/AgentLabelsSettings'));
const ReportTemplateList = lazy(() => import('@/pages/reports/ReportTemplateList'));
const ReportTemplateForm = lazy(() => import('@/pages/reports/ReportTemplateForm'));
const RunReport = lazy(() => import('@/pages/reports/RunReport'));
const ReportExecutionList = lazy(() => import('@/pages/reports/ReportExecutionList'));
const KnowledgeList = lazy(() => import('@/pages/knowledge/KnowledgeList'));
const KnowledgeEditor = lazy(() => import('@/pages/knowledge/KnowledgeEditor'));
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const FirstAccessPage = lazy(() => import('@/pages/auth/FirstAccessPage'));
const MfaAssertionPage = lazy(() => import('@/pages/auth/MfaAssertionPage'));
const MfaRegistrationPage = lazy(() => import('@/pages/auth/MfaRegistrationPage'));

function LazyPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<Loading />}>{children}</Suspense>;
}

export const router = createBrowserRouter([
  {
    path: '/auth',
    element: <PublicOnlyAuth />,
    errorElement: <ErrorPage />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          {
            index: true,
            element: <Navigate to="/auth/login" replace />,
          },
          {
            path: 'login',
            element: <LazyPage><LoginPage /></LazyPage>,
          },
          {
            path: 'first-access',
            element: <LazyPage><FirstAccessPage /></LazyPage>,
          },
          {
            path: 'mfa',
            element: <LazyPage><MfaAssertionPage /></LazyPage>,
          },
          {
            path: 'mfa/register',
            element: <LazyPage><MfaRegistrationPage /></LazyPage>,
          },
        ],
      },
    ],
  },
  {
    path: '/',
    element: <RequireAuth />,
    errorElement: <ErrorPage />,
    children: [
      {
        element: <MainLayout />,
        children: [
      {
        index: true,
        element: <LazyPage><Dashboard /></LazyPage>,
      },
      {
        path: 'clients',
        element: <LazyPage><ClientList /></LazyPage>,
      },
      {
        path: 'sites',
        element: <LazyPage><SiteList /></LazyPage>,
      },
      {
        path: 'clients/:id',
        element: <LazyPage><ClientDetail /></LazyPage>,
      },
      {
        path: 'clients/:id/sites/:siteId',
        element: <LazyPage><SiteDetail /></LazyPage>,
      },
      {
        path: 'agents',
        element: <LazyPage><AgentList /></LazyPage>,
      },
      {
        path: 'agents/:id',
        element: <LazyPage><AgentDetail /></LazyPage>,
      },
      {
        path: 'tickets',
        element: <LazyPage><TicketList /></LazyPage>,
      },
      {
        path: 'tickets/:id',
        element: <LazyPage><TicketDetail /></LazyPage>,
      },
      {
        path: 'logs',
        element: <LazyPage><LogViewer /></LazyPage>,
      },
      {
        path: 'deploy',
        element: <LazyPage><DeployTokens /></LazyPage>,
      },
      {
        path: 'software',
        element: <LazyPage><SoftwareHome /></LazyPage>,
      },
      {
        path: 'software/inventory',
        element: <LazyPage><SoftwareInventory /></LazyPage>,
      },
      {
        path: 'software/automation',
        element: <Navigate to="/automation" replace />,
      },
      {
        path: 'software/store',
        element: <LazyPage><SoftwareStore /></LazyPage>,
      },
      {
        path: 'software-inventory',
        element: <Navigate to="/software/inventory" replace />,
      },
      {
        path: 'automation',
        element: <LazyPage><AutomationHome /></LazyPage>,
      },
      {
        path: 'automation/scripts',
        element: <LazyPage><AutomationScriptsPage /></LazyPage>,
      },
      {
        path: 'automation/tasks',
        element: <LazyPage><AutomationTasksPage /></LazyPage>,
      },
      {
        path: 'automation/operations',
        element: <LazyPage><AutomationOperationsPage /></LazyPage>,
      },
      {
        path: 'automation/audit',
        element: <LazyPage><AutomationAuditPage /></LazyPage>,
      },
      {
        path: 'settings',
        element: <LazyPage><ConfigurationSettings /></LazyPage>,
      },
      {
        path: 'settings/server',
        element: <LazyPage><ServerConfigurationPage /></LazyPage>,
      },
      {
        path: 'settings/client',
        element: <LazyPage><ClientConfigurationPage /></LazyPage>,
      },
      {
        path: 'settings/site',
        element: <LazyPage><SiteConfigurationPage /></LazyPage>,
      },
      {
        path: 'settings/branding',
        element: <LazyPage><BrandingSettings /></LazyPage>,
      },
      {
        path: 'settings/workflow',
        element: <LazyPage><WorkflowSettings /></LazyPage>,
      },
      {
        path: 'settings/departments',
        element: <LazyPage><DepartmentSettings /></LazyPage>,
      },
      {
        path: 'settings/workflow-profiles',
        element: <LazyPage><WorkflowProfileSettings /></LazyPage>,
      },
      {
        path: 'settings/audit',
        element: <LazyPage><ConfigurationAudit /></LazyPage>,
      },
      {
        path: 'settings/agent-labels',
        element: <LazyPage><AgentLabelsSettings /></LazyPage>,
      },
      {
        path: 'reports/templates',
        element: <LazyPage><ReportTemplateList /></LazyPage>,
      },
      {
        path: 'reports/templates/new',
        element: <LazyPage><ReportTemplateForm /></LazyPage>,
      },
      {
        path: 'reports/templates/:id/edit',
        element: <LazyPage><ReportTemplateForm /></LazyPage>,
      },
      {
        path: 'reports/run',
        element: <LazyPage><RunReport /></LazyPage>,
      },
      {
        path: 'reports/executions',
        element: <LazyPage><ReportExecutionList /></LazyPage>,
      },
      {
        path: 'knowledge',
        element: <LazyPage><KnowledgeList /></LazyPage>,
      },
      {
        path: 'knowledge/new',
        element: <LazyPage><KnowledgeEditor /></LazyPage>,
      },
      {
        path: 'knowledge/:id/edit',
        element: <LazyPage><KnowledgeEditor /></LazyPage>,
      },
      {
        path: '*',
        element: <Navigate to="/" replace />,
      },
        ],
      },
    ],
  },
]);
