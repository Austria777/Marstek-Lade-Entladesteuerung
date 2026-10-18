# Marstek Energy Studio v0.5.8 – Variante B: realistisches Haus mit mittlerer Unschärfe

Diese Version korrigiert **ausschließlich den Hintergrund** des Energieflusses:
Die Comic-/SVG-Hausillustration aus v0.5.7 entfällt; an ihrer Stelle wird
ein echtes Foto eines modern verglasten Hauses bei Dämmerung verwendet.
Das Foto ist **im Stil** der ursprünglichen Premium-Hausvorlage, enthält
aber keine fest eingebauten Interface-Elemente, Stromwerte oder Autos.

- **PC / Tablet:** Hintergrund mit `filter:blur(7px)`
- **Smartphone (bis 620px):** Hintergrund mit `filter:blur(12px)`
- Nur der Hintergrund wird unscharf gezeichnet. Batterie-, Tesla- und
  Energiekarten sowie die animierten Leitungen bleiben scharf und live.
- Die **Marstek- und SolaX-Karten aus v0.5.7**, inklusive der Geräteabbildungen
  links, Watt/Status rechts und SoC-Balken unten, bleiben unverändert.
- Alle Lade- und Entladeregelungen, Messsensoren und Leistungsbilanzen
  bleiben unverändert.

