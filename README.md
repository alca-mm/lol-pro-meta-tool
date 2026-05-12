# LoL Pro Meta Tool

Internes Werkzeug zur Draft-Vorbereitung auf Basis von Pro-Play-Matchdaten.

---

## Datenquelle

**Oracle's Elixir** stellt öffentlich zugängliche Pro-Play-CSV-Dateien bereit:  
https://oracleselixir.com/tools/downloads

Die CSV-Dateien werden über einen öffentlichen Google-Drive-Ordner zum Download angeboten:  
https://drive.google.com/drive/u/0/folders/1gLSw0RLjBbtaNy0dgnGQDAZOHIgCe-HH

### Warum kein automatisches Crawling des Ordners?

Der Google-Drive-Ordner wird nicht automatisch gecrawlt oder gescraped:
- Kein HTML-Scraping von Google Drive
- Keine Google Drive API und keine API-Keys
- Stabile, transparente Konfiguration über explizite File-IDs
- Kontrollierbar: Der Nutzer entscheidet, welche Dateien importiert werden

---

## Daten eintragen

### Schritt-für-Schritt: Google-Drive-File-ID übernehmen

1. Öffne den Oracle's Elixir Google-Drive-Ordner:  
   https://drive.google.com/drive/u/0/folders/1gLSw0RLjBbtaNy0dgnGQDAZOHIgCe-HH

2. Klicke mit der rechten Maustaste auf eine CSV-Datei → „Link kopieren" oder „Teilen"

3. Die URL sieht so aus:  
   `https://drive.google.com/file/d/`**`FILE_ID_HIER`**`/view`

4. Kopiere den Teil zwischen `/d/` und `/view` — das ist die File-ID

5. Öffne `scripts/dataSources.ts` und trage die ID ein:

```typescript
{
  id: "oracles-elixir-2024",
  googleDriveFileId: "DEINE_FILE_ID_HIER", // ← hier eintragen
  enabled: true,                            // ← auf true setzen
  ...
}
```

6. Führe den Sync aus: `npm run sync:data`

---

## Daten synchronisieren

```bash
npm run sync:data
```

Der Befehl:
1. Liest die aktivierten Quellen aus `scripts/dataSources.ts`
2. Lädt die CSV-Dateien von Google Drive herunter
3. Speichert Rohdaten in `data/raw/`
4. Parst und konvertiert die CSV ins interne Match-Format
5. Schreibt validierte Matches nach `src/data/importedMatches.json`
6. Schreibt einen Sync-Report nach `data/reports/latest-sync-report.json`
7. Gibt eine Zusammenfassung in der Konsole aus

Wenn keine aktive Quelle konfiguriert ist, gibt der Befehl eine erklärende Meldung aus und beendet sich sauber.

### Bekannte Google-Drive-Einschränkungen

- Bei **öffentlich freigegebenen** Dateien funktioniert der Download direkt
- Bei **großen Dateien** kann Google Drive eine HTML-Bestätigungsseite statt der CSV zurückgeben → der Sync erkennt das und gibt eine klare Fehlermeldung aus
- In diesem Fall: CSV manuell herunterladen und in `data/raw/` ablegen, dann lokal importieren (zukünftiges Feature)
- Keine Authentifizierung, keine Secrets, keine API-Keys — nur öffentliche Downloads

---

## App starten

```bash
npm install   # einmalig
npm run dev   # Dev-Server auf http://localhost:5173
```

### Datenquelle in der UI

- **„Sample-Daten aktiv"** → `src/data/importedMatches.json` ist leer; Demo-Daten werden verwendet
- **„Synchronisierte Pro-Play-Daten aktiv"** → importierte Daten sind aktiv; Anzahl Matches, Zeitraum, Patches und Regionen werden angezeigt

Die App wählt automatisch die beste verfügbare Datenquelle.

---

## Weitere Befehle

```bash
npm test            # Vitest Tests (95 Tests)
npm run build       # Produktions-Build
npm run preview     # Build lokal vorschauen
npm run sync:data   # Oracle's Elixir CSV-Daten synchronisieren
```

---

## Analysen

### Champion-Statistiken
Pickrate, Banrate, Presence, Winrate, Rollenverteilung — sortierbar nach allen Spalten. Klick auf eine Zeile öffnet das Champion-Detail.

### Draft Priority Score

```
draftPriorityScore = presence × 0.5 + banRate × 0.2 + pickRate × 0.2 + winRateComponent × 0.1
```

- `winRateComponent` = tatsächliche Winrate, wenn picks ≥ 5 und winRate ≠ null
- Sonst: 0.5 (neutrale Annahme bei kleinen Samples)
- Intern 0–1, in der Champion-Tabelle sortierbar

### Synergien
Top Champion-Synergien nach Synergy Score = winRate × log(1 + spiele).

### Matchups (rollenagnostisch)
Alle Champion-vs-Champion-Matchups, unabhängig von der Rolle.

### Matchups nach Rolle (role-specific)
Nur Matchups zwischen Champions in derselben Rolle:
- Top vs. Top, Jungle vs. Jungle, Mid vs. Mid, Bot vs. Bot, Support vs. Support

### Champion-Stats nach Rolle
Gleicher Champion auf verschiedenen Rollen wird getrennt ausgewertet (z.B. Garen Top vs. Garen Mid).

### Patch-Vergleich
Zwei Patches auswählbar, zeigt Δ Presence, Δ Pickrate, Δ Banrate pro Champion.

---

## Speicherorte

```
data/raw/                     # Heruntergeladene Roh-CSV-Dateien
data/reports/                 # Sync-Berichte (latest-sync-report.json)
src/data/importedMatches.json # Konvertierte Matches (von sync:data überschrieben)
src/data/sampleMatches.json   # Fiktive Demo-Daten (immer vorhanden)
scripts/dataSources.ts        # Konfiguration der Datenquellen
```

---

## Sicherheitsregeln

- Keine SoloQ-, FlexQ- oder Ranked-Daten — ausschließlich Pro-Play
- Kein gol.gg-Scraping
- Kein HTML-Scraping von Google Drive
- Keine Google API Keys, keine Authentifizierung, keine Secrets
- Kein Backend-Server, keine Datenbank

---

## Bekannte Einschränkungen (MVP)

- Nur Demo-Daten ohne aktive Quelle
- Kein Import-UI für Drag & Drop (nächster sinnvoller Schritt)
- Filter-State wird bei Reload zurückgesetzt (kein localStorage)
- Patch-Vergleich zeigt max. 30 Champions
- Matchup-Berechnung (rollenagnostisch) berücksichtigt keine Rollen
- Role-Filter in der Champion-Tabelle basiert auf Haupt-Rolle (häufigste gespielte Rolle)

## Nächste sinnvolle Schritte

1. Import-UI: eigene CSV per Drag & Drop laden
2. localStorage-Persistenz für Filter-State
3. Patch-Vergleich: mehr als 30 Champions anzeigen
4. Export-Funktion (CSV)
