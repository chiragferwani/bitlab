/**
 * Autocomplete.tsx
 * SQL/PL-SQL keyword autocomplete dropdown component.
 * Overlays the editor textarea and provides suggestions as the user types.
 * Uses inline styles matching the existing theme variables — no CSS changes.
 */

import { useEffect, useRef, useCallback } from "react";
import { UNIQUE_KEYWORDS, type KeywordEntry } from "@/lib/keywords";

interface AutocompleteProps {
  /** The current word being typed (prefix to match) */
  prefix: string;
  /** Pixel position for the dropdown (relative to editor container) */
  position: { top: number; left: number };
  /** Whether the dropdown is visible */
  visible: boolean;
  /** Selected index in the suggestions list */
  selectedIndex: number;
  /** Callback when a suggestion is selected */
  onSelect: (word: string) => void;
  /** Callback when selection index changes */
  onIndexChange: (index: number) => void;
  /** Callback to dismiss the dropdown */
  onDismiss: () => void;
}

function getFilteredSuggestions(prefix: string): KeywordEntry[] {
  if (!prefix || prefix.length < 2) return [];
  const upper = prefix.toUpperCase();
  return UNIQUE_KEYWORDS.filter((k) => k.word.toUpperCase().startsWith(upper)).slice(0, 10);
}

const Autocomplete = ({
  prefix,
  position,
  visible,
  selectedIndex,
  onSelect,
  onIndexChange,
  onDismiss,
}: AutocompleteProps) => {
  const listRef = useRef<HTMLDivElement>(null);
  const suggestions = getFilteredSuggestions(prefix);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!visible || suggestions.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        onIndexChange(Math.min(selectedIndex + 1, suggestions.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        onIndexChange(Math.max(selectedIndex - 1, 0));
      } else if (e.key === "Tab" || e.key === "Enter") {
        if (suggestions[selectedIndex]) {
          e.preventDefault();
          e.stopPropagation();
          onSelect(suggestions[selectedIndex].word);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onDismiss();
      }
    },
    [visible, suggestions, selectedIndex, onSelect, onIndexChange, onDismiss]
  );

  useEffect(() => {
    if (visible) {
      window.addEventListener("keydown", handleKeyDown, true);
      return () => window.removeEventListener("keydown", handleKeyDown, true);
    }
  }, [visible, handleKeyDown]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && visible) {
      const selected = listRef.current.children[selectedIndex] as HTMLElement;
      if (selected) {
        selected.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex, visible]);

  if (!visible || suggestions.length === 0) return null;

  return (
    <div
      ref={listRef}
      style={{
        position: "absolute",
        top: position.top,
        left: position.left,
        zIndex: 100,
        maxHeight: 200,
        overflowY: "auto",
        minWidth: 220,
        border: "1px solid hsl(var(--border))",
        borderRadius: 4,
        backgroundColor: "hsl(var(--card))",
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        fontSize: 12,
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      {suggestions.map((s, i) => (
        <div
          key={s.word}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(s.word);
          }}
          onMouseEnter={() => onIndexChange(i)}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "4px 8px",
            cursor: "pointer",
            backgroundColor:
              i === selectedIndex
                ? "hsl(var(--accent) / 0.15)"
                : "transparent",
            color:
              i === selectedIndex
                ? "hsl(var(--accent))"
                : "hsl(var(--foreground))",
            transition: "background-color 0.1s",
          }}
        >
          <span>{s.word.toLowerCase()}</span>
          <span
            style={{
              fontSize: 10,
              color: "hsl(var(--muted-foreground))",
              marginLeft: 12,
            }}
          >
            {s.category}
          </span>
        </div>
      ))}
    </div>
  );
};

export default Autocomplete;
