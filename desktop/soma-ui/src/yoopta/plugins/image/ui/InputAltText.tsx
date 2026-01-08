// @ts-nocheck
import { UI } from '@yoopta/editor';

const { Overlay, Portal } = UI;

const InputAltText = ({ floatingStyles, onClose, refs, value, onChange, onSave, onDelete }) => (
    <Portal id="uploader-portal">
      <Overlay lockScroll className="z-[100]" onClick={onClose}>
        <div ref={refs.setFloating} style={floatingStyles} onClick={(e) => e.stopPropagation()}>
          <div className="yoopta-image-input-root shadow-y-[4px]">
            <div>
              <label htmlFor="alt" className="yoopta-image-input-label">
                Alternative text
              </label>
              <input
                id="alt"
                type="text"
                className="yoopta-image-input-ui"
                name="alt"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="Edit alt text"
                autoComplete="off"
              />
            </div>

            <div className="mt-2 flex justify-between">
              <button
                type="button"
                className="yoopta-button bg-[#1183ff] text-[#fff] text-sm font-medium py-[5px] px-[10px] rounded-md shadow-sm disabled:opacity-50"
                disabled={!value}
                onClick={onSave}>
                Update
              </button>
              <button
                type="button"
                className="yoopta-button ml-2 bg-[#f4f4f5] text-[#000] text-sm font-medium py-[5px] px-[10px] rounded-md shadow-sm disabled:opacity-50"
                onClick={onDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      </Overlay>
    </Portal>
  );

export { InputAltText };
