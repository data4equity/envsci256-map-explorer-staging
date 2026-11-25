/* Question D's "Cities and towns" tab (her approval 2026-11-18: "Use it, D approved"; placement "B, tabs").
   The approved student note, a town map colored by teen birth rate or a housing layer, and a comparison table whose
   columns are Chelsea, the towns a team adds, and Massachusetts. Wording is from Artifact WxVNXaEjpBMiTJ6T4qAGkA v6.
   The pure functions at the top are exported for the Node tests; the TownArea class is the page. */
(function (root) {
  const C = () => (typeof ExplorerCore !== "undefined" ? ExplorerCore : root.ExplorerCore);
  const NOTE = {
    title: "What is in this tab, and why some of it is not on a map",
    intro: "The “Census tracts” tab shows census tracts. Each tract is a stand-in (proxy) for a neighborhood within a city. Some data for Question D are published only for whole cities and towns, so they are in this tab instead. Compare these numbers city with city, or with the state. Do not compare them with the “Census tracts” tab.",
    items: [
      ["Teen birth rate", ", from the Massachusetts Department of Public Health. Published for every city and town, but not for census tracts. That is why it is not in the “Census tracts” tab. It appears on the town map further down this page."],
      ["Crowded homes and age of homes", ", from the U.S. Census Bureau. The same numbers as the “Census tracts” tab, added up for each whole city or town. Shown on the town map further down this page."],
      ["Depression, mental distress, loneliness, lack of support, housing insecurity and utility shut-off threat", ", from the Centers for Disease Control and Prevention (CDC). CDC publishes these for 58 Massachusetts cities, Chelsea among them, but not for the other 293 towns. A map would leave most of the state blank, so these numbers are only in the table. If you add a town CDC does not cover, its column says “Not published by CDC.”"]
    ]
  };
  const TEEN_LABEL = "Teen birth rate per 1,000, 2013–2022";
  const HOUSING = ["pct_crowded", "pct_renter_crowded", "pct_built_1979_or_earlier", "pct_renter_built_1979_or_earlier", "pct_owner_built_1979_or_earlier"];
  const PLACES_ROWS = [["DEPRESSION", "Depression among adults, %"], ["MHLTH", "Frequent mental distress among adults, %"], ["LONELINESS", "Loneliness among adults, %"],
    ["EMOTIONSPT", "Lack of social and emotional support among adults, %"], ["HOUSINSECU", "Housing insecurity in the past 12 months among adults, %"],
    ["SHUTUTILITY", "Utility services threat in the past 12 months among adults, %"]];
  const HOME = "Chelsea";
  // Her ask 2026-11-25: each city in the comparison table is outlined in its own color, matched in the table and
  // the legend. None is orange, red or yellow, so they stand apart from the town colors and the yellow highlight.
  const CITY_COLORS = ["#1d4ed8", "#7c3aed", "#0f766e", "#c026d3", "#15803d", "#475569"];
  const cityColor = i => CITY_COLORS[i % CITY_COLORS.length];

  /** [value, "(low, high)"] for a Census housing layer, its 95% interval from the published 90% margin. */
  function housingCell(field, props, key) {
    if (!props || props[key] == null) return ["–"];
    const r = C().acsRange(field, props, key);
    return r && r.ci ? [props[key].toFixed(field.decimals), r.ci] : [props[key].toFixed(field.decimals)];
  }
  function teenCell(props) {
    if (props.teen_rate != null) return [props.teen_rate.toFixed(1)];
    return [props.teen_status === "hidden" ? "Hidden (1 to 4 births)" : "Not in the DPH file"];
  }
  function placesCell(props, id, isState) {
    if (isState) return ["No state value from CDC"];
    const v = props && props.places && props.places[id];
    return v ? [v[0].toFixed(1), `(${v[1].toFixed(1)}, ${v[2].toFixed(1)})`] : ["Not published by CDC"];
  }
  /** Her ask 2026-11-25: the Massachusetts column shows on its own before any city is added, and after that only
      when the student ticks "Show the Massachusetts column". */
  function stateShown(cols, showState) { return !cols.length || !!showState; }

  /** Quantile breaks, 5 classes, over the towns that have a value. */
  function townBreaks(features, key) { return C().breaks(features.map(f => f.properties[key]), "quantile", 5); }

  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const cell = parts => parts.map((p, i) => i ? `<br><span class="ci">${esc(p)}</span>` : esc(p)).join("");

  class TownArea {
    /** doc: data/towns/question-d-towns.json; cards: [{ title, rows }] for this tab's "About these data". */
    constructor(el, doc, cards, cardsHtml) {
      this.el = el; this.doc = doc; this.cards = cards; this.cardsHtml = cardsHtml; this.key = "teen_rate"; this.cols = []; this.showState = false; this.pick = null;
      this.by = Object.fromEntries(doc.features.map(f => [f.properties.NAME, f]));
      this.build();
    }

    label(key) { return key === "teen_rate" ? "Teen birth rate" : this.doc.fields[key].label.replace(/, %$/, "").replace(/ \(share of rented homes\)$/, ""); }

    build() {
      const fold = this.cardsHtml ? this.cardsHtml(this.cards) : this.cards.map(c => `<div class="dcard"><h3>${esc(c.title)}</h3><table>${c.rows.map(([h, t]) => `<tr><th scope="row">${esc(h)}</th><td>${esc(t)}</td></tr>`).join("")}</table></div>`).join("");
      this.el.innerHTML = `<div class="tnote"><p class="tnote-h">${esc(NOTE.title)}</p><p>${esc(NOTE.intro)}</p><ul>${NOTE.items.map(([b, r]) => `<li><b>${esc(b)}</b>${esc(r)}</li>`).join("")}</ul></div>
        <button type="button" class="btn ghost tstart" data-k="tstart">↺ Start over</button>
        <label class="tby">Color the towns by<select data-k="by">${["teen_rate", ...HOUSING].map(k => `<option value="${k}">${esc(this.label(k))}</option>`).join("")}</select></label>
        <div class="tmap" role="region" aria-label="Map of Massachusetts cities and towns"><div class="xlegend tlegend"></div></div>
        <h3 class="th">Your comparison table</h3>
        <p class="muted small">Each team adds its own comparison cities and towns. Numbers in brackets are 95% confidence intervals. Click a city or town on the map, or its name in the table, to highlight it in both.</p>
        <div class="tscroll ttable"></div>
        <label class="tadd"><span class="sr">Add a city or town to the table</span><select data-k="add"></select></label>
        <label class="check tstate"><input type="checkbox" data-k="state"> <span>Show the Massachusetts column</span></label>
        <details class="about ttab"><summary><span class="tbtn"><span class="tbtn-open">▸ About these data</span><span class="tbtn-close">▾ Hide: About these data</span></span><span class="tsum">The data in this tab: teen births, housing for each city or town, and CDC measures for cities</span></summary><div class="dcards">${fold}</div></details>`;
      this.el.querySelector("[data-k=by]").onchange = e => { this.key = e.target.value; this.draw(); };
      this.el.querySelector("[data-k=tstart]").onclick = () => this.startOver();
      this.el.querySelector("[data-k=add]").onchange = e => { if (e.target.value) this.add(e.target.value); };
      this.el.querySelector("[data-k=state]").onchange = e => { this.showState = e.target.checked; this.renderTable(); };
      this.legendEl = this.el.querySelector(".tlegend");
      const mapEl = this.el.querySelector(".tmap");
      this.svg = L.svg();
      this.map = L.map(mapEl, { renderer: this.svg, zoomSnap: 0.25 });
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 16, attribution: "Basemap: Esri, HERE, Garmin, © OpenStreetMap contributors, and the GIS user community" }).addTo(this.map);
      L.DomEvent.disableClickPropagation(this.legendEl); L.DomEvent.disableScrollPropagation(this.legendEl);
      // A click on a city or town also highlights its column in the comparison table (her ask 2026-11-20).
      this.layer = L.geoJSON(this.doc, { onEachFeature: (f, l) => { l.bindPopup(() => this.popup(f), { maxWidth: 260 }); l.on("click", () => this.select(f.properties.NAME)); } }).addTo(this.map);
      this.map.fitBounds(this.layer.getBounds(), { padding: [8, 8] });
      // Hatching for towns whose teen count DPH hides: an SVG pattern in the map's own <svg>.
      this.svg._container.insertAdjacentHTML("afterbegin", `<defs><pattern id="thatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#ececec"/><line x1="0" y1="0" x2="0" y2="6" stroke="#b5b5b5" stroke-width="2"/></pattern></defs>`);
      this.map.on("popupopen", e => { const b = e.popup.getElement().querySelector("[data-addtown]"); if (b) b.onclick = () => { this.map.closePopup(); this.add(b.dataset.addtown); }; });
      this.draw(); this.renderTable();
      // The tab has just been shown: fit again once the browser has laid out the map's real size.
      requestAnimationFrame(() => { this.map.invalidateSize(); this.map.fitBounds(this.layer.getBounds(), { padding: [8, 8] }); });
    }

    popup(f) {
      const p = f.properties, k = this.key, v = k === "teen_rate" ? teenCell(p) : housingCell(this.doc.fields[k], p, k);
      const inTable = this.cols.includes(p.NAME);
      return `<div class="pp"><div class="pph">${esc(p.NAME)}</div><div class="small">${esc(this.label(k))}: <b>${cell(v)}</b></div>
        <div class="row" style="margin-top:6px">${inTable ? `<span class="muted small">In your comparison table</span>` : `<button class="btn" type="button" data-addtown="${esc(p.NAME)}">Add to the comparison table</button>`}</div></div>`;
    }

    draw() {
      const k = this.key, br = townBreaks(this.doc.features, k), pal = C().rampColors("Oranges", Math.max(1, br.length - 1));
      this.layer.setStyle(f => {
        const p = f.properties, c = C().classOf(p[k], br), home = p.NAME === HOME;
        const fill = c >= 0 ? pal[c] : k === "teen_rate" && p.teen_status === "hidden" ? "url(#thatch)" : "#c9cecc";
        if (p.NAME === this.pick) return { fillColor: fill, fillOpacity: c >= 0 ? 0.88 : 1, color: "#111", weight: 4 };
        const ci = this.cols.indexOf(p.NAME);
        if (ci >= 0) return { fillColor: fill, fillOpacity: c >= 0 ? 0.88 : 1, color: cityColor(ci), weight: 3.5 };
        return { fillColor: fill, fillOpacity: c >= 0 ? 0.88 : 1, color: home ? "#1d2522" : "#fff", weight: home ? 2.6 : 0.5 };
      });
      this.layer.eachLayer(l => { if (l.feature.properties.NAME === HOME || this.cols.includes(l.feature.properties.NAME)) l.bringToFront(); });
      this.layer.eachLayer(l => { if (l.feature.properties.NAME === this.pick) l.bringToFront(); });
      const fmt = v => v.toFixed(1), title = k === "teen_rate" ? "Teen birth rate per 1,000 females aged 15 to 19, 2013–2022" : this.doc.fields[k].label;
      this.legendEl.innerHTML = `<div class="lt">${esc(title)}</div>` + br.slice(1).map((v, i) => `<div><i class="sw" style="background:${pal[i]}"></i>${fmt(br[i])} – ${fmt(v)}</div>`).join("") +
        (k === "teen_rate" ? `<div><i class="sw hatch"></i>Hidden (1 to 4 births)</div><div><i class="sw" style="background:#c9cecc"></i>Not in the DPH file</div>` : `<div><i class="sw" style="background:#c9cecc"></i>No value</div>`) +
        this.cols.map((name, i) => `<div><i class="sw" style="background:#fff;border:2.5px solid ${cityColor(i)}"></i>${esc(name)}</div>`).join("") +
        (this.cols.includes(HOME) ? "" : `<div><i class="sw" style="background:#fff;border:2px solid #1d2522"></i>${HOME}</div>`) + `<div class="lsrc">Quantiles, 5 classes</div>`;
    }

    /** Highlight one city or town on the map and its column in the comparison table; again clears it. */
    select(name, toggle) {
      this.pick = toggle && this.pick === name ? null : name;
      this.draw(); this.markTable();
    }

    markTable() {
      const box = this.el.querySelector(".ttable");
      let first = null;
      box.querySelectorAll("[data-col]").forEach(c => { const on = c.dataset.col === this.pick; c.classList.toggle("on", on); if (on && !first) first = c; });
      if (first) box.scrollLeft += first.getBoundingClientRect().left - box.getBoundingClientRect().left - box.clientWidth / 2 + first.offsetWidth / 2;
    }

    add(name) { if (this.by[name] && !this.cols.includes(name)) { this.cols.push(name); if (this.pick === name) this.pick = null; this.draw(); this.renderTable(); this.zoomToCols(); } }
    remove(name) { this.cols = this.cols.filter(c => c !== name); if (this.pick === name) this.pick = null; this.draw(); this.renderTable(); this.zoomToCols(); }

    /** Her ask 2026-11-25: back to how the tab opens: teen birth rate, no cities, all of Massachusetts. */
    startOver() {
      this.key = "teen_rate"; this.el.querySelector("[data-k=by]").value = this.key;
      this.cols = []; this.showState = false; this.pick = null; this.map.closePopup();
      this.draw(); this.renderTable(); this.map.fitBounds(this.layer.getBounds(), { padding: [8, 8] });
    }

    /** Her ask 2026-11-25: the map zooms to the cities in the table, widening as more are added, and goes back to
        all of Massachusetts when the table has none. */
    zoomToCols() {
      const picked = this.cols.length ? L.featureGroup(this.layer.getLayers().filter(l => this.cols.includes(l.feature.properties.NAME))) : this.layer;
      this.map.fitBounds(picked.getBounds(), { padding: [12, 12], maxZoom: 13 });
    }

    renderTable() {
      const cols = this.cols.map(n => this.by[n].properties), st = this.doc.state, withState = stateShown(this.cols, this.showState), n = cols.length + 1 + Number(withState);
      const head = `<tr><th scope="col"></th>${cols.map((p, i) => `<th scope="col" data-col="${esc(p.NAME)}"><i class="tsw" style="border-color:${cityColor(i)}"></i><span class="tpick" role="button" tabindex="0">${esc(p.NAME)}</span>${` <button type="button" class="xrm" data-rm="${esc(p.NAME)}" aria-label="Remove ${esc(p.NAME)}">×</button>`}</th>`).join("")}${withState ? `<th scope="col">Massachusetts</th>` : ""}</tr>`;
      const group = t => `<tr class="grp"><th colspan="${n}" scope="colgroup">${esc(t)}</th></tr>`;
      const row = (label, f, stateCells) => `<tr><th scope="row">${esc(label)}</th>${cols.map(p => `<td data-col="${esc(p.NAME)}">${cell(f(p))}</td>`).join("")}${withState ? `<td>${cell(stateCells)}</td>` : ""}</tr>`;
      this.el.querySelector(".ttable").innerHTML = `<table><thead>${head}</thead><tbody>` +
        group("Teen births · Massachusetts Department of Public Health") + row(TEEN_LABEL, teenCell, [st.teen_rate.toFixed(1)]) +
        group("Housing · U.S. Census Bureau, American Community Survey") +
        HOUSING.map(k => row(this.doc.fields[k].label, p => housingCell(this.doc.fields[k], p, k), housingCell(this.doc.fields[k], st, k))).join("") +
        group("Mental health and hardship · CDC PLACES (cities only)") +
        PLACES_ROWS.map(([id, label]) => row(label, p => placesCell(p, id), placesCell(null, id, true))).join("") + `</tbody></table>`;
      this.el.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => this.remove(b.dataset.rm));
      this.el.querySelectorAll(".tpick").forEach(b => {
        const go = () => this.select(b.closest("th").dataset.col, true);
        b.onclick = go; b.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } };
      });
      this.markTable();
      const box = this.el.querySelector("[data-k=state]");
      box.closest("label").hidden = !this.cols.length; box.checked = this.showState;
      const add = this.el.querySelector("[data-k=add]");
      add.innerHTML = `<option value="">${this.cols.length ? "+ Add another city or town…" : "+ Add a city or town…"}</option>` + Object.keys(this.by).filter(t => !this.cols.includes(t)).sort().map(t => `<option>${esc(t)}</option>`).join("");
    }
  }

  const api = { NOTE, TEEN_LABEL, PLACES_ROWS, CITY_COLORS, cityColor, housingCell, teenCell, placesCell, stateShown, townBreaks, TownArea };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TownArea = api;
})(typeof self !== "undefined" ? self : this);
