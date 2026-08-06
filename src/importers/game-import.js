const fs = require('fs/promises');
const path = require('path');
const { dataDir } = require('../config/paths');

const DEFAULT_HERO_HP = 100;
const DEFAULT_HOSTILE_HP = 50;
const DEFAULT_HOSTILE_CLASS = 'melee';

async function readJson(relativePath, fallback) {
  const filePath = path.join(dataDir, relativePath);
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

function normalizeHostileList(payload) {
  if (Array.isArray(payload?.hostiles)) {
    return payload.hostiles;
  }
  if (Array.isArray(payload?.npcs)) {
    return payload.npcs;
  }
  return [];
}

function parseIntegerOrNull(value) {
  return Number.isInteger(value) ? value : null;
}

function parsePositiveIntegerOrFallback(value, fallback) {
  const numeric = Number.parseInt(value, 10);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}

function parseHostileClass(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'range') {
    return 'range';
  }
  return DEFAULT_HOSTILE_CLASS;
}

function parseAttackType(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'range') {
    return 'range';
  }
  if (normalized === 'melee') {
    return 'melee';
  }
  return null;
}

function normalizeProjectilePath(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function parseFrameOrder(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return normalized || 'ltr-ttb';
}

function parseActionMapMode(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'hostile') {
    return 'hostile';
  }
  if (normalized === 'peaceful' || normalized === 'pacific' || normalized === 'pacifico') {
    return 'peaceful';
  }
  if (normalized === 'all' || normalized === 'ambos') {
    return 'all';
  }
  return null;
}

async function importAnimations(prisma) {
  const payload = await readJson('animations.json', { animations: [] });
  const animations = Array.isArray(payload?.animations) ? payload.animations : [];

  await prisma.animation.deleteMany();

  for (const animation of animations) {
    const file = typeof animation?.file === 'string' ? animation.file.trim() : '';
    const name = typeof animation?.name === 'string' ? animation.name.trim() : file;
    if (!file || !name) {
      continue;
    }

    await prisma.animation.create({
      data: {
        name,
        file,
        frameWidth: parsePositiveIntegerOrFallback(animation.frameWidth, 32),
        frameHeight: parsePositiveIntegerOrFallback(animation.frameHeight, 32),
        frameCount: parsePositiveIntegerOrFallback(animation.frameCount, 1),
        sheetColumns: parseIntegerOrNull(animation.sheetColumns),
        sheetRows: parseIntegerOrNull(animation.sheetRows),
        frameOrder: parseFrameOrder(animation.frameOrder),
        startX: parseIntegerOrNull(animation.startX) ?? 0,
        startY: parseIntegerOrNull(animation.startY) ?? 0,
        frameSpacingX: parseIntegerOrNull(animation.frameSpacingX) ?? 0,
        frameSpacingY: parseIntegerOrNull(animation.frameSpacingY) ?? 0,
      },
    });
  }
}

async function importActions(prisma) {
  const actionsPayload = await readJson('actions.json', { actions: [] });
  const actions = Array.isArray(actionsPayload?.actions)
    ? actionsPayload.actions
    : Array.isArray(actionsPayload)
      ? actionsPayload
      : [];

  await prisma.actionCatalogEntry.deleteMany();

  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index];
    const fileName = typeof action?.file === 'string' ? action.file.trim() : '';
    if (!fileName) {
      continue;
    }

    const iconAsset = await upsertAsset(prisma, {
      kind: 'icon',
      fileName,
      relativePath: `assets/Icons/${fileName}`,
    });

    const rotateIcon = Number.parseInt(action?.rotateIcon, 10);
    const frequencia = Number.parseInt(action?.frequencia, 10);

    await prisma.actionCatalogEntry.create({
      data: {
        sortOrder: index,
        nome: typeof action?.nome === 'string' && action.nome.trim() ? action.nome.trim() : fileName,
        type: typeof action?.type === 'string' && action.type.trim() ? action.type.trim() : 'interaction',
        file: fileName,
        rotateIcon: Number.isInteger(rotateIcon) ? rotateIcon : null,
        frequencia: Number.isInteger(frequencia) ? frequencia : null,
        conditionKey: typeof action?.conditionKey === 'string' && action.conditionKey.trim()
          ? action.conditionKey.trim()
          : null,
        restricaoClasse: typeof action?.restricaoClasse === 'string' && action.restricaoClasse.trim()
          ? action.restricaoClasse.trim()
          : null,
        lootavel: action?.lootavel === true,
        mapMode: parseActionMapMode(action?.mapMode),
        iconAssetId: iconAsset.id,
      },
    });
  }
}

