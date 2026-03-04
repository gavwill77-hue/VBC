"use client";

import { useEffect, useMemo, useState } from "react";
import { HOLES, holeEntryOrder } from "@/lib/course";

type ScoreData = {
  player: { id: string; name: string };
  event: {
    name: string;
    activeRoundNumber: 1 | 2;
    totalRounds: number;
    maxInputStrokes: number;
    maxDoubleParEnabled: boolean;
    capDeductionPerHoleDoublePar: boolean;
    excludeWorseThanDoubleBogey: boolean;
  };
  round: {
    id: string;
    roundNumber: 1 | 2;
    startHole: 1 | 10;
    status: "IN_PROGRESS" | "COMPLETE";
    lockedByAdmin: boolean;
    scores: Array<{ holeNumber: number; strokesRaw: number }>;
    callaway: {
      grossTotal: number;
      adjustedGross: number;
      entitlement: number;
      adjustment: number;
      deductibleSum: number;
      handicapAllowance: number;
      netScore: number;
      selectedHoleNumbers: number[];
      halfHoleAppliedTo?: number;
      tableVersion: string;
      isMaxHandicapApplied: boolean;
    };
    ambrose: null | {
      groupNumber: number;
      teammates: string[];
      handicap: number;
      grossTotal: number;
      netScore: number;
    };
  };
};

const STORAGE_KEY = "scorecard_offline_cache_v1";

