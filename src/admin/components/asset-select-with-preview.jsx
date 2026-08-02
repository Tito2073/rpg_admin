import React from 'react';
import { Box, FormGroup, Label, Select, Text } from '@adminjs/design-system';

const extractRelativeAssetPath = (label = '') => {
  const match = label.match(/\((assets\/[^)]+)\)$/);
  if (!match || !match[1]) {
    return null;
  }
  return match[1].replace(/^assets\//, '');
};

const extractFileName = (value = '') => {
  if (typeof value !== 'string' || !value.trim()) {
    return '';
  }

  const normalized = value.trim().replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : normalized;
};

const normalizeValue = (rawValue) => {
  if (typeof rawValue === 'string') {
    return rawValue.trim();
  }

  if (rawValue && typeof rawValue === 'object') {
    if (typeof rawValue.value === 'string') {
      return rawValue.value.trim();
    }
    if (typeof rawValue.id === 'string') {
      return rawValue.id.trim();
    }
  }

  return '';
};

const resolveCurrentValue = (record, propertyPath) => {
  const fromParams = normalizeValue(record?.params?.[propertyPath]);
  if (fromParams) {
    return fromParams;
  }

  if (typeof propertyPath === 'string' && propertyPath.endsWith('Id')) {
    const relationPath = propertyPath.slice(0, -2);
    const fromPopulated = normalizeValue(record?.populated?.[relationPath]?.params?.id);
    if (fromPopulated) {
      return fromPopulated;
    }
  }

  return '';
};

const findSelectedOption = (options, rawValue) => {
  const currentValue = normalizeValue(rawValue);
  if (!currentValue) {
    return null;
  }

  const byValue = options.find((entry) => entry.value === currentValue);
  if (byValue) {
    return byValue;
  }

  const byLabel = options.find((entry) => entry.label === currentValue);
  if (byLabel) {
    return byLabel;
  }

  const currentFileName = extractFileName(currentValue);
  if (!currentFileName) {
    return null;
  }

  return (
    options.find((entry) => entry.value === currentFileName)
    || options.find((entry) => entry.label === currentFileName)
    || options.find((entry) => entry.label.endsWith(`(${currentFileName})`))
    || null
  );
};

const parsePositiveInt = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const AnimatedSpritePreview = ({ src, metadata, alt }) => {
  const canvasRef = React.useRef(null);
  const imageRef = React.useRef(null);
  const rafRef = React.useRef(null);
  const lastTickRef = React.useRef(0);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !src) {
      return undefined;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      return undefined;
    }

    const image = new Image();
    imageRef.current = image;

    const frameWidth = parsePositiveInt(metadata?.frameWidth);
    const frameHeight = parsePositiveInt(metadata?.frameHeight);
    const frameCount = parsePositiveInt(metadata?.frameCount, 1);
    const sheetColumns = parsePositiveInt(metadata?.sheetColumns);
    const startX = Number.parseInt(metadata?.startX, 10) || 0;
    const startY = Number.parseInt(metadata?.startY, 10) || 0;
    const frameSpacingX = Number.parseInt(metadata?.frameSpacingX, 10) || 0;
    const frameSpacingY = Number.parseInt(metadata?.frameSpacingY, 10) || 0;
    const frameDurationMs = 90;
    let activeFrame = 0;

    const drawFrame = () => {
      const width = frameWidth > 0 ? frameWidth : image.naturalWidth;
      const height = frameHeight > 0 ? frameHeight : image.naturalHeight;
      const columns = sheetColumns > 0
        ? sheetColumns
        : frameWidth > 0
          ? Math.max(1, Math.floor((image.naturalWidth - startX) / (frameWidth + frameSpacingX)))
          : 1;
      const effectiveFrameCount = frameWidth > 0 && frameHeight > 0 ? Math.max(1, frameCount) : 1;

      canvas.width = width;
      canvas.height = height;

      const col = activeFrame % columns;
      const row = Math.floor(activeFrame / columns);
      const sx = startX + col * (frameWidth + frameSpacingX);
      const sy = startY + row * (frameHeight + frameSpacingY);

      context.clearRect(0, 0, width, height);
      if (frameWidth > 0 && frameHeight > 0) {
        context.drawImage(image, sx, sy, frameWidth, frameHeight, 0, 0, width, height);
      } else {
        context.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight, 0, 0, width, height);
      }

      activeFrame = (activeFrame + 1) % effectiveFrameCount;
    };

    const tick = (timestamp) => {
      if (!lastTickRef.current || timestamp - lastTickRef.current >= frameDurationMs) {
        lastTickRef.current = timestamp;
        drawFrame();
      }
      rafRef.current = window.requestAnimationFrame(tick);
    };

    image.onload = () => {
      drawFrame();
      rafRef.current = window.requestAnimationFrame(tick);
    };
    image.src = src;

    return () => {
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = null;
      lastTickRef.current = 0;
      if (imageRef.current) {
        imageRef.current.onload = null;
      }
    };
  }, [src, metadata]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={alt}
      style={{
        width: '120px',
        height: '120px',
        objectFit: 'contain',
        display: 'block',
        borderRadius: '8px',
        border: '1px solid rgba(0,0,0,0.15)',
        background: 'rgba(255,255,255,0.08)',
        padding: '6px',
      }}
    />
  );
};

