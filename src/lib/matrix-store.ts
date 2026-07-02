import { useCallback, useEffect, useState } from "react";
import { COURSES, DUTY_CATEGORIES, TRAINING_MATRIX } from "./data";

const KEY = "tt_matrix_v1";

function load(): string[][] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as string[][];
      if (parsed.length === COURSES.length && parsed[0]?.length === DUTY_CATEGORIES.length) {
        return parsed;
      }
    }
  } catch {}
  return TRAINING_MATRIX.map((row) => [...row]);
}

let memory: string[][] | null = null;
const listeners = new Set<() => void>();

function getAll(): string[][] {
  if (!memory) memory = load();
  return memory;
}
function save(next: string[][]) {
  memory = next;
  localStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach((l) => l());
}

export function useMatrix() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick((x) => x + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  const matrix = getAll();

  const setCell = useCallback((i: number, j: number, value: string) => {
    const next = matrix.map((r) => [...r]);
    next[i][j] = value;
    save(next);
  }, [matrix]);

  const reset = useCallback(() => {
    localStorage.removeItem(KEY);
    memory = null;
    save(TRAINING_MATRIX.map((r) => [...r]));
  }, []);

  return { matrix, setCell, reset };
}

/** Cell classification. Legacy "✓" is treated as mandatory. */
export type CellKind = "none" | "mandatory" | "optional";
export function classifyCell(value: string | undefined): CellKind {
  if (!value || value === "-") return "none";
  if (value === "O" || value === "OPT") return "optional";
  return "mandatory"; // "M", "✓", "6", "7.x"
}

function dutyIndex(dutyCode: string) {
  return DUTY_CATEGORIES.findIndex((d) => d.code === dutyCode);
}

/** All courses assigned (mandatory + optional) for a duty. */
export function coursesForDuty(matrix: string[][], dutyCode: string): string[] {
  const j = dutyIndex(dutyCode);
  if (j < 0) return [...COURSES];
  return matrix
    .map((row, i) => (classifyCell(row[j]) !== "none" ? COURSES[i] : ""))
    .filter(Boolean);
}

export function mandatoryCoursesForDuty(matrix: string[][], dutyCode: string): string[] {
  const j = dutyIndex(dutyCode);
  if (j < 0) return [];
  return matrix
    .map((row, i) => (classifyCell(row[j]) === "mandatory" ? COURSES[i] : ""))
    .filter(Boolean);
}

export function optionalCoursesForDuty(matrix: string[][], dutyCode: string): string[] {
  const j = dutyIndex(dutyCode);
  if (j < 0) return [];
  return matrix
    .map((row, i) => (classifyCell(row[j]) === "optional" ? COURSES[i] : ""))
    .filter(Boolean);
}

export function requiredCourseIndices(matrix: string[][], dutyCode: string): number[] {
  const j = dutyIndex(dutyCode);
  if (j < 0) return COURSES.map((_, i) => i);
  return matrix.map((row, i) => (classifyCell(row[j]) !== "none" ? i : -1)).filter((i) => i >= 0);
}
