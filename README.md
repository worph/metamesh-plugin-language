# MetaMesh Plugin: Language

A MetaMesh plugin that aggregates languages from all streams and determines the primary language.

## Description

This plugin collects language information from video, audio, and subtitle streams extracted by the FFmpeg plugin. It:

- Converts language codes to ISO 639-3 format
- Aggregates all detected languages into a set
- Determines the primary language (first audio stream)
- Maps titles to their detected language

## Metadata Fields

| Field | Description |
|-------|-------------|
| `languages` | Set of all detected languages (ISO 639-3) |
| `primaryLanguage` | Primary language code |
| `titles/{lang}` | Title mapped to language |

## Dependencies

- Requires `ffmpeg` plugin to run first

## Configuration

No configuration required.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/manifest` | GET | Plugin manifest |
| `/configure` | POST | Update configuration |
| `/process` | POST | Process a file |

## Running Locally

```bash
npm install
npm run build
npm start
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
| `HOST` | `0.0.0.0` | HTTP server host |

## License

MIT
