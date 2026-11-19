import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AccProcessor, BodyHub, MQTT_URL, PMD_SERVICE, TOPIC_ROOT, parseHeartRate, type Acc, type Signal } from './bodies';
import { useFonts } from './Speelkamer';
import { heartbeat, knock, tick, unlock } from './sound';
import { CSS, ClockFace, sourceMark } from './ui';

function hashParams() {
  const q = location.hash.split('?')[1] ?? '';
  return new URLSearchParams(q);
}

/** Telefoon als zender: leest een hartslagband en/of de eigen bewegingssensor en stuurt door op het kanaal. */
export function Zender() {
  useFonts();
  const params = hashParams();
  const kanaal = params.get('kanaal') ?? '';
  const [name, setName] = useState(() => params.get('naam') ?? '');
  const id = useMemo(() => Math.random().toString(36).slice(2, 8), []);
  const [hr, setHr] = useState(0);
  const [status, setStatus] = useState('niet verbonden');
  const [motion, setMotion] = useState(false);
  const [acc, setAcc] = useState<Partial<Acc>>({});
  const client = useRef<{ publish: (t: string, m: string) => void; end: () => void } | null>(null);
  const nameRef = useRef(name);
  nameRef.current = name;
  const proc = useRef(new AccProcessor(() => undefined));

  useEffect(() => {
    if (!kanaal) return;
    let c: { end: () => void } | null = null;
    import('mqtt').then(({ default: mqtt }) => {
      const cl = mqtt.connect(MQTT_URL, { clientId: `zender-${id}`, reconnectPeriod: 3000 });
      cl.on('connect', () => setStatus(`verbonden met kanaal ${kanaal}`));
      cl.on('error', (e: Error) => setStatus(`fout: ${e.message}`));
      client.current = cl as unknown as { publish: (t: string, m: string) => void; end: () => void };
      c = cl;
    });
    return () => c?.end();
  }, [kanaal, id]);

  const send = (payload: object) => client.current?.publish(`${TOPIC_ROOT}/${kanaal}/lijf/${id}`, JSON.stringify({ name: nameRef.current || 'telefoon', ...payload }));

  // bewegingsfeatures 5× per seconde doorsturen
  useEffect(() => {
    const t = window.setInterval(() => {
      if (!motion && !proc.current) return;
      const f = proc.current.features();
      if (motion || f.activity) {
        setAcc(f);
        send({ acc: f });
      }
    }, 200);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motion]);

  const connectBand = async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bt = (navigator as any).bluetooth;
      if (!bt) throw new Error('Geen Web Bluetooth. Gebruik Chrome op Android, of op iPhone de app Bluefy.');
      const device = await bt.requestDevice({ filters: [{ services: ['heart_rate'] }], optionalServices: [PMD_SERVICE] });
      const server = await device.gatt.connect();
      const ch = await (await server.getPrimaryService('heart_rate')).getCharacteristic('heart_rate_measurement');
      ch.addEventListener('characteristicvaluechanged', (ev: Event) => {
        const d = parseHeartRate((ev.target as unknown as { value: DataView }).value);
        setHr(d.hr);
        send(d);
      });
      await ch.startNotifications();
      if (!name && device.name) setName(device.name);
    } catch (e) {
      if (e instanceof Error && e.name !== 'NotFoundError') setStatus(e.message);
    }
  };

  const enableMotion = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const DME = (window as any).DeviceMotionEvent;
    if (DME?.requestPermission) {
      const r = await DME.requestPermission();
      if (r !== 'granted') return setStatus('geen toestemming voor beweging');
    }
    window.addEventListener('devicemotion', (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x === null) return;
      // m/s² → mg
      proc.current.push((a.x ?? 0) * 102, (a.y ?? 0) * 102, (a.z ?? 0) * 102, performance.now());
    });
    setMotion(true);
  };

  return (
    <div className="sk min-h-svh bg-room text-ink p-6 flex flex-col gap-5 max-w-[480px] mx-auto">
      <style>{CSS}</style>
      <div className="serif text-[36px] leading-none">Zender</div>
      <div className="mono text-[11px] text-ink-3">{kanaal ? status : 'geen kanaal in de link (…#speelkamer/zender?kanaal=code)'}</div>
      <label className="text-[13px]">
        jouw naam
        <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full bg-ink/[0.05] border border-ink/15 rounded-lg px-3 py-2 text-[16px]" />
      </label>
      <button className="btn accent big" onClick={connectBand}>♥ verbind hartslagband</button>
      <button className={`btn big ${motion ? 'accent' : ''}`} onClick={enableMotion}>{motion ? 'beweging wordt gestuurd' : '↯ gebruik bewegingssensor'}</button>
      <div className="card p-5 text-center">
        <div className="serif text-[80px] leading-none">{hr || '–'}</div>
        <div className="mono text-[11px] text-ink-3">bpm</div>
        {motion && (
          <div className="mono text-[11px] text-ink-3 mt-3">
            beweging {Math.round((acc.activity ?? 0) * 100)}% · pas {Math.round(acc.cadence ?? 0)} · adem {(acc.breathRate ?? 0).toFixed(0)}/min
          </div>
        )}
      </div>
      <p className="text-[12px] text-ink-3">Houd deze pagina open en het scherm aan. Draag de telefoon in een armband of strak in een zak voor beweging; op de borst zie je ook je adem.</p>
    </div>
  );
}

/** Klokscherm voor in de ruimte: tikt het hart, de pas of de adem van wie de Speelkamer aanwijst. */
export function KlokScherm() {
  useFonts();
  const params = hashParams();
  const kanaal = params.get('kanaal') ?? '';
  const hub = useMemo(() => new BodyHub(0), []);
  const [, force] = useReducer((x: number) => x + 1, 0);
  const [cmd, setCmd] = useState<{ target: string; signal: Signal } | null>(null);
  const [ticks, setTicks] = useState(0);
  const [sound, setSound] = useState(false);
  const cmdRef = useRef(cmd);
  cmdRef.current = cmd;
  useEffect(() => {
    hub.onChange = force;
    hub.start();
    hub.onKlok = (c) => {
      setCmd(c);
      setTicks(0);
    };
    if (kanaal) void hub.joinChannel(kanaal);
    const off = hub.on((id, s) => {
      const c = cmdRef.current;
      if (!c || id !== `kanaal-${c.target}` || s !== c.signal) return;
      setTicks((n) => n + 1);
      if (s === 'hart') tick(1);
      else if (s === 'pas') knock(1);
      else heartbeat(0.4, 0, 0.7);
    });
    return () => {
      off();
      hub.dispose();
    };
  }, [hub, kanaal]);
  return (
    <div className="sk min-h-svh bg-room text-ink flex flex-col items-center justify-center gap-6" onPointerDown={() => unlock().then(setSound)}>
      <style>{CSS}</style>
      <ClockFace ticks={ticks} size={Math.min(window.innerWidth, window.innerHeight) * 0.72} />
      <div className="mono text-[12px] text-ink-4">
        {kanaal ? `${hub.channelStatus} · ${hub.bodies.length} lichamen ${hub.bodies.map((b) => sourceMark(b)).join('')}` : 'geen kanaal'} · {cmd ? `tikt: ${cmd.signal}` : 'wacht op een ronde'}
        {!sound && ' · tik op het scherm voor geluid'}
      </div>
    </div>
  );
}
