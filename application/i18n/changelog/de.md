# Änderungsprotokoll


## [0.5.28] - 2026-07-24

### Funktionen
- **Diagnosezentrum**: In Einstellungen → System gibt es jetzt eine Karte „Diagnose", die Absturzprotokolle, Verbindungsverlauf (anonymisiert) und das KI-Freigabeprotokoll zu einem JSON-Bericht bündelt, der per Klick kopiert oder exportiert werden kann; Renderer-Error-Boundaries sowie globale unbehandelte Exceptions/Promise-Rejections werden jetzt ebenfalls im Absturzprotokoll erfasst — diese Verbindung fehlte bisher
- **MCP-/CLI-Aufrufprotokoll**: Protokolliert jeden Aufruf der lokalen CLI (magies-terminal-tool-cli) oder eines MCP-Clients — nur Methodenname, Ergebnis und Dauer, nie die Aufrufargumente; wird 30 Tage aufbewahrt und automatisch rotiert und ist im Export des Diagnosezentrums enthalten

## [0.5.27] - 2026-07-23

### Funktionen
- **Schlanker Datenbankclient**: Der Vault unterstützt jetzt einen Datenbankverbindungstyp – Verbindungen zu MySQL, PostgreSQL, SQL Server oder Oracle über einen bereits gespeicherten SSH-Host-Tunnel, ohne den Datenbankport auf dem Server zusätzlich öffnen zu müssen; das Öffnen einer Datenbankverbindung öffnet einen neuen Tab genau wie eine Terminal-Sitzung, mit integriertem SQL-Editor und einer Ergebnistabelle für Abfragen; Datenbankpasswörter nutzen dieselbe Vault-Verschlüsselung wie Host-Passwörter, statt im Klartext im lokalen Speicher zu landen

## [0.5.26] - 2026-07-23

### Funktionen
- **Host aus dem Gruppen-Kontextmenü hinzufügen**: Das Kontextmenü einer Gruppe im Host-Baum hat jetzt „Neuer Host“, das die Gruppe des neuen Hosts vorab auf die angeklickte Gruppe setzt, statt über die obere Schaltfläche zu erstellen und die Gruppe manuell auszuwählen

### Verbesserungen
- **Das im Leerlauf befindliche Desktop-Haustier geht jetzt umher statt zu atmen**: Die Leerlaufanimation lässt das Haustier seitlich im Overlay-Fenster hin- und herlaufen, mit einem Schritt-Wippen und einer Drehung bei der Kehrtwende; die Standardfigur hat kein Sprite-Sheet für einen Laufzyklus, daher ist die Bewegung eine reine CSS-Transform-Illusion
- **Echtzeit-Diagramm des Monitors als Neon-HUD-Panel neu gestaltet**: Das Live-Diagramm im Übersichtstab wechselt von einer glatten Linie zu einer Stufenlinie, auf einem festen dunklen Sternenfeld-Hintergrund mit einem stärkeren zweischichtigen Leuchten und einem sich ausbreitenden Radar-Ping-Ring am jeweils neuesten Messwert jeder Reihe

## [0.5.25] - 2026-07-22

### Funktionen
- **Desktop-Haustier**: In Einstellungen → KI → Haustier aktivieren, und ein verschiebbares, schwebendes Haustier erscheint irgendwo auf dem Bildschirm und animiert sich passend zum KI-Status – Atmen im Leerlauf, Hüpfen während der Ausführung, Wackeln beim Warten auf Ihre Bestätigung, Winken bei Abschluss, Zittern bei Fehlern. Da das Haustier selten den Systemfokus hält, wurde die Animationsdrosselung von Electron für nicht fokussierte Fenster hier gezielt deaktiviert, damit es nicht eingefroren wirkt
- **Direkte Interaktionen**: Klick öffnet/fokussiert das KI-Chat-Panel und springt nach Möglichkeit zur gerade beschäftigten Terminal-Sitzung; Doppelklick fokussiert das Hauptfenster; Rechtsklick öffnet ein Menü zum Ausführen eines in den Einstellungen konfigurierten Befehls, zum Öffnen der KI-Einstellungen, zum Zurücksetzen der Position oder zum Ausblenden des Haustiers; beim Hover erscheint eine ausführlichere Statusblase
- **Individuelles Aussehen**: eigenes Bild oder Sprite-Sheet hochladbar, mit pro Status (Leerlauf/Ausführung/Warten/Fertig/Fehler) einstellbaren Frame-Bereichen für Sprite-Sheets; Größe, Deckkraft, Immer-im-Vordergrund und Sichtbarkeit der Sprechblase sind einstellbar
- **Privatmodus und Abschlussbenachrichtigungen**: Der Privatmodus zeigt in der Blase nur einen allgemeinen Status wie "läuft" statt den aktiven Tool-Namen; Aufgaben ab 10 Sekunden Laufzeit können bei Abschluss oder Fehlschlag optional eine Desktop-Benachrichtigung auslösen
- **Positionsspeicherung und Mehrbildschirm-Unterstützung**: Die Position, an die das Haustier gezogen wurde, bleibt über Neustarts und erneutes Aktivieren hinweg erhalten; wird ein Bildschirm getrennt oder die Auflösung geändert, springt das Haustier automatisch zurück in die Standardecke

## [0.5.24] - 2026-07-22

