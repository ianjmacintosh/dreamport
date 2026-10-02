import { Popover } from "@base-ui/react/popover";

import { FittedTags } from "./FittedTags";

interface TagListProps {
  /** Tag names, in the order to show them. */
  tags: string[];
  /** The list's accessible name. Defaults to "Tags". */
  "aria-label"?: string;
}

/**
 * An Idea's Tags as pills (#113) — display only. On one line: as many as
 * fit, then a "+N" more pill that opens a popover listing every Tag (Base
 * UI's `Popover`, per ADR-0014, in the same panel look as `Dropdown`).
 * Below 640px, where a row's Tags get a full-width line of their own, every
 * pill shows, wrapped, and the more pill goes away. A real `<ul>`, so
 * assistive tech hears how many Tags show. Renders nothing for an empty
 * list; a caller wanting "no tags" text says so itself.
 */
export function TagList({
  tags,
  "aria-label": ariaLabel = "Tags",
}: TagListProps) {
  if (tags.length === 0) {
    return null;
  }
  return (
    <FittedTags
      tags={tags}
      as="list"
      aria-label={ariaLabel}
      className="tag-list"
      more={(hidden) => (
        <Popover.Root>
          <Popover.Trigger
            className="tag-more"
            aria-label={`Show ${hidden} more ${hidden === 1 ? "tag" : "tags"}`}
          >
            +{hidden}
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner
              className="dropdown-positioner"
              align="end"
              sideOffset={8}
            >
              <Popover.Popup className="dropdown-popup tag-popup">
                <Popover.Title className="tag-popup-title">
                  All tags
                </Popover.Title>
                <ul className="tag-popup-list">
                  {tags.map((tag) => (
                    <li key={tag} className="tag">
                      {tag}
                    </li>
                  ))}
                </ul>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      )}
    />
  );
}

export default TagList;
