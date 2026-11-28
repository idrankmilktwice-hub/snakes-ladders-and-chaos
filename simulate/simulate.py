#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
==============================================================================
 simulate.py  -  Balance simulator for "Snakes, Ladders and Chaos"
==============================================================================

WHAT THIS DOES
  Plays thousands of complete games on your computer (no menus, no graphics,
  no sounds, no animations) using the SAME rules as the real game, and writes
  an easy-to-read text report with win rates, how often every ability was
  used, how strong each ability really is, and how long games last.

HOW TO RUN IT  (open a terminal in the folder that holds this file)
      python simulate.py                       -> 2,000 games for every lobby
                                                  size from 2 to 6 players
      python simulate.py --games 10000         -> 10,000 games per lobby size
      python simulate.py --sizes 6             -> only 6-player games
      python simulate.py --sizes 4,5 --games 5000
      python simulate.py --seed 123            -> repeat an earlier run exactly
      python simulate.py --processes 1         -> use one CPU core only
  (On some computers you must type  python3  instead of  python.)

WHERE THE RESULTS GO
  balance_report.txt                the newest report (open it in Notepad)
  reports/balance_report_<date>.txt a saved copy of every run, so you can
                                    compare "before" and "after" a tweak

IMPORTANT  -  KEEPING IT IN SYNC WITH THE GAME
  The numbers in the SETTINGS section below are copied from config.js.
  If you change a balance number in config.js, change the same number here,
  otherwise the simulation no longer matches your game.
  The rules themselves are a translation of rules.js and board.js.

IMPORTANT  -  THE SIMULATED PLAYERS
  A real player makes choices (push or pull? which snake head to move? who to
  throw the stone at?). This script uses simple "bot brains" for those
  choices (see the BOT BRAINS section). Choices that do not change the odds
  (the Oracle's call, the Struggler's failure numbers) are random.
  The strength of the bots affects the results, so treat the numbers as
  "how the game plays with sensible players", not as an exact truth.
==============================================================================
"""

import argparse
import math
import os
import random
import sys
import time
from collections import Counter
from datetime import datetime
from multiprocessing import Pool, cpu_count, freeze_support

# ==============================================================================
#  SETTINGS  (copied from config.js - keep them in sync, see the note above)
# ==============================================================================

# ---- The board ----------------------------------------------------------------
BOARD_COLS = 10                       # squares per row
BOARD_ROWS = 10                       # number of rows
SQUARES = BOARD_COLS * BOARD_ROWS     # 100 squares in total
LAST_COL = BOARD_COLS - 1             # columns are counted from 0
LAST_ROW = BOARD_ROWS - 1             # rows are counted from 0 (row 0 = bottom)
START_SQUARE = 1                      # everybody starts here
FINISH_SQUARE = SQUARES               # landing exactly here wins

# ---- Random board generation (board.js) -------------------------------------
LADDERS = 9                           # CONFIG.LADDERS: ladders per board
SNAKES = 9                            # CONFIG.SNAKES: snakes per board
TOP_HEAD_1 = (91, 95)                 # the short top snake's head lands in this range
TOP_HEAD_GAP = 4                      # second top head is at least this far after the first...
TOP_HEAD_2_MAX = 99                   # ...and at most on this square
TOP_LADDER_MARGIN = 2                 # top ladder ends this far from both top snake heads
SHORT_SNAKE_DROP = (8, 14)            # the short top snake slides down this many squares
LONG_SNAKE_DROP = (35, 55)            # the long top snake (cobra) slides down this many squares
TOP_LADDER_RISE = (20, 50)            # the ladder reaching the top starts this far below its end
TOP_LADDER_MAX_COLS = 4               # ...and at most this many columns to the side
TOP_LADDER_TRIES = 60                 # attempts to place that ladder
MIN_GAP_STRICT = 2                    # snake / ladder squares must be at least this far apart...
MIN_GAP_RELAXED = 1                   # ...or this far once placing gets difficult
RELAX_AFTER = 40                      # after this many failed tries the gap rule is relaxed
PLACE_TRIES = 80                      # attempts to place each other snake / ladder
SNAKE_HEAD_ROWS = 8                   # other snake heads sit on rows 1 to this
SNAKE_ROW_BIAS_POWER = 1.6            # higher rows are more likely for snake heads
MAX_SNAKES_PER_ROW = 2                # at most this many snake heads on one row (at first)
SNAKE_DROP_ROWS = (1, 4)              # other snakes drop this many rows
SNAKE_TAIL_SHIFT = 4                  # tail is up to this many columns left or right
SNAKE_MIN_DROP = 6                    # every snake slides down at least this many squares
WIDE_LADDER_CHANCE = 0.15             # chance a ladder is a wide (sideways) one; max one per board
LADDER_START_ROW_MAX = 7              # other ladders start on rows 0 to this
WIDE_LADDER_RISE = (1, 2)             # a wide ladder climbs this many rows...
WIDE_LADDER_SHIFT = (6, 9)            # ...and moves this many columns sideways
TALL_LADDER_RISE = (2, 5)             # an ordinary ladder climbs this many rows...
TALL_LADDER_SHIFT = (-3, 3)           # ...and moves this many columns sideways
LADDER_TOP_ROW_MAX = 8                # no other ladder reaches above this row
WIDE_LADDER_MIN_SHIFT = 5             # a wide ladder must move at least this many columns
COLUMN_THIRDS = (3, 7)                # columns below 3 = left third, below 7 = middle, rest = right
MIN_PER_THIRD = 5                     # every third needs at least this many snake / ladder ends
LOW_ROW_LIMIT = 5                     # snake heads on rows below this are "low"...
MAX_LOW_SNAKES = 2                    # ...and there may be at most this many of them
BOARD_TRIES = 3000                    # (the real game restarts after this many; here we simply keep trying)

# ---- Dice ----------------------------------------------------------------------
DIE_FACES = 6                         # sides of a normal die
DIE_FACE_LIST = list(range(1, DIE_FACES + 1))   # its faces: 1..6
BONUS_FACE = 6                        # rolling this gives another turn (for some characters)
STRUGGLER_FAILURE_NUMBERS = 2         # the Struggler picks this many "failure" numbers for a ladder

# ---- Character rules (config.js) ---------------------------------------------
BULLY_RANGE = 6                       # the Bully can push / pull players up to this many squares ahead
GAMBLER_EXACT_WINDOW = 4              # Gambler needs an exact number when fewer than this many squares from the finish
ORACLE_BONUS_DIE = (1, 3)             # the Oracle's bonus die for a right call (min, max)
CAT_KNOCKDOWN = 10                    # the cat knocks a player down this many squares
CAT_BONUS_PER_HIT = 3                 # cat owner's bonus on her next roll for every player knocked down
CAT_CHARM_PENALTY = 1                 # !! NOT FOUND in config.js: taken from the rulebook text ("-1 on their next roll"). Please confirm.
CHARMER_ROW_REACH = 1                 # the Charmer reaches snake heads on her row and this many rows above / below
NUDGE_DISTANCE = 1                    # the Bully's nudge and the stick move things by this many squares

# ---- Items (config.js) ---------------------------------------------------------
ITEM_TYPES = ["stick", "brick", "drink", "stone"]   # the four items (each equally likely to appear)
ITEM_START = 6                        # items lying on the board when a game starts
ITEM_EVERY = 3                        # a new item appears every this-many turns (counted over ALL players)
ITEM_MAX = 3                          # most items a player can hold
ENERGY_DRINK_BONUS = 3                # an energy drink adds this to the next roll
BRICK_PENALTY = 3                     # stepping on a toy brick takes this off the next roll
STONE_PENALTY = 1                     # !! NOT FOUND in config.js: taken from the rulebook text ("-1 on their next roll"). Please confirm.
ITEM_START_ROWS = 5                   # starting items are a little more likely on rows below this...
ITEM_START_WEIGHT = 1.25              # ...by this factor
ITEM_NEAR_BOOST = 0.6                 # later items are more likely near the last player: up to this much extra weight...
ITEM_NEAR_SQUARES = 30                # ...fading to nothing at this many squares away
FIRST_ITEM_SQUARE = 2                 # items never appear on the first square...
LAST_ITEM_SQUARE = SQUARES - 1        # ...or the last

# ---- The characters --------------------------------------------------------------
CHARACTER_IDS = ["bully", "gambler", "cat", "struggler", "oracle", "charmer"]
CHARACTER_NAMES = {
    "bully": "Bully", "gambler": "Gambler", "cat": "Cat Lady",
    "struggler": "Struggler", "oracle": "Oracle", "charmer": "Snake Charmer",
}
TURN_RANK = {"charmer": -1, "cat": 1}   # Charmer always goes first, Cat Lady last, everybody else rank 0 (setup order)
DEFAULT_TURN_RANK = 0

# ---- Names of the "forced effects" other players can do to a victim -----------
EFFECT_KEY = {
    "pushed": "push",
    "pulled": "pull",
    "nudged": "nudge",
    "knocked down by the cat": "knockdown",
}

# ==============================================================================
#  SIMULATION SETTINGS  (these only affect the simulator, not the game)
# ==============================================================================
DEFAULT_LOBBY_SIZES = [2, 3, 4, 5, 6]   # lobby sizes simulated when --sizes is not given
DEFAULT_GAMES_PER_SIZE = 2000           # games per lobby size when --games is not given
CHUNK_SIZE = 250                        # games handed to one CPU core at a time
MAX_ROUNDS = 2000                       # safety: a game longer than this is counted as "unfinished"
CHUNK_SEED_STRIDE = 1_000_003           # spreads the random seeds of the different chunks
REPORT_FILE = "balance_report.txt"      # newest report
REPORT_FOLDER = "reports"               # every run is also saved here
REPORT_WIDTH = 78                       # width of the divider lines in the report
Z_95 = 1.96                             # statistics: 95% confidence
PERCENT = 100.0
BALANCE_WARN_POINTS = 2.0               # win rate this many percentage points above / below fair = flagged ">>"
BALANCE_BAD_POINTS = 4.0                # ...this many = flagged "!!" (clearly out of balance)
PROGRESS_STEP = 5                       # progress line is refreshed after every this-many finished chunks

# ==============================================================================
#  BOT BRAINS  (the choices the simulated players make - change to experiment)
# ==============================================================================
BOT_ROLL_REACH = DIE_FACES              # a bot assumes you can land 1..6 squares ahead with your next roll
BOT_HIT_CHANCE = 1.0 / DIE_FACES        # ...each with this chance
BOT_CHARMER_MIN_GAIN = 1.0              # Charmer moves a head only if it is expected to cost opponents (net) at least this many squares
BOT_STICK_MIN_GAIN = 1.0                # same rule for using a stick
BOT_BRICK_MIN_SCORE = 0.0               # a brick is placed only if it is more likely to trip opponents than the owner
BOT_GAIN_TIE_EPSILON = 1e-9             # two choices this close in value count as equal (pick one at random)
BOT_ITEM_KEEP_RANK = {"drink": 4, "brick": 3, "stone": 2, "stick": 1}   # when hands are full the bot swaps its lowest-ranked item for a higher-ranked one on the ground

# ==============================================================================
#  SMALL HELPERS
# ==============================================================================
# T is the "tally": a big counter that every game adds its statistics to.
# Keys are tuples such as ("char", "bully", "push_chosen"). Each CPU core keeps
# its own tally and the main program adds them all together at the end.
T = Counter()


def ch(player, name, amount=1):
    """Add `amount` to the statistic `name` of the character `player` plays."""
    T[("char", player.character, name)] += amount


def d6():
    """Roll one six-sided die."""
    return random.randint(1, DIE_FACES)


def rnd(low, high):
    """Random whole number from low to high, both included (same as rnd() in config.js)."""
    return random.randint(low, high)


def clamp(value, low, high):
    """Keep value between low and high."""
    return max(low, min(high, value))


def js_round(x):
    """Round like JavaScript's Math.round (halves round up)."""
    return math.floor(x + 0.5)


