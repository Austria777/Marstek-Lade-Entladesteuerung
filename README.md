# Marstek Energy Studio v0.5.2 – Versionsanzeige im Dashboard

**Neu in v0.5.2:** Ein neuer Sensor `sensor.marstek_pv_manager_softwareversion` zeigt die **tatsächlich installierte Integration-Version** aus dem Home-Assistant-Integrationsmanifest. Im Kopfbereich von `dashboard.yaml` und `dashboard-view.yaml` erscheint ein kleiner Versions-Chip, z. B. „Version 0.5.2“. Der Sensor wird beim Laden der Integration gesetzt und nach dem nächsten HACS-Update/HA-Neustart automatisch aktualisiert. Die Regelung, Ladegrenzen und Nachtladung wurden nicht verändert.

**Installation:** Integration über HACS aktualisieren und Home Assistant neu starten. Die neue Dashboard-YAML aus dem Repository erneut übernehmen, damit der Chip angezeigt wird.

# Marstek Energy Studio v0.5.1 – optionale Hardware-Ladegrenze

**Integrierte Nachtladefunktion bislang nur in simulierten Tests geprüft; Notfall-Netzladung wurde bereits mit 300 W am Nutzergerät getestet.** Für diesen Modus greift die Integration auf die bestehenden Marstek-Venus-Modbus-Schreibentitäten zu. Zuerst separat und beaufsichtigt testen.



## Neu in v0.5.1 – Geräte-Ladegrenze (bewusst opt-in)

Bei einem realen Geräte-Ladelimit von 2000 W begrenzt der neue Regler die
**wirksame** PV-/Notfall-Ladegrenze ebenfalls auf 2000 W, auch wenn das Dashboard
2500 W anfordert. Das zeigt der Sensor `sensor.marstek_pv_manager_hardware_ladelimit`.

Neuer Schalter `switch.marstek_pv_manager_auto_ladelimit`
steht **standardmäßig AUS**. Erst nach Prüfung von Gerät, Zuleitung,
Steckverbindung, Schutzorgan und zulässiger Dauerlast darf die Synchronisierung
bewusst aktiviert werden. Bei aktiver Lade-/Notfallregelung passt sie dann die
Modbus-Entität `number.marstek_venus_modbus_maximale_ladeleistung` an den
jeweiligen Ladeleistungsregler an (innerhalb des am Gerät gemeldeten Bereichs).
Es erfolgt **keine Erhöhung beim Update oder ohne eingeschaltete Automatik**.
Die integrierte 400-W-Nachtladung bleibt davon unangetastet. Änderungen an der
Geräte-Ladegrenze werden vor Erhöhung des Sollwerts zurückgelesen; bei fehlender
Rückmeldung wird eine Leistungserhöhung aufgeschoben. Beim Ausschalten der
Synchronisierung bleibt die zuletzt gesetzte Geräte-Grenze bestehen; sie
wird nicht automatisch auf 2000 W zurückgesetzt.

Für ein erstes Upgrade Backup erstellen und ohne Synchronisierung prüfen;
bei vorhandener Modbus-Entität muss das Gerätelimit in den
Integrationsoptionen korrekt auf `number.marstek_venus_modbus_maximale_ladeleistung`
stehen. Die tatsächliche Ladeleistung hängt zusätzlich vom PV-Überschuss,
Batterie-SoC und physikalischen Voraussetzungen ab.

## Neu in v0.5.0 – Mindest-SoC-Nachtladung ohne separate YAML

Die ursprüngliche Nachtladeautomation ist in den Python-Controller integriert. Die **alte Nachtlade-YAML bleibt nach dem HACS-Update zunächst unverändert aktiv**, denn der neue Nachtlade-Schalter startet **standardmäßig AUS**. Der Schalter merkt sich die bewusste Aktivierung über HA-Neustarts.

- Neuer Schalter: `switch.marstek_pv_manager_mindest_soc_nachtladung`
- Neuer Statussensor: `sensor.marstek_pv_manager_nachtladung_status`
- Zwischen **00:00 und 06:00**: unter **10 % Marstek-SoC** beginnen, aus dem Netz mit **400 W** laden, bei **11 %** abschalten (Hysterese)
- Zwischen 10 und 11 % wird nur **weitergeladen, wenn eine Nachtladung bereits läuft**; sonst nicht neu gestartet
- Am Ende des Zeitfensters erst die Lade-/Entlade-Sollwerte auf **0 W** setzen und bestätigen, dann den Sperrhelfer freigeben
- Bei HA-Neustart übernimmt die Integration einen wiederhergestellten aktiven `input_boolean.marstek_10_soc_nachtladung` oder setzt eine kontrolliert unterbrochene Nachtladung bis 11 % fort (sofern bewusst aktiviert). Sie setzt den Ladesollwert beim Entladen der Integration zuvor auf 0 W
- Nachtladung funktioniert **unabhängig** vom Schalter `Regelung aktiv`; sie hat Vorrang vor PV-Automatik und Notfall-Netzladung
- Die PV-, Entlade- und Notfall-Sollwerte werden vom gemeinsamen Controller geschrieben und können bei intern aktiver Nachtladung nicht dazwischenfunken. Eine laufende Notfallladung wird dabei abgelöst und nicht automatisch fortgesetzt.
- Bei fehlenden Messwerten oder Kommunikationsfehlern werden die Sollwerte nach Möglichkeit auf 0 W gesetzt. Eine sichere Abschaltung kann bei ausgefallener Modbus-Verbindung nicht garantiert werden; den Gerätezustand vor Ort prüfen.

