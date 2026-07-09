# Profile & Avatar API

Auth: `Authorization: Bearer <session>`.

## `GET /auth/me`

Returns the current user, including optional `avatar_url` when storage is configured
and the user has an `avatar_key`.

```json
{
  "id": "…",
  "email": "a@b.com",
  "display_name": "Israel",
  "avatar_url": "http://localhost:9000/media/{user_id}/….jpg",
  "created_at": "…"
}
```

## `PATCH /auth/me`

Update profile fields. At least one field is required.

```json
{ "display_name": "Novo nome", "avatar_key": "{user_id}/uuid.jpg" }
```

- `avatar_key` must start with `{user_id}/`.
- Pass `"avatar_key": null` to clear the photo.

## `POST /auth/me/avatar/presign`

```json
{ "content_type": "image/jpeg" }
```

Allowed: `image/jpeg`, `image/png`, `image/webp`.

Response:

```json
{
  "upload_url": "http://localhost:9000/media/{user_id}/…?X-Amz-…",
  "key": "{user_id}/….jpg",
  "public_url": "http://localhost:9000/media/{user_id}/….jpg",
  "headers": [{ "name": "Content-Type", "value": "image/jpeg" }]
}
```

Client flow: presign → `PUT` file to `upload_url` with the given headers →
`PATCH /auth/me` with the returned `key`.

## Storage env (mesmo padrão do drive-clone)

| var | local default |
| --- | --- |
| `S3_ENDPOINT_URL` | `http://localhost:9000` (no compose da API: `http://minio:9000`) |
| `S3_PUBLIC_ENDPOINT_URL` | `http://localhost:9000` (URL que o browser usa no PUT) |
| `S3_BUCKET` | `media` |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | `minioadmin` |
| `S3_URL_STYLE` | `path` |
| `S3_PUBLIC_BASE_URL` | `http://localhost:9000/media` |

`make dev` sobe Postgres + MinIO + bucket + API. Sem essas vars, nome ainda funciona;
upload de avatar retorna `503 storage_not_configured`.
