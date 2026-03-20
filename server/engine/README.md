# NovelCraft Engine v1

Moteur de rédaction local (Ollama) avec révision multimodèle, raffinement optionnel et secours externe.

## Dépendances (dossier du moteur)

Toutes les dépendances du moteur sont déclarées dans **`server/engine/package.json`** et installées via le workspace npm du projet (racine) :

- **@google/genai** : Gemini (raffinement et secours).
- **dotenv** : variables d’environnement pour les clés API.
- **Node** (≥18) : `fetch` natif pour les appels HTTP (Ollama, Claude).

À la racine du projet, `npm install` installe aussi les dépendances du workspace `server/engine`. Pour installer uniquement les dépendances du moteur dans ce dossier : `npm install` depuis `server/engine/`.

**Ollama** est un service externe à lancer par l’utilisateur (`ollama serve`, modèles via `ollama pull`). Il n’est pas fourni par ce dépôt.

## Utilisation

Le serveur Express importe `runEngineGenerate` et expose `POST /api/engine/generate`. Les constantes `ENGINE_VERSION` et `ENGINE_DISPLAY_NAME` sont exposées via `GET /api/engine/health`.

## Flux

Compaction du contexte (si trop long) → Réflexion (planification) si demandée ou contexte long → Génération Ollama → Réviseur Ollama (optionnel) → Raffinement externe (optionnel).
