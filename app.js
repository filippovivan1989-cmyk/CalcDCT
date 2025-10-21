
import { loadAll, calcTotal } from './engine.js';

const money = n => new Intl.NumberFormat('ru-RU', {maximumFractionDigits:0}).format(Math.round(n)) + " ₽";

let PRICE=null;
let state = {
  tariff: "Лайм",
  retention: "30 минут",
  traffic: 6000,
  widgets: 1,
  email_traffic: 6000,
  user_choices: {},
  metric_events: 0,
  static_numbers: { msk495:0, msk499:0, spb:0, reg:0 }
};

function q(id){ return document.getElementById(id); }

function setupToggle(toggleId, targetId){
  const toggleEl = q(toggleId);
  const targetEl = q(targetId);
  if (!toggleEl || !targetEl) return;

  const update = expanded => {
    toggleEl.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    targetEl.classList.toggle('is-hidden', !expanded);
  };

  update(!targetEl.classList.contains('is-hidden'));

  toggleEl.addEventListener('click', ()=>{
    const expanded = toggleEl.getAttribute('aria-expanded') === 'true';
    update(!expanded);
  });
}

function buildRetentions(){
  const sel = q('retention'); sel.innerHTML="";
  PRICE.retentions.forEach(r=>{
    const o=document.createElement('option'); o.value=r.label; o.textContent=r.label;
    if (r.label==="30 минут") o.selected = true;
    sel.appendChild(o);
  });
}

function widgetsMaxForTariff(tariff){
  const rules = PRICE.widgets_rules[tariff] || {max:3, free:1};
  if (rules.max==null) return 50;
  return Math.max(1, rules.max);
}

function buildWidgetsOptions(){
  const sel = q('widgets'); sel.innerHTML="";
  const rules = PRICE.widgets_rules[state.tariff] || {max:3, free:1};
  const max = widgetsMaxForTariff(state.tariff);
  for(let i=1;i<=max;i++){
    const o=document.createElement('option'); o.value=String(i);
    o.textContent = i + (i<= (rules.free||0) ? " (бесплатно)" : "");
    sel.appendChild(o);
  }
  q('widgets-hint').textContent =
    (state.tariff==="Папайя" ? "На Папайя: без ограничений, 10 бесплатно."
     : state.tariff==="Манго" ? "На Манго: максимум 10, 1 бесплатно."
     : "На Лайм: максимум 3, 1 бесплатно.");
  sel.value = String(Math.min(state.widgets, max));
}

function perTariffPrice(srv, tariff){
  if (/лайм/i.test(tariff)) return srv.price_lm;
  if (/манго/i.test(tariff)) return srv.price_mg;
  return srv.price_pap;
}

function currentSelections(){
  const selections = {};
  for (const srv of PRICE.services){
    const p = perTariffPrice(srv, state.tariff);
    const available = (p !== null && p !== undefined);
    const included = available && p === 0;
    if (included) selections[srv.name] = true;
    else if (!available) selections[srv.name] = false;
    else selections[srv.name] = !!state.user_choices[srv.name];
  }
  return selections;
}

