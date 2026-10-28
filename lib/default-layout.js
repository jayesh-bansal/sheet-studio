export const TEMPLATE_VERSION = 3;

export function createDefaultLayout() {
  const pages = [
    { id: 1, name: '42 × 67 mm', order: 'row', items: [], sheetW: 210, sheetH: 297, preset: 'A4', itemW: 42, itemH: 67, itemPreset: 'custom', marginX: 19, marginY: 25, spacingX: 23, spacingY: 23, maxPhotos: 9, cropFill: false, lockPositions: true, showSlots: true },
    { id: 2, name: '51 × 76 mm', order: 'row', items: [], sheetW: 210, sheetH: 297, preset: 'A4', itemW: 51, itemH: 76, itemPreset: 'custom', marginX: 9.5, marginY: 20.5, spacingX: 19, spacingY: 14, maxPhotos: 9, cropFill: false, lockPositions: true, showSlots: true },
    { id: 3, name: '50 × 78 mm', order: 'row', items: [], sheetW: 210, sheetH: 297, preset: 'A4', itemW: 50, itemH: 78, itemPreset: 'custom', marginX: 15, marginY: 19.5, spacingX: 15, spacingY: 12, maxPhotos: 9, cropFill: false, lockPositions: true, showSlots: true },
  ];
  return {
    settingsVersion: TEMPLATE_VERSION,
    jobs: [{ id: 'job-default', name: 'Current job', createdAt: new Date().toISOString(), status: 'active' }],
    activeJobId: 'job-default',
    pages,
    activePage: 1,
    nextId: 4,
    zoom: 1.25,
    fields: { itemW: 42, itemH: 67, itemPreset: 'custom', sheetW: 210, sheetH: 297, sheetPreset: 'A4', pageMarginX: 19, pageMarginY: 25, pageSpacingX: 23, pageSpacingY: 23, showGuides: true, cropFill: false, keepRatio: true },
  };
}
