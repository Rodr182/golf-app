// Borrar un jugador tiene que viajar solo a los demás celulares, sin que el
// primero que guarde algo lo resucite desde su copia en memoria.
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../frontend/src/App.jsx", import.meta.url), "utf8");
const code = src.slice(src.indexOf("const marcarBorrado"), src.indexOf("const CLOUD_MERGERS"));
const { marcarBorrado, vivos, mergeByIdRev } =
  new Function(`${code}; return { marcarBorrado, vivos, mergeByIdRev };`)();

let fallos = 0;
const check = (n, ok, d = "") => { if (!ok) fallos++; console.log(`${ok ? "✓" : "✗ FALLA"}  ${n}${d ? " — " + d : ""}`); };

console.log("=== 1. LA MARCA DE BORRADO ===");
{
  const p = { id: "a", name: "Ana", _rev: 3 };
  const b = marcarBorrado(p);
  check("marca sin destruir la ficha", b._deleted === true && b.name === "Ana");
  check("y sube el _rev para ganar la fusión", b._rev === 4, String(b._rev));
  check("la lista de trabajo lo deja fuera", vivos([p, b]).length === 1);
}

console.log("\n=== 2. EL BORRADO LLEGA AL OTRO CELULAR ===");
{
  // El celular B todavía tiene a Ana viva; del servidor llega marcada.
  const enB = [{ id: "ana", name: "Ana", _rev: 3 }, { id: "luis", name: "Luis", _rev: 1 }];
  const delServidor = [{ id: "ana", name: "Ana", _rev: 4, _deleted: true }, { id: "luis", name: "Luis", _rev: 1 }];
  const fusion = mergeByIdRev(enB, delServidor);
  const ana = fusion.find((x) => x.id === "ana");
  check("la marca gana por tener el _rev más alto", ana._deleted === true);
  check("y Ana desaparece de la lista de trabajo", vivos(fusion).length === 1, vivos(fusion).map((x) => x.name).join(","));
  check("pero sigue en el estado, para poder volver a subirla", fusion.length === 2);
}

console.log("\n=== 3. EL CELULAR VIEJO NO LA RESUCITA ===");
{
  // Esto es lo que pasaba antes: B sube su copia y Ana vuelve a aparecer.
  const enB = [{ id: "ana", name: "Ana", _rev: 3 }];
  const enServidor = [{ id: "ana", name: "Ana", _rev: 4, _deleted: true }];
  // Al guardar, B fusiona con lo del servidor ANTES de subir.
  const loQueSube = mergeByIdRev(enB, enServidor);
  check("al subir, B ya lleva la marca puesta", loQueSube[0]._deleted === true);
  check("así que Ana no revive", vivos(loQueSube).length === 0);
}

console.log("\n=== 4. UNA EDICIÓN POSTERIOR SÍ LA REVIVE ===");
{
  // Si la persona vuelve a entrar, su ficha se revive con un _rev mayor.
  const borrada = { id: "ana", name: "Ana", _rev: 4, _deleted: true };
  const revivida = { ...borrada, _deleted: false, _rev: 5 };
  const fusion = mergeByIdRev([revivida], [borrada]);
  check("la versión revivida gana", fusion[0]._deleted === false);
  check("y vuelve a la lista de trabajo", vivos(fusion).length === 1);
}

console.log("\n=== 5. LA APP TRABAJA CON LA LISTA SIN BORRADOS ===");
{
  check("los jugadores pasan por el mismo filtro que rondas y canchas",
    /const players = useMemo\(\(\) => vivos\(playersAll\)/.test(src));
  check("y lo que se sube es la lista COMPLETA, con las marcas",
    /persist\("gb_players_v2", playersAll\)/.test(src));
  check("quien entra con la ficha borrada la revive",
    /if \(found && found\._deleted\)/.test(src));
  const entradas = (src.match(/&& !p\._deleted\)/g) || []).length;
  check("y al entrar no se toma una ficha borrada", entradas === 3, `${entradas} de 3 entradas`);
}

console.log(fallos === 0 ? "\nRESULTADO: todo correcto" : `\nRESULTADO: ${fallos} fallo(s)`);
process.exit(fallos ? 1 : 0);
