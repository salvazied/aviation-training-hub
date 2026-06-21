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
import { Plane, LogOut, LayoutDashboard, Users, Table2, RefreshCcw, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

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
  const { user, logout } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (!user) return <LoginScreen />;

  const navItems = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/personnel", label: "Personnel Tracker", icon: Users },
    { to: "/matrix", label: "Training Matrix", icon: Table2 },
    { to: "/absence", label: "Return from Absence", icon: RefreshCcw },
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-6 py-3">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-lg gradient-hero text-primary-foreground shadow-elegant">
              <Plane className="h-5 w-5 -rotate-45" />
            </div>
            <div className="leading-tight">
              <div className="font-display text-[15px] font-semibold">Training Tracker</div>
              <div className="text-[11px] text-muted-foreground">Ground Handling · ISAGO</div>
            </div>
          </Link>

          {/* Dropdown nav, primary navy background like the airplane logo */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="ml-2 inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-soft transition hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                <LayoutDashboard className="h-4 w-4" />
                Training Tracker
                <ChevronDown className="h-3.5 w-3.5 opacity-80" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60 bg-primary text-primary-foreground border-primary/40">
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-primary-foreground/70">
                Navigation
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-primary-foreground/15" />
              {navItems.map((n) => {
                const active = pathname === n.to;
                return (
                  <DropdownMenuItem
                    key={n.to}
                    asChild
                    className={`gap-2 cursor-pointer focus:bg-primary-foreground/15 focus:text-primary-foreground ${
                      active ? "bg-primary-foreground/15" : ""
                    }`}
                  >
                    <Link to={n.to}>
                      <n.icon className="h-4 w-4" />
                      <span>{n.label}</span>
                    </Link>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-[12px] font-medium leading-tight">{user.username}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{user.role}</div>
            </div>
            <Button variant="outline" size="sm" onClick={logout}>
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-4 py-6 md:px-6">
        <Outlet />
      </main>
    </div>
  );
}
