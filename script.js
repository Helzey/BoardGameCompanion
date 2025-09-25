let v_gamesData = []; // Variable für die aktuelle Sammlung
let v_versionData = []; // Variable für die Objekt-Versionen
let v_resData = []; // Resultierende Daten aus Abfragen
let v_displayData = []; // anzeige Variable kann nur Grundspiele oder mit Erweiterung sein
let v_sort = "bggrating"; // Variable für die Sortierung Initial nach bggrating
let v_displayMode = "standard"; // Variable für die Anzeigeart (wie werden zB Erweiterungen angezeigt)


async function fetchBggCollection(username) {
  const params = new URLSearchParams({
    username,
    own: 1,
    stats: 1
  });
  const url = `https://boardgamegeek.com/xmlapi2/collection?${params.toString()}`;

  for (let tries = 0; tries < 10; tries++) {
    const res = await fetch(url);
    if (res.status === 202) {
      document.getElementById("status").textContent = "Daten werden vorbereitet... bitte warten.";
      await new Promise(r => setTimeout(r, 500));
      continue;
    }
    if (!res.ok) throw new Error(`Fehler: ${res.status}`);
    return await res.text();
  }
  throw new Error("BGG API antwortet nicht (zu viele 202).");
}

async function fetchVersionData(id) {
  const params = new URLSearchParams({
    id,
    versions: 1
  });
  const url = `https://boardgamegeek.com/xmlapi2/thing?${params.toString()}`;
  for (let tries = 0; tries < 20; tries++) {
    const res = await fetch(url);
    if (res.status === 202) {
      await new Promise(r => setTimeout(r, 10));
      continue;
    }
    if (!res.ok) throw new Error(`Fehler: ${res.status}`);
    return await res.text();
  }
  throw new Error("BGG API antwortet nicht (zu viele 202).");
}

function parseXml(xmlStr) {
  const parser = new DOMParser();
  return parser.parseFromString(xmlStr, "application/xml");
}

