// =====================================================================================
//  board.js  -  square numbering and random board generation
//  Squares are numbered 1-100 in the classic zig-zag: row 0 (bottom) runs left to right, row 1 right to left, and so on.
//  Snakes are stored as { headSquare: tailSquare }. Ladders as { bottomSquare: topSquare }.
// =====================================================================================

// rc(n): square number -> [row, column]. Row 0 is the bottom row, column 0 the left column.
const rc = (n) => {
  const i = n - 1,
    r = Math.floor(i / BOARD_COLS);
  return [r, r % 2 ? LAST_COL - (i % BOARD_COLS) : i % BOARD_COLS];
};
// toN(r,c): the opposite - [row, column] -> square number.
const toN = (r, c) => r * BOARD_COLS + (r % 2 ? LAST_COL - c : c) + 1;
// cellPx(c, vr): on-screen pixel centre of the tile in column c, "visual row" vr (0 = TOP row of the screen).
// Tiles are rectangular now: the centre is half a tile width across and half the TOP FACE height (TH) down (see config.js).
const cellPx = (c, vr) => [BX0 + c * CX + TW / 2, BY0 + vr * CY + TH / 2];
// xy(n): on-screen pixel centre of square n. Used by pawns, ladders, snakes.
function xy(n) {
  const [r, c] = rc(n);
  return cellPx(c, LAST_ROW - r);
}
// squareAt(x, y): which square (1-100) is at a screen position? Returns 0 if the position is off the board. Used when dropping a piece.
function squareAt(x, y) {
  const c = Math.floor((x - BX0) / CX),
    vr = Math.floor((y - BY0) / CY);
  return c < 0 || c > LAST_COL || vr < 0 || vr > LAST_ROW
    ? 0
    : toN(LAST_ROW - vr, c);
}

