// Source of truth derived from the uploaded training_tracker_EN_v2 workbook.

export const DUTY_CATEGORIES: { code: string; description: string }[] = [
  { code: "S1", description: "Ground Operation Manager / Station Manager" },
  { code: "S2", description: "Coordinator / Ramp Supervisor" },
  { code: "S3", description: "Load Master / Loading Supervisor" },
  { code: "S4", description: "Passenger Handling – Check-in, Boarding, Lost & Found" },
  { code: "S5", description: "Baggage Handling – Sorting / Makeup Operations" },
  { code: "S6", description: "Cargo Handling – Cargo Operations & Storage Area" },
  { code: "S7", description: "Aircraft Handling & Loading – Cargo holds, doors, securing load" },
  { code: "S8", description: "Load Control" },
  { code: "S9", description: "ULD Operator" },
  { code: "S10", description: "Cargo Acceptance" },
  { code: "S11", description: "Ground Support Equipment (GSE) – Aircraft Movement & Equipment Operators" },
  { code: "S15", description: "Aircraft Interior Cleaner" },
];

export const COURSES: string[] = [
  "Passenger Handling",
  "Departures Control System (DCS)",
  "Baggage Handling",
  "Load Control",
  "Specific Aircraft Type Load Sheet",
  "Dangerous Goods – DGR (Carrier Operators)",
  "Airside Operations",
  "Airside Safety",
  "Aircraft Handling & Loading",
  "ULD Operations",
  "Safety Management System (SMS)",
  "Emergency Response Plan (ERP)",
  "Human Factors",
  "Security Awareness",
  "GOM Familiarization",
  "Station Management",
  "Lost & Found",
  "Aircraft Type Familiarization",
  "Aircraft GSE Operation",
  "PRM – Passenger with Reduced Mobility Handling",
  "GSE Marshaling",
  "Turnaround Coordination",
  "Live Animals Regulations",
];

// Matrix rows correspond to COURSES order, columns to DUTY_CATEGORIES order.
// "✓" required, "-" not required, "Cat N" DGR category code.
export const TRAINING_MATRIX: string[][] = [
  ["✓","-","-","✓","-","-","-","-","-","-","-","-"],
  ["✓","-","-","✓","-","-","-","-","-","-","-","-"],
  ["-","-","-","-","✓","✓","✓","-","-","-","-","-"],
  ["✓","-","✓","✓","-","✓","✓","✓","✓","-","-","-"],
  ["-","-","-","-","-","-","-","✓","-","-","-","-"],
  ["7.6","7.4","7.6","7.5","7.4","7.4","7.4","7.6","7.4","7.3","7.4","-"],
  ["✓","✓","✓","-","-","-","-","-","-","-","✓","-"],
  ["✓","✓","✓","✓","✓","✓","✓","✓","✓","-","✓","✓"],
  ["-","✓","✓","-","✓","✓","✓","✓","✓","-","-","-"],
  ["-","✓","✓","-","✓","✓","✓","✓","✓","-","-","-"],
  ["✓","✓","✓","✓","✓","✓","✓","✓","✓","✓","✓","✓"],
  ["✓","✓","✓","✓","✓","✓","✓","✓","✓","✓","✓","✓"],
  ["✓","✓","✓","✓","✓","✓","✓","✓","✓","✓","✓","-"],
  ["✓","✓","✓","✓","✓","✓","✓","✓","✓","✓","✓","✓"],
  ["✓","✓","✓","✓","✓","✓","✓","✓","✓","✓","✓","-"],
  ["✓","-","-","-","-","-","-","-","-","-","-","-"],
  ["-","-","-","✓","-","-","-","-","-","-","-","-"],
  ["✓","✓","✓","✓","✓","✓","✓","-","✓","-","✓","✓"],
  ["-","✓","-","-","✓","✓","✓","-","✓","-","✓","-"],
  ["-","-","-","✓","-","-","-","-","-","-","-","-"],
  ["-","✓","-","-","-","-","-","-","-","-","✓","-"],
  ["✓","✓","-","-","-","-","-","-","-","-","-","-"],
  ["-","-","-","-","-","✓","✓","-","-","-","✓","-"],
];

export const RETURN_FROM_ABSENCE = [
  {
    period: "Up to 3 months",
    minMonths: 0,
    maxMonths: 3,
    action:
      "Brief the employee on any procedural, organizational, or equipment/infrastructure updates/changes that might have occurred during their absence. The briefing shall be documented and filed accordingly.",
    notes: "Documented briefing required",
  },
  {
    period: "Between 3 and 12 months",
    minMonths: 3,
    maxMonths: 12,
    action:
      "Brief the employee on updates/changes. Additionally, deliver On-the-Job Training (OJT) to ensure competence has been maintained. Should any gaps be identified, a period of requalification training shall be initiated.",
    notes: "OJT + requalification if gaps identified",
  },
  {
    period: "Between 12 and 24 months",
    minMonths: 12,
    maxMonths: 24,
    action:
      "Brief the employee on any updates/changes. Additionally, deliver requalification training including a documented, formal assessment of competence (as per initial training) to confirm the employee remains competent to perform their role.",
    notes: "Full requalification + formal competence assessment",
  },
  {
    period: "More than 24 months",
    minMonths: 24,
    maxMonths: Infinity,
    action: "Initial training programme(s) to be delivered in full.",
    notes: "Full initial training required",
  },
];

export type Status = "Completed" | "Scheduled" | "Outstanding" | "Overdue" | "";

export interface CourseRecord {
  trainingDate: string; // ISO yyyy-mm-dd
  expiryDate: string;
  status: Status;
  nextTrainingDate: string; // auto = expiry + 2y, editable
  attachment: TrainingAttachment | null;
}

export interface TrainingAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: string;
}

export interface Employee {
  id: string; // EMPxxx
  lastName: string;
  firstName: string;
  dutyCategory: string; // S1..S15
  jobTitle: string;
  station: string;
  courses: Record<string, CourseRecord>; // by course name
}

export const STATUS_VALUES: Status[] = ["Completed", "Scheduled", "Outstanding", "Overdue"];

export function emptyCourse(): CourseRecord {
  return { trainingDate: "", expiryDate: "", status: "", nextTrainingDate: "", attachment: null };
}

export function emptyEmployee(id: string): Employee {
  const courses: Record<string, CourseRecord> = {};
  COURSES.forEach((c) => (courses[c] = emptyCourse()));
  return {
    id,
    lastName: "",
    firstName: "",
    dutyCategory: "",
    jobTitle: "",
    station: "",
    courses,
  };
}

export function deriveStatus(training: string, expiry: string, current: Status): Status {
  // If user manually set Scheduled and there are no dates yet, respect it.
  if (!training && !expiry) return current || "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (expiry) {
    const exp = new Date(expiry);
    if (exp < today) return "Overdue";
    return "Completed";
  }
  if (training && !expiry) return current === "Scheduled" ? "Scheduled" : "Outstanding";
  return current || "";
}

export function addYears(iso: string, years: number): string {
  if (!iso) return "";
  const d = new Date(iso);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

export function monthsBetween(fromIso: string, toDate: Date = new Date()): number {
  if (!fromIso) return 0;
  const from = new Date(fromIso);
  const diff =
    (toDate.getFullYear() - from.getFullYear()) * 12 +
    (toDate.getMonth() - from.getMonth());
  return diff;
}

export function absenceRule(expiryIso: string) {
  if (!expiryIso) return null;
  const months = monthsBetween(expiryIso);
  if (months <= 0) return null;
  return RETURN_FROM_ABSENCE.find((r) => months > r.minMonths && months <= r.maxMonths) || null;
}
