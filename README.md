# Marstek Energy Studio v0.5.17 – Tesla-Konfigurationsmenü sichtbar

In Version 0.5.16 wurde unter **Marstek PV Manager → Konfigurieren** der
neue dritte Menüpunkt **Tesla** aufgrund fehlender deutscher und englischer
Übersetzungen ohne Text angezeigt. Auch die acht Felder im Formular hatten
keine lesbaren Namen.

**Behoben in v0.5.17:** Der dritte Menüpunkt heißt jetzt
**„Tesla – Sensoren und SYNC“**. Im folgenden Formular sind die
SoC- und Reichweitensensoren sowie die optionalen Online-/Schlafstatus-
und Force-data-update-Buttons für **Model 3 und Model Y** eindeutig
bezeichnet.

Für den Fix genügt **die Integration in HACS aktualisieren** und
**Home Assistant neu starten**. Die JavaScript-Ressource
`/local/marstek-energy-flow-card-v0516.js` bleibt unverändert.
Es gibt keine Änderung an Ladeautomatisierungen, Marstek-/SolaX-Befehlen,
Tesla-Abfragen oder den zentralen Messwerten.

---

# Marstek Energy Studio v0.5.16 – Zentrale Tesla-Werte und SYNC-Knöpfe

**Model 3 Highland und Model Y:** Beide Tesla-Kästchen behalten weiterhin
die vollständige Ladeleistung in **W**, SoC in **%**, Reichweite in **km**
und Lade-/Bereit-Status. Zusätzlich erhält jedes Kästchen rechts oben
einen **runden SYNC-Knopf mit zwei kreisförmigen Pfeilen und dem
Schriftzug „SYNC“**.

## Zentrale SoC-/Reichweiten-Speicherung für alle Geräte

Vier zusätzliche Home-Assistant-Sensoren speichern **den letzten gültigen
Wert serverseitig** statt getrennt im iPhone-/iPad-Browser. Dafür nutzt
die Integration die eingebaute HA-RestoreEntity-Speicherung und fragt
die Quellsensoren alle 15 Sekunden ab. Die zuletzt bekannten Werte
werden nach einem HA-Neustart wiederhergestellt.

| Model | Zentraler SoC-Sensor | Zentraler Range-Sensor |
| --- | --- | --- |
| 3 Highland | `sensor.marstek_pv_manager_tesla_model_3_soc_zuletzt` | `sensor.marstek_pv_manager_tesla_model_3_reichweite_zuletzt` |
| Y | `sensor.marstek_pv_manager_tesla_model_y_soc_zuletzt` | `sensor.marstek_pv_manager_tesla_model_y_reichweite_zuletzt` |

Der Status `fresh` ist ein Attribut dieser Sensoren:
- **Blau:** gültige Messung innerhalb von 30 Minuten, optionales Fahrzeug-Online-Signal aktiv.
- **Grau:** Sensor `unknown`, `unavailable`, ungültig, länger als 30 Minuten
  ohne Bericht oder optionaler Schlaf-/Offline-Sensor meldet Ruhe; der
  **gespeicherte Zahlenwert bleibt erhalten**.
- **Noch kein gültiger Wert seit der Installation:** `SoC –` und `– km`;
  ein alter Wert aus dem iPhone-Browserspeicher wird **nicht** gegen den
  zentralen Home-Assistant-Wert ausgespielt.
- Beide Autos und beide Messwerte werden unabhängig geprüft. Die
  Ladeleistung spielt für die Blau-/Grau-Farbe keine Rolle.

Der in Version 0.5.15 verwendete lokale Browserspeicher ist nur noch
eine **Abwärtskompatibilitäts-Fallback**, solange die neuen
Home-Assistant-Cache-Sensoren noch nicht installiert sind. Nach dem
Upgrade ist das zentrale HA-Ergebnis auf iPhone, iPad und PC identisch,
sobald die Quelle mindestens einmal gültige Werte geliefert hat.

## SYNC-Buttons direkt beim Auto

Zwei neue Home-Assistant-`button`-Entitäten stehen bereit:

- `button.marstek_pv_manager_tesla_model_3_sync`
- `button.marstek_pv_manager_tesla_model_y_sync`

Im Flow-Kästchen jeweils als runder Knopf mit **zwei kreisförmigen Pfeilen**
und kleinem `SYNC`-Schriftzug. Ein Tippen:

1. Färbt den Knopf **grün**, während die HA-Sync-Anfrage läuft;
   die Pfeile drehen sich.
2. Lässt die Taste für rund 1,7 Sekunden nach erfolgreicher
   Übermittlung der Anfrage grün und kehrt dann in den neutralen Zustand zurück.
3. Zeigt bei einem Fehler einen roten Fehlerzustand. Ist die entsprechende
   Button-Entität nicht verfügbar, wird der Knopf deaktiviert.
4. Der zweite Tesla kann währenddessen unabhängig bedient werden.

**Wichtige Unterscheidung:** Grün bestätigt **die ausgelöste Anfrage**,
nicht zwingend eine erfolgreiche Bluetooth-Verbindung oder eine
neue Fahrzeugmessung. Erst bei frisch gemeldetem SoC/Range werden
diese **Messwerte** blau.

### Echte ESPHome-/Tesla-BLE-Aktualisierung

In **Einstellungen → Geräte & Dienste → Marstek PV Manager → Konfigurieren
→ Tesla** können pro Auto die Quellsensoren (SoC, Reichweite), ein optionaler
Schlaf-/Verbindungs-Sensor und ein **optionaler Sync-Button** zugeordnet
werden (`model3_sync_target` bzw. `modely_sync_target`). Das Ziel muss
eine existierende `button.`-Entität sein, die **tatsächlich** beim
jeweiligen ESPHome-/Tesla-BLE-Gerät eine Abfrage auslöst.

Ist ein solcher Button hinterlegt, ruft die HA-Taste diese Entität auf.
Ohne hinterlegten Tesla-BLE-Button versucht die Integration stattdessen
`homeassistant.update_entity` für die beiden Sensoren. **Bei push-basierten
ESPHome-Sensoren führt das nicht unbedingt zu einer neuen BLE-Abfrage
und weckt auch keinen schlafenden Tesla.** Es wird kein automatischer
Tesla-Wake-Befehl gesendet.

### Optionaler Schlafstatus

Unter **Konfigurieren → Tesla** lassen sich `model3_awake` und
`modely_awake` mit einem bestehenden `binary_sensor` oder `sensor`
belegen. Als wach gelten `on`, `awake`, `online`, `connected`, `true`.
Alle anderen Zustände bewirken sofort grau und verhindern, dass ein
numerischer Sensorwert den zuletzt gültigen Wert überschreibt,
solange das Fahrzeug als schlafend/offline gemeldet ist.

## Installation

1. Integration in HACS auf **0.5.16** aktualisieren, **Home Assistant
   neu starten**. Dadurch werden die vier zentralen Tesla-Sensoren und
   die zwei Sync-Button-Entitäten angelegt. **Die Marstek-Regelung
   und alle vorhandenen Einstellungen bleiben unverändert.**
2. Die Datei `www/marstek-energy-flow-card-v0516.js` von GitHub nach
   `/config/www/marstek-energy-flow-card-v0516.js` kopieren.
3. Unter **Einstellungen → Dashboards → Ressourcen** die bisherige
   Energy-Studio-JavaScript-Modul-Ressource (nicht zusätzlich eine zweite)
   auf `/local/marstek-energy-flow-card-v0516.js` ändern.
4. Dashboard im Browser oder in der HA-App neu laden. Der neue Dateiname
   verhindert das bekannte iPhone-/iPad-Cacheproblem.
5. **Optional** in den Energy-Flow-Karten-Entitäten eigene
   `necharge_cache_soc`, `necharge_cache_range`,
   `delta_cache_soc`, `delta_cache_range`, `necharge_sync`,
   `delta_sync` konfigurieren, falls Home Assistant aufgrund von
   Namen oder früheren Entitätskonflikten andere Entity-IDs vergeben hat.
   Die neuen Zuordnungen sind in `dashboard.yaml` und
   `dashboard-view.yaml` enthalten und als Standard eingebaut.

Das ist **keine Tesla-Ladesteuerung**: Laden/Entladen, EVCC, Marstek,
SolaX, Netz- und PV-Berechnungen wurden nicht verändert. SYNC
fordert lediglich Telemetrie an.

---

# Marstek Energy Studio v0.5.15 – Tesla-Messwerte blau aktuell, grau eingefroren

