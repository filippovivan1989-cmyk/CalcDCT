
import { loadAll, calcTotal } from './engine.js';

const money = n => new Intl.NumberFormat('ru-RU', {maximumFractionDigits:0}).format(Math.round(n)) + " ₽";
const OWN_NUMBERS_COEFFICIENT = 0.02;
const OWN_NUMBERS_K_MAP = Object.freeze({5: 0.6, 15: 1.0, 30: 1.5, 60: 2.3, 120: 3.4});

function formatNumber(value, fractionDigits = 0) {
  const opts = { maximumFractionDigits: fractionDigits, minimumFractionDigits: fractionDigits };
  if (fractionDigits === 0) {
    opts.maximumFractionDigits = 0;
    opts.minimumFractionDigits = 0;
  }
  return new Intl.NumberFormat('ru-RU', opts).format(value);
}

function pluralizeNumbers(n){
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'номер';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'номера';
  return 'номеров';
}

const VAT_OPTIONS = [
  { value: '', label: '— Не выбрано —', monthly: 0, sipIncluded: null, sipFee: null, maxNumbers: Infinity, apiCost: 0 },
  { value: 'basic-dct', label: 'Базовая для ДКТ', monthly: 1000, sipIncluded: 2, sipFee: 150, maxNumbers: 10, apiCost: 1000 },
  { value: 'basic', label: 'Базовая', monthly: 1200, sipIncluded: 0, sipFee: 150, maxNumbers: 3, apiCost: 1000 },
  { value: 'extended', label: 'Расширенная', monthly: 2500, sipIncluded: 0, sipFee: 150, maxNumbers: 15, apiCost: 3000 },
  { value: 'max', label: 'Максимальная', monthly: 3600, sipIncluded: 0, sipFee: 0, maxNumbers: Infinity, apiCost: 5500 }
];
const NEW_CLIENT_NUMBER_COST = 200;

let PRICE=null;
let state = {
  tariff: "Лайм",
  retention: "30 минут",
  traffic: 6000,
  widgets: 1,
  email_traffic: 6000,
  user_choices: {},
  metric_events: 0,
  static_numbers: { msk495:0, msk499:0, spb:0, reg:0 },
  vatsVersion: '',
  vatsApi: false,
  vatsNewClient: false,
  crmSaIntegration: false,
  ownNumbersTracking: false
};

const detailOpenState = {};
let addonsExpanded = false;

function q(id){ return document.getElementById(id); }

function setText(id, value){
  const el = q(id);
  if (el) el.textContent = value;
  return el;
}

function setupToggle(triggerId, boxId){
  const trigger = q(triggerId);
  const box = q(boxId);
  if (!trigger || !box) return;
  const applyState = ()=>{
    const expanded = !box.classList.contains('is-hidden');
    trigger.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  };
  const toggle = ()=>{
    box.classList.toggle('is-hidden');
    applyState();
  };
  trigger.addEventListener('click', toggle);
  trigger.addEventListener('keydown', evt=>{
    if (evt.key === 'Enter' || evt.key === ' '){
      evt.preventDefault();
      toggle();
    }
  });
  applyState();
}

function setAddonsOpen(open){
  addonsExpanded = !!open;
  const box = q('addons');
  if (box){
    if (addonsExpanded){ box.removeAttribute('hidden'); }
    else { box.setAttribute('hidden', ''); }
  }
  const toggle = q('addons-toggle');
  if (toggle){
    toggle.setAttribute('aria-expanded', addonsExpanded ? 'true' : 'false');
  }
}

function vatOptionByValue(value){
  return VAT_OPTIONS.find(opt => opt.value === value) || VAT_OPTIONS[0];
}

function currentVatOption(){
  return vatOptionByValue(state.vatsVersion);
}

function buildVatOptions(){
  const sel = q('vats');
  if (!sel) return;
  sel.innerHTML = '';
  VAT_OPTIONS.forEach(opt => {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    if (opt.value === state.vatsVersion) o.selected = true;
    sel.appendChild(o);
  });
}

function staticNumbersTotal(){
  return Object.values(state.static_numbers || {}).reduce((acc, val)=> acc + (val||0), 0);
}

function staticLimit(){
  const vat = currentVatOption();
  if (!vat || vat.maxNumbers == null) return Infinity;
  return vat.maxNumbers === Infinity ? Infinity : Math.max(0, vat.maxNumbers);
}

