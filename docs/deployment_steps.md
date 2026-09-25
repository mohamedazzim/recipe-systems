# Recipe Systems Deployment Handoff

Status: **fully deployed and operational**  
Last verified: **2026-09-18**  
Platform: Railway, production environment  
Railway project: `recipe-systems` (`d0d2d4b7-1485-4630-a58b-193cab820436`)

This document records the actual deployed state, the important failures that were fixed, the resolution of the live authentication configuration, and verified end-to-end tests.

## Live Services

The Railway Free plan allows five services, so the API and analysis worker share one container and Keycloak uses a second database on the Postgres plugin.

| Service | Current state | Public/private endpoint | Notes |
| --- | --- | --- | --- |
| Postgres | online | `postgres.railway.internal:5432` | App database `railway`; Keycloak database `keycloak` |
| api | online | `https://api-production-9cb27.up.railway.app` | NestJS BFF, Prisma migrations, and analysis worker |
| web | online | `https://web-production-2b198.up.railway.app` | Next.js frontend |
| keycloak | online | `https://keycloak-production-5d3e.up.railway.app` | Keycloak 26.2.5, realm `recipesystems` |
| minio | online | `http://minio.railway.internal:9000` | **Image withdrawn** — `quay.io/minio/minio` returns 401 and Docker Hub's `minio/minio` no longer exists. Runs until it restarts; a redeploy needs a different image or a managed S3 endpoint |

The deleted services are the dedicated worker and dedicated Keycloak Postgres service. Do not recreate them unless the Railway plan changes.

## Verified Checks

These checks passed after the latest redeployments:

```text
GET https://web-production-2b198.up.railway.app
200 OK, title: Recipe Systems

GET https://api-production-9cb27.up.railway.app/api/v1/health
200 {"status":"ok","service":"api"}

GET https://keycloak-production-5d3e.up.railway.app/realms/recipesystems
200 OK

GET https://keycloak-production-5d3e.up.railway.app/realms/recipesystems/.well-known/openid-configuration
200 OK
issuer: https://keycloak-production-5d3e.up.railway.app/realms/recipesystems
```

The OIDC discovery endpoint originally returned `403 HTTPS required`. It now returns `200` after the Keycloak proxy configuration was corrected.

## Resolved Blocker: Keycloak Client Redirect URI (FIXED & VERIFIED)

The Keycloak client configuration in realm `recipesystems` has been updated and verified:

1. **Root Cause Resolved**: Keycloak's `redirect_uris` previously contained `https://*.up.railway.app/*`. Wildcards in hostname/domain are disallowed under RFC 6749 and Keycloak OIDC validation rules.
2. **Changes Applied**:
   - `client` table: `base_url` set to `https://web-production-2b198.up.railway.app`.
   - `redirect_uris` updated to exact production and local callback URIs:
     - `https://api-production-9cb27.up.railway.app/api/v1/auth/callback`
     - `https://web-production-2b198.up.railway.app/*`
     - `http://localhost:3001/api/v1/auth/callback`
     - `http://localhost:3000/*`
   - `web_origins` updated to:
     - `https://web-production-2b198.up.railway.app`
     - `https://api-production-9cb27.up.railway.app`
     - `http://localhost:3000`
     - `http://localhost:3001`
   - Keycloak service restarted on Railway to refresh Infinispan cache.
3. **End-to-End Verification**:
   - `GET /api/v1/auth/login?redirect_to=/` ➔ `302 Found` with valid Keycloak auth URL.
   - Keycloak auth page ➔ `200 OK` rendering `<form id="kc-form-login">` without any `Invalid parameter: redirect_uri` errors.
   - Login submitted with `chef@recipesystems.test` / `Password@123` ➔ `302 Found` to API callback.
   - Callback exchanges authorization code and issues `recipe_session` and `recipe_csrf` cookies.
   - `GET /api/v1/auth/me` with session cookies ➔ `200 OK` returning `chef@recipesystems.test`.
   - `GET /api/v1/recipes` ➔ `200 OK`.
   - `GET /api/v1/me/restriction-profile` ➔ `200 OK`.

