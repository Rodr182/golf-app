// El anotador designado tiene que poder escribir ENTRE POR DONDE ENTRE:
// tanto desde "Iniciar Ronda" como desde Comunidad → Eventos → Gestionar.
import { chromium } from "playwright";
const BASE = "http://localhost:4173";
const shots = process.env.SHOTS_DIR || ".";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await (await browser.newContext({ viewport: { width: 950, height: 1200 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("dialog", (d) => d.accept());
let fallos = 0;
const T = (n, ok, d = "") => { if (!ok) fallos++; console.log(`${ok ? "✓" : "✗ FALLA"}  ${n}${d ? " — " + d : ""}`); };
const nav = async (l) => { await page.locator(`button:text-is("${l}")`).first().click(); await page.waitForTimeout(350); };
const crearCuenta = async (n, a, e) => {
  await page.click('button:has-text("Crear cuenta")');
  const t = page.locator('input:not([type="email"]):not([type="password"]):not([type="date"]):not([type="number"])');
  await t.first().fill(n); await t.nth(1).fill(a);
  await page.fill('input[type="email"]', e);
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
const editables = () => page.locator('input[inputmode="numeric"]').evaluateAll((els) => els.filter((e) => !e.readOnly).length);
const abrirTarjeta = async () => {
  await page.locator('button:has-text("Llenar scores"), button:has-text("Ver en vivo"), button:has-text("Editar")').first().click();
  await page.waitForSelector("text=Hándicaps de hoy");
};

await page.goto(BASE, { waitUntil: "networkidle" });
// Rodrigo crea la comunidad (es admin). Diego es un miembro común.
await crearCuenta("Rodrigo", "Horna", "a@t.com");
await nav("Comunidades");
await page.click('button:has-text("+ Nueva comunidad")');
await page.locator("input").first().fill("KFB");
await page.click('button:has-text("Crear comunidad")');
await page.waitForTimeout(300);
await salir();
await crearCuenta("Diego", "Guinea", "b@t.com");
await nav("Comunidades");
{ const p = page.locator('button:has-text("Postular")'); if (await p.count()) await p.first().click(); await page.waitForTimeout(250); }
await salir();
await entrar("a@t.com");
await nav("Comunidades");
await page.locator('button:has-text("Entrar")').first().click();
await page.waitForSelector("text=Money List");
{ const ac = page.locator('button:has-text("Aceptar")'); if (await ac.count()) { await ac.first().click(); await page.waitForTimeout(300); } }

// Una fecha con un grupo de 4; anota DIEGO, que no es administrador.
await page.click('button:has-text("Eventos")');
await page.click('button:has-text("+ Crear evento")');
await page.fill('input[placeholder*="Fecha 5"]', "Hoy");
await page.click('button:has-text("Crear evento")');
await page.waitForSelector("text=Inscripción abierta");
await page.click('button:has-text("Inscribirme")');
await page.locator('button:text-is("Diego Guinea")').first().click();
await page.waitForTimeout(150);
for (const nm of ["Inv A", "Inv B"]) {
  await page.fill('input[placeholder="Nombre del invitado"]', nm);
  await page.locator('button:has-text("+ Agregar")').first().click();
  await page.waitForTimeout(110);
}
await page.click('button:has-text("Cerrar inscripción y armar grupos")');
await page.waitForSelector("text=Grupo 1");
for (const nm of ["Rodrigo Horna", "Diego Guinea", "Inv A", "Inv B"]) {
  await page.locator(`button:text-is("${nm}"), button:text-is("🎟️ ${nm}")`).first().click();
  await page.waitForTimeout(90);
}
await page.locator("select").first().selectOption({ label: "Diego Guinea" });
await page.waitForTimeout(250);
await page.click('button:has-text("Confirmar grupos →")');
await page.waitForSelector("text=En juego");

console.log("=== 1. EL ANOTADOR ENTRA POR COMUNIDAD → EVENTOS → GESTIONAR ===");
await salir(); await entrar("b@t.com");
await nav("Comunidades");
await page.locator('button:has-text("Entrar")').first().click();
await page.waitForSelector("text=Money List");
await page.click('button:has-text("Eventos")');
await page.waitForTimeout(300);
await page.locator('button:has-text("Gestionar")').first().click();
await page.waitForTimeout(500);
await abrirTarjeta();
{
  const n = await editables();
  T("Diego puede escribir su tarjeta desde Gestionar", n > 0, `${n} casillas editables`);
  const txt = await page.locator("body").innerText();
  T("y no le dice que es solo lectura", !/Vista en vivo \(solo lectura\)/.test(txt));
  await page.locator('input[inputmode="numeric"]').first().fill("5");
  await page.waitForTimeout(500);
  const guardado = await page.evaluate(() => {
    const ev = JSON.parse(localStorage.getItem("gb_events_v1") || "[]").filter((e) => !e._deleted)[0];
    return Object.values((ev.groups[0] || {}).scores || {}).flat().filter((v) => v !== "" && v != null);
  });
  T("y lo que escribe queda guardado", guardado.length > 0, JSON.stringify(guardado));
}
await page.screenshot({ path: `${shots}/anota-1-gestionar.png`, fullPage: true });

console.log("\n=== 2. Y TAMBIÉN POR INICIAR RONDA, COMO ANTES ===");
await nav("Iniciar Ronda");
await page.locator('button:has-text("Anotar scores →")').first().click();
await page.waitForTimeout(400);
await abrirTarjeta();
T("por el camino de siempre sigue pudiendo", (await editables()) > 0, `${await editables()} casillas`);

console.log("\n=== 3. QUIEN NO ANOTA SIGUE SIN PODER ESCRIBIR ===");
await salir(); await entrar("a@t.com");   // Rodrigo es admin pero NO es el anotador
await nav("Comunidades");
await page.locator('button:has-text("Entrar")').first().click();
await page.waitForSelector("text=Money List");
await page.click('button:has-text("Eventos")');
await page.waitForTimeout(300);
await page.locator('button:has-text("Gestionar")').first().click();
await page.waitForTimeout(500);
await abrirTarjeta();
{
  const n = await editables();
  T("el admin NO escribe por encima del anotador", n === 0, `${n} casillas editables`);
  const txt = await page.locator("body").innerText();
  T("y se le dice quién anota", /anota Diego/.test(txt));
}
await page.screenshot({ path: `${shots}/anota-2-admin-lectura.png`, fullPage: true });

console.log("\nerrores JS:", errors.length, errors.slice(0, 3));
console.log(fallos === 0 ? "RESULTADO: todo correcto" : `RESULTADO: ${fallos} fallo(s)`);
await browser.close();
process.exit(fallos || errors.length ? 1 : 0);
