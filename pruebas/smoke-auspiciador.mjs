// El espacio publicitario, con o sin imagen del auspiciador.
// - Sin imagen todavía: tiene que seguir el cartel de muestra, sin enlace.
// - Con imagen: tiene que verse entera (4:1, sin recortar), llevar al sitio del
//   auspiciador en una pestaña aparte, y no hacerse gigante en un computador.
// Se prueba a ancho de celular y de computador.
import { chromium } from "playwright";
const BASE = "http://localhost:4173";
const shots = process.env.SHOTS_DIR || ".";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
let fallos = 0;
const T = (n, ok, d = "") => { if (!ok) fallos++; console.log(`${ok ? "✓" : "✗ FALLA"}  ${n}${d ? " — " + d : ""}`); };

for (const [nombre, ancho] of [["celular", 390], ["computador", 1280]]) {
  console.log(`\n=== EN ${nombre.toUpperCase()} (${ancho} px) ===`);
  const page = await (await browser.newContext({ viewport: { width: ancho, height: 1100 } })).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.click('button:has-text("Crear cuenta")');
  const t = page.locator('input:not([type="email"]):not([type="password"]):not([type="date"]):not([type="number"])');
  await t.first().fill("Rodrigo"); await t.nth(1).fill("Horna");
  await page.fill('input[type="email"]', "a@t.com");
  const pw = page.locator('input[type="password"]');
  await pw.nth(0).fill("123456"); await pw.nth(1).fill("123456");
  await page.locator('button:text-is("Crear cuenta")').last().click();
  await page.waitForSelector("text=Bienvenido, Rodrigo");
  // La imagen se carga "perezosa": hay que llegar hasta ella.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(800);

  const conImagen = await page.locator("a[data-anuncio]").count();
  if (!conImagen) {
    T("sin imagen todavía, sigue el cartel de muestra", (await page.locator("text=Espacio publicitario").count()) === 1);
    T("y no hay ningún enlace suelto", (await page.locator('a[href*="pinkriverbrand"]').count()) === 0);
  } else {
    const a = await page.evaluate(() => {
      const el = document.querySelector("a[data-anuncio]");
      const img = el.querySelector("img");
      const r = img.getBoundingClientRect();
      return { href: el.href, target: el.target, rel: el.rel, cargo: img.complete && img.naturalWidth > 0,
        nat: [img.naturalWidth, img.naturalHeight], w: r.width, h: r.height };
    });
    T("la imagen carga", a.cargo, `${a.nat[0]}×${a.nat[1]}`);
    T("lleva al sitio del auspiciador", /^https:\/\/www\.pinkriverbrand\.com\/?$/.test(a.href), a.href);
    T("en una pestaña aparte, sin perder la app", a.target === "_blank" && /noopener/.test(a.rel), `${a.target} ${a.rel}`);
    T("se ve con la forma 4:1, sin recortar", Math.abs(a.w / a.h - 4) < 0.05, `${Math.round(a.w)}×${Math.round(a.h)}`);
    if (ancho >= 1000) T("en el computador no pasa de 728 px", a.w <= 728.5, `${Math.round(a.w)} px`);
    else T("en el celular ocupa el ancho de la pantalla", a.w >= ancho - 40, `${Math.round(a.w)} de ${ancho}`);
    T("y ya no está el cartel de muestra", (await page.locator("text=Espacio publicitario").count()) === 0);
  }
  await page.screenshot({ path: `${shots}/auspiciador-${ancho}.png`, fullPage: true });
  T("sin errores de la app", errors.length === 0, errors.slice(0, 2).join(" | "));
}

console.log(fallos === 0 ? "\nRESULTADO: todo correcto" : `\nRESULTADO: ${fallos} fallo(s)`);
await browser.close();
process.exit(fallos ? 1 : 0);