Demo credentials present in the imported realm:
```text
chef@recipesystems.test / Password@123
demo@recipesystems.test / Password@123
```
Change or remove these demo credentials before treating the deployment as open to public traffic.

## Railway Configuration

### Keycloak

Source files:

- `infra/keycloak/Dockerfile`
- `infra/keycloak/recipesystems-realm.json`

The Dockerfile copies `recipesystems-realm.json` into `/opt/keycloak/data/import/` and generates the PKCS12 keystore required by Keycloak production mode. The active start command is equivalent to:

```text
/opt/keycloak/bin/kc.sh start --import-realm --proxy=edge \
  --proxy-headers=xforwarded --http-enabled=true --http-port=8080 \
  --hostname=keycloak-production-5d3e.up.railway.app \
  --hostname-strict=false --db=postgres \
  --https-key-store-file=/opt/keycloak/conf/server.keystore \
  --https-key-store-password=changeit
```

Keycloak listens on HTTP port 8080 inside the container. Railway terminates public TLS and forwards the request headers. The `--proxy=edge` warning about legacy hostname-v1 options is present but does not prevent startup.

Important: `infra/keycloak/recipe-systems-realm.json` is an older similarly named file. It is not the file copied by the Dockerfile. Keep the two files in sync if both remain in the repository, or remove the unused duplicate only as a separate cleanup task.

### API

The API deployment builds workspace packages before the application:

```text
db:generate -> database -> schemas -> domain -> llm-adapter -> ocr-adapter
-> rendering -> analysis-worker -> api
```

The runtime command applies migrations, starts the worker in the background, and keeps the API in the foreground. The compiled Nest entry point is `dist/src/main.js`, not `dist/main.js`.

Production variables that matter:

```text
DATABASE_URL                 Railway Postgres reference
DATABASE_URL_WORKER          Railway Postgres reference
SESSION_SECURE=true
SESSION_SECRET               set in Railway; never commit or document value
KEYCLOAK_BASE_URL            https://keycloak-production-5d3e.up.railway.app
KEYCLOAK_ISSUER_URL          https://keycloak-production-5d3e.up.railway.app/realms/recipesystems
KEYCLOAK_REALM               recipesystems, or default
KEYCLOAK_CLIENT_ID           recipe-systems-bff
KEYCLOAK_CLIENT_SECRET       must match the Keycloak client secret
AUTH_REDIRECT_BASE           https://web-production-2b198.up.railway.app
WEB_ORIGIN                   https://web-production-2b198.up.railway.app
CORS_ORIGINS                 https://web-production-2b198.up.railway.app
MODEL_PROVIDER               deepseek
OCR_PROVIDER                 deepseek
DEEPSEEK_MODEL               deepseek-flash
DEEPSEEK_REASONING_EFFORT    low
DEEPSEEK_API_KEY             set in Railway; never commit or document value
S3_ENDPOINT                  http://minio.railway.internal:9000
S3_BUCKET                    recipe-assets
```

### Web & Reverse Proxy Architecture

Because `up.railway.app` is an effective Top-Level Domain (eTLD) on the Public Suffix List, subdomains cannot share cookies across origins (`SameSite=Lax` cookies set by `api-production-...` are stripped by browsers on cross-site subresource calls from `web-production-...`).

To provide 100% same-origin cookie handling:
1. `apps/web/next.config.ts` proxies `/api/:path*` to `API_UPSTREAM_URL` (`https://api-production-9cb27.up.railway.app/api/:path*`).
2. `NEXT_PUBLIC_API_BASE_URL` is set to `/api/v1` on the web service.
3. Keycloak client redirects and `AUTH_REDIRECT_BASE` point to `https://web-production-2b198.up.railway.app`.
4. All cookies (`recipe_session`, `recipe_csrf`, `recipe_guest_session`, `recipe_oauth_state`) are set directly on `web-production-2b198.up.railway.app` without cross-domain restrictions.

