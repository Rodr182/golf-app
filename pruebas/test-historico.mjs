// La plata de antes de la app vive en una fila PRIVADA por comunidad, y nunca
// vuelve a los datos compartidos de las comunidades (que lee cualquiera).
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../frontend/src/App.jsx", import.meta.url), "utf8");
const code = src.slice(src.indexOf("/* ---- EL HISTÓRICO, EN SU FILA PRIVADA"), src.indexOf("/* ---- GUARDIÁN DE VERSIÓN"));
const { sinHistorico, conHistorico, leerHistoricos, RAIZ_HISTORICO } =
  new Function(`${code}; return { sinHistorico, conHistorico, leerHistoricos, RAIZ_HISTORICO };`)();

let fallos = 0;
const check = (n, ok, d = "") => { if (!ok) fallos++; console.log(`${ok ? "✓" : "✗ FALLA"}  ${n}${d ? " — " + d : ""}`); };

const H26 = { "2026": { fechas: 3, jugadores: { yo: { money: 30, fechas: 3 } } } };
const KFB = { id: "kfb", name: "KFB", members: ["yo", "ana"], applicants: ["luis"], _rev: 7, historico: H26 };
const OTRA = { id: "otra", name: "Otra", members: ["pepe"] };

console.log("=== 1. AL GUARDAR, LAS COMUNIDADES SALEN SIN LA PLATA ===");
{
  const guardado = sinHistorico([KFB, OTRA]);
  check("la comunidad pierde el histórico", !("historico" in guardado[0]));
  check("y conserva todo lo demás: miembros, postulaciones, _rev",
    JSON.stringify(guardado[0]) === JSON.stringify({ id: "kfb", name: "KFB", members: ["yo", "ana"], applicants: ["luis"], _rev: 7 }));
  check("una comunidad sin histórico queda idéntica (el mismo objeto)", guardado[1] === OTRA);
  check("no toca la lista original", "historico" in KFB);
  check("en el texto que se sube no queda ni rastro de la plata", !/money/.test(JSON.stringify(guardado)));
}

console.log("\n=== 2. AL LEER, SE VUELVE A PEGAR ===");
{
  const filas = { [`${RAIZ_HISTORICO}:kfb`]: [{ communityId: "kfb", historico: H26 }] };
  const hist = leerHistoricos(filas);
  check("lee la fila privada", hist.kfb && hist.kfb["2026"].jugadores.yo.money === 30);
  const vista = conHistorico(sinHistorico([KFB, OTRA]), hist);
  check("y la comunidad en memoria vuelve a tener su histórico", vista[0].historico === H26);
  check("la que no tiene, sigue sin tener", !("historico" in vista[1]));
}

console.log("\n=== 3. LA FILA PRIVADA MANDA ===");
{
  // Mientras dure el traslado, el histórico puede estar en los dos lugares.
  const viejo = { "2026": { fechas: 2, jugadores: { yo: { money: 10, fechas: 2 } } } };
  const vista = conHistorico([{ ...KFB, historico: viejo }], { kfb: H26 });
  check("si están los dos, vale el de la fila privada", vista[0].historico === H26);
  const sinFila = conHistorico([{ ...KFB, historico: viejo }], {});
  check("si no hay fila privada (todavía), vale lo que venga en la comunidad", sinFila[0].historico === viejo);
}

console.log("\n=== 4. FILAS RARAS NO ROMPEN NADA ===");
{
  const hist = leerHistoricos({ a: "no es una lista", b: [null, { communityId: "x" }, { historico: {} }], c: [{ communityId: "ok", historico: H26 }] });
  check("solo toma lo que tiene comunidad e histórico", Object.keys(hist).join(",") === "ok", Object.keys(hist).join(","));
  check("sin filas, nada", Object.keys(leerHistoricos(undefined)).length === 0);
  check("sin comunidades, nada", sinHistorico(undefined).length === 0 && conHistorico(undefined, {}).length === 0);
}

console.log("\n=== 5. LA APP USA ESTO DONDE TIENE QUE USARLO ===");
check("las comunidades se guardan SIEMPRE sin histórico", /persist\("gb_comm_v2", sinHistorico\(communitiesRaw\)\)/.test(src));
check("la foto de lo cargado también, para no reescribir de más", /gb_comm_v2: JSON\.stringify\(sinHistorico\(comm\)\)/.test(src));
check("el histórico se lee de las filas privadas", /leerHistoricos\(await store\.getPrefijo\(RAIZ_HISTORICO\)\)/.test(src));
check("y la app trabaja con las dos cosas juntas", /const communities = useMemo\(\(\) => conHistorico\(communitiesRaw, historicos\)/.test(src));
check("no quedó ningún guardado de las comunidades con el histórico pegado", !/persist\("gb_comm_v2", communities\)/.test(src));

console.log(fallos === 0 ? "\nRESULTADO: todo correcto" : `\nRESULTADO: ${fallos} fallo(s)`);
process.exit(fallos ? 1 : 0);
