#!/bin/bash
# CLOUDFLARE_API_TOKEN should be set via environment variable or GitHub Secret
export PATH="/home/colby/.nvm/versions/node/v24.8.0/bin:$PATH"
npm run build && npx wrangler pages deploy dist --project-name=flowerpil-frontend --branch=prod
