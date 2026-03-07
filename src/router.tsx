import { createBrowserRouter, Navigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { lazy, Suspense } from 'react';
import { Loading } from '@/components/ui';

// Lazy load all pages for code splitting
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const ClientList = lazy(() => import('@/pages/clients/ClientList'));
const ClientDetail = lazy(() => import('@/pages/clients/ClientDetail'));
const AgentList = lazy(() => import('@/pages/agents/AgentList'));
const AgentDetail = lazy(() => import('@/pages/agents/AgentDetail'));
const TicketList = lazy(() => import('@/pages/tickets/TicketList'));
const TicketDetail = lazy(() => import('@/pages/tickets/TicketDetail'));
const LogViewer = lazy(() => import('@/pages/logs/LogViewer'));
const DeployTokens = lazy(() => import('@/pages/deploy/DeployTokens'));
const SoftwareHome = lazy(() => import('@/pages/software/SoftwareHome'));
const SoftwareInventory = lazy(() => import('@/pages/software/SoftwareInventory'));
const SoftwareAutomation = lazy(() => import('@/pages/software/SoftwareAutomation'));
const SoftwareStore = lazy(() => import('@/pages/software/SoftwareStore'));
const BrandingSettings = lazy(() => import('@/pages/settings/BrandingSettings'));
const WorkflowSettings = lazy(() => import('@/pages/settings/WorkflowSettings'));
const DepartmentSettings = lazy(() => import('@/pages/settings/DepartmentSettings'));
const WorkflowProfileSettings = lazy(() => import('@/pages/settings/WorkflowProfileSettings'));
const ConfigurationSettings = lazy(() => import('@/pages/settings/ConfigurationSettings'));
const ServerConfigurationPage = lazy(() => import('@/pages/settings/ServerConfigurationPage'));
const ClientConfigurationPage = lazy(() => import('@/pages/settings/ClientConfigurationPage'));
const SiteConfigurationPage = lazy(() => import('@/pages/settings/SiteConfigurationPage'));
const ConfigurationAudit = lazy(() => import('@/pages/settings/ConfigurationAudit'));
const ReportTemplateList = lazy(() => import('@/pages/reports/ReportTemplateList'));
const ReportTemplateForm = lazy(() => import('@/pages/reports/ReportTemplateForm'));
const RunReport = lazy(() => import('@/pages/reports/RunReport'));
const ReportExecutionList = lazy(() => import('@/pages/reports/ReportExecutionList'));

function LazyPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<Loading />}>{children}</Suspense>;
}

export const router = createBrowserRouter([
  {
    path: '/',
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
        path: 'clients/:id',
        element: <LazyPage><ClientDetail /></LazyPage>,
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
        element: <LazyPage><SoftwareAutomation /></LazyPage>,
      },
      {
        path: 'software/store',
        element: <LazyPage><SoftwareStore /></LazyPage>,
      },
      {
        path: 'software-inventory',
        element: <LazyPage><SoftwareHome /></LazyPage>,
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
        path: '*',
        element: <Navigate to="/" replace />,
      },
    ],
  },
]);
