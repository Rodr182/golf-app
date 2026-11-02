// Cada comunidad guarda sus fechas y sus eventos en su propia fila de la base.
// Esto comprueba que repartir y volver a juntar no pierde ni duplica nada, y
// que dos celulares con los mismos datos escriben exactamente el mismo texto.
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../frontend/src/App.jsx", import.meta.url), "utf8");
const code = src.slice(src.indexOf("function mergeEventPair"), src.indexOf("/* ---- GUARDIÁN DE VERSIÓN"));
const { repartirEnFilas, claveDe, CLAVE_LIBRE_VIEJA, mergerDe, SEPARADAS, RAIZ_RONDAS, RAIZ_EVENTOS, mergeByIdRev, mergeEvents, marcarBorrado, vivos } =
  new Function(`${code}; return { repartirEnFilas, claveDe, CLAVE_LIBRE_VIEJA, mergerDe, SEPARADAS, RAIZ_RONDAS, RAIZ_EVENTOS, mergeByIdRev, mergeEvents, marcarBorrado, vivos };`)();

let fallos = 0;
const check = (n, ok, d = "") => { if (!ok) fallos++; console.log(`${ok ? "✓" : "✗ FALLA"}  ${n}${d ? " — " + d : ""}`); };

// Tres comunidades y dos rondas casuales, como en la app de verdad.
const ronda = (id, cid) => ({ id, communityId: cid, date: "2026-10-2" + id, _rev: 1, results: { rows: [] } });
const LISTA = [
  ronda("1", "cKorn"), ronda("2", "cKorn"), ronda("3", "cOtra"),
  ronda("4", "libre"), ronda("5", "cTercera"), ronda("6", "libre"),
];

console.log("=== 1. CADA COMUNIDAD EN SU FILA, Y CADA CASUAL EN LA SUYA ===");
{
  const filas = repartirEnFilas(RAIZ_RONDAS, LISTA);
  check("una fila por comunidad, y una por cada ronda casual",
    Object.keys(filas).sort().join(" ") === "gb_rounds_v2:cKorn gb_rounds_v2:cOtra gb_rounds_v2:cTercera gb_rounds_v2:libre:4 gb_rounds_v2:libre:6",
    Object.keys(filas).sort().join(" "));
  check("la fila de Korn lleva sus dos fechas y nada más",
    filas["gb_rounds_v2:cKorn"].map((r) => r.id).join(",") === "1,2");
  // Las casuales van una por fila justamente para que el servidor pueda
  // decidir ronda por ronda: si no jugaste, no te llega.
  check("cada casual va sola en su fila",
    filas["gb_rounds_v2:libre:4"].length === 1 && filas["gb_rounds_v2:libre:6"].length === 1);
  check("y no quedan mezcladas entre ellas",
    filas["gb_rounds_v2:libre:4"][0].id === "4" && filas["gb_rounds_v2:libre:6"][0].id === "6");
  check("nombre de la fila de una casual", claveDe(RAIZ_RONDAS, { id: "ev9" }) === "gb_rounds_v2:libre:ev9");
  check("y de una de comunidad", claveDe(RAIZ_EVENTOS, { id: "ev9", communityId: "cKorn" }) === "gb_events_v1:cKorn");
  check("la fila vieja donde iban todas juntas tiene nombre aparte",
    CLAVE_LIBRE_VIEJA(RAIZ_RONDAS) === "gb_rounds_v2:libre");
}

console.log("\n=== 2. DOS CELULARES ESCRIBEN EL MISMO TEXTO ===");
{
  // El orden en memoria depende de quién guardó último. Si el texto de la fila
  // dependiera de ese orden, los celulares se estarían reescribiendo sin parar.
  const alReves = [...LISTA].reverse();
  const a = repartirEnFilas(RAIZ_RONDAS, LISTA);
  const b = repartirEnFilas(RAIZ_RONDAS, alReves);
  const iguales = Object.keys(a).every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]));
  check("con las mismas fechas en otro orden, el texto es idéntico", iguales);
}

console.log("\n=== 3. JUNTAR LAS FILAS DEVUELVE LA LISTA COMPLETA ===");
{
  const filas = repartirEnFilas(RAIZ_RONDAS, LISTA);
  // Así lee la app: parte de vacío y va fusionando fila por fila.
  let lista = [];
  Object.keys(filas).sort().forEach((k) => { lista = mergeByIdRev(lista, filas[k]); });
  check("están las seis fechas", lista.length === 6, String(lista.length));
  check("ninguna repetida", new Set(lista.map((r) => r.id)).size === 6);
  check("cada una con su comunidad intacta",
    LISTA.every((r) => lista.find((x) => x.id === r.id).communityId === r.communityId));
}

