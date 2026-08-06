const fs = require('fs/promises');
const path = require('path');
const { dataDir } = require('../config/paths');

async function writeJson(relativePath, payload) {
  const targetPath = path.join(dataDir, relativePath);
  await fs.writeFile(targetPath, JSON.stringify(payload, null, 2), 'utf8');
}

async function readJson(relativePath, fallback) {
  const targetPath = path.join(dataDir, relativePath);
  try {
    const content = await fs.readFile(targetPath, 'utf8');
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

function parseJsonOrDefault(value, fallback) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parsePositiveIntOrNull(value) {
  const numeric = Number.parseInt(value, 10);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function exportHeroes(heroes) {
  return heroes.map((hero) => ({
    name: hero.name,
    classKey: hero.classKey,
    file: hero.battlerAsset?.fileName || hero.file,
    hp: hero.classEntry?.hp ?? hero.hp ?? 100,
  }));
}

function exportUnits(heroes) {
  return {
    version: 1,
    units: heroes.map((hero) => ({
      file: hero.battlerAsset?.fileName || hero.file || '',
      name: hero.name,
      class: hero.classKey || '',
      role: hero.role || 'player',
      team: hero.team || 'player',
      hp: hero.classEntry?.hp ?? hero.hp ?? 0,
      mp: hero.mp ?? 0,
      attack: hero.attack ?? 0,
      defense: hero.classEntry?.armor ?? hero.defense ?? 0,
      speed: hero.speed ?? 0,
      skills: parseJsonOrDefault(hero.skillsJson, []),
    })),
  };
}

function exportClasses(classEntries) {
  return classEntries.map((entry) => ({
    name: entry.name,
    classKey: entry.classKey,
    iconFile: entry.iconFile || '',
    description: entry.description || '',
    hp: entry.hp ?? undefined,
    armor: entry.armor ?? undefined,
    attackType: entry.attackType || undefined,
    baseAttackPoints: entry.baseAttackPoints ?? undefined,
    imgProjetil: entry.imgProjetil || undefined,
    meleeAnimationId: entry.meleeAnimationId || null,
    targetAnimationId: entry.targetAnimationId || null,
    meleeAnimation: entry.meleeAnimation?.file || null,
    targetAnimation: entry.targetAnimation?.file || null,
  }));
}

function exportActions(actions) {
  return {
    actions: actions
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
      .map((entry) => ({
        nome: entry.nome,
        file: entry.iconAsset?.fileName || entry.file,
        type: entry.type,
        rotateIcon: entry.rotateIcon ?? null,
        frequencia: entry.frequencia ?? undefined,
        conditionKey: entry.conditionKey || null,
        restricaoClasse: entry.restricaoClasse || null,
        lootavel: entry.lootavel === true,
        mapMode: entry.mapMode || null,
      })),
  };
}

function exportNpcCatalog(npcEntries) {
  return {
    npcs: npcEntries.map((entry) => ({
      id: entry.battlerAsset?.fileName || entry.file,
      nome: entry.nome,
      idade: entry.idade ?? 0,
      profissao: entry.profissao || '',
      sexo: entry.sexo || '',
      educacao: entry.educacao ?? 0,
      humor: entry.humor ?? 0,
      descricao: entry.descricao || '',
      frameWidth: entry.frameWidth ?? undefined,
      frameHeight: entry.frameHeight ?? undefined,
    })),
  };
}

function exportHostileCatalog(hostileEntries) {
  return {
    hostiles: hostileEntries.map((entry) => ({
      id: entry.battlerAsset?.fileName || entry.file,
      nome: entry.nome,
      classKey: entry.classKey || null,
      hostileClass: entry.classEntry?.attackType || entry.hostileClass || 'melee',
      hp: parsePositiveIntOrNull(entry.classEntry?.hp) ?? parsePositiveIntOrNull(entry.hp) ?? 50,
      armor: entry.armor ?? entry.classEntry?.armor ?? undefined,
      baseAttackPoints: entry.baseAttackPoints ?? entry.classEntry?.baseAttackPoints ?? undefined,
      imgProjetil: entry.imgProjetil || entry.classEntry?.imgProjetil || null,
      meleeAnimation: entry.meleeAnimation?.file || entry.classEntry?.meleeAnimation?.file || null,
      targetAnimation: entry.targetAnimation?.file || entry.classEntry?.targetAnimation?.file || null,
      idade: entry.idade ?? 0,
      profissao: entry.profissao || '',
      sexo: entry.sexo || 'none',
      educacao: entry.educacao ?? 0,
      humor: entry.humor ?? 0,
      descricao: entry.descricao || '',
      frameWidth: entry.frameWidth ?? undefined,
      frameHeight: entry.frameHeight ?? undefined,
    })),
  };
}

function exportAnimations(animations) {
  return {
    animations: animations.map((entry) => ({
      name: entry.name,
      file: entry.file,
      frameWidth: entry.frameWidth,
      frameHeight: entry.frameHeight,
      frameCount: entry.frameCount,
      sheetColumns: entry.sheetColumns ?? undefined,
      sheetRows: entry.sheetRows ?? undefined,
      frameOrder: entry.frameOrder || 'ltr-ttb',
      startX: entry.startX ?? 0,
      startY: entry.startY ?? 0,
      frameSpacingX: entry.frameSpacingX ?? 0,
      frameSpacingY: entry.frameSpacingY ?? 0,
    })),
  };
}

function exportMapTypes(mapTypes) {
  return {
    mapTypes: mapTypes.map((mapType) => ({
      id: mapType.slug,
      file: mapType.autotileAsset?.fileName || '',
      catObstaculos: mapType.obstacleGroup || null,
      catEnfeites: mapType.decorationGroup || null,
    })),
  };
}

function exportOffenses(offenses) {
  return {
    falas: offenses
      .filter((entry) => entry?.active !== false)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
      .map((entry) => entry.text)
      .filter((text) => typeof text === 'string' && text.trim()),
  };
}

function exportStory(story) {
  const phases = [...story.phases].sort((a, b) => a.position - b.position);

  const buildPhaseHostiles = (phase) => phase.hostiles
    .map((entry) => {
      const hostileId = entry.hostile.battlerAsset?.fileName || entry.hostile.file;
      const parsedQuantity = Number.parseInt(entry.quantity, 10);
      const quantity = Number.isInteger(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 1;

      if (!hostileId) {
        return null;
      }

      return {
        id: hostileId,
        count: quantity,
      };
    })
    .filter(Boolean);

  const buildHostileRespawnConfig = (phase) => {
    const parsed = parseJsonOrDefault(phase.hostileRespawnJson, null);
    const zone = typeof parsed?.zone === 'string' && parsed.zone.trim()
      ? parsed.zone.trim()
      : null;

    if (!zone) {
      return null;
    }

    return {
      zone,
    };
  };

  return {
    id: story.slug,
    title: story.title,
    summary: story.summary || '',
    startPhaseId: story.startPhaseId || phases[0]?.slug || null,
    phases: phases.map((phase) => ({
      id: phase.slug,
      title: phase.title,
      mapTypeId: phase.mapType?.slug || null,
      hostile: phase.hostile,
      hostileIntroDialogue: phase.hostileIntroText || null,
      hostileRespawn: buildHostileRespawnConfig(phase),
      npcs: phase.npcs.map((entry) => entry.npc.battlerAsset?.fileName || entry.npc.file),
      hostiles: buildPhaseHostiles(phase),
      dialogueSequence: {
        id: `${phase.slug}-dialogues`,
        steps: [...phase.dialogueNodes]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((node) => ({
            id: node.slug,
            npcId: node.npc?.battlerAsset?.fileName || node.npc?.file || null,
            stepCondition: node.triggerNodeId || null,
            turns: parseJsonOrDefault(node.turnsJson, []),
            'remember-speak': node.rememberText || null,
          })),
      },
    })),
    battleback: story.battlebackAsset ? `assets/Battlebacks/${story.battlebackAsset.fileName}` : null,
    enemyName: story.enemyName || '',
  };
}

async function exportGameData(prisma) {
  const canExportOffenses = typeof prisma?.offenseCatalogEntry?.findMany === 'function';
  const [heroes, npcs, hostiles, classes, animations, mapTypes, stories, offenses, actions] = await Promise.all([
    prisma.heroCatalogEntry.findMany({
      include: { battlerAsset: true, classEntry: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.npcCatalogEntry.findMany({ include: { battlerAsset: true }, orderBy: [{ nome: 'asc' }] }),
    prisma.hostileCatalogEntry.findMany({
      include: {
        battlerAsset: true,
        meleeAnimation: true,
        targetAnimation: true,
        classEntry: {
          include: {
            meleeAnimation: true,
            targetAnimation: true,
          },
        },
      },
      orderBy: [{ nome: 'asc' }],
    }),
    prisma.classCatalogEntry.findMany({
      include: {
        meleeAnimation: true,
        targetAnimation: true,
      },
      orderBy: [{ name: 'asc' }],
    }),
    prisma.animation.findMany({ orderBy: [{ name: 'asc' }] }),
    prisma.mapType.findMany({ include: { autotileAsset: true } }),
    prisma.story.findMany({
      include: {
        battlebackAsset: true,
        phases: {
          include: {
            mapType: true,
            npcs: {
              include: { npc: { include: { battlerAsset: true } } },
              orderBy: [{ sortOrder: 'asc' }],
            },
            hostiles: {
              include: { hostile: { include: { battlerAsset: true } } },
              orderBy: [{ sortOrder: 'asc' }],
            },
            dialogueNodes: {
              include: { npc: { include: { battlerAsset: true } } },
              orderBy: [{ sortOrder: 'asc' }],
            },
          },
          orderBy: [{ position: 'asc' }],
        },
      },
    }),
    canExportOffenses
      ? prisma.offenseCatalogEntry.findMany({
          orderBy: [{ sortOrder: 'asc' }],
        })
      : Promise.resolve([]),
    prisma.actionCatalogEntry.findMany({
      include: { iconAsset: true },
      orderBy: [{ sortOrder: 'asc' }, { nome: 'asc' }],
    }),
  ]);

  const offensePayload = canExportOffenses
    ? exportOffenses(offenses)
    : await readJson('ofensas.json', { falas: [] });

  await Promise.all([
    writeJson('actions.json', exportActions(actions)),
    writeJson('classes.json', exportClasses(classes)),
    writeJson('heroes.json', exportHeroes(heroes)),
    writeJson('units.json', exportUnits(heroes)),
    writeJson('npc.json', exportNpcCatalog(npcs)),
    writeJson('hostiles.json', exportHostileCatalog(hostiles)),
    writeJson('ofensas.json', offensePayload),
    writeJson('animations.json', exportAnimations(animations)),
    writeJson('map-types.json', exportMapTypes(mapTypes)),
    writeJson(path.join('stories', 'index.json'), { stories: stories.map((story) => ({ file: `${story.slug}.json` })) }),
    ...stories.map((story) => writeJson(path.join('stories', `${story.slug}.json`), exportStory(story))),
  ]);
}

function normalizeTargets(targets = []) {
  const normalized = new Set();
  (Array.isArray(targets) ? targets : [targets]).forEach((entry) => {
    if (typeof entry !== 'string') {
      return;
    }

    const value = entry.trim();
    if (value) {
      normalized.add(value);
    }
  });

  return normalized;
}

async function exportByTargets(prisma, targets = []) {
  const requested = normalizeTargets(targets);
  if (requested.size === 0) {
    return;
  }

  const tasks = [];

  if (requested.has('actions')) {
    tasks.push((async () => {
      const actions = await prisma.actionCatalogEntry.findMany({
        include: { iconAsset: true },
        orderBy: [{ sortOrder: 'asc' }, { nome: 'asc' }],
      });
      await writeJson('actions.json', exportActions(actions));
    })());
  }

  if (requested.has('classes')) {
    tasks.push((async () => {
      const classes = await prisma.classCatalogEntry.findMany({
        include: {
          meleeAnimation: true,
          targetAnimation: true,
        },
        orderBy: [{ name: 'asc' }],
      });
      await writeJson('classes.json', exportClasses(classes));
    })());
  }

  if (requested.has('heroes') || requested.has('units')) {
    tasks.push((async () => {
      const heroes = await prisma.heroCatalogEntry.findMany({
        include: { battlerAsset: true, classEntry: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });

      if (requested.has('heroes')) {
        await writeJson('heroes.json', exportHeroes(heroes));
      }
      if (requested.has('units')) {
        await writeJson('units.json', exportUnits(heroes));
      }
    })());
  }

  if (requested.has('npc')) {
    tasks.push((async () => {
      const npcs = await prisma.npcCatalogEntry.findMany({
        include: { battlerAsset: true },
        orderBy: [{ nome: 'asc' }],
      });
      await writeJson('npc.json', exportNpcCatalog(npcs));
    })());
  }

  if (requested.has('hostiles')) {
    tasks.push((async () => {
      const hostiles = await prisma.hostileCatalogEntry.findMany({
        include: {
          battlerAsset: true,
          meleeAnimation: true,
          targetAnimation: true,
          classEntry: {
            include: {
              meleeAnimation: true,
              targetAnimation: true,
            },
          },
        },
        orderBy: [{ nome: 'asc' }],
      });
      await writeJson('hostiles.json', exportHostileCatalog(hostiles));
    })());
  }

  if (requested.has('ofensas')) {
    tasks.push((async () => {
      const canExportOffenses = typeof prisma?.offenseCatalogEntry?.findMany === 'function';
      const payload = canExportOffenses
        ? exportOffenses(await prisma.offenseCatalogEntry.findMany({ orderBy: [{ sortOrder: 'asc' }] }))
        : await readJson('ofensas.json', { falas: [] });
      await writeJson('ofensas.json', payload);
    })());
  }

  if (requested.has('animations')) {
    tasks.push((async () => {
      const animations = await prisma.animation.findMany({ orderBy: [{ name: 'asc' }] });
      await writeJson('animations.json', exportAnimations(animations));
    })());
  }

  if (requested.has('map-types')) {
    tasks.push((async () => {
      const mapTypes = await prisma.mapType.findMany({ include: { autotileAsset: true } });
      await writeJson('map-types.json', exportMapTypes(mapTypes));
    })());
  }

  if (requested.has('stories')) {
    tasks.push((async () => {
      const stories = await prisma.story.findMany({
        include: {
          battlebackAsset: true,
          phases: {
            include: {
              mapType: true,
              npcs: {
                include: { npc: { include: { battlerAsset: true } } },
                orderBy: [{ sortOrder: 'asc' }],
              },
              hostiles: {
                include: { hostile: { include: { battlerAsset: true } } },
                orderBy: [{ sortOrder: 'asc' }],
              },
              dialogueNodes: {
                include: { npc: { include: { battlerAsset: true } } },
                orderBy: [{ sortOrder: 'asc' }],
              },
            },
            orderBy: [{ position: 'asc' }],
          },
        },
      });

      await writeJson(path.join('stories', 'index.json'), {
        stories: stories.map((story) => ({ file: `${story.slug}.json` })),
      });

      await Promise.all(
        stories.map((story) => writeJson(path.join('stories', `${story.slug}.json`), exportStory(story)))
      );
    })());
  }

  await Promise.all(tasks);
}

module.exports = {
  exportGameData,
  exportByTargets,
};
