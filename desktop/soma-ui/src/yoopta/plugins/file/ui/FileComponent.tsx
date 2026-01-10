// @ts-nocheck
import type { MouseEvent } from 'react';
import { FileText } from 'react-feather';

import type { FileElementProps } from '../types';

type FileComponentProps = Partial<FileElementProps> & {
  blockId: string;
  align?: 'left' | 'center' | 'right';
};

function formatBytesToKilobytes(bytes) {
  if (typeof bytes !== 'number' || isNaN(bytes)) {
    return null;
  }
  const kilobytes = bytes / 1024;
  return `${kilobytes.toFixed(2) } KB`;
}

const FileComponent = ({ name, src, size, format, align }: FileComponentProps) => {
  if (!src) return null;

  const onOpen = (e: MouseEvent) => {
    if (!src) return;
    e.preventDefault();
    e.stopPropagation();

    window.open(src, '_blank');
  };

  const currentAlign = align || 'left';
  const alignClass = `yoopta-align-${currentAlign}`;

  return (
    <div
      className="w-full cursor-pointer"
      contentEditable={false}
      onClick={onOpen}>
      <div
        className={`flex ${alignClass} items-center rounded-[4px] py-[8px] px-2 hover:bg-[rgba(55,53,47,0.04)] border-b-[1px] hover:border-[rgba(55,53,47,0.16)] border-[transparent]`}>
        <div className="flex items-center leading-[1.2] font-medium text-[#000000]">
          <FileText width={16} height={16} />
          <span className="ml-[6px] text-[14px]">
            {format ? `${name}.${format}` : `${name}`}
          </span>
        </div>
        <div className="ml-[8px] text-[10px] font-normal text-[#37352fa6]">
          {formatBytesToKilobytes(size)}
        </div>
      </div>
    </div>
  );
};

export { FileComponent, FileComponentProps };
