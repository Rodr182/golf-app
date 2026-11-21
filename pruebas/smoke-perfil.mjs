// El perfil en dos bloques, en un celular:
//   - "Mi plata": por comunidad y temporada, con los MISMOS números que el
//     money list de la comunidad. Nada de sumar plata entre comunidades.
//   - "Mi juego": de todas las comunidades juntas, con su propio año.
// Los datos se cargan ya armados (dos comunidades, dos temporadas, una ronda
// libre, fechas de antes de la app y un Medal), como estarían en la app.
import { chromium } from "playwright";
const BASE = "http://localhost:4173";
const shots = process.env.SHOTS_DIR || ".";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("dialog", (d) => d.accept());
let fallos = 0;
const T = (n, ok, d = "") => { if (!ok) fallos++; console.log(`${ok ? "✓" : "✗ FALLA"}  ${n}${d ? " — " + d : ""}`); };
const ls = (k) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "null"), k);
// La barra de abajo del celular: el botón cuyo texto termina en esa palabra.
const menu = async (palabra) => {
  await page.evaluate((p) => {
    const b = [...document.querySelectorAll("button")].reverse().find((x) => x.innerText.trim().split("\n").pop().trim() === p);
    b.click();
  }, palabra);
  await page.waitForTimeout(400);
};
const pildora = async (texto) => { await page.locator(`button[aria-pressed]:text-is("${texto}")`).first().click(); await page.waitForTimeout(250); };
const elegida = (texto) => page.locator(`button[aria-pressed="true"]:text-is("${texto}")`).count();
const bloquePlata = () => page.evaluate(() => {
  const t = document.body.innerText;
  return t.slice(t.indexOf("Mi plata"), t.indexOf("Mi juego"));
});
const bloqueJuego = () => page.evaluate(() => { const t = document.body.innerText; return t.slice(t.indexOf("Mi juego")); });

// ---- Cuenta y dos comunidades, por la pantalla ----
await page.goto(BASE, { waitUntil: "networkidle" });
await page.click('button:has-text("Crear cuenta")');
{
  const t = page.locator('input:not([type="email"]):not([type="password"]):not([type="date"]):not([type="number"])');
  await t.first().fill("Rodrigo"); await t.nth(1).fill("Horna");
  await page.fill('input[type="email"]', "a@t.com");
  const pw = page.locator('input[type="password"]');
  await pw.nth(0).fill("123456"); await pw.nth(1).fill("123456");
  await page.locator('button:text-is("Crear cuenta")').last().click();
  await page.waitForSelector("text=Bienvenido, Rodrigo");
}
await menu("Comunidades");
for (const nombre of ["Korn Ferry Boys", "Los Otros"]) {
  await page.click('button:has-text("+ Nueva comunidad")');
  await page.locator("input").first().fill(nombre);
  await page.click('button:has-text("Crear comunidad")');
  await page.waitForTimeout(400);
  const volver = page.locator('button:has-text("Volver")');
  if (await volver.count()) { await volver.first().click(); await page.waitForTimeout(300); }
}
const yo = await ls("gb_me_v1");
const comms = await ls("gb_comm_v2");
const kfb = comms.find((c) => c.name === "Korn Ferry Boys").id;
const otra = comms.find((c) => c.name === "Los Otros").id;

