# TriBNB Landing Page

Static TriBNB landing page prepared for GitHub and Vercel.

## Local verification

Requirements: Node.js 20 or newer and Python for the optional ZIP package.

```bash
npm test
npm run build
```

The production output is written to `dist/`.

## Public environment variables

The site reads two **public build-time values**:

| Variable | Purpose | Accepted value | Empty fallback |
| --- | --- | --- | --- |
| `TRIBNB_CA` | TriBNB token contract address | `0x` followed by exactly 40 hexadecimal characters | `CA: SOON` |
| `TRIBNB_X_URL` | Shared destination for the X buttons in the navbar and footer | HTTPS URL on `x.com` or `twitter.com` | Buttons remain visible but disabled |

These are public website settings, not secrets. The build validates them and generates `dist/runtime-config.js`; `.env` files are ignored and never committed.

## Deploy with Vercel

1. Import `SolClaude33/tribnb` as a new Vercel project.
2. Keep **Root Directory** at the repository root.
3. Vercel will read `vercel.json`:
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. Open **Settings → Environment Variables** and add:
   - `TRIBNB_CA`
   - `TRIBNB_X_URL`
5. Select the environments where each value should apply, normally Production and Preview.
6. Deploy.

After changing either variable, open **Deployments** and redeploy. Existing deployments retain the values that were present when they were built.

## Safe local defaults

A build with no variables remains deployable: the CA displays `SOON` and both X controls are non-clickable. This prevents placeholder addresses or fake social links from being published.