async function resolveAnimationId(prisma, fileOrName) {
  if (typeof fileOrName !== 'string' || !fileOrName.trim()) {
    return null;
  }

  const value = fileOrName.trim();
  const animation = await prisma.animation.findFirst({
    where: {
      OR: [
        { id: value },
        { file: value },
        { name: value },
      ],
    },
  });

  return animation?.id || null;
}

async function importClasses(prisma) {
  const classesPayload = await readJson('classes.json', []);
  const classes = Array.isArray(classesPayload?.classes)
    ? classesPayload.classes
    : Array.isArray(classesPayload)
      ? classesPayload
      : [];

  await prisma.classCatalogEntry.deleteMany();

  for (const classEntry of classes) {
    const classKey = typeof classEntry?.classKey === 'string' ? classEntry.classKey.trim() : '';
    if (!classKey) {
      continue;
    }

    const iconFile = typeof classEntry?.iconFile === 'string' ? classEntry.iconFile.trim() : '';
    const iconAsset = iconFile
      ? await upsertAsset(prisma, {
          kind: 'icon',
          fileName: iconFile,
          relativePath: `assets/Icons/${iconFile}`,
        })
      : null;

    const meleeAnimationId = await resolveAnimationId(
      prisma,
      classEntry.meleeAnimationId || classEntry.meleeAnimation || classEntry.meleeAnimationFile
    );
    const targetAnimationId = await resolveAnimationId(
      prisma,
      classEntry.targetAnimationId || classEntry.targetAnimation || classEntry.targetAnimationFile
    );

    await prisma.classCatalogEntry.create({
      data: {
        classKey,
        name: typeof classEntry?.name === 'string' && classEntry.name.trim()
          ? classEntry.name.trim()
          : classKey,
        iconFile: iconFile || null,
        description: typeof classEntry?.description === 'string' ? classEntry.description : null,
        hp: parseIntegerOrNull(classEntry.hp),
        armor: parseIntegerOrNull(classEntry.armor),
        attackType: parseAttackType(classEntry.attackType),
        baseAttackPoints: parseIntegerOrNull(classEntry.baseAttackPoints),
        imgProjetil: normalizeProjectilePath(classEntry.imgProjetil),
        meleeAnimationId,
        targetAnimationId,
        iconAssetId: iconAsset?.id || null,
      },
    });
  }
}

async function upsertAsset(prisma, { kind, fileName, relativePath }) {
  const key = `${kind}:${fileName}`;
  return prisma.asset.upsert({
    where: { key },
    create: {
      key,
      kind,
      fileName,
      relativePath,
    },
    update: {
      fileName,
      relativePath,
    },
  });
}

async function ensureCharacterAssets(prisma, fileName) {
  if (!fileName) {
    return { characterAssetId: null, selfieAssetId: null };
  }

  const [characterAsset, selfieAsset] = await Promise.all([
    upsertAsset(prisma, {
      kind: 'character',
      fileName,
      relativePath: `assets/Characters/${fileName}`,
    }),
    upsertAsset(prisma, {
      kind: 'selfie',
      fileName,
      relativePath: `assets/Selfies/${fileName}`,
    }),
  ]);

  return {
    characterAssetId: characterAsset.id,
    selfieAssetId: selfieAsset.id,
  };
}

