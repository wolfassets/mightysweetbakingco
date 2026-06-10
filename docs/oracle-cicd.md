# Oracle CI/CD

GitHub Actions workflow:

- `.github/workflows/deploy-oracle.yml`

Deploy targets:

- `toronto-deployim-node-a.jaglion-ionian.ts.net`
- `toronto-deployim-node-b.jaglion-ionian.ts.net`

Remote app path:

- `/home/ubuntu/services/mightysweet`

Workflow behavior:

- runs on pushes to `dev` and `main`
- can also run manually with `workflow_dispatch`
- builds/checks API
- builds web-c CSS
- joins Tailscale
- rsyncs the repo to both nodes without overwriting `.env` files
- runs `scripts/deploy-oracle-node.sh` on each node
- restarts `msc-api.service` and `web-c.service`
- checks local API and web-c health on each node
- checks the public API load balancer health

GitHub secrets:

- `ORACLE_DEPLOY_SSH_KEY` is already set in `wolfassets/mightysweetbakingco`
- `TS_OAUTH_CLIENT_ID` is already set in `wolfassets/mightysweetbakingco`
- `TS_OAUTH_SECRET` is already set in `wolfassets/mightysweetbakingco`

Tailscale OAuth requirements:

- the OAuth client must be allowed to apply `tag:ci`
- the tailnet ACL must let `tag:ci` reach TCP port `22` on node-a and node-b

Created Tailscale credential:

- description: `github-actions-mightysweet-oracle-deploy`
- scope: `auth_keys`
- tag: `tag:ci`

The deploy key public half is installed in `~ubuntu/.ssh/authorized_keys` on both nodes.
