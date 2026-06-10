# Oracle CI/CD

GitHub Actions workflow:

- `.github/workflows/deploy-oracle.yml`

Deploy targets:

- node-a public IP: `150.230.27.121`
- node-b public IP: `147.5.108.22`

Remote app path:

- `/home/ubuntu/services/mightysweet`

Public endpoints:

- frontend: `https://p1.wolfassets.org`
- API: `https://api.mightysweetbakingco.services.deployim.com`

Workflow behavior:

- runs on pushes to `dev` and `main`
- can also run manually with `workflow_dispatch`
- builds/checks API
- builds web-c CSS
- rsyncs the repo to both nodes without overwriting `.env` files
- runs `scripts/deploy-oracle-node.sh` on each node
- restarts `msc-api.service` and `web-c.service`
- checks local API and web-c health on each node
- checks the public API load balancer health
- checks the public frontend load balancer health

GitHub secrets:

- `ORACLE_DEPLOY_SSH_KEY` is already set in `wolfassets/mightysweetbakingco`

Tailscale note:

- GitHub Actions originally joined Tailscale with `tag:ci`, but the tailnet ACL blocked SSH to the nodes.
- The workflow currently deploys over public SSH to avoid that ACL dependency.

The deploy key public half is installed in `~ubuntu/.ssh/authorized_keys` on both nodes.

Frontend TLS note:

- `p1.wolfassets.org` is terminated by Caddy on both node-a and node-b.
- Both nodes currently use the same pinned certificate files:
  - `/etc/caddy/certs/p1.crt`
  - `/etc/caddy/certs/p1.key`
