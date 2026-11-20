# Dier nadoen

Beweeg als een kikker, vogel, slang of paard. Bouw samen een model dat raadt welk dier je bent, en probeer het daarna te foppen.

Een los subproject van TUHTF, buiten de Speelkamer. De volledige uitleg voor docenten en onderzoekers staat in [docs/werkvormen/09-dier-nadoen.md](../docs/werkvormen/09-dier-nadoen.md).

- `main.ts`: de interface met zes stappen (datamodel, verzamelen, labelen, ordenen, trainen, raden), de bronnen en de opslag. De bronnen zijn een M5Stick via het MQTT-kanaal van de Speelkamer, de bewegingssensor van de telefoon, of een simulatie. Opnames staan in localStorage (`dn-state`) en zijn te downloaden als JSON.
- `features.ts`: acht kenmerken per venster van 2 seconden.
- `model.ts`: k dichtstbijzijnde buren, en eerlijk toetsen (leave-one-person-out).
- `sim.ts`: gesimuleerde dieren, voor gebruik zonder hardware.

Lokaal: `npm run dev` in de root, open daarna http://localhost:5173/dier-nadoen/.
