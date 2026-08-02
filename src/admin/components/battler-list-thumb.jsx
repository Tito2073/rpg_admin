import React from 'react';
import { Box, Text } from '@adminjs/design-system';

const BattlerListThumb = (props) => {
  const { property, record } = props;
  const fileField = property?.custom?.fileField || 'file';
  const assetIdField = property?.custom?.assetIdField || 'battlerAssetId';
  const previewKinds = property?.custom?.previewKinds || ['battler'];
  const previewsByValue = property?.custom?.previewsByValue || {};
  const previewsByAssetId = property?.custom?.previewsByAssetId || {};
  const fileName = record?.params?.[fileField];
  const assetId = record?.params?.[assetIdField];

  const previewFromAssetId = assetId ? previewsByAssetId[assetId] : null;
  const previewCandidates = fileName ? previewsByValue[fileName] : null;
  const previewFromFile = previewCandidates
    ? previewKinds.map((kind) => previewCandidates[kind]).find(Boolean)
    : null;
  const relativePath = previewFromAssetId || previewFromFile || null;
  const imageSrc = relativePath ? `/game-assets/${encodeURI(relativePath)}` : null;

  if (!fileName) {
    return <Text color="grey60">-</Text>;
  }

  return (
    <Box display="flex" alignItems="center" style={{ gap: '8px' }}>
      {imageSrc ? (
        <img
          src={imageSrc}
          alt={String(fileName)}
          style={{
            width: '40px',
            height: '40px',
            objectFit: 'contain',
            borderRadius: '6px',
            border: '1px solid rgba(0,0,0,0.12)',
            background: 'rgba(255,255,255,0.06)',
            padding: '2px',
          }}
        />
      ) : null}
      <Text>{String(fileName)}</Text>
    </Box>
  );
};

export default BattlerListThumb;
