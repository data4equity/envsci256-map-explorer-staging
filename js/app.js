/* Page shell: tabs, data loading, Copy-link restore, and the Term Project team pages. */
(function () {
  const C = window.ExplorerCore, T = window.TermTeams;
  const TABS = ["exercise-4", "midterm", "term-project"];
  const PAGE_TITLE = document.title;
  const osCache = new Map(), qFiles = new Map();
  let osIndex = [], data = null, teamExplorer = null, teamShown = null, centers = null, townArea = null, V = {};
  // Real-data pictures (scripts/build_visuals.py); the page works without them.
  const visuals = getJSON("data/visuals.json").then(v => { V = v; renderCards(); }).catch(() => null);
  const DD = () => window.DataDocs;
  /** The symbol for a kind of layer: a real picture for tracts and towns, a drawing for the rest. */
  const symbol = k => k ? `<span class="gi" title="${esc(DD().KINDS[k])}">${V["ico_" + k] || DD().SYMBOL_SVG[k] || ""}</span>` : "";
  const CAPTIONS = { a: "Opens on: adult asthma by tract. You add the roads and buffers.", b: "Opens on: Medicaid coverage by tract. You add the health centers and buffers.",
    c: "Opens on: people under 18 by tract. You add the parks, stores and buffers.", d: "Opens on: depression by tract; plus a Cities and towns tab" };

  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  async function getJSON(path) {
    const r = await fetch(path);
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.json();
  }

  /** Open-space features for every town file whose area overlaps bbox; each file is fetched once. */
  async function openSpaceFor(bbox) {
    const entries = C.townsInBbox(osIndex, bbox);
    await Promise.all(entries.filter(e => !osCache.has(e.file)).map(async e => { osCache.set(e.file, (await getJSON(`data/${e.file}`)).features); }));
    return entries.flatMap(e => osCache.get(e.file) || []);
  }

  const landFiles = new Map();
  let landIndex = null, places = null, countsPromise = null;
  function counts() { return countsPromise || (countsPromise = getJSON("data/term/counts.json")); }
  /** Town boundaries and park polygons, fetched once per file. */
  async function landFor(towns) {
    if (!landIndex) landIndex = getJSON("data/land/index.json");
    const index = await landIndex;
    const entries = index.filter(e => towns.includes(e.town));
    return Promise.all(entries.map(e => {
      if (!landFiles.has(e.file)) landFiles.set(e.file, getJSON(`data/${e.file}`));
      return landFiles.get(e.file);
    }));
  }

  /** Store locations shared by the team pages. */
  function storePlaces() {
    if (!places) places = getJSON("data/stores/places.json");
    return places;
  }

  /** The community health centers (Question B's step 3 layer), fetched the first time a page needs them. */
  function healthCenters() {
    if (!centers) centers = getJSON("data/chcs.json").then(doc => { data.sources.chcs = { source: doc.source }; return doc.features; });
    return centers;
  }

  /** A question's layer file, fetched once: its values are copied onto the statewide tracts. */
  function questionFile(q) {
    if (!q.file) return Promise.resolve(null);
    if (!qFiles.has(q.id)) qFiles.set(q.id, getJSON(`data/${q.file}`).then(doc => {
      q.layers.forEach(l => { if (l.noMoe && doc.fields[l.key]) doc.fields[l.key].noMoe = l.noMoe; });
      window.Explorer.registerLayers(doc.fields);
      data.tracts.forEach(f => Object.assign(f.properties, doc.values[f.properties.TractFIPS] || {}));
      return doc;
    }));
    return qFiles.get(q.id);
  }

  /* ---------------- Term Project tab ---------------- */
  function renderCards() {
    document.getElementById("tp-grid").innerHTML = T.QUESTIONS.map(q => `<div class="qcard"><div class="ql">Question ${q.id.toUpperCase()}</div><h2>${esc(q.title)}</h2>${
      V["thumb_" + q.id] ? `<figure class="qpic">${V["thumb_" + q.id]}<figcaption>${esc(CAPTIONS[q.id])}</figcaption></figure>` : ""}<p>${esc(q.text)}</p>
      <div class="teams">${T.TEAMS.filter(t => t.question === q).map(t => `<a href="#${t.id}">${t.name}</a>`).join("")}</div></div>`).join("");
  }

  function layerRow(l, doc) {
    if (l.places) { const m = window.PLACES_MEASURES[l.key]; return [`${m.label}, %`, `Centers for Disease Control and Prevention (CDC) PLACES 2025 (${m.year} estimates), census tract`]; }
    if (l.stores) return [l.label, l.src];
    if (l.file) { const f = doc && doc.fields[l.key]; return f ? [f.unit === "year" ? f.label : `${f.label}, ${f.unit}${f.per ? ` ${f.per}` : ""}${f.unitName ? ` (${f.unitName})` : ""}`, `${f.src}, census tract`] : null; }
    return [l.label, l.src];
  }

  async function showTeam(team, fromLink) {
    const box = document.getElementById("tp-team"), q = team.question, put = (k, v) => { box.querySelector(`[data-t=${k}]`).textContent = v; };
    document.getElementById("tp-cards").hidden = true; box.hidden = false;
    document.title = `${team.name} · ${PAGE_TITLE}`;
    put("q", `Question ${q.id.toUpperCase()}`); put("team", team.name);
    put("head", `${team.name} · Question ${q.id.toUpperCase()}: ${q.title}`); put("text", q.text);
    put("lyrhead", `Layers already added for Question ${q.id.toUpperCase()}`);
    box.querySelector("[data-t=more]").hidden = !!q.file;
    if (teamShown === team.id && !fromLink) { if (teamExplorer) teamExplorer.map.invalidateSize(); return; }
    teamShown = team.id;
    const status = document.getElementById("tp-status");
    status.hidden = false; status.textContent = "Loading your team's layers…"; status.classList.remove("error");
    let doc;
    try { doc = await questionFile(q); } catch (e) {
      status.textContent = "The page could not load your team's layers. Reload the page; if it still fails, email your instructor."; status.classList.add("error"); teamShown = null; throw e;
    }
    if (teamShown !== team.id) return; // the student clicked another team while this one loaded
    status.hidden = true;
    await visuals;
    if (teamShown !== team.id) return;
    box.querySelector("[data-t=rows]").innerHTML = q.layers.map(l => [l, layerRow(l, doc)]).filter(([, r]) => r).map(([l, [a, b]]) => `<tr><td>${symbol(DD().kindOfLayer(l))}${esc(a)}</td><td>${esc(b)}</td></tr>`).join("");
    await visuals;
    box.querySelector("[data-t=docs]").innerHTML = cardsHtml(window.DataDocs.cardsFor(q, window.PLACES_MEASURES));
    const kinds = [...new Set(q.layers.filter(l => layerRow(l, doc)).map(DD().kindOfLayer).filter(Boolean))];
    box.querySelector("[data-t=lyrkey]").innerHTML = kinds.map(k => `${symbol(k)}${esc(DD().KINDS[k])}`).join(" &nbsp; ");
    box.querySelector("[data-t=flow3]").innerHTML = V.ico_tracts || "";
    box.querySelector("details.about").open = false;
    const state = fromLink && fromLink.tab === team.id ? C.migrateTeamState(fromLink) : T.startState(team);
    // Forget the old map as soon as it is removed: setupScales must never resize a removed map (the bug that broke
    // switching from one team page to another, found on the live site 2026-11-20).
    if (teamExplorer) { teamExplorer.map.remove(); teamExplorer = null; }
    setupScales(q);
    const rq = document.getElementById("tp-rq");
    rq.value = state.rq || "";
    rq.oninput = () => { if (teamExplorer) teamExplorer.s.rq = rq.value; };
    teamExplorer = new window.Explorer(document.getElementById("team-explorer"), { tracts: data.tracts, routes: data.routes, sources: data.sources, openSpaceFor, healthCenters, landFor, storePlaces, counts }, state,
      { green: !!q.green, opening: T.startState(team), pickRows: true, optionalBuffer: true, termLayers: T.fileLayerKeys(q), termHeading: `Question ${q.id.toUpperCase()} layers`, conditions: T.conditionLayers(q), stores: T.storeLayers(q), layers: T.showLayers(q) });
  }

  /** Question D: "Census tracts" | "Cities and towns" tabs above the map (her pick "B, tabs", 2026-11-18). */
  function setupScales(q) {
    const bar = document.querySelector("[data-t=scales]"), towns = document.getElementById("team-towns"), tracts = document.getElementById("team-explorer");
    if (townArea) { townArea.map.remove(); townArea = null; }
    towns.innerHTML = ""; bar.hidden = !q.towns; document.querySelector("[data-t=why2]").hidden = !q.towns;
    bar.querySelector("[data-pic=tracts]").innerHTML = V.tracts_small || ""; bar.querySelector("[data-pic=towns]").innerHTML = V.towns_small || "";
    document.querySelector("[data-pic=tracts-big]").innerHTML = V.tracts_big || ""; document.querySelector("[data-pic=towns-big]").innerHTML = V.towns_big || "";
    document.querySelector("[data-t=why2]").open = false;
    const pick = scale => {
      bar.querySelectorAll("[data-scale]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.scale === scale)));
      tracts.hidden = scale !== "tracts"; towns.hidden = scale !== "towns";
      document.querySelectorAll("[data-scaleline]").forEach(p => { p.hidden = !q.towns || p.dataset.scaleline !== scale; });
      if (scale === "tracts") { if (teamExplorer) teamExplorer.map.invalidateSize(); return; }
      if (!q.towns) return;
      if (townArea) { townArea.map.invalidateSize(); return; }
      towns.innerHTML = `<p class="load" role="status">Loading the cities and towns…</p>`;
      getJSON(`data/${q.towns}`).then(doc => { towns.innerHTML = ""; townArea = new window.TownArea.TownArea(towns, doc, window.DataDocs.townCards(), cardsHtml); })
        .catch(e => { towns.innerHTML = `<p class="load error">The page could not load the cities and towns. Reload the page; if it still fails, email your instructor.</p>`; throw e; });
    };
    bar.querySelectorAll("[data-scale]").forEach(b => b.onclick = () => pick(b.dataset.scale));
    pick("tracts");
  }

  /** "About these data" cards, each with its kind's symbol on the title and the Geography row. */
  function cardsHtml(cards) {
    return cards.map(c => { const s = symbol(DD().kindOfCard(c));
      return `<div class="dcard"><h3>${s}${esc(c.title)}</h3><table>${c.rows.map(([h, t]) => `<tr><th scope="row">${esc(h)}</th><td>${h === "Geography" ? s : ""}${esc(t)}</td></tr>`).join("")}</table></div>`; }).join("");
  }

  function showCards() {
    document.getElementById("tp-cards").hidden = false; document.getElementById("tp-team").hidden = true;
    document.title = PAGE_TITLE;
  }

  /* ---------------- tabs and addresses ---------------- */
  function showTab(name, fromLink) {
    const team = T.teamById(name);
    const tab = team ? "term-project" : TABS.includes(name) ? name : "exercise-4";
    document.querySelectorAll("[data-tab]").forEach(a => a.setAttribute("aria-selected", String(a.dataset.tab === tab)));
    document.querySelectorAll("[data-panel]").forEach(p => { p.hidden = !p.dataset.panel.split(" ").includes(tab); });
    if (tab !== "term-project") { document.title = PAGE_TITLE; if (window.explorer) window.explorer.map.invalidateSize(); return; }
    if (team) showTeam(team, fromLink); else showCards();
  }

  function route() {
    const h = location.hash.replace(/^#/, "");
    if (h.startsWith("map=")) { const st = C.decodeState(h) || {}; return showTab(st.tab || "exercise-4", st); }
    showTab(h);
  }

  async function boot() {
    const status = document.getElementById("load-status");
    renderCards();
    try {
      const [tracts, routes, index, sources] = await Promise.all(["data/tracts.json", "data/routes.json", "data/openspace/index.json", "data/sources.json"].map(getJSON));
      osIndex = index; data = { tracts: tracts.features, routes: routes.features, sources };
      // Margins of error for the two Census layers (her ruling 2026-11-18). Optional: without the file
      // the page still works and those layers say there is no margin for the tract.
      const moe = await getJSON("data/acs-moe.json").catch(() => null);
      if (moe) data.tracts.forEach(f => Object.assign(f.properties, moe.values[f.properties.TractFIPS] || {}));
      const fromLink = C.decodeState(location.hash);
      // A team page's link restores into that team's explorer, not the Exercise 4 / midterm one.
      const forMain = fromLink && !T.teamById(fromLink.tab) ? fromLink : null;
      window.explorer = new window.Explorer(document.getElementById("explorer"), { tracts: data.tracts, routes: data.routes, sources, openSpaceFor }, forMain, { opening: window.ExplorerDefaults });
      status.remove();
    } catch (e) {
      status.textContent = "The page could not load the map data. Reload the page; if it still fails, email your instructor.";
      status.classList.add("error");
      throw e;
    }
    document.querySelectorAll("[data-tab]").forEach(a => a.addEventListener("click", ev => {
      ev.preventDefault(); history.replaceState(null, "", `#${a.dataset.tab}`);
      if (a.dataset.tab !== "term-project") window.explorer.s.tab = a.dataset.tab;
      showTab(a.dataset.tab);
    }));
    window.addEventListener("hashchange", route);
    route();
  }

  boot();
})();
