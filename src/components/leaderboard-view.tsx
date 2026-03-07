"use client";

import { useState } from "react";
import { useLiveData } from "@/hooks/use-live-data";

type BoardRow = {
  place: string;
  playerId: string;
  playerName: string;
  holesCompleted: number;
  frontNine: number;
  backNine: number;
  grossTotal: number;
  grossToPar: number | null;
  adjustedGross: number;
  handicapAllowance: number;
  netScore: number;
};
type GrossRow = Omit<BoardRow, "place">;

type LeaderboardResponse = {
  event: {
    name: string;
    date: string;
    activeRoundNumber: 1 | 2;
    totalRounds: number;
    settings: {
      maxDoubleParEnabled: boolean;
      capDeductionPerHoleDoublePar: boolean;
      excludeWorseThanDoubleBogey: boolean;
      callawayTableVersion: string;
    };
  };
  weekend: { net: BoardRow[]; gross: GrossRow[] };
  round1: { net: BoardRow[]; gross: GrossRow[] };
  round2: {
    net: BoardRow[];
    gross: GrossRow[];
    teams: Array<{
      place: number;
      groupId: string;
      groupNumber: number;
      players: string[];
      handicap: number;
      grossTotal: number;
      netScore: number;
      holesCompleted: number;
    }>;
  };
  holeProgress: Array<{ hole: number; completed: number; distribution: Record<string, number> }>;
};

