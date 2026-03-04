"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  selectedRoundNumber: 1 | 2;
  roundUnavailableReason: string | null;
  round: null | {
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

function storageKey(roundNumber: 1 | 2) {
  return `scorecard_offline_cache_v2_round_${roundNumber}`;
}

export function ScorecardClient({ initialData }: { initialData: ScoreData }) {
  const [data, setData] = useState(initialData);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [selectedRound, setSelectedRound] = useState<1 | 2>(initialData.selectedRoundNumber);

  const scoreMap = useMemo(
    () => new Map((data.round?.scores ?? []).map((score) => [score.holeNumber, score.strokesRaw])),
    [data.round?.scores]
  );

  const order = holeEntryOrder(data.round?.startHole ?? 1);

  const refresh = useCallback(async (roundNumber: 1 | 2) => {
    const response = await fetch(`/api/score?roundNumber=${roundNumber}`);
    if (response.ok) {
      const next = (await response.json()) as ScoreData;
      setData(next);
      setSelectedRound(next.selectedRoundNumber);
    }
  }, []);

  const syncPending = useCallback(async (entries: Array<{ holeNumber: number; strokes: number }>, roundNumber: 1 | 2) => {
    if (entries.length === 0) return;
    if (entries.length === 18) {
      const response = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "quick", roundNumber, scores: entries })
      });
      if (response.ok) {
        localStorage.removeItem(storageKey(roundNumber));
      }
      await refresh(roundNumber);
      return;
    }

    for (const entry of entries) {
      await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...entry, roundNumber })
      });
    }
    localStorage.removeItem(storageKey(roundNumber));
    await refresh(roundNumber);
  }, [refresh]);

  useEffect(() => {
    const raw = localStorage.getItem(storageKey(selectedRound));
    if (!raw) return;
    const pending = JSON.parse(raw) as Array<{ holeNumber: number; strokes: number }>;
    if (pending.length > 0 && navigator.onLine) {
      void syncPending(pending, selectedRound);
    }
  }, [selectedRound, syncPending]);

  useEffect(() => {
    const timer = setInterval(() => {
      void refresh(selectedRound);
    }, 8000);
    return () => clearInterval(timer);
  }, [selectedRound, refresh]);

  function writePending(update: { holeNumber: number; strokes: number }) {
    const key = storageKey(selectedRound);
    const existing = JSON.parse(localStorage.getItem(key) ?? "[]") as Array<{ holeNumber: number; strokes: number }>;
    const filtered = existing.filter((entry) => entry.holeNumber !== update.holeNumber);
    filtered.push(update);
    localStorage.setItem(key, JSON.stringify(filtered));
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
      body: JSON.stringify({ holeNumber, strokes, roundNumber: selectedRound })
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setNote(payload?.error ?? "Could not save score");
      setSaving(false);
      return;
    }

    await refresh(selectedRound);
    setSaving(false);
    setNote("Saved");
  }

  const roundLocked = !!data.round && (data.round.lockedByAdmin || data.round.status === "COMPLETE");
  const roundUnavailable = data.round === null;
  const currentRound = data.round;

  return (
    <div className="space-y-5">
      <section className="panel">
        <p className="pill w-fit">Player View</p>
        <h1 className="mt-2 text-4xl font-semibold leading-tight">{data.event.name}</h1>
        <p className="mt-1 text-sm text-slate-600">{data.player.name}</p>
        <div className="mt-3 flex gap-2">
          <button
            className={selectedRound === 1 ? "btn-primary" : "btn-secondary"}
            onClick={() => void refresh(1)}
          >
            Round 1
          </button>
          {data.event.totalRounds >= 2 && (
            <button
              className={selectedRound === 2 ? "btn-primary" : "btn-secondary"}
              onClick={() => void refresh(2)}
            >
              Round 2
            </button>
          )}
        </div>
        <p className="mt-3 text-sm text-slate-600">
          Active round is {data.event.activeRoundNumber}. Viewing round {selectedRound}.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Max double par {data.event.maxDoubleParEnabled ? "ON" : "OFF"}. Deduction cap {data.event.capDeductionPerHoleDoublePar ? "ON" : "OFF"}. Exclude &gt; double bogey from deductions {data.event.excludeWorseThanDoubleBogey ? "ON" : "OFF"}.
        </p>
        {roundLocked && (
          <p className="mt-2 text-sm font-semibold text-orange-700">This round is locked and cannot be edited.</p>
        )}
      </section>

      {roundUnavailable ? (
        <section className="panel">
          <h2 className="text-2xl font-semibold">Round {selectedRound} not available</h2>
          <p className="mt-2 text-sm text-slate-700">{data.roundUnavailableReason ?? "This round is not available yet."}</p>
        </section>
      ) : (
        <>
          <section className="panel">
            <h2 className="text-2xl font-semibold">Hole Entry</h2>
            <p className="mt-2 text-sm text-slate-600">
              Start hole {currentRound!.startHole}. In progress: {currentRound!.scores.length}/18.
            </p>
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
                      disabled={saving || roundLocked}
                    />
                  </label>
                );
              })}
            </div>
          </section>

          <section className="panel">
            <h2 className="text-2xl font-semibold">
              {currentRound!.roundNumber === 2 && currentRound!.ambrose ? "Ambrose Calculation" : `Callaway Calculation (Round ${currentRound!.roundNumber})`}
            </h2>
            {currentRound!.roundNumber === 2 && currentRound!.ambrose ? (
              <div className="mt-3 space-y-2 text-sm">
                <p><span className="font-semibold">Group:</span> {currentRound!.ambrose!.groupNumber}</p>
                <p><span className="font-semibold">Team:</span> {currentRound!.ambrose!.teammates.join(", ")}</p>
                <p><span className="font-semibold">Round 1 position handicap:</span> {currentRound!.ambrose!.handicap}</p>
                <p><span className="font-semibold">Ambrose gross:</span> {currentRound!.ambrose!.grossTotal}</p>
                <p><span className="font-semibold">Ambrose net:</span> {currentRound!.ambrose!.netScore}</p>
                <p className="font-semibold text-slate-700">
                  Net = Gross ({currentRound!.ambrose!.grossTotal}) - Handicap ({currentRound!.ambrose!.handicap}) = {currentRound!.ambrose!.netScore}
                </p>
              </div>
            ) : (
              <>
                <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                  <p><span className="font-semibold">Adjusted gross:</span> {currentRound!.callaway.adjustedGross}</p>
                  <p><span className="font-semibold">Entitlement:</span> {currentRound!.callaway.entitlement} worst holes</p>
                  <p><span className="font-semibold">Selected holes:</span> {currentRound!.callaway.selectedHoleNumbers.length > 0 ? currentRound!.callaway.selectedHoleNumbers.join(", ") : "-"}</p>
                  <p><span className="font-semibold">Half-hole applied:</span> {currentRound!.callaway.halfHoleAppliedTo ?? "-"}</p>
                  <p><span className="font-semibold">Deductible strokes sum:</span> {currentRound!.callaway.deductibleSum.toFixed(1)}</p>
                  <p><span className="font-semibold">Adjustment factor:</span> {currentRound!.callaway.adjustment >= 0 ? `+${currentRound!.callaway.adjustment}` : currentRound!.callaway.adjustment}</p>
                  <p><span className="font-semibold">Handicap allowance:</span> {currentRound!.callaway.handicapAllowance.toFixed(1)}</p>
                  <p><span className="font-semibold">Table version:</span> {currentRound!.callaway.tableVersion}</p>
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-700">
                  Net = Adjusted Gross ({currentRound!.callaway.adjustedGross}) - Handicap Allowance ({currentRound!.callaway.handicapAllowance.toFixed(1)}) = {currentRound!.callaway.netScore.toFixed(1)}
                </p>
                {currentRound!.callaway.isMaxHandicapApplied && (
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
                    disabled={roundLocked}
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
              disabled={roundLocked}
              onClick={async () => {
                const entries = JSON.parse(localStorage.getItem(storageKey(selectedRound)) ?? "[]") as Array<{ holeNumber: number; strokes: number }>;
                await syncPending(entries, selectedRound);
                setNote("Quick entry synced");
              }}
            >
              Sync Quick Entry
            </button>
          </details>
        </>
      )}

      {note && <p className="text-sm font-semibold text-teal-700">{note}</p>}
    </div>
  );
}