async function importUnits(prisma) {
  const unitsPayload = await readJson('units.json', { units: [] });
  const units = Array.isArray(unitsPayload?.units) ? unitsPayload.units : [];

  await prisma.unitCatalogEntry.deleteMany();

  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index];
    if (!unit?.file) {
      continue;
    }

    const battlerAsset = await upsertAsset(prisma, {
      kind: 'battler',
      fileName: unit.file,
      relativePath: `assets/Battlers/${unit.file}`,
    });

    await prisma.unitCatalogEntry.create({
      data: {
        sortOrder: index,
        file: String(unit.file),
        name: unit.name || String(unit.file),
        classKey: unit.class || null,
        role: unit.role || null,
        team: unit.team || null,
        hp: parseIntegerOrNull(unit.hp),
        mp: parseIntegerOrNull(unit.mp),
        attack: parseIntegerOrNull(unit.attack),
        defense: parseIntegerOrNull(unit.defense),
        speed: parseIntegerOrNull(unit.speed),
        skillsJson: JSON.stringify(Array.isArray(unit.skills) ? unit.skills : []),
        battlerAssetId: battlerAsset.id,
      },
    });
  }
}

async function importHeroes(prisma) {
  const heroesPayload = await readJson('heroes.json', []);
  const heroes = Array.isArray(heroesPayload?.heroes) ? heroesPayload.heroes : Array.isArray(heroesPayload) ? heroesPayload : [];

  const unitByFile = new Map(
    (await prisma.unitCatalogEntry.findMany()).map((entry) => [entry.file, entry])
  );

  await prisma.heroCatalogEntry.deleteMany();

  for (let index = 0; index < heroes.length; index += 1) {
    const hero = heroes[index];
    const fileName = String(hero?.file || '').trim();
    if (!fileName) {
      continue;
    }

    const battlerAsset = await upsertAsset(prisma, {
      kind: 'battler',
      fileName,
      relativePath: `assets/Battlers/${fileName}`,
    });
    const extraAssets = await ensureCharacterAssets(prisma, fileName);
    const unit = unitByFile.get(fileName);

    await prisma.heroCatalogEntry.create({
      data: {
        sortOrder: index,
        name: hero.name || fileName,
        classKey: hero.classKey || unit?.classKey || 'warrior',
        role: unit?.role || 'player',
        team: unit?.team || 'player',
        file: fileName,
        hp: parsePositiveIntegerOrFallback(hero.hp, parsePositiveIntegerOrFallback(unit?.hp, DEFAULT_HERO_HP)),
        mp: unit?.mp ?? null,
        attack: unit?.attack ?? null,
        defense: unit?.defense ?? null,
        speed: unit?.speed ?? null,
        skillsJson: unit?.skillsJson || JSON.stringify([]),
        battlerAssetId: battlerAsset.id,
        characterAssetId: extraAssets.characterAssetId,
        selfieAssetId: extraAssets.selfieAssetId,
      },
    });
  }
}

async function importNpcCatalog(prisma) {
  const npcPayload = await readJson('npc.json', { npcs: [] });
  const npcs = Array.isArray(npcPayload?.npcs) ? npcPayload.npcs : [];

  await prisma.npcCatalogEntry.deleteMany();

  for (const npc of npcs) {
    const fileName = String(npc.id || '').trim();
    const battlerAsset = fileName
      ? await upsertAsset(prisma, {
          kind: 'battler',
          fileName,
          relativePath: `assets/Battlers/${fileName}`,
        })
      : null;
    const extraAssets = await ensureCharacterAssets(prisma, fileName);

    await prisma.npcCatalogEntry.create({
      data: {
        file: fileName || `npc-${Date.now()}`,
        nome: npc.nome || fileName || 'NPC',
        idade: parseIntegerOrNull(npc.idade),
        profissao: npc.profissao || null,
        sexo: npc.sexo || null,
        educacao: parseIntegerOrNull(npc.educacao),
        humor: parseIntegerOrNull(npc.humor),
        descricao: npc.descricao || null,
        frameWidth: parseIntegerOrNull(npc.frameWidth),
        frameHeight: parseIntegerOrNull(npc.frameHeight),
        battlerAssetId: battlerAsset?.id || null,
        characterAssetId: extraAssets.characterAssetId,
        selfieAssetId: extraAssets.selfieAssetId,
      },
    });
  }
}