### Fehlerbehebungen
- **Die Zustandsprüfung hatte noch nie tatsächlich eine Schlüsseldatei gelesen**: die asynchrone Hilfsfunktion zum Lesen privater Schlüssel wurde ohne `await` aufgerufen, sodass ein noch nicht aufgelöstes Promise statt des Dateiinhalts geprüft wurde und jeder Schlüssel stillschweigend als „kein privater Schlüssel" eingestuft wurde. Jeder Host, der auf eine lokale Schlüsseldatei statt auf einen inline gespeicherten Schlüssel angewiesen ist, scheiterte garantiert an der Zustandsprüfung — obwohl dieselbe Verbindung im Terminal einwandfrei funktioniert
- **Ein lokales Entschlüsselungsproblem wird nicht mehr als abgelehnter Login gemeldet**: ein Passwort oder Schlüssel, der noch als verschlüsselter Platzhalter vorlag, wurde vor der Prüfung auf nichts reduziert, sodass der Server folgerichtig einen Login ohne jegliche Zugangsdaten ablehnte. Die Prüfung erkennt jetzt „Zugangsdaten sind konfiguriert, können auf diesem Gerät aber nicht entschlüsselt werden" und verweist auf das Entsperren des Tresors oder die Reparatur des sicheren Speichers
- **Ein nicht vertrauenswürdiger Host-Schlüssel gibt sich nicht mehr als Authentifizierungsfehler aus**: die Prüfung verweigerte schon immer sämtliche Authentifizierungsmethoden, wenn ein Host-Schlüssel unbekannt ist oder sich geändert hat, meldete diese Tatsache aber nie an das Panel. Jetzt erscheint ein eigener Status „Host-Schlüssel nicht verifiziert" mit dem Hinweis, einmal manuell zu verbinden, um Vertrauen herzustellen
- **Der Hinweis „verschlüsselter Schlüssel übersprungen" hängt nicht mehr vom Zufall ab**: er erschien bisher nur, wenn überhaupt keine Authentifizierungsmethode versucht wurde — doch auf jeder Maschine mit laufendem SSH-Agent wird immer zuerst der Agent versucht, wodurch der Hinweis fast nie ausgelöst wurde
- **Die Zustandsprüfung verwendet jetzt die beim interaktiven Verbinden gespeicherte Schlüssel-Passphrase**: diese Passphrase galt bisher nur für normale Verbindungen und wurde von der Zustandsprüfung nie abgefragt, sodass ein passphrasegeschützter Schlüssel, der im Terminal einwandfrei funktioniert, die Zustandsprüfung immer scheitern ließ

## [0.5.23] - 2026-07-22

### Fehlerbehebungen
- **Das Theme-Skript beim Start wurde nie ausgeführt**: es setzt gespeichertes Theme, Akzentfarbe und Sprache, bevor die Oberfläche zeichnet, wurde als eingebetteter Block aber von der CSP abgelehnt — beim Start blitzten die falschen Farben auf. Es liegt jetzt in einer eigenen Datei, ohne die Sicherheitsrichtlinie zu lockern
- **frame-ancestors kommt jetzt als Header**: in einer `<meta>`-CSP ignoriert der Browser diese Direktive, sie bewirkte also nichts. Sie stammt nun aus den app://-Antwortheadern und vom Entwicklungsserver, und ein neuer Test schlägt fehl, sobald wieder ein eingebettetes Skript auftaucht

### Funktionen
- **Wiedergabe von cast-Aufzeichnungen**: die App konnte asciinema cast v2 aufzeichnen, aber nie öffnen. Abspielen, Pause, Spulen und 1x/2x/4x; eine abgebrochene Aufzeichnung überspringt beschädigte Zeilen und nennt deren Anzahl, statt die Datei abzulehnen
- **Suche innerhalb eines Sitzungsprotokolls**: Cmd/Strg+F im Protokollbetrachter, unabhängig von der Suche im laufenden Terminal
- **Bytes pro Zeile im Hex-Panel**: Umschalten zwischen 8 / 16 / 32, bereits erfasste Ausgabe wird sofort neu umbrochen
- **Änderungsprotokoll nach Kategorie filtern**: Chips für Sicherheit / Funktionen / Fehlerbehebungen / Verbesserungen samt Anzahl

### Verbesserungen
- **Nicht erreichbare Deklarationen entfernt**: Code, der definiert und nie aufgerufen wurde — darunter eine Teamberechtigung, die nie geprüft wurde, aber zu existieren behauptete, ein Gruppenfeld ohne Wirkung und ein WAN-Einladungsparser, der die Implementierung des Hauptprozesses doppelte und nie geladen werden konnte
- **Abdeckung des Lesezeichen-Ankers**: die Umrechnung von Byte-Offset zu Zeilennummer ist nun an CRLF, Bereichsüberschreitung und exaktem Hin- und Rückweg festgeschrieben

## [0.5.22] - 2026-07-21

### Sicherheit
- **Team-Audit-Signaturen werden tatsächlich geprüft**: bisher genügte ein vorhandenes `sig`-Feld für ein Häkchen, ohne jede Prüfung; jeder Eintrag wird nun per HMAC verifiziert und als geprüft, manipuliert, unsigniert oder nicht prüfbar ausgewiesen
- **Prüfungen tragen keine Zugangsdaten zurück**: der Proxy-Verbindungstest liefert einen Fehlercode statt der ursprünglichen Meldung (HTTP CONNECT spiegelt `Proxy-Authorization`, ProxyCommand die Kommandozeile); die Feldzuordnung einer Datenquelle kann die Geheimnisprüfung des Inventars nicht umgehen

### Funktionen
- **SFTP-Massenumbenennung**: Vorlagen `{name}` / `{ext}` / `{n}` mit Nullauffüllung; der gesamte Stapel wird vor der Ausführung geplant und angezeigt, und jede Namensdopplung oder Kollision mit einer unbeteiligten Datei bricht den gesamten Vorgang ab
- **Hostfelder im Stapel bearbeiten**: Benutzername, Gruppe, Port und Tags für eine ganze Auswahl auf einmal; Tags werden ergänzt statt ersetzt, ein leeres Feld bedeutet unverändert, und von einer Datenquelle verwaltete Hosts werden mit Anzahl ausgenommen
- **Strukturierte Hostsuche**: Filter `tag:` `user:` `group:` `host:` gemischt mit Freitext; ein Ausdruck gilt nur dann als Filter, wenn vor dem Doppelpunkt ein bekannter Feldname steht, sodass IPv6-Adressen und Bezeichnungen mit vollbreitem Doppelpunkt unberührt bleiben
- **Tastenkürzel-Übersicht per F1**: durchsuchbar, nach Kategorien gruppiert und aus den tatsächlich aktiven Belegungen gelesen; sie selbst ist ein gewöhnliches, neu belegbares Kürzel
- **Hex-Senden über die serielle Schnittstelle**: Bytes werden unverändert an das Gerät geschrieben und umgehen die Zeichensatzkodierung, mit Byte-Vorschau und ASCII-Darstellung
- **Feldzuordnung für Datenquellen**: Namen wie `name` / `ip` / `ssh_port` lassen sich auf die kanonischen Felder abbilden, für fremde Inventare, die nicht geändert werden können
- **Zugang zu bereits vorhandenen Funktionen**: Befehl an ein tmux-Fenster senden, Proxy-Verbindung testen, beim Schlüsselimport das Zertifikat erkennen und PKCS#11-Modulpfade vorschlagen

