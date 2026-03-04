import { HOLES } from "@/lib/course";

export function PlayerScorecardView({
  tournamentName,
  playerName,
  roundNumber,
  scores,
  callaway
}: {
  tournamentName: string;
  playerName: string;
  roundNumber: 1 | 2;
  scores: Array<{ holeNumber: number; strokesRaw: number; strokesAdjusted: number }>;
  callaway: null | {
    adjustedGross: number;
    handicapAllowance: number;
    netScore: number;
  };
}) {
  const map = new Map(scores.map((score) => [score.holeNumber, score]));
  const showCallaway = roundNumber === 1 && scores.length === 18 && !!callaway;

  return (
    <section className="panel">
      <p className="pill w-fit">Public View</p>
      <h1 className="mt-2 text-4xl font-semibold">{tournamentName}</h1>
      <p className="mt-1 text-sm text-slate-600">{playerName} - Scorecard</p>
      {roundNumber === 1 && scores.length < 18 && (
        <p className="mt-2 text-sm font-semibold text-slate-700">
          Callaway handicap and net are hidden until 18 holes are complete.
        </p>
      )}
      {showCallaway && (
        <p className="mt-2 text-sm font-semibold text-slate-700">
          Adjusted gross {callaway.adjustedGross} | Callaway handicap {callaway.handicapAllowance.toFixed(1)} | Net {callaway.netScore.toFixed(1)}
        </p>
      )}
      <div className="mt-3 overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Hole</th>
              <th>Par</th>
              <th>Raw</th>
              <th>Adjusted</th>
            </tr>
          </thead>
          <tbody>
            {HOLES.map((hole) => {
              const score = map.get(hole.hole);
              return (
                <tr key={hole.hole}>
                  <td>{hole.hole}</td>
                  <td>{hole.par}</td>
                  <td>{score?.strokesRaw ?? "-"}</td>
                  <td>{score?.strokesAdjusted ?? "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
