// Dos Jaime Tagle en la misma comunidad: el registro pide segundo apellido y
// las listas los muestran distintos.
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
const salir = async () => { await page.click('button:text-is("Salir")'); await page.waitForSelector('button:has-text("Crear cuenta")'); };
// name, last, last2, email
const crearCuenta = async (n, a, a2, e) => {
  await page.click('button:has-text("Crear cuenta")');
  const t = page.locator('input:not([type="email"]):not([type="password"]):not([type="date"]):not([type="number"])');
  await t.first().fill(n); await t.nth(1).fill(a);
  if (a2) await t.nth(2).fill(a2);
  await page.fill('input[type="email"]', e);
  const pw = page.locator('input[type="password"]');
  await pw.nth(0).fill("123456"); await pw.nth(1).fill("123456");
  await page.locator('button:text-is("Crear cuenta")').last().click();
  await page.waitForSelector(`text=Bienvenido, ${n}`);
};

await page.goto(BASE, { waitUntil: "networkidle" });

console.log("=== 1. EL REGISTRO PIDE EL SEGUNDO APELLIDO ===");
await page.click('button:has-text("Crear cuenta")');
{
  const txt = await page.locator("body").innerText();
  T("aparece el campo", /Segundo apellido/i.test(txt));
  T("y explica para qué sirve", /se llame igual/i.test(txt), (txt.match(/Ayuda a[^\n]*/) || [])[0]);
}
await page.screenshot({ path: `${shots}/homo-1-registro.png`, fullPage: true });
await page.locator('button:has-text("Ya tengo cuenta"), button:has-text("Entrar")').first().click().catch(() => {});
await page.waitForTimeout(300);

// El hijo crea la comunidad; el papá se postula. Mismo nombre y apellido.
await page.goto(BASE, { waitUntil: "networkidle" });
await crearCuenta("Jaime", "Tagle", "Jimenez", "hijo@t.com");
await nav("Comunidades");
await page.click('button:has-text("+ Nueva comunidad")');
await page.locator("input").first().fill("KFB");
await page.click('button:has-text("Crear comunidad")');
await page.waitForTimeout(300);
await salir();
await crearCuenta("Jaime", "Tagle", "Bracamonte", "papa@t.com");
await nav("Comunidades");
{ const p = page.locator('button:has-text("Postular")'); if (await p.count()) await p.first().click(); await page.waitForTimeout(250); }
await salir();
await crearCuenta("Diego", "Guinea", "", "diego@t.com");
await nav("Comunidades");
{ const p = page.locator('button:has-text("Postular")'); if (await p.count()) await p.first().click(); await page.waitForTimeout(250); }
await salir();

await page.fill('input[type="email"]', "hijo@t.com");
await page.locator('input[type="password"]').first().fill("123456");
await page.locator('button:text-is("Entrar")').last().click();
await page.waitForSelector("text=Bienvenido,");
await nav("Comunidades");
await page.locator('button:has-text("Entrar")').first().click();
await page.waitForSelector("text=Money List");

console.log("\n=== 2. AL ACEPTAR POSTULANTES SE DISTINGUEN ===");
{
  const txt = await page.locator("body").innerText();
  T("el postulante lleva su segundo apellido", /Jaime Tagle Bracamonte/.test(txt),
    (txt.match(/Jaime Tagle[^\n]*/g) || []).join(" | "));
}
await page.screenshot({ path: `${shots}/homo-2-postulantes.png`, fullPage: true });
for (let i = 0; i < 2; i++) { const b = page.locator('button:has-text("Aceptar")'); if (await b.count()) { await b.first().click(); await page.waitForTimeout(300); } }

console.log("\n=== 3. EN LA LISTA DE MIEMBROS NO HAY DOS IGUALES ===");
{
  const txt = await page.locator("body").innerText();
  const jaimes = txt.match(/Jaime Tagle \w+/g) || [];
  T("los dos Jaime salen con apellidos distintos", new Set(jaimes).size >= 2, jaimes.join(" | "));
  T("ninguno queda como 'Jaime Tagle' a secas", !/Jaime Tagle(?! \w)/.test(txt));
}

console.log("\n=== 4. AL ARMAR UN GRUPO SE PUEDE ELEGIR AL CORRECTO ===");
await page.click('button:has-text("Eventos")');
await page.click('button:has-text("+ Crear evento")');
await page.fill('input[placeholder*="Fecha 5"]', "Fecha 1");
await page.click('button:has-text("Crear evento")');
await page.waitForSelector("text=Inscripción abierta");
await page.click('button:has-text("Inscribirme")');
for (const nm of ["Jaime Tagle Bracamonte", "Diego Guinea"]) {
  const b = page.locator(`button:text-is("${nm}")`).first();
  T(`se puede inscribir a «${nm}»`, (await b.count()) > 0);
  if (await b.count()) { await b.click(); await page.waitForTimeout(150); }
}
await page.click('button:has-text("Cerrar inscripción y armar grupos")');
await page.waitForSelector("text=Grupo 1");
{
  const txt = await page.locator("body").innerText();
  const jaimes = [...new Set(txt.match(/Jaime Tagle \w+/g) || [])];
  T("al armar grupos los dos se ven distintos", jaimes.length === 2, jaimes.join(" | "));
}
await page.screenshot({ path: `${shots}/homo-3-grupos.png`, fullPage: true });

console.log("\nerrores JS:", errors.length, errors.slice(0, 3));
console.log(fallos === 0 ? "RESULTADO: todo correcto" : `RESULTADO: ${fallos} fallo(s)`);
await browser.close();
process.exit(fallos || errors.length ? 1 : 0);
