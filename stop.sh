#!/bin/bash
# Stop all services and remove containers, networks, and volumes
echo "Stopping all containers and cleaning volumes..."
docker compose down -v --remove-orphans
echo "Docker resources cleaned up successfully!"
