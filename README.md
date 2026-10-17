# Marstek Energy Studio v0.4.1 – PV-Gesamtsensor

**Prototyp, nicht am Marstek-Gerät getestet!** Für diesen Modus greift die Integration auf die bestehenden Marstek-Venus-Modbus-Schreibentitäten zu. Zuerst separat und beaufsichtigt testen.


## PV-Sensor in v0.4.1 geändert

Der PV-Wert in der **Regelung**, dem animierten **Energiefluss** und dem **Leistungsverlauf** kommt aus **`sensor.pv_leistung_gesamt`** (erwartete Einheit: Watt). Die früher einzeln summierten Sensoren SolaX/Wintergarten/Büro werden **nicht mehr addiert**, um Doppelzählung zu vermeiden.

**Einschränkung:** Laut vorhandener Konfiguration enthält `sensor.pv_leistung_gesamt` die drei neuen Balkonkraftwerke noch nicht. Die angezeigte Erzeugung und die PV-Obergrenze in der Regelung sind deshalb bis zur Erweiterung des Sensors unvollständig. `sensor.solax_m_measured_power` bleibt für Netzbezug/Einspeisung maßgeblich. Falls die neuen BKW hinter demselben Netzanschlusspunkt einspeisen, beeinflussen sie trotzdem den realen Netzfluss. Vor dem Aktivieren sicherstellen, dass der Gesamtsensor nur PV-Erzeugung in W enthält (keine Speicherentladung) und die ursprüngliche 7-Sekunden-YAML deaktiviert ist.

Beim Update von v0.4.0 `custom_components/` und `www/` ersetzen, danach HA neu starten und den neuen Dashboard-Code importieren. Die JavaScript-Ressource im Dashboard auf `/local/marstek-energy-flow-card.js?v=041` umstellen, damit der Browser den neuen PV-Sensor verwendet. Unter **Geräte & Dienste → Marstek PV Manager → Konfigurieren → Quellen und Verbraucher** muss **PV Gesamtleistung (W)** auf `sensor.pv_leistung_gesamt` stehen. Bei vorhandenen Installationen werden die alten Felder `pv_1`, `pv_2`, `pv_3` nicht mehr benutzt.

## Neu in v0.4.0

- Ein/Aus: `switch.marstek_pv_manager_notfall_netzladung` (nur aktivierbar, wenn `switch.marstek_pv_manager_regelung_aktiv` eingeschaltet ist und die 10%-Nachtladung nicht die Kontrolle hat).
- Leistung: `number.marstek_pv_manager_notfall_ladeleistung`, 0–2500 W in 100-W-Schritten, Standard **500 W**; echte Gerätegrenze über Modbus-Number-Attribute berücksichtigt.
- Ladeziel: `number.marstek_pv_manager_notfall_ziel_soc`, **50–100 %**, Standard **90 %**.
- Diagnose: `sensor.marstek_pv_manager_notfall_status`, `sensor.marstek_pv_manager_wirksame_notfall_ladeleistung`.
- Notfallladung ignoriert absichtlich die normalen PV-Überschuss-, SolaX-SoC- und Tageszeitbedingungen. Entladung ist vollständig unterbunden, während Notfall-Netzladung aktiv ist.
- Steigert den Lade-Sollwert in 100-W-Schritten je 7-Sekunden-Zyklus; eine Verringerung des Schiebereglers gilt sofort im nächsten Durchlauf.
- Bei Erreichen des Ziel-SoC setzt sie Ladung/Entladung auf **0 W**, der Notfall-Schalter bleibt **AN** und hält die Reserve, statt sofort die normale Entladung wieder zuzulassen.
- Wenn Nachtladungs-Helper `input_boolean.marstek_10_soc_nachtladung` **AN** ist, macht die Integration keinerlei Modbus-Schreibzugriff (Nachtladung hat weiter Vorrang). Nachtladung bei Übergang in Notfallmodus **AUS** halten.
- Bei fehlendem Marstek-SoC wird keine Netzladung gestartet; beim Ausfall relevanter Sollwert-/Modusdaten stoppt die Integration die Sollwerte, soweit ansprechbar.
- **Beim Home-Assistant-Neustart ist der Notfall-Schalter bewusst AUS.** Während der Abschaltung bei aktiver Netzladung versucht die Integration, den Lade-Sollwert auf 0 W zu setzen; bei Kommunikationsausfall kann der Gerätezustand nicht garantiert werden.