function updateStaticWarning(){
  const warn = q('static-warning');
  if (!warn) return;
  warn.classList.add('is-hidden');
  warn.classList.remove('warning');
  if (!state.vatsVersion) return;
  const limit = staticLimit();
  if (!isFinite(limit)) return;
  const total = staticNumbersTotal();
  if (total > limit){
    warn.textContent = `На выбранной ВАТС доступно ${limit} номеров. Сейчас выбрано ${total}.`;
    warn.classList.remove('is-hidden');
    warn.classList.add('warning');
  }
}

function retentionLabelToMinutes(label){
  if (!label) return null;
  const match = /([0-9]+)/.exec(label);
  return match ? parseInt(match[1], 10) : null;
}

function calculateNumbers(sessions_per_day, hold_time_minutes) {
  const k = OWN_NUMBERS_K_MAP[hold_time_minutes];
  if (!k) return null;

  let N = Math.ceil(sessions_per_day * OWN_NUMBERS_COEFFICIENT * k);
  if (N < 2) N = 2;
  return N;
}

function updateOwnNumbersHint(){
  const checkbox = q('own-numbers');
  const hint = q('own-numbers-hint');
  if (!checkbox || !hint) return;
  checkbox.checked = !!state.ownNumbersTracking;
  if (!state.ownNumbersTracking){
    hint.classList.add('is-hidden');
    return;
  }

  const holdMinutes = retentionLabelToMinutes(state.retention);
  if (!holdMinutes){
    hint.textContent = 'Выберите время закрепления номера, чтобы рассчитать количество номеров.';
    hint.classList.remove('is-hidden');
    return;
  }

  const sessionsPerDay = Math.max(0, state.traffic || 0) / 30;
  const k = OWN_NUMBERS_K_MAP[holdMinutes];
  if (!k){
    hint.textContent = 'Для выбранного времени закрепления нет коэффициента расчёта.';
    hint.classList.remove('is-hidden');
    return;
  }

  const numbers = calculateNumbers(sessionsPerDay, holdMinutes);
  if (!Number.isFinite(numbers) || numbers == null){
    hint.textContent = 'Не удалось рассчитать количество номеров для выбранных параметров.';
  } else {
    hint.textContent = `Рекомендуем использовать не менее ${numbers} номеров.`;
  }
  hint.classList.remove('is-hidden');
}

