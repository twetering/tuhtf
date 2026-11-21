# B.I. lab · Body Intelligence

*Als er A.I. is, waarom dan geen B.I.?* Een lab dat volgt hoe A.I. getraind wordt, met lichamen in plaats van tekst. Het doel is niet om een machine te leren voelen, maar om te zien wat er onderweg verloren gaat.

Een los subproject van TUHTF, buiten het Lummellab. De uitleg staat in [docs/body-intelligence/](../docs/body-intelligence/):
- [het denkstuk](../docs/body-intelligence/bi-ontwikkelen.md)
- [de ingangen](../docs/body-intelligence/ingangen.md)
- [de werkvorm Andere lichamen](../docs/body-intelligence/andere-lichamen.md)

**Sets:** dieren, machines, een klap, en een eigen set. Elke set doorloopt dezelfde zes stappen: datamodel, verzamelen, labelen, ordenen, trainen en raden.

- `main.ts`: de startpagina van het lab, de sets, de zes stappen, de bronnen en de opslag. De bronnen zijn een M5Stick via het MQTT-kanaal van het Lummellab, de bewegingssensor van een telefoon, of een simulatie. Opnames staan per set in localStorage (`bi-<set>`), met per opname ook een woord en gespeeld ↔ echt. Je kunt ze downloaden als JSON.
- `features.ts`: acht kenmerken per venster van 2 seconden.
- `model.ts`: k dichtstbijzijnde buren, en eerlijk toetsen (leave-one-person-out).
- `sim.ts`: gesimuleerde dieren, machines en klappen, voor gebruik zonder hardware.

Lokaal: `npm run dev` in de root, open daarna http://localhost:5173/body-intelligence/.
