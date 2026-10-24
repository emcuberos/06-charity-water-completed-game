/* ============================================================
   THE WATERFINDER
   A student project inspired by charity: water's mission.

   Minesweeper rules, with one difference: you aren't clearing the
   board, you're digging a well. A narrow entry shaft cuts down
   through the clay at the top, and from where it ends you drill
   toward a single wellhead at the bottom. You can only dig tiles
   touching what you've already dug, so when a branch runs into
   contamination you have to back up and try another way.

   A dug tile shows how many contaminated tiles touch it.
   Contamination stays hidden until the round ends.

   NO GUESSING: before you see a board, a solver plays it using
   logic alone. If logic can't reach the wellhead, the board is
   thrown away and another is built. A board is also thrown away
   if the opening leaves you too close to the wellhead.
   ============================================================ */

/* ---------- Page elements ---------- */
const boardEl = document.getElementById("board");
const timerEl = document.getElementById("timer");
const levelNameEl = document.getElementById("levelName");
const milestoneMessageEl = document.getElementById("milestoneMessage");
const muteBtn = document.getElementById("muteBtn");
const tabsEl = document.getElementById("levelTabs");
const levelControlsEl = document.getElementById("levelControls");
const startGameButtonEl = document.getElementById("startGameButton");
const pumpEl = document.getElementById("pump");
const connectorEl = document.getElementById("wellConnector");
const overlayEl = document.getElementById("overlay");
const overlayTitleEl = document.getElementById("overlayTitle");
const overlayTextEl = document.getElementById("overlayText");
const overlayTimeEl = document.getElementById("overlayTime");
const overlayLearnEl = document.getElementById("overlayLearn");
const overlayLearnTextEl = document.getElementById("overlayLearnText");
const overlayButtonsEl = document.getElementById("overlayButtons");
const overlayLinkEl = document.getElementById("overlayLink");
const overlayCloseEl = document.getElementById("overlayClose");
const overlayCardEl = document.querySelector(".overlay-card");
const subscribeSectionEl = document.querySelector(".subscribe");
const isMobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(
  navigator.userAgent
);
const hasTouchEmulation = navigator.maxTouchPoints > 0 && window.matchMedia(
  "(max-width: 1280px)"
).matches;
const hasCoarsePointer =
  isMobileUserAgent ||
  window.matchMedia("(pointer: coarse)").matches ||
  hasTouchEmulation;

const digSound = new Audio("dig.mp3");
digSound.preload = "auto";
digSound.load();
digSound.volume = 0.45;
const loseSound = new Audio("lose.mp3");
loseSound.preload = "auto";
loseSound.load();
loseSound.volume = 0.7;
const waterSound = new Audio("water.mp3");
waterSound.preload = "auto";
waterSound.load();
waterSound.volume = 0.6;

/* ---------- Levels ----------
   totalTiles divides evenly by both 8 and 12, so the board is a
   clean rectangle on phones and on larger screens. */
const LEVELS = {
  beginner: { name: "Beginner", totalTiles: 144, contaminated: 17 },
  intermediate: { name: "Intermediate", totalTiles: 192, contaminated: 24 },
  hard: { name: "Hard", totalTiles: 240, contaminated: 31 },
  impossible: { name: "Impossible — Or is it?", totalTiles: 288, contaminated: 40 },
};

/* how many rows at the top are the narrow entry shaft through clay */
const CORRIDOR_ROWS = 3;

/* the opening has to leave real work to do - any board where the
   best first dig lands you closer than this (as a fraction of the
   board's depth) is thrown away */
const MIN_DIGS_FRACTION = 0.45;

const MAX_BOARD_ATTEMPTS = 600;
const WATER_STEP_MS = 100;

/* ---------- Game state ---------- */
let board = [];
let rows = 0;
let cols = 0;
let goalRow = 0;
let goalCol = 0;
let corridor = [];
let currentLevelKey = null;
let gameOver = false;
let timerInterval = null;
let startTime = 0;
let selectedReplayLevelKey = null;
let selectedLevelKey = "beginner";
let lastWaterScrollAt = 0;
let lastTappedTileKey = null;
let lastTileTapTime = 0;
let tileTapTimeout = null;
let soundOn = true;
let waterSoundTimeout = null;
let deepestRowReached = CORRIDOR_ROWS - 1;
let goalClicked = false;
let milestoneTimeout = null;

const MILESTONES = [
  {
    message: "Through the topsoil.",
    condition: function () {
      return deepestRowReached >= CORRIDOR_ROWS;
    },
    fired: false,
  },
  {
    message: "Halfway to the aquifer.",
    condition: function () {
      return currentLevelKey !== "beginner" && deepestRowReached > rows / 2;
    },
    fired: false,
  },
  {
    message: "Clean water is in reach — click the blue tile!",
    condition: function () {
      if (gameOver || goalClicked) return false;

      const neighbours = neighbours4(goalRow, goalCol);
      for (let i = 0; i < neighbours.length; i++) {
        if (board[neighbours[i][0]][neighbours[i][1]].revealed) return true;
      }

      return false;
    },
    persistent: true,
    fired: false,
  },
];

