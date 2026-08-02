import React from 'react';
import { Box, FormGroup, Label, Select, Text } from '@adminjs/design-system';

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
        width: '100%',
        maxWidth: '320px',
        maxHeight: '240px',
        objectFit: 'contain',
        display: 'block',
        borderRadius: '8px',
        border: '1px solid rgba(0,0,0,0.15)',
        background: 'rgba(255,255,255,0.08)',
        padding: '8px',
      }}
    />
  );
};

const AnimationFileSelectWithPreview = (props) => {
  const { property, record, onChange } = props;
  const options = (property.availableValues || []).map((entry) => ({
    value: entry.value,
    label: entry.label,
  }));

  const currentValue = record?.params?.[property.path] || '';
  const selectedOption = options.find((entry) => entry.value === currentValue) || null;

  const previewSrc = currentValue ? `/game-assets/Animations/${encodeURI(currentValue)}` : null;
  const previewMetadata = {
    frameWidth: record?.params?.frameWidth,
    frameHeight: record?.params?.frameHeight,
    frameCount: record?.params?.frameCount,
    sheetColumns: record?.params?.sheetColumns,
    sheetRows: record?.params?.sheetRows,
    frameOrder: record?.params?.frameOrder,
    startX: record?.params?.startX,
    startY: record?.params?.startY,
    frameSpacingX: record?.params?.frameSpacingX,
    frameSpacingY: record?.params?.frameSpacingY,
  };

  const handleChange = (nextOption) => {
    const nextValue = nextOption?.value || null;
    onChange(property.path, nextValue);
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
      {previewSrc ? (
        <Box mt="lg">
          <AnimatedSpritePreview
            src={previewSrc}
            metadata={previewMetadata}
            alt={selectedOption?.label || 'animation preview'}
          />
        </Box>
      ) : (
        <Text mt="lg" variant="sm" color="grey60">
          Selecione um arquivo para visualizar a animação.
        </Text>
      )}
    </FormGroup>
  );
};

export default AnimationFileSelectWithPreview;