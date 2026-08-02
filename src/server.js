const express = require('express');
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const { exportGameData, exportByTargets } = require('./exporters/game-export');
const { importGameData } = require('./importers/game-import');
const { assetsDir } = require('./config/paths');

const prisma = new PrismaClient();
const app = express();
const port = Number.parseInt(process.env.PORT || '8300', 10);
let httpServer = null;

const ASSET_DIR_BY_KIND = {
  battler: 'Battlers',
  character: 'Characters',
  selfie: 'Selfies',
  icon: 'Icons',
  battleback: 'Battlebacks',
  autotile: 'Autotiles',
};

function readAssetFilesByKind(kind) {
  const folderName = ASSET_DIR_BY_KIND[kind];
  if (!folderName) {
    return [];
  }

  const directoryPath = path.join(assetsDir, folderName);
  if (!fs.existsSync(directoryPath)) {
    return [];
  }

  return fs
    .readdirSync(directoryPath)
    .filter((fileName) => /\.(png|webp|gif|jpg|jpeg)$/i.test(fileName));
}

async function buildAssetSelectOptions() {
  const assetKinds = ['battler', 'character', 'selfie', 'icon', 'battleback', 'autotile'];
  const assets = await prisma.asset.findMany({
    where: {
      kind: { in: assetKinds },
    },
    orderBy: [{ fileName: 'asc' }],
  });

  const idOptionsByKind = {};
  const fileOptionsByKind = {};
  const idsByKindAndFile = {};
  const previewsByFile = {};
  const previewsByAssetId = {};

  assetKinds.forEach((kind) => {
    idOptionsByKind[kind] = [];
    fileOptionsByKind[kind] = [];
    idsByKindAndFile[kind] = {};
  });

  assets.forEach((asset) => {
    const kind = asset.kind;
    const fileName = asset.fileName;
    const relativeWithoutAssets = asset.relativePath.replace(/^assets\//, '');
    const absoluteAssetPath = path.join(assetsDir, relativeWithoutAssets);
    const hasPhysicalFile = fs.existsSync(absoluteAssetPath);

    idOptionsByKind[kind].push({
      value: asset.id,
      label: `${fileName} (${asset.relativePath})`,
    });

    fileOptionsByKind[kind].push({
      value: fileName,
      label: fileName,
    });

    idsByKindAndFile[kind][fileName] = asset.id;

    if (hasPhysicalFile) {
      previewsByFile[fileName] = previewsByFile[fileName] || {};
      previewsByFile[fileName][kind] = relativeWithoutAssets;
      previewsByAssetId[asset.id] = relativeWithoutAssets;
    }
  });

  assetKinds.forEach((kind) => {
    const fileNamesFromDb = new Set(fileOptionsByKind[kind].map((entry) => entry.value));
    const folderName = ASSET_DIR_BY_KIND[kind];
    const fileNamesFromDisk = readAssetFilesByKind(kind);

    fileNamesFromDisk.forEach((fileName) => {
      if (!fileNamesFromDb.has(fileName)) {
        fileOptionsByKind[kind].push({
          value: fileName,
          label: fileName,
        });
      }

      previewsByFile[fileName] = previewsByFile[fileName] || {};
      previewsByFile[fileName][kind] = `${folderName}/${fileName}`;
    });

    fileOptionsByKind[kind].sort((left, right) => left.label.localeCompare(right.label));
  });

  const tripletAutoFillByFile = {};
  Object.keys(previewsByFile).forEach((fileName) => {
    if (previewsByFile[fileName].battler) {
      tripletAutoFillByFile[fileName] = {
        battlerAssetId: idsByKindAndFile.battler[fileName] || null,
        characterAssetId: idsByKindAndFile.character[fileName] || null,
        selfieAssetId: idsByKindAndFile.selfie[fileName] || null,
      };
    }
  });

  const singleKindAutoFillByFile = (kind, targetField) => {
    const map = {};
    Object.entries(idsByKindAndFile[kind]).forEach(([fileName, id]) => {
      map[fileName] = { [targetField]: id };
    });
    return map;
  };

  return {
    idOptionsByKind,
    fileOptionsByKind,
    previewsByFile,
    previewsByAssetId,
    autoFillMaps: {
      tripletByFile: tripletAutoFillByFile,
      battlerByFile: singleKindAutoFillByFile('battler', 'battlerAssetId'),
      iconByFile: singleKindAutoFillByFile('icon', 'iconAssetId'),
      battlebackByFile: singleKindAutoFillByFile('battleback', 'battlebackAssetId'),
      autotileByFile: singleKindAutoFillByFile('autotile', 'autotileAssetId'),
    },
  };
}

async function buildAnimationSelectOptions() {
  const animations = await prisma.animation.findMany({ orderBy: [{ name: 'asc' }, { file: 'asc' }] });
  const options = animations.map((entry) => ({
    value: entry.id,
    label: entry.name ? `${entry.name} (${entry.file})` : entry.file,
  }));

  const previewsById = {};
  const metadataById = {};
  animations.forEach((entry) => {
    if (!entry?.id || !entry?.file) {
      return;
    }
    previewsById[entry.id] = {
      animation: `Animations/${entry.file}`,
    };
    metadataById[entry.id] = {
      frameWidth: entry.frameWidth,
      frameHeight: entry.frameHeight,
      frameCount: entry.frameCount,
      sheetColumns: entry.sheetColumns,
      sheetRows: entry.sheetRows,
      frameOrder: entry.frameOrder,
      startX: entry.startX,
      startY: entry.startY,
      frameSpacingX: entry.frameSpacingX,
      frameSpacingY: entry.frameSpacingY,
    };
  });

  return { options, previewsById, metadataById };
}

async function buildClassKeySelectOptions() {
  const classes = await prisma.classCatalogEntry.findMany({ orderBy: [{ name: 'asc' }, { classKey: 'asc' }] });
  return classes.map((entry) => ({
    value: entry.classKey,
    label: `${entry.name} (${entry.classKey})`,
  }));
}

async function buildStoryPhaseHostileSelectOptions() {
  const [phases, hostiles] = await Promise.all([
    prisma.storyPhase.findMany({
      include: { story: true },
      orderBy: [{ story: { slug: 'asc' } }, { position: 'asc' }, { slug: 'asc' }],
    }),
    prisma.hostileCatalogEntry.findMany({
      orderBy: [{ nome: 'asc' }, { file: 'asc' }],
    }),
  ]);

  const phaseOptions = phases.map((phase) => ({
    value: phase.id,
    label: `${phase.story?.slug || 'story'} / ${phase.slug} - ${phase.title}`,
  }));

  const hostileOptions = hostiles.map((hostile) => ({
    value: hostile.id,
    label: `${hostile.nome || hostile.file} (${hostile.file})`,
  }));

  return {
    phaseOptions,
    hostileOptions,
  };
}

function buildAnimationFileOptions() {
  const animationDir = path.join(assetsDir, 'Animations');
  const fileNames = fs.existsSync(animationDir)
    ? fs.readdirSync(animationDir).filter((fileName) => /\.(png|webp|gif|jpg|jpeg)$/i.test(fileName))
    : [];

  return fileNames.map((fileName) => ({
    value: fileName,
    label: fileName,
  }));
}

function buildAdmin(
  AdminJS,
  getModelByName,
  assetUi,
  animationUi,
  classKeySelectOptions,
  storyPhaseHostileSelectOptions,
  assetSelectWithPreviewComponent,
  battlerListThumbComponent,
  componentLoader
) {
  const EXPORT_TARGETS_BY_RESOURCE = {
    Asset: ['heroes', 'units', 'npc', 'hostiles', 'map-types', 'stories'],
    ClassCatalogEntry: ['classes', 'heroes', 'units', 'hostiles'],
    HeroCatalogEntry: ['heroes', 'units'],
    NpcCatalogEntry: ['npc', 'stories'],
    HostileCatalogEntry: ['hostiles', 'stories'],
    Animation: ['animations', 'classes', 'hostiles'],
    MapType: ['map-types', 'stories'],
    Story: ['stories'],
    StoryPhase: ['stories'],
    StoryPhaseNpc: ['stories'],
    StoryPhaseHostile: ['stories'],
    StoryDialogueNode: ['stories'],
    OffenseCatalogEntry: ['ofensas'],
  };

  const hasRecordErrors = (response) => {
    const errors = response?.record?.errors;
    return !!errors && Object.keys(errors).length > 0;
  };

  const buildPartialExportAfterHook = (resourceName) => async (response, request) => {
    if (request?.method !== 'post' || hasRecordErrors(response)) {
      return response;
    }

    const targets = EXPORT_TARGETS_BY_RESOURCE[resourceName] || [];
    if (targets.length === 0) {
      return response;
    }

    try {
      await exportByTargets(prisma, targets);
    } catch (error) {
      console.error(`Partial export failed for ${resourceName}:`, error);
      return {
        ...response,
        notice: {
          message: 'Registro salvo, mas a exportacao parcial falhou. Rode exportacao completa.',
          type: 'error',
        },
      };
    }

    return response;
  };

  const withPartialExport = (resourceName, resourceOptions = {}) => {
    const actions = { ...(resourceOptions.actions || {}) };
    const afterHook = buildPartialExportAfterHook(resourceName);

    ['new', 'edit', 'delete', 'bulkDelete'].forEach((actionName) => {
      const existingAction = { ...(actions[actionName] || {}) };
      const existingAfter = Array.isArray(existingAction.after)
        ? existingAction.after
        : existingAction.after
          ? [existingAction.after]
          : [];

      existingAction.after = [...existingAfter, afterHook];
      actions[actionName] = existingAction;
    });

    return {
      ...resourceOptions,
      actions,
    };
  };

  const animationIdSet = new Set(animationUi.options.map((entry) => entry.value));
  const animationIdByLabel = {};
  const animationIdByFile = {};
  const animationIdByName = {};

  animationUi.options.forEach((entry) => {
    if (typeof entry?.label === 'string' && entry.label.trim()) {
      animationIdByLabel[entry.label.trim()] = entry.value;

      const fileMatch = entry.label.match(/\(([^)]+\.(?:png|webp|gif|jpg|jpeg))\)$/i);
      if (fileMatch?.[1]) {
        animationIdByFile[fileMatch[1].trim()] = entry.value;
      } else if (/\.(png|webp|gif|jpg|jpeg)$/i.test(entry.label.trim())) {
        animationIdByFile[entry.label.trim()] = entry.value;
      }

      const nameMatch = entry.label.match(/^(.*?)\s*\([^)]+\)$/);
      if (nameMatch?.[1]?.trim()) {
        animationIdByName[nameMatch[1].trim()] = entry.value;
      }
    }
  });

  const normalizeIdValue = (value) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed || trimmed === 'null' || trimmed === 'undefined') {
        return null;
      }
      return trimmed;
    }

    if (value && typeof value === 'object') {
      if (typeof value.value === 'string') {
        return normalizeIdValue(value.value);
      }
      if (typeof value.id === 'string') {
        return normalizeIdValue(value.id);
      }
      if (typeof value?.params?.id === 'string') {
        return normalizeIdValue(value.params.id);
      }
    }

    return null;
  };

  const extractFileName = (value) => {
    if (typeof value !== 'string' || !value.trim()) {
      return null;
    }

    const normalized = value.trim().replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : normalized;
  };

  const resolveAnimationId = (value) => {
    const normalized = normalizeIdValue(value);
    if (!normalized) {
      return null;
    }

    if (animationIdSet.has(normalized)) {
      return normalized;
    }

    if (animationIdByLabel[normalized]) {
      return animationIdByLabel[normalized];
    }

    if (animationIdByFile[normalized]) {
      return animationIdByFile[normalized];
    }

    if (animationIdByName[normalized]) {
      return animationIdByName[normalized];
    }

    const fileName = extractFileName(normalized);
    if (fileName && animationIdByFile[fileName]) {
      return animationIdByFile[fileName];
    }

    return null;
  };

  const buildNormalizeAnimationPayloadHook = () => async (request) => {
    if (request?.method !== 'post') {
      return request;
    }

    const payload = { ...(request.payload || {}) };
    const meleeValue = resolveAnimationId(payload.meleeAnimationId)
      || resolveAnimationId(payload.meleeAnimation);
    const targetValue = resolveAnimationId(payload.targetAnimationId)
      || resolveAnimationId(payload.targetAnimation);

    payload.meleeAnimationId = meleeValue;
    payload.targetAnimationId = targetValue;
    delete payload.meleeAnimation;
    delete payload.targetAnimation;

    return {
      ...request,
      payload,
    };
  };

  const normalizeAnimationPayloadHook = buildNormalizeAnimationPayloadHook();

  const parseHostileRespawnJson = (rawValue) => {
    if (!rawValue || typeof rawValue !== 'string') {
      return null;
    }

    try {
      const parsed = JSON.parse(rawValue);
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }

      const count = Number.parseInt(parsed.count, 10);
      const zone = typeof parsed.zone === 'string' && parsed.zone.trim()
        ? parsed.zone.trim()
        : 'last-third';

      return {
        count: Number.isInteger(count) && count > 0 ? count : null,
        zone,
      };
    } catch {
      return null;
    }
  };

  const hydrateRecordRespawnFields = (record) => {
    if (!record?.params) {
      return;
    }

    const parsed = parseHostileRespawnJson(record.params.hostileRespawnJson);
    record.params.hostileRespawnCount = parsed?.count ?? '';
    record.params.hostileRespawnZone = parsed?.zone || 'last-third';
  };

  const hydrateRespawnAfterHook = async (response) => {
    if (response?.record) {
      hydrateRecordRespawnFields(response.record);
    }

    if (Array.isArray(response?.records)) {
      response.records.forEach((record) => {
        hydrateRecordRespawnFields(record);
      });
    }

    return response;
  };

  const normalizeStoryPhaseRespawnPayloadHook = async (request) => {
    if (request?.method !== 'post') {
      return request;
    }

    const payload = { ...(request.payload || {}) };
    const parsedCount = Number.parseInt(payload.hostileRespawnCount, 10);
    const hasValidCount = Number.isInteger(parsedCount) && parsedCount > 0;
    const zone = typeof payload.hostileRespawnZone === 'string' && payload.hostileRespawnZone.trim()
      ? payload.hostileRespawnZone.trim()
      : 'last-third';

    if (hasValidCount) {
      payload.hostileRespawnJson = JSON.stringify({
        count: parsedCount,
        zone,
      });
    } else {
      payload.hostileRespawnJson = null;
    }

    delete payload.hostileRespawnCount;
    delete payload.hostileRespawnZone;

    return {
      ...request,
      payload,
    };
  };

  const normalizeStoryPhaseHostilePayloadHook = async (request) => {
    if (request?.method !== 'post') {
      return request;
    }

    const payload = { ...(request.payload || {}) };
    const phaseId = typeof payload.phaseId === 'string' ? payload.phaseId.trim() : '';
    const hostileId = typeof payload.hostileId === 'string' ? payload.hostileId.trim() : '';

    if (phaseId) {
      payload.phase = { connect: { id: phaseId } };
    }

    if (hostileId) {
      payload.hostile = { connect: { id: hostileId } };
    }

    delete payload.phaseId;
    delete payload.hostileId;

    return {
      ...request,
      payload,
    };
  };

  const withImagePreview = (availableValues, custom = {}, overrides = {}) => ({
    availableValues,
    custom: {
      availableValues,
      ...custom,
    },
    ...overrides,
    components: {
      edit: assetSelectWithPreviewComponent,
    },
  });

  const battlerListPreviewProperty = (fileField = 'file', previewKinds = ['battler']) => ({
    label: 'Battler',
    isVisible: { list: true, filter: false, show: false, edit: false },
    isSortable: false,
    custom: {
      fileField,
      assetIdField: 'battlerAssetId',
      previewKinds,
      previewsByValue: assetUi.previewsByFile,
      previewsByAssetId: assetUi.previewsByAssetId,
    },
    components: {
      list: battlerListThumbComponent,
    },
  });

  const hideField = { isVisible: { list: false, filter: false, show: false, edit: false } };
  const animationFileOptions = buildAnimationFileOptions();

  const resources = [
    {
      resource: { model: getModelByName('Asset'), client: prisma },
      options: withPartialExport('Asset'),
    },
    {
      resource: { model: getModelByName('ActionCatalogEntry'), client: prisma },
      options: {
        properties: {
          file: withImagePreview(assetUi.fileOptionsByKind.icon, {
            previewsByValue: assetUi.previewsByFile,
            previewKinds: ['icon'],
            autoFillOnSelect: {
              byValue: assetUi.autoFillMaps.iconByFile,
              targets: ['iconAssetId'],
            },
          }),
          iconAssetId: hideField,
        },
      },
    },
    {
      resource: { model: getModelByName('ClassCatalogEntry'), client: prisma },
      options: withPartialExport('ClassCatalogEntry', {
        listProperties: ['name', 'classKey', 'hp', 'armor', 'attackType', 'baseAttackPoints'],
        actions: {
          new: {
            before: [normalizeAnimationPayloadHook],
          },
          edit: {
            before: [normalizeAnimationPayloadHook],
          },
        },
        properties: {
          iconFile: withImagePreview(assetUi.fileOptionsByKind.icon, {
            previewsByValue: assetUi.previewsByFile,
            previewKinds: ['icon'],
            autoFillOnSelect: {
              byValue: assetUi.autoFillMaps.iconByFile,
              targets: ['iconAssetId'],
            },
          }),
          imgProjetil: withImagePreview(assetUi.fileOptionsByKind.icon, {
            previewsByValue: assetUi.previewsByFile,
            previewKinds: ['icon'],
          }),
          meleeAnimationId: withImagePreview(animationUi.options, {
            previewsByValue: animationUi.previewsById,
            previewKinds: ['animation'],
            animationMetaByValue: animationUi.metadataById,
          }),
          targetAnimationId: withImagePreview(animationUi.options, {
            previewsByValue: animationUi.previewsById,
            previewKinds: ['animation'],
            animationMetaByValue: animationUi.metadataById,
          }),
          hp: {
            isRequired: false,
          },
          armor: {
            isRequired: false,
          },
          attackType: {
            availableValues: [
              { value: 'melee', label: 'melee' },
              { value: 'range', label: 'range' },
            ],
            isRequired: false,
          },
          baseAttackPoints: {
            isRequired: false,
          },
          iconAssetId: hideField,
          iconAsset: hideField,
          meleeAnimation: hideField,
          targetAnimation: hideField,
        },
      }),
    },
    {
      resource: { model: getModelByName('HeroCatalogEntry'), client: prisma },
      options: withPartialExport('HeroCatalogEntry', {
        listProperties: ['battlerPreview', 'name', 'hp', 'file', 'classKey', 'role', 'team'],
        properties: {
          classKey: {
            availableValues: classKeySelectOptions,
          },
          battlerPreview: battlerListPreviewProperty('file', ['battler', 'character', 'selfie']),
          file: withImagePreview(assetUi.fileOptionsByKind.battler, {
            previewsByValue: assetUi.previewsByFile,
            previewKinds: ['battler', 'character', 'selfie'],
            autoFillOnSelect: {
              byValue: assetUi.autoFillMaps.tripletByFile,
              targets: ['battlerAssetId', 'characterAssetId', 'selfieAssetId'],
            },
          }),
          battlerAssetId: hideField,
          characterAssetId: hideField,
          selfieAssetId: hideField,
        },
      }),
    },
    {
      resource: { model: getModelByName('RandomDialogEntry'), client: prisma },
    },
    {
      resource: { model: getModelByName('UnitCatalogEntry'), client: prisma },
      options: {
        listProperties: ['battlerPreview', 'name', 'file', 'classKey', 'role', 'team'],
        properties: {
          battlerPreview: battlerListPreviewProperty('file'),
          file: withImagePreview(assetUi.fileOptionsByKind.battler, {
            previewsByValue: assetUi.previewsByFile,
            previewKinds: ['battler'],
            autoFillOnSelect: {
              byValue: assetUi.autoFillMaps.battlerByFile,
              targets: ['battlerAssetId'],
            },
          }),
          battlerAssetId: hideField,
        },
      },
    },
    {
      resource: { model: getModelByName('NpcCatalogEntry'), client: prisma },
      options: withPartialExport('NpcCatalogEntry', {
        listProperties: ['battlerPreview', 'nome', 'file', 'profissao', 'sexo'],
        properties: {
          battlerPreview: battlerListPreviewProperty('file', ['battler', 'character', 'selfie']),
          file: withImagePreview(assetUi.fileOptionsByKind.battler, {
            previewsByValue: assetUi.previewsByFile,
            previewKinds: ['battler', 'character', 'selfie'],
            autoFillOnSelect: {
              byValue: assetUi.autoFillMaps.tripletByFile,
              targets: ['battlerAssetId', 'characterAssetId', 'selfieAssetId'],
            },
          }),
          battlerAssetId: hideField,
          characterAssetId: hideField,
          selfieAssetId: hideField,
        },
      }),
    },
    {
      resource: { model: getModelByName('HostileCatalogEntry'), client: prisma },
      options: withPartialExport('HostileCatalogEntry', {
        titleProperty: 'nome',
        listProperties: ['battlerPreview', 'nome', 'classKey', 'hp', 'armor', 'baseAttackPoints', 'file', 'profissao', 'sexo'],
        actions: {
          new: {
            before: [normalizeAnimationPayloadHook],
          },
          edit: {
            before: [normalizeAnimationPayloadHook],
          },
        },
        properties: {
          classKey: {
            availableValues: classKeySelectOptions,
            isRequired: false,
          },
          battlerPreview: battlerListPreviewProperty('file', ['battler', 'character', 'selfie']),
          file: withImagePreview(assetUi.fileOptionsByKind.battler, {
            previewsByValue: assetUi.previewsByFile,
            previewKinds: ['battler', 'character', 'selfie'],
            autoFillOnSelect: {
              byValue: assetUi.autoFillMaps.tripletByFile,
              targets: ['battlerAssetId', 'characterAssetId', 'selfieAssetId'],
            },
          }),
          battlerAssetId: hideField,
          characterAssetId: hideField,
          selfieAssetId: hideField,
          imgProjetil: withImagePreview(assetUi.fileOptionsByKind.icon, {
            previewsByValue: assetUi.previewsByFile,
            previewKinds: ['icon'],
          }),
          meleeAnimationId: withImagePreview(animationUi.options, {
            previewsByValue: animationUi.previewsById,
            previewKinds: ['animation'],
            animationMetaByValue: animationUi.metadataById,
          }),
          targetAnimationId: withImagePreview(animationUi.options, {
            previewsByValue: animationUi.previewsById,
            previewKinds: ['animation'],
            animationMetaByValue: animationUi.metadataById,
          }),
          meleeAnimation: hideField,
          targetAnimation: hideField,
          hp: {
            isRequired: false,
          },
          armor: {
            isRequired: false,
          },
          baseAttackPoints: {
            isRequired: false,
          },
        },
      }),
    },
    {
      resource: { model: getModelByName('Animation'), client: prisma },
      options: withPartialExport('Animation', {
        listProperties: ['name', 'file', 'frameWidth', 'frameHeight', 'frameCount', 'frameOrder'],
        properties: {
          name: {
            isRequired: false,
            description: 'Nome interno da animacao para facilitar busca. Opcional.',
          },
          file: {
            description: 'Arquivo da sprite sheet em assets/Animations. Este e o unico campo realmente necessario.',
            availableValues: animationFileOptions,
            components: {
              edit: componentLoader.add(
                'AnimationFileSelectWithPreview',
                path.join(__dirname, 'admin', 'components', 'animation-file-select-with-preview.jsx')
              ),
            },
          },
          frameWidth: {
            isRequired: false,
            description: 'Largura (px) de cada frame. Se vazio, a animacao pode ser tratada como frame unico.',
          },
          frameHeight: {
            isRequired: false,
            description: 'Altura (px) de cada frame. Se vazio, a animacao pode ser tratada como frame unico.',
          },
          frameCount: {
            isRequired: false,
            description: 'Quantidade total de frames que serao lidos no arquivo. Ex.: 6 = frames 0..5.',
          },
          sheetColumns: {
            isRequired: false,
            description: 'Numero de colunas na sheet. Opcional quando o recorte for sequencial simples.',
          },
          sheetRows: {
            isRequired: false,
            description: 'Numero de linhas na sheet. Opcional quando o recorte for sequencial simples.',
          },
          frameOrder: {
            isRequired: false,
            description: 'Ordem de leitura dos frames. Exemplo padrao: ltr-ttb (esquerda para direita, cima para baixo).',
          },
          startX: {
            isRequired: false,
            description: 'Offset X (px) do primeiro frame dentro da imagem. Use 0 quando iniciar no canto esquerdo.',
          },
          startY: {
            isRequired: false,
            description: 'Offset Y (px) do primeiro frame dentro da imagem. Use 0 quando iniciar no topo.',
          },
          frameSpacingX: {
            isRequired: false,
            description: 'Espaco horizontal (px) entre frames consecutivos.',
          },
          frameSpacingY: {
            isRequired: false,
            description: 'Espaco vertical (px) entre linhas de frames.',
          },
        },
      }),
    },
    {
      resource: { model: getModelByName('MapType'), client: prisma },
      options: withPartialExport('MapType', {
        properties: {
          autotileAssetId: withImagePreview(assetUi.idOptionsByKind.autotile),
        },
      }),
    },
    {
      resource: { model: getModelByName('GameMap'), client: prisma },
    },
    {
      resource: { model: getModelByName('MapObject'), client: prisma },
    },
    {
      resource: { model: getModelByName('Story'), client: prisma },
      options: withPartialExport('Story', {
        properties: {
          battlebackAssetId: withImagePreview(assetUi.idOptionsByKind.battleback),
        },
      }),
    },
    {
      resource: { model: getModelByName('StoryPhase'), client: prisma },
      options: withPartialExport('StoryPhase', {
        titleProperty: 'slug',
        editProperties: [
          'storyId',
          'slug',
          'title',
          'position',
          'hostile',
          'hostileRespawnCount',
          'hostileRespawnZone',
          'hostileIntroText',
          'mapTypeId',
          'mapId',
        ],
        showProperties: [
          'id',
          'storyId',
          'slug',
          'title',
          'position',
          'hostile',
          'hostileRespawnCount',
          'hostileRespawnZone',
          'hostileIntroText',
          'mapTypeId',
          'mapId',
          'createdAt',
          'updatedAt',
        ],
        actions: {
          new: {
            before: [normalizeStoryPhaseRespawnPayloadHook],
            after: [hydrateRespawnAfterHook],
          },
          edit: {
            before: [normalizeStoryPhaseRespawnPayloadHook],
            after: [hydrateRespawnAfterHook],
          },
          show: {
            after: [hydrateRespawnAfterHook],
          },
          list: {
            after: [hydrateRespawnAfterHook],
          },
        },
        properties: {
          hostileRespawnJson: {
            isVisible: { list: false, filter: false, show: false, edit: false },
          },
          hostileRespawnCount: {
            type: 'number',
            label: 'Respawn Hostiles (count)',
            isVisible: { list: false, filter: false, show: true, edit: true },
            description: 'Quantidade de hostiles no spawn da fase. Vazio ou <= 0 desliga respawn custom.',
          },
          hostileRespawnZone: {
            label: 'Respawn Hostiles (zona)',
            availableValues: [
              { value: 'last-third', label: 'Ultimo terco (direita)' },
              { value: 'mid-field', label: 'Do meio em diante' },
            ],
            isVisible: { list: false, filter: false, show: true, edit: true },
          },
        },
      }),
    },
    {
      resource: { model: getModelByName('StoryPhaseNpc'), client: prisma },
      options: withPartialExport('StoryPhaseNpc'),
    },
    {
      resource: { model: getModelByName('StoryPhaseHostile'), client: prisma },
      options: withPartialExport('StoryPhaseHostile', {
        listProperties: ['phaseId', 'hostileId', 'sortOrder'],
        actions: {
          new: {
            before: [normalizeStoryPhaseHostilePayloadHook],
          },
          edit: {
            before: [normalizeStoryPhaseHostilePayloadHook],
          },
        },
        properties: {
          phaseId: {
            availableValues: storyPhaseHostileSelectOptions.phaseOptions,
          },
          hostileId: {
            availableValues: storyPhaseHostileSelectOptions.hostileOptions,
          },
          phase: {
            isVisible: { list: false, filter: false, show: false, edit: false },
          },
          hostile: {
            isVisible: { list: false, filter: false, show: false, edit: false },
          },
        },
      }),
    },
    {
      resource: { model: getModelByName('StoryDialogueNode'), client: prisma },
      options: withPartialExport('StoryDialogueNode'),
    },
    {
      resource: { model: getModelByName('TeamEntry'), client: prisma },
    },
    {
      resource: { model: getModelByName('TeamMemberEntry'), client: prisma },
    },
    {
      resource: { model: getModelByName('AdventureEntry'), client: prisma },
    },
  ];

  return new AdminJS({
    rootPath: '/admin',
    componentLoader,
    branding: {
      companyName: 'RPG Turno Admin',
      softwareBrothers: false,
    },
    resources,
  });
}

