import { Navigate, Outlet, createBrowserRouter, useLocation } from "react-router-dom";
import { Layout } from "./components/Layout";
import { useSession } from "./lib/session";
import { HistoryPage } from "./pages/History";
import { LoginPage } from "./pages/Login";
import { PlayersPage } from "./pages/Players";
import { ProfilePage } from "./pages/Profile";
import { ResultsPage } from "./pages/Results";
import { RoomPage } from "./pages/Room";
import { RulesPage } from "./pages/Rules";
import { TeamDetailPage, TeamsPage } from "./pages/Teams";
import { UsersPage } from "./pages/Users";

function RequireAuth() {
  const me = useSession((s) => s.me);
  const token = useSession((s) => s.token);
  const loc = useLocation();
  if (!token || !me) return <Navigate to="/login" replace />;
  if (me.must_change_password && loc.pathname !== "/profile") return <Navigate to="/profile" replace />;
  return <Outlet />;
}

function RequireAdmin() {
  const role = useSession((s) => s.me?.role);
  return role === "admin" ? <Outlet /> : <Navigate to="/room" replace />;
}

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <Layout />,
        children: [
          { path: "/room", element: <RoomPage /> },
          { path: "/teams", element: <TeamsPage /> },
          { path: "/teams/:id", element: <TeamDetailPage /> },
          { path: "/players", element: <PlayersPage /> },
          { path: "/history", element: <HistoryPage /> },
          { path: "/results", element: <ResultsPage /> },
          { path: "/profile", element: <ProfilePage /> },
          {
            element: <RequireAdmin />,
            children: [
              { path: "/admin/rules", element: <RulesPage /> },
              { path: "/admin/users", element: <UsersPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/room" replace /> },
]);
