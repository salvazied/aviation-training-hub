import { createFileRoute } from "@tanstack/react-router";
import React, { useEffect, useMemo, useRef, useState } from "react";

import { usePersonnel } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { COURSES, DUTY_CATEGORIES, STATUS_VALUES, TRAINING_TYPE_VALUES, addYears, deriveStatus, emptyCourse, emptyEmployee, type Status, type TrainingType, type TrainingAttachment } from "@/lib/data";
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
import { Plus, Trash2, Download, FileText, Upload, RotateCcw, Search, Paperclip, ExternalLink, X, Save, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Eye, ChevronDown } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import * as XLSX from "xlsx";


export const Route = createFileRoute("/personnel")({
  head: () => ({
    meta: [{ title: "Personnel Tracker — Training Tracker" }],
  }),
  component: PersonnelPage,
});

function PersonnelPage() {
  const { employees, update, updateCourse, add, remove, updateId, reset, replaceAll } = usePersonnel();
  const { user } = useAuth();
  const { matrix, setCell } = useMatrix();
  const isAdmin = user?.role === "admin";

  const [search, setSearch] = useState("");
  const [stationFilter, setStationFilter] = useState("all");
  const [dutyFilter, setDutyFilter] = useState("all");
  const [complianceFilter, setComplianceFilter] = useState<"all" | "compliant" | "non-compliant" | "training">("all");

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

  useEffect(() => { setPage(1); }, [search, stationFilter, dutyFilter, complianceFilter, pageSize, activeCourse]);

  const stations = useMemo(() => Array.from(new Set(employees.map((e) => e.station).filter(Boolean))).sort(), [employees]);

  const visible = useMemo(
    () =>
      employees.filter((e) => {
        if (stationFilter !== "all" && e.station !== stationFilter) return false;
        if (dutyFilter !== "all" && e.dutyCategory !== dutyFilter) return false;
        if (complianceFilter !== "all") {
          const eff = e.complianceOverride
            ? e.complianceOverride
            : (() => {
                const c = { mandatory: e.dutyCategory ? mandatoryCoursesForDuty(matrix, e.dutyCategory) : [] };
                const mandatoryList = c.mandatory;
                let done = 0, over = 0, sched = 0;
                mandatoryList.forEach((cn) => {
                  const r = e.courses[cn]; if (!r) return;
                  const s = deriveStatus(r.trainingDate, r.expiryDate, r.status);
                  if (s === "Completed") done++;
                  if (s === "Overdue") over++;
                  if (s === "Scheduled") sched++;
                });
                if (mandatoryList.length > 0 && done === mandatoryList.length && over === 0) return "compliant";
                if (sched > 0) return "training";
                return "non-compliant";
              })();
          if (eff !== complianceFilter) return false;
        }
        if (search) {
          const q = search.toLowerCase();
          return [e.id, e.lastName, e.firstName, e.jobTitle, e.station, e.dutyCategory]
            .some((v) => (v || "").toLowerCase().includes(q));
        }
        return true;
      }),
    [employees, search, stationFilter, dutyFilter, complianceFilter, matrix]
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

  /** Effective compliance status: honors admin override, else derives from mandatory course statuses. */
  const effectiveComplianceOf = (e: typeof employees[number]): "compliant" | "non-compliant" | "training" => {
    if (e.complianceOverride) return e.complianceOverride;
    const comp = complianceOf(e);


    if (comp.compliant) return "compliant";
    const list = e.dutyCategory ? mandatoryCoursesForDuty(matrix, e.dutyCategory) : [];
    const hasScheduled = list.some((c) => {
      const r = e.courses[c];
      if (!r) return false;
      const s = deriveStatus(r.trainingDate, r.expiryDate, r.status);
      return s === "Scheduled";
    });
    if (hasScheduled) return "training";
    return "non-compliant";
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
          <ImportFileButton onImport={(imported) => {
            // Merge by employee ID: update matching, add new; keep existing employees not present in file.
            const map = new Map(employees.map((e) => [e.id, e]));
            let updated = 0, added = 0;
            imported.forEach((row) => {
              const existing = map.get(row.id);
              if (existing) {
                const mergedCourses: typeof existing.courses = { ...existing.courses };
                COURSES.forEach((c) => {
                  const src = row.courses[c];
                  if (!src) return;
                  const has = src.trainingDate || src.expiryDate || src.status || src.nextTrainingDate;
                  if (has) mergedCourses[c] = { ...existing.courses[c], ...src };
                });
                map.set(row.id, {
                  ...existing,
                  lastName: row.lastName || existing.lastName,
                  firstName: row.firstName || existing.firstName,
                  dutyCategory: row.dutyCategory || existing.dutyCategory,
                  jobTitle: row.jobTitle || existing.jobTitle,
                  station: row.station || existing.station,
                  courses: mergedCourses,
                });
                updated++;
              } else {
                const base = emptyEmployee(row.id);
                COURSES.forEach((c) => {
                  const src = row.courses[c];
                  if (src) base.courses[c] = { ...base.courses[c], ...src };
                });
                map.set(row.id, {
                  ...base,
                  lastName: row.lastName,
                  firstName: row.firstName,
                  dutyCategory: row.dutyCategory,
                  jobTitle: row.jobTitle,
                  station: row.station,
                });
                added++;
              }
            });
            replaceAll(Array.from(map.values()));
            toast.success(`Imported: ${added} added · ${updated} updated`);
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
        <CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-5">
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
          <Select value={complianceFilter} onValueChange={(v) => setComplianceFilter(v as any)}>
            <SelectTrigger><SelectValue placeholder="Compliance status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="compliant">Compliant</SelectItem>
              <SelectItem value="non-compliant">Non-compliant</SelectItem>
              <SelectItem value="training">In training</SelectItem>
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

                  <Th>Name</Th>

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
                      <Td>
                        <CellInput
                          value={[e.lastName, e.firstName].filter(Boolean).join(" ")}
                          onChange={(v) => update(e.id, { lastName: v, firstName: "" })}
                          placeholder="Full name"
                        />
                      </Td>

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
                                {(() => {
                                  const eff = effectiveComplianceOf(e);
                                  const badge =
                                    eff === "compliant" ? (
                                      <Badge className="gap-1 bg-[color-mix(in_oklab,var(--success)_20%,transparent)] text-[var(--success)] hover:bg-[color-mix(in_oklab,var(--success)_30%,transparent)]">
                                        <CheckCircle2 className="h-3 w-3" /> Compliant
                                      </Badge>
                                    ) : eff === "training" ? (
                                      <Badge className="gap-1 bg-[oklch(0.9_0.12_240)] text-[oklch(0.35_0.15_240)] hover:bg-[oklch(0.85_0.14_240)]">
                                        <AlertCircle className="h-3 w-3" /> In training
                                      </Badge>
                                    ) : (
                                      <Badge variant="destructive" className="gap-1">
                                        <AlertCircle className="h-3 w-3" /> Non-compliant
                                      </Badge>
                                    );
                                  if (!isAdmin) return badge;
                                  return (
                                    <div className="flex items-center gap-1">
                                      {badge}
                                      <Select
                                        value={e.complianceOverride || "__auto"}
                                        onValueChange={(v) =>
                                          update(e.id, { complianceOverride: v === "__auto" ? "" : (v as any) })
                                        }
                                      >
                                        <SelectTrigger className="h-6 w-[24px] px-1 text-[10px]" title="Override compliance" />
                                        <SelectContent align="end">
                                          <SelectItem value="__auto">Auto</SelectItem>
                                          <SelectItem value="compliant">Compliant</SelectItem>
                                          <SelectItem value="training">In training</SelectItem>
                                          <SelectItem value="non-compliant">Non-compliant</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  );
                                })()}

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
                            <div className="flex items-center gap-1.5">
                              <Input type="date" value={r.nextTrainingDate} className="h-8 w-[130px] text-xs"
                                onChange={(ev) => updateCourse(e.id, activeCourse, { nextTrainingDate: ev.target.value })} />
                              <Select
                                value={(r.trainingType as string) || "__none"}
                                onValueChange={(v) => updateCourse(e.id, activeCourse, { trainingType: (v === "__none" ? "" : v) as TrainingType })}
                              >
                                <SelectTrigger className="h-8 w-[110px] text-xs" title="Training type"><SelectValue placeholder="Type" /></SelectTrigger>
                                <SelectContent align="end">
                                  <SelectItem value="__none">—</SelectItem>
                                  {TRAINING_TYPE_VALUES.map((t) => <SelectItem key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
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
                          <EmployeeTrainingBreakdown
                            employee={e}
                            matrix={matrix}
                            isAdmin={isAdmin}
                            onCourseChange={(course, patch) => updateCourse(e.id, course, patch)}
                            onToggleKind={(course, kind) => {
                              const i = COURSES.indexOf(course);
                              const j = DUTY_CATEGORIES.findIndex((d) => d.code === e.dutyCategory);
                              if (i < 0 || j < 0) return;
                              const value = kind === "mandatory" ? "✓" : kind === "optional" ? "O" : "-";
                              setCell(i, j, value);
                            }}
                          />

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

export interface ImportedEmployee {
  id: string;
  lastName: string;
  firstName: string;
  dutyCategory: string;
  jobTitle: string;
  station: string;
  courses: Record<string, Partial<ReturnType<typeof emptyCourse>>>;
}

function normalizeStatus(raw: string): Status {
  const v = raw.trim();
  if (!v) return "";
  const known = STATUS_VALUES as string[];
  if (known.includes(v)) return v as Status;
  const lower = v.toLowerCase();
  if (lower === "expired") return "Expired";
  if (lower === "completed" || lower === "valid") return "Completed";
  if (lower === "scheduled") return "Scheduled";
  if (lower === "overdue") return "Overdue";
  if (lower.includes("recurrent")) return "Recurrent Due";
  if (lower.includes("pending")) return "Pending Initial Training";
  return "";
}

function normalizeDate(raw: any): string {
  if (raw == null || raw === "") return "";
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  const s = String(raw).trim();
  if (!s) return "";
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return "";
}

function parseImportRows(rows: string[][]): ImportedEmployee[] {
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => String(h ?? "").trim());
  // Map course -> {trainingIdx, expiryIdx, statusIdx, nextIdx}
  const courseIdx: Record<string, { t?: number; e?: number; s?: number; n?: number }> = {};
  header.forEach((h, i) => {
    const m = h.match(/^(.*)\s+[—-]\s+(Training|Expiry|Status|Next Training)$/i);
    if (!m) return;
    const name = m[1].trim();
    const kind = m[2].toLowerCase();
    courseIdx[name] = courseIdx[name] || {};
    if (kind === "training") courseIdx[name].t = i;
    else if (kind === "expiry") courseIdx[name].e = i;
    else if (kind === "status") courseIdx[name].s = i;
    else courseIdx[name].n = i;
  });
  const idIdx = header.findIndex((h) => /employee\s*id/i.test(h));
  const lastIdx = header.findIndex((h) => /last\s*name/i.test(h));
  const firstIdx = header.findIndex((h) => /first\s*name/i.test(h));
  const dutyIdx = header.findIndex((h) => /duty/i.test(h));
  const jobIdx = header.findIndex((h) => /job/i.test(h));
  const stationIdx = header.findIndex((h) => /station/i.test(h));

  const out: ImportedEmployee[] = [];
  rows.slice(1).forEach((r) => {
    if (!r.some((c) => String(c ?? "").trim())) return;
    const id = String(r[idIdx] ?? "").trim();
    if (!id) return;
    const emp: ImportedEmployee = {
      id,
      lastName: String(r[lastIdx] ?? "").trim(),
      firstName: String(r[firstIdx] ?? "").trim(),
      dutyCategory: String(r[dutyIdx] ?? "").trim(),
      jobTitle: String(r[jobIdx] ?? "").trim(),
      station: String(r[stationIdx] ?? "").trim(),
      courses: {},
    };
    Object.entries(courseIdx).forEach(([name, cols]) => {
      if (!COURSES.includes(name)) return;
      const training = cols.t != null ? normalizeDate(r[cols.t]) : "";
      const expiry = cols.e != null ? normalizeDate(r[cols.e]) : "";
      const statusRaw = cols.s != null ? String(r[cols.s] ?? "").trim() : "";
      const next = cols.n != null ? normalizeDate(r[cols.n]) : "";
      if (!training && !expiry && !statusRaw && !next) return;
      emp.courses[name] = {
        trainingDate: training,
        expiryDate: expiry,
        status: normalizeStatus(statusRaw),
        nextTrainingDate: next,
      };
    });
    out.push(emp);
  });
  return out;
}

function ImportFileButton({ onImport }: { onImport: (rows: ImportedEmployee[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handle = async (file: File | undefined) => {
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "", raw: false });
      const parsed = parseImportRows(rows as string[][]);
      if (!parsed.length) {
        toast.error("No valid rows detected. Expected the same columns as the CSV/XLSX export.");
        return;
      }
      onImport(parsed);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
        className="sr-only"
        onChange={(ev) => handle(ev.target.files?.[0])}
      />
      <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
        <Upload className="h-4 w-4" /> Import Excel/CSV
      </Button>
    </>
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

function EmployeeTrainingBreakdown({
  employee,
  matrix,
  isAdmin,
  onCourseChange,
  onToggleKind,
}: {
  employee: any;
  matrix: string[][];
  isAdmin: boolean;
  onCourseChange: (course: string, patch: Partial<ReturnType<typeof emptyCourse>>) => void;
  onToggleKind: (course: string, kind: "mandatory" | "optional" | "none") => void;
}) {
  const mandatory = employee.dutyCategory ? mandatoryCoursesForDuty(matrix, employee.dutyCategory) : [];
  const optional = employee.dutyCategory ? optionalCoursesForDuty(matrix, employee.dutyCategory) : [];
  const assigned = new Set([...mandatory, ...optional]);
  const unassigned = COURSES.filter((c) => !assigned.has(c));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const soonDays = 60;

  const attachFile = async (course: string, file: File, previous: TrainingAttachment | null) => {
    if (previous) await deleteAttachmentFile(previous.id);
    const attachment = await saveAttachmentFile(file);
    onCourseChange(course, { attachment });
  };
  const removeFile = async (course: string, attachment: TrainingAttachment) => {
    await deleteAttachmentFile(attachment.id);
    onCourseChange(course, { attachment: null });
  };

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
      <div key={courseName} className="flex flex-col gap-1.5 border-b px-3 py-2 text-xs last:border-b-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-medium">{courseName}</span>
          <Select value={required ? "mandatory" : "optional"} onValueChange={(v) => onToggleKind(courseName, v as any)}>
            <SelectTrigger className="h-6 w-[110px] text-[10px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mandatory">Mandatory</SelectItem>
              <SelectItem value="optional">Optional</SelectItem>
              <SelectItem value="none">Remove</SelectItem>
            </SelectContent>
          </Select>
          <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${indiv.cls}`}>{indiv.label}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
            Training
            <Input
              type="date"
              value={training}
              className="h-7 w-[140px] text-[11px]"
              onChange={(ev) => {
                const t = ev.target.value;
                const patch: any = { trainingDate: t };
                if (t) {
                  const d = new Date(t);
                  d.setDate(d.getDate() + 729);
                  const exp = d.toISOString().slice(0, 10);
                  patch.expiryDate = exp;
                  patch.nextTrainingDate = addYears(exp, 2);
                } else {
                  patch.expiryDate = "";
                  patch.nextTrainingDate = "";
                }
                onCourseChange(courseName, patch);
              }}
            />
          </label>
          <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
            Expiry
            <Input
              type="date"
              value={expiry}
              className="h-7 w-[140px] text-[11px]"
              onChange={(ev) => {
                const exp = ev.target.value;
                onCourseChange(courseName, {
                  expiryDate: exp,
                  nextTrainingDate: exp ? addYears(exp, 2) : "",
                });
              }}
            />
          </label>
          <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
            Type
            <Select
              value={(r?.trainingType as string) || "__none"}
              onValueChange={(v) =>
                onCourseChange(courseName, { trainingType: (v === "__none" ? "" : v) as TrainingType })
              }
            >
              <SelectTrigger className="h-7 w-[130px] text-[11px]"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">—</SelectItem>
                {TRAINING_TYPE_VALUES.map((t) => (
                  <SelectItem key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <AttachmentCell
            attachment={r?.attachment ?? null}
            onAttach={(file) => attachFile(courseName, file, r?.attachment ?? null)}
            onRemove={() => (r?.attachment ? removeFile(courseName, r.attachment) : undefined)}
          />

        </div>

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
      {unassigned.length > 0 && (
        <div className="mt-3 rounded-md border border-dashed p-3">
          <div className="mb-2 text-[11px] font-semibold text-muted-foreground">
            Add a course to this duty category ({employee.dutyCategory})
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select onValueChange={(v) => { if (v) onToggleKind(v, "mandatory"); }}>
              <SelectTrigger className="h-7 w-[280px] text-[11px]"><SelectValue placeholder="Add as Mandatory…" /></SelectTrigger>
              <SelectContent>
                {unassigned.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select onValueChange={(v) => { if (v) onToggleKind(v, "optional"); }}>
              <SelectTrigger className="h-7 w-[280px] text-[11px]"><SelectValue placeholder="Add as Optional…" /></SelectTrigger>
              <SelectContent>
                {unassigned.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-[10px] text-muted-foreground">Changes apply to all employees in {employee.dutyCategory}.</span>
          </div>
        </div>
      )}
    </div>
  );
}


