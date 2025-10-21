
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
export function calcWidgetCost(PRICE, tariffName, widgets, overrides = {}){
  const rules = PRICE.widgets_rules[tariffName] || {max:null, free:0};
  const pricing = PRICE.widgets_pricing[tariffName] || {widget_fee:0, sip_line_fee:0};
  const max = (rules.max==null ? Infinity : Math.max(0, rules.max));
  const requested = widgets||0;
  const capped = Math.min(requested, max);
  const freeWidgets = Math.max(0, Math.min(capped, rules.free||0));
  const payableWidgets = Math.max(0, capped - freeWidgets);
  const widgetFee = pricing.widget_fee || 0;
  const widgetCost = payableWidgets * widgetFee;

  const sipIncludedOverride = overrides.sipIncluded;
  const sipFeeOverride = overrides.sipFee;
  const sipFee = (sipFeeOverride != null) ? sipFeeOverride : (pricing.sip_line_fee || 0);
  const sipIncluded = (sipIncludedOverride != null) ? Math.max(0, sipIncludedOverride) : freeWidgets;
  const sipPayable = Math.max(0, capped - sipIncluded);
  const sipCost = sipPayable * sipFee;

  const cost = widgetCost + sipCost;
  return {
    max,
    free: freeWidgets,
    capped,
    payable: payableWidgets,
    widget_fee: widgetFee,
    sip_line_fee: sipFee,
    widgetCost,
    sipIncluded,
    sipPayable,
    sipCost,
    cost
  };
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
  let remaining = total - incl, cost = 0; const breakdown = [];
  for (const b of bands){
    const low = Math.max(incl, b.low ?? 0);
    const high = (b.high == null) ? Infinity : b.high;
    if (total <= low) continue;
    const span = Math.min(total, high) - low;
    if (span <= 0) continue;
    const take = Math.min(remaining, span);
    const partCost = take * (b.rate || 0);
    breakdown.push({ from: low, to: low + take, qty: take, rate: b.rate, cost: partCost });
    cost += partCost; remaining -= take;
    if (remaining <= 0) break;
  }
  return { included: incl, overage: total - incl, cost, breakdown };
}
export function calcStaticNumbersCost(inputs, PRICE){
  const rates = (PRICE.static_numbers && PRICE.static_numbers.rates) ? PRICE.static_numbers.rates : { msk495:300, msk499:200, spb:300, reg:200 };
  const qty = inputs.static_numbers || {};
  const cost = (qty.msk495||0)*rates.msk495 + (qty.msk499||0)*rates.msk499 + (qty.spb||0)*rates.spb + (qty.reg||0)*rates.reg;
  return { cost, rates, qty };
}
export function calcTotal(PRICE, inputs, options = {}){
  const t = tInfo(PRICE, inputs.tariff);
  const traffic = calcTrafficCost(PRICE, inputs);
  const widgetOverrides = options.widgetOverrides || {};
  const widgets = calcWidgetCost(PRICE, inputs.tariff, inputs.widgets||1, widgetOverrides);
  let addons = 0; const selected = inputs.services_selected || {}; const addonsList = [];
  for (const srv of PRICE.services){
    if (!selected[srv.name]) continue;
    const p = pickPriceByTariff(srv, inputs.tariff);
    if (p==null) continue;
    addons += p; addonsList.push({ name: srv.name, price: p });
    if (srv.name === 'Расширенная Я.Метрика'){
      const rate = srv.event_rate || 0; const ev = Math.max(0, inputs.metric_events||0);
      const extra = ev * rate; addons += extra; addonsList.push({ name: 'Метрика: события', price: extra });
    }
  }
  let emailCost = 0, emailDetails = null;
  if (selected['Emailtracking']) { const e = calcEmailOverage(PRICE, inputs.tariff, inputs.email_traffic||0); emailCost = e.cost; emailDetails = e; if (emailCost>0) addonsList.push({ name: 'EmailTracking: сверх пакета', price: emailCost }); }
  const stat = calcStaticNumbersCost(inputs, PRICE);
  const addonsCost = addons + emailCost;
  const monthlyFlat = t.monthly_flat || 0;
  const vatCharges = options.vatCharges || { monthly:0, api:0 };
  const total = monthlyFlat + (vatCharges.monthly||0) + (vatCharges.api||0) + traffic.totalTrafficRub + widgets.cost + stat.cost + addonsCost;
  return {
    monthlyFlat,
    traffic,
    widgets,
    addonsCost,
    addonsList,
    staticNumbers: stat,
    emailDetails,
    emailCost,
    servicesCost: addons,
    vatCharges,
    total
  };
}
