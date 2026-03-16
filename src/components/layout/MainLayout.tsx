import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useAgentStatusRealtime_Combined } from '@/hooks';
import { useAuth } from '@/auth/AuthContext';

export function MainLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const { isAuthenticated } = useAuth();
  useAgentStatusRealtime_Combined(isAuthenticated);

  return (
    <div className="flex min-h-screen bg-slate-950">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />

      <div className={`sidebar-transition flex flex-1 flex-col ${collapsed ? 'ml-16' : 'ml-60'}`}>
        <Header />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
