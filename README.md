<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# NovelCarft

Projet “AI Studio app” :
- Frontend + API (Node/Express) en dev via Vite
- Variables d'environnement chargées avec `dotenv/config`

View your app in AI Studio : https://ai.studio/apps/a9d1dd8a-4f55-431d-8cc4-f78dd38977ef

## Lancer en local

**Prérequis :** Node.js (et `npm`)

1. Installer les dépendances :
   ```bash
   npm install
   ```
2. Configurer les variables via `/.env` (fichier ignoré par Git) :
   - copier `/.env.example` vers `/.env`
   - renseigner au minimum `GEMINI_API_KEY` (et éventuellement les autres clés selon votre fournisseur)
3. Lancer l’app :
   ```bash
   npm run dev
   ```

L’UI est sur `http://localhost:5173`.

## Variables d'environnement (principales)

Le serveur lit (au minimum) :
- `PORT` (par défaut `3000`)
- `API_PORT` (par défaut `3001`)
- `API_ONLY` (mettre à `1` pour démarrer “API seulement”)
- `GEMINI_API_KEY`
- `OPENROUTER_API_KEY`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `MISTRAL_API_KEY`
- `XAI_API_KEY`

## Notes de sécurité

`/.env` est ignoré par Git (et seul `/.env.example` est destiné à être committé).

Les fichiers `debug-*.log` sont ignorés par `/.gitignore`.
