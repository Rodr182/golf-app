// La auditoría de una fecha: cuadre de la plata, tarjetas rehechas y avisos.
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../frontend/src/App.jsx", import.meta.url), "utf8");
const motor = src.slice(src.indexOf("const rnd = (x) =>"), src.indexOf("function computeSimpleRound"));
const orden = src.slice(src.indexOf("function playerHcpHistory"), src.indexOf("// Persistencia local del navegador"));
const audit = src.slice(src.indexOf("function auditarFecha"), src.indexOf("function playerScoreStats"));
const { auditarFecha } = new Function(`${motor};${orden};${audit}; return { auditarFecha };`)();

let fallos = 0;
const check = (n, ok, d = "") => { if (!ok) fallos++; console.log(`${ok ? "✓" : "✗ FALLA"}  ${n}${d ? " — " + d : ""}`); };

const cancha = { id: "losinkas", name: "Los Inkas", pars: [4,4,3,5,4,4,3,4,5,4,3,5,4,4,3,4,5,4],
  strokes: [5,1,15,11,3,7,17,9,13,6,16,10,2,8,18,4,12,14] };
const tarjeta = (total) => { const a = new Array(18).fill(4); a[0] = 4 + (total - 72); return a; };
const fecha = (jugadores, opts = {}) => ({
  id: "ev", date: "2026-08-08", communityId: "k", courseId: "losinkas", eventName: "Sábado",
  teams: (opts.grupos || [jugadores]).map((g, i) => ({ id: i + 1, start: 1, players: g })),
  results: {
    eventStart: 1, tokenValue: 5, breakdown: [],
    rules: { rulePct: 75, regla8: false, regla8Holes: [], multiStroke: false, ...(opts.rules || {}) },
    rows: (opts.rows || jugadores.map((p) => ({ id: p.id, name: p.name, totalMoney: 0, totalTok: 0 }))),
  },
});
const jug = (id, hcp, gross) => ({ id, name: id, hcp, gross: gross || tarjeta(80) });

console.log("=== 1. EL CUADRE DE LA PLATA ===");
{
  const js = [jug("ana", 12), jug("luis", 4), jug("pepe", 8)];
  const ok = auditarFecha(fecha(js, { rows: [
    { id: "ana", name: "ana", totalMoney: -100, totalTok: -20 },
    { id: "luis", name: "luis", totalMoney: 60, totalTok: 12 },
    { id: "pepe", name: "pepe", totalMoney: 40, totalTok: 8 },
  ] }), cancha);
  check("suma cero: cuadra", ok.cuadre.ok, `plata ${ok.cuadre.money} · tokens ${ok.cuadre.tok}`);
  check("y no avisa nada de plata", !ok.avisos.some((v) => /no cuadra/.test(v.txt)));

  const mal = auditarFecha(fecha(js, { rows: [
    { id: "ana", name: "ana", totalMoney: -100, totalTok: -20 },
    { id: "luis", name: "luis", totalMoney: 60, totalTok: 12 },
    { id: "pepe", name: "pepe", totalMoney: 25, totalTok: 5 },
  ] }), cancha);
  check("si falta plata, no cuadra", !mal.cuadre.ok, `suma ${mal.cuadre.money}`);
  check("y lo dice como error", mal.avisos.some((v) => v.tono === "error" && /no cuadra/.test(v.txt)),
    (mal.avisos.find((v) => /no cuadra/.test(v.txt)) || {}).txt);
}

console.log("\n=== 2. LOS NETOS Y LOS STROKES ===");
{
  // Base de la fecha: el ajustado más bajo. 4 × 0.75 = 3; 12 × 0.75 = 9.
  const js = [jug("ana", 12), jug("luis", 4), jug("pepe", 8)];
  const a = auditarFecha(fecha(js), cancha);
  check("la base es el ajustado más bajo", a.base === 3, `base ${a.base}`);
  const ana = a.tarjetas.find((t) => t.id === "ana");
  check("el ajustado sale del % de la fecha", ana.adj === 9, `aj ${ana.adj}`);
  check("y los strokes son el ajustado menos la base", ana.ph === 6, `${ana.ph} strokes`);
  check("recibe stroke en los 6 hoyos de menor índice", ana.strokes.filter((s) => s > 0).length === 6,
    `${ana.strokes.filter((s) => s > 0).length} hoyos`);
  check("el neto es el gross menos los strokes", ana.netTotal === ana.grossTotal - 6, `${ana.grossTotal} → ${ana.netTotal}`);
  const luis = a.tarjetas.find((t) => t.id === "luis");
  check("el de la base juega sin strokes", luis.ph === 0 && luis.netTotal === luis.grossTotal, `${luis.ph} str`);
  check("Out + In = total", ana.grossOut + ana.grossIn === ana.grossTotal && ana.netOut + ana.netIn === ana.netTotal,
    `${ana.grossOut}+${ana.grossIn}=${ana.grossTotal}`);
}

