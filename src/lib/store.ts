import { useEffect, useState, useCallback } from "react";
import { COURSES, emptyEmployee, type Employee, emptyCourse } from "./data";

const KEY = "tt_personnel_v1";

function seed(): Employee[] {
  const list: Employee[] = [];
  for (let i = 1; i <= 8; i++) {
    const id = "EMP" + String(i).padStart(3, "0");
    list.push(emptyEmployee(id));
  }
  return list;
}

function load(): Employee[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seed();
    const parsed: Employee[] = JSON.parse(raw);
    // ensure all courses keys exist
    parsed.forEach((e) => {
      COURSES.forEach((c) => {
        if (!e.courses[c]) e.courses[c] = emptyCourse();
        if (!("attachment" in e.courses[c])) e.courses[c].attachment = null;
      });
    });
    return parsed;
  } catch {
    return seed();
  }
}

let memory: Employee[] | null = null;
const listeners = new Set<() => void>();

function getAll(): Employee[] {
  if (!memory) memory = load();
  return memory;
}
function save(next: Employee[]) {
  memory = next;
  localStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach((l) => l());
}

export function usePersonnel() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick((x) => x + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  const employees = getAll();

  const update = useCallback((id: string, patch: Partial<Employee>) => {
    save(getAll().map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);
  const updateCourse = useCallback(
    (id: string, course: string, patch: Partial<ReturnType<typeof emptyCourse>>) => {
      save(
        getAll().map((e) =>
          e.id === id
            ? {
                ...e,
                courses: {
                  ...e.courses,
                  [course]: { ...e.courses[course], ...patch },
                },
              }
            : e
        )
      );
    },
    []
  );
  const add = useCallback(() => {
    const existing = getAll();
    const max = existing.reduce((m, e) => {
      const n = parseInt(e.id.replace(/\D/g, ""), 10);
      return isNaN(n) ? m : Math.max(m, n);
    }, 0);
    const id = "EMP" + String(max + 1).padStart(3, "0");
    save([...existing, emptyEmployee(id)]);
    return id;
  }, []);
  const remove = useCallback((id: string) => {
    save(getAll().filter((e) => e.id !== id));
  }, []);
  const reset = useCallback(() => {
    localStorage.removeItem(KEY);
    memory = null;
    save(seed());
  }, []);
  const replaceAll = useCallback((next: Employee[]) => save(next), []);

  return { employees, update, updateCourse, add, remove, reset, replaceAll };
}