/* ============================================================
   SMALL HELPERS
   ============================================================ */

function onBoard(r, c) {
  return r >= 0 && r < rows && c >= 0 && c < cols;
}

function playSound(audio) {
  if (!soundOn) return;
  audio.currentTime = 0;
  audio.play().catch(function () {});
}

function showMilestone(message, persistent) {
  milestoneMessageEl.textContent = message;
  milestoneMessageEl.classList.add("is-visible");

  clearTimeout(milestoneTimeout);
  milestoneTimeout = null;
  if (persistent) return;

  milestoneTimeout = setTimeout(function () {
    milestoneMessageEl.classList.remove("is-visible");
    milestoneTimeout = null;
  }, 2000);
}

function clearMilestoneMessage() {
  clearTimeout(milestoneTimeout);
  milestoneTimeout = null;
  milestoneMessageEl.classList.remove("is-visible");
  milestoneMessageEl.textContent = "";
}

function checkMilestones() {
  if (!gameOver) {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (board[row][col].revealed && row > deepestRowReached) {
          deepestRowReached = row;
        }
      }
    }
  }

  for (let i = 0; i < MILESTONES.length; i++) {
    const milestone = MILESTONES[i];

    if (gameOver && !milestone.persistent) continue;

    if (!milestone.fired && milestone.condition()) {
      milestone.fired = true;
      showMilestone(milestone.message, milestone.persistent);
    }
  }
}

function digAndCheckMilestones(row, col) {
  digTile(row, col);
}

function neighbours8(r, c) {
  const list = [];

  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      if (onBoard(r + dr, c + dc)) list.push([r + dr, c + dc]);
    }
  }

  return list;
}

function neighbours4(r, c) {
  const list = [];
  const steps = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];

  for (let i = 0; i < steps.length; i++) {
    if (onBoard(steps[i][0], steps[i][1])) list.push(steps[i]);
  }

  return list;
}

/* ============================================================
   THE ENTRY SHAFT

   A one-tile-wide route down through the clay at the top of the
   board. It wanders - a couple of rows down, a run sideways, down
   again - and it's different every game. Everything either side of
   it is clay: solid, harmless, and impossible to dig through, which
   is what keeps the entry narrow instead of opening wide.
   ============================================================ */
function makeCorridor() {
  const cells = [];
  let r = 0;
  let c = Math.floor(Math.random() * cols);
  cells.push([r, c]);

  let guard = 0;
  while (r < CORRIDOR_ROWS - 1 && guard < 60) {
    guard = guard + 1;

    /* drop one or two rows */
    const down = Math.random() < 0.4 ? 2 : 1;
    for (let i = 0; i < down && r < CORRIDOR_ROWS - 1; i++) {
      r = r + 1;
      cells.push([r, c]);
    }

    /* then run sideways for a stretch */
    const dir = Math.random() < 0.5 ? -1 : 1;
    const run = 1 + Math.floor(Math.random() * 5);
    for (let i = 0; i < run; i++) {
      if (c + dir < 0 || c + dir >= cols) break;
      c = c + dir;
      cells.push([r, c]);
    }
  }

  return { cells: cells, endRow: r, endCol: c };
}

/* ============================================================
   BUILDING A BOARD
   ============================================================ */