def is_even(n):
    """True for 2, 4, 6... (the Struggler's 'even = dodge' rule)."""
    return n % 2 == 0


def row_of(square):
    """Board row of a square (0 = bottom row)."""
    return (square - 1) // BOARD_COLS


def rc(n):
    """Square number -> (row, column). Row 0 is the bottom, column 0 the left (zig-zag numbering)."""
    i = n - 1
    r = i // BOARD_COLS
    return r, (LAST_COL - (i % BOARD_COLS) if r % 2 else i % BOARD_COLS)


def to_n(r, c):
    """(row, column) -> square number. The opposite of rc()."""
    return r * BOARD_COLS + (LAST_COL - c if r % 2 else c) + 1


# ==============================================================================
#  BOARD GENERATION  (translation of board.js)
# ==============================================================================
def try_board():
    """One attempt at a random board. Returns None if the attempt breaks a layout rule."""
    used = []          # every square already taken by a snake or ladder end
    ladders = {}       # { bottom: top }
    snakes = {}        # { head: tail }

    def ok(n, gap):
        """Is square n free and at least `gap` squares from every used square?"""
        return START_SQUARE < n < SQUARES and all(abs(u - n) >= gap for u in used)

    def add(gap, *squares):
        """Claim squares if they are all free and not too close to each other."""
        for i, n in enumerate(squares):
            if not ok(n, gap) or any(j != i and abs(m - n) < gap for j, m in enumerate(squares)):
                return False
        used.extend(squares)
        return True

    # Two snakes near the top (one short, one long) and a ladder ending between them.
    h1 = rnd(*TOP_HEAD_1)
    h2 = rnd(h1 + TOP_HEAD_GAP, TOP_HEAD_2_MAX)
    e = rnd(h1 + TOP_LADDER_MARGIN, h2 - TOP_LADDER_MARGIN)
    t1 = h1 - rnd(*SHORT_SNAKE_DROP)
    t2 = h2 - rnd(*LONG_SNAKE_DROP)
    if not add(MIN_GAP_STRICT, h1, h2, e, t1, t2):
        return None
    snakes[h1] = t1
    snakes[h2] = t2

    # The ladder that ends at e: find a bottom square 20-50 below, at most 4 columns away.
    s = 0
    k = 0
    while k < TOP_LADDER_TRIES and not ladders.get(s):
        s = e - rnd(*TOP_LADDER_RISE)
        if s > START_SQUARE and abs(rc(s)[1] - rc(e)[1]) <= TOP_LADDER_MAX_COLS and add(MIN_GAP_STRICT, s):
            ladders[s] = e
        k += 1
    if not ladders.get(s):
        return None

    # Weighted list of rows for the other snake heads: higher rows appear more often.
    weighted_rows = []
    for r in range(1, SNAKE_HEAD_ROWS + 1):
        weighted_rows.extend([r] * js_round(r ** SNAKE_ROW_BIAS_POWER))
    row_count = {}     # how many snake heads are already on each row
    for h in (h1, h2):
        r = rc(h)[0]
        row_count[r] = row_count.get(r, 0) + 1

    # The remaining snakes.
    for _ in range(2, SNAKES):
        done = False
        k = 0
        while k < PLACE_TRIES and not done:
            hr = weighted_rows[rnd(0, len(weighted_rows) - 1)]
            tr = max(0, hr - rnd(*SNAKE_DROP_ROWS))
            hc = rnd(0, LAST_COL)
            tc = clamp(hc + rnd(-SNAKE_TAIL_SHIFT, SNAKE_TAIL_SHIFT), 0, LAST_COL)
            relaxed = k >= RELAX_AFTER
            if row_count.get(hr, 0) >= MAX_SNAKES_PER_ROW + (1 if relaxed else 0):
                k += 1
                continue
            h = to_n(hr, hc)
            t = to_n(tr, tc)
            if h - t >= SNAKE_MIN_DROP and add(MIN_GAP_RELAXED if relaxed else MIN_GAP_STRICT, h, t):
                snakes[h] = t
                row_count[hr] = row_count.get(hr, 0) + 1
                done = True
            k += 1
        if not done:
            return None

    # The remaining ladders.
    wide = 0           # how many wide (mostly sideways) ladders so far (max 1)
    for _ in range(1, LADDERS):
        done = False
        k = 0
        while k < PLACE_TRIES and not done:
            horiz = (not wide) and random.random() < WIDE_LADDER_CHANCE
            sr = rnd(0, LADDER_START_ROW_MAX)
            sc = rnd(0, LAST_COL)
            er = sr + (rnd(*WIDE_LADDER_RISE) if horiz else rnd(*TALL_LADDER_RISE))
            if horiz:
                shift = (-1 if random.random() < 0.5 else 1) * rnd(*WIDE_LADDER_SHIFT)
            else:
                shift = rnd(*TALL_LADDER_SHIFT)
            ec = clamp(sc + shift, 0, LAST_COL)
            if er > LADDER_TOP_ROW_MAX or (horiz and abs(ec - sc) < WIDE_LADDER_MIN_SHIFT):
                k += 1
                continue
            a = to_n(sr, sc)
            b = to_n(er, ec)
            if add(MIN_GAP_RELAXED if k >= RELAX_AFTER else MIN_GAP_STRICT, a, b):
                ladders[a] = b
                if horiz:
                    wide += 1
                done = True
            k += 1
        if not done:
            return None

    # Final checks: every row above the bottom is used, thirds are balanced, not too many low snakes.
    points = list(ladders) + list(ladders.values()) + list(snakes) + list(snakes.values())
    rows = {rc(n)[0] for n in points}
    for r in range(1, BOARD_ROWS):
        if r not in rows:
            return None
    thirds = [0, 0, 0]
    for n in points:
        col = rc(n)[1]
        thirds[0 if col < COLUMN_THIRDS[0] else 1 if col < COLUMN_THIRDS[1] else 2] += 1
    if any(x < MIN_PER_THIRD for x in thirds):
        return None
    if sum(1 for h in snakes if rc(h)[0] < LOW_ROW_LIMIT) > MAX_LOW_SNAKES:
        return None
    return {"L": ladders, "S": snakes}


