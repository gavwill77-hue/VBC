"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { HOLES, holeEntryOrder } from "@/lib/course";

type ScoreData = {
  player: { id: string; name: string };
  targetPlayer?: { id: string; name: string };
  event: {
    name: string;
    activeRoundNumber: 1 | 2;
    totalRounds: number;
    maxInputStrokes: number;
    maxDoubleParEnabled: boolean;
    capDeductionPerHoleDoublePar: boolean;
    excludeWorseThanDoubleBogey: boolean;
    ambroseRequiredDrivesPerPlayer: number;
  };
  selectedRoundNumber: 1 | 2;
  roundUnavailableReason: string | null;
  round: null | {
    id: string;
    roundNumber: 1 | 2;
    startHole: 1 | 10;
    status: "IN_PROGRESS" | "COMPLETE";
    lockedByAdmin: boolean;
    scores: Array<{ holeNumber: number; strokesRaw: number; firstDrivePlayerId: string | null }>;
    scorerGroup?: {
      groupNumber: number | null;
      members: Array<{
        playerId: string;
        name: string;
        groupNumber: number | null;
        scores: Array<{ holeNumber: number; strokesRaw: number; firstDrivePlayerId: string | null }>;
      }>;
    };
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
      firstDriveOptions: Array<{ playerId: string; name: string }>;
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

  const currentRound = data.round;
  const isGroupEntry = (currentRound?.scorerGroup?.members.length ?? 0) > 1;

  const scoreMap = useMemo(
    () => new Map((currentRound?.scores ?? []).map((score) => [score.holeNumber, score.strokesRaw])),
    [currentRound?.scores]
  );
  const firstDriveMap = useMemo(
    () => new Map((currentRound?.scores ?? []).map((score) => [score.holeNumber, score.firstDrivePlayerId])),
    [currentRound?.scores]
  );

  const order = holeEntryOrder(currentRound?.startHole ?? 1);

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
        body: JSON.stringify({ mode: "quick", roundNumber, scores: entries, targetPlayerId: data.player.id })
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
        body: JSON.stringify({ ...entry, roundNumber, targetPlayerId: data.player.id })
      });
    }
    localStorage.removeItem(storageKey(roundNumber));
    await refresh(roundNumber);
  }, [data.player.id, refresh]);

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

  function scoreForMember(memberPlayerId: string, holeNumber: number) {
    return currentRound?.scorerGroup?.members
      .find((member) => member.playerId === memberPlayerId)
      ?.scores.find((score) => score.holeNumber === holeNumber);
  }

  async function saveHole(targetPlayerId: string, holeNumber: number, strokes?: number, firstDrivePlayerId?: string | null) {
    setSaving(true);
    setNote("");

    if (!navigator.onLine) {
      if (targetPlayerId !== data.player.id) {
        setNote("Offline group entry is unavailable. Reconnect to save group scores.");
        setSaving(false);
        return;
      }
      if (strokes !== undefined) {
        writePending({ holeNumber, strokes });
      }
      setNote("Offline: score saved locally and will sync when online");
      setSaving(false);
      return;
    }

    const response = await fetch("/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holeNumber, strokes, firstDrivePlayerId, roundNumber: selectedRound, targetPlayerId })
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

  const roundLocked = !!currentRound && (currentRound.lockedByAdmin || currentRound.status === "COMPLETE");
  const roundUnavailable = currentRound === null;
  const isCallawayReady = !!currentRound && currentRound.roundNumber === 1 && currentRound.scores.length === 18;

  const driveCounts = useMemo(() => {
    if (!currentRound?.ambrose) return [];
    const counts = new Map<string, number>();
    for (const option of currentRound.ambrose.firstDriveOptions) {
      counts.set(option.playerId, 0);
    }
    for (const score of currentRound.scores) {
      if (score.firstDrivePlayerId && counts.has(score.firstDrivePlayerId)) {
        counts.set(score.firstDrivePlayerId, (counts.get(score.firstDrivePlayerId) ?? 0) + 1);
      }
    }
    return currentRound.ambrose.firstDriveOptions.map((option) => ({
      ...option,
      drives: counts.get(option.playerId) ?? 0
    }));
  }, [currentRound]);

  return (
    <div className="space-y-5">
      <section className="panel">
        <p className="pill w-fit">Player View</p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight sm:text-4xl">{data.event.name}</h1>
        <p className="mt-1 text-sm text-slate-600">{data.player.name}</p>
        {isGroupEntry && (
          <p className="mt-2 text-sm font-semibold text-slate-700">
            Group entry mode: you can enter scores for all players in your round group on one screen.
          </p>
        )}
        <div className="mobile-sticky-actions mt-3">
          <div className="grid grid-cols-2 gap-2">
            <button className={selectedRound === 1 ? "btn-primary" : "btn-secondary"} onClick={() => void refresh(1)}>Round 1</button>
            {data.event.totalRounds >= 2 && (
              <button className={selectedRound === 2 ? "btn-primary" : "btn-secondary"} onClick={() => void refresh(2)}>Round 2</button>
            )}
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-600">Active round is {data.event.activeRoundNumber}. Viewing round {selectedRound}.</p>
        <p className="mt-2 text-sm text-slate-600">
          Max double par {data.event.maxDoubleParEnabled ? "ON" : "OFF"}. Deduction cap {data.event.capDeductionPerHoleDoublePar ? "ON" : "OFF"}. Exclude scores &gt;= double par from deductions {data.event.excludeWorseThanDoubleBogey ? "ON" : "OFF"}.
        </p>
        {!!currentRound && currentRound.roundNumber === 1 && currentRound.scores.length < 18 && (
          <p className="mt-2 text-sm font-semibold text-slate-700">
            Callaway handicap and net appear after all 18 holes are entered.
          </p>
        )}
        {roundLocked && <p className="mt-2 text-sm font-semibold text-orange-700">This round is locked and cannot be edited.</p>}
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
            <p className="mt-2 text-sm text-slate-600">Start hole {currentRound!.startHole}. In progress: {currentRound!.scores.length}/18.</p>
            {currentRound!.roundNumber === 2 && currentRound!.ambrose && (
              <p className="mt-2 text-sm text-slate-700">Required drives each: <span className="font-semibold">{data.event.ambroseRequiredDrivesPerPlayer}</span></p>
            )}
            {currentRound!.roundNumber === 2 && currentRound!.ambrose && driveCounts.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {driveCounts.map((item) => (
                  <span key={item.playerId} className="pill">{item.name}: {item.drives}/{data.event.ambroseRequiredDrivesPerPlayer}</span>
                ))}
              </div>
            )}

            {isGroupEntry ? (
              <div className="mt-3 space-y-3">
                {order.map((holeNumber) => {
                  const hole = HOLES.find((item) => item.hole === holeNumber)!;
                  return (
                    <div key={holeNumber} className="panel-tight">
                      <p className="text-sm font-semibold">Hole {holeNumber} <span className="text-slate-500">(Par {hole.par})</span></p>
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {currentRound!.scorerGroup!.members.map((member) => {
                          const existing = scoreForMember(member.playerId, holeNumber);
                          return (
                            <label key={`${holeNumber}-${member.playerId}`} className="text-xs font-semibold">
                              {member.name}
                              <input
                                type="number"
                                min={1}
                                max={data.event.maxInputStrokes}
                                defaultValue={existing?.strokesRaw ?? ""}
                                className="mt-1 w-full bg-white"
                                disabled={saving || roundLocked}
                                onBlur={(e) => {
                                  const value = Number(e.target.value);
                                  if (Number.isInteger(value) && value >= 1 && value <= data.event.maxInputStrokes) {
                                    void saveHole(member.playerId, holeNumber, value);
                                  }
                                }}
                              />
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {order.map((holeNumber) => {
                  const hole = HOLES.find((item) => item.hole === holeNumber)!;
                  const currentDrivePlayerId = firstDriveMap.get(holeNumber) ?? "";
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
                            void saveHole(data.player.id, holeNumber, value, currentDrivePlayerId ? currentDrivePlayerId : null);
                          }
                        }}
                        disabled={saving || roundLocked}
                      />
                      {currentRound!.roundNumber === 2 && currentRound!.ambrose && (
                        <select
                          className="mt-2 w-full bg-white px-3 py-2"
                          value={currentDrivePlayerId}
                          disabled={saving || roundLocked}
                          onChange={(e) => {
                            const driveId = e.target.value || null;
                            void saveHole(data.player.id, holeNumber, undefined, driveId);
                          }}
                        >
                          <option value="">First drive by...</option>
                          {currentRound!.ambrose.firstDriveOptions.map((option) => (
                            <option key={option.playerId} value={option.playerId}>{option.name}</option>
                          ))}
                        </select>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
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
                <p className="font-semibold text-slate-700">Net = Gross ({currentRound!.ambrose!.grossTotal}) - Handicap ({currentRound!.ambrose!.handicap}) = {currentRound!.ambrose!.netScore}</p>
              </div>
            ) : (
              <>
                {!isCallawayReady ? (
                  <div className="mt-3 space-y-2 text-sm">
                    <p><span className="font-semibold">Adjusted gross (live):</span> {currentRound!.callaway.adjustedGross}</p>
                    <p className="font-semibold text-slate-700">Callaway handicap and net are hidden until 18/18 holes are complete.</p>
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
                    <p className="mt-3 text-sm font-semibold text-slate-700">Net = Adjusted Gross ({currentRound!.callaway.adjustedGross}) - Handicap Allowance ({currentRound!.callaway.handicapAllowance.toFixed(1)}) = {currentRound!.callaway.netScore.toFixed(1)}</p>
                    {currentRound!.callaway.isMaxHandicapApplied && <p className="mt-2 text-xs font-semibold text-orange-700">Maximum Callaway handicap of 50 applied.</p>}
                  </>
                )}
              </>
            )}
          </section>

          {!isGroupEntry && (
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
          )}
        </>
      )}

      {note && <p className="text-sm font-semibold text-teal-700">{note}</p>}
    </div>
  );
}