function buildCandidateBoard(howManyContaminated) {
  const tiles = [];

  for (let r = 0; r < rows; r++) {
    const rowArray = [];
    for (let c = 0; c < cols; c++) {
      rowArray.push({
        contaminated: false,
        revealed: false,
        flagged: false,
        isGoal: false,
        isClay: false,
        count: 0,
      });
    }
    tiles.push(rowArray);
  }

  /* the entry shaft, and clay packed around it */
  const shaft = makeCorridor();
  const shaftSet = new Set();
  for (let i = 0; i < shaft.cells.length; i++) {
    shaftSet.add(shaft.cells[i][0] + "," + shaft.cells[i][1]);
  }

  for (let r = 0; r < CORRIDOR_ROWS; r++) {
    for (let c = 0; c < cols; c++) {
      if (!shaftSet.has(r + "," + c)) {
        tiles[r][c].isClay = true;
      }
    }
  }

  /* a safe route from where the shaft ends down to the wellhead,
     so a way through always physically exists */
  const path = new Set();
  let row = shaft.endRow;
  let col = shaft.endCol;
  path.add(row + "," + col);

  let guard = 0;
  while (row < rows - 1 && guard < 4000) {
    guard = guard + 1;
    const roll = Math.random();

    if (roll < 0.6) {
      row = row + 1;
    } else if (roll < 0.8 && col > 0) {
      col = col - 1;
    } else if (col < cols - 1) {
      col = col + 1;
    } else {
      row = row + 1;
    }

    path.add(row + "," + col);
  }

  const thisGoalRow = rows - 1;
  const thisGoalCol = col;
  tiles[thisGoalRow][thisGoalCol].isGoal = true;

  /* Keep the two rows directly under the shaft clean. A tile there
     has no contaminated neighbours, so its count is 0 and your first
     dig cascades open a proper pocket of ground - the way the first
     click does in Minesweeper. */
  const firstDirtyRow = CORRIDOR_ROWS + 2;
  const available = [];

  for (let r = firstDirtyRow; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (path.has(r + "," + c)) continue;
      if (r === thisGoalRow && c === thisGoalCol) continue;
      available.push([r, c]);
    }
  }

  let placed = 0;
  while (placed < howManyContaminated && available.length > 0) {
    const index = Math.floor(Math.random() * available.length);
    tiles[available[index][0]][available[index][1]].contaminated = true;
    available.splice(index, 1);
    placed = placed + 1;
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let count = 0;
      const around = neighbours8(r, c);

      for (let i = 0; i < around.length; i++) {
        if (tiles[around[i][0]][around[i][1]].contaminated) count = count + 1;
      }

      tiles[r][c].count = count;
    }
  }

  return {
    tiles: tiles,
    goalRow: thisGoalRow,
    goalCol: thisGoalCol,
    corridor: shaft.cells,
  };
}

/* ============================================================
   THE SOLVER

   Plays the board with Minesweeper logic and nothing else:

   Rule A: if a dug tile's number is already accounted for by tiles
           proven contaminated, its other neighbours are safe.
   Rule B: if a dug tile's number equals the proven contaminated
           ones plus all its remaining unknowns, those unknowns are
           all contaminated.

   Clay is never contaminated and can never be dug, so it simply
   drops out of the reasoning.
   ============================================================ */
function canSolveWithoutGuessing(candidate) {
  const tiles = candidate.tiles;
  const gr = candidate.goalRow;
  const gc = candidate.goalCol;

  const dug = [];
  const safe = [];
  const bad = [];

  for (let r = 0; r < rows; r++) {
    dug.push(new Array(cols).fill(false));
    safe.push(new Array(cols).fill(false));
    bad.push(new Array(cols).fill(false));
  }

  function open(r, c) {
    if (dug[r][c] || tiles[r][c].isClay) return;

    dug[r][c] = true;
    safe[r][c] = true;

    if (tiles[r][c].count !== 0) return;

    const ring = neighbours8(r, c);
    for (let i = 0; i < ring.length; i++) {
      const nr = ring[i][0];
      const nc = ring[i][1];
      if (!dug[nr][nc] && !tiles[nr][nc].contaminated && !tiles[nr][nc].isClay) {
        open(nr, nc);
      }
    }
  }

  /* the entry shaft is open before you start */
  for (let i = 0; i < candidate.corridor.length; i++) {
    const cell = candidate.corridor[i];
    dug[cell[0]][cell[1]] = true;
    safe[cell[0]][cell[1]] = true;
  }

  /* the wellhead is visibly clean - that's the point of it */
  safe[gr][gc] = true;

  for (let step = 0; step < 20000; step++) {
    let madeProgress = true;

    while (madeProgress) {
      madeProgress = false;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (!dug[r][c]) continue;

          const around = neighbours8(r, c);
          const unknown = [];
          let knownBad = 0;

          for (let i = 0; i < around.length; i++) {
            const nr = around[i][0];
            const nc = around[i][1];

            if (tiles[nr][nc].isClay) continue;
            if (bad[nr][nc]) {
              knownBad = knownBad + 1;
            } else if (!safe[nr][nc]) {
              unknown.push([nr, nc]);
            }
          }

          if (unknown.length === 0) continue;

          if (knownBad === tiles[r][c].count) {
            for (let i = 0; i < unknown.length; i++) {
              if (!safe[unknown[i][0]][unknown[i][1]]) {
                safe[unknown[i][0]][unknown[i][1]] = true;
                madeProgress = true;
              }
            }
          } else if (knownBad + unknown.length === tiles[r][c].count) {
            for (let i = 0; i < unknown.length; i++) {
              if (!bad[unknown[i][0]][unknown[i][1]]) {
                bad[unknown[i][0]][unknown[i][1]] = true;
                madeProgress = true;
              }
            }
          }
        }
      }
    }

    const moves = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (dug[r][c] || !safe[r][c]) continue;
        if (tiles[r][c].contaminated || tiles[r][c].isClay) continue;

        const steps = neighbours4(r, c);
        for (let i = 0; i < steps.length; i++) {
          if (dug[steps[i][0]][steps[i][1]]) {
            moves.push([r, c]);
            break;
          }
        }
      }
    }

    if (moves.length === 0) return false;

    for (let i = 0; i < moves.length; i++) {
      open(moves[i][0], moves[i][1]);
    }

    if (dug[gr][gc]) return true;
  }

  return false;
}

