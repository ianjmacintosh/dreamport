import Dropdown from "../Dropdown";
import { FittedTags } from "../TagList/FittedTags";

interface TagPickerProps {
  /** Prefix for the picker's own element ids — unique per page. */
  id: string;
  /** Every Tag that can be chosen, in the order to offer them. */
  catalog: string[];
  /** The Tags currently chosen. */
  selected: string[];
  /** Called with the whole new selection after each toggle. */
  onChange: (tags: string[]) => void;
  disabled?: boolean;
}

/**
 * A form field for choosing Tags (#113): a "Tags" label over a box shaped
 * like a text input, holding the chosen Tags as pills — as many as fit,
 * then "+N", always one line tall (or "Choose tags…" when none). The whole
 * box is a `Dropdown` trigger whose panel has a checkbox item per catalog
 * Tag and stays open while toggling. Chosen Tags show in catalog order,
 * whatever order they were picked in.
 *
 * Not a native form control — the caller holds `selected` and sends it
 * with its own submit, the way the add-Idea form and an Idea's edit mode do.
 */
export function TagPicker({
  id,
  catalog,
  selected,
  onChange,
  disabled,
}: TagPickerProps) {
  const labelId = `${id}-label`;
  const chosen = catalog.filter((tag) => selected.includes(tag));
  return (
    <div className="tag-picker" role="group" aria-labelledby={labelId}>
      <span id={labelId} className="input-label">
        Tags
      </span>
      <Dropdown
        label={
          chosen.length > 0 ? (
            <FittedTags
              tags={chosen}
              as="inline"
              // Plain text: the whole box is the control, so the more pill
              // isn't one of its own.
              more={(hidden) => <span className="tag-more">+{hidden}</span>}
            />
          ) : (
            <span className="tag-picker-placeholder">Choose tags…</span>
          )
        }
        aria-label={`Tags: ${chosen.length > 0 ? chosen.join(", ") : "none chosen"}`}
        align="start"
        className="tag-picker-trigger"
        disabled={disabled}
      >
        {catalog.map((tag) => (
          <Dropdown.CheckboxItem
            key={tag}
            checked={selected.includes(tag)}
            onCheckedChange={(checked) =>
              onChange(
                checked
                  ? [...selected, tag]
                  : selected.filter((t) => t !== tag),
              )
            }
          >
            {tag}
          </Dropdown.CheckboxItem>
        ))}
      </Dropdown>
    </div>
  );
}

export default TagPicker;