export function ScorecardClient({ initialData }: { initialData: ScoreData }) {
  const [data, setData] = useState(initialData);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");

  const scoreMap = useMemo(
    () => new Map(data.round.scores.map((score) => [score.holeNumber, score.strokesRaw])),
    [data.round.scores]
  );

  const order = holeEntryOrder(data.round.startHole);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const pending = JSON.parse(raw) as Array<{ holeNumber: number; strokes: number }>;
    if (pending.length > 0 && navigator.onLine) {
      void syncPending(pending);
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      void refresh();
    }, 8000);
    return () => clearInterval(timer);
  }, []);

  async function refresh() {
    const response = await fetch("/api/score");
    if (response.ok) {
      const next = (await response.json()) as ScoreData;
      setData(next);
    }
  }

  function writePending(update: { holeNumber: number; strokes: number }) {
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as Array<{ holeNumber: number; strokes: number }>;
    const filtered = existing.filter((entry) => entry.holeNumber !== update.holeNumber);
    filtered.push(update);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  }

  async function syncPending(entries: Array<{ holeNumber: number; strokes: number }>) {
    if (entries.length === 18) {
      const response = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "quick", scores: entries })
      });
      if (response.ok) {
        localStorage.removeItem(STORAGE_KEY);
      }
      await refresh();
      return;
    }

    for (const entry of entries) {
      await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry)
      });
    }
    localStorage.removeItem(STORAGE_KEY);
    await refresh();
  }

  async function saveHole(holeNumber: number, strokes: number) {
    setSaving(true);
    setNote("");

    if (!navigator.onLine) {
      writePending({ holeNumber, strokes });
      setNote("Offline: saved locally and will sync when online");
      setSaving(false);
      return;
    }

    const response = await fetch("/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holeNumber, strokes })
    });

    if (!response.ok) {
      setNote("Could not save score");
      setSaving(false);
      return;
    }

    await refresh();
    setSaving(false);
    setNote("Saved");
  }

  return (
    <div className="space-y-5">
      <section className="panel">
        <p className="pill w-fit">Player View</p>
        <h1 className="mt-2 text-4xl font-semibold leading-tight">{data.event.name}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {data.player.name} - Round {data.round.roundNumber} of {data.event.totalRounds} Scorecard
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Start hole {data.round.startHole}. In progress: {data.round.scores.length}/18. Max double par {data.event.maxDoubleParEnabled ? "ON" : "OFF"}. Deduction cap {data.event.capDeductionPerHoleDoublePar ? "ON" : "OFF"}. Exclude &gt; double bogey from deductions {data.event.excludeWorseThanDoubleBogey ? "ON" : "OFF"}.
        </p>
        {data.round.roundNumber === 2 && data.round.ambrose ? (
          <p className="mt-3 text-sm font-semibold text-slate-700">
            Ambrose gross {data.round.ambrose.grossTotal} | Ambrose handicap {data.round.ambrose.handicap} | Net {data.round.ambrose.netScore}
          </p>
        ) : (
          <p className="mt-3 text-sm font-semibold text-slate-700">
            Adjusted gross {data.round.callaway.adjustedGross} | Callaway handicap {data.round.callaway.handicapAllowance.toFixed(1)} | Net {data.round.callaway.netScore.toFixed(1)}
          </p>
        )}
      </section>

      <section className="panel">
        <h2 className="text-2xl font-semibold">Hole Entry</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {order.map((holeNumber) => {
            const hole = HOLES.find((item) => item.hole === holeNumber)!;
            return (
              <label key={holeNumber} className="panel-tight text-sm">
                <span className="font-semibold">Hole {holeNumber}</span> <span className="text-slate-500">(Par {hole.par})</span>
                <input
                  type="number"
                  min={1}
                  max={data.event.maxInputStrokes}
                  defaultValue={scoreMap.get(holeNumber) ?? ""}
                  className="mt-2 w-full bg-white px-4 py-3"
                  onBlur={(e) => {
                    const value = Number(e.target.value);
                    if (Number.isInteger(value) && value >= 1 && value <= data.event.maxInputStrokes) {
                      void saveHole(holeNumber, value);
                    }
                  }}
                  disabled={saving || data.round.lockedByAdmin}
                />
              </label>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <h2 className="text-2xl font-semibold">
          {data.round.roundNumber === 2 && data.round.ambrose ? "Ambrose Calculation" : `Callaway Calculation (Round ${data.round.roundNumber})`}
        </h2>
        {data.round.roundNumber === 2 && data.round.ambrose ? (
          <div className="mt-3 space-y-2 text-sm">
            <p><span className="font-semibold">Group:</span> {data.round.ambrose.groupNumber}</p>
            <p><span className="font-semibold">Team:</span> {data.round.ambrose.teammates.join(", ")}</p>
            <p><span className="font-semibold">Round 1 position handicap:</span> {data.round.ambrose.handicap}</p>
            <p><span className="font-semibold">Ambrose gross:</span> {data.round.ambrose.grossTotal}</p>
            <p><span className="font-semibold">Ambrose net:</span> {data.round.ambrose.netScore}</p>
            <p className="font-semibold text-slate-700">
              Net = Gross ({data.round.ambrose.grossTotal}) - Handicap ({data.round.ambrose.handicap}) = {data.round.ambrose.netScore}
            </p>
          </div>
        ) : (
          <>
            <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
              <p><span className="font-semibold">Adjusted gross:</span> {data.round.callaway.adjustedGross}</p>
              <p><span className="font-semibold">Entitlement:</span> {data.round.callaway.entitlement} worst holes</p>
              <p><span className="font-semibold">Selected holes:</span> {data.round.callaway.selectedHoleNumbers.length > 0 ? data.round.callaway.selectedHoleNumbers.join(", ") : "-"}</p>
              <p><span className="font-semibold">Half-hole applied:</span> {data.round.callaway.halfHoleAppliedTo ?? "-"}</p>
              <p><span className="font-semibold">Deductible strokes sum:</span> {data.round.callaway.deductibleSum.toFixed(1)}</p>
              <p><span className="font-semibold">Adjustment factor:</span> {data.round.callaway.adjustment >= 0 ? `+${data.round.callaway.adjustment}` : data.round.callaway.adjustment}</p>
              <p><span className="font-semibold">Handicap allowance:</span> {data.round.callaway.handicapAllowance.toFixed(1)}</p>
              <p><span className="font-semibold">Table version:</span> {data.round.callaway.tableVersion}</p>
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-700">
              Net = Adjusted Gross ({data.round.callaway.adjustedGross}) - Handicap Allowance ({data.round.callaway.handicapAllowance.toFixed(1)}) = {data.round.callaway.netScore.toFixed(1)}
            </p>
            {data.round.callaway.isMaxHandicapApplied && (
              <p className="mt-2 text-xs font-semibold text-orange-700">Maximum Callaway handicap of 50 applied.</p>
            )}
          </>
        )}
      </section>

      <details className="panel">
        <summary className="cursor-pointer text-2xl font-semibold">Quick Entry Grid</summary>
        <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {HOLES.map((hole) => (
            <label key={hole.hole} className="panel-tight text-xs font-semibold">
              H{hole.hole}
              <input
                type="number"
                min={1}
                max={data.event.maxInputStrokes}
                defaultValue={scoreMap.get(hole.hole) ?? ""}
                className="mt-1 w-full bg-white"
                onChange={(e) => {
                  const strokes = Number(e.target.value);
                  if (Number.isInteger(strokes) && strokes >= 1 && strokes <= data.event.maxInputStrokes) {
                    writePending({ holeNumber: hole.hole, strokes });
                  }
                }}
              />
            </label>
          ))}
        </div>
        <button
          className="btn-primary mt-3"
          onClick={async () => {
            const entries = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as Array<{ holeNumber: number; strokes: number }>;
            await syncPending(entries);
            setNote("Quick entry synced");
          }}
        >
          Sync Quick Entry
        </button>
      </details>

      {note && <p className="text-sm font-semibold text-teal-700">{note}</p>}
    </div>
  );
}
