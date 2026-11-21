/*
 * Lummellab · M5StickC Plus2 als bewegingszender
 *
 * Leest de ingebouwde IMU (versnelling + gyro) op 50 Hz en stuurt elke 100 ms
 * een pakketje via wifi/MQTT naar het Lummellab-kanaal:
 *   topic  tuhtf/speelkamer/<KANAAL>/lijf/<id>
 *   json   {"name":"stick","raw":[x,y,z, ...],"g":[gx,gy,gz, ...],"t":ms,"seq":n,"hz":50,"gyro":12.3,"bat":87,"btn":0}
 * raw = versnelling in milli-g. Het Lummellab haalt daar pas, onrust, kanteling,
 * adem en schrik uit (zelfde analyse als voor de Polar H10 en telefoons).
 *
 * Knoppen:
 *   A (groot, voorkant)  korte druk = 'tik' naar het kanaal (btn telt op) · lang = naam wisselen
 *   B (zijkant)          scherm aan/uit (spaart batterij)
 *
 * Instellen: wifi en kanaal komen uit .env of secrets.h (zie instellingen hieronder). Kanaal = de code in het Lummellab
 * (veld naast 'open kanaal'), bijv. huiskamer-7ke8.
 */

#include <M5Unified.h>
#include <WiFi.h>
#include <PubSubClient.h>

// ------------------------------------------------------------------ instellingen
// Wifi en kanaal staan niet in de code. Ze komen (in deze volgorde) uit:
//   1. PlatformIO: ../.env (WIFI_SSID, WIFI_PASS, optioneel M5_KANAAL) via load_env.py
//   2. Arduino IDE: secrets.h naast dit bestand (kopieer secrets.h.example)
//   3. de standaardwaarden hieronder
#if __has_include("secrets.h")
#include "secrets.h"
#endif
#ifndef WIFI_SSID
#define WIFI_SSID "jouw-wifi"               // tip: telefoon-hotspot werkt overal (geen eduroam)
#endif
#ifndef WIFI_PASS
#define WIFI_PASS ""
#endif
#ifndef KANAAL
#define KANAAL "huiskamer-7ke8"             // zelfde code als in het Lummellab (⚙ → kanaal)
#endif
const char* NAMEN[]   = {"stick", "Anouk", "Bram", "Celine", "Daan", "Esra", "Floor", "Gijs", "Hanna"};
const char* BROKER    = "broker.hivemq.com"; // zelfde openbare broker als de webapp (die via wss:8884)
const int   PORT      = 1883;
// --------------------------------------------------------------------------------

const int HZ = 50;            // samples per seconde
const int PER_PACKET = 5;     // 5 samples = 100 ms per bericht

WiFiClient net;
PubSubClient mqtt(net);
String id, topic;
int nameIdx = 0;
int16_t buf[PER_PACKET * 3];
int16_t gbuf[PER_PACKET * 3];   // gyro in graden/s
uint32_t t0 = 0, seq = 0;        // tijd (ms) van het eerste sample in het pakket, volgnummer
int n = 0;
uint32_t nextSample = 0, lastDraw = 0, btnCount = 0;
float gyroEma = 0, actEma = 0;
bool screenOn = true;

void draw(const char* status) {
  if (!screenOn) return;
  auto& d = M5.Display;
  d.startWrite();
  d.fillScreen(0x5A1F);                       // HKU-paars
  d.setTextColor(WHITE, 0x5A1F);
  d.setTextDatum(top_left);
  d.setFont(&fonts::FreeSans12pt7b);
  d.drawString(NAMEN[nameIdx], 8, 6);
  d.setFont(&fonts::Font0);
  d.drawString(KANAAL, 8, 36);
  d.drawString(status, 8, 50);
  // beweging als balk, lime
  int w = (int)(min(1.0f, actEma) * (d.width() - 16));
  d.fillRect(8, 70, d.width() - 16, 10, 0x2945);
  d.fillRect(8, 70, w, 10, 0xDFED);
  char line[40];
  snprintf(line, sizeof line, "bat %d%%  tik %lu", M5.Power.getBatteryLevel(), (unsigned long)btnCount);
  d.drawString(line, 8, 88);
  d.endWrite();
}

void connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  draw("wifi verbinden...");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 15000) {
    delay(250);
    M5.update();
  }
}

void connectMqtt() {
  if (mqtt.connected() || WiFi.status() != WL_CONNECTED) return;
  draw("kanaal verbinden...");
  mqtt.connect(("m5-" + id).c_str());
}

void setup() {
  auto cfg = M5.config();
  M5.begin(cfg);
  M5.Display.setRotation(1);
  M5.Imu.begin();
  uint64_t mac = ESP.getEfuseMac();
  char hex[7];
  snprintf(hex, sizeof hex, "%06llx", (unsigned long long)(mac & 0xFFFFFF));
  id = String("m5") + hex;
  topic = String("tuhtf/speelkamer/") + KANAAL + "/lijf/" + id;
  mqtt.setServer(BROKER, PORT);
  mqtt.setBufferSize(1024);
  connectWifi();
  connectMqtt();
  nextSample = millis();
}

void publish() {
  String s = "{\"name\":\"";
  s += NAMEN[nameIdx];
  s += "\",\"src\":\"m5\",\"hz\":";
  s += HZ;
  s += ",\"raw\":[";
  for (int i = 0; i < PER_PACKET * 3; i++) {
    if (i) s += ',';
    s += buf[i];
  }
  s += "],\"g\":[";
  for (int i = 0; i < PER_PACKET * 3; i++) {
    if (i) s += ',';
    s += gbuf[i];
  }
  s += "],\"t\":";
  s += t0;
  s += ",\"seq\":";
  s += seq++;
  s += ",\"gyro\":";
  s += String(gyroEma, 1);
  s += ",\"bat\":";
  s += M5.Power.getBatteryLevel();
  s += ",\"btn\":";
  s += btnCount;
  s += "}";
  mqtt.publish(topic.c_str(), s.c_str());
}

void loop() {
  M5.update();
  if (M5.BtnA.wasClicked()) btnCount++;
  if (M5.BtnA.wasHold()) nameIdx = (nameIdx + 1) % (sizeof(NAMEN) / sizeof(NAMEN[0]));
  if (M5.BtnB.wasClicked()) {
    screenOn = !screenOn;
    M5.Display.setBrightness(screenOn ? 128 : 0);
    if (screenOn) lastDraw = 0;
  }

  if (WiFi.status() != WL_CONNECTED) connectWifi();
  if (!mqtt.connected()) connectMqtt();
  mqtt.loop();

  uint32_t now = millis();
  if ((int32_t)(now - nextSample) >= 0) {
    nextSample += 1000 / HZ;
    if ((int32_t)(now - nextSample) > 200) nextSample = now; // achterstand niet inhalen
    M5.Imu.update();
    auto d = M5.Imu.getImuData();
    // accel in g → milli-g; gyro in graden/s
    if (n == 0) t0 = now;
    gbuf[n * 3 + 0] = (int16_t)d.gyro.x;
    gbuf[n * 3 + 1] = (int16_t)d.gyro.y;
    gbuf[n * 3 + 2] = (int16_t)d.gyro.z;
    buf[n * 3 + 0] = (int16_t)(d.accel.x * 1000);
    buf[n * 3 + 1] = (int16_t)(d.accel.y * 1000);
    buf[n * 3 + 2] = (int16_t)(d.accel.z * 1000);
    float g = sqrtf(d.gyro.x * d.gyro.x + d.gyro.y * d.gyro.y + d.gyro.z * d.gyro.z);
    gyroEma += (g - gyroEma) * 0.1f;
    float mag = sqrtf(d.accel.x * d.accel.x + d.accel.y * d.accel.y + d.accel.z * d.accel.z);
    actEma += (min(1.0f, fabsf(mag - 1.0f) * 4) - actEma) * 0.05f;
    if (++n == PER_PACKET) {
      n = 0;
      if (mqtt.connected()) publish();
    }
  }

  if (now - lastDraw > 250) {
    lastDraw = now;
    draw(mqtt.connected() ? "verbonden" : WiFi.status() == WL_CONNECTED ? "geen kanaal" : "geen wifi");
  }
}