const AssetSelectWithPreview = (props) => {
  const { property, record, onChange } = props;
  const propertyOptions = Array.isArray(property?.availableValues)
    ? property.availableValues
    : [];
  const customOptions = Array.isArray(property?.custom?.availableValues)
    ? property.custom.availableValues
    : [];
  const previewsByValue = property?.custom?.previewsByValue || null;
  const previewKinds = property?.custom?.previewKinds || null;
  const optionsFromPreviews = previewsByValue
    ? Object.keys(previewsByValue)
        .filter((value) => {
          if (!previewKinds?.length) {
            return true;
          }

          return previewKinds.some((kind) => Boolean(previewsByValue[value]?.[kind]));
        })
        .map((value) => ({
          value,
          label: value,
        }))
    : [];

  const mergedOptionsMap = new Map();
  [...propertyOptions, ...customOptions, ...optionsFromPreviews].forEach((entry) => {
    const value = typeof entry?.value === 'string' ? entry.value : '';
    if (!value) {
      return;
    }

    const label = typeof entry?.label === 'string' && entry.label ? entry.label : value;
    if (!mergedOptionsMap.has(value)) {
      mergedOptionsMap.set(value, { value, label });
    }
  });

  const options = Array.from(mergedOptionsMap.values()).sort((left, right) =>
    left.label.localeCompare(right.label)
  );

  const currentValue = resolveCurrentValue(record, property.path);
  const selectedOption = findSelectedOption(options, currentValue);
  const selectedValue = selectedOption?.value || (typeof currentValue === 'string' ? currentValue : '');

  const previewFromConfig = previewsByValue?.[selectedValue] || null;
  const animationMetaByValue = property?.custom?.animationMetaByValue || {};

  const previewItems = (() => {
    if (previewFromConfig && previewKinds?.length) {
      return previewKinds
        .filter((kind) => previewFromConfig[kind])
        .map((kind) => ({
          key: kind,
          label: kind,
          src: `/game-assets/${previewFromConfig[kind]}`,
          kind,
          metadata: kind === 'animation' ? animationMetaByValue[selectedValue] || null : null,
        }));
    }

    const selectedRelativePath = extractRelativeAssetPath(selectedOption?.label || '');
    if (!selectedRelativePath) {
      return [];
    }

    return [
      {
        key: 'default',
        label: 'preview',
        src: `/game-assets/${selectedRelativePath}`,
        kind: 'default',
        metadata: null,
      },
    ];
  })();

  const handleChange = (nextOption) => {
    const nextValue = nextOption?.value || null;
    onChange(property.path, nextValue);

    const autoFillConfig = property?.custom?.autoFillOnSelect;
    if (!autoFillConfig || !nextValue) {
      return;
    }

    const matchedValues = autoFillConfig.byValue?.[nextValue];
    if (!matchedValues) {
      return;
    }

    (autoFillConfig.targets || []).forEach((targetPath) => {
      if (Object.prototype.hasOwnProperty.call(matchedValues, targetPath)) {
        onChange(targetPath, matchedValues[targetPath]);
      }
    });
  };

  return (
    <FormGroup>
      <Label>{property.label}</Label>
      <Select
        value={selectedOption}
        options={options}
        isClearable
        onChange={handleChange}
      />
      {previewItems.length > 0 ? (
        <Box mt="lg" display="flex" flexWrap="wrap" style={{ gap: '8px' }}>
          {previewItems.map((item) => (
            <Box key={item.key}>
              {item.kind === 'animation' ? (
                <AnimatedSpritePreview
                  src={item.src}
                  metadata={item.metadata}
                  alt={`${item.label} ${selectedOption?.label || 'animation'}`}
                />
              ) : (
                <img
                  src={item.src}
                  alt={`${item.label} ${selectedOption?.label || 'asset'}`}
                  style={{
                    width: '120px',
                    height: '120px',
                    objectFit: 'contain',
                    display: 'block',
                    borderRadius: '8px',
                    border: '1px solid rgba(0,0,0,0.15)',
                    background: 'rgba(255,255,255,0.08)',
                    padding: '6px',
                  }}
                />
              )}
            </Box>
          ))}
        </Box>
      ) : (
        <Text mt="lg" variant="sm" color="grey60">
          Selecione um arquivo para visualizar a imagem.
        </Text>
      )}
    </FormGroup>
  );
};

export default AssetSelectWithPreview;
