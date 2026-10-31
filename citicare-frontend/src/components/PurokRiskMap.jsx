// components/PurokRiskMap.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polygon,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useNavigate, useLocation } from "react-router-dom";
import { navigateWithReturn } from "../utils/navigation";
import { purokApi } from "../api/purokApi";
import { confirmMutation } from "../utils/crudConfirm";
import { X, Eye, CheckCircle, XCircle, Pencil } from "lucide-react";
import GlassSelect from "./GlassSelect";
import GlassInput from "./GlassInput";
import { SkeletonMapTiles } from "./Skeleton";
import gumamelaBoundary from "../data/gumamela-boundary.json";

const GUMAMELA_BOUNDARY_COORDS =
  gumamelaBoundary.features[0].geometry.coordinates[0].map(([lng, lat]) => [
    lat,
    lng,
  ]);

const SYSTEM_BLUE = "#5f96d3";

const RISK_COLORS = {
  Critical: "#dc2626",
  High: "#f97316",
  Moderate: "#eab308",
  Low: "#10b981",
};

const RISK_LABELS = {
  Critical: "Critical",
  High: "High",
  Moderate: "Moderate",
  Low: "Low",
};

const getPurokRiskLevel = (purok) => {
  if (!purok) return "Low";
  // Prefer the backend's classification, which is based on the aggregated
  // (average) health risk score of the purok's residents. Accept both
  // "Critical" and "Critical Health Risk" label forms.
  const normalized = String(purok.riskLevel || "")
    .replace(" Health Risk", "")
    .replace(" Risk", "")
    .trim();
  if (normalized && RISK_LABELS[normalized]) return normalized;
  if (purok.critical > 0) return "Critical";
  if (purok.high > 0) return "High";
  if (purok.moderate > 0) return "Moderate";
  return "Low";
};

const createPurokIcon = (riskColor, label) => {
  const safeLabel = String(label || "")
    .slice(0, 3)
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return L.divIcon({
    className: "gumamela-pin",
    html: `<span class="pin-wave" style="border-color:${riskColor};box-shadow:0 0 14px ${riskColor}55;"></span><span class="pin-wave two" style="border-color:${riskColor};"></span><span class="dot" style="background:${riskColor};box-shadow:0 0 10px ${riskColor}66;display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:800;line-height:1;text-shadow:0 1px 2px rgba(0,0,0,0.5);">${safeLabel}</span>`,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
  });
};

// Icons are cached so markers are never re-initialized mid-drag/interaction
const iconCache = {};
const getPurokIcon = (riskColor, label) => {
  const key = `${riskColor}|${label || ""}`;
  if (!iconCache[key]) iconCache[key] = createPurokIcon(riskColor, label);
  return iconCache[key];
};

// Default pin initial: trailing number ("Purok 1" -> "1"), else first letter
export const defaultPinLabel = (name) => {
  if (!name) return "";
  const numMatch = String(name).match(/(\d+)\s*$/);
  if (numMatch) return numMatch[1].slice(0, 3);
  const ch = String(name).trim().charAt(0);
  return ch ? ch.toUpperCase() : "";
};

export const pinLabelFor = (purok) => {
  if (!purok) return "";
  if (purok.pinLabel) return String(purok.pinLabel).slice(0, 3);
  return defaultPinLabel(purok.purokName);
};

