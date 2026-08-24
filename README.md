# Aatroxtool

Draft- und Scout-Werkzeug für League of Legends, gebaut für die Vorbereitung von Pro- und
Team-Spielen: Meta-Analyse auf Pro-Play-Daten, ein Draft-Cockpit mit gewichteten Empfehlungen und
ein Tournament Scout, mit dem man einen Gegner vor dem Match durchgeht.

Live: <https://aatroxtool.de/>

Der Leitgedanke ist Kontrolle statt Automatik. Das Tool rechnet nur mit Zahlen, die entweder aus
einer offen genannten Datenquelle stammen oder die du selbst eingetragen hast. Es liest keine
fremden Webseiten aus, es rät keine fehlenden Werte, und wo eine Aussage auf einer dünnen
Stichprobe steht, sagt es das dazu.

Aktueller Stand: **0.7.0**.

---

## Inhalt

- [Die Bereiche im Überblick](#die-bereiche-im-überblick)
- [Meta-Analyse](#meta-analyse)
- [Draft Helper](#draft-helper)
- [Tournament Scout](#tournament-scout)
- [Team-Dashboard und Player Results](#team-dashboard-und-player-results)
- [Was lokal bleibt, was ein Backend braucht](#was-lokal-bleibt-was-ein-backend-braucht)
- [Was bewusst nicht passiert](#was-bewusst-nicht-passiert)
- [Setup](#setup)
- [Scripts](#scripts)
- [Tests und Typechecks](#tests-und-typechecks)
- [Build und Deployment](#build-und-deployment)
- [Architekturgrenzen](#architekturgrenzen)
- [Bekannte Grenzen](#bekannte-grenzen)
- [Mitarbeit](#mitarbeit)

---

## Die Bereiche im Überblick

Die App ist eine Single-Page-App mit neun Tabs und ohne Router. Es gibt also keine teilbaren Links
auf einen einzelnen Bereich.

| Tab | Kurz | Braucht Login? |
| --- | --- | --- |
| Champions | Champion-Statistiken mit Draft-Priorität und Aussagekraft | nein |
| Draft Helper | Draft-Cockpit mit Empfehlungen, Gewichtungen, Comp-Report | nein (Speichern ja) |
| Turnier Scout | Gegnervorbereitung und Ban-Plan aus eigenen Eingaben | nein |
| Team Dashboard | Teams, Mitglieder, Notizen, gespeicherte Drafts | ja |
| Player Results | Ranked-Auswertung verknüpfter Riot-Accounts | ja |
| Synergien | Champion-Paare, die zusammen gut abschneiden | nein |
| Matchups | Champion gegen Champion, rollenagnostisch | nein |
| Rollen | Statistiken und Matchups je Lane | nein |
| Patches | Vergleich zweier Patches | nein |

Oberfläche und Inhalte gibt es auf Deutsch und Englisch, umschaltbar im Kopf. Zahlen und Daten
werden in der jeweiligen Sprache formatiert.

---

## Meta-Analyse

Grundlage sind öffentliche Pro-Play-CSVs von [Oracle's Elixir](https://oracleselixir.com/tools/downloads),
die per CI eingelesen und als statische JSON-Datei ausgeliefert werden. Es gibt keine Live-API: Der
Browser lädt einmal einen Datensatz und rechnet alles Weitere lokal.

Der Filter in der Seitenleiste kennt Patch, Region, Turnier, Rolle und eine Mindestzahl an Picks.
Zwei Dinge dazu, die man wissen sollte: Rolle und Mindest-Picks wirken nur auf den Champions-Tab,
und der Filterzustand wird bei einem Reload zurückgesetzt.

Berechnet werden unter anderem:

- **Pickrate, Banrate, Presence, Winrate** je Champion.
- **Draft-Priorität**, eine gewichtete Kennzahl aus Presence, Ban- und Pickrate sowie Winrate. Bei
  weniger als fünf Picks wird die Winrate neutral angesetzt, damit ein Ausreißer die Liste nicht
  anführt.
- **Aussagekraft**, ein Label von "sehr gering" bis "stabilerer Trend", das allein an der
  Stichprobengröße hängt.
- **Synergien** und **Matchups**, jeweils mit einem Score, der die Spielzahl logarithmisch
  einrechnet.
- **Patch-Vergleich** mit Delta für Presence, Pickrate und Banrate.

"Region" ist dabei nicht geografisch gemeint, sondern die Liga aus den Quelldaten. Die
rollenagnostischen Matchups sind Team-Paarungen aus demselben Spiel, kein Lane-Duell: Wer echte
Lane-Duelle sucht, nimmt den Rollen-Tab.

---

## Draft Helper

Das Draft-Cockpit stellt beide Seiten mit fünf Picks und fünf Bans nach und schlägt Champions vor.

- **Empfehlungstabelle** mit Gesamtscore, Priorität, Rollenstärke, Synergie, Matchup, Picks,
  Winrate, Aussagekraft, Team-Pool und ausformulierten Gründen.
- **Sieben Gewichtungsregler** plus fünf Presets, von "Ausgewogen" über "Counterpick" und
  "Synergie" bis "Sicher, hohe Aussagekraft".
- **Patch-Gewichtung** über die sechs jüngsten Patches, ebenfalls mit Presets. Jüngere Patches
  zählen stärker, wie stark genau entscheidest du.
- **Draft-Flow** als optionaler Schalter: Wer ihn einschaltet, bekommt die echte Turnier-Reihenfolge
  aus zwanzig Schritten samt Anzeige, was als Nächstes dran ist. Standard ist die freie Zuordnung.
- **Ban-Empfehlungen**, Empfehlungen je Rolle, Flex-Pick-Erkennung, ein Draft-Edge-Wert und
  ähnliche Drafts aus dem echten Matchpool.
- **Bo5-Serienpanel** mit Fearless-Option, Undo über mehrere Schritte und ein Textexport für die
  Zwischenablage.

Ein **Team-Comp-Report** fasst die Zusammenstellung zusammen: Identität, Kennzahlen, Stärken,
Warnungen und ein Schadensprofil. Wichtig zur Einordnung: Dieser Report ist der einzige Teil des
Cockpits, der **nicht** aus den Matchdaten kommt. Er beruht auf handgepflegten Champion-Listen
(Frontline, Engage, Poke, Dive und so weiter). Champions, die auf keiner dieser Listen stehen,
fallen in eine Unbekannt-Kategorie. Empfehlungen, Draft Edge, Flex-Erkennung und ähnliche Drafts
sind dagegen datengetrieben.

Der Draft-Zustand wird nicht automatisch gespeichert. Ein Reload verwirft das Board, sofern du es
nicht vorher in einem Team ablegst.

---

## Tournament Scout

Der Scout ist für die Vorbereitung auf ein konkretes Gegnerteam gedacht. Er läuft vollständig im
Browser, ohne Login, ohne Backend und ohne API-Key. Er funktioniert auch dann, wenn der
Pro-Play-Datensatz noch lädt oder nicht geladen werden konnte.

Der Arbeitsfluss:

1. **Links oder Riot-IDs einfügen.** Eine Zeile pro Spieler, gemischter Freitext ist erlaubt. Der
   Parser versteht Profil-Links von OP.GG, League of Graphs, DeepLoL und DPM.LOL sowie
   `Name#TAG`-IDs, dazu Rollenwörter (auch `jgl`, `adc`, `supp`) und Regionskürzel in beliebiger
   Reihenfolge.
2. **Aufstellung zuordnen.** Wer auf welcher Lane spielt, wer auf der Bank sitzt. Das ist optional,
   verbessert die Wertung aber deutlich.
3. **Werte eintragen.** Zu jedem Spieler baut der Scout die vier passenden Profil-Links. Du öffnest
   sie, kopierst die Champion-Tabelle und fügst sie im Import-Panel ein. Fünf Paste-Layouts werden
   erkannt, darunter die zeilenweise Roh-Kopie der OP.GG-Championseite. Alternativ tippst du Games,
   Winrate und KDA direkt in die Spielerkarte.
4. **Vorschau prüfen und übernehmen.** Vor dem Speichern siehst du je Zeile, was ankommen würde,
   welche Rolle angewandt wird und welche Zeilen übersprungen wurden. Übernehmen geht wahlweise
   ergänzend oder rollenweise ersetzend.
5. **Ban-Plan lesen und exportieren.** Das Ergebnis kopierst du als fertigen Textblock in die
   Zwischenablage.

Die Wertung berücksichtigt Spielmenge, eine gedämpfte Winrate, den Anteil am erfassten
Champion-Pool, die KDA und die Aktualität der Daten. Kleine Stichproben bremsen sich selbst: 100
Prozent Winrate auf zwei Spielen erreicht nie die Spitze der Liste. Passt ein Signal nicht zur
tatsächlichen Lane, zählt es deutlich weniger und kann strukturell kein sicherer Ban werden.
Champions, die ein Gegner viel spielt und trotzdem verliert, stehen getrennt unter Schwachstellen
und tauchen bewusst nicht im Ban-Plan auf: die will man ausnutzen, nicht bannen.

Jede Empfehlung trägt eine Begründung und eine Aussagekraft von "keine Daten" bis "hoch". Fehlende
Werte bleiben leer und werden als "keine Angabe" gezeigt, niemals als Null.

Gespeichert wird ausschließlich lokal im Browser (`localStorage`). Dort liegen die öffentliche
Riot-ID und das, was du selbst eingetippt hast. Keine E-Mail, keine Account-IDs, keine
Match-Historie.

---

## Team-Dashboard und Player Results

Diese beiden Bereiche sind optional und brauchen ein Supabase-Backend sowie einen Login.

- **Teams** mit Rollen (Owner, Admin, Player) und Einladungscodes.
- **Champion-Notizen**, wahlweise lokal oder geteilt im Team. Nur die Team-Notizen fließen als
  Team-Pool-Gewicht in die Draft-Empfehlungen ein.
- **Gespeicherte Drafts** je Team.
- **Player Results**: verknüpfte Riot-Accounts mit Ranked-Auswertung, Form der letzten Spiele,
  Champion-Tabelle und Match-Historie. Der Abgleich läuft über eine serverseitige Edge Function und
  wird immer per Knopfdruck ausgelöst, nie im Hintergrund.

Ist kein Supabase konfiguriert, wird der Login-Knopf schlicht ausgeblendet. Es bricht nichts, und
alle Bereiche ohne Login bleiben voll benutzbar.

Der Riot-Abgleich des Team-Dashboards hat mit dem Tournament Scout nichts zu tun. Die beiden Teile
teilen keinen Code.

---

## Was lokal bleibt, was ein Backend braucht

| Funktion | Speicherort | Login nötig |
| --- | --- | --- |
| Sprache DE/EN | localStorage | nein |
| Meta-Analyse, Draft-Empfehlungen | nur im Speicher, Daten statisch | nein |
| Tournament Scout | localStorage | nein |
| Champion-Notizen (lokal) | localStorage | nein |
| Champion-Notizen (Team) | Supabase | ja |
| Gespeicherte Drafts | Supabase | ja |
| Teams, Mitglieder, Einladungen | Supabase | ja |
| Riot-Verknüpfung, Ranked-Historie | Supabase plus Edge Function | ja |

---

## Was bewusst nicht passiert

- **Kein Scraping.** Weder OP.GG noch League of Graphs, DeepLoL oder DPM.LOL werden abgerufen. Es
  gibt im Scout-Code keinen einzigen Netzwerkaufruf. Die Statistiken kommen aus Copy und Paste oder
  aus der Handeingabe. Die App erklärt das auch in der Oberfläche selbst.
- **Kein Riot-Auto-Import im Scout.** Es gab ihn kurzzeitig, er wurde bewusst zurückgebaut. Es gibt
  keinen Proxy, keinen Key und keine Reste, auf denen man aufsetzen könnte. Das Tool soll von nichts
  abhängen und eine statisch ausgelieferte SPA bleiben.
- **Kein Auslesen der Zwischenablage.** Du fügst aktiv ein und drückst "Parsen". Kopiert wird nur
  beim Export, und nur auf deinen Klick.
- **Kein Raten.** Fehlt ein Wert, bleibt er leer. Winrates werden nie hochgerechnet, Rollen nie
  stillschweigend aus der Quelle übernommen.
- **Keine Hintergrundsynchronisation.** Jeder Abgleich ist ein Knopfdruck.
- **Keine Secrets im Repo.** Es gibt keine API-Keys im Frontend. Alles unter `VITE_*` landet im
  ausgelieferten Bundle und ist für jeden lesbar, ein Riot-Key hat dort nichts zu suchen.
- **Kein Backend-Zwang.** Supabase ist optional und überall null-sicher behandelt.

---

## Setup

Voraussetzung ist **Node 24**, festgelegt in `.nvmrc` (`engines.node` verlangt `>=24`). Die CI liest
dieselbe Datei, damit lokal und CI nicht auseinanderlaufen.

```bash
nvm use            # optional, liest .nvmrc
npm ci
```

Danach fehlt noch der Datensatz. Er ist rund 81 MB groß und deshalb nicht im Repo. Committed ist nur
eine gepackte Fassung als Fallback, und die App liest zur Laufzeit ausschließlich die entpackte
Datei. Ohne diesen Schritt startet die App mit leerer Datenbasis:

```bash
gzip -dkf public/data/importedMatches.json.gz
```

Alternativ holt `npm run sync:data` die aktuellen CSVs von Oracle's Elixir und baut die Datei neu.
Das braucht Netzzugang und dauert deutlich länger, das Entpacken ist der schnelle Weg.

```bash
npm run dev        # Dev-Server, standardmäßig http://localhost:5173
```

Die optionalen Backend-Funktionen brauchen zwei Umgebungsvariablen in einer lokalen `.env.local`:
`VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY`. Ohne sie läuft die App, nur die Login-abhängigen
Bereiche sind dann inaktiv. Eine `.env.example` gibt es derzeit nicht.

---

## Scripts

| Script | Was es tut |
| --- | --- |
| `npm run dev` | Vite-Dev-Server |
| `npm run build` | Typecheck der App plus Produktions-Build |
| `npm run preview` | Build lokal ansehen |
| `npm test` | Vitest, einmaliger Lauf |
| `npm run typecheck` | Typecheck für `src/` |
| `npm run typecheck:tools` | Typecheck für `scripts/` |
| `npm run typecheck:tests` | Typecheck für `tests/` |
| `npm run typecheck:all` | die drei Typechecks nacheinander |
| `npm run check:dist` | prüft `dist/` gegen die Custom-Domain-Regeln, setzt `npm run build` voraus |
| `npm run sync:data` | lädt die Oracle's-Elixir-CSVs und schreibt `public/data/` |
| `npm run data:pack` | packt den Datensatz neu als `.gz`-Fallback |

---

## Tests und Typechecks

Die vollständige Verifikation vor einem Commit:

```bash
npm ci
npm test
npm run typecheck:all
npm run build
npm run check:dist
```

Stand 0.7.0: **73 Testdateien, 2410 Tests**, alle grün.

Zwei Dinge, die man beim Lesen der Tests wissen muss:

**Vitest läuft in Node**, `test.environment` ist `node`. Es gibt kein jsdom, kein happy-dom und
keine Testing Library. Deshalb existieren keine Render-Tests. Ein großer Teil der UI-Absicherung
sind **Quelltext-Scans**: Sie belegen, dass ein Attribut, ein Übersetzungsschlüssel oder eine
Formatierungsfunktion an der richtigen Stelle im Code steht. Sie belegen nicht, dass etwas
gerendert wird, wie es aussieht oder was ein Screenreader ansagt. Das bleibt manueller Test, und die
Testdateien sagen das an Ort und Stelle auch so.

**Drei Typechecks, weil einer nicht reicht.** `npm run build` prüft nur `src/`. `scripts/` und
`tests/` fallen dabei strukturell durch das Raster, weil `tsx` und Vitest Typen nur entfernen statt
sie zu prüfen. Die Tooling-Config ist zudem bewusst DOM-frei, damit die von den Sync-Skripten
mitgezogenen Module DOM-frei bleiben.

---

## Build und Deployment

Die App wird als statische Seite über GitHub Pages ausgeliefert, unter der eigenen Domain
`aatroxtool.de` am Root. Der Deploy läuft bei Push auf `main` und zusätzlich nächtlich per Cron,
damit die Pro-Play-Daten aktuell bleiben. Schlägt der Datenabgleich fehl, wird der letzte gute Stand
ausgeliefert statt gar keiner.

Weil die Domain am Root liegt, müssen die Asset-Pfade im Build root-relativ sein:

- richtig: `/assets/index-*.js`, `/assets/index-*.css`
- falsch: `/lol-pro-meta-tool/assets/...`
- falsch: `//assets/...`

`npm run check:dist` prüft genau das automatisiert, dazu die Existenz jeder referenzierten
Asset-Datei und den Inhalt von `public/CNAME` und `dist/CNAME`. Der Guard läuft in der CI nach dem
Build und vor dem Upload. Er meldet auch dann einen Fehler, wenn er selbst nicht richtig gestartet
wurde, damit es kein stilles Grün gibt.

`VITE_BASE_PATH` bleibt in der CI absichtlich ungesetzt.

---

## Architekturgrenzen

Vite, React 18 und TypeScript. Kein Router, keine UI-Library, kein Tailwind, eine einzige
CSS-Datei. Navigation läuft über lokalen State.

Ein paar Linien, die absichtlich so verlaufen:

- **Die Draft-Domäne unter `src/draft/` ist keine Oberfläche.** Dort gibt es keine Imports aus `src/i18n/**`.
  Anzeigetexte und Formatierung gehören in die UI-Helfer neben den Komponenten
  (`draftUiHelpers.ts`, `scoutUiHelpers.ts`, `teamUiHelpers.ts`).
- **Locale und Formatierung sind zentral.** `src/i18n/locale.ts` bildet die Sprache auf ein
  BCP-47-Tag ab, `src/i18n/format.ts` ist die einzige Stelle, die Zahlen und Daten formatiert. Ein
  Test wacht darüber, dass niemand sonst eine Locale an `Intl` übergibt.
- **Numerus über Schlüsselpaare, nie über ein Suffix im Code.** Die Auswahlregel steht einmal in
  `src/i18n/plural.ts`.
- **Der Scout-Speicher ist versioniert.** `SCOUT_SCHEMA_VERSION` steht auf 2, und ein unbekannter
  höherer Wert führt zu einem leeren Zustand. Wer das Schema ändert, erhöht die Version **und**
  ergänzt einen Migrationszweig, sonst verlieren bestehende Nutzer ihre Daten.
- **Supabase bleibt optional.** Der Client ist `null`, wenn die Konfiguration fehlt. Jeder Aufrufer
  muss das abfangen.
- **`src/domain/types.ts` ist der zentrale Vertrag** und wird nicht inkompatibel gebrochen.

---

## Bekannte Grenzen

- **Die Übersetzung ist nicht vollständig.** Einige Stellen im Draft-Bereich zeigen weiterhin
  englische Begriffe im deutschen Build, etwa Seitenbezeichnungen und Teile des Comp-Reports.
- **Barrierefreiheit ist auf dem Weg, nicht fertig.** Bis 0.6.3 sind der Empfehlungsschalter als
  Radiogruppe mit Tastaturbedienung, die beschrifteten Aktionsgruppen und der Aufklappbutton der
  Match-Tabelle versorgt. Offen bleiben unter anderem die großen Rollenfilter, ein Umschalter im
  Draft-Flow und Zustände, die noch allein über Farbe transportiert werden.
- **Viele UI-Absicherungen sind Quelltext-Scans**, keine Render- oder Screenreader-Tests. Nach einem
  Deploy bleibt eine manuelle Sichtprüfung nötig.
- **Die Scout-Statistiken bleiben Copy und Paste.** Das ist eine bewusste Entscheidung und ändert
  sich nicht durch einen Automatisierungsversuch.
- **Nur die Champion-Tabelle ist sortierbar.** Einige andere Tabellen zeigen Kopfzeilen, die
  sortierbar aussehen, aber keine sind.
- **Der Filter wirkt nicht überall gleich.** Rolle und Mindest-Picks greifen nur im Champions-Tab,
  und der Filterzustand überlebt keinen Reload.
- **Der Patch-Vergleich zeigt höchstens 30 Champions.**
- **Kein Import in der Oberfläche.** Eigene CSVs lassen sich nicht per Drag and Drop laden, der
  Datenimport läuft über `npm run sync:data`.
- **Die App ist nicht offlinefähig.** Es gibt keinen Service Worker, und die Champion-Icons kommen
  von einem CDN.

---

## Mitarbeit

Git und GitHub macht der Betreuer des Projekts selbst. Bitte vor einem Commit lokal die
Verifikationskette aus [Tests und Typechecks](#tests-und-typechecks) laufen lassen und nichts
committen, was Zugangsdaten enthält: `.env`-Dateien sind ignoriert und sollen es bleiben.

Ein Hinweis zur Dokumentation im Repo: Markdown ist bewusst lokal. `.gitignore` schließt alle
`.md`-Dateien außer README-Dateien aus, interne Notizen und Änderungsprotokolle liegen daher nur auf
der Maschine des Betreuers. Diese README ist damit die einzige Dokumentation, die versioniert wird.

---

## In English, briefly

Aatroxtool is a League of Legends draft and scouting tool for pro and team preparation. It combines
meta analysis on public Oracle's Elixir pro-play data, a draft cockpit with weighted
recommendations, and a tournament scout for preparing a ban plan against a specific opponent.

The scout does **not** read OP.GG, League of Graphs, DeepLoL or DPM.LOL for you. It recognises the
players, builds the matching profile links, and you paste the numbers in. Nothing is scraped,
nothing is guessed, and missing values stay empty.

The app is a static SPA. Meta analysis, the draft helper and the scout work without a login and
store their data in your browser. Teams, shared notes, saved drafts and ranked history are optional
and require a Supabase backend.

Development: Node 24, `npm ci`, unpack the dataset with `gzip -dkf public/data/importedMatches.json.gz`,
then `npm run dev`. Full verification is `npm test`, `npm run typecheck:all`, `npm run build` and
`npm run check:dist`.
