const path = require('path');
const fs = require('fs');

const adminRoot = path.resolve(__dirname, '..', '..');
const workspaceRootCandidates = [
  process.env.GAME_ROOT,
  '../rpg-turnos',
  '../rpg_turno',
].filter(Boolean);

const workspaceRoot = workspaceRootCandidates
  .map((candidate) => path.resolve(adminRoot, candidate))
  .find((candidatePath) => fs.existsSync(path.join(candidatePath, 'data')) && fs.existsSync(path.join(candidatePath, 'assets')))
  || path.resolve(adminRoot, '../rpg-turnos');
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