function updateVatHints(){
  const vat = currentVatOption();
  const selectHint = q('vats-hint');
  const vatNew = q('vats-new');
  const summary = q('vat-summary');
  if (selectHint){
    if (!state.vatsVersion){
      selectHint.textContent = 'Выберите версию ВАТС, чтобы учесть абонплату и ограничения по номерам.';
    } else {
      const limit = (vat.maxNumbers === Infinity) ? 'без ограничений' : `до ${vat.maxNumbers}`;
      const bundle = money((vat.monthly || 0) + NEW_CLIENT_NUMBER_COST);
      const prefix = state.vatsNewClient
        ? `Добавлено ${bundle} (ВАТС + номер).`
        : `Для новых клиентов добавится ${bundle}.`;
      selectHint.textContent = `Абонентская плата: ${money(vat.monthly)}. Доступно номеров: ${limit}. ${prefix}`;
    }
  }
  const apiInput = q('vats-api');
  const apiHint = q('vats-api-hint');
  const crmSa = q('crm-sa');
  const hasVat = !!state.vatsVersion;
  if (vatNew){
    vatNew.disabled = !hasVat;
    if (!hasVat){
      vatNew.checked = false;
      state.vatsNewClient = false;
    } else {
      vatNew.checked = state.vatsNewClient;
    }
  }
  if (apiInput){
    apiInput.disabled = !hasVat;
    if (!hasVat){
      apiInput.checked = false;
      state.vatsApi = false;
    }
  }
  if (crmSa){
    const allowCrmSa = hasVat && state.vatsApi;
    crmSa.disabled = !allowCrmSa;
    if (!allowCrmSa){
      crmSa.checked = false;
      state.crmSaIntegration = false;
    } else {
      crmSa.checked = state.crmSaIntegration;
    }
  }
  if (apiHint){
    if (!hasVat){
      apiHint.textContent = 'Сначала выберите версию ВАТС.';
    } else if (state.vatsApi){
      apiHint.textContent = `Добавлено ${money(vat.apiCost)} за интеграцию с CRM.`;
    } else {
      apiHint.textContent = `При активации добавит ${money(vat.apiCost)} за интеграцию с CRM.`;
    }
  }
  if (summary){
    if (!state.vatsVersion){
      summary.textContent = 'Не выбрана';
    } else {
      const parts = [];
      if (vat && vat.label) parts.push(vat.label);
      if (state.vatsApi) parts.push('CRM');
      if (state.crmSaIntegration) parts.push('CRM-СА');
      if (state.vatsNewClient) parts.push('новый клиент');
      summary.textContent = parts.join(', ') || 'Не выбрана';
    }
  }
  updateStaticWarning();
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

function widgetsMaxAcrossTariffs(){
  return PRICE.tariffs.reduce((acc, t)=> Math.max(acc, widgetsMaxForTariff(t.name)), 1);
}

function buildWidgetsOptions(){
  const sel = q('widgets'); sel.innerHTML="";
  const max = widgetsMaxAcrossTariffs();
  for(let i=1;i<=max;i++){
    const o=document.createElement('option'); o.value=String(i);
    o.textContent = String(i);
    sel.appendChild(o);
  }
  const widgetsHint = PRICE.tariffs.map(t=>{
    const rules = PRICE.widgets_rules[t.name] || {};
    const free = Math.max(0, rules.free||0);
    if (rules.max == null) return `${t.name}: без ограничений, ${free} бесплатно.`;
    return `${t.name}: максимум ${rules.max}, ${free} бесплатно.`;
  }).join(' ');
  q('widgets-hint').textContent = widgetsHint;
  sel.value = String(Math.min(state.widgets, max));
}

function perTariffPrice(srv, tariff){
  if (/лайм/i.test(tariff)) return srv.price_lm;
  if (/манго/i.test(tariff)) return srv.price_mg;
  return srv.price_pap;
}

function selectionsForTariff(tariff){
  const selections = {};
  for (const srv of PRICE.services){
    const p = perTariffPrice(srv, tariff);
    const available = (p !== null && p !== undefined);
    const included = available && p === 0;
    if (included) selections[srv.name] = true;
    else if (!available) selections[srv.name] = false;
    else selections[srv.name] = !!state.user_choices[srv.name];
  }
  return selections;
}

function currentSelections(){
  return selectionsForTariff(state.tariff);
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
  setAddonsOpen(addonsExpanded);
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

  const vatSelect = q('vats');
  if (vatSelect){
    vatSelect.addEventListener('change', ()=>{
      state.vatsVersion = vatSelect.value;
      updateVatHints();
      renderTotals();
      renderCompare();
    });
  }
  const vatNew = q('vats-new');
  if (vatNew){
    vatNew.addEventListener('change', ()=>{
      state.vatsNewClient = vatNew.checked;
      updateVatHints();
      renderTotals();
      renderCompare();
    });
  }
  const vatApi = q('vats-api');
  if (vatApi){
    vatApi.addEventListener('change', ()=>{
      state.vatsApi = vatApi.checked;
      updateVatHints();
      renderTotals();
      renderCompare();
    });
  }

  const crmSa = q('crm-sa');
  if (crmSa){
    crmSa.addEventListener('change', ()=>{
      state.crmSaIntegration = crmSa.checked;
      updateVatHints();
      renderCompare();
    });
  }

  const ownNumbers = q('own-numbers');
  if (ownNumbers){
    ownNumbers.addEventListener('change', ()=>{
      state.ownNumbersTracking = ownNumbers.checked;
      updateOwnNumbersHint();
    });
  }

  const addonsToggle = q('addons-toggle');
  if (addonsToggle){
    addonsToggle.addEventListener('click', ()=>{
      setAddonsOpen(!addonsExpanded);
    });
  }

  setupToggle('static-toggle', 'static-box');
  setupToggle('vat-toggle', 'vat-box');

  document.querySelectorAll('.t-details-toggle').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const card = btn.closest('.t-card');
      if (!card) return;
      const tariffName = card.dataset.tariff;
      if (!tariffName) return;
      const nextState = !detailOpenState[tariffName];
      if (PRICE && Array.isArray(PRICE.tariffs)){
        PRICE.tariffs.forEach(tariff => {
          detailOpenState[tariff.name] = nextState;
        });
      } else {
        detailOpenState[tariffName] = nextState;
      }
      renderCompare();
    });
  });

  // Static numbers
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

