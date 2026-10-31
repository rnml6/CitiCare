import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, X } from "lucide-react";

const GlassSelect = ({
  label,
  error,
  options = [],
  value,
  onChange,
  placeholder,
  className = "",
  size = "md",
  disabled = false,
  // Deprecated: all options now render at once in a scrollable panel.
  // Kept in props so existing call sites keep working.
  paginate = true,
  autoWidth = false,
  pill = false,
  inputClassName = "",
  // Free-text mode: typed input is accepted as a custom value when it does
  // not match an option (committed via Enter/Tab, the Use-row, or closing
  // the dropdown). Set false for id-bound, enum-logic, taxonomy, and
  // filter selects where listed options are preferred — the Use-row still
  // appears when nothing matches so typed text is never a dead end.
  allowCustom = true,
  // Shows an × button to clear back to "" (replaces the removed
  // "Select..." empty options). Opt in on optional strict fields.
  allowClear = false,
  ...props
}) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const [pos, setPos] = useState(null);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const errorId = `glass-select-${useId()}-error`;

  const selected =
    options.find((o) => String(o.value) === String(value)) || null;

  const placeholderText =
    placeholder ||
    (options[0] && options[0].value === "" ? options[0].label : "Select...");

  useEffect(() => {
    if (open || editing) return;
    // Custom (non-option) values stay visible as typed text.
    setText(selected ? selected.label : (allowCustom && value !== "" && value != null ? String(value) : ""));
  }, [value, options, selected, open, editing, allowCustom]);

  // Panel geometry: the options panel sizes to the LONGEST option
  // (not the input), so long texts never wrap to 2 rows. Clamped to the
  // viewport and shifted left if it would overflow the right edge.
  const computePanelGeom = (r) => {
    let panelWidth = r.width;
    try {
      const cs = getComputedStyle(inputRef.current);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      // Option buttons render at text-sm (14px) in the page font.
      ctx.font = `${cs.fontStyle} ${cs.fontVariant} ${cs.fontWeight} 14px ${cs.fontFamily}`;
      let longest = 0;
      for (const o of options) {
        const w = ctx.measureText(String(o.label ?? o.value ?? "")).width;
        if (w > longest) longest = w;
      }
      panelWidth = Math.max(r.width, Math.ceil(longest) + 24); // px-3 padding both sides
    } catch {
      // measurement unavailable — fall back to input width
    }
    const maxW = Math.max(160, window.innerWidth - 16);
    panelWidth = Math.min(panelWidth, maxW);
    const panelLeft = Math.min(
      Math.max(8, r.left),
      Math.max(8, window.innerWidth - panelWidth - 8)
    );
    return { top: r.bottom + 4, left: r.left, width: r.width, panelLeft, panelWidth };
  };

  const updatePos = () => {
    if (!inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    setPos((prev) => {
      const next = computePanelGeom(r);
      if (
        prev &&
        Math.abs(prev.top - next.top) < 1 &&
        Math.abs((prev.panelLeft ?? prev.left) - next.panelLeft) < 1 &&
        Math.abs((prev.panelWidth ?? prev.width) - next.panelWidth) < 1
      )
        return prev;
      return next;
    });
  };

  useLayoutEffect(() => {
    if (!open || !inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    setPos(computePanelGeom(r));
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !pos || !panelRef.current) return;
    const h = panelRef.current.offsetHeight;
    if (pos.top + h > window.innerHeight - 8) {
      const top = Math.max(8, window.innerHeight - h - 8);
      setPos((p) => (p && p.top === top ? p : { ...p, top }));
    }
  }, [open, pos]);

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
  }, [open]);

  const findExactMatch = (t) => {
    const q = String(t ?? "").trim().toLowerCase();
    if (!q) return null;
    return (
      options.find(
        (o) =>
          !o.disabled &&
          (String(o.label ?? o.value ?? "").toLowerCase() === q ||
            String(o.value ?? "").toLowerCase() === q),
      ) || null
    );
  };

  const revertText = () => {
    setText(selected ? selected.label : (allowCustom && value !== "" && value != null ? String(value) : ""));
    setEditing(false);
  };

  // Commit pending typed text: exact option match wins; otherwise a custom
  // value is accepted (allowCustom) or the text reverts (strict). Empty
  // text clears back to "" only in free-text mode (strict fields use the
  // × clear button instead, so filters can never be blanked by typing).
  const commitPendingText = (forceCustom = false) => {
    if (disabled) return;
    const t = text.trim();
    if (t === "") {
      if (allowCustom && String(value ?? "") !== "") {
        setEditing(false);
        setOpen(false);
        if (onChange) onChange("");
      } else {
        revertText();
        setOpen(false);
      }
      return;
    }
    const exact = findExactMatch(t);
    if (exact) {
      handleSelect(exact);
      return;
    }
    // Explicit Use-row clicks (forceCustom) always commit — implicit
    // commits (Enter/Tab/close) only do so in free-text mode.
    if (allowCustom || forceCustom) {
      setEditing(false);
      setOpen(false);
      if (onChange) onChange(t);
      if (inputRef.current) inputRef.current.blur();
    } else {
      revertText();
      setOpen(false);
    }
  };

  useEffect(() => {
    const handleOutside = (e) => {
      const inRoot = rootRef.current && rootRef.current.contains(e.target);
      const inPanel = panelRef.current && panelRef.current.contains(e.target);
      if (!inRoot && !inPanel) {
        if (editing) commitPendingText();
        else {
          setOpen(false);
          setEditing(false);
        }
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  });

  const queryActive =
    editing || (text !== "" && text !== (selected ? selected.label : ""));

  const filtered = queryActive
    ? options.filter((o) =>
        String(o.label ?? o.value ?? "")
          .toLowerCase()
          .includes(text.trim().toLowerCase()),
      )
    : options;

  // All matching options render at once (scrollable panel) — no paging UI.
  const visibleOptions = filtered;


  const handleSelect = (opt) => {
    if (opt.disabled) return;
    setText(opt.label || "");
    setEditing(false);
    setOpen(false);
    if (onChange) onChange(opt.value);
    if (inputRef.current) inputRef.current.blur();
  };

  const sizeCls =
    size === "sm" ? "text-xs sm:text-sm py-1.5 sm:py-2" : "";

  // When autoWidth is on, measure the selected option's exact pixel width
  // with the input's real font so the box hugs the text — no estimates,
  // no trailing space. Re-measures when webfonts finish loading.
  const measureSource = selected ? selected.label : placeholderText;
  const [fitWidth, setFitWidth] = useState(null);

  useLayoutEffect(() => {
    if (!autoWidth || !inputRef.current) return;
    let alive = true;
    const measure = () => {
      const el = inputRef.current;
      if (!el || !alive) return;
      try {
        const cs = getComputedStyle(el);
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        ctx.font = `${cs.fontStyle} ${cs.fontVariant} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const textW = ctx.measureText(String(measureSource || "")).width;
        const chrome =
          parseFloat(cs.paddingLeft || "0") +
          parseFloat(cs.paddingRight || "0") +
          parseFloat(cs.borderLeftWidth || "0") +
          parseFloat(cs.borderRightWidth || "0") +
          1; // rounding buffer
        const next = Math.min(Math.ceil(textW + chrome), 480);
        setFitWidth(prev => (prev === next ? prev : next));
      } catch {
        // measurement unavailable — fall back to ch estimate below
      }
    };
    measure();
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => measure());
    }
    return () => {
      alive = false;
    };
  }, [autoWidth, measureSource]);

  const autoWidthInputStyle = autoWidth
    ? {
        width: fitWidth
          ? `${fitWidth}px`
          : `${Math.min(Math.max(String(measureSource || "").length + 6, 10), 40)}ch`,
        maxWidth: "100%",
      }
    : undefined;

  return (
    <div ref={rootRef} className={`space-y-1.5 ${className}${autoWidth ? " w-fit max-w-full" : ""}`}>
      {label && (
        <label className="block text-sm font-medium text-blue-200">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={text}
          disabled={disabled}
          placeholder={placeholderText}
          autoComplete="off"
          title={text || placeholderText}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setText(e.target.value);
            setEditing(true);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              revertText();
            } else if (e.key === "Enter") {
              e.preventDefault();
              commitPendingText();
            } else if (e.key === "Tab") {
              commitPendingText();
            }
          }}
          className={`glass-input ${allowClear && !disabled && value !== "" && value != null ? "pr-14" : "pr-8"} w-full ${sizeCls} ${pill ? '!rounded-full' : ''} ${inputClassName} ${
            error
              ? "border-red-400 focus:border-red-400 focus:ring-red-400/20"
              : ""
          }`}
          style={autoWidthInputStyle}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? errorId : undefined}
          {...props}
        />
        {allowClear && !disabled && value !== "" && value != null && (
          <button
            type="button"
            title="Clear selection"
            onClick={() => {
              setOpen(false);
              setEditing(false);
              setText("");
              if (onChange) onChange("");
              if (inputRef.current) inputRef.current.blur();
            }}
            className="absolute right-8 top-1/2 -translate-y-1/2 p-0.5 rounded text-white/50 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <ChevronDown
          className={`absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/65 transition-transform cursor-pointer ${
            open ? "rotate-180" : ""
          } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
          onClick={() => {
            if (disabled) return;
            if (open && editing) {
              commitPendingText();
              return;
            }
            setOpen((o) => !o);
            setEditing(false);
            if (!open && inputRef.current) inputRef.current.focus();
          }}
        />
      </div>
      {open &&
        pos &&
        filtered.length > 0 &&
        createPortal(
          <div
            ref={panelRef}
            className="z-[9999] bg-[#0f1535] border border-white/10 rounded-lg shadow-2xl overflow-hidden"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.panelLeft ?? pos.left,
              width: pos.panelWidth ?? pos.width,
            }}
          >
            <div className="max-h-60 overflow-y-auto">
              {visibleOptions.map((opt) => {
                  const isSelected = String(opt.value) === String(value);
                  return (
                    <button
                      key={String(opt.value)}
                      type="button"
                      disabled={opt.disabled}
                      onClick={() => handleSelect(opt)}
                      title={String(opt.label ?? opt.value ?? "")}
                      className={`w-full text-left truncate px-3 py-2.5 text-sm transition-colors hover:bg-white/10 ${
                        isSelected
                          ? "text-blue-300 bg-blue-500/10"
                          : "text-white/85"
                      } ${
                        opt.disabled
                          ? "opacity-40 cursor-not-allowed hover:bg-transparent"
                          : ""
                      }`}
                    >
                      {opt.label ?? opt.value}
                    </button>
                  );
                })}
            </div>
          </div>,
          document.body,
        )}
      {error && <p id={errorId} role="alert" className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
};

export default GlassSelect;