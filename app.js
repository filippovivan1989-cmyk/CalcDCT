
import { loadAll, calcTotal, calcEmailOverage } from './engine.js';

const money = n => new Intl.NumberFormat('ru-RU', {maximumFractionDigits:0}).format(Math.round(n)) + " ₽";

let PRICE=null;
let state = {
  tariff: "Лайм",
  retention: "30 минут",
  traffic: 6000,
  widgets: 1,
  services_selected: {},
  email_traffic: 6000
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
  if (rules.max==null) return 50; // UX предел для "без ограничений"
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

function buildAddons(){
  const box = q('addons'); box.innerHTML="";
  // keep previous selections
  const prevSel = {...state.services_selected};
  state.services_selected = {};

  for (const srv of PRICE.services){
    const p = perTariffPrice(srv, state.tariff);
    const available = (p !== null && p !== undefined);
    const included = available && p === 0;

    const row = document.createElement('div');
    row.className = "addon" + (available ? "" : " disabled");

    const left = document.createElement('div');
    left.className = "left";
    const cb = document.createElement('input');
    cb.type = "checkbox";
    cb.checked = included || !!prevSel[srv.name];
    cb.disabled = included || !available;
    cb.addEventListener('change', ()=>{
      state.services_selected[srv.name] = cb.checked;
      renderTotals();
      renderCompare();
    });
    const label = document.createElement('label');
    label.textContent = srv.name;

    const tags = document.createElement('div');
    if (included){
      const b=document.createElement('span'); b.className="badge green"; b.textContent="включено"; tags.appendChild(b);
      state.services_selected[srv.name] = true;
    } else if (!available){
      const b=document.createElement('span'); b.className="badge gray"; b.textContent="недоступно"; tags.appendChild(b);
      state.services_selected[srv.name] = false;
    } else {
      const b=document.createElement('span'); b.className="badge orange"; b.textContent="опция"; tags.appendChild(b);
      state.services_selected[srv.name] = !!prevSel[srv.name];
    }

    left.appendChild(cb); left.appendChild(label);
    row.appendChild(left); row.appendChild(tags);
    box.appendChild(row);
  }
}

function bindBasics(){
  // Tariff buttons
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
    state.email_traffic = state.traffic; // по ТЗ
    renderTotals(); renderCompare();
  });

  q('toggle-compare').addEventListener('change', ()=>{
    q('compare-grid').style.display = q('toggle-compare').checked ? "grid" : "none";
  });
}

function emailBreakdownUI(details){
  const box = document.getElementById('email-breakdown');
  const list = document.getElementById('email-list');
  if (!details || !details.breakdown || details.breakdown.length===0){
    box.classList.add('is-hidden');
    return;
  }
  box.classList.remove('is-hidden');
  list.innerHTML = "";
  for (const part of details.breakdown){
    const li = document.createElement('li');
    const rng = `${part.from.toLocaleString('ru-RU')}–${part.to.toLocaleString('ru-RU')}`;
    li.textContent = `${rng} × ${part.rate.toFixed(2)} ₽ = ${money(part.cost)}`;
    list.appendChild(li);
  }
}

function renderTotals(){
  const inputs = {
    tariff: state.tariff,
    retention: state.retention,
    traffic: state.traffic,
    widgets: state.widgets,
    email_traffic: state.email_traffic,
    services_selected: state.services_selected
  };
  const r = calcTotal(PRICE, inputs);
  document.getElementById('v-flat').textContent = money(r.monthlyFlat);
  document.getElementById('v-mgp').textContent = money(r.traffic.packageRub);
  document.getElementById('v-over').textContent = money(r.traffic.extraWithMarkup);
  document.getElementById('v-surcharge').textContent = money(0); // уже учтено в extraWithMarkup
  document.getElementById('v-addons').textContent = money(r.addonsTotal);
  document.getElementById('v-total').textContent = money(r.total);
  emailBreakdownUI(r.emailDetails);
}

function renderCompare(){
  const tariffs = PRICE.tariffs.map(t=>t.name);
  for (const t of tariffs){
    // Проверка доступности всех выбранных услуг на тарифе t
    let allAvailable = true;
    for (const [srvName, sel] of Object.entries(state.services_selected)){
      if (!sel) continue;
      const srv = PRICE.services.find(s=>s.name===srvName);
      if (!srv) continue;
      const p = ( /лайм/i.test(t) ? srv.price_lm : /манго/i.test(t) ? srv.price_mg : srv.price_pap );
      if (p===null || p===undefined){
        allAvailable = false; break;
      }
    }
    const widgetsMax = PRICE.widgets_rules[t]?.max==null ? Infinity : PRICE.widgets_rules[t].max;
    const widgetsOk = (widgetsMax===Infinity) ? true : state.widgets <= widgetsMax;
    if (!widgetsOk) allAvailable = false;

    const el = document.querySelector(`.t-card[data-tariff="${t}"]`);
    if (!el) continue;

    if (!allAvailable){
      el.classList.add('blurred');
      el.querySelector('.t-badge').classList.remove('is-hidden');
      el.style.display = "none"; // «показываем только доступные»
      continue;
    } else {
      el.classList.remove('blurred');
      el.querySelector('.t-badge').classList.add('is-hidden');
      el.style.display = "";
    }

    // Считаем тот же набор параметров, но на другом тарифе
    const inputs = {
      tariff: t,
      retention: state.retention,
      traffic: state.traffic,
      widgets: Math.min(state.widgets, widgetsMaxForTariff(t)),
      email_traffic: state.email_traffic,
      // услуги: если на тарифе включена (0) — считаем как выбранную; если доступна (>0) и юзер выбрал — тоже true
      services_selected: {}
    };

    for (const srv of PRICE.services){
      const p = ( /лайм/i.test(t) ? srv.price_lm : /манго/i.test(t) ? srv.price_mg : srv.price_pap );
      if (p===0) inputs.services_selected[srv.name] = true;
      else if (p==null) inputs.services_selected[srv.name] = false;
      else inputs.services_selected[srv.name] = !!state.services_selected[srv.name];
    }

    const r = calcTotal(PRICE, inputs);
    document.getElementById(`c-${t}`).textContent = money(r.total);
    document.getElementById(`c-${t}-traffic`).textContent = state.traffic.toLocaleString('ru-RU');
    const wr = PRICE.widgets_rules[t];
    const widgetsLabel = wr?.max==null ? "без ограничений" : `${Math.min(state.widgets, wr.max)} из ${wr.max}`;
    document.getElementById(`c-${t}-widgets`).textContent = widgetsLabel;
  }
}

async function main(){
  const all = await loadAll(); PRICE = all.PRICE;
  // Build retention options
  buildRetentions();
  // Initialize widgets options
  buildWidgetsOptions();
  // Build addons
  buildAddons();
  // Bind basic events
  bindBasics();
  // Initial render
  renderTotals();
  renderCompare();
}

main();
