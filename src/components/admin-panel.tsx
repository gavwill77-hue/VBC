"use client";

import { useState } from "react";
import { HOLES } from "@/lib/course";
import { adjustedStrokesForInput, calculateCallawayResult } from "@/lib/callaway";

type AdminPanelProps = {
  event: {
    name: string;
    eventDate: string;
    roundStartHole: 1 | 10;
    activeRoundNumber: 1 | 2;
    maxDoubleParEnabled: boolean;
    capDeductionPerHoleDoublePar: boolean;
    excludeWorseThanDoubleBogey: boolean;
    maxInputStrokes: number;
  };
  events: Array<{
    id: string;
    name: string;
    eventDate: string;
    isActive: boolean;
    activeRoundNumber: 1 | 2;
    totalRounds: number;
  }>;
  players: Array<{
    id: string;
    name: string;
    username: string;
    order: number;
    latestRoundId?: string;
    ambroseGroupNumber: number | null;
    roundOnePosition: number | null;
    scores: Array<{ holeNumber: number; strokesRaw: number }>;
  }>;
};

export function AdminPanel({ event, events, players }: AdminPanelProps) {
  const [playerRows, setPlayerRows] = useState(players);
  const [settings, setSettings] = useState({
    eventName: event.name,
    eventDate: event.eventDate.slice(0, 10),
    roundStartHole: event.roundStartHole,
    activeRoundNumber: event.activeRoundNumber,
    maxDoubleParEnabled: event.maxDoubleParEnabled,
    capDeductionPerHoleDoublePar: event.capDeductionPerHoleDoublePar,
    excludeWorseThanDoubleBogey: event.excludeWorseThanDoubleBogey,
    maxInputStrokes: event.maxInputStrokes
  });

  const [message, setMessage] = useState("");

  function formatDateStable(isoDate: string): string {
    const date = new Date(isoDate);
    const day = String(date.getUTCDate()).padStart(2, "0");
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const year = date.getUTCFullYear();
    return `${day}/${month}/${year}`;
  }

  async function saveSettings() {
    const response = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings)
    });
    setMessage(response.ok ? "Settings saved" : "Failed to save settings");
  }

  async function createEventFromSettings() {
    const response = await fetch("/api/admin/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: settings.eventName,
        eventDate: settings.eventDate,
        roundStartHole: settings.roundStartHole,
        activeRoundNumber: 1,
        maxDoubleParEnabled: settings.maxDoubleParEnabled,
        capDeductionPerHoleDoublePar: settings.capDeductionPerHoleDoublePar,
        excludeWorseThanDoubleBogey: settings.excludeWorseThanDoubleBogey,
        maxInputStrokes: settings.maxInputStrokes
      })
    });
    setMessage(response.ok ? "New event created and activated" : "Failed to create event");
  }

  async function activateEvent(eventId: string) {
    const response = await fetch("/api/admin/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId })
    });
    setMessage(response.ok ? "Weekend activated. Refreshing..." : "Failed to activate weekend");
    if (response.ok) {
      window.location.reload();
    }
  }

  async function updatePlayer(playerId: string, form: FormData) {
    const fullName = String(form.get("name") ?? "").trim();
    const username = String(form.get("username") ?? "").trim();

    if (!fullName) {
      setMessage("Player name is required");
      return;
    }
    if (!username) {
      setMessage("Username is required");
      return;
    }

    const response = await fetch("/api/admin/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerId,
        name: fullName,
        username,
        pin: form.get("pin")
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage("Failed to update player");
      return;
    }

    setPlayerRows((prev) =>
      prev.map((row) =>
        row.id === playerId
          ? {
              ...row,
              name: fullName,
              username: typeof payload.username === "string" ? payload.username : username
            }
          : row
      )
    );
    setMessage(`Player updated. Username is now: ${payload.username ?? ""}`);
  }

  async function roundAction(playerId: string, action: "reset" | "unlock" | "complete") {
    const response = await fetch("/api/admin/rounds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, action })
    });
    setMessage(response.ok ? `Round action ${action} complete` : `Failed: ${action}`);
  }

  async function saveScores(playerId: string, form: FormData) {
    const scores = HOLES.map((hole) => {
      const value = form.get(`hole_${hole.hole}`);
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 1) {
        return null;
      }
      return { holeNumber: hole.hole, strokes: parsed };
    }).filter((item): item is { holeNumber: number; strokes: number } => !!item);

    if (scores.length === 0) {
      setMessage("No hole scores entered");
      return;
    }

    const response = await fetch("/api/admin/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, scores })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setMessage(payload.error ?? "Failed to save scores");
      return;
    }

    setPlayerRows((prev) =>
      prev.map((row) => (row.id === playerId ? { ...row, scores: scores.map((score) => ({ holeNumber: score.holeNumber, strokesRaw: score.strokes })) } : row))
    );
    setMessage("Scores saved");
  }

  async function saveAmbroseGroups() {
    const assignments = playerRows
      .filter((player) => player.ambroseGroupNumber !== null)
      .map((player) => ({
        playerId: player.id,
        groupNumber: player.ambroseGroupNumber as number
      }));

    const response = await fetch("/api/admin/ambrose-groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignments })
    });

    setMessage(response.ok ? "Ambrose groups saved" : "Failed to save Ambrose groups");
  }

  function callawayForPlayer(scores: Array<{ holeNumber: number; strokesRaw: number }>) {
    return calculateCallawayResult(
      scores.map((score) => ({
        holeNumber: score.holeNumber,
        rawStrokes: score.strokesRaw,
        adjustedStrokes: adjustedStrokesForInput(score.strokesRaw, score.holeNumber, settings.maxDoubleParEnabled)
      })),
      {
        maxDoubleParEnabled: settings.maxDoubleParEnabled,
        capDeductionPerHoleDoublePar: settings.capDeductionPerHoleDoublePar,
        excludeWorseThanDoubleBogey: settings.excludeWorseThanDoubleBogey
      }
    );
  }

  function ambroseForPlayer(playerId: string, scores: Array<{ holeNumber: number; strokesRaw: number }>) {
    const player = playerRows.find((row) => row.id === playerId);
    if (!player || player.ambroseGroupNumber === null) return null;

    const teammates = playerRows.filter((row) => row.ambroseGroupNumber === player.ambroseGroupNumber);
    if (teammates.length === 0) return null;

    const handicap = teammates.reduce((sum, teammate) => sum + (teammate.roundOnePosition ?? 16), 0);
    const grossTotal = scores.reduce((sum, score) => sum + score.strokesRaw, 0);
    return {
      groupNumber: player.ambroseGroupNumber,
      teammates: teammates.map((row) => `${row.name} (${row.roundOnePosition ?? "-"})`),
      handicap,
      grossTotal,
      netScore: grossTotal - handicap
    };
  }

  return (
    <div className="space-y-6">
      <section className="panel">
        <p className="pill w-fit">Admin</p>
        <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">Event Settings</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Event Name</span>
            <input
              value={settings.eventName}
              onChange={(e) => setSettings((s) => ({ ...s, eventName: e.target.value }))}
              className="mt-1 w-full bg-white px-4 py-3"
            />
          </label>
          <label className="text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Event Date</span>
            <input
              type="date"
              value={settings.eventDate}
              onChange={(e) => setSettings((s) => ({ ...s, eventDate: e.target.value }))}
              className="mt-1 w-full bg-white px-4 py-3"
            />
          </label>
          <label className="panel-tight flex items-center gap-2 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Round Start</span>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                className={settings.roundStartHole === 1 ? "btn-primary" : "btn-secondary"}
                onClick={() => setSettings((s) => ({ ...s, roundStartHole: 1 }))}
              >
                1st
              </button>
              <button
                type="button"
                className={settings.roundStartHole === 10 ? "btn-primary" : "btn-secondary"}
                onClick={() => setSettings((s) => ({ ...s, roundStartHole: 10 }))}
              >
                10th
              </button>
            </div>
          </label>
          <label className="panel-tight flex items-center gap-2 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Active Round</span>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                className={settings.activeRoundNumber === 1 ? "btn-primary" : "btn-secondary"}
                onClick={() => setSettings((s) => ({ ...s, activeRoundNumber: 1 }))}
              >
                Round 1
              </button>
              <button
                type="button"
                className={settings.activeRoundNumber === 2 ? "btn-primary" : "btn-secondary"}
                onClick={() => setSettings((s) => ({ ...s, activeRoundNumber: 2 }))}
              >
                Round 2
              </button>
            </div>
          </label>
          <label className="panel-tight flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.maxDoubleParEnabled}
              onChange={(e) => setSettings((s) => ({ ...s, maxDoubleParEnabled: e.target.checked }))}
            />
            Enable max double par per-hole cap
          </label>
          <label className="panel-tight flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.capDeductionPerHoleDoublePar}
              onChange={(e) => setSettings((s) => ({ ...s, capDeductionPerHoleDoublePar: e.target.checked }))}
            />
            Cap deduction per hole at double par
          </label>
          <label className="panel-tight flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.excludeWorseThanDoubleBogey}
              onChange={(e) => setSettings((s) => ({ ...s, excludeWorseThanDoubleBogey: e.target.checked }))}
            />
            Exclude worse than double bogey from Callaway deductions
          </label>
          <label className="text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Max Input Strokes</span>
            <input
              type="number"
              min={10}
              max={30}
              value={settings.maxInputStrokes}
              onChange={(e) => setSettings((s) => ({ ...s, maxInputStrokes: Number(e.target.value) }))}
              className="mt-1 w-full bg-white px-4 py-3"
            />
          </label>
        </div>
        <div className="mobile-sticky-actions mt-4">
          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
            <button className="btn-primary" onClick={saveSettings}>Save Settings</button>
            <button onClick={createEventFromSettings} className="btn-secondary">
              Create New Event
            </button>
            <a href="/admin/help" className="btn-secondary">
              Admin Help
            </a>
            <a href="/api/admin/export/leaderboard" className="btn-secondary">
              Export Leaderboard CSV
            </a>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2 className="text-2xl font-semibold sm:text-3xl">Weekend History</h2>
        <p className="mt-1 text-sm text-slate-600">Past weekends are preserved. Activate one to view/edit that weekend.</p>
        <div className="mt-4 space-y-2">
          {events.map((weekend) => (
            <div key={weekend.id} className="panel-tight flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{weekend.name}</p>
                <p className="text-xs text-slate-600">
                  {formatDateStable(weekend.eventDate)} | Round {weekend.activeRoundNumber} of {weekend.totalRounds}
                </p>
              </div>
              {weekend.isActive ? (
                <span className="pill">Active</span>
              ) : (
                <button className="btn-secondary" type="button" onClick={() => activateEvent(weekend.id)}>
                  Make Active
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2 className="text-2xl font-semibold sm:text-3xl">Players</h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600">Round 2 Ambrose groups are set manually. Pair players into group numbers (1-8).</p>
          <button type="button" className="btn-primary" onClick={saveAmbroseGroups}>
            Save Ambrose Groups
          </button>
        </div>
        <div className="mt-4 space-y-4">
          {playerRows.map((player) => (
            <div key={player.id} className="panel-tight">
              {(() => {
                const calc = callawayForPlayer(player.scores);
                const ambrose = ambroseForPlayer(player.id, player.scores);
                return (
                  <>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  updatePlayer(player.id, new FormData(e.currentTarget));
                }}
              >
                <div className="grid gap-2 lg:grid-cols-4">
                  <input name="name" defaultValue={player.name} placeholder="Player name" required className="bg-white px-4 py-3" />
                  <input name="username" defaultValue={player.username} placeholder="Username" required className="bg-white px-4 py-3" />
                  <input name="pin" placeholder="6 digit PIN" inputMode="numeric" pattern="[0-9]{6}" required className="bg-white px-4 py-3" />
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-primary" type="submit">Save</button>
                    <a href={`/api/admin/export/player/${player.id}`} className="btn-secondary">
                      CSV
                    </a>
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-600">Username can be edited directly.</p>
                <div className="mt-2 flex items-center gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Ambrose Group</label>
                  <select
                    value={player.ambroseGroupNumber ?? ""}
                    onChange={(e) =>
                      setPlayerRows((prev) =>
                        prev.map((row) =>
                          row.id === player.id
                            ? {
                                ...row,
                                ambroseGroupNumber: e.target.value ? Number(e.target.value) : null
                              }
                            : row
                        )
                      )
                    }
                    className="w-24 bg-white px-3 py-2"
                  >
                    <option value="">-</option>
                    {Array.from({ length: 8 }, (_, i) => i + 1).map((num) => (
                      <option key={num} value={num}>
                        {num}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-sm">
                <button className="btn-secondary" type="button" onClick={() => roundAction(player.id, "unlock")}>
                  Unlock
                </button>
                  <button className="btn-secondary" type="button" onClick={() => roundAction(player.id, "complete")}>
                    Mark Complete
                  </button>
                  <button type="button" className="btn-danger" onClick={() => roundAction(player.id, "reset")}>
                    Reset Round
                  </button>
                </div>
                </form>

              <details className="mt-4 rounded-xl border border-slate-200 bg-white/70 p-3">
                <summary className="cursor-pointer text-sm font-semibold">Enter or adjust hole scores (Active round)</summary>
                <form
                  className="mt-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveScores(player.id, new FormData(e.currentTarget));
                  }}
                >
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {HOLES.map((hole) => {
                      const existing = player.scores.find((score) => score.holeNumber === hole.hole);
                      return (
                        <label key={`${player.id}-${hole.hole}`} className="panel-tight text-xs font-semibold">
                          H{hole.hole} (P{hole.par})
                          <input
                            name={`hole_${hole.hole}`}
                            type="number"
                            min={1}
                            max={settings.maxInputStrokes}
                            defaultValue={existing?.strokesRaw ?? ""}
                            className="mt-1 w-full bg-white"
                          />
                        </label>
                      );
                    })}
                  </div>
                  <div className="mt-3">
                    <button className="btn-primary" type="submit">
                      Save Hole Scores
                    </button>
                  </div>
                </form>
              </details>
              <details className="mt-3 rounded-xl border border-slate-200 bg-white/70 p-3">
                <summary className="cursor-pointer text-sm font-semibold">Callaway calculation breakdown</summary>
                {settings.activeRoundNumber === 2 && ambrose ? (
                  <div className="mt-3 space-y-2 text-sm">
                    <p><span className="font-semibold">Format:</span> Ambrose</p>
                    <p><span className="font-semibold">Group:</span> {ambrose.groupNumber}</p>
                    <p><span className="font-semibold">Teammates (Round 1 position):</span> {ambrose.teammates.join(", ")}</p>
                    <p><span className="font-semibold">Ambrose handicap (sum of Round 1 positions):</span> {ambrose.handicap}</p>
                    <p><span className="font-semibold">Ambrose gross:</span> {ambrose.grossTotal}</p>
                    <p className="font-semibold text-slate-700">
                      Net = Gross ({ambrose.grossTotal}) - Handicap ({ambrose.handicap}) = {ambrose.netScore}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                      <p><span className="font-semibold">Adjusted gross:</span> {calc.adjustedGross}</p>
                      <p><span className="font-semibold">Entitlement:</span> {calc.entitlement} worst holes</p>
                      <p><span className="font-semibold">Selected holes:</span> {calc.selectedHoleNumbers.length > 0 ? calc.selectedHoleNumbers.join(", ") : "-"}</p>
                      <p><span className="font-semibold">Half-hole applied:</span> {calc.halfHoleAppliedTo ?? "-"}</p>
                      <p><span className="font-semibold">Deductible strokes sum:</span> {calc.deductibleSum.toFixed(1)}</p>
                      <p><span className="font-semibold">Adjustment factor:</span> {calc.adjustment >= 0 ? `+${calc.adjustment}` : calc.adjustment}</p>
                      <p><span className="font-semibold">Handicap allowance:</span> {calc.handicapAllowance.toFixed(1)}</p>
                      <p><span className="font-semibold">Table version:</span> {calc.tableVersion}</p>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-700">
                      Net = Adjusted Gross ({calc.adjustedGross}) - Handicap Allowance ({calc.handicapAllowance.toFixed(1)}) = {calc.netScore.toFixed(1)}
                    </p>
                    {calc.isMaxHandicapApplied && (
                      <p className="mt-2 text-xs font-semibold text-orange-700">Maximum Callaway handicap of 50 applied.</p>
                    )}
                  </>
                )}
              </details>
                  </>
                );
              })()}
            </div>
          ))}
        </div>
      </section>
      {message && <p className="text-sm font-semibold text-teal-700">{message}</p>}
    </div>
  );
}
