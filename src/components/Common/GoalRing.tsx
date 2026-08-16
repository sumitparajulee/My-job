import { useMemo, useState } from 'react';
import { Target, Flame } from 'lucide-react';
import { useDocketStore } from '@/store/useDocketStore';

// Ported from the sample app's weekly-goal ring: a small SVG progress
// ring showing "N of your goal applications this week", with the goal
// number itself editable inline and persisted to localStorage (this is
// a personal preference, not sync'd data, so it doesn't belong in the
// Dexie/Supabase-backed docket store).

const GOAL_KEY = 'docket_weekly_goal';
const RADIUS = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function loadGoal(): number {
  const raw = localStorage.getItem(GOAL_KEY);
  const n = raw ? parseInt(raw, 10) : 5;
  return Number.isFinite(n) && n > 0 ? n : 5;
}

function saveGoal(n: number) {
  localStorage.setItem(GOAL_KEY, String(Math.max(1, Math.min(50, n))));
}

function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay();
  copy.setDate(copy.getDate() - (day === 0 ? 6 : day - 1));
  copy.setHours(0, 0, 0, 0);
  return copy;
}

// Consecutive completed weeks, counting backward from last week (not the
// current, still-in-progress one) — a streak only "locks in" once a week
// is fully over, so it can't flicker up and down mid-week as someone
// adds more applications. jobs is whatever's already loaded in the
// docket store; this only ever looks at applicationDate, so it works the
// same whether the store has 10 jobs or 10,000.
function computeStreak(jobs: { deletedAt?: string; applicationDate?: string }[], goal: number): number {
  const applicationDates = jobs
    .filter((j) => !j.deletedAt && j.applicationDate)
    .map((j) => new Date(j.applicationDate!));

  let streak = 0;
  let cursor = startOfWeek(new Date());
  cursor.setDate(cursor.getDate() - 7); // start from last week, not this one

  // Cap the lookback so a very old/empty docket can't spin forever.
  for (let i = 0; i < 104; i++) {
    const weekStart = cursor;
    const weekEnd = new Date(cursor);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const count = applicationDates.filter((d) => d >= weekStart && d < weekEnd).length;
    if (count < goal) break;
    streak += 1;
    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() - 7);
  }
  return streak;
}

export function GoalRing() {
  const jobs = useDocketStore((s) => s.jobs);
  const [goal, setGoal] = useState(loadGoal);

  const appliedThisWeek = useMemo(() => {
    const weekStart = startOfWeek(new Date());
    return jobs.filter((j) => {
      if (j.deletedAt || !j.applicationDate) return false;
      return new Date(j.applicationDate) >= weekStart;
    }).length;
  }, [jobs]);

  const streak = useMemo(() => computeStreak(jobs, goal), [jobs, goal]);

  const pct = Math.min(appliedThisWeek / goal, 1);
  const offset = CIRCUMFERENCE * (1 - pct);
  const complete = appliedThisWeek >= goal;

  function handleGoalChange(next: number) {
    setGoal(next);
    saveGoal(next);
  }

  return (
    <div className="flex items-center gap-4 rounded-lg border border-ink/10 bg-white p-4 shadow-card dark:border-white/10 dark:bg-night-panel">
      <svg width="64" height="64" viewBox="0 0 64 64" className="shrink-0 -rotate-90">
        <circle cx="32" cy="32" r={RADIUS} fill="none" stroke="currentColor" strokeWidth="5" className="text-ink/10" />
        <circle
          cx="32"
          cy="32"
          r={RADIUS}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          className={complete ? 'text-forest transition-[stroke-dashoffset] duration-700' : 'text-brass transition-[stroke-dashoffset] duration-700'}
          stroke="currentColor"
        />
      </svg>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-ink dark:text-paper">
          <Target className="h-3.5 w-3.5 text-brass" />
          {complete ? '🎉 Weekly goal reached!' : 'This week’s applications'}
        </p>
        <p className="mt-0.5 text-xs text-ink-faint">
          {appliedThisWeek} of{' '}
          <input
            type="number"
            min={1}
            max={50}
            value={goal}
            onChange={(e) => handleGoalChange(parseInt(e.target.value, 10) || goal)}
            className="w-10 rounded border border-ink/10 bg-transparent px-1 py-0.5 text-center font-mono text-xs text-ink dark:border-white/10 dark:text-paper"
          />{' '}
          applications
        </p>
        {streak > 0 && (
          <p className="mt-1 flex items-center gap-1 text-xs font-medium text-brick">
            <Flame className="h-3 w-3 fill-current" />
            {streak} week{streak === 1 ? '' : 's'} in a row hitting goal
          </p>
        )}
      </div>
    </div>
  );
}
