import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePersonnel } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { COURSES, DUTY_CATEGORIES, STATUS_VALUES, addYears, deriveStatus, emptyCourse, type Status, type TrainingAttachment } from "@/lib/data";
import { useMatrix, coursesForDuty } from "@/lib/matrix-store";
import { deleteAttachmentFile, downloadAttachmentFile, openAttachmentFile, saveAttachmentFile } from "@/lib/attachments";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { StatusPill } from "@/components/StatusPill";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Download, FileText, ClipboardPaste, RotateCcw, Search, Paperclip, ExternalLink, X, Save, ChevronLeft, ChevronRight } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/personnel")({
  head: () => ({
    meta: [{ title: "Personnel Tracker — Training Tracker" }],
  }),
  component: PersonnelPage,
});

function PersonnelPage() {
  const { employees, update, updateCourse, add, remove, updateId, reset, replaceAll } = usePersonnel();
  const { user } = useAuth();
  const { matrix } = useMatrix();
  const isAdmin = user?.role === "admin";

  const [search, setSearch] = useState("");
  const [stationFilter, setStationFilter] = useState("all");
  const [dutyFilter, setDutyFilter] = useState("all");
  const ALL_COURSES = "__all";
  const [activeCourse, setActiveCourse] = useState<string>(COURSES[0]);
  const [pageSize, setPageSize] = useState<number>(50);
  const [page, setPage] = useState(1);

  // Courses available in the "Course view" selector — filtered by Training Matrix
  // when a specific duty category is selected.
  const availableCourses = useMemo(
    () => (dutyFilter === "all" ? COURSES : coursesForDuty(matrix, dutyFilter)),
    [dutyFilter, matrix]
  );

  // If active course is no longer available for the chosen duty, fall back.
  useEffect(() => {
    if (activeCourse !== ALL_COURSES && !availableCourses.includes(activeCourse) && availableCourses.length > 0) {
      setActiveCourse(availableCourses[0]);
    }
  }, [availableCourses, activeCourse]);

  useEffect(() => { setPage(1); }, [search, stationFilter, dutyFilter, pageSize, activeCourse]);

  const stations = useMemo(() => Array.from(new Set(employees.map((e) => e.station).filter(Boolean))).sort(), [employees]);

  const visible = useMemo(
    () =>
      employees.filter((e) => {
        if (stationFilter !== "all" && e.station !== stationFilter) return false;
        if (dutyFilter !== "all" && e.dutyCategory !== dutyFilter) return false;
        if (search) {
          const q = search.toLowerCase();
          return [e.id, e.lastName, e.firstName, e.jobTitle, e.station, e.dutyCategory]
            .some((v) => (v || "").toLowerCase().includes(q));
        }
        return true;
      }),
    [employees, search, stationFilter, dutyFilter]
  );

  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const paged = useMemo(() => visible.slice((page - 1) * pageSize, page * pageSize), [visible, page, pageSize]);

  const exportCsv = () => {
    const headers = ["Employee ID","Last Name","First Name","Duty Category","Job Title","Station"];
    COURSES.forEach((c) => {
      headers.push(`${c} — Training`, `${c} — Expiry`, `${c} — Status`, `${c} — Next Training`);
    });
    const rows = employees.map((e) => {
      const base = [e.id, e.lastName, e.firstName, e.dutyCategory, e.jobTitle, e.station];
      COURSES.forEach((c) => {
        const r = e.courses[c];
        base.push(r.trainingDate, r.expiryDate, deriveStatus(r.trainingDate, r.expiryDate, r.status), r.nextTrainingDate);
      });
      return base;
    });
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "personnel-tracker.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const isAll = activeCourse === ALL_COURSES;
    const title = `Personnel Tracker — ${isAll ? "All courses" : activeCourse}`;
    doc.setFontSize(14);
    doc.text(title, 40, 36);
    doc.setFontSize(9);
    const meta = [
      `Generated: ${new Date().toLocaleString()}`,
      `Duty filter: ${dutyFilter === "all" ? "All" : dutyFilter}`,
      `Station filter: ${stationFilter === "all" ? "All" : stationFilter}`,
      `Records: ${visible.length}`,
    ].join("   ·   ");
    doc.text(meta, 40, 52);

    let head: string[][];
    let body: (string | number)[][];
    if (isAll) {
      head = [["ID", "Last Name", "First Name", "Duty", "Job Title", "Station", "Completed", "Scheduled", "Outstanding", "Overdue"]];
      body = visible.map((e) => {
        const c = statusCounts(e);
        return [e.id, e.lastName, e.firstName, e.dutyCategory, e.jobTitle, e.station, c.Completed, c.Scheduled, c.Outstanding, c.Overdue];
      });
    } else {
      head = [["ID", "Last Name", "First Name", "Duty", "Job Title", "Station", "Training", "Expiry", "Status", "Next Training"]];
      body = visible.map((e) => {
        const r = e.courses[activeCourse];
        const st = deriveStatus(r.trainingDate, r.expiryDate, r.status);
        return [e.id, e.lastName, e.firstName, e.dutyCategory, e.jobTitle, e.station, r.trainingDate, r.expiryDate, st, r.nextTrainingDate];
      });
    }
    autoTable(doc, {
      head,
      body,
      startY: 64,
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [36, 49, 92], textColor: 255 },
      alternateRowStyles: { fillColor: [243, 246, 252] },
    });
    doc.save(`personnel-${(isAll ? "all" : activeCourse).replace(/[^a-z0-9]+/gi, "_")}.pdf`);
  };

  const statusCounts = (e: typeof employees[number]) => {
    const counts = { Completed: 0, Scheduled: 0, Outstanding: 0, Overdue: 0 } as Record<string, number>;
    const list = dutyFilter === "all" ? COURSES : coursesForDuty(matrix, e.dutyCategory || dutyFilter);
    list.forEach((c) => {
      const r = e.courses[c];
      if (!r) return;
      const s = deriveStatus(r.trainingDate, r.expiryDate, r.status);
      if (s && counts[s] !== undefined) counts[s]++;
    });
    return counts;
  };

  const attachTrainingFile = async (employeeId: string, file: File, previous: TrainingAttachment | null) => {
    if (previous) await deleteAttachmentFile(previous.id);
    const attachment = await saveAttachmentFile(file);
    updateCourse(employeeId, activeCourse, { attachment });
  };

  const removeTrainingFile = async (employeeId: string, attachment: TrainingAttachment) => {
    await deleteAttachmentFile(attachment.id);
    updateCourse(employeeId, activeCourse, { attachment: null });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Personnel Tracker</h1>
          <p className="text-sm text-muted-foreground">All cells are editable. Status is auto-derived from dates; next training defaults to expiry + 2 years.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PasteDialog onApply={(rows) => {
            // 5-col TSV: Last · First · Duty · Title · Station. Fills empty rows first, then adds.
            const targets: string[] = employees.filter((e) => !e.lastName && !e.firstName).map((e) => e.id);
            const max = employees.reduce((m, e) => {
              const n = parseInt(e.id.replace(/\D/g, ""), 10);
              return isNaN(n) ? m : Math.max(m, n);
            }, 0);
            const fresh = [...employees];
            rows.forEach((cells, k) => {
              let id = targets[k];
              if (!id) {
                id = "EMP" + String(max + 1 + (k - targets.length)).padStart(3, "0");
                fresh.push({
                  id, lastName: "", firstName: "", dutyCategory: "", jobTitle: "", station: "",
                  courses: Object.fromEntries(COURSES.map((c) => [c, emptyCourse()])),
                });
              }
              const i = fresh.findIndex((e) => e.id === id);
              fresh[i] = {
                ...fresh[i],
                lastName: cells[0] ?? fresh[i].lastName,
                firstName: cells[1] ?? fresh[i].firstName,
                dutyCategory: cells[2] ?? fresh[i].dutyCategory,
                jobTitle: cells[3] ?? fresh[i].jobTitle,
                station: cells[4] ?? fresh[i].station,
              };
            });
            replaceAll(fresh);
          }} />
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4" /> Export CSV</Button>
          <Button variant="outline" size="sm" onClick={exportPdf}><FileText className="h-4 w-4" /> Export PDF</Button>
          <Button size="sm" onClick={() => { const id = add(); toast.success(`Employee ${id} added`); }}><Plus className="h-4 w-4" /> Add employee</Button>
          <Button variant="default" size="sm" onClick={() => toast.success("All changes saved")}><Save className="h-4 w-4" /> Save</Button>
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => { if (confirm("Reset all personnel data?")) reset(); }}>
              <RotateCcw className="h-4 w-4" /> Reset
            </Button>
          )}
        </div>
      </div>

      <Card className="shadow-soft">
        <CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-4">
          <div className="relative md:col-span-2">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, ID, job…" className="pl-8" />
          </div>
          <Select value={stationFilter} onValueChange={setStationFilter}>
            <SelectTrigger><SelectValue placeholder="Station" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stations</SelectItem>
              {stations.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={dutyFilter} onValueChange={setDutyFilter}>
            <SelectTrigger><SelectValue placeholder="Duty category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All duty categories</SelectItem>
              {DUTY_CATEGORIES.map((d) => <SelectItem key={d.code} value={d.code}>{d.code} — {d.description}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="overflow-hidden shadow-soft">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 bg-secondary/40">
          <CardTitle className="text-base">Employees · {visible.length}</CardTitle>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Rows:</span>
              <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                <SelectTrigger className="h-8 w-[72px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[10, 50, 100, 200].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">
                Course view{dutyFilter !== "all" ? ` · ${dutyFilter} (${availableCourses.length})` : ""}:
              </span>
              <Select value={activeCourse} onValueChange={setActiveCourse}>
                <SelectTrigger className="h-8 w-[300px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_COURSES}>All courses (summary)</SelectItem>
                  {availableCourses.map((c) => {
                    const i = COURSES.indexOf(c);
                    return <SelectItem key={c} value={c}>{i + 1}. {c}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1380px] border-separate border-spacing-0 text-sm">
              <thead className="sticky top-0 z-10 bg-secondary/70 backdrop-blur">
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <Th>ID</Th>
                  <Th>Last Name</Th>
                  <Th>First Name</Th>
                  <Th>Duty</Th>
                  <Th>Job Title / Function</Th>
                  <Th>Station</Th>
                  {activeCourse === ALL_COURSES ? (
                    <Th className="bg-accent/10" colSpan={5}>Courses status summary</Th>
                  ) : (
                    <>
                      <Th className="bg-accent/10">Training Date</Th>
                      <Th className="bg-accent/10">Expiry Date</Th>
                      <Th className="bg-accent/10">Status</Th>
                      <Th className="bg-accent/10">Next Training</Th>
                      <Th className="bg-accent/10">Training File</Th>
                    </>
                  )}
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {paged.map((e) => {
                  const r = activeCourse === ALL_COURSES ? null : e.courses[activeCourse];
                  const status = r ? deriveStatus(r.trainingDate, r.expiryDate, r.status) : "";
                  return (
                    <tr key={e.id} className="group border-b hover:bg-secondary/30">
                      <Td>
                        <IdInput
                          value={e.id}
                          onCommit={(v) => {
                            if (!v || v === e.id) return;
                            if (!updateId(e.id, v)) toast.error(`ID "${v}" is already in use`);
                          }}
                        />
                      </Td>
                      <Td><CellInput value={e.lastName} onChange={(v) => update(e.id, { lastName: v })} placeholder="Last name" /></Td>
                      <Td><CellInput value={e.firstName} onChange={(v) => update(e.id, { firstName: v })} placeholder="First name" /></Td>
                      <Td>
                        <Select value={e.dutyCategory || "__none"} onValueChange={(v) => update(e.id, { dutyCategory: v === "__none" ? "" : v })}>
                          <SelectTrigger className="h-8 w-[90px] text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none">—</SelectItem>
                            {DUTY_CATEGORIES.map((d) => <SelectItem key={d.code} value={d.code}>{d.code}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </Td>
                      <Td>
                        <Select value={e.jobTitle || "__none"} onValueChange={(v) => update(e.id, { jobTitle: v === "__none" ? "" : v })}>
                          <SelectTrigger className="h-8 w-[240px] text-xs"><SelectValue placeholder="Select job title" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none">—</SelectItem>
                            {DUTY_CATEGORIES.map((d) => <SelectItem key={d.code} value={d.description}>{d.description}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </Td>
                      <Td><CellInput value={e.station} onChange={(v) => update(e.id, { station: v })} placeholder="Station" /></Td>
                      {activeCourse === ALL_COURSES || !r ? (
                        <Td colSpan={5}>
                          {(() => {
                            const c = statusCounts(e);
                            return (
                              <div className="flex flex-wrap gap-1.5">
                                <Badge className="bg-[color-mix(in_oklab,var(--success)_20%,transparent)] text-[var(--success)] hover:bg-[color-mix(in_oklab,var(--success)_30%,transparent)]">Completed {c.Completed}</Badge>
                                <Badge variant="secondary">Scheduled {c.Scheduled}</Badge>
                                <Badge className="bg-[color-mix(in_oklab,var(--gold)_22%,transparent)] text-[oklch(0.5_0.13_80)] hover:bg-[color-mix(in_oklab,var(--gold)_32%,transparent)]">Outstanding {c.Outstanding}</Badge>
                                <Badge variant="destructive">Overdue {c.Overdue}</Badge>
                              </div>
                            );
                          })()}
                        </Td>
                      ) : (
                        <>
                          <Td>
                            <Input type="date" value={r.trainingDate} className="h-8 w-[140px] text-xs"
                              onChange={(ev) => {
                                const training = ev.target.value;
                                const patch: any = { trainingDate: training };
                                if (training) {
                                  const d = new Date(training);
                                  d.setDate(d.getDate() + 729);
                                  const expiry = d.toISOString().slice(0, 10);
                                  patch.expiryDate = expiry;
                                  patch.nextTrainingDate = addYears(expiry, 2);
                                } else {
                                  patch.expiryDate = "";
                                  patch.nextTrainingDate = "";
                                }
                                updateCourse(e.id, activeCourse, patch);
                              }} />
                          </Td>
                          <Td>
                            <Input type="date" value={r.expiryDate} readOnly disabled className="h-8 w-[140px] text-xs bg-muted/50" />
                          </Td>
                          <Td>
                            <div className="flex items-center gap-1.5">
                              <StatusPill value={status} />
                              <Select value={r.status || "__auto"} onValueChange={(v) => updateCourse(e.id, activeCourse, { status: v === "__auto" ? "" : (v as Status) })}>
                                <SelectTrigger className="h-7 w-[28px] px-1 text-xs" />
                                <SelectContent align="end">
                                  <SelectItem value="__auto">Auto</SelectItem>
                                  {STATUS_VALUES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                          </Td>
                          <Td>
                            <Input type="date" value={r.nextTrainingDate} className="h-8 w-[140px] text-xs"
                              onChange={(ev) => updateCourse(e.id, activeCourse, { nextTrainingDate: ev.target.value })} />
                          </Td>
                          <Td>
                            <AttachmentCell
                              attachment={r.attachment}
                              onAttach={(file) => attachTrainingFile(e.id, file, r.attachment)}
                              onRemove={() => {
                                if (!r.attachment) return;
                                return removeTrainingFile(e.id, r.attachment);
                              }}
                            />
                          </Td>
                        </>
                      )}
                      <Td>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive/10"
                          title={`Delete ${e.id}`}
                          onClick={() => { if (confirm(`Delete ${e.id} (${e.firstName} ${e.lastName})?`)) { remove(e.id); toast.success(`Deleted ${e.id}`); } }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </Td>
                    </tr>
                  );
                })}
                {visible.length === 0 && (
                  <tr><td colSpan={12} className="p-6 text-center text-sm text-muted-foreground">No employees match your filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {visible.length > pageSize && (
            <div className="flex items-center justify-between gap-3 border-t bg-secondary/20 px-4 py-2 text-xs">
              <span className="text-muted-foreground">
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, visible.length)} of {visible.length}
              </span>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="outline" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="px-2">Page {page} / {totalPages}</span>
                <Button size="icon" variant="outline" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Th({ children, className = "", colSpan }: { children?: React.ReactNode; className?: string; colSpan?: number }) {
  return <th colSpan={colSpan} className={`whitespace-nowrap border-b px-3 py-2 font-medium ${className}`}>{children}</th>;
}
function Td({ children, className = "", colSpan }: { children?: React.ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={`px-3 py-1.5 align-middle ${className}`}>{children}</td>;
}

function IdInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  return (
    <Input
      value={local}
      placeholder="EMP / matricule"
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => { const v = local.trim(); if (v && v !== value) onCommit(v); else setLocal(value); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className="h-8 w-[120px] font-mono text-xs"
    />
  );
}

function CellInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <Input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 min-w-[120px] border-transparent bg-transparent px-2 text-sm hover:border-input focus:border-accent"
    />
  );
}

function AttachmentCell({
  attachment,
  onAttach,
  onRemove,
}: {
  attachment: TrainingAttachment | null;
  onAttach: (file: File) => void | Promise<void>;
  onRemove: () => void | Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      await onAttach(file);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not attach the training file.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    try {
      await onRemove();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not remove the training file.");
    }
  };

  return (
    <div className="flex min-w-[180px] items-center gap-1.5">
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        onChange={(event) => handleFile(event.target.files?.[0])}
      />
      <Button type="button" size="icon" variant="outline" className="h-8 w-8" title="Attach training file" onClick={() => inputRef.current?.click()}>
        <Paperclip className="h-3.5 w-3.5" />
      </Button>
      {attachment ? (
        <>
          <button
            type="button"
            className="max-w-[88px] truncate text-left text-xs font-medium text-accent underline-offset-2 hover:underline"
            title={attachment.name}
            onClick={() => openAttachmentFile(attachment).catch((error) => alert(error instanceof Error ? error.message : "Could not open the training file."))}
          >
            {attachment.name}
          </button>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" title="Download file" onClick={() => downloadAttachmentFile(attachment).catch((error) => alert(error instanceof Error ? error.message : "Could not download the training file."))}>
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Remove file" onClick={handleRemove}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </>
      ) : (
        <span className="text-xs text-muted-foreground">No file</span>
      )}
    </div>
  );
}

function PasteDialog({ onApply }: { onApply: (rows: string[][]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><ClipboardPaste className="h-4 w-4" /> Paste from Excel</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Paste rows from Excel</DialogTitle>
          <DialogDescription>
            Copy cells from Excel (5 columns: Last Name · First Name · Duty Category · Job Title · Station) and paste them below. Existing empty rows are filled first; missing rows are added.
          </DialogDescription>
        </DialogHeader>
        <Textarea ref={ref} rows={10} placeholder={"Smith\tJohn\tS4\tCheck-in Agent\tCDG\nDoe\tJane\tS8\tLoad Controller\tORY"} className="font-mono text-xs" />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => {
            const text = ref.current?.value ?? "";
            const rows = text.split(/\r?\n/).map((l) => l.split("\t")).filter((r) => r.some((c) => c.trim()));
            if (rows.length) onApply(rows);
            setOpen(false);
          }}>Apply {`(${(ref.current?.value ?? "").split(/\r?\n/).filter(Boolean).length} rows)`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
