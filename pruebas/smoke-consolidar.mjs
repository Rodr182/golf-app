// Si no se puede consolidar, la app tiene que decir EXACTAMENTE qué falta.
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
await page.locator("input").first().fill("KFB");
await page.click('button:has-text("Crear comunidad")');
await page.waitForTimeout(300);
await page.locator('button:has-text("Entrar")').first().click();
await page.waitForSelector("text=Money List");

// Una fecha con dos grupos de 3 (para que además aparezca el préstamo).
await page.click('button:has-text("Eventos")');
await page.click('button:has-text("+ Crear evento")');
await page.fill('input[placeholder*="Fecha 5"]', "Hoy");
await page.click('button:has-text("Crear evento")');
await page.waitForSelector("text=Inscripción abierta");
await page.click('button:has-text("Inscribirme")');
for (const nm of ["Inv A", "Inv B", "Inv C", "Inv D", "Inv E"]) {
  await page.fill('input[placeholder="Nombre del invitado"]', nm);
  await page.locator('button:has-text("+ Agregar")').first().click();
  await page.waitForTimeout(110);
}
await page.click('button:has-text("Cerrar inscripción y armar grupos")');
await page.waitForSelector("text=Grupo 1");
for (const nm of ["Rodrigo Horna", "Inv A", "Inv B"]) {
  await page.locator(`button:text-is("${nm}"), button:text-is("🎟️ ${nm}")`).first().click();
  await page.waitForTimeout(90);
}
await page.click('button:has-text("+ Añadir grupo")');
await page.waitForTimeout(250);
for (const nm of ["Inv C", "Inv D", "Inv E"]) {
  await page.locator(`button:text-is("🎟️ ${nm}"), button:text-is("${nm}")`).last().click();
  await page.waitForTimeout(90);
}
{
  const sels = page.locator("select");
  await sels.first().selectOption({ label: "Rodrigo Horna" });
  await page.waitForTimeout(200);
  const ops = await sels.last().locator("option").allTextContents();
  await sels.last().selectOption({ label: ops.find((o) => /\(admin\)/.test(o)) || ops[ops.length - 1] });
  await page.waitForTimeout(200);
}
await page.click('button:has-text("Confirmar grupos →")');
await page.waitForSelector("text=En juego");

const irAGrupos = async () => {
  await nav("Iniciar Ronda");
  await page.locator('button:has-text("Anotar scores →")').first().click();
  await page.waitForTimeout(450);
};
const llenar = async (i, golpes, hastaHoyo = 18) => {
  await page.locator('button:has-text("Llenar scores"), button:has-text("Editar"), button:has-text("Ver en vivo")').nth(i).click();
  await page.waitForSelector("text=Hándicaps de hoy");
  const casillas = () => page.locator('input[inputmode="numeric"]');
  for (let h = 0; h < hastaHoyo; h++) {
    for (let j = 0; j < golpes.length; j++) await casillas().nth(j).fill(String(golpes[j]));
    if (h < 17) { await page.locator('button:has-text("Hoyo")').last().click(); await page.waitForTimeout(110); }
  }
  await page.waitForTimeout(400);
  await page.locator('button:has-text("← Grupos")').first().click();
  await page.waitForTimeout(350);
};

console.log("=== 1. SIN NADA ANOTADO, DICE QUIÉN FALTA ===");
await irAGrupos();
{
  const txt = await page.locator("body").innerText();
  T("aparece el cartel de qué falta", /Falta esto para poder consolidar/.test(txt));
  T("nombra a los jugadores sin anotar", /no tiene ningún hoyo anotado/.test(txt),
    (txt.match(/[^\n]*no tiene ningún hoyo anotado/) || [])[0]);
  T("y separa por grupo", /Grupo 1 ·/.test(txt) && /Grupo 2 ·/.test(txt));
  const desactivado = await page.locator('button:has-text("Consolidar")').first().isDisabled();
  T("el botón sigue apagado", desactivado);
}
await page.screenshot({ path: `${shots}/consol-1-nada.png`, fullPage: true });

console.log("\n=== 2. CON UN HOYO SUELTO, DICE CUÁL ===");
await llenar(0, [4, 5, 4]);           // grupo 1 completo
await llenar(1, [5, 4, 4], 17);       // grupo 2: le falta el hoyo 18
{
  const txt = await page.locator("body").innerText();
  T("dice exactamente qué hoyo falta", /falta el hoyo 18/.test(txt),
    (txt.match(/[^\n]*falta el hoyo[^\n]*/) || [])[0]);
  T("y ya no menciona al grupo que sí terminó", !/Grupo 1 ·/.test(txt.split("Falta esto")[1] || ""));
}
await page.screenshot({ path: `${shots}/consol-2-un-hoyo.png`, fullPage: true });

console.log("\n=== 3. COMPLETO: DEJA CONSOLIDAR Y PIDE EL PRESTADO ===");
{
  // se completa el hoyo que faltaba
  await page.locator('button:has-text("Llenar scores"), button:has-text("Editar")').nth(1).click();
  await page.waitForSelector("text=Hándicaps de hoy");
  await page.locator('button:has-text("18")').first().click();
  await page.waitForTimeout(250);
  const casillas = page.locator('input[inputmode="numeric"]');
  for (let j = 0; j < 3; j++) await casillas.nth(j).fill("4");
  await page.waitForTimeout(450);
  await page.locator('button:has-text("← Grupos")').first().click();
  await page.waitForTimeout(400);
  const txt = await page.locator("body").innerText();
  T("desaparece el cartel de faltantes", !/Falta esto para poder consolidar/.test(txt));
  const desactivado = await page.locator('button:has-text("Consolidar")').first().isDisabled();
  T("y el botón se habilita", !desactivado);
}
await page.locator('button:has-text("Consolidar")').first().click();
await page.waitForTimeout(700);
{
  const txt = await page.locator("body").innerText();
  T("pide el jugador prestado de los grupos de 3", /Jugador prestado para grupos de 3/.test(txt));
  T("y dice cuál falta elegir", /Falta elegir el prestado/.test(txt),
    (txt.match(/Falta elegir el prestado[^\n]*/) || [])[0]);
  const desactivado = await page.locator('button:has-text("Confirmar y consolidar")').first().isDisabled();
  T("con el botón de confirmar apagado", desactivado);
}
await page.screenshot({ path: `${shots}/consol-3-prestado.png`, fullPage: true });

console.log("\n=== 4. ELEGIDOS LOS PRESTADOS, CONSOLIDA ===");
{
  const sels = page.locator("select");
  const n = await sels.count();
  for (let i = 0; i < n; i++) {
    const ops = await sels.nth(i).locator("option").allTextContents();
    if (ops.length > 1) await sels.nth(i).selectOption({ index: 1 });
    await page.waitForTimeout(150);
  }
  const txt = await page.locator("body").innerText();
  T("ya no dice que falte elegir", !/Falta elegir el prestado/.test(txt));
  await page.locator('button:has-text("Confirmar y consolidar")').first().click();
  await page.waitForTimeout(1200);
  const txt2 = await page.locator("body").innerText();
  T("la fecha queda consolidada", /Evento consolidado|Cerrado/.test(txt2));
}
await page.screenshot({ path: `${shots}/consol-4-listo.png`, fullPage: true });

console.log("\nerrores JS:", errors.length, errors.slice(0, 3));
console.log(fallos === 0 ? "RESULTADO: todo correcto" : `RESULTADO: ${fallos} fallo(s)`);
await browser.close();
process.exit(fallos || errors.length ? 1 : 0);