def gen_board():
    """Keep trying until a valid board comes out. Returns {"L": ladders, "S": snakes}."""
    while True:
        board = try_board()
        if board:
            return board


# ==============================================================================
#  THE GAME  (translation of rules.js; every "await" / prompt is replaced by a bot decision)
# ==============================================================================
class Cat:
    """The cat token. It only needs a position."""

    def __init__(self):
        self.pos = START_SQUARE


class Player:
    """One player: a character, a position, items, and pending roll bonus / penalty."""

    def __init__(self, character, seat):
        self.character = character
        self.seat = seat                # seat in the lobby (0 = first)
        self.pos = START_SQUARE
        self.items = []                 # item types held (at most ITEM_MAX)
        self.cb = 0                     # pending bonus on the next roll (energy drinks, cat knock-downs)
        self.pen = 0                    # pending penalty on the next roll (stones, bricks, cat charm)
        self.cd = 0                     # Snake Charmer: 1 = recharging this turn


def hit_chance(from_square, target):
    """A bot's estimate of the chance to land on `target` with one roll from `from_square`."""
    return BOT_HIT_CHANCE if 1 <= target - from_square <= BOT_ROLL_REACH else 0.0


class Game:
    def __init__(self, characters):
        # `characters` is the list of character ids in lobby seat order.
        self.players = [Player(c, seat) for seat, c in enumerate(characters)]
        board = gen_board()
        self.L = board["L"]
        self.S = board["S"]
        self.items = []                 # items / traps lying on the board: {"type", "sq", "trap", "by"}
        self.winner = None
        self.turn_no = 0                # counts every player's turn (drives item spawning)
        self.rounds = 0                 # counts full rounds (everyone has played once)
        self.charmer = next((p for p in self.players if p.character == "charmer"), None)
        self.cat_owner = next((p for p in self.players if p.character == "cat"), None)
        self.cat = Cat() if self.cat_owner else None
        self.charmer_heads = set()      # snake heads currently standing where the Charmer put them
        self.order = []
        for _ in range(ITEM_START):
            self.spawn_item(True)

    # ------------------------------------------------------------------ small board helpers
    def resolve(self, square):
        """The square you end on after a snake or ladder (the same square if there is none)."""
        return self.S.get(square, self.L.get(square, square))

    def item_at(self, square):
        """The item (or trap) lying on a square, or None."""
        for it in self.items:
            if it["sq"] == square:
                return it
        return None

    # ------------------------------------------------------------------ BASIC MOVEMENT
    def win(self, p):
        self.winner = p

    def set_pos(self, o, n):
        """Put a piece (a player or the cat) on square n. Players may pick up items / trip on traps."""
        o.pos = n
        if o is not self.cat:
            self.land_on(o)

    def self_move(self, p, t):
        """The player moves their OWN pawn to square t."""
        if t == p.pos:
            return
        self.set_pos(p, t)

    def slide(self, p):
        """If p stands on a ladder bottom or snake head, take it (the Struggler rolls to resist first)."""
        n = p.pos
        up = self.L.get(n)
        down = self.S.get(n)
        if up:
            if p.character == "struggler":
                failures = random.sample(DIE_FACE_LIST, STRUGGLER_FAILURE_NUMBERS)
                r = d6()
                ch(p, "ladder_rolls")
                if r in failures:
                    ch(p, "ladder_failed")
                    ch(p, "ladder_failed_squares_lost", up - n)
                    return
            ch(p, "ladders_climbed")
            ch(p, "ladder_squares_gained", up - n)
            self.set_pos(p, up)
        elif down:
            if p.character == "struggler":
                r = d6()
                ch(p, "snake_rolls")
                if is_even(r):
                    ch(p, "snake_dodged")
                    ch(p, "snake_dodged_squares_saved", n - down)
                    return
            ch(p, "snake_bites")
            ch(p, "snake_squares_lost", n - down)
            if n in self.charmer_heads and self.charmer is not None:
                if p is self.charmer:
                    ch(self.charmer, "moved_head_bit_self")
                else:
                    ch(self.charmer, "moved_head_bit_opponent")
                    ch(self.charmer, "moved_head_opponent_squares", n - down)
            self.set_pos(p, down)

    def go(self, p, t):
        """Normal move for a roll: win on exactly 100, stay put past 100, otherwise take any snake / ladder."""
        if t > FINISH_SQUARE:
            return
        if t == p.pos:
            return
        self.self_move(p, t)
        if t == FINISH_SQUARE:
            self.win(p)
            return
        self.slide(p)

    def hit(self, v, new_pos, why, attacker):
        """Another player's effect moves victim v to new_pos (push, pull, nudge, cat knock-down).
        The Struggler may dodge. Returns True if v moved."""
        key = EFFECT_KEY[why]
        if new_pos == v.pos:
            return False
        ch(attacker, key + "_tried")
        if v.character == "struggler":
            r = d6()
            if is_even(r):
                ch(attacker, key + "_dodged")
                ch(v, "dodged_" + key)
                return False
            ch(v, "failed_dodge_" + key)
        before = v.pos
        ch(attacker, key + "_landed")
        self.set_pos(v, new_pos)
        if new_pos == FINISH_SQUARE:
            ch(attacker, key + "_victim_won")
            ch(attacker, key + "_victim_squares", v.pos - before)
            self.win(v)
            return True
        self.slide(v)
        ch(attacker, key + "_victim_squares", v.pos - before)
        return True

    # ------------------------------------------------------------------ BONUS / PENALTY BOOKKEEPING
    def add_buff(self, p, source, n):
        p.cb += n
        ch(p, "buff_from_" + source, n)

    def add_debuff(self, p, source, n):
        p.pen += n
        ch(p, "debuff_from_" + source, n)

    def roll_bonus(self, p):
        """Read and clear p's pending bonus / penalty. Returns bonus - penalty (added to the roll)."""
        b, d = p.cb, p.pen
        p.cb = 0
        p.pen = 0
        ch(p, "buff_points_used", b)
        ch(p, "debuff_points_used", d)
        return b - d

    def infatuate(self, v, attacker):
        """The cat charms v (-1 on their next roll). The Struggler may resist."""
        if v.character == "struggler":
            r = d6()
            if is_even(r):
                ch(attacker, "charm_resisted")
                ch(v, "resisted_charm")
                return
            ch(v, "failed_resist_charm")
        self.add_debuff(v, "charm", CAT_CHARM_PENALTY)
        ch(attacker, "charm_applied")

    # ------------------------------------------------------------------ CHARACTER LOGIC (each returns True for another turn)
    def logic_base(self, p):
        """Plain roll-and-move (also the Struggler and the Cat Lady). A 6 gives another turn."""
        r = d6()
        net = self.roll_bonus(p)
        self.go(p, p.pos + max(0, r + net))
        return r == BONUS_FACE

    def logic_bully(self, p):
        in_range = [q for q in self.players if q is not p and p.pos < q.pos <= p.pos + BULLY_RANGE]
        direction = None
        if in_range:
            direction = self.bot_bully_direction(in_range)
            ch(p, "push_chosen" if direction == "Push" else "pull_chosen")
        else:
            ch(p, "turns_nobody_in_reach")
        r = d6()
        net = self.roll_bonus(p)
        origin = p.pos
        t = origin + max(0, r + net)
        if t > FINISH_SQUARE:
            return r == BONUS_FACE
        if t == origin:
            return r == BONUS_FACE
        self.self_move(p, t)
        if t == FINISH_SQUARE:
            self.win(p)
            return False
        # Passing over players: nudge each one forward or back 1.
        passed = [q for q in self.players if q is not p and origin < q.pos < t]
        for q in passed:
            ch(p, "passed_over")
            nd = self.bot_nudge_direction(q)
            ch(p, "nudge_forward" if nd > 0 else "nudge_back")
            self.hit(q, max(START_SQUARE, q.pos + nd * NUDGE_DISTANCE), "nudged", p)
        # Landing on someone: push or pull them with a fresh roll (checked BEFORE any snake / ladder).
        others = [q for q in self.players if q is not p and q.pos == t]
        if others and direction:
            v = others[0]
            ch(p, "landed_on_player")
            x = d6()
            new_pos = v.pos + x if direction == "Push" else max(START_SQUARE, v.pos - x)
            if new_pos > FINISH_SQUARE:
                ch(p, "overpushed")
            else:
                self.hit(v, new_pos, "pushed" if direction == "Push" else "pulled", p)
        if self.winner is None:
            self.slide(p)
        return r == BONUS_FACE

    def logic_gambler(self, p):
        a, b = d6(), d6()
        again = a == BONUS_FACE and b == BONUS_FACE
        net = self.roll_bonus(p)
        need = FINISH_SQUARE - p.pos
        if again:
            ch(p, "double_sixes")
        if need < GAMBLER_EXACT_WINDOW and (a == need or b == need):
            ch(p, "exact_finish_hits")
            self.self_move(p, FINISH_SQUARE)
            self.win(p)
            return False
        if need < GAMBLER_EXACT_WINDOW and a != 1 and b != 1:
            ch(p, "near_end_no_exact")
            return again
        if a == 1 and b == 1:
            ch(p, "snake_eyes")
            return False
        if a == 1 or b == 1:
            x = b if a == 1 else a
            ch(p, "backfires")
            ch(p, "backfire_squares_lost", p.pos - max(START_SQUARE, p.pos - x))
            self.self_move(p, max(START_SQUARE, p.pos - x))
            self.slide(p)
            return False
        t = p.pos + max(0, a + b + net)
        if t > FINISH_SQUARE:
            ch(p, "overshoot_stays")
            return again
        self.self_move(p, t)
        if t == FINISH_SQUARE:
            self.win(p)
        else:
            self.slide(p)
        return again

    def logic_oracle(self, p):
        call = random.choice(DIE_FACE_LIST)      # every number is equally likely to come up, so a random call is as good as any
        r = d6()
        net = self.roll_bonus(p)
        ch(p, "calls")
        if call != r:
            self.go(p, p.pos + max(0, r + net))
            return r == BONUS_FACE
        ch(p, "correct_calls")
        bonus = rnd(*ORACLE_BONUS_DIE)
        t = p.pos + max(0, r + net) + bonus
        if t > FINISH_SQUARE:
            ch(p, "bonus_wasted_overshoot")
            return r == BONUS_FACE
        ch(p, "bonus_squares", bonus)
        self.self_move(p, t)
        if t == FINISH_SQUARE:
            self.win(p)
            return False
        if t in self.S:                          # the Oracle is immune to the snake on a right call
            ch(p, "snake_immunity")
            ch(p, "snake_immunity_squares_saved", t - self.S[t])
        else:
            self.slide(p)
        return r == BONUS_FACE

    def logic_charmer(self, p):
        if p.cd:
            p.cd = 0                             # recharging: no ability this turn
            ch(p, "recharge_turns")
        else:
            asked = False
            moved = False
            had_option = False
            while self.winner is None:
                movable = self.charmer_movable(p)
                if not movable:
                    if asked:
                        self.item_phase(p)
                    break
                asked = True
                had_option = True
                best = self.best_snake_move(p, movable, self.head_targets)
                if best is not None and best[2] >= BOT_CHARMER_MIN_GAIN:
                    head, new_head, _ = best
                    tail = self.S.pop(head)
                    self.S[new_head] = tail      # the snake keeps its tail; its head moves
                    self.charmer_heads.discard(head)
                    self.charmer_heads.add(new_head)
                    p.cd = 1
                    moved = True
                    ch(p, "ability_used")
                    self.item_phase(p)           # ability used up: any items she holds, then the roll
                    break
                idx = self.bot_pick_item(p)
                if idx is not None and self.use_item(p, idx):
                    continue                     # an item was used: look at the three choices again
                break                            # nothing useful to do: just roll
            if had_option and not moved:
                ch(p, "ability_available_not_used")
        r = d6()
        net = self.roll_bonus(p)
        self.go(p, p.pos + max(0, r + net))
        return False                             # the Charmer never gets an extra turn

    def take_turn(self, p):
        """Run the character's own turn. Returns True if they get another turn."""
        if p.character == "bully":
            return self.logic_bully(p)
        if p.character == "gambler":
            return self.logic_gambler(p)
        if p.character == "oracle":
            return self.logic_oracle(p)
        if p.character == "charmer":
            return self.logic_charmer(p)
        return self.logic_base(p)                # Struggler and Cat Lady

    # ------------------------------------------------------------------ THE CAT'S TURN
    def cat_turn(self, p):
        """The cat rolls and moves (wrapping past 100), charms everyone it jumps over and knocks down anyone it lands on."""
        again = True
        while again and self.winner is None:
            again = False
            r = d6()
            ch(p, "cat_rolls")
            origin = self.cat.pos
            path = set()                          # squares the cat jumps over
            for i in range(1, r):
                x = origin + i
                path.add(x - FINISH_SQUARE if x > FINISH_SQUARE else x)
            t = origin + r
            if t == FINISH_SQUARE:
                t = START_SQUARE
            elif t > FINISH_SQUARE:
                t -= FINISH_SQUARE
            self.set_pos(self.cat, t)
            again = r == BONUS_FACE
            for v in [q for q in self.players if q is not p and q.pos != t and q.pos in path]:
                self.infatuate(v, p)
            k = 0
            for v in [q for q in self.players if q is not p and q.pos == t]:
                new_pos = v.pos - CAT_KNOCKDOWN if v.pos > CAT_KNOCKDOWN else START_SQUARE
                if self.hit(v, new_pos, "knocked down by the cat", p):
                    k += 1
            if k:
                self.add_buff(p, "cat", CAT_BONUS_PER_HIT * k)

    # ------------------------------------------------------------------ ITEMS
    def spawn_weight(self, sq, initial, last_pos):
        """How likely a square is to get the next item."""
        if initial:
            return ITEM_START_WEIGHT if row_of(sq) < ITEM_START_ROWS else 1.0
        return 1.0 + ITEM_NEAR_BOOST * max(0.0, 1.0 - abs(sq - last_pos) / ITEM_NEAR_SQUARES)

    def spawn_item(self, initial):
        """Put a random item on a random empty square (never on a snake head, ladder bottom, pawn, cat or other item)."""
        occupied = {q.pos for q in self.players}
        if self.cat:
            occupied.add(self.cat.pos)
        free = [sq for sq in range(FIRST_ITEM_SQUARE, LAST_ITEM_SQUARE + 1)
                if sq not in self.S and sq not in self.L and self.item_at(sq) is None and sq not in occupied]
        if not free:
            return
        last_pos = min(self.players, key=lambda q: q.pos).pos      # the player furthest from 100
        weights = [self.spawn_weight(sq, initial, last_pos) for sq in free]
        r = random.random() * sum(weights)
        chosen = free[-1]
        for sq, w in zip(free, weights):
            r -= w
            if r <= 0:
                chosen = sq
                break
        item_type = random.choice(ITEM_TYPES)
        self.items.append({"type": item_type, "sq": chosen})
        T[("items", "spawned_" + item_type)] += 1

    def land_on(self, p):
        """Called whenever player p arrives on a square: trip on a trap, or pick up an item."""
        it = self.item_at(p.pos)
        if it is None:
            return
        if it.get("trap"):                        # a toy-brick trap hurts whoever steps on it, even its owner
            self.items.remove(it)
            self.add_debuff(p, "brick", BRICK_PENALTY)
            ch(p, "brick_stepped_on")
            placer = it["by"]
            if placer is p:
                ch(p, "brick_own_trap")
            else:
                ch(placer, "brick_trap_hit_opponent")
            return
        if len(p.items) < ITEM_MAX:
            self.items.remove(it)
            p.items.append(it["type"])
            ch(p, "items_picked_up")
            return
        # Hands full: swap the lowest-ranked item for the one on the ground if it is better.
        lowest = min(range(len(p.items)), key=lambda i: BOT_ITEM_KEEP_RANK[p.items[i]])
        if BOT_ITEM_KEEP_RANK[it["type"]] > BOT_ITEM_KEEP_RANK[p.items[lowest]]:
            p.items[lowest], it["type"] = it["type"], p.items[lowest]
            ch(p, "items_swapped")

    def item_phase(self, p):
        """Before rolling, a player may use their items."""
        if p.character == "charmer" and self.charmer_movable(p):
            return                                # the Charmer's own prompt handles her items
        while p.items and self.winner is None:
            idx = self.bot_pick_item(p)
            if idx is None:
                break
            if not self.use_item(p, idx):
                break

    def use_item(self, p, i):
        """Use the item in slot i. Returns False if it could not be used (nothing is spent then)."""
        kind = p.items[i]
        if kind == "drink":
            p.items.pop(i)
            self.add_buff(p, "drink", ENERGY_DRINK_BONUS)
        elif kind == "stone":
            others = [q for q in self.players if q is not p]
            if not others:
                return False
            victim = self.bot_stone_target(others)
            p.items.pop(i)
            self.add_debuff(victim, "stone", STONE_PENALTY)    # never triggers the Struggler's dodge
        elif kind == "brick":
            best = self.bot_brick_square(p)
            if best is None:
                return False
            p.items.pop(i)
            self.items.append({"type": "brick", "sq": best[0], "trap": True, "by": p})
        elif kind == "stick":
            best = self.best_snake_move(p, list(self.S), self.nudge_targets)
            if best is None:
                return False
            head, new_head, _ = best
            p.items.pop(i)
            tail = self.S.pop(head)
            self.S[new_head] = tail
            if head in self.charmer_heads:
                self.charmer_heads.discard(head)
                self.charmer_heads.add(new_head)
        else:
            return False
        ch(p, "used_" + kind)
        return True

    # ------------------------------------------------------------------ SNAKE-HEAD MOVING (Charmer and stick)
    def charmer_range(self, p):
        """Snake heads on the Charmer's row or the rows directly above / below."""
        return [h for h in self.S if abs(row_of(h) - row_of(p.pos)) <= CHARMER_ROW_REACH]

    def head_targets(self, h):
        """Free squares on head h's row where it may be moved (above its own tail, away from other snakes / ladders)."""
        tail = self.S[h]
        row0 = row_of(h)
        used = set(self.S) | set(self.S.values()) | set(self.L) | set(self.L.values())
        first = row0 * BOARD_COLS + 1
        return [n for n in range(first, first + BOARD_COLS)
                if n != h and n > tail and n > START_SQUARE and n < FINISH_SQUARE and n not in used]

    def nudge_targets(self, h):
        """Squares a stick can push head h to: free squares right next to it on its row."""
        return [n for n in self.head_targets(h) if abs(n - h) == NUDGE_DISTANCE]

    def charmer_movable(self, p):
        """Snake heads the Charmer can move right now (none while recharging)."""
        if p.cd:
            return []
        return [h for h in self.charmer_range(p) if self.head_targets(h)]

    # ==========================================================================
    #  BOT BRAINS
    # ==========================================================================
    def snake_move_gain(self, mover, head, new_head):
        """Expected squares opponents lose (minus what the mover risks) if `head` is moved to `new_head`.
        Looks one roll ahead: a player 1..6 squares behind a snake head lands on it with chance 1/6."""
        tail = self.S[head]
        drop_new = new_head - tail
        drop_old = head - tail
        gain = 0.0
        for q in self.players:
            change = hit_chance(q.pos, new_head) * drop_new - hit_chance(q.pos, head) * drop_old
            gain += -change if q is mover else change
        return gain

    def best_snake_move(self, mover, heads, targets_fn):
        """The most useful (head, new_head, gain) among the given heads, or None if nothing can move."""
        best_gain = None
        candidates = []
        for h in heads:
            for n in targets_fn(h):
                gain = self.snake_move_gain(mover, h, n)
                if best_gain is None or gain > best_gain + BOT_GAIN_TIE_EPSILON:
                    best_gain = gain
                    candidates = [(h, n)]
                elif abs(gain - best_gain) <= BOT_GAIN_TIE_EPSILON:
                    candidates.append((h, n))
        if not candidates:
            return None
        h, n = random.choice(candidates)
        return h, n, best_gain

    def bot_bully_direction(self, victims):
        """Push or Pull? Pick the direction that leaves the possible victims furthest back on average."""
        push_total = 0.0
        pull_total = 0.0
        for v in victims:
            for x in DIE_FACE_LIST:
                pushed = v.pos + x
                if pushed > FINISH_SQUARE:
                    push_end = v.pos                       # overpushed: stays put
                elif pushed == FINISH_SQUARE:
                    push_end = FINISH_SQUARE               # pushed onto 100: the victim wins
                else:
                    push_end = self.resolve(pushed)
                pull_end = self.resolve(max(START_SQUARE, v.pos - x))
                push_total += push_end - v.pos
                pull_total += pull_end - v.pos
        return "Push" if push_total < pull_total else "Pull"

    def bot_nudge_direction(self, q):
        """Nudge a passed player forward (+1) or back (-1): whichever leaves them further back."""
        ahead = q.pos + NUDGE_DISTANCE
        forward_end = FINISH_SQUARE if ahead == FINISH_SQUARE else self.resolve(ahead)
        back_end = self.resolve(max(START_SQUARE, q.pos - NUDGE_DISTANCE))
        return 1 if forward_end < back_end else -1

    def bot_stone_target(self, others):
        """Throw the stone at the player closest to the finish."""
        best = max(q.pos for q in others)
        return random.choice([q for q in others if q.pos == best])

    def bot_brick_square(self, p):
        """Best free square (own row or the rows above / below) for a toy brick, or None.
        Returns (square, score). Score = chance opponents land on it next roll minus the chance the owner does."""
        row = row_of(p.pos)
        best_score = None
        candidates = []
        for r in range(max(0, row - 1), min(LAST_ROW, row + 1) + 1):
            for c in range(BOARD_COLS):
                sq = to_n(r, c)
                if sq == FINISH_SQUARE or self.item_at(sq) is not None:
                    continue
                if any(q.pos == sq for q in self.players) or (self.cat and self.cat.pos == sq):
                    continue
                score = sum(hit_chance(q.pos, sq) for q in self.players if q is not p) - hit_chance(p.pos, sq)
                if best_score is None or score > best_score + BOT_GAIN_TIE_EPSILON:
                    best_score = score
                    candidates = [sq]
                elif abs(score - best_score) <= BOT_GAIN_TIE_EPSILON:
                    candidates.append(sq)
        if not candidates:
            return None
        return random.choice(candidates), best_score

    def bot_pick_item(self, p):
        """Which item slot should the bot use now? Returns an index, or None to carry on without using one.
        Drinks and stones are used straight away; bricks and sticks only when they are expected to pay off."""
        for i, kind in enumerate(p.items):
            if kind == "drink":
                return i
        for i, kind in enumerate(p.items):
            if kind == "stone":
                return i
            if kind == "brick":
                best = self.bot_brick_square(p)
                if best is not None and best[1] > BOT_BRICK_MIN_SCORE:
                    return i
            if kind == "stick":
                best = self.best_snake_move(p, list(self.S), self.nudge_targets)
                if best is not None and best[2] >= BOT_STICK_MIN_GAIN:
                    return i
        return None

    # ------------------------------------------------------------------ THE TURN LOOP
    def play(self):
        """Run the whole game: Charmer first, Cat Lady last, everyone else in lobby order. Repeat until someone wins."""
        self.order = sorted(self.players, key=lambda p: TURN_RANK.get(p.character, DEFAULT_TURN_RANK))
        while self.winner is None and self.rounds < MAX_ROUNDS:
            self.rounds += 1
            for p in self.order:
                if self.winner is not None:
                    break
                self.turn_no += 1
                ch(p, "turns_played")
                if self.turn_no % ITEM_EVERY == 0:
                    self.spawn_item(False)
                again = True
                while again and self.winner is None:
                    self.item_phase(p)
                    again = self.take_turn(p)
                    if again and self.winner is None:
                        ch(p, "extra_turns")
                if p.character == "cat" and self.winner is None:
                    self.cat_turn(p)