async function importHostiles(prisma) {
  const hostilePayload = await readJson('hostiles.json', { hostiles: [] });
  const hostiles = normalizeHostileList(hostilePayload);

  await prisma.hostileCatalogEntry.deleteMany();

  for (const hostile of hostiles) {
    const fileName = String(hostile.id || '').trim();
    const battlerAsset = fileName
      ? await upsertAsset(prisma, {
          kind: 'battler',
          fileName,
          relativePath: `assets/Battlers/${fileName}`,
        })
      : null;
    const extraAssets = await ensureCharacterAssets(prisma, fileName);
    const meleeAnimationId = await resolveAnimationId(prisma, hostile.meleeAnimation || hostile.meleeAnimationFile);
    const targetAnimationId = await resolveAnimationId(prisma, hostile.targetAnimation || hostile.targetAnimationFile);

    await prisma.hostileCatalogEntry.create({
      data: {
        file: fileName || `hostile-${Date.now()}`,
        nome: hostile.nome || fileName || 'Hostile',
        classKey: typeof hostile.classKey === 'string' && hostile.classKey.trim() ? hostile.classKey.trim() : null,
        hostileClass: parseHostileClass(hostile.hostileClass),
        idade: parseIntegerOrNull(hostile.idade),
        profissao: hostile.profissao || null,
        sexo: hostile.sexo || null,
        educacao: parseIntegerOrNull(hostile.educacao),
        humor: parseIntegerOrNull(hostile.humor),
        descricao: hostile.descricao || null,
        hp: parsePositiveIntegerOrFallback(hostile.hp, DEFAULT_HOSTILE_HP),
        armor: parseIntegerOrNull(hostile.armor ?? hostile.defense),
        baseAttackPoints: parseIntegerOrNull(
          hostile.baseAttackPoints ?? hostile.baseDamage ?? hostile.attack
        ),
        imgProjetil: normalizeProjectilePath(hostile.imgProjetil),
        meleeAnimationId,
        targetAnimationId,
        frameWidth: parseIntegerOrNull(hostile.frameWidth),
        frameHeight: parseIntegerOrNull(hostile.frameHeight),
        battlerAssetId: battlerAsset?.id || null,
        characterAssetId: extraAssets.characterAssetId,
        selfieAssetId: extraAssets.selfieAssetId,
      },
    });
  }
}

async function importOffenses(prisma) {
  if (typeof prisma?.offenseCatalogEntry?.create !== 'function') {
    return;
  }

  const offensesPayload = await readJson('ofensas.json', { falas: [] });
  const offenses = Array.isArray(offensesPayload?.falas)
    ? offensesPayload.falas
    : Array.isArray(offensesPayload?.ofensas)
      ? offensesPayload.ofensas
    : Array.isArray(offensesPayload)
      ? offensesPayload
      : [];

  await prisma.offenseCatalogEntry.deleteMany();

  for (let index = 0; index < offenses.length; index += 1) {
    const text = typeof offenses[index] === 'string' ? offenses[index].trim() : '';
    if (!text) {
      continue;
    }

    await prisma.offenseCatalogEntry.create({
      data: {
        sortOrder: index,
        text,
        active: true,
      },
    });
  }
}

