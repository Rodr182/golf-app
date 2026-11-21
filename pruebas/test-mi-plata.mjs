// "Mi plata" del perfil: por comunidad y por temporada, sin mezclar.
// Tiene que dar EXACTAMENTE lo mismo que el money list de la comunidad.
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../frontend/src/App.jsx", import.meta.url), "utf8");
const trozo = (desde, hasta) => src.slice(src.indexOf(desde), src.indexOf(hasta));
const code = [
  src.split("\n").find((l) => l.startsWith("const masRecientePrimero")),
  trozo("/* ---- TEMPORADAS ----", "/* ---- TARJETAS DE LAS FECHAS"),
  trozo("/* Money list de una comunidad", "/* Money list del jugador"),
  trozo("/* Mi plata en UNA", "/* Historial del Medal"),
].join("\n");
const { miPlataEn, communityMoneyList } = new Function(`${code}; return { miPlataEn, communityMoneyList };`)();

let fallos = 0;
const check = (n, ok, d = "") => { if (!ok) fallos++; console.log(`${ok ? "✓" : "✗ FALLA"}  ${n}${d ? " — " + d : ""}`); };

// Una fecha con plata. rows: [id, plata] — "inv" es un invitado.
const fecha = (id, cid, date, rows, extra = {}) => ({
  id, communityId: cid, date, eventName: "F " + id, teams: [],
  results: { simple: false, rows: rows.map(([pid, m]) => ({ id: pid, name: pid, totalMoney: m, guest: pid === "inv" })) },
  ...extra,
});
const ROUNDS = [
  fecha("k1", "kfb", "2026-03-07", [["yo", 40], ["ana", -10], ["luis", -30]]),
  fecha("k2", "kfb", "2026-05-02", [["yo", -15], ["ana", 25], ["luis", -10]]),
  fecha("k3", "kfb", "2025-11-08", [["yo", 100], ["ana", -100]]),            // otra temporada
  fecha("o1", "otra", "2026-04-04", [["yo", -60], ["pepe", 60]]),            // otra comunidad
  fecha("l1", "libre", "2026-06-01", [["yo", 12], ["inv", -12]]),            // casual, con invitado
  fecha("s1", "kfb", "2026-06-06", [["yo", 0]], { results: { simple: true, rows: [{ id: "yo", name: "yo", grossTotal: 88, netTotal: 76, totalMoney: 0 }] } }),
  fecha("h1", "kfb", "2026-01-10", [["yo", 0]], { soloTarjeta: true }),     // tarjeta previa: nunca es plata
  fecha("k4", "kfb", "2026-07-04", [["ana", 50], ["luis", -50]]),            // fecha en la que NO jugué
];
// Lo jugado en 2026 ANTES de usar la app, como lo guarda la comunidad
const COMMS = [
  { id: "kfb", name: "KFB", historico: { "2026": { fechas: 3, jugadores: { yo: { money: 30, fechas: 3 }, ana: { money: -5, fechas: 2 } } } } },
  { id: "otra", name: "Otra" },
];

console.log("=== 1. UNA COMUNIDAD, UNA TEMPORADA ===");
const k26 = miPlataEn("yo", ROUNDS, COMMS, "kfb", "2026");
check("balance de KFB 2026 = 40 − 15 en la app + 30 de antes", k26.total === 55, String(k26.total));
check("fechas: 2 en la app + 3 de antes", k26.fechas === 5, String(k26.fechas));
check("lo de antes de la app, aparte", k26.hist === 30 && k26.histFechas === 3, `${k26.hist} en ${k26.histFechas}`);
check("mejor y peor fecha solo miran la app (de antes no hay detalle)", k26.mejor === 40 && k26.peor === -15, `${k26.mejor} / ${k26.peor}`);

console.log("\n=== 2. NADA SE MEZCLA ===");
check("2025 no entra en 2026", miPlataEn("yo", ROUNDS, COMMS, "kfb", "2025").total === 100);
check("la otra comunidad tampoco", miPlataEn("yo", ROUNDS, COMMS, "otra", "2026").total === -60);
check("y la de KFB no se contamina con la otra", k26.total === 55);
check("una tarjeta previa a la app nunca suma plata", !k26.rondas.some((r) => r.id === "h1"));

console.log("\n=== 3. EL MISMO NÚMERO QUE EL MONEY LIST DE LA COMUNIDAD ===");
{
  const ml = communityMoneyList("kfb", ROUNDS, "2026", COMMS[0]);
  const yo = ml.find((x) => x.id === "yo");
  check("balance idéntico", yo.total === k26.total, `${yo.total} vs ${k26.total}`);
  check("fechas idénticas", yo.rounds === k26.fechas, `${yo.rounds} vs ${k26.fechas}`);
}

console.log("\n=== 4. EL PUESTO EN EL MONEY LIST ===");
// KFB 2026: yo 55 · ana -10+25+50-5 = 60 · luis -30-10-50 = -90
check("ana va primera, yo segundo", k26.puesto === 2, String(k26.puesto));
check("de 3 jugadores", k26.de === 3, String(k26.de));
{
  const l = miPlataEn("yo", ROUNDS, COMMS, "libre", "2026");
  check("en las rondas libres no hay puesto (cada una es de otro grupo)", l.puesto === null && l.de === null);
  check("y el invitado no cuenta, pero mi plata sí", l.total === 12, String(l.total));
}

console.log("\n=== 5. MIS FECHAS ===");
check("solo las que jugué, de esa comunidad y temporada", k26.rondas.map((r) => r.id).join(",") === "s1,k2,k1",
  k26.rondas.map((r) => r.id).join(","));
check("incluye la ronda simple (no tiene plata, pero tiene tarjeta)", k26.rondas.some((r) => r.id === "s1"));
check("y no la fecha en la que no jugué", !k26.rondas.some((r) => r.id === "k4"));
check("de la más reciente a la más antigua", k26.rondas[0].date >= k26.rondas[k26.rondas.length - 1].date);

console.log("\n=== 6. SIN DATOS NO REVIENTA ===");
{
  const v = miPlataEn("nadie", ROUNDS, COMMS, "kfb", "2026");
  check("alguien que no jugó: todo en cero, sin puesto", v.total === 0 && v.fechas === 0 && v.puesto === null && v.rondas.length === 0);
  const w = miPlataEn("yo", [], [], "kfb", "2030");
  check("sin rondas ni comunidades", w.total === 0 && w.mejor === null && w.peor === null);
}

console.log("\n=== 7. EL PERFIL YA NO SUMA PLATA ENTRE COMUNIDADES ===");
{
  const perfil = src.slice(src.indexOf("function PlayerView("), src.indexOf("/* Selector del hoyo de salida"));
  // Se busca en lo que se dibuja, no en los comentarios (que sí lo mencionan).
  check("no queda ningún \"Balance total\" en pantalla", !/>Balance total<|titulo="Balance total"/.test(perfil));
  check("ni la suma de todas las comunidades", !/grandTotal/.test(perfil));
  check("la plata sale de miPlataEn", /miPlataEn\(me\.id, rounds, communities, comElegida, tempElegida\)/.test(perfil));
  check("y el Medal, de las fechas de esa comunidad y temporada", /playerMedalHistory\(me\.id, plata\.rondas\)/.test(perfil));
}

console.log(fallos === 0 ? "\nRESULTADO: todo correcto" : `\nRESULTADO: ${fallos} fallo(s)`);
process.exit(fallos ? 1 : 0);
