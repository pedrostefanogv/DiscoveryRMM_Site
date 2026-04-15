import { createBrowserRouter, Navigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { lazy, Suspense } from 'react';
import { Loading } from '@/components/ui';
import { ErrorPage } from '@/components/ErrorPage';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { PermissionGate, PublicOnlyAuth, RequireAuth } from '@/auth/AuthGuards';

// Lazy load all pages for code splitting
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const ClientList = lazy(() => import('@/pages/clients/ClientList'));
const ClientDetail = lazy(() => import('@/pages/clients/ClientDetail'));
const SiteList = lazy(() => import('@/pages/clients/SiteList'));
const SiteDetail = lazy(() => import('@/pages/clients/SiteDetail'));
const AgentList = lazy(() => import('@/pages/agents/AgentList'));
const AgentDetail = lazy(() => import('@/pages/agents/AgentDetail'));
const RemoteDebugConsole = lazy(() => import('@/pages/agents/RemoteDebugConsole'));
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
const CustomFieldsSettings = lazy(() => import('@/pages/settings/CustomFieldsSettings'));
const MeshCentralConfigurationPage = lazy(() => import('@/pages/settings/MeshCentralConfigurationPage'));
const ProfilePage = lazy(() => import('@/pages/settings/ProfilePage'));
const IamUsersPage = lazy(() => import('@/pages/settings/IamUsersPage'));
const IamGroupsPage = lazy(() => import('@/pages/settings/IamGroupsPage'));
const IamRolesPage = lazy(() => import('@/pages/settings/IamRolesPage'));
const IamMeshProfilesPage = lazy(() => import('@/pages/settings/IamMeshProfilesPage'));
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
        path: 'agents/remote-debug-console',
        element: <LazyPage><RemoteDebugConsole /></LazyPage>,
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
        element: (
          <PermissionGate anyOf={['logs.*', 'logs.read', 'admin.*']}>
            <LazyPage><LogViewer /></LazyPage>
          </PermissionGate>
        ),
      },
      {
        path: 'deploy',
        element: (
          <PermissionGate anyOf={['deploy.*', 'deploy.read', 'deployment.*', 'admin.*']}>
            <LazyPage><DeployTokens /></LazyPage>
          </PermissionGate>
        ),
      },
      {
        path: 'software',
        element: (
          <PermissionGate anyOf={['software.*', 'software.read', 'inventory.*', 'inventory.read', 'admin.*']}>
            <LazyPage><SoftwareHome /></LazyPage>
          </PermissionGate>
        ),
      },
      {
        path: 'software/inventory',
        element: (
          <PermissionGate anyOf={['software.*', 'software.read', 'inventory.*', 'inventory.read', 'admin.*']}>
            <LazyPage><SoftwareInventory /></LazyPage>
          </PermissionGate>
        ),
      },
      {
        path: 'software/automation',
        element: <Navigate to="/automation" replace />,
      },
      {
        path: 'software/store',
        element: (
          <PermissionGate anyOf={['software.*', 'software.read', 'inventory.*', 'inventory.read', 'admin.*']}>
            <LazyPage><SoftwareStore /></LazyPage>
          </PermissionGate>
        ),
      },
      {
        path: 'software-inventory',
        element: <Navigate to="/software/inventory" replace />,
      },
      {
        path: 'automation',
        element: (
          <PermissionGate anyOf={['automation.*', 'automation.read', 'admin.*']}>
            <LazyPage><AutomationHome /></LazyPage>
          </PermissionGate>
        ),
      },
      {
        path: 'automation/scripts',
        element: (
          <PermissionGate anyOf={['automation.*', 'automation.read', 'admin.*']}>
            <LazyPage><AutomationScriptsPage /></LazyPage>
          </PermissionGate>
        ),
      },
      {
        path: 'automation/tasks',
        element: (
          <PermissionGate anyOf={['automation.*', 'automation.read', 'admin.*']}>
            <LazyPage><AutomationTasksPage /></LazyPage>
          </PermissionGate>
        ),
      },
      {
        path: 'automation/operations',
        element: (
          <PermissionGate anyOf={['automation.*', 'automation.read', 'admin.*']}>
            <LazyPage><AutomationOperationsPage /></LazyPage>
          </PermissionGate>
        ),
      },
      {
        path: 'automation/audit',
        element: (
          <PermissionGate anyOf={['automation.*', 'automation.read', 'admin.*']}>
            <LazyPage><AutomationAuditPage /></LazyPage>
          </PermissionGate>
        ),
      },
      {
        path: 'settings',
        element: (
          <PermissionGate anyOf={['settings.*', 'settings.read', 'admin.*']}>
            <LazyPage><ConfigurationSettings /></LazyPage>
          </PermissionGate>
        ),
      },
      {
        path: 'settings/server',
        element: (
          <PermissionGate anyOf={['settings.*', 'settings.read', 'admin.*']}>
            <LazyPage><ServerConfigurationPage /></LazyPage>
          </PermissionGate>
        ),
      },
      {
        path: 'settings/client',
        element: (
          <PermissionGate anyOf={['settings.*', 'settings.read', 'admin.*']}>
            <LazyPage><ClientConfigurationPage /></LazyPage>
          </PermissionGate>
        ),
      },
      {
        path: 'settings/site',
        element: (
          <PermissionGate anyOf={['settings.*', 'settings.read', 'admin.*']}>
            <LazyPage><SiteConfigurationPage /></LazyPage>
          </PermissionGate>
        ),
      },
      {
        path: 'settings/branding',
        element: (
          <PermissionGate anyOf={['settings.*', 'settings.read', 'admin.*']}>
            <LazyPage><BrandingSettings /></LazyPage>
          </PermissionGate>
        ),
      },
      {
        path: 'settings/workflow',
        element: (
          <PermissionGate anyOf={['settings.*', 'settings.read', 'workflow.*', 'admin.*']}>
            <LazyPage><WorkflowSettings /></LazyPage>
          </PermissionGate>
        ),
      },
      {
        path: 'settings/departments',
        element: (
          <PermissionGate anyOf={['settings.*', 'settings.read', 'departments.*', 'admin.*']}>
            <LazyPage><DepartmentSettings /></LazyPage>
          </PermissionGate>
        ),
      },
      {
        path: 'settings/workflow-profiles',
        element: (
          <PermissionGate anyOf={['settings.*', 'settings.read', 'workflow.*', 'admin.*']}>
            <LazyPage><WorkflowProfileSettings /></LazyPage>
          </PermissionGate>
        ),
      },
      {
        path: 'settings/audit',
        element: (
          <PermissionGate anyOf={['settings.*', 'settings.read', 'admin.*']}>
            <LazyPage><ConfigurationAudit /></LazyPage>
          </PermissionGate>
        ),
      },
      {
        path: 'settings/agent-labels',
        element: (
          <PermissionGate anyOf={['settings.*', 'settings.read', 'admin.*']}>
            <LazyPage><AgentLabelsSettings /></LazyPage>
          </PermissionGate>
        ),
      },
      {
        path: 'settings/custom-fields',
        element: (
          <PermissionGate anyOf={['settings.*', 'settings.read', 'admin.*']}>
            <LazyPage><CustomFieldsSettings /></LazyPage>
          </PermissionGate>
        ),
      },
      {
        path: 'settings/mesh-central',
        element: <Navigate to="/identity/mesh-central" replace />,
      },
      {
        path: 'profile',
        element: <Navigate to="/identity/authentication" replace />,
      },
      {
        path: 'settings/security',
        element: <Navigate to="/identity/authentication" replace />,
      },
      {
        path: 'settings/iam/users',
        element: <Navigate to="/identity/users" replace />,
      },
      {
        path: 'settings/iam/groups',
        element: <Navigate to="/identity/groups" replace />,
      },
      {
        path: 'settings/iam/roles',
        element: <Navigate to="/identity/roles" replace />,
      },
      {
        path: 'settings/iam/mesh-permissions',
        element: <Navigate to="/identity/roles" replace />,
      },
      {
        path: 'identity/authentication',
        element: <LazyPage><ProfilePage /></LazyPage>,
      },
      {
        path: 'identity/users',
        element: (
          <PermissionGate anyOf={['identity.*', 'Users.View', 'Users.Edit', 'admin.*']}>
            <LazyPage><IamUsersPage /></LazyPage>
          </PermissionGate>
        ),
      },
      {
        path: 'identity/groups',
        element: (
          <PermissionGate anyOf={['identity.*', 'groups.*', 'groups.read', 'admin.*']}>
            <LazyPage><IamGroupsPage /></LazyPage>
          </PermissionGate>
        ),
      },
      {
        path: 'identity/roles',
        element: (
          <PermissionGate anyOf={['identity.*', 'roles.*', 'roles.read', 'permissions.read', 'admin.*']}>
            <LazyPage><IamRolesPage /></LazyPage>
          </PermissionGate>
        ),
      },
      {
        path: 'identity/mesh-central',
        element: (
          <PermissionGate anyOf={['identity.*', 'settings.*', 'settings.read', 'admin.*']}>
            <LazyPage><MeshCentralConfigurationPage /></LazyPage>
          </PermissionGate>
        ),
      },
      {
        path: 'identity/mesh-profiles',
        element: (
          <PermissionGate anyOf={['identity.*', 'Users.View', 'Users.Edit', 'admin.*']}>
            <LazyPage><IamMeshProfilesPage /></LazyPage>
          </PermissionGate>
        ),
      },
      {
        path: 'identity/mesh-permissions',
        element: <Navigate to="/identity/roles" replace />,
      },
      {
        path: 'reports/templates',
        element: (
          <PermissionGate anyOf={['reports.*', 'reports.read', 'admin.*']}>
            <LazyPage><ReportTemplateList /></LazyPage>
          </PermissionGate>
        ),
      },
      {
        path: 'reports/templates/new',
        element: (
          <PermissionGate anyOf={['reports.*', 'reports.read', 'admin.*']}>
            <LazyPage><ReportTemplateForm /></LazyPage>
          </PermissionGate>
        ),
      },
      {
        path: 'reports/templates/:id/edit',
        element: (
          <PermissionGate anyOf={['reports.*', 'reports.read', 'admin.*']}>
            <LazyPage><ReportTemplateForm /></LazyPage>
          </PermissionGate>
        ),
      },
      {
        path: 'reports/run',
        element: (
          <PermissionGate anyOf={['reports.*', 'reports.read', 'admin.*']}>
            <LazyPage><RunReport /></LazyPage>
          </PermissionGate>
        ),
      },
      {
        path: 'reports/executions',
        element: (
          <PermissionGate anyOf={['reports.*', 'reports.read', 'admin.*']}>
            <LazyPage><ReportExecutionList /></LazyPage>
          </PermissionGate>
        ),
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
