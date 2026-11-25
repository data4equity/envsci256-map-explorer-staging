/* ENVSCI 256 map explorer: the five steps (filter → color → condition → buffer → save) in a left
   panel beside a Leaflet map. Logic lives in core.js; this file is the page.
   Built from the approved mockups (Dropbox: Map explorer (Felt cap) - handoff/mockups-2026-11-18). */
(function (root) {
  const C = root.ExplorerCore;
  const ACS_SHARES = {
    pct_65plus: { label: "Residents 65 and older", src: "Census estimate (ACS 2019–2023)", unit: "%", decimals: 1, moe: "pct_65plus_moe90" },
    pct_hh_children: { label: "Households with children under 18", src: "Census estimate (ACS 2019–2023)", unit: "%", decimals: 1, moe: "pct_hh_children_moe90" }
  };
  const COLUMN_NOTES = {
    green: "<b>Public green space</b> The share of the census tract's land that is public open space. It counts land only, not water. It leaves out open space whose public access is limited, closed or unknown, such as some cemeteries and parkways. It follows the minimum acres and the parks you switch off in step 3.",
    value: "<b>Value</b> The census tract's value for the layer chosen in step 2, in the unit shown in the column heading.",
    ci: "<b>95% Confidence Intervals</b> A range around the value. If the survey were repeated many times, about 95 of every 100 ranges built this way would hold the true value. A wide range means a less certain estimate.",
    moe: "<b>Margin of error (±)</b> How far the estimate could sit from the true value, at 95% confidence. The range in the column to its left equals the value plus or minus this number.",
    "buf-parks": "<b>Parks buffer</b> “Yes” means some part of the census tract sits inside the buffer around the parks. The percent gives the share of the tract's land inside that buffer.",
    "buf-routes": "<b>Roads buffer</b> “Yes” means some part of the census tract sits inside the buffer around the roads. The percent gives the share of the tract's land inside that buffer.",
    "buf-chcs": "<b>Health centers buffer</b> “Yes” means some part of the census tract sits inside the buffer around the health centers. The percent gives the share of the tract's land inside that buffer.",
    "buf-stores": "<b>Store buffer</b> “Yes” means some part of the census tract sits inside the buffer around the stores shown on the map. The percent gives the share of the tract's land inside that buffer.",
    both: "<b>Inside both</b> The share of the census tract's land inside both buffers at the same time. On the map: the purple lines.",
    buffer: "<b>Included in the buffer?</b> “Yes” means some part of the census tract touches at least one buffer. A census tract counts even when only a corner sits inside a buffer."
  };
  const BUF_COLORS = [["#ea580c", "Orange"], ["#dc2626", "Red"], ["#1d2522", "Black"], ["#c026d3", "Magenta"], ["#0f766e", "Teal"], ["#2563eb", "Blue"]];
  const FOCUS_COLS = ["#d97706", "#2563eb", "#c026d3", "#0f766e", "#dc2626", "#4d7c0f"];
  const FOCUS_DASH = ["", "10 6", "3 5"];
  const STORE_COLORS = { cigarette: "#c62828", vape: "#f9a825", liquor: "#283593", cannabis: "#6d4c41", convenience: "#ad1457" };
  const CHC_COLOR = "#c2185b"; // community health centers, as in the approved Question B mockup
  const ACCESS = [["Y", "Y · open to the public"], ["L", "L · limited access"], ["N", "N · not open"], ["X", "X · unknown"], ["any", "Any access"]];

  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmt = v => v == null ? "–" : (Math.round(v * 10) / 10).toFixed(1);
  // Team pages, her pick 2026-11-25 (Choice 2 A). Draft wording until she approves it.
  const WHY_ONE_OUTLINE = "<b>Why one outline?</b> Where the buffers around two parks overlap, the map joins them into one outline. Separate rings around every park would overlap into a tangle of lines. The joined outline also marks the exact area behind the percents in the tract table. To see the buffer around one park, untick Select all parks and tick that park, or click Zoom next to its name.";
  // Her pick 2026-11-25 (A2): a light tint inside each team buffer, so the gaps in it show as untinted ground.
  const BUF_TINT = 0.16;
  const tint = hex => `rgba(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(",")},${BUF_TINT})`;
  const BUF_BOX_LABELS = { parks: "Parks", routes: "Roads", chcs: "Health centers", stores: "Stores" };
  const selectAllBox = (key, text, offCount, total) => `<label class="selall"><input type="checkbox" data-k="${key}" ${C.selectAllState(offCount, total).checked ? "checked" : ""}><span>${text}</span></label>`;
  const el = (tag, attrs = {}, html = "") => { const e = document.createElement(tag); for (const k in attrs) e.setAttribute(k, attrs[k]); e.innerHTML = html; return e; };

  /** Property holding a measure's value / 95% range (PLACES columns end in _CrudePrev / _Crude95CI). */
  // Term Project layers read from a question's file (data/term/…): { key: {label, unit, src, decimals, year} }.
  // Registered once per file; only a team page lists them in step 2, so Exercise 4 and the midterm never see them.
  const TERM = {};
  const valueKey = m => (ACS_SHARES[m] || TERM[m] ? m : `${m}_CrudePrev`);
  const ciKey = m => (ACS_SHARES[m] || TERM[m] ? null : `${m}_Crude95CI`);
  const unitOf = m => (TERM[m] ? TERM[m].unit : "%");
  const fmtFor = m => v => { const d = TERM[m] ? TERM[m].decimals : 1; return v == null ? "–" : (Math.round(v * 10 ** d) / 10 ** d).toFixed(d); };

  /** A layer whose range the page computes (Census layers, Term Project layers), or null for PLACES. */
  const rangeField = m => TERM[m] || ACS_SHARES[m] || null;

  /** Tract card line(s) for such a layer: its 95% interval and margin of error, or why it has none. */
  function termRangeLine(m, p) {
    const f = rangeField(m), r = C.acsRange(f, p, m);
    if (r && r.ci) return `<div class="small">95% confidence interval: <b>${esc(r.ci)}</b></div><div class="small">Margin of error: <b>${esc(r.moe)}</b> ${f.unit === "%" ? "percentage points" : esc(f.unit)}</div>`;
    if (r && r.none) return `<div class="small muted">${esc(r.none)}</div>`;
    return `<div class="small muted">${esc(f.src)}; no margin of error for this tract</div>`;
  }

  function measureLabel(key) {
    if (ACS_SHARES[key]) return `${ACS_SHARES[key].label}, %`;
    if (TERM[key]) return TERM[key].unit === "year" ? TERM[key].label : `${TERM[key].label}, ${TERM[key].unit}${TERM[key].per ? " " + TERM[key].per : ""}`;
    const m = root.PLACES_MEASURES[key];
    return m ? `${m.label}, %` : key;
  }

  const DEFAULT_STATE = {
    towns: [], measure: "BPHIGH", method: "quantile", classes: 5, ramp: "Blues", legend: "",
    condType: "routes", routeMode: "name", routeNames: [], adminType: 2, rtNumber: "1",
    access: "Y", minAcres: 0, onlyTowns: false, off: [], miles: 0.12,
    bufColor: "#ea580c", condName: "", bufName: "", title: "", focus: null
  };

  let explorerCount = 0;

  class Explorer {
    /** data: { tracts, routes, sources, openSpaceFor(bbox) → Promise<features>, healthCenters() → Promise<features> }
        opts (team pages only): { termLayers: [keys], termHeading: "Question A layers", conditions: ["chcs"],
                                  stores: [{ key, label }] with data.storePlaces() → Promise<{ features }> } */
    constructor(rootEl, data, state, opts) {
      this.root = rootEl; this.data = data; this.opts = opts || {};
      this.opening = structuredClone(this.opts.opening || DEFAULT_STATE);
      this.team = Array.isArray(this.opts.layers);
      this.s = Object.assign({}, DEFAULT_STATE, state || {});
      if (this.team) this.s = C.normalizeTeamLayers(C.migrateTeamState(this.s), this.opts.layers);
      if (!this.s.legend) this.s.legend = measureLabel(this.s.measure);
      this.towns = [...new Set(data.tracts.map(f => f.properties.City_Town))].filter(Boolean).sort();
      this.routeNames = [...new Set(data.routes.map(f => f.properties.Route_Name))].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
      this.parkList = []; this.offParks = []; this.offCenters = []; this.cond = []; this.bufs = []; this.touch = new Set(); this.focusGroup = [];
      this.viewAlpha = 1; this.peek = false; this.insetOff = false; this.noteOpen = null;
      this.build();
      this.update(true);
    }

    set(key, value, refit) {
      this.s[key] = value;
      if (key === "measure") this.s.legend = measureLabel(value);
      if (key === "towns" || key === "condType" || key === "access" || key === "minAcres" || key === "onlyTowns") this.s.focus = null;
      return this.update(refit);
    }

    setMany(obj, replace = false) {
      if (replace) this.s = Object.assign({}, DEFAULT_STATE, obj); else Object.assign(this.s, obj);
      return this.update(Object.prototype.hasOwnProperty.call(obj, "towns"));
    }

    /* ---------------- layout ---------------- */
    build() {
      const r = this.root; r.innerHTML = ""; r.className = "xp";
      this.panel = el("div", { class: "xpanel" });
      this.mapEl = el("div", { class: "xmap", role: "region", "aria-label": "Map of census tracts" });
      this.legendEl = el("div", { class: "xlegend" });
      this.focusEl = el("div", { class: "xfocus" }); this.focusEl.hidden = true;
      this.tableEl = el("div", { class: "xtable" });
      // Her pick 2026-11-25 (Choice 1 B): what the buffer holds sits in a band above the map, where it is hard to miss.
      this.bandEl = el("div", { class: "xband", "aria-live": "polite" }); this.bandEl.hidden = true;
      const mapCol = el("div", { class: "xmapcol" });
      const id = `xstrength-${++explorerCount}`;
      this.overlapId = `xp-ov-${explorerCount}`;
      const bar = el("div", { class: "xviewbar" }, `<label for="${id}">Opacity of buffers and neighborhood conditions</label><input id="${id}" type="range" min="0" max="100" step="5" value="100"><output>100%</output><button type="button" class="btn ghost peek" aria-pressed="false">Census tract colors only (press and hold)</button>`);
      const range = bar.querySelector("input"), output = bar.querySelector("output"), peek = bar.querySelector("button");
      range.addEventListener("input", () => { this.viewAlpha = Number(range.value) / 100; output.textContent = `${range.value}%`; this.applyView(); });
      const setPeek = value => { this.peek = value; peek.setAttribute("aria-pressed", String(value)); this.applyView(); };
      peek.addEventListener("pointerdown", () => setPeek(true));
      ["pointerup", "pointerleave", "pointercancel"].forEach(event => peek.addEventListener(event, () => setPeek(false)));
      peek.addEventListener("keydown", e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!e.repeat) setPeek(true); } });
      peek.addEventListener("keyup", e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setPeek(false); } });
      const strip = el("aside", { class: "xstrip" }), header = el("div", { class: "inhead" }, '<span class="il">Census tract colors only</span>');
      const toggle = el("button", { class: "rlink", type: "button" }, "Remove the inset");
      this.insetEl = el("div", { class: "inbox" });
      toggle.onclick = () => { this.insetOff = !this.insetOff; this.insetEl.hidden = this.insetOff; toggle.textContent = this.insetOff ? "Show the inset" : "Remove the inset"; };
      header.append(toggle); strip.append(header, this.insetEl, this.legendEl);
      this.mapEl.append(this.focusEl); mapCol.append(bar, this.bandEl, this.mapEl, strip);
      r.append(this.panel, mapCol, this.tableEl);
      this.open = new Set(["Filter"]);
      this.map = L.map(this.mapEl, { preferCanvas: true, zoomSnap: 0.25 });
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 16, attribution: "Basemap: Esri, HERE, Garmin, © OpenStreetMap contributors, and the GIS user community" }).addTo(this.map);
      this.map.createPane("buffers"); this.map.getPane("buffers").style.zIndex = 415;
      this.bufRenderer = L.svg({ pane: "buffers" }).addTo(this.map);
      this.map.createPane("overlay"); this.map.getPane("overlay").style.zIndex = 420;
      this.overlayRenderer = L.canvas({ pane: "overlay" });
      this.lyr = { grey: L.layerGroup(), tracts: L.layerGroup(), cond: L.layerGroup(), buf: L.layerGroup(), pair: L.layerGroup(), focus: L.layerGroup(), pick: L.layerGroup() };
      Object.values(this.lyr).forEach(l => l.addTo(this.map));
      this.map.createPane("labels"); this.map.getPane("labels").style.zIndex = 450; this.map.getPane("labels").style.pointerEvents = "none";
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16, pane: "labels" }).addTo(this.map);
      [this.legendEl, this.focusEl].forEach(e => { L.DomEvent.disableClickPropagation(e); L.DomEvent.disableScrollPropagation(e); });
      this.map.on("popupopen", e => {
        const pe = e.popup.getElement(); if (!pe) return;
        pe.querySelectorAll("[data-zoom]").forEach(b => b.onclick = () => { this.map.closePopup(); this.set("focus", +b.dataset.zoom); });
        pe.querySelectorAll("[data-tog]").forEach(b => b.onclick = () => { this.map.closePopup(); this.toggleOff(+b.dataset.tog); });
        pe.querySelectorAll("[data-ctog]").forEach(b => b.onclick = () => { this.map.closePopup(); this.toggleCenter(+b.dataset.ctog); });
      });
    }

    toggleOff(id) { const off = this.s.off; return this.set("off", off.includes(id) ? off.filter(x => x !== id) : [...off, id]); }
    toggleCenter(id) { const off = this.s.chcsOff || []; return this.set("chcsOff", off.includes(id) ? off.filter(x => x !== id) : [...off, id]); }

    groupShown(key) { return C.teamGroupShown(this.s.show, key); }
    pruneBuf() { if (this.team) this.s = C.normalizeTeamLayers(this.s, this.opts.layers); }

    renderPanel() {
      if (this.team) return this.renderTeamPanel();
      const keepScroll = this.panel.scrollTop;
      this.panel.innerHTML = "";
      const start = el("button", { class: "btn ghost startover", type: "button", "data-k": "startover" }, "↺ Start over");
      start.onclick = () => { this.pick = null; const next = C.resetStep(this.s, this.opening, "all"); if (!next.legend) next.legend = measureLabel(next.measure || DEFAULT_STATE.measure); this.setMany(next, true); };
      this.panel.append(start);
      const steps = [["Filter", "Filter tracts by town (one or more)", this.gFilter()], ["Style", "Color the tracts", this.gStyle()],
        ["Condition", "Neighborhood conditions", this.gCond()], ["Buffer", "Buffer neighborhood conditions", this.gBuffer()], ["Save", "Map title, save map image and copy map link", this.gSave()]];
      steps.forEach(([key, title, body], i) => {
        const step = key.toLowerCase();
        const d = el("details", this.open.has(key) ? { open: "" } : {}, `<summary><span class="num">${i + 1}</span> ${title}${i < 4 ? `<button type="button" class="rlink" data-reset="${step}">Reset</button>` : ""}</summary>`);
        if (i < 4) d.querySelector("[data-reset]").onclick = e => {
          e.preventDefault(); e.stopPropagation();
          const next = C.resetStep(this.s, this.opening, step);
          this.s = Object.assign({}, DEFAULT_STATE, next);
          if (!this.s.legend) this.s.legend = measureLabel(this.s.measure);
          this.setMany(step === "filter" ? { towns: next.towns } : {});
        };
        d.addEventListener("toggle", () => {
          // Her ask 2026-11-25: opening a step closes the others, so one step shows at a time.
          if (d.open) this.panel.querySelectorAll("details[open]").forEach(other => { if (other !== d) other.open = false; });
          d.open ? this.open.add(key) : this.open.delete(key);
        });
        d.append(body); this.panel.append(d);
      });
      this.panel.scrollTop = keepScroll;
    }

    renderTeamPanel() {
      const keepScroll = this.panel.scrollTop;
      this.panel.innerHTML = "";
      const start = el("button", { class: "btn ghost startover", type: "button", "data-k": "startover" }, "↺ Start over");
      start.onclick = () => { this.pick = null; this.s = Object.assign({}, DEFAULT_STATE, C.resetStep(this.s, this.opening, "all")); this.s = C.migrateTeamState(this.s); this.pruneBuf(); if (!this.s.legend) this.s.legend = measureLabel(this.s.measure); this.update(true); };
      this.panel.append(start);
      const steps = [["Filter", "Filter tracts by town (one or more)", this.gFilter(), 1, "filter"], ["Style", "Color the tracts", this.gStyle(), 2, "style"],
        ["Show", "Neighborhood conditions", this.gShow(), 3, "show"], ["Bufferthese", "Buffer neighborhood conditions", this.gBufferThese(), 4, "bufferthese"],
        ["Buffer", "Buffer distance, miles", this.gBuffer(), 5, "buffer"], ["Save", "Map title, save map image and copy map link", this.gSave(), 6, null]];
      steps.forEach(([key, title, body, number, step]) => {
        const d = el("details", this.open.has(key) ? { open: "" } : {}, `<summary>${number ? `<span class="num">${number}</span> ` : ""}${title}${step ? `<button type="button" class="rlink" data-reset="${step}">Reset</button>` : ""}</summary>`);
        if (step) d.querySelector("[data-reset]").onclick = e => {
          e.preventDefault(); e.stopPropagation();
          this.s = Object.assign({}, DEFAULT_STATE, C.resetStep(this.s, this.opening, step));
          this.s = C.migrateTeamState(this.s); this.pruneBuf();
          if (!this.s.legend) this.s.legend = measureLabel(this.s.measure);
          this.update(step === "filter");
        };
        d.addEventListener("toggle", () => {
          // Her ask 2026-11-25: opening a step closes the others, so one step shows at a time.
          if (d.open) this.panel.querySelectorAll("details[open]").forEach(other => { if (other !== d) other.open = false; });
          d.open ? this.open.add(key) : this.open.delete(key);
        });
        d.append(body); this.panel.append(d);
      });
      this.panel.scrollTop = keepScroll;
    }

    /* ---------------- step 1: filter ---------------- */
    gFilter() {
      const s = this.s, w = el("div", { class: "ctl" });
      w.innerHTML = `<div class="hint">You can choose <b>more than one town</b>. Add your town, then add each town you compare it with, one at a time. Every town you add stays on the map.</div>
        <div class="frow"><span class="fpill">City_Town</span><span class="muted small">is any of</span></div>
        <div class="chips">${s.towns.map(t => `<span class="chip">${esc(t)}<button type="button" data-x="${esc(t)}" aria-label="Remove ${esc(t)}">×</button></span>`).join("") || '<span class="muted small">No filter yet: the map shows all of Massachusetts.</span>'}</div>
        <label for="xp-add-town" class="sr">Add a town</label>
        <select id="xp-add-town"><option value="">${s.towns.length ? "+ Add another town…" : "+ Add a town…"}</option>${this.towns.filter(t => !s.towns.includes(t)).map(t => `<option>${esc(t)}</option>`).join("")}</select>
        <div class="muted small">${this.sel.length.toLocaleString()} of ${this.data.tracts.length.toLocaleString()} census tracts in your filter. Other towns show in grey.</div>`;
      w.querySelectorAll("[data-x]").forEach(b => b.onclick = () => this.set("towns", s.towns.filter(t => t !== b.dataset.x), true));
      w.querySelector("select").onchange = e => { const v = e.target.value; if (v) this.set("towns", [...s.towns, v], true); };
      return w;
    }

    /* ---------------- step 2: color ---------------- */
    gStyle() {
      const s = this.s, w = el("div", { class: "ctl" });
      const places = Object.keys(root.PLACES_MEASURES).sort((a, b) => root.PLACES_MEASURES[a].label.localeCompare(root.PLACES_MEASURES[b].label));
      w.innerHTML = `<label>Color tracts by<select data-k="measure">
          <optgroup label="Health (CDC PLACES 2025)">${places.map(k => `<option value="${k}" ${k === s.measure ? "selected" : ""}>${esc(root.PLACES_MEASURES[k].label)} (${k})</option>`).join("")}</optgroup>
          <optgroup label="Population (ACS 2019–2023)">${Object.keys(ACS_SHARES).map(k => `<option value="${k}" ${k === s.measure ? "selected" : ""}>${esc(ACS_SHARES[k].label)} (${k})</option>`).join("")}</optgroup>${this.termOptions()}</select></label>
        <div class="two"><label>Classification<select data-k="method">${Object.entries(C.METHODS).map(([k, v]) => `<option value="${k}" ${k === s.method ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <label>Classes<select data-k="classes">${[3, 4, 5, 6, 7].map(n => `<option ${n === s.classes ? "selected" : ""}>${n}</option>`).join("")}</select></label></div>
        <div class="lbl">Color ramp</div><div class="ramps">${Object.keys(C.RAMPS).map(r => `<button type="button" data-r="${r}" aria-pressed="${r === s.ramp}" aria-label="${r}">${C.rampColors(r, 5).map(c => `<i style="background:${c}"></i>`).join("")}</button>`).join("")}</div>
        <label>Layer name (shows as the legend title)<input type="text" data-k="legend" value="${esc(s.legend)}"></label>`;
      w.querySelector("[data-k=measure]").onchange = e => this.set("measure", e.target.value);
      w.querySelector("[data-k=method]").onchange = e => this.set("method", e.target.value);
      w.querySelector("[data-k=classes]").onchange = e => this.set("classes", +e.target.value);
      w.querySelector("[data-k=legend]").oninput = e => { s.legend = e.target.value; this.renderLegend(); };
      w.querySelectorAll("[data-r]").forEach(b => b.onclick = () => this.set("ramp", b.dataset.r));
      return w;
    }

    termOptions() {
      const keys = (this.opts.termLayers || []).filter(k => TERM[k]), s = this.s;
      return keys.length ? `<optgroup label="${esc(this.opts.termHeading || "Term Project layers")}">${keys.map(k => `<option value="${k}" ${k === s.measure ? "selected" : ""}>${esc(TERM[k].per ? measureLabel(k) : TERM[k].label)} (${k})</option>`).join("")}</optgroup>` : "";
    }

    /* ---------------- step 3: condition ---------------- */
    gCond() {
      const s = this.s, w = el("div", { class: "ctl" });
      let body = "";
      if (s.condType === "routes") {
        body = `<div class="seg" role="group" aria-label="Filter routes by"><button type="button" data-m="name" aria-pressed="${s.routeMode === "name"}">By name</button><button type="button" data-m="num" aria-pressed="${s.routeMode === "num"}">By type + number</button></div>` +
          (s.routeMode === "name"
            ? `<label>Route_Name is any of (hold Ctrl or ⌘ to pick more than one)<select data-k="rn" multiple size="6">${this.routeOptions()}</select></label>`
            : `<div class="two"><label>ADMIN_TYPE<select data-k="at">${[[1, "1 · Interstate"], [2, "2 · U.S. route"], [3, "3 · State route"]].map(([k, v]) => `<option value="${k}" ${k == s.adminType ? "selected" : ""}>${v}</option>`).join("")}</select></label><label>RT_NUMBER<input type="text" data-k="rt" value="${esc(s.rtNumber)}"></label></div>`) +
          `<div class="muted small">${this.condCount} route${this.condCount === 1 ? "" : "s"} kept</div>`;
      } else if (s.condType === "chcs") {
        body = this.centerPicker();
      } else if (s.condType === "parks") {
        body = `<div class="two"><label>PUB_ACCESS<select data-k="pa">${ACCESS.map(([k, v]) => `<option value="${k}" ${k === s.access ? "selected" : ""}>${v}</option>`).join("")}</select></label>
          <label>GIS_ACRES at least<input type="number" min="0" step="1" data-k="ac" value="${s.minAcres}"></label></div>
          <label class="check"><input type="checkbox" data-k="ot" ${s.onlyTowns ? "checked" : ""}> <span>Only open space inside the towns I chose in step 1</span></label>` + this.parkPicker();
      }
      w.innerHTML = `<label>Layer<select data-k="ct"><option value="none" ${s.condType === "none" ? "selected" : ""}>No condition</option><option value="routes" ${s.condType === "routes" ? "selected" : ""}>MA_major_routes · major roads</option><option value="parks" ${s.condType === "parks" ? "selected" : ""}>MA_openspace · parks and open space</option>${(this.opts.conditions || []).includes("chcs") ? `<option value="chcs" ${s.condType === "chcs" ? "selected" : ""}>CHCS_PT · community health centers</option>` : ""}</select></label><button type="button" class="btn ghost" data-k="rmcond" ${s.condType === "none" ? "disabled" : ""}>Remove</button>${body}
        ${s.condType !== "none" ? `<label>Layer name (shows in the legend)<input type="text" data-k="cn" value="${esc(this.condName())}"></label>` : ""}`;
      const q = k => w.querySelector(`[data-k=${k}]`);
      q("ct").onchange = e => this.set("condType", e.target.value, false);
      q("rmcond").onclick = () => this.setMany({ condType: "none", miles: 0, focus: null });
      if (q("cn")) q("cn").oninput = e => { s.condName = e.target.value; this.renderLegend(); };
      w.querySelectorAll("[data-m]").forEach(b => b.onclick = () => this.set("routeMode", b.dataset.m));
      if (q("rn")) q("rn").onchange = e => this.set("routeNames", [...e.target.selectedOptions].map(o => o.value));
      if (q("at")) { q("at").onchange = e => this.set("adminType", +e.target.value); q("rt").onchange = e => this.set("rtNumber", e.target.value.trim()); }
      if (q("pa")) {
        q("pa").onchange = e => this.set("access", e.target.value);
        q("ac").onchange = e => this.set("minAcres", Math.max(0, +e.target.value || 0));
        q("ot").onchange = e => this.set("onlyTowns", e.target.checked);
      }
      w.querySelectorAll(".plist [data-pid]").forEach(c => c.onchange = () => this.toggleOff(+c.dataset.pid));
      w.querySelectorAll(".plist [data-zoom]").forEach(b => b.onclick = e => { e.preventDefault(); this.set("focus", +b.dataset.zoom); });
      if (q("st")) q("st").onchange = e => this.set("stores", e.target.value);
      w.querySelectorAll(".plist [data-cid]").forEach(c => c.onchange = () => this.toggleCenter(+c.dataset.cid));
      if (q("call")) {
        q("call").onclick = () => this.set("chcsOff", []);
        q("cnone").onclick = () => this.set("chcsOff", this.centerList.map(f => f.properties.id));
      }
      if (q("pall")) {
        q("pall").onclick = () => this.set("off", []);
        q("pnone").onclick = () => this.set("off", this.parkList.map(f => f.properties.id));
        q("ps").oninput = e => { const v = e.target.value.toLowerCase(); w.querySelectorAll(".prow").forEach(r => { r.hidden = !r.textContent.toLowerCase().includes(v); }); };
      }
      return w;
    }

    /** Step 3's road list (her pick 2026-11-25, option B): the roads that cross the chosen towns come first, each
        naming its towns, then every other major road. Worked out once per set of towns. */
    routeOptions() {
      const s = this.s, option = (r, label) => `<option value="${esc(r)}" ${s.routeNames.includes(r) ? "selected" : ""}>${label}</option>`;
      if (!s.towns.length) return this.routeNames.map(r => option(r, esc(r))).join("");
      const key = s.towns.join("|");
      if (this.routeTownsKey !== key) { this.routeTownsKey = key; this.routeTownsMap = C.routeTowns(this.data.routes, this.sel, s.towns); }
      const byTown = this.routeTownsMap, inTowns = this.routeNames.filter(r => byTown[r]), elsewhere = this.routeNames.filter(r => !byTown[r]);
      return (inTowns.length ? `<optgroup label="In ${esc(C.townsPhrase(s.towns))}">${inTowns.map(r => option(r, `${esc(r)} · ${esc(byTown[r].join(" and "))}`)).join("")}</optgroup>` : "") +
        `<optgroup label="Elsewhere in Massachusetts">${elsewhere.map(r => option(r, esc(r))).join("")}</optgroup>`;
    }

    parkPicker() {
      const s = this.s, list = [...this.parkList].sort((a, b) => ((a.properties.Town || "") + (a.properties.SITE_NAME || "")).localeCompare((b.properties.Town || "") + (b.properties.SITE_NAME || "")));
      if (!s.towns.length) return `<div class="muted small">Filter to your towns in step 1 first. Then the parks near them are listed here.</div>`;
      if (!list.length) return `<div class="muted small">No open space matches these filters near your towns.</div>`;
      return `<div class="pk-head"><b>${this.team ? "Which parks show on the map?" : "Which parks get a buffer?"}</b><span class="muted small">${list.length - this.offParks.length} of ${list.length} in view</span></div>
        <div class="muted small">${this.team ? "Uncheck a park to switch it off. A switched-off park turns grey and gets no buffer. Click Zoom, or click a park on the map, to look at it up close." : "Uncheck a park to remove its buffer; a removed park turns grey. Click Zoom, or click a park on the map, to look at it up close."}</div>
        <div class="row"><label for="xp-park-search" class="sr">Search parks</label><input id="xp-park-search" type="text" data-k="ps" placeholder="Search by name or town">${this.team ? "" : '<button class="btn ghost" data-k="pall" type="button">All</button><button class="btn ghost" data-k="pnone" type="button">None</button>'}</div>
        ${this.team ? selectAllBox("pselall", "Select all parks", this.offParks.length, list.length) : ""}<div class="plist">${list.map(f => { const p = f.properties; return `<label class="prow"><input type="checkbox" data-pid="${p.id}" ${s.off.includes(p.id) ? "" : "checked"}><span>${esc(p.SITE_NAME || "Unnamed open space")}</span><span class="muted">${esc(p.Town)} · ${fmt(p.GIS_ACRES)} ac</span><button type="button" class="zbtn" data-zoom="${p.id}">Zoom</button></label>`; }).join("")}</div>${this.team ? `<div class="muted small pk-why">${WHY_ONE_OUTLINE}</div>` : ""}`;
    }

    centerPicker() {
      const s = this.s, off = s.chcsOff || [], list = [...this.centerList].sort((a, b) => (a.properties.GEOG_MUNI + a.properties.NAME + a.properties.ADDRESS).localeCompare(b.properties.GEOG_MUNI + b.properties.NAME + b.properties.ADDRESS));
      if (!s.towns.length) return `<div class="muted small">Filter to your towns in step 1 first. Then the health centers near them are listed here.</div>`;
      if (!list.length) return `<div class="muted small">No community health centers near your towns.</div>`;
      return `<div class="pk-head"><b>${this.team ? "Which health centers show on the map?" : "Which health centers get a buffer?"}</b><span class="muted small">${list.length - this.offCenters.length} of ${list.length} in view</span></div>
        <div class="muted small">${this.team ? "Uncheck a center to switch it off. A switched-off center turns grey and gets no buffer." : "Uncheck a center to remove its buffer; a removed center turns grey. Choose the buffer distance in step 4."}</div>
        ${this.team ? selectAllBox("cselall", "Select all health centers", this.offCenters.length, list.length) : '<div class="row"><button class="btn ghost" data-k="call" type="button">All</button><button class="btn ghost" data-k="cnone" type="button">None</button></div>'}
        <div class="plist">${list.map(f => { const p = f.properties; return `<label class="prow"><input type="checkbox" data-cid="${p.id}" ${off.includes(p.id) ? "" : "checked"}><span>${esc(p.NAME)}</span><span class="muted">${esc(p.ADDRESS)} · ${esc(townName(p.GEOG_MUNI))}</span></label>`; }).join("")}</div>`;
    }

    gShow() {
      const s = this.s, w = el("div", { class: "ctl" });
      const group = (key, text, swatch, body = "") => `<label class="check"><input type="checkbox" data-show="${key}" ${s.show.includes(key) ? "checked" : ""}> <span><i class="sw ${swatch}"></i>${text}</span></label>${s.show.includes(key) ? `<div class="sub">${body}</div>` : ""}`;
      const road = `<div class="seg" role="group" aria-label="Filter routes by"><button type="button" data-m="name" aria-pressed="${s.routeMode === "name"}">By name</button><button type="button" data-m="num" aria-pressed="${s.routeMode === "num"}">By type + number</button></div>` +
        (s.routeMode === "name" ? `<label>Route_Name is any of (hold Ctrl or ⌘ to pick more than one)<select data-k="rn" multiple size="6">${this.routeOptions()}</select></label>` : `<div class="two"><label>ADMIN_TYPE<select data-k="at">${[[1, "1 · Interstate"], [2, "2 · U.S. route"], [3, "3 · State route"]].map(([k, v]) => `<option value="${k}" ${k == s.adminType ? "selected" : ""}>${v}</option>`).join("")}</select></label><label>RT_NUMBER<input type="text" data-k="rt" value="${esc(s.rtNumber)}"></label></div>`) +
        `<div class="muted small">${this.condCount || 0} route${this.condCount === 1 ? "" : "s"} kept</div>${s.routeMode === "name" && !s.routeNames.length || s.routeMode !== "name" && !s.rtNumber ? '<div class="muted small">Choose one or more roads in the list.</div>' : ""}`;
      const parks = `<label class="check"><input type="checkbox" data-k="clip" ${s.clip ? "checked" : ""} ${s.towns.length ? "" : "disabled"}> <span>✂ Clip open space to my towns</span></label>${this.clipError ? '<div class="muted small">The page could not load the town lines. Reload the page to clip open space.</div>' : ""}<div class="two"><label>PUB_ACCESS<select data-k="pa">${ACCESS.map(([k, v]) => `<option value="${k}" ${k === s.access ? "selected" : ""}>${v}</option>`).join("")}</select></label><label>GIS_ACRES at least<input type="number" min="0" step="1" data-k="ac" value="${s.minAcres}"></label></div>${this.parkPicker()}`;
      const stores = (this.opts.stores || []).map(o => `<label class="check"><input type="checkbox" data-show="${esc(o.key)}" ${s.show.includes(o.key) ? "checked" : ""}> <span><i class="sw dot" style="background:${STORE_COLORS[o.key]}"></i>${esc(o.label)}</span>${this.storeDoc && s.towns.length ? `<span class="cnt">${C.storePlacesFor(this.storeDoc.features, [o.key], this.sel).length}</span>` : ""}</label>`).join("") + `<div class="hint small">Stores licensed to sell vapes: the state's vape list includes stores that also sell cigarettes.</div>`;
      w.innerHTML = this.opts.layers.map(key => key === "routes" ? group(key, "MA_major_routes · major roads", "rd", road) : key === "parks" ? group(key, "MA_openspace · parks and open space", "pk", parks) : key === "chcs" ? group(key, "CHCS_PT · community health centers", "hc", this.centerPicker()) : key === "stores" ? stores : "").join("");
      const q = k => w.querySelector(`[data-k=${k}]`);
      w.querySelectorAll("[data-show]").forEach(c => c.onchange = () => { const key = c.dataset.show; s.show = c.checked ? [...s.show, key] : s.show.filter(x => x !== key); if (key === "parks" && !c.checked) s.focus = null; this.pruneBuf(); this.update(); });
      w.querySelectorAll("[data-m]").forEach(b => b.onclick = () => this.set("routeMode", b.dataset.m));
      if (q("rn")) q("rn").onchange = e => this.set("routeNames", [...e.target.selectedOptions].map(o => o.value));
      if (q("at")) { q("at").onchange = e => this.set("adminType", +e.target.value); q("rt").onchange = e => this.set("rtNumber", e.target.value.trim()); }
      if (q("clip")) q("clip").onchange = e => this.set("clip", e.target.checked);
      if (q("pa")) { q("pa").onchange = e => this.set("access", e.target.value); q("ac").onchange = e => this.set("minAcres", Math.max(0, +e.target.value || 0)); }
      w.querySelectorAll(".plist [data-pid]").forEach(c => c.onchange = () => this.toggleOff(+c.dataset.pid));
      w.querySelectorAll(".plist [data-zoom]").forEach(b => b.onclick = e => { e.preventDefault(); this.set("focus", +b.dataset.zoom); });
      w.querySelectorAll(".plist [data-cid]").forEach(c => c.onchange = () => this.toggleCenter(+c.dataset.cid));
      // Select all (her pick 2026-11-25, Choice 2 A): ticked switches every listed item on, unticked switches them all off.
      const selectAll = (k, list, offList, key) => { const box = q(k); if (!box) return; box.indeterminate = C.selectAllState(offList.length, list.length).indeterminate; box.onchange = () => this.set(key, box.checked ? [] : list.map(f => f.properties.id)); };
      selectAll("pselall", this.parkList, this.offParks, "off"); selectAll("cselall", this.centerList, this.offCenters, "chcsOff");
      if (q("ps")) q("ps").oninput = e => { const v = e.target.value.toLowerCase(); w.querySelectorAll(".prow").forEach(r => { r.hidden = !r.textContent.toLowerCase().includes(v); }); };
      return w;
    }

    gBufferThese() {
      const s = this.s, w = el("div", { class: "ctl" }), colors = C.bufferPairColors(s.buf, s.ramp);
      const labels = { parks: "Parks and open space", routes: "Major roads", chcs: "Community health centers", stores: "Stores shown above" };
      w.innerHTML = C.TEAM_BUF_ORDER.filter(key => this.opts.layers.includes(key)).map(key => {
        const color = colors.find(item => item.key === key), disabled = !this.groupShown(key) || (!color && s.buf.length >= 2);
        return `<label class="check"><input type="checkbox" data-buf="${key}" ${color ? "checked" : ""} ${disabled ? "disabled" : ""}> <span>${color ? `<i class="sw ln" style="border-color:${color.color}"></i>` : ""}${labels[key]}</span></label>`;
      }).join("") + (!this.opts.layers.some(key => this.groupShown(key)) ? '<div class="muted small">Tick a layer in step 3 first.</div>' : "") + (s.buf.length === 2 ? '<div class="muted small">Two buffers at a time. Untick one to buffer another layer.</div>' : "") + (s.buf.some(key => !(C.bufferMilesFor(s, key) > 0)) ? '<div class="muted small">Type a distance in step 5.</div>' : "");
      w.querySelectorAll("[data-buf]").forEach(c => c.onchange = () => this.set("buf", C.toggleBuffer(s.buf, c.dataset.buf)));
      return w;
    }

    /* ---------------- step 4: buffer ---------------- */
    gBuffer() {
      const s = this.s, w = el("div", { class: "ctl" });
      if (this.team) return this.gTeamBuffer(w);
      w.innerHTML = `<label>Buffer distance, miles<input type="number" min="0.01" max="5" step="0.01" data-k="mi" value="${s.miles > 0 ? s.miles : ""}" placeholder="Type a distance, e.g. 0.25"></label><button type="button" class="btn ghost" data-k="bufoff" ${s.miles === 0 ? "disabled" : ""}>Turn off the buffer</button>
        <label>Layer name (shows in the legend)<input type="text" data-k="bn" value="${esc(this.bufName())}"></label>
        <div class="lbl">Buffer color</div><div class="bcols">${BUF_COLORS.map(([c, n]) => `<button type="button" data-bc="${c}" aria-pressed="${c === s.bufColor}"><i style="border-color:${c}"></i>${n}</button>`).join("")}</div>
        ${s.condType === "chcs" ? `<div class="bnote"><b>How the buffer is measured</b><div class="bwrap"><svg viewBox="0 0 120 80" width="120" height="80" aria-hidden="true"><rect width="120" height="80" fill="#eef0ef"/><circle cx="60" cy="40" r="30" fill="none" stroke="#ea580c" stroke-width="2"/><line x1="60" y1="40" x2="90" y2="40" stroke="#1d2522" stroke-dasharray="3 2"/><text x="64" y="35" font-size="10">distance</text><rect x="56" y="36" width="8" height="8" fill="#c2185b" stroke="#fff"/></svg><span>Each health center is a point, so its buffer is a circle around that point. The distance you type is the circle's radius.</span></div></div>` : `<div class="bnote"><b>How the buffer is measured</b><br>The buffer is drawn from the <b>edge</b> of each park or road (its outer boundary), not from its center. Every point on the outline is the same distance from the nearest edge. People reach a park at its edge, at a gate or the sidewalk along its side, not at its middle. A road's traffic pollution also spreads out from the road itself. So a large park gets a large outline and a small park gets a small one. If the buffer were drawn from the center instead, a big park would look farther away than it is, and part of the park could sit outside its own buffer.</div>`}
        <div class="muted small">One buffer at a time. For the High Pass, change the distance to your card's second distance and save a second map image.</div>`;
      w.querySelector("[data-k=mi]").onchange = e => this.set("miles", +e.target.value > 0 ? Math.min(5, Math.max(0.01, +e.target.value)) : 0);
      w.querySelector("[data-k=bufoff]").onclick = () => this.set("miles", 0);
      w.querySelector("[data-k=bn]").oninput = e => { s.bufName = e.target.value; this.renderLegend(); };
      w.querySelectorAll("[data-bc]").forEach(b => b.onclick = () => this.set("bufColor", b.dataset.bc));
      return w;
    }

    gTeamBuffer(w) {
      const s = this.s;
      // Her pick 2026-11-25 (D1): one box per buffer, beside its color. With no buffer chosen yet, one shared box.
      const colors = C.bufferPairColors(s.buf, s.ramp), any = colors.some(({ key }) => C.bufferMilesFor(s, key) > 0) || s.miles > 0;
      const boxes = colors.length ? colors.map(({ key, color }) => { const v = C.bufferMilesFor(s, key);
        return `<label class="mibox"><span><i class="sw ln" style="border-color:${color};background:${tint(color)}"></i>${BUF_BOX_LABELS[key]} buffer, miles</span><input type="number" min="0.01" max="5" step="0.01" data-mi="${key}" value="${v > 0 ? v : ""}" placeholder="Type a distance, e.g. 0.25"></label>`; }).join("")
        : `<label>Buffer distance, miles<input type="number" min="0.01" max="5" step="0.01" data-mi="" value="${s.miles > 0 ? s.miles : ""}" placeholder="Type a distance, e.g. 0.25"></label>`;
      w.innerHTML = `${boxes}<button type="button" class="btn ghost" data-k="bufoff" ${any ? "" : "disabled"}>${colors.length === 2 ? "Turn off the buffers" : "Turn off the buffer"}</button>` +
        (s.buf.some(key => key === "parks" || key === "routes") ? `<div class="bnote"><b>How the buffer is measured</b><br>The buffer is drawn from the <b>edge</b> of each park or road (its outer boundary), not from its center. Every point on the outline is the same distance from the nearest edge. People reach a park at its edge, at a gate or the sidewalk along its side, not at its middle. A road's traffic pollution also spreads out from the road itself. So a large park gets a large outline and a small park gets a small one. If the buffer were drawn from the center instead, a big park would look farther away than it is, and part of the park could sit outside its own buffer.</div>` : "") +
        (s.buf.includes("chcs") ? `<div class="bnote"><b>How the buffer is measured</b><div class="bwrap"><svg viewBox="0 0 120 80" width="120" height="80" aria-hidden="true"><rect width="120" height="80" fill="#eef0ef"/><circle cx="60" cy="40" r="30" fill="none" stroke="#ea580c" stroke-width="2"/><line x1="60" y1="40" x2="90" y2="40" stroke="#1d2522" stroke-dasharray="3 2"/><text x="64" y="35" font-size="10">distance</text><rect x="56" y="36" width="8" height="8" fill="#c2185b" stroke="#fff"/></svg><span>Each health center is a point, so its buffer is a circle around that point. The distance you type is the circle's radius.</span></div></div>` : "") +
        (s.buf.includes("stores") ? `<div class="bnote"><b>How the buffer is measured</b><br>Each store is a point, so its buffer is a circle around that point. The distance you type is the circle's radius.</div>` : "") +
        (s.buf.length === 2 ? `<div class="muted small">Each buffer has its own distance.</div>` : "");
      const clean = v => +v > 0 ? Math.min(5, Math.max(0.01, +v)) : 0;
      w.querySelectorAll("[data-mi]").forEach(input => input.onchange = e => {
        const key = input.dataset.mi, v = clean(e.target.value);
        if (!key) return this.set("miles", v);
        this.setMany({ bufMiles: { ...(s.bufMiles || {}), [key]: v } });
      });
      w.querySelector("[data-k=bufoff]").onclick = () => this.setMany({ miles: 0, bufMiles: {} });
      return w;
    }

    /* ---------------- step 5: save ---------------- */
    gSave() {
      const s = this.s, w = el("div", { class: "ctl" });
      w.innerHTML = `<label>Map title (what, where, when)<input type="text" data-k="ti" value="${esc(s.title)}" placeholder="${esc(this.defaultTitle())}"></label>
        <div class="row"><button class="btn" type="button" data-k="save">Save map image</button><button class="btn ghost" type="button" data-k="link">Copy link</button></div><div class="linkout" aria-live="polite"></div>`;
      w.querySelector("[data-k=ti]").oninput = e => { s.title = e.target.value; };
      w.querySelector("[data-k=save]").onclick = () => this.team ? this.previewImage() : this.saveImage();
      w.querySelector("[data-k=link]").onclick = () => this.copyLink(w.querySelector(".linkout"));
      return w;
    }

    link() { return `${location.origin}${location.pathname}#${C.encodeState(this.s)}`; }
    async copyLink(out) {
      const url = this.link();
      history.replaceState(null, "", "#" + C.encodeState(this.s));
      try { await navigator.clipboard.writeText(url); out.innerHTML = `<b>The link is on your clipboard.</b> Paste it where your assignment asks for the map link. It reopens this exact map.`; }
      catch (e) { out.innerHTML = `Copy this link:<textarea readonly rows="3">${esc(url)}</textarea>`; out.querySelector("textarea").select(); }
    }

    /* ---------------- names ---------------- */
    condLabel() {
      const s = this.s;
      if (s.condType === "none" && !this.team) return "";
      if (s.condType === "chcs") return "Community health centers";
      if (s.condType === "routes" || this.team) return s.routeMode === "name" ? (s.routeNames.join(" and ") || "Major routes") : `Route ${s.rtNumber} (ADMIN_TYPE ${s.adminType})`;
      return `Open space${s.access === "any" ? "" : ", PUB_ACCESS " + s.access}${s.minAcres ? `, ${s.minAcres}+ acres` : ""}`;
    }
    condName() { return this.s.condName || this.condLabel(); }
    bufName() { return this.s.bufName || `${this.s.miles}-mile buffer`; }
    defaultTitle() { const m = this.s.measure; return `${TERM[m] ? TERM[m].label : measureLabel(m).replace(/, %$/, "")} by census tract${this.s.towns.length ? ", " + this.s.towns.join(" and ") : ", Massachusetts"}, ${TERM[m] ? TERM[m].year : 2023}`; }

    /* ---------------- drawing ---------------- */
    async update(refit) {
      const s = this.s, token = (this.token = (this.token || 0) + 1);
      this.sel = s.towns.length ? this.data.tracts.filter(f => s.towns.includes(f.properties.City_Town)) : this.data.tracts;
      this.br = C.breaks(this.sel.map(f => f.properties[valueKey(s.measure)]), s.method, s.classes);
      this.pal = C.rampColors(s.ramp, Math.max(1, this.br.length - 1));
      if (this.team) return this.updateTeam(refit, token);
      this.cond = []; this.bufs = []; this.parkList = []; this.offParks = []; this.centerList = []; this.offCenters = [];
      if (s.condType === "routes") {
        const routes = s.routeMode === "name" ? C.filterRoutes(this.data.routes, { mode: "name", names: s.routeNames }) : C.filterRoutes(this.data.routes, { mode: "num", adminType: s.adminType, rtNumber: s.rtNumber });
        this.condCount = routes.length;
        if (s.towns.length) this.cond = C.clipToBbox(routes, C.paddedBbox(this.sel));
      } else if (s.condType === "chcs") {
        if (s.towns.length) {
          const all = await this.data.healthCenters();
          if (token !== this.token) return; // a newer update started while the centers were loading
          const off = s.chcsOff || [];
          this.centerList = C.pointsInBbox(all, C.paddedBbox(this.sel));
          this.offCenters = this.centerList.filter(f => off.includes(f.properties.id));
          this.cond = this.centerList.filter(f => !off.includes(f.properties.id));
        }
        this.condCount = this.cond.length;
      } else if (s.condType === "parks" && s.towns.length) {
        const box = C.paddedBbox(this.sel);
        const near = (await this.data.openSpaceFor(box)).filter(f => { const b = f.bbox || (f.bbox = turf.bbox(f)); return !(b[0] > box[2] || b[2] < box[0] || b[1] > box[3] || b[3] < box[1]); });
        if (token !== this.token) return; // a newer update started while parks were loading
        this.parkList = C.filterOpenSpace(near, { access: s.access, minAcres: s.minAcres, onlyTowns: s.onlyTowns ? s.towns : null, off: [] });
        this.offParks = this.parkList.filter(f => s.off.includes(f.properties.id));
        this.cond = this.parkList.filter(f => !s.off.includes(f.properties.id));
        this.condCount = this.cond.length;
      }
      if (s.towns.length && s.miles > 0 && this.cond.length) this.bufs = C.bufferEach(this.cond, s.miles);
      this.touch = C.touchedTracts(this.sel, this.bufs);
      this.draw(refit);
      this.renderInset();
      this.renderPanel(); this.renderLegend(); this.renderTable(); this.renderFocus();
    }

    async updateTeam(refit, token) {
      const s = this.s, shown = key => key === "stores" ? C.STORE_TYPES.some(k => s.show.includes(k)) : s.show.includes(key);
      this.cond = []; this.bufs = []; this.parkList = []; this.offParks = []; this.parks = [];
      this.centerList = []; this.offCenters = []; this.centers = []; this.routes = []; this.places = [];
      this.townLines = []; this.pair = []; this.overlap = null; this.touchBy = {}; this.touchBoth = new Set();
      this.clipError = false; this.condCount = 0; this.shares = null; this.sharesError = false; this.landDocs = [];
      if (shown("stores") && !this.storeDoc) {
        const doc = await this.data.storePlaces();
        if (token !== this.token) return;
        this.storeDoc = doc;
      }
      if (s.towns.length) {
        const box = C.paddedBbox(this.sel);
        if (shown("routes")) {
          const routes = s.routeMode === "name" ? C.filterRoutes(this.data.routes, { mode: "name", names: s.routeNames }) : C.filterRoutes(this.data.routes, { mode: "num", adminType: s.adminType, rtNumber: s.rtNumber });
          this.condCount = routes.length;
          this.routes = C.clipToBbox(routes, box);
        }
        if (shown("parks")) {
          const all = await this.data.openSpaceFor(box);
          if (token !== this.token) return;
          const near = all.filter(f => { const b = f.bbox || (f.bbox = turf.bbox(f)); return !(b[0] > box[2] || b[2] < box[0] || b[1] > box[3] || b[3] < box[1]); });
          this.parkList = C.filterOpenSpace(near, { access: s.access, minAcres: s.minAcres, onlyTowns: null, off: [] });
          if (s.clip) {
            try {
              const docs = await this.data.landFor(s.towns);
              if (token !== this.token) return;
              this.landDocs = docs;
              this.parkList = C.clipToTowns(this.parkList, docs.map(d => d.parks));
              this.townLines = docs.map(d => d.line);
            } catch (e) {
              if (token !== this.token) return;
              this.clipError = true;
            }
          }
          this.offParks = this.parkList.filter(f => s.off.includes(f.properties.id));
          this.parks = this.parkList.filter(f => !s.off.includes(f.properties.id));
        }
        if (shown("chcs")) {
          const all = await this.data.healthCenters();
          if (token !== this.token) return;
          const off = s.chcsOff || [];
          this.centerList = C.pointsInBbox(all, box);
          this.offCenters = this.centerList.filter(f => off.includes(f.properties.id));
          this.centers = this.centerList.filter(f => !off.includes(f.properties.id));
        }
        if (shown("stores")) {
          this.places = C.storePlacesFor(this.storeDoc.features, s.show.filter(k => C.STORE_TYPES.includes(k)), this.sel);
        }
        {
          const features = { parks: this.parks, routes: this.routes, chcs: this.centers, stores: this.places };
          const labels = { parks: "parks", routes: "roads", chcs: "health centers", stores: "stores" };
          // Each buffer at its own distance (her pick 2026-11-25, D1); a buffer with no distance yet is left out.
          this.pair = C.bufferPairColors(s.buf, s.ramp).map(({ key, color }) => {
            const miles = C.bufferMilesFor(s, key);
            return { key, color, miles, union: C.mergedBuffer(features[key], miles), label: labels[key] };
          }).filter(b => b.miles > 0);
          this.overlap = this.pair.length === 2 ? C.overlapOf(this.pair[0].union, this.pair[1].union) : null;
          this.pair.forEach(p => { this.touchBy[p.key] = C.touchedTracts(this.sel, p.union ? [p.union] : []); });
          this.touchBoth = C.touchedTracts(this.sel, this.overlap ? [this.overlap] : []);
          this.bufs = this.pair.map(p => p.union).filter(Boolean);
        }
      }
      if (this.opts.green && s.towns.length) {
        const cacheKey = JSON.stringify([s.towns.slice().sort(), s.minAcres, s.off.slice().sort()]);
        this.green = this.greenCacheKey === cacheKey ? this.greenCache : null;
        if (this.green) this.landDocs = this.greenLandDocs;
        if (!this.green) setTimeout(async () => {
          try {
            const [docs, near] = await Promise.all([this.data.landFor(s.towns), this.data.openSpaceFor(C.paddedBbox(this.sel))]);
            if (token !== this.token) return;
            const parks = C.filterOpenSpace(near, { access: "Y", minAcres: s.minAcres, onlyTowns: null, off: s.off });
            const result = Object.fromEntries(docs.map(doc => [doc.town, C.cityGreen(doc.tracts, parks)]));
            if (token !== this.token) return;
            this.greenCacheKey = cacheKey; this.greenCache = result; this.greenLandDocs = docs; this.green = result;
            this.landDocs = docs; this.renderTable();
          } catch (e) { if (token === this.token) { this.greenError = true; this.renderTable(); } }
        }, 0);
      } else this.green = null;
      this.touch = new Set();
      this.draw(refit); this.renderInset();
      this.renderPanel(); this.renderLegend(); this.renderTable(); this.renderFocus();
      if (this.pair.length) setTimeout(async () => {
        try {
          const [docs, counts] = await Promise.all([this.data.landFor(s.towns), this.data.counts()]);
          if (token !== this.token) return;
          this.countsDoc = counts;
          const selected = new Set(this.sel.map(f => f.properties.TractFIPS));
          const landTracts = Object.fromEntries(docs.flatMap(d => Object.entries(d.tracts).filter(([fips]) => selected.has(fips))));
          const unions = Object.fromEntries(this.pair.map(b => [b.key, b.union]));
          if (this.pair.length === 2) unions.both = this.overlap;
          this.landDocs = docs;
          this.shares = C.tractShares(landTracts, unions);
        } catch (e) {
          if (token !== this.token) return;
          this.sharesError = true;
        }
        if (token === this.token) this.renderTable();
      }, 0);
    }

    draw(refit) {
      const s = this.s;
      Object.values(this.lyr).forEach(l => l.clearLayers());
      if (s.towns.length) L.geoJSON({ type: "FeatureCollection", features: this.data.tracts.filter(f => !s.towns.includes(f.properties.City_Town)) },
        { style: { fillColor: "#b9c0bd", fillOpacity: 0.55, color: "#fff", weight: 0.5 }, interactive: false }).addTo(this.lyr.grey);
      const tl = L.geoJSON({ type: "FeatureCollection", features: this.sel }, {
        style: f => { const k = C.classOf(f.properties[valueKey(s.measure)], this.br, s.method); return { fillColor: k < 0 ? "#e5e5e5" : this.pal[k], fillOpacity: 0.88, color: "#fff", weight: s.towns.length ? 0.9 : 0.25 }; },
        onEachFeature: (f, l) => {
          l.bindPopup(() => this.tractPopup(f), { maxWidth: 290 });
          // Team pages: a click on a tract also highlights its row in the tract table (her ask 2026-11-20).
          if (this.opts.pickRows) l.on("click", () => this.pickTract(f.properties.TractFIPS, "map"));
        }
      }).addTo(this.lyr.tracts);
      const parkTip = f => `<b>${esc(f.properties.SITE_NAME || "Unnamed open space")}</b>, ${esc(f.properties.Town)} · ${fmt(f.properties.GIS_ACRES)} acres<br><span class="muted">Click for options</span>`;
      const parkPop = (f, on) => `<div class="pp"><div class="pph">${esc(f.properties.SITE_NAME || "Unnamed open space")}</div><div class="muted small">${esc(f.properties.Town)} · ${fmt(f.properties.GIS_ACRES)} acres · PUB_ACCESS ${esc(f.properties.PUB_ACCESS)}</div>
        <div class="row" style="margin-top:6px"><button class="btn" type="button" data-zoom="${f.properties.id}">Zoom in on this park</button><button class="btn ghost" type="button" data-tog="${f.properties.id}">${this.team ? (on ? "Switch it off" : "Switch it on") : (on ? "Switch off its buffer" : "Buffer it again")}</button></div>${this.team && s.clip && f.properties.acresInside != null ? `<div class="small"><b>${Number(f.properties.acresInside).toFixed(2)}</b> acres inside your towns</div>` : ""}</div>`;
      if (this.team) this.drawTeamLayers(parkTip, parkPop);
      else {
      L.geoJSON({ type: "FeatureCollection", features: this.offParks }, { pane: "overlay", renderer: this.overlayRenderer, style: { color: "#8a948f", weight: 0.8, dashArray: "2 3", fillColor: "#d5dad7", fillOpacity: 0.85 },
        onEachFeature: (f, l) => { l.bindTooltip(parkTip(f), { sticky: true }); l.bindPopup(() => parkPop(f, false), { maxWidth: 300 }); } }).addTo(this.lyr.cond);
      const chcPop = (f, on) => { const p = f.properties; return `<div class="pp"><div class="pph">${esc(p.NAME)}</div><div class="muted small">${esc(p.ADDRESS)}, ${esc(townName(p.GEOG_MUNI))} · ${esc(p.SERVICES)}</div>
        <div class="row" style="margin-top:6px"><button class="btn ghost" type="button" data-ctog="${p.id}">${on ? "Switch off its buffer" : "Buffer it again"}</button></div></div>`; };
      const chcIcon = on => L.divIcon({ className: on ? "chc" : "chc off", iconSize: [11, 11] });
      if (s.condType === "chcs") [[this.offCenters, false], [this.cond, true]].forEach(([fs, on]) => fs.forEach(f => {
        const [x, y] = f.geometry.coordinates;
        L.marker([y, x], { pane: "overlay", icon: chcIcon(on), keyboard: false, title: f.properties.NAME }).bindPopup(() => chcPop(f, on), { maxWidth: 300 }).addTo(this.lyr.cond);
      }));
      if (s.condType !== "chcs") L.geoJSON({ type: "FeatureCollection", features: this.cond }, {
        pane: "overlay", renderer: this.overlayRenderer,
        style: f => f.geometry.type.includes("Line") ? { color: "#2b2b2b", weight: 3 } : { color: "#2f7d32", weight: 0.6, fillColor: "#7cb87f", fillOpacity: 0.7 },
        interactive: s.condType === "parks",
        onEachFeature: (f, l) => { if (s.condType === "parks") { l.bindTooltip(parkTip(f), { sticky: true }); l.bindPopup(() => parkPop(f, true), { maxWidth: 300 }); } }
      }).addTo(this.lyr.cond);
      if (this.bufs.length) L.geoJSON({ type: "FeatureCollection", features: this.bufs }, { pane: "overlay", renderer: this.overlayRenderer, style: { color: s.bufColor, weight: 1.6, fill: false }, interactive: false }).addTo(this.lyr.buf);
      }
      if (refit && this.sel.length) this.map.fitBounds(tl.getBounds(), { padding: [14, 14] });
      if (this.pick && !this.sel.some(f => f.properties.TractFIPS === this.pick)) this.pick = null; // its town was filtered out
      this.drawPick(false, this.pickLabel !== false);
      // Zoom in on one park: it and every park touching it get their own colour and ring.
      this.focusGroup = []; this.focusRings = null;
      const fp = s.focus != null && (this.team ? s.show.includes("parks") : s.condType === "parks") ? this.parkList.find(f => f.properties.id === s.focus) : null;
      if (fp) {
        this.focusGroup = C.touchingGroup(fp, this.parkList, FOCUS_COLS.length);
        this.focusRings = C.bufferEach(this.focusGroup, this.team ? C.bufferMilesFor(s, "parks") || s.miles : s.miles);
        this.lyr.buf.eachLayer(l => l.setStyle && l.setStyle({ opacity: 0.2 }));
        this.focusGroup.forEach((f, i) => {
          L.geoJSON(f, { pane: "overlay", renderer: this.overlayRenderer, style: { color: FOCUS_COLS[i], weight: 3, fillColor: FOCUS_COLS[i], fillOpacity: 0.35 }, interactive: false }).addTo(this.lyr.focus);
          L.geoJSON(this.focusRings[i], { pane: "overlay", renderer: this.overlayRenderer, style: { color: FOCUS_COLS[i], weight: 3, dashArray: FOCUS_DASH[i % 3], fill: false }, interactive: false }).addTo(this.lyr.focus);
        });
        if (this.focusFit !== s.focus) { this.map.fitBounds(L.geoJSON(turf.featureCollection(this.focusRings)).getBounds(), { padding: [24, 24] }); this.focusFit = s.focus; }
      } else this.focusFit = null;
      this.applyView();
    }

    drawTeamLayers(parkTip, parkPop) {
      const geo = features => ({ type: "FeatureCollection", features });
      const opts = { pane: "overlay", renderer: this.overlayRenderer };
      const parks = (features, on) => L.geoJSON(geo(features), { ...opts,
        style: on ? { color: "#2f7d32", weight: 0.6, fillColor: "#7cb87f", fillOpacity: 0.7 } : { color: "#8a948f", weight: 0.8, dashArray: "2 3", fillColor: "#d5dad7", fillOpacity: 0.85 },
        onEachFeature: (f, l) => { l.bindTooltip(parkTip(f), { sticky: true }); l.bindPopup(() => parkPop(f, on), { maxWidth: 300 }); }
      }).addTo(this.lyr.cond);
      parks(this.offParks, false); parks(this.parks, true);
      L.geoJSON(geo(this.routes), { ...opts, style: { color: "#2b2b2b", weight: 3 }, interactive: false }).addTo(this.lyr.cond);
      [[this.offCenters, false], [this.centers, true]].forEach(([features, on]) => features.forEach(f => {
        const p = f.properties, [x, y] = f.geometry.coordinates;
        const popup = `<div class="pp"><div class="pph">${esc(p.NAME)}</div><div class="muted small">${esc(p.ADDRESS)}, ${esc(townName(p.GEOG_MUNI))} · ${esc(p.SERVICES)}</div><div class="row" style="margin-top:6px"><button class="btn ghost" type="button" data-ctog="${p.id}">${on ? "Switch it off" : "Switch it on"}</button></div></div>`;
        L.marker([y, x], { pane: "overlay", icon: L.divIcon({ className: on ? "chc" : "chc off", iconSize: [11, 11] }), keyboard: false, title: p.NAME }).bindPopup(popup, { maxWidth: 300 }).addTo(this.lyr.cond);
      }));
      this.places.forEach(f => {
        const p = f.properties, [x, y] = f.geometry.coordinates, name = p.names[p.types[0]];
        const colors = C.placeTypes(f, this.s.show).map(type => STORE_COLORS[type]);
        const html = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7.6" fill="#fff"/>' + C.slicePaths(8, 8, 6, colors) + '<circle cx="8" cy="8" r="6" fill="none" stroke="#1d2522" stroke-width="1"/></svg>';
        const nearest = this.s.show.includes("parks") ? C.nearestEdge(f, this.parks) : null;
        const lists = p.types.map(type => `<li><i class="sw dot" style="background:${STORE_COLORS[type]}"></i>${esc((this.opts.stores.find(o => o.key === type) || {}).label)}${p.names[type] !== name ? ` (listed as ${esc(p.names[type])})` : ""}</li>`).join("");
        const park = nearest ? `<div class="small">Nearest open space on the map: <b>${esc(nearest.feature.properties.SITE_NAME || "Unnamed open space")}</b>, ${nearest.miles.toFixed(2)} mi to its edge</div>` : "";
        const buffers = this.pair.filter(b => b.key !== "stores").map(b => `<div class="small">${b.union && turf.booleanPointInPolygon(f, b.union) ? "Inside" : "Outside"} the ${b.miles}-mile ${esc(b.label)} buffer</div>`).join("");
        L.marker([y, x], { pane: "overlay", keyboard: false, title: name, icon: L.divIcon({ className: "xstore", iconSize: [16, 16], html }) })
          .bindPopup(`<div class="pp"><div class="pph">${esc(name)}</div><div class="muted small">${esc(p.addr)}, ${esc(p.town)}</div><div class="small"><b>On these lists:</b></div><ul class="lic">${lists}</ul>${park}${buffers}</div>`, { maxWidth: 290 }).addTo(this.lyr.cond);
      });
      this.townLines.forEach(line => L.geoJSON(line, { ...opts, style: { color: "#1d2522", weight: 1.2, dashArray: "4 3", fill: false }, interactive: false }).addTo(this.lyr.cond));
      const options = { renderer: this.bufRenderer, pane: "buffers", interactive: false };
      this.pair.filter(p => p.union).forEach(p => L.geoJSON(p.union, { ...options, style: { stroke: false, fillColor: p.color, fillOpacity: BUF_TINT } }).addTo(this.lyr.pair));
      if (this.overlap) {
        L.geoJSON(this.overlap, { ...options, style: { stroke: false, fillColor: `url(#${this.overlapId})`, fillOpacity: 1 } }).addTo(this.lyr.pair);
        // The buffer layer's SVG exists only once the map is ready; a page opened from a link draws before that.
        this.map.whenReady(() => {
          const svg = this.bufRenderer._container;
          if (svg.querySelector(`#${this.overlapId}`)) return;
          const ns = "http://www.w3.org/2000/svg", defs = document.createElementNS(ns, "defs"), pattern = document.createElementNS(ns, "pattern");
          pattern.setAttribute("id", this.overlapId); pattern.setAttribute("patternUnits", "userSpaceOnUse"); pattern.setAttribute("width", "7"); pattern.setAttribute("height", "7"); pattern.setAttribute("patternTransform", "rotate(45)");
          [["7", "#ffffff", ".45"], ["2", "#4a148c", "1"]].forEach(([width, fill, opacity]) => { const rect = document.createElementNS(ns, "rect"); rect.setAttribute("width", width); rect.setAttribute("height", "7"); rect.setAttribute("fill", fill); rect.setAttribute("fill-opacity", opacity); pattern.append(rect); });
          defs.append(pattern); svg.prepend(defs);
        });
      }
      this.pair.filter(p => p.union).forEach(p => L.geoJSON(p.union, { ...options, style: { color: "#ffffff", weight: 5, fill: false, lineJoin: "round" } }).addTo(this.lyr.pair));
      this.pair.filter(p => p.union).forEach(p => L.geoJSON(p.union, { ...options, style: { color: p.color, weight: 2.4, fill: false } }).addTo(this.lyr.pair));
    }

    applyView() { ["overlay", "buffers"].forEach(pane => { this.map.getPane(pane).style.opacity = this.peek ? 0 : this.viewAlpha; }); }

    renderInset() {
      const s = this.s;
      const project = C.fitProjection(turf.bbox(turf.featureCollection(this.sel)), 214, 170).project;
      const paths = this.sel.map(f => { const c = C.classOf(f.properties[valueKey(s.measure)], this.br, s.method);
        return `<path d="${C.pathFor(f.geometry, project)}" fill="${c < 0 ? "#e5e5e5" : this.pal[c]}" stroke="#fff" stroke-width="0.6" fill-rule="evenodd"/>`; }).join("");
      this.insetEl.innerHTML = `<svg viewBox="0 0 214 170" width="100%" role="img" aria-label="${esc(s.legend)} by census tract, without other layers">${paths}</svg>`;
    }

    /** Highlight one tract on the map (a click on its row in the tract table), or clear it with null. */
    pickTract(fips, from) {
      this.pick = fips || null;
      let row = null;
      this.tableEl.querySelectorAll("tr[data-fips]").forEach(tr => { const on = tr.dataset.fips === this.pick; tr.classList.toggle("on", on); if (on) row = tr; });
      if (from === "map") {
        // Scroll only the table's own box to the row, so the page (and the popup) stay where they are.
        const sc = row && row.closest(".tscroll");
        if (sc && sc.offsetParent) sc.scrollTop += row.getBoundingClientRect().top - sc.getBoundingClientRect().top - sc.clientHeight / 2;
        this.drawPick(false, false);
      } else this.drawPick(true, true);
    }

    drawPick(show, label = true) {
      this.lyr.pick.clearLayers();
      const f = this.pick && this.sel.find(x => x.properties.TractFIPS === this.pick);
      if (!f) return;
      L.geoJSON(f, { style: { color: "#fff", weight: 8, fill: false }, interactive: false }).addTo(this.lyr.pick);
      const g = L.geoJSON(f, { style: { color: "#111", weight: 4, fill: false }, interactive: false }).addTo(this.lyr.pick);
      if (label) g.bindTooltip(`${esc(f.properties.NAMELSAD)}, ${esc(f.properties.City_Town)}`, { permanent: true, direction: "top", className: "picktip" }).openTooltip();
      this.pickLabel = label;
      if (!show) return;
      const b = g.getBounds();
      if (!this.map.getBounds().contains(b)) this.map.panTo(b.getCenter());
      const r = this.mapEl.getBoundingClientRect();
      if (r.bottom < 60 || r.top > innerHeight - 60) this.mapEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    tractPopup(f) {
      const p = f.properties, s = this.s, ci = ciKey(s.measure) && p[ciKey(s.measure)];
      const inBuf = this.team ? this.pair.map(b => `<div>${esc(b.label[0].toUpperCase() + b.label.slice(1))} buffer: <b>${this.touchBy[b.key].has(p.TractFIPS) ? `touches${this.shares && this.shares[p.TractFIPS] ? `, ${esc(C.sharePercent(this.shares[p.TractFIPS][b.key]))} of its land` : ""}` : "does not touch"}</b></div>`).join("") : this.bufs.length ? `<div>${esc(this.bufName())}: <b>${this.touch.has(p.TractFIPS) ? "touches" : "does not touch"}</b></div>` : "";
      return `<div class="pp"><div class="pph">${esc(p.NAMELSAD)}, ${esc(p.City_Town)}</div><div class="muted small">TractFIPS ${esc(p.TractFIPS)}</div>
        <div class="ppv">${fmtFor(s.measure)(p[valueKey(s.measure)])}<span>${unitOf(s.measure) === "year" ? "" : unitOf(s.measure) === "%" ? "%" : " " + esc(unitOf(s.measure))}</span></div><div class="small">${esc(measureLabel(s.measure))}</div>
        ${ci ? `<div class="small">95% confidence interval: <b>${esc(ci)}</b></div>` : rangeField(s.measure) ? termRangeLine(s.measure, p) : ""}${inBuf}</div>`;
    }

    renderLegend() {
      const s = this.s, br = this.br;
      if (this.team) {
        const rows = [];
        if (s.show.includes("parks")) rows.push(`<div><i class="sw pk"></i>Parks and open space${s.clip && this.townLines.length ? `, clipped to ${esc(s.towns.join(" and "))}` : ""}</div>`);
        if (s.clip && this.townLines.length) rows.push('<div><i class="sw tl"></i>Town line</div>');
        if (s.show.includes("routes")) rows.push(`<div><i class="sw rd"></i>${esc(this.condLabel())}</div>`);
        if (s.show.includes("chcs")) rows.push('<div><i class="sw hc"></i>Community health centers</div>');
        (this.opts.stores || []).filter(store => s.show.includes(store.key)).forEach(store => rows.push(`<div><i class="sw dot" style="background:${STORE_COLORS[store.key]}"></i>${esc(store.label)}</div>`));
        if ((this.opts.stores || []).filter(store => s.show.includes(store.key)).length >= 2) rows.push('<div><svg class="sw split" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 0 A6 6 0 0 0 6 12 Z" fill="#c62828"/><path d="M6 0 A6 6 0 0 1 6 12 Z" fill="#f9a825"/></svg>A store on two or more of these lists</div>');
        this.pair.forEach(b => rows.push(`<div><i class="sw ln" style="border-color:${b.color};background:${tint(b.color)}"></i>${b.miles}-mile buffer, ${esc(b.label)}</div>`));
        if (this.pair.length === 2) rows.push('<div><i class="sw both"></i>Inside both buffers</div>');
        this.legendEl.innerHTML = `<div class="lt">${esc(s.legend)}</div>` + br.slice(1).map((v, i) => `<div><i class="sw" style="background:${this.pal[i]}"></i>${fmtFor(s.measure)(br[i])} – ${fmtFor(s.measure)(v)}</div>`).join("") + rows.join("") + `<div class="lsrc">${C.METHODS[s.method]}, ${Math.max(0, br.length - 1)} classes</div>`;
        return;
      }
      this.legendEl.innerHTML = `<div class="lt">${esc(s.legend)}</div>` +
        br.slice(1).map((v, i) => `<div><i class="sw" style="background:${this.pal[i]}"></i>${fmtFor(s.measure)(br[i])} – ${fmtFor(s.measure)(v)}</div>`).join("") +
        (this.bufs.length ? `<div><i class="sw ln" style="border-color:${s.bufColor}"></i>${esc(this.bufName())}</div>` : "") +
        (this.cond.length ? `<div><i class="sw ${s.condType === "routes" ? "rd" : s.condType === "chcs" ? "hc" : "pk"}"></i>${esc(this.condName())}</div>` : "") +
        `<div class="lsrc">${C.METHODS[s.method]}, ${Math.max(0, br.length - 1)} classes</div>`;
    }

    /** What the buffers hold in each town, for the card above the map: [{ town, green, rows }]. A row is
        { label, color, tiles } per buffer (plus "Inside both buffers"); "counting" while the land shares load. */
    cityFacts() {
      const s = this.s, T = root.TermTeams, two = this.pair.length === 2;
      return s.towns.map(town => {
        const item = this.opts.green ? (this.green?.[town] || "counting") : null;
        if (!this.pair.length) return { town, green: item, rows: [] };
        if (!this.shares) return { town, green: item, rows: "counting" };
        const tracts = this.sel.filter(f => f.properties.City_Town === town);
        const buffers = [...this.pair, ...(two ? [{ key: "both", label: "both", color: null }] : [])];
        const rows = buffers.map(buffer => {
          const estimate = count => C.estimateInside(tracts.map(f => ({ share: this.shares[f.properties.TractFIPS]?.[buffer.key] ?? 0, count: count(f.properties) })));
          const residents = estimate(p => p.pop_total);
          const measured = estimate(p => T.countFor(s.measure, p, this.countsDoc?.values[p.TractFIPS] || {}));
          return { key: buffer.key, color: buffer.color, label: buffer.key === "both" ? "Inside both buffers" : `${buffer.miles}-mile ${buffer.label} buffer`,
            tiles: T.peopleTiles(town, buffer, buffer.miles, residents, measured, T.PEOPLE[s.measure], two) };
        });
        return { town, green: item, rows };
      });
    }

    /** The card above the map (her picks 2026-11-25, C1 and N1): number tiles under a heading, one row per buffer
        when there are two, and the estimate note behind its i button. */
    renderBand() {
      // Her ask 2026-11-25: nothing shows here until a neighborhood condition is ticked in step 3.
      const b = this.bandEl, facts = { buffers: this.pair, towns: this.team && this.s.show.length ? this.cityFacts() : [] };
      const shown = facts.towns.filter(f => f.green || f.rows === "counting" || f.rows.length);
      b.hidden = !shown.length;
      if (!shown.length) { b.innerHTML = ""; return; }
      const tile = (t, cls = "") => `<div class="btile ${cls}"${t.color ? ` style="--c:${t.color}"` : ""}><b>${esc(t.big)}</b><span>${esc(t.text)}</span></div>`;
      const counting = '<div class="btile wait"><span>Counting…</span></div>';
      const greenTile = f => f.green === "counting" ? counting : tile({ big: `${(f.green.share * 100).toFixed(1)}%`, text: `of ${f.town}'s land is public open space (${Math.round(f.green.acres).toLocaleString("en-US")} acres)` }, "green");
      const two = facts.buffers.length === 2, many = shown.length > 1;
      const body = shown.map(f => {
        const rows = f.rows === "counting" ? `<div class="btiles">${counting}${f.green ? greenTile(f) : ""}</div>` : !two ? (f.rows.length || f.green ? `<div class="btiles">${f.rows.flatMap(r => r.tiles.map(t => tile({ ...t, color: r.color }))).join("")}${f.green ? greenTile(f) : ""}</div>` : "")
          : f.rows.map(r => `<div class="brow"><div class="blab"><i class="sw ${r.key === "both" ? "both" : "ln"}"${r.color ? ` style="border-color:${r.color};background:${tint(r.color)}"` : ""}></i>${esc(r.label)}</div><div class="btiles">${r.tiles.map(t => tile({ ...t, color: r.color || "#4a148c" })).join("")}</div></div>`).join("") + (f.green ? `<div class="btiles">${greenTile(f)}</div>` : "");
        return (many ? `<div class="btown">${esc(f.town)}</div>` : "") + rows;
      }).join("");
      const heading = facts.buffers.length ? `Your ${facts.buffers.length > 1 ? "buffers" : "buffer"} in numbers` : "Public open space";
      const button = facts.buffers.length ? `<button type="button" class="ibtn" data-bandnote aria-label="How these numbers are estimated" aria-expanded="${!!this.bandNoteOpen}">i</button>` : "";
      b.style.setProperty("--edge", facts.buffers[0]?.color || "#2f7d32");
      b.innerHTML = `<div class="bhd">${heading}${button}</div>${body}` + (button && this.bandNoteOpen ? `<div class="colnote">Estimates: each census tract's count times the share of its land inside the buffer. They assume people and homes are spread evenly across each census tract.</div>` : "");
      const toggle = b.querySelector("[data-bandnote]");
      if (toggle) toggle.onclick = () => { this.bandNoteOpen = !this.bandNoteOpen; this.renderBand(); };
    }

    renderTable() {
      const s = this.s, t = this.tableEl;
      this.renderBand();
      if (!s.towns.length) { t.innerHTML = `<div class="muted small pad">Filter to your towns in step 1 to see the tract table.</div>`; return; }
      const rows = [...this.sel].sort((a, b) => a.properties.City_Town.localeCompare(b.properties.City_Town) || a.properties.TractFIPS.localeCompare(b.properties.TractFIPS));
      const term = rangeField(s.measure), moeCol = !!(term && term.moe);
      const termCells = p => { const r = C.acsRange(term, p, s.measure); return `<td>${esc(r ? r.ci || (r.none ? "No margin of error" : "–") : "–")}</td>${moeCol ? `<td>${esc((r && r.moe) || "–")}</td>` : ""}`; };
      const pick = !!this.opts.pickRows; // team pages: click a row to highlight its tract (her ask 2026-11-19)
      const ck = ciKey(s.measure), summary = this.team ? this.pair.flatMap(b => C.countByTown(this.sel, this.touchBy[b.key], s.towns).map(([tw, a, n]) => `${esc(tw)}: ${a} of ${n} touch the ${esc(b.label)} buffer`)).join(" · ") : this.bufs.length ? C.countByTown(this.sel, this.touch, s.towns).map(([tw, a, n]) => `${esc(tw)}: ${a} of ${n} touch the buffer`).join(" · ") : "Add a condition and a buffer to see which tracts touch it";
      const noteButton = key => `<button type="button" class="ibtn" data-note="${key}" aria-label="About this column" aria-expanded="${this.noteOpen === key}">i</button>`;
      const shownNotes = ["value", "ci", ...(moeCol ? ["moe"] : []), ...(this.opts.green ? ["green"] : []), ...(this.team ? [...this.pair.map(b => `buf-${b.key}`), ...(this.pair.length === 2 ? ["both"] : [])] : this.bufs.length ? ["buffer"] : [])];
      const note = shownNotes.includes(this.noteOpen) ? `<tr class="noterow"><td colspan="${4 + Number(moeCol) + Number(!!this.opts.green) + (this.team ? this.pair.length + Number(this.pair.length === 2) : Number(!!this.bufs.length))}"><div class="colnote">${COLUMN_NOTES[this.noteOpen]}</div></td></tr>` : "";
      // Option B (her pick, 2026-11-18): the summary is a visible button, with what the table holds spelled out.
      t.innerHTML = `<details class="ttab" ${this.tableOpen ? "open" : ""}><summary><span class="tbtn"><span class="tbtn-open">▸ Open the tract table</span><span class="tbtn-close">▾ Hide the tract table</span></span><span class="tsum">Every tract's value, its 95% confidence interval, and whether it is included in the buffer · ${rows.length} tracts${summary ? ` · ${summary}` : ""}${pick ? " · Click a row to see that tract on the map" : ""}${this.team && this.pair.length && !this.shares ? (this.sharesError ? " · The page could not load the land areas, so the table shows Yes or No only." : " · Counting the shares of land…") : ""}</span></summary>
        <div class="tscroll"><table><thead><tr><th scope="col">GEOID</th><th scope="col">Town</th><th scope="col">Value (${esc(unitOf(s.measure))})${noteButton("value")}</th><th scope="col">95% Confidence Intervals${noteButton("ci")}</th>${moeCol ? `<th scope="col">Margin of error (±)${noteButton("moe")}</th>` : ""}${this.opts.green ? `<th scope="col">Public green space (% of land)${noteButton("green")}</th>` : ""}${this.team ? this.pair.map(b => `<th scope="col">${({ parks: "Parks", routes: "Roads", chcs: "Health centers", stores: "Store" })[b.key]} buffer${noteButton(`buf-${b.key}`)}</th>`).join("") + (this.pair.length === 2 ? `<th scope="col">Inside both${noteButton("both")}</th>` : "") : this.bufs.length ? `<th scope="col">Included in the buffer?${noteButton("buffer")}</th>` : ""}</tr>${note}</thead><tbody>` +
        rows.map(f => { const p = f.properties; return `<tr${pick ? ` data-fips="${esc(p.TractFIPS)}" tabindex="0"${p.TractFIPS === this.pick ? ' class="on"' : ""}` : ""}><td>${esc(p.TractFIPS)}</td><td>${esc(p.City_Town)}</td><td>${fmtFor(s.measure)(p[valueKey(s.measure)])}</td>${term ? termCells(p) : `<td>${esc((ck && p[ck]) || "–")}</td>`}${this.opts.green ? `<td>${this.green?.[p.City_Town]?.byTract[p.TractFIPS] ? (this.green[p.City_Town].byTract[p.TractFIPS].share * 100).toFixed(1) + "%" : "Counting…"}</td>` : ""}${this.team ? this.pair.map(b => `<td>${esc(C.shareCell(this.touchBy[b.key].has(p.TractFIPS), this.shares?.[p.TractFIPS]?.[b.key]))}</td>`).join("") + (this.pair.length === 2 ? `<td>${esc(C.shareCell(this.touchBoth.has(p.TractFIPS), this.shares?.[p.TractFIPS]?.both))}</td>` : "") : this.bufs.length ? `<td>${this.touch.has(p.TractFIPS) ? "Yes" : "No"}</td>` : ""}</tr>`; }).join("") +
        `</tbody></table></div>${this.bufs.length ? `<p class="colnote small">Area, not people: a “Yes” means some part of the census tract touches a buffer, not that everyone in it lives inside the buffer.</p>` : ""}${this.team && this.pair.length ? `<p class="colnote small">Water: the percents count land area, not water. Rivers, creeks and harbor water inside a census tract's boundary do not count toward its area.</p>` : ""}</details>` + (this.team ? this.teamStoreTable() : "");
      t.querySelectorAll(".ibtn").forEach(button => { button.onclick = e => { e.preventDefault(); e.stopPropagation(); this.noteOpen = this.noteOpen === button.dataset.note ? null : button.dataset.note; this.tableOpen = true; this.renderTable(); }; });
      t.querySelector("details").addEventListener("toggle", e => { this.tableOpen = e.target.open; });
      if (pick) {
        const tb = t.querySelector("details:not(.stab) tbody"), choose = tr => tr && this.pickTract(tr.dataset.fips === this.pick ? null : tr.dataset.fips);
        tb.onclick = e => choose(e.target.closest("tr[data-fips]"));
        tb.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(e.target.closest("tr[data-fips]")); } };
      }
      const sd = t.querySelector("details.stab"); if (sd) sd.addEventListener("toggle", e => { this.storeTableOpen = e.target.open; });
    }

    teamStoreTable() {
      const s = this.s;
      if (!s.towns.length || !C.STORE_TYPES.some(type => s.show.includes(type))) return "";
      const parks = s.show.includes("parks"), parkBuf = this.pair.find(b => b.key === "parks"), buffered = parks && !!parkBuf;
      const name = p => p.names[p.types[0]];
      const rows = parks ? C.storeRows(this.places, this.parks || [], buffered ? parkBuf.miles : -1) : [...this.places].sort((a, b) => name(a.properties).localeCompare(name(b.properties))).map(store => ({ store }));
      const count = !rows.length ? "No stores on the lists you ticked in your chosen towns." : buffered ? `<b>${rows.filter(r => r.inside).length} of ${rows.length}</b> stores shown on the map are inside the ${parkBuf.miles}-mile parks buffer.` : `<b>${rows.length}</b> stores shown on the map in your chosen towns.`;
      return `<div class="scount">${count}</div><details class="ttab stab" ${this.storeTableOpen ? "open" : ""}><summary><span class="tbtn"><span class="tbtn-open">▸ Open the store table</span><span class="tbtn-close">▾ Hide the store table</span></span><span class="tsum">${parks ? "Each store, every list it is on, and the nearest open space on the map" : "Each store and every list it is on"}</span></summary>
        <div class="tscroll"><table><thead><tr><th scope="col">Store</th><th scope="col">Address</th><th scope="col">On these lists</th>${parks ? `<th scope="col">Nearest open space on the map</th><th scope="col">Miles to its edge</th>${buffered ? '<th scope="col">Inside the parks buffer?</th>' : ""}` : ""}</tr></thead><tbody>` +
        rows.map(r => { const p = r.store.properties; return `<tr><td>${esc(name(p))}</td><td>${esc(p.addr)}${s.towns.length > 1 ? `, ${esc(p.town)}` : ""}</td><td>${esc(C.listNames(p.types))}</td>${parks ? `<td>${esc(r.park || "–")}</td><td>${r.miles == null ? "–" : r.miles.toFixed(2)}</td>${buffered ? `<td>${r.inside ? "Yes" : "No"}</td>` : ""}` : ""}</tr>`; }).join("") + `</tbody></table></div></details>`;
    }

    renderFocus() {
      const e = this.focusEl, g = this.focusGroup;
      e.hidden = !g.length; if (!g.length) return;
      e.innerHTML = `<div class="fch"><b>Zoomed in on ${esc(g[0].properties.SITE_NAME || "this park")}</b><button class="btn ghost" type="button" data-back>Back to all parks</button></div>` +
        g.map((f, i) => `<div class="fcr"><i style="background:${FOCUS_COLS[i]}55;border-color:${FOCUS_COLS[i]}"></i><div><b style="color:${FOCUS_COLS[i]}">${esc(f.properties.SITE_NAME || "Unnamed open space")}</b><br><span class="muted">${fmt(f.properties.GIS_ACRES)} acres · ${esc(f.properties.Town)} · its own ${this.team ? C.bufferMilesFor(this.s, "parks") || this.s.miles : this.s.miles}-mile ring</span></div></div>`).join("") +
        `<div class="muted small">${g.length > 1 ? `${g.length} separate records that touch, so they look like one green area. Each one has its own ring.` : "No other park touches this one."}</div>`;
      e.querySelector("[data-back]").onclick = () => this.set("focus", null, true);
    }

    /* ---------------- saved image (drawn on a canvas; the basemap is not included) ---------------- */
    renderImage() {
      // A team's research question (her pick 2026-11-19) prints under the title; the map moves down to make room.
      const s = this.s, rq = String(s.rq || "").trim(), rqText = rq ? `Research question: ${rq}` : "";
      const rqLines = rq ? lines(document.createElement("canvas").getContext("2d"), rqText, 1050, `italic 17px -apple-system, "Helvetica Neue", Arial, sans-serif`) : [];
      const dy = rqLines.length ? rqLines.length * 22 + 8 : 0;
      const insetHeight = this.insetOff ? 0 : 252;
      const font = (w, px) => `${w} ${px}px -apple-system, "Helvetica Neue", Arial, sans-serif`;
      const scratch = document.createElement("canvas").getContext("2d"), legendTop = 100 + dy;
      const wrappedHeight = (text, width, weight, size, lineHeight) => Math.max(0, lines(scratch, text, width, font(weight, size)).length - 1) * lineHeight;
      let legendHeight = insetHeight + wrappedHeight(s.legend, 290, "bold", 16, 20) + 30 + this.br.slice(1).length * 27 + 32;
      const teamRows = [];
      if (this.team) {
        if (s.show.includes("parks")) teamRows.push({ kind: "parks", text: `Parks and open space${s.clip && this.townLines.length ? `, clipped to ${s.towns.join(" and ")}` : ""}` });
        if (s.clip && this.townLines.length) teamRows.push({ kind: "town", text: "Town line" });
        if (s.show.includes("routes")) teamRows.push({ kind: "routes", text: this.condLabel() });
        if (s.show.includes("chcs")) teamRows.push({ kind: "chcs", text: "Community health centers" });
        const stores = (this.opts.stores || []).filter(store => s.show.includes(store.key));
        stores.forEach(store => teamRows.push({ kind: "store", color: STORE_COLORS[store.key], text: store.label }));
        if (stores.length >= 2) teamRows.push({ kind: "split", colors: stores.map(store => STORE_COLORS[store.key]), text: "A store on two or more of these lists" });
        this.pair.forEach(b => teamRows.push({ kind: "buffer", color: b.color, text: `${b.miles}-mile buffer, ${b.label}` }));
        if (this.pair.length === 2) teamRows.push({ kind: "both", text: "Inside both buffers" });
        teamRows.forEach(row => { legendHeight += wrappedHeight(row.text, 250, "", 15, 19) + 27; });
      }
      if (!this.team && this.bufs.length) legendHeight += wrappedHeight(this.bufName(), 250, "", 15, 19) + 27;
      if (!this.team && this.cond.length) legendHeight += wrappedHeight(this.condName(), 250, "", 15, 19) + 27;
      this.focusGroup.forEach(f => { legendHeight += wrappedHeight(`${f.properties.SITE_NAME || "Unnamed open space"} (${fmt(f.properties.GIS_ACRES)} ac)`, 250, "bold", 15, 19) + 27; });
      if (s.towns.length) legendHeight += 27;
      const src = this.data.sources;
      const sourceValues = this.team ? [src.tracts && src.tracts.source,
        s.show.includes("parks") && src.openspace && src.openspace.source,
        s.show.includes("routes") && src.routes && src.routes.source,
        s.show.includes("chcs") && src.chcs && src.chcs.source,
        ...(this.storeDoc ? C.STORE_TYPES.filter(type => s.show.includes(type)).map(type => this.storeDoc.sources[type]) : []),
        ...(s.clip && this.landDocs ? this.landDocs.map(doc => doc.source) : [])] :
        ["tracts", this.cond.length ? (s.condType === "routes" ? "routes" : s.condType === "chcs" ? "chcs" : "openspace") : null].filter(Boolean).filter(kk => src[kk]).map(kk => src[kk].source);
      const srcText = C.sourceLine([TERM[s.measure] && TERM[s.measure].src, ...sourceValues]);
      const sourceHeight = wrappedHeight(srcText, 1050, "", 13, 18);
      const W = 1100, H = this.team ? Math.max(760 + dy, legendTop + legendHeight + 80) + sourceHeight : this.insetOff ? 760 + dy : Math.max(760 + dy, legendTop + legendHeight + 80), cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      const g = cv.getContext("2d");
      g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
      const box = [24, 74 + dy, 740, 600], fitBox = [box[0], box[1], box[2], box[3] - 104]; // tracts stop above the north arrow and scale
      const frameFeats = this.focusRings || this.sel;
      const bb = turf.bbox(turf.featureCollection(frameFeats));
      const projection = C.fitProjection(bb, fitBox[2], fitBox[3]), sc = projection.sc;
      const P = point => { const [x, y] = projection.project(point); return [fitBox[0] + x, fitBox[1] + y]; };
      const poly = gm => { const ps = gm.type === "Polygon" ? [gm.coordinates] : gm.type === "MultiPolygon" ? gm.coordinates : []; g.beginPath(); ps.forEach(p => p.forEach(r => r.forEach((pt, i) => { const [a, b] = P(pt); i ? g.lineTo(a, b) : g.moveTo(a, b); }))); };
      const line = gm => { const ls = gm.type === "LineString" ? [gm.coordinates] : gm.coordinates; g.beginPath(); ls.forEach(l => l.forEach((pt, i) => { const [a, b] = P(pt); i ? g.lineTo(a, b) : g.moveTo(a, b); })); };
      const view = [bb[0] - 0.05, bb[1] - 0.05, bb[2] + 0.05, bb[3] + 0.05];
      g.save(); g.beginPath(); g.rect(...box); g.clip(); g.fillStyle = "#f3f4f3"; g.fillRect(...box);
      this.data.tracts.forEach(f => {
        if (s.towns.includes(f.properties.City_Town)) return;
        const t = f.bbox || (f.bbox = turf.bbox(f)); if (t[0] > view[2] || t[2] < view[0] || t[1] > view[3] || t[3] < view[1]) return;
        poly(f.geometry); g.fillStyle = "#e3e6e5"; g.fill("evenodd"); g.strokeStyle = "#fff"; g.lineWidth = 0.8; g.stroke();
      });
      this.sel.forEach(f => { const c = C.classOf(f.properties[valueKey(s.measure)], this.br, s.method); poly(f.geometry); g.fillStyle = c < 0 ? "#e5e5e5" : this.pal[c]; g.fill("evenodd"); g.strokeStyle = "#fff"; g.lineWidth = 1; g.stroke(); });
      g.globalAlpha = this.viewAlpha;
      let pattern;
      if (this.team) {
        const tile = document.createElement("canvas"); tile.width = tile.height = 7;
        const tg = tile.getContext("2d"); tg.fillStyle = "rgba(255,255,255,.45)"; tg.fillRect(0, 0, 7, 7); tg.fillStyle = "#4a148c"; tg.fillRect(0, 0, 2, 7);
        pattern = g.createPattern(tile, "repeat"); pattern.setTransform(new DOMMatrix().rotate(45));
      }
      if (this.team) this.pair.filter(b => b.union).forEach(b => { poly(b.union.geometry); g.globalAlpha = BUF_TINT; g.fillStyle = b.color; g.fill("evenodd"); g.globalAlpha = 1; });
      if (this.team && this.overlap) { poly(this.overlap.geometry); g.fillStyle = pattern; g.fill("evenodd"); }
      if (this.team) {
        g.lineJoin = "round";
        this.pair.filter(b => b.union).forEach(b => { poly(b.union.geometry); g.strokeStyle = "#fff"; g.lineWidth = 5; g.stroke(); });
        this.pair.filter(b => b.union).forEach(b => { poly(b.union.geometry); g.strokeStyle = b.color; g.lineWidth = 2.4; g.stroke(); });
      }
      this.offParks.forEach(f => { poly(f.geometry); g.fillStyle = "rgba(213,218,215,.9)"; g.fill(); });
      const sq = (gm, fill) => { const [a, b] = P(gm.coordinates); g.fillStyle = fill; g.fillRect(a - 5, b - 5, 10, 10); g.strokeStyle = "#fff"; g.lineWidth = 1.2; g.strokeRect(a - 5, b - 5, 10, 10); };
      if (this.team) {
        this.parks.forEach(f => { poly(f.geometry); g.fillStyle = "rgba(124,184,127,.75)"; g.fill("evenodd"); });
        this.townLines.forEach(gm => { poly(gm); g.setLineDash([4, 3]); g.strokeStyle = "#1d2522"; g.lineWidth = 1.2; g.stroke(); g.setLineDash([]); });
        this.routes.forEach(f => { line(f.geometry); g.strokeStyle = "#2b2b2b"; g.lineWidth = 3; g.stroke(); });
        this.offCenters.forEach(f => sq(f.geometry, "#8a948f"));
        this.centers.forEach(f => sq(f.geometry, CHC_COLOR));
        this.places.forEach(f => {
          const [a, b] = P(f.geometry.coordinates), colors = C.placeTypes(f, s.show).map(type => STORE_COLORS[type]);
          g.beginPath(); g.arc(a, b, 7.6, 0, 2 * Math.PI); g.fillStyle = "#fff"; g.fill();
          colors.forEach((color, i) => { g.beginPath(); g.moveTo(a, b); g.arc(a, b, 6, -Math.PI / 2 + i * 2 * Math.PI / colors.length, -Math.PI / 2 + (i + 1) * 2 * Math.PI / colors.length); g.closePath(); g.fillStyle = color; g.fill(); });
          g.beginPath(); g.arc(a, b, 6, 0, 2 * Math.PI); g.strokeStyle = "#1d2522"; g.lineWidth = 1; g.stroke();
        });
      } else {
      this.offCenters.forEach(f => sq(f.geometry, "#8a948f"));
      this.cond.forEach(f => { if (f.geometry.type === "Point") sq(f.geometry, CHC_COLOR); else if (f.geometry.type.includes("Line")) { line(f.geometry); g.strokeStyle = "#2b2b2b"; g.lineWidth = 3; g.stroke(); } else { poly(f.geometry); g.fillStyle = "rgba(124,184,127,.75)"; g.fill(); } });
      this.bufs.forEach(b => { poly(b.geometry); g.strokeStyle = s.bufColor; g.lineWidth = 1.6; g.globalAlpha = this.viewAlpha * (this.focusRings ? 0.25 : 1); g.stroke(); g.globalAlpha = this.viewAlpha; });
      }
      this.focusGroup.forEach((f, i) => { poly(f.geometry); g.fillStyle = FOCUS_COLS[i] + "59"; g.fill(); g.strokeStyle = FOCUS_COLS[i]; g.lineWidth = 3; g.stroke();
        poly(this.focusRings[i].geometry); g.setLineDash(i % 3 === 0 ? [] : i % 3 === 1 ? [10, 6] : [3, 5]); g.stroke(); g.setLineDash([]); });
      g.restore(); g.globalAlpha = 1; g.strokeStyle = "#b8bfbc"; g.lineWidth = 1; g.strokeRect(...box);
      // title
      g.fillStyle = "#1d2522"; g.font = font("bold", 24); wrap(g, s.title || this.defaultTitle(), 24, 44, 1050, 28);
      if (rqLines.length) { g.font = font("italic", 17); g.fillStyle = "#12302d"; rqLines.forEach((ln, i) => g.fillText(ln, 24, 70 + i * 22)); }
      // legend
      let x = 790, y = 100 + dy;
      if (!this.insetOff) {
        g.fillStyle = "#1d2522"; g.font = font("bold", 13); g.fillText("Census tract colors only", x, y);
        const top = y + 10, project = C.fitProjection(turf.bbox(turf.featureCollection(this.sel)), 290, 210).project;
        g.fillStyle = "#eef0ef"; g.fillRect(x, top, 290, 210);
        this.sel.forEach(f => { const c = C.classOf(f.properties[valueKey(s.measure)], this.br, s.method);
          const path = new Path2D(C.pathFor(f.geometry, point => { const [a, b] = project(point); return [x + a, top + b]; }));
          g.fillStyle = c < 0 ? "#e5e5e5" : this.pal[c]; g.fill(path, "evenodd"); g.strokeStyle = "#fff"; g.lineWidth = 0.6; g.stroke(path); });
        y += insetHeight;
      }
      g.fillStyle = "#1d2522"; g.font = font("bold", 16); y = wrap(g, s.legend, x, y, 290, 20) + 30; g.font = font("", 15);
      this.br.slice(1).forEach((v, i) => { g.fillStyle = this.pal[i]; g.fillRect(x, y - 14, 26, 18); g.strokeStyle = "#aaa"; g.strokeRect(x, y - 14, 26, 18); g.fillStyle = "#1d2522"; g.fillText(`${fmtFor(s.measure)(this.br[i])} – ${fmtFor(s.measure)(v)}`, x + 36, y); y += 27; });
      g.fillStyle = "#555"; g.font = font("", 13); g.fillText(`${C.METHODS[s.method]}, ${Math.max(0, this.br.length - 1)} classes`, x, y); y += 32; g.font = font("", 15);
      if (this.team) teamRows.forEach(row => {
        if (row.kind === "parks") { g.fillStyle = "rgba(124,184,127,.75)"; g.fillRect(x, y - 14, 26, 18); }
        if (row.kind === "town" || row.kind === "routes") { g.strokeStyle = row.kind === "town" ? "#1d2522" : "#2b2b2b"; g.lineWidth = row.kind === "town" ? 1.2 : 3; g.setLineDash(row.kind === "town" ? [4, 3] : []); g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 26, y - 5); g.stroke(); g.setLineDash([]); }
        if (row.kind === "chcs") { g.fillStyle = CHC_COLOR; g.fillRect(x + 8, y - 10, 10, 10); }
        if (row.kind === "store") { g.beginPath(); g.arc(x + 13, y - 5, 6, 0, 2 * Math.PI); g.fillStyle = row.color; g.fill(); g.strokeStyle = "#1d2522"; g.lineWidth = 1; g.stroke(); }
        if (row.kind === "split") { row.colors.forEach((color, i) => { g.beginPath(); g.moveTo(x + 13, y - 5); g.arc(x + 13, y - 5, 6, -Math.PI / 2 + i * 2 * Math.PI / row.colors.length, -Math.PI / 2 + (i + 1) * 2 * Math.PI / row.colors.length); g.closePath(); g.fillStyle = color; g.fill(); }); g.beginPath(); g.arc(x + 13, y - 5, 6, 0, 2 * Math.PI); g.strokeStyle = "#1d2522"; g.lineWidth = 1; g.stroke(); }
        if (row.kind === "buffer") { g.fillStyle = tint(row.color); g.fillRect(x, y - 14, 26, 18); g.strokeStyle = row.color; g.lineWidth = 2.4; g.strokeRect(x, y - 14, 26, 18); }
        if (row.kind === "both") { g.fillStyle = pattern; g.fillRect(x, y - 14, 26, 18); g.strokeStyle = "#aaa"; g.lineWidth = 1; g.strokeRect(x, y - 14, 26, 18); }
        g.fillStyle = "#1d2522"; y = wrap(g, row.text, x + 36, y, 250, 19) + 27;
      });
      if (!this.team && this.bufs.length) { g.strokeStyle = s.bufColor; g.lineWidth = 2.5; g.strokeRect(x, y - 14, 26, 18); g.fillStyle = "#1d2522"; y = wrap(g, this.bufName(), x + 36, y, 250, 19) + 27; }
      if (!this.team && this.cond.length) {
        if (s.condType === "routes") { g.strokeStyle = "#2b2b2b"; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 26, y - 5); g.stroke(); } else if (s.condType === "chcs") { g.fillStyle = CHC_COLOR; g.fillRect(x + 8, y - 10, 10, 10); } else { g.fillStyle = "rgba(124,184,127,.75)"; g.fillRect(x, y - 14, 26, 18); }
        g.fillStyle = "#1d2522"; y = wrap(g, this.condName(), x + 36, y, 250, 19) + 27;
      }
      this.focusGroup.forEach((f, i) => { g.fillStyle = FOCUS_COLS[i] + "59"; g.fillRect(x, y - 14, 26, 18); g.strokeStyle = FOCUS_COLS[i]; g.lineWidth = 3; g.strokeRect(x, y - 14, 26, 18); g.fillStyle = FOCUS_COLS[i]; g.font = font("bold", 15); y = wrap(g, `${f.properties.SITE_NAME || "Unnamed open space"} (${fmt(f.properties.GIS_ACRES)} ac)`, x + 36, y, 250, 19) + 27; g.font = font("", 15); });
      if (s.towns.length) { g.fillStyle = "#e3e6e5"; g.fillRect(x, y - 14, 26, 18); g.fillStyle = "#1d2522"; g.fillText("Other towns (not compared)", x + 36, y); y += 27; }
      g.fillStyle = "#1d2522"; g.font = font("", 13);
      // solid north arrow + two-part scale bar, on the map below the tracts
      const pxPerMi = sc / 69.17, steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 50];
      const mi = [...steps].reverse().find(d => d * pxPerMi <= 170) || 0.1, bar = mi * pxPerMi;
      const cw = bar + 100, ch = 72, cx = box[0] + box[2] - cw - 12, cy = box[1] + box[3] - ch - 12;
      g.fillStyle = "rgba(255,255,255,.94)"; g.strokeStyle = "#b8bfbc"; g.lineWidth = 1; g.beginPath(); g.roundRect(cx, cy, cw, ch, 6); g.fill(); g.stroke();
      const nx = cx + 24, ny = cy + 46;
      g.fillStyle = "#1d2522"; g.beginPath(); g.moveTo(nx, ny - 30); g.lineTo(nx - 10, ny); g.lineTo(nx, ny - 7.5); g.lineTo(nx + 10, ny); g.closePath(); g.fill();
      g.font = font("bold", 11); g.textAlign = "center"; g.fillText("N", nx, ny + 14);
      const sx = cx + 54, sy = cy + 30;
      g.fillStyle = "#1d2522"; g.fillRect(sx, sy, bar / 2, 8); g.fillStyle = "#fff"; g.fillRect(sx + bar / 2, sy, bar / 2, 8); g.strokeStyle = "#1d2522"; g.strokeRect(sx, sy, bar, 8);
      g.fillStyle = "#1d2522"; g.font = font("", 13); g.fillText("0", sx, sy + 25); g.fillText(String(mi / 2), sx + bar / 2, sy + 25); g.fillText(`${mi} mi`, sx + bar, sy + 25); g.textAlign = "left";
      // source line
      g.fillStyle = "#444"; g.font = font("", 13); wrap(g, srcText, 24, H - 60 - (this.team ? sourceHeight : 0), 1050, 18);
      return cv;
    }

    /** Team pages (her pick 2026-11-25, Choice 3 A): show the image first; "Save this image" saves exactly what is shown. */
    previewImage() {
      const cv = this.renderImage(), id = `xp-prev-${explorerCount}`;
      const d = el("dialog", { class: "xpreview", "aria-labelledby": id });
      d.innerHTML = `<h2 id="${id}">Check your map image before you save it</h2><img alt="Preview of the saved map image" src="${cv.toDataURL("image/png")}"><div class="row"><button class="btn" type="button" data-k="psave">Save this image</button><button class="btn ghost" type="button" data-k="pback">Back to the map</button></div>`;
      d.addEventListener("close", () => d.remove());
      d.querySelector("[data-k=psave]").onclick = () => { this.saveImage(cv); d.close(); };
      d.querySelector("[data-k=pback]").onclick = () => d.close();
      document.body.append(d); d.showModal();
    }

    saveImage(cv = this.renderImage()) {
      const name = (this.s.title || this.defaultTitle()).replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "").slice(0, 80) || "map";
      cv.toBlob(blob => { const a = el("a", { href: URL.createObjectURL(blob), download: `${name}.png` }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }, "image/png");
    }
  }

  /** "CHELSEA" → "Chelsea", "EAST BOSTON" → "East Boston" (MassGIS writes towns in capitals). */
  const townName = s => String(s || "").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

  /** The lines `text` wraps to at width w in the given font (to size the saved image before drawing). */
  function lines(g, text, w, f) { g.font = f; const out = []; let line = ""; for (const word of String(text).split(" ")) { const t = line ? line + " " + word : word; if (g.measureText(t).width > w && line) { out.push(line); line = word; } else line = t; } if (line) out.push(line); return out; }

  function wrap(g, text, x, y, w, lh) { let line = ""; for (const word of String(text).split(" ")) { const t = line ? line + " " + word : word; if (g.measureText(t).width > w && line) { g.fillText(line, x, y); y += lh; line = word; } else line = t; } g.fillText(line, x, y); return y; }

  /** Add a question file's layers ({ key: {label, unit, src, decimals, year} }) to the explorer's labels. */
  Explorer.registerLayers = fields => Object.assign(TERM, fields);
  root.Explorer = Explorer;
  root.ExplorerDefaults = DEFAULT_STATE;
})(window);