### Fehlerbehebungen
- **Team-Vault-Import meldet keinen falschen Erfolg mehr**: der Import eines Freigabepakets meldete „N Hosts importiert", verwarf sie aber, und die Liste blieb unverändert; die Hosts landen jetzt wirklich im Vault, die gemeldete Zahl entspricht dem tatsächlichen Ergebnis, und es wird nur ergänzt, ohne lokale Änderungen oder Zugangsdaten zu überschreiben
- **WAN-Einladungscodes lassen sich beitreten**: `magies-follow:2:`-Einladungen wurden stets als LAN gelesen und scheiterten mit `version`, obwohl die Oberfläche sie ausdrücklich annahm; der Transport wird nun anhand der Einladungsversion gewählt
- **Hostexport berücksichtigt die Auswahl**: nach dem Markieren einzelner Hosts wurden dennoch alle exportiert
- **Lange Menüeinträge laufen nicht mehr aus dem Menü**: feste Breiten schoben die längsten Einträge über den Rand und drückten deren Symbole auf null; im Sortiermenü liefen auf Französisch drei Einträge über
- **tmux-Befehl senden ist erreichbar**: die Aktion verlangte eine Bereichsnummer, die die Oberfläche nicht liefern konnte, sodass die Funktion zwar vorhanden, aber nicht auslösbar war

### Verbesserungen
- **SFTP-Übertragungen zeigen die Restzeit**: entfällt, wenn die Rate unbekannt ist, und erscheint nicht bei Verzeichniszeilen, deren Summe Dateien zählt
- **Synchronisationsstand in der oberen Leiste**: beim Überfahren ist zu sehen, wann Daten zuletzt tatsächlich angekommen sind, ohne das Panel zu öffnen
- **Exportierte KI-Unterhaltungen behalten die Gedankengänge**: in Markdown eingeklappt, im reinen Text eingerückt, mit Dauer
- **Bedienung der KI-Einstellungen**: Schnellnachrichten haben eine Suche erhalten, und bei einem lokalen Modell ohne erkannten Werkzeugaufruf wird erklärt, was das bedeutet
- **Absturzberichte zeigen das Gesendete**: erst nach erfolgreichem Upload gezählt, damit Fehlschläge und Dubletten den Wert nicht erhöhen
- **Prozess- und tmux-Aktionen nutzen den In-App-Dialog**: keine Systemfenster mehr, die Bestätigung folgt dem App-Design
- **Mobil unter den Qualitätsprüfungen**: `mobile/` war von Lint und Tests vollständig ausgenommen, und sein Test wurde in der CI nie ausgeführt

## [0.5.21] - 2026-07-21

### Sicherheit
- **Tiefe Bereinigung des Host-Kontexts**: Passwörter, Telnet-Passwörter, private Schlüssel und Passphrasen werden rekursiv aus verschachtelten Objekten und Arrays entfernt
- **Sitzungsbereich öffentlicher Fähigkeiten**: Jede öffentliche Fähigkeit prüft die Sitzung nun nach dem Fail-closed-Prinzip und kann den aktuellen Chat-Bereich nicht verlassen
- **Sensible Lesezugriffe und Freigabeprotokoll**: Pod describe ist ein Sensitive Read; der Hauptprozess speichert nur Freigabemetadaten atomar und ohne Zugangsdaten

### Funktionen
- **Strikter lokaler Datenschutz und Modelltest**: Nur Loopback-Modelldienste, keine externen Agents/Websuche und ein Test für Tool-Aufrufe lokaler Modelle
- **Docker-Compose-Verwaltung**: Projekte und Dienste prüfen sowie explizite up-, restart- und down-Aktionen ausführen
- **Erweiterte Kubernetes-Aktionen**: strukturierte Events, Rollout-Status/-Verlauf/-Neustart, Agent Exec, interaktives Exec und Loopback Port Forward

### Fehlerbehebungen
- **Kubernetes-Listen als JSON**: Namespaces, Pods und Deployments werden nicht mehr aus instabilen Tabellen gelesen; kubectl-Fehler werden direkt angezeigt
- **Plattformübergreifende Pakete**: Apple-Silicon-Fuse-Absturz ohne kostenpflichtige Developer ID behoben; Android nutzt JDK 21, SDK/Build Tools 36 und v0.5.21-Metadaten

## [0.5.20] - 2026-07-21

### Features
- **System Manager Kubernetes**: remote kubectl for Pods/Deployments (list, logs, describe); delete pod / scale deployment with confirmation; MCP/CLI expose read and controlled write tools
- **Local LLM privacy hardening**: Ollama/LM Studio paths and approval audit; secrets never sent into LLM context
- **Session cast recording**: asciinema cast v2 records input; resize emits geometry markers; startStream stores cols/rows
- **SFTP conflict compare + true byte resume**: conflict dialog shows metadata compare; drag-drop resume uses `startOffset` append without deleting the target
- **Capability catalog expansion**: Kubernetes domain catalog registration, quasi-plugin registration, CLI/MCP/sidebar tool specs aligned

### Improvements
- **System Overview monitoring look**: resource bars and overview closer to a live monitoring HUD
- **SSH config / Vault import UX**: import flow and messaging polish

## [0.5.19] - 2026-07-20

### Improvements
- **Auto model catalog + UX**: providers fetch live `/models` after API key entry; loading/error/retry status; live list preferred over offline presets
- **GPT-5.6 / Grok / Gemini presets**: updated Codex/Cursor/OpenCode and OpenAI/xAI/Google defaults
- **xAI (Grok) provider**: first-class `api.x.ai` preset
- **ChatGPT branding**: Codex agent displays as ChatGPT with OpenAI icon; agent icons resolve by brand

## [0.5.18] - 2026-07-20

### Verbesserungen
- **Claude-ähnliches AI-Chat-Layout**: zentrierte Lesespalte (~44rem) mit größerer Schrift und Zeilenhöhe; weiche Nutzerblasen und rahmenlose Assistenten-Prosa; minimaler Header und runder Composer; Senden als Vordergrund/Hintergrund-Kreis; ruhigerer Leerzustand, Verlauf, Thinking und Tool-Gruppen

## [0.5.17] - 2026-07-20

### Verbesserungen
- **Toolbar-Icon-Layout neu gestaltet**: Vault-Header-Tools in themenkonformen Clustern; einheitliche Höhen/Abstände; Multi-Select-Leiste und Top-Tab-Utilities gruppiert mit Theme-Hover

## [0.5.16] - 2026-07-20

### Verbesserungen
- **Mehrfarbige Themes leichter wählbar**: Core mit **Claude-Orange / White / Black** plus Blau, Grün, Lila, Rose, Amber, Sky; Appearance mit One-Tap-Farbchips

## [0.5.15] - 2026-07-20

