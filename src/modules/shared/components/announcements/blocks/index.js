export { default as HeadingBlock } from './HeadingBlock';
export { default as ParagraphBlock } from './ParagraphBlock';
export { default as ButtonBlock } from './ButtonBlock';
export { default as ButtonGroupBlock } from './ButtonGroupBlock';
export { default as IconGridBlock } from './IconGridBlock';
export { default as FlowDiagramBlock } from './FlowDiagramBlock';
export { default as InfoBoxBlock } from './InfoBoxBlock';
export { default as DividerBlock } from './DividerBlock';
export { default as SpacerBlock } from './SpacerBlock';
export { default as ImageBlock } from './ImageBlock';

// Block type to component mapping
export const blockComponents = {
  heading: 'HeadingBlock',
  paragraph: 'ParagraphBlock',
  button: 'ButtonBlock',
  button_group: 'ButtonGroupBlock',
  icon_grid: 'IconGridBlock',
  flow_diagram: 'FlowDiagramBlock',
  info_box: 'InfoBoxBlock',
  divider: 'DividerBlock',
  spacer: 'SpacerBlock',
  image: 'ImageBlock',
};
