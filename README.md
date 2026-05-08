# Lingva REST API Worker

This Worker exposes the REST API without the Next.js frontend or GraphQL route.

## Endpoints

- `GET /api/v1/:source/:target/:query`
- `GET /api/v1/audio/:lang/:query`
- `GET /api/v1/languages`
- `GET /api/v1/languages/source`
- `GET /api/v1/languages/target`

## Local Development

```bash
cd worker
npm install
npm run dev
```

Example:

```bash
curl "http://localhost:8787/api/v1/auto/en/hola"
```

## Deploy

```bash
cd worker
npm run deploy
```

The Worker enables `nodejs_compat` because `lingva-scraper@1.1.0` depends on packages that expect Node-compatible APIs.