# ==============================================================================
#  RUNNING MANY GAMES
# ==============================================================================
def run_game(size):
    """Play one complete game with `size` players and add its results to the tally."""
    characters = random.sample(CHARACTER_IDS, size)       # random characters in random seat order
    g = Game(characters)
    g.play()
    T[("size", size, "games_started")] += 1
    if g.winner is None:
        T[("size", size, "unfinished")] += 1
        return
    T[("size", size, "games")] += 1
    T[("size", size, "rounds_total")] += g.rounds
    T[("len", size, g.rounds)] += 1
    T[("size", size, "turns_total")] += g.turn_no
    T[("pos", size, g.order.index(g.winner))] += 1       # which turn-order position won
    for p in g.players:
        T[("char", p.character, "games")] += 1
        T[("char", p.character, "expected_wins")] += 1.0 / size
        T[("size", size, p.character, "games")] += 1
    T[("char", g.winner.character, "wins")] += 1
    T[("size", size, g.winner.character, "wins")] += 1


def worker(job):
    """Runs one chunk of games (this is what each CPU core does). Returns that chunk's tally."""
    size, n_games, seed = job
    random.seed(seed)
    T.clear()
    for _ in range(n_games):
        run_game(size)
    return Counter(T)


# ==============================================================================
#  REPORT
# ==============================================================================
def pct(x):
    return f"{x * PERCENT:5.1f}%"


