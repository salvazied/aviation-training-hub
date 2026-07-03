import { createFileRoute } from "@tanstack/react-router";
import React, { useEffect, useMemo, useRef, useState } from "react";

import { usePersonnel } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { COURSES, DUTY_CATEGORIES, STATUS_VALUES, addYears, deriveStatus, emptyCourse, type Status, type TrainingAttachment } from "@/lib/data";
import { useMatrix, coursesForDuty, mandatoryCoursesForDuty, optionalCoursesForDuty } from "@/lib/matrix-store";
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
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Download, FileText, ClipboardPaste, RotateCcw, Search, Paperclip, ExternalLink, X, Save, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Eye, ChevronDown } from "lucide-react";
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
  const [activeCourse, setActiveCourse] = useState<string>(ALL_COURSES);
  const [pageSize, setPageSize] = useState<number>(50);
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const attachDossier = async (employeeId: string, file: File, previous: TrainingAttachment | null | undefined) => {
    if (previous) await deleteAttachmentFile(previous.id);
    const attachment = await saveAttachmentFile(file);
    update(employeeId, { dossier: attachment });
  };
  const removeDossier = async (employeeId: string, attachment: TrainingAttachment) => {
    await deleteAttachmentFile(attachment.id);
    update(employeeId, { dossier: null });
  };



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
    const list = e.dutyCategory ? coursesForDuty(matrix, e.dutyCategory) : COURSES;
    list.forEach((c) => {
      const r = e.courses[c];
      if (!r) return;
      const s = deriveStatus(r.trainingDate, r.expiryDate, r.status);
      if (s && counts[s] !== undefined) counts[s]++;
    });
    return counts;
  };

  /** Employee compliance based on MANDATORY courses only. */
  const complianceOf = (e: typeof employees[number]) => {
    const mandatory = e.dutyCategory ? mandatoryCoursesForDuty(matrix, e.dutyCategory) : [];
    const optional = e.dutyCategory ? optionalCoursesForDuty(matrix, e.dutyCategory) : [];
    const totalAssigned = mandatory.length + optional.length;
    let mandatoryDone = 0;
    let overdueMandatory = 0;
    mandatory.forEach((c) => {
      const r = e.courses[c];
      if (!r) return;
      const s = deriveStatus(r.trainingDate, r.expiryDate, r.status);
      if (s === "Completed") mandatoryDone++;
      if (s === "Overdue") overdueMandatory++;
    });
    let optionalDone = 0;
    optional.forEach((c) => {
      const r = e.courses[c];
      if (!r) return;
      const s = deriveStatus(r.trainingDate, r.expiryDate, r.status);
      if (s === "Completed") optionalDone++;
    });
    const compliant = mandatory.length > 0 && mandatoryDone === mandatory.length && overdueMandatory === 0;
    const totalDone = mandatoryDone + optionalDone;
    return { mandatory, optional, totalAssigned, mandatoryDone, optionalDone, totalDone, compliant, overdueMandatory };
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
                  <Th className="w-8"></Th>
                  <Th>ID</Th>

                  <Th>Last Name</Th>
                  <Th>First Name</Th>
                  <Th>Duty</Th>
                  <Th>Job Title / Function</Th>
                  <Th>Station</Th>
                  {activeCourse === ALL_COURSES ? (
                    <Th className="bg-accent/10" colSpan={5}>Mandatory progress · Compliance</Th>
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
                  const isOpen = expanded.has(e.id);
                  const totalCols = activeCourse === ALL_COURSES ? 8 : 12;
                  return (
                    <React.Fragment key={e.id}>
                    <tr
                      className="group cursor-pointer border-b hover:bg-secondary/30"
                      onClick={(ev) => {
                        const t = ev.target as HTMLElement;
                        if (t.closest("button, input, select, a, [role='combobox'], [role='dialog']")) return;
                        setDetailId(e.id);
                      }}
                    >
                      <Td className="w-8 pr-0">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title={isOpen ? "Hide training details" : "Show training details"}
                          onClick={(ev) => { ev.stopPropagation(); toggleExpanded(e.id); }}
                        >
                          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                        </Button>
                      </Td>


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
                            const comp = complianceOf(e);
                            const mandTotal = comp.mandatory.length;
                            const pct = mandTotal ? Math.round((comp.mandatoryDone / mandTotal) * 100) : 0;
                            const barColor = comp.compliant
                              ? "bg-[var(--success)]"
                              : comp.overdueMandatory > 0
                              ? "bg-destructive"
                              : "bg-[oklch(0.7_0.15_80)]";
                            return (
                              <div className="flex flex-wrap items-center gap-3">
                                <div className="min-w-[190px] flex-1 max-w-[280px]">
                                  <div className="mb-1 flex items-center justify-between text-[11px]">
                                    <span className="font-medium">
                                      Mandatory {comp.mandatoryDone}/{mandTotal}
                                    </span>
                                    <span className="text-muted-foreground">
                                      {comp.totalDone}/{comp.totalAssigned} total
                                    </span>
                                  </div>
                                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                    <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                                {mandTotal === 0 ? (
                                  <Badge variant="secondary" className="text-[10px]">No duty set</Badge>
                                ) : comp.compliant ? (
                                  <Badge className="gap-1 bg-[color-mix(in_oklab,var(--success)_20%,transparent)] text-[var(--success)] hover:bg-[color-mix(in_oklab,var(--success)_30%,transparent)]">
                                    <CheckCircle2 className="h-3 w-3" /> Compliant
                                  </Badge>
                                ) : (
                                  <Badge variant="destructive" className="gap-1">
                                    <AlertCircle className="h-3 w-3" /> Non-compliant
                                  </Badge>
                                )}
                                {comp.optional.length > 0 && (
                                  <span className="text-[10px] text-muted-foreground">
                                    Optional {comp.optionalDone}/{comp.optional.length}
                                  </span>
                                )}
                                <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]" onClick={(ev) => { ev.stopPropagation(); setDetailId(e.id); }}>
                                  <Eye className="h-3 w-3" /> Details
                                </Button>
                                <DossierButton
                                  attachment={e.dossier ?? null}
                                  onAttach={(file) => attachDossier(e.id, file, e.dossier ?? null)}
                                  onRemove={() => e.dossier ? removeDossier(e.id, e.dossier) : undefined}
                                />

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
                    {isOpen && (
                      <tr className="bg-secondary/10">
                        <td colSpan={totalCols} className="border-b p-0">
                          <EmployeeTrainingBreakdown employee={e} matrix={matrix} />
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
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

      <EmployeeDetailSheet
        employee={detailId ? employees.find((e) => e.id === detailId) ?? null : null}
        matrix={matrix}
        onClose={() => setDetailId(null)}
        complianceOf={complianceOf}
      />
    </div>
  );
}

function EmployeeDetailSheet({
  employee,
  matrix,
  onClose,
  complianceOf,
}: {
  employee: any;
  matrix: string[][];
  onClose: () => void;
  complianceOf: (e: any) => {
    mandatory: string[];
    optional: string[];
    totalAssigned: number;
    mandatoryDone: number;
    optionalDone: number;
    totalDone: number;
    compliant: boolean;
    overdueMandatory: number;
  };
}) {
  const open = !!employee;
  if (!employee) {
    return (
      <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <SheetContent side="right" className="w-full sm:max-w-xl" />
      </Sheet>
    );
  }
  const comp = complianceOf(employee);
  const mandTotal = comp.mandatory.length;
  const pct = mandTotal ? Math.round((comp.mandatoryDone / mandTotal) * 100) : 0;

  const renderRow = (courseName: string) => {
    const r = employee.courses[courseName];
    const s = r ? deriveStatus(r.trainingDate, r.expiryDate, r.status) : "";
    return (
      <div key={courseName} className="flex items-start justify-between gap-3 border-b py-2 last:border-b-0">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{courseName}</div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            <span>Training: <span className="font-mono">{r?.trainingDate || "—"}</span></span>
            <span>Expiry: <span className="font-mono">{r?.expiryDate || "—"}</span></span>
            <span>Next: <span className="font-mono">{r?.nextTrainingDate || "—"}</span></span>
          </div>
        </div>
        <StatusPill value={s} />
      </div>
    );
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex flex-wrap items-center gap-2">
            {employee.firstName} {employee.lastName}
            <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{employee.id}</span>
          </SheetTitle>
          <SheetDescription>
            {employee.dutyCategory || "—"} · {employee.jobTitle || "—"} · {employee.station || "—"}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          <div className="rounded-md border bg-secondary/30 p-3">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium">Mandatory progress</span>
              <span>{comp.mandatoryDone}/{mandTotal} · {pct}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full transition-all ${
                  comp.compliant ? "bg-[var(--success)]" : comp.overdueMandatory ? "bg-destructive" : "bg-[oklch(0.7_0.15_80)]"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs">
              {mandTotal === 0 ? (
                <Badge variant="secondary">No duty category set — assign one in the Personnel table</Badge>
              ) : comp.compliant ? (
                <Badge className="gap-1 bg-[color-mix(in_oklab,var(--success)_20%,transparent)] text-[var(--success)]">
                  <CheckCircle2 className="h-3 w-3" /> Compliant
                </Badge>
              ) : (
                <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" /> Non-compliant</Badge>
              )}
              <span className="text-muted-foreground">
                Optional: {comp.optionalDone}/{comp.optional.length} · Total assigned: {comp.totalAssigned}
              </span>
            </div>
          </div>

          <section className="rounded-md border">
            <header className="flex items-center justify-between bg-secondary/50 px-3 py-2">
              <h3 className="text-sm font-semibold">
                Mandatory courses <span className="text-muted-foreground">({comp.mandatory.length})</span>
              </h3>
              <Badge variant="outline" className="text-[10px]">Required for compliance</Badge>
            </header>
            <div className="px-3">
              {comp.mandatory.length === 0
                ? <div className="py-3 text-xs text-muted-foreground">No mandatory course defined for this duty category.</div>
                : comp.mandatory.map(renderRow)}
            </div>
          </section>

          <section className="rounded-md border">
            <header className="flex items-center justify-between bg-secondary/50 px-3 py-2">
              <h3 className="text-sm font-semibold">
                Optional courses <span className="text-muted-foreground">({comp.optional.length})</span>
              </h3>
              <Badge variant="outline" className="text-[10px]">Not required</Badge>
            </header>
            <div className="px-3">
              {comp.optional.length === 0
                ? <div className="py-3 text-xs text-muted-foreground">No optional course defined for this duty category.</div>
                : comp.optional.map(renderRow)}
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
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

function DossierButton({
  attachment,
  onAttach,
  onRemove,
}: {
  attachment: TrainingAttachment | null;
  onAttach: (file: File) => void | Promise<void>;
  onRemove: () => void | Promise<void> | undefined;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hasFile = !!attachment;
  const handleClick = (ev: React.MouseEvent) => {
    ev.stopPropagation();
    if (hasFile) {
      openAttachmentFile(attachment!).catch((error) =>
        alert(error instanceof Error ? error.message : "Could not open the file."),
      );
    } else {
      inputRef.current?.click();
    }
  };
  const handleReplace = (ev: React.MouseEvent) => {
    ev.stopPropagation();
    inputRef.current?.click();
  };
  const handleRemove = async (ev: React.MouseEvent) => {
    ev.stopPropagation();
    try { await onRemove(); } catch (e) { alert(e instanceof Error ? e.message : "Could not remove file."); }
  };
  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          try { await onAttach(file); }
          catch (e) { alert(e instanceof Error ? e.message : "Could not attach file."); }
          finally { if (inputRef.current) inputRef.current.value = ""; }
        }}
      />
      <Button
        type="button"
        size="icon"
        variant={hasFile ? "default" : "ghost"}
        className={`h-7 w-7 ${hasFile ? "bg-accent text-accent-foreground hover:bg-accent/90" : "text-muted-foreground"}`}
        title={hasFile ? `Open dossier: ${attachment!.name}` : "Attach training dossier (any format)"}
        onClick={handleClick}
      >
        <Paperclip className="h-3.5 w-3.5" />
      </Button>
      {hasFile && (
        <>
          <Button type="button" size="icon" variant="ghost" className="h-6 w-6" title="Replace file" onClick={handleReplace}>
            <ExternalLink className="h-3 w-3" />
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-destructive" title="Remove file" onClick={handleRemove}>
            <X className="h-3 w-3" />
          </Button>
        </>
      )}
    </div>
  );
}

function EmployeeTrainingBreakdown({ employee, matrix }: { employee: any; matrix: string[][] }) {
  const mandatory = employee.dutyCategory ? mandatoryCoursesForDuty(matrix, employee.dutyCategory) : [];
  const optional = employee.dutyCategory ? optionalCoursesForDuty(matrix, employee.dutyCategory) : [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const soonDays = 60;

  const rowFor = (courseName: string, required: boolean) => {
    const r = employee.courses[courseName];
    const training = r?.trainingDate || "";
    const expiry = r?.expiryDate || "";
    const s = r ? deriveStatus(training, expiry, r.status) : "";
    let indiv: { label: string; cls: string };
    if (!training && !expiry) {
      indiv = { label: "Missing", cls: "bg-muted text-muted-foreground" };
    } else if (s === "Overdue") {
      indiv = { label: "Expired", cls: "bg-destructive/15 text-destructive" };
    } else if (expiry) {
      const exp = new Date(expiry);
      const diffDays = Math.round((exp.getTime() - today.getTime()) / 86_400_000);
      if (diffDays <= soonDays) indiv = { label: `Renew soon (${diffDays}d)`, cls: "bg-[oklch(0.95_0.08_80)] text-[oklch(0.45_0.15_60)]" };
      else indiv = { label: "Valid", cls: "bg-[color-mix(in_oklab,var(--success)_18%,transparent)] text-[var(--success)]" };
    } else {
      indiv = { label: s || "Pending", cls: "bg-muted text-muted-foreground" };
    }
    return (
      <div key={courseName} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 border-b px-3 py-2 text-xs last:border-b-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{courseName}</span>
            {required ? (
              <span className="rounded bg-[color-mix(in_oklab,var(--success)_20%,transparent)] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[var(--success)]">Mandatory</span>
            ) : (
              <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent">Optional</span>
            )}
          </div>
        </div>
        <span className="font-mono text-[11px] text-muted-foreground">Training: {training || "—"}</span>
        <span className="font-mono text-[11px] text-muted-foreground">Expiry: {expiry || "—"}</span>
        <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${indiv.cls}`}>{indiv.label}</span>
      </div>
    );
  };

  if (!employee.dutyCategory) {
    return <div className="p-4 text-xs text-muted-foreground">Assign a duty category to see this employee's training breakdown.</div>;
  }

  return (
    <div className="border-l-4 border-accent/40 bg-background/70 px-2 py-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-md border">
          <div className="flex items-center justify-between border-b bg-secondary/40 px-3 py-1.5">
            <h4 className="text-xs font-semibold">Mandatory courses ({mandatory.length})</h4>
            <span className="text-[10px] text-muted-foreground">Impact compliance</span>
          </div>
          {mandatory.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">None.</div>
          ) : mandatory.map((c) => rowFor(c, true))}
        </div>
        <div className="rounded-md border">
          <div className="flex items-center justify-between border-b bg-secondary/40 px-3 py-1.5">
            <h4 className="text-xs font-semibold">Optional courses ({optional.length})</h4>
            <span className="text-[10px] text-muted-foreground">Do not affect compliance</span>
          </div>
          {optional.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">None.</div>
          ) : optional.map((c) => rowFor(c, false))}
        </div>
      </div>
    </div>
  );
}

