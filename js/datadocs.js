/* "About these data": the cards each team page shows in its fold-out (instructor's pick 2026-11-18,
   Option A). One card per layer on the page, in the rows of the Canvas data reference cards.
   Sources for the wording: EPA EJScreen Technical Documentation v2.3 (2024-07-31); EPA lead pages
   (1978 ban); the Census Bureau's ACS table shells; the Canvas data reference cards (PLACES,
   MassGIS roads and open space). No DOM here, so the Node tests can read it. */
(function (root) {
  const ACS_PUB = "U.S. Census Bureau, American Community Survey (ACS). We accessed it through IPUMS NHGIS (National Historical Geographic Information System), University of Minnesota.";
  const ACS_LIC = "Public domain (U.S. Census Bureau). Credit: U.S. Census Bureau, American Community Survey; accessed through IPUMS NHGIS, University of Minnesota, www.nhgis.org.";
  const ACS_YEARS = ["Years", "2019–2023 five-year estimates"];
  const MA_TRACTS = ["Geography", "Census tract, all of Massachusetts"];
  const EJ_LIC = ["License and credit", "U.S. Environmental Protection Agency, EJScreen; archived copy, Harvard Dataverse, doi:10.7910/DVN/RLR5AX."];
  // "Margin of error" row on every Census card (her approval 2026-11-18, word for word).
  const ACS_MOE = ["Margin of error", "The ACS asks a sample of households, so every number is an estimate. The margin of error gives the likely distance between the estimate and the true value. "
    + "The tract card and the tract table show it as a 95% confidence interval: the range most likely to hold the true value. "
    + "The Census Bureau publishes margins of error at 90% confidence; the page converts them to 95% so they match the CDC PLACES layers. "
    + "When the page combines Census numbers into a percent, it computes the margin of error with the Census Bureau's formulas. "
    + "A wide range means a less certain estimate, often because few people in the tract are in the group."];
  const WHY_1979 = "In 1978, the federal government banned the sale of lead-based paint for use in homes (U.S. Environmental Protection Agency, EPA). "
    + "So a home built before 1978 is more likely to have lead paint. The Census Bureau groups homes by decade (1970–1979, 1960–1969, and so on), "
    + "so it cannot separate 1977 from 1978 or 1979. “1979 or earlier” is the closest cutoff in the data. It also counts homes built in 1978 and 1979, after the ban.";

  /** Cards that are not PLACES measures, by id. `layers` lists the layer keys a card explains. */
  const CARDS = {
    tenure: { layers: ["pct_renter", "pct_owner"], title: "Renter-occupied homes, % · Owner-occupied homes, %", rows: [
      ["What it measures", "Of the occupied homes in each census tract, the percent rented and the percent lived in by their owner. The two add up to 100."],
      ["Publisher", ACS_PUB], ACS_YEARS, MA_TRACTS,
      ["How the page gets the number", "ACS Table B25003 (Tenure) counts occupied homes, owner-occupied homes and renter-occupied homes. The page divides each by the total."],
      ACS_MOE,
      ["License and credit", ACS_LIC]] },
    built1979: { layers: ["pct_built_1979_or_earlier"], title: "Homes built in 1979 or earlier, %", rows: [
      ["What it measures", "The percent of all homes in each census tract, occupied or empty, in buildings built in 1979 or earlier."],
      ["Publisher", ACS_PUB], ACS_YEARS, MA_TRACTS,
      ["Why 1979?", WHY_1979],
      ["How the page gets the number", "ACS Table B25034 (Year Structure Built) counts homes in 10 groups, from “Built 2020 or later” to “Built 1939 or earlier.” The page adds the five groups from 1970–1979 back to 1939 or earlier and divides by all homes."],
      ["Keep in mind", "The year comes from what people answering the survey report about their building."],
      ACS_MOE,
      ["License and credit", ACS_LIC]] },
    built1979ByTenure: { layers: ["pct_renter_built_1979_or_earlier", "pct_owner_built_1979_or_earlier"],
      title: "Rented homes built in 1979 or earlier, % · Owner-occupied homes built in 1979 or earlier, %", rows: [
      ["What it measures", "Of the rented homes in each census tract, the percent built in 1979 or earlier. The second layer does the same for homes lived in by their owner."],
      ["Publisher", ACS_PUB], ACS_YEARS, MA_TRACTS,
      ["Why 1979?", "The same reason as for all homes: lead-based paint was banned for use in homes in 1978, and the Census Bureau groups homes by decade, so “1979 or earlier” is the closest cutoff."],
      ["How the page gets the number", "ACS Table B25036 (Tenure by Year Structure Built) splits occupied homes into owner-occupied and renter-occupied, then counts each by the same 10 year-built groups. For rented homes, the page adds the five groups from 1970–1979 back to 1939 or earlier and divides by all rented homes. It does the same for owner-occupied homes."],
      ["Keep in mind", "Each percent is out of its own group: the rented-homes layer is a share of rented homes, not of all homes. Empty homes are not counted in either layer."],
      ACS_MOE,
      ["License and credit", ACS_LIC]] },
    // Question D (her approval 2026-11-18: "i approve your about for overcrowding"; page: "Use it, D approved").
    crowding: { layers: ["pct_crowded", "pct_renter_crowded"], title: "Crowded homes, % · Crowded rented homes, %", rows: [
      ["What it measures", "Of the occupied homes in each census tract, the percent with more than one person per room. The second layer does the same for rented homes only."],
      ["Publisher", ACS_PUB],
      ACS_YEARS,
      MA_TRACTS,
      ["How the page gets the number", "ACS Table B25014 (Tenure by Occupants per Room) divides the number of people living in each home by its number of rooms. It counts owner-occupied and renter-occupied homes in five groups, from “0.50 or less” to “2.01 or more” occupants per room. The page adds the three groups above 1.00 (1.01 to 1.50, 1.51 to 2.00, and 2.01 or more) and divides by all occupied homes. For rented homes, it adds the three renter groups above 1.00 and divides by all rented homes."],
      ["Keep in mind", "“Rooms” are whole rooms used for living: living rooms, dining rooms, kitchens and bedrooms count; bathrooms, halls, open porches and unfinished basements do not count as rooms. The Census Bureau counts “1.01 or more occupants per room” as one of its “selected conditions” for judging housing quality. The rented-homes layer is a share of rented homes, not of all homes."],
      ACS_MOE,
      ["License and credit", ACS_LIC]] },
    no2: { layers: ["no2_ppb"], title: "Nitrogen dioxide (NO2) in the air, ppb", rows: [
      ["What it measures", "The average amount of nitrogen dioxide gas in the air over a year, in parts per billion (ppb)."],
      ["Publisher", "U.S. Environmental Protection Agency (EPA), EJScreen 2024 (Version 2.3), using data from NASA's Health and Air Quality Applied Sciences Team. The file is an archived copy kept on Harvard Dataverse."],
      ["Years", "2020"], MA_TRACTS,
      ["How it is made", "Estimated from satellite measurements and computer models on a grid of squares about 1 kilometer across, then averaged over each area. It is not a reading from an air monitor in each tract."],
      ["Keep in mind", "EPA calls this a screening measure and says it is not used for EPA standards or regulations."], EJ_LIC] },
    pm25: { layers: ["pm25"], title: "Fine particulate matter (PM2.5) in the air, µg/m³", rows: [
      ["What it measures", "The average amount of tiny particles in the air (2.5 micrometers across or smaller) over a year, in micrograms per cubic meter (µg/m³)."],
      ["Publisher", "U.S. Environmental Protection Agency (EPA), EJScreen 2024 (Version 2.3), from EPA's Office of Air Quality Planning and Standards. The file is an archived copy kept on Harvard Dataverse."],
      ["Years", "2020"], MA_TRACTS,
      ["How it is made", "EPA combines readings from air monitors with an air-quality computer model, and reports one value for each census tract."],
      ["Keep in mind", "EPA says this measure does not tell you whether an area meets the national air-quality standard for PM2.5."], EJ_LIC] },
    // Question B (her approval 2026-11-18, "Approve B page"): word for word from the approved mockup.
    medicaid: { layers: ["pct_medicaid_19_64"], title: "Adults 19–64 with Medicaid or other means-tested public coverage, %", rows: [
      ["What it measures", "Of the people aged 19 to 64 in each census tract, the percent covered by Medicaid or another public program that depends on income (in Massachusetts, Medicaid is called MassHealth)."],
      ["Publisher", ACS_PUB],
      ACS_YEARS,
      MA_TRACTS,
      ["How the page gets the number", "ACS Table C27007 (Medicaid/Means-Tested Public Coverage by Sex by Age) counts people with and without this coverage by sex and age group. The page adds men and women aged 19 to 64 with coverage and divides by all men and women aged 19 to 64."],
      ["Why ages 19 to 64?", "The table groups ages as under 19, 19 to 64, and 65 and over, and the page cannot split those groups further. Most people 65 and over are covered by Medicare, so the page uses the 19-to-64 group."],
      ["Keep in mind", "People answer about their own coverage. The table counts people not living in institutions and not on active military duty."],
      ACS_MOE,
      ["License and credit", ACS_LIC]] },
    citizenship: { layers: ["pct_noncitizen", "pct_noncitizen_of_foreign_born"], title: "Not a U.S. citizen, % of all people · Noncitizens, % of people born outside the U.S.", rows: [
      ["What it measures", "The percent of all people in each census tract who are not U.S. citizens. The second layer looks only at people born outside the United States and gives the percent who are not U.S. citizens; the rest became citizens by naturalization."],
      ["Publisher", ACS_PUB],
      ACS_YEARS,
      MA_TRACTS,
      ["How the page gets the number", "ACS Table B05001 (Nativity and Citizenship Status in the United States) counts five groups: born in the U.S.; born in Puerto Rico or a U.S. Island Area; born abroad to American parents; citizens by naturalization; and not a U.S. citizen. For the first layer, the page divides noncitizens by all people. For the second, it divides noncitizens by everyone born outside the U.S. (citizens by naturalization plus noncitizens). In 21 Massachusetts tracts the survey found no one born outside the U.S., so the second layer has no value there."],
      ["Who counts as a citizen?", "People born in Puerto Rico or another U.S. territory, and people born abroad to American parents, are U.S. citizens from birth, so they are not counted as foreign-born. The ACS asks only whether a person is a U.S. citizen. It does not ask about immigration status: people with a green card (lawful permanent residents) answer “not a U.S. citizen.”"],
      ["Keep in mind", "“Noncitizen” covers many immigration statuses, including green card holders, refugees, people on student visas, and others. The October 2026 federal change affects only some of these groups, and the Census survey cannot tell which."],
      ACS_MOE,
      ["License and credit", ACS_LIC]] },
    poverty: { layers: ["pct_below_poverty", "pct_below_150fpl"], title: "Income below the poverty level, % · Income below 150% of the poverty level, %", rows: [
      ["What it measures", "The percent of people in each census tract whose family income in the past 12 months was below the poverty level. The second layer gives the percent below 150% of the poverty level."],
      ["What “below the poverty level” and “below 150%” mean", "The poverty level is a yearly income line the federal government sets for each family size. In 2023 it was $30,900 for a family of two adults and two children. “Below the poverty level” means a family’s income is under that line. “Below 150%” means under one and a half times the line: $46,350 for that family. Everyone below the poverty level is also counted in the below-150% layer."],
      ["Publisher", ACS_PUB],
      ACS_YEARS,
      MA_TRACTS,
      ["How the page gets the number", "Below the poverty level: ACS Table B17001 (Poverty Status in the Past 12 Months by Sex by Age) counts people below the poverty level and people at or above it. The page divides the number below by everyone in the table. Below 150%: ACS Table C17002 (Ratio of Income to Poverty Level in the Past 12 Months) counts people in income steps. The page adds the four steps under 150% and divides by everyone in the table."],
      ["Why these two layers, and why 150%?", "MassHealth’s income limit for most adults is 133% of the poverty level, and MassHealth subtracts 5 percentage points from income, so in practice the limit is about 138%. The Census Bureau does not publish each family’s exact income compared with the poverty level. It groups people into steps: under 50%, 50–99%, 100–124%, 125–149%, 150–184%, 185–199%, and 200% or more. 138% falls inside the 125–149% step, so no Census layer matches it exactly. The two layers sit on either side of it: below the poverty level counts fewer people than the limit covers, and below 150% also counts some people just above it (from 138% to 149%). Choose the one that fits your question, and say why. Programs set income limits with the poverty guidelines from the U.S. Department of Health and Human Services (HHS); the Census Bureau measures with its own poverty thresholds. The two are close but not the same."],
      ["Keep in mind", "Both tables count only the people the Census Bureau calls “people for whom poverty status is determined,” so the count leaves out some people, such as those living in institutions. The layers count everyone, not only people on MassHealth. *Dollar amounts: U.S. Census Bureau, Poverty Thresholds for 2023, two adults and two children; the line is different for other family sizes, and the ACS uses the line for the year of each family's answer."],
      ACS_MOE,
      ["License and credit", ACS_LIC]] },
    hours15to34: { layers: ["pct_16_64_15to34h"], title: "People 16–64 who usually worked 15 to 34 hours a week, %", rows: [
      ["What it measures", "Of the people aged 16 to 64 in each census tract, the percent who worked in the past 12 months and usually worked 15 to 34 hours a week in their weeks of work."],
      ["Publisher", ACS_PUB],
      ACS_YEARS,
      MA_TRACTS,
      ["How the page gets the number", "ACS Table B23022 counts people 16 to 64 by sex, whether they worked in the past 12 months, the hours they usually worked each week (35 or more, 15 to 34, 1 to 14) and their weeks of work. The page adds men and women who usually worked 15 to 34 hours a week and divides by all people 16 to 64."],
      ["Why 15 to 34 hours?", "Beginning in January 2027, a new federal rule requires many adults aged 19 to 64 who get MassHealth to show 80 hours a month of work, community service, a work program, or school (at least half-time), unless they are exempt (U.S. Centers for Medicare & Medicaid Services). 80 hours a month is about 18.5 hours a week. The Census Bureau groups the hours people usually work each week into three steps: 1 to 14, 15 to 34, and 35 or more. 18.5 hours falls inside the 15-to-34 step, so this layer shows where people work part-time hours around that line. It cannot tell who works fewer than 18.5 hours a week and who works longer hours."],
      ["Keep in mind", "The hours are what people usually worked in the weeks they worked over the past 12 months, not in any one month, and some people worked only part of the year. The table covers ages 16 to 64, so it includes teenagers aged 16 to 18 and people the rule exempts, such as parents of young children. The layer counts everyone, not only people on MassHealth."],
      ACS_MOE,
      ["License and credit", ACS_LIC]] },
    chcs: { layers: ["chcs"], title: "Community health centers (CHCS_PT)", rows: [
      ["What it measures", "Where community health centers are in Massachusetts: centers that provide primary, dental or eye care, or do administrative work, as listed by the Massachusetts League of Community Health Centers in December 2024."],
      ["Publisher", "MassGIS (Bureau of Geographic Information), from the Massachusetts League of Community Health Centers' Find a Community Health Center tool"],
      ["Geography", "Points (one per center address), all of Massachusetts"],
      ["Keep in mind", "Each point is a site, so one organization can have several points. The list does not include every clinic, such as hospital clinics that are not community health centers. Services and hours change; MassGIS says to check with each center."],
      ["License and credit", "MassGIS (Bureau of Geographic Information), Commonwealth of Massachusetts. Published February 20, 2025."]] },
    // Question C (her approval 2026-11-18, "Approve C page"; the liquor card's last sentence approved the same day):
    // word for word from approved-question-c-cards.json. The four store cards all explain the one "stores" layer.
    under18: { layers: ["pct_under18"], title: "People under 18, %", rows: [
      ["What it measures", "The percent of all people living in each census tract who are under 18 years old."],
      ["Publisher", ACS_PUB],
      ACS_YEARS,
      MA_TRACTS,
      ["How the page gets the number", "ACS Table B01001 (Sex by Age) counts people by sex in 23 age groups. The page adds the four groups under 18 (under 5, 5 to 9, 10 to 14, and 15 to 17) for males and for females, and divides by the total population."],
      ACS_MOE, // her ruling 2026-11-19: "Yes, use shared row" (replaces the approved range sentence)
      ["License and credit", ACS_LIC]] },
    cannabis: { layers: ["stores"], title: "Cannabis stores", rows: [
      ["What it measures", "Where each licensed adult-use cannabis (marijuana) store is, as a point on the map."],
      ["Publisher", "Massachusetts Cannabis Control Commission, open data: list of all licenses"],
      ["Date", "List downloaded November 18, 2026. Counts stores with an active license that are already open for business."],
      ["Geography", "Points (store addresses), all of Massachusetts"],
      ["How it is made", "The page placed each store on the map from its street address with the U.S. Census Bureau's address-matching tool (the Census Geocoder). Step 4's buffer shows which stores are within the distance you choose of public open space, and the store table gives each store's distance to the nearest one, measured to its edge."],
      ["Keep in mind", "The Commission says licensees report these data themselves. A license list shows who holds a license, not who is selling today: a store can hold a license and be closed, or open before the next list update. Most stores licensed to sell cigarettes and vapes in Chelsea are corner stores, markets, liquor stores, gas stations, dollar stores and a supermarket, not specialty shops, so the same store can appear in several layers. A few addresses could not be matched to a place on the map, so a few stores may be absent from the map."],
      ["License and credit", "Public record. Massachusetts Cannabis Control Commission, Open Data Catalog."]] },
    cigaretteVape: { layers: ["stores"], title: "Stores licensed to sell cigarettes · Stores licensed to sell vapes (e-cigarettes)", rows: [
      ["What it measures", "Where each store with a state license to sell cigarettes is, and where each store with a state license to sell vapes (electronic nicotine delivery systems) is, as points on the map. The vape list includes stores that also sell cigarettes."],
      ["Publisher", "Massachusetts Department of Revenue: cigarette retailer license list and electronic nicotine delivery systems (ENDS) retailer license list"],
      ["Date", "Licenses for October 1, 2026 to September 30, 2028; lists as of October 7, 2026"],
      ["Geography", "Points (store addresses), all of Massachusetts"],
      ["How it is made", "The page placed each store on the map from its street address with the U.S. Census Bureau's address-matching tool (the Census Geocoder). Step 4's buffer shows which stores are within the distance you choose of public open space, and the store table gives each store's distance to the nearest one, measured to its edge."],
      ["Keep in mind", "A license list shows who holds a license, not who is selling today: a store can hold a license and be closed, or open before the next list update. Most stores licensed to sell cigarettes and vapes in Chelsea are corner stores, markets, liquor stores, gas stations, dollar stores and a supermarket, not specialty shops, so the same store can appear in several layers. A few addresses could not be matched to a place on the map, so a few stores may be absent from the map."],
      ["License and credit", "Public record. Massachusetts Department of Revenue."]] },
    liquor: { layers: ["stores"], title: "Liquor (package) stores", rows: [
      ["What it measures", "Where each store with a license to sell alcohol to take away (an “off-premises” or package-store license) is, as a point on the map."],
      ["Publisher", "Massachusetts Alcoholic Beverages Control Commission (ABCC), licensee search"],
      ["Date", "Licenses with the status “Issued” on November 18, 2026"],
      ["Geography", "Points (store addresses)"],
      ["How it is made", "The ABCC list gives each store's name and town but not its street. The page found each store's street address in the Department of Revenue license lists, then the page placed each store on the map from its street address with the U.S. Census Bureau's address-matching tool (the Census Geocoder). Step 4's buffer shows which stores are within the distance you choose of public open space, and the store table gives each store's distance to the nearest one, measured to its edge."],
      ["Keep in mind", "A license list shows who holds a license, not who is selling today: a store can hold a license and be closed, or open before the next list update. Most stores licensed to sell cigarettes and vapes in Chelsea are corner stores, markets, liquor stores, gas stations, dollar stores and a supermarket, not specialty shops, so the same store can appear in several layers. A few addresses could not be matched to a place on the map, so a few stores may be absent from the map. The ABCC list does not give street addresses, so stores were placed by matching their names to the Department of Revenue lists and Overture Maps. About 3 in 10 licenses statewide could not be matched and are not on the map; in Chelsea, 1 of 17 is absent from the map."],
      ["License and credit", "Public record. Massachusetts Alcoholic Beverages Control Commission."]] },
    convenience: { layers: ["stores"], title: "Convenience stores", rows: [
      ["What it measures", "Where each convenience store is, as a point on the map."],
      ["Publisher", "Overture Maps Foundation, Places (an open map of businesses and other places, built from several companies' data)"],
      ["Date", "Release of November 18, 2026"],
      ["Geography", "Points (store locations), all of Massachusetts"],
      ["How it is made", "Overture labels each place with a category. The page keeps places labeled “convenience store,” leaves out places marked closed and places Overture is less sure exist, and keeps one store per address."],
      ["Keep in mind", "Overture is built from online listings, so it can miss small corner stores or still list a closed store. There is no government list of convenience stores in Massachusetts."],
      ["License and credit", "Overture Maps Foundation, Places, release 2026-11-18.0. Community Data License Agreement – Permissive 2.0 and other open licenses; credit Overture Maps Foundation."]] },
    routes: { layers: ["routes"], title: "Major roads (MA_major_routes)", rows: [
      ["What it measures", "Where major roads run: Interstate, U.S. and state routes."],
      ["Publisher", "MassGIS (Bureau of Geographic Information), from Massachusetts Department of Transportation (MassDOT) data"],
      ["Geography", "Lines (road centerlines), all of Massachusetts"],
      ["License and credit", "Public record. MassGIS (Bureau of Geographic Information), Commonwealth of Massachusetts."]] },
    parks: { layers: ["parks"], title: "Parks and open space (MA_openspace)", rows: [
      ["What it measures", "Where protected and recreational open space is in Massachusetts: parks, conservation land, and similar land, with who may legally use it."],
      ["Publisher", "MassGIS (Bureau of Geographic Information)"],
      ["Geography", "Polygons (areas of land), all of Massachusetts"],
      ["Keep in mind", "PUB_ACCESS is legal public access: Y = open to the public, N = not open, L = limited (membership only), X = unknown. It describes legal access, not distance or ease of travel."],
      ["License and credit", "Public record. MassGIS (Bureau of Geographic Information), Commonwealth of Massachusetts."]] }
  };

  /** A card for one CDC PLACES measure, worded like the Canvas data reference card. */
  function placesCard(key, measure) {
    return { layers: [key], title: `${measure.label}, %`, rows: [
      ["What it measures", `${measure.label}, as a percent for each census tract. It is a model-based estimate.`],
      ["Publisher", "Centers for Disease Control and Prevention (CDC), PLACES"],
      ["Release and years", `2025 release. Health measures from the ${measure.year} Behavioral Risk Factor Surveillance System (BRFSS), a national telephone survey; CDC built the tract estimates with 2019–2023 American Community Survey (ACS) data and 2020 Census population.`],
      MA_TRACTS,
      ["Keep in mind", "Each value is an estimate with a 95 percent confidence interval, shown in the tract card and the tract table."],
      ["License and credit", "Public domain. Centers for Disease Control and Prevention, Division of Population Health."]] };
  }

  /** The cards for a question's team page, in the order its layers are listed, each card once. */
  function cardsFor(question, places) {
    const out = [];
    for (const l of question.layers) {
      if (out.some(c => c.layers.includes(l.key))) continue;
      if (l.places) out.push(placesCard(l.key, places[l.key]));
      else out.push(...Object.values(CARDS).filter(c => c.layers.includes(l.key))); // the store layer has four cards
    }
    return out;
  }

  /** Question D's "Cities and towns" tab: its own cards (approved word for word, 2026-11-18). The town housing layers
      reuse the crowding and age-of-homes cards with Geography changed to "City or town, all of Massachusetts". */
  const TOWN_ONLY = {
    teen: { title: "Teen birth rate by city and town", rows: [
      ["What it measures", "Births to residents aged 15 to 19, per 1,000 females aged 15 to 19, for each city and town. Ten years (2013 through 2022) are combined into one rate."],
      ["Publisher", "Massachusetts Department of Public Health (DPH), Registry of Vital Records and Statistics: Birth Outcomes Data of Massachusetts Residents"],
      ["Years", "All ten years from 2013 to 2022, pooled into one rate. DPH marks 2022 as preliminary."],
      ["Geography", "City or town, all of Massachusetts. DPH does not publish teen births by census tract."],
      ["How the page gets the number", "From DPH’s “Community Details” data download: Birthing Person’s Age Group, 15 to 19 years, rate of live births. The page shows DPH’s rate as published and does not recalculate it."],
      ["Keep in mind", "DPH hides any count of 1 to 4 births (“Small Population”), so those towns are hatched on the map. 31 towns are not listed in the file at all. Ten years are combined so more towns have enough births to show a rate, but a rate built on 5 to 9 births can still change a lot from one period to the next. Compare a town with other towns or with the state rate, never with the census-tract layers."],
      ["License and credit", "Massachusetts Department of Public Health, Registry of Vital Records and Statistics, Birth Outcomes Data of Massachusetts Residents (data updated April 2024). Public record of the Commonwealth of Massachusetts, shown here for teaching under the Mass.gov Terms of Use."]] },
    cdcCities: { title: "CDC measures for cities", rows: [
      ["What it measures", "The same six CDC measures as the census-tract map, estimated for a whole city instead of one tract."],
      ["Publisher", "Centers for Disease Control and Prevention (CDC), PLACES, Place Data"],
      ["Release and years", "2025 release. Health measures from the 2023 Behavioral Risk Factor Surveillance System (BRFSS), a national telephone survey."],
      ["Geography", "The 58 Massachusetts cities in CDC's city-level release. CDC does not publish the other 293 towns."],
      ["Keep in mind", "Each value is a model-based estimate with a 95 percent confidence interval. Compare a city with other cities, not with the tract map."],
      ["License and credit", "Public domain. Centers for Disease Control and Prevention, Division of Population Health."]] }
  };
  function townCards() {
    const asTown = c => ({ title: c.title, rows: c.rows.map(([k, v]) => [k, k === "Geography" ? "City or town, all of Massachusetts" : v]) });
    return [TOWN_ONLY.teen, asTown(CARDS.crowding), asTown(CARDS.built1979), asTown(CARDS.built1979ByTenure), TOWN_ONLY.cdcCities];
  }

  /** Symbols for what kind of map a layer or card is (her pick 2026-11-19: "Build all five"). tracts and town use
      real-data pictures from data/visuals.json; the others are drawn here. */
  const KINDS = {
    tracts: "census tracts", town: "whole city or town", points: "points (places)", line: "roads", area: "parks and open space"
  };
  const SYMBOL_SVG = {
    points: '<svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true"><rect x="3" y="4" width="6" height="6" fill="#c2185b"/><rect x="13" y="9" width="6" height="6" fill="#c2185b"/><circle cx="7" cy="17" r="3" fill="#5b2a86"/></svg>',
    line: '<svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true"><path d="M2 19 C8 15 9 8 20 3" fill="none" stroke="#1d2522" stroke-width="3"/><path d="M2 14 C7 11 8 4 15 1 M7 22 C12 19 14 12 22 8" fill="none" stroke="#ea580c" stroke-width="1.2"/></svg>',
    area: '<svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true"><path d="M4 6 L14 3 L19 10 L13 19 L5 16 Z" fill="#7cb87f" stroke="#2f7d32"/></svg>'
  };
  /** A team-page layer's kind: tract layers (PLACES and the question's file), points, roads, or parks. */
  function kindOfLayer(l) {
    if (l.places || l.file) return "tracts";
    if (l.stores || l.key === "chcs") return "points";
    return l.key === "routes" ? "line" : l.key === "parks" ? "area" : null;
  }
  /** A card's kind, read from its Geography row. */
  function kindOfCard(card) {
    const g = (card.rows.find(r => r[0] === "Geography") || [, ""])[1];
    if (/^Census tract/.test(g)) return "tracts";
    if (/^City or town|cities in CDC's city-level release/.test(g)) return "town";
    if (/^Points/.test(g)) return "points";
    if (/^Lines/.test(g)) return "line";
    if (/^Polygons/.test(g)) return "area";
    return null;
  }

  const api = { CARDS, placesCard, cardsFor, townCards, KINDS, SYMBOL_SVG, kindOfLayer, kindOfCard };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DataDocs = api;
})(typeof self !== "undefined" ? self : this);