const PREVIEW_ICON = L.divIcon({
  className: "pin-preview",
  html: `<span class="pin-preview-ring"></span><span class="pin-preview-dot"></span>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

const PurokClickCatcher = ({ active, onPlace, onHover }) => {
  const map = useMap();
  const hoverRef = useRef({ lat: null, lng: null });
  const rafRef = useRef(null);
  useEffect(() => {
    if (!active) return;
    const clickHandler = (e) => onPlace(e.latlng.lat, e.latlng.lng);
    const moveHandler = (e) => {
      hoverRef.current = { lat: e.latlng.lat, lng: e.latlng.lng };
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          onHover(hoverRef.current.lat, hoverRef.current.lng);
        });
      }
    };
    map.on("click", clickHandler);
    map.on("mousemove", moveHandler);
    return () => {
      map.off("click", clickHandler);
      map.off("mousemove", moveHandler);
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [map, active, onPlace, onHover]);
  useEffect(() => {
    const container = map.getContainer();
    container.classList.toggle("cursor-crosshair", active);
    return () => container.classList.remove("cursor-crosshair");
  }, [map, active]);
  return null;
};

const MapResizeWatcher = () => {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const raf = requestAnimationFrame(() => map.invalidateSize());
    const settle = setTimeout(() => map.invalidateSize(), 500);
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      clearTimeout(settle);
      cancelAnimationFrame(raf);
    };
  }, [map]);
  return null;
};

const TARGET_ZOOM = 17;
const PIN_HORIZONTAL_RATIO = 0.25;

const MapFlyTo = ({ lat, lng }) => {
  const map = useMap();
  const hadTarget = useRef(false);
  const prevView = useRef(null);
  useEffect(() => {
    if (lat != null && lng != null) {
      if (!hadTarget.current) {
        prevView.current = { center: map.getCenter(), zoom: map.getZoom() };
      }
      hadTarget.current = true;
      let raf;
      const t = setTimeout(() => {
        map.invalidateSize();
        raf = requestAnimationFrame(() => {
          const size = map.getSize();
          const pinPx = map.project([lat, lng], TARGET_ZOOM);
          const centerPx = pinPx.add([
            size.x * PIN_HORIZONTAL_RATIO,
            0,
          ]);
          map.flyTo(map.unproject(centerPx, TARGET_ZOOM), TARGET_ZOOM, {
            duration: 1.1,
          });
        });
      }, 120);
      return () => {
        clearTimeout(t);
        if (raf) cancelAnimationFrame(raf);
      };
    } else if (hadTarget.current) {
      hadTarget.current = false;
      if (prevView.current) {
        map.invalidateSize();
        map.flyTo(prevView.current.center, prevView.current.zoom, {
          duration: 1.2,
        });
      }
      prevView.current = null;
    }
  }, [lat, lng, map]);
  return null;
};

const RISK_BADGE_CLASSES = {
  Critical: "text-red-300 bg-red-500/20 border-red-400/30",
  High: "text-orange-300 bg-orange-500/20 border-orange-400/30",
  Moderate: "text-yellow-300 bg-yellow-500/20 border-yellow-400/30",
  Low: "text-emerald-300 bg-emerald-500/20 border-emerald-500/30",
};

const COUNT_TEXT_CLASSES = {
  Critical: "text-red-400",
  High: "text-orange-400",
  Moderate: "text-yellow-400",
  Low: "text-emerald-400",
};

const PurokRiskMap = ({ puroks, onSaved, title, editable = true, heightClass = "h-80 sm:h-96", showDetails = false, fillHeight = false }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [placeId, setPlaceId] = useState(null);
  const [saving, setSaving] = useState(false);
  // Initial tile shimmer only: set on first tile load, never re-armed, so
  // panning/zooming later never flashes the overlay over the live map.
  // The timeout is a fallback so a blocked tile server can't pin the
  // shimmer on screen forever.
  const [tilesReady, setTilesReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTilesReady(true), 20000);
    return () => clearTimeout(t);
  }, []);
  const [placedPurok, setPlacedPurok] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [preview, setPreview] = useState(null);
  const [selectedPurok, setSelectedPurok] = useState(null);
  const [pinLabelInput, setPinLabelInput] = useState("");
  const [labelSaving, setLabelSaving] = useState(false);
  // Pin-placement toolbar starts hidden; revealed via the legend-row button.
  const [showPlacing, setShowPlacing] = useState(false);

  const placeIdRef = useRef(placeId);
  placeIdRef.current = placeId;
  const pinLabelInputRef = useRef(pinLabelInput);
  pinLabelInputRef.current = pinLabelInput;
  const savingRef = useRef(saving);
  savingRef.current = saving;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const hasPins = useMemo(
    () => (puroks || []).some((p) => p.latitude && p.longitude),
    [puroks],
  );

  const bounds = useMemo(() => {
    const b = L.latLngBounds(GUMAMELA_BOUNDARY_COORDS);
    const points = (puroks || [])
      .filter((p) => p.latitude && p.longitude)
      .map((p) => [p.latitude, p.longitude]);
    points.forEach((pt) => b.extend(pt));
    if (points.length === 1) {
      b.extend([points[0][0] + 0.004, points[0][1] + 0.004]);
      b.extend([points[0][0] - 0.004, points[0][1] - 0.004]);
    }
    return b;
  }, [puroks]);

  const purokById = useCallback(
    (id) => (puroks || []).find((p) => String(p.purokId) === String(id)),
    [puroks],
  );

  const saveLocation = useCallback(
    async (purokId, lat, lng, pinLabel) => {
      const purok = purokById(purokId);
      if (!purok) return;
      const confirmed = await confirmMutation({
        title: "Save pin location?",
        message: `Please confirm that you want to save the map pin location for ${purok.purokName}.`,
        confirmText: "Save location",
      });
      if (!confirmed) return;
      setSaving(true);
      setPlacedPurok(purok.purokName);
      setErrorMsg(null);
      const lat6 = Number(lat.toFixed(6));
      const lng6 = Number(lng.toFixed(6));
      // Only touch pin_label when the user typed one or is clearing a saved
      // one - keeps pin placement working before the pin_label migration.
      const rawLabel = pinLabel !== undefined ? String(pinLabel).trim().slice(0, 3) : undefined;
      const label = rawLabel !== undefined && (rawLabel !== "" || purok.pinLabel) ? rawLabel : undefined;
      // Optimistic update: the pin moves exactly to the clicked point NOW,
      // so what you click is what you get - no waiting for the server.
      if (onSavedRef.current) onSavedRef.current(purokId, lat6, lng6, label);
      setPlaceId(null);
      try {
        const payload = { latitude: lat6, longitude: lng6 };
        if (label !== undefined) payload.pinLabel = label;
        const res = await purokApi.setLocation(purokId, payload);
        if (!res.data.success) {
          setErrorMsg(res.data.message || "Failed to save pin location.");
        }
      } catch (error) {
        console.error("Failed to save purok location:", error);
        setErrorMsg(
          error.response?.data?.message ||
            "Failed to save pin location. Check network or console.",
        );
      } finally {
        setSaving(false);
      }
    },
    [purokById],
  );

  const savePinLabelOnly = useCallback(async () => {
    const id = placeIdRef.current;
    if (!id) return;
    const purok = purokById(id);
    if (!purok) return;
    const label = pinLabelInput.trim().slice(0, 3);
    const confirmed = await confirmMutation({
      title: "Save pin label?",
      message: `Please confirm that you want to save the pin label for ${purok.purokName}.`,
      confirmText: "Save label",
    });
    if (!confirmed) return;
    setLabelSaving(true);
    setErrorMsg(null);
    // Optimistic update so the pin text changes immediately.
    if (onSavedRef.current)
      onSavedRef.current(id, purok.latitude, purok.longitude, label);
    try {
      const res = await purokApi.setLocation(id, { pinLabel: label });
      if (!res.data.success) {
        setErrorMsg(res.data.message || "Failed to save pin label.");
      }
    } catch (error) {
      console.error("Failed to save pin label:", error);
      setErrorMsg(
        error.response?.data?.message ||
          "Failed to save pin label. Check network or console.",
      );
    } finally {
      setLabelSaving(false);
    }
  }, [purokById, pinLabelInput]);

  const handleDragEnd = useCallback(
    (purokId, event) => {
      const { lat, lng } = event.target.getLatLng();
      saveLocation(purokId, lat, lng);
    },
    [saveLocation],
  );

  const handleMapClick = useCallback(
    (lat, lng) => {
      const id = placeIdRef.current;
      if (!id || savingRef.current) return;
      setPreview(null);
      saveLocation(id, lat, lng, pinLabelInputRef.current);
    },
    [saveLocation],
  );

  const handleMapHover = useCallback((lat, lng) => {
    if (!placeIdRef.current) return;
    setPreview([lat, lng]);
  }, []);

  const initLabelForRef = useRef(null);
  useEffect(() => {
    if (!placeId) {
      setPreview(null);
      initLabelForRef.current = null;
      return;
    }
    // Prefill with the saved label, else the default initial for the name.
    // Only on selection change so typing is never overwritten.
    if (initLabelForRef.current !== placeId) {
      initLabelForRef.current = placeId;
      const p = purokById(placeId);
      setPinLabelInput(p ? pinLabelFor(p) : "");
    }
  }, [placeId, purokById]);

  useEffect(() => {
    if (!placedPurok) return;
    const t = setTimeout(() => setPlacedPurok(null), 3000);
    return () => clearTimeout(t);
  }, [placedPurok]);

  useEffect(() => {
    if (!errorMsg) return;
    const t = setTimeout(() => setErrorMsg(null), 6000);
    return () => clearTimeout(t);
  }, [errorMsg]);

const purokSelect = (
    <GlassSelect
      value={placeId || ""}
      onChange={(v) => setPlaceId(v || null)}
      options={[...(puroks || [])].sort((a, b) => a.purokName?.localeCompare(b.purokName)).map((p) => ({
        value: String(p.purokId),
        label: `${p.purokName} · ${pinLabelFor(p)}${
          p.latitude && p.longitude ? "" : " (no pin)"
        }`,
      }))}
      size="sm"
      className="w-44 sm:w-56 [&_input]:!text-sm"
      placeholder="Select Purok"
    />
  );

  return (
    <div
      className={`space-y-4 ${fillHeight ? "flex flex-col flex-1 min-h-0" : ""}`}
    >
      {title && !editable && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base sm:text-lg font-semibold text-white">
            {title}
          </h2>
        </div>
      )}

      {editable && showPlacing && (
      <div className="flex flex-nowrap items-center justify-start gap-1.5 sm:gap-2">
          <div className="flex items-center gap-1.5 shrink-0">
            <label className="text-[11px] font-medium text-white/65 whitespace-nowrap uppercase tracking-wide pl-2">Purok:</label>
            <div className="shrink-0">{purokSelect}</div>
          </div>
          {placeId && (
            <>
              <div className="flex items-center gap-1.5 shrink-0">
                <label className="text-[11px] font-medium text-white/65 whitespace-nowrap uppercase tracking-wide pl-2">Purok Initial:</label>
                <div className="w-16 shrink-0 [&_input]:!py-1.5 sm:[&_input]:!py-1.5 [&_input]:!text-sm [&_input]:text-center">
                  <GlassInput
                    type="text"
                    value={pinLabelInput}
                    onChange={(e) => setPinLabelInput(e.target.value.slice(0, 3))}
                    maxLength={3}
                    placeholder={defaultPinLabel(purokById(placeId)?.purokName) || "1"}
                    title="Pin initial (up to 3 characters)"
                    aria-label="Purok Initial"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={savePinLabelOnly}
                disabled={labelSaving || saving}
                className="px-2.5 sm:px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors bg-blue-500/20 text-blue-200 border-blue-400/30 hover:bg-blue-500/30 disabled:opacity-50 shrink-0 whitespace-nowrap"
              >
                {labelSaving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => { setPlaceId(null); setShowPlacing(false) }}
                className="px-2.5 sm:px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors bg-red-500/20 text-red-300 border-red-400/30 hover:bg-red-500/30 disabled:opacity-50 shrink-0 whitespace-nowrap"
                disabled={saving}
              >
                Cancel
              </button>
            </>
          )}
        </div>
      )}

      {placedPurok && (
        <p className="text-xs font-medium text-white glass border border-emerald-400/30 bg-emerald-500/20 rounded-xl px-2.5 py-1 shadow-2xl shadow-black/50 flex items-center justify-center gap-1.5 text-center uppercase tracking-wide">
          <CheckCircle className="w-4 h-4 text-emerald-300 shrink-0" />
          Pin placed for {placedPurok}
        </p>
      )}
      {errorMsg && (
        <p className="text-xs font-medium text-white glass border border-red-400/30 bg-red-500/20 rounded-xl px-2.5 py-1 shadow-2xl shadow-black/50 flex items-center justify-center gap-1.5 text-center uppercase tracking-wide">
          <XCircle className="w-4 h-4 text-red-300 shrink-0" />
          {errorMsg}
        </p>
      )}

      <div
        className={`relative rounded-xl overflow-hidden border border-white/15 ${
          fillHeight ? "flex-1 min-h-0" : heightClass
        }`}
      >
        <MapContainer
          bounds={bounds}
          scrollWheelZoom={false}
          className="w-full h-full z-0"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            eventHandlers={{
              load: () => setTilesReady(true),
            }}
          />
          <Polygon
            positions={GUMAMELA_BOUNDARY_COORDS}
            pathOptions={{
              color: "#84b2e2",
              weight: 2,
              opacity: 0.7,
              fillColor: "#5f96d3",
              fillOpacity: 0.12,
            }}
          />
          <PurokClickCatcher
            active={placeId}
            onPlace={handleMapClick}
            onHover={handleMapHover}
          />
          <MapResizeWatcher />
          <MapFlyTo
            lat={selectedPurok?.latitude}
            lng={selectedPurok?.longitude}
          />
          {placeId && preview && (
            <Marker
              position={preview}
              icon={PREVIEW_ICON}
              interactive={false}
              zIndexOffset={1000}
            />
          )}
          {(puroks || [])
            .filter((p) => p.latitude && p.longitude)
            .map((p) => {
              const risk = getPurokRiskLevel(p);
              return (
                <Marker
                  key={p.purokId}
                  position={[p.latitude, p.longitude]}
                  icon={getPurokIcon(RISK_COLORS[risk], pinLabelFor(p))}
                  draggable={editable}
                  eventHandlers={{
                    dragend: (e) => handleDragEnd(p.purokId, e),
                    click: () => {
                      if (!editable) setSelectedPurok(p);
                    },
                  }}
                />
              );
            })}
        </MapContainer>

        {!tilesReady && <SkeletonMapTiles />}

        {showDetails && selectedPurok && (
          <aside className="absolute top-2 right-2 w-72 max-w-[88%] z-[1000] flex-shrink-0">
              <div
                className="max-h-[430px] overflow-y-auto rounded-xl p-3.5 border border-white/15 shadow-2xl shadow-black/50 backdrop-blur-xl"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(15,21,53,0.72), rgba(15,21,53,0.55))",
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-white text-lg sm:text-xl font-extrabold truncate leading-tight">
                      {selectedPurok.purokName}
                    </p>
                    <p className="text-xs text-white/65 mt-0.5">
                      {selectedPurok.totalResidents || 0} resident{(selectedPurok.totalResidents ?? 0) !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                        RISK_BADGE_CLASSES[
                          getPurokRiskLevel(selectedPurok)
                        ]
                      }`}
                    >
                      {getPurokRiskLevel(selectedPurok)}
                    </span>
                    <button
                      onClick={() => setSelectedPurok(null)}
                      className="p-1 rounded-md hover:bg-white/20 bg-white/10 text-white/75 hover:text-white transition-colors"
                      title="Close details"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5 mt-2.5">
                  {[
                    { label: "Critical", value: selectedPurok.critical || 0, dot: "bg-red-400" },
                    { label: "High", value: selectedPurok.high || 0, dot: "bg-orange-400" },
                    { label: "Moderate", value: selectedPurok.moderate || 0, dot: "bg-yellow-400" },
                    { label: "Low", value: selectedPurok.low || 0, dot: "bg-emerald-400" },
                  ].map((item) => (
                    <span
                      key={item.label}
                      className="inline-flex items-center justify-center gap-1.5 text-[11px] text-white/75 bg-white/[0.05] border border-white/10 rounded-full px-2 py-0.5"
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${item.dot}`} />
                      {item.value} {item.label}
                    </span>
                  ))}
                </div>
                <div className="mt-2.5 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-white/60">BHW Assigned</span>
                    <span className="text-white/85 font-medium truncate">
                      {selectedPurok.assignedBhw || "Unassigned"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-white/60">Total Schedules</span>
                    <span className="text-white/85 font-medium">
                      {selectedPurok.totalSchedules ?? 0}
                    </span>
                  </div>
                </div>
                {!editable && (
                  <button
                    onClick={() =>
                      navigateWithReturn(navigate, location, "/purok", {
                        viewPurokId: selectedPurok.purokId,
                      })
                    }
                    className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-blue-400/30 bg-blue-500/20 text-blue-200 hover:bg-blue-500/30 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    View Purok
                  </button>
                )}
              </div>
          </aside>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        <div className="flex items-center gap-3 text-xs text-white/85">
          {Object.entries(RISK_LABELS).map(([level, label]) => (
            <span key={level} className="flex items-center gap-1.5">
              <span
                className="inline-block w-3 h-3 rounded-full"
                style={{ background: RISK_COLORS[level] }}
              />
              {label}
            </span>
          ))}
        </div>
        {editable && !placeId && (
          <button
            onClick={() => {
              if (showPlacing) setPlaceId(null)
              setShowPlacing(v => !v)
            }}
            className={`ml-auto p-1.5 shrink-0 transition-colors ${showPlacing ? "text-red-300 hover:text-red-200" : "text-blue-300 hover:text-blue-200"}`}
            title={showPlacing ? "Close" : "Edit map"}
            aria-label={showPlacing ? "Close" : "Edit map"}
          >
            {showPlacing ? <X className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );
};

export default PurokRiskMap;