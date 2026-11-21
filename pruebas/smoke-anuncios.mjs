// Mientras GolfBuddy Pro no se cobre, los anuncios los ve TODO el mundo.
// Pro hoy es una demostración que cualquiera activa gratis: si ocultara los
// anuncios, bastaría un toque para dejar de ver a los auspiciadores.
import { chromium } from "playwright";
const BASE = "http://localhost:4173";
const shots = process.env.SHOTS_DIR || ".";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await (await browser.newContext({ viewport: { width: 1000, height: 1300 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("dialog", (d) => d.accept());
let fallos = 0;
const T = (n, ok, d = "") => { if (!ok) fallos++; console.log(`${ok ? "✓" : "✗ FALLA"}  ${n}${d ? " — " + d : ""}`); };
const nav = async (l) => { await page.locator(`button:text-is("${l}")`).first().click(); await page.waitForTimeout(350); };
const anuncios = () => page.locator("text=Espacio publicitario").count();
const texto = () => page.locator("body").innerText();

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

console.log("=== 1. CON EL PLAN GRATIS SE VEN, COMO SIEMPRE ===");
T("el inicio tiene su espacio publicitario", (await anuncios()) === 1, String(await anuncios()));
T("y ya no promete que se oculta con Pro", !/se oculta con GolfBuddy Pro/.test(await texto()));

await nav("Comunidades");
await page.click('button:has-text("+ Nueva comunidad")');
await page.locator("input").first().fill("KFB");
await page.click('button:has-text("Crear comunidad")');
await page.waitForTimeout(400);

console.log("\n=== 2. ACTIVAR PRO (DEMO) NO LOS OCULTA ===");
await page.click('button:has-text("GolfBuddy Pro")');
await page.waitForTimeout(300);
{
  const sub = await texto();
  T("la página de Pro ya no promete \"sin anuncios\"", !/Sin anuncios/.test(sub));
  T("y dice en claro que por ahora se ven en cualquier plan", /se muestran a todos, en cualquier plan/.test(sub));
}
await page.click('button:has-text("Suscribirme (demo)")');
await page.waitForTimeout(300);
// La comunidad también, que antes los ocultaba a todos sus miembros.
await page.click('button:has-text("Activar Pro (demo)")');
await page.waitForTimeout(300);
{
  const sub = await texto();
  T("el jugador quedó como Pro", /Cancelar Pro \(demo\)/.test(sub));
  T("y la comunidad también", /Pro activo/.test(sub));
}
await nav("Inicio");
T("aun siendo Pro, el inicio sigue mostrando el anuncio", (await anuncios()) === 1, String(await anuncios()));

await nav("Comunidades");
await page.locator('button:has-text("Entrar")').first().click();
await page.waitForSelector("text=Money List");
T("y dentro de una comunidad Pro, también", (await anuncios()) === 1, String(await anuncios()));
await page.screenshot({ path: `${shots}/anuncios-pro.png`, fullPage: true });

console.log("\nerrores JS:", errors.length, errors.slice(0, 3));
console.log(fallos === 0 ? "RESULTADO: todo correcto" : `RESULTADO: ${fallos} fallo(s)`);
await browser.close();
process.exit(fallos || errors.length ? 1 : 0);
