# Avijan_Migration_Angular

Angular 19 + PrimeNG 19 front end for the Avijan institute management system.
Project name inside the workspace is `institutems-web`.

See the [repository README](../README.md) for the full setup, and
[`docs/API_CONTRACT.md`](../docs/API_CONTRACT.md) for the endpoints this client
consumes.

## Commands

Run these from this directory, or add `--prefix Avijan_Migration_Angular` and run
them from the repository root.

Dev server on http://localhost:4200 — expects the API on http://localhost:5074:

```bash
npm start
```

Production build into `dist/institutems-web`:

```bash
npm run build
```

Unit tests:

```bash
npm test
```

## Layout

```
src/app/
├── core/          auth service, HTTP interceptors, route guards, models
├── layout/shell/  topbar + role-filtered sidebar (replaces _Layout.cshtml)
└── features/
    ├── about/     public About Us page + contact form
    ├── auth/      admin login
    └── dashboard/ home dashboard
```

The API base URL comes from `src/environments/` — `environment.development.ts`
points at `http://localhost:5074/api/v1`, `environment.ts` uses the same origin
(`/api/v1`). The swap is wired through `fileReplacements` in `angular.json`.
