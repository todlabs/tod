# Skills

Skills sind wiederverwendbare Anweisungssätze, die TODs Fähigkeiten erweitern. Sie ermöglichen es Ihnen, benutzerdefinierte Workflows und Prompts zu erstellen, die mit einem einfachen Slash-Befehl aufgerufen werden können.

## Was sind Skills?

Skills sind wie Makros für KI-gestützte Entwicklung. Anstatt dieselben Anweisungen wiederholt einzugeben, erstellen Sie einen Skill einmal und rufen ihn mit `/skill-name` auf.

## Wie Skills funktionieren

1. **Erstellen Sie einen Skill** — Schreiben Sie Anweisungen in eine `SKILL.md` Datei
2. **Speichern Sie ihn** — Platzieren Sie ihn in `~/.tod/skills/` (global) oder `.tod/skills/` (projektspezifisch)
3. **Rufen Sie ihn auf** — Tippen Sie `/skill-name` in TOD
4. **TOD führt aus** — Die Anweisungen des Skills leiten die KI-Antwort

## Schnellstart

### Erstellen Sie Ihren ersten Skill

1. Erstellen Sie ein Skill-Verzeichnis:
   ```bash
   mkdir -p ~/.tod/skills/mein-skill
   ```

2. Erstellen Sie `SKILL.md`:
   ```markdown
   # Mein Skill
   
   Kurze Beschreibung dessen, was dieser Skill tut.
   
   ## Anweisungen
   
   Wenn dieser Skill aufgerufen wird, folgen Sie diesen Schritten:
   1. Schritt eins
   2. Schritt zwei
   3. Schritt drei
   
   ## Beispiele
   
   ### Beispiel 1
   Benutzer: /mein-skill
   KI: [Erwartetes Verhalten]
   ```

3. Verwenden Sie ihn in TOD:
   ```
   > /mein-skill
   ```

## Skill-Format

Skills sind Markdown-Dateien mit dieser Struktur:

```markdown
# Skill-Name

Kurze Beschreibung (wird in der /skills Liste angezeigt)

## Anweisungen

Detaillierte Anweisungen für die KI.

## Beispiele

### Beispiel 1
Eingabe: Benutzereingabe
Ausgabe: erwartete Ausgabe
```

## Skill-Speicherorte

### Globale Skills
Gespeichert in `~/.tod/skills/` und in allen Projekten verfügbar:
```
~/.tod/skills/
  ├── commit/
  │   └── SKILL.md
  ├── review/
  │   └── SKILL.md
  └── test/
      └── SKILL.md
```

### Projekt-Skills
Gespeichert in `.tod/skills/` im Root Ihres Projekts:
```
my-project/
  ├── .tod/
  │   └── skills/
  │       ├── deploy/
  │       │   └── SKILL.md
  │       └── release/
  │           └── SKILL.md
  └── src/
```

**Priorität**: Projekt-Skills überschreiben globale Skills mit dem gleichen Namen.

## Eingebaute Skills

TOD kommt mit Beispiel-Skills:

### skill-creator
Hilft Ihnen, neue Skills zu erstellen:
```
> /skill-creator
```

### commit
Erstellt Conventional Commit Nachrichten:
```
> /commit
```

## Befehle

| Befehl | Beschreibung |
|--------|--------------|
| `/skills` | Alle verfügbaren Skills auflisten |
| `/skill-name` | Einen Skill aufrufen |

## Best Practices

1. **Fokussierte Skills** — Ein Skill = eine Aufgabe
2. **Klare Namen** — Kleinbuchstaben mit Bindestrichen: `code-review`, `git-commit`
3. **Gute Beschreibungen** — Der erste Absatz wird zur Skill-Zusammenfassung
4. **Beispiele einfügen** — Zeigen Sie erwartete Eingaben und Ausgaben
5. **Versionskontrolle** — Committen Sie Projekt-Skills in git
6. **Global teilen** — Platzieren Sie wiederverwendbare Skills in `~/.tod/skills/`

## Skills mit KI erstellen

Verwenden Sie den eingebauten `skill-creator` Skill:

```
> /skill-creator
KI: Wie möchten Sie Ihren Skill nennen?
Benutzer: deploy-vercel
KI: Was soll dieser Skill tun?
Benutzer: Das aktuelle Projekt auf Vercel deployen
KI: [Erstellt Skill-Datei]
```

## Erweiterte Funktionen

### Skill-Argumente
Skills können Argumente nach dem Befehl akzeptieren:
```
> /commit Authentifizierungs-Bug beheben
```

### Skill-Kontext
Skills haben Zugriff auf:
- Inhalt des aktuellen Verzeichnisses
- Git-Status
- Umgebungsvariablen
- Kontext des vorherigen Gesprächs

## Fehlerbehebung

**Skill nicht gefunden?**
- Überprüfen Sie den Skill-Namen (groß-/kleinschreibungsempfindlich)
- Stellen Sie sicher, dass die Datei `SKILL.md` heißt
- Führen Sie `/skills` aus, um verfügbare Skills zu sehen

**Skill funktioniert nicht?**
- Überprüfen Sie die Markdown-Syntax
- Stellen Sie sicher, dass Anweisungen klar und spezifisch sind
- Schauen Sie sich Beispiel-Skills als Referenz an

## Beispiele

Sehen Sie sich Beispiel-Skills in `~/.tod/skills/` oder im [Skills-Repository](https://github.com/todlabs/tod/tree/main/example-skills) an.
