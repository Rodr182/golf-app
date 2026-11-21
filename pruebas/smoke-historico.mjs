// La plata de antes de la app, en la fila privada de la comunidad:
//   - se ve igual que siempre (money list de la comunidad y perfil),
//   - y al guardar cualquier cambio de la comunidad NO vuelve a los datos
//     compartidos, que lee cualquiera con cuenta.
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
const ls = (k) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "null"), k);
const recargar = async () => { await page.reload({ waitUntil: "networkidle" }); await page.waitForTimeout(700); };
// ¿Queda plata dentro de los datos compartidos de las comunidades?
const compartidoTienePlata = async () => (await ls("gb_comm_v2")).some((c) => c && "historico" in c);
const moneyListDeKFB = async () => {
  await nav("Comunidades");
  await page.locator('button:has-text("Entrar")').first().click();
  await page.waitForSelector("text=Money List");
  await page.locator('button:has-text("Money List")').first().click();
  await page.waitForTimeout(300);
  return page.locator("body").innerText();
};
// Cualquier cambio de la comunidad la vuelve a guardar: el Pro de demostración sirve.
const tocarComunidad = async () => {
  await page.locator('button:has-text("GolfBuddy Pro")').first().click();
  await page.waitForTimeout(300);
  await page.locator('button:has-text("Activar Pro (demo)"), button:has-text("Desactivar (demo)")').first().click();
  await page.waitForTimeout(900);
};

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
await nav("Comunidades");
await page.click('button:has-text("+ Nueva comunidad")');
await page.locator("input").first().fill("Korn Ferry Boys");
await page.click('button:has-text("Crear comunidad")');
await page.waitForTimeout(400);
const yo = await ls("gb_me_v1");
const kfb = (await ls("gb_comm_v2"))[0].id;
const HIST = { "2026": { fechas: 3, desde: "2026-01-10", hasta: "2026-02-21", jugadores: { [yo]: { money: 30, fechas: 3 } } } };

console.log("=== 1. EL HISTÓRICO EN SU FILA PRIVADA SE VE IGUAL QUE SIEMPRE ===");
await page.evaluate(([k, h]) => localStorage.setItem(`gb_historico_v1:${k}`, JSON.stringify([{ communityId: k, historico: h }])), [kfb, HIST]);
await recargar();
T("el money list de la comunidad lo suma", /\+S\/\.30\.00/.test(await moneyListDeKFB()));
await nav("Jugador (yo)");
T("y el perfil también", /Incluye \+S\/\.30\.00 de 3 fechas jugadas antes/.test(await page.locator("body").innerText()));
T("los datos compartidos de la comunidad no llevan la plata", !(await compartidoTienePlata()));

console.log("\n=== 2. GUARDAR UN CAMBIO DE LA COMUNIDAD NO LA DEVUELVE AHÍ ===");
await tocarComunidad();
{
  const cs = await ls("gb_comm_v2");
  T("la comunidad sí se guardó (el cambio está)", cs[0].pro === true);
  T("pero sin la plata de antes de la app", !(await compartidoTienePlata()));
  T("y la fila privada sigue intacta", (await ls(`gb_historico_v1:${kfb}`))[0].historico["2026"].jugadores[yo].money === 30);
}
T("el money list sigue sumándola", /\+S\/\.30\.00/.test(await moneyListDeKFB()));

console.log("\n=== 3. SI TODAVÍA VIENE DENTRO DE LA COMUNIDAD (ANTES DEL TRASLADO) ===");
// Así estaban los datos antes: la plata dentro de la comunidad, sin fila privada.
await page.evaluate(([k, h]) => {
  localStorage.removeItem(`gb_historico_v1:${k}`);
  const cs = JSON.parse(localStorage.getItem("gb_comm_v2"));
  cs[0].historico = h;
  localStorage.setItem("gb_comm_v2", JSON.stringify(cs));
}, [kfb, HIST]);
await recargar();
T("se sigue viendo (nadie pierde nada en el rato del traslado)", /\+S\/\.30\.00/.test(await moneyListDeKFB()));
await tocarComunidad();
T("y al primer guardado, deja de estar en los datos compartidos", !(await compartidoTienePlata()));
await page.screenshot({ path: `${shots}/historico.png`, fullPage: true });

console.log("\nerrores JS:", errors.length, errors.slice(0, 3));
console.log(fallos === 0 ? "RESULTADO: todo correcto" : `RESULTADO: ${fallos} fallo(s)`);
await browser.close();
process.exit(fallos || errors.length ? 1 : 0);
