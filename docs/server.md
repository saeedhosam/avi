# Hetzner server

## Access

```text
Host:  2.31.110.53
IPv6:  2a01:4f8:c015:b0::1
User:  deploy (sudo + docker), root key-only for emergency
Key:   ~/.ssh/avi_hetzner_ed25519
```

SSH password authentication is disabled; root login is key-only.

## Layout

```text
/opt/avi/
├── compose.yml
├── Caddyfile
├── .env.production        # API secrets, mode 600
├── .env.web.production    # web runtime public config + server-only provider key
├── build/api/             # bootstrap build context (temporary)
├── build/web/             # bootstrap build context (temporary)
├── caddy_data/
└── caddy_config/
```

## Services

| Service | Image | Exposure |
| --- | --- | --- |
| `avi-caddy` | `caddy:2.11.9-alpine` | public 80/443 |
| `avi-web` | `avi-web:local` | internal 3000 |
| `avi-api` | `avi-api:local` | internal 8080 |
| `avi-redis` | `redis:8.8-alpine` | internal 6379 |

Only Caddy publishes ports. UFW allows 22/80/443.

## Commands

```bash
cd /opt/avi

docker compose ps
docker compose logs -f --tail=100
docker compose restart caddy
docker compose up -d

# rebuild bootstrap images after copying new source into build/
docker compose --env-file .env.web.production build web
docker compose build api
docker compose up -d
```

## Hardening applied

- Ubuntu 26.04.1 LTS, UTC, 2 GB swap
- Docker Engine 29 + Compose v5
- UFW default-deny inbound
- fail2ban sshd jail
- unattended security updates
- Docker log rotation (10 MB × 3)
- deploy user with sudo and Docker access
- `PasswordAuthentication no`, `PermitRootLogin prohibit-password`

## Bootstrap note

The first API and web images were built on the server from temporary build contexts because the local Docker daemon was unavailable. The target pipeline builds images in GitHub Actions and deploys them over SSH. The `build/` directories can be removed once CI deployment is active.