**Herkunft des Fotos:** Michael Brown (@vettexan),
[Modern luxury home with swimming pools at dusk](https://unsplash.com/photos/modern-luxury-home-with-swimming-pools-at-dusk-q6eSeT3euLU),
verwendet unter der [Unsplash-Lizenz](https://unsplash.com/license).
Die Custom-Karte lädt das Bild direkt von `images.unsplash.com`, damit
**kein zusätzlicher Bild-Upload in den Home-Assistant-Ordner notwendig** ist.
Dies erfordert beim Anzeigen der Karte Internetzugang im Browser. Falls die
Bildquelle nicht erreichbar ist, bleibt der blaue Hintergrundverlauf sichtbar.

**Aktualisierung:**

1. In HACS v0.5.8 installieren, Home Assistant neu starten.
2. GitHub-Datei `www/marstek-energy-flow-card.js` nach `/config/www/`
   kopieren und die vorhandene JavaScript-Datei ersetzen.
3. Unter **Einstellungen → Dashboards → Ressourcen** auf
   `/local/marstek-energy-flow-card.js?v=058` umstellen (JavaScript-Modul).
4. Den Browser mit **Strg+F5** vollständig neu laden bzw. HA-Tabs
   schließen. Die vorhandenen Dashboard-YAML-Dateien und Tesla-Bilder
   können unverändert bleiben. Das alte Premium-Hintergrundbild wird
   nicht mehr benötigt.

Wenn die Bildschärfe auf dem jeweiligen Gerät noch nicht passt,
sind nur die Werte `blur(7px)` und `blur(12px)` in der JS-Datei
anzupassen.

# Marstek Energy Studio v0.5.7 – Batteriekarten nach Muster + scharfes Haus

**Neu:** Die beiden Batteriekarten sind im Stil des bereitgestellten
Musterbilds aufgebaut. Links steht eine klar gezeichnete Geräteabbildung
(Marstek dunkelblau bzw. SolaX weiß), rechts Name, aktuelle Leistung
und Lade-/Entladestatus. **Unten** stehen ein farbiger SoC-Balken und
der aktuelle Prozentwert. Dies gilt für Desktop und Smartphone.
Alle Werte stammen aus den bisherigen Home-Assistant-Sensoren;
der SoC wird nicht doppelt am Kartenrand angezeigt.

**Scharfer Hintergrund:** Die Live-Flow-Karte zeichnet eine skalierbare
Haus-Szene mit PV-Dach und beleuchteten Fensterfronten als **inline SVG**.
Keine Autos, Wattzahlen, Batteriekarten oder andere Dashboard-Elemente
sind im Hintergrund eingebrannt. Damit wird der bisher stark verschwommene
Hintergrund ersetzt. Das neue Motiv ist eine *klare stilisierte Illustration*,
keine Fotografie. Die einzelnen Echtzeit-Karten und Energiepfade werden
darüber gerendert, wie bisher. Bei Bedarf kann später die Deckkraft oder
Weichzeichnung fein eingestellt werden.

Auch die Tesla-Knoten sind verbessert: Autos links, Leistung und Status
rechts, sodass es keine Überlagerung von Messwerten mehr gibt. Es werden
weiterhin die vorhandenen Model-3-Highland- und Model-Y-Juniper-Bilder
aus `/config/www/` verwendet.

**Unverändert:** Sämtliche Marstek-Lade- und Entladeautomationen,
Nachtladungslogik, Notfall-Netzladung, Messsensoren und Hausbilanz.

**Update:**

1. HACS: auf **v0.5.7** aktualisieren und Home Assistant neu starten.
2. Die Datei `www/marstek-energy-flow-card.js` aus diesem Repository in
   Home Assistants Ordner `/config/www/` kopieren (bisherige Datei ersetzen).
3. Unter *Einstellungen → Dashboards → Ressourcen* die vorhandene URL auf
   `/local/marstek-energy-flow-card.js?v=057` ändern (JavaScript-Modul).
4. Home Assistant im Browser mit **Strg+F5** hart neu laden bzw.
   ältere HA-Tabs schließen. Die bisherige Dashboard-YAML bleibt gültig.
5. Die vorhandenen zwei Tesla-WebP-Dateien im `www`-Ordner belassen.
   **Das alte unscharfe Premium-Hintergrundbild wird nicht mehr benötigt**;
   die Hausillustration ist vollständig in der JS-Datei enthalten.

**Hinweis:** Zur optischen Beurteilung bitte nach dem Update einen Screenshot
auf PC und Smartphone anfertigen. Die SVG-Szene ist absichtlich scharf;
bei Bedarf kann ein moderater Blur später ergänzt werden.

# Marstek Energy Studio v0.5.6 – Premium Smart Energy (Glass-Design)

**Neue Darstellung der vorhandenen Custom-Card**, basierend auf der gemeinsam
ausgewählten Hausgrafik. Der Hintergrund ist eine **weichgezeichnete Version
der freigegebenen Illustration**, damit eingebrannte Beispielwerte im Bild
nicht mit den **echten Home-Assistant-Livewerten** verwechselt werden.
Die Energiepfade und Karten mit PV/Netz/Haus/Marstek/SolaX/NeCharge/Delta
werden von JavaScript darüber **dynamisch** gerendert. Bei fehlender
Bilddatei erscheint ein dezenter blauer Verlaufs-Hintergrund als Fallback.

- Glassmorphism-Karten mit heller Blau-Palette, Neon-Leitungen und animierten
  Impulsen abhängig von den **wirklichen** Messwerten.
- **Marstek Battery / SolaX Battery**: SoC als **Prozentwert plus Balken
  direkt innerhalb der jeweiligen Batteriekarte** (Desktop und Mobile).
  Die doppelte SoC-Anzeige links unten in der Flow-Karte entfällt.
- **NeCharge / Delta**: bestehende Model-3-Highland-/Model-Y-Juniper-Bilder
  bleiben. Bei **0 W** nun zu ca. **69 %** sichtbar, bei aktivem Laden
  hell und mit Glow; fehlende Messung klar als unbekannt gekennzeichnet.
- Keine Änderungen am Hausleistungsmodell, an den Entitätszuordnungen oder
  an der Marstek-Lade- und Entladesteuerung.
- Keine neuen Dummy-Messwerte, fiktiven Autarkie-/CO₂-Daten oder
  statischen Werte aus dem Layoutbild werden als Live-Daten ausgegeben.

**Installation:**

1. In **HACS** auf v0.5.6 aktualisieren, HA neu starten.
2. **Custom-Frontend-Datei separat aktualisieren**: GitHub-Datei
   `www/marstek-energy-flow-card.js` nach `/config/www/` kopieren,
   ersetzt die vorherige JS-Datei (HACS kopiert diese separat gespeicherte
   Custom-Card nicht automatisch).
3. Die bereitgestellte **marstek-energy-premium-background.webp** (weiche,
   für die Livekarte vorbereitete Variante der freigegebenen Hausgrafik)
   ebenfalls in den HA-Ordner `/config/www/` kopieren.
   **Hinweis:** Das Bild ist als begleitender Download im Chat verfügbar und
   nicht automatisch Bestandteil der GitHub-Integration.
4. Unter *Einstellungen → Dashboards → Ressourcen* die bisherige
   Modul-Ressource auf
   `/local/marstek-energy-flow-card.js?v=056` ändern; den Browser-Cache
   (ggf. Strg+F5 / Chrome Inkognito) neu laden.
5. Die bisherigen Tesla-WebP-Dateien müssen im selben Ordner
   `/config/www/` bleiben. Bestehende Dashboard-YAML v0.5.5 mit
   den zwei Ladepunkt-Entitäten funktioniert unverändert.

**Prüfung:** Neuer Hintergrund über
`/local/marstek-energy-premium-background.webp` erreichbar;
neue JS-Datei beginnt mit `Marstek Energy Flow Card 0.5.6`.
Der Hintergrund ist dekorativ und keine Quelle für Echtzeitwerte.

# Marstek Energy Studio v0.5.5 – Energiefluss mit zwei Tesla-Ladepunkten

**Neu:** Der Energiefluss zeigt NeCharge und Delta Wallbox als zwei immer
sichtbare Verbraucher mit animierter Verbindung zum Haus. Bei 0 W sind
beide Fahrzeug-Knoten deutlich gedimmt; ab einer aktiven Ladeleistung
werden sie wieder hervorgehoben. Für die Bilder wurden die bestätigten
Tesla-Darstellungen verwendet: **NeCharge = Model 3 Highland, Stealth Grey**;
**Delta = Model Y Juniper, Stealth Grey**.

- NeCharge: `sensor.necharge_ladeleistung` (**W**)
- Delta: `sensor.evcc_delta_ac_smart_wallbox_charge_power` (**kW** wird in W umgerechnet; vorhandenes Einheit-Attribut wird berücksichtigt)
- Wenn ein Sensor nicht verfügbar ist, bleibt sein Knoten sichtbar, aber gedimmt und zeigt **– W / Nicht verfügbar**.
- Die Speicherknoten heißen nun **Marstek Battery** und **SolaX Battery**.
- Die Hausbilanz bleibt **unverändert**: Ladeleistungen der Fahrzeuge sind bereits Teil des gesamten Hausverbrauchs und werden **nicht doppelt abgezogen**.
- Die Desktop- und Smartphone-Layouts wurden beide angepasst; nur die Darstellung ändert sich, **keine Lade-/Entladesteuerung**.

**Installation (erforderlich):** HACS auf v0.5.5 aktualisieren und Home Assistant
neu starten. Aus dem Repository die drei Dateien `www/marstek-energy-flow-card.js`,
`www/tesla-model3-highland-stealth-grey.webp` und
`www/tesla-modely-juniper-stealth-grey.webp` nach `/config/www/` kopieren.
Danach in Home Assistant die Lovelace-JavaScript-Ressource von z. B.
`/local/marstek-energy-flow-card.js?v=042` auf
`/local/marstek-energy-flow-card.js?v=055` ändern oder den Browser-Cache
vollständig aktualisieren. Außerdem `dashboard.yaml` oder
`dashboard-view.yaml` aus dem GitHub-Repository neu übernehmen.
Die beiden Bilddateien müssen über `/local/` erreichbar sein.

# Marstek Energy Studio v0.5.4 – Nachtlade-Grenzwerte korrigiert

**Neu in v0.5.4:** Einstellbare **Startgrenze 9–50 %** und **Zielgrenze
10–100 %**. Der Zielwert muss mindestens 1 Prozentpunkt höher als der
Startwert liegen. Beispiel: Start 20 %, Ziel 80 %; Ladung weiterhin 400 W,
ausschließlich zwischen 00:00 und 06:00 Uhr. Um 06:00 Uhr wird sie
gestoppt, auch wenn das Ziel noch nicht erreicht ist.

Die Standardeinstellungen **9 % Start (9,x %-Bereich) und 11 % Ziel**
entsprechen dem bisherigen Verhalten. Beide Werte sind im Dashboard
änderbar und bleiben nach Home-Assistant-Neustarts gespeichert.
Für höhere Startwerte zuerst den Zielwert erhöhen.

**Update:** In HACS v0.5.4 installieren, HA neu starten, bei Bedarf
die aktuelle Dashboard-YAML erneut übernehmen. Die zwei Slider wurden
bereits in v0.5.3 hinzugefügt; diese Version korrigiert ihre Grenzen,
die Plausibilitätsprüfung und die Tests.

# Marstek Energy Studio v0.5.3 – ursprüngliche Einführung der Nachtlade-Regler

**Neu in v0.5.3:** Zwei unabhängige Dashboard-Regler für die integrierte
Mindest-SoC-Nachtladung:

- `number.marstek_pv_manager_nachtladung_start_soc`: **Start-SoC ursprünglich 9–100 %, ab v0.5.4 auf 9–50 % korrigiert**, Standard **9 %**.
  Der Marstek beginnt, sobald er in den eingestellten angezeigten Prozentbereich
  fällt (z. B. 9,x % bei Einstellung 9). Dies entspricht dem bisherigen Start
  bei unter 10 %.
- `number.marstek_pv_manager_nachtladung_ziel_soc`: **Ziel-SoC 10–100 %**, Standard **11 %**.
  Eine laufende Nachtladung endet bei Erreichen des Ziel-SoC.

Ab v0.5.4 gilt bei der Eingabe: **Ziel-SoC muss höher als Start-SoC sein**.
Damit bleibt mindestens 1 Prozentpunkt Hysterese erhalten. Zuerst ggf. den Zielwert erhöhen,
dann den Startwert. Die Zahlen werden in den Integrationsoptionen gespeichert
und bleiben über Home-Assistant-Neustarts erhalten.

Die **Ladeleistung bleibt fest auf 400 W** und das Nachtfenster auf **00:00–06:00 Uhr**.
Der Nachtlade-Schalter funktioniert weiterhin unabhängig von der normalen
PV-Automatik. Während einer aktiven Ladung führt ein abgesenktes Ziel, das
bereits erreicht ist, zum kontrollierten Stopp (beide Sollwerte 0 vor Freigabe
des Sperrhelfers). Bei Neustart wird eine zuvor laufende Nachtladung bis zum
aktuell eingestellten Ziel fortgesetzt, sofern es im Nachtfenster noch nicht
erreicht ist. Gerätebezogene 400-W-Grenzen, Notfallmodus, Hardware-Ladelimit-
Synchronisierung und die PV-Regellogik sind ansonsten unverändert.

**Einrichtung:** HACS-Update auf v0.5.3, Home Assistant neu starten und
`dashboard.yaml` bzw. `dashboard-view.yaml` aus dem Repository neu übernehmen.
Die beiden Schieberegler stehen im Abschnitt „Mindest-SoC · Nachtladung“.
Die Einstellungen sind auch im Optionsdialog („Grenzwerte und Zeiten“) verfügbar.

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

