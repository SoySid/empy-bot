import { PROFESSIONS, GLOBAL_WEATHERS, ProfessionType } from "../src/config/economy.config.js";
import { SHOP_ITEMS, ShopItem } from "../src/config/shop.config.js";
import { EDUCATION_CONFIG } from "../src/config/education.config.js";

interface ProfessionAudit {
  id: string;
  name: string;
  category: string;
  weatherStats: {
    min: number;
    max: number;
    avg: number;
    weathers: Record<string, number>;
  };
  tools: {
    count: number;
    totalCost: number;
    totalBonusPercent: number;
    totalCooldownSec: number;
    totalWeatherResist: number;
    totalBlooperResist: number;
    totalHungerReduct: number;
  };
  relic?: {
    name: string;
    price: number;
    bonusPercent: number;
  };
  hq?: {
    name: string;
    price: number;
  };
  education: {
    courseCost: number;
    courseBonus: number;
    uniCost: number;
    uniBonus: number;
  };
  maxTotalMultiplier: number;
  maxEarnings2000Base: number;
}

async function audit() {
  const allProfessions = Object.keys(PROFESSIONS) as ProfessionType[];
  const weathers = Object.values(GLOBAL_WEATHERS);
  const allItems = Object.values(SHOP_ITEMS);

  const results: ProfessionAudit[] = [];

  for (const profId of allProfessions) {
    const meta = PROFESSIONS[profId];

    // 1. Weather stats
    const weatherMults: Record<string, number> = {};
    let sumW = 0;
    let minW = 999;
    let maxW = -999;

    for (const w of weathers) {
      const mult = w.professionMultipliers?.[profId] ?? 1.0;
      weatherMults[w.id] = mult;
      sumW += mult;
      if (mult < minW) minW = mult;
      if (mult > maxW) maxW = mult;
    }
    const avgW = Number((sumW / weathers.length).toFixed(2));

    // 2. Tools
    const profTools = allItems.filter(
      (it) => it.category === "herramienta" && it.profession === profId
    );

    let toolsCost = 0;
    let toolsBonus = 0;
    let toolsCooldown = 0;
    let toolsWeather = 0;
    let toolsBlooper = 0;
    let toolsHunger = 0;

    for (const t of profTools) {
      toolsCost += t.price;
      if (t.buff) {
        toolsBonus += t.buff.earningsBonusPercent || 0;
        toolsCooldown += t.buff.cooldownReductionSec || 0;
        toolsWeather += t.buff.weatherResistancePercent || 0;
        toolsBlooper += t.buff.blooperResistancePercent || 0;
        toolsHunger += t.buff.hungerReductionPercent || 0;
      }
    }

    // 3. Unique Items
    const uniqueItems = allItems.filter(
      (it) => it.uniqueProfessionItem && it.profession === profId
    );
    const uniqueBonus = uniqueItems.reduce((acc, it) => acc + (it.buff?.earningsBonusPercent || 0), 0);
    const uniqueCost = uniqueItems.reduce((acc, it) => acc + it.price, 0);

    // 4. HQ / Sede
    const hq = allItems.find(
      (it) => it.category === "negocio" && it.profession === profId
    );

    // 5. Education
    const edu = EDUCATION_CONFIG[profId];
    let courseCost = 0;
    let courseBonus = 0;
    let uniCost = 0;
    let uniBonus = 0;

    if (edu) {
      courseCost = edu.technicalCourse.cost;
      courseBonus = edu.technicalCourse.buff.earningsBonusPercent;
      uniCost = edu.universityDegree.stages.reduce((acc, s) => acc + s.cost, 0);
      uniBonus = edu.universityDegree.buff.earningsBonusPercent;
    }

    // Total theoretical max bonus percent:
    const totalBonusPct = toolsBonus + uniqueBonus + (hq?.buff?.earningsBonusPercent || 0) + courseBonus + uniBonus;
    const toolMult = 1.0 + totalBonusPct / 100;
    const maxMult = Number((maxW * 1.30 * toolMult).toFixed(2)); // With +30% buff and max weather
    const maxEarnings = Math.round(2000 * maxMult);

    results.push({
      id: profId,
      name: meta.name,
      category: meta.category,
      weatherStats: {
        min: minW,
        max: maxW,
        avg: avgW,
        weathers: weatherMults
      },
      tools: {
        count: profTools.length,
        totalCost: toolsCost,
        totalBonusPercent: toolsBonus,
        totalCooldownSec: toolsCooldown,
        totalWeatherResist: toolsWeather,
        totalBlooperResist: toolsBlooper,
        totalHungerReduct: toolsHunger,
      },
      uniqueItems: {
        count: uniqueItems.length,
        totalCost: uniqueCost,
        totalBonusPercent: uniqueBonus,
      },
      hq: hq ? {
        name: hq.name,
        price: hq.price,
        bonusPercent: hq.buff?.earningsBonusPercent || 0,
      } : undefined,
      education: {
        courseCost,
        courseBonus,
        uniCost,
        uniBonus
      },
      maxTotalMultiplier: maxMult,
      maxEarnings2000Base: maxEarnings
    });
  }

  console.log("\n==================== REPORTE DE AUDITORÍA Y PARIDAD ====================");
  console.table(results.map(r => ({
    Oficio: r.name,
    Herramientas: `${r.tools.count} (+$${r.tools.totalBonusPercent}%)`,
    "Costo Herr.": `$${r.tools.totalCost.toLocaleString()}`,
    "Items Únicos": `${r.uniqueItems.count} (+$${r.uniqueItems.totalBonusPercent}%)`,
    Sede: r.hq ? `+$${r.hq.bonusPercent}% ($${r.hq.price.toLocaleString()})` : "NO",
    "Universidad": `+$${r.education.courseBonus + r.education.uniBonus}% ($${(r.education.courseCost + r.education.uniCost).toLocaleString()})`,
    "Clima Avg": `${r.weatherStats.avg}x (${r.weatherStats.min}x - ${r.weatherStats.max}x)`,
    "Mult Max": `${r.maxTotalMultiplier}x`,
    "Cobro Max": `$${r.maxEarnings2000Base.toLocaleString()}`,
  })));
  console.log("========================================================================\n");
}

audit();