**Bei beiden Teslas** (NeCharge/Model 3 Highland und Delta/Model Y) werden
Batterie-SoC und Reichweite separat auf ihre Aktualität geprüft:

- **Blau**: Gültiger Sensorwert, dessen Home-Assistant-Messung vor maximal
  **30 Minuten** gemeldet wurde. Das gilt **auch bei geparktem Auto**; die
  Ladeleistung ist für die Farbe nicht ausschlaggebend.
- **Sofort grau**: Die jeweilige Entität ist `unknown`, `unavailable`,
  ungültig oder ein optionaler Fahrzeugstatus meldet `off` bzw. `asleep`.
  Der **letzte zuvor gültige Wert bleibt sichtbar** (`SoC 72 %`, `380 km`).
- **Nach 30 Minuten grau**: Wenn der Sensor zwar noch eine Zahl enthält, aber
  seit mindestens 30 Minuten nichts mehr gemeldet hat. Eine zyklische
  Prüfung alle 30 Sekunden aktualisiert die Farbe auch ohne HA-Statusänderung.
- **Wieder blau**: Nach neuer gültiger Sensormeldung, sofern das Fahrzeug laut
  optionalem Status wieder wach/online ist.
- Die Karte merkt sich den letzten gültigen Sensorwert nicht nur im Speicher,
  sondern auch in **lokalem Browser-Speicher (localStorage)**. Beim Neuladen
  im selben Browser bleibt ein zuvor gesehener Wert somit grau erhalten,
  selbst wenn die Entität vorübergehend ausfällt. **Beim ersten Besuch auf
  einem anderen Browser/Gerät ohne bekannten Wert steht `SoC –` bzw. `– km`.**
  Die Speicherung erfolgt nur lokal im jeweiligen Browser; es werden keine
  neuen Home-Assistant-Entitäten angelegt.
- `last_reported` wird bevorzugt, weil Home Assistant damit auch eine
  unveränderte Messung als neu gemeldet kennzeichnet. Falls nicht verfügbar,
  wird `last_updated` verwendet. Je nach Integration wird nicht jede
  Sensormessung erneut gemeldet; dann wird die Anzeige vorsichtshalber grau.

## Optional: Ruhender / schlafender Tesla sofort erkennen

Wer eine zusätzliche **Verbindungs-/Schlafstatus-Entität** in Home Assistant hat,
kann diese **optional** in der Energy-Flow-Karte unter `entities:` eintragen:

```yaml
necharge_awake: binary_sensor.DEIN_MODEL_3_AWAKE_SENSOR
delta_awake: binary_sensor.DEIN_MODEL_Y_AWAKE_SENSOR
```

Als wach/online gelten `on`, `awake`, `online`, `connected`, `true`.
Bei `off`, `asleep`, `unknown`, `unavailable` oder fehlender
Verbindungs-Entität schaltet die entsprechende Anzeige **sofort auf grau**.
Während das Fahrzeug schlafen gemeldet ist, werden sogar numerische
SoC-/Reichweitenänderungen **nicht als neue gültige Messungen übernommen**;
der zuletzt vorher gemessene Wert bleibt eingefroren.

**Wenn keine Status-Entität angegeben wird**, funktioniert die Erkennung
über `unknown/unavailable` bzw. die 30-Minuten-Zeitgrenze. Aus einem
weiterhin numerischen SoC-Sensor lässt sich ein sofortiger Schlafstatus
nicht zuverlässig ableiten. Die optionalen Entitäten sind deshalb absichtlich
standardmäßig **leer** und erfordern keine YAML-Änderung, solange kein
eigener Schlaf-/Online-Sensor vorhanden ist.

## Installieren

1. Die neue GitHub-Datei `www/marstek-energy-flow-card-v0515.js`
   nach `/config/www/marstek-energy-flow-card-v0515.js` kopieren.
2. In **Einstellungen → Dashboards → Ressourcen** die bestehende
   Energy-Flow-Ressource (JavaScript-Modul) ändern auf:
   `/local/marstek-energy-flow-card-v0515.js`.
   Nicht parallel eine zweite Version der Karte als Ressource registrieren.
3. Dashboard im Browser bzw. in der HA-App erneut öffnen. Der neue
   Dateiname verhindert, dass Safari/iPhone die ältere Version aus dem
   WebView-Cache verwendet.
