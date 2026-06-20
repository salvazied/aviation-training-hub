import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { COURSES, DUTY_CATEGORIES, TRAINING_MATRIX } from "@/lib/data";
import { Check, Minus } from "lucide-react";

export const Route = createFileRoute("/matrix")({
  head: () => ({ meta: [{ title: "Training Matrix — Training Tracker" }] }),
  component: MatrixPage,
});

function MatrixPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold">Training Matrix</h1>
        <p className="text-sm text-muted-foreground">Standard reference — required courses per ground-handling duty category.</p>
      </div>

      <Card className="overflow-hidden shadow-soft">
        <CardHeader className="bg-secondary/40">
          <CardTitle className="text-base">Ground Handling Duty Categories × Courses</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead className="bg-secondary/60">
                <tr>
                  <th className="sticky left-0 z-10 min-w-[60px] border-b bg-secondary/60 px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">#</th>
                  <th className="sticky left-[60px] z-10 min-w-[280px] border-b bg-secondary/60 px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Training Course</th>
                  {DUTY_CATEGORIES.map((d) => (
                    <th key={d.code} title={d.description} className="border-b px-2 py-2 text-center text-[11px] font-semibold text-foreground">
                      {d.code}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COURSES.map((c, i) => (
                  <tr key={c} className="border-b hover:bg-secondary/30">
                    <td className="sticky left-0 z-10 bg-background px-3 py-2 text-[12px] text-muted-foreground">{i + 1}</td>
                    <td className="sticky left-[60px] z-10 bg-background px-3 py-2 font-medium">{c}</td>
                    {TRAINING_MATRIX[i].map((cell, j) => (
                      <td key={j} className="px-2 py-2 text-center text-[12px]">
                        {cell === "✓" ? (
                          <span className="inline-grid h-6 w-6 place-items-center rounded-md bg-[color-mix(in_oklab,var(--success)_18%,transparent)] text-[var(--success)]"><Check className="h-3.5 w-3.5" /></span>
                        ) : cell === "-" ? (
                          <Minus className="inline h-3.5 w-3.5 text-muted-foreground/50" />
                        ) : (
                          <span className="inline-flex items-center rounded-md bg-[color-mix(in_oklab,var(--gold)_22%,transparent)] px-1.5 py-0.5 font-mono text-[11px] text-[oklch(0.5_0.13_80)]">Cat {cell}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-soft">
        <CardHeader><CardTitle className="text-base">Duty Category Descriptions</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-2">
            {DUTY_CATEGORIES.map((d) => (
              <div key={d.code} className="flex items-start gap-3 rounded-md border bg-secondary/30 px-3 py-2">
                <span className="rounded-md bg-primary px-2 py-0.5 font-mono text-[12px] text-primary-foreground">{d.code}</span>
                <span className="text-sm">{d.description}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Legend: <span className="font-medium text-foreground">✓</span> required · <span className="font-medium text-foreground">—</span> not required · <span className="font-medium text-foreground">Cat N</span> DGR category required.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
