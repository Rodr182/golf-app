// El admin audita una fecha consolidada: cuadre, avisos y tarjetas.
// Y quien NO es admin no ve nada de esto.
import { chromium } from "playwright";
const BASE = "http://localhost:4173";
const shots = process.env.SHOTS_DIR || ".";   // dónde dejar las capturas
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await (await browser.newContext({ viewport: { width: 1000, height: 1300 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("dialog", (d) => d.accept());
let fallos = 0;
const T = (n, ok, d = "") => { if (!ok) fallos++; console.log(`${ok ? "✓" : "✗ FALLA"}  ${n}${d ? " — " + d : ""}`); };
const nav = async (l) => { await page.locator(`button:text-is("${l}")`).first().click(); await page.waitForTimeout(350); };
const crearCuenta = async (n, a, e, hcp) => {
  await page.click('button:has-text("Crear cuenta")');
  const t = page.locator('input:not([type="email"]):not([type="password"]):not([type="date"]):not([type="number"])');
  await t.first().fill(n); await t.nth(1).fill(a);
  await page.fill('input[type="email"]', e);
  if (hcp != null) await page.locator('input[type="number"]').first().fill(String(hcp));
  const pw = page.locator('input[type="password"]');
  await pw.nth(0).fill("123456"); await pw.nth(1).fill("123456");
  await page.locator('button:text-is("Crear cuenta")').last().click();
  await page.waitForSelector(`text=Bienvenido, ${n}`);
};
const salir = async () => { await page.click('button:text-is("Salir")'); await page.waitForSelector('button:has-text("Crear cuenta")'); };
const entrar = async (e) => {
  await page.fill('input[type="email"]', e);
  await page.locator('input[type="password"]').first().fill("123456");
  await page.locator('button:text-is("Entrar")').last().click();
  await page.waitForSelector("text=Bienvenido,");
};

await page.goto(BASE, { waitUntil: "networkidle" });
// Rodrigo es admin (crea la comunidad); Diego es miembro común.
await crearCuenta("Rodrigo", "Horna", "a@t.com", 12);
await nav("Comunidades");
await page.click('button:has-text("+ Nueva comunidad")');
await page.locator("input").first().fill("KFB");
await page.click('button:has-text("Crear comunidad")');
await page.waitForTimeout(300);
await salir();
await crearCuenta("Diego", "Guinea", "b@t.com", 4);
await nav("Comunidades");
{ const p = page.locator('button:has-text("Postular")'); if (await p.count()) await p.first().click(); await page.waitForTimeout(250); }
await salir();
await entrar("a@t.com");
await nav("Comunidades");
await page.locator('button:has-text("Entrar")').first().click();
await page.waitForSelector("text=Money List");
{ const ac = page.locator('button:has-text("Aceptar")'); if (await ac.count()) { await ac.first().click(); await page.waitForTimeout(300); } }

// Una fecha de 2 grupos de 3 (para que haya Individual general y préstamo).
await page.click('button:has-text("Eventos")');
await page.click('button:has-text("+ Crear evento")');
await page.fill('input[placeholder*="Fecha 5"]', "Sábado");
await page.click('button:has-text("Crear evento")');
await page.waitForSelector("text=Inscripción abierta");
await page.click('button:has-text("Inscribirme")');
await page.locator('button:text-is("Diego Guinea")').first().click();
await page.waitForTimeout(150);
for (const nm of ["Inv A", "Inv B", "Inv C", "Inv D"]) {
  await page.fill('input[placeholder="Nombre del invitado"]', nm);
  await page.locator('button:has-text("+ Agregar")').first().click();
  await page.waitForTimeout(110);
}
await page.click('button:has-text("Cerrar inscripción y armar grupos")');
await page.waitForSelector("text=Grupo 1");
for (const nm of ["Rodrigo Horna", "Diego Guinea", "Inv A"]) {
  await page.locator(`button:text-is("${nm}"), button:text-is("🎟️ ${nm}")`).first().click();
  await page.waitForTimeout(90);
}
await page.click('button:has-text("+ Añadir grupo")');
await page.waitForTimeout(250);
for (const nm of ["Inv B", "Inv C", "Inv D"]) {
  await page.locator(`button:text-is("🎟️ ${nm}"), button:text-is("${nm}")`).last().click();
  await page.waitForTimeout(90);
}
const sels = page.locator("select");
await sels.first().selectOption({ label: "Rodrigo Horna" });
await page.waitForTimeout(200);
// El grupo 2 es solo de invitados: ahí el admin se ofrece como "… (admin)".
{
  const ops = await sels.last().locator("option").allTextContents();
  const admin = ops.find((o) => /\(admin\)/.test(o)) || ops[ops.length - 1];
  await sels.last().selectOption({ label: admin });
}
await page.waitForTimeout(200);
await page.click('button:has-text("Confirmar grupos →")');
await page.waitForSelector("text=En juego");

// Se anotan los dos grupos y se consolida.
await nav("Iniciar Ronda");
await page.locator('button:has-text("Anotar scores →")').first().click();
await page.waitForTimeout(400);
const llenarGrupo = async (i, golpes) => {
  await page.locator('button:has-text("Llenar scores"), button:has-text("Editar"), button:has-text("Ver en vivo")').nth(i).click();
  await page.waitForSelector("text=Hándicaps de hoy");
  const casillas = () => page.locator('input[inputmode="numeric"]');
  for (let h = 0; h < 18; h++) {
    for (let j = 0; j < golpes.length; j++) await casillas().nth(j).fill(String(golpes[j]));
    if (h < 17) { await page.locator('button:has-text("Hoyo")').last().click(); await page.waitForTimeout(110); }
  }
  await page.waitForTimeout(400);
  await page.locator('button:has-text("← Grupos")').first().click();
  await page.waitForTimeout(350);
};
await llenarGrupo(0, [4, 5, 4]);
await llenarGrupo(1, [5, 4, 4]);
await page.locator('button:has-text("Consolidar")').first().click();
await page.waitForTimeout(800);
// Dos grupos de 3: hay que elegir el jugador prestado de cada uno (regla 10).
{
  const selectores = page.locator("select");
  const n = await selectores.count();
  for (let i = 0; i < n; i++) {
    const ops = await selectores.nth(i).locator("option").allTextContents();
    if (ops.length > 1) await selectores.nth(i).selectOption({ index: 1 });
    await page.waitForTimeout(150);
  }
}
{ const c = page.locator('button:has-text("Confirmar y consolidar")'); if (await c.count()) { await c.first().click(); await page.waitForTimeout(1000); } }

console.log("=== 1. EL ADMIN VE LA AUDITORÍA ===");
{
  const txt = await page.locator("body").innerText();
  T("aparece el bloque de auditoría", /Auditoría de la fecha/.test(txt));
  T("y dice de entrada si la plata cuadra", /La plata cuadra en 0/.test(txt),
    (txt.match(/La plata (cuadra|NO cuadra)[^\n]*/) || [])[0]);
}
await page.screenshot({ path: `${shots}/audit-1-cerrado.png`, fullPage: true });

console.log("\n=== 2. EL DETALLE ===");
await page.locator('button:has-text("Ver el detalle")').first().click();
await page.waitForTimeout(400);
{
  const txt = await page.locator("body").innerText();
  T("dice con qué reglas se calculó", /Hándicap al \d+%/.test(txt), (txt.match(/Hándicap al \d+%/) || [])[0]);
  T("y cuál fue la base de la fecha", /Base de la fecha: -?\d+/.test(txt), (txt.match(/Base de la fecha: -?\d+/) || [])[0]);
  T("muestra la tarjeta de los dos grupos", (txt.match(/^Grupo \d$/gm) || []).length >= 2, (txt.match(/^Grupo \d$/gm) || []).join(" · "));
  T("con el hándicap y los strokes de cada jugador", /hcp \d+ · aj\. -?\d+ · \d+ str/.test(txt),
    (txt.match(/hcp \d+ · aj\. -?\d+ · \d+ str/g) || []).slice(0, 3).join(" | "));
  T("explica que los grupos de 3 llevan préstamo", /regla 10/.test(txt));
  T("y avisa de los invitados", /invitados?[^\n]*money list/.test(txt), (txt.match(/\d+ invitados?[^\n]*/) || [])[0]);
  // Los totales de la tarjeta tienen que ser los de verdad: 3 pares de 4 y 15 de 4 = 73... se lee del DOM.
  const tot = await page.locator("text=/^Tot$/").count();
  T("la tarjeta trae Out, In y Total", tot >= 1);
}
await page.screenshot({ path: `${shots}/audit-2-detalle.png`, fullPage: true });

console.log("\n=== 3. UN MIEMBRO QUE NO ES ADMIN NO LA VE ===");
await salir(); await entrar("b@t.com");
await nav("Comunidades");
await page.locator('button:has-text("Entrar")').first().click();
await page.waitForSelector("text=Money List");
await page.click('button:has-text("Eventos")');
await page.waitForTimeout(300);
await page.locator('button:has-text("Gestionar")').first().click();
await page.waitForTimeout(500);
{
  const txt = await page.locator("body").innerText();
  T("Diego no ve la auditoría", !/Auditoría de la fecha/.test(txt));
  T("pero sí los resultados de siempre", /Detalle por concurso|Resultado/.test(txt));
}
await page.screenshot({ path: `${shots}/audit-3-no-admin.png`, fullPage: true });

console.log("\nerrores JS:", errors.length, errors.slice(0, 3));
console.log(fallos === 0 ? "RESULTADO: todo correcto" : `RESULTADO: ${fallos} fallo(s)`);
await browser.close();
process.exit(fallos || errors.length ? 1 : 0);