4. Optional HACS-Integration auf **v0.5.15** aktualisieren und HA neu
   starten, damit die Versionsanzeige aktualisiert wird.

Die bekannten SoC-/Reichweiten-Sensoren von Model 3 und Model Y sind
unverändert als Standard eingetragen. Es gibt **keine Änderung an
EVCC, Wallboxen, Marstek/SolaX-Steuerung, Lade-/Entladegrenzen oder
PV-/Hausverbrauchsberechnung**; die Ergänzung betrifft ausschließlich
die Darstellung.

---

# Marstek Energy Studio v0.5.14 – Tesla Model Y SoC und Reichweite im Delta-Kästchen

Die **Delta · Model Y**-Kachel zeigt jetzt genau wie **NeCharge · Model 3**
drei Live-Werte übereinander:

- Ladeleistung (weiterhin aus `sensor.evcc_delta_ac_smart_wallbox_charge_power`, kW automatisch in W konvertiert).
- **SoC** in Prozent aus `sensor.tesla_model_y_usable_battery`.
- **Reichweite** in km aus `sensor.tesla_model_y_range`.

Die neuen, frei konfigurierbaren Dashboard-Zuordnungen heißen
`entities.delta_soc` und `entities.delta_range`. Sie sind mit den
genannten Sensor-IDs voreingestellt und daher auch ohne Änderungen an
bestehenden Karten-YAMLs verfügbar. Beide Dashboard-Vorlagen
(`dashboard.yaml` und `dashboard-view.yaml`) wurden ergänzt.

Die Anzeige funktioniert auf Desktop, iPad und iPhone mit der gleichen
Aufteilung wie beim Model 3. Bei `unknown`, `unavailable` oder einem
ungültigen Wert steht `SoC –` beziehungsweise `– km`; Laden,
Hausbilanz und Status bleiben davon unberührt. Wenn Home Assistant einen
alten numerischen Messwert weiterhält, bleibt er wie beim Model 3
sichtbar; es wird noch keine Aktualitätsprüfung durchgeführt.

**Installation (Cache-sicherer Dateiname):**

1. Optional HACS-Integration auf **v0.5.14** aktualisieren und Home
   Assistant neu starten, damit die Versionsanzeige aktuell ist.
2. Die GitHub-Datei `www/marstek-energy-flow-card-v0514.js` nach
   `/config/www/marstek-energy-flow-card-v0514.js` kopieren.
3. Unter **Einstellungen → Dashboards → Ressourcen** die vorhandene
   Energy-Flow-Ressource als JavaScript-Modul auf
   `/local/marstek-energy-flow-card-v0514.js` ändern.
   Nicht eine zweite identische Ressource zusätzlich registrieren.
4. Dashboard am PC/Smartphone neu laden; ggf. HA-iOS-App einmal schließen.
5. Optional für das bestehende Dashboard-YAML unter `entities:` ergänzen:

   ```yaml
   delta_soc: sensor.tesla_model_y_usable_battery
   delta_range: sensor.tesla_model_y_range
   ```

**Sicherheit:** Nur Anzeigeänderungen an der Frontend-Karte und
Dashboard-Entity-Zuordnung; keine Modbus-Zugriffe, Änderungen am
Marstek-/SolaX-Controller oder EVCC-Ladeverhalten.

# Marstek Energy Studio v0.5.13 – Model 3 Reichweite (km) im NeCharge-Kästchen

Die Live-Energiefluss-Karte zeigt im bestehenden **NeCharge · Model 3**-Kästchen
zusätzlich zur Ladeleistung und zum SoC jetzt die **geschätzte Tesla-Reichweite**
mit der Einheit `km` an.

- Sensor: `sensor.tesla_model_3_highland_range`
- Die drei Messwerte werden einzeln live eingelesen: Leistung in W,
  `SoC 97 %` und etwa `382 km` (Beispiele; keine festen Zahlen).
- Mobil-/Desktop-Kacheln wurden vertikal angeordnet, damit der zusätzliche
  Kilometerwert unter dem SoC und über dem bisherigen Ladestatus Platz findet.
- Konfigurierbar über `entities.necharge_range`; für die bestehende
  Installation ist der genannte Sensor als Standard hinterlegt.
- Bei `unavailable`, `unknown`, nichtnumerischen oder negativen Werten
  wird `– km` angezeigt; SoC und Ladeleistung funktionieren unabhängig.
