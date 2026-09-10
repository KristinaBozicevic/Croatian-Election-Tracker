# Croatian Election Tracker

Interactive model of Croatian parliamentary elections with constituency-level d’Hondt allocation, custom coalitions, coalition voter-loss assumptions, polling trends, and Croatian, German, and English interfaces.

## GitHub Pages

The repository contains a separate static build because GitHub Pages does not run server routes. The polling refresh automatically falls back to Wikipedia’s browser API.

1. In **Settings → Pages**, select **GitHub Actions** as the source.
2. Push to `main`, or run **Deploy GitHub Pages** from the Actions tab.
3. The workflow builds and deploys `dist-pages`.

The configured project URL is:

<https://kristinabozicevic.github.io/Croatian-Election-Tracker/>

## Local development

Requires Node.js 22.

```bash
npm ci
npm run dev
```

Build the GitHub Pages version with:

```bash
npm run build:pages
```

Build the OpenAI Sites version with:

```bash
npm run build
```