def margin_points(p, n):
    """95% margin of error of a win rate p measured over n games, in percentage points."""
    if n <= 0:
        return 0.0
    return Z_95 * math.sqrt(max(p * (1 - p), 0.0) / n) * PERCENT


def verdict(diff_points, margin):
    """Plain-words verdict for a win rate that is `diff_points` away from fair."""
    d = abs(diff_points)
    side = "stronger" if diff_points > 0 else "weaker"
    if d <= margin:
        return "OK (within random noise)"
    if d < BALANCE_WARN_POINTS:
        return f"OK (slightly {side})"
    if d < BALANCE_BAD_POINTS:
        return f">> {side} than fair"
    return f"!! MUCH {side} than fair"


def weighted_stats(pairs):
    """pairs = [(value, count)]. Returns (mean, median, p10, p90, min, max)."""
    pairs = sorted(pairs)
    total = sum(c for _, c in pairs)
    if not total:
        return (0, 0, 0, 0, 0, 0)
    mean = sum(v * c for v, c in pairs) / total

    def percentile(q):
        target = q * total
        running = 0
        for v, c in pairs:
            running += c
            if running >= target:
                return v
        return pairs[-1][0]
    return mean, percentile(0.5), percentile(0.1), percentile(0.9), pairs[0][0], pairs[-1][0]


