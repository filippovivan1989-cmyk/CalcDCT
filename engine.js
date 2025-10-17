
// engine.js — чистые функции расчёта, повторяющие Excel-логику через конфиг
export function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

export function computePool({ visitsMonth, convToCall, trackShare, avgTalkMin, kPeak, safetyFactor }) {
  const vpm = visitsMonth / (30 * 24 * 60);
  const callsPeakPerMin = vpm * kPeak * trackShare * convToCall;
  const pool = Math.ceil(callsPeakPerMin * avgTalkMin * safetyFactor);
  return { pool, callsPeakPerMin };
}

export function computeMonthAggregates({ visitsMonth, convToCall, trackShare, avgTalkMin }) {
  const callsMonth = visitsMonth * convToCall * trackShare;
  const minutesMonth = callsMonth * avgTalkMin;
  return { callsMonth, minutesMonth };
}

export function applyTariffPricing({ cfg, tariffName, pool, staticNumbers, minutesMonth, addons, cities }) {
  const tariff = cfg.tariffs[tariffName];
  if (!tariff) throw new Error(`Unknown tariff: ${tariffName}`);
  const coeff = tariff.coefficients || {};
  const avail = tariff.availability || {};
  const table = cfg.price_table;

  // базовые цены с коэффициентами тарифа
  const priceDyn = (table.dynamic_number.base) * (coeff.dynamic_numbers ?? 1);
  const priceStat = (table.static_number.base) * (coeff.static_numbers ?? 1);
  const pricePerMin = (table.per_minute.base) * (coeff.per_minute ?? 1);

  const dynamicCost = pool * priceDyn;
  const staticCost = staticNumbers * priceStat;
  const minutesCost = minutesMonth * pricePerMin;

  // аддоны, учитывая доступность
  let addonsCost = 0;
  const chosen = [];
  for (const [k,v] of Object.entries(addons || {})) {
    if (!v) continue;
    if (!avail[k]) continue; // не доступно на тарифе
    const rule = table.addons[k] || {};
    if (rule.per_min) addonsCost += rule.per_min * minutesMonth;
    if (rule.flat) addonsCost += rule.flat;
    if (rule.per_city) addonsCost += rule.per_city * Math.max(0, (cities||1)-1);
    chosen.push(k);
  }

  const monthlyFlat = tariff.monthly_flat || 0;
  const total = monthlyFlat + dynamicCost + staticCost + minutesCost + addonsCost;

  return {
    breakdown: {
      monthlyFlat, dynamicCost, staticCost, minutesCost, addonsCost,
      priceDyn, priceStat, pricePerMin, chosenAddons: chosen
    },
    total
  };
}

export function deriveStaticNumbers({ cities, staticExtra }) {
  return (cities || 1) + (staticExtra || 0);
}

export function estimateAll(cfg, inputs) {
  const safe = { ...cfg.defaults, ...(inputs || {}) };

  const poolRes = computePool({
    visitsMonth: safe.visits_month,
    convToCall: clamp(safe.conv_to_call, 0, 1),
    trackShare: clamp(safe.track_share, 0, 1),
    avgTalkMin: clamp(safe.avg_talk_time_min, 0.1, 60),
    kPeak: clamp(safe.k_peak, 1, 5),
    safetyFactor: clamp(safe.safety_factor, 1, 2)
  });

  const monthAgg = computeMonthAggregates({
    visitsMonth: safe.visits_month,
    convToCall: clamp(safe.conv_to_call, 0, 1),
    trackShare: clamp(safe.track_share, 0, 1),
    avgTalkMin: clamp(safe.avg_talk_time_min, 0.1, 60)
  });

  const staticNumbers = deriveStaticNumbers({ cities: safe.cities, staticExtra: safe.static_extra });

  const priceRes = applyTariffPricing({
    cfg,
    tariffName: safe.tariff,
    pool: poolRes.pool,
    staticNumbers,
    minutesMonth: monthAgg.minutesMonth,
    addons: safe.addons || {},
    cities: safe.cities
  });

  return {
    inputs: safe,
    pool: poolRes.pool,
    callsPeakPerMin: poolRes.callsPeakPerMin,
    callsMonth: monthAgg.callsMonth,
    minutesMonth: monthAgg.minutesMonth,
    staticNumbers,
    tariff: safe.tariff,
    price: priceRes.total,
    breakdown: priceRes.breakdown
  };
}
