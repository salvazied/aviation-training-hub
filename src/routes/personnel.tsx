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
import { Plus, Trash2, Download, FileText, ClipboardPaste, RotateCcw, Search, Paperclip, ExternalLink, X } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const Route = createFileRoute("/personnel")({
  head: () => ({
    meta: [{ title: "Personnel Tracker — Training Tracker" }],
  }),
  component: PersonnelPage,
});

function PersonnelPage() {
  const { employees, update, updateCourse, add, remove, reset, replaceAll } = usePersonnel();
  const { user } = useAuth();
  const { matrix } = useMatrix();
  const isAdmin = user?.role === "admin";

  const [search, setSearch] = useState("");
  const [stationFilter, setStationFilter] = useState("all");
  const [dutyFilter, setDutyFilter] = useState("all");
  const [activeCourse, setActiveCourse] = useState<string>(COURSES[0]);

  // Courses available in the "Course view" selector — filtered by Training Matrix
  // when a specific duty category is selected.
  const availableCourses = useMemo(
    () => (dutyFilter === "all" ? COURSES : coursesForDuty(matrix, dutyFilter)),
    [dutyFilter, matrix]
  );

  // If active course is no longer available for the chosen duty, fall back.
  useEffect(() => {
    if (!availableCourses.includes(activeCourse) && availableCourses.length > 0) {
      setActiveCourse(availableCourses[0]);
    }
  }, [availableCourses, activeCourse]);

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
    const title = `Personnel Tracker — ${activeCourse}`;
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

    const head = [["ID", "Last Name", "First Name", "Duty", "Job Title", "Station", "Training", "Expiry", "Status", "Next Training"]];
    const body = visible.map((e) => {
      const r = e.courses[activeCourse];
      const st = deriveStatus(r.trainingDate, r.expiryDate, r.status);
      return [e.id, e.lastName, e.firstName, e.dutyCategory, e.jobTitle, e.station, r.trainingDate, r.expiryDate, st, r.nextTrainingDate];
    });
    autoTable(doc, {
      head,
      body,
      startY: 64,
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [36, 49, 92], textColor: 255 },
      alternateRowStyles: { fillColor: [243, 246, 252] },
    });
    doc.save(`personnel-${activeCourse.replace(/[^a-z0-9]+/gi, "_")}.pdf`);
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
          <Button size="sm" onClick={() => add()}><Plus className="h-4 w-4" /> Add employee</Button>
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
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">
              Course view{dutyFilter !== "all" ? ` · ${dutyFilter} (${availableCourses.length})` : ""}:
            </span>
            <Select value={activeCourse} onValueChange={setActiveCourse}>
              <SelectTrigger className="h-8 w-[300px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {availableCourses.map((c) => {
                  const i = COURSES.indexOf(c);
                  return <SelectItem key={c} value={c}>{i + 1}. {c}</SelectItem>;
                })}
              </SelectContent>
            </Select>
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
                  <Th className="bg-accent/10">Training Date</Th>
                  <Th className="bg-accent/10">Expiry Date</Th>
                  <Th className="bg-accent/10">Status</Th>
                  <Th className="bg-accent/10">Next Training</Th>
                  <Th className="bg-accent/10">Training File</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {visible.map((e) => {
                  const r = e.courses[activeCourse];
                  const status = deriveStatus(r.trainingDate, r.expiryDate, r.status);
                  return (
                    <tr key={e.id} className="group border-b hover:bg-secondary/30">
                      <Td className="font-mono text-[12px] text-muted-foreground">{e.id}</Td>
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
                      <Td><CellInput value={e.jobTitle} onChange={(v) => update(e.id, { jobTitle: v })} placeholder="Job title" /></Td>
                      <Td><CellInput value={e.station} onChange={(v) => update(e.id, { station: v })} placeholder="Station" /></Td>
                      <Td>
                        <Input type="date" value={r.trainingDate} className="h-8 w-[140px] text-xs"
                          onChange={(ev) => updateCourse(e.id, activeCourse, { trainingDate: ev.target.value })} />
                      </Td>
                      <Td>
                        <Input type="date" value={r.expiryDate} className="h-8 w-[140px] text-xs"
                          onChange={(ev) => {
                            const expiry = ev.target.value;
                            const patch: any = { expiryDate: expiry };
                            if (expiry && !r.nextTrainingDate) patch.nextTrainingDate = addYears(expiry, 2);
                            updateCourse(e.id, activeCourse, patch);
                          }} />
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
                          onRemove={() => r.attachment && removeTrainingFile(e.id, r.attachment)}
                        />
                      </Td>
                      <Td>
                        {isAdmin && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground opacity-0 transition group-hover:opacity-100"
                            onClick={() => { if (confirm(`Delete ${e.id}?`)) remove(e.id); }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
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
        </CardContent>
      </Card>
    </div>
  );
}

function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <th className={`whitespace-nowrap border-b px-3 py-2 font-medium ${className}`}>{children}</th>;
}
function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-1.5 align-middle ${className}`}>{children}</td>;
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
