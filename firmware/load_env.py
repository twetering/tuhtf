# PlatformIO pre-script: haalt wifi (en optioneel kanaal) uit ../.env en geeft ze als #define door.
# Zo staan wachtwoorden nooit in de broncode.  .env-sleutels: WIFI_SSID, WIFI_PASS, M5_KANAAL (optioneel)
Import("env")  # noqa: F821
import os

path = os.path.join(env["PROJECT_DIR"], "..", ".env")  # noqa: F821
vals = {}
if os.path.exists(path):
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        vals[k.strip()] = v.strip().strip('"').strip("'")

for key, macro in (("WIFI_SSID", "WIFI_SSID"), ("WIFI_PASS", "WIFI_PASS"), ("M5_KANAAL", "KANAAL")):
    if vals.get(key):
        env.Append(CPPDEFINES=[(macro, env.StringifyMacro(vals[key]))])  # noqa: F821
        print(f"  .env: {key} → {macro}")