- Anzeige des zuletzt vom Sensor übermittelten numerischen Werts; diese Version
  führt noch **keine Aktualitäts-/Stale-Prüfung** durch.
- Reine Anzeige; keine Änderung an EVCC, Ladepunkt, SolaX, Marstek,
  Hausbilanz oder Lade-/Entlade-Logik.

**Installation (iPhone-Cache sicher umgehen):**

1. HACS-Integration auf **v0.5.13** aktualisieren, wenn die neue
   Integrationsversionsnummer im Dashboard erscheinen soll, und HA neu starten.
2. GitHub-Datei `www/marstek-energy-flow-card-v0513.js` in den
   Home-Assistant-Ordner `/config/www/marstek-energy-flow-card-v0513.js`
   kopieren. Die bisherige Datei kann dort bleiben.
3. **Einstellungen → Dashboards → Ressourcen:** Die vorhandene Ressource
   (JavaScript-Modul) bearbeiten, nicht zusätzlich eine zweite anlegen:
   `/local/marstek-energy-flow-card-v0513.js`
4. Dashboard neu laden (iPhone-App ggf. ganz schließen und neu öffnen).
5. Optional im vorhandenen Flow-Karten-YAML unter `entities:` ergänzen:

   ```yaml
   necharge_range: sensor.tesla_model_3_highland_range
   ```

   Diese Zeile ist in `dashboard.yaml` und `dashboard-view.yaml` bereits
   ergänzt. Die Karte verwendet den Sensor auch ohne diese YAML-Zeile als
   Standard – also kein kompletter Dashboard-Umbau nötig.

# Marstek Energy Studio v0.5.12 – Tesla Model 3 Highland SoC im NeCharge-Kästchen

Im bestehenden Energy-Flow-Dashboard wird der **aktuelle Tesla Model 3 Highland SoC**
zusätzlich zur NeCharge-Ladeleistung angezeigt. Die neue Zeile **SoC 97 %**
(als Beispiel) steht im selben Fahrzeug-Kästchen direkt unter der Live-Leistung,
im passenden kräftigen Stil. Der Ladestatus bleibt erhalten.

- Quelle: `sensor.tesla_model_3_highland_usable_battery` (Prozent).
- Frei änderbare Entity-Zuordnung der Karte: `entities.necharge_soc`.
- Der SoC wird live in **Desktop- und Mobilansicht** aktualisiert.
- Bei fehlendem/ungültigem Sensor erscheint `SoC –`, keine erfundene Null.
- Keine Änderung an Tesla-/NeCharge-Laderegelung, Marstek, SolaX, EVCC,
  PV-/Netzleistung, Lade-/Entladegrenzen oder Hausbilanz.
- Andere HA-Installationen können statt des vorgegebenen Sensors eine
  eigene Entität als `necharge_soc` angeben; der Eintrag ist optional,
  weil die JS-Karte einen Standardwert hat.

**Installation v0.5.12 (Cache-sicher):**

1. In HACS auf **v0.5.12** aktualisieren und Home Assistant neu starten,
   falls die angezeigte Integrationsversion aktualisiert werden soll.
2. Die GitHub-Datei **`www/marstek-energy-flow-card-v0512.js`** nach
   `/config/www/marstek-energy-flow-card-v0512.js` kopieren.
   Die bestehende `marstek-energy-flow-card-v0511.js` kann unangetastet bleiben.
3. In **Einstellungen → Dashboards → Ressourcen** die *bestehende*
   Energy-Flow-JavaScript-Modul-Ressource bearbeiten, nicht doppelt hinzufügen:
   `/local/marstek-energy-flow-card-v0512.js`
4. Dashboard neu laden. Dank des neuen Dateinamens verwenden auch Safari
   am iPhone und die Home-Assistant-iOS-App eine neue Ressourcen-URL.
5. Bei Bedarf im Energy-Flow-Dashboard unter `entities:` ergänzen:

   ```yaml
   necharge_soc: sensor.tesla_model_3_highland_usable_battery
   ```

   Sowohl `dashboard.yaml` als auch `dashboard-view.yaml` enthalten
   diese Zeile bereits. Bestehende individuelle Dashboards funktionieren
   jedoch ohne YAML-Änderung, da der Wert voreingestellt ist.

