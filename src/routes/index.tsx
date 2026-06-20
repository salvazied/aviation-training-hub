import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { usePersonnel } from "@/lib/store";
import { COURSES, DUTY_CATEGORIES, STATUS_VALUES, deriveStatus, type Status } from "@/lib/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { StatusPill } from "@/components/StatusPill";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, CartesianGrid,
} from "recharts";
import { Users, AlertTriangle, CheckCircle2, Clock, AlertOctagon, CalendarClock } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Training Tracker" },
      { name: "description", content: "KPIs, expiring trainings, and station coverage at a glance." },
    ],
  }),
  component: Dashboard,
});

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function Dashboard() {
  const { employees } = usePersonnel();

  const stations = useMemo(() => Array.from(new Set(employees.map((e) => e.station).filter(Boolean))).sort(), [employees]);
  const duties = useMemo(() => Array.from(new Set(employees.map((e) => e.dutyCategory).filter(Boolean))).sort(), [employees]);

  const [station, setStation] = useState<string>("all");
  const [duty, setDuty] = useState<string>("all");
  const [course, setCourse] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");

  const filteredEmployees = useMemo(
    () =>
      employees.filter(
        (e) =>
          (station === "all" || e.station === station) &&
          (duty === "all" || e.dutyCategory === duty)
      ),
    [employees, station, duty]
  );

  // Flatten course records based on filters
  const records = useMemo(() => {
    const rows: { emp: typeof employees[number]; course: string; status: Status; expiry: string; training: string }[] = [];
    filteredEmployees.forEach((e) => {
      COURSES.forEach((c) => {
        if (course !== "all" && c !== course) return;
        const r = e.courses[c];
        const st = deriveStatus(r.trainingDate, r.expiryDate, r.status);
        if (status !== "all" && st !== status) return;
        rows.push({ emp: e, course: c, status: st, expiry: r.expiryDate, training: r.trainingDate });
      });
    });
    return rows;
  }, [filteredEmployees, course, status]);

  const kpis = useMemo(() => {
    const k = { total: filteredEmployees.length, completed: 0, scheduled: 0, outstanding: 0, overdue: 0, expiringSoon: 0 };
    const today = new Date();
    const in60 = new Date();
    in60.setDate(today.getDate() + 60);
    records.forEach((r) => {
      if (r.status === "Completed") k.completed++;
      else if (r.status === "Scheduled") k.scheduled++;
      else if (r.status === "Overdue") k.overdue++;
      else if (r.status === "Outstanding") k.outstanding++;
      if (r.expiry) {
        const e = new Date(r.expiry);
        if (e >= today && e <= in60) k.expiringSoon++;
      }
    });
    return k;
  }, [filteredEmployees, records]);

  const byCourse = useMemo(() => {
    const map = new Map<string, { course: string; Completed: number; Scheduled: number; Outstanding: number; Overdue: number }>();
    records.forEach((r) => {
      const short = r.course.length > 22 ? r.course.slice(0, 20) + "…" : r.course;
      const o = map.get(short) ?? { course: short, Completed: 0, Scheduled: 0, Outstanding: 0, Overdue: 0 };
      if (r.status) (o as any)[r.status]++;
      map.set(short, o);
    });
    return Array.from(map.values()).sort((a, b) => (b.Overdue + b.Outstanding) - (a.Overdue + a.Outstanding)).slice(0, 12);
  }, [records]);

  const byStation = useMemo(() => {
    const map = new Map<string, number>();
    filteredEmployees.forEach((e) => {
      const s = e.station || "—";
      map.set(s, (map.get(s) ?? 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [filteredEmployees]);

  const expiringList = useMemo(() => {
    const today = new Date();
    const in60 = new Date();
    in60.setDate(today.getDate() + 60);
    return records
      .filter((r) => r.expiry && new Date(r.expiry) >= today && new Date(r.expiry) <= in60)
      .sort((a, b) => +new Date(a.expiry) - +new Date(b.expiry))
      .slice(0, 12);
  }, [records]);

  const overdueList = useMemo(
    () => records.filter((r) => r.status === "Overdue").sort((a, b) => +new Date(a.expiry) - +new Date(b.expiry)).slice(0, 12),
    [records]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Live overview — adjust the filters to focus your view.</p>
        </div>
      </div>

      {/* Filter bar */}
      <Card className="border-accent/30 shadow-soft">
        <CardContent className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
          <FilterSelect label="Station" value={station} onChange={setStation} options={["all", ...stations]} />
          <FilterSelect label="Duty Category" value={duty} onChange={setDuty} options={["all", ...duties]} />
          <FilterSelect label="Training" value={course} onChange={setCourse} options={["all", ...COURSES]} />
          <FilterSelect label="Status" value={status} onChange={setStatus} options={["all", ...STATUS_VALUES]} />
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Kpi icon={<Users className="h-4 w-4" />} label="Employees" value={kpis.total} tone="primary" />
        <Kpi icon={<CheckCircle2 className="h-4 w-4" />} label="Completed" value={kpis.completed} tone="success" />
        <Kpi icon={<CalendarClock className="h-4 w-4" />} label="Scheduled" value={kpis.scheduled} tone="sky" />
        <Kpi icon={<Clock className="h-4 w-4" />} label="Outstanding" value={kpis.outstanding} tone="warning" />
        <Kpi icon={<AlertOctagon className="h-4 w-4" />} label="Overdue" value={kpis.overdue} tone="destructive" />
        <Kpi icon={<AlertTriangle className="h-4 w-4" />} label="Expiring ≤ 60d" value={kpis.expiringSoon} tone="gold" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 gradient-card shadow-soft">
          <CardHeader><CardTitle className="text-base">Status by training course</CardTitle></CardHeader>
          <CardContent className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCourse} margin={{ top: 8, right: 8, left: 0, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.015 240)" />
                <XAxis dataKey="course" tick={{ fontSize: 11 }} angle={-25} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Completed" stackId="s" fill="var(--success)" />
                <Bar dataKey="Scheduled" stackId="s" fill="var(--sky)" />
                <Bar dataKey="Outstanding" stackId="s" fill="var(--warning)" />
                <Bar dataKey="Overdue" stackId="s" fill="var(--destructive)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="gradient-card shadow-soft">
          <CardHeader><CardTitle className="text-base">Headcount by station</CardTitle></CardHeader>
          <CardContent className="h-[340px]">
            {byStation.length === 0 ? (
              <Empty label="No station data yet." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byStation} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                    {byStation.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <RecordList title="Expiring within 60 days" tone="gold" rows={expiringList} />
        <RecordList title="Overdue trainings" tone="destructive" rows={overdueList} />
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>{o === "all" ? `All ${label.toLowerCase()}s` : o}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Kpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  const ring: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    success: "bg-[color-mix(in_oklab,var(--success)_15%,transparent)] text-[var(--success)]",
    sky: "bg-[color-mix(in_oklab,var(--sky)_15%,transparent)] text-[var(--sky)]",
    warning: "bg-[color-mix(in_oklab,var(--warning)_20%,transparent)] text-[oklch(0.5_0.15_70)]",
    destructive: "bg-destructive/10 text-destructive",
    gold: "bg-[color-mix(in_oklab,var(--gold)_22%,transparent)] text-[oklch(0.5_0.13_80)]",
  };
  return (
    <Card className="shadow-soft">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`grid h-9 w-9 place-items-center rounded-lg ${ring[tone]}`}>{icon}</div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="font-display text-xl font-semibold leading-tight">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function RecordList({ title, rows, tone }: { title: string; tone: "gold" | "destructive"; rows: { emp: { id: string; lastName: string; firstName: string; station: string }; course: string; status: Status; expiry: string }[] }) {
  return (
    <Card className="shadow-soft">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{title}</CardTitle>
        <Badge variant="outline" className={tone === "gold" ? "border-[var(--gold)] text-[oklch(0.5_0.13_80)]" : "border-destructive/40 text-destructive"}>{rows.length}</Badge>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <Empty label="Nothing here. ✈️" />
        ) : (
          <div className="divide-y">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{(r.emp.lastName || r.emp.firstName) ? `${r.emp.lastName} ${r.emp.firstName}`.trim() : r.emp.id}</div>
                  <div className="truncate text-[12px] text-muted-foreground">{r.course} · {r.emp.station || "—"}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[12px] tabular-nums text-muted-foreground">{r.expiry || "—"}</span>
                  <StatusPill value={r.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="grid h-full place-items-center text-sm text-muted-foreground">{label}</div>;
}
