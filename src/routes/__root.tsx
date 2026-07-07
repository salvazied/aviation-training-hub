import {
  Outlet,
  Link,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import appCss from "../styles.css?url";
import { AuthProvider, useAuth } from "@/lib/auth";
import { LoginScreen } from "@/components/LoginScreen";
import { LogOut, LayoutDashboard, Users, Table2, RefreshCcw, Plane } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";


export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Ground Handling Training Tracker" },
      { name: "description", content: "Aviation ground handling training tracker — personnel, matrix, return from absence." },
      { property: "og:title", content: "Ground Handling Training Tracker" },
      { name: "twitter:title", content: "Ground Handling Training Tracker" },
      { property: "og:description", content: "Aviation ground handling training tracker — personnel, matrix, return from absence." },
      { name: "twitter:description", content: "Aviation ground handling training tracker — personnel, matrix, return from absence." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/65c64e23-0e2a-4e6f-9a94-80a874cd7e88/id-preview-0719c2e4--bff95e40-108a-4668-9824-51aa2cc77c9f.lovable.app-1782058154611.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/65c64e23-0e2a-4e6f-9a94-80a874cd7e88/id-preview-0719c2e4--bff95e40-108a-4668-9824-51aa2cc77c9f.lovable.app-1782058154611.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center">
      <Link to="/" className="text-accent">Go home</Link>
    </div>
  ),
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function Shell() {
  const { user, logout, loading } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (loading) return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Loading…</div>;
  if (!user) return <LoginScreen />;

  const navItems = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/personnel", label: "Personnel Tracker", icon: Users },
    { to: "/matrix", label: "Training Matrix", icon: Table2 },
    { to: "/absence", label: "Return from Absence", icon: RefreshCcw },
  ];

  return (
    <div className="min-h-screen flex">
      {/* Permanent left sidebar */}
      <aside className="sticky top-0 z-40 hidden h-screen w-60 shrink-0 flex-col bg-primary text-primary-foreground shadow-elegant md:flex">
        <Link to="/" className="flex items-center gap-2.5 border-b border-primary-foreground/15 px-5 py-4">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary-foreground/95 p-1">
            <Plane className="h-6 w-6 text-primary" />
          </div>
          <div className="leading-tight">
            <div className="font-display text-[15px] font-semibold">Training Tracker</div>
            <div className="text-[11px] text-primary-foreground/70">GulPearl Aviation Services</div>
          </div>
        </Link>

        <nav className="flex-1 space-y-1 px-3 py-4">
          <div className="mb-2 px-2 text-[10px] uppercase tracking-wider text-primary-foreground/60">
            Navigation
          </div>
          {navItems.map((n) => {
            const active = pathname === n.to;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-primary-foreground/20 text-primary-foreground shadow-sm"
                    : "text-primary-foreground/85 hover:bg-primary-foreground/10"
                }`}
              >
                <n.icon className="h-4 w-4" />
                <span>{n.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-primary-foreground/15 px-4 py-3">
          <div className="mb-2 leading-tight">
            <div className="text-[12px] font-medium">{user.username}</div>
            <div className="text-[10px] uppercase tracking-wider text-primary-foreground/60">{user.role}</div>
          </div>
          <Button variant="secondary" size="sm" className="w-full" onClick={logout}>
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </Button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex w-full items-center gap-3 border-b bg-primary px-4 py-2.5 text-primary-foreground md:hidden">
        <div className="grid h-6 w-6 place-items-center rounded bg-primary-foreground/95"><Plane className="h-4 w-4 text-primary" /></div>
        <div className="font-display text-sm font-semibold">GulPearl Aviation</div>
        <div className="ml-auto flex items-center gap-2 overflow-x-auto">
          {navItems.map((n) => {
            const active = pathname === n.to;
            return (
              <Link key={n.to} to={n.to} className={`rounded-md px-2 py-1 text-xs ${active ? "bg-primary-foreground/20" : "text-primary-foreground/80"}`}>
                {n.label.split(" ")[0]}
              </Link>
            );
          })}
          <Button variant="secondary" size="sm" className="h-7" onClick={logout}><LogOut className="h-3 w-3" /></Button>
        </div>
      </header>

      <main className="min-w-0 flex-1 px-4 py-6 md:px-6">
        <Outlet />
      </main>
      <Toaster position="top-right" richColors />
    </div>
  );
}

