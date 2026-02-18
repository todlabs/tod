# Skills

Les skills sont des ensembles d'instructions réutilisables qui étendent les capacités de TOD. Ils vous permettent de créer des workflows et des prompts personnalisés qui peuvent être invoqués avec une simple commande slash.

## Que sont les skills?

Les skills sont comme des macros pour le développement assisté par IA. Au lieu de taper les mêmes instructions à répétition, vous créez un skill une fois et l'invoquez avec `/nom-du-skill`.

## Comment fonctionnent les skills

1. **Créez un skill** — Écrivez des instructions dans un fichier `SKILL.md`
2. **Stockez-le** — Placez-le dans `~/.tod/skills/` (global) ou `.tod/skills/` (spécifique au projet)
3. **Invoquez-le** — Tapez `/nom-du-skill` dans TOD
4. **TOD exécute** — Les instructions du skill guident la réponse de l'IA

## Démarrage rapide

### Créer votre premier skill

1. Créez un répertoire de skill:
   ```bash
   mkdir -p ~/.tod/skills/mon-skill
   ```

2. Créez `SKILL.md`:
   ```markdown
   # Mon Skill
   
   Brève description de ce que fait ce skill.
   
   ## Instructions
   
   Quand ce skill est invoqué, suivez ces étapes:
   1. Étape une
   2. Étape deux
   3. Étape trois
   
   ## Exemples
   
   ### Exemple 1
   Utilisateur: /mon-skill
   IA: [Comportement attendu]
   ```

3. Utilisez-le dans TOD:
   ```
   > /mon-skill
   ```

## Format du skill

Les skills sont des fichiers markdown avec cette structure:

```markdown
# Nom du skill

Brève description (s'affiche dans la liste /skills)

## Instructions

Instructions détaillées pour l'IA.

## Exemples

### Exemple 1
Entrée: entrée utilisateur
Sortie: sortie attendue
```

## Emplacements des skills

### Skills globaux
Stockés dans `~/.tod/skills/` et disponibles dans tous les projets:
```
~/.tod/skills/
  ├── commit/
  │   └── SKILL.md
  ├── review/
  │   └── SKILL.md
  └── test/
      └── SKILL.md
```

### Skills de projet
Stockés dans `.tod/skills/` à la racine de votre projet:
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

**Priorité**: Les skills de projet remplacent les skills globaux du même nom.

## Skills intégrés

TOD vient avec des exemples de skills:

### skill-creator
Vous aide à créer de nouveaux skills:
```
> /skill-creator
```

### commit
Crée des messages de commit au format conventional commits:
```
> /commit
```

## Commandes

| Commande | Description |
|----------|-------------|
| `/skills` | Lister tous les skills disponibles |
| `/nom-du-skill` | Invoquer un skill |

## Bonnes pratiques

1. **Gardez les skills ciblés** — Un skill = une tâche
2. **Utilisez des noms clairs** — minuscules avec tirets: `code-review`, `git-commit`
3. **Écrivez de bonnes descriptions** — Le premier paragraphe devient le résumé du skill
4. **Incluez des exemples** — Montrez les entrées et sorties attendues
5. **Contrôle de version** — Commitez les skills de projet dans git
6. **Partagez globalement** — Placez les skills réutilisables dans `~/.tod/skills/`

## Créer des skills avec l'IA

Utilisez le skill intégré `skill-creator`:

```
> /skill-creator
IA: Comment souhaitez-vous nommer votre skill?
Utilisateur: deploy-vercel
IA: Que devrait faire ce skill?
Utilisateur: Déployer le projet actuel sur Vercel
IA: [Crée le fichier skill]
```

## Fonctionnalités avancées

### Arguments des skills
Les skills peuvent accepter des arguments après la commande:
```
> /commit corriger le bug d'authentification
```

### Contexte du skill
Les skills ont accès à:
- Le contenu du répertoire actuel
- Le statut git
- Les variables d'environnement
- Le contexte de la conversation précédente

## Dépannage

**Skill non trouvé?**
- Vérifiez le nom du skill (sensible à la casse)
- Assurez-vous que le fichier s'appelle `SKILL.md`
- Exécutez `/skills` pour voir les skills disponibles

**Skill ne fonctionne pas?**
- Vérifiez la syntaxe markdown
- Assurez-vous que les instructions sont claires et spécifiques
- Consultez les exemples de skills comme référence

## Exemples

Voir les exemples de skills dans `~/.tod/skills/` ou le [repository de skills](https://github.com/todlabs/tod/tree/main/example-skills).
