#!/usr/bin/env bash
# Builds on Cloudflare Workers Builds. The production branch (master) deploys the Convex production deployment;
# every other branch gets a Worker preview URL and a Convex preview deployment with the same name, and the
# deployment's SITE_URL is pointed at the preview URL so Google sign-in returns there.
#
# Settings in Cloudflare (the same commands work for every branch):
#   Build command:  bash scripts/cloudflare-preview.sh build
#   Deploy command: bash scripts/cloudflare-preview.sh deploy (production and non-production)
# Build variable: CONVEX_DEPLOY_KEY, set per environment in Cloudflare: a Convex production deploy key for the
# production branch, a preview deploy key for the rest.
set -euo pipefail

branch="${WORKERS_CI_BRANCH:-$(git branch --show-current)}"
# One name for both sides: lowercase letters, digits and dashes, starting with a letter, short enough that
# "<name>-email-bro" fits in a 63-character DNS label.
name=$(printf '%s' "$branch" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^[^a-z]+//' | cut -c1-40 | sed -E 's/-+$//')
if [ -z "$name" ]; then
  echo "Can't make a preview name from branch \"$branch\"." >&2
  exit 1
fi

case "${1:-}" in
  build)
    if [ "$branch" = "${PRODUCTION_BRANCH:-master}" ]; then
      # Convex treats every Cloudflare branch but "main" as a preview and refuses a production key there. This branch
      # check already makes sure it's production.
      pnpm exec convex deploy --check-build-environment disable --cmd 'pnpm build' --cmd-url-env-var-name VITE_CONVEX_URL
    else
      pnpm exec convex deploy --preview-name "$name" --cmd 'pnpm build' --cmd-url-env-var-name VITE_CONVEX_URL
    fi
    ;;
  deploy)
    # Production goes live on the Worker's own routes; its SITE_URL is set once in the Convex dashboard.
    if [ "$branch" = "${PRODUCTION_BRANCH:-master}" ]; then
      pnpm exec wrangler deploy
      exit 0
    fi
    out=$(pnpm exec wrangler versions upload --preview-alias "$name" 2>&1) || { echo "$out"; exit 1; }
    echo "$out"
    url=$(printf '%s\n' "$out" | grep 'Version Preview Alias URL:' | grep -oE 'https://[a-z0-9.-]+' | head -1 || true)
    if [ -z "$url" ]; then
      echo "Wrangler didn't print a preview alias URL. Check that preview_urls is on in wrangler.jsonc." >&2
      exit 1
    fi
    pnpm exec convex env set SITE_URL "$url" --deployment "preview/$name"
    echo "SITE_URL of Convex preview/$name is now $url"
    ;;
  *)
    echo "Usage: $0 build|deploy" >&2
    exit 1
    ;;
esac
