import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from '@/theme/ThemeContext';
import { router } from '@/router';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AuthProvider } from '@/auth/AuthContext';
import { PwaUpdatePrompt } from '@/components/PwaUpdatePrompt';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1_000 * 2 ** attemptIndex, 8_000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider>
            <RouterProvider router={router} />
            <PwaUpdatePrompt />
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 4000,
                style: {
                  background: '#0f172a',
                  color: '#e2e8f0',
                  border: '1px solid rgba(148,163,184,0.25)',
                  borderRadius: '0.75rem',
                  boxShadow: '0 20px 38px rgba(2, 6, 23, 0.55)',
                },
                success: { iconTheme: { primary: '#22c55e', secondary: '#052e16' } },
                error: { iconTheme: { primary: '#ef4444', secondary: '#450a0a' } },
              }}
            />
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
