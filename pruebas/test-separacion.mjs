// Cada comunidad guarda sus fechas y sus eventos en su propia fila de la base.
// Esto comprueba que repartir y volver a juntar no pierde ni duplica nada, y
// que dos celulares con los mismos datos escriben exactamente el mismo texto.
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../frontend/src/App.jsx", import.meta.url), "utf8");
const code = src.slice(src.indexOf("function mergeEventPair"), src.indexOf("/* ---- GUARDIÁN DE VERSIÓN"));
const { repartirPorComunidad, claveComunidad, mergerDe, SEPARADAS, RAIZ_RONDAS, RAIZ_EVENTOS, mergeByIdRev, mergeEvents, marcarBorrado, vivos } =
  new Function(`${code}; return { repartirPorComunidad, claveComunidad, mergerDe, SEPARADAS, RAIZ_RONDAS, RAIZ_EVENTOS, mergeByIdRev, mergeEvents, marcarBorrado, vivos };`)();

let fallos = 0;
const check = (n, ok, d = "") => { if (!ok) fallos++; console.log(`${ok ? "✓" : "✗ FALLA"}  ${n}${d ? " — " + d : ""}`); };

// Tres comunidades y una ronda casual, como en la app de verdad.
const ronda = (id, cid) => ({ id, communityId: cid, date: "2026-10-2" + id, _rev: 1, results: { rows: [] } });
const LISTA = [
  ronda("1", "cKorn"), ronda("2", "cKorn"), ronda("3", "cOtra"),
  ronda("4", "libre"), ronda("5", "cTercera"),
];

console.log("=== 1. CADA COMUNIDAD EN SU FILA ===");
{
  const filas = repartirPorComunidad(RAIZ_RONDAS, LISTA);
  check("sale una fila por comunidad, más la de las rondas casuales",
    Object.keys(filas).sort().join(" ") === "gb_rounds_v2:cKorn gb_rounds_v2:cOtra gb_rounds_v2:cTercera gb_rounds_v2:libre",
    Object.keys(filas).sort().join(" "));
  check("la fila de Korn lleva sus dos fechas y nada más",
    filas["gb_rounds_v2:cKorn"].map((r) => r.id).join(",") === "1,2");
  check("la fecha casual no cae en ninguna comunidad",
    filas["gb_rounds_v2:libre"].length === 1 && filas["gb_rounds_v2:libre"][0].id === "4");
  check("nombre de la fila sin comunidad", claveComunidad(RAIZ_RONDAS, null) === "gb_rounds_v2:libre");
  check("y con comunidad", claveComunidad(RAIZ_EVENTOS, "cKorn") === "gb_events_v1:cKorn");
}

console.log("\n=== 2. DOS CELULARES ESCRIBEN EL MISMO TEXTO ===");
{
  // El orden en memoria depende de quién guardó último. Si el texto de la fila
  // dependiera de ese orden, los celulares se estarían reescribiendo sin parar.
  const alReves = [...LISTA].reverse();
  const a = repartirPorComunidad(RAIZ_RONDAS, LISTA);
  const b = repartirPorComunidad(RAIZ_RONDAS, alReves);
  const iguales = Object.keys(a).every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]));
  check("con las mismas fechas en otro orden, el texto es idéntico", iguales);
}

console.log("\n=== 3. JUNTAR LAS FILAS DEVUELVE LA LISTA COMPLETA ===");
{
  const filas = repartirPorComunidad(RAIZ_RONDAS, LISTA);
  // Así lee la app: parte de vacío y va fusionando fila por fila.
  let lista = [];
  Object.keys(filas).sort().forEach((k) => { lista = mergeByIdRev(lista, filas[k]); });
  check("están las cinco fechas", lista.length === 5, String(lista.length));
  check("ninguna repetida", new Set(lista.map((r) => r.id)).size === 5);
  check("cada una con su comunidad intacta",
    LISTA.every((r) => lista.find((x) => x.id === r.id).communityId === r.communityId));
}