/* Try every tile you could dig first, cascade from it, and count the
   fewest further digs that would still be needed to reach the
   wellhead. We take the luckiest one, because that's the one a
   player might happen to click. */
function digsLeftAfterBestOpening(candidate) {
  const tiles = candidate.tiles;
  let fewest = Infinity;

  /* which tiles sit against the entry shaft */
  const firstMoves = [];
  const inShaft = new Set();
  for (let i = 0; i < candidate.corridor.length; i++) {
    inShaft.add(candidate.corridor[i][0] + "," + candidate.corridor[i][1]);
  }

  for (let i = 0; i < candidate.corridor.length; i++) {
    const steps = neighbours4(candidate.corridor[i][0], candidate.corridor[i][1]);
    for (let j = 0; j < steps.length; j++) {
      const key = steps[j][0] + "," + steps[j][1];
      const t = tiles[steps[j][0]][steps[j][1]];
      if (!inShaft.has(key) && !t.isClay && !t.contaminated) {
        firstMoves.push(steps[j]);
      }
    }
  }

  for (let m = 0; m < firstMoves.length; m++) {
    const dug = [];
    for (let r = 0; r < rows; r++) dug.push(new Array(cols).fill(false));

    for (let i = 0; i < candidate.corridor.length; i++) {
      dug[candidate.corridor[i][0]][candidate.corridor[i][1]] = true;
    }

    (function open(r, c) {
      if (dug[r][c] || tiles[r][c].isClay) return;
      dug[r][c] = true;
      if (tiles[r][c].count !== 0) return;

      const ring = neighbours8(r, c);
      for (let i = 0; i < ring.length; i++) {
        const nr = ring[i][0];
        const nc = ring[i][1];
        if (!dug[nr][nc] && !tiles[nr][nc].contaminated && !tiles[nr][nc].isClay) {
          open(nr, nc);
        }
      }
    })(firstMoves[m][0], firstMoves[m][1]);

    const distance = [];
    for (let r = 0; r < rows; r++) distance.push(new Array(cols).fill(-1));

    const queue = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (dug[r][c]) {
          distance[r][c] = 0;
          queue.push([r, c]);
        }
      }
    }

    while (queue.length > 0) {
      const here = queue.shift();
      const steps = neighbours4(here[0], here[1]);

      for (let i = 0; i < steps.length; i++) {
        const nr = steps[i][0];
        const nc = steps[i][1];
        if (distance[nr][nc] !== -1) continue;
        if (tiles[nr][nc].contaminated || tiles[nr][nc].isClay) continue;
        distance[nr][nc] = distance[here[0]][here[1]] + 1;
        queue.push([nr, nc]);
      }
    }

    const d = distance[candidate.goalRow][candidate.goalCol];
    if (d >= 0 && d < fewest) fewest = d;
  }

  return fewest;
}

function buildSolvableBoard(howManyContaminated) {
  let fallback = null;
  const minDigs = Math.floor(rows * MIN_DIGS_FRACTION);

  for (let attempt = 0; attempt < MAX_BOARD_ATTEMPTS; attempt++) {
    const candidate = buildCandidateBoard(howManyContaminated);

    if (fallback === null) fallback = candidate;

    if (
      digsLeftAfterBestOpening(candidate) >= minDigs &&
      canSolveWithoutGuessing(candidate)
    ) {
      return candidate;
    }
  }

  return fallback;
}

/* ============================================================
   DIGGING
   ============================================================ */

/* You can dig any tile touching what you've already dug - including
   back upward, so a dead end means retreating and pushing out
   somewhere else. Clay can't be dug at all. */
function canDig(row, col) {
  const tile = board[row][col];

  if (tile.revealed || tile.flagged || tile.isClay) return false;

  const steps = neighbours4(row, col);
  for (let i = 0; i < steps.length; i++) {
    if (board[steps[i][0]][steps[i][1]].revealed) return true;
  }

  return false;
}

/* Open a tile. If nothing contaminated touches it, the empty ground
   around it falls away too, and keeps going - the cascade you get
   in Minesweeper. That opening is where your information comes
   from. */
function openTile(row, col) {
  const tile = board[row][col];

  if (tile.revealed || tile.isClay) return;

  tile.revealed = true;
  tile.flagged = false;

  if (tile.count !== 0) return;

  const ring = neighbours8(row, col);
  for (let i = 0; i < ring.length; i++) {
    const nr = ring[i][0];
    const nc = ring[i][1];
    const n = board[nr][nc];
    if (!n.revealed && !n.contaminated && !n.isClay) {
      openTile(nr, nc);
    }
  }
}

