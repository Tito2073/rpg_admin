# Ferramenta administrativa

Monolito Node para administrar entidades do jogo e exportar JSONs consumidos pelo runtime principal.

## Stack

- Express
- Prisma
- SQLite
- AdminJS

## Fluxo de dados

1. O banco SQLite vira a fonte de verdade.
2. O painel AdminJS faz o CRUD base das entidades.
3. Rotas e scripts próprios exportam os JSONs finais para `GAME_ROOT/data`.
4. O jogo continua lendo apenas os arquivos JSON exportados.

No layout atual (pastas irmas), use `GAME_ROOT=../rpg_turnos`.

## Primeiros passos

```powershell
cd admin
npm install
Copy-Item .env.example .env
npm run prisma:generate
npm run prisma:push
npm run import:game
npm start
```

Se o jogo estiver em outra pasta, ajuste `GAME_ROOT` no `.env`.

Admin: `http://127.0.0.1:8300/admin`

Comandos principais:

- `npm run import:game`: importa os JSONs atuais do jogo para o banco.
- `npm run export:game`: exporta o banco para os JSONs do jogo.

Status atual:

- Esquema inicial de dados criado em Prisma.
- Servidor Express + AdminJS criado.
- Exportador inicial preparado para NPCs, hostis, players, tipos de mapa e histórias.
- Editor de mapas ainda será uma tela customizada própria.