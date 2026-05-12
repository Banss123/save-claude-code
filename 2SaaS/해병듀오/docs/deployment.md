# Deployment Runbook

## Current Production Test URL

- App: https://banss-salesops-vercel.vercel.app
- Supabase Cloud project ref: `xahdgabzmjaxmmkcubkf`
- Vercel project used for today's test: `banss-salesops-vercel`
- Vercel deployment protection: SSO protection disabled
- GitHub repo: https://github.com/Banss123/banss-salesops

## Test Accounts

- `douglas030305@gmail.com`
- `sunup6974@gmail.com`
- `ban951112@gmail.com`
- Shared test password: `test1234`

## Important State

The intended long-term flow is:

1. Change code locally.
2. Run validation: `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run smoke:routes`.
3. Commit.
4. Push to GitHub.
5. Vercel builds automatically from GitHub.

The GitHub repo and `origin` are now active:

```bash
https://github.com/Banss123/banss-salesops.git
```

Automatic Vercel builds are not fully active yet because the Vercel account still needs a GitHub login connection. The CLI currently returns:

```text
You need to add a Login Connection to your GitHub account first.
```

Until the Vercel account is connected to GitHub, use the manual Vercel deploy script below.

## Manual Production Deploy

Use this when GitHub is not connected yet:

```bash
npm run deploy:vercel
npm run smoke:prod
```

The script copies the repo to an ASCII-only temp folder before deploying. This avoids the earlier Vercel project/path issue where a deployment built successfully but served 404 because the build output was empty.

`smoke:prod` checks public routes, auth redirects, and the three test logins against Supabase Cloud.

## GitHub CI

GitHub Actions runs on `main` pushes and pull requests:

```bash
nvm use
npm ci
npm run lint
npx tsc --noEmit
npm run build
```

The CI build uses placeholder public Supabase env values. Production route/auth checks stay in `npm run smoke:prod` until GitHub Secrets are explicitly configured.

## Supabase Cloud Deploy

After adding DB migrations:

```bash
supabase migration list
supabase db push --include-seed
```

Use `--include-seed` only when the seed data is intentionally updated. Do not expose or commit service role keys.

## Vercel GitHub Connection Needed

To enable automatic Vercel deployments:

1. Open Vercel account settings.
2. Add GitHub as a Login Connection.
3. Run:

   ```bash
   npx vercel git connect https://github.com/Banss123/banss-salesops.git
   ```

Then confirm in Vercel:

- Project framework is `Next.js`.
- Production env has `NEXT_PUBLIC_SUPABASE_URL`.
- Production env has `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Deployment protection is not blocking tester access.
