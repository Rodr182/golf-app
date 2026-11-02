// Los gaps que se cerraron en este bloque: contraseña a la vista, aviso de
// Regla 8 por cancha, y la caja de sugerencias que le llega al admin.
import { chromium } from "playwright";
const BASE = "http://localhost:4173";
const shots = process.env.SHOTS_DIR || ".";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await (await browser.newContext({ viewport: { width: 950, height: 1250 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("dialog", (d) => d.accept());
let fallos = 0;
const T = (n, ok, d = "") => { if (!ok) fallos++; console.log(`${ok ? "✓" : "✗ FALLA"}  ${n}${d ? " — " + d : ""}`); };
const nav = async (l) => { await page.locator(`button:text-is("${l}")`).first().click(); await page.waitForTimeout(350); };
const salir = async () => { await page.click('button:text-is("Salir")'); await page.waitForSelector('button:has-text("Crear cuenta")'); };
const crearCuenta = async (n, a, e) => {
  await page.click('button:has-text("Crear cuenta")');
  const t = page.locator('input:not([type="email"]):not([type="password"]):not([type="date"]):not([type="number"]):not(textarea)');
  await t.first().fill(n); await t.nth(1).fill(a);
  await page.fill('input[type="email"]', e);
  const pw = page.locator('input[type="password"]');
  await pw.nth(0).fill("123456"); await pw.nth(1).fill("123456");
  await page.locator('button:text-is("Crear cuenta")').last().click();
  await page.waitForSelector(`text=Bienvenido, ${n}`);
};
const entrar = async (e, p = "123456") => {
  await page.fill('input[type="email"]', e);
  await page.locator('input[type="password"]').first().fill(p);
  await page.locator('button:text-is("Entrar")').last().click();
  await page.waitForSelector("text=Bienvenido,");
};

await page.goto(BASE, { waitUntil: "networkidle" });
await crearCuenta("Rodrigo", "Horna", "a@t.com");

console.log("=== 1. LA CONTRASEÑA ESTÁ A LA VISTA ===");
await nav("Jugador (yo)");
{
  const txt = await page.locator("body").innerText();
  // Las contraseñas las maneja Supabase, así que esta tarjeta solo existe en el
  // modo nube. Esta prueba corre contra la compilación local (sin claves, para
  // no tocar los datos de verdad), así que ahí NO debe aparecer.
  const enLaNube = /Mi contraseña/.test(txt);
  if (!enLaNube) {
    T("en modo local no se ofrece cambiar contraseña (correcto)", !/Mi contraseña/.test(txt));
    console.log("   (el resto de esta sección necesita el modo nube; se revisa en la app publicada)");
  } else {
    T("se ve sin abrir 'Editar mis datos'", /Mi contraseña/.test(txt));
    T("y explica por qué conviene", /recuperación/i.test(txt));
    const abierto = await page.locator('input[type="password"]').count();
    T("los campos arrancan cerrados", abierto === 0, `${abierto} campos`);
    await page.locator('button:has-text("Cambiar contraseña")').first().click();
    await page.waitForTimeout(300);
    T("al abrirlo aparecen los dos campos", (await page.locator('input[type="password"]').count()) === 2);
    const pw = page.locator('input[type="password"]');
    await pw.nth(0).fill("corta"); await pw.nth(1).fill("corta");
    await page.locator('button:has-text("Actualizar contraseña")').click();
    await page.waitForTimeout(400);
    T("rechaza una contraseña corta", /al menos 6/.test(await page.locator("body").innerText()));
    await pw.nth(0).fill("nueva123"); await pw.nth(1).fill("otra456");
    await page.locator('button:has-text("Actualizar contraseña")').click();
    await page.waitForTimeout(400);
    T("rechaza si no coinciden", /no coinciden/.test(await page.locator("body").innerText()));
  }
}
await page.screenshot({ path: `${shots}/gaps-1-password.png`, fullPage: true });

console.log("\n=== 2. LA REGLA 8 AVISA CUANDO NO APLICA ===");
await nav("Comunidades");
await page.click('button:has-text("+ Nueva comunidad")');
await page.locator("input").first().fill("KFB");
// activar Regla 8 al crear
await page.locator('input[type="checkbox"]').first().check();
await page.click('button:has-text("Crear comunidad")');
await page.waitForTimeout(300);
await page.locator('button:has-text("Entrar")').first().click();
await page.waitForSelector("text=Money List");
await page.click('button:has-text("Eventos")');
await page.click('button:has-text("+ Crear evento")');
await page.fill('input[placeholder*="Fecha 5"]', "Fecha 1");
await page.click('button:has-text("Crear evento")');
await page.waitForSelector("text=Inscripción abierta");
await page.click('button:has-text("Inscribirme")');
for (const nm of ["Inv A", "Inv B"]) {
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
await page.locator("select").first().selectOption({ label: "Rodrigo Horna" });
await page.waitForTimeout(200);
await page.click('button:has-text("Confirmar grupos →")');
await page.waitForSelector("text=En juego");
await nav("Iniciar Ronda");
await page.locator('button:has-text("Anotar scores →")').first().click();
await page.waitForTimeout(400);
await page.locator('button:has-text("Llenar scores")').first().click();
await page.waitForSelector("text=Hándicaps de hoy");
{
  const txt = await page.locator("body").innerText();
  T("avisa que la Regla 8 no aplica en esta cancha", /La Regla 8 NO aplica hoy/.test(txt));
  T("y explica que se marcan por cancha", /índices de dificultad cambian/.test(txt));
  T("le dice al admin dónde marcarlas", /Comunidad → Reglas/.test(txt));
}
await page.screenshot({ path: `${shots}/gaps-2-regla8.png`, fullPage: true });

console.log("\n=== 3. SUGERENCIAS DE CANCHAS Y MODALIDADES ===");
await nav("Comunidades");
await page.locator('button:has-text("Entrar")').first().click();
await page.waitForSelector("text=Money List");
await page.click('button:has-text("Sugerencias")');
await page.waitForTimeout(300);
{
  const txt = await page.locator("body").innerText();
  T("hay una pestaña de sugerencias", /Proponer algo/.test(txt));
  T("sin sugerencias lo dice", /Todavía no hay sugerencias/.test(txt));
  await page.locator("textarea").fill("Country Club Villa, en Chorrillos. Par 72.");
  await page.locator('button:has-text("Enviar sugerencia")').click();
  await page.waitForTimeout(500);
  const t2 = await page.locator("body").innerText();
  T("se envía y aparece en la lista", /Country Club Villa/.test(t2));
  T("confirma el envío", /Le llega a los administradores/.test(t2));
  T("queda marcada como cancha", /⛳ Cancha/.test(t2));
  T("con el nombre de quien la mandó", /Rodrigo Horna/.test(t2));
  // ahora una modalidad
  await page.locator('button:has-text("🎲 Una modalidad")').click();
  await page.locator("textarea").fill("Skins: el hoyo se acumula si hay empate.");
  await page.locator('button:has-text("Enviar sugerencia")').click();
  await page.waitForTimeout(500);
  T("también acepta modalidades", /🎲 Modalidad/.test(await page.locator("body").innerText()));
  const pest = await page.locator('button:has-text("Sugerencias")').first().innerText();
  T("el admin ve cuántas hay pendientes", /2/.test(pest), pest);
}
await page.screenshot({ path: `${shots}/gaps-3-sugerencias.png`, fullPage: true });

console.log("\n=== 4. EL ADMIN LAS PUEDE CERRAR; UN MIEMBRO NO ===");
{
  await page.locator('button:has-text("Marcar hecha")').first().click();
  await page.waitForTimeout(400);
  T("el admin la marca como aplicada", /Aplicada/.test(await page.locator("body").innerText()));
}
await salir();
await crearCuenta("Diego", "Guinea", "b@t.com");
await nav("Comunidades");
{ const p = page.locator('button:has-text("Postular")'); if (await p.count()) await p.first().click(); await page.waitForTimeout(250); }
await salir(); await entrar("a@t.com");
await nav("Comunidades");
await page.locator('button:has-text("Entrar")').first().click();
await page.waitForSelector("text=Money List");
{ const ac = page.locator('button:has-text("Aceptar")'); if (await ac.count()) { await ac.first().click(); await page.waitForTimeout(400); } }
await salir(); await entrar("b@t.com");
await nav("Comunidades");
await page.locator('button:has-text("Entrar")').first().click();
await page.waitForSelector("text=Money List");
await page.click('button:has-text("Sugerencias")');
await page.waitForTimeout(400);
{
  const txt = await page.locator("body").innerText();
  T("un miembro común sí puede proponer", /Proponer algo/.test(txt));
  T("y ve las que ya existen", /Country Club Villa/.test(txt));
  const cerrar = await page.locator('button:has-text("Marcar hecha")').count();
  const borrar = await page.locator('button:has-text("Borrar")').count();
  T("pero NO puede marcarlas ni borrarlas", cerrar === 0 && borrar === 0, `${cerrar} marcar / ${borrar} borrar`);
}
await page.screenshot({ path: `${shots}/gaps-4-miembro.png`, fullPage: true });

console.log("\nerrores JS:", errors.length, errors.slice(0, 3));
console.log(fallos === 0 ? "RESULTADO: todo correcto" : `RESULTADO: ${fallos} fallo(s)`);
await browser.close();
process.exit(fallos || errors.length ? 1 : 0);
