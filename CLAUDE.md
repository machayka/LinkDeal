# LinkDeal

## Produkcja
- Proxmox `192.168.1.200` → VM 105 `linkdeal`, IP `192.168.1.61`, `ssh kacper@192.168.1.61`
- Repo: `~/LinkDeal`, uruchamianie: `deploy/docker-compose.yml` (caddy, board, db)
- Ruch z internetu: Cloudflare Tunnel (`cloudflared` jako usługa systemd na VM) → `localhost:80` → Caddy
- Caddyfile: domeny z `http://` (HTTPS robi Cloudflare), Caddy słucha tylko na `127.0.0.1:80`
- Deploy: `cd ~/LinkDeal && git pull && cd deploy && docker compose up -d --build`
- VM 100 i 104 na Proxmoxie to inne projekty — nie ruszać
