// El correo de los demás no puede viajar en la lista compartida de jugadores.
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../frontend/src/App.jsx", import.meta.url), "utf8");
const code = src.slice(src.indexOf("/* Nombre para mostrar."), src.indexOf("const isAdmin ="));
const { resolveName } = new Function(`${code}; return { resolveName };`)();

let fallos = 0;
const check = (n, ok, d = "") => { if (!ok) fallos++; console.log(`${ok ? "✓" : "✗ FALLA"}  ${n}${d ? " — " + d : ""}`); };

console.log("=== 1. LA FICHA QUE SE COMPARTE NO LLEVA CORREO ===");
{
  // Así queda una ficha después de la limpieza: sin email, con cuenta: true.
  const players = [
    { id: "a", name: "Aldo", last: "Amianto", cuenta: true },
    { id: "b", name: "Boris", last: "Ljubicic", cuenta: true },
  ];
  check("el nombre se arma igual que siempre", resolveName("a", players) === "Aldo Amianto", resolveName("a", players));
  const texto = JSON.stringify(players);
  check("no hay ni un arroba en la lista", !texto.includes("@"), texto);
}

console.log("\n=== 2. LOS HOMÓNIMOS SE SIGUEN DISTINGUIENDO SIN CORREO ===");
{
  const players = [
    { id: "hijo", name: "Jaime", last: "Tagle", last2: "Jimenez", cuenta: true },
    { id: "papa", name: "Jaime", last: "Tagle", last2: "Bracamonte", cuenta: true },
  ];
  const a = resolveName("hijo", players), b = resolveName("papa", players);
  check("con segundo apellido, igual de claro que antes", a === "Jaime Tagle Jimenez" && b === "Jaime Tagle Bracamonte", `${a} · ${b}`);
  check("y sin filtrar ningún correo", !a.includes("@") && !b.includes("@"));
}
{
  // Nadie cargó segundo apellido: antes se usaba el correo, ahora el id.
  const players = [
    { id: "3ac42543-160d", name: "Jaime", last: "Tagle", cuenta: true },
    { id: "99fe7608-67c4", name: "Jaime", last: "Tagle", cuenta: true },
  ];
  const a = resolveName("3ac42543-160d", players), b = resolveName("99fe7608-67c4", players);
  check("sin segundo apellido siguen siendo distintos", a !== b, `${a} · ${b}`);
  check("y no se filtra el correo de nadie", !a.includes("@") && !b.includes("@"), `${a} · ${b}`);
}

console.log("\n=== 3. LAS FICHAS VIEJAS (CON CORREO) NO SE ROMPEN ===");
{
  // Durante el rato entre publicar la app y limpiar la base conviven las dos.
  const players = [
    { id: "a", name: "Aldo", last: "Amianto", email: "a@t.com" },
    { id: "b", name: "Boris", last: "Ljubicic", cuenta: true },
  ];
  check("una ficha vieja se sigue leyendo bien", resolveName("a", players) === "Aldo Amianto");
  check("y una nueva también", resolveName("b", players) === "Boris Ljubicic");
}

console.log("\n=== 4. EL CÓDIGO NO GUARDA EL CORREO EN LA LISTA COMPARTIDA ===");
{
  // Dos sitios escriben la ficha propia a la lista de todos: ambos tienen que
  // sacar el correo antes, porque `me` lo lleva pegado desde la sesión.
  const perfil = src.slice(src.indexOf("const saveProfile"), src.indexOf("const changePassword"));
  check("saveProfile borra el correo antes de compartir", /delete paraCompartir\.email/.test(perfil));
  check("y no comparte el objeto con el correo", !/setPlayers\(\(prev\) => \(prev\.some\(\(p\) => p\.id === updated\.id\)\s*\?\s*prev\.map\(\(p\) => \(p\.id === updated\.id \? updated :/.test(perfil));
  const plan = src.slice(src.indexOf("const setPlan"), src.indexOf("const setPlan") + 420);
  check("setPlan también lo borra", /delete paraCompartir\.email/.test(plan));
  const ensure = src.slice(src.indexOf("function ensureCloudPlayer"), src.indexOf("function ensureCloudPlayer") + 900);
  check("la ficha nueva nace sin correo", !/email: user\.email/.test(ensure) && /cuenta: true/.test(ensure));
}

console.log("\n=== 5. 'TIENE CUENTA' YA NO DEPENDE DEL CORREO ===");
{
  const n = (src.match(/\(p\.cuenta \|\| p\.email\)/g) || []).length;
  check("las tres comprobaciones usan cuenta, con respaldo al correo viejo", n === 3, `${n} de 3`);
}

console.log(fallos === 0 ? "\nRESULTADO: todo correcto" : `\nRESULTADO: ${fallos} fallo(s)`);
process.exit(fallos ? 1 : 0);
