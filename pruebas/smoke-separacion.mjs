// Cada comunidad guarda lo suyo en su propia fila. Esta prueba abre la app de
// verdad y comprueba las tres cosas que importan:
//   1. Los datos que hoy están en una sola fila se reparten solos, sin perder nada.
//   2. Si la fila única desaparece, la app sigue teniendo todo (es lo que pasará
//      cuando el servidor deje de entregarla).
//   3. Si falta la fila de una comunidad, solo falta ESA comunidad — que es
//      exactamente lo que verá quien no pertenece a ella.
import { chromium } from "playwright";
const BASE = "http://localhost:4173";
const shots = process.env.SHOTS_DIR || ".";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await (await browser.newContext({ viewport: { width: 1000, height: 1200 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("dialog", (d) => d.accept());
let fallos = 0;
const T = (n, ok, d = "") => { if (!ok) fallos++; console.log(`${ok ? "✓" : "✗ FALLA"}  ${n}${d ? " — " + d : ""}`); };
const nav = async (l) => { await page.locator(`button:text-is("${l}")`).first().click(); await page.waitForTimeout(350); };
const ls = (k) => page.evaluate((key) => { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null; }, k);
const borrarFila = (k) => page.evaluate((key) => localStorage.removeItem(key), k);
const claves = () => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("gb_rounds_v2")).sort());
const recargar = async () => { await page.reload({ waitUntil: "networkidle" }); await page.waitForTimeout(900); };
const ids = (lista) => (lista || []).map((r) => r.id).sort().join(",");

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
// Dos comunidades, como las que ya existen en la app de verdad.
await nav("Comunidades");
for (const nombre of ["Korn Ferry Boys", "Los Otros"]) {
  await page.click('button:has-text("+ Nueva comunidad")');
  await page.locator("input").first().fill(nombre);
  await page.click('button:has-text("Crear comunidad")');
  await page.waitForTimeout(400);
}
const comunidades = await ls("gb_comm_v2");
T("se crearon las dos comunidades", (comunidades || []).length === 2, String((comunidades || []).length));
const [c1, c2] = (comunidades || []).map((c) => c.id);

console.log("=== 1. LO QUE ESTÁ EN UNA SOLA FILA SE REPARTE SOLO ===");
{
  // Así están los datos hoy en la base: todas las fechas juntas en una fila.
  const fecha = (id, cid) => ({ id, communityId: cid, courseId: "inkas", date: "2026-10-18",
    eventName: "Fecha " + id, teams: [], _rev: 1, results: { simple: false, rows: [], breakdown: [] } });
  await page.evaluate(([a, b]) => localStorage.setItem("gb_rounds_v2", JSON.stringify([a, b])),
    [fecha("r1", c1), fecha("r2", c2)]);
  await recargar();
  T("ahora hay una fila por comunidad", (await claves()).join(" ") === `gb_rounds_v2 gb_rounds_v2:${c1} gb_rounds_v2:${c2}`,
    (await claves()).join(" "));
  T("la fila de la primera lleva solo su fecha", ids(await ls(`gb_rounds_v2:${c1}`)) === "r1");
  T("la de la segunda, solo la suya", ids(await ls(`gb_rounds_v2:${c2}`)) === "r2");
  T("y la fila única sigue ahí: se puede volver atrás sin perder nada", ids(await ls("gb_rounds_v2")) === "r1,r2");
}

console.log("\n=== 2. SIN LA FILA ÚNICA, LA APP SIGUE COMPLETA ===");
{
  // Es lo que pasará en cuanto el servidor deje de entregarla.
  await borrarFila("gb_rounds_v2");
  await recargar();
  T("las dos fechas siguen en la app", ids(await ls("gb_rounds_v2")) === "r1,r2", ids(await ls("gb_rounds_v2")));
  T("y cada fila por comunidad quedó intacta",
    ids(await ls(`gb_rounds_v2:${c1}`)) === "r1" && ids(await ls(`gb_rounds_v2:${c2}`)) === "r2");
  T("no se cayó nada en pantalla", errors.length === 0, errors.slice(0, 2).join(" | "));
}

console.log("\n=== 3. SIN LA FILA DE UNA COMUNIDAD, FALTA SOLO ESA ===");
{
  // Esto es lo que verá quien no pertenece a la segunda comunidad: el servidor
  // no le entrega esa fila y su celular no se entera de que existe.
  await borrarFila("gb_rounds_v2");
  await borrarFila(`gb_rounds_v2:${c2}`);
  await recargar();
  const todo = await ls("gb_rounds_v2");
  T("solo queda la fecha de la comunidad que sí se puede leer", ids(todo) === "r1", ids(todo));
  T("no se filtró nada de la otra", !(todo || []).some((r) => r.communityId === c2));
  T("y la app no se rompe por los datos que faltan", errors.length === 0, errors.slice(0, 2).join(" | "));
}

console.log("\n=== 4. UNA FECHA NUEVA CAE EN LA FILA DE SU COMUNIDAD ===");
{
  // Lo mismo, pero con un evento creado desde la pantalla, no inyectado.
  await nav("Comunidades");
  await page.locator('button:has-text("Entrar")').first().click();
  await page.waitForSelector("text=Money List");
  await page.click('button:has-text("Eventos")');
  await page.click('button:has-text("+ Crear evento")');
  await page.fill('input[placeholder*="Fecha 5"]', "Sábado");
  await page.click('button:has-text("Crear evento")');
  await page.waitForSelector("text=Inscripción abierta");
  await page.waitForTimeout(900);
  const evCl = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("gb_events_v1")).sort());
  T("el evento tiene fila propia en su comunidad", evCl.includes(`gb_events_v1:${c1}`), evCl.join(" "));
  const enC1 = await ls(`gb_events_v1:${c1}`);
  T("con el evento dentro", (enC1 || []).length === 1 && enC1[0].communityId === c1);
  T("y nada en la fila de la otra comunidad", !evCl.includes(`gb_events_v1:${c2}`), evCl.join(" "));
}
await page.screenshot({ path: `${shots}/separacion.png`, fullPage: true });

console.log("\nerrores JS:", errors.length, errors.slice(0, 3));
console.log(fallos === 0 ? "RESULTADO: todo correcto" : `RESULTADO: ${fallos} fallo(s)`);
await browser.close();
process.exit(fallos || errors.length ? 1 : 0);