**Hinweis:** Diese Änderung betrifft nur die Visualisierung. Bei fehlendem
Tesla-SoC gibt es keine Auswirkung auf NeCharge-Ladeleistung oder Status.

# Marstek Energy Studio v0.5.11 – Dynamische PV-Signalbalken

**PV gesamt:** Die bisherigen dekorativen Balken sind durch **6 echte
Leistungsstufen** wie bei der Handy-Empfangsanzeige ersetzt. Jeder Balken
ist vollständig **blau oder grau** (kein teilweises Füllen).
Die **aktuelle PV-Auslastung in %** wird zusätzlich direkt im PV-Kästchen
angezeigt. Die Balken haben einen dezenten Leuchteffekt, sofern der
Browser keine reduzierte Animation bevorzugt.

Berechnung: `Prozent = min(100, PV-Leistung / eingestelltes Maximum × 100)`.
Bei 0 W sind alle 6 Balken grau, bei 100 % sind alle 6 blau.
Die Zahl leuchtender Balken wird auf die nächste Stufe **aufgerundet**.
Ein fehlender PV-Sensor zeigt `– %` und nur graue Balken; Leistungen über
dem eingestellten Maximum bleiben bei 100 % stehen.

Der neue persistente Home-Assistant-Regler ist:
`number.marstek_pv_manager_pv_anzeige_maximum`.

- **8.000–14.000 W** in **100-W-Schritten**; Anfangswert **8.400 W**.
- Im Dashboard ist der Regler als **separate Mushroom-Slider-Karte direkt
  unter der Energiefluss-Grafik** angeordnet. Beide Dashboard-Dateien
  (`dashboard.yaml`, `dashboard-view.yaml`) wurden angepasst.
- Der Schieberegler ändert **ausschließlich die optische PV-Skala**.
  Weder die tatsächliche PV-Produktion noch die Marstek-/SolaX-
  Steuerung, Lade-/Entladegrenzen oder Wallboxen werden verändert.
- Bestehende Installationen ohne die neue Entität zeigen zunächst
  den sicheren Default 8.400 W; PV-Live-Wert bleibt unverändert.
- Das restliche Layout, realistische Hausfoto (Blur 7/12 px),
  Smart-Home-Icon, Netz-Welle, Batteriekarten und Tesla-Bilder bleiben
  wie in v0.5.10.

**Installation:**

1. In HACS auf **v0.5.11** aktualisieren und Home Assistant neu starten.
   Unter *Entwicklerwerkzeuge → Zustände* prüfen, ob die neue
   `number.marstek_pv_manager_pv_anzeige_maximum` vorhanden ist.
2. JavaScript-Datei `www/marstek-energy-flow-card.js` aus GitHub nach
   `/config/www/marstek-energy-flow-card.js` kopieren.
3. Unter *Einstellungen → Dashboards → Ressourcen* auf
   `/local/marstek-energy-flow-card.js?v=0511` (JavaScript-Modul)
   wechseln und den Browser per Strg+F5 neu laden.
4. **Eigene Slider-Karte unter dem Flow ergänzen:** Die aktualisierten
   Dashboard-YAML-Dateien enthalten sie bereits. Wenn du dein bestehendes
   Dashboard behalten möchtest, **nur** diese neue Karte direkt nach
   `type: custom:marstek-energy-flow-card` (auf der Ebene der Karten)
   einfügen:

   ```yaml
   - type: custom:mushroom-number-card
     entity: number.marstek_pv_manager_pv_anzeige_maximum
     name: PV-Anzeige · 100 % bei
     icon: mdi:signal
     icon_color: blue
     display_mode: slider
     grid_options:
       columns: full
   ```

   Im Energy-Flow-Kartenabschnitt kann optional
   `pv_max: number.marstek_pv_manager_pv_anzeige_maximum`
   ergänzt werden; die neue Karten-JS verwendet diesen Entity-Namen
   auch ohne YAML-Änderung automatisch als Standard.

Wichtig: Die Beispiel-% in der Vorschau beziehen sich immer auf den
**gewählten Anzeigemaßstab**, nicht auf die installierte Modulleistung.

# Marstek Energy Studio v0.5.10 – Smart-Home-Herzschlag-Symbol