### Verbesserungen
- **Claude-Orange als Standard-UI-Thema**: Hell/Dunkel standardmäßig warmes Anthropic/Claude-Orange; Claude steht zuerst in der Kernliste, **Pure Black** bleibt wählbar; Follow-App-Terminalthemen passen dazu

## [0.5.14] - 2026-07-20

### Verbesserungen
- **KI-Icons und Komponentensystem neu gestaltet**: Agent-/Provider-Badges mit Verlaufsplatten; Tool-Call-Karten mit Kategorie-Icons; stärkere Freigabeleiste und Status-Chips; Vault-/Terminal-Artefakte als einheitliche Karten; Slash-Picker und Exportmenü ikonisiert

## [0.5.13] - 2026-07-20

### Verbesserungen
- **KI-Seitenleiste neu gestaltet**: Umgebungslicht und feines Raster; Glas-Header mit solidem Primary-„Neuer Chat“; User-Bubbles solid primary, Assistant-Karten mit Primary-Kante; schwebender Composer mit Fokus-Glow; Leerzustand, letzte Sessions, Tool-Gruppen, Thinking-Blöcke und Agent-Menü angepasst

## [0.5.12] - 2026-07-20

### Verbesserungen
- **Deutlich sichtbares UI-Redesign**: Vault-Seitenleiste mit solidem Primary-Pill für den aktiven Eintrag; Host-Grid-Karten mit Primary-Kante, Anheben und Glow beim Hover; stärkerer Kontrast zwischen Bühne und Sidebar; Einstellungsnavigation mit solidem Primary; Vault/SFTP-Tabs mit Primary-Unterlinie; Abschnittsüberschriften als kompakte Großbuchstaben mit Icon-Chips

## [0.5.11] - 2026-07-20

### Verbesserungen
- **Themenorientierte Client-UI-Auffrischung**: Shell-Chrome, Vault-Seitenleiste/Bühne, Einstellungsfenster und gemeinsame UI-Primitives folgen dem aktiven Thema klarer — Primärakzent-Navigation, Glas-Overlays, weichere Elevation sowie verfeinerter Fokus und Tiefe bei Buttons, Eingaben, Dialogen, Tabs, Schaltern, Leerzuständen und Seitenpanels

## [0.5.10] - 2026-07-19

### Fehlerbehebungen
- **„Neuigkeiten“-Dialog-Overlay zu dunkel**: der „Neuigkeiten“-Dialog verdunkelte das Einstellungen-Fenster so stark, dass die linke Navigation kaum lesbar war; Deckkraft und Unschärfe des Overlays dieses Dialogs sind jetzt reduziert, sodass die Navigation dahinter lesbar bleibt (betrifft nur diesen Dialog)

## [0.5.9] - 2026-07-19

### Fehlerbehebungen
- **Dialog ließ sich nicht schließen**: im Einstellungen-Fenster geöffnete Dialoge (z. B. das „Neuigkeiten“-Changelog) ließen sich nicht schließen — das X oben rechts überlappte die Titelleisten-Drag-Region, sodass Klicks als Fensterziehen interpretiert wurden. Alle Dialoge sind jetzt von der Drag-Region ausgenommen und das X schließt zuverlässig

## [0.5.8] - 2026-07-19

### Sicherheit
- **Härtung des lokalen Datei-IPC**: die IPC-Handler zum Lesen/Schreiben/Löschen/Auflisten lokaler Dateien prüfen nun den Sender des aufrufenden Renderers und lehnen Webview-/Gast-Kontexte ab, sodass ein Renderer-XSS nicht zu beliebigem lokalem Dateizugriff eskalieren kann (Defense-in-Depth)
- **Härtung der Abhängigkeiten**: alle hochkritischen Advisories im Produktions-Abhängigkeitsbaum behoben: fast-uri → 4.1.1, fast-xml-parser → 5.10.1, fast-xml-builder → 1.3.0, hono → 4.12.31; sowie, beschränkt auf den @cursor/sdk-Teilbaum, node-gyp → 11.4.2 und tar → 7.5.20 (eingegrenzt, sodass native Builds unberührt bleiben)

## [0.5.7] - 2026-07-18

### Funktionen
- **Anonyme Absturzberichte (Opt-in)**: standardmäßig aus; nach Aktivierung unter Einstellungen → System werden bereinigte Absturzzusammenfassungen (ohne Pfade, Benutzernamen, Hostnamen oder Sitzungsdaten) gesendet, um Abstürze schneller zu beheben

## [0.5.6] - 2026-07-18

### Sicherheit
- **Verschlüsselter HTTP-Inventory-Auth-Header**: Der Auth-Header (Authorization / API-Key) für json_http-Datenquellen wird nicht mehr im Klartext gespeichert, sondern feldweise im Vault verschlüsselt; vorhandene Klartextwerte werden beim ersten Start nach dem Update migriert
- **Dependency-Härtung**: undici → 6.27.0, DOMPurify → 3.4.12, uuid → 13.0.2 schließen erreichbare XSS- und Request-Smuggling-/DoS-Advisories, die die veralteten Overrides noch trafen

## [0.5.5] - 2026-07-18

### Korrekturen
- **Falsche „Update fehlgeschlagen“-Meldungen**: Check-Phasen-Fehler gelten nicht mehr als Download-Fehler; In-Flight-Status nach jedem IPC-Check zurücksetzen
- **Windows-arm64-Update-Kanal**: `latest-arm64.yml` nutzen, damit keine x64-Installer geladen werden
- **Zuverlässigerer Update-Pfad**: Dual-Feed und UI-Zustandsmaschine reduzieren Fehler durch parallele Checks

## [0.5.4] - 2026-07-18

### Sicherheit
- **Vault-Entsperrgrenze**: Deaktivieren/PIN ändern und WebAuthn erfordern Freischaltung oder aktuelle PIN; PIN-Ratenlimit
- **SSH-Diagnose/Health**: Abbruch vor Auth bei unknown/changed Host-Key, damit Passwörter nicht an MITM gehen
- **Session-Follow**: AES-GCM-E2E mit Invite-Token; opaker Relay; kein gefälschtes wss/ws-TLS
- **Credential-IPC**: Sender-Prüfung bei Vault-Unlock und Encrypt/Decrypt
- **Temp / RDP / Deeplinks / Logs / AI-Anhänge**: 0700+symlink-sicher, sofortige cmdkey-Bereinigung bei RDP-Startfehler, Telnet/JMS-Bestätigung, keine kbd-int-Antwortlogs, Anhangsgrößenlimits

### Korrekturen
- Health-Keyboard-Interactive; scrollbare Versionshinweise
- AI nur-Anhänge senden; SFTP/Portforward übergeben verifyHostKeys korrekt

