import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { COURSES, DUTY_CATEGORIES } from "@/lib/data";
import { useMatrix } from "@/lib/matrix-store";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Check, Minus, RotateCcw, Pencil, Eye } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/matrix")({
  head: () => ({ meta: [{ title: "Training Matrix — Training Tracker" }] }),
  component: MatrixPage,
});

const CELL_OPTIONS = ["-", "✓", "6", "7.1", "7.2", "7.3", "7.4", "7.5", "7.6"];

function nextValue(current: string): string {
  const i = CELL_OPTIONS.indexOf(current);
  return CELL_OPTIONS[(i + 1) % CELL_OPTIONS.length];
}

function MatrixPage() {
  const { user } = useAuth();
  const { matrix, setCell, reset } = useMatrix();
  const isAdmin = user?.role === "admin";
  const [editing, setEditing] = useState(false);
  const editMode = isAdmin && editing;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Training Matrix</h1>
          <p className="text-sm text-muted-foreground">
            Required courses per ground-handling duty category. Changes propagate to the Personnel Tracker course filter.
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button size="sm" variant={editMode ? "default" : "outline"} onClick={() => setEditing((v) => !v)}>
              {editMode ? <Eye className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
              {editMode ? "Done editing" : "Edit matrix"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { if (confirm("Reset Training Matrix to defaults?")) reset(); }}>
              <RotateCcw className="h-4 w-4" /> Reset
            </Button>
          </div>
        )}
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
                    {matrix[i].map((cell, j) => (
                      <td key={j} className="px-2 py-2 text-center text-[12px]">
                        {editMode ? (
                          <button
                            onClick={() => setCell(i, j, nextValue(cell))}
                            title="Click to cycle: - → ✓ → DGR categories"
                            className="inline-flex h-7 min-w-[44px] items-center justify-center rounded-md border border-dashed border-accent/40 bg-background px-1.5 text-[11px] font-mono hover:border-accent hover:bg-accent/10"
                          >
                            {cell || "-"}
                          </button>
                        ) : cell === "✓" ? (
                          <span className="inline-grid h-6 w-6 place-items-center rounded-md bg-[color-mix(in_oklab,var(--success)_18%,transparent)] text-[var(--success)]"><Check className="h-3.5 w-3.5" /></span>
                        ) : cell === "-" || !cell ? (
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
            {editMode && " · Click any cell to cycle its value."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