function digTile(row, col) {
  if (gameOver) return;

  const tile = board[row][col];

  /* A cascade can open the goal, but only clicking that tile wins. */
  if (tile.isGoal && tile.revealed) {
    endGame(true);
    return;
  }

  if (!canDig(row, col)) return;

  if (tile.contaminated) {
    tile.revealed = true;
    playSound(loseSound);
    endGame(false, row, col);
    return;
  }

  playSound(digSound);
  openTile(row, col);
  renderBoard();

  if (tile.isGoal) endGame(true);
}

function toggleFlag(row, col) {
  if (gameOver) return;

  const tile = board[row][col];
  if (tile.revealed || tile.isClay) return;

  tile.flagged = !tile.flagged;
  renderBoard();
}

/* ============================================================
   STARTING A LEVEL
   ============================================================ */

function startLevel(levelKey, shouldStartClock) {
  const level = LEVELS[levelKey];
  currentLevelKey = levelKey;
  selectedLevelKey = levelKey;

  /* Narrow screens get 8 columns, wider screens 12. Same tile count
     either way, so phones get a deeper board and tiles stay tappable. */
  const isPhone = window.matchMedia("(max-width: 600px)").matches;
  cols = isPhone ? 8 : 12;
  rows = level.totalTiles / cols;

  const built = buildSolvableBoard(level.contaminated);
  board = built.tiles;
  goalRow = built.goalRow;
  goalCol = built.goalCol;
  corridor = built.corridor;

  /* the entry shaft is already cut - that's where you start from */
  for (let i = 0; i < corridor.length; i++) {
    board[corridor[i][0]][corridor[i][1]].revealed = true;
  }

  placeConnector();

  gameOver = false;
  deepestRowReached = CORRIDOR_ROWS - 1;
  goalClicked = false;
  for (let i = 0; i < MILESTONES.length; i++) {
    MILESTONES[i].fired = false;
  }
  clearMilestoneMessage();
  levelNameEl.textContent = level.name;
  pumpEl.classList.remove("flowing");
  pumpEl.classList.remove("dirty-flowing");

  markActiveTab(levelKey);
  hideOverlay();
  renderBoard();

  if (shouldStartClock === false) {
    timerEl.textContent = "0.0s";
  } else {
    startTimer();
    pumpEl.closest(".game-card").scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }
}

/* ============================================================
   DRAWING
   ============================================================ */

function renderBoard() {
  boardEl.innerHTML = "";
  boardEl.style.gridTemplateColumns = "repeat(" + cols + ", 1fr)";

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tile = board[r][c];
      const tileEl = document.createElement("button");

      tileEl.className = "tile";
      tileEl.type = "button";
      tileEl.dataset.row = r;
      tileEl.dataset.col = c;
      tileEl.setAttribute("aria-label", "Row " + (r + 1) + ", column " + (c + 1));

      if (tile.isClay) {
        tileEl.classList.add("clay");
        boardEl.appendChild(tileEl);
        continue;
      }

      /* the wellhead is marked from the start - you can see your target */
      if (tile.isGoal) tileEl.classList.add("goal");

      if (tile.revealed) {
        tileEl.classList.add("revealed");

        if (tile.contaminated) {
          tileEl.classList.add("contaminated");
        } else if (tile.count > 0) {
          tileEl.classList.add("count-" + tile.count);
          tileEl.setAttribute(
            "aria-label",
            tile.count + " contaminated tiles nearby"
          );

          if (!gameOver) {
            const dropLayout = document.createElement("span");
            dropLayout.className = "drop-layout count-" + tile.count;
            dropLayout.setAttribute("aria-hidden", "true");

            for (let dropIndex = 0; dropIndex < tile.count; dropIndex++) {
              const dropIcon = document.createElement("i");
              dropIcon.className = "fa-solid fa-droplet";
              dropLayout.appendChild(dropIcon);
            }

            tileEl.appendChild(dropLayout);
          }
        }
      } else if (tile.flagged) {
        tileEl.classList.add("flagged");
        const barrierIcon = document.createElement("i");
        barrierIcon.className = "fa-solid fa-road-barrier";
        barrierIcon.setAttribute("aria-hidden", "true");
        tileEl.appendChild(barrierIcon);
      }

      if (!gameOver && canDig(r, c)) tileEl.classList.add("diggable");

      boardEl.appendChild(tileEl);
    }
  }

  checkMilestones();
}

/* Line the blue shaft under the board up with the wellhead column,
   so it's obvious the water is below the grid, not in the bottom row. */
function placeConnector() {
  connectorEl.style.left = (goalCol * 100) / cols + "%";
  connectorEl.style.width = 100 / cols + "%";
}

