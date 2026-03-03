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
const BrandingSettings = lazy(() => import('@/pages/settings/BrandingSettings'));
const WorkflowSettings = lazy(() => import('@/pages/settings/WorkflowSettings'));

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
        path: 'settings',
        element: <LazyPage><BrandingSettings /></LazyPage>,
      },
      {
        path: 'settings/workflow',
        element: <LazyPage><WorkflowSettings /></LazyPage>,
      },
      {
        path: '*',
        element: <Navigate to="/" replace />,
      },
    ],
  },
]);