console.log("\n=== 4. SOLO LAS FILAS QUE EL SERVIDOR DEJE LEER ===");
{
  // Es lo que hace el servidor hoy: entrega la comunidad a la que pertenezco y
  // la ronda casual que jugué. De la otra comunidad y de la casual ajena, nada.
  const filas = repartirEnFilas(RAIZ_RONDAS, LISTA);
  let lista = [];
  ["gb_rounds_v2:cKorn", "gb_rounds_v2:libre:4"].forEach((k) => { lista = mergeByIdRev(lista, filas[k]); });
  check("llegan solo las fechas de lo que me toca", lista.map((r) => r.id).sort().join(",") === "1,2,4",
    lista.map((r) => r.id).join(","));
  check("y no se filtra ninguna de las otras comunidades",
    !lista.some((r) => r.communityId === "cOtra" || r.communityId === "cTercera"));
  check("ni la ronda casual que no jugué", !lista.some((r) => r.id === "6"));
}

console.log("\n=== 5. CORRECCIONES Y BORRADOS SOBREVIVEN AL REPARTO ===");
{
  const corregida = { ...LISTA[0], _rev: 7, date: "2026-10-30" };
  const borrada = marcarBorrado(LISTA[1]);
  const filas = repartirEnFilas(RAIZ_RONDAS, [corregida, borrada, ...LISTA.slice(2)]);
  const korn = filas["gb_rounds_v2:cKorn"];
  check("la corrección viaja con su _rev", korn.find((r) => r.id === "1")._rev === 7);
  check("la marca de borrado viaja en la fila", korn.find((r) => r.id === "2")._deleted === true);
  // Un celular con la versión vieja de esa fecha no la puede resucitar.
  const fusion = mergeByIdRev([LISTA[1]], korn);
  check("y gana a la copia vieja de otro celular", fusion.find((r) => r.id === "2")._deleted === true);
  check("así que la app no la muestra", vivos(fusion).some((r) => r.id === "2") === false);
}

console.log("\n=== 6. CADA FILA SE FUSIONA CON LA FUSIÓN QUE LE TOCA ===");
{
  // Al subir, la app lee lo último de la nube y lo combina. Si no reconociera
  // la fila de una comunidad, subiría pisando lo del otro anotador.
  check("la fila única de antes, como siempre", mergerDe("gb_rounds_v2") === SEPARADAS[RAIZ_RONDAS]);
  check("la fila de una comunidad usa la misma fusión", mergerDe("gb_rounds_v2:cKorn") === SEPARADAS[RAIZ_RONDAS]);
  check("los eventos usan la fusión de eventos (hoyo por hoyo)", mergerDe("gb_events_v1:cKorn") === mergeEvents);
  check("los jugadores no se reparten", mergerDe("gb_players_v2") === mergeByIdRev);
  check("una clave desconocida no se fusiona a ciegas", mergerDe("gb_otra_cosa") === null);
}

console.log("\n=== 7. UN EVENTO EN DOS CELULARES, DENTRO DE SU FILA ===");
{
  const ev = (rev, scores) => ({ id: "ev1", communityId: "cKorn", _rev: rev, registered: ["p1"],
    groups: [{ id: "g1", scorerId: "p1", scores: { p1: scores } }] });
  const vacio = new Array(18).fill("");
  const a = [...vacio]; a[0] = "4";
  const b = [...vacio]; b[1] = "5";
  const filaA = repartirEnFilas(RAIZ_EVENTOS, [ev(2, a)])["gb_events_v1:cKorn"];
  const filaB = repartirEnFilas(RAIZ_EVENTOS, [ev(1, b)])["gb_events_v1:cKorn"];
  const juntos = mergeEvents(filaA, filaB);
  const sc = juntos[0].groups[0].scores.p1;
  check("el hoyo 1 del primer anotador se queda", sc[0] === "4", String(sc[0]));
  check("y el hoyo 2 del segundo no se pierde", sc[1] === "5", String(sc[1]));
}

