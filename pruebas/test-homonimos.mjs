// Dos personas distintas con el mismo nombre y apellido (un padre y un hijo)
// no pueden verse iguales en ninguna lista.
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../frontend/src/App.jsx", import.meta.url), "utf8");
const code = src.slice(src.indexOf("/* Nombre para mostrar."), src.indexOf("const isAdmin ="));
const { resolveName, nombresCortos } = new Function(`${code}; return { resolveName, nombresCortos };`)();

let fallos = 0;
const check = (n, ok, d = "") => { if (!ok) fallos++; console.log(`${ok ? "✓" : "✗ FALLA"}  ${n}${d ? " — " + d : ""}`); };

console.log("=== 1. HOMÓNIMOS CON SEGUNDO APELLIDO ===");
{
  const players = [
    { id: "hijo", name: "Jaime", last: "Tagle", last2: "Jimenez", email: "jtaglej@gmail.com" },
    { id: "papa", name: "Jaime", last: "Tagle", last2: "Bracamonte", email: "taglejaime@icloud.com" },
    { id: "otro", name: "Diego", last: "Guinea", email: "d@t.com" },
  ];
  const a = resolveName("hijo", players), b = resolveName("papa", players);
  check("cada uno lleva su segundo apellido", a === "Jaime Tagle Jimenez" && b === "Jaime Tagle Bracamonte", `${a} · ${b}`);
  check("y por lo tanto son distintos", a !== b);
  check("a quien no se repite no le agrega nada", resolveName("otro", players) === "Diego Guinea",
    resolveName("otro", players));
}

console.log("\n=== 2. SI ALGUNO NO LO CARGÓ, IGUAL SE DISTINGUEN ===");
{
  const players = [
    { id: "hijo", name: "Jaime", last: "Tagle", email: "jtaglej@gmail.com" },
    { id: "papa", name: "Jaime", last: "Tagle", email: "taglejaime@icloud.com" },
  ];
  const a = resolveName("hijo", players), b = resolveName("papa", players);
  check("se marcan con su correo", a !== b, `${a} · ${b}`);
  check("y se nota cuál es cuál", /jtaglej/.test(a) && /taglejaime/.test(b), `${a} · ${b}`);
}
{
  // Uno lo cargó y el otro no: el que lo tiene usa el apellido, el otro el correo.
  const players = [
    { id: "hijo", name: "Jaime", last: "Tagle", last2: "Jimenez", email: "jtaglej@gmail.com" },
    { id: "papa", name: "Jaime", last: "Tagle", email: "taglejaime@icloud.com" },
  ];
  const a = resolveName("hijo", players), b = resolveName("papa", players);
  check("mezclando los dos casos siguen siendo distintos", a !== b, `${a} · ${b}`);
}

console.log("\n=== 3. AL ELEGIR PAREJAS TAMPOCO SE CONFUNDEN ===");
{
  const players = [
    { id: "hijo", name: "Jaime", last: "Tagle", last2: "Jimenez", email: "j@t.com" },
    { id: "papa", name: "Jaime", last: "Tagle", last2: "Bracamonte", email: "p@t.com" },
    { id: "r1", name: "Rodrigo", last: "Horna", email: "rh@t.com" },
    { id: "r2", name: "Rodrigo", last: "Arana", email: "ra@t.com" },
    { id: "d", name: "Diego", last: "Guinea", email: "d@t.com" },
  ];
  const corto = nombresCortos(["hijo", "papa", "r1", "r2", "d"], players);
  const etiquetas = ["hijo", "papa", "r1", "r2", "d"].map(corto);
  check("las cinco etiquetas son distintas", new Set(etiquetas).size === 5, etiquetas.join(" · "));
  check("los dos Jaime llevan segundo apellido", /Jimenez/.test(corto("hijo")) && /Bracamonte/.test(corto("papa")),
    `${corto("hijo")} · ${corto("papa")}`);
  check("los dos Rodrigo siguen con solo el primer apellido", corto("r1") === "Rodrigo Horna" && corto("r2") === "Rodrigo Arana",
    `${corto("r1")} · ${corto("r2")}`);
  check("y quien no repite nombre queda corto", corto("d") === "Diego", corto("d"));
}

console.log("\n=== 4. NO SE ROMPE NADA DE LO QUE YA ANDABA ===");
{
  const players = [{ id: "a", name: "Aldo", last: "Amianto", email: "a@t.com" }, { id: "b", name: "Boris", email: "b@t.com" }];
  check("nombre y apellido normales", resolveName("a", players) === "Aldo Amianto", resolveName("a", players));
  check("alguien sin apellido", resolveName("b", players) === "Boris", resolveName("b", players));
  check("un invitado que no está en la lista", resolveName("Inv A", players) === "Inv A");
  check("un id viejo tipo P3", resolveName("P3", players) === "Player 3");
  check("sin lista de jugadores no revienta", resolveName("x", null) === "x");
  const corto = nombresCortos(["a", "b", "Inv A"], [...players, { id: "Inv A", name: "Inv A" }]);
  check("el invitado no se parte en 'Inv'", corto("Inv A") === "Inv A", corto("Inv A"));
}

console.log(fallos === 0 ? "\nRESULTADO: todo correcto" : `\nRESULTADO: ${fallos} fallo(s)`);
process.exit(fallos ? 1 : 0);
