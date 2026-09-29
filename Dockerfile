# FriendZone needs nothing but Python: no dependencies to install.
FROM python:3.12-slim
WORKDIR /app
COPY server.py ./
COPY public ./public
# Hosts tell the app which port to use through $PORT. Save data on a mounted volume at /data.
ENV HOST=0.0.0.0 PORT=8000 FZ_DATA=/data/zones.json PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["python", "server.py"]