// tryBoard(): one attempt at a random board following the layout rules. Returns null if the attempt breaks a rule.
// Rules: 2 snakes (one long, one short) with heads on 91-99 and a ladder ending between them;
// other snakes weighted toward the upper rows; ladders mostly vertical (at most 1 wide one); every row but the bottom has something.
function tryBoard() {
  const used = [],
    L = {},
    Sn = {};
  // ok(n,g): is square n free and at least g squares away from every used square?
  const ok = (n, g) =>
    n > 1 && n < SQUARES && used.every((u) => Math.abs(u - n) >= g);
  // add(g, ...squares): claim squares if they are all free and not too close to each other
  const add = (g, ...ns) => {
    for (let i = 0; i < ns.length; i++) {
      if (
        !ok(ns[i], g) ||
        ns.some((m, j) => j !== i && Math.abs(m - ns[i]) < g)
      )
        return false;
    }
    used.push(...ns);
    return true;
  };
  const h1 = rnd(...TOP_HEAD_1),
    h2 = rnd(h1 + TOP_HEAD_GAP, TOP_HEAD_2_MAX),
    e = rnd(h1 + TOP_LADDER_MARGIN, h2 - TOP_LADDER_MARGIN); // two top snake heads and the ladder's top square between them
  const t1 = h1 - rnd(...SHORT_SNAKE_DROP),
    t2 = h2 - rnd(...LONG_SNAKE_DROP); // snake 1 is short, snake 2 is long
  if (!add(MIN_GAP_STRICT, h1, h2, e, t1, t2)) return null;
  Sn[h1] = t1;
  Sn[h2] = t2;
  let s = 0; // the ladder that ends at e: find a bottom square 20-50 below, no more than 4 columns away
  for (let k = 0; k < TOP_LADDER_TRIES && !L[s]; k++) {
    s = e - rnd(...TOP_LADDER_RISE);
    if (
      s > 1 &&
      Math.abs(rc(s)[1] - rc(e)[1]) <= TOP_LADDER_MAX_COLS &&
      add(MIN_GAP_STRICT, s)
    )
      L[s] = e;
  }
  if (!L[s]) return null;
  const wr = []; // weighted list of head rows: higher rows appear more often (SNAKE_ROW_BIAS_POWER controls how strongly)
  for (let r = 1; r <= SNAKE_HEAD_ROWS; r++)
    for (let k = 0; k < Math.round(Math.pow(r, SNAKE_ROW_BIAS_POWER)); k++)
      wr.push(r);
  const rowCount = {}; // how many snake heads are already on each row, so later ones don't all pile onto the same row (see MAX_SNAKES_PER_ROW)
  [h1, h2].forEach((h) => {
    const r = rc(h)[0];
    rowCount[r] = (rowCount[r] || 0) + 1;
  });
  for (let i = 2; i < CONFIG.SNAKES; i++) {
    // the remaining snakes
    let done = false;
    for (let k = 0; k < PLACE_TRIES && !done; k++) {
      const hr = wr[rnd(0, wr.length - 1)],
        tr = Math.max(0, hr - rnd(...SNAKE_DROP_ROWS)),
        hc = rnd(0, LAST_COL),
        tc = cl(hc + rnd(-SNAKE_TAIL_SHIFT, SNAKE_TAIL_SHIFT), 0, LAST_COL);
      if ((rowCount[hr] || 0) >= MAX_SNAKES_PER_ROW + (k < RELAX_AFTER ? 0 : 1))
        continue; // that row already has enough heads (briefly allow one more if we're struggling to finish the board)
      const h = toN(hr, hc),
        t = toN(tr, tc);
      if (
        h - t >= SNAKE_MIN_DROP &&
        add(k < RELAX_AFTER ? MIN_GAP_STRICT : MIN_GAP_RELAXED, h, t)
      ) {
        Sn[h] = t;
        rowCount[hr] = (rowCount[hr] || 0) + 1;
        done = true;
      }
    }
    if (!done) return null;
  }
  let wide = 0; // how many wide (mostly horizontal) ladders so far (max 1)
  for (let i = 1; i < CONFIG.LADDERS; i++) {
    // the remaining ladders
    let done = false;
    for (let k = 0; k < PLACE_TRIES && !done; k++) {
      const horiz = !wide && Math.random() < WIDE_LADDER_CHANCE,
        sr = rnd(0, LADDER_START_ROW_MAX),
        sc = rnd(0, LAST_COL);
      const er =
          sr + (horiz ? rnd(...WIDE_LADDER_RISE) : rnd(...TALL_LADDER_RISE)),
        ec = cl(
          sc +
            (horiz
              ? (Math.random() < 0.5 ? -1 : 1) * rnd(...WIDE_LADDER_SHIFT)
              : rnd(...TALL_LADDER_SHIFT)),
          0,
          LAST_COL,
        );
      if (
        er > LADDER_TOP_ROW_MAX ||
        (horiz && Math.abs(ec - sc) < WIDE_LADDER_MIN_SHIFT)
      )
        continue;
      const a = toN(sr, sc),
        b = toN(er, ec);
      if (add(k < RELAX_AFTER ? MIN_GAP_STRICT : MIN_GAP_RELAXED, a, b)) {
        L[a] = b;
        if (horiz) wide++;
        done = true;
      }
    }
    if (!done) return null;
  }
  // final checks: every row above the bottom is used, left/middle/right thirds are balanced, and not too many low snakes
  const pts = [
      ...Object.keys(L),
      ...Object.values(L),
      ...Object.keys(Sn),
      ...Object.values(Sn),
    ].map(Number),
    rows = new Set(pts.map((n) => rc(n)[0]));
  for (let r = 1; r < BOARD_ROWS; r++) if (!rows.has(r)) return null;
  const cb = [0, 0, 0];
  pts.forEach(
    (n) =>
      cb[
        rc(n)[1] < COLUMN_THIRDS[0] ? 0 : rc(n)[1] < COLUMN_THIRDS[1] ? 1 : 2
      ]++,
  );
  if (cb.some((x) => x < MIN_PER_THIRD)) return null;
  if (
    Object.keys(Sn)
      .map(Number)
      .filter((h) => rc(h)[0] < LOW_ROW_LIMIT).length > MAX_LOW_SNAKES
  )
    return null;
  return { L, S: Sn, cobra: t2 }; // "cobra" = the tail square of the long snake; that snake wears the cobra head
}
// genBoard(): keep trying until a valid board comes out. Returns { L, S, cobra }.
function genBoard() {
  for (let i = 0; i < BOARD_TRIES; i++) {
    const b = tryBoard();
    if (b) return b;
  }
  return genBoard();
}
