const path = require('path');
const fs = require('fs');

const adminRoot = path.resolve(__dirname, '..', '..');
const workspaceRoot = path.resolve(adminRoot, process.env.GAME_ROOT || '../rpg_turno');
const dataDir = path.join(workspaceRoot, 'data');
const assetsDir = path.join(workspaceRoot, 'assets');

if (!fs.existsSync(dataDir) || !fs.existsSync(assetsDir)) {
  throw new Error(
    `GAME_ROOT invalido: ${workspaceRoot}. Ajuste GAME_ROOT para a pasta do jogo (que contenha data/ e assets/).`
  );
}

module.exports = {
  adminRoot,
  workspaceRoot,
  dataDir,
  assetsDir,
};