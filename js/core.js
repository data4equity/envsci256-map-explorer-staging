/* Map explorer core: the pure logic behind filter → style → condition → buffer → save.
   No DOM here, so the same file runs in the page and in the Node tests.
   Needs the globals `turf` (Turf 7.1) and `ss` (simple-statistics 7.8), both vendored. */
(function (root) {
  const RAMPS = {
    Blues: ["#eff3ff", "#c6dbef", "#9ecae1", "#6baed6", "#4292c6", "#2171b5", "#084594"],
    Greens: ["#edf8e9", "#c7e9c0", "#a1d99b", "#74c476", "#41ab5d", "#238b45", "#005a32"],
    Purples: ["#f2f0f7", "#dadaeb", "#bcbddc", "#9e9ac8", "#807dba", "#6a51a3", "#4a1486"],
    Oranges: ["#feedde", "#fdd0a2", "#fdae6b", "#fd8d3c", "#f16913", "#d94801", "#8c2d04"]
  };
  const NO_CONDITION = "none";
  const TEAM_BUF_ORDER = ["parks", "routes", "chcs", "stores"];
  const BUF_PAIR_COLORS = ["#ea580c", "#1565c0"];
  const STORE_TYPES = ["cigarette", "vape", "liquor", "cannabis", "convenience"];
  const STEP_KEYS = {
    filter: ["towns"], style: ["measure", "method", "classes", "ramp", "legend"],
    condition: ["condType", "routeMode", "routeNames", "adminType", "rtNumber", "access", "minAcres", "onlyTowns", "off", "chcsOff", "stores", "condName", "focus"],
    buffer: ["miles", "bufName", "bufColor"],
    show: ["show", "clip", "access", "minAcres", "off", "chcsOff", "routeMode", "routeNames", "adminType", "rtNumber", "focus"],
    bufferthese: ["buf"]
  };

  function resetStep(state, opening, step) {
    const result = { ...state };
    const keys = step === "all" ? [...Object.values(STEP_KEYS).flat(), "title"] : STEP_KEYS[step];
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(opening, key)) result[key] = structuredClone(opening[key]);
      else delete result[key];
    }
    return result;
  }

  const METHODS = { quantile: "Quantiles", equal: "Equal intervals", jenks: "Natural breaks (Jenks)" };
  const BBOX_PAD_DEG = 0.03; // about two miles: keeps nearby roads and parks in view of the filtered towns

  /** n colours from a ramp, spread from lightest to darkest. */
  function rampColors(name, n) {
    const r = RAMPS[name] || RAMPS.Blues;
    if (n >= r.length) return r.slice();
    if (n <= 1) return [r[r.length - 1]];
    return [...Array(n)].map((_, i) => r[Math.round(i * (r.length - 1) / (n - 1))]);
  }

  /** Class boundaries (n + 1 numbers). Never more classes than distinct values. */
  function breaks(values, method, n) {
    const v = values.filter(x => x != null && !Number.isNaN(x)).sort((a, b) => a - b);
    if (!v.length) return [];
    const k = Math.max(1, Math.min(n, new Set(v).size));
    if (k === 1) return [v[0], v[v.length - 1]];
    if (method === "equal") {
      const lo = v[0], hi = v[v.length - 1];
      return [...Array(k + 1)].map((_, i) => lo + (hi - lo) * i / k);
    }
    if (method === "jenks") return ss.jenks(v, k);
    return [...Array(k + 1)].map((_, i) => ss.quantileSorted(v, i / k));
  }

  /** Class index of a value. Quantile and equal-interval breaks are upper bounds. ss.jenks returns each class's
      LOWER bound plus the maximum, so natural breaks use the lower-bound rule (her ruling 2026-11-18:
      "fix the natural breaks bug"): otherwise the top class holds nothing. */
  function classOf(value, br, method) {
    if (value == null || br.length < 2) return -1;
    if (method === "jenks") { for (let i = br.length - 2; i > 0; i--) if (value >= br[i]) return i; return 0; }
    for (let i = 1; i < br.length; i++) if (value <= br[i]) return i - 1;
    return br.length - 2;
  }

  function paddedBbox(features, pad = BBOX_PAD_DEG) {
    const b = turf.bbox(turf.featureCollection(features));
    return [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad];
  }

  const bboxesOverlap = (a, b) => !(a[0] > b[2] || a[2] < b[0] || a[1] > b[3] || a[3] < b[1]);
  const featureBbox = f => f.bbox || (f.bbox = turf.bbox(f));

  /** Open-space town files whose features could be in view. */
  function townsInBbox(index, bbox) {
    return index.filter(e => bboxesOverlap(e.bbox, bbox));
  }

  function filterRoutes(routes, rule) {
    if (rule.mode === "num") return routes.filter(f => f.properties.ADMIN_TYPE === Number(rule.adminType) && String(f.properties.RT_NUMBER) === String(rule.rtNumber).trim());
    return routes.filter(f => rule.names.includes(f.properties.Route_Name));
  }

  /** Routes cut to the area around the filtered towns, so a statewide road is buffered only where it matters. */
  function clipToBbox(lines, bbox) {
    return lines.map(f => turf.bboxClip(f, bbox)).filter(f => f.geometry.coordinates.length);
  }

  /** Point features (the health centers) inside bbox [west, south, east, north]. */
  function pointsInBbox(points, bbox) {
    return points.filter(f => { const [x, y] = f.geometry.coordinates; return x >= bbox[0] && x <= bbox[2] && y >= bbox[1] && y <= bbox[3]; });
  }

  /** Points (stores) that fall inside any of the given tracts (the towns chosen in step 1). */
  function pointsInTracts(points, tracts) {
    const boxes = tracts.map(f => [f, f.bbox || (f.bbox = turf.bbox(f))]);
    return points.filter(p => { const [x, y] = p.geometry.coordinates;
      return boxes.some(([f, b]) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3] && turf.booleanPointInPolygon(p, f)); });
  }

  /** Nearest polygon to a point, by distance to its EDGE in miles (0 when the point is inside it), or null. */
  function nearestEdge(pt, polys) {
    const [x, y] = pt.geometry.coordinates, kx = 69.17 * Math.cos(y * Math.PI / 180);
    const lower = b => Math.hypot(Math.max(b[0] - x, 0, x - b[2]) * kx, Math.max(b[1] - y, 0, y - b[3]) * 69.17) * 0.99;
    const cand = polys.map(f => [f, lower(f.bbox || (f.bbox = turf.bbox(f)))]).sort((a, b) => a[1] - b[1]);
    let best = null;
    for (const [f, lb] of cand) {
      if (best && lb > best.miles) break;
      let d;
      if (turf.booleanPointInPolygon(pt, f)) d = 0;
      else { const ls = turf.polygonToLine(f); d = Math.min(...(ls.type === "FeatureCollection" ? ls.features : [ls]).map(l => turf.pointToLineDistance(pt, l, { units: "miles" }))); }
      if (!best || d < best.miles) best = { miles: d, feature: f };
      if (d === 0) break;
    }
    return best;
  }

  /** The store table: each store, its nearest open space and the distance to that edge, nearest first.
      A store is inside the buffer when that distance is no more than the buffer distance. */
  function storeRows(stores, parks, miles) {
    return stores.map(s => { const n = nearestEdge(s, parks);
      return { store: s, park: n ? n.feature.properties.SITE_NAME || "Unnamed open space" : "", miles: n ? n.miles : null, inside: !!n && n.miles <= miles }; })
      .sort((a, b) => (a.miles ?? Infinity) - (b.miles ?? Infinity));
  }

  /** access: "Y" | "L" | "N" | "X" | "any"; onlyTowns: null or town names; off: ids switched off. */
  function filterOpenSpace(features, { access, minAcres, onlyTowns, off }) {
    return features.filter(f => {
      const p = f.properties;
      return (access === "any" || p.PUB_ACCESS === access) && (p.GIS_ACRES || 0) >= (minAcres || 0)
        && (!onlyTowns || onlyTowns.includes(p.Town)) && !(off || []).includes(p.id);
    });
  }

  /** One buffer per feature, measured outward from its edge. Buffers are never merged. */
  function bufferEach(features, miles) {
    return features.map(f => turf.buffer(f, miles, { units: "miles" })).filter(Boolean);
  }

  /** TractFIPS of every tract that touches at least one buffer. */
  function touchedTracts(tracts, buffers) {
    const hit = new Set();
    for (const t of tracts) {
      const tb = featureBbox(t);
      for (const b of buffers) {
        if (!bboxesOverlap(featureBbox(b), tb)) continue;
        if (turf.booleanIntersects(t, b)) { hit.add(t.properties.TractFIPS); break; }
      }
    }
    return hit;
  }

  /** [[town, tracts touching, tracts in town], …] in the order the towns were chosen. */
  function countByTown(tracts, touched, towns) {
    return towns.map(town => {
      const inTown = tracts.filter(f => f.properties.City_Town === town);
      return [town, inTown.filter(f => touched.has(f.properties.TractFIPS)).length, inTown.length];
    });
  }

  /** Parks that touch the given park (for "Zoom in on this park"), the park itself first. */
  function touchingGroup(park, candidates, max = 6) {
    return [park, ...candidates.filter(f => f !== park && f.properties.id !== park.properties.id && turf.booleanIntersects(f, park))].slice(0, max);
  }

  // Margins of error (instructor's rulings 2026-11-18: show them throughout; "95%, match PLACES").
  // The Census Bureau publishes ACS margins of error at 90% confidence; 1.960 / 1.645 converts them
  // to 95% (Understanding and Using ACS Data, 2018, ch. 7). Percents stop at 0 and 100.
  const Z95_OVER_Z90 = 1.960 / 1.645;
  const roundTo = (v, d) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d);

  /** A Term Project layer's range for one tract: {ci: "(low, high)", moe: "±x", none} or, for a layer
      with no margin of error, {none: "No margin of error: …"}; null when the tract has nothing to show. */
  function acsRange(field, props, key) {
    if (!field.moe) return field.noMoe ? { ci: null, moe: null, none: `No margin of error: ${field.noMoe}` } : null;
    const v = props[key], m90 = props[field.moe];
    if (v == null || m90 == null) return null;
    const d = field.decimals == null ? 1 : field.decimals, m = m90 * Z95_OVER_Z90, pct = field.unit === "%";
    const lo = v - m, hi = v + m;
    const end = (x, cap) => (pct && cap != null ? String(cap) : roundTo(x, d));
    return { ci: `(${end(lo, pct && lo < 0 ? 0 : null)}, ${end(hi, pct && hi > 100 ? 100 : null)})`, moe: `±${roundTo(m, d)}`, none: null };
  }

  // Copy link: the whole map state travels in the link, base64url-encoded JSON after "#map=".
  const LINK_PREFIX = "map=";
  function toBase64Url(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = ""; bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function fromBase64Url(s) {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
  }
  function encodeState(state) { return LINK_PREFIX + toBase64Url(JSON.stringify(state)); }
  function decodeState(hash) {
    const h = String(hash || "").replace(/^#/, "");
    if (!h.startsWith(LINK_PREFIX)) return null;
    try { return JSON.parse(fromBase64Url(h.slice(LINK_PREFIX.length))); } catch (e) { return null; }
  }

  function fitProjection(bbox, width, height, pad) {
    const [west, south, east, north] = bbox;
    const k = Math.cos((south + north) / 2 * Math.PI / 180);
    const sc = Math.min(width / ((east - west) * k), height / (north - south)) * (pad == null ? 0.95 : 1 - 2 * pad / Math.min(width, height));
    const ox = (width - (east - west) * k * sc) / 2, oy = (height - (north - south) * sc) / 2;
    return { k, sc, ox, oy, project: ([x, y]) => [ox + (x - west) * k * sc, oy + (north - y) * sc] };
  }

  function pathFor(geometry, project) {
    const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
    return polygons.flatMap(p => p.map(r => r.map((point, i) => {
      const [x, y] = project(point); return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join("") + "Z")).join("");
  }

  function teamGroupShown(show, key) {
    return key === "stores" ? STORE_TYPES.some(type => show.includes(type)) : show.includes(key);
  }

  function normalizeTeamLayers(state, layers) {
    const allowed = layers.flatMap(key => key === "stores" ? STORE_TYPES : [key]);
    const show = [...new Set((state.show || []).filter(key => allowed.includes(key)))];
    const buf = [...new Set((state.buf || []).filter(key => TEAM_BUF_ORDER.includes(key) && layers.includes(key) && teamGroupShown(show, key)))].slice(0, 2);
    return { ...state, show, buf };
  }

  function bufferPairColors(buf = []) {
    return TEAM_BUF_ORDER.filter(key => buf.includes(key)).slice(0, 2).map((key, i) => ({ key, color: BUF_PAIR_COLORS[i] }));
  }

  function toggleBuffer(buf = [], key) {
    if (buf.includes(key)) return buf.filter(k => k !== key);
    return buf.length < 2 ? [...buf, key] : [...buf];
  }

  function migrateTeamState(state) {
    if (Array.isArray(state.show)) return { ...state, show: [...state.show], buf: Array.isArray(state.buf) ? [...state.buf] : [], clip: !!state.clip };
    const show = [], buf = [];
    if (["parks", "routes", "chcs"].includes(state.condType)) {
      show.push(state.condType);
      if (state.miles > 0) buf.push(state.condType);
    }
    if (typeof state.stores === "string" && STORE_TYPES.includes(state.stores)) show.push(state.stores);
    const result = { ...state, show, buf, clip: !!state.onlyTowns, condType: "none", onlyTowns: false };
    delete result.stores;
    return result;
  }

  function clipToTowns(parks, docs) {
    return parks.flatMap(park => {
      const entries = docs.map(doc => doc[String(park.properties.id)]).filter(entry => entry != null);
      if (!entries.length) return [];
      if (entries.includes("all")) return [park];
      const pieces = entries.map(entry => turf.feature(entry.geometry));
      const geometry = pieces.length === 1 ? pieces[0].geometry : turf.union(turf.featureCollection(pieces)).geometry;
      const acresInside = Math.round(entries.reduce((sum, entry) => sum + entry.acres, 0) * 100) / 100;
      return [{ type: "Feature", properties: { ...park.properties, clipped: true, acresInside }, geometry }];
    });
  }

  function mergedBuffer(features, miles) {
    if (miles <= 0 || !features.length) return null;
    const buffers = bufferEach(features, miles);
    return buffers.length === 0 ? null : buffers.length === 1 ? buffers[0] : turf.union(turf.featureCollection(buffers));
  }

  function polygonPieces(feature) {
    if (!feature) return [];
    const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    return polygons.map(coordinates => { const piece = turf.polygon(coordinates); piece.bbox = turf.bbox(piece); return piece; });
  }

  function overlapOf(a, b) {
    return a && b ? turf.intersect(turf.featureCollection([a, b])) : null;
  }

  function landShare(tract, pieces) {
    if (!tract.aland) return 0;
    const land = turf.feature(tract.land), bbox = turf.bbox(land);
    let area = 0;
    for (const piece of pieces) {
      if (!bboxesOverlap(bbox, piece.bbox)) continue;
      const intersection = overlapOf(land, piece);
      if (intersection) area += turf.area(intersection);
    }
    return Math.min(1, area / tract.aland);
  }

  function sharePercent(share) {
    return share > 0 && share < 0.005 ? "<1%" : `${Math.round(100 * share)}%`;
  }

  function shareCell(touches, share) {
    return !touches ? "No" : share == null ? "Yes" : `Yes (${sharePercent(share)})`;
  }

  function tractShares(landTracts, unions) {
    const pieces = Object.entries(unions).map(([key, union]) => [key, polygonPieces(union)]);
    return Object.fromEntries(Object.entries(landTracts).map(([fips, tract]) => [fips,
      Object.fromEntries(pieces.map(([key, polygons]) => [key, landShare(tract, polygons)]))]));
  }

  function greenShare(tract, parks) {
    if (!tract.aland || !parks.length) return { acres: 0, share: 0 };
    const land = turf.feature(tract.land), bbox = turf.bbox(land);
    const pieces = parks.filter(park => bboxesOverlap(bbox, park.bbox || turf.bbox(park)))
      .map(park => overlapOf(land, park)).filter(Boolean);
    if (!pieces.length) return { acres: 0, share: 0 };
    const merged = pieces.length === 1 ? pieces[0] : turf.union(turf.featureCollection(pieces));
    const area = turf.area(merged);
    return { acres: area / 4046.856, share: Math.min(1, area / tract.aland) };
  }

  function cityGreen(landTracts, parks) {
    const byTract = Object.fromEntries(Object.entries(landTracts).map(([fips, tract]) => [fips, greenShare(tract, parks)]));
    const acres = Object.values(byTract).reduce((sum, item) => sum + item.acres, 0);
    const aland = Object.values(landTracts).reduce((sum, tract) => sum + (tract.aland || 0), 0);
    return { acres, share: aland ? acres * 4046.856 / aland : 0, byTract };
  }

  function estimateInside(items) {
    return items.reduce((result, { share, count }) => {
      if (count != null && !Number.isNaN(count)) { result.inside += share * count; result.total += count; }
      return result;
    }, { inside: 0, total: 0 });
  }

  function slicePaths(cx, cy, r, colors) {
    const n = x => (Math.abs(x) < 0.005 ? 0 : x).toFixed(2);
    if (colors.length === 1) return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${colors[0]}"/>`;
    const angle = 2 * Math.PI / colors.length;
    return colors.map((color, i) => {
      const point = a => `${n(cx + r * Math.sin(a))},${n(cy - r * Math.cos(a))}`;
      return `<path d="M${n(cx)},${n(cy)}L${point(i * angle)}A${n(r)},${n(r)} 0 ${angle > Math.PI ? 1 : 0} 1 ${point((i + 1) * angle)}Z" fill="${color}"/>`;
    }).join("");
  }

  function listNames(types) {
    const names = { cigarette: "cigarettes", vape: "vapes", liquor: "liquor (package)", cannabis: "cannabis", convenience: "convenience" };
    return STORE_TYPES.filter(type => types.includes(type)).map(type => names[type]).join(", ");
  }

  function placeTypes(place, shownTypes) {
    return STORE_TYPES.filter(type => shownTypes.includes(type) && place.properties.types.includes(type));
  }

  function storePlacesFor(places, shownTypes, tracts) {
    if (!shownTypes.length || !tracts.length) return [];
    const matching = places.filter(place => placeTypes(place, shownTypes).length);
    return pointsInTracts(pointsInBbox(matching, paddedBbox(tracts)), tracts);
  }

  function sourceLine(parts) {
    const normalized = parts.map(part => (part || "").trim().replace(/\.$/, "").trim()).filter(Boolean);
    return "Sources: " + [...new Set(normalized)].join("; ") + ".";
  }

  const api = { sourceLine, teamGroupShown, normalizeTeamLayers, TEAM_BUF_ORDER, BUF_PAIR_COLORS, STORE_TYPES, bufferPairColors, toggleBuffer, migrateTeamState, clipToTowns, mergedBuffer, polygonPieces, overlapOf, landShare, sharePercent, shareCell, tractShares, greenShare, cityGreen, estimateInside, slicePaths, listNames, storePlacesFor, placeTypes, fitProjection, pathFor, STEP_KEYS, resetStep, NO_CONDITION, RAMPS, METHODS, rampColors, breaks, classOf, paddedBbox, townsInBbox, filterRoutes, clipToBbox,
    pointsInBbox, pointsInTracts, nearestEdge, storeRows, filterOpenSpace, bufferEach, touchedTracts, countByTown, touchingGroup, acsRange, encodeState, decodeState };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ExplorerCore = api;
})(typeof self !== "undefined" ? self : this);
