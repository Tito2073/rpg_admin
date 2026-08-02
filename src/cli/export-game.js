const { PrismaClient } = require('@prisma/client');
const { exportGameData } = require('../exporters/game-export');

async function main() {
  const prisma = new PrismaClient();
  try {
    await exportGameData(prisma);
    console.log('Exportacao concluida.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});