function tileElementAt(r, c) {
  return boardEl.children[r * cols + c];
}

function keepWaterVisible(row, col) {
  const tileEl = tileElementAt(row, col);
  if (!tileEl) return;

  const tileBounds = tileEl.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const isAboveView = tileBounds.top < viewportHeight * 0.25;
  const isBelowView = tileBounds.bottom > viewportHeight * 0.75;
  const now = Date.now();

  if ((isAboveView || isBelowView) && now - lastWaterScrollAt >= 220) {
    lastWaterScrollAt = now;
    window.scrollTo({
      top: Math.max(0, window.scrollY + tileBounds.top - viewportHeight * 0.5),
      behavior: "smooth",
    });
  }
}

function scrollToPump(whenDone) {
  const pumpTop = Math.max(
    0,
    pumpEl.getBoundingClientRect().top + window.scrollY - 80
  );

  if (Math.abs(window.scrollY - pumpTop) < 2) {
    whenDone();
    return;
  }

  let hasFinished = false;

  function finishScroll() {
    if (hasFinished) return;
    hasFinished = true;
    window.removeEventListener("scrollend", finishScroll);
    whenDone();
  }

  window.addEventListener("scrollend", finishScroll, { once: true });
  window.scrollTo({ top: pumpTop, behavior: "smooth" });
  setTimeout(finishScroll, 900);
}

/* ============================================================
   THE WATER COMING UP

   Walk outward from the wellhead through the tunnel you dug,
   counting how many steps each tile is from the water. Then fill
   them in that order, so the water visibly climbs your shaft and
   reaches the pump before the modal appears.
   ============================================================ */
function floodTunnel(whenDone, startRow, startCol, waterClass) {
  if (waterClass !== "dirty-watered") {
    clearTimeout(waterSoundTimeout);
    waterSoundTimeout = null;
    playSound(waterSound);
  }

  const distance = [];
  for (let r = 0; r < rows; r++) distance.push(new Array(cols).fill(-1));

  const sourceRow = startRow === undefined ? goalRow : startRow;
  const sourceCol = startCol === undefined ? goalCol : startCol;
  const classToAdd = waterClass || "watered";
  if (classToAdd === "dirty-watered") {
    pumpEl.classList.add("dirty-flowing");
  }
  const queue = [[sourceRow, sourceCol]];
  distance[sourceRow][sourceCol] = 0;
  let furthest = 0;

  while (queue.length > 0) {
    const here = queue.shift();
    const steps = neighbours4(here[0], here[1]);

    for (let i = 0; i < steps.length; i++) {
      const nr = steps[i][0];
      const nc = steps[i][1];

      if (distance[nr][nc] !== -1) continue;
      if (!board[nr][nc].revealed) continue;
      if (board[nr][nc].contaminated || board[nr][nc].isClay) continue;

      distance[nr][nc] = distance[here[0]][here[1]] + 1;
      if (distance[nr][nc] > furthest) furthest = distance[nr][nc];
      queue.push([nr, nc]);
    }
  }

  let lastLowerFillStep = -1;
  let lastTopFillStep = -1;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (distance[r][c] < 0) continue;

      if (r === 0) {
        lastTopFillStep = Math.max(lastTopFillStep, distance[r][c]);
      } else {
        lastLowerFillStep = Math.max(lastLowerFillStep, distance[r][c]);
      }
    }
  }

  if (lastTopFillStep >= 0) {
    furthest = Math.max(furthest, lastLowerFillStep + 1);
  }

  for (let d = 0; d <= furthest; d++) {
    (function (step) {
      setTimeout(function () {
        let leadingRow = rows;
        let leadingColumn = 0;

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            let fillStep = distance[r][c];

            if (r === 0 && fillStep >= 0) {
              fillStep = Math.max(fillStep, lastLowerFillStep + 1);
            }

            if (fillStep === step) {
              const el = tileElementAt(r, c);
              if (el) el.classList.add(classToAdd);

              if (r < leadingRow) {
                leadingRow = r;
                leadingColumn = c;
              }
            }
          }
        }

        if (leadingRow < rows) {
          keepWaterVisible(leadingRow, leadingColumn);
        }
      }, step * WATER_STEP_MS);
    })(d);
  }

  if (waterClass !== "dirty-watered") {
    waterSoundTimeout = setTimeout(function () {
      waterSound.pause();
      waterSound.currentTime = 0;
      waterSoundTimeout = null;
    }, furthest * WATER_STEP_MS);
  }

  setTimeout(function () {
    pumpEl.classList.add("flowing");
  }, furthest * WATER_STEP_MS + 150);

  setTimeout(function () {
    scrollToPump(whenDone);
  }, furthest * WATER_STEP_MS + 300);
}

/* ============================================================
   WINNING AND LOSING
   ============================================================ */