// ---- Las fechas, como estarían guardadas ----
const tarjeta = (base) => Array.from({ length: 18 }, (_, h) => String(base + (h % 3 === 0 ? 1 : 0)));
const fecha = (id, cid, date, rows, extra = {}) => ({
  id, communityId: cid, courseId: "losinkas", date, eventName: "Fecha " + id, _rev: 1,
  teams: [{ id: 1, start: 1, pairs: [], players: [{ id: yo, name: "Rodrigo Horna", hcp: 12, gross: tarjeta(5) }] }],
  results: { simple: false, eventStart: 1, tokenValue: 5, breakdown: [],
    rows: rows.map(([pid, nombre, m, contests]) => ({ id: pid, name: nombre, totalMoney: m, contests: contests || [] })) },
  ...extra,
});
const medal = (neto, tokens) => [{ medal: true, total: tokens, meta: { netTotal: neto } }];
await page.evaluate(([kfb, otra, rondasKfb, rondasOtra, libre]) => {
  localStorage.setItem(`gb_rounds_v2:${kfb}`, JSON.stringify(rondasKfb));
  localStorage.setItem(`gb_rounds_v2:${otra}`, JSON.stringify(rondasOtra));
  localStorage.setItem(`gb_rounds_v2:libre:l1`, JSON.stringify([libre]));
  // Lo jugado en 2026 antes de usar la app, como lo guarda la comunidad
  const cs = JSON.parse(localStorage.getItem("gb_comm_v2"));
  const k = cs.find((c) => c.id === kfb);
  k.historico = { "2026": { fechas: 3, jugadores: { [k.admin]: { money: 30, fechas: 3 }, ana: { money: -5, fechas: 2 } } } };
  localStorage.setItem("gb_comm_v2", JSON.stringify(cs));
}, [kfb, otra,
  [fecha("k1", kfb, "2026-03-07", [[yo, "Rodrigo Horna", 40], ["ana", "Ana", -10], ["luis", "Luis", -30]]),
   fecha("k2", kfb, "2026-05-02", [[yo, "Rodrigo Horna", -15, medal(70, 6)], ["ana", "Ana", 25, medal(72, -3)], ["luis", "Luis", -10, medal(75, -3)]]),
   fecha("k3", kfb, "2025-11-08", [[yo, "Rodrigo Horna", 100], ["ana", "Ana", -100]])],
  [fecha("o1", otra, "2026-04-04", [[yo, "Rodrigo Horna", -60], ["pepe", "Pepe", 60]])],
  fecha("l1", "libre", "2026-06-01", [[yo, "Rodrigo Horna", 12], ["inv", "Invitado", -12]]),
]);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(600);
await menu("Yo");

console.log("=== 1. EL PERFIL EN DOS BLOQUES ===");
{
  const txt = await page.locator("body").innerText();
  T("hay un bloque \"Mi plata\" y otro \"Mi juego\"", /Mi plata/.test(txt) && /Mi juego/.test(txt));
  T("primero la plata, que es lo que más se mira", txt.indexOf("Mi plata") < txt.indexOf("Mi juego"));
  T("ya no hay \"Balance total\" sumando comunidades", !/Balance total/.test(txt));
}
await page.screenshot({ path: `${shots}/perfil-1-plata.png` });

console.log("\n=== 2. MI PLATA: ENTRA EN MI COMUNIDAD PRINCIPAL Y EL AÑO ACTUAL ===");
const anioActual = String(new Date().getFullYear());
{
  T("elige sola la comunidad donde más jugué", (await elegida("Korn Ferry Boys")) === 1);
  T(`y la temporada actual (${anioActual})`, (await elegida(anioActual)) === 1);
  const p = await bloquePlata();
  T("balance de KFB 2026: 40 − 15 en la app + 30 de antes", /\+S\/\.55\.00/.test(p), (p.match(/BALANCE[^\n]*\n[^\n]*/i) || [""])[0].replace(/\n/g, " "));
  // KFB 2026: yo 55 · Ana −10 + 25 − 5 de antes = 10 · Luis −40
  T("mi puesto en el money list: 1º de 3", /MONEY LIST\n1º de 3/.test(p));
  T("5 fechas, contando las de antes de la app", /FECHAS\n5/i.test(p));
  T("avisa qué parte es de antes de la app", /Incluye \+S\/\.30\.00 de 3 fechas jugadas antes/.test(p));
  T("el Medal de esta comunidad", /Medal/.test(p) && /🏆 Ganado/.test(p));
  T("y la lista de mis fechas de 2026, sin la de 2025", /Fecha k1/.test(p) && /Fecha k2/.test(p) && !/Fecha k3/.test(p));
}

console.log("\n=== 3. CAMBIAR DE TEMPORADA ===");
await pildora("2025");
{
  const p = await bloquePlata();
  T("2025 muestra solo lo de 2025", /\+S\/\.100\.00/.test(p) && !/\+S\/\.55\.00/.test(p));
  T("con su fecha", /Fecha k3/.test(p) && !/Fecha k1/.test(p));
  T("sin Medal, porque ese año no se jugó", !/Medales? ganado/.test(p));
}

