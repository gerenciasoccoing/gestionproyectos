#!/bin/sh
set -e

# Espera a que la base de datos acepte conexiones (docker-compose healthcheck ya lo hace,
# pero esto añade tolerancia si el servicio se reinicia solo).
node src/seed.js

exec node src/server.js