export function LeaderboardView() {
  const { data, error, isLoading } = useLiveData<LeaderboardResponse>("/api/leaderboard", 7000);
  const [mode, setMode] = useState<"weekend" | "round1" | "round2">("weekend");

  if (error) {
    return <p className="text-red-700">Could not load leaderboard.</p>;
  }

  if (isLoading || !data) {
    return <p>Loading leaderboard...</p>;
  }

  function formatToPar(value: number | null): string {
    if (value === null) return "In progress";
    if (value === 0) return "E";
    return value > 0 ? `+${value}` : String(value);
  }

  const selected = mode === "weekend" ? data.weekend : mode === "round1" ? data.round1 : data.round2;

  return (
    <div className="space-y-6">
      <section className="panel relative overflow-hidden">
        <div className="absolute right-0 top-0 h-28 w-28 -translate-y-8 translate-x-8 rounded-full bg-orange-200/50 blur-2xl" />
        <h1 className="relative text-3xl font-semibold leading-tight sm:text-4xl">{data.event.name}</h1>
        <p className="relative mt-2 text-sm text-slate-600">Weekend aggregate leaderboard with dedicated Day 2 Ambrose team view.</p>
        <div className="relative mt-3 flex flex-wrap gap-2">
          <span className="pill">Active round: {data.event.activeRoundNumber}</span>
          <span className="pill">Max double par {data.event.settings.maxDoubleParEnabled ? "ON" : "OFF"}</span>
          <span className="pill">Deduction cap {data.event.settings.capDeductionPerHoleDoublePar ? "ON" : "OFF"}</span>
          <span className="pill">Exclude &gt;= double par {data.event.settings.excludeWorseThanDoubleBogey ? "ON" : "OFF"}</span>
          <span className="pill">{data.event.settings.callawayTableVersion}</span>
        </div>
        <div className="mobile-sticky-actions relative mt-4">
          <div className="flex flex-wrap gap-2">
          <button className={mode === "weekend" ? "btn-primary" : "btn-secondary"} onClick={() => setMode("weekend")}>
            Weekend Total
          </button>
          <button className={mode === "round1" ? "btn-primary" : "btn-secondary"} onClick={() => setMode("round1")}>
            Round 1
          </button>
          <button className={mode === "round2" ? "btn-primary" : "btn-secondary"} onClick={() => setMode("round2")}>
            Round 2 Ambrose
          </button>
          </div>
        </div>
      </section>

      {mode === "round2" && (
        <section className="panel">
          <h2 className="text-2xl font-semibold">Round 2 Ambrose Team Leaderboard</h2>
          <ol className="mt-3 grid gap-2 md:hidden">
            {data.round2.teams.map((team) => (
              <li key={team.groupId} className="panel-tight">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">#{team.place} Group {team.groupNumber}</p>
                  <p className="text-lg font-bold text-orange-700">{team.netScore}</p>
                </div>
                <p className="mt-1 text-xs text-slate-600">{team.players.join(", ")}</p>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-600">
                  <p>Holes: <span className="font-semibold text-slate-800">{team.holesCompleted}</span></p>
                  <p>Gross: <span className="font-semibold text-slate-800">{team.grossTotal}</span></p>
                  <p>Hcp: <span className="font-semibold text-slate-800">{team.handicap}</span></p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-3 hidden overflow-x-auto md:block">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Place</th>
                  <th>Team</th>
                  <th>Players</th>
                  <th>Holes</th>
                  <th>Gross</th>
                  <th>Handicap</th>
                  <th>Net</th>
                </tr>
              </thead>
              <tbody>
                {data.round2.teams.map((team) => (
                  <tr key={team.groupId}>
                    <td>{team.place}</td>
                    <td className="font-semibold">Group {team.groupNumber}</td>
                    <td>{team.players.join(", ")}</td>
                    <td>{team.holesCompleted}</td>
                    <td>{team.grossTotal}</td>
                    <td>{team.handicap}</td>
                    <td className="font-bold text-orange-700">{team.netScore}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="panel">
        <h2 className="text-2xl font-semibold">
          {mode === "weekend" ? "Weekend Total - Net Leaderboard" : mode === "round1" ? "Round 1 - Net Leaderboard" : "Round 2 - Player Net View"}
        </h2>
        <ol className="mt-3 grid gap-2 md:hidden">
          {selected.net.map((row) => (
            <li key={row.playerId} className="panel-tight">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{row.place}</p>
                  <a href={`/player/${row.playerId}`} className="font-semibold text-teal-700 underline-offset-4 hover:underline">
                    {row.playerName}
                  </a>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Net</p>
                  <p className="text-lg font-bold text-orange-700">{row.netScore.toFixed(1)}</p>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-600">
                <p>Holes: <span className="font-semibold text-slate-800">{row.holesCompleted}</span></p>
                <p>Total: <span className="font-semibold text-slate-800">{row.grossTotal}</span></p>
                <p>-/+: <span className="font-semibold text-slate-800">{formatToPar(row.grossToPar)}</span></p>
                <p>F9: <span className="font-semibold text-slate-800">{row.frontNine}</span></p>
                <p>B9: <span className="font-semibold text-slate-800">{row.backNine}</span></p>
                <p>Hcp: <span className="font-semibold text-slate-800">{row.handicapAllowance.toFixed(1)}</span></p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-2 hidden overflow-x-auto md:block">
          <table className="data-table">
            <thead>
              <tr>
                <th>Place</th>
                <th>Player</th>
                <th>Holes</th>
                <th>F9</th>
                <th>B9</th>
                <th>Total</th>
                <th>-/+ Score</th>
                <th>Adj Gross</th>
                <th>Hcp</th>
                <th>Net</th>
              </tr>
            </thead>
            <tbody>
              {selected.net.map((row) => (
                <tr key={row.playerId}>
                  <td className="font-semibold">{row.place}</td>
                  <td>
                    <a href={`/player/${row.playerId}`} className="font-semibold text-teal-700 underline-offset-4 hover:underline">
                      {row.playerName}
                    </a>
                  </td>
                  <td>{row.holesCompleted}</td>
                  <td>{row.frontNine}</td>
                  <td>{row.backNine}</td>
                  <td>{row.grossTotal}</td>
                  <td>{formatToPar(row.grossToPar)}</td>
                  <td>{row.adjustedGross}</td>
                  <td>{row.handicapAllowance.toFixed(1)}</td>
                  <td className="font-bold text-orange-700">{row.netScore.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2 className="text-2xl font-semibold">
          {mode === "weekend" ? "Weekend Total - Gross Leaderboard" : mode === "round1" ? "Round 1 - Gross Leaderboard" : "Round 2 - Gross Leaderboard"}
        </h2>
        <ol className="mt-3 grid gap-2 text-sm">
          {selected.gross.map((row, index) => (
            <li key={row.playerId} className="panel-tight flex items-center justify-between">
              <span className="font-medium">
                {index + 1}. {row.playerName}
              </span>
              <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
                {row.grossTotal} ({formatToPar(row.grossToPar)})
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="panel">
        <h2 className="text-2xl font-semibold">Per Hole Progress (Active Round {data.event.activeRoundNumber})</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          {data.holeProgress.map((item) => (
            <div key={item.hole} className="panel-tight text-sm">
              <p className="font-semibold">
                Hole {item.hole} <span className="text-slate-500">({item.completed}/16 complete)</span>
              </p>
              <p className="mt-1 text-slate-600">
                Distribution: {Object.keys(item.distribution).length === 0 ? "-" : Object.entries(item.distribution).map(([score, count]) => `${score}:${count}`).join("  ")}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