Das bisherige einfache **Haus-Symbol** wurde nach der gemeinsam
ausgewählten **Bildvariante 1** durch ein moderneres inline-SVG-Symbol
ersetzt: Links im Haus-Kästchen sitzt nun eine blau-cyan leuchtende
Glaskugel mit einer weißen Hauskontur und einer **Energie-Pulslinie**
im Inneren. Rechts davon stehen nach wie vor **Haus ≈** und
der **aktuelle Live-Leistungswert in W**. Es gibt weiterhin **keine**
Zeile „Bilanz-Schätzwert“.

- Neue Haus-Illustration auf PC **und** Smartphone sichtbar, scharf
  skalierbar, ohne separate Bilddateien.
- Transparenter heller Kartenhintergrund, dezenter neonblauer Glow.
- Kein Pseudo-Puls-Sensor: die Linie im Hausicon ist nur ein
  gestalterisches Symbol, **nicht** eine zusätzliche Messung.
- PV-Kästchen mit PV/Sonne, Strommast mit grün/roter Welle,
  Batterie-SoC, Hausfoto und Tesla-Knoten bleiben unverändert.
- Keine Änderung an Sensoren, Hausbilanz oder an den Lade-/Entlade-
  und Nachtladeautomatiken.

**Installation:**

1. HACS auf **v0.5.10** aktualisieren, Home Assistant neu starten.
2. Die aktuelle GitHub-Datei `www/marstek-energy-flow-card.js`
   in den HA-Konfigurationsordner `www` kopieren und die alte
   JavaScript-Datei ersetzen.
3. Unter **Einstellungen → Dashboards → Ressourcen** die
   bestehende JavaScript-Modul-URL auf
   `/local/marstek-energy-flow-card.js?v=0510` ändern.
4. Dashboard im Chrome mit **Strg+F5** neu laden.
   Dashboard-YAML und die vorhandenen Tesla-Bilddateien
   bleiben unverändert.

# Marstek Energy Studio v0.5.9 – PV-/Netzsymbole und dynamische Netzwelle

**Neue Darstellung der Live-Energiefluss-Karte:** Die beiden
Referenzbilder für die Kästchen `PV gesamt` und `Stromnetz` dienen
als Vorlage für neue, skalierbare, direkt in die JavaScript-Karte
eingebaute **SVG-Grafiken** – keine weiteren Bilddateien erforderlich.

- **PV gesamt:** Blaues PV-Modul mit gelber Sonne links,
  rechts oben kleine hellblaue Mini-Leistungsbalken.
- **Stromnetz:** Blauer Strommast als große Illustration links;
  darunter eine farbige, dezent pulsierende Welle.
  - Echter Netzfluss `sensor.solax_m_measured_power > 0`:
    **grüne Welle / Einspeisung**.
  - Netzfluss `< 0`: **rote Welle / Netzbezug**.
  - Genau `0`: hellblaue neutrale Welle / Ausgeglichen.
  - Sensor `unknown` oder `unavailable`: dezente neutrale
    Welle und klarer Status **Nicht verfügbar**.
- **Haus:** Nur noch **Haus ≈** und der berechnete Live-Leistungswert;
  der bisherige Hinweis **Bilanz-Schätzwert** im Kasten entfällt.
- Gleiches Layout auf **Desktop und Smartphone**; das PV-Mini-Diagramm
  ist rein dekorativ und zeigt bewusst keine fiktiven Zeitreihen.
- Der Blur des realistischen Hausfotos bleibt bei **7 px Desktop /
  12 px Mobile**.
- Keine Änderung an SolaX-/Marstek-SoC, Batteriekarten, Teslas,
  Netzbilanz oder an den Lade-, Entlade-, Notfall- oder
  Nachtlade-Automationen.

**Installation:**

1. In HACS die Version **v0.5.9** installieren und Home Assistant
   neu starten (für die Versionsanzeige).
2. Die aktualisierte Datei `www/marstek-energy-flow-card.js`
   aus GitHub in `/config/www/marstek-energy-flow-card.js`
   kopieren; bisherige Datei ersetzen.
3. Home Assistant **Einstellungen → Dashboards → Ressourcen**:
   Ressource als JavaScript-Modul auf
   `/local/marstek-energy-flow-card.js?v=059` setzen.
4. Chrome oder anderen Browser mit **Strg+F5** neu laden.
   Dashboard-YAML, Hausfoto und Tesla-Bilddateien bleiben unverändert.

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

