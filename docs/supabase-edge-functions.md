# Supabase Edge Functions

## delete-account

Deletes the authenticated user's account. Requires the user to own no teams.

The `SUPABASE_SERVICE_ROLE_KEY` is read exclusively from the Edge Function environment — it is **never** in frontend code, Vite env vars, or committed to git.

### Deploy

```bash
supabase functions deploy delete-account
```

### Set secrets

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

The function also needs `SUPABASE_URL` and `SUPABASE_ANON_KEY`, which are injected automatically by the Supabase runtime.

### Behaviour

1. Validates the caller's JWT (anon key).
2. Checks `teams` table — if the user owns any teams, returns HTTP 400 with `{ "error": "owns_teams" }`.
3. Deletes the user via `auth.admin.deleteUser` (service_role).
4. Returns HTTP 200 `{ "success": true }`.

### Frontend call

The frontend calls `POST /functions/v1/delete-account` with `Authorization: Bearer <access_token>`. No service_role key is involved on the client side.
