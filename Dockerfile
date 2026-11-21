# Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited.
# ExTerm v17.0 24/7 daemon: ingest + bots (10-gate risk firewall) + webhook dispatcher, standard library only.
#   docker compose up -d        (see docker-compose.yml: restart policy + health check = crash-recovery watchdog)
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 EXTERM_DATA=/data EXTERM_BIND=0.0.0.0
RUN useradd --create-home --uid 10001 exterm && mkdir -p /data /app && chown exterm:exterm /data
WORKDIR /app
COPY --chown=exterm:exterm serve.py exterm_ops.py exterm.html ./
USER exterm
VOLUME ["/data"]
EXPOSE 8765
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys; r=urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:8765/manifest.webmanifest', headers={'Host':'localhost:8765'}), timeout=4); sys.exit(0 if r.status==200 else 1)"
CMD ["python", "serve.py", "8765", "--bot-daemon", "--headless", "--no-update-check"]
