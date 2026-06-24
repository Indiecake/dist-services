COMPOSE = docker compose

.PHONY: up down logs reset test config

up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f

reset:
	$(COMPOSE) down -v --remove-orphans

test:
	pnpm test

config:
	$(COMPOSE) config
