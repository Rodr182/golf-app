import React, { useState, useEffect, useMemo, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

/* Cliente Supabase. Si config.js no tiene credenciales, la app corre en
   MODO LOCAL (datos en el navegador). Con credenciales, corre en MODO NUBE:
   cuentas seguras con Supabase Auth y datos compartidos entre todos. */
const sb = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const CLOUD = !!sb;

/* ============================================================
   GolfBuddy — Modo de juego "MACHETERO"
   Motor de cálculo verificado contra el ejemplo del documento.
   ============================================================ */

/* ---------------- MOTOR DE CÁLCULO ---------------- */
const rnd = (x) => Math.sign(x) * Math.round(Math.abs(x));
const adjustedHcp = (hcp, rulePct) => rnd(hcp * (rulePct / 100));
const strokesOnHole = (ph, si) => (ph < si ? 0 : 1 + Math.floor((ph - si) / 18));
const netScores = (gross, ph, si) => { const h = Math.min(ph, 18); return gross.map((g, i) => g - strokesOnHole(h, si[i])); };
const playOrder = (start) => Array.from({ length: 18 }, (_, i) => (start - 1 + i) % 18);
const sumRange = (a, i, j) => a.slice(i, j).reduce((s, x) => s + x, 0);

// opts opcional: { tieOnly: Set(holeIdx 0-based), strokeFlag: {key:[18]bool} }
// Regla 8: en los hoyos tie-only, el neto de quien recibe stroke no puede bajar del
// mejor neto de quien NO recibe stroke (el stroke solo sirve para empatar, no para ganar).
function pointsPerHole(nets, opts) {
  const tieOnly = opts && opts.tieOnly ? opts.tieOnly : null;
  const strokeFlag = (opts && opts.strokeFlag) || {};
  const pts = {};
  nets.forEach((n) => (pts[n.key] = new Array(18).fill(0)));
  for (let h = 0; h < 18; h++) {
    const eff = {};
    if (tieOnly && tieOnly.has(h)) {
      // El hoyo se decide por GROSS; el stroke solo permite EMPATAR (no ganar).
      // gross = net + 1 si recibió stroke (en estos par 3 hay a lo más 1 stroke).
      const gross = {};
      nets.forEach((n) => { gross[n.key] = n.net[h] + ((strokeFlag[n.key] && strokeFlag[n.key][h]) ? 1 : 0); });
      let bestGross = Infinity;
      nets.forEach((n) => { if (gross[n.key] < bestGross) bestGross = gross[n.key]; });
      nets.forEach((n) => {
        const got = strokeFlag[n.key] && strokeFlag[n.key][h];
        if (gross[n.key] === bestGross) pts[n.key][h] = 1;          // gana o empata por gross
        else if (got && gross[n.key] - 1 <= bestGross) pts[n.key][h] = 1; // el stroke alcanza solo para empatar
      });
      continue;
    } else {
      nets.forEach((n) => (eff[n.key] = n.net[h]));
    }
    let min = Infinity;
    nets.forEach((n) => { if (eff[n.key] < min) min = eff[n.key]; });
    nets.forEach((n) => { if (eff[n.key] === min) pts[n.key][h] = 1; });
  }
  return pts;
}

function computeBye(pts, start, keys) {
  const order = playOrder(start);
  const run = {}; keys.forEach((k) => (run[k] = 0));
  let clinch = -1;
  for (let pos = 0; pos < 18; pos++) {
    const h = order[pos];
    keys.forEach((k) => (run[k] += pts[k][h]));
    const remaining = 17 - pos;
    const vals = keys.map((k) => run[k]).sort((a, b) => b - a);
    const lead = vals[0], second = vals[1] ?? -Infinity;
    if (remaining > 0 && lead - second > remaining) { clinch = pos; break; }
  }
  if (clinch === -1) return { active: false, holes: [], points: {} };
  const holes = order.slice(clinch + 1);
  const points = {};
  keys.forEach((k) => (points[k] = holes.reduce((s, h) => s + pts[k][h], 0)));
  return { active: true, holes, points };
}

function resolveBet(seg, tokens, weight) {
  const keys = Object.keys(seg);
  const total = keys.reduce((s, k) => s + weight[k], 0);
  let max = -Infinity; keys.forEach((k) => { if (seg[k] > max) max = seg[k]; });
  const winners = keys.filter((k) => seg[k] === max);
  const wPlayers = winners.reduce((s, k) => s + weight[k], 0);
  const pot = (total - wPlayers) * tokens;
  const perWinner = wPlayers > 0 ? pot / wPlayers : 0;
  const res = {};
  keys.forEach((k) => (res[k] = winners.includes(k) ? perWinner : -tokens));
  return { res, winners, wPlayers, total, max };
}

/* Resuelve concurso completo. Devuelve por contestant: {front,back,match,bye,total} + meta */
function resolveContest(nets, start, bet, opts) {
  const keys = nets.map((n) => n.key);
  const weight = {}; nets.forEach((n) => (weight[n.key] = n.weight ?? 1));
  const pts = pointsPerHole(nets, opts);
  const front = {}, back = {}, match = {};
  keys.forEach((k) => {
    front[k] = sumRange(pts[k], 0, 9);
    back[k] = sumRange(pts[k], 9, 18);
    match[k] = sumRange(pts[k], 0, 18);
  });
  const startsBack = start === 10;
  const firstSeg = startsBack ? back : front;
  const firstName = startsBack ? "back" : "front";
  const secondName = startsBack ? "front" : "back";
  const secondSeg = startsBack ? front : back;
  const out = {}; keys.forEach((k) => (out[k] = { front: 0, back: 0, match: 0, bye: 0 }));
  const meta = { order: [firstName, secondName, "match", "bye"], carryOver: false, secondVoid: false, matchVoid: false, byeVoid: false, byeActive: false, byeHoles: [], winners: {} };

  let matchTokens = bet.match;
  const f = resolveBet(firstSeg, bet[firstName], weight);
  meta.winners[firstName] = f.winners;
  if (f.wPlayers > f.total / 2) { meta.carryOver = true; matchTokens += bet[firstName]; }
  else keys.forEach((k) => (out[k][firstName] = f.res[k]));

  const s = resolveBet(secondSeg, bet[secondName], weight);
  meta.winners[secondName] = s.winners;
  meta.secondVoid = s.wPlayers > s.total / 2;
  if (!meta.secondVoid) keys.forEach((k) => (out[k][secondName] = s.res[k]));

  const m = resolveBet(match, matchTokens, weight);
  meta.winners.match = m.winners; meta.matchTokens = matchTokens;
  if (m.wPlayers > m.total / 2) { meta.matchVoid = true; }
  else keys.forEach((k) => (out[k].match = m.res[k]));

  if (!meta.matchVoid) {
    const bye = computeBye(pts, start, keys);
    if (bye.active) {
      meta.byeActive = true; meta.byeHoles = bye.holes.map((h) => h + 1);
      const b = resolveBet(bye.points, bet.bye, weight);
      meta.winners.bye = b.winners;
      if (b.wPlayers > b.total / 2) meta.byeVoid = true;
      else keys.forEach((k) => (out[k].bye = b.res[k]));
    }
  }
  keys.forEach((k) => (out[k].total = out[k].front + out[k].back + out[k].match + out[k].bye));
  return { perContestant: out, points: pts, segments: { front, back, match }, meta };
}

/* Calcula un evento completo (varios equipos). Devuelve breakdown por jugador. */
function computeEvent(event, course, rules) {
  const { teams } = event;
  const si = course.strokes;
  const bet = rules.bet;
  // Regla 8 (opcional): hoyos donde el stroke solo empata. Aplica a concursos individuales.
  const tieOnly = rules.regla8 && course.tieOnlyHoles && course.tieOnlyHoles.length
    ? new Set(course.tieOnlyHoles.map((h) => h - 1)) : null;
  const strokeFlagFor = (idPhPairs) => {
    if (!tieOnly) return undefined;
    const flag = {};
    idPhPairs.forEach(({ key, ph }) => { flag[key] = si.map((s) => strokesOnHole(Math.min(ph, 18), s) > 0); });
    return { tieOnly, strokeFlag: flag };
  };
  // adjusted handicaps
  const adj = {}; const playerName = {};
  teams.forEach((t) => t.players.forEach((p) => { adj[p.id] = adjustedHcp(p.hcp, rules.rulePct); playerName[p.id] = p.name; }));

  const money = {}; const detail = {};
  const allIds = [];
  teams.forEach((t) => t.players.forEach((p) => { money[p.id] = { team: 0, group: 0 }; detail[p.id] = { contests: [] }; allIds.push(p.id); }));

  const breakdown = []; // "cómo se ganó": standings + puntos por hoyo de cada concurso
  const mkBreakdown = (scope, name, start, res, contestants) => {
    const byeSet = new Set((res.meta.byeHoles || []).map((h) => h - 1));
    const cs = contestants.map((c) => {
      const pts = res.points[c.key];
      return {
        key: c.key, label: c.label, members: c.members || [],
        points: pts,
        frontPts: res.segments.front[c.key],
        backPts: res.segments.back[c.key],
        matchPts: res.segments.match[c.key],
        byePts: pts.reduce((s, v, h) => s + (byeSet.has(h) ? v : 0), 0),
      };
    });
    breakdown.push({ scope, name, start, meta: res.meta, contestants: cs });
  };

  /* ----- CONCURSOS POR EQUIPO ----- */
  teams.forEach((t) => {
    const base = Math.min(...t.players.map((p) => adj[p.id]));
    const ph = {}; t.players.forEach((p) => (ph[p.id] = adj[p.id] - base));
    const net = {}; t.players.forEach((p) => (net[p.id] = netScores(p.gross, ph[p.id], si)));
    t._teamBase = base; t._ph = ph; t._net = net;

    // Team Individual
    const iNets = t.players.map((p) => ({ key: "" + p.id, net: net[p.id], weight: 1 }));
    const ind = resolveContest(iNets, t.start, bet, strokeFlagFor(t.players.map((p) => ({ key: "" + p.id, ph: ph[p.id] }))));
    t.players.forEach((p) => {
      money[p.id].team += ind.perContestant["" + p.id].total;
      detail[p.id].contests.push({ name: "Individual interno", scope: "equipo", ...ind.perContestant["" + p.id], meta: ind.meta });
    });
    mkBreakdown("equipo", `Individual interno · Grupo ${t.id}`, t.start, ind, t.players.map((p) => ({ key: "" + p.id, label: p.name })));

    // Team Pairs. 4 jugadores: 1 match (2 parejas). 5 jugadores: 3 matches rotativos
    // (AB vs ZX, AC vs ZX, BC vs ZX) con pareja fija = los 2 primeros. Misma repartición de caminos.
    const ps = t.players.map((p) => p.id);
    let pairMatches = [];
    if (ps.length === 4) {
      const prs = t.pairs && t.pairs.length === 2 ? t.pairs : autoPairsIds(ps);
      if (prs.length === 2) pairMatches = [{ label: "Parejas", pairs: prs }];
    } else if (ps.length === 5) {
      const fixed = [ps[0], ps[1]];
      const rot = [ps[2], ps[3], ps[4]];
      pairMatches = [[rot[0], rot[1]], [rot[0], rot[2]], [rot[1], rot[2]]].map((c) => ({
        label: `${playerName[c[0]]}&${playerName[c[1]]} vs ${playerName[fixed[0]]}&${playerName[fixed[1]]}`,
        pairs: [c, fixed],
      }));
    }
    pairMatches.forEach((mt, mi) => {
      const pNets = mt.pairs.map((pr, i) => {
        const n = si.map((_, h) => Math.min(...pr.map((pid) => net[pid][h])));
        return { key: "PR" + mi + "_" + i, net: n, weight: 1, members: pr };
      });
      const pr = resolveContest(pNets, t.start, bet);
      const label = ps.length === 5 ? `Parejas ${mi + 1}` : "Parejas";
      pNets.forEach((pn) => pn.members.forEach((pid) => {
        money[pid].team += pr.perContestant[pn.key].total;
        detail[pid].contests.push({ name: label, scope: "equipo", ...pr.perContestant[pn.key], meta: pr.meta, pairWith: pn.members.filter((x) => x !== pid).map((x) => playerName[x]) });
      }));
      mkBreakdown("equipo", `${label} · Equipo ${t.id}`, t.start, pr, pNets.map((pn) => ({ key: pn.key, label: pn.members.map((x) => playerName[x]).join(" & "), members: pn.members })));
    });
  });

  /* ----- CONCURSOS POR EVENTO ----- */
  const eventBase = Math.min(...allIds.map((id) => adj[id]));
  const gph = {}; allIds.forEach((id) => (gph[id] = adj[id] - eventBase));
  const gnet = {}; teams.forEach((t) => t.players.forEach((p) => (gnet[p.id] = netScores(p.gross, gph[p.id], si))));
  const votes = teams.reduce((s, t) => s + (t.start === 1 ? 1 : -1), 0);
  const eventStart = votes >= 0 ? 1 : 10;

  // Group Individual
  const giNets = allIds.map((id) => ({ key: "" + id, net: gnet[id], weight: 1 }));
  const gi = resolveContest(giNets, eventStart, bet, strokeFlagFor(allIds.map((id) => ({ key: "" + id, ph: gph[id] }))));
  allIds.forEach((id) => {
    money[id].group += gi.perContestant["" + id].total;
    detail[id].contests.push({ name: "Individual general", scope: "evento", ...gi.perContestant["" + id], meta: gi.meta });
  });
  mkBreakdown("evento", "Individual general", eventStart, gi, allIds.map((id) => ({ key: "" + id, label: playerName[id] })));

  // Teams vs Teams. Para 3 jug se presta un jugador (team.loanPlayerId) y para 5 se elimina uno (team.dropPlayerId).
  if (teams.length > 1) {
    const tvtNets = teams.map((t) => {
      let parts = t.players.map((p) => p.id);
      if (parts.length === 3) {
        const others = allIds.filter((id) => !parts.includes(id));
        const loan = (t.loanPlayerId && others.includes(t.loanPlayerId)) ? t.loanPlayerId : others[0];
        if (loan) parts = [...parts, loan];
      } else if (parts.length === 5) {
        const drop = (t.dropPlayerId && parts.includes(t.dropPlayerId)) ? t.dropPlayerId : parts[parts.length - 1];
        parts = parts.filter((id) => id !== drop);
      }
      const n = si.map((_, h) => Math.min(...parts.map((pid) => gnet[pid][h])));
      return { key: "T" + t.id, net: n, weight: t.players.length, members: t.players.map((p) => p.id), _parts: parts };
    });
    const tvt = resolveContest(tvtNets, eventStart, bet);
    teams.forEach((t) => t.players.forEach((p) => {
      money[p.id].group += tvt.perContestant["T" + t.id].total;
      detail[p.id].contests.push({ name: "Grupos vs. Grupos", scope: "evento", ...tvt.perContestant["T" + t.id], meta: tvt.meta });
    }));
    mkBreakdown("evento", "Grupos vs. Grupos", eventStart, tvt, tvtNets.map((tn) => ({ key: tn.key, label: "Grupo " + tn.key.slice(1), members: tn.members })));
  }

  // Medal: gana el menor score neto TOTAL (gross total − hcp ajustado al % del Medal). Configurable por comunidad.
  const medalTokens = rules.medal && rules.medal.tokens ? rules.medal.tokens : 0;
  if (medalTokens > 0 && allIds.length > 1) {
    const medalPct = rules.medal.rulePct ?? 100;
    const netTotal = {}; const playerMap = {};
    teams.forEach((t) => t.players.forEach((p) => {
      const gt = p.gross.reduce((s, g) => s + g, 0);
      netTotal[p.id] = gt - adjustedHcp(p.hcp, medalPct); playerMap[p.id] = p;
    }));
    let best = Infinity; allIds.forEach((id) => { if (netTotal[id] < best) best = netTotal[id]; });
    const winners = allIds.filter((id) => netTotal[id] === best);
    const majority = winners.length > allIds.length / 2;
    allIds.forEach((id) => {
      let tok = 0;
      if (!majority) tok = winners.includes(id) ? ((allIds.length - winners.length) * medalTokens) / winners.length : -medalTokens;
      money[id].group += tok;
      detail[id].contests.push({ name: "Medal", scope: "evento", medal: true, front: 0, back: 0, match: 0, bye: 0, total: tok, meta: { medalVoid: majority, netTotal: netTotal[id], rulePct: medalPct } });
    });
  }

  // money en soles
  const rows = allIds.map((id) => {
    const teamTok = money[id].team, groupTok = money[id].group, tot = teamTok + groupTok;
    return {
      id, name: playerName[id], adj: adj[id],
      teamTok, groupTok, totalTok: tot,
      teamMoney: teamTok * rules.tokenValue,
      groupMoney: groupTok * rules.tokenValue,
      totalMoney: tot * rules.tokenValue,
      contests: detail[id].contests,
    };
  });
  return { rows, eventStart, tokenValue: rules.tokenValue, breakdown };
}

/* ---------------- DATOS DE EJEMPLO ---------------- */
const EXAMPLE_COURSE = {
  id: "asia",
  name: "Asia Golf",
  pars: [5, 4, 4, 4, 3, 5, 4, 3, 4, 4, 4, 5, 3, 4, 4, 3, 4, 5],
  strokes: [15, 9, 5, 7, 13, 11, 3, 17, 1, 2, 8, 12, 14, 10, 6, 18, 4, 16],
};
// Los Inkas Golf Club (Lima, Perú) — par 72. Pares y stroke index oficiales
// según la tarjeta del programa KFB (hoja "Reglas").
const LOS_INKAS_COURSE = {
  id: "losinkas",
  name: "Golf Los Inkas",
  location: "Monterrico, Lima · Perú",
  pars:    [4, 4, 5, 3, 4, 3, 4, 5, 4, 4, 4, 4, 3, 5, 4, 5, 3, 4],
  strokes: [9, 13, 5, 15, 1, 17, 11, 3, 7, 8, 10, 14, 18, 12, 2, 4, 16, 6],
  tieOnlyHoles: [6, 13], // Regla 8: par 3 donde el stroke solo empata (si la comunidad la activa)
};

const EXAMPLE_COMMUNITY = {
  id: "amarillo65",
  name: "Amarillo 65",
  gameMode: "Machetero",
  rulePct: 85,
  tokenValue: 5,
  currency: "S/.",
  bet: { front: 2, back: 2, match: 3, bye: 1 },
  medal: { tokens: 0, rulePct: 100 },
  regla8: false,
  admin: "P1",
  admins: [],
  members: ["demo","P1","P2","P3","P4","P5","P6","P7","P8","P9","P10","P11","P12"],
};

/* Resuelve el nombre legible de un id de miembro/participante */
function resolveName(id, players) {
  const u = players.find((p) => p.id === id);
  if (u) return (u.name + (u.last ? " " + u.last : "")).trim();
  const m = /^P(\d+)$/.exec(id);
  if (m) return "Player " + m[1];
  return id;
}
const isAdmin = (community, meId) => community.admin === meId || (community.admins || []).includes(meId);
const autoPairsIds = (ids) => (ids.length === 4 ? [[ids[0], ids[1]], [ids[2], ids[3]]] : []);
// Barajado justo (Fisher-Yates) para el sorteo de parejas en el tee
const shuffleIds = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
// Orden efectivo de un grupo: el sorteado si existe y sigue vigente
const groupOrder = (g) => (g.drawnOrder && g.drawnOrder.length === g.playerIds.length && g.drawnOrder.every((id) => g.playerIds.includes(id)) ? g.drawnOrder : g.playerIds);

/* Money list de una comunidad: acumula por participante en todas sus rondas */
function communityMoneyList(communityId, rounds) {
  const agg = {};
  rounds.filter((r) => r.communityId === communityId).forEach((r) => {
    r.results.rows.forEach((row) => {
      const a = agg[row.id] || (agg[row.id] = { id: row.id, name: row.name, total: 0, rounds: 0, best: -Infinity, worst: Infinity });
      a.total += row.totalMoney; a.rounds++;
      a.best = Math.max(a.best, row.totalMoney); a.worst = Math.min(a.worst, row.totalMoney);
    });
  });
  return Object.values(agg).sort((x, y) => y.total - x.total);
}

/* Money list del jugador agrupada por comunidad */
function playerMoneyByCommunity(meId, rounds) {
  const byComm = {};
  rounds.forEach((r) => {
    const row = r.results.rows.find((x) => x.id === meId);
    if (!row) return;
    const b = byComm[r.communityId] || (byComm[r.communityId] = { communityId: r.communityId, total: 0, rounds: 0, best: -Infinity, worst: Infinity });
    b.total += row.totalMoney; b.rounds++;
    b.best = Math.max(b.best, row.totalMoney); b.worst = Math.min(b.worst, row.totalMoney);
  });
  return Object.values(byComm);
}

/* Estadísticas de scoring del jugador (vs par) sobre todas sus rondas */
const SCORE_CATS = [
  ["eagle", "Águila o mejor", "#1f7a4d"], ["birdie", "Birdie", "#3fa46a"],
  ["par", "Par", "#0f3d2e"], ["bogey", "Bogey", "#d4a843"],
  ["double", "Doble bogey", "#ca8a3a"], ["triple", "Más de doble", "#b4452f"],
];
function scoreCat(gross, par) {
  const d = gross - par;
  if (d <= -2) return "eagle";
  if (d === -1) return "birdie";
  if (d === 0) return "par";
  if (d === 1) return "bogey";
  if (d === 2) return "double";
  return "triple";
}
function playerScoreStats(meId, rounds, courses) {
  const counts = { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0, triple: 0 };
  let holes = 0;
  rounds.forEach((r) => {
    const course = courses.find((c) => c.id === r.courseId);
    if (!course) return;
    r.teams.forEach((t) => t.players.forEach((p) => {
      if (p.id !== meId) return;
      p.gross.forEach((g, h) => { if (g != null && g !== "") { counts[scoreCat(g, course.pars[h])]++; holes++; } });
    }));
  });
  return { counts, holes };
}
/* Movimiento del hándicap del jugador a lo largo de las rondas (más antiguo primero) */
function playerHcpHistory(meId, rounds) {
  const hist = [];
  [...rounds].reverse().forEach((r) => {
    r.teams.forEach((t) => t.players.forEach((p) => { if (p.id === meId) hist.push({ date: r.date, hcp: p.hcp, communityId: r.communityId }); }));
  });
  return hist;
}
const EX_HCP = { 1:5,2:10,3:10,4:1,5:18,6:13,7:15,8:20,9:10,10:-1,11:15 };
const EX_GROSS = {
  1:[5,5,4,4,3,5,5,3,5,5,4,4,3,5,5,4,4,5],
  2:[6,5,4,4,3,5,4,3,5,5,5,5,3,5,5,4,5,5],
  3:[6,5,4,4,3,5,5,3,5,5,5,5,3,5,5,3,5,5],
  4:[5,4,4,4,3,5,4,3,4,4,4,5,3,4,4,3,4,5],
  5:[6,5,5,5,4,6,5,4,5,5,5,6,4,5,5,4,5,6],
  6:[5,4,4,6,4,5,5,3,5,5,7,5,3,4,4,3,5,5],
  7:[6,5,5,5,4,6,5,4,5,5,7,5,3,4,4,3,5,5],
  8:[6,5,5,5,4,6,5,4,5,5,5,6,4,5,5,4,5,6],
  9:[6,4,5,5,4,5,5,4,5,5,5,6,4,4,5,4,5,5],
  10:[5,4,4,4,3,5,4,3,4,4,4,5,3,4,4,3,4,5],
  11:[6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6],
};
const buildExampleEvent = () => ({
  id: "ex-" + Date.now(),
  courseId: "asia",
  communityId: "amarillo65",
  date: "2025-02-10",
  teams: [
    { id: 1, start: 1, players: [1,2,3,4].map((i)=>({id:"P"+i,name:"Player "+i,hcp:EX_HCP[i],gross:EX_GROSS[i]})), pairs: [["P1","P3"],["P2","P4"]] },
    { id: 2, start: 10, players: [5,6,7,8].map((i)=>({id:"P"+i,name:"Player "+i,hcp:EX_HCP[i],gross:EX_GROSS[i]})), pairs: [["P5","P6"],["P7","P8"]] },
    { id: 3, start: 1, players: [9,10,11].map((i)=>({id:"P"+i,name:"Player "+i,hcp:EX_HCP[i],gross:EX_GROSS[i]})), pairs: [] },
  ],
});

/* ---- Roster real "Korn Ferry Boys" (del Excel KFB 2026) para demos ---- */
const KFB_ROSTER = [
  ["Mauricio", "Melendez", 0], ["Diego", "Guinea", 6], ["Rodrigo", "Gastelumendi", 6],
  ["Boris", "Ljubicic", 12], ["Rodrigo", "Arana", 8], ["Pablo", "Caceres", 5],
  ["Pablo", "Lupis", 9], ["Iago", "Bellatin", 3], ["Alessandro", "Morachimo", 12],
  ["Santiago", "Rubio", 7], ["Carlo", "Bellatin", 8], ["Sebastian", "Moreno", 3],
  ["Diego", "Bustamante", 12], ["Joaquin", "Corzo", 1], ["Julian", "Vasquez", 5],
  ["Santiago", "Zubiate", 0], ["Joel", "Nawrocki", 3], ["Daniel", "Antunez", 4],
  ["Rodrigo", "Horna", 13], ["Oscar", "Lauz", 6], ["Jaime", "Tagle", 4],
  ["Gino", "Michilot", 8], ["Gonzalo", "Urbina", 3], ["Aldo", "Amianto", 9],
  ["Javier", "Ludoweig", 6],
];
const KFB_PLAYERS = KFB_ROSTER.map(([name, last, hcp], i) => ({
  id: "kfb" + String(i + 1).padStart(2, "0"), name, last, hcp, demo: true,
}));
const KORN_FERRY_COMMUNITY = {
  id: "kfb",
  name: "Korn Ferry Boys",
  gameMode: "Machetero",
  rulePct: 75,            // Regla 4: se juega al 75% del hándicap
  tokenValue: 5,
  currency: "S/.",
  bet: { front: 2, back: 2, match: 3, bye: 1 },
  medal: { tokens: 0, rulePct: 100 },
  regla8: false,
  admin: "demo",
  admins: [],
  members: ["demo", ...KFB_PLAYERS.map((p) => p.id)],
};

// Scores reales (18 hoyos en Los Inkas) de los primeros 12 del roster, hoja "Registro Medal"
const KFB_EX_GROSS = [
  [4,4,4,3,4,3,5,5,5,5,5,4,3,4,5,5,3,6], // Melendez
  [4,4,5,4,4,4,4,7,5,5,5,4,5,5,5,6,5,5], // Guinea
  [5,4,5,3,5,3,4,6,6,4,6,6,5,5,5,5,3,5], // Gastelumendi
  [6,5,5,4,5,3,5,6,7,4,5,4,4,6,6,6,4,6], // Ljubicic
  [6,4,5,3,5,3,4,5,6,5,6,4,3,5,4,5,4,5], // Arana
  [5,5,4,4,7,4,5,5,6,4,5,5,3,5,5,5,5,4], // Caceres
  [5,5,5,4,6,4,5,5,6,3,4,6,3,7,6,5,5,6], // Lupis
  [5,4,4,3,5,3,5,5,4,4,4,4,3,4,4,5,4,4], // Iago Bellatin
  [4,6,5,5,5,3,5,6,5,5,5,4,4,5,5,6,4,5], // Morachimo
  [5,5,6,4,6,4,3,5,5,6,4,4,3,5,4,6,4,5], // Rubio
  [5,4,4,4,5,3,6,5,5,5,6,4,3,5,5,5,4,4], // Carlo Bellatin
  [5,4,5,5,4,4,4,5,4,5,5,5,2,5,6,5,3,4], // Moreno
];
const buildKFBExampleEvent = () => {
  const mk = (i) => ({ id: KFB_PLAYERS[i].id, name: KFB_PLAYERS[i].name + " " + KFB_PLAYERS[i].last, hcp: KFB_PLAYERS[i].hcp, gross: KFB_EX_GROSS[i].slice() });
  return {
    id: "kfb-ex-1",
    courseId: "losinkas",
    communityId: "kfb",
    date: "2026-05-23",
    teams: [
      { id: 1, start: 1,  players: [0,1,2,3].map(mk),  pairs: [[KFB_PLAYERS[0].id,KFB_PLAYERS[2].id],[KFB_PLAYERS[1].id,KFB_PLAYERS[3].id]] },
      { id: 2, start: 10, players: [4,5,6,7].map(mk),  pairs: [[KFB_PLAYERS[4].id,KFB_PLAYERS[5].id],[KFB_PLAYERS[6].id,KFB_PLAYERS[7].id]] },
      { id: 3, start: 1,  players: [8,9,10,11].map(mk),pairs: [[KFB_PLAYERS[8].id,KFB_PLAYERS[9].id],[KFB_PLAYERS[10].id,KFB_PLAYERS[11].id]] },
    ],
  };
};
// Persistencia local del navegador (localStorage).
const localStore = {
  async get(k, def) { try { const r = localStorage.getItem(k); return r != null ? JSON.parse(r) : def; } catch { return def; } },
  async set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// Persistencia en Supabase: tabla "collections" (key → value jsonb).
// Las escrituras se agrupan (debounce) para no mandar una petición por tecla.
const cloudTimers = {};
const cloudStore = {
  async get(k, def) {
    try {
      const { data, error } = await sb.from("collections").select("value").eq("key", k).maybeSingle();
      if (error) throw error;
      return data ? data.value : def;
    } catch { return def; }
  },
  async set(k, v) {
    clearTimeout(cloudTimers[k]);
    cloudTimers[k] = setTimeout(async () => {
      try { await sb.from("collections").upsert({ key: k, value: v, updated_at: new Date().toISOString() }); } catch {}
    }, 600);
  },
};

const store = CLOUD ? cloudStore : localStore;

/* En modo nube: asegura que el usuario autenticado tenga su registro de
   jugador. El primer usuario en registrarse queda como admin de las
   comunidades de ejemplo (que vienen con admin "demo"). */
function ensureCloudPlayer(user, players, setPlayers, setCommunities) {
  const found = players.find((p) => p.id === user.id);
  if (found) return found;
  const meta = user.user_metadata || {};
  const rec = {
    id: user.id,
    name: meta.name || (user.email || "").split("@")[0],
    last: meta.last || "",
    email: user.email,
    birth: meta.birth || "",
    plan: "free",
    communities: [],
  };
  const isFirstAccount = !players.some((p) => p.email);
  setPlayers((prev) => (prev.some((p) => p.id === user.id) ? prev : [...prev, rec]));
  if (isFirstAccount) {
    setCommunities((prev) => prev.map((c) => (c.admin === "demo"
      ? { ...c, admin: user.id, members: c.members.includes(user.id) ? c.members : [user.id, ...c.members.filter((m) => m !== "demo")] }
      : c)));
  }
  return rec;
}

/* ---------------- ESTILOS ---------------- */
const FONT_LINK = "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,900;1,9..144,500&family=Spline+Sans:wght@400;500;600;700&display=swap";

/* Detecta pantallas chicas para mostrar la navegación tipo app móvil */
function useMedia(query) {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const fn = (e) => setMatches(e.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [query]);
  return matches;
}

function useFonts() {
  useEffect(() => {
    if (!document.getElementById("gb-fonts")) {
      const l = document.createElement("link"); l.id = "gb-fonts"; l.rel = "stylesheet"; l.href = FONT_LINK; document.head.appendChild(l);
    }
  }, []);
}

const C = {
  green: "#0f3d2e", greenDeep: "#0a2a20", lime: "#c8e6a0", gold: "#d4a843",
  cream: "#f6f1e3", creamDk: "#ece3cd", ink: "#13241c", paper: "#fffdf6",
  red: "#b4452f", redSoft: "#d98a73", line: "#dcd2b8",
};

/* ---------------- COMPONENTES UI ---------------- */
const money = (v, cur = "S/.") => (v >= 0 ? "+" : "−") + cur + Math.abs(v).toFixed(2);
// Caminos: muestra entero si es exacto; si tiene decimales, máximo 2 (sin ceros sobrantes)
const fmtTok = (v) => { const r = Math.round(v * 100) / 100; return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/\.?0+$/, ""); };
const fmtTokSigned = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + fmtTok(Math.abs(v));

function Chip({ children, tone = "green" }) {
  const m = { green: [C.green, C.lime], gold: [C.gold, "#3a2c0a"], red: [C.red, "#fff"], neutral: [C.creamDk, C.ink] };
  const [bg, fg] = m[tone];
  return <span style={{ background: bg, color: fg, borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 700, letterSpacing: .3 }}>{children}</span>;
}

function Btn({ children, onClick, variant = "primary", disabled, style }) {
  const base = { fontFamily: "'Spline Sans',sans-serif", fontWeight: 600, fontSize: 15, padding: "11px 22px", borderRadius: 12, cursor: disabled ? "not-allowed" : "pointer", border: "none", transition: "transform .12s, box-shadow .12s, opacity .12s", opacity: disabled ? .45 : 1 };
  const v = {
    primary: { background: C.green, color: C.cream, boxShadow: "0 6px 18px rgba(15,61,46,.28)" },
    gold: { background: C.gold, color: "#2c2003", boxShadow: "0 6px 18px rgba(212,168,67,.32)" },
    ghost: { background: "transparent", color: C.green, border: `1.5px solid ${C.green}` },
    danger: { background: "transparent", color: C.red, border: `1.5px solid ${C.redSoft}` },
  };
  return <button disabled={disabled} onClick={onClick} style={{ ...base, ...v[variant], ...style }}
    onMouseDown={(e)=>!disabled&&(e.currentTarget.style.transform="scale(.97)")}
    onMouseUp={(e)=>(e.currentTarget.style.transform="scale(1)")}
    onMouseLeave={(e)=>(e.currentTarget.style.transform="scale(1)")}>{children}</button>;
}

function Card({ children, style }) {
  return <div style={{ background: C.paper, borderRadius: 18, border: `1px solid ${C.line}`, boxShadow: "0 2px 0 rgba(0,0,0,.02)", ...style }}>{children}</div>;
}

function Field({ label, children }) {
  return <label style={{ display: "block", marginBottom: 14 }}>
    <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: C.green, letterSpacing: .4, textTransform: "uppercase", marginBottom: 6 }}>{label}</span>
    {children}
  </label>;
}
const inputStyle = { width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: 10, border: `1.5px solid ${C.line}`, background: "#fff", fontFamily: "'Spline Sans',sans-serif", fontSize: 15, color: C.ink, outline: "none" };

