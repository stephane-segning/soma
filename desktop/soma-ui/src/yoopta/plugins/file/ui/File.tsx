// @ts-nocheck
import type {
  PluginElementRenderProps} from '@yoopta/editor';
import {
  useBlockData,
  useBlockSelected,
  useYooptaEditor,
  useYooptaReadOnly,
} from '@yoopta/editor';

import { FileBlockOptions } from './FileBlockOptions';
import { FileComponent } from './FileComponent';
import { Placeholder } from './Placeholder';

const FileRender = ({ extendRender, ...props }: PluginElementRenderProps) => {
  const { element, attributes, children, blockId } = props;
  const { name, src, format, size } = element.props || {};
  const block = useBlockData(blockId);
  const editor = useYooptaEditor();
  const isReadOnly = useYooptaReadOnly();

  const blockSelected = useBlockSelected({ blockId });

  if (!src) {
    return (
      <Placeholder attributes={attributes} blockId={blockId}>
        {children}
      </Placeholder>
    );
  }

  if (extendRender) return extendRender(props);

  return (
    <div
      contentEditable={false}
      draggable={false}
      className="mt-4 relative flex yoopta-file"
      {...attributes}>
      {blockSelected && (
        <div className="absolute pointer-events-none inset-0 bg-[rgba(35,131,226,0.14)] z-[81] rounded-[3px] opacity-100 transition-opacity duration-150 ease-in" />
      )}
      <FileComponent
        name={name}
        format={format}
        src={src}
        size={size}
        blockId={blockId}
        align={block.meta.align}
      />
      {!isReadOnly && <FileBlockOptions block={block} editor={editor} props={element.props} />}
      {children}
    </div>
  );
};

export { FileRender };