## Grenzen der Funktion

1. **Netzladen muss vor einem Stromausfall stattfinden.** Ohne Netzspannung kann ein AC-gekoppelter Marstek nicht über seinen Netzanschluss geladen werden. Das Laden ersetzt keine USV, keine automatische Umschaltung und keinen separaten Backup-/EPS-Ausgang. Für Verbraucher im Hausnetz sind passende, fachgerecht ausgeführte Netztrennung und Einspeisung nötig. Keine improvisierte Rückspeisung über eine Steckdose.
2. Die Live-Netzmessung mit Vorzeichen (+ Einspeisung/- Bezug) beweist **nicht**, ob Netzspannung am Marstek tatsächlich vorhanden ist. Diese Version erkennt keine sichere Netzwiederkehr/Netzstörung und kann daher nicht allein auf einen Netzausfall reagieren.
3. Manuelle Netzladung setzt eine reale Netzbezugsleistung voraus und verursacht gegebenenfalls Stromkosten.
4. **Alte YAML-Gesamtregelung deaktivieren**, bevor die Integration aktiviert wird. Eine gleichzeitig aktive separate Nachtladungsautomatik darf keinen konkurrierenden Befehl schreiben; der bekannte 10%-Helper sperrt den Manager.
5. Nur physikalisch und elektrisch zulässige Leistung einstellen: 2500 W gelten nicht für jedes Modell, Firmware, Kabel oder die Installation. Die Integration begrenzt auf gemeldete Number-Obergrenzen, kann Installationsgrenzen aber nicht beurteilen.
6. Bei **Automatik AUS** oder Integrationsentladung versucht die Integration bei aktivem Notfallmodus, beide Leistungssollwerte auf **0 W** zu setzen. Das ist bei Kommunikationsstörung **kein garantierter Hardware-Not-Stopp**: am Gerät kontrollieren.

## Installation und Update

1. HA-Backup machen. ZIP entpacken und `custom_components/marstek_pv_manager/` nach `/config/custom_components/marstek_pv_manager/` kopieren.
2. `www/marstek-energy-flow-card.js` nach `/config/www/` kopieren. Die Ressource als JavaScript-Modul `/local/marstek-energy-flow-card.js?v=041` eintragen bzw. aktualisieren.
3. Home Assistant neu starten. Die 10%-Nachtladung und ursprüngliche Gesamtregelung nicht parallel mit dem neuen Manager aktivieren.
4. `dashboard.yaml` in neues Dashboard importieren (oder `dashboard-view.yaml` für nur eine Ansicht).
5. Den Marstek-SoC prüfen: `sensor.marstek_venus_modbus_soc_batterie`. Einstellungen/Entity-IDs und die neue Notfall-Numerik prüfen.
6. **Zuerst bei 100–500 W testen**: Automatik EIN → Nachtladung AUS → Ziel-SoC > Ist-SoC → Notfall-Netzladung EIN. Netzbezugsleistung und tatsächliche Marstek-Ladeleistung beobachten. Danach auf AUS und prüfen, dass Sollwert zurückgeht.

## Verifikation

```bash
python -m unittest discover -s tests -v
python -m compileall -q custom_components
node --check www/marstek-energy-flow-card.js
```

Nur statische Prüfung und Unit-Tests; kein Live-Systemtest.

## HACS/Mushroom

Mushroom aus HACS installieren; die animierte Karte bleibt als separate Datei im `/config/www/`-Verzeichnis.

## GitHub repository

Instructions for hosting this project on GitHub: [GITHUB_SETUP.md](GITHUB_SETUP.md).