function revealContamination() {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (board[r][c].contaminated) board[r][c].revealed = true;
    }
  }
}

function endGame(playerWon, failureRow, failureCol) {
  gameOver = true;
  const finalTime = stopTimer();

  /* show where the dirty water was, win or lose - on a win you get
     to see exactly how close you came to it */
  revealContamination();
  renderBoard();

  if (playerWon) {
    floodTunnel(function () {
      levelControlsEl.hidden = false;
      showOverlay(
        "Congrats! You helped provide clean water to people in need!",
        "",
        true,
        finalTime
      );
      launchConfetti(overlayCardEl);
    });
    return;
  }

  floodTunnel(function () {
    levelControlsEl.hidden = false;
    showOverlay(
      "Oh no! You dug up contaminated water!",
      "",
      true
    );
  }, failureRow, failureCol, "dirty-watered");
}

/* ============================================================
   TIMER
   ============================================================ */

function startTimer() {
  stopTimer();
  startTime = Date.now();
  timerEl.textContent = "0.0s";

  timerInterval = setInterval(function () {
    timerEl.textContent = currentTime().toFixed(1) + "s";
  }, 100);
}

function currentTime() {
  return (Date.now() - startTime) / 1000;
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  return currentTime();
}

/* ============================================================
   OVERLAY
   ============================================================ */

function showOverlay(title, text, showReplay, resultTime, isStartPicker) {
  overlayTitleEl.textContent = title;
  overlayTextEl.textContent = text;
  overlayTextEl.hidden = text === "";
  overlayTimeEl.hidden = resultTime === undefined;
  overlayLearnEl.hidden = !showReplay;

  if (resultTime !== undefined) {
    overlayTimeEl.textContent = "Your time was: " + resultTime.toFixed(1) + " seconds.";
    overlayLearnTextEl.textContent =
      "Want to learn more about how charity:water does this everyday?";
  } else {
    overlayTimeEl.textContent = "";
    overlayLearnTextEl.textContent =
      "Want to learn more about how charity:water provides clean water to people everyday?";
  }

  overlayButtonsEl.innerHTML = "";
  overlayButtonsEl.classList.toggle("has-replay", showReplay);
  overlayButtonsEl.classList.toggle("is-start-picker", isStartPicker);
  selectedReplayLevelKey = isStartPicker ? selectedLevelKey : currentLevelKey;

  if (isStartPicker) {
    overlayEl.classList.add("start-picker");
  } else {
    overlayEl.classList.remove("start-picker");
  }

  const keys = Object.keys(LEVELS);
  if (isStartPicker || showReplay) {
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const button = document.createElement("button");
      button.className = "btn btn-ghost level-option";
      if (key === selectedReplayLevelKey) {
        button.classList.add("is-selected");
      }
      button.type = "button";
      button.textContent = LEVELS[key].name;
      button.dataset.level = key;
      button.addEventListener("click", function () {
        selectedReplayLevelKey = key;
        if (isStartPicker) {
          selectedLevelKey = key;
          markActiveTab(key);
        }

        const levelButtons = overlayButtonsEl.querySelectorAll(".level-option");
        for (let buttonIndex = 0; buttonIndex < levelButtons.length; buttonIndex++) {
          levelButtons[buttonIndex].classList.toggle(
            "is-selected",
            levelButtons[buttonIndex].dataset.level === selectedReplayLevelKey
          );
        }
      });
      overlayButtonsEl.appendChild(button);
    }
  }

  if (isStartPicker) {
    const startButton = document.createElement("button");
    startButton.className = "btn btn-primary play-again start-game";
    startButton.type = "button";
    startButton.textContent = "Start Game!";
    startButton.addEventListener("click", function () {
      startLevel(selectedReplayLevelKey);
    });
    overlayButtonsEl.appendChild(startButton);
  } else if (showReplay) {
    const again = document.createElement("button");
    again.className = "btn btn-primary play-again";
    again.type = "button";
    again.textContent = "Play Again!";
    again.addEventListener("click", function () {
      if (selectedReplayLevelKey !== null) {
        startLevel(selectedReplayLevelKey);
      }
    });
    overlayButtonsEl.appendChild(again);
  }

  overlayCloseEl.hidden = !showReplay;
  overlayEl.classList.add("show");
}

function hideOverlay() {
  overlayEl.classList.remove("show");
  overlayEl.classList.remove("start-picker");
}

/* ============================================================
   LEVEL TABS
   ============================================================ */

function buildTabs() {
  const keys = Object.keys(LEVELS);

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const tab = document.createElement("button");

    tab.className = "tab";
    tab.type = "button";
    tab.dataset.level = key;
    tab.textContent = LEVELS[key].name;
    tab.addEventListener("click", function () {
      selectedLevelKey = key;
      markActiveTab(key);
    });

    tabsEl.appendChild(tab);
  }
}

