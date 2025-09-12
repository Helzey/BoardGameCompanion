let gamesData = []; // globale Variable für die aktuelle Sammlung

async function fetchBggCollection(username) {
  const params = new URLSearchParams({
    username,
    own: 1,
    stats: 1
  });
  // Erweiterungen ausschließen?
  // subtype: "boardgame",
  // excludesubtype: "boardgameexpansion"
   const url = `https://boardgamegeek.com/xmlapi2/collection?${params.toString()}`;

  for (let tries = 0; tries < 10; tries++) {
    const res = await fetch(url);
    if (res.status === 202) {
      document.getElementById("status").textContent = "Daten werden vorbereitet... bitte warten.";
      await new Promise(r => setTimeout(r, 4000));
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
    const xmlText = await fetchBggCollection(username);
    const xml = parseXml(xmlText);

    const items = xml.querySelectorAll("item");
    if (items.length === 0) {
      document.getElementById("status").textContent = "Keine Spiele gefunden.";
      return;
    }

    // Array aus den Items bauen
    gamesData = Array.from(items).map(item => {
      const ranks = {};
      item.querySelectorAll("ranks > rank").forEach(r => {
        const catName = r.getAttribute("name");
        const value = r.getAttribute("value");
        ranks[catName] = value;
      });

      return {
        id: item.getAttribute("objectid"),
        name: item.querySelector("name")?.innerHTML || "Unbekannt",
        year: item.querySelector("yearpublished")?.innerHTML || "",
        rating: parseFloat(item.querySelector("stats > rating")?.getAttribute("value")) || 0,
        bggrating: parseFloat(item.querySelector("stats > rating > bayesaverage")?.getAttribute("value")).toFixed(2) || "",
        minPlaytime: item.querySelector("stats")?.getAttribute("minplaytime") || "?",
        maxPlaytime: item.querySelector("stats")?.getAttribute("maxplaytime") || "?",
        minPlayers: item.querySelector("stats")?.getAttribute("minplayers") || "?",
        maxPlayers: item.querySelector("stats")?.getAttribute("maxplayers") || "?",
        thumb: item.querySelector("thumbnail")?.textContent || "",
        ranks
      };
    });

    document.getElementById("status").textContent = `Gefundene Spiele: ${gamesData.length}`;
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

  let filtered = [...gamesData];

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
  } // TODO: Warum geht das nicht?
   else if (sortBy === "time") {
    filtered.sort((a, b) => parseInt(a.minPlaytime) - parseInt(b.minPlaytime));
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
      ${g.thumb ? `<img src="${g.thumb}" alt="Cover">` : ""}
      <div class="game-details">
        <div class="game-title">
          <a href="https://boardgamegeek.com/boardgame/${g.id}" target="_blank" rel="noopener noreferrer">
            ${g.name} ${g.year ? "(" + g.year + ")" : ""}
          </a>
        </div>

        <div class="row">
          <div class="column">
            <div>Spieler: ${players}</div>
            <div>Bewertung: ${g.rating || "-"}</div>
          </div>
          <div class="column">
            <div>Dauer: ${playtime} min</div>
          </div>
          <div class="column">
            <div>BGG Bewertung: ${g.bggrating || "-"}</div>
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
  usernameInput.addEventListener("keypress", (e) => {
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
