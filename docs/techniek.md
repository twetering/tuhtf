# Techniek

Voor wie de code wil draaien, aanpassen of uitbreiden.

## Starten

Vereist: Node 20.18 of nieuwer.

```bash
npm install
npm run dev
```

Dit start Vite (meestal op http://localhost:5173) en een kleine API-server op poort 8788. Op `http://localhost:5173` staat de landingspagina met alle subprojecten. De Speelkamer staat op `http://localhost:5173/app.html#speelkamer`. Hij heeft de API-server niet nodig. Die is alleen voor de zwerm- en huiskamer-prototypes, die taalmodellen aanroepen.

```bash
npm run build     # productiebuild naar dist/
npm run preview   # bekijk de build lokaal
```

**Deployen.** Het project draait op Vercel (`vercel.json`). De Speelkamer is volledig statisch: alles draait in de browser, en de stemmen zijn vooraf gemaakt en staan in `public/`. Voor telefoons als zender heb je https nodig, en dus de gedeployde versie.

## Adressen

Het project heeft drie ingangen (zie `build.rollupOptions.input` in `vite.config.ts`):

- `index.html`: de landingspagina. Gewone HTML, zonder React. Een adres met een hash (zoals het oude `…/#speelkamer`) stuurt hij door naar `/app.html#…`.
- `app.html`: de React-app met de Speelkamer en de oudere prototypes. Welke je ziet, hangt af van de hash.
- `dier-nadoen/index.html`: het subproject Dier nadoen. Los TypeScript, zonder React.

| Adres | Wat |
|---|---|
| `/` | Landingspagina |
| `/dier-nadoen/` | Dier nadoen |
| `/app.html#speelkamer` | De Speelkamer met alle werkvormen |
| `/app.html#speelkamer/zender?kanaal=<code>` | Telefoon als zender (band en/of bewegingssensor) |
| `/app.html#speelkamer/klok?kanaal=<code>` | Klokscherm voor de ruimte (bij *Wiens klok?*) |
| `/app.html#huiskamer` | Huiskamer v2: *De kamer luistert* |
| `/app.html#huiskamer-v1` | Huiskamer v1 |
| `/app.html` | Zwermcanvas met LLM-agents |
| `/tijdatlas.html` | Tijdatlas: *Kwartiermaken in het klokgebouw* |

## Mappen

```
index.html           landingspagina
app.html             ingang van de React-app (src/main.tsx)
dier-nadoen/         subproject Dier nadoen
  main.ts            interface: zes stappen, bronnen (M5Stick via MQTT, telefoon, simulatie), opslag
  features.ts        kenmerken per venster van 2 s
  model.ts           kNN en eerlijk toetsen
  sim.ts             gesimuleerde dieren
src/
  speelkamer/        De Speelkamer
    Speelkamer.tsx   schil: navigatie, bovenbalk, opstelling (⚙), info-paneel (ⓘ)
    bodies.ts        BodyHub: alle lichamen (banden, sticks, telefoons, simulaties), MQTT, Web Bluetooth
    motion.ts        bewegingsanalyse: oriëntatie, adem per ademhaling, pas, sprong, draai, onrust
    ui.tsx           huisstijl, thema's per kamer, gedeelde componenten
    sound.ts         WebAudio-synthese: hartslag, drones, lucht, ventilator, modem, fluit, piep
    WiensKlok.tsx  Gym.tsx  Zweving.tsx  Beweging.tsx  Sensor.tsx  Leiden.tsx  Stick3D.tsx
    Gesprek.tsx  IsDitMijnHart.tsx  Machines.tsx  Digitaal.tsx  Meditaties.tsx  Live.tsx
    Zender.tsx       telefoon-zender en klokscherm
  huiskamer/  huiskamer2/   huiskamer-prototypes (simulatie + AI-dirigent)
  SwarmPerformance.tsx      zwermcanvas
lib/                 gedeelde types, modelpool en dirigent-prompts (server)
server/agent-api.ts  lokale API (Express)
api/agent-turn.ts    serverless versie voor Vercel
firmware/            M5StickC Plus2-zender (PlatformIO)
scripts/meditaties/  stemmen en meditaties genereren (ElevenLabs)
public/meditaties/   gerenderde meditaties en live-fragmenten
public/gym/          stemmen voor Gym
docs/                deze documentatie
```

## Lichamen en data

Alles draait om de **BodyHub** (`bodies.ts`). Een lichaam (`Body`) heeft een bron: `band` (Web Bluetooth), `kanaal` (stick of telefoon via MQTT; een stick herken je aan `src: 'm5'` in de berichten) of `sim` (gesimuleerd). Elk lichaam heeft hartslag, slagen, en als er een bewegingssensor is een `acc`-blok met activiteit, houding, adem, pas en meer.

**MQTT.** Broker `broker.hivemq.com`. Browsers via wss op poort 8884, de firmware via tcp op 1883. Topic: `tuhtf/speelkamer/<kanaal>/lijf/<id>`. Een stick stuurt pakketjes met ruwe versnelling (mg) en draaisnelheid (°/s) bij 50 Hz, plus tijd, volgnummer, batterij en knop.

**Bewegingsanalyse** (`motion.ts`): leert het nulpunt van de gyro als de sensor stilligt, schat de oriëntatie met een Mahony-filter, herkent elke ademhaling apart (3 tot 80 per minuut, met een kwaliteitsmaat), en detecteert sprongen (vrije val), draaien, stappen en houding.

**Simulatie.** Gesimuleerde lichamen hebben een hartslag die reageert op activiteit en ontspanning, en een adem. Daarmee is alles zonder hardware te testen.

## Stemmen en meditaties opnieuw maken

De stemmen worden vooraf gemaakt met ElevenLabs. Tijdens een sessie is er dus geen internet of API nodig. Zet `ELEVENLABS_API_KEY` in `.env` (zie `.env.example`). Je hebt ook `ffmpeg` nodig.

| Script | Wat | Uitvoer |
|---|---|---|
| `node scripts/meditaties/render.mjs [id]` | De drie vaste meditaties (tekst en lagen in `scripts.mjs`) | `public/meditaties/<id>.mp3` + `.json` |
| `node scripts/meditaties/fragmenten.mjs` | De zinnen voor de *Live*-meditatie | `public/meditaties/live/` |
| `node scripts/meditaties/gym.mjs` | Wachter en coach voor *Gym* | `public/gym/` |
| `node scripts/meditaties/probeer.mjs` | Korte stemproefjes, om stemmen goedkoop te vergelijken | `public/meditaties/proef/` |

Alles wordt gecachet in `scripts/meditaties/.cache/`. Alleen nieuwe of gewijzigde zinnen kosten credits. Stemmen:
- Meditaties: **Koraly** (eleven_v3, fluisterend).
- Gym: **Callum** (wachter) en **Charlie** (coach), standaardstemmen van ElevenLabs.

We gebruiken bewust geen gekloonde stemmen van echte, herkenbare mensen.

## Geheimen

- `.env` staat in `.gitignore`. Kopieer `.env.example` naar `.env`.
- De firmware haalt wifi uit `.env` via `firmware/load_env.py`. Het alternatief is `firmware/m5stick-zender/secrets.h`, die ook genegeerd wordt.

## Een werkvorm toevoegen

1. Maak een component in `src/speelkamer/`, met `hub: BodyHub` als prop.
2. Voeg een sleutel toe aan `NAV` in `Speelkamer.tsx`, met titel en ondertitel, en een thema in `THEMES` in `ui.tsx`.
3. Zet uitleg in `<Uitleg title="…">`. Die tekst verschijnt in het info-paneel onder de ⓘ, niet op het scherm zelf.
4. Gebruik `useFrame` voor animatie, en `hub.bodies` voor de data.
5. Schrijf er een pagina bij in `docs/werkvormen/`.

## Een subproject toevoegen

Een werkvorm die niet in de Speelkamer past, krijgt een eigen map, net als `dier-nadoen/`.

1. Maak een map met een eigen `index.html` en code.
2. Voeg die `index.html` toe aan `build.rollupOptions.input` in `vite.config.ts`, en de map aan `include` in `tsconfig.app.json`.
3. Zet een kaart op de landingspagina (`index.html` in de root).
4. Wil je de sensoren van de Speelkamer gebruiken? Abonneer je dan op hetzelfde MQTT-kanaal: `tuhtf/speelkamer/<kanaal>/lijf/+`. Een M5Stick stuurt daar `raw` (versnelling in mg) en `g` (gyro in °/s) op 50 Hz. Zie `dier-nadoen/main.ts`.

## Typecheck

```bash
npx tsc --noEmit -p tsconfig.app.json
```

`SwarmPerformance.tsx` geeft een paar oude typefouten. De build negeert die, en ze zitten niet in de Speelkamer.
