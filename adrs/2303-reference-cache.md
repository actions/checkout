# Reference Cache für schnelle Checkouts

## Zusammenfassung
Einführung eines lokal verwalteten Git-Referenz-Caches für Haupt-Repositories und Submodule, um Netzwerk-Traffic und Checkout-Zeiten auf persistenten Runnern (z.B. Self-Hosted) massiv zu reduzieren.

## Implementierungsplan

1. **Inputs:**
   - In `action.yml` einen neuen Input `reference-cache` (Pfad zum Cache-Verzeichnis) hinzufügen. Default ist leer.
   - In `src/git-source-settings.ts` und `src/input-helper.ts` den Input auslesen und bereitstellen (`settings.referenceCache`).

2. **Cache Manager (`src/git-cache-helper.ts`):**
   - Eine neue Klasse/Helper-Logik, die das Erstellen (`git clone --bare`) und Aktualisieren (`git fetch --force`) von Bare Cache-Repos übernimmt.
   - **Namenskonvention Cache-Verzeichnis:** Damit Admin-Lesbarkeit und Kollisionsfreiheit gewährleistet sind, wird das Cache-Verzeichnis aus der Repository-URL gebildet:
     - Alle Sonderzeichen in der URL durch `_` ersetzen.
     - Ein kurzer Hash (z. B. erste 8 Zeichen des SHA256) der echten URL zur Eindeutigkeit anhängen.
     - Beispiel: `<reference-cache>/https___github_com_actions_checkout_8f9b1c2a.git`

3. **Haupt-Repo Checkout (`src/git-source-provider.ts`):**
   - Vor dem Setup des Checkouts prüfen, ob `reference-cache` gesetzt ist.
   - Wenn ja: den Cache-Ordner für die Haupt-URL aktualisieren/anlegen.
   - Nach dem initialen `git.init()` den Pfad in `.git/objects/info/alternates` schreiben, der auf das `objects`-Verzeichnis des Cache-Ordners zeigt.

4. **Submodule Checkouts (Iterativ statt monolithisch):**
   - Der aktuelle Befehl `git submodule update --recursive` funktioniert nicht out-of-the-box mit `reference`, wenn jedes Submodul seinen individuellen Referenz-Cache benötigt.
   - Wenn `reference-cache` aktiv ist und Submodule initialisiert werden sollen:
     - Lese `.gitmodules` aus (alle Sub-URLs ermitteln).
     - Für jedes Submodul den Cache (genauso wie in Step 2) anlegen oder aktualisieren.
     - Submodul einzeln auschecken per `git submodule update --init --reference <cache-pfad/.git> <pfad>`.
     - Bei der Einstellung `recursive`: In jedes Submodul-Verzeichnis wechseln und den Vorgang für `.gitmodules` rekursiv auf Skript-Ebene durchführen (anstatt Git's `--recursive` Flag einfach weiterzugeben).

## Akzeptanzkriterien
1. **Neue Option konfigurierbar**: Der Input `reference-cache` kann übergeben werden, der Code reagiert darauf.
2. **Ordnerstruktur korrekt**: Der Cache-Ordner für das Hauptrepo und Submodule erhält Namen nach der "URL_Sonderzeichen_Ersetzt+SHA_Cut"-Logik.
3. **Bandbreite gespart / Alternates genutzt**: Beim Hauptcheckout wird eine `.git/objects/info/alternates`-Datei mit Pfad zum lokalen Cache erzeugt. Danach ausgeführte `git fetch`-Befehle sind signifikant schneller bzw. laden deutlich weniger Bytes herunter.
4. **Submodule erhalten Caches**: Auch tiefe (rekursive) Submodule profitieren für deren jeweilige Remote-URL vom Cache, da pro Submodul ein passender `--reference` Punkt dynamisch berechnet und übergeben wird.
5. **Kein --dissociate**: Aus Performance-Gründen bleibt der Arbeitsordner an den Cache gebunden (`git repack` ist zeitaufwändig). Fällt der Cache weg, muss der Workspace erst einmal neu erzeugt werden (was bei Action Runnern die Norm ist, falls es nicht ohnehin "single-use" Runner sind).
