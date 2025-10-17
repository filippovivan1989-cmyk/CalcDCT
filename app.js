
import { loadAll, calcTotal } from './engine.js';
let PRICE=null, CFG=null;
function q(id){ return document.getElementById(id); }
function fmt(n){ return new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(n); }

function render(){
  const inputs = {
    tariff: q('tariff').value,
    retention: q('retention').value,
    traffic: +q('traffic').value,
    widgets: +q('widgets').value,
    email_traffic: +q('email_traffic').value,
    services_selected: {}
  };
  document.querySelectorAll('.addon input[type=checkbox]').forEach(cb => {
    inputs.services_selected[cb.dataset.name] = cb.checked;
  });
  const r = calcTotal(PRICE, inputs);
  q('out_total').textContent = fmt(r.total) + " RUB/мес";
  q('bd_flat').textContent = fmt(r.monthlyFlat);
  q('bd_pkg').textContent = fmt(r.traffic.packageRub);
  q('bd_raw').textContent = fmt(r.traffic.rawTrafficRub);
  q('bd_over').textContent = fmt(r.traffic.extraRub);
  q('bd_markup').textContent = (r.traffic.markup*100).toFixed(0) + "%";
  q('bd_overm').textContent = fmt(r.traffic.extraWithMarkup);
  q('bd_addons').textContent = fmt(r.addonsTotal);
}

function buildUI(){
  PRICE.tariffs.forEach(t=>{ const o=document.createElement('option'); o.value=t.name; o.textContent=t.name; q('tariff').appendChild(o); });
  q('tariff').value = CFG.defaults.tariff;
  PRICE.retentions.forEach(r=>{ const o=document.createElement('option'); o.value=r.label; o.textContent=r.label; q('retention').appendChild(o); });
  q('retention').value = CFG.defaults.retention;
  const box=q('addons'); box.innerHTML='';
  PRICE.services.forEach(s=>{ const id='srv_'+btoa(unescape(encodeURIComponent(s.name))).replace(/=/g,'');
    const div=document.createElement('div'); div.className='addon';
    const cb=document.createElement('input'); cb.type='checkbox'; cb.id=id; cb.dataset.name=s.name; cb.checked=!!CFG.defaults.services_selected[s.name];
    const lab=document.createElement('label'); lab.htmlFor=id; lab.textContent=s.name; div.appendChild(cb); div.appendChild(lab); box.appendChild(div);
  });
}

function bind(){ document.querySelectorAll('input,select').forEach(el=>{ el.addEventListener('input',render); el.addEventListener('change',render); }); }

async function main(){ const all=await loadAll(); PRICE=all.PRICE; CFG=all.CFG; buildUI(); bind();
  q('traffic').value=CFG.defaults.traffic; q('widgets').value=CFG.defaults.widgets; q('email_traffic').value=CFG.defaults.email_traffic; render(); }
main();
