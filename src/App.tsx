import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider, useTheme } from '@/theme/ThemeContext';
import { router } from '@/router';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AuthProvider } from '@/auth/AuthContext';
import { PwaUpdatePrompt } from '@/components/PwaUpdatePrompt';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,        // 1 min — dados considerados frescos
      gcTime: 10 * 60_000,      // 10 min — cache mantido mesmo sem observers
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1_000 * 2 ** attemptIndex, 8_000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 1,
    },
  },
});

function AppToaster() {
  const { mode } = useTheme();
  const isDark = mode === 'dark';

  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 4000,
        style: {
          background: isDark ? '#0f172a' : '#ffffff',
          color: isDark ? '#e2e8f0' : '#0f172a',
          border: isDark
            ? '1px solid rgba(148,163,184,0.25)'
            : '1px solid #e2e8f0',
          borderRadius: '0.75rem',
          boxShadow: isDark
            ? '0 20px 38px rgba(2, 6, 23, 0.55)'
            : '0 10px 25px rgba(0, 0, 0, 0.1)',
        },
        success: {
          iconTheme: {
            primary: '#22c55e',
            secondary: isDark ? '#052e16' : '#f0fdf4',
          },
        },
        error: {
          iconTheme: {
            primary: '#ef4444',
            secondary: isDark ? '#450a0a' : '#fef2f2',
          },
        },
      }}
    />
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider>
            <RouterProvider router={router} />
            <PwaUpdatePrompt />
            <AppToaster />
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
