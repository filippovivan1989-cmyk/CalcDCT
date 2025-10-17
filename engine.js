
export async function loadAll() {
  const [price, conf] = await Promise.all([
    fetch('./price.json', {cache:'no-store'}).then(r=>r.json()),
    fetch('./config.json', {cache:'no-store'}).then(r=>r.json())
  ]);
  return { PRICE: price, CFG: conf };
}

function tInfo(PRICE, name){ return PRICE.tariffs.find(t=>t.name===name); }
function rCoef(PRICE, label){ const it = PRICE.retentions.find(r=>r.label===label); return it?it.coef:0; }
function priceFor(PRICE, tariffName, srv){
  const isPapaya = /папай/i.test(tariffName);
  return isPapaya ? srv.price_pap : srv.price_lm;
}
function overageMarkup(PRICE, tariffName){
  if (/лайм/i.test(tariffName)) return PRICE.overage_markup.lime||0;
  if (/манго/i.test(tariffName)) return PRICE.overage_markup.mango||0;
  return PRICE.overage_markup.papaya||0;
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

export function calcTotal(PRICE, inputs){
  const t = tInfo(PRICE, inputs.tariff);
  const traffic = calcTrafficCost(PRICE, inputs);

  const widgets = inputs.widgets || 1;
  const srvSIP = PRICE.services.find(s=>/SIP-линия под виджет/i.test(s.name));
  const srvPAY = PRICE.services.find(s=>/Плата за виджет/i.test(s.name));
  const priceSIP_LM = srvSIP ? (srvSIP.price_lm||0) : 0;
  const pricePAY_LM = srvPAY ? (srvPAY.price_lm||0) : 0;
  const pricePAY_P  = srvPAY ? (srvPAY.price_pap||0) : 0;
  const isPapaya = /папай/i.test(inputs.tariff);

  const I14 = isPapaya ? 0 : Math.max(0, widgets-1) * priceSIP_LM;
  const I15 = isPapaya ? Math.max(0, widgets-1) * pricePAY_P
                       : Math.max(0, widgets-1) * pricePAY_LM;

  let addons = 0;
  const selected = inputs.services_selected || {};
  for (const srv of PRICE.services){
    const sel = !!selected[srv.name];
    if (!sel) continue;
    if (/SIP-линия под виджет/i.test(srv.name)) continue;
    if (/Плата за виджет/i.test(srv.name)) continue;
    const p = priceFor(PRICE, inputs.tariff, srv);
    if (p==null) continue;
    addons += p;
  }

  const addonsTotal = addons + I14 + I15;
  const monthlyFlat = t.monthly_flat || 0;
  const total = monthlyFlat + traffic.totalTrafficRub + addonsTotal;
  return { monthlyFlat, traffic, addonsTotal, total };
}