### Engineering
- `npm run typecheck` hinzugefügt; erste Charge Produktions-Typfehler (Vault/WebAuthn/Update/SFTP) behoben

## [0.5.3] - 2026-07-18

### Korrekturen
- **Versionshinweise-Dialog scrollbar**: lange Hinweise können im Dialog-Viewport gescrollt werden

### Verbesserungen
- Zähltext der aktuellen Version korrigiert; fehlende „Neuerungen“-Texte für alle 10 UI-Sprachen ergänzt

## [0.5.2] - 2026-07-18

### Funktionen
- **Local-first Team-Vault**: nur Metadaten-Hostinventarpakete, Rollen (owner/editor/viewer) und HMAC-signiertes Audit; Passwörter und private Schlüssel verlassen das Gerät nicht
- **Session-Follow über WAN-Relay**: TCP-NDJSON-Relay für NAT-freundliches Mitverfolgen; eingebettetes lokales Relay oder selbst gehostetes `scripts/follow-relay.cjs`
- **Geräte-Passkey zum Vault-Entsperren**: WebAuthn-Plattform-Authentifikatoren (Touch ID / Windows Hello / Security Key) im Hauptprozess geprüft; kein Cloud-Multi-Geräte-Sync
- **Eingebaute ssh2-Hybrid-PQ-KEX**: bevorzugt `mlkem768x25519-sha256`, fällt bei Nichtunterstützung auf klassische Algorithmen zurück
- **RDP-Host-Unterstützung**: System-Remotedesktop aus dem Vault starten (Windows mstsc, macOS Windows App, Linux xfreerdp)
- **System-OpenSSH Jump und Proxy**: Jump-Ketten und HTTP/SOCKS-Proxys für System-OpenSSH-Sitzungen

### Verbesserungen
- **Globale UI-Komponenten-Aktualisierung**: einheitliche Radien, weiche Schatten und Fokusringe für Buttons, Eingaben, Popovers, Seitenpanels, Leerzustände und Toasts
- **AI-Seitenleiste verfeinert**: Q&A-Layout, Modell-/Berechtigungskontrollen, quadratischer Denk-Spinner und Eingabetypografie
- **Changelog-Dialog neu gestaltet**: einklappbare Versionen, Abschnittsfarben und sprachabhängige Release Notes

## [0.5.0] - 2026-07-17

### Funktionen
- **Hex/Raw-Stream-Diagnosepanel für das Terminal**: optional aktivierbar, zeigt die rohen Ein-/Ausgaben der Sitzung Byte für Byte — hilfreich bei Encoding-/Escape-Sequenz-Problemen
- **JSON-Hostquelle**: Host-Inventare aus lokaler JSON-Datei oder HTTP(S)-Endpunkt beziehen (CMDB / Ansible / eigener API-Stil); nur Metadaten, Inventare mit Geheimnissen werden abgelehnt; HTTP-Auth-Header unterstützt
- **Host-Inventar teilen und importieren**: Export von Inventaren nur mit Metadaten für die Teamübergabe (inkl. Ansible-YAML-Format), Import aus der Zwischenablage
- **Benannte Workspace-Vorlagen**: Host-Zuordnungen, Split-Layouts und optionale cwd/Startbefehle als Vorlage speichern, per Schnellumschalter mit einem Klick anwenden
- **Lesezeichen für Verbindungsprotokolle**: Wiedergabepositions-Lesezeichen + Notizen + Suchsprünge; die Protokollliste zeigt die Anzahl der Lesezeichen
- **Live-Kanalansicht der Portweiterleitung**: Quelle, Ziel und Traffic-Bytes pro Verbindung für lokale/entfernte/dynamische Weiterleitungen
- **Erweiterte onOutput-Trigger-Aktionen für Skripte**: bei Treffern im Ausgabemuster wahlweise Desktop-Benachrichtigung, Signalton, Tab-Markierung oder Start der Sitzungsaufzeichnung
- **Sicheres Einfügen und präziser Broadcast**: Verzögerung beim mehrzeiligen Einfügen / Warten auf Prompt / Bestätigung gefährlicher Befehle; Broadcast gezielt an Workspace/Auswahl/Gruppe/Fenster
- **Verbesserte System-OpenSSH-Kanäle**: GSSAPI/Kerberos und Post-Quanten-Algorithmen (PQ) über das System-OpenSSH unterstützt; Jump-Ketten und HTTP/SOCKS-Proxys verfügbar
- **Eingebauter ssh2-Hybrid-Post-Quanten-KEX**: bevorzugt `mlkem768x25519-sha256` (ML-KEM-768 + X25519) mit klassischem Fallback; kein System-ssh erforderlich
- **RDP-Host-Unterstützung**: RDP für Vault-Hosts aktivieren und den System-Remotedesktop-Client starten (Windows mstsc, macOS Windows App, Linux xfreerdp)
- **Änderungsprotokoll folgt der UI-Sprache**: In-App-Release-Notes in der aktuellen UI-Sprache (10 Sprachen)

### Windows ARM64
- **win-arm64-Installer bündeln jetzt mosh / ET**: MoshMagies 0.1.9 und EternalTerminal 6.2.10 erstmals als native Windows-arm64-Binaries
- **Eigener Auto-Update-Feed für win-arm64**: Update-Metadaten laufen über den dedizierten Kanal `latest-arm64.yml` statt dem x64-Update zu folgen (zuvor installierten arm64-Updates das x64-Paket und liefen in Emulation)

## [0.4.10] - 2026-07-17

### Funktionen
- **SSH-Verbindungsdiagnosezentrum**: „Verbindung testen" im Host-Bearbeitungspanel + „Diagnose ausführen" bei Verbindungsfehlern, mit schrittweisen Prüfungen für DNS / TCP / Jump-Host / Hostschlüssel / Auth / SFTP
- **SSH-Agent als erstklassige Authentifizierung**: Hosts können Agent-Auth explizit wählen, Schlüssel-Fingerprints im Agent einsehen und eine bevorzugte Identität festlegen; das Verbindungsprotokoll hält die tatsächlich genutzte Methode fest
- **Multi-Host-Gesundheitsübersicht**: per Klick Latenz, Auth und Last/Speicher/Festplatte aller Hosts aus dem Vault prüfen, auffällige Hosts filtern und Skripte ausführen
- **SFTP-Zuverlässigkeit Phase 1**: fortsetzbare Übertragungen, automatische Backoff-Wiederholungen, persistente Übertragungswarteschlange (übersteht Neustarts), optionale SHA-256-Prüfung
- **Produktisierungs-Onboarding**: dreistufige Anleitung beim ersten leeren Vault; Befehlseinträge im Schnellumschalter (Einstellungen/Import/Gesundheitscheck usw.); Migrationshinweise im Leerzustand; Tipps nach der ersten erfolgreichen Verbindung; README-Funktionsmatrix