console.log("\n=== 4. SOLO LAS FILAS QUE EL SERVIDOR DEJE LEER ===");
{
  // Es lo que pasará cuando el servidor entregue únicamente las comunidades
  // propias: se leen dos filas y no se ve nada de la tercera.
  const filas = repartirPorComunidad(RAIZ_RONDAS, LISTA);
  let lista = [];
  ["gb_rounds_v2:cKorn", "gb_rounds_v2:libre"].forEach((k) => { lista = mergeByIdRev(lista, filas[k]); });
  check("llegan solo las fechas de lo que me toca", lista.map((r) => r.id).sort().join(",") === "1,2,4",
    lista.map((r) => r.id).join(","));
  check("y no se filtra ninguna de las otras comunidades",
    !lista.some((r) => r.communityId === "cOtra" || r.communityId === "cTercera"));
}

console.log("\n=== 5. CORRECCIONES Y BORRADOS SOBREVIVEN AL REPARTO ===");
{
  const corregida = { ...LISTA[0], _rev: 7, date: "2026-10-30" };
  const borrada = marcarBorrado(LISTA[1]);
  const filas = repartirPorComunidad(RAIZ_RONDAS, [corregida, borrada, ...LISTA.slice(2)]);
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
  const filaA = repartirPorComunidad(RAIZ_EVENTOS, [ev(2, a)])["gb_events_v1:cKorn"];
  const filaB = repartirPorComunidad(RAIZ_EVENTOS, [ev(1, b)])["gb_events_v1:cKorn"];
  const juntos = mergeEvents(filaA, filaB);
  const sc = juntos[0].groups[0].scores.p1;
  check("el hoyo 1 del primer anotador se queda", sc[0] === "4", String(sc[0]));
  check("y el hoyo 2 del segundo no se pierde", sc[1] === "5", String(sc[1]));
}

console.log("\n=== 8. LA APP SOLO USA LAS FILAS POR COMUNIDAD ===");
{
  // La fila única de antes quedó congelada en la base como respaldo. Si la app
  // la siguiera escribiendo no se le podría poner llave; y si la siguiera
  // leyendo, una corrección hecha después volvería a aparecer, porque la
  // fusión nunca pisa un valor con uno vacío.
  const guardar = src.slice(src.indexOf("const persistSeparado"), src.indexOf("useEffect(() => { persistSeparado(RAIZ_RONDAS"));
  check("guardar escribe SOLO la fila de cada comunidad",
    /repartirPorComunidad\(raiz, lista\)\)\.forEach/.test(guardar) && !/persist\(raiz, lista\)/.test(guardar));
  check("las fechas y los eventos pasan por el guardado repartido",
    /persistSeparado\(RAIZ_RONDAS, roundsAll\)/.test(src) && /persistSeparado\(RAIZ_EVENTOS, eventsAll\)/.test(src));
  check("al entrar se leen las filas por comunidad", /leerSeparado\(RAIZ_RONDAS\)/.test(src) && /leerSeparado\(RAIZ_EVENTOS\)/.test(src));
  check("el sondeo de cada 15 s pide las filas por prefijo",
    (src.match(/\.like\("key", RAIZ_(RONDAS|EVENTOS) \+ ":%"\)/g) || []).length >= 2);
  check("y el sondeo ya no pide las filas únicas",
    !/in\("key", \["gb_players_v2", "gb_comm_v2", RAIZ_/.test(src));
  check("la foto de lo cargado es fila por fila, no de la lista entera",
    /\.\.\.fotos\(filasRnd\), \.\.\.fotos\(filasEvs\)/.test(src));
  const leer = src.slice(src.indexOf("const leerSeparado"), src.indexOf("const fotos ="));
  check("la fila única solo se mira si no llegó ni una por comunidad",
    /if \(!claves\.length\) \{[\s\S]{0,180}store\.get\(raiz, \[\]\)/.test(leer));
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

console.log(fallos === 0 ? "\nRESULTADO: todo correcto" : `\nRESULTADO: ${fallos} fallo(s)`);
process.exit(fallos ? 1 : 0);
