# handles.queerlil.tools

A small project that provides two cooperating components:

- A Deno-based Bluesky bot that listens to Jetstream and manages "handles" by responding to mentions and invoking a CGI endpoint to modify mappings.
- A Rust HTTP service that maps incoming Host+path requests to an ATProto record and serves HTML content (default listen: 0.0.0.0:9090).

**Repository layout (important files)**

- Bot: `handles/index.ts`
- Bot run helper: `handles/run.sh`
- Web service: `handles/web` (Rust/Cargo project)
- Nginx sample configs: `nginx/sites-available`
- Credentials (example): `credentials_example/handles.json`

## Requirements

- Deno (recent stable release that supports `npm:` imports)
- Rust toolchain (`rustup`, `cargo`) to build the web service
- nginx for TLS and reverse proxy in production
- Network access to your AtProto host (project references `https://at.queerlil.tools`) and Jetstream WebSocket endpoints

## Setup

1. Copy the example credentials and secure them:

```bash
cp credentials_example/handles.json credentials/handles.json
chmod 600 credentials/handles.json
```

2. Create session and remove-secret files (restrict permissions):

```bash
touch credentials/handles.session.json
touch credentials/handles.remove.key
chmod 600 credentials/handles.session.json
chmod 600 credentials/handles.remove.key
cat /var/www/secrets/handles.remove.key | tee credentials/handles.remove.key
```

3. Ensure any process that produces `/tmp/handles_records.json` or the mapping file used by the bot is available (the bot reads a handles records file for `list` command).

## Running (development)

- Run the Deno bot (from `handles/`):

```bash
./run.sh
```

- Run the Rust web server (from `handles/web/`):

```bash
cd handles/web
cargo run --release
```

The web service binds to port `9090` by default.

## Running (production)

- Build the Rust web server for release:

```bash
cd handles/web
cargo build --release
./target/release/handles-web
```

- Run the Deno bot under a process manager (systemd, docker, etc.). Example systemd unit snippet:

```ini
[Service]
ExecStart=/usr/bin/deno run --allow-read --allow-write --allow-net /opt/handles/index.ts
Restart=always
User=handles
WorkingDirectory=/opt/handles
```

## Deployment (nginx)

Use the provided `nginx/sites-available/handles` snippet as a starting point. Key points:

- Ensure an `upstream` (or replace the name) points to the Rust service host: `handles_web_host:9090`.
- TLS certs referenced in the config must exist and be readable by nginx.
- The sample config references an `anubis` auth backend for `auth_request` — either provide that upstream or remove the `auth_request` lines.

Enable the site and reload nginx:

```bash
sudo ln -s /etc/nginx/sites-available/handles /etc/nginx/sites-enabled/handles
sudo systemctl reload nginx
```

## Credentials & Security

- Never commit `credentials/handles.json`, `credentials/handles.session.json`, or `credentials/handles.remove.key` to VCS.
- Prefer using a secrets manager or environment-specific secret storage in production.
- Keep file permissions restrictive: `chmod 600 credentials/*`.
- The `handles.remove.key` is used to authorize remove operations — treat it as a high-value secret and rotate if compromised.

## Troubleshooting

- Bot login failures: verify `credentials/handles.json` contains correct `identifier` and `password`, and that the host referenced in code is reachable.
- `list` command returns empty: ensure the handles records file exists and is readable by the bot.
- Web pages return 404: verify an ATProto record `tools.queerlil.handles.page` exists for the reversed-host rkey format and that the page URL in the record is reachable.
- Check stdout/stderr of both services for runtime errors; session tokens for the bot are written to `credentials/handles.session.json`.

## Contributing

- Open issues and PRs. Keep secrets out of commits.

## License

Add license information here.

---

If you'd like, I can also add an example `systemd` unit or a Dockerfile for either component, and pin a recommended Deno version in this README.