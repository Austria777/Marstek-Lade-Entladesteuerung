# GitHub-Repository

Das Projekt wird verwaltet unter https://github.com/Austria777/Marstek-Lade-Entladesteuerung

## Hinweise zur Installation

- Die Integration liegt im Verzeichnis `custom_components/marstek_pv_manager/` und lässt sich über HACS installieren.
- Das Dashboard (`dashboard.yaml`) muss separat in Home Assistant importiert werden.
- Die JavaScript-Karte (`www/marstek-energy-flow-card.js`) ist separat nach `/config/www/` zu kopieren und als Modul `/local/marstek-energy-flow-card.js?v=041` zu registrieren (unverändert seit Version 0.4.1).
- Mushroom Cards benötigt eine separate HACS-Installation.
- Die 10-%-Nachtladung ist nach dem Update bewusst ausgeschaltet, bis die bisherige Nachtlade-YAML deaktiviert wurde.
- Die Integration ist noch nicht in allen Betriebs- und Fehlersituationen am echten Gerät getestet.

Vor dem Speichern von Dateien auf GitHub stets Zugangsdaten, Tokens und persönliche HA-Konfigurationsdateien entfernen.