# What to show for each character. ("count", label, key) = a total and a per-game average.
# ("ratio", label, [top keys], [bottom keys]) = a percentage. ("avg", label, total key, count key) = an average.
ABILITY_SPEC = {
    "bully": [
        ("count", "Turns he chose PUSH (someone in reach)", "push_chosen"),
        ("count", "Turns he chose PULL (someone in reach)", "pull_chosen"),
        ("count", "Turns with nobody in reach", "turns_nobody_in_reach"),
        ("count", "Landed exactly on a player (push / pull triggered)", "landed_on_player"),
        ("count", "Overpushed past 100 (no effect)", "overpushed"),
        ("count", "Pushes that landed", "push_landed"),
        ("count", "Pushes dodged by the Struggler", "push_dodged"),
        ("avg", "Average squares a pushed victim moved (after snakes / ladders)", "push_victim_squares", "push_landed"),
        ("count", "Victims pushed straight onto 100 (they won!)", "push_victim_won"),
        ("count", "Pulls that landed", "pull_landed"),
        ("count", "Pulls dodged by the Struggler", "pull_dodged"),
        ("avg", "Average squares a pulled victim moved (after snakes / ladders)", "pull_victim_squares", "pull_landed"),
        ("count", "Players passed over (nudge chances)", "passed_over"),
        ("count", "Nudged forward", "nudge_forward"),
        ("count", "Nudged back", "nudge_back"),
        ("count", "Nudges dodged by the Struggler", "nudge_dodged"),
        ("avg", "Average squares a nudged victim moved", "nudge_victim_squares", "nudge_landed"),
    ],
    "gambler": [
        ("count", "Double 6s (extra turn)", "double_sixes"),
        ("count", "Backfires (a 1 on a die: go back)", "backfires"),
        ("avg", "Average squares lost per backfire", "backfire_squares_lost", "backfires"),
        ("count", "Snake eyes (double 1s: stay put)", "snake_eyes"),
        ("count", "Exact finishes from 97-99", "exact_finish_hits"),
        ("count", "Near the end but no exact number (stayed put)", "near_end_no_exact"),
        ("count", "Overshoots past 100 (stayed put)", "overshoot_stays"),
    ],
    "cat": [
        ("count", "Cat rolls", "cat_rolls"),
        ("count", "Players charmed (-1 on next roll)", "charm_applied"),
        ("count", "Charms resisted by the Struggler", "charm_resisted"),
        ("count", "Knock-downs that landed", "knockdown_landed"),
        ("count", "Knock-downs dodged by the Struggler", "knockdown_dodged"),
        ("avg", "Average squares a knocked-down victim lost (after snakes / ladders)", "knockdown_victim_squares", "knockdown_landed"),
        ("count", "Bonus points earned for her own rolls", "buff_from_cat"),
    ],
    "struggler": [
        ("count", "Ladder rolls", "ladder_rolls"),
        ("ratio", "Ladders that failed (should be about 33%)", ["ladder_failed"], ["ladder_rolls"]),
        ("count", "Squares lost to failed ladders", "ladder_failed_squares_lost"),
        ("count", "Snake rolls", "snake_rolls"),
        ("ratio", "Snakes dodged (should be about 50%)", ["snake_dodged"], ["snake_rolls"]),
        ("count", "Squares saved by dodging snakes", "snake_dodged_squares_saved"),
        ("ratio", "Pushes / pulls / nudges / cat knock-downs dodged",
         ["dodged_push", "dodged_pull", "dodged_nudge", "dodged_knockdown"],
         ["dodged_push", "dodged_pull", "dodged_nudge", "dodged_knockdown",
          "failed_dodge_push", "failed_dodge_pull", "failed_dodge_nudge", "failed_dodge_knockdown"]),
        ("ratio", "Cat charms resisted", ["resisted_charm"], ["resisted_charm", "failed_resist_charm"]),
    ],
    "oracle": [
        ("count", "Calls made", "calls"),
        ("ratio", "Calls that were right (should be about 17%)", ["correct_calls"], ["calls"]),
        ("count", "Bonus squares gained", "bonus_squares"),
        ("avg", "Average bonus per right call", "bonus_squares", "correct_calls"),
        ("count", "Right calls wasted by overshooting 100", "bonus_wasted_overshoot"),
        ("count", "Snake bites avoided by the immunity", "snake_immunity"),
        ("count", "Squares saved by that immunity", "snake_immunity_squares_saved"),
    ],
    "charmer": [
        ("count", "Times the ability was used (snake head moved)", "ability_used"),
        ("count", "Turns the ability was ready but not worth using", "ability_available_not_used"),
        ("count", "Recharge turns", "recharge_turns"),
        ("count", "Opponents bitten on a head she moved", "moved_head_bit_opponent"),
        ("count", "Squares those opponents lost", "moved_head_opponent_squares"),
        ("count", "Herself bitten on a head she moved", "moved_head_bit_self"),
    ],
}