/* ---------------- AUTH ---------------- */
function Auth({ onAuth, players, setPlayers }) {
  const [mode, setMode] = useState("login");
  const [f, setF] = useState({ name: "", last: "", email: "", birth: "", pass: "", pass2: "" });
  const [err, setErr] = useState("");
  const upd = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async () => {
    setErr("");
    // MODO NUBE: cuentas seguras con Supabase Auth (la contraseña nunca se guarda en la app)
    if (CLOUD) {
      try {
        if (mode === "login") {
          const { data, error } = await sb.auth.signInWithPassword({ email: f.email, password: f.pass });
          if (error) { setErr("Email o contraseña incorrectos."); return; }
          onAuth({ cloudUser: data.user });
        } else {
          if (!f.name || !f.email || !f.pass) { setErr("Completa los campos obligatorios."); return; }
          if (f.pass !== f.pass2) { setErr("Las contraseñas no coinciden."); return; }
          if (f.pass.length < 6) { setErr("La contraseña debe tener al menos 6 caracteres."); return; }
          const { data, error } = await sb.auth.signUp({ email: f.email, password: f.pass, options: { data: { name: f.name, last: f.last, birth: f.birth } } });
          if (error) { setErr(/already|registered/i.test(error.message) ? "Ese email ya está registrado." : "No se pudo crear la cuenta: " + error.message); return; }
          if (!data.session) { setErr("Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión."); return; }
          onAuth({ cloudUser: data.user });
        }
      } catch { setErr("Error de conexión. Intenta de nuevo."); }
      return;
    }
    // MODO LOCAL: cuentas guardadas en este navegador
    if (mode === "login") {
      const u = players.find((p) => p.email.toLowerCase() === f.email.toLowerCase() && p.pass === f.pass);
      if (!u) { setErr("Email o contraseña incorrectos."); return; }
      onAuth(u);
    } else {
      if (!f.name || !f.email || !f.pass) { setErr("Completa los campos obligatorios."); return; }
      if (f.pass !== f.pass2) { setErr("Las contraseñas no coinciden."); return; }
      if (players.some((p) => p.email && p.email.toLowerCase() === f.email.toLowerCase())) { setErr("Ese email ya está registrado."); return; }
      const u = { id: "U" + Date.now(), name: f.name, last: f.last, email: f.email, birth: f.birth, pass: f.pass, communities: [] };
      const next = [...players, u]; setPlayers(next); onAuth(u);
    }
  };

  return (
    <div style={{ minHeight: "100%", display: "grid", placeItems: "center", padding: "40px 16px",
      background: `radial-gradient(120% 90% at 80% -10%, ${C.green} 0%, ${C.greenDeep} 55%, #061812 100%)` }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 26 }}>
          <div style={{ fontFamily: "'Fraunces',serif", fontWeight: 900, fontSize: 46, color: C.cream, lineHeight: 1, letterSpacing: -1 }}>
            Golf<span style={{ color: C.gold }}>Buddy</span>
          </div>
          <div style={{ color: C.lime, fontWeight: 600, letterSpacing: 3, fontSize: 12, marginTop: 8, textTransform: "uppercase" }}>Modo · Machetero</div>
        </div>
        <Card style={{ padding: 26 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 20, background: C.creamDk, borderRadius: 12, padding: 4 }}>
            {["login", "signup"].map((m) => (
              <button key={m} onClick={() => { setMode(m); setErr(""); }} style={{
                flex: 1, border: "none", cursor: "pointer", padding: "9px", borderRadius: 9, fontWeight: 700, fontSize: 14,
                fontFamily: "'Spline Sans',sans-serif", background: mode === m ? C.green : "transparent", color: mode === m ? C.cream : C.green }}>
                {m === "login" ? "Iniciar sesión" : "Crear cuenta"}
              </button>
            ))}
          </div>
          {mode === "signup" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Nombre*"><input style={inputStyle} value={f.name} onChange={upd("name")} /></Field>
              <Field label="Apellido"><input style={inputStyle} value={f.last} onChange={upd("last")} /></Field>
            </div>
          )}
          <Field label="Email*"><input style={inputStyle} type="email" value={f.email} onChange={upd("email")} placeholder="tu@correo.com" /></Field>
          {mode === "signup" && <Field label="Fecha de nacimiento"><input style={inputStyle} type="date" value={f.birth} onChange={upd("birth")} /></Field>}
          <Field label="Contraseña*"><input style={inputStyle} type="password" value={f.pass} onChange={upd("pass")} /></Field>
          {mode === "signup" && <Field label="Repetir contraseña*"><input style={inputStyle} type="password" value={f.pass2} onChange={upd("pass2")} /></Field>}
          {err && <div style={{ color: C.red, fontSize: 13.5, fontWeight: 600, marginBottom: 12 }}>{err}</div>}
          <Btn onClick={submit} style={{ width: "100%", marginTop: 4 }}>{mode === "login" ? "Entrar" : "Crear cuenta"}</Btn>
          {mode === "login" && !CLOUD && (
            <div style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "#6b7a72" }}>
              Demo: usa <b style={{color:C.green}}>demo@golf.com</b> / <b style={{color:C.green}}>demo</b>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ---------------- SCORECARD (encabezado de hoyos) ---------------- */
