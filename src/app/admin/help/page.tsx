import Link from "next/link";
import { requireAdmin } from "@/lib/server";

export default async function AdminHelpPage() {
  await requireAdmin();

  return (
    <div className="space-y-6">
      <section className="panel">
        <p className="pill w-fit">Admin Help</p>
        <h1 className="mt-2 text-3xl font-semibold">Golf Weekend Admin Guide</h1>
        <p className="mt-3 text-sm text-slate-700">
          This page explains how scoring works in this app, what each setting does, and the recommended admin flow across a two-round weekend.
        </p>
        <div className="mt-4">
          <Link href="/admin" className="btn-secondary">Back to Admin</Link>
        </div>
      </section>

      <section className="panel">
        <h2 className="text-2xl font-semibold">Round Formats</h2>
        <div className="mt-3 space-y-2 text-sm text-slate-700">
          <p><span className="font-semibold">Round 1:</span> Individual stroke play with Callaway net calculation.</p>
          <p><span className="font-semibold">Round 2:</span> Ambrose in pairs. Team gross is entered once and synced to both players in the pair.</p>
          <p><span className="font-semibold">Round selector:</span> Players can view Round 1 or Round 2 on their scorecard. Round 2 entry only opens after Ambrose groups are allocated.</p>
        </div>
      </section>

      <section className="panel">
        <h2 className="text-2xl font-semibold">Callaway Rules Implemented</h2>
        <div className="mt-3 space-y-2 text-sm text-slate-700">
          <p>Callaway table used: standard par 72 table stored in code as structured data.</p>
          <p>All holes (1 to 18) are eligible for deductions. No hole exclusions are applied.</p>
          <p>Half-hole entitlements are applied to half of the smallest selected worst hole.</p>
          <p>Tie-break order: lowest net, then lower adjusted gross, then shared placing.</p>
        </div>
      </section>

      <section className="panel">
        <h2 className="text-2xl font-semibold">Scoring Toggles</h2>
        <div className="mt-3 space-y-3 text-sm text-slate-700">
          <p><span className="font-semibold">Enable max double par per-hole cap:</span> Caps entered hole scores before totals and worst-hole selection (par 3 max 6, par 4 max 8, par 5 max 10).</p>
          <p><span className="font-semibold">Cap deduction per hole at double par:</span> Limits the deduction amount any single hole can contribute to 2 x par.</p>
          <p><span className="font-semibold">Exclude scores at or above double par from Callaway deductions:</span> Holes at double par or worse are not deductible and always count at full value in round scoring.</p>
          <p><span className="font-semibold">Max input strokes:</span> Validation limit for hole entry (players and admin).</p>
          <p><span className="font-semibold">Required drives per player (Round 2):</span> Sets the target number of tee drives each player should contribute in Ambrose.</p>
          <p><span className="font-semibold">Round start:</span> Applies to the whole round/event (1st or 10th), not per player.</p>
        </div>
      </section>

      <section className="panel">
        <h2 className="text-2xl font-semibold">Round Locking</h2>
        <div className="mt-3 space-y-2 text-sm text-slate-700">
          <p>Use <span className="font-semibold">Mark Complete</span> to lock a player round when finished.</p>
          <p>Locked rounds cannot be edited by players.</p>
          <p>For Round 2 Ambrose, if a teammate round is locked, edits are blocked for the whole pair to keep team scoring consistent.</p>
          <p>Use <span className="font-semibold">Unlock</span> if changes are required.</p>
        </div>
      </section>

      <section className="panel">
        <h2 className="text-2xl font-semibold">Ambrose Group Setup (Round 2)</h2>
        <div className="mt-3 space-y-2 text-sm text-slate-700">
          <p>Set a group number for each player in the Players section, then click <span className="font-semibold">Save Ambrose Groups</span>.</p>
          <p>Each group should contain exactly two players.</p>
          <p>Round 2 handicap for a pair is the sum of each player&apos;s Round 1 finishing position.</p>
          <p>Example: position 5 + position 13 = handicap 18.</p>
        </div>
      </section>

      <section className="panel">
        <h2 className="text-2xl font-semibold">Recommended Weekend Workflow</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-700">
          <li>Create weekend event and confirm settings.</li>
          <li>Check players, usernames and PINs.</li>
          <li>Set active round to Round 1 and score the day.</li>
          <li>When finished, mark rounds complete/locked.</li>
          <li>Allocate Ambrose groups for Round 2 and save.</li>
          <li>Switch active round to Round 2.</li>
          <li>After play, lock Round 2 rounds and export CSV if required.</li>
        </ol>
      </section>

      <section className="panel">
        <h2 className="text-2xl font-semibold">Troubleshooting</h2>
        <div className="mt-3 space-y-2 text-sm text-slate-700">
          <p><span className="font-semibold">Player cannot enter Round 2:</span> check Ambrose group allocation and active event.</p>
          <p><span className="font-semibold">Save rejected as locked:</span> unlock the round in admin.</p>
          <p><span className="font-semibold">Wrong player credentials:</span> update username/PIN in Players and ask player to log in again.</p>
          <p><span className="font-semibold">Data mismatch:</span> use refresh and confirm you are on the correct active weekend.</p>
        </div>
      </section>
    </div>
  );
}
