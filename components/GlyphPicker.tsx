"use client";

import { GROUPS, charsInGroup, type GroupId } from "@/lib/font/charset";

interface Props {
  activeGroup: GroupId;
  onGroupChange: (g: GroupId) => void;
  selectedId: string;
  onSelect: (id: string) => void;
  isDrawn: (id: string) => boolean;
}

export default function GlyphPicker({ activeGroup, onGroupChange, selectedId, onSelect, isDrawn }: Props) {
  const chars = charsInGroup(activeGroup);
  const drawnCount = chars.filter((c) => isDrawn(c.id)).length;

  return (
    <div className="glyph-picker">
      <div className="group-tabs">
        {GROUPS.map((g) => {
          const groupChars = charsInGroup(g.id);
          const done = groupChars.filter((c) => isDrawn(c.id)).length;
          return (
            <button
              key={g.id}
              type="button"
              className={`group-tab${g.id === activeGroup ? " active" : ""}`}
              onClick={() => onGroupChange(g.id)}
            >
              <span>{g.label}</span>
              <span className="group-progress">
                {done}/{groupChars.length}
              </span>
            </button>
          );
        })}
      </div>

      <div className="progress-bar-track">
        <div
          className="progress-bar-fill"
          style={{ width: `${chars.length ? (drawnCount / chars.length) * 100 : 0}%` }}
        />
      </div>

      <div className="glyph-grid">
        {chars.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`glyph-cell${c.id === selectedId ? " selected" : ""}${isDrawn(c.id) ? " drawn" : ""}`}
            onClick={() => onSelect(c.id)}
            title={c.char}
          >
            {c.char}
          </button>
        ))}
      </div>
    </div>
  );
}