function HoleHeader({ course }) {
  return (
    <>
      <div style={{ ...cellHead, textAlign: "left", paddingLeft: 10 }}>Hoyo</div>
      {course.pars.map((_, i) => <div key={i} style={cellHead}>{i + 1}</div>)}
    </>
  );
}
const cellHead = { background: C.greenDeep, color: C.lime, fontWeight: 700, fontSize: 12, textAlign: "center", padding: "7px 0", minWidth: 30 };

/* ---------------- PASO: ENTRADA DE SCORES ---------------- */
function ScoreMatrix({ event, course, onChange }) {
  return (
    <div style={{ overflowX: "auto", border: `1px solid ${C.line}`, borderRadius: 14 }}>
      {event.teams.map((t) => (
        <div key={t.id} style={{ minWidth: 30 * 19 + 130 }}>
          <div style={{ background: C.green, color: C.cream, fontWeight: 700, padding: "8px 12px", display: "flex", justifyContent: "space-between" }}>
            <span>Equipo {t.id} · salida hoyo {t.start}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `130px repeat(18, minmax(30px,1fr))` }}>
            <HoleHeader course={course} />
            <div style={{ ...cellHead, background: "#143b2c", textAlign: "left", paddingLeft: 10 }}>Par</div>
            {course.pars.map((p, i) => <div key={i} style={{ ...cellHead, background: "#143b2c", color: C.cream }}>{p}</div>)}
            {t.players.map((p) => (
              <React.Fragment key={p.id}>
                <div style={{ padding: "6px 10px", fontWeight: 600, fontSize: 13.5, background: C.cream, borderTop: `1px solid ${C.line}`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                {p.gross.map((g, h) => (
                  <input key={h} value={g} inputMode="numeric" pattern="[0-9]*" onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ""); onChange(t.id, p.id, h, v === "" ? "" : parseInt(v)); }}
                    style={{ border: `1px solid ${C.line}`, borderTop: `1px solid ${C.line}`, textAlign: "center", fontFamily: "'Spline Sans'", fontSize: 14, padding: "6px 0", outline: "none", background: "#fff", minWidth: 30 }} />
                ))}
              </React.Fragment>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- ENTRADA HOYO POR HOYO + RESUMEN INTERNO ---------------- */
/* Resumen parcial del grupo: puntos por hoyo (neto) solo sobre los hoyos que
   TODOS los jugadores ya llenaron. Es informativo; el cálculo oficial (caminos,
   carry over, bye) se hace al consolidar el evento. */
function partialGroupSummary(course, playerList, scores, rulePct) {
  const si = course.strokes;
  const nums = playerList.map((p) => ({ ...p, adj: adjustedHcp(parseInt(p.hcp) || 0, rulePct) }));
  if (!nums.length) return null;
  const base = Math.min(...nums.map((p) => p.adj));
  const ph = {}; nums.forEach((p) => (ph[p.id] = Math.min(p.adj - base, 18)));
  const filledHoles = [];
  for (let h = 0; h < 18; h++) {
    if (nums.every((p) => { const v = (scores[p.id] || [])[h]; return v !== "" && v != null; })) filledHoles.push(h);
  }
  const net = {}; nums.forEach((p) => (net[p.id] = si.map((s, h) => ((scores[p.id] || [])[h] ?? 0) - strokesOnHole(ph[p.id], s))));
  const pts = {}; nums.forEach((p) => (pts[p.id] = { front: 0, back: 0, total: 0 }));
  const addPts = (bucket, key, h) => { bucket[key].total++; if (h < 9) bucket[key].front++; else bucket[key].back++; };
  filledHoles.forEach((h) => {
    let min = Infinity; nums.forEach((p) => { if (net[p.id][h] < min) min = net[p.id][h]; });
    nums.forEach((p) => { if (net[p.id][h] === min) addPts(pts, p.id, h); });
  });
  // Parejas (best ball) solo con 4 jugadores: los 2 primeros vs los 2 últimos
  let pairs = null;
  if (nums.length === 4) {
    const prs = [[nums[0], nums[1]], [nums[2], nums[3]]];
    const pNet = prs.map((pr) => si.map((_, h) => Math.min(net[pr[0].id][h], net[pr[1].id][h])));
    const pPts = [{ front: 0, back: 0, total: 0 }, { front: 0, back: 0, total: 0 }];
    filledHoles.forEach((h) => {
      const m = Math.min(pNet[0][h], pNet[1][h]);
      pNet.forEach((n, i) => { if (n[h] === m) { pPts[i].total++; if (h < 9) pPts[i].front++; else pPts[i].back++; } });
    });
    pairs = prs.map((pr, i) => ({ label: pr[0].name.split(" ")[0] + " & " + pr[1].name.split(" ")[0], ...pPts[i] }));
  }
  return { holes: filledHoles.length, ph, players: nums, pts, pairs };
}

function GroupLiveSummary({ course, playerList, scores, rulePct }) {
  const s = partialGroupSummary(course, playerList, scores, rulePct);
  if (!s || s.holes === 0) return null;
  const sorted = [...s.players].sort((a, b) => s.pts[b.id].total - s.pts[a.id].total);
  const cellR = { padding: "5px 8px", textAlign: "right" };
  return (
    <Card style={{ padding: 14, marginTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 6 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: C.green }}>Resumen interno del grupo</div>
        <Chip tone="neutral">{s.holes} de 18 hoyos contados</Chip>
      </div>
      <div style={{ overflowX: "auto", marginTop: 8 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
          <thead><tr style={{ color: "#7a8780", textAlign: "right" }}>
            <th style={{ textAlign: "left", padding: "4px 8px" }}>Individual</th>
            <th style={cellR}>Front</th><th style={cellR}>Back</th><th style={cellR}>Total</th>
          </tr></thead>
          <tbody>
            {sorted.map((p, i) => (
              <tr key={p.id} style={{ borderTop: `1px solid ${C.line}`, textAlign: "right", background: i === 0 ? "rgba(212,168,67,.10)" : "transparent" }}>
                <td style={{ textAlign: "left", padding: "5px 8px", fontWeight: 600 }}>{p.name} {i === 0 && <span style={{ color: C.gold }}>★</span>}</td>
                <td style={cellR}>{s.pts[p.id].front}</td>
                <td style={cellR}>{s.pts[p.id].back}</td>
                <td style={{ ...cellR, fontWeight: 800 }}>{s.pts[p.id].total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {s.pairs && (
        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
            <thead><tr style={{ color: "#7a8780", textAlign: "right" }}>
              <th style={{ textAlign: "left", padding: "4px 8px" }}>Parejas (best ball)</th>
              <th style={cellR}>Front</th><th style={cellR}>Back</th><th style={cellR}>Total</th>
            </tr></thead>
            <tbody>
              {s.pairs.map((pr, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${C.line}`, textAlign: "right" }}>
                  <td style={{ textAlign: "left", padding: "5px 8px", fontWeight: 600 }}>{pr.label}</td>
                  <td style={cellR}>{pr.front}</td><td style={cellR}>{pr.back}</td>
                  <td style={{ ...cellR, fontWeight: 800 }}>{pr.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ fontSize: 12, color: "#7a8780", marginTop: 8 }}>
        Puntos por hoyo ganado o empatado (score neto). Es un avance con los hoyos completos; el resultado oficial con caminos, carry over y bye se calcula al consolidar el evento.
      </div>
    </Card>
  );
}

/* Parejas del grupo: se pueden SORTEAR en el tee (animación) o ELEGIR
   manualmente si ya las armaron antes. Con 4: pareja 1 vs pareja 2.
   Con 5: pareja fija + 3 que rotan. */
function TeeDraw({ g, players, onDraw, canDraw }) {
  const [spinning, setSpinning] = useState(false);
  const [preview, setPreview] = useState(null);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState([]);
  const n = g.playerIds.length;
  if (n < 4) return <div style={{ fontSize: 12.5, color: "#7a8780", marginTop: 6 }}>Grupo de 3: se juega individual, sin parejas.</div>;

  const order = g.drawnOrder && g.drawnOrder.length === n && g.drawnOrder.every((id) => g.playerIds.includes(id)) ? g.drawnOrder : null;
  const show = spinning ? preview : order;
  const nm = (id) => resolveName(id, players).split(" ")[0];
  const manual = g.drawnMode === "manual";

  const start = () => {
    if (spinning) return;
    if (order && !window.confirm("¿Volver a sortear las parejas?")) return;
    setPicking(false); setPicked([]);
    setSpinning(true);
    let count = 0;
    const iv = setInterval(() => {
      setPreview(shuffleIds(g.playerIds));
      if (++count >= 14) { clearInterval(iv); const final = shuffleIds(g.playerIds); setSpinning(false); setPreview(null); onDraw(final, "sorteo"); }
    }, 110);
  };

  const togglePick = (pid) => {
    const next = picked.includes(pid) ? picked.filter((x) => x !== pid) : [...picked, pid];
    if (next.length === 2) {
      const rest = g.playerIds.filter((id) => !next.includes(id));
      onDraw([...next, ...rest], "manual");
      setPicking(false); setPicked([]);
    } else setPicked(next);
  };

  const linkBtn = { border: "none", background: "transparent", color: C.green, fontWeight: 700, cursor: "pointer", fontSize: 12.5, fontFamily: "'Spline Sans',sans-serif", padding: 0 };

  return (
    <div style={{ marginTop: 10, padding: "10px 12px", background: order || spinning ? "rgba(212,168,67,.10)" : C.cream, borderRadius: 12, border: `1.5px ${order || spinning ? "solid" : "dashed"} ${order || spinning ? C.gold : C.line}` }}>
      {picking ? (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.green, marginBottom: 8 }}>
            {n === 4 ? "Toca a los 2 jugadores de la primera pareja:" : "Toca a los 2 jugadores de la pareja FIJA:"}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {g.playerIds.map((pid) => {
              const sel = picked.includes(pid);
              return (
                <button key={pid} onClick={() => togglePick(pid)} style={{ border: `1.5px solid ${sel ? C.green : C.line}`, cursor: "pointer", borderRadius: 999, padding: "7px 14px", fontWeight: 600, fontSize: 13, background: sel ? C.green : "#fff", color: sel ? C.cream : C.ink }}>{nm(pid)}</button>
              );
            })}
          </div>
          <button onClick={() => { setPicking(false); setPicked([]); }} style={{ ...linkBtn, color: C.red, marginTop: 8 }}>Cancelar</button>
        </div>
      ) : !show ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 13, color: "#7a8780" }}>Parejas por definir: sortéenlas en el tee, o elíjanlas si ya las armaron.</div>
          {canDraw && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn variant="gold" onClick={start}>🎲 Sortear</Btn>
              <Btn variant="ghost" onClick={() => { setPicking(true); setPicked([]); }}>✍️ Elegir parejas</Btn>
            </div>
          )}
        </div>
      ) : (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              {n === 4 ? (
                <>{spinning ? "🎲" : manual ? "✍️" : "🎲"} <span style={{ color: C.green }}>{nm(show[0])} & {nm(show[1])}</span> <span style={{ color: "#9aa69e" }}>vs</span> <span style={{ color: C.green }}>{nm(show[2])} & {nm(show[3])}</span></>
              ) : (
                <>{spinning ? "🎲" : manual ? "✍️" : "🎲"} Pareja fija: <span style={{ color: C.green }}>{nm(show[0])} & {nm(show[1])}</span> <span style={{ color: "#9aa69e" }}>· rotan:</span> {nm(show[2])}, {nm(show[3])}, {nm(show[4])}</>
              )}
            </div>
            {!spinning && canDraw && (
              <div style={{ display: "flex", gap: 12 }}>
                <button onClick={start} style={linkBtn}>🎲 sortear</button>
                <button onClick={() => { setPicking(true); setPicked([]); }} style={linkBtn}>✍️ cambiar</button>
              </div>
            )}
          </div>
          {spinning && <div style={{ fontSize: 12, color: C.gold, fontWeight: 700, marginTop: 4 }}>Sorteando…</div>}
        </div>
      )}
    </div>
  );
}

/* Entrada de scores hoyo por hoyo, en el orden de salida del grupo. */
function HoleByHole({ course, start, playerList, scores, rulePct, onSet }) {
  const order = playOrder(start);
  const isFilled = (pid, h) => { const v = (scores[pid] || [])[h]; return v !== "" && v != null; };
  const holeDone = (h) => playerList.every((p) => isFilled(p.id, h));
  const firstPending = order.findIndex((h) => !holeDone(h));
  const [pos, setPos] = useState(firstPending === -1 ? 0 : firstPending);
  const h = order[Math.min(Math.max(pos, 0), 17)];
  const done = order.filter(holeDone).length;

  // strokes que recibe cada jugador en este hoyo (para mostrar los puntos)
  const adj = {}; playerList.forEach((p) => (adj[p.id] = adjustedHcp(parseInt(p.hcp) || 0, rulePct)));
  const base = Math.min(...playerList.map((p) => adj[p.id]));
  const strokesHere = (pid) => strokesOnHole(Math.min(adj[pid] - base, 18), course.strokes[h]);

  const setVal = (pid, v) => onSet(pid, h, v);
  const bump = (pid, d) => {
    const cur = (scores[pid] || [])[h];
    if (cur === "" || cur == null) { setVal(pid, course.pars[h]); return; }
    const next = Math.min(15, Math.max(1, cur + d));
    setVal(pid, next);
  };
  const typed = (pid) => (e) => {
    const clean = e.target.value.replace(/[^0-9]/g, "").slice(0, 2);
    setVal(pid, clean === "" ? "" : Math.min(15, Math.max(1, parseInt(clean, 10))));
  };

  const stepBtn = { border: `1.5px solid ${C.line}`, background: "#fff", color: C.green, cursor: "pointer", borderRadius: 12, width: 46, height: 46, fontSize: 22, fontWeight: 800, lineHeight: 1 };

  return (
    <div>
      {/* progreso: un punto por hoyo en orden de juego */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
        {order.map((oh, i) => {
          const cur = i === pos;
          const filled = holeDone(oh);
          return (
            <button key={oh} onClick={() => setPos(i)} title={`Hoyo ${oh + 1}`} style={{
              border: "none", cursor: "pointer", width: 26, height: 26, borderRadius: 8, fontSize: 11, fontWeight: 700,
              background: cur ? C.gold : filled ? C.green : C.creamDk,
              color: cur ? "#2c2003" : filled ? C.cream : "#9aa69e" }}>{oh + 1}</button>
          );
        })}
      </div>

      <Card style={{ padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <div style={{ fontFamily: "'Fraunces'", fontWeight: 900, fontSize: 30, color: C.green }}>Hoyo {h + 1}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Chip tone="green">Par {course.pars[h]}</Chip>
            <Chip tone="neutral">SI {course.strokes[h]}</Chip>
            <Chip tone={done === 18 ? "gold" : "neutral"}>{done}/18 completos</Chip>
          </div>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {playerList.map((p) => {
            const v = (scores[p.id] || [])[h];
            const st = strokesHere(p.id);
            return (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, background: C.cream, borderRadius: 14, padding: "10px 12px" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: st > 0 ? C.gold : "#9aa69e", fontWeight: 700 }}>
                    {st > 0 ? "●".repeat(Math.min(st, 3)) + ` recibe ${st} stroke${st > 1 ? "s" : ""}` : "sin stroke aquí"}
                  </div>
                </div>
                <button style={stepBtn} onClick={() => bump(p.id, -1)} aria-label="menos">−</button>
                <input value={v ?? ""} onChange={typed(p.id)} inputMode="numeric" pattern="[0-9]*" placeholder="·" style={{
                  width: 56, height: 46, textAlign: "center", fontSize: 22, fontWeight: 800, fontFamily: "'Spline Sans'",
                  border: `1.5px solid ${v === "" || v == null ? C.line : C.green}`, borderRadius: 12, outline: "none",
                  background: "#fff", color: v != null && v !== "" && v < course.pars[h] ? "#3fa46a" : v != null && v !== "" && v > course.pars[h] ? C.red : C.ink }} />
                <button style={stepBtn} onClick={() => bump(p.id, 1)} aria-label="más">+</button>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14 }}>
          <Btn variant="ghost" disabled={pos === 0} onClick={() => setPos(Math.max(0, pos - 1))}>← Hoyo {pos > 0 ? order[pos - 1] + 1 : ""}</Btn>
          <Btn disabled={pos === 17} onClick={() => setPos(Math.min(17, pos + 1))}>Hoyo {pos < 17 ? order[pos + 1] + 1 : ""} →</Btn>
        </div>
      </Card>
    </div>
  );
}

/* ---------------- VISTA DE RESULTADOS ---------------- */
function Results({ results, community }) {
  const cur = community.currency;
  const sorted = [...results.rows].sort((a, b) => b.totalMoney - a.totalMoney);
  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        <Chip tone="gold">Salida del evento: hoyo {results.eventStart}</Chip>
        <Chip tone="neutral">Token = {cur}{community.tokenValue.toFixed(2)}</Chip>
        <Chip tone="green">{results.rows.length} jugadores</Chip>
      </div>
      <Card style={{ overflow: "hidden", marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "26px 1.4fr .8fr .9fr .9fr 1fr", background: C.greenDeep, color: C.lime, fontWeight: 700, fontSize: 12.5, padding: "10px 14px" }}>
          <div>#</div><div>Jugador</div><div style={{ textAlign: "right" }}>Equipo</div><div style={{ textAlign: "right" }}>Evento</div><div style={{ textAlign: "right" }}>Tokens</div><div style={{ textAlign: "right" }}>Resultado</div>
        </div>
        {sorted.map((r, i) => (
          <div key={r.id} style={{ display: "grid", gridTemplateColumns: "26px 1.4fr .8fr .9fr .9fr 1fr", padding: "11px 14px", alignItems: "center",
            borderTop: `1px solid ${C.line}`, background: i % 2 ? C.cream : C.paper }}>
            <div style={{ fontWeight: 800, color: i === 0 ? C.gold : "#9aa69e", fontFamily: "'Fraunces'" }}>{i + 1}</div>
            <div style={{ fontWeight: 600 }}>{r.name} <span style={{ color: "#9aa69e", fontSize: 12 }}>· hcp {r.adj}</span></div>
            <div style={{ textAlign: "right", color: r.teamMoney >= 0 ? C.green : C.red, fontSize: 13 }}>{money(r.teamMoney, cur)}</div>
            <div style={{ textAlign: "right", color: r.groupMoney >= 0 ? C.green : C.red, fontSize: 13 }}>{money(r.groupMoney, cur)}</div>
            <div style={{ textAlign: "right", fontWeight: 600, fontSize: 13 }}>{fmtTokSigned(r.totalTok)}</div>
            <div style={{ textAlign: "right", fontWeight: 800, color: r.totalMoney >= 0 ? C.green : C.red, fontFamily: "'Fraunces'", fontSize: 16 }}>{money(r.totalMoney, cur)}</div>
          </div>
        ))}
      </Card>

      <div style={{ fontFamily: "'Fraunces'", fontWeight: 600, fontSize: 18, color: C.green, margin: "8px 0 12px" }}>Detalle por concurso</div>
      <div style={{ display: "grid", gap: 12 }}>
        {sorted.map((r) => (
          <Card key={r.id} style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{r.name}</div>
              <div style={{ fontWeight: 800, color: r.totalMoney >= 0 ? C.green : C.red, fontFamily: "'Fraunces'", fontSize: 18 }}>{money(r.totalMoney, cur)}</div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                <thead><tr style={{ color: "#7a8780", textAlign: "right" }}>
                  <th style={{ textAlign: "left", padding: "4px 8px" }}>Concurso</th>
                  <th style={{ padding: "4px 8px" }}>Front</th><th style={{ padding: "4px 8px" }}>Back</th>
                  <th style={{ padding: "4px 8px" }}>Match</th><th style={{ padding: "4px 8px" }}>Bye</th>
                  <th style={{ padding: "4px 8px" }}>Total</th>
                </tr></thead>
                <tbody>
                  {r.contests.map((c, i) => (
                    <tr key={i} style={{ borderTop: `1px solid ${C.line}`, textAlign: "right" }}>
                      <td style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600 }}>
                        {c.name}{c.pairWith ? ` (con ${c.pairWith.join(", ")})` : ""}
                        {c.meta.carryOver && <span style={{ marginLeft: 6 }}><Chip tone="gold">Carry Over</Chip></span>}
                        {c.meta.secondVoid && <span style={{ marginLeft: 6 }}><Chip tone="neutral">2da vuelta anulada</Chip></span>}
                        {c.meta.matchVoid && <span style={{ marginLeft: 6 }}><Chip tone="neutral">Match anulado</Chip></span>}
                        {c.medal && <span style={{ marginLeft: 6 }}><Chip tone="green">Neto {c.meta.netTotal}</Chip></span>}
                        {c.meta.medalVoid && <span style={{ marginLeft: 6 }}><Chip tone="neutral">Medal anulado</Chip></span>}
                      </td>
                      {["front","back","match","bye"].map((k)=> (
                        <td key={k} style={{ padding: "6px 8px", color: c[k] > 0 ? C.green : c[k] < 0 ? C.red : "#9aa69e" }}>{c[k] === 0 ? "·" : fmtTokSigned(c[k])}</td>
                      ))}
                      <td style={{ padding: "6px 8px", fontWeight: 700 }}>{fmtTokSigned(c.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </div>

      <PointsBreakdown breakdown={results.breakdown} />
    </div>
  );
}

/* ---------------- CÓMO SE GANÓ (PUNTOS) ---------------- */
function PointsBreakdown({ breakdown }) {
  const [open, setOpen] = useState({});
  if (!breakdown || !breakdown.length) return null;
  const events = breakdown.filter((b) => b.scope === "evento");
  const teamC = breakdown.filter((b) => b.scope === "equipo");
  const segLabel = (b, seg) => {
    // marca cuál es la 1ra/2da vuelta según el hoyo de salida
    if (seg === "front") return b.start === 10 ? "Front (2da)" : "Front (1ra)";
    if (seg === "back") return b.start === 10 ? "Back (1ra)" : "Back (2da)";
    return seg;
  };
  const Section = ({ title, items }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#7a8780", textTransform: "uppercase", letterSpacing: .5, margin: "4px 0 8px" }}>{title}</div>
      <div style={{ display: "grid", gap: 10 }}>
        {items.map((b, idx) => {
          const id = title + idx;
          const isOpen = open[id];
          const sorted = [...b.contestants].sort((x, y) => y.matchPts - x.matchPts);
          const winners = new Set(b.meta.winners?.match || []);
          return (
            <Card key={id} style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{b.name} <span style={{ color: "#9aa69e", fontSize: 12.5, fontWeight: 500 }}>· salida hoyo {b.start}</span></div>
                <button onClick={() => setOpen({ ...open, [id]: !isOpen })} style={{ border: "none", background: "transparent", color: C.green, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{isOpen ? "Ocultar hoyos ▲" : "Ver hoyo a hoyo ▼"}</button>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                  <thead><tr style={{ color: "#7a8780", textAlign: "right" }}>
                    <th style={{ textAlign: "left", padding: "4px 8px" }}>Participante</th>
                    <th style={{ padding: "4px 8px" }}>{segLabel(b, "front")}</th>
                    <th style={{ padding: "4px 8px" }}>{segLabel(b, "back")}</th>
                    <th style={{ padding: "4px 8px" }}>Match</th>
                    <th style={{ padding: "4px 8px" }}>Bye</th>
                  </tr></thead>
                  <tbody>
                    {sorted.map((c) => (
                      <tr key={c.key} style={{ borderTop: `1px solid ${C.line}`, textAlign: "right", background: winners.has(c.key) ? "rgba(212,168,67,.12)" : "transparent" }}>
                        <td style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600 }}>{c.label} {winners.has(c.key) && <span style={{ color: C.gold }}>★</span>}</td>
                        <td style={{ padding: "6px 8px" }}>{c.frontPts}</td>
                        <td style={{ padding: "6px 8px" }}>{c.backPts}</td>
                        <td style={{ padding: "6px 8px", fontWeight: 700 }}>{c.matchPts}</td>
                        <td style={{ padding: "6px 8px" }}>{b.meta.byeActive ? c.byePts : "·"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {b.meta.carryOver && <Chip tone="gold">Carry Over</Chip>}
                {b.meta.secondVoid && <Chip tone="neutral">2da vuelta anulada</Chip>}
                {b.meta.matchVoid && <Chip tone="neutral">Match anulado</Chip>}
                {b.meta.byeActive && <Chip tone="green">Bye en hoyos {b.meta.byeHoles.join(", ")}</Chip>}
              </div>
              {isOpen && (
                <div style={{ overflowX: "auto", marginTop: 10, borderTop: `1px solid ${C.line}`, paddingTop: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: `120px repeat(18, minmax(22px,1fr))`, fontSize: 11.5, minWidth: 120 + 18 * 22 }}>
                    <div style={{ fontWeight: 700, color: "#7a8780", padding: "3px 6px" }}>Hoyo</div>
                    {Array.from({ length: 18 }, (_, h) => <div key={h} style={{ textAlign: "center", fontWeight: 700, color: "#7a8780", padding: "3px 0" }}>{h + 1}</div>)}
                    {sorted.map((c) => (
                      <React.Fragment key={c.key}>
                        <div style={{ fontWeight: 600, padding: "3px 6px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.label}</div>
                        {c.points.map((v, h) => (
                          <div key={h} style={{ textAlign: "center", padding: "3px 0", color: v ? C.green : "#cfd8d0", fontWeight: v ? 800 : 400, background: v ? "rgba(63,164,106,.14)" : "transparent" }}>{v ? "●" : "·"}</div>
                        ))}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
  return (
    <div style={{ marginTop: 26 }}>
      <div style={{ fontFamily: "'Fraunces'", fontWeight: 600, fontSize: 18, color: C.green, marginBottom: 12 }}>Cómo se ganó · puntos por concurso</div>
      {events.length > 0 && <Section title="Concursos del evento" items={events} />}
      {teamC.length > 0 && <Section title="Concursos por equipo" items={teamC} />}
    </div>
  );
}
function StartRound({ courses, communities, players, me, onSave, onCancel, initialEvent }) {
  const [step, setStep] = useState(1);
  const [date, setDate] = useState(initialEvent?.date || new Date().toISOString().slice(0, 10));
  const [courseId, setCourseId] = useState(initialEvent?.courseId || courses[0]?.id);
  const [communityId, setCommunityId] = useState(initialEvent?.communityId || communities[0]?.id);
  const [teams, setTeams] = useState(initialEvent?.teams || [{ id: 1, start: 1, players: [], pairs: [] }]);
  const [scoringTeam, setScoringTeam] = useState(null);   // equipo abierto en la entrada de scores
  const [entryMode, setEntryMode] = useState("hole");     // "hole" | "matrix"

  const course = courses.find((c) => c.id === courseId) || courses[0];
  const community = communities.find((c) => c.id === communityId) || communities[0];

  // pool de miembros = miembros de la comunidad (con nombre real) + el usuario si no está
  const memberPool = useMemo(() => {
    const ids = [...community.members];
    if (!ids.includes(me.id)) ids.unshift(me.id);
    return ids.map((id) => ({ id, name: resolveName(id, players) }));
  }, [community, players, me]);

  const addTeam = () => setTeams([...teams, { id: teams.length + 1, start: 1, players: [], pairs: [] }]);
  const setTeam = (id, patch) => setTeams(teams.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const togglePlayer = (tid, pid) => {
    const t = teams.find((x) => x.id === tid);
    const exists = t.players.find((p) => p.id === pid);
    let players2;
    if (exists) players2 = t.players.filter((p) => p.id !== pid);
    else { if (t.players.length >= 5) return; const rec = players.find((x) => x.id === pid); players2 = [...t.players, { id: pid, name: memberPool.find((m) => m.id === pid)?.name || pid, hcp: rec && typeof rec.hcp === "number" ? rec.hcp : 0, gross: new Array(18).fill("") }]; }
    setTeam(tid, { players: players2, pairs: autoPairs(players2) });
  };
  const setHcp = (tid, pid, v) => {
    const t = teams.find((x) => x.id === tid);
    setTeam(tid, { players: t.players.map((p) => (p.id === pid ? { ...p, hcp: v } : p)) });
  };
  // B1: un jugador no puede estar en más de un grupo del evento
  const takenElsewhere = (tid, pid) => teams.some((t) => t.id !== tid && t.players.some((p) => p.id === pid));
  const playersInOtherTeams = (tid) => teams.filter((t) => t.id !== tid).flatMap((t) => t.players.map((p) => p.id));
  const autoPairs = (players) => {
    if (players.length === 4) return [[players[0].id, players[1].id], [players[2].id, players[3].id]];
    return []; // 3 jugadores: sin parejas. 5: parejas rotativas (pendiente), se omite el concurso de parejas.
  };
  const setGross = (tid, pid, h, v) => {
    setTeams((prev) => prev.map((t) => t.id !== tid ? t : { ...t, players: t.players.map((p) => p.id !== pid ? p : { ...p, gross: p.gross.map((g, i) => (i === h ? v : g)) }) }));
  };

  const event = { courseId: course.id, communityId: community.id, date, teams };
  const rules = { rulePct: community.rulePct, tokenValue: community.tokenValue, bet: community.bet, medal: community.medal, regla8: community.regla8, currency: community.currency };
  const results = useMemo(() => {
    try { return computeEvent(JSON.parse(JSON.stringify(event)), course, rules); } catch (e) { return null; }
  }, [step]); // recompute al entrar al paso 4

  const canStep2 = teams.every((t) => t.players.length >= 3) && teams.length >= 1;
  const allFilled = teams.every((t) => t.players.every((p) => p.gross.every((g) => g !== "" && g != null)));

  const Stepper = () => (
    <div style={{ display: "flex", gap: 6, marginBottom: 22, flexWrap: "wrap" }}>
      {["Evento", "Jugadores", "Scores", "Resultados"].map((s, i) => (
        <div key={s} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 24, height: 24, borderRadius: 999, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 12,
            background: step >= i + 1 ? C.gold : C.creamDk, color: step >= i + 1 ? "#2c2003" : "#9aa69e" }}>{i + 1}</div>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: step >= i + 1 ? C.green : "#9aa69e" }}>{s}</span>
          {i < 3 && <span style={{ color: C.line }}>—</span>}
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <Stepper />
      {step === 1 && (
        <Card style={{ padding: 22, maxWidth: 520 }}>
          <Field label="Campo de golf">
            <select style={inputStyle} value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.name}{c.location ? " — " + c.location : ""}</option>)}
            </select>
          </Field>
          <Field label="Comunidad">
            <select style={inputStyle} value={communityId} onChange={(e) => setCommunityId(e.target.value)}>
              {communities.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.rulePct}% · {c.currency}{c.tokenValue}/token)</option>)}
            </select>
          </Field>
          <Field label="Fecha"><input style={inputStyle} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <div style={{ fontSize: 13, color: "#7a8780", marginTop: 4 }}>Par {course.pars.reduce((a, b) => a + b, 0)} · El hoyo de salida se elige por equipo en el siguiente paso.</div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
            <Btn variant="ghost" onClick={onCancel}>Cancelar</Btn>
            <Btn disabled={!course || !community} onClick={() => setStep(2)}>Siguiente →</Btn>
          </div>
        </Card>
      )}

      {step === 2 && (
        <div>
          {teams.map((t) => (
            <Card key={t.id} style={{ padding: 18, marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontFamily: "'Fraunces'", fontSize: 18, color: C.green }}>Equipo {t.id}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: C.green }}>SALIDA</span>
                  {[1, 10].map((h) => (
                    <button key={h} onClick={() => setTeam(t.id, { start: h })} style={{ border: "none", cursor: "pointer", borderRadius: 8, padding: "6px 14px", fontWeight: 700,
                      background: t.start === h ? C.green : C.creamDk, color: t.start === h ? C.cream : C.green }}>Hoyo {h}</button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                {memberPool.map((m) => {
                  const sel = t.players.find((p) => p.id === m.id);
                  const taken = !sel && takenElsewhere(t.id, m.id);
                  return <button key={m.id} disabled={taken} title={taken ? "Ya está en otro grupo" : ""} onClick={() => togglePlayer(t.id, m.id)} style={{
                    border: `1.5px solid ${sel ? C.green : C.line}`, cursor: taken ? "not-allowed" : "pointer", borderRadius: 999, padding: "6px 13px", fontWeight: 600, fontSize: 13,
                    background: sel ? C.green : "#fff", color: sel ? C.cream : taken ? "#c2c9c0" : C.ink, textDecoration: taken ? "line-through" : "none", opacity: taken ? .6 : 1 }}>{m.name}</button>;
                })}
              </div>
              {t.players.length > 0 && (
                <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1.4fr .7fr .7fr", gap: 8, fontSize: 12, color: "#7a8780", fontWeight: 700, marginBottom: 6 }}>
                    <div>Jugador</div><div>Hándicap</div><div>Ajustado ({community.rulePct}%)</div>
                  </div>
                  {t.players.map((p) => (
                    <div key={p.id} style={{ display: "grid", gridTemplateColumns: "1.4fr .7fr .7fr", gap: 8, alignItems: "center", marginBottom: 6 }}>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      <input style={{ ...inputStyle, padding: "8px 10px" }} type="number" value={p.hcp} onChange={(e) => setHcp(t.id, p.id, e.target.value === "" ? "" : parseInt(e.target.value))} />
                      <div style={{ fontWeight: 700, color: C.green }}>{p.hcp === "" || p.hcp == null ? "—" : adjustedHcp(p.hcp, community.rulePct)}</div>
                    </div>
                  ))}
                  {t.players.length === 3 && (
                    <div style={{ marginTop: 10, padding: 10, background: C.cream, borderRadius: 10 }}>
                      <div style={{ fontSize: 12.5, color: "#7a8780", marginBottom: 6 }}>3 jugadores → sin parejas. Para <b>Grupos vs. Grupos</b> se presta un jugador de otro grupo:</div>
                      <select style={{ ...inputStyle, padding: "8px 10px" }} value={t.loanPlayerId || ""} onChange={(e) => setTeam(t.id, { loanPlayerId: e.target.value || null })}>
                        <option value="">Automático (primer disponible)</option>
                        {playersInOtherTeams(t.id).map((pid) => {
                          const pl = teams.flatMap((x) => x.players).find((p) => p.id === pid);
                          return <option key={pid} value={pid}>{pl?.name || pid}</option>;
                        })}
                      </select>
                    </div>
                  )}
                  {t.players.length === 4 && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                      <div style={{ fontSize: 12.5, color: "#7a8780" }}>Parejas: <b>{t.players[0].name} & {t.players[1].name}</b> · <b>{t.players[2].name} & {t.players[3].name}</b></div>
                      <button onClick={() => { const sh = shuffleIds(t.players); setTeam(t.id, { players: sh, pairs: autoPairs(sh) }); }}
                        style={{ border: `1.5px solid ${C.gold}`, background: "rgba(212,168,67,.10)", color: C.green, cursor: "pointer", borderRadius: 9, padding: "5px 12px", fontWeight: 700, fontSize: 12.5, fontFamily: "'Spline Sans',sans-serif" }}>🎲 Sortear parejas</button>
                    </div>
                  )}
                  {t.players.length === 5 && (
                    <div style={{ marginTop: 10, padding: 10, background: C.cream, borderRadius: 10 }}>
                      <div style={{ fontSize: 12.5, color: "#7a8780", marginBottom: 6 }}>
                        Pareja fija: <b>{t.players[0].name} & {t.players[1].name}</b>. Parejas rotativas (3 matches): los otros 3 forman <b>{t.players[2].name}&{t.players[3].name}</b>, <b>{t.players[2].name}&{t.players[4].name}</b> y <b>{t.players[3].name}&{t.players[4].name}</b>, cada una vs la pareja fija. Para <b>Grupos vs. Grupos</b> se elimina un jugador:
                      </div>
                      <button onClick={() => { const sh = shuffleIds(t.players); setTeam(t.id, { players: sh, pairs: autoPairs(sh) }); }}
                        style={{ border: `1.5px solid ${C.gold}`, background: "rgba(212,168,67,.10)", color: C.green, cursor: "pointer", borderRadius: 9, padding: "5px 12px", fontWeight: 700, fontSize: 12.5, fontFamily: "'Spline Sans',sans-serif", marginBottom: 8 }}>🎲 Sortear pareja fija</button>
                      <select style={{ ...inputStyle, padding: "8px 10px" }} value={t.dropPlayerId || ""} onChange={(e) => setTeam(t.id, { dropPlayerId: e.target.value || null })}>
                        <option value="">Automático (el último)</option>
                        {t.players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
            <Btn variant="ghost" onClick={addTeam}>+ Añadir equipo</Btn>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn variant="ghost" onClick={() => setStep(1)}>← Atrás</Btn>
              <Btn disabled={!canStep2} onClick={() => setStep(3)}>Siguiente →</Btn>
            </div>
          </div>
          {!canStep2 && <div style={{ color: C.red, fontSize: 13, marginTop: 8, textAlign: "right" }}>Cada equipo necesita entre 3 y 5 jugadores.</div>}
        </div>
      )}

      {step === 3 && (() => {
        const teamFilled = (tm) => tm.players.every((p) => p.gross.every((g) => g !== "" && g != null));
        const t = teams.find((x) => x.id === scoringTeam) || (teams.length === 1 ? teams[0] : null);
        return (
          <div>
            {t ? (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                  <div>
                    {teams.length > 1 && <button onClick={() => setScoringTeam(null)} style={{ border: "none", background: "transparent", color: C.green, fontWeight: 700, cursor: "pointer", padding: 0, fontSize: 13.5, fontFamily: "'Spline Sans',sans-serif" }}>← Todos los equipos</button>}
                    <div style={{ fontWeight: 700 }}>Equipo {t.id} · salida hoyo {t.start}</div>
                    <div style={{ fontSize: 13, color: "#7a8780" }}>Golpes brutos por hoyo · solo números enteros.</div>
                  </div>
                  <div style={{ display: "flex", gap: 4, background: C.creamDk, borderRadius: 10, padding: 3 }}>
                    {[["hole", "Hoyo por hoyo"], ["matrix", "Tarjeta completa"]].map(([m, l]) => (
                      <button key={m} onClick={() => setEntryMode(m)} style={{ border: "none", cursor: "pointer", borderRadius: 8, padding: "7px 12px", fontWeight: 700, fontSize: 12.5,
                        fontFamily: "'Spline Sans',sans-serif", background: entryMode === m ? C.green : "transparent", color: entryMode === m ? C.cream : C.green }}>{l}</button>
                    ))}
                  </div>
                </div>
                {entryMode === "hole" ? (
                  <HoleByHole key={t.id} course={course} start={t.start} playerList={t.players}
                    scores={Object.fromEntries(t.players.map((p) => [p.id, p.gross]))}
                    rulePct={community.rulePct} onSet={(pid, h, v) => setGross(t.id, pid, h, v)} />
                ) : (
                  <ScoreMatrix event={{ teams: [t] }} course={course} onChange={setGross} />
                )}
                <GroupLiveSummary course={course} playerList={t.players}
                  scores={Object.fromEntries(t.players.map((p) => [p.id, p.gross]))} rulePct={community.rulePct} />
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {teams.map((tm) => {
                  const done = teamFilled(tm);
                  return (
                    <Card key={tm.id} style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>Equipo {tm.id} · salida hoyo {tm.start}</div>
                        <div style={{ color: "#7a8780", fontSize: 13 }}>{tm.players.map((p) => p.name).join(", ")}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {done ? <Chip tone="green">Completo</Chip> : <Chip tone="neutral">Pendiente</Chip>}
                        <Btn variant={done ? "ghost" : "primary"} onClick={() => setScoringTeam(tm.id)}>{done ? "Editar" : "Llenar scores"}</Btn>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
              <Btn variant="danger" onClick={onCancel}>Cancelar</Btn>
              <div style={{ display: "flex", gap: 10 }}>
                <Btn variant="ghost" onClick={() => { setScoringTeam(null); setStep(2); }}>← Atrás</Btn>
                <Btn variant="gold" disabled={!allFilled} onClick={() => { setScoringTeam(null); setStep(4); }}>Terminar ronda →</Btn>
              </div>
            </div>
            {!allFilled && <div style={{ color: "#7a8780", fontSize: 13, marginTop: 8, textAlign: "right" }}>Completa todos los scores para terminar.</div>}
          </div>
        );
      })()}

      {step === 4 && results && (
        <div>
          <Results results={results} community={community} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
            <Btn variant="ghost" onClick={() => setStep(3)}>← Editar scores</Btn>
            <Btn variant="gold" onClick={() => onSave({ ...event, results })}>Guardar ronda</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- COMUNIDADES ---------------- */
function Communities({ communities, me, onOpen, onCreate }) {
  const [creating, setCreating] = useState(false);
  const [f, setF] = useState({ name: "", rulePct: 85, tokenValue: 5, currency: "S/.", front: 2, back: 2, match: 3, bye: 1, medalTokens: 0, medalPct: 100, regla8: false });
  const [err, setErr] = useState("");
  const upd = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const mine = communities.filter((c) => c.members.includes(me.id) || c.admin === me.id);
  const others = communities.filter((c) => !mine.includes(c));

  if (creating) {
    return (
      <Card style={{ padding: 22, maxWidth: 560 }}>
        <div style={{ fontFamily: "'Fraunces'", fontWeight: 600, fontSize: 22, color: C.green, marginBottom: 16 }}>Nueva comunidad</div>
        <Field label="Nombre de la comunidad"><input style={inputStyle} value={f.name} onChange={upd("name")} /></Field>
        <Field label="Modo de juego"><input style={{ ...inputStyle, background: C.cream }} value="Machetero" disabled /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Field label="Regla % hándicap"><input style={inputStyle} type="number" value={f.rulePct} onChange={upd("rulePct")} /></Field>
          <Field label="Valor del token"><input style={inputStyle} type="number" value={f.tokenValue} onChange={upd("tokenValue")} /></Field>
          <Field label="Moneda">
            <select style={inputStyle} value={f.currency} onChange={upd("currency")}><option>S/.</option><option>$</option></select>
          </Field>
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: C.green, letterSpacing: .4, textTransform: "uppercase", marginBottom: 8 }}>Tokens por apuesta</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
          {[["front","Front"],["back","Back"],["match","Match"],["bye","Bye"]].map(([k,l])=>(
            <Field key={k} label={l}><input style={inputStyle} type="number" value={f[k]} onChange={upd(k)} /></Field>
          ))}
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: C.green, letterSpacing: .4, textTransform: "uppercase", marginBottom: 8 }}>Medal (opcional)</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Caminos Medal (0 = sin Medal)"><input style={inputStyle} type="number" value={f.medalTokens} onChange={upd("medalTokens")} /></Field>
          <Field label="% hándicap del Medal"><input style={inputStyle} type="number" value={f.medalPct} onChange={upd("medalPct")} /></Field>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, cursor: "pointer" }}>
          <input type="checkbox" checked={f.regla8} onChange={(e) => setF({ ...f, regla8: e.target.checked })} style={{ width: 18, height: 18 }} />
          <span style={{ fontSize: 13.5 }}><b>Regla 8</b>: en par 3 marcados de la cancha, el stroke solo sirve para empatar (no para ganar el hoyo).</span>
        </label>
        {err && <div style={{ color: C.red, fontSize: 13.5, fontWeight: 600, marginBottom: 10 }}>{err}</div>}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
          <Btn variant="ghost" onClick={() => setCreating(false)}>Cancelar</Btn>
          <Btn onClick={() => {
            if (!f.name.trim()) { setErr("Pon un nombre."); return; }
            if (communities.some((c) => c.name.toLowerCase() === f.name.trim().toLowerCase())) { setErr("Ese nombre ya existe."); return; }
            onCreate({
              id: "c" + Date.now(), name: f.name.trim(), gameMode: "Machetero",
              rulePct: +f.rulePct, tokenValue: +f.tokenValue, currency: f.currency,
              bet: { front: +f.front, back: +f.back, match: +f.match, bye: +f.bye },
              medal: { tokens: +f.medalTokens, rulePct: +f.medalPct }, regla8: !!f.regla8,
              admin: me.id, admins: [], members: [me.id],
            });
            setCreating(false);
          }}>Crear comunidad</Btn>
        </div>
      </Card>
    );
  }

  const Row = ({ c }) => {
    const isMember = c.members.includes(me.id) || c.admin === me.id;
    return (
      <Card style={{ padding: 16, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 17 }}>{c.name} {c.admin === me.id && <Chip tone="gold">Admin</Chip>}</div>
          <div style={{ color: "#7a8780", fontSize: 13, marginTop: 3 }}>{c.gameMode} · {c.rulePct}% hcp · {c.currency}{c.tokenValue} / token · {c.members.length} miembros</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {!isMember && <Btn variant="ghost" onClick={() => onCreate({ ...c, members: [...c.members, me.id] }, true)}>Unirme</Btn>}
          <Btn onClick={() => onOpen(c)}>Entrar</Btn>
        </div>
      </Card>
    );
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontFamily: "'Fraunces'", fontWeight: 600, fontSize: 24, color: C.green }}>Comunidades</div>
        <Btn variant="gold" onClick={() => setCreating(true)}>+ Nueva comunidad</Btn>
      </div>
      {mine.length > 0 && <div style={{ fontSize: 13, fontWeight: 700, color: "#7a8780", margin: "6px 0", textTransform: "uppercase", letterSpacing: .5 }}>Mis comunidades</div>}
      {mine.map((c) => <Row key={c.id} c={c} />)}
      {others.length > 0 && <div style={{ fontSize: 13, fontWeight: 700, color: "#7a8780", margin: "18px 0 6px", textTransform: "uppercase", letterSpacing: .5 }}>Otras comunidades</div>}
      {others.map((c) => <Row key={c.id} c={c} />)}
    </div>
  );
}

/* ---------------- PERFIL / ESTADÍSTICAS ---------------- */
function PlayerView({ me, rounds, communities, players, courses: coursesProp }) {
  const byComm = playerMoneyByCommunity(me.id, rounds);
  const myRounds = rounds.filter((r) => r.results.rows.some((x) => x.id === me.id));
  const grandTotal = byComm.reduce((s, b) => s + b.total, 0);
  const cName = (id) => communities.find((c) => c.id === id)?.name || "Comunidad";
  const cCur = (id) => communities.find((c) => c.id === id)?.currency || "S/.";
  const courses = coursesProp || [];
  const stats = playerScoreStats(me.id, rounds, courses);
  const hcpHist = playerHcpHistory(me.id, rounds);
  const maxCat = Math.max(1, ...Object.values(stats.counts));

  return (
    <div>
      <div style={{ fontFamily: "'Fraunces'", fontWeight: 600, fontSize: 24, color: C.green, marginBottom: 14 }}>Mi perfil</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14, marginBottom: 22 }}>
        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#7a8780", textTransform: "uppercase" }}>Jugador</div>
          <div style={{ fontFamily: "'Fraunces'", fontSize: 22, fontWeight: 600, marginTop: 4 }}>{me.name} {me.last}</div>
          <div style={{ color: "#7a8780", fontSize: 13.5, marginTop: 2 }}>{me.email}</div>
        </Card>
        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#7a8780", textTransform: "uppercase" }}>Rondas jugadas</div>
          <div style={{ fontFamily: "'Fraunces'", fontSize: 30, fontWeight: 900, color: C.green, marginTop: 4 }}>{myRounds.length}</div>
        </Card>
        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#7a8780", textTransform: "uppercase" }}>Balance total</div>
          <div style={{ fontFamily: "'Fraunces'", fontSize: 30, fontWeight: 900, marginTop: 4, color: grandTotal >= 0 ? C.green : C.red }}>{money(grandTotal)}</div>
        </Card>
      </div>

      {/* MONEY LIST POR COMUNIDAD */}
      <div style={{ fontFamily: "'Fraunces'", fontWeight: 600, fontSize: 18, color: C.green, marginBottom: 10 }}>Money list por comunidad</div>
      {byComm.length === 0 ? (
        <Card style={{ padding: 22, color: "#7a8780", marginBottom: 22 }}>
          Aún no apareces como participante en ninguna ronda. Cuando inicies una ronda e incluyas tu nombre en un equipo, tus resultados se acumularán aquí por comunidad.
        </Card>
      ) : (
        <Card style={{ overflow: "hidden", marginBottom: 22 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr .7fr 1fr 1fr 1fr", background: C.greenDeep, color: C.lime, fontWeight: 700, fontSize: 12.5, padding: "10px 14px" }}>
            <div>Comunidad</div><div style={{ textAlign: "center" }}>Rondas</div><div style={{ textAlign: "right" }}>Mejor</div><div style={{ textAlign: "right" }}>Peor</div><div style={{ textAlign: "right" }}>Acumulado</div>
          </div>
          {byComm.map((b, i) => (
            <div key={b.communityId} style={{ display: "grid", gridTemplateColumns: "1.5fr .7fr 1fr 1fr 1fr", padding: "11px 14px", alignItems: "center", borderTop: `1px solid ${C.line}`, background: i % 2 ? C.cream : C.paper }}>
              <div style={{ fontWeight: 600 }}>{cName(b.communityId)}</div>
              <div style={{ textAlign: "center" }}>{b.rounds}</div>
              <div style={{ textAlign: "right", color: C.green, fontSize: 13 }}>{money(b.best, cCur(b.communityId))}</div>
              <div style={{ textAlign: "right", color: C.red, fontSize: 13 }}>{money(b.worst, cCur(b.communityId))}</div>
              <div style={{ textAlign: "right", fontWeight: 800, fontFamily: "'Fraunces'", fontSize: 16, color: b.total >= 0 ? C.green : C.red }}>{money(b.total, cCur(b.communityId))}</div>
            </div>
          ))}
        </Card>
      )}

      {/* ESTADÍSTICAS DE JUEGO */}
      <div style={{ fontFamily: "'Fraunces'", fontWeight: 600, fontSize: 18, color: C.green, marginBottom: 10 }}>Estadísticas de juego</div>
      {stats.holes === 0 ? (
        <Card style={{ padding: 22, color: "#7a8780", marginBottom: 22 }}>
          Tus estadísticas (águilas, birdies, pares, bogeys, dobles, +dobles) aparecerán aquí cuando juegues una ronda en la que estés incluido.
        </Card>
      ) : (
        <Card style={{ padding: 18, marginBottom: 22 }}>
          <div style={{ fontSize: 13, color: "#7a8780", marginBottom: 12 }}>Sobre {stats.holes} hoyos jugados</div>
          <div style={{ display: "grid", gap: 9 }}>
            {SCORE_CATS.map(([key, label, color]) => {
              const n = stats.counts[key];
              const pct = Math.round((n / stats.holes) * 100);
              return (
                <div key={key} style={{ display: "grid", gridTemplateColumns: "140px 1fr 70px", alignItems: "center", gap: 10 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{label}</div>
                  <div style={{ background: C.creamDk, borderRadius: 999, height: 16, overflow: "hidden" }}>
                    <div style={{ width: `${(n / maxCat) * 100}%`, height: "100%", background: color, borderRadius: 999, minWidth: n > 0 ? 6 : 0 }} />
                  </div>
                  <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700 }}>{n} <span style={{ color: "#9aa69e", fontWeight: 500 }}>· {pct}%</span></div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* MOVIMIENTO DE HÁNDICAP */}
      {hcpHist.length > 0 && (
        <>
          <div style={{ fontFamily: "'Fraunces'", fontWeight: 600, fontSize: 18, color: C.green, marginBottom: 10 }}>Movimiento de hándicap</div>
          <Card style={{ padding: 18, marginBottom: 22 }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 14, flexWrap: "wrap" }}>
              {hcpHist.map((h, i) => {
                const prev = i > 0 ? hcpHist[i - 1].hcp : null;
                const delta = prev == null ? 0 : h.hcp - prev;
                return (
                  <div key={i} style={{ textAlign: "center", minWidth: 70 }}>
                    <div style={{ fontFamily: "'Fraunces'", fontWeight: 900, fontSize: 26, color: C.green }}>{h.hcp}</div>
                    <div style={{ fontSize: 11.5, color: delta < 0 ? C.green : delta > 0 ? C.red : "#9aa69e", fontWeight: 700 }}>
                      {delta === 0 ? "—" : (delta > 0 ? "▲ +" + delta : "▼ " + delta)}
                    </div>
                    <div style={{ fontSize: 11, color: "#9aa69e", marginTop: 2 }}>{h.date}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 12, color: "#7a8780", marginTop: 12 }}>Hándicap registrado en cada ronda (de la más antigua a la más reciente).</div>
          </Card>
        </>
      )}

      {/* HISTORIAL */}
      <div style={{ fontFamily: "'Fraunces'", fontWeight: 600, fontSize: 18, color: C.green, marginBottom: 10 }}>Historial de rondas</div>
      {rounds.length === 0 && <Card style={{ padding: 22, color: "#7a8780" }}>Aún no hay rondas guardadas. Crea una desde “Iniciar Ronda”.</Card>}
      {rounds.map((r, i) => {
        const c = communities.find((x) => x.id === r.communityId);
        const myRow = r.results.rows.find((x) => x.id === me.id);
        const top = [...r.results.rows].sort((a, b) => b.totalMoney - a.totalMoney)[0];
        return (
          <Card key={i} style={{ padding: 14, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 700 }}>{c?.name || "Comunidad"} · {r.date}</div>
              <div style={{ color: "#7a8780", fontSize: 13 }}>{r.teams.length} equipos · {r.results.rows.length} jugadores</div>
            </div>
            <div style={{ textAlign: "right" }}>
              {myRow ? (
                <>
                  <div style={{ fontSize: 12, color: "#7a8780" }}>Tu resultado</div>
                  <div style={{ fontWeight: 800, color: myRow.totalMoney >= 0 ? C.green : C.red }}>{money(myRow.totalMoney, c?.currency)}</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: "#7a8780" }}>Mejor de la ronda</div>
                  <div style={{ fontWeight: 800, color: C.gold }}>{top?.name} · {money(top?.totalMoney || 0, c?.currency)}</div>
                </>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/* ---------------- GESTOR DE EVENTOS (inscripción → grupos → juego → consolidación) ---------------- */
/* mode: "admin" = gestión desde la comunidad (sin llenado de scores);
   "play" = anotación de scores desde Iniciar Ronda. */
function EventManager({ event, community, courses, players, me, setEvents, onSaveRound, onClose, mode = "admin" }) {
  const course = courses.find((c) => c.id === event.courseId) || courses[0];
  const admin = isAdmin(community, me.id);
  const updateEvent = (patch) => setEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, ...patch } : e)));
  const STATUS = { inscripcion: "Inscripción abierta", grupos: "Armando grupos", jugando: "En juego", cerrado: "Cerrado" };
  const registered = event.registered || [];
  const groups = event.groups || [];
  const [scoringGroup, setScoringGroup] = useState(null);
  const [entryMode, setEntryMode] = useState("hole"); // "hole" = hoyo por hoyo · "matrix" = tarjeta completa
  const [loanStep, setLoanStep] = useState(false);    // elección del jugador prestado al consolidar
  const [loanChoices, setLoanChoices] = useState({}); // {groupId: playerId}

  const memberPool = community.members.map((id) => ({ id, name: resolveName(id, players) }));
  const groupPlayerIds = (gid) => groups.filter((g) => g.id !== gid).flatMap((g) => g.playerIds);

  // ---- inscripción ----
  const toggleRegister = (pid) => {
    const has = registered.includes(pid);
    updateEvent({ registered: has ? registered.filter((x) => x !== pid) : [...registered, pid] });
  };

  // ---- grupos ----
  const addGroup = () => updateEvent({ groups: [...groups, { id: (groups.at(-1)?.id || 0) + 1, start: 1, playerIds: [], hcps: {}, scorerId: null, loanPlayerId: null, dropPlayerId: null, scores: {} }] });
  const setGroup = (gid, patch) => updateEvent({ groups: groups.map((g) => (g.id === gid ? { ...g, ...patch } : g)) });
  const removeGroup = (gid) => updateEvent({ groups: groups.filter((g) => g.id !== gid) });
  const toggleGroupPlayer = (gid, pid) => {
    const g = groups.find((x) => x.id === gid);
    const has = g.playerIds.includes(pid);
    if (!has && g.playerIds.length >= 5) return;
    if (!has && groupPlayerIds(gid).includes(pid)) return; // no duplicar entre grupos
    const playerIds = has ? g.playerIds.filter((x) => x !== pid) : [...g.playerIds, pid];
    const hcps = { ...g.hcps };
    if (!has) { const rec = players.find((p) => p.id === pid); hcps[pid] = rec && typeof rec.hcp === "number" ? rec.hcp : 0; }
    else delete hcps[pid];
    const scorerId = g.scorerId === pid && has ? null : g.scorerId;
    // si cambia la conformación del grupo, el sorteo de parejas anterior queda sin efecto
    setGroup(gid, { playerIds, hcps, scorerId, drawnOrder: null, drawnMode: null });
  };
  const setGroupHcp = (gid, pid, v) => { const g = groups.find((x) => x.id === gid); setGroup(gid, { hcps: { ...g.hcps, [pid]: v } }); };
  const setGroupScore = (gid, pid, h, v) => {
    const g = groups.find((x) => x.id === gid);
    const cur = g.scores[pid] ? g.scores[pid].slice() : new Array(18).fill("");
    cur[h] = v; setGroup(gid, { scores: { ...g.scores, [pid]: cur } });
  };
  const groupFilled = (g) => g.playerIds.length >= 3 && g.playerIds.every((pid) => (g.scores[pid] || []).length === 18 && g.scores[pid].every((s) => s !== "" && s != null));
  const allGroupsReady = groups.length >= 1 && groups.every((g) => g.playerIds.length >= 3 && g.scorerId);
  const allScored = groups.length >= 1 && groups.every(groupFilled);

  // El jugador prestado (grupos de 3) se decide recién al consolidar, con
  // todos los scores ya ingresados: llega en `choices` como {groupId: playerId}.
  const consolidate = (choices = {}) => {
    const teams = groups.map((g, i) => {
      const ids = groupOrder(g); // respeta el sorteo de parejas hecho en el tee
      return {
        id: i + 1, start: g.start,
        players: ids.map((pid) => ({ id: pid, name: resolveName(pid, players), hcp: typeof g.hcps[pid] === "number" ? g.hcps[pid] : parseInt(g.hcps[pid]) || 0, gross: g.scores[pid].map((s) => parseInt(s)) })),
        pairs: autoPairsIds(ids), loanPlayerId: choices[g.id] || g.loanPlayerId, dropPlayerId: g.dropPlayerId,
      };
    });
    const evObj = { id: event.id, courseId: event.courseId, communityId: community.id, date: event.date, teams, eventName: event.name };
    const rules = { rulePct: community.rulePct, tokenValue: community.tokenValue, bet: community.bet, medal: community.medal, regla8: community.regla8, currency: community.currency };
    const results = computeEvent(JSON.parse(JSON.stringify(evObj)), course, rules);
    onSaveRound({ ...evObj, results });
    updateEvent({ status: "cerrado", resultsRoundId: event.id });
  };

  const Head = () => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
      <div>
        <div style={{ fontFamily: "'Fraunces'", fontWeight: 600, fontSize: 24, color: C.green }}>{event.name}</div>
        <div style={{ color: "#7a8780", fontSize: 13.5, marginTop: 4 }}>{course?.name} · {event.date}</div>
        <div style={{ marginTop: 8 }}><Chip tone={event.status === "cerrado" ? "neutral" : "gold"}>{STATUS[event.status]}</Chip></div>
      </div>
      <Btn variant="ghost" onClick={onClose}>{mode === "play" ? "← Volver" : "← Volver a eventos"}</Btn>
    </div>
  );

  // ---- render por estado ----
  if (event.status === "inscripcion") {
    const iAmIn = registered.includes(me.id);
    return (
      <div>
        <Head />
        <Card style={{ padding: 18, marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div style={{ fontWeight: 700 }}>Inscritos ({registered.length})</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn variant="ghost" onClick={() => {
                const msg = `⛳ *${community.name}* — nuevo evento:\n*${event.name}*\n📅 ${event.date} · ${course?.name || ""}\n\nInscríbete en la app: ${window.location.origin}${window.location.pathname}`;
                window.open("https://wa.me/?text=" + encodeURIComponent(msg), "_blank");
              }}>📲 Avisar por WhatsApp</Btn>
              <Btn variant={iAmIn ? "danger" : "gold"} onClick={() => toggleRegister(me.id)}>{iAmIn ? "Salir del evento" : "Inscribirme"}</Btn>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            {registered.length === 0 && <div style={{ color: "#7a8780", fontSize: 13.5 }}>Nadie inscrito todavía. Usa "Avisar por WhatsApp" para convocar a la comunidad.</div>}
            {registered.map((id) => <Chip key={id} tone="green">{resolveName(id, players)}</Chip>)}
          </div>
        </Card>
        {admin && (
          <Card style={{ padding: 18, marginBottom: 14 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: C.green, textTransform: "uppercase", marginBottom: 8 }}>Inscribir miembros (admin)</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {memberPool.map((m) => {
                const sel = registered.includes(m.id);
                return <button key={m.id} onClick={() => toggleRegister(m.id)} style={{ border: `1.5px solid ${sel ? C.green : C.line}`, cursor: "pointer", borderRadius: 999, padding: "6px 13px", fontWeight: 600, fontSize: 13, background: sel ? C.green : "#fff", color: sel ? C.cream : C.ink }}>{m.name}</button>;
              })}
            </div>
          </Card>
        )}
        {admin && <Btn disabled={registered.length < 3} onClick={() => updateEvent({ status: "grupos", groups: groups.length ? groups : [{ id: 1, start: 1, playerIds: [], hcps: {}, scorerId: null, loanPlayerId: null, dropPlayerId: null, scores: {} }] })}>Cerrar inscripción y armar grupos →</Btn>}
        {!admin && <div style={{ color: "#7a8780", fontSize: 13 }}>El administrador cerrará la inscripción y armará los grupos.</div>}
      </div>
    );
  }

  if (event.status === "grupos") {
    const unassigned = registered.filter((id) => !groups.some((g) => g.playerIds.includes(id)));
    return (
      <div>
        <Head />
        {!admin && <Card style={{ padding: 18, color: "#7a8780" }}>El administrador está armando los grupos.</Card>}
        {admin && (
          <>
            {unassigned.length > 0 && <div style={{ fontSize: 13, color: "#7a8780", marginBottom: 10 }}>Sin asignar: {unassigned.map((id) => resolveName(id, players)).join(", ")}</div>}
            {groups.map((g) => (
              <Card key={g.id} style={{ padding: 16, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontWeight: 700, fontFamily: "'Fraunces'", fontSize: 17, color: C.green }}>Grupo {g.id}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: C.green }}>SALIDA</span>
                    {[1, 10].map((h) => <button key={h} onClick={() => setGroup(g.id, { start: h })} style={{ border: "none", cursor: "pointer", borderRadius: 8, padding: "5px 12px", fontWeight: 700, background: g.start === h ? C.green : C.creamDk, color: g.start === h ? C.cream : C.green }}>Hoyo {h}</button>)}
                    {groups.length > 1 && <button onClick={() => removeGroup(g.id)} style={{ border: "none", background: "transparent", color: C.red, cursor: "pointer", fontSize: 13, fontWeight: 700 }}>Eliminar</button>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                  {registered.map((id) => {
                    const sel = g.playerIds.includes(id);
                    const taken = !sel && groupPlayerIds(g.id).includes(id);
                    return <button key={id} disabled={taken} onClick={() => toggleGroupPlayer(g.id, id)} style={{ border: `1.5px solid ${sel ? C.green : C.line}`, cursor: taken ? "not-allowed" : "pointer", borderRadius: 999, padding: "6px 13px", fontWeight: 600, fontSize: 13, background: sel ? C.green : "#fff", color: sel ? C.cream : taken ? "#c2c9c0" : C.ink, textDecoration: taken ? "line-through" : "none", opacity: taken ? .6 : 1 }}>{resolveName(id, players)}</button>;
                  })}
                </div>
                {g.playerIds.length > 0 && (
                  <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 10 }}>
                    {g.playerIds.map((pid) => (
                      <div key={pid} style={{ display: "grid", gridTemplateColumns: "1.4fr .7fr .7fr", gap: 8, alignItems: "center", marginBottom: 6 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{resolveName(pid, players)}</div>
                        <input style={{ ...inputStyle, padding: "7px 9px" }} type="number" value={g.hcps[pid]} onChange={(e) => setGroupHcp(g.id, pid, e.target.value === "" ? "" : parseInt(e.target.value))} />
                        <div style={{ fontSize: 12.5, color: C.green, fontWeight: 700 }}>Aj. {g.hcps[pid] === "" || g.hcps[pid] == null ? "—" : adjustedHcp(g.hcps[pid], community.rulePct)}</div>
                      </div>
                    ))}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
                      <Field label="Anotador del grupo">
                        <select style={{ ...inputStyle, padding: "8px 10px" }} value={g.scorerId || ""} onChange={(e) => setGroup(g.id, { scorerId: e.target.value || null })}>
                          <option value="">Elegir…</option>
                          {g.playerIds.map((pid) => <option key={pid} value={pid}>{resolveName(pid, players)}</option>)}
                        </select>
                      </Field>
                      {g.playerIds.length === 3 && (
                        <div style={{ fontSize: 12.5, color: "#7a8780", alignSelf: "end", paddingBottom: 14 }}>
                          Grupo de 3: el jugador <b>prestado</b> para Grupos vs. Grupos se elige al final, al consolidar el evento.
                        </div>
                      )}
                      {g.playerIds.length === 5 && (
                        <Field label="Eliminar (Grupos vs. Grupos)">
                          <select style={{ ...inputStyle, padding: "8px 10px" }} value={g.dropPlayerId || ""} onChange={(e) => setGroup(g.id, { dropPlayerId: e.target.value || null })}>
                            <option value="">Automático</option>
                            {g.playerIds.map((pid) => <option key={pid} value={pid}>{resolveName(pid, players)}</option>)}
                          </select>
                        </Field>
                      )}
                    </div>
                    {g.playerIds.length >= 4 && (
                      <TeeDraw g={g} players={players} canDraw onDraw={(final, mode) => setGroup(g.id, { drawnOrder: final, drawnMode: mode })} />
                    )}
                  </div>
                )}
              </Card>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Btn variant="ghost" onClick={addGroup}>+ Añadir grupo</Btn>
              <div style={{ display: "flex", gap: 10 }}>
                <Btn variant="ghost" onClick={() => updateEvent({ status: "inscripcion" })}>← Inscripción</Btn>
                <Btn disabled={!allGroupsReady} onClick={() => updateEvent({ status: "jugando" })}>Confirmar grupos →</Btn>
              </div>
            </div>
            {!allGroupsReady && <div style={{ color: C.red, fontSize: 13, marginTop: 8, textAlign: "right" }}>Cada grupo necesita 3–5 jugadores y un anotador.</div>}
            <div style={{ fontSize: 12.5, color: "#7a8780", marginTop: 8, textAlign: "right" }}>Aquí solo se confirma quiénes juegan juntos y su salida — las parejas se sortean en el tee, al momento de salir.</div>
          </>
        )}
      </div>
    );
  }

  if (event.status === "jugando") {
    const g = mode === "play" ? groups.find((x) => x.id === scoringGroup) : null;
    if (g) {
      // el orden sorteado define las parejas del resumen interno
      const playerList = groupOrder(g).map((pid) => ({ id: pid, name: resolveName(pid, players), hcp: g.hcps[pid] }));
      return (
        <div>
          <Head />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            <div>
              <div style={{ fontWeight: 700 }}>Grupo {g.id} · anotador: {resolveName(g.scorerId, players)}</div>
              <div style={{ fontSize: 13, color: "#7a8780" }}>Golpes brutos por hoyo · solo números enteros.</div>
            </div>
            <div style={{ display: "flex", gap: 4, background: C.creamDk, borderRadius: 10, padding: 3 }}>
              {[["hole", "Hoyo por hoyo"], ["matrix", "Tarjeta completa"]].map(([m, l]) => (
                <button key={m} onClick={() => setEntryMode(m)} style={{ border: "none", cursor: "pointer", borderRadius: 8, padding: "7px 12px", fontWeight: 700, fontSize: 12.5,
                  fontFamily: "'Spline Sans',sans-serif", background: entryMode === m ? C.green : "transparent", color: entryMode === m ? C.cream : C.green }}>{l}</button>
              ))}
            </div>
          </div>

          {entryMode === "hole" ? (
            <HoleByHole key={g.id} course={course} start={g.start} playerList={playerList} scores={g.scores} rulePct={community.rulePct}
              onSet={(pid, h, v) => setGroupScore(g.id, pid, h, v)} />
          ) : (
            <div style={{ overflowX: "auto", border: `1px solid ${C.line}`, borderRadius: 14 }}>
              <div style={{ minWidth: 30 * 19 + 140 }}>
                <div style={{ display: "grid", gridTemplateColumns: `140px repeat(18, minmax(30px,1fr))` }}>
                  <div style={{ ...cellHead, textAlign: "left", paddingLeft: 10 }}>Hoyo</div>
                  {course.pars.map((_, i) => <div key={i} style={cellHead}>{i + 1}</div>)}
                  <div style={{ ...cellHead, background: "#143b2c", textAlign: "left", paddingLeft: 10 }}>Par</div>
                  {course.pars.map((p, i) => <div key={i} style={{ ...cellHead, background: "#143b2c", color: C.cream }}>{p}</div>)}
                  {g.playerIds.map((pid) => (
                    <React.Fragment key={pid}>
                      <div style={{ padding: "6px 10px", fontWeight: 600, fontSize: 13, background: C.cream, borderTop: `1px solid ${C.line}`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{resolveName(pid, players)}</div>
                      {Array.from({ length: 18 }, (_, h) => (
                        <input key={h} value={(g.scores[pid] || [])[h] ?? ""} inputMode="numeric" pattern="[0-9]*" onChange={(e) => setGroupScore(g.id, pid, h, e.target.value.replace(/[^0-9]/g, "") === "" ? "" : parseInt(e.target.value.replace(/[^0-9]/g, "")))}
                          style={{ border: `1px solid ${C.line}`, textAlign: "center", fontFamily: "'Spline Sans'", fontSize: 14, padding: "6px 0", outline: "none", background: "#fff", minWidth: 30 }} />
                      ))}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>
          )}

          <GroupLiveSummary course={course} playerList={playerList} scores={g.scores} rulePct={community.rulePct} />

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14 }}>
            <Btn variant="ghost" onClick={() => setScoringGroup(null)}>← Grupos</Btn>
            <Btn variant="gold" disabled={!groupFilled(g)} onClick={() => setScoringGroup(null)}>Guardar scores del grupo</Btn>
          </div>
        </div>
      );
    }
    const threeGroups = groups.filter((x) => x.playerIds.length === 3);
    const grossTotal = (pid) => {
      for (const gr of groups) { const s = gr.scores[pid]; if (s && s.length) return s.reduce((sum, v) => sum + (parseInt(v) || 0), 0); }
      return null;
    };
    const allLoansChosen = threeGroups.every((x) => loanChoices[x.id]);
    const startConsolidate = () => {
      if (threeGroups.length > 0) { setLoanChoices({}); setLoanStep(true); }
      else consolidate({});
    };
    return (
      <div>
        <Head />
        {mode === "admin" && (
          <Card style={{ padding: 12, marginBottom: 12, background: C.cream }}>
            <div style={{ fontSize: 13, color: "#3a4a42" }}>ℹ️ Los scores se anotan desde <b>Iniciar Ronda</b> (cada anotador entra ahí desde su celular). Aquí puedes ver el avance, gestionar las parejas y consolidar al final.</div>
          </Card>
        )}
        <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
          {groups.map((g) => {
            const done = groupFilled(g);
            const canDraw = admin || g.playerIds.includes(me.id);
            return (
              <Card key={g.id} style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>Grupo {g.id} · salida hoyo {g.start}</div>
                    <div style={{ color: "#7a8780", fontSize: 13 }}>{g.playerIds.map((id) => resolveName(id, players)).join(", ")}</div>
                    <div style={{ fontSize: 12.5, color: "#7a8780", marginTop: 3 }}>Anotador: {resolveName(g.scorerId, players)}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {done ? <Chip tone="green">Completo</Chip> : <Chip tone="neutral">Pendiente</Chip>}
                    {mode === "play" && <Btn variant={done ? "ghost" : "primary"} onClick={() => setScoringGroup(g.id)}>{done ? "Editar" : "Llenar scores"}</Btn>}
                  </div>
                </div>
                <TeeDraw g={g} players={players} canDraw={canDraw} onDraw={(final, dm) => setGroup(g.id, { drawnOrder: final, drawnMode: dm })} />
              </Card>
            );
          })}
        </div>

        {admin && loanStep && (
          <Card style={{ padding: 18, marginBottom: 14, border: `1.5px solid ${C.gold}` }}>
            <div style={{ fontFamily: "'Fraunces'", fontWeight: 600, fontSize: 18, color: C.green, marginBottom: 6 }}>Jugador prestado para grupos de 3</div>
            <div style={{ fontSize: 13, color: "#7a8780", marginBottom: 12 }}>
              Para el concurso <b>Grupos vs. Grupos</b>, cada grupo de 3 recibe un jugador prestado de otro grupo, que entra con el score que ya jugó.
            </div>
            {threeGroups.map((tg) => (
              <Field key={tg.id} label={`Prestado para el Grupo ${tg.id} (${tg.playerIds.map((id) => resolveName(id, players).split(" ")[0]).join(", ")})`}>
                <select style={inputStyle} value={loanChoices[tg.id] || ""} onChange={(e) => setLoanChoices({ ...loanChoices, [tg.id]: e.target.value || undefined })}>
                  <option value="">Elegir jugador…</option>
                  {groups.filter((x) => x.id !== tg.id).flatMap((x) => x.playerIds).map((pid) => (
                    <option key={pid} value={pid}>{resolveName(pid, players)} — {grossTotal(pid) ?? "?"} golpes</option>
                  ))}
                </select>
              </Field>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <Btn variant="ghost" onClick={() => setLoanStep(false)}>Cancelar</Btn>
              <Btn variant="gold" disabled={!allLoansChosen} onClick={() => { setLoanStep(false); consolidate(loanChoices); }}>Confirmar y consolidar →</Btn>
            </div>
          </Card>
        )}

        {admin && !loanStep && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <Btn variant="ghost" onClick={() => updateEvent({ status: "grupos" })}>← Grupos</Btn>
            <Btn variant="gold" disabled={!allScored} onClick={startConsolidate}>Consolidar resultados →</Btn>
          </div>
        )}
        {!allScored && <div style={{ color: "#7a8780", fontSize: 13, marginTop: 8 }}>Cuando todos los grupos estén completos, el admin consolida el evento.</div>}
      </div>
    );
  }

  // cerrado
  return (
    <div>
      <Head />
      <Card style={{ padding: 18, color: "#7a8780" }}>Evento consolidado. Los resultados están en la pestaña <b style={{ color: C.green }}>Resultados</b> de la comunidad y en la Money List.</Card>
    </div>
  );
}


function CommunityDetail({ community, rounds, players, communities, me, events, setEvents, courses, onUpdateCommunity, onSaveRound, onBack, onStartRound, initialEventId }) {
  const [tab, setTab] = useState(initialEventId ? "eventos" : "jugadores");
  const [openRound, setOpenRound] = useState(null);
  const [managingEventId, setManagingEventId] = useState(initialEventId || null);
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [evForm, setEvForm] = useState({ name: "", courseId: courses[0]?.id, date: new Date().toISOString().slice(0, 10) });
  const cur = community.currency;
  const commRounds = rounds.filter((r) => r.communityId === community.id);
  const list = communityMoneyList(community.id, rounds);
  const commEvents = events.filter((e) => e.communityId === community.id);
  const iAmAdmin = isAdmin(community, me.id);
  const isOwner = community.admin === me.id;
  const managingEvent = commEvents.find((e) => e.id === managingEventId);

  const toggleAdmin = (pid) => {
    const admins = community.admins || [];
    const next = admins.includes(pid) ? admins.filter((x) => x !== pid) : [...admins, pid];
    onUpdateCommunity({ ...community, admins: next });
  };

  const Tab = ({ id, label }) => (
    <button onClick={() => { setTab(id); setOpenRound(null); setManagingEventId(null); }} style={{
      border: "none", cursor: "pointer", padding: "9px 16px", borderRadius: 10, fontWeight: 700, fontSize: 14,
      fontFamily: "'Spline Sans',sans-serif", background: tab === id ? C.green : "transparent", color: tab === id ? C.cream : C.green }}>{label}</button>
  );
  const EVSTATUS = { inscripcion: ["Inscripción", "gold"], grupos: ["Armando grupos", "gold"], jugando: ["En juego", "green"], cerrado: ["Cerrado", "neutral"] };

  return (
    <div>
      <Btn variant="ghost" onClick={onBack} style={{ marginBottom: 14 }}>← Volver</Btn>
      <Card style={{ padding: 22, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontFamily: "'Fraunces'", fontWeight: 600, fontSize: 26, color: C.green }}>{community.name}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0 0" }}>
              <Chip tone="gold">{community.gameMode}</Chip>
              <Chip tone="neutral">Regla {community.rulePct}%</Chip>
              <Chip tone="neutral">Token {community.currency}{community.tokenValue}</Chip>
              <Chip tone="green">F{community.bet.front} · B{community.bet.back} · M{community.bet.match} · Bye{community.bet.bye}</Chip>
              {community.medal && community.medal.tokens > 0 && <Chip tone="gold">Medal {community.medal.tokens} ({community.medal.rulePct}%)</Chip>}
            </div>
          </div>
          <Btn onClick={onStartRound}>Ronda rápida</Btn>
        </div>
      </Card>

      {!userIsPro(me) && !community.pro && <AdSlot />}

      <div style={{ display: "flex", gap: 6, marginBottom: 16, background: C.creamDk, borderRadius: 12, padding: 4, width: "fit-content", flexWrap: "wrap" }}>
        <Tab id="jugadores" label={`Jugadores (${community.members.length})`} />
        <Tab id="moneylist" label="Money List" />
        <Tab id="eventos" label={`Eventos (${commEvents.length})`} />
        <Tab id="resultados" label={`Resultados (${commRounds.length})`} />
      </div>

      {tab === "jugadores" && (
        <div>
          {isOwner && <div style={{ fontSize: 13, color: "#7a8780", marginBottom: 10 }}>Como dueño, puedes nombrar administradores (pueden crear eventos).</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", gap: 10 }}>
            {community.members.map((id) => {
              const owner = community.admin === id;
              const adminFlag = (community.admins || []).includes(id);
              return (
                <Card key={id} style={{ padding: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 999, background: C.green, color: C.lime, display: "grid", placeItems: "center", fontWeight: 800, fontFamily: "'Fraunces'" }}>{resolveName(id, players).slice(0, 1)}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14.5 }}>{resolveName(id, players)}</div>
                      <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
                        {owner && <Chip tone="gold">Dueño</Chip>}
                        {!owner && adminFlag && <Chip tone="green">Admin</Chip>}
                      </div>
                    </div>
                  </div>
                  {isOwner && !owner && (
                    <button onClick={() => toggleAdmin(id)} style={{ marginTop: 10, width: "100%", border: `1.5px solid ${adminFlag ? C.redSoft : C.green}`, background: "transparent", color: adminFlag ? C.red : C.green, cursor: "pointer", borderRadius: 9, padding: "6px", fontWeight: 600, fontSize: 13 }}>
                      {adminFlag ? "Quitar admin" : "Hacer admin"}
                    </button>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {tab === "moneylist" && (
        list.length === 0 ? <Card style={{ padding: 22, color: "#7a8780" }}>Todavía no hay rondas jugadas en esta comunidad.</Card> : (
          <Card style={{ overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "26px 1.6fr .7fr 1fr 1fr 1fr", background: C.greenDeep, color: C.lime, fontWeight: 700, fontSize: 12.5, padding: "10px 14px" }}>
              <div>#</div><div>Jugador</div><div style={{ textAlign: "center" }}>Rdas</div><div style={{ textAlign: "right" }}>Mejor</div><div style={{ textAlign: "right" }}>Peor</div><div style={{ textAlign: "right" }}>Acumulado</div>
            </div>
            {list.map((p, i) => (
              <div key={p.id} style={{ display: "grid", gridTemplateColumns: "26px 1.6fr .7fr 1fr 1fr 1fr", padding: "11px 14px", alignItems: "center", borderTop: `1px solid ${C.line}`, background: i % 2 ? C.cream : C.paper }}>
                <div style={{ fontWeight: 800, color: i === 0 ? C.gold : "#9aa69e", fontFamily: "'Fraunces'" }}>{i + 1}</div>
                <div style={{ fontWeight: 600 }}>{p.name}</div>
                <div style={{ textAlign: "center" }}>{p.rounds}</div>
                <div style={{ textAlign: "right", color: C.green, fontSize: 13 }}>{money(p.best, cur)}</div>
                <div style={{ textAlign: "right", color: C.red, fontSize: 13 }}>{money(p.worst, cur)}</div>
                <div style={{ textAlign: "right", fontWeight: 800, fontFamily: "'Fraunces'", fontSize: 16, color: p.total >= 0 ? C.green : C.red }}>{money(p.total, cur)}</div>
              </div>
            ))}
          </Card>
        )
      )}

      {tab === "eventos" && (
        managingEvent ? (
          <EventManager event={managingEvent} community={community} courses={courses} players={players} me={me} setEvents={setEvents} onSaveRound={onSaveRound} onClose={() => setManagingEventId(null)} />
        ) : creatingEvent ? (
          <Card style={{ padding: 22, maxWidth: 520 }}>
            <div style={{ fontFamily: "'Fraunces'", fontWeight: 600, fontSize: 20, color: C.green, marginBottom: 14 }}>Nuevo evento</div>
            <Field label="Nombre del evento"><input style={inputStyle} value={evForm.name} onChange={(e) => setEvForm({ ...evForm, name: e.target.value })} placeholder="Ej: Fecha 5 — Mayo" /></Field>
            <Field label="Cancha">
              <select style={inputStyle} value={evForm.courseId} onChange={(e) => setEvForm({ ...evForm, courseId: e.target.value })}>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Fecha"><input style={inputStyle} type="date" value={evForm.date} onChange={(e) => setEvForm({ ...evForm, date: e.target.value })} /></Field>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              <Btn variant="ghost" onClick={() => setCreatingEvent(false)}>Cancelar</Btn>
              <Btn onClick={() => {
                if (!evForm.name.trim()) return;
                const ev = { id: "ev" + Date.now(), communityId: community.id, courseId: evForm.courseId, date: evForm.date, name: evForm.name.trim(), status: "inscripcion", createdBy: me.id, registered: [], groups: [], resultsRoundId: null };
                setEvents((prev) => [ev, ...prev]); setCreatingEvent(false); setManagingEventId(ev.id);
              }}>Crear evento</Btn>
            </div>
          </Card>
        ) : (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 13, color: "#7a8780" }}>{iAmAdmin ? "Crea eventos y los miembros se inscriben." : "Los administradores crean los eventos; tú te inscribes."}</div>
              {iAmAdmin && <Btn variant="gold" onClick={() => { setEvForm({ name: "", courseId: courses[0]?.id, date: new Date().toISOString().slice(0, 10) }); setCreatingEvent(true); }}>+ Crear evento</Btn>}
            </div>
            {commEvents.length === 0 ? <Card style={{ padding: 22, color: "#7a8780" }}>No hay eventos activos. {iAmAdmin ? "Crea el primero." : ""}</Card> : (
              <div style={{ display: "grid", gap: 10 }}>
                {commEvents.map((e) => {
                  const [lbl, tone] = EVSTATUS[e.status] || ["—", "neutral"];
                  const co = courses.find((c) => c.id === e.courseId);
                  return (
                    <Card key={e.id} style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{e.name} <Chip tone={tone}>{lbl}</Chip></div>
                        <div style={{ color: "#7a8780", fontSize: 13, marginTop: 2 }}>{co?.name} · {e.date} · {(e.registered || []).length} inscritos</div>
                      </div>
                      <Btn variant={e.status === "cerrado" ? "ghost" : "primary"} onClick={() => setManagingEventId(e.id)}>{e.status === "inscripcion" ? "Inscribirme / Gestionar" : "Gestionar"}</Btn>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )
      )}

      {tab === "resultados" && (
        commRounds.length === 0 ? <Card style={{ padding: 22, color: "#7a8780" }}>Aún no hay resultados consolidados en esta comunidad.</Card> : (
          <div style={{ display: "grid", gap: 10 }}>
            {commRounds.map((r, i) => {
              const top = [...r.results.rows].sort((a, b) => b.totalMoney - a.totalMoney)[0];
              const isOpen = openRound === i;
              return (
                <Card key={i} style={{ padding: 0, overflow: "hidden" }}>
                  <div onClick={() => setOpenRound(isOpen ? null : i)} style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{r.eventName ? r.eventName : "Evento"} · {r.date}</div>
                      <div style={{ color: "#7a8780", fontSize: 13 }}>{r.teams.length} equipos · {r.results.rows.length} jugadores · líder {top?.name}</div>
                    </div>
                    <span style={{ color: C.green, fontWeight: 700 }}>{isOpen ? "Ocultar ▲" : "Ver resultados ▼"}</span>
                  </div>
                  {isOpen && <div style={{ padding: "0 16px 18px", borderTop: `1px solid ${C.line}` }}><div style={{ marginTop: 14 }}><Results results={r.results} community={community} /></div></div>}
                </Card>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

/* ---------------- MONETIZACIÓN: anuncios y suscripción ---------------- */
const userIsPro = (me) => me && me.plan === "pro";

function AdSlot({ label = "Espacio publicitario", height = 92 }) {
  return (
    <div style={{ border: `1.5px dashed ${C.line}`, borderRadius: 14, minHeight: height, display: "grid", placeItems: "center", color: "#9aa69e", margin: "14px 0",
      background: "repeating-linear-gradient(45deg,#faf7ee,#faf7ee 10px,#f2ecda 10px,#f2ecda 20px)" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase", fontSize: 12.5 }}>{label}</div>
        <div style={{ fontSize: 11, marginTop: 3 }}>Anuncio · se oculta con GolfBuddy Pro</div>
      </div>
    </div>
  );
}

function SubscriptionView({ me, onSetPlan, myOwnedCommunities, onToggleCommunityPro }) {
  const pro = userIsPro(me);
  const Plan = ({ title, price, features, active, cta, onClick, tone }) => (
    <Card style={{ padding: 22, border: active ? `2px solid ${C.gold}` : `1px solid ${C.line}`, position: "relative" }}>
      {active && <div style={{ position: "absolute", top: 14, right: 14 }}><Chip tone="gold">Tu plan</Chip></div>}
      <div style={{ fontFamily: "'Fraunces'", fontWeight: 600, fontSize: 22, color: C.green }}>{title}</div>
      <div style={{ fontFamily: "'Fraunces'", fontWeight: 900, fontSize: 30, color: C.ink, margin: "6px 0 14px" }}>{price}</div>
      <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
        {features.map((f, i) => <div key={i} style={{ fontSize: 13.5, color: "#3a4a42" }}>✓ {f}</div>)}
      </div>
      {cta && <Btn variant={tone || "primary"} onClick={onClick} style={{ width: "100%" }}>{cta}</Btn>}
    </Card>
  );
  return (
    <div>
      <div style={{ fontFamily: "'Fraunces'", fontWeight: 600, fontSize: 24, color: C.green, marginBottom: 6 }}>GolfBuddy Pro</div>
      <div style={{ color: "#7a8780", fontSize: 14, marginBottom: 18 }}>La suscripción sostiene el servidor en la nube y el score en vivo. Los anuncios apoyan el plan gratuito.</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14 }}>
        <Plan title="Gratis" price="S/.0" active={!pro}
          features={["Calcular rondas y resultados", "Money list y estadísticas básicas", "Con anuncios"]} />
        <Plan title="Pro (jugador)" price={<>S/.12<span style={{ fontSize: 14, fontWeight: 400 }}>/mes</span></>} active={pro}
          features={["Sin anuncios", "Historial y estadísticas completas", "Score en vivo en tus eventos"]}
          cta={pro ? "Cancelar Pro (demo)" : "Suscribirme (demo)"} tone={pro ? "ghost" : "gold"}
          onClick={() => onSetPlan(pro ? "free" : "pro")} />
        <Plan title="Pro Comunidad" price={<>S/.49<span style={{ fontSize: 14, fontWeight: 400 }}>/mes</span></>}
          features={["Todo Pro para hasta 30 miembros", "Sin anuncios para el grupo", "Lo paga el organizador"]}
          cta={myOwnedCommunities.length ? "Gestionar abajo" : "Crea una comunidad"} tone="ghost" onClick={() => {}} />
      </div>

      {myOwnedCommunities.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div style={{ fontFamily: "'Fraunces'", fontWeight: 600, fontSize: 18, color: C.green, marginBottom: 10 }}>Pro Comunidad (eres dueño)</div>
          <div style={{ display: "grid", gap: 10 }}>
            {myOwnedCommunities.map((c) => (
              <Card key={c.id} style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div><div style={{ fontWeight: 700 }}>{c.name}</div><div style={{ fontSize: 13, color: "#7a8780" }}>{c.members.length} miembros · {c.pro ? "Pro activo" : "Plan gratis"}</div></div>
                <Btn variant={c.pro ? "ghost" : "gold"} onClick={() => onToggleCommunityPro(c)}>{c.pro ? "Desactivar (demo)" : "Activar Pro (demo)"}</Btn>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Card style={{ padding: 18, marginTop: 22, background: C.cream }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Nota</div>
        <div style={{ fontSize: 13.5, color: "#3a4a42", lineHeight: 1.6 }}>
          Esto es una demostración del flujo: el botón solo simula el estado de suscripción. El cobro real (tarjeta, Yape) se haría con una pasarela como <b>Culqi</b> o <b>Mercado Pago</b> conectada a un servidor; el pago dispara la activación del plan. Los espacios "Anuncio" se reemplazarían por una red real (p. ej. Google AdSense) y se ocultan automáticamente al ser Pro.
        </div>
      </Card>
    </div>
  );
}

/* ---------------- GESTIÓN DE CANCHAS ---------------- */
function CourseEditor({ course, onCancel, onSave }) {
  const [name, setName] = useState(course?.name || "");
  const [loc, setLoc] = useState(course?.location || "");
  const [holes, setHoles] = useState(() => Array.from({ length: 18 }, (_, i) => ({
    par: course ? course.pars[i] : 4,
    si: course ? course.strokes[i] : i + 1,
    tie: course ? (course.tieOnlyHoles || []).includes(i + 1) : false,
  })));
  const [err, setErr] = useState("");
  const setH = (i, k, v) => setHoles(holes.map((h, j) => (j === i ? { ...h, [k]: v } : h)));
  const parTotal = holes.reduce((s, h) => s + (parseInt(h.par) || 0), 0);
  const siList = holes.map((h) => parseInt(h.si));
  const siValid = new Set(siList).size === 18 && Math.min(...siList) === 1 && Math.max(...siList) === 18;

  const save = () => {
    if (!name.trim()) { setErr("Pon un nombre."); return; }
    if (!siValid) { setErr("El stroke index debe usar cada número del 1 al 18 exactamente una vez."); return; }
    const pars = holes.map((h) => parseInt(h.par));
    if (pars.some((p) => !(p >= 3 && p <= 6))) { setErr("Los pares deben estar entre 3 y 6."); return; }
    onSave({
      id: course?.id || "course" + Date.now(),
      name: name.trim(), location: loc.trim(),
      pars, strokes: siList,
      tieOnlyHoles: holes.map((h, i) => (h.tie ? i + 1 : null)).filter((x) => x),
    });
  };

  const cell = { border: `1px solid ${C.line}`, padding: 0, textAlign: "center", minWidth: 34 };
  const numInput = { width: "100%", boxSizing: "border-box", border: "none", textAlign: "center", padding: "7px 0", fontFamily: "'Spline Sans'", fontSize: 14, outline: "none", background: "transparent" };

  return (
    <div>
      <Btn variant="ghost" onClick={onCancel} style={{ marginBottom: 14 }}>← Volver a canchas</Btn>
      <Card style={{ padding: 22 }}>
        <div style={{ fontFamily: "'Fraunces'", fontWeight: 600, fontSize: 22, color: C.green, marginBottom: 16 }}>{course ? "Editar cancha" : "Nueva cancha"}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Nombre"><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Golf Los Inkas" /></Field>
          <Field label="Ubicación"><input style={inputStyle} value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="Ej: Lima · Perú" /></Field>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "6px 0 10px" }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: C.green, textTransform: "uppercase", letterSpacing: .4 }}>Hoyos</div>
          <Chip tone={parTotal === 72 ? "green" : "neutral"}>Par total {parTotal}</Chip>
        </div>
        <div style={{ overflowX: "auto", border: `1px solid ${C.line}`, borderRadius: 12 }}>
          <table style={{ borderCollapse: "collapse", minWidth: 34 * 19 + 90 }}>
            <tbody>
              <tr>
                <td style={{ ...cell, background: C.greenDeep, color: C.lime, fontWeight: 700, fontSize: 12, textAlign: "left", padding: "6px 8px", minWidth: 90 }}>Hoyo</td>
                {holes.map((_, i) => <td key={i} style={{ ...cell, background: C.greenDeep, color: C.lime, fontWeight: 700, fontSize: 12 }}>{i + 1}</td>)}
              </tr>
              <tr>
                <td style={{ ...cell, fontWeight: 700, fontSize: 12.5, textAlign: "left", padding: "6px 8px", background: C.cream }}>Par</td>
                {holes.map((h, i) => <td key={i} style={cell}><input style={numInput} value={h.par} onChange={(e) => setH(i, "par", e.target.value.replace(/[^0-9]/g, "") === "" ? "" : parseInt(e.target.value.replace(/[^0-9]/g, "")))} /></td>)}
              </tr>
              <tr>
                <td style={{ ...cell, fontWeight: 700, fontSize: 12.5, textAlign: "left", padding: "6px 8px", background: C.cream }}>Stroke Index</td>
                {holes.map((h, i) => <td key={i} style={{ ...cell, background: siValid ? "#fff" : "rgba(180,69,47,.06)" }}><input style={numInput} value={h.si} onChange={(e) => setH(i, "si", e.target.value.replace(/[^0-9]/g, "") === "" ? "" : parseInt(e.target.value.replace(/[^0-9]/g, "")))} /></td>)}
              </tr>
              <tr>
                <td style={{ ...cell, fontWeight: 700, fontSize: 12.5, textAlign: "left", padding: "6px 8px", background: C.cream }}>Regla 8</td>
                {holes.map((h, i) => <td key={i} style={{ ...cell, background: h.tie ? "rgba(212,168,67,.18)" : "#fff" }}><input type="checkbox" checked={h.tie} onChange={(e) => setH(i, "tie", e.target.checked)} style={{ margin: "8px 0", cursor: "pointer" }} /></td>)}
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 12.5, color: "#7a8780", marginTop: 8 }}>Regla 8: marca los hoyos (normalmente par 3) donde el stroke solo sirve para empatar. Se aplica solo si la comunidad activa la Regla 8.</div>
        {err && <div style={{ color: C.red, fontSize: 13.5, fontWeight: 600, marginTop: 10 }}>{err}</div>}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
          <Btn variant="ghost" onClick={onCancel}>Cancelar</Btn>
          <Btn onClick={save}>Guardar cancha</Btn>
        </div>
      </Card>
    </div>
  );
}

function CoursesView({ courses, setCourses, rounds }) {
  const [editing, setEditing] = useState(null);
  if (editing) {
    return <CourseEditor course={editing === "new" ? null : editing} onCancel={() => setEditing(null)}
      onSave={(c) => { setCourses((prev) => (prev.some((x) => x.id === c.id) ? prev.map((x) => (x.id === c.id ? c : x)) : [...prev, c])); setEditing(null); }} />;
  }
  const usedCount = (id) => rounds.filter((r) => r.courseId === id).length;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontFamily: "'Fraunces'", fontWeight: 600, fontSize: 24, color: C.green }}>Canchas</div>
        <Btn variant="gold" onClick={() => setEditing("new")}>+ Nueva cancha</Btn>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {courses.map((c) => (
          <Card key={c.id} style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 17 }}>{c.name}</div>
                <div style={{ color: "#7a8780", fontSize: 13, marginTop: 2 }}>{c.location || "Sin ubicación"} · Par {c.pars.reduce((s, p) => s + p, 0)}{usedCount(c.id) ? ` · ${usedCount(c.id)} ronda(s)` : ""}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  {c.tieOnlyHoles && c.tieOnlyHoles.length > 0 && <Chip tone="gold">Regla 8: hoyos {c.tieOnlyHoles.join(", ")}</Chip>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn variant="ghost" onClick={() => setEditing(c)}>Editar</Btn>
                {usedCount(c.id) === 0 && <Btn variant="danger" onClick={() => { if (window.confirm(`¿Eliminar "${c.name}"?`)) setCourses((prev) => prev.filter((x) => x.id !== c.id)); }}>Eliminar</Btn>}
              </div>
            </div>
            <div style={{ overflowX: "auto", marginTop: 12 }}>
              <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: 30 * 19 + 80 }}>
                <tbody>
                  <tr><td style={{ padding: "3px 8px", color: "#7a8780", fontWeight: 700, textAlign: "left" }}>Hoyo</td>{c.pars.map((_, i) => <td key={i} style={{ padding: "3px 0", textAlign: "center", color: "#7a8780", fontWeight: 700, minWidth: 30 }}>{i + 1}</td>)}</tr>
                  <tr><td style={{ padding: "3px 8px", fontWeight: 600, textAlign: "left" }}>Par</td>{c.pars.map((p, i) => <td key={i} style={{ padding: "3px 0", textAlign: "center" }}>{p}</td>)}</tr>
                  <tr><td style={{ padding: "3px 8px", fontWeight: 600, textAlign: "left", color: "#7a8780" }}>SI</td>{c.strokes.map((s, i) => <td key={i} style={{ padding: "3px 0", textAlign: "center", color: "#7a8780" }}>{s}</td>)}</tr>
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ---------------- APP ---------------- */
export default function App() {
  useFonts();
  const isMobile = useMedia("(max-width: 680px)");
  const [ready, setReady] = useState(false);
  const [players, setPlayers] = useState([]);
  const [communities, setCommunities] = useState([]);
  const [courses, setCourses] = useState([]);
  const [rounds, setRounds] = useState([]);
  const [me, setMe] = useState(null);
  const [view, setView] = useState("home");
  const [openCommunity, setOpenCommunity] = useState(null);
  const [roundCommunity, setRoundCommunity] = useState(null);
  const [events, setEvents] = useState([]);
  const [quickRound, setQuickRound] = useState(false); // "Iniciar Ronda": true = ronda casual sin evento
  const [eventJump, setEventJump] = useState(null);    // id de evento a abrir directamente en la comunidad
  const [playEventId, setPlayEventId] = useState(null); // evento abierto en modo anotación (Iniciar Ronda)

  // Al cambiar de pantalla, volver al tope de la página
  useEffect(() => { window.scrollTo(0, 0); }, [view, openCommunity]);

  // Carga (o siembra) todas las colecciones y devuelve la lista de jugadores.
  // En modo nube solo debe llamarse con sesión iniciada (las políticas RLS
  // bloquean la lectura a usuarios anónimos y devolverían los defaults).
  const loadData = async () => {
    const seededPlayers = await store.get("gb_players_v2", null);
    // En modo nube no existe la cuenta demo: cada quien crea su cuenta real.
    const base = seededPlayers || (CLOUD ? [...KFB_PLAYERS] : [
      { id: "demo", name: "Demo", last: "Player", email: "demo@golf.com", birth: "1990-01-01", pass: "demo", plan: "free", communities: ["amarillo65", "kfb"] },
      ...KFB_PLAYERS,
    ]);
    setPlayers(base);
    setCommunities(await store.get("gb_comm_v2", CLOUD ? [KORN_FERRY_COMMUNITY] : [EXAMPLE_COMMUNITY, KORN_FERRY_COMMUNITY]));
    setCourses(await store.get("gb_courses_v2", [EXAMPLE_COURSE, LOS_INKAS_COURSE]));
    let defaultRounds = [];
    try {
      const ev = buildKFBExampleEvent();
      const rules = { rulePct: KORN_FERRY_COMMUNITY.rulePct, tokenValue: KORN_FERRY_COMMUNITY.tokenValue, bet: KORN_FERRY_COMMUNITY.bet, medal: KORN_FERRY_COMMUNITY.medal, regla8: KORN_FERRY_COMMUNITY.regla8, currency: KORN_FERRY_COMMUNITY.currency };
      defaultRounds = [{ ...ev, results: computeEvent(JSON.parse(JSON.stringify(ev)), LOS_INKAS_COURSE, rules) }];
    } catch (e) { defaultRounds = []; }
    setRounds(await store.get("gb_rounds_v2", defaultRounds));
    setEvents(await store.get("gb_events_v1", []));
    return base;
  };

  // arranque
  useEffect(() => {
    (async () => {
      if (CLOUD) {
        const { data } = await sb.auth.getSession();
        const u = data?.session?.user;
        if (u) {
          const base = await loadData();
          setMe(base.find((p) => p.id === u.id) || ensureCloudPlayer(u, base, setPlayers, setCommunities));
        }
        // Sin sesión no se cargan datos: se cargan recién al iniciar sesión.
      } else {
        const base = await loadData();
        const savedMeId = await localStore.get("gb_me_v1", null);
        if (savedMeId) { const u = base.find((p) => p.id === savedMeId); if (u) setMe(u); }
      }
      setReady(true);
    })();
  }, []);

  // Persistencia: en modo nube solo se escribe con sesión iniciada (me).
  const canWrite = ready && (!CLOUD || !!me);
  useEffect(() => { if (canWrite) store.set("gb_players_v2", players); }, [players, canWrite]);
  useEffect(() => { if (canWrite) store.set("gb_comm_v2", communities); }, [communities, canWrite]);
  useEffect(() => { if (canWrite) store.set("gb_courses_v2", courses); }, [courses, canWrite]);
  useEffect(() => { if (canWrite) store.set("gb_rounds_v2", rounds); }, [rounds, canWrite]);
  useEffect(() => { if (canWrite) store.set("gb_events_v1", events); }, [events, canWrite]);

  const exampleCommunity = communities.find((c) => c.id === "amarillo65") || EXAMPLE_COMMUNITY;
  const exampleCourse = courses.find((c) => c.id === "asia") || EXAMPLE_COURSE;

  const login = async (u) => {
    if (CLOUD && u.cloudUser) {
      // Primero se cargan los datos compartidos y recién entonces se crea
      // (si hace falta) el registro del jugador — nunca antes, para no
      // pisar los datos de la nube con los valores de ejemplo.
      setReady(false);
      const base = await loadData();
      setMe(base.find((p) => p.id === u.cloudUser.id) || ensureCloudPlayer(u.cloudUser, base, setPlayers, setCommunities));
      setReady(true);
      return;
    }
    setMe(u); localStore.set("gb_me_v1", u.id);
  };
  const logout = () => {
    if (CLOUD) sb.auth.signOut();
    setMe(null); setView("home"); localStore.set("gb_me_v1", null);
  };

  if (!ready) return <div style={{ minHeight: 400, display: "grid", placeItems: "center", color: C.green }}>Cargando…</div>;
  if (!me) return <div style={{ fontFamily: "'Spline Sans',sans-serif" }}><Auth onAuth={login} players={players} setPlayers={setPlayers} /></div>;

  const myCommunitiesList = communities.filter((c) => c.members.includes(me.id) || c.admin === me.id);
  const myCommunities = myCommunitiesList.length ? myCommunitiesList : communities;
  const myOwnedCommunities = communities.filter((c) => c.admin === me.id);
  const setPlan = (plan) => { const u = { ...me, plan }; setMe(u); setPlayers((prev) => prev.map((p) => (p.id === u.id ? u : p))); };
  const toggleCommunityPro = (c) => setCommunities((prev) => prev.map((x) => (x.id === c.id ? { ...x, pro: !x.pro } : x)));
  const myPro = userIsPro(me);

  // Eventos activos en mis comunidades (para avisos y para "Iniciar Ronda")
  const myOpenEvents = events.filter((e) => {
    const c = communities.find((x) => x.id === e.communityId);
    return c && (c.members.includes(me.id) || c.admin === me.id) && e.status !== "cerrado";
  });
  const needRegister = myOpenEvents.filter((e) => e.status === "inscripcion" && !(e.registered || []).includes(me.id));
  const inPlay = myOpenEvents.filter((e) => e.status !== "inscripcion" && (e.registered || []).includes(me.id));
  const goToEvent = (ev) => {
    const c = communities.find((x) => x.id === ev.communityId);
    if (!c) return;
    setEventJump(ev.id); setOpenCommunity(c); setView("communities");
  };
  const EVJUMP_STATUS = { inscripcion: ["Inscripción abierta", "gold"], grupos: ["Armando grupos", "gold"], jugando: ["En juego", "green"] };

  const NavBtn = ({ id, label }) => (
    <button onClick={() => { setView(id); setOpenCommunity(null); setQuickRound(false); setEventJump(null); setPlayEventId(null); }} style={{
      border: "none", cursor: "pointer", background: view === id ? "rgba(200,230,160,.16)" : "transparent",
      color: view === id ? C.lime : "rgba(246,241,227,.75)", fontWeight: 600, fontSize: 14.5, padding: "8px 14px", borderRadius: 10, fontFamily: "'Spline Sans',sans-serif" }}>{label}</button>
  );

  const NAV_ITEMS = [
    ["home", "Inicio", "🏠"],
    ["player", "Yo", "👤"],
    ["communities", "Comunidades", "👥"],
    ["courses", "Canchas", "⛳"],
    ["round", "Ronda", "🏌️"],
  ];

  return (
    <div style={{ fontFamily: "'Spline Sans',sans-serif", color: C.ink, background: C.cream, minHeight: "100%" }}>
      {/* TOP BAR */}
      <div style={{ background: C.greenDeep, padding: isMobile ? "10px 14px" : "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, position: "sticky", top: 0, zIndex: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
          <div style={{ fontFamily: "'Fraunces',serif", fontWeight: 900, fontSize: 24, color: C.cream, letterSpacing: -.5 }}>Golf<span style={{ color: C.gold }}>Buddy</span></div>
          {!isMobile && (
            <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
              <NavBtn id="home" label="Inicio" />
              <NavBtn id="player" label="Jugador (yo)" />
              <NavBtn id="communities" label="Comunidades" />
              <NavBtn id="courses" label="Canchas" />
              <NavBtn id="round" label="Iniciar Ronda" />
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button onClick={() => setView("subscription")} style={{ border: "none", cursor: "pointer", borderRadius: 999, padding: "6px 13px", fontWeight: 700, fontSize: 12.5,
            background: myPro ? C.gold : "rgba(212,168,67,.18)", color: myPro ? "#2c2003" : C.gold }}>★ {myPro ? "Pro" : "GolfBuddy Pro"}</button>
          {!isMobile && <span style={{ color: "rgba(246,241,227,.8)", fontSize: 13.5 }}>{me.name}</span>}
          <button onClick={logout} style={{ border: `1px solid rgba(246,241,227,.3)`, background: "transparent", color: C.cream, cursor: "pointer", borderRadius: 9, padding: "6px 12px", fontSize: 13 }}>Salir</button>
        </div>
      </div>

      {/* CONTENT */}
      <div style={{ maxWidth: 980, margin: "0 auto", padding: isMobile ? "18px 14px 110px" : "26px 18px 60px" }}>
        {view === "home" && (
          <div>
            {/* AVISOS: eventos con inscripción abierta o rondas en juego */}
            {(needRegister.length > 0 || inPlay.length > 0) && (
              <div style={{ display: "grid", gap: 10, marginBottom: 18 }}>
                {needRegister.map((e) => {
                  const c = communities.find((x) => x.id === e.communityId);
                  return (
                    <Card key={e.id} style={{ padding: 14, border: `1.5px solid ${C.gold}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, background: "rgba(212,168,67,.07)" }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>📣 Nuevo evento: {e.name}</div>
                        <div style={{ fontSize: 13, color: "#7a8780" }}>{c?.name} · {e.date} · inscripción abierta ({(e.registered || []).length} inscritos)</div>
                      </div>
                      <Btn variant="gold" onClick={() => goToEvent(e)}>Inscribirme →</Btn>
                    </Card>
                  );
                })}
                {inPlay.map((e) => {
                  const c = communities.find((x) => x.id === e.communityId);
                  const [lbl] = EVJUMP_STATUS[e.status] || ["—"];
                  return (
                    <Card key={e.id} style={{ padding: 14, border: `1.5px solid ${C.green}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>⛳ {e.name} <Chip tone="green">{lbl}</Chip></div>
                        <div style={{ fontSize: 13, color: "#7a8780" }}>{c?.name} · {e.date}</div>
                      </div>
                      <Btn onClick={() => { if (e.status === "jugando") { setPlayEventId(e.id); setView("round"); } else goToEvent(e); }}>{e.status === "jugando" ? "Anotar scores →" : "Continuar →"}</Btn>
                    </Card>
                  );
                })}
              </div>
            )}
            <div style={{ background: `linear-gradient(135deg, ${C.green}, ${C.greenDeep})`, borderRadius: 22, padding: "34px 30px", color: C.cream, position: "relative", overflow: "hidden", marginBottom: 24 }}>
              <div style={{ position: "absolute", right: -40, top: -40, width: 220, height: 220, borderRadius: 999, border: `2px solid rgba(200,230,160,.18)` }} />
              <div style={{ position: "absolute", right: 10, bottom: -60, width: 180, height: 180, borderRadius: 999, border: `2px solid rgba(212,168,67,.22)` }} />
              <div style={{ fontFamily: "'Fraunces'", fontWeight: 900, fontSize: 34, lineHeight: 1.05, maxWidth: 560 }}>Bienvenido, {me.name}.</div>
              <div style={{ color: C.lime, marginTop: 10, maxWidth: 540, fontSize: 15.5 }}>Calcula resultados del modo <b>Machetero</b>: concursos por equipo y por evento, tokens, Carry Over y Bye — todo automático.</div>
              <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
                <Btn variant="gold" onClick={() => setView("round")}>Iniciar una ronda</Btn>
                <Btn variant="ghost" style={{ color: C.cream, borderColor: "rgba(246,241,227,.45)" }} onClick={() => {
                  const ev = buildExampleEvent();
                  const rules = { rulePct: exampleCommunity.rulePct, tokenValue: exampleCommunity.tokenValue, bet: exampleCommunity.bet, medal: exampleCommunity.medal, regla8: exampleCommunity.regla8, currency: exampleCommunity.currency };
                  const results = computeEvent(JSON.parse(JSON.stringify(ev)), exampleCourse, rules);
                  setRounds((r) => [{ ...ev, results }, ...r]);
                  setView("player");
                }}>Cargar ejemplo del documento</Btn>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
              {[["Jugador (yo)", "Tu perfil, comunidades y estadísticas de rondas.", "player"],
                ["Comunidades", "Crea o únete a comunidades con sus reglas Machetero.", "communities"],
                ["Canchas", "Gestiona campos: pares, stroke index y Regla 8.", "courses"],
                ["Iniciar Ronda", "Arma equipos, ingresa scores y obtén resultados.", "round"]].map(([t, d, v]) => (
                <Card key={v} style={{ padding: 18, cursor: "pointer" }} >
                  <div onClick={() => setView(v)}>
                    <div style={{ fontFamily: "'Fraunces'", fontWeight: 600, fontSize: 19, color: C.green }}>{t}</div>
                    <div style={{ color: "#7a8780", fontSize: 13.5, marginTop: 6 }}>{d}</div>
                  </div>
                </Card>
              ))}
            </div>
            {!myPro && <AdSlot />}
          </div>
        )}

        {view === "subscription" && <SubscriptionView me={me} onSetPlan={setPlan} myOwnedCommunities={myOwnedCommunities} onToggleCommunityPro={toggleCommunityPro} />}

        {view === "player" && <PlayerView me={me} rounds={rounds} communities={communities} players={players} courses={courses} />}

        {view === "courses" && <CoursesView courses={courses} setCourses={setCourses} rounds={rounds} />}

        {view === "communities" && !openCommunity && (
          <Communities communities={communities} me={me} onOpen={setOpenCommunity}
            onCreate={(c, isJoin) => setCommunities((prev) => isJoin ? prev.map((x) => (x.id === c.id ? c : x)) : [...prev, c])} />
        )}
        {view === "communities" && openCommunity && (
          <CommunityDetail
            community={communities.find((c) => c.id === openCommunity.id) || openCommunity}
            rounds={rounds}
            players={players}
            communities={communities}
            me={me}
            events={events}
            setEvents={setEvents}
            courses={courses}
            initialEventId={eventJump}
            onUpdateCommunity={(uc) => { setCommunities((prev) => prev.map((x) => (x.id === uc.id ? uc : x))); setOpenCommunity(uc); }}
            onSaveRound={(round) => setRounds((r) => [round, ...r])}
            onBack={() => { setOpenCommunity(null); setEventJump(null); }}
            onStartRound={() => { setRoundCommunity(openCommunity.id); setOpenCommunity(null); setView("round"); }}
          />
        )}

        {view === "round" && playEventId && (() => {
          const ev = events.find((x) => x.id === playEventId);
          const comm = ev && communities.find((c) => c.id === ev.communityId);
          if (!ev || !comm) return null;
          return (
            <EventManager mode="play" event={ev} community={comm} courses={courses} players={players} me={me}
              setEvents={setEvents} onSaveRound={(round) => setRounds((r) => [round, ...r])} onClose={() => setPlayEventId(null)} />
          );
        })()}
        {view === "round" && !playEventId && !roundCommunity && !quickRound && myOpenEvents.length > 0 && (
          <div>
            <div style={{ fontFamily: "'Fraunces'", fontWeight: 600, fontSize: 24, color: C.green, marginBottom: 6 }}>Iniciar Ronda</div>
            <div style={{ fontSize: 13.5, color: "#7a8780", marginBottom: 14 }}>Tienes eventos activos en tus comunidades. Continúa ahí, o crea una ronda casual aparte.</div>
            <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
              {myOpenEvents.map((e) => {
                const c = communities.find((x) => x.id === e.communityId);
                const [lbl, tone] = EVJUMP_STATUS[e.status] || ["—", "neutral"];
                const registered = (e.registered || []).includes(me.id);
                return (
                  <Card key={e.id} style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{e.name} <Chip tone={tone}>{lbl}</Chip></div>
                      <div style={{ fontSize: 13, color: "#7a8780", marginTop: 2 }}>{c?.name} · {e.date}{e.status === "inscripcion" ? ` · ${(e.registered || []).length} inscritos` : ""}</div>
                    </div>
                    <Btn variant={e.status === "inscripcion" && !registered ? "gold" : "primary"}
                      onClick={() => { if (e.status === "jugando") setPlayEventId(e.id); else goToEvent(e); }}>
                      {e.status === "inscripcion" && !registered ? "Inscribirme →" : e.status === "jugando" ? "Anotar scores →" : "Continuar →"}
                    </Btn>
                  </Card>
                );
              })}
            </div>
            <Card style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, background: C.cream }}>
              <div>
                <div style={{ fontWeight: 700 }}>Ronda casual (sin evento)</div>
                <div style={{ fontSize: 13, color: "#7a8780" }}>Para un juego suelto: armas los equipos y anotas los scores igual que en un evento.</div>
              </div>
              <Btn variant="ghost" onClick={() => setQuickRound(true)}>Crear ronda rápida</Btn>
            </Card>
          </div>
        )}
        {view === "round" && !playEventId && (roundCommunity || quickRound || myOpenEvents.length === 0) && (
          <StartRound
            courses={courses}
            communities={myCommunities}
            players={players}
            me={me}
            initialEvent={roundCommunity ? { communityId: roundCommunity } : null}
            onCancel={() => { setRoundCommunity(null); setQuickRound(false); setView("home"); }}
            onSave={(ev) => { setRounds((r) => [ev, ...r]); setRoundCommunity(null); setQuickRound(false); setView("player"); }}
          />
        )}
      </div>

      {!isMobile && (
        <div style={{ textAlign: "center", padding: "18px", color: "#9aa69e", fontSize: 12.5 }}>
          GolfBuddy · Modo Machetero · Motor de cálculo verificado contra el ejemplo del documento
        </div>
      )}

      {/* NAVEGACIÓN INFERIOR (solo móvil) */}
      {isMobile && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 30, background: C.greenDeep,
          display: "grid", gridTemplateColumns: `repeat(${NAV_ITEMS.length}, 1fr)`,
          paddingBottom: "env(safe-area-inset-bottom)", boxShadow: "0 -4px 16px rgba(0,0,0,.25)" }}>
          {NAV_ITEMS.map(([id, label, icon]) => {
            const active = view === id;
            return (
              <button key={id} onClick={() => { setView(id); setOpenCommunity(null); setQuickRound(false); setEventJump(null); setPlayEventId(null); }} style={{
                border: "none", cursor: "pointer", background: active ? "rgba(200,230,160,.14)" : "transparent",
                color: active ? C.lime : "rgba(246,241,227,.7)", padding: "9px 2px 8px",
                display: "grid", justifyItems: "center", gap: 2, fontFamily: "'Spline Sans',sans-serif" }}>
                <span style={{ fontSize: 19, lineHeight: 1 }}>{icon}</span>
                <span style={{ fontSize: 10.5, fontWeight: 700 }}>{label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
