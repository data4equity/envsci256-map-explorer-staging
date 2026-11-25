/* Term Project: the four project questions (La Colaborativa's wording, from the Canvas page
   "Teams and project questions") and the eight team pages, two per question.
   Each team page has its own address (#team-a1 … #team-d2) and opens the explorer with its
   question's layers already chosen. No DOM here, so the Node tests can read it. */
(function (root) {
  // Her ruling 2026-11-19: every team page opens on Chelsea's tracts colored by one measure, with no neighborhood
  // condition and no buffer ("Students will add these things"). miles: 0 = no buffer until a student types a
  // distance in step 5 (her ruling 2026-11-20; renumbered 2026-11-25).
  const QUESTIONS = [
    {
      show: ["routes", "parks"],
      id: "a", title: "Air Quality, Housing, and Asthma",
      text: "Asthma in Chelsea and the Healthy Homes window-replacement work: how big is the need beyond the homeowners the current grant can reach?",
      file: "term/question-a.json",
      // noMoe: the plain line a layer with no margin of error shows in the tract card and table (her 2026-11-18 ruling).
      layers: [
        { key: "CASTHMA", places: true },
        { key: "pct_renter", file: true },
        { key: "pct_owner", file: true },
        { key: "pct_built_1979_or_earlier", file: true },
        { key: "pct_renter_built_1979_or_earlier", file: true },
        { key: "pct_owner_built_1979_or_earlier", file: true },
        { key: "no2_ppb", file: true, noMoe: "EPA estimates this value with a computer model, not a survey." },
        { key: "pm25", file: true, noMoe: "EPA estimates this value with a computer model, not a survey." },
        { key: "routes", label: "Major roads (MA_major_routes) and their buffer", src: "MassGIS-MassDOT Roads, step 3" }
      ],
      start: { towns: ["Chelsea"], measure: "CASTHMA", ramp: "Purples", miles: 0 }
    },
    {
      show: ["chcs", "routes", "parks"],
      id: "b", title: "MassHealth Eligibility Changes and Healthcare Access",
      text: "New federal rules are changing who qualifies for MassHealth (Massachusetts' Medicaid program). Where in Chelsea could coverage loss concentrate, and what would that mean for primary care and safety-net clinics?",
      file: "term/question-b.json",
      // Her approval 2026-11-18: "Approve B page" (the final mockup). The page opens on Medicaid coverage with
      // no health centers; students add them in step 3 and choose the buffer distance in step 5.
      layers: [
        { key: "pct_medicaid_19_64", file: true },
        { key: "pct_noncitizen", file: true },
        { key: "pct_noncitizen_of_foreign_born", file: true },
        { key: "pct_below_poverty", file: true },
        { key: "pct_below_150fpl", file: true },
        { key: "pct_16_64_15to34h", file: true },
        { key: "ACCESS2", places: true },
        { key: "CHECKUP", places: true },
        { key: "chcs", condition: true, label: "Community health centers (CHCS_PT) and their buffer", src: "MassGIS, February 2025 · add in step 3, choose the distance in step 5" }
      ],
      start: { towns: ["Chelsea"], measure: "pct_medicaid_19_64", method: "quantile", classes: 5, ramp: "Purples", miles: 0 }
    },
    {
      show: ["parks", "stores"], green: true,
      id: "c", title: "Neighborhood Environment: Green Space and the Retail Landscape",
      text: "Chelsea's shortage of green space, La Placita (at La Colaborativa) as a gathering place, and how many liquor, tobacco, and fast-food stores are nearby, and what that means for youth vaping risk.",
      file: "term/question-c.json",
      // Her approval 2026-11-18: "Approve C page". Stores show as points over the public open-space buffer.
      layers: [
        { key: "pct_under18", file: true },
        { key: "CSMOKING", places: true },
        { key: "LPA", places: true },
        { key: "stores", label: "Stores as points: cannabis · licensed to sell cigarettes · licensed to sell vapes · liquor (package) · convenience, with each store's distance to public open space",
          src: "Massachusetts Cannabis Control Commission, Department of Revenue and Alcoholic Beverages Control Commission license lists (October–November 2026); Overture Maps Places (November 2026); placed with the U.S. Census Geocoder",
          stores: [["cannabis", "Cannabis stores"], ["cigarette", "Stores licensed to sell cigarettes"], ["vape", "Stores licensed to sell vapes"],
            ["liquor", "Liquor (package) stores"], ["convenience", "Convenience stores"]] },
        { key: "parks", label: "Parks and open space (MA_openspace) and their buffer", src: "MassGIS Protected and Recreational OpenSpace, step 3" }
      ],
      start: { towns: ["Chelsea"], measure: "pct_under18", ramp: "Greens", miles: 0 }
    },
    {
      show: ["parks", "routes"], green: true,
      id: "d", title: "Housing Conditions, Mental Health, and Teen Pregnancy",
      text: "Housing instability is a risk factor for teen pregnancy. This project traces that link: how crowded, unhealthy housing (mold, pests, poor air quality) relates to anxiety, depression, and isolation, and how Chelsea's teen pregnancy rate compares with other Massachusetts cities. The aim is to show that teen pregnancy rates are shaped by upstream factors, like housing, that act long before any individual decision.",
      file: "term/question-d.json",
      // Her approval 2026-11-18: "Use it, D approved". Opens on depression, a health outcome (her ruling 2026-11-20). The "Cities and towns" tab (towns.js) reads `towns`.
      towns: "towns/question-d-towns.json",
      layers: [
        { key: "DEPRESSION", places: true },
        { key: "MHLTH", places: true },
        { key: "LONELINESS", places: true },
        { key: "EMOTIONSPT", places: true },
        { key: "HOUSINSECU", places: true },
        { key: "SHUTUTILITY", places: true },
        { key: "pct_crowded", file: true },
        { key: "pct_renter_crowded", file: true },
        { key: "pct_built_1979_or_earlier", file: true },
        { key: "pct_renter_built_1979_or_earlier", file: true },
        { key: "pct_owner_built_1979_or_earlier", file: true }
      ],
      start: { towns: ["Chelsea"], measure: "DEPRESSION", ramp: "Oranges", miles: 0 }
    }
  ];

  const PEOPLE = {
    CASTHMA: "adults with asthma", ACCESS2: "adults 18–64 without health insurance", CHECKUP: "adults with a routine checkup in the past year",
    CSMOKING: "adults who smoke cigarettes", LPA: "adults with no leisure-time physical activity", DEPRESSION: "adults with depression",
    MHLTH: "adults with frequent mental distress", LONELINESS: "adults who feel lonely", EMOTIONSPT: "adults who lack social and emotional support",
    HOUSINSECU: "adults with housing insecurity in the past 12 months", SHUTUTILITY: "adults with a utility shut-off threat in the past 12 months",
    pct_renter: "renter-occupied homes", pct_owner: "owner-occupied homes", pct_built_1979_or_earlier: "homes built in 1979 or earlier",
    pct_renter_built_1979_or_earlier: "rented homes built in 1979 or earlier", pct_owner_built_1979_or_earlier: "owner-occupied homes built in 1979 or earlier",
    pct_medicaid_19_64: "adults 19–64 with Medicaid or other means-tested public coverage", pct_noncitizen: "residents who are not U.S. citizens",
    pct_noncitizen_of_foreign_born: "foreign-born residents who are not U.S. citizens", pct_below_poverty: "people with income below the poverty level",
    pct_below_150fpl: "people with income below 150% of the poverty level", pct_16_64_15to34h: "people 16–64 who usually worked 15 to 34 hours a week",
    pct_under18: "people under 18", pct_crowded: "crowded homes", pct_renter_crowded: "crowded rented homes",
    pct_65plus: "residents 65 and older", pct_hh_children: "households with children under 18"
  };

  function countFor(key, props, counts = {}) {
    if (key === "pct_65plus") return props.pop_65plus ?? null;
    if (key === "pct_hh_children") return props.hh_children ?? null;
    const places = props[`${key}_CrudePrev`];
    const value = places != null ? places : props[key];
    const base = places != null ? counts[key === "ACCESS2" ? "adults_18_64" : "adults"] : counts[key];
    return value == null || base == null ? null : base * value / 100;
  }

  /** Number tiles for one buffer (her pick 2026-11-25, C1): [{ big, text }]. With two buffers each row is labeled,
      so the tile text drops the buffer's name ("rows"). The measure's tile is left out when it has no count. */
  function peopleTiles(town, buffer, miles, residents, people, phrase, rows = false) {
    const number = n => Math.round(n).toLocaleString("en-US");
    const percent = v => `${v.total ? Math.round(100 * v.inside / v.total) : 0}%`;
    const where = rows ? "" : buffer.key === "both" ? " live inside both buffers" : ` live inside the ${miles}-mile ${buffer.label} buffer`;
    const tiles = [{ big: percent(residents), text: `of ${town}'s residents${where} (about ${number(residents.inside)} of ${number(residents.total)})` }];
    if (people && people.total > 0 && phrase) tiles.push({ big: percent(people), text: `of its ${phrase}${rows ? "" : " live inside it"} (about ${number(people.inside)} of ${number(people.total)})` });
    return tiles;
  }

  const TEAMS = QUESTIONS.flatMap(q => [1, 2].map(n => ({ id: `team-${q.id}${n}`, name: `Team ${q.id.toUpperCase()}${n}`, question: q })));

  /** The team for a tab name such as "team-a1", or null. */
  function teamById(id) { return TEAMS.find(t => t.id === String(id || "").toLowerCase()) || null; }

  /** Explorer state a team page opens with: its question's start, tagged with the team's tab. */
  function startState(team) { return Object.assign(JSON.parse(JSON.stringify(team.question.start)), { tab: team.id, show: [], buf: [], clip: false, condType: "none" }); }

  /** Keys the step 2 menu lists under the team's own heading (the layers read from the question's file). */
  function fileLayerKeys(question) { return question.layers.filter(l => l.file).map(l => l.key); }

  /** Step 3 layers a team page offers beyond the major roads and open space every page has. */
  function conditionLayers(question) { return question.layers.filter(l => l.condition).map(l => l.key); }

  /** Store layers a team page can show as points in step 3: [{ key, label }]. */
  function storeLayers(question) { return question.layers.filter(l => l.stores).flatMap(l => l.stores.map(([key, label]) => ({ key, label }))); }

  function showLayers(question) { return [...question.show]; }

  const api = { PEOPLE, countFor, peopleTiles, showLayers, QUESTIONS, TEAMS, teamById, startState, fileLayerKeys, conditionLayers, storeLayers };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TermTeams = api;
})(typeof self !== "undefined" ? self : this);
