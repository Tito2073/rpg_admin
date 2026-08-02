const { PrismaClient } = require('@prisma/client');
const { importGameData } = require('../importers/game-import');

async function main() {
  const prisma = new PrismaClient();
  try {
    await importGameData(prisma);
    console.log('Importacao concluida.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});