# Statistics shown for every character.
GENERAL_SPEC = [
    ("count", "Turns played", "turns_played"),
    ("count", "Extra turns earned", "extra_turns"),
    ("count", "Snake bites suffered", "snake_bites"),
    ("avg", "Average squares lost per bite", "snake_squares_lost", "snake_bites"),
    ("count", "Ladders climbed", "ladders_climbed"),
    ("avg", "Average squares gained per ladder", "ladder_squares_gained", "ladders_climbed"),
    ("count", "Items picked up", "items_picked_up"),
    ("count", "Items swapped (hands full)", "items_swapped"),
    ("count", "Energy drinks used", "used_drink"),
    ("count", "Stones thrown", "used_stone"),
    ("count", "Toy bricks placed", "used_brick"),
    ("count", "Sticks used", "used_stick"),
    ("count", "Stepped on a toy brick", "brick_stepped_on"),
    ("count", "Roll bonus points used (drinks, cat)", "buff_points_used"),
    ("count", "Roll penalty points suffered (stones, bricks, cat charm)", "debuff_points_used"),
]


def spec_lines(c, spec, games):
    """Turn a spec list into report lines for character c."""
    lines = []
    for item in spec:
        kind, label = item[0], item[1]
        if kind == "count":
            total = T[("char", c, item[2])]
            per_game = total / games if games else 0
            lines.append(f"  {label:<64}{total:>11,.0f}  ({per_game:.2f} per game)")
        elif kind == "avg":
            total = T[("char", c, item[2])]
            n = T[("char", c, item[3])]
            value = f"{total / n:+.2f}" if n else "n/a"
            lines.append(f"  {label:<64}{value:>11}  (over {n:,.0f})")
        elif kind == "ratio":
            top = sum(T[("char", c, k)] for k in item[2])
            bottom = sum(T[("char", c, k)] for k in item[3])
            value = f"{top / bottom * PERCENT:.1f}%" if bottom else "n/a"
            lines.append(f"  {label:<64}{value:>11}  ({top:,.0f} of {bottom:,.0f})")
    return lines