app.use(express.json({ limit: '2mb' }));
app.use('/game-assets', express.static(assetsDir));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/exports/game', async (_req, res) => {
  try {
    await exportGameData(prisma);
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/imports/game', async (_req, res) => {
  try {
    await importGameData(prisma);
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/', (_req, res) => {
  res.type('text/plain').send('Ferramenta administrativa. Acesse /admin.');
});

async function start() {
  const adminJsModule = await import('adminjs');
  const { default: AdminJS, ComponentLoader } = adminJsModule;
  const { default: AdminJSExpress } = await import('@adminjs/express');
  const { Database, Resource, getModelByName } = await import('@adminjs/prisma');
  AdminJS.registerAdapter({ Database, Resource });

  const componentLoader = new ComponentLoader();
  const assetSelectWithPreviewComponent = componentLoader.add(
    'AssetSelectWithPreview',
    path.join(__dirname, 'admin', 'components', 'asset-select-with-preview.jsx')
  );
  const battlerListThumbComponent = componentLoader.add(
    'BattlerListThumb',
    path.join(__dirname, 'admin', 'components', 'battler-list-thumb.jsx')
  );

  const assetUi = await buildAssetSelectOptions();
  const animationUi = await buildAnimationSelectOptions();
  const classKeySelectOptions = await buildClassKeySelectOptions();
  const storyPhaseHostileSelectOptions = await buildStoryPhaseHostileSelectOptions();
  const admin = buildAdmin(
    AdminJS,
    getModelByName,
    assetUi,
    animationUi,
    classKeySelectOptions,
    storyPhaseHostileSelectOptions,
    assetSelectWithPreviewComponent,
    battlerListThumbComponent,
    componentLoader
  );

  if (process.env.NODE_ENV !== 'production') {
    admin.watch().catch((error) => {
      console.error('AdminJS watch error:', error);
    });
  }

  const adminRouter = AdminJSExpress.buildRouter(admin);
  app.use(admin.options.rootPath, adminRouter);

  httpServer = app.listen(port, () => {
    console.log(`Admin server on http://127.0.0.1:${port}`);
  });
}

async function shutdown(exitCode = 0) {
  try {
    if (httpServer) {
      await new Promise((resolve) => {
        httpServer.close(() => resolve());
      });
      httpServer = null;
    }
    await prisma.$disconnect();
  } finally {
    process.exit(exitCode);
  }
}

process.on('SIGINT', () => {
  shutdown(0);
});

process.on('SIGTERM', () => {
  shutdown(0);
});

process.on('SIGUSR2', () => {
  shutdown(0);
});

start().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});