# AGENTS — Release & Contribute Guide

## Версионирование

Формат: `MAJOR.MINOR.PATCH` (SemVer)

| Тип изменения | Что бампить | Пример |
|---|---|---|
| Багфикс, мелкий фикс CLI, правка текста | PATCH | `1.3.1` → `1.3.2` |
| Новый инструмент, новый UI-компонент, новый провайдер | MINOR | `1.3.2` → `1.4.0` |
| Рефактор ядра, ломающий совместимость | MAJOR | `1.4.0` → `2.0.0` |

**Сейчас мы в режиме фиксов CLI — бампаем только PATCH.** Не прыгай на 1.4.0 без реальной новой фичи.

---

## Как выпустить обнову

### 1. Внести изменения

Правишь код. Пушить в `main` можно без тега — CI просто прогонит lint/build/test.

```bash
git add .
git commit -m "fix: описание что починил"
git push origin main
```

### 2. Обновить версию в package.json

```bash
# PATCH — для фиксов (сейчас только это)
npm version patch --no-git-tag-version
# это обновит "version" в package.json, например 1.3.1 → 1.3.2

# MINOR — только когда добавляешь новую фичу
# npm version minor --no-git-tag-version

# MAJOR — только при ломающих изменениях
# npm version major --no-git-tag-version
```

Флаг `--no-git-tag-version` нужен, чтобы npm не создал тег сам — мы тегируем вручную.

### 3. Закоммитить версию

```bash
git add package.json
git commit -m "chore: bump version to $(node -p 'require(\"./package.json\").version')"
```

### 4. Пушить и поставить тег

```bash
git push origin main

# Тег должен совпадать с версией из package.json
git tag v1.3.2
git push origin v1.3.2
```

**Тег `v*` — это триггер для обоих workflows.**

---

## CI/CD — что происходит при пуше тега

### `npm-publish.yml`
Срабатывает при `push tags: v*`. Делает:
1. Checkout + Bun + Node 20
2. `bun install --frozen-lockfile`
3. `tsc --noEmit` — проверка типов
4. `bun run build` — сборка в `dist/`
5. `bun test` — тесты
6. `npm publish --access public` — публикация в npm

**Требует секрет `NPM_TOKEN`** в репозитории (Settings → Secrets → Actions).

### `ci.yml` (release job)
Срабатывает при `push tags: v*`. Делает:
1. То же, что CI при пуше в main (lint, build, test)
2. Создаёт GitHub Release через `softprops/action-gh-release@v1` с файлами из `dist/`

---

## Чеклист перед релизом

- [ ] Код закоммичен в `main`
- [ ] `package.json` версия обновлена (patch/minor/major)
- [ ] Версия закоммичена отдельным коммитом
- [ ] Тег `vX.Y.Z` создан и запушен
- [ ] GitHub Action прошёл (вкладка Actions)
- [ ] Пакет появился на npm: https://www.npmjs.com/package/@todlabs/tod
- [ ] GitHub Release создан с артефактами

---

## Частые ошибки

| Проблема | Решение |
|---|---|
| npm publish падает с 403 | Проверь `NPM_TOKEN` в секретах репозитория |
| Тег не триггерит workflow | Убедись что тег начинается с `v` (не `1.3.2`, а `v1.3.2`) |
| Версия на npm не обновилась | Проверь что `package.json` версия совпадает с тегом |
| CI падает на tsc | Запусти `bunx tsc --noEmit` локально перед пушем |
| Забыл `--no-git-tag-version` | `npm version` создаст тег сам — удали: `git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z` |

---

## Быстрый скрипт

Одной строкой — bump, commit, tag, push:

```bash
npm version patch --no-git-tag-version && \
git add package.json && \
git commit -m "chore: bump version to $(node -p 'require(\"./package.json\").version')" && \
git push origin main && \
git tag "v$(node -p 'require(\"./package.json\").version')" && \
git push origin "v$(node -p 'require(\"./package.json\").version')"
```