async function loadCollection() {
  const username = document.getElementById("username").value.trim();
  if (!username) {
    alert("Bitte einen Benutzernamen eingeben!");
    return;
  }
  document.getElementById("status").textContent = "Lade Sammlung...";
  document.getElementById("games").innerHTML = "";

  try {
    // Grundspiele
    const xmlText = await fetchBggCollection(username);
    const xml = parseXml(xmlText);
    const items = xml.querySelectorAll("item");
    if (items.length === 0) {
      document.getElementById("status").textContent = "Keine Spiele gefunden.";
      return;
    }

    let idAray = [];
    let allIds = "";
    let cntIds = 0;
    v_gamesData = Array.from(items).map(item => {
      const id = item.getAttribute("objectid");
      if (cntIds == 0) {
        cntIds ++;
        allIds = id;
      } else if (cntIds < 19) { // max 20 Items auf einmal
        cntIds ++;
        allIds = allIds + "," + id;
      } else {
        cntIds = 0;
        allIds = allIds + "," + id;
        idAray.push(allIds);
      }
      const ranks = {};
      item.querySelectorAll("ranks > rank").forEach(r => {
        const catName = r.getAttribute("name");
        const value = r.getAttribute("value");
        ranks[catName] = value;
      });

      return {
        id,
        name: item.querySelector("name")?.innerHTML || "Unbekannt",
        year: item.querySelector("yearpublished")?.innerHTML || "",
        rating: parseFloat(item.querySelector("stats > rating")?.getAttribute("value")) || 0,
        bggrating: parseFloat(item.querySelector("stats > rating > bayesaverage")?.getAttribute("value")) || 0,
        minPlaytime: item.querySelector("stats")?.getAttribute("minplaytime") || "?",
        maxPlaytime: item.querySelector("stats")?.getAttribute("maxplaytime") || "?",
        minPlayers: item.querySelector("stats")?.getAttribute("minplayers") || "?",
        maxPlayers: item.querySelector("stats")?.getAttribute("maxplayers") || "?",
        thumb: item.querySelector("thumbnail")?.textContent || "",
        ranks
      };
    });
    if (cntIds != 0) {idAray.push(allIds);} // Übrigen Werte auch mitnehmen!

    v_versionData = [];
    for (const idList of idAray) {
      const versionXmlText = await fetchVersionData(idList);
      const versionXml = parseXml(versionXmlText);
      const versionItems = versionXml.querySelectorAll("items > item");

      v_versionData.push(...Array.from(versionItems).map(versionItem => {
        let verGermName;
        let verThumb;
        for (const r of versionItem.querySelectorAll("versions > item")) {
          // Prüfen, ob es ein language-Link mit value="German" gibt
          const lang = r.querySelector('link[type="language"][value="German"]');
          if (lang) {
            // Canonicalname-Element holen
            const canonical = r.querySelector("canonicalname");
            if (canonical) {
              verGermName = canonical.getAttribute("value");
              verThumb = r.querySelector("thumbnail")?.textContent;
              break;
            }
          }
        }
        return {
          verId: versionItem.getAttribute("id"),
          verType: versionItem.getAttribute("type"),
          verBaseGameId: versionItem.querySelector('link[type="boardgameexpansion"][inbound="true"]')?.getAttribute("id") || 0,
          verGermName,
          verThumb
        };
      }));
    }

    // Zusammenführen der beiden Arrays in 1 Ergebnisarray
    const mergedMap = new Map();
    // Erstes Array rein
    v_gamesData.forEach(obj => {
      mergedMap.set(obj.id, { ...obj });
    });
    // Versionsinfos hinzufügen zu Objekten
    v_versionData.forEach(obj => {
      if (mergedMap.has(obj.verId)) {
        mergedMap.set(obj.verId, { ...mergedMap.get(obj.verId), ...obj });
      }
    });
    // Erweiterungen hinzufügen zu Grundspielen
    mergedMap.forEach(obj => {
      if (obj.verType == "boardgameexpansion" && mergedMap.has(obj.verBaseGameId)) {
        const current = mergedMap.get(obj.verBaseGameId);
        if (current.Exp) {
          current.Exp.push({ ...obj });
        } else {
          current.Exp = [{ ...obj }];
        }
        mergedMap.set(obj.verBaseGameId, current);
      }
    });

    // Ergebnis als Array zurück
    v_resData = Array.from(mergedMap.values());
    // Erweiterungen rausfiltern
    v_resData = v_resData.filter(g => {return g.verType == "boardgame"});

    document.getElementById("status").textContent = "Gefundene Elemente: ${v_gamesData.length}";
    renderList();

  } catch (err) {
    document.getElementById("status").textContent = "Fehler: " + err.message;
  }
}

