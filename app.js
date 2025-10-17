
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
  metric_events: 0
};

function q(id){ return document.getElementById(id); }

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

    const left = document.createElement('div');
    left.className = "left";
    const cb = document.createElement('input');
    cb.type = "checkbox";
    cb.checked = included || (!!state.user_choices[srv.name]);
    cb.disabled = included || (!available);
    cb.addEventListener('change', ()=>{
      if (optional){
        state.user_choices[srv.name] = cb.checked;
        renderTotals(); renderCompare();
      }
    });
    const label = document.createElement('label'); label.textContent = srv.name;

    const tags = document.createElement('div');
    if (included){
      const b=document.createElement('span'); b.className="badge green"; b.textContent="включено"; tags.appendChild(b);
    } else if (!available){
      const b=document.createElement('span'); b.className="badge gray"; b.textContent="недоступно"; tags.appendChild(b);
    } else {
      const b=document.createElement('span'); b.className="badge orange"; b.textContent="опция"; tags.appendChild(b);
    }

    left.appendChild(cb); left.appendChild(label);
    row.appendChild(left); row.appendChild(tags);
    
    // Sub-control for Расширенная Я.Метрика
    if (srv.name === 'Расширенная Я.Метрика' && available){
      const sub = document.createElement('div');
      sub.className = 'subfield';
      const lbl = document.createElement('label'); lbl.className='lbl'; lbl.textContent='Событий в месяц';
      const inp = document.createElement('input'); inp.type='number'; inp.min='0'; inp.step='100'; inp.value=String(state.metric_events||0); inp.className='mini';
      inp.addEventListener('input', ()=>{ state.metric_events = +inp.value || 0; renderTotals(); renderCompare(); });
      sub.appendChild(lbl); sub.appendChild(inp);
      row.appendChild(sub);
      const syncVis = ()=>{ sub.classList.toggle('is-visible', cb.checked && !cb.disabled); };
      syncVis();
      cb.addEventListener('change', syncVis);
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

  q('widgets').addEventListener('change', ()=>{
    state.widgets = +q('widgets').value;
    renderTotals(); renderCompare();
  });

  q('retention').addEventListener('change', ()=>{
    state.retention = q('retention').value;
    renderTotals(); renderCompare();
  });

  q('traffic').addEventListener('input', ()=>{
    state.traffic = +q('traffic').value || 0;
    state.email_traffic = state.traffic;
    renderTotals(); renderCompare();
  });

  q('toggle-compare').addEventListener('change', ()=>{
    q('compare-grid').style.display = q('toggle-compare').checked ? "grid" : "none";
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
    metric_events: state.metric_events
  };
  const r = calcTotal(PRICE, inputs);
  q('v-flat').textContent = money(r.monthlyFlat);
  q('v-mgp').textContent = money(r.traffic.packageRub);
  q('v-over').textContent = money(r.traffic.extraWithMarkup);
  q('v-surcharge').textContent = money(0);
  // widgets detail: payable × (widget_fee + sip_line_fee) = cost
  const unitStr = (r.widgets.widget_fee + r.widgets.sip_line_fee) ? (' (' + r.widgets.payable + ' × ' + money(r.widgets.unit) + ')') : '';
  q('v-widgets').textContent = money(r.widgets.cost) + (r.widgets.payable ? unitStr : '');
  // other addons (excluding widgets)
  const otherAddons = r.addonsTotal - r.widgets.cost;
  q('v-addons').textContent = money(otherAddons);
  q('v-total').textContent = money(r.total);

  const box = q('email-breakdown'); const list = q('email-list'); list.innerHTML = "";
  if (selections['Emailtracking'] && r.emailDetails && r.emailDetails.breakdown.length){
    box.classList.remove('is-hidden');
    for (const part of r.emailDetails.breakdown){
      const rng = part.from.toLocaleString('ru-RU') + "–" + part.to.toLocaleString('ru-RU');
      const li = document.createElement('li');
      li.textContent = rng + " × " + part.rate.toFixed(2) + " ₽ = " + money(part.cost);
      list.appendChild(li);
    }
  } else {
    box.classList.add('is-hidden');
  }
}

function renderCompare(){
  const tariffs = PRICE.tariffs.map(t=>t.name);
  const required = requiredServicesOnCurrentTariff();
  for (const t of tariffs){
    const el = document.querySelector('.t-card[data-tariff="' + t + '"]');
    if (!el) continue;

    let ok = true;
    for (const name of required){
      const srv = PRICE.services.find(s=>s.name===name);
      if (!srv) continue;
      const p = (/лайм/i.test(t) ? srv.price_lm : /манго/i.test(t) ? srv.price_mg : srv.price_pap);
      if (p===null || p===undefined){ ok = false; break; }
    }
    const max = (PRICE.widgets_rules[t] && PRICE.widgets_rules[t].max==null) ? Infinity : (PRICE.widgets_rules[t] ? PRICE.widgets_rules[t].max : 3);
    if (!(max===Infinity || state.widgets <= max)) ok = false;

    if (!ok){
      el.classList.add('blurred');
      el.querySelector('.t-badge').classList.remove('is-hidden');
      el.style.display = "none";
      continue;
    } else {
      el.classList.remove('blurred');
      el.querySelector('.t-badge').classList.add('is-hidden');
      el.style.display = "";
    }

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
      services_selected: selections,
    metric_events: state.metric_events_t
    };
    const r = calcTotal(PRICE, inputs);
    q('c-' + t).textContent = money(r.total);
    q('c-' + t + '-traffic').textContent = state.traffic.toLocaleString('ru-RU');
    const wr = PRICE.widgets_rules[t];
    const widgetsLabel = (wr && wr.max==null) ? "без ограничений" : (state.widgets + " из " + (wr ? wr.max : 0));
    q('c-' + t + '-widgets').textContent = widgetsLabel;
  }
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