### Fehlerbehebungen
- Nutzer, die einen bestehenden Vault aktualisieren, sehen die Ersteinrichtung nicht mehr; Gesundheitschecks schließen Jump-Verbindungen bei Auth-Fehlern jetzt korrekt

## [0.4.9] - 2026-07-17

### Verbesserungen
- **Releases und Auto-Update-Feed in ein eigenes Release-Repository umgezogen**: Installer und Update-Metadaten erscheinen jetzt im Repository MgTerminal-releases; Website-Downloads und In-App-Updates bleiben unverändert, ältere Clients erhalten Updates weiterhin über Weiterleitungen der ursprünglichen URLs

## [0.4.8] - 2026-07-16

### Funktionen
- **Schnellverbindung unterstützt EternalTerminal**: der QuickConnect-Assistent erhält einen ET-Protokolleintrag (SSH-Port + ET-Dienstport, Standard 2022); passende ET-Client-Binaries sind gebündelt (macOS / Linux / Windows x64)
- **Selbsttest für Anmeldedaten**: Einstellungen → System → Anmeldedatenschutz erhält einen „Selbsttest" — eine Ver-/Entschlüsselungs-Roundtrip-Probe plus Scan des Anmeldedatenspeichers, der genau die Einträge auflistet, die dieses Gerät nicht entschlüsseln kann (Hosts / Schlüssel / Identitäten / Gruppen / Proxys) — praktisch, um nach einem Schlüsselbund-Ausfall neu einzugebende Daten zu finden
- **Erster Windows-ARM64-Installer**: neuer win-arm64-Build (mosh / et noch nicht gebündelt; Auto-Update folgt vorerst dem x64-Feed)
- **Ablaufbereinigung der Sitzungswiederherstellung**: Wiederherstellungslayouts, die älter als 14 Tage sind, werden beim Start verworfen statt massenhaft veraltete Platzhalter wiederherzustellen

### Fehlerbehebungen
- **Russische Oberfläche: 203 fehlende Texte ergänzt** (der gesamte Namensraum Skripte / Automatisierung / Aufzeichnung fiel zuvor auf Englisch zurück), plus 3 für vereinfachtes Chinesisch; ein neuer Voll-Paritätstest verhindert Regressionen
- Der benutzerdefinierte mosh-server-Pfad der Mosh-Schnellverbindung wurde zuvor nur erfasst, aber nicht angewendet; er wird jetzt korrekt in die Hostkonfiguration geschrieben

### Verbesserungen
- SFTP-Alles-auswählen (Cmd/Strg+A) und Listendarstellung teilen jetzt eine einzige Sichtbarkeitsregel und driften bei versteckten Dateien / Filterbegriffen nicht mehr auseinander
- Die macOS-Hinweise im README entsprechen jetzt dem tatsächlichen Release-Verfahren (unsigniert, mit Gatekeeper-Freigabeschritten; In-App-Updates unberührt)

## [0.4.7] - 2026-07-15

### Funktionen
- **Oberflächensprachen auf 10 erweitert**: Client und Website angeglichen; neu sind 日本語 / 한국어 / Deutsch / Français / Español / Português (bestehende en / ru / zh-CN / zh-TW bleiben)
- Einstellungen → Erscheinungsbild → Sprache bietet alle unterstützten Sprachen; unübersetzte Texte fallen weiterhin auf Englisch zurück

## [0.4.6] - 2026-07-15

### Sicherheit
- **Deaktivierte SSH-Hostschlüsselprüfung ist nicht mehr stumm**: bei ausgeschaltetem `verifyHostKeys` (Terminalsitzungen und mosh-Statistikverbindungen) wird eine deutliche Warnung protokolliert, dass beliebige Hostschlüssel ohne Rückfrage akzeptiert werden
- **Dauerhafter Warnhinweis in den Einstellungen**: nach dem Abschalten von „SSH-Hostschlüssel prüfen" bleibt unter dem Schalter ein Hinweis auf das Man-in-the-Middle-Risiko sichtbar (en / zh-CN / zh-TW). Standard bleibt an

## [0.4.5] - 2026-07-15

### Fehlerbehebungen
- **401 / leere Streams durch verschachtelten Geheimtext**: wiederholtes Speichern während eines Schlüsselbund-Ausfalls verschlüsselte Schlüssel mehrfach (`enc:v2(enc:v1(...))`); nach Korrektur der Entschleifengrenze werden Mehrfachverschachtelungen im Rahmen vollständig entschlüsselt — kein „korrekt entschlüsselt und dann verworfen" und keine falschen Entschlüsselungsfehler mehr
- **Ein einzelner defekter Eintrag legt nicht mehr den ganzen Anmeldedatenspeicher lahm**: bei Entschlüsselungsfehlern eines Feldes bleibt der gespeicherte Wert erhalten (fail-soft), der Speicher lädt normal und Schlüssel sind nach Reparatur des Schlüsselbunds wiederherstellbar
- **Websuche-API-Schlüssel**: nach einem Entschlüsselungsfehler löscht bloßes Fokussieren/Defokussieren keinen gespeicherten Schlüssel mehr; deutliche Hinweise bei Ent-/Verschlüsselungsfehlern statt Stille
- **Windows-DPAPI-Geheimtexterkennung korrigiert**: der Schutz gegen Doppelverschlüsselung übersah zuvor DPAPI-Schlüssel (`AQAAAN`-Header), sodass ein Schlüsselbund-Ausfall sie in verschachtelten Geheimtext verwandelte; jetzt behoben
- **Cursor Agent**: bei Entschlüsselungsfehlern wird kein Geheimtext mehr als API-Schlüssel in den Kindprozess injiziert
- Vereinheitlicht über Provider / Websuche / Cursor in den Einstellungen: Entschlüsselungsfehler fordern jetzt klar zur Neueingabe auf, und ein Wechsel der Oberflächensprache überschreibt keinen ungespeicherten Schlüssel mehr

## [0.4.4] - 2026-07-14

