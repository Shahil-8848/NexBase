import { createBrowserRouter, RouterProvider, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthContext } from './auth-context'
import { AppShell } from '@/components/layout/app-shell'
import { LoadingScreen } from '@/components/shared/loading-screen'
import { ErrorBoundary } from '@/components/shared/error-boundary'

// Auth pages
import { LoginPage } from '@/features/auth/components/login-page'
import { RegisterPage } from '@/features/auth/components/register-page'
import { ForgotPasswordPage } from '@/features/auth/components/forgot-password-page'

// App pages
import { DashboardPage } from '@/features/dashboard/components/dashboard-page'
import { TournamentsPage } from '@/features/tournaments/components/tournaments-page'
import { TournamentDetailPage } from '@/features/tournaments/components/tournament-detail-page'
import { ProfilePage } from '@/features/profile/components/profile-page'
import { LeaderboardPage } from '@/features/leaderboard/components/leaderboard-page'
import { TransactionsPage } from '@/features/transactions/components/transactions-page'
import { SettingsPage } from '@/features/settings/components/settings-page'
import { SwapPage } from '@/features/swap/components/swap-page'

// Organizer pages
import { OrganizerDashboardPage } from '@/features/organizer/components/organizer-dashboard-page'
import { CreateTournamentPage } from '@/features/organizer/components/create-tournament-page'
import { ManageTournamentPage } from '@/features/organizer/components/manage-tournament-page'

// ─── Route Guards ─────────────────────────────────────────────────────────────
// These are components rendered inside routes, so they ARE inside AuthProvider.

function RequireAuth() {
  const { isAuthenticated, loading } = useAuthContext()
  const location = useLocation()
  if (loading) return <LoadingScreen />
  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace state={{ from: location.pathname }} />
  }
  return <Outlet />
}

function RequireOrganizer() {
  const { isAuthenticated, isOrganizer, loading } = useAuthContext()
  if (loading) return <LoadingScreen />
  if (!isAuthenticated) return <Navigate to="/auth/login" replace />
  if (!isOrganizer) return <Navigate to="/dashboard" replace />
  return <Outlet />
}

function RedirectIfAuth() {
  const { isAuthenticated, loading } = useAuthContext()
  if (loading) return <LoadingScreen />
  if (isAuthenticated) return <Navigate to="/dashboard" replace />
  return <Outlet />
}

// ─── Router ──────────────────────────────────────────────────────────────────
// createBrowserRouter is called INSIDE the component so it's always within
// the AuthProvider context tree.

const routes = [
  // Public / auth routes
  {
    element: <RedirectIfAuth />,
    children: [
      { path: '/auth/login', element: <LoginPage /> },
      { path: '/auth/register', element: <RegisterPage /> },
      { path: '/auth/forgot-password', element: <ForgotPasswordPage /> },
    ],
  },

  // Protected routes
  {
    element: <RequireAuth />,
    children: [
      {
        element: (
          <ErrorBoundary>
            <AppShell />
          </ErrorBoundary>
        ),
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: '/dashboard', element: <DashboardPage /> },
          { path: '/tournaments', element: <TournamentsPage /> },
          { path: '/tournaments/:id', element: <TournamentDetailPage /> },
          { path: '/profile/:id', element: <ProfilePage /> },
          { path: '/leaderboard', element: <LeaderboardPage /> },
          { path: '/transactions', element: <TransactionsPage /> },
          { path: '/settings', element: <SettingsPage /> },
          { path: '/swap', element: <SwapPage /> },
          {
            element: <RequireOrganizer />,
            children: [
              { path: '/organizer', element: <OrganizerDashboardPage /> },
              { path: '/organizer/create', element: <CreateTournamentPage /> },
              { path: '/organizer/tournaments/:id', element: <ManageTournamentPage /> },
            ],
          },
        ],
      },
    ],
  },

  // Fallback
  { path: '*', element: <Navigate to="/dashboard" replace /> },
]

// Router is created once at module level — the route *elements* (components)
// are evaluated lazily when rendered, so they will always be inside AuthProvider.
const router = createBrowserRouter(routes, {
  future: {
    v7_startTransition: true,
  },
})

export function AppRouter() {
  return <RouterProvider router={router} />
}