async function importMapTypes(prisma) {
  const mapTypesPayload = await readJson('map-types.json', { mapTypes: [] });
  const mapTypes = Array.isArray(mapTypesPayload?.mapTypes) ? mapTypesPayload.mapTypes : [];

  for (const mapType of mapTypes) {
    if (!mapType?.id || !mapType?.file) {
      continue;
    }

    const autotileAsset = await upsertAsset(prisma, {
      kind: 'autotile',
      fileName: mapType.file,
      relativePath: `assets/Autotiles/${mapType.file}`,
    });

    await prisma.mapType.upsert({
      where: { slug: String(mapType.id) },
      create: {
        slug: String(mapType.id),
        name: String(mapType.id),
        obstacleGroup: mapType.catObstaculos || null,
        decorationGroup: mapType.catEnfeites || null,
        autotileAssetId: autotileAsset.id,
      },
      update: {
        obstacleGroup: mapType.catObstaculos || null,
        decorationGroup: mapType.catEnfeites || null,
        autotileAssetId: autotileAsset.id,
      },
    });
  }
}

async function resolveNpcByBattler(prisma, fileName) {
  if (!fileName) {
    return null;
  }

  return prisma.npcCatalogEntry.findFirst({
    where: {
      OR: [
        { file: String(fileName) },
        { battlerAsset: { fileName: String(fileName) } },
      ],
    },
  });
}

async function resolveHostileByBattler(prisma, fileName) {
  if (!fileName) {
    return null;
  }

  return prisma.hostileCatalogEntry.findFirst({
    where: {
      OR: [
        { file: String(fileName) },
        { battlerAsset: { fileName: String(fileName) } },
      ],
    },
  });
}

