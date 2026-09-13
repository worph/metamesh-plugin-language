# MetaMesh Plugin: Language

A MetaMesh container plugin that adds a media file's **audio-track languages**
to the `languages/<lang3>` key-set (METADATA_KEYS.md §9).

## What it does

After the `ffmpeg` plugin has stored the stream table, this plugin:

- reads the per-stream table in **either** shape: the nested `stream`
  collection meta-sort's `/process` payload carries (array of JSON strings,
  array of objects, JSON string, or index-keyed object) or meta-core's flat
  `stream/{n}` keys;
- keeps **audio** streams only (subtitle-track languages belong to
  `subtitleLanguages/*`);
- normalises each code onto ISO 639-2/B alpha-3 — `fr`/`fra` → `fre`,
  `de`/`deu` → `ger`, `pt-BR` → `por` — the vocabulary the `languages:` query
  filter and meta-watch compare against;
- adds `languages/<code> = "true"` for each new member in one merge (`PATCH`).

It never writes `und` (or `zxx`/`mis`), never writes `titles/*`, never deletes
or overwrites any other key, and a re-run over an already-tagged record writes
nothing. A rejected write fails the task.

## Metadata Fields

| Field | Description |
|-------|-------------|
| `languages/{lang3}` | Key-set member per audio-track language (`"true"`) |

## Dependencies

- Requires the `ffmpeg` plugin to run first (it writes `stream/{n}`).

## Configuration

No configuration required.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/manifest` | GET | Plugin manifest |
| `/configure` | POST | Update configuration |
| `/process` | POST | Process a file |

## Tests

```bash
pnpm test        # vitest, no network
./test.sh        # same, inside Docker
```

## Docker

```bash
docker build -t metamesh-plugin-language .
docker run -p 8080:8080 metamesh-plugin-language
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | HTTP server port |

## License

MIT