### Sichere Umstellung (wichtig)

1. Backup erstellen. HACS-Update installieren und Home Assistant neu starten. Die neue Nachtladefunktion ist zunächst **AUS**.
2. Unter *Einstellungen → Geräte & Dienste → Entitäten* kontrollieren, dass neuer Nachtlade-Schalter und Statussensor vorhanden sind.
3. **Alte Automation** `Marstek - Mindest SoC 10 Prozent Nachtladung` in *Einstellungen → Automatisierungen & Szenen* deaktivieren (nicht nur den Helfer ausschalten). Die alte PV-Gesamtregelung darf ohnehin nicht parallel zum neuen Controller laufen.
4. Prüfen, dass `input_boolean.marstek_10_soc_nachtladung` auf **AUS** steht und keine externe Automatisierung diesen Helfer mehr schaltet. Falls noch AN, erst bei 0 W Ladung die alte Automation stilllegen und anschließend den Helfer kontrolliert auf AUS setzen.
5. Nun den neuen Schalter **Mindest-SoC-Nachtladung** einschalten. Er startet bei SoC unter 10 % nur zwischen 00:00 und 06:00 Uhr; außerhalb des Zeitfensters bleibt die Funktion wartend.
6. Umstellung beaufsichtigt überprüfen: SoC-Grenzen 10/11 %, 400 W, um 06:00 Ende; nach Software-/Hardwarefehlern zusätzlich Modbus-Sollwerte kontrollieren. Die 400 W sind fest eingestellt und keine allgemeine Notfall-Netzladeleistung.

**Achtung:** Werden die alte Nachtlade-YAML und die neue Nachtladefunktion gleichzeitig aktiviert, können konkurrierende Schreibbefehle entstehen. Die Abschaltlogik ist ein Prototyp und muss am Gerät getestet werden. Die Software kann einen Netz- oder Modbus-Ausfall nicht physikalisch sicher abfangen.

## PV-Sensor in v0.4.1 geändert

Der PV-Wert in der **Regelung**, dem animierten **Energiefluss** und dem **Leistungsverlauf** kommt aus **`sensor.pv_leistung_gesamt`** (erwartete Einheit: Watt). Die früher einzeln summierten Sensoren SolaX/Wintergarten/Büro werden **nicht mehr addiert**, um Doppelzählung zu vermeiden.

**Einschränkung:** Laut vorhandener Konfiguration enthält `sensor.pv_leistung_gesamt` die drei neuen Balkonkraftwerke noch nicht. Die angezeigte Erzeugung und die PV-Obergrenze in der Regelung sind deshalb bis zur Erweiterung des Sensors unvollständig. `sensor.solax_m_measured_power` bleibt für Netzbezug/Einspeisung maßgeblich. Falls die neuen BKW hinter demselben Netzanschlusspunkt einspeisen, beeinflussen sie trotzdem den realen Netzfluss. Vor dem Aktivieren sicherstellen, dass der Gesamtsensor nur PV-Erzeugung in W enthält (keine Speicherentladung) und die ursprüngliche 7-Sekunden-YAML deaktiviert ist.

Beim Update von v0.4.x die Integration über HACS aktualisieren, Home Assistant neu starten und den neuen Dashboard-Code importieren. Die Energiefluss-JavaScript-Datei ist unverändert; sie muss nicht neu kopiert werden. Die JavaScript-Ressource im Dashboard auf `/local/marstek-energy-flow-card.js?v=041` umstellen, damit der Browser den neuen PV-Sensor verwendet. Unter **Geräte & Dienste → Marstek PV Manager → Konfigurieren → Quellen und Verbraucher** muss **PV Gesamtleistung (W)** auf `sensor.pv_leistung_gesamt` stehen. Bei vorhandenen Installationen werden die alten Felder `pv_1`, `pv_2`, `pv_3` nicht mehr benutzt.

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
3. Home Assistant neu starten. Die bisherige Nachtlade-YAML vor dem Einschalten des **neuen Nachtlade-Schalters** deaktivieren; die ursprüngliche Gesamtregelung vor dem Einschalten der PV-Automatik deaktivieren.
4. `dashboard.yaml` in neues Dashboard importieren (oder `dashboard-view.yaml` für nur eine Ansicht).
5. Den Marstek-SoC prüfen: `sensor.marstek_venus_modbus_soc_batterie`. Einstellungen/Entity-IDs und die neue Notfall-Numerik prüfen.
6. **Zuerst bei 100–500 W testen**: Automatik EIN → Nachtladung AUS → Ziel-SoC > Ist-SoC → Notfall-Netzladung EIN. Netzbezugsleistung und tatsächliche Marstek-Ladeleistung beobachten. Danach auf AUS und prüfen, dass Sollwert zurückgeht.

## Verifikation

```bash
python -m unittest discover -s tests -v
python -m compileall -q custom_components
node --check www/marstek-energy-flow-card.js
```

Berechnungs- und simulierte Controller-Tests; neue Nachtladung bislang ohne Live-Gerätetest.

## HACS/Mushroom

Mushroom aus HACS installieren; die animierte Karte bleibt als separate Datei im `/config/www/`-Verzeichnis.

## GitHub repository

Instructions for hosting this project on GitHub: [GITHUB_SETUP.md](GITHUB_SETUP.md).