console.log("\n=== 3. HÁNDICAP POSITIVO (+2, cargado como −2) ===");
{
  const js = [jug("pro", -2), jug("ana", 12), jug("luis", 4)];
  const a = auditarFecha(fecha(js), cancha);
  const pro = a.tarjetas.find((t) => t.id === "pro");
  check("el positivo se divide entre el %", pro.adj === -3, `aj ${pro.adj}`);
  check("y baja la base de toda la fecha", a.base === -3, `base ${a.base}`);
  check("él juega sin strokes", pro.ph === 0);
  const ana = a.tarjetas.find((t) => t.id === "ana");
  check("y el resto recibe más", ana.ph === 12, `${ana.ph} strokes`);
}

console.log("\n=== 4. LO QUE HAY QUE MIRAR ===");
{
  const incompleta = [...tarjeta(80).slice(0, 17), ""];
  const js = [jug("ana", 12, incompleta), jug("luis", 4), jug("pepe", 8)];
  const a = auditarFecha(fecha(js), cancha);
  check("avisa la tarjeta incompleta", a.avisos.some((v) => v.tono === "error" && /18 hoyos/.test(v.txt)),
    (a.avisos.find((v) => /18 hoyos/.test(v.txt)) || {}).txt);
}
{
  const rara = tarjeta(80).slice(); rara[3] = 14;
  const js = [jug("ana", 12, rara), jug("luis", 4), jug("pepe", 8)];
  const a = auditarFecha(fecha(js), cancha);
  check("marca un golpe poco creíble", a.avisos.some((v) => v.tono === "revisar" && /hoyo 4/.test(v.txt)),
    (a.avisos.find((v) => /creíbles/.test(v.txt)) || {}).txt);
}
{
  const js = [jug("ana", 12), jug("luis", 4)];
  const a = auditarFecha(fecha(js), cancha);
  check("avisa un grupo de menos de 3", a.avisos.some((v) => v.tono === "error" && /de 3 a 5/.test(v.txt)));
}
{
  const js = [jug("ana", 12), jug("luis", 4), jug("pepe", 8)];
  const a = auditarFecha(fecha(js), cancha);
  check("un grupo de 3 se explica por la regla 10", a.avisos.some((v) => v.tono === "info" && /regla 10/.test(v.txt)));
}
{
  // Ana jugó con 12 pero la fecha anterior con 4: es para revisar.
  const js = [jug("ana", 12), jug("luis", 4), jug("pepe", 8)];
  const previa = { ...fecha([jug("ana", 4), jug("luis", 4), jug("pepe", 8)]), date: "2026-08-01" };
  const a = auditarFecha(fecha(js), cancha, [previa]);
  check("marca el salto de hándicap contra la fecha anterior", a.avisos.some((v) => v.tono === "revisar" && /fecha anterior/.test(v.txt)),
    (a.avisos.find((v) => /fecha anterior/.test(v.txt)) || {}).txt);
  const b = auditarFecha({ ...fecha(js), date: "2026-07-01" }, cancha, [previa]);
  check("no mira fechas posteriores", !b.avisos.some((v) => /fecha anterior/.test(v.txt)));
}
{
  const js = [jug("ana", 12), jug("luis", 4), jug("pepe", 8)];
  const rows = js.map((p) => ({ id: p.id, name: p.id, totalMoney: 0, totalTok: 0 }));
  rows[0].guest = true;
  const a = auditarFecha(fecha(js, { rows }), cancha);
  check("avisa quiénes son invitados", a.avisos.some((v) => v.tono === "info" && /invitado/.test(v.txt)),
    (a.avisos.find((v) => /invitado/.test(v.txt)) || {}).txt);
}
{
  const js = [jug("ana", 12), jug("luis", 4), jug("pepe", 8)];
  const a = auditarFecha(fecha(js), null);
  check("sin la cancha lo dice en vez de romperse", a.avisos.some((v) => v.tono === "error" && /cancha/.test(v.txt)));
}

console.log("\n=== 5. NO INVENTA NADA ===");
{
  const js = [jug("ana", 12), jug("luis", 4), jug("pepe", 8)];
  const rows = [
    { id: "ana", name: "ana", totalMoney: -100, totalTok: -20 },
    { id: "luis", name: "luis", totalMoney: 60, totalTok: 12 },
    { id: "pepe", name: "pepe", totalMoney: 40, totalTok: 8 },
  ];
  const a = auditarFecha(fecha(js, { rows }), cancha);
  check("la plata de cada uno sale de lo guardado, no se recalcula",
    a.tarjetas.find((t) => t.id === "ana").money === -100 && a.tarjetas.find((t) => t.id === "luis").money === 60);
  check("y usa el % guardado en la fecha, no el de hoy", a.pct === 75, `${a.pct}%`);
}

console.log(fallos === 0 ? "\nRESULTADO: todo correcto" : `\nRESULTADO: ${fallos} fallo(s)`);
process.exit(fallos ? 1 : 0);