function buildAddons(){
  const box = q('addons'); box.innerHTML="";
  for (const srv of PRICE.services){
    const p = perTariffPrice(srv, state.tariff);
    const available = (p !== null && p !== undefined);
    const included = available && p === 0;
    const optional = available && p > 0;

    const row = document.createElement('div');
    row.className = "addon" + (available ? "" : " disabled");

    const top = document.createElement('div');
    top.className = 'addon-row';
    const left = document.createElement('div');
    left.className = "left";
    const cb = document.createElement('input');
    cb.type = "checkbox";
    cb.checked = included || (!!state.user_choices[srv.name]);
    cb.disabled = included || (!available);
    cb.addEventListener('change', ()=>{
      if (optional){ state.user_choices[srv.name] = cb.checked; renderTotals(); renderCompare(); }
      if (srv.name==='Расширенная Я.Метрика'){ sub.classList.toggle('is-visible', cb.checked); }
    });
    const label = document.createElement('label'); label.textContent = srv.name;

    const tags = document.createElement('div');
    if (included){ const b=document.createElement('span'); b.className="badge green"; b.textContent="включено"; tags.appendChild(b); }
    else if (!available){ const b=document.createElement('span'); b.className="badge gray"; b.textContent="недоступно"; tags.appendChild(b); }
    else { const b=document.createElement('span'); b.className="badge orange"; b.textContent="опция"; tags.appendChild(b); }

    left.appendChild(cb); left.appendChild(label);
    top.appendChild(left); top.appendChild(tags);
    row.appendChild(top);

    let sub = document.createElement('div');
    if (srv.name === 'Расширенная Я.Метрика' && available){
      sub.className = 'subfield';
      const lbl = document.createElement('label'); lbl.className='lbl'; lbl.textContent='Событий в месяц';
      const inp = document.createElement('input'); inp.type='number'; inp.min='0'; inp.step='100'; inp.value=String(state.metric_events||0); inp.className='mini';
      inp.addEventListener('input', ()=>{ state.metric_events = +inp.value || 0; renderTotals(); renderCompare(); });
      sub.appendChild(lbl); sub.appendChild(inp);
      row.appendChild(sub);
      sub.classList.toggle('is-visible', cb.checked);
    }

    box.appendChild(row);
  }
}

function bindBasics(){
  document.querySelectorAll('.tariff-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('.tariff-btn').forEach(b=>b.classList.remove('is-active'));
      btn.classList.add('is-active');
      state.tariff = btn.dataset.tariff;
      buildWidgetsOptions();
      buildAddons();
      renderTotals();
      renderCompare();
    });
  });

  q('widgets').addEventListener('change', ()=>{ state.widgets = +q('widgets').value; renderTotals(); renderCompare(); });
  q('retention').addEventListener('change', ()=>{ state.retention = q('retention').value; renderTotals(); renderCompare(); });
  q('traffic').addEventListener('input', ()=>{ state.traffic = +q('traffic').value || 0; state.email_traffic = state.traffic; renderTotals(); renderCompare(); });
  q('toggle-compare').addEventListener('change', ()=>{ q('compare-grid').style.display = q('toggle-compare').checked ? "grid" : "none"; });

  // Static numbers
  setupToggle('static-toggle', 'static-box');
  ['sn-495','sn-499','sn-spb','sn-reg'].forEach(id=>{
    q(id).addEventListener('input', ()=>{
      state.static_numbers = {
        msk495: +q('sn-495').value || 0,
        msk499: +q('sn-499').value || 0,
        spb: +q('sn-spb').value || 0,
        reg: +q('sn-reg').value || 0
      };
      renderTotals(); renderCompare();
    });
  });
}

function requiredServicesOnCurrentTariff(){
  const req = new Set();
  for (const srv of PRICE.services){
    const p = perTariffPrice(srv, state.tariff);
    const available = (p !== null && p !== undefined);
    const included = available && p === 0;
    if (included) req.add(srv.name);
    else if (available && p > 0 && state.user_choices[srv.name]) req.add(srv.name);
  }
  return req;
}

