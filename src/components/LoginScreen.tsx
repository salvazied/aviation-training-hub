import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import gulfPearlLogo from "@/assets/gulfpearl-logo.png.asset.json";

export function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const error = login(username, password);
    setErr(error);
  };

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <div className="relative hidden gradient-hero lg:flex lg:flex-col lg:justify-between lg:p-12 text-primary-foreground">
        <div className="flex items-center gap-2.5">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary-foreground/15 backdrop-blur">
            <Plane className="h-5 w-5 -rotate-45" />
          </div>
          <div className="font-display text-lg font-semibold">Training Tracker</div>
        </div>
        <div className="space-y-4">
          <h1 className="font-display text-4xl font-semibold leading-tight">
            Ground Handling
            <br />
            Training & Compliance
          </h1>
          <p className="max-w-md text-primary-foreground/75">
            Track every course, every employee, every station. ISAGO-aligned return-from-absence rules and 2-year expiry planning built in.
          </p>
        </div>
        <div className="text-xs text-primary-foreground/60">© Aviation Operations · v1.0</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={onSubmit} className="w-full max-w-sm space-y-5">
          <div className="space-y-1">
            <h2 className="font-display text-2xl font-semibold">Sign in</h2>
            <p className="text-sm text-muted-foreground">Use your admin or user account.</p>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="u">Username</Label>
              <Input id="u" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin or user" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p">Password</Label>
              <Input id="p" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
          </div>
          {err && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{err}</div>}
          <Button type="submit" className="w-full">Sign in</Button>
        </form>

      </div>
    </div>
  );
}