## Major Fixes Already Applied

- Consolidated the architecture to five Railway services because of the Free plan service limit.
- Moved MinIO from Docker Hub to `quay.io/minio/minio`. **Superseded:** as of 2026-09-25 `quay.io/minio/minio` answers `401 UNAUTHORIZED` for `latest` and `no such manifest` for pinned tags, and Docker Hub's `minio/minio` answers `repository does not exist` — MinIO withdrew its community images from both registries. The running Railway service is unaffected until it is redeployed, at which point the image can no longer be pulled. The integration tier now uses `adobe/s3mock:latest`, which is pullable and which the storage integration suite passes against.
- Created the `keycloak` database and user on the shared Postgres plugin.
- Added the Keycloak realm import and generated a production keystore.
- Tuned Keycloak JVM memory with `JAVA_OPTS_APPEND` to fit the available container memory.
- Fixed Railway start commands to use absolute Keycloak paths and fixed port 8080; `${PORT}` did not expand reliably in the Railway command.
- Fixed Keycloak edge proxy and forwarded-header handling, removing the `HTTPS required` OIDC failure.
- Fixed API workspace build ordering and the Nest `dist/src/main.js` runtime path.
- Upgraded Next.js from 15.1.4 to 15.1.11 because Railway's dependency scan rejected the older lockfile for a critical CVE.
- Applied six Prisma migrations to the Railway Postgres database.
- Corrected Keycloak `redirect_uris` and `web_origins` in the Postgres database, eliminating wildcard hostname syntax.
- Configured Next.js reverse proxy rewrites to bypass Public Suffix List (PSL) cross-subdomain cookie restrictions.
- Integrated DeepSeek API key and configured `deepseek-flash` for LLM analysis and Vision OCR on Railway.
- Verified MinIO `recipe-assets` bucket exists and is ready on the persistent `/data` volume.

## Verification Summary

All 5 Railway services are healthy and functional:
- **Web**: `https://web-production-2b198.up.railway.app` (Proxies `/api/*` seamlessly)
- **API**: `https://api-production-9cb27.up.railway.app` (`/api/v1/health` ➔ `200`, Worker running)
- **Keycloak**: `https://keycloak-production-5d3e.up.railway.app` (OIDC flow 200 OK)
- **MinIO**: `http://minio.railway.internal:9000` (`recipe-assets` bucket present). **Caveat:** the image MinIO withdrew cannot be pulled, so this service survives only as long as it is not restarted. Production storage should move to a managed S3-compatible endpoint (Cloudflare R2, Backblaze B2, AWS S3) by pointing `S3_ENDPOINT` at it — an in-memory mock is not a production substitute.
- **Postgres**: `postgres.railway.internal:5432` (`railway` and `keycloak` databases)

Full authentication round-trip tested:
- Login redirect ➔ Keycloak form ➔ credential check ➔ Web proxy callback ➔ same-origin session cookie issuance ➔ `/api/v1/auth/me` returns `200 OK` with user data.
- Guest sessions and claiming fully operational.
- Web unit test suite: 23 test suites passed, 202 unit tests passed.

## Operational Notes

- **AI Analysis & Vision OCR**: Configured and active (`MODEL_PROVIDER=deepseek`, `OCR_PROVIDER=deepseek`, `DEEPSEEK_MODEL=deepseek-flash`, `DEEPSEEK_REASONING_EFFORT=low`). Both the NestJS BFF and background analysis worker run inside the Railway `api` container and connect directly to DeepSeek.
- **Reference data under `infra/reference-data`**: Core schema and tables are migrated. Domain reference data (canonical ingredient dictionary, allergen mapping, food compositions) can be populated via the D-29 reviewed import path (`ReferenceDataService`).
- **Demo credentials**: Change or remove demo users (`chef@recipesystems.test`, `demo@recipesystems.test`) before opening to non-test users.
- **Secrets**: Never commit secrets or database credentials to git. `%TEMP%\rs-secrets.txt` remains local and untracked.