function totalsForTariff(tariff, selectionsOverride){
  const selections = selectionsOverride || selectionsForTariff(tariff);
  const vat = currentVatOption();
  const widgetOverrides = {};
  if (state.vatsVersion){
    if (vat.sipIncluded != null) widgetOverrides.sipIncluded = vat.sipIncluded;
    if (vat.sipFee != null) widgetOverrides.sipFee = vat.sipFee;
  }
  const vatCharges = {
    monthly: (state.vatsVersion && state.vatsNewClient) ? (vat.monthly || 0) : 0,
    api: (state.vatsVersion && state.vatsApi) ? (vat.apiCost || 0) : 0,
    newNumber: (state.vatsVersion && state.vatsNewClient) ? NEW_CLIENT_NUMBER_COST : 0
  };
  const inputs = {
    tariff,
    retention: state.retention,
    traffic: state.traffic,
    widgets: state.widgets,
    email_traffic: state.email_traffic,
    services_selected: selections,
    metric_events: state.metric_events,
    static_numbers: state.static_numbers
  };
  const totals = calcTotal(PRICE, inputs, { widgetOverrides, vatCharges });
  totals.vatOption = vat;
  totals.selections = selections;
  totals.isNewClient = !!state.vatsNewClient;
  return totals;
}

function breakdownForTotals(totals){
  const parts = [];
  parts.push({ label: 'Абонентская плата', amount: totals.monthlyFlat });
  if (totals.vatCharges && totals.vatCharges.monthly){
    const caption = totals.vatOption && totals.vatOption.label ? `ВАТС (${totals.vatOption.label})` : 'ВАТС';
    parts.push({ label: caption, amount: totals.vatCharges.monthly });
  }
  if (totals.vatCharges && totals.vatCharges.newNumber){
    parts.push({ label: 'Номер', amount: totals.vatCharges.newNumber });
  }
  if (totals.vatCharges && totals.vatCharges.api){
    parts.push({ label: 'Интеграция с CRM', amount: totals.vatCharges.api });
  }
  parts.push({ label: 'Трафик (пакет)', amount: totals.traffic.packageRub });
  parts.push({ label: 'Трафик сверх пакета', amount: totals.traffic.extraWithMarkup });
  if (totals.widgets.widgetCost > 0){
    parts.push({ label: 'Виджеты', amount: totals.widgets.widgetCost });
  }
  if (totals.widgets.sipCost > 0){
    parts.push({ label: 'SIP-линии', amount: totals.widgets.sipCost });
  }
  const staticQty = Object.values(totals.staticNumbers.qty || {}).reduce((acc, val)=> acc + (val||0), 0);
  if (totals.staticNumbers.cost > 0 && staticQty > 0){
    parts.push({ label: `Доп. номера (${staticQty} шт)`, amount: totals.staticNumbers.cost });
  }
  parts.push({ label: 'Доп. услуги', amount: totals.addonsCost, list: totals.addonsList });
  parts.push({ label: 'Итого', amount: totals.total, isTotal: true });
  return parts;
}

function renderTotals(){
  const r = totalsForTariff(state.tariff, currentSelections());
  const selections = r.selections || {};
  setText('v-flat', money(r.monthlyFlat));
  setText('v-mgp', money(r.traffic.packageRub));
  setText('v-over', money(r.traffic.extraWithMarkup));
  setText('v-surcharge', money(0));
  const widgetParts = [];
  if (r.widgets.payable){ widgetParts.push(`${r.widgets.payable} × ${money(r.widgets.widget_fee)}`); }
  if (r.widgets.sipPayable){ widgetParts.push(`SIP ${r.widgets.sipPayable} × ${money(r.widgets.sip_line_fee)}`); }
  else if (state.vatsVersion && r.widgets.capped){ widgetParts.push(`SIP ${r.widgets.capped} × 0 ₽`); }
  const widgetDetails = widgetParts.length ? ` (${widgetParts.join(', ')})` : '';
  setText('v-widgets', money(r.widgets.cost) + widgetDetails);
  setText('v-addons', money(r.addonsCost));
  const list = q('v-addons-list');
  if (list){
    list.innerHTML = "";
    r.addonsList.forEach(it=>{ const div = document.createElement('div'); div.textContent = '• ' + it.name + ' — ' + money(it.price); list.appendChild(div); });
  }
  const staticQty = Object.values(r.staticNumbers.qty || {}).reduce((acc, val)=> acc + (val||0), 0);
  const staticRow = staticQty > 0 || r.staticNumbers.cost > 0
    ? `${staticQty} шт — ${money(r.staticNumbers.cost)}`
    : '0 шт — 0 ₽';
  setText('v-static', staticRow);
  const summaryEl = q('static-summary');
  if (summaryEl) summaryEl.textContent = `${staticQty} шт`;
  setText('v-total', money(r.total));

  const box = q('email-breakdown');
  const el = q('email-list');
  if (box && el){
    el.innerHTML = "";
    if (selections['Emailtracking'] && r.emailDetails && r.emailDetails.breakdown.length){
      box.classList.remove('is-hidden');
      r.emailDetails.breakdown.forEach(part=>{
        const li = document.createElement('li');
        li.textContent = part.from.toLocaleString('ru-RU') + '–' + part.to.toLocaleString('ru-RU') + ' × ' + part.rate.toFixed(2)+ ' ₽ = ' + money(part.cost);
        el.appendChild(li);
      });
    } else {
      box.classList.add('is-hidden');
    }
  }
  updateOwnNumbersHint();
  updateVatHints();
}