function markActiveTab(levelKey) {
  const tabs = tabsEl.querySelectorAll(".tab");
  for (let i = 0; i < tabs.length; i++) {
    if (tabs[i].dataset.level === levelKey) {
      tabs[i].classList.add("active");
    } else {
      tabs[i].classList.remove("active");
    }
  }
}

/* ============================================================
   LISTENERS
   ============================================================ */

function launchConfetti(container) {
  const oldConfetti = container.querySelector(".confetti-burst");
  if (oldConfetti) oldConfetti.remove();

  const confettiLayer = document.createElement("div");
  const confettiColors = ["#ffc907", "#2e9df7", "#5f8f36", "#ff902a"];
  confettiLayer.className = "confetti-burst";
  confettiLayer.setAttribute("aria-hidden", "true");

  for (let index = 0; index < 84; index += 1) {
    const piece = document.createElement("span");
    const colorIndex = Math.floor(Math.random() * confettiColors.length);
    const angle = Math.random() * Math.PI * 2;
    const distance = 90 + Math.random() * 260;
    const animationDelay = Math.random() * 180;

    piece.className = "confetti-piece";
    piece.style.setProperty("--confetti-color", confettiColors[colorIndex]);
    piece.style.setProperty("--confetti-x", Math.cos(angle) * distance + "px");
    piece.style.setProperty("--confetti-y", Math.sin(angle) * distance + "px");
    piece.style.setProperty("--confetti-delay", animationDelay + "ms");
    confettiLayer.appendChild(piece);
  }

  container.prepend(confettiLayer);

  setTimeout(function () {
    confettiLayer.remove();
  }, 2600);
}

function handleTileClick(event) {
  const tileEl = event.target.closest(".tile");
  if (!tileEl) return;

  const row = Number(tileEl.dataset.row);
  const col = Number(tileEl.dataset.col);

  if (board[row][col].isGoal) {
    goalClicked = true;
    clearMilestoneMessage();
  }

  if (!hasCoarsePointer) {
    digAndCheckMilestones(row, col);
    return;
  }

  const tileKey = row + "," + col;
  const now = Date.now();

  if (tileKey === lastTappedTileKey && now - lastTileTapTime <= 450) {
    clearTimeout(tileTapTimeout);
    lastTappedTileKey = null;
    lastTileTapTime = 0;
    board[row][col].flagged = false;
    digAndCheckMilestones(row, col);
    return;
  }

  lastTappedTileKey = tileKey;
  lastTileTapTime = now;
  toggleFlag(row, col);

  clearTimeout(tileTapTimeout);
  tileTapTimeout = setTimeout(function () {
    lastTappedTileKey = null;
    lastTileTapTime = 0;
  }, 450);
}

boardEl.addEventListener("click", handleTileClick);

muteBtn.addEventListener("click", function () {
  soundOn = !soundOn;
  const isMuted = !soundOn;
  muteBtn.textContent = soundOn ? "🔊 Sound" : "🔇 Sound";
  muteBtn.setAttribute("aria-pressed", isMuted ? "true" : "false");

  if (isMuted) {
    clearTimeout(waterSoundTimeout);
    waterSoundTimeout = null;
    waterSound.pause();
    waterSound.currentTime = 0;
  }
});

boardEl.addEventListener("contextmenu", function (event) {
  const tileEl = event.target.closest(".tile");
  if (!tileEl) return;
  event.preventDefault();
  if (hasCoarsePointer) return;
  toggleFlag(Number(tileEl.dataset.row), Number(tileEl.dataset.col));
});

overlayCloseEl.addEventListener("click", hideOverlay);

document
  .getElementById("subscribeForm")
  .addEventListener("submit", function (event) {
    event.preventDefault();
    document.getElementById("subscribeMsg").textContent =
      "Thanks! (This is a demo form and doesn't send anything.)";
    launchConfetti(subscribeSectionEl);
    event.target.reset();
  });

/* ============================================================
   START
   ============================================================ */

buildTabs();
startLevel("beginner", false);

document.getElementById("interactionHint").textContent = hasCoarsePointer
  ? "Tap once to place a blockade. Double-tap to dig."
  : "Right click to place a blockade.";

showOverlay(
  "Choose your level",
  "Minesweeper, but you're drilling a well. Instead of clearing the board, " +
    "the goal is to find a path to the clean water below. An entry shaft is " +
    "already cut through the clay at the top — dig on from the end of it down " +
    "to the blue wellhead. Drops show how many contaminated tiles are " +
    "alongside. " +
    (hasCoarsePointer
      ? "Tap once to place a blockade and double-tap to dig."
      : "Right click to drop a blockade where you think the dirty water is."),
  false,
  undefined,
  true
);

startGameButtonEl.addEventListener("click", function () {
  startLevel(selectedLevelKey);
});