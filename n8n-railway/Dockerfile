FROM n8nio/n8n:1.123.55

# Install custom CRE nodes for Drift AI
USER root

# ── Method 1: Community nodes directory ──────────────────────
# n8n scans ~/.n8n/nodes/node_modules/ for packages with an
# "n8n" field in their package.json.
RUN mkdir -p /home/node/.n8n/nodes/node_modules/n8n-nodes-drift-cre

COPY n8n-nodes-drift-cre/ /home/node/.n8n/nodes/node_modules/n8n-nodes-drift-cre/

# The custom nodes need n8n-workflow at runtime. It's a peer dep
# provided by the host n8n installation. Symlink it so Node's
# module resolver can find it from the community nodes directory.
RUN mkdir -p /home/node/.n8n/nodes/node_modules/n8n-nodes-drift-cre/node_modules && \
    ln -sf $(find /usr/local/lib/node_modules -maxdepth 3 -name "n8n-workflow" -type d | head -1) \
      /home/node/.n8n/nodes/node_modules/n8n-nodes-drift-cre/node_modules/n8n-workflow && \
    ln -sf $(find /usr/local/lib/node_modules -maxdepth 3 -name "n8n-core" -type d | head -1) \
      /home/node/.n8n/nodes/node_modules/n8n-nodes-drift-cre/node_modules/n8n-core 2>/dev/null; true

# ── Method 2: N8N_CUSTOM_EXTENSIONS fallback ─────────────────
# If the community nodes directory doesn't work, this env var
# tells n8n to also scan /opt/custom-nodes/ for node packages.
ENV N8N_CUSTOM_EXTENSIONS="/home/node/.n8n/nodes/node_modules/n8n-nodes-drift-cre"

# Fix ownership so the node user can access everything
RUN chown -R node:node /home/node/.n8n

USER node

EXPOSE 5678