console.log("\n=== 8. LA APP SOLO USA LAS FILAS REPARTIDAS ===");
{
  // Las filas de antes quedaron congeladas en la base como respaldo. Si la app
  // las siguiera escribiendo no se les podría poner llave; y si las siguiera
  // leyendo, una corrección hecha después volvería a aparecer, porque la
  // fusión nunca pisa un valor con uno vacío.
  const guardar = src.slice(src.indexOf("const persistSeparado"), src.indexOf("useEffect(() => { persistSeparado(RAIZ_RONDAS"));
  check("guardar escribe SOLO las filas repartidas",
    /repartirEnFilas\(raiz, lista\)\)\.forEach/.test(guardar) && !/persist\(raiz, lista\)/.test(guardar));
  check("las fechas y los eventos pasan por el guardado repartido",
    /persistSeparado\(RAIZ_RONDAS, roundsAll\)/.test(src) && /persistSeparado\(RAIZ_EVENTOS, eventsAll\)/.test(src));
  check("al entrar se leen las filas repartidas", /leerSeparado\(RAIZ_RONDAS\)/.test(src) && /leerSeparado\(RAIZ_EVENTOS\)/.test(src));
  check("el sondeo de cada 15 s pide las filas por prefijo",
    (src.match(/\.like\("key", RAIZ_(RONDAS|EVENTOS) \+ ":%"\)/g) || []).length >= 2);
  check("y el sondeo ya no pide las filas únicas",
    !/in\("key", \["gb_players_v2", "gb_comm_v2", RAIZ_/.test(src));
  check("la foto de lo cargado es fila por fila, no de la lista entera",
    /\.\.\.fotos\(filasRnd\), \.\.\.fotos\(filasEvs\)/.test(src));
  const leer = src.slice(src.indexOf("const leerSeparado"), src.indexOf("const fotos ="));
  check("la fila única solo se mira si no llegó ni una repartida",
    /if \(!claves\.length\) \{[\s\S]{0,180}store\.get\(raiz, \[\]\)/.test(leer));
  check("la fila vieja de las casuales solo cuenta si ninguna tiene la suya",
    /if \(!hayCasualesPropias && todas\[laVieja\]\) filas\[laVieja\] = todas\[laVieja\];/.test(leer));
  const sondeo = src.slice(src.indexOf("// SINCRONIZACIÓN EN VIVO"), src.indexOf("const iv = setInterval(tick, 15000)"));
  check("y el sondeo también la saltea",
    /r\.key === CLAVE_LIBRE_VIEJA\(raiz\)/.test(sondeo));
}

console.log("\n=== 9. EL SONDEO NO PIDE TODO CADA 15 SEGUNDOS ===");
{
  // Las fechas son 88 kB de los 115 que se pedían cada 15 s, y casi nunca
  // cambian. Si alguien las vuelve a pedir en cada vuelta, el gasto de datos de
  // los 48 celulares se multiplica por cuatro sin que nadie lo note.
  const sondeo = src.slice(src.indexOf("// SINCRONIZACIÓN EN VIVO"), src.indexOf("const iv = setInterval(tick, 15000)"));
  check("los eventos sí van en cada vuelta", /\.like\("key", RAIZ_EVENTOS \+ ":%"\),\s*\]\)/.test(sondeo));
  check("las fechas van cada 8 vueltas (2 minutos)", /cada\(8\)/.test(sondeo));
  check("y solo se piden cuando toca", /tocaFechas \? sb\.from\("collections"\)[\s\S]{0,90}RAIZ_RONDAS \+ ":%"\) : vacio/.test(sondeo));
  check("si acaba de cerrarse una fecha, se piden al instante", /faltanFechas\.current && insistir\.current\+\+ < 4/.test(sondeo));
  check("pero no se insiste para siempre", /if \(!falta\) insistir\.current = 0;/.test(src));
  check("los jugadores y las comunidades, cada minuto", /const tocaGente = cada\(4\)/.test(sondeo));
}

console.log("\n=== 10. UNA RONDA CASUAL SIEMPRE TIENE DUEÑO ===");
{
  // En una casual no hay comunidad a la que preguntarle. El servidor decide
  // mirando quién jugó y quién la creó; si la fecha guardada no dijera quién la
  // creó, alguien que organizó la ronda sin jugarla no podría guardarla.
  const consolidar = src.slice(src.indexOf("const evObj = {"), src.indexOf("const evObj = {") + 500);
  check("la fecha guardada lleva quién la creó", /createdBy: event\.createdBy \|\| me\.id/.test(consolidar));
  check("y el evento casual nace con dueño", /quick: true, createdBy: me\.id/.test(src));
}

console.log(fallos === 0 ? "\nRESULTADO: todo correcto" : `\nRESULTADO: ${fallos} fallo(s)`);
process.exit(fallos ? 1 : 0);
