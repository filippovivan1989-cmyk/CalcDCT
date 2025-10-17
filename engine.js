
export async function loadAll() {
  const price = await fetch('./price.json', {cache:'no-store'}).then(r=>r.json());
  return { PRICE: price };
}

function tInfo(PRICE, name){ return PRICE.tariffs.find(t=>t.name===name); }
function rCoef(PRICE, label){ const it = PRICE.retentions.find(r=>r.label===label); return it?it.coef:0; }
function overageMarkup(PRICE, tariffName){
  if (/лайм/i.test(tariffName)) return PRICE.overage_markup.lime||0;
  if (/манго/i.test(tariffName)) return PRICE.overage_markup.mango||0;
  return PRICE.overage_markup.papaya||0;
}
function pickPriceByTariff(srv, tariffName){
  if (/лайм/i.test(tariffName)) return srv.price_lm;
  if (/манго/i.test(tariffName)) return srv.price_mg;
  return srv.price_pap;
}

export function calcWidgetCost(PRICE, tariffName, widgets){
  const rules = PRICE.widgets_rules[tariffName] || {max:null, free:0};
  const pricing = PRICE.widgets_pricing[tariffName] || {widget_fee:0, sip_line_fee:0};
  const max = (rules.max==null ? Infinity : Math.max(0, rules.max));
  const free = Math.max(0, rules.free||0);
  const capped = Math.min(widgets||0, max);
  const payable = Math.max(0, capped - free);
  const unit = (pricing.widget_fee||0) + (pricing.sip_line_fee||0);
  const cost = payable * unit;
  return { max, free, capped, payable, unit, cost, widget_fee: pricing.widget_fee||0, sip_line_fee: pricing.sip_line_fee||0 };
}

export function calcTrafficCost(PRICE, {tariff, retention, traffic}){
  const t = tInfo(PRICE, tariff);
  const pricePerSession = rCoef(PRICE, retention);
  const packageRub = t.mgp_rub || 0;
  const rawTrafficRub = (traffic||0) * (pricePerSession||0);

  const extraRub = Math.max(0, rawTrafficRub - packageRub);
  const markup = overageMarkup(PRICE, tariff);
  const extraWithMarkup = extraRub * (1 + markup);
  const totalTrafficRub = packageRub + extraWithMarkup;

  return { pricePerSession, packageRub, rawTrafficRub, extraRub, markup, extraWithMarkup, totalTrafficRub };
}

export function calcEmailOverage(PRICE, tariffName, emailTraffic){
  const pkgMap = PRICE.email_tracking?.included_by_tariff || {};
  const bands = PRICE.email_tracking?.bands || [];
  const incl = pkgMap[tariffName] ?? 0;
  const total = emailTraffic || 0;
  if (total <= incl) return { included: incl, overage: 0, cost: 0, breakdown: [] };

  let remaining = total - incl;
  let cost = 0;
  const breakdown = [];
  for (const b of bands){
    const low = Math.max(incl, b.low ?? 0);
    const high = (b.high == null) ? Infinity : b.high;
    if (total <= low) continue;
    const span = Math.min(total, high) - low;
    if (span <= 0) continue;
    const take = Math.min(remaining, span);
    const partCost = take * (b.rate || 0);
    breakdown.push({ from: low, to: low + take, qty: take, rate: b.rate, cost: partCost });
    cost += partCost;
    remaining -= take;
    if (remaining <= 0) break;
  }
  return { included: incl, overage: total - incl, cost, breakdown };
}

export function calcTotal(PRICE, inputs){
  const t = tInfo(PRICE, inputs.tariff);
  const traffic = calcTrafficCost(PRICE, inputs);
  const widgets = calcWidgetCost(PRICE, inputs.tariff, inputs.widgets||1);

  let addons = 0;
  const selected = inputs.services_selected || {};
  for (const srv of PRICE.services){
    if (!selected[srv.name]) continue;
    const p = pickPriceByTariff(srv, inputs.tariff);
    if (p==null) continue;
    addons += p;
  }

  let emailCost = 0, emailDetails = null;
  if (selected['Emailtracking']) {
    const e = calcEmailOverage(PRICE, inputs.tariff, inputs.email_traffic||0);
    emailCost = e.cost; emailDetails = e;
  }

  const addonsTotal = addons + emailCost + widgets.cost;
  const monthlyFlat = t.monthly_flat || 0;
  const total = monthlyFlat + traffic.totalTrafficRub + addonsTotal;

  return { monthlyFlat, traffic, widgets, addonsTotal, total, emailDetails };
}