### Fehlerbehebungen
- **KI 401 / leere Streams**: wenn die API-Schlüssel-Entschlüsselung fehlschlägt oder der Schlüssel nicht zum Hauptprozess synchronisiert ist, gehen Anfragen nicht mehr mit dem Platzhalter `__IPC_SECURED__` an Anbieter; stattdessen sofortiger Fehler mit Aufforderung zum erneuten Speichern
- Vor dem Senden wird auf die Synchronisierung der Provider zum Hauptprozess gewartet, um racebedingte Auth-Fehler zu vermeiden
- Klare Auth-Hinweise, wenn der lokale Schlüssel unbrauchbar ist (Entschlüsselungsfehler / fehlt / Platzhalterrest)

## [0.4.3] - 2026-07-14

### Fehlerbehebungen
- **API-Schlüssel-Entschlüsselung**: der Hauptprozess entschlüsselt `enc:v2`-Schlüssel des lokalen Tresors jetzt korrekt; bei Fehlern wird Geheimtext nicht mehr als Klartext an Anbieter gesendet (vermeidet 401 und das Suffix `…5Q==`)
- **Erkennung von Anmeldedaten-Platzhaltern**: Verbindungsgrenzen / Cloud-Sync-Wächter erkennen jetzt ebenfalls `enc:v2` und verhindern, dass Tresor-Geheimtext als Passwort gesendet oder in die Synchronisierung hochgeladen wird
- Umsetzbare Fehlermeldungen bei leeren Modell-Streams (`NoOutputGeneratedError`) und 401-Auth-Fehlern
- Die Erkennung der Cursor-SDK-Installation nutzt jetzt `require.resolve` und meldet nicht mehr fälschlich „nicht installiert"

## [0.4.2] - 2026-07-14

### Fehlerbehebungen
- **API-Schlüssel-Verschlüsselungsfehler endgültig gelöst**: ist der Schlüsselbund (safeStorage) nicht verfügbar, wird automatisch ein lokaler verschlüsselter Tresor (`enc:v2`) genutzt; App-Updates machen API-Schlüssel nach Keychain-ACL-Verfall nicht mehr unspeicherbar
- macOS versucht weiterhin zuerst den Systemschlüsselbund und fällt bei Fehlern stumm zurück; Einstellungen → System zeigt das aktive Backend

## [0.4.1] - 2026-07-14

### Verbesserungen
- Themenauswahl: Kartenvorschau (Hintergrund + Primär-/Sekundärfarbe), Umschalter Core / Alle, Suche und Leerzustände
- Standardthemen Snow / Midnight mit mehr Kontrast und Kartentiefe, abgestimmte Terminalfarben `ui-snow` / `ui-midnight`
- Vereinheitlichte Auswahlzustände und Ebenen: Vault-Hosts/-Baum, SFTP-Liste/-Baum/-Tableiste, Einstellungsnavigation, KI-Seitenleiste, Terminal-Kopfleiste
- Terminal-Themenlisten (Dialog / Seitenleiste) mit Suche und klareren Farbfeldvorschauen
- Hartkodierte Farben für Sync-Status, Info-Toasts, Update-Badges, Drag-&-Drop-Hervorhebungen usw. in Theme-Tokens überführt

## [0.4.0] - 2026-07-13

### Funktionen
- Schnellere Downloads und Auto-Updates für Nutzer in China: Region wird automatisch erkannt und auf einen inländischen Spiegel umgeschaltet, mit beidseitigem GitHub-Fallback
- „Neuigkeiten" in den Einstellungen zeigt Versionshinweise jetzt in einem In-App-Dialog statt auf GitHub zu verlinken
- Neuer Eintrag „Support kontaktieren", der die Kontakt-E-Mail kopiert
- SSH-Auto-Reconnect nutzt jetzt exponentielles Backoff (ab 5 s bis 60 s); nach 10 Fehlversuchen in Folge stoppt es und bittet um manuelles Neuverbinden
- Lokale/dynamische Portweiterleitung nutzt die bereits authentifizierte Terminal-SSH-Verbindung wieder und erspart eine zweite Passwort-/2FA-Abfrage
- Beim Import von FIDO2-Sicherheitsschlüsseln (sk-*) wird der Wechsel zur ssh-agent-Authentifizierung vorgeschlagen

### Änderungen
- Die GitHub-Einträge „Problem melden" und „Community" aus den Einstellungen entfernt

## [0.3.0] - 2026-07-13

### Fehlerbehebungen
- Verschlüsselungsfehler des API-Schlüssels beim Speichern eines KI-Anbieters werden nicht mehr stumm verschluckt; unter dem API-Schlüssel-Feld erscheint eine klare lokalisierte Fehlermeldung

## [0.2.9] - 2026-07-13

### Funktionen
- macOS-Auto-Update: Installation per Bundle-Austausch nach dem Download, umgeht Squirrels Beschränkungen für unsignierte Apps (ab 0.2.9 können alle Plattformen automatisch aktualisieren)

### Fehlerbehebungen
- Das App-Symbol behält die abgerundete Grundplatte des offiziellen Materials und wirkt in Hell und Dunkel einheitlich

## [0.2.8] - 2026-07-13

### Fehlerbehebungen
- Windows-Paket beendete sich beim Start stumm: afterPack bettet den Integritätshash nach dem Umschreiben des asar neu ein, mit CI-Prüfung gegen Rückfälle
- Fortschritt und Fehler der Update-Installation sind auf allen Plattformen sichtbar

## [0.2.7] - 2026-07-13

### Fehlerbehebungen
- Windows liefert jetzt einen architektursicheren x64-Installer

## [0.2.6] - 2026-07-12

### Sicherheit
- Das paketierte Tray-Fenster ignoriert `VITE_DEV_SERVER_URL` und blockiert Navigation / neue Fenster
- preload fügt den Dev-Server unter `app.asar` nicht mehr den vertrauenswürdigen Quellen hinzu
- Überschreibende Upgrades auf DOMPurify 3.3.2 und undici 6.23.0 beheben erreichbares XSS / Dekomprimierungsketten-DoS
- afterPack repariert den ASAR-Integritätshash und synchronisiert Info.plist, um macOS-Abstürze beim Start zu vermeiden

### Fehlerbehebungen
- Der Telnet-Autologin-Integrationstest wartet jetzt auf den Kommandoprompt, bevor er das Abschlussereignis prüft

## [0.2.5] - 2026-07-12

### Fehlerbehebungen
- Der Eintrag „GitHub-Quellcode" im Community-Bereich der Einstellungen ist ausgeblendet
- „Neuigkeiten"-/Fehlermeldelinks zeigen auf `JasonZhangDad/MgTerminal` und beheben 404-Fehler
- „Jetzt neu starten" reagierte nicht: das Beenden zur Update-Installation wird nicht mehr von der asynchronen Dirty-Prüfung in before-quit abgebrochen
- „Neu starten und aktualisieren" zeigt bei Fehlern eine klare Meldung; Plattformen ohne Auto-Installation öffnen automatisch die Releases-Seite

