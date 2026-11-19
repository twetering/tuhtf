# Hardware

Welke sensoren werken, hoe je ze koppelt en waar je ze draagt.

## Overzicht

| Apparaat | Wat het geeft | Hoe het verbindt | Prijs (ca.) |
|---|---|---|---|
| **Hartslagband** (Polar H10, Garmin HRM-Pro Plus, en de meeste andere borstbanden) | hartslag, RR-intervallen (tijd tussen slagen) | Bluetooth, direct aan de laptop | €40 tot €130 |
| **Polar H10**, extra | ook versnelling (beweging, adem) | Bluetooth | ca. €90 |
| **Garmin HRM-Pro Plus**, extra | ook loopsnelheid, cadans en paslengte (geen ruwe beweging) | Bluetooth | ca. €130 |
| **M5StickC Plus2** met onze firmware | versnelling en draaisnelheid, 50 keer per seconde; daaruit pas, houding, adem, sprongen, draaien, onrust | wifi → kanaal | ca. €25 |
| **Telefoon** als zender | eigen bewegingssensor; kan ook een band uitlezen en doorsturen | wifi of 4G → kanaal | — |

In de bovenbalk van de Speelkamer zie je per lichaam waar de data vandaan komt: ▣ voor een M5Stick, ♥↯ voor een band met loopdata.

## Hartslagbanden

**Koppelen.** In de Speelkamer: ⚙ → "＋ hartslagband verbinden". Kies de band in het venster van de browser. Dat werkt alleen in **Chrome of Edge** op een laptop (Mac, Windows, Linux) of Android. Safari en Firefox ondersteunen geen Web Bluetooth.

**Aantallen.** Eén laptop kan in de praktijk vijf tot zeven banden tegelijk aan. Wil je er meer, zet dan telefoons in als zender (elke telefoon leest één band uit en stuurt hem via het kanaal door) of gebruik een tweede laptop op hetzelfde kanaal.

**Tips**
- Maak de elektroden nat. Veel banden zenden pas met huidcontact.
- Een band kan maar met één apparaat tegelijk verbonden zijn. Sluit sportapps.
- Banden geven hartslag ongeveer elke seconde door, met wat vertraging. Voor spel en meditatie is dat ruim genoeg. Voor precieze timing per slag niet.

## M5StickC Plus2

Een klein apparaatje met scherm, batterij, wifi en een bewegingssensor. Met onze firmware stuurt het zijn bewegingsdata naar het Speelkamer-kanaal.

**Instellen en flashen:** zie [`firmware/README.md`](../firmware/README.md). Kort:
1. Zet in `.env` in de hoofdmap: `WIFI_SSID`, `WIFI_PASS` en eventueel `M5_KANAAL`.
2. Installeer PlatformIO (`uv tool install platformio`, of via pip).
3. `cd firmware && pio run -t upload` met de stick via USB-C aangesloten.

Wil je het kanaal per sessie wisselen zonder opnieuw te flashen? Kies dan in de Speelkamer het kanaal dat in de stick staat.

**Bediening**
- Knop A (voorkant): kort indrukken is een tik, lang indrukken wisselt de naam.
- Knop B (zijkant): scherm aan of uit. Uit spaart batterij.

**Wifi.** Een telefoon-hotspot werkt overal. Eduroam en andere netwerken met een inlogpagina werken niet.

## Telefoon als zender

Open op de telefoon de link die in ⚙ onder het kanaal staat: `…#speelkamer/zender?kanaal=<code>`. De telefoon kan:
- zijn eigen bewegingssensor doorsturen (in de broekzak, in de hand, of met een armband op de borst);
- een hartslagband uitlezen en doorsturen (alleen Android met Chrome).

De pagina moet via **https** openen; anders geven telefoons geen toegang tot beweging of Bluetooth. Gebruik dus de gedeployde versie, niet een lokaal adres als `http://192.168…`. Op een iPhone vraagt de pagina om toestemming voor beweging.

## Draagplekken

| Plek | Goed voor | Minder goed voor |
|---|---|---|
| **Borst** (elastiek, borstzakje) | adem, houding, onrust, hartslag-tikje | pas |
| **Buik** | adem (vaak het duidelijkst) | houding |
| **Onderrug** | houding, draaien, dans, hoofdstand, acrobatiek | adem |
| **Pols** | gebaren, activiteit | adem, houding |
| **Enkel / bovenbeen** | pas, cadans, sprongen | adem |
| **Hoofd** | knikken, kijkrichting, balans | adem |
| **In de hand** | spel (Koekoek), gebaren | bijna al het andere |

De Speelkamer laat per draagplek zien wat je er redelijkerwijs kunt meten (*Beweging → sensor & kalibratie*). Kalibreer na het bevestigen altijd even: drie seconden stilleggen, één keer rechtop staan.

## Het kanaal

Telefoons en sticks sturen hun data via MQTT naar een openbare server (HiveMQ). De Speelkamer op de laptop luistert op hetzelfde kanaal. Het kanaal is gewoon een code, zoals `huiskamer-hku1`. Iedereen met die code kan meelezen, dus kies een code die niet te raden is. Er gaan geen namen mee, alleen de naam die je zelf aan een stick of telefoon geeft.

Wil je de data niet over internet sturen, gebruik dan alleen banden die direct via Bluetooth aan de laptop hangen.