async function importStories(prisma) {
  const storyIndex = await readJson(path.join('stories', 'index.json'), { stories: [] });
  const storyEntries = Array.isArray(storyIndex?.stories) ? storyIndex.stories : [];

  for (const entry of storyEntries) {
    if (!entry?.file) {
      continue;
    }

    const storyPayload = await readJson(path.join('stories', entry.file), null);
    if (!storyPayload?.id) {
      continue;
    }

    let battlebackAssetId = null;
    const battlebackFile = String(storyPayload.battleback || '')
      .split('/')
      .filter(Boolean)
      .pop();
    if (battlebackFile) {
      const battlebackAsset = await upsertAsset(prisma, {
        kind: 'battleback',
        fileName: battlebackFile,
        relativePath: `assets/Battlebacks/${battlebackFile}`,
      });
      battlebackAssetId = battlebackAsset.id;
    }

    const story = await prisma.story.upsert({
      where: { slug: String(storyPayload.id) },
      create: {
        slug: String(storyPayload.id),
        title: storyPayload.title || String(storyPayload.id),
        summary: storyPayload.summary || null,
        startPhaseId: storyPayload.startPhaseId || null,
        enemyName: storyPayload.enemyName || null,
        battlebackAssetId,
      },
      update: {
        title: storyPayload.title || String(storyPayload.id),
        summary: storyPayload.summary || null,
        startPhaseId: storyPayload.startPhaseId || null,
        enemyName: storyPayload.enemyName || null,
        battlebackAssetId,
      },
    });

    await prisma.storyPhase.deleteMany({ where: { storyId: story.id } });

    const phases = Array.isArray(storyPayload.phases) ? storyPayload.phases : [];
    for (let idx = 0; idx < phases.length; idx += 1) {
      const phase = phases[idx];
      const mapType = phase?.mapTypeId
        ? await prisma.mapType.findUnique({ where: { slug: String(phase.mapTypeId) } })
        : null;
      const hostileIntroText = phase?.hostileIntroDialogue == null
        ? null
        : typeof phase.hostileIntroDialogue === 'string'
          ? phase.hostileIntroDialogue
          : JSON.stringify(phase.hostileIntroDialogue);

      const createdPhase = await prisma.storyPhase.create({
        data: {
          storyId: story.id,
          slug: String(phase.id || `phase-${idx + 1}`),
          title: phase.title || `Fase ${idx + 1}`,
          position: idx,
          hostile: Boolean(phase.hostile),
          hostileIntroText,
          hostileRespawnJson: phase.hostileRespawn ? JSON.stringify(phase.hostileRespawn) : null,
          mapTypeId: mapType?.id || null,
        },
      });

      const npcs = Array.isArray(phase.npcs) ? phase.npcs : [];
      const seenNpcIds = new Set();
      for (let npcOrder = 0; npcOrder < npcs.length; npcOrder += 1) {
        const npc = await resolveNpcByBattler(prisma, npcs[npcOrder]);
        if (!npc || seenNpcIds.has(npc.id)) {
          continue;
        }
        seenNpcIds.add(npc.id);
        await prisma.storyPhaseNpc.create({
          data: {
            phaseId: createdPhase.id,
            npcId: npc.id,
            sortOrder: npcOrder,
          },
        });
      }

      const hostiles = Array.isArray(phase.hostiles) ? phase.hostiles : [];
      const hostileAggregateById = new Map();
      for (let hostileOrder = 0; hostileOrder < hostiles.length; hostileOrder += 1) {
        const rawEntry = hostiles[hostileOrder];
        const hostileRef = typeof rawEntry === 'string'
          ? rawEntry
          : (typeof rawEntry?.id === 'string' && rawEntry.id.trim()
            ? rawEntry.id.trim()
            : typeof rawEntry?.hostileId === 'string' && rawEntry.hostileId.trim()
              ? rawEntry.hostileId.trim()
              : typeof rawEntry?.file === 'string' && rawEntry.file.trim()
                ? rawEntry.file.trim()
                : null);

        const hostile = await resolveHostileByBattler(prisma, hostileRef);
        if (!hostile) {
          continue;
        }

        const parsedCount = Number.parseInt(rawEntry?.count ?? rawEntry?.quantity, 10);
        const normalizedCount = Number.isInteger(parsedCount) && parsedCount > 0 ? parsedCount : 1;
        const existing = hostileAggregateById.get(hostile.id);

        if (existing) {
          existing.quantity += normalizedCount;
          continue;
        }

        hostileAggregateById.set(hostile.id, {
          hostileId: hostile.id,
          sortOrder: hostileOrder,
          quantity: normalizedCount,
        });
      }

      for (const hostileEntry of hostileAggregateById.values()) {
        await prisma.storyPhaseHostile.create({
          data: {
            phaseId: createdPhase.id,
            hostileId: hostileEntry.hostileId,
            sortOrder: hostileEntry.sortOrder,
            quantity: hostileEntry.quantity,
          },
        });
      }

      const steps = Array.isArray(phase?.dialogueSequence?.steps) ? phase.dialogueSequence.steps : [];
      for (let stepOrder = 0; stepOrder < steps.length; stepOrder += 1) {
        const step = steps[stepOrder];
        const npc = await resolveNpcByBattler(prisma, step?.npcId);

        await prisma.storyDialogueNode.create({
          data: {
            phaseId: createdPhase.id,
            slug: String(step?.id || `step-${stepOrder + 1}`),
            nodeType: 'dialogue',
            triggerNodeId: step?.stepCondition || null,
            npcId: npc?.id || null,
            rememberText: step?.['remember-speak'] || null,
            turnsJson: JSON.stringify(Array.isArray(step?.turns) ? step.turns : []),
            sortOrder: stepOrder,
          },
        });
      }
    }
  }
}

async function importGameData(prisma) {
  // Remove dependent links before replacing NPC/Hostile catalogs.
  await prisma.story.deleteMany();
  await prisma.mapObject.updateMany({
    where: { npcId: { not: null } },
    data: { npcId: null },
  });
  await prisma.mapObject.updateMany({
    where: { hostileId: { not: null } },
    data: { hostileId: null },
  });
  await prisma.heroCatalogEntry.deleteMany();
  await prisma.hostileCatalogEntry.deleteMany();

  await importAnimations(prisma);
  await importActions(prisma);
  await importClasses(prisma);
  await importUnits(prisma);
  await importHeroes(prisma);
  await importNpcCatalog(prisma);
  await importHostiles(prisma);
  await importOffenses(prisma);
  await importMapTypes(prisma);
  await importStories(prisma);
}

module.exports = {
  importGameData,
};
