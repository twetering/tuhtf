import type { Body, BodyHub } from './bodies';
import { sourceMark } from './ui';

/** Kies 'mijn lichaam': een echte band als die er is, anders een gesimuleerde 'jij'. */
export function pickMe(hub: BodyHub, id: string | null): Body {
  return hub.get(id) ?? hub.bodies.find((b) => b.source !== 'sim') ?? hub.ensureSim('jij', 'jij (sim)', 40);
}

export function MeSelect({ hub, me, setMe }: { hub: BodyHub; me: Body; setMe: (id: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-[12.5px] text-ink-3">
      mijn lichaam
      <select value={me.id} onChange={(e) => setMe(e.target.value)} className="bg-ink/[0.06] border border-ink/10 rounded-md px-2 py-1 text-ink">
        {!hub.get('jij') && <option value="jij">jij (sim)</option>}
        {hub.bodies.map((b) => (
          <option key={b.id} value={b.id}>
            {sourceMark(b)} {b.name}
          </option>
        ))}
      </select>
      {me.source === 'sim' && <span className="mono text-[10px] text-ink-4" title="koppel een band voor het echte werk">sim</span>}
    </label>
  );
}

/** Bedieningspaneel om een gesimuleerd lichaam te 'besturen' (alleen om te testen). */
export function SimControls({ b }: { b: Body }) {
  if (!b.sim) return null;
  const s = b.sim;
  const btn = (label: string, on: boolean, set: (v: boolean) => void) => (
    <button className={`btn !text-[11.5px] ${on ? 'accent' : ''}`} onClick={() => set(!on)}>
      {label}
    </button>
  );
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mono text-[10px] text-ink-3 mr-1">sim-lichaam:</span>
      {btn('adem rustig', s.breathRate <= 7, (v) => {
        s.breathRate = v ? 6 : 13;
        if (v) s.tension = Math.max(0, s.tension - 0.15);
      })}
      {btn('span aan', s.tension >= 0.6, (v) => (s.tension = v ? 0.75 : 0.1))}
      {btn('beweeg', s.activity >= 0.4, (v) => (s.activity = v ? 0.5 : 0))}
    </div>
  );
}