## [0.2.4] - 2026-07-12

### Sicherheit
- Ist die Verschlüsselung der Anmeldedaten nicht verfügbar, wird das Speichern gestoppt; Rückfall auf Klartext ist verboten
- SSH-Deeplinks sind standardmäßig aus, URLs mit Passwörtern werden abgelehnt, Verbindungen erfordern eine Bestätigung
- OSC52-Zwischenablage ist standardmäßig aus
- Electron-CSP verschärft, ASAR-Integrität und Sicherheits-Fuses aktiviert
- macOS-Berechtigung disable-library-validation entfernt

## [0.2.3] - 2026-07-11

### Fehlerbehebungen
- Behoben: der paketierte `app://`-Hostname wurde von Chromium kleingeschrieben, worauf preload die Injektion der Electron-Bridge verweigerte und Terminal, SFTP, Einstellungen, Dateiauswahl und Portweiterleitung ausfielen
- Einheitliche Erkennung von `app://magiesterminal` in Hauptfenster, Einstellungsfenster und App-Berechtigungsprüfungen stellt Zwischenablage- und lokale Schriftberechtigungen wieder her

## [0.2.2] - 2026-07-11

### Fehlerbehebungen
- Hostdetails „Select Color Theme": verschachtelte ScrollAreas machten Themenklicks wirkungslos; jetzt einlagiges Scrollen mit pointerdown-Auswahl
- SSH-Schlüssel-/lokale Schlüsseldatei-Dialoge waren nicht ans Elternfenster gebunden, sodass macOS sie nicht anzeigen konnte
- Das Einstellungsfenster ließ sich unter dem `app://`-Protokoll nicht öffnen
- Seitenleisten- und Installer-App-Symbole nutzen die neuen Symbolressourcen

## [0.2.1] - 2026-07-11

### CI/CD
- Automatisierte macOS- und Windows-Builds reaktiviert (unsignierter Modus) und damit sofort nutzbare Pakete für mehr Plattformen.

## [0.2.0] - 2026-07-11

### Funktionen
- Auto-Update-IPC-Ereignisse gingen nur an ein Fenster; jetzt Broadcast an alle Fenster (Haupt- und Einstellungsfenster empfangen beide)
- Zustandsautomaten für manuelle Updateprüfung und Auto-Update vereinheitlicht, drei parallele Zustände beseitigt
- Die manuelle „Nach Updates suchen"-Funktion erkennt Versionen über die GitHub-API und stößt bei Funden asynchron den electron-updater-Download an
- Nach Klick auf „Nach Updates suchen" im Einstellungsfenster erscheint der Downloadfortschritt live in der UI
- Die App löst 5 Sekunden nach dem Start automatisch eine `electron-updater`-Prüfung aus, ohne manuellen Klick
- Bei neuer Version startet der Download automatisch (`autoDownload=true`)
- Nach Abschluss des Downloads erscheint ein persistenter Toast; „Jetzt neu starten" installiert
- Bei Downloadfehlern erscheint ein Fehler-Toast mit „Releases öffnen" als Ausweich
- Der Fortschrittsbalken unter Settings > System zeigt den Auto-Download live, einheitlich getrieben von `useUpdateCheck`
- Linux deb/rpm/snap und andere von electron-updater nicht unterstützte Plattformen werden übersprungen und behalten das GitHub-API-Benachrichtigungsverhalten

### Designnotizen
- `broadcastToAllWindows` ersetzt das Einzelziel `getSenderWindow` und garantiert, dass jedes Fenster IPC-Ereignisse erhält
- Das Feld `manualCheckStatus` verfolgt den UI-Zustand der manuellen Prüfung (idle/checking/available/up-to-date/error) und wird in der UI nach Priorität neben `autoDownloadStatus` gerendert
- `SettingsSystemTab` hält keinen lokalen Update-Zustand mehr, sondern empfängt die vereinheitlichten `useUpdateCheck`-Daten unidirektional
- Die beiden zuvor unabhängigen Systeme (GitHub-API-Benachrichtigung + manueller electron-updater-Download) verschmelzen zu einem Zustandsautomaten: `useUpdateCheck` ist die einzige Wahrheitsquelle und treibt sowohl den `App.tsx`-Toast als auch den Fortschrittsbalken in `SettingsSystemTab`
- Globale persistente IPC-Listener werden einmalig in `autoUpdateBridge.init()` registriert, statt sie pro manueller Downloadanfrage neu zu registrieren/aufzuräumen
- `autoInstallOnAppQuit=false`: keine stille Installation, der Neustart wird vom Nutzer ausgelöst

### Schnittstellenänderungen（SettingsSystemTabProps）
- Entfernt: `autoDownloadStatus`, `downloadPercent`
- Neu: `updateState` (vollständiger UpdateState), `checkNow`, `installUpdate`, `openReleasePage`

### Hinweise
- Semantik von `checkNow`: erkennt neue Versionen über die GitHub-API (`performCheck`); gibt es ein Update und hat electron-updater den Download noch nicht begonnen, wird asynchron `bridge.checkForUpdate()` ausgelöst und der Auto-Download-Ablauf gestartet
- Diese Funktion wirkt nur in paketierten Apps (Windows NSIS, macOS dmg/zip, Linux AppImage); der Dev-Modus braucht `forceDevUpdateConfig=true` + `dev-app-update.yml` zum Testen (siehe `.gitignore`)
- Der alte `hasUpdate`-Toast wird unterdrückt, solange `autoDownloadStatus !== 'idle'`, um Dopplungen mit dem neuen Toast zu vermeiden

### CI-/Build-Verbesserungen
- macOS-/Windows-Builds übersprungen (kostenpflichtige Codesignaturzertifikate nötig), Fokus auf freie Linux-Pakete
- Compiler-Upgrade Linux x64 (AlmaLinux 8): bevorzugt Clang, Fallback gcc-toolset-13
- Compiler-Upgrade Linux arm64 (Debian Bullseye): von `build-essential` auf `clang-14 + lld-14`
- Der Release-Job hängt nicht mehr an macOS-/Windows-Builds; Tag-Pushes veröffentlichen Releases direkt aus Linux-Artefakten
- Aufgeweichte deb-Artefaktprüfung: fehlende Dateien erzeugen eine Warnung statt eines Fehlers, damit Plattform-Skips die CI nicht scheitern lassen
