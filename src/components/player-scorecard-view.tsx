import { HOLES } from "@/lib/course";

export function PlayerScorecardView({
  tournamentName,
  playerName,
  scores
}: {
  tournamentName: string;
  playerName: string;
  scores: Array<{ holeNumber: number; strokesRaw: number; strokesAdjusted: number }>;
}) {
  const map = new Map(scores.map((score) => [score.holeNumber, score]));

  return (
    <section className="panel">
      <p className="pill w-fit">Public View</p>
      <h1 className="mt-2 text-4xl font-semibold">{tournamentName}</h1>
      <p className="mt-1 text-sm text-slate-600">{playerName} - Scorecard</p>
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
