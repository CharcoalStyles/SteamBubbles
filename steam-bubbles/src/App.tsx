import { useEffect, useMemo, useState, useRef } from "react";
import BubbleChart from "./BubbleChart";
import type { GameViz } from "./BubbleChart";

const BACKEND =
  import.meta.env.VITE_BACKEND_URL || "http://localhost:5174";

type MergeMap = Record<number, number>; // fromAppid -> toAppid

/* ------------------- Searchable dropdown for merge UI ------------------- */
function SearchSelect({
  items,
  value,
  onChange,
  placeholder,
  excludeIds,
  minWidth = 220,
}: {
  items: GameViz[];
  value: number | "";
  onChange: (v: number | "") => void;
  placeholder: string;
  excludeIds?: Set<number>;
  minWidth?: number;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selected = value === "" ? null : items.find(i => i.appid === value);

  // keep input text in sync with selected value
  useEffect(() => {
    if (selected) setQuery(selected.name);
    else setQuery("");
  }, [selected?.appid]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = items;

    if (excludeIds?.size) {
      list = list.filter(i => !excludeIds.has(i.appid));
    }

    if (!q) return list.slice(0, 60);

    return list
      .filter(i => i.name.toLowerCase().includes(q))
      .slice(0, 60);
  }, [items, query, excludeIds]);

  // close if clicking outside
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", minWidth }}
    >
      <input
        value={query}
        placeholder={placeholder}
        onChange={e => {
          setQuery(e.target.value);
          setOpen(true);
          if (e.target.value === "") onChange("");
        }}
        onFocus={() => setOpen(true)}
        style={{
          width: "100%",
          padding: "6px 8px",
          borderRadius: 6,
          border: "1px solid #2a475e",
          background: "#0b0f14",
          color: "white",
        }}
      />

      {open && filtered.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "105%",
            left: 0,
            right: 0,
            zIndex: 50,
            maxHeight: 240,
            overflowY: "auto",
            background: "#0b0f14",
            border: "1px solid #2a475e",
            borderRadius: 6,
            boxShadow: "0 8px 20px rgba(0,0,0,0.45)",
          }}
        >
          {filtered.map(g => (
            <div
              key={g.appid}
              onMouseDown={(e) => {
                // onMouseDown so selection happens before blur
                e.preventDefault();
                onChange(g.appid);
                setQuery(g.name);
                setOpen(false);
              }}
              style={{
                padding: "6px 8px",
                cursor: "pointer",
                borderBottom: "1px solid rgba(42,71,94,0.35)",
                background:
                  g.appid === value ? "#111820" : "transparent",
              }}
            >
              {g.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */

export default function App() {
  const [me, setMe] = useState<any>(null);
  const [rawGames, setRawGames] = useState<any[]>([]);
  const [unmergedGames, setUnmergedGames] = useState<GameViz[]>([]);
  const [games, setGames] = useState<GameViz[]>([]);
  const [error, setError] = useState("");

  const [topNInput, setTopNInput] = useState<number>(100);
  const [topN, setTopN] = useState<number>(100);

  const [showAll, setShowAll] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>("");

  const [layoutMode, setLayoutMode] =
    useState<"packed" | "scatter">("scatter");

  const [shuffleSeed, setShuffleSeed] = useState(0);
  const [showHoursLabels, setShowHoursLabels] = useState(false);

  const [steamIdInput, setSteamIdInput] = useState(() => {
    try {
      return localStorage.getItem("manualSteamId") || "";
    } catch {
      return "";
    }
  });
  const [manualLoading, setManualLoading] = useState(false);

  const [hiddenAppids, setHiddenAppids] = useState<Set<number>>(() => {
    try {
      const raw = localStorage.getItem("hiddenAppids");
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr.map(Number));
      return new Set();
    } catch {
      return new Set();
    }
  });

  const [selectedHiddenAppid, setSelectedHiddenAppid] = useState<number | "">("");

  const [mergeMap, setMergeMap] = useState<MergeMap>(() => {
    try {
      const raw = localStorage.getItem("mergeMap");
      if (!raw) return {};
      const obj = JSON.parse(raw);
      return obj && typeof obj === "object" ? obj : {};
    } catch {
      return {};
    }
  });

  const [mergeFrom, setMergeFrom] = useState<number | "">("");
  const [mergeTo, setMergeTo] = useState<number | "">("");

  useEffect(() => {
    try {
      localStorage.setItem("hiddenAppids", JSON.stringify([...hiddenAppids]));
    } catch {}
  }, [hiddenAppids]);

  useEffect(() => {
    try {
      localStorage.setItem("mergeMap", JSON.stringify(mergeMap));
    } catch {}
  }, [mergeMap]);

  function toggleHide(appid: number) {
    setHiddenAppids(prev => {
      const next = new Set(prev);
      if (next.has(appid)) next.delete(appid);
      else next.add(appid);
      return next;
    });
  }

  function clearHidden() {
    setHiddenAppids(new Set());
    setSelectedHiddenAppid("");
  }

  function findMergeRoot(appid: number, map: MergeMap) {
    const seen = new Set<number>();
    let cur = appid;
    while (map[cur] != null && !seen.has(cur)) {
      seen.add(cur);
      cur = map[cur];
    }
    return cur;
  }

  function addMerge() {
    if (mergeFrom === "" || mergeTo === "" || mergeFrom === mergeTo) return;

    const rootTo = findMergeRoot(mergeTo, {
      ...mergeMap,
      [mergeFrom]: mergeTo
    });
    if (rootTo === mergeFrom) {
      setError("That merge would create a loop.");
      return;
    }

    setMergeMap(prev => ({ ...prev, [mergeFrom]: mergeTo }));
    setMergeFrom("");
    setMergeTo("");
  }

  function removeMerge(fromAppid: number) {
    setMergeMap(prev => {
      const next = { ...prev };
      delete next[fromAppid];
      return next;
    });
  }

  function clearMerges() {
    setMergeMap({});
    setMergeFrom("");
    setMergeTo("");
  }

  useEffect(() => {
    const id = setTimeout(() => setTopN(topNInput), 120);
    return () => clearTimeout(id);
  }, [topNInput]);

  useEffect(() => {
    fetch(`${BACKEND}/api/me`, { credentials: "include" })
      .then(r => r.json())
      .then(setMe)
      .catch(() => setMe({ loggedIn: false }));
  }, []);

  async function loadMyGames() {
    setError("");
    setRawGames([]);
    setGames([]);

    const r = await fetch(`${BACKEND}/api/owned-games`, {
      credentials: "include"
    });
    const data = await r.json();

    const list = data?.response?.games ?? [];
    if (!list.length) {
      setError(
        "No games returned. Your Steam 'Game Details' privacy must be Public."
      );
      return;
    }
    setRawGames(list);
  }

  async function loadGamesById() {
    if (!steamIdInput.trim()) return;
    setManualLoading(true);
    setError("");
    setRawGames([]);
    setGames([]);

    try {
      const r = await fetch(
        `${BACKEND}/api/owned-games?steamid=${encodeURIComponent(steamIdInput.trim())}`,
        { credentials: "include" }
      );
      const data = await r.json();

      if (!r.ok) {
        setError(data?.error || "Failed to load games for that ID.");
        return;
      }

      const list = data?.response?.games ?? [];
      if (!list.length) {
        setError(
          "No games returned. That user's Steam 'Game Details' privacy must be Public."
        );
        return;
      }

      setRawGames(list);
      try {
        localStorage.setItem("manualSteamId", steamIdInput.trim());
      } catch {}
    } catch {
      setError("Failed to load games.");
    } finally {
      setManualLoading(false);
    }
  }

  useEffect(() => {
    if (!rawGames.length) return;

    const base: GameViz[] = rawGames
      .filter(g => g && g.appid && g.name)
      .map(g => {
        const minutes = Number(g.playtime_forever ?? 0);
        const hoursRaw = Number.isFinite(minutes) ? minutes / 60 : 0;
        const hours =
          Number.isFinite(hoursRaw) && hoursRaw >= 0 ? hoursRaw : 0;

        return {
          appid: g.appid,
          name: g.name,
          hours,
          img: `https://cdn.akamai.steamstatic.com/steam/apps/${g.appid}/header.jpg`,
          storeUrl: `https://store.steampowered.com/app/${g.appid}/`
        };
      });

    setUnmergedGames(base);

    const byId = new Map(base.map(b => [b.appid, b]));
    const merged = new Map<number, GameViz>();

    for (const g of base) {
      const root = findMergeRoot(g.appid, mergeMap);
      const rootGame = byId.get(root) || g;

      const existing = merged.get(root);
      if (existing) {
        existing.hours += g.hours;
      } else {
        merged.set(root, {
          ...rootGame,
          hours: g.hours
        });
      }
    }

    setGames([...merged.values()]);
  }, [rawGames, mergeMap]);

  const hiddenGamesList = useMemo(
    () => games.filter(g => hiddenAppids.has(g.appid)),
    [games, hiddenAppids]
  );

  const visibleGames = useMemo(
    () => games.filter(g => !hiddenAppids.has(g.appid)),
    [games, hiddenAppids]
  );

  const filtered = useMemo(() => {
    const sorted = [...visibleGames].sort((a, b) => b.hours - a.hours);
    if (showAll) return sorted;
    return sorted.slice(0, Math.max(5, topN));
  }, [visibleGames, topN, showAll]);

  function downloadSvg() {
    const svg = document.querySelector("svg");
    if (!svg) return;
    const serializer = new XMLSerializer();
    const str = serializer.serializeToString(svg);
    const blob = new Blob([str], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "steam-bubbles.svg";
    a.click();
    URL.revokeObjectURL(url);
  }

  const allForMerge = useMemo(
    () => [...unmergedGames].sort((a, b) => a.name.localeCompare(b.name)),
    [unmergedGames]
  );

  return (
    <div
      style={{
        color: "white",
        fontFamily: "system-ui",
        background: "#0b0f14",
        height: "100vh",
        display: "flex",
        flexDirection: "column"
      }}
    >
      <div style={{ padding: 16 }}>
        <h1 style={{ marginBottom: 8 }}>Steam Bubbles</h1>

        {!me?.loggedIn ? (
          <a href={`${BACKEND}/auth/steam`}>
            <button style={{ padding: 10, marginBottom: 10 }}>
              Sign in with Steam
            </button>
          </a>
        ) : (
          <div style={{ marginBottom: 10 }}>
            Logged in as: <b>{me.user.displayName}</b>
            <button
              onClick={loadMyGames}
              style={{ marginLeft: 10, padding: 8 }}
            >
              Load my games
            </button>
          </div>
        )}

        {/* Manual SteamID / vanity input */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 12
          }}
        >
          <input
            placeholder="Enter SteamID64 or profile name"
            value={steamIdInput}
            onChange={(e) => setSteamIdInput(e.target.value)}
            style={{
              padding: 8,
              minWidth: 260,
              borderRadius: 6,
              border: "1px solid #2a475e",
              background: "#0b0f14",
              color: "white"
            }}
          />
          <button
            onClick={loadGamesById}
            disabled={!steamIdInput.trim() || manualLoading}
            style={{ padding: "8px 12px" }}
          >
            {manualLoading ? "Loading..." : "Load by ID"}
          </button>
          <div style={{ opacity: 0.6, fontSize: 12 }}>
            (Works only if Game Details are public)
          </div>
        </div>

        {/* Merge UI with searchable dropdowns */}
        {unmergedGames.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              alignItems: "center",
              marginBottom: 12,
              padding: 10,
              background: "#111820",
              border: "1px solid #233447",
              borderRadius: 10
            }}
          >
            <div style={{ fontWeight: 700, marginRight: 6 }}>
              Merge games:
            </div>

            <SearchSelect
              items={allForMerge}
              value={mergeFrom}
              onChange={setMergeFrom}
              placeholder="From (playtest)"
              minWidth={240}
            />

            <SearchSelect
              items={allForMerge}
              value={mergeTo}
              onChange={setMergeTo}
              placeholder="Into (full game)"
              excludeIds={mergeFrom === "" ? undefined : new Set([mergeFrom])}
              minWidth={240}
            />

            <button
              onClick={addMerge}
              disabled={mergeFrom === "" || mergeTo === ""}
              style={{ padding: "6px 10px" }}
            >
              Merge
            </button>

            {Object.keys(mergeMap).length > 0 && (
              <button
                onClick={clearMerges}
                style={{ padding: "6px 10px" }}
                title="Remove all merges"
              >
                Clear merges
              </button>
            )}

            {Object.keys(mergeMap).length > 0 && (
              <div style={{ width: "100%", marginTop: 6, fontSize: 13, opacity: 0.8 }}>
                {Object.entries(mergeMap).map(([fromStr, toNum]) => {
                  const from = Number(fromStr);
                  const fromName = unmergedGames.find(g => g.appid === from)?.name || fromStr;
                  const toName = unmergedGames.find(g => g.appid === toNum)?.name || String(toNum);
                  return (
                    <div key={from} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span>
                        {fromName} → {toName}
                      </span>
                      <button
                        onClick={() => removeMerge(from)}
                        style={{ padding: "2px 6px", fontSize: 12 }}
                      >
                        X
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {games.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              alignItems: "center",
              marginBottom: 12,
              padding: 10,
              background: "#111820",
              border: "1px solid #233447",
              borderRadius: 10
            }}
          >
            <label>
              Top N:
              <input
                type="range"
                min={10}
                max={300}
                step={10}
                value={topNInput}
                onChange={e => setTopNInput(Number(e.target.value))}
                disabled={showAll}
                style={{ marginLeft: 8 }}
              />
              <span style={{ marginLeft: 8 }}>
                {showAll ? "All" : topNInput}
              </span>
            </label>

            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={showAll}
                onChange={e => setShowAll(e.target.checked)}
              />
              Show all games
            </label>

            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              Layout:
              <select
                value={layoutMode}
                onChange={e => setLayoutMode(e.target.value as any)}
              >
                <option value="scatter">Blob / Scatter</option>
                <option value="packed">Packed</option>
              </select>
            </label>

            <button
              onClick={() => setShuffleSeed(s => s + 1)}
              disabled={layoutMode !== "scatter"}
              style={{ padding: "6px 10px" }}
              title="Shuffle blob layout"
            >
              Shuffle
            </button>

            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={showHoursLabels}
                onChange={e => setShowHoursLabels(e.target.checked)}
              />
              Show hours on bubbles
            </label>

            {hiddenGamesList.length > 0 && (
              <>
                <select
                  value={selectedHiddenAppid}
                  onChange={e =>
                    setSelectedHiddenAppid(
                      e.target.value === "" ? "" : Number(e.target.value)
                    )
                  }
                  style={{
                    padding: 6,
                    borderRadius: 6,
                    border: "1px solid #2a475e",
                    background: "#0b0f14",
                    color: "white",
                    minWidth: 220
                  }}
                  title="Hidden games"
                >
                  <option value="">Hidden games...</option>
                  {hiddenGamesList.map(g => (
                    <option key={g.appid} value={g.appid}>
                      {g.name}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => {
                    if (selectedHiddenAppid !== "") {
                      toggleHide(selectedHiddenAppid);
                      setSelectedHiddenAppid("");
                    }
                  }}
                  disabled={selectedHiddenAppid === ""}
                  style={{ padding: "6px 10px" }}
                >
                  Unhide
                </button>

                <button
                  onClick={clearHidden}
                  style={{ padding: "6px 10px" }}
                  title="Restore all hidden games"
                >
                  Clear hidden ({hiddenGamesList.length})
                </button>
              </>
            )}

            <input
              placeholder="Search a game..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{
                padding: 6,
                minWidth: 220,
                borderRadius: 6,
                border: "1px solid #2a475e",
                background: "#0b0f14",
                color: "white"
              }}
            />

            <button onClick={downloadSvg} style={{ padding: "6px 10px" }}>
              Download SVG
            </button>
          </div>
        )}

        {error && (
          <p style={{ color: "salmon", marginTop: 6, marginBottom: 10 }}>
            {error}
          </p>
        )}

        {games.length > 0 && (
          <div style={{ opacity: 0.65, fontSize: 13, marginBottom: 6 }}>
            Tip: Right-click or Shift-click a bubble to hide it.
          </div>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        {filtered.length > 0 && (
          <BubbleChart
            games={filtered}
            searchTerm={searchTerm}
            layoutMode={layoutMode}
            shuffleSeed={shuffleSeed}
            showHoursLabels={showHoursLabels}
            onToggleHide={toggleHide}
          />
        )}
      </div>
    </div>
  );
}
