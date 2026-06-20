import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { COURSES, RETURN_FROM_ABSENCE, absenceRule, monthsBetween } from "@/lib/data";
import { usePersonnel } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/absence")({
  head: () => ({ meta: [{ title: "Return from Absence — Training Tracker" }] }),
  component: AbsencePage,
});

function AbsencePage() {
  const { employees } = usePersonnel();

  const flagged = useMemo(() => {
    const rows: { empId: string; name: string; station: string; course: string; expiry: string; monthsLate: number; rule: ReturnType<typeof absenceRule> }[] = [];
    employees.forEach((e) => {
      COURSES.forEach((c) => {
        const r = e.courses[c];
        if (!r.expiryDate) return;
        const expired = new Date(r.expiryDate) < new Date();
        if (!expired) return;
        const rule = absenceRule(r.expiryDate);
        if (!rule) return;
        rows.push({
          empId: e.id,
          name: `${e.lastName} ${e.firstName}`.trim() || e.id,
          station: e.station || "—",
          course: c,
          expiry: r.expiryDate,
          monthsLate: monthsBetween(r.expiryDate),
          rule,
        });
      });
    });
    return rows.sort((a, b) => b.monthsLate - a.monthsLate);
  }, [employees]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold">Return from Absence</h1>
        <p className="text-sm text-muted-foreground">
          ISAGO requalification rules. The engine flags any expired training and recommends the action required based on how long ago the expiry passed.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {RETURN_FROM_ABSENCE.map((r) => (
          <Card key={r.period} className="gradient-card shadow-soft">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{r.period}</CardTitle>
              <Badge variant="outline" className="border-accent text-accent">{r.notes}</Badge>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed text-muted-foreground">
              {r.action}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="shadow-soft">
        <CardHeader className="flex flex-row items-center justify-between bg-secondary/40">
          <CardTitle className="text-base">Flagged employees · {flagged.length}</CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5 text-[var(--gold)]" />
            Based on expiry dates in Personnel Tracker
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-background text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="border-b px-3 py-2">Employee</th>
                  <th className="border-b px-3 py-2">Station</th>
                  <th className="border-b px-3 py-2">Course</th>
                  <th className="border-b px-3 py-2">Expired</th>
                  <th className="border-b px-3 py-2">Months late</th>
                  <th className="border-b px-3 py-2">Bracket</th>
                  <th className="border-b px-3 py-2">Action required</th>
                </tr>
              </thead>
              <tbody>
                {flagged.map((f, i) => (
                  <tr key={i} className="border-b hover:bg-secondary/30">
                    <td className="px-3 py-2 font-medium">{f.name} <span className="ml-1 font-mono text-[11px] text-muted-foreground">{f.empId}</span></td>
                    <td className="px-3 py-2">{f.station}</td>
                    <td className="px-3 py-2">{f.course}</td>
                    <td className="px-3 py-2 tabular-nums">{f.expiry}</td>
                    <td className="px-3 py-2 tabular-nums">{f.monthsLate}</td>
                    <td className="px-3 py-2"><Badge variant="secondary">{f.rule?.period}</Badge></td>
                    <td className="px-3 py-2 text-[13px] text-muted-foreground">{f.rule?.action}</td>
                  </tr>
                ))}
                {flagged.length === 0 && (
                  <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No expired trainings detected. ✈️</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