console.log("\n=== 4. CAMBIAR DE COMUNIDAD ===");
await pildora("Los Otros");
{
  const p = await bloquePlata();
  T("Los Otros no tiene 2025: salta solo a su temporada", (await elegida(anioActual)) === 1);
  T("y muestra solo lo suyo", /−S\/\.60\.00/.test(p) && !/\+S\/\.55\.00/.test(p) && !/\+S\/\.100\.00/.test(p));
  T("con su propio puesto: 2º de 2", /MONEY LIST\n2º de 2/.test(p));
}
await pildora("🕊️ Rondas libres");
{
  const p = await bloquePlata();
  T("las rondas libres, aparte", /\+S\/\.12\.00/.test(p));
  // En mayúsculas: es el título de la tarjeta del puesto. En minúsculas aparece
  // en el subtítulo del bloque, y eso no cuenta.
  T("y sin puesto: cada una es de otro grupo", !/MONEY LIST/.test(p));
  // La "peor" fecha también puede haber sido ganadora: el color sigue al signo.
  const colores = await page.evaluate(() => {
    const valorDe = (t) => { const l = [...document.querySelectorAll("div")].find((d) => d.children.length === 0 && d.textContent.trim() === t); return l && getComputedStyle(l.nextElementSibling).color; };
    return { mejor: valorDe("Mejor fecha"), peor: valorDe("Peor fecha") };
  });
  T("una \"peor fecha\" ganadora se ve en verde, no en rojo", colores.peor && colores.peor === colores.mejor, `${colores.mejor} / ${colores.peor}`);
}
await page.screenshot({ path: `${shots}/perfil-2-libres.png` });

console.log("\n=== 5. MI JUEGO: TODO JUNTO, CON SU PROPIO AÑO ===");
await page.locator("text=Mi juego").first().scrollIntoViewIfNeeded();
{
  const j = await bloqueJuego();
  T("tiene su selector, con \"Todas\" elegido", (await elegida("Todas")) === 1);
  T("rondas jugadas de TODAS las comunidades: 3+3 KFB, 1 Los Otros, 1 libre", /\b8 rondas jugadas/.test(j), (j.match(/\d+ rondas? jugadas?[^\n]*/) || [""])[0]);
  T("con las estadísticas de juego", /Estadísticas de juego/.test(j) && /hoyos jugados/.test(j));
}
await page.screenshot({ path: `${shots}/perfil-3-juego.png` });
// El selector de "Mi juego" es el segundo "2025" de la pantalla
await page.locator('button[aria-pressed]:text-is("2025")').last().click();
await page.waitForTimeout(250);
{
  const j = await bloqueJuego();
  T("en 2025 cuenta solo la fecha de ese año", /\b1 ronda jugada en 2025/.test(j), (j.match(/\d+ rondas? jugadas?[^\n]*/) || [""])[0]);
  T("y el año del juego no movió la plata (sigue en Rondas libres)", (await elegida("🕊️ Rondas libres")) === 1 && /\+S\/\.12\.00/.test(await bloquePlata()));
}

console.log("\n=== 6. EL MISMO NÚMERO QUE EL MONEY LIST DE LA COMUNIDAD ===");
await menu("Comunidades");
await page.locator('div:has-text("Korn Ferry Boys") >> button:has-text("Entrar")').first().click();
await page.waitForSelector("text=Money List");
await page.locator('button:has-text("Money List")').first().click();
await page.waitForTimeout(400);
{
  const txt = await page.locator("body").innerText();
  T("el money list de KFB 2026 dice +S/.55.00, igual que el perfil", /\+S\/\.55\.00/.test(txt));
}

console.log("\nerrores JS:", errors.length, errors.slice(0, 3));
console.log(fallos === 0 ? "RESULTADO: todo correcto" : `RESULTADO: ${fallos} fallo(s)`);
await browser.close();
process.exit(fallos || errors.length ? 1 : 0);