function renderTotals(){
  const selections = currentSelections();
  const inputs = {
    tariff: state.tariff,
    retention: state.retention,
    traffic: state.traffic,
    widgets: state.widgets,
    email_traffic: state.email_traffic,
    services_selected: selections,
    metric_events: state.metric_events,
    static_numbers: state.static_numbers
  };
  const r = calcTotal(PRICE, inputs);
  q('v-flat').textContent = money(r.monthlyFlat);
  q('v-mgp').textContent = money(r.traffic.packageRub);
  q('v-over').textContent = money(r.traffic.extraWithMarkup);
  q('v-surcharge').textContent = money(0);
  q('v-widgets').textContent = money(r.widgets.cost) + (r.widgets.payable ? (' (' + r.widgets.payable + ' × ' + money(r.widgets.unit) + ')') : '');
  const otherAddons = r.addonsTotal - r.widgets.cost - r.staticNumbers.cost;
  q('v-addons').textContent = money(otherAddons);
  const list = q('v-addons-list'); list.innerHTML = "";
  r.addonsList.forEach(it=>{ const div = document.createElement('div'); div.textContent = '• ' + it.name + ' — ' + money(it.price); list.appendChild(div); });
  const staticQty = Object.values(r.staticNumbers.qty || {}).reduce((acc, val)=> acc + (val||0), 0);
  const staticRow = staticQty > 0 || r.staticNumbers.cost > 0
    ? `${staticQty} шт — ${money(r.staticNumbers.cost)}`
    : '0 шт — 0 ₽';
  q('v-static').textContent = staticRow;
  const summaryEl = q('static-summary');
  if (summaryEl) summaryEl.textContent = `${staticQty} шт`;
  q('v-total').textContent = money(r.total);

  const box = document.getElementById('email-breakdown'); const el = document.getElementById('email-list'); el.innerHTML = "";
  if (selections['Emailtracking'] && r.emailDetails && r.emailDetails.breakdown.length){
    box.classList.remove('is-hidden');
    r.emailDetails.breakdown.forEach(part=>{
      const li = document.createElement('li');
      li.textContent = part.from.toLocaleString('ru-RU') + '–' + part.to.toLocaleString('ru-RU') + ' × ' + part.rate.toFixed(2) + ' ₽ = ' + money(part.cost);
      el.appendChild(li);
    });
  } else { box.classList.add('is-hidden'); }
}

function renderCompare(){
  const tariffs = PRICE.tariffs.map(t=>t.name);
  const required = requiredServicesOnCurrentTariff();
  tariffs.forEach(t=>{
    const el = document.querySelector('.t-card[data-tariff="' + t + '"]');
    if (!el) return;

    let ok = true;
    for (const name of required){
      const srv = PRICE.services.find(s=>s.name===name);
      if (!srv) continue;
      const p = (/лайм/i.test(t) ? srv.price_lm : /манго/i.test(t) ? srv.price_mg : srv.price_pap);
      if (p===null || p===undefined){ ok = false; break; }
    }
    const max = (PRICE.widgets_rules[t] && PRICE.widgets_rules[t].max==null) ? Infinity : (PRICE.widgets_rules[t] ? PRICE.widgets_rules[t].max : 3);
    if (!(max===Infinity || state.widgets <= max)) ok = false;

    el.style.display = ok ? "block" : "none";
    el.querySelector('.t-badge').classList.toggle('is-hidden', ok);
    if (!ok) return;

    const selections_t = {};
    for (const srv of PRICE.services){
      const p = (/лайм/i.test(t) ? srv.price_lm : /манго/i.test(t) ? srv.price_mg : srv.price_pap);
      if (p===0) selections_t[srv.name] = true;
      else if (p==null) selections_t[srv.name] = false;
      else selections_t[srv.name] = !!state.user_choices[srv.name];
    }

    const inputs = {
      tariff: t,
      retention: state.retention,
      traffic: state.traffic,
      widgets: state.widgets,
      email_traffic: state.email_traffic,
      services_selected: selections_t,
      metric_events: state.metric_events,
      static_numbers: state.static_numbers
    };
    const r = calcTotal(PRICE, inputs);
    q('c-' + t).textContent = money(r.total);
    q('c-' + t + '-traffic').textContent = state.traffic.toLocaleString('ru-RU');
    const wr = PRICE.widgets_rules[t];
    const widgetsLabel = (wr && wr.max==null) ? "без ограничений" : (state.widgets + " из " + (wr ? wr.max : 0));
    q('c-' + t + '-widgets').textContent = widgetsLabel;
  });
}

async function main(){
  const all = await loadAll(); PRICE = all.PRICE;
  buildRetentions();
  buildWidgetsOptions();
  buildAddons();
  bindBasics();
  renderTotals();
  renderCompare();
}

main();
