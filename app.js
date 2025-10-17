
import { estimateAll } from './engine.js';

let CFG = null;

async function loadConfig() {
  const res = await fetch('./pricing.json', { cache: 'no-store' });
  CFG = await res.json();
}

function fmt(n) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n);
}
function fmt2(n) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n);
}

function readInputs() {
  const get = (id) => document.getElementById(id);
  return {
    visits_month: +get('visits_month').value,
    conv_to_call: +get('conv_to_call').value / 100,
    track_share: +get('track_share').value / 100,
    avg_talk_time_min: +get('avg_talk_time_min').value,
    k_peak: +get('k_peak').value,
    safety_factor: +get('safety_factor').value,
    cities: +get('cities').value,
    static_extra: +get('static_extra').value,
    tariff: get('tariff').value,
    addons: {
      recording: get('ad_recording').checked,
      speech_analytics: get('ad_sa').checked,
      multi_site: get('ad_ms').checked,
      integration_crm: get('ad_crm').checked,
      geo_multi_city: get('ad_geo').checked
    }
  };
}

function setAvailability(tariff) {
  const avail = CFG.tariffs[tariff].availability;
  const map = {
    recording: 'ad_recording',
    speech_analytics: 'ad_sa',
    multi_site: 'ad_ms',
    integration_crm: 'ad_crm',
    geo_multi_city: 'ad_geo'
  };
  for (const [k, id] of Object.entries(map)) {
    const el = document.getElementById(id);
    el.disabled = !avail[k];
    if (!avail[k]) el.checked = false;
    el.closest('.addon').classList.toggle('disabled', !avail[k]);
  }
}

function render() {
  const state = readInputs();
  const res = estimateAll(CFG, state);
  const cur = CFG.currency || 'RUB';
  const total = res.price;

  document.getElementById('out_total').textContent = `${fmt(total)} ${cur}/мес`;
  document.getElementById('out_pool').textContent = res.pool;
  document.getElementById('out_static').textContent = res.staticNumbers;
  document.getElementById('out_minutes').textContent = fmt(res.minutesMonth);
  document.getElementById('out_calls').textContent = fmt(res.callsMonth);

  const b = res.breakdown;
  document.getElementById('bd_flat').textContent = fmt(b.monthlyFlat);
  document.getElementById('bd_dyn').textContent = `${fmt(b.dynamicCost)} (≈ ${fmt2(b.priceDyn)}/номер)`;
  document.getElementById('bd_stat').textContent = `${fmt(b.staticCost)} (≈ ${fmt2(b.priceStat)}/номер)`;
  document.getElementById('bd_min').textContent = `${fmt(b.minutesCost)} (≈ ${fmt2(b.pricePerMin)}/мин)`;
  document.getElementById('bd_addons').textContent = fmt(b.addonsCost);

  const share = new URL(location.href);
  for (const [k,v] of Object.entries(state)) {
    if (typeof v === 'object') {
      for (const [ak, av] of Object.entries(v)) share.searchParams.set(ak, av ? 1 : 0);
    } else {
      share.searchParams.set(k, v);
    }
  }
  document.getElementById('share_url').value = share.toString();
}

function readFromURL() {
  const p = new URL(location.href).searchParams;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  const setC = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val === '1'; };

  if (p.get('visits_month')) set('visits_month', p.get('visits_month'));
  if (p.get('conv_to_call')) set('conv_to_call', (+p.get('conv_to_call'))*100);
  if (p.get('track_share')) set('track_share', (+p.get('track_share'))*100);
  if (p.get('avg_talk_time_min')) set('avg_talk_time_min', p.get('avg_talk_time_min'));
  if (p.get('k_peak')) set('k_peak', p.get('k_peak'));
  if (p.get('safety_factor')) set('safety_factor', p.get('safety_factor'));
  if (p.get('cities')) set('cities', p.get('cities'));
  if (p.get('static_extra')) set('static_extra', p.get('static_extra'));
  if (p.get('tariff')) set('tariff', p.get('tariff'));
  setC('ad_recording', p.get('recording'));
  setC('ad_sa', p.get('speech_analytics'));
  setC('ad_ms', p.get('multi_site'));
  setC('ad_crm', p.get('integration_crm'));
  setC('ad_geo', p.get('geo_multi_city'));
}

function bind() {
  document.querySelectorAll('input,select').forEach(el => {
    el.addEventListener('input', () => {
      if (el.id === 'tariff') setAvailability(el.value);
      render();
    });
    el.addEventListener('change', () => {
      if (el.id === 'tariff') setAvailability(el.value);
      render();
    });
  });
  document.getElementById('copy_btn').addEventListener('click', async () => {
    const ta = document.getElementById('share_url');
    ta.select();
    try { await navigator.clipboard.writeText(ta.value); } catch {}
  });
}

async function main() {
  await loadConfig();
  const d = CFG.defaults;
  // init fields
  const set = (id, val) => document.getElementById(id).value = val;
  set('visits_month', d.visits_month);
  set('conv_to_call', d.conv_to_call*100);
  set('track_share', d.track_share*100);
  set('avg_talk_time_min', d.avg_talk_time_min);
  set('k_peak', d.k_peak);
  set('safety_factor', d.safety_factor);
  set('cities', d.cities);
  set('static_extra', d.static_extra);
  document.getElementById('tariff').value = d.tariff;

  readFromURL();
  setAvailability(document.getElementById('tariff').value);
  bind();
  render();
}

main();
