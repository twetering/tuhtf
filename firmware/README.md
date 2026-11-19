# M5StickC Plus2 als bewegingszender

De stick stuurt zijn bewegingssensor (versnelling en gyro, 50 Hz) via wifi naar het Speelkamer-kanaal. Hij verschijnt dan als lichaam met ▣. De Speelkamer haalt er pas, onrust, kanteling, adem en schrik uit, net als bij een Polar H10 of een telefoon.

## Instellen

Wifi en kanaal staan niet in de code:

- **PlatformIO:** leest `WIFI_SSID` en `WIFI_PASS` uit `.env` in de tuhtf-map, via `load_env.py`. Zet er eventueel `M5_KANAAL=huiskamer-xxxx` bij voor het kanaal; anders geldt de standaard in het `.ino`-bestand.
- **Arduino IDE:** kopieer `m5stick-zender/secrets.h.example` naar `secrets.h` en vul die in. Ook dat bestand staat in `.gitignore`.

Tip: een telefoon-hotspot werkt overal. Eduroam werkt niet.

## Flashen

Met PlatformIO:

```bash
cd firmware && pio run -t upload
```

Of met de Arduino IDE:

1. Kies board "M5StickCPlus2".
2. Installeer de bibliotheken **M5Unified** en **PubSubClient**.
3. Open `m5stick-zender/m5stick-zender.ino` en upload.

## Bediening

- **Knop A** (voorkant): kort indrukken telt een tik, lang indrukken wisselt de naam.
- **Knop B** (zijkant): zet het scherm aan of uit. Uit spaart batterij.

## Draagplek

- Pols of enkel: voor pas en beweging.
- Borst, met een elastiek of in het borstzakje: hier zie je ook de adem.
- Rug of heup: voor houding en stilstaan.
