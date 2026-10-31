import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

// Free-text worker picker styled like GlassSelect: roster suggestions in a
// dark dropdown that opens on focus/click, but typed names stick - picking
// from the list is optional. `suggestions` are { id, name }.
const WorkerNamePicker = ({
  label,
  name,
  suggestions = [],
  placeholder,
  onPick,
}) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const openRef = useRef(open);
  openRef.current = open;
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const suggestionsRef = useRef(suggestions);
  suggestionsRef.current = suggestions;

  const text = name || "";
  const q = text.trim().toLowerCase();
  const filtered = (q
    ? suggestions.filter((s) =>
        String(s.name || "")
          .toLowerCase()
          .includes(q),
      )
    : suggestions
  ).slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

  const exactMatch =
    q !== ""
      ? suggestions.find(
          (s) => String(s.name || "").trim().toLowerCase() === q,
        ) || null
      : null;

  const commit = (item, textValue) => {
    if (onPick) onPick(item, textValue);
  };

  const choose = (item) => {
    commit(item, item.name);
    setOpen(false);
    if (inputRef.current) inputRef.current.blur();
  };

  const updatePos = () => {
    if (!inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: r.width });
  };

  useLayoutEffect(() => {
    if (!open || !inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: r.width });
  }, [open ]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => updatePos();
    const onResize = () => updatePos();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open ]);

  useEffect(() => {
    const handleOutside = (e) => {
      if (!openRef.current) return;
      const inRoot = rootRef.current && rootRef.current.contains(e.target);
      const inPanel = panelRef.current && panelRef.current.contains(e.target);
      if (!inRoot && !inPanel) {
        // Commit typed text (linking on exact match), then close.
        const v = inputRef.current ? inputRef.current.value : "";
        const m =
          v.trim() !== ""
            ? suggestionsRef.current.find(
                (s) =>
                  String(s.name || "").trim().toLowerCase() ===
                  v.trim().toLowerCase(),
              ) || null
            : null;
        if (onPickRef.current) onPickRef.current(m, v);
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  });

  return (
    <div ref={rootRef} className="space-y-1.5">
      {label ? (
        <label className="block text-sm font-medium text-blue-200">
          {label}
        </label>
      ) : null}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={text}
          autoComplete="off"
          placeholder={placeholder}
          onFocus={() => {
            updatePos();
            setOpen(true);
          }}
          onChange={(e) => {
            const v = e.target.value;
            const m =
              v.trim() !== ""
                ? suggestions.find(
                    (s) =>
                      String(s.name || "").trim().toLowerCase() ===
                      v.trim().toLowerCase(),
                  ) || null
                : null;
            commit(m, v);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              commit(exactMatch, e.target.value);
              setOpen(false);
              e.target.blur();
            } else if (e.key === "Enter") {
              e.preventDefault();
              commit(exactMatch, e.target.value);
              setOpen(false);
              e.target.blur();
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              updatePos();
              setOpen(true);
            }
          }}
          className="glass-input pr-8 w-full"
        />
        <ChevronDown
          className={`absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/65 transition-transform cursor-pointer ${
            open ? "rotate-180" : ""
          }`}
          onClick={() => {
            if (open) {
              commit(exactMatch, text);
              setOpen(false);
            } else {
              updatePos();
              setOpen(true);
              if (inputRef.current) inputRef.current.focus();
            }
          }}
        />
      </div>
      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            className="z-[9999] bg-[#0f1535] border border-white/10 rounded-lg shadow-2xl overflow-hidden"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: pos.width,
            }}
          >
            <div className="max-h-60 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-3 py-2.5 text-sm text-white/50">
                  No matches — will save as “{text.trim()}”
                </p>
              ) : (
                filtered.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    disabled={!!s.note}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (s.note) return;
                      choose(s);
                    }}
                    className={`w-full text-left px-3 py-2.5 text-sm transition-colors text-white/85 ${
                      s.note
                        ? "cursor-not-allowed opacity-75"
                        : "hover:bg-white/10"
                    }`}
                  >
                    <span className="block truncate">
                      {s.name}
                      {s.note ? (
                        <span className="ml-1.5 text-xs text-amber-300/90 whitespace-nowrap">
                          ⚠ {s.note}
                        </span>
                      ) : null}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default WorkerNamePicker;
