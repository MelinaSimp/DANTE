FROM n8nio/n8n:latest

# Install custom CRE nodes for Drift AI
USER root

# Create the community nodes directory structure that n8n expects
RUN mkdir -p /home/node/.n8n/nodes/node_modules/n8n-nodes-drift-cre

# Copy the compiled custom nodes package
COPY n8n-nodes-drift-cre/ /home/node/.n8n/nodes/node_modules/n8n-nodes-drift-cre/

# Install the peer dependency (n8n-workflow) into the package
RUN cd /home/node/.n8n/nodes/node_modules/n8n-nodes-drift-cre && \
    npm install --omit=dev 2>/dev/null || true

# Fix ownership
RUN chown -R node:node /home/node/.n8n

USER node

EXPOSE 5678
