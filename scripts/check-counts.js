const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const [
    units,
    heroes,
    npcs,
    hostiles,
    mapTypes,
    stories,
    phases,
  ] = await Promise.all([
    prisma.unitCatalogEntry.count(),
    prisma.heroCatalogEntry.count(),
    prisma.npcCatalogEntry.count(),
    prisma.hostileCatalogEntry.count(),
    prisma.mapType.count(),
    prisma.story.count(),
    prisma.storyPhase.count(),
  ]);

  console.log(
    JSON.stringify(
      { units, heroes, npcs, hostiles, mapTypes, stories, phases },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