def build_report(sizes, games_per_size, seed, elapsed, processes):
    """Build the whole report as one text string, reading from the global tally T."""
    rule = "=" * REPORT_WIDTH
    thin = "-" * REPORT_WIDTH
    out = []
    add = out.append

    total_games = sum(T[("size", n, "games")] for n in sizes)
    unfinished = sum(T[("size", n, "unfinished")] for n in sizes)

    add(rule)
    add("  SNAKES, LADDERS AND CHAOS  -  BALANCE REPORT")
    add(rule)
    add(f"  Created:            {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    add(f"  Lobby sizes:        {', '.join(str(n) for n in sizes)} players")
    add(f"  Games per size:     {games_per_size:,}   (finished games in total: {total_games:,}, unfinished: {unfinished:,})")
    add(f"  Random seed:        {seed}   (run with --seed {seed} to repeat this exact run)")
    add(f"  Run time:           {elapsed:.1f} seconds on {processes} CPU core(s)")
    add(f"  Board:              {SNAKES} snakes, {LADDERS} ladders (fresh random board every game)")
    add(f"  Item numbers:       drink +{ENERGY_DRINK_BONUS}, brick -{BRICK_PENALTY}, stone -{STONE_PENALTY}, cat charm -{CAT_CHARM_PENALTY}, cat bonus +{CAT_BONUS_PER_HIT} per hit")
    add("")
    add("  HOW TO READ THIS REPORT")
    add("  * 'Fair' win rate = 1 divided by the number of players (for example 16.7% with 6).")
    add("  * 'Diff' = actual win rate minus fair, in percentage points. '+/-' is the 95% margin")
    add("    of error: a difference smaller than that is probably just luck of the dice.")
    add(f"  * '>>' = {BALANCE_WARN_POINTS:g}+ points off fair.  '!!' = {BALANCE_BAD_POINTS:g}+ points off fair.")
    add("  * Characters are drawn at random for every game, so every character meets every")
    add("    mix of opponents. Win rate = wins / games that character was in.")
    add("")

    # ---------------- overall win rates
    add(rule)
    add("  1. OVERALL WIN RATES  (all lobby sizes together)")
    add(rule)
    add(f"  {'Character':<15}{'Games':>8}{'Wins':>8}{'Win %':>8}{'Fair %':>8}{'Diff':>8}{'+/-':>6}   Verdict")
    add(thin)
    rows = []
    for c in CHARACTER_IDS:
        games = T[("char", c, "games")]
        wins = T[("char", c, "wins")]
        rate = wins / games if games else 0
        fair = T[("char", c, "expected_wins")] / games if games else 0
        diff = (rate - fair) * PERCENT
        mg = margin_points(rate, games)
        rows.append((rate, c, games, wins, fair, diff, mg))
    for rate, c, games, wins, fair, diff, mg in sorted(rows, reverse=True):
        add(f"  {CHARACTER_NAMES[c]:<15}{games:>8,}{wins:>8,}{rate * PERCENT:>7.1f}%{fair * PERCENT:>7.1f}%{diff:>+8.1f}{mg:>6.1f}   {verdict(diff, mg)}")
    add("")

    # ---------------- per lobby size
    add(rule)
    add("  2. WIN RATES BY LOBBY SIZE")
    add(rule)
    for n in sizes:
        games_n = T[("size", n, "games")]
        fair = 1.0 / n
        add(f"  {n} players  ({games_n:,} games, fair = {fair * PERCENT:.1f}%)")
        add(f"  {'Character':<15}{'Games':>8}{'Wins':>8}{'Win %':>8}{'Diff':>8}{'+/-':>6}   Verdict")
        size_rows = []
        for c in CHARACTER_IDS:
            g = T[("size", n, c, "games")]
            w = T[("size", n, c, "wins")]
            rate = w / g if g else 0
            size_rows.append((rate, c, g, w))
        for rate, c, g, w in sorted(size_rows, reverse=True):
            diff = (rate - fair) * PERCENT
            mg = margin_points(rate, g)
            add(f"  {CHARACTER_NAMES[c]:<15}{g:>8,}{w:>8,}{rate * PERCENT:>7.1f}%{diff:>+8.1f}{mg:>6.1f}   {verdict(diff, mg)}")
        add("")

    # ---------------- game length
    add(rule)
    add("  3. GAME LENGTH  (a round = every player has had one turn)")
    add(rule)
    add(f"  {'Players':<9}{'Average':>9}{'Median':>8}{'Shortest':>10}{'Longest':>9}{'Fast 10%':>10}{'Slow 10%':>10}{'Unfinished':>12}")
    for n in sizes:
        pairs = [(k[2], v) for k, v in T.items() if k[0] == "len" and k[1] == n]
        mean, median, p10, p90, lo, hi = weighted_stats(pairs)
        add(f"  {n:<9}{mean:>9.1f}{median:>8}{lo:>10}{hi:>9}{p10:>10}{p90:>10}{T[('size', n, 'unfinished')]:>12,}")
    add("  ('Fast 10%' = 1 game in 10 ends within that many rounds; 'Slow 10%' = 1 in 10 lasts longer.)")
    add("")

    # ---------------- turn order
    add(rule)
    add("  4. WINS BY TURN-ORDER POSITION")
    add(rule)
    add("  Position 1 plays first. NOTE: the Snake Charmer is always first and the Cat Lady always")
    add("  last, so these figures mix 'seat' and 'character'. Use them to spot a big first / last")
    add("  mover effect, not to judge single characters.")
    for n in sizes:
        games_n = T[("size", n, "games")]
        parts = []
        for i in range(n):
            w = T[("pos", n, i)]
            parts.append(f"#{i + 1}: {w / games_n * PERCENT:4.1f}%" if games_n else f"#{i + 1}: n/a")
        add(f"  {n} players (fair {PERCENT / n:.1f}% each):  " + "   ".join(parts))
    add("")

    # ---------------- abilities
    add(rule)
    add("  5. ABILITIES  (totals over all games, and the average per game the character played)")
    add(rule)
    for c in CHARACTER_IDS:
        games = T[("char", c, "games")]
        add(f"  {CHARACTER_NAMES[c].upper()}   (played in {games:,} games)")
        add(thin)
        out.extend(spec_lines(c, ABILITY_SPEC[c], games))
        add("")

    # ---------------- general stats
    add(rule)
    add("  6. EVERYTHING ELSE, PER CHARACTER  (total, and average per game played)")
    add(rule)
    for c in CHARACTER_IDS:
        games = T[("char", c, "games")]
        add(f"  {CHARACTER_NAMES[c].upper()}")
        add(thin)
        out.extend(spec_lines(c, GENERAL_SPEC, games))
        add("")

    # ---------------- items
    add(rule)
    add("  7. ITEMS  (all characters together)")
    add(rule)
    add(f"  {'Item':<14}{'Appeared':>10}{'Used':>10}{'Used %':>9}")
    for kind in ITEM_TYPES:
        spawned = T[("items", "spawned_" + kind)]
        used = sum(T[("char", c, "used_" + kind)] for c in CHARACTER_IDS)
        add(f"  {kind:<14}{spawned:>10,}{used:>10,}{(used / spawned * PERCENT if spawned else 0):>8.1f}%")
    placed = sum(T[("char", c, "used_brick")] for c in CHARACTER_IDS)
    stepped = sum(T[("char", c, "brick_stepped_on")] for c in CHARACTER_IDS)
    own = sum(T[("char", c, "brick_own_trap")] for c in CHARACTER_IDS)
    opp = sum(T[("char", c, "brick_trap_hit_opponent")] for c in CHARACTER_IDS)
    add(f"  Toy brick traps placed: {placed:,}.  Stepped on by an opponent: {opp:,}.  By their own placer: {own:,}.")
    add(f"  ({placed - stepped:,} traps were still on the board when the game ended.)")
    add("  'Appeared' counts every item spawned, including the starting items; items that nobody")
    add("  picks up or uses before the game ends are normal.")
    add("")

    # ---------------- notes
    add(rule)
    add("  8. NOTES ON THE SIMULATED PLAYERS")
    add(rule)
    add("  * Bully: chooses Push or Pull by whichever leaves the players in reach furthest back on")
    add("    average (looking at snakes and ladders); nudges each passed player the worse way for them.")
    add("  * Snake Charmer: moves a head only when it is expected to cost the others at least")
    add(f"    {BOT_CHARMER_MIN_GAIN:g} square(s) more than it costs her (one roll ahead); uses the ability whenever it is ready and worth it.")
    add("  * Oracle calls a random number; Struggler picks random failure numbers (neither changes the odds).")
    add("  * Items: drinks and stones are used at once (stones hit the leader); bricks go where opponents")
    add(f"    are likelier to step than the owner; sticks are used when worth >= {BOT_STICK_MIN_GAIN:g} square(s).")
    add("  * Stone and cat-charm penalties were not in config.js, so -1 each was assumed (see top of script).")
    add(rule)
    return "\n".join(out) + "\n"


# ==============================================================================
#  MAIN PROGRAM
# ==============================================================================
def parse_sizes(text):
    """'2,3,6' -> [2, 3, 6] (checked against the game's limits)."""
    sizes = []
    for part in text.split(","):
        n = int(part.strip())
        if not 2 <= n <= len(CHARACTER_IDS):
            raise argparse.ArgumentTypeError(f"lobby size {n} must be between 2 and {len(CHARACTER_IDS)}")
        if n not in sizes:
            sizes.append(n)
    return sorted(sizes)


def main():
    parser = argparse.ArgumentParser(description="Balance simulator for Snakes, Ladders and Chaos")
    parser.add_argument("--games", type=int, default=DEFAULT_GAMES_PER_SIZE, help="games to play for EACH lobby size")
    parser.add_argument("--sizes", type=parse_sizes, default=DEFAULT_LOBBY_SIZES, help="lobby sizes, e.g. 2,3,4,5,6")
    parser.add_argument("--seed", type=int, default=None, help="random seed (use the same number to repeat a run)")
    parser.add_argument("--processes", type=int, default=cpu_count(), help="CPU cores to use")
    args = parser.parse_args()
    if args.games < 1:
        parser.error("--games must be at least 1")
    if args.processes < 1:
        parser.error("--processes must be at least 1")

    seed = args.seed if args.seed is not None else random.randrange(10 ** 9)
    jobs = []
    index = 0
    for size in args.sizes:
        left = args.games
        while left > 0:
            n = min(CHUNK_SIZE, left)
            jobs.append((size, n, seed * CHUNK_SEED_STRIDE + index))
            index += 1
            left -= n

    total = args.games * len(args.sizes)
    print(f"Simulating {total:,} games ({args.games:,} for each of {len(args.sizes)} lobby size(s)) on {args.processes} core(s)...")
    start = time.time()
    merged = Counter()
    done = 0
    finished_chunks = 0
    if args.processes <= 1:
        results = (worker(j) for j in jobs)
        pool = None
    else:
        pool = Pool(args.processes)
        results = pool.imap_unordered(worker, jobs)
    for part in results:
        merged.update(part)
        done += sum(v for k, v in part.items() if k[0] == "size" and len(k) == 3 and k[2] == "games_started")
        finished_chunks += 1
        if finished_chunks % PROGRESS_STEP == 0 or finished_chunks == len(jobs):
            print(f"\r  {done:,} / {total:,} games  ({done / total * PERCENT:.0f}%)", end="", flush=True)
    if pool:
        pool.close()
        pool.join()
    print()
    elapsed = time.time() - start

    T.clear()
    T.update(merged)
    report = build_report(args.sizes, args.games, seed, elapsed, args.processes)

    here = os.path.dirname(os.path.abspath(__file__))
    latest = os.path.join(here, REPORT_FILE)
    folder = os.path.join(here, REPORT_FOLDER)
    os.makedirs(folder, exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    saved = os.path.join(folder, f"balance_report_{stamp}.txt")
    for path in (latest, saved):
        with open(path, "w", encoding="utf-8") as f:
            f.write(report)

    # Show the headline table on screen too.
    headline = report.split("  2. WIN RATES BY LOBBY SIZE")[0]
    print(headline[headline.index("  1. OVERALL"):].rsplit("=" * REPORT_WIDTH, 1)[0])
    print(f"Full report saved to:\n  {latest}\n  {saved}")


if __name__ == "__main__":
    freeze_support()          # needed on Windows when using several CPU cores
    sys.exit(main())