function renderList() {
  const sortBy = document.getElementById("sort").value;
  const playerFilter = parseInt(document.getElementById("playerFilter").value); // Zahl aus Filter
  const timeMinFilter = parseInt(document.getElementById("timeMinFilter").value); // Zahl aus Filter
  const timeMaxFilter = parseInt(document.getElementById("timeMaxFilter").value); // Zahl aus Filter
  const rankCategory = document.getElementById("rankCategory").value; // ausgewählte Kategorie
  const list = document.getElementById("games");
  list.innerHTML = "";

  let filtered = [...v_resData];

  // Filter nach Spielerzahl
  if (!isNaN(playerFilter)) {
    filtered = filtered.filter(g => {
      const min = parseInt(g.minPlayers) || 0;
      const max = parseInt(g.maxPlayers) || 99;
      return playerFilter >= min && playerFilter <= max;
    });
  }

  // Filter nach Min Spieldauer
  if (!isNaN(timeMinFilter)) {
    filtered = filtered.filter(g => {
      const minimum = parseInt(g.minPlaytime) || 100000;
      return timeMinFilter <= minimum;
    });
  }

  // Filter nach Max Spieldauer
  if (!isNaN(timeMaxFilter)) {
    filtered = filtered.filter(g => {
      const maximum = parseInt(g.maxPlaytime) || 0;
      return timeMaxFilter >= maximum;
    });
  }

  // Filter Kategorie-Rank
  filtered = filtered.filter(g => g.ranks[rankCategory]);

  // Sortierung
  if (sortBy === "name") {
    filtered.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sortBy === "rating") {
    filtered.sort((a, b) => b.rating - a.rating);
  } else if (sortBy === "bggrating") {
    filtered.sort((a, b) => b.bggrating - a.bggrating);
  }

  // Rendern
  filtered.forEach(g => {
    // Spieldauer Anzeige
    const playtime = (g.minPlaytime === g.maxPlaytime)
      ? g.minPlaytime
      : `${g.minPlaytime} - ${g.maxPlaytime}`;

    // Spieleranzahl Anzeige
    const players = (g.minPlayers === g.maxPlayers)
      ? g.minPlayers
      : `${g.minPlayers} - ${g.maxPlayers}`;

    const rankValue = g.ranks[rankCategory] || "–"; // ausgewählte Kategorie anzeigen
    const div = document.createElement("div");
    div.className = "game";
    div.innerHTML = `
      ${g.thumb ? `<img src="${g.verThumb ? g.verThumb : g.thumb}" alt="Cover">` : ""}
      <div class="game-details">
        <div class="game-title">
          <a href="https://boardgamegeek.com/boardgame/${g.id}" target="_blank" rel="noopener noreferrer">
            ${g.verGermName ? g.verGermName : g.name} ${g.year ? "(" + g.year + ")" : ""}
          </a>
        </div>
        
        ${Array.isArray(g.Exp) && g.Exp.length > 0 ? `
          <div class="game-expansions">
            ${g.Exp.map(exp => `
              <div class="expansion">+ 
                <a href="https://boardgamegeek.com/boardgame/${exp.id}" target="_blank" rel="noopener noreferrer">
                  ${exp.verGermName ? exp.verGermName : exp.name} ${exp.year ? "(" + exp.year + ")" : ""}
                </a>
              </div>
            `).join("")}
          </div>
        ` : ""}

        <div class="row">
          <div class="column">
            <div>Spieler: ${players}</div>
            <div>Bewertung: ${g.rating || "-"}</div>
          </div>
          <div class="column">
            <div>Dauer: ${playtime} min</div>
          </div>
          <div class="column">
            <div>BGG Bewertung: ${g.bggrating.toFixed(2) || "-"}</div>
            <div>BGG Rang: ${rankValue}</div>
          </div>
        </div>
      </div>
    `;
    list.appendChild(div);
  });

  document.getElementById("status").textContent = 
    `Gefundene Spiele: ${filtered.length} (Kategorie: ${rankCategory}${!isNaN(playerFilter) ? ", Spieler: " + playerFilter : ""})`;
}

window.onload = () => {
  const usernameInput = document.getElementById("username");

  // Sammlung direkt beim Start laden
  if (usernameInput.value.trim()) {
    loadCollection();
  }

  // Sammlung neu laden, wenn Username geändert und Enter gedrückt wird
  usernameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      loadCollection();
    }
  });

  // Sammlung neu laden, wenn Feld verlassen wird (blur)
  usernameInput.addEventListener("blur", () => {
    if (usernameInput.value.trim()) {
      loadCollection();
    }
  });
};

// Overlay schließen mit Escape
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.querySelectorAll(".overlay").forEach(o => o.classList.add("hidden"));
  }
});

// Filter Overlay
document.getElementById("filterToggle").addEventListener("click", () => {
  document.getElementById("filterOverlay").classList.remove("hidden");
});
document.getElementById("filterClose").addEventListener("click", () => {
  document.getElementById("filterOverlay").classList.add("hidden");
});

// Sort Overlay
document.getElementById("sortToggle").addEventListener("click", () => {
  document.getElementById("sortOverlay").classList.remove("hidden");
});
document.getElementById("sortClose").addEventListener("click", () => {
  document.getElementById("sortOverlay").classList.add("hidden");
});

// Schließen beim Klick außerhalb
window.addEventListener("click", (event) => {
  if (event.target.classList.contains("overlay")) {
    event.target.classList.add("hidden");
  }
});