function updateCompareDisclaimer(){
  const el = q('compare-disclaimer');
  if (!el) return;
  const parts = [];
  const hasNumberFees = state.vatsNewClient || staticNumbersTotal() > 0;
  if (hasNumberFees){
    parts.push('разовые платежи за номера');
  }
  if (state.vatsVersion){
    parts.push('МГП ВАТС');
  }
  if (!parts.length){
    el.textContent = '';
    el.setAttribute('hidden', '');
    return;
  }
  const text = parts.length === 1
    ? `В расчёт не включается ${parts[0]}.`
    : `В расчёт не включаются ${parts.join(' и ')}.`;
  el.textContent = text;
  el.removeAttribute('hidden');
}

function renderCompare(){
  const tariffs = PRICE.tariffs.map(t=>t.name);
  const required = requiredServicesOnCurrentTariff();
  tariffs.forEach(t=>{
    const el = document.querySelector('.t-card[data-tariff="' + t + '"]');
    if (!el) return;

    if (state.crmSaIntegration && t === 'Лайм'){
      el.style.display = "none";
      detailOpenState[t] = false;
      const badge = el.querySelector('.t-badge');
      if (badge) badge.classList.add('is-hidden');
      const note = el.querySelector('.t-note');
      if (note) note.classList.add('is-hidden');
      return;
    }

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
    if (!ok){
      detailOpenState[t] = false;
      const note = el.querySelector('.t-note');
      if (note) note.classList.add('is-hidden');
      return;
    }

    const totals = totalsForTariff(t);
    q('c-' + t).textContent = money(totals.total);
    q('c-' + t + '-traffic').textContent = state.traffic.toLocaleString('ru-RU');
    const wr = PRICE.widgets_rules[t];
    const widgetsLabel = (wr && wr.max==null) ? "без ограничений" : (state.widgets + " из " + (wr ? wr.max : 0));
    q('c-' + t + '-widgets').textContent = widgetsLabel;

    const note = el.querySelector('.t-note');
    if (note){
      const needsMax = (t === 'Папайя') && (state.vatsVersion === 'basic' || state.vatsVersion === 'extended');
      if (needsMax){
        note.textContent = 'подключение возможно только на ВАТС Максимальная';
        note.classList.remove('is-hidden');
      } else {
        note.classList.add('is-hidden');
      }
    }

    const detailBox = el.querySelector('.t-details');
    if (detailBox){
      const breakdown = breakdownForTotals(totals);
      detailBox.innerHTML = '';
      breakdown.forEach(item => {
        const row = document.createElement('div');
        row.className = 't-breakdown-row' + (item.isTotal ? ' is-total' : '');
        const lbl = document.createElement('span');
        lbl.className = 'lbl';
        lbl.textContent = item.label;
        const val = document.createElement('span');
        val.className = 'val';
        val.textContent = money(item.amount);
        row.appendChild(lbl);
        row.appendChild(val);
        detailBox.appendChild(row);
        if (item.list && item.list.length){
          const sub = document.createElement('ul');
          sub.className = 't-sublist';
          item.list.forEach(entry => {
            const li = document.createElement('li');
            li.textContent = `${entry.name} — ${money(entry.price)}`;
            sub.appendChild(li);
          });
          detailBox.appendChild(sub);
        }
      });
      const opened = !!detailOpenState[t];
      if (opened) detailBox.removeAttribute('hidden'); else detailBox.setAttribute('hidden', '');
      const toggle = el.querySelector('.t-details-toggle');
      if (toggle){
        toggle.setAttribute('aria-expanded', opened ? 'true' : 'false');
        toggle.textContent = opened ? 'Скрыть расчёт' : 'Показать расчёт';
      }
    }
  });
  updateCompareDisclaimer();
}

async function main(){
  const all = await loadAll(); PRICE = all.PRICE;
  buildRetentions();
  buildWidgetsOptions();
  buildAddons();
  setAddonsOpen(false);
  buildVatOptions();
  updateVatHints();
  bindBasics();
  renderTotals();
  renderCompare();
}

main();
