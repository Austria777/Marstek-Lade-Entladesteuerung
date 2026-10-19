"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

const classes=new Map();
global.window={customCards:[]};
global.customElements={
  get(name){return classes.get(name);},
  define(name,value){classes.set(name,value);}
};
class StubElement {
  attachShadow(){
    const values=new Map(),notes=new Map(),flows=new Map(),vehicles=new Map(),soc=new Map(),socBars=new Map(),gridWave=new Map(),pvBars=new Map(),pvPct=new Map(),single=new Map();
    const items=(map,k)=>{
      if(!map.has(k)) map.set(k,Array.from({length:2},()=>({
        textContent:"",dataset:{},attributes:{},
        setAttribute(name,value){this.attributes[name]=value;},
        getAttribute(name){return this.attributes[name]??(name==='data-full-width'?'100':null);}
      })));
      return map.get(k);
    };
    this.shadowRoot={
      innerHTML:"",
      querySelector(selector) {
        if(!single.has(selector))single.set(selector,{dataset:{},textContent:""});
        return single.get(selector);
      },
      querySelectorAll(selector) {
        const m=selector.match(/^\[data-(value|note|flow|ev|soc|soc-bar|grid-wave|pv-bar|pv-pct)="([^"]+)"\]$/);
        if(!m)return [];
        const source={value:values,note:notes,flow:flows,ev:vehicles,soc,"soc-bar":socBars,"grid-wave":gridWave,"pv-bar":pvBars,"pv-pct":pvPct}[m[1]];
        return items(source,m[2]);
      },
      _values:values,_notes:notes,_flows:flows,_vehicles:vehicles,_soc:soc,_socBars:socBars,_gridWave:gridWave,_pvBars:pvBars,_pvPct:pvPct
    };
    return this.shadowRoot;
  }
}
global.HTMLElement=StubElement;
require("../www/marstek-energy-flow-card.js");
const Card=classes.get("marstek-energy-flow-card");
assert.ok(Card, "custom card registered");

function card(){
  const c=new Card();
  c.setConfig({title:"Energiefluss",entities:{
    pv:["sensor.pv"],
    grid:"sensor.grid",
    marstek:"sensor.marstek",
    solax:"sensor.solax",
    marstek_soc:"sensor.marstek_soc",
    solax_soc:"sensor.solax_soc",
    necharge:"sensor.necharge",
    delta:"sensor.delta"
  }});
  return c;
}
function hass(necharge="0", delta="0", deltaUnit="kW"){
  const make=(value,unit="W")=>({state:String(value),attributes:{unit_of_measurement:unit}});
  return {states:{
    "sensor.pv":make("7000"),
    "number.marstek_pv_manager_pv_anzeige_maximum":make("8400","W"),
    "sensor.grid":make("1000"),
    "sensor.marstek":make("-1500"),
    "sensor.solax":make("0"),
    "sensor.marstek_soc":make("80","%"),
    "sensor.solax_soc":make("100","%"),
    "sensor.necharge":make(necharge,"W"),
    "sensor.delta":make(delta,deltaUnit)
  }};
}
function text(c,name){return c.shadowRoot._values.get(name)?.[0]?.textContent;}
function numberOfWatts(c,name){return Number(text(c,name).replace(/[^0-9]/g,''));}
function direction(c,name){return c.shadowRoot._flows.get(name)?.[0]?.dataset?.direction;}
function state(c,name){return c.shadowRoot._vehicles.get(name)?.[0]?.dataset?.state;}

test("responsive diagrams contain both approved vehicles and new battery labels",()=>{
  const c=card();const html=c.shadowRoot.innerHTML;
  assert.match(html,/Marstek Battery/g);
  assert.match(html,/SolaX Battery/g);
  assert.match(html,/NeCharge · Model 3/g);
  assert.match(html,/Delta · Model Y/g);
  assert.match(html,/tesla-model3-highland-stealth-grey\.webp/g);
  assert.match(html,/tesla-modely-juniper-stealth-grey\.webp/g);
  assert.equal((html.match(/data-ev="necharge"/g)||[]).length,2);
  assert.equal((html.match(/data-ev="delta"/g)||[]).length,2);
});
test("live charger powers use W for NeCharge and kW for Delta",()=>{
  const c=card();c.hass=hass("900","2.5");
  assert.equal(text(c,"necharge"),"900 W");
  assert.equal(numberOfWatts(c,"delta"),2500);
  assert.equal(state(c,"necharge"),"active");
  assert.equal(state(c,"delta"),"active");
  assert.equal(direction(c,"necharge"),"forward");
  assert.equal(direction(c,"delta"),"forward");
  // The 900W and 2500W vehicle loads are ALREADY inside the house balance.
  assert.equal(numberOfWatts(c,"house"),4500);
});
test("Delta detects explicit W units without multiplying twice",()=>{
  const c=card();c.hass=hass("0","1450","W");
  assert.equal(numberOfWatts(c,"delta"),1450);
});
test("both cars stay visible but dim at 0 W; wires stop",()=>{
  const c=card();c.hass=hass();
  assert.equal(text(c,"necharge"),"0 W");
  assert.equal(text(c,"delta"),"0 W");
  assert.equal(state(c,"necharge"),"idle");
  assert.equal(state(c,"delta"),"idle");
  assert.equal(direction(c,"necharge"),"off");
  assert.equal(direction(c,"delta"),"off");
});
test("missing EV measurement stays unavailable, not a false zero",()=>{
  const c=card();const h=hass("0","0");
  h.states["sensor.delta"].state="unavailable";c.hass=h;
  assert.equal(text(c,"delta"),"– W");
  assert.equal(state(c,"delta"),"missing");
  assert.equal(c.shadowRoot._notes.get("delta")[0].textContent,"Nicht verfügbar");
  assert.equal(direction(c,"delta"),"off");
});

test("in-card SoC in both responsive SVGs; no outdated footer SoC",()=>{
  const c=card();const html=c.shadowRoot.innerHTML;
  assert.equal((html.match(/data-soc="marstek_soc"/g)||[]).length,2);
  assert.equal((html.match(/data-soc="solax_soc"/g)||[]).length,2);
  assert.equal((html.match(/data-soc-bar="marstek_soc"/g)||[]).length,2);
  assert.equal((html.match(/data-soc-bar="solax_soc"/g)||[]).length,2);
  assert.doesNotMatch(html,/class="soc-row"/);
  c.hass=hass();
  assert.equal(c.shadowRoot._soc.get("marstek_soc")[0].textContent,"SoC 80 %");
  assert.equal(c.shadowRoot._soc.get("solax_soc")[0].textContent,"SoC 100 %");
  assert.equal(Number(c.shadowRoot._socBars.get("marstek_soc")[0].attributes.width),80);
  assert.equal(Number(c.shadowRoot._socBars.get("solax_soc")[0].attributes.width),100);
});
test("SoC out-of-range is clamped and unavailable stays unknown",()=>{
  const c=card(),h=hass();h.states["sensor.marstek_soc"].state="160";
  h.states["sensor.solax_soc"].state="unknown";c.hass=h;
  assert.equal(c.shadowRoot._soc.get("marstek_soc")[0].textContent,"SoC 160 %");
  assert.equal(Number(c.shadowRoot._socBars.get("marstek_soc")[0].attributes.width),100);
  assert.equal(c.shadowRoot._soc.get("solax_soc")[0].textContent,"SoC –");
  assert.equal(Number(c.shadowRoot._socBars.get("solax_soc")[0].attributes.width),0);
});
test("premium house background and 0W cars remain legible",()=>{
  const c=card();c.hass=hass();
  assert.match(c.shadowRoot.innerHTML,/class="house-photo"/);
  assert.match(c.shadowRoot.innerHTML,/filter:blur\(7px\)/);
  assert.match(c.shadowRoot.innerHTML,/filter:blur\(12px\)/);
  assert.match(c.shadowRoot.innerHTML,/\.node-ev\[data-state='idle'\]\{opacity:\.69/);
  assert.equal(c.shadowRoot._vehicles.get("necharge")[0].dataset.state,"idle");
  assert.equal(c.shadowRoot._vehicles.get("delta")[0].dataset.state,"idle");
});

test("all battery cards use sample-inspired device-left and SoC-bottom layout",()=>{
  const c=card(),markup=c.shadowRoot.innerHTML;
  assert.equal((markup.match(/class="battery-art battery-art-marstek"/g)||[]).length,2);
  assert.equal((markup.match(/class="battery-art battery-art-solax"/g)||[]).length,2);
  assert.equal((markup.match(/class="battery-heading"/g)||[]).length,4);
  assert.equal((markup.match(/class="node-power battery-power"/g)||[]).length,4);
  assert.equal((markup.match(/class="soc-track"/g)||[]).length,4);
  assert.match(markup,/Marstek Battery/);
  assert.match(markup,/SolaX Battery/);
  assert.doesNotMatch(markup,/class="soc-row"/);
});
test("Variant B uses a realistic external house photo, adaptive blur and real data overlays",()=>{
  const c=card(),markup=c.shadowRoot.innerHTML;
  assert.match(markup,/class="house-photo"/);
  assert.match(markup,/images\.unsplash\.com\/photo-1757356657991-c3fd6e2e812e/);
  assert.match(markup,/\.house-photo\{[^}]*filter:blur\(7px\)/s);
  assert.match(markup,/@media\(max-width:620px\)\{/);
  assert.match(markup,/\.house-photo\{filter:blur\(12px\)/);
  assert.doesNotMatch(markup,/class="house-scene"/);
  assert.doesNotMatch(markup,/marstek-energy-premium-background\.webp/);
  assert.match(markup,/Marstek Battery/);
  assert.match(markup,/SolaX Battery/);
  assert.match(markup,/NeCharge/);
  assert.match(markup,/Delta/);
  c.hass=hass("1100","1.2");
  assert.equal(numberOfWatts(c,"delta"),1200);
  assert.equal(numberOfWatts(c,"house"),4500);
});

test("user-supplied PV and power-grid design references are reflected in both layouts",()=>{
  const c=card(),markup=c.shadowRoot.innerHTML;
  assert.equal((markup.match(/class="pv-illustration"/g)||[]).length,2);
  assert.equal((markup.match(/class="grid-tower-art"/g)||[]).length,2);
  assert.equal((markup.match(/class="pv-spark-bars"/g)||[]).length,2);
  assert.equal((markup.match(/class="grid-wave"/g)||[]).length,2);
  assert.equal((markup.match(/data-grid-wave="true"/g)||[]).length,2);
  assert.doesNotMatch(markup,/Bilanz-Schätzwert/);
  assert.doesNotMatch(markup,/data-note="house"/);
  assert.match(markup,/Haus ≈/);
  assert.match(markup,/\.grid-wave\[data-state='export'\]\{color:#0cbd78/);
  assert.match(markup,/\.grid-wave\[data-state='import'\]\{color:#e7464b/);
});
test("grid injection, consumption, neutral and unavailable select matching wave colors",()=>{
  const c=card(),h=hass();
  c.hass=h;
  assert.equal(c.shadowRoot._gridWave.get("true")[0].dataset.state,"export");
  assert.equal(c.shadowRoot._notes.get("grid")[0].textContent,"Einspeisung");
  h.states["sensor.grid"].state="-250";c.hass=h;
  assert.equal(c.shadowRoot._gridWave.get("true")[0].dataset.state,"import");
  assert.equal(c.shadowRoot._gridWave.get("true")[1].dataset.state,"import");
  assert.equal(c.shadowRoot._notes.get("grid")[0].textContent,"Netzbezug");
  h.states["sensor.grid"].state="0";c.hass=h;
  assert.equal(c.shadowRoot._gridWave.get("true")[0].dataset.state,"neutral");
  assert.equal(c.shadowRoot._notes.get("grid")[0].textContent,"Ausgeglichen");
  h.states["sensor.grid"].state="unavailable";c.hass=h;
  assert.equal(c.shadowRoot._gridWave.get("true")[0].dataset.state,"missing");
  assert.equal(c.shadowRoot._notes.get("grid")[0].textContent,"Nicht verfügbar");
  assert.equal(text(c,"grid"),"– W");
});
test("small nonzero grid power uses exact sign for both status and waveform",()=>{
  const c=card(),h=hass();
  h.states["sensor.grid"].state="1";c.hass=h;
  assert.equal(c.shadowRoot._gridWave.get("true")[0].dataset.state,"export");
  assert.equal(c.shadowRoot._notes.get("grid")[0].textContent,"Einspeisung");
  h.states["sensor.grid"].state="-1";c.hass=h;
  assert.equal(c.shadowRoot._gridWave.get("true")[0].dataset.state,"import");
  assert.equal(c.shadowRoot._notes.get("grid")[0].textContent,"Netzbezug");
});

test("new cyan-glow Smart Home heartbeat icon replaces old house glyph on PC and phone",()=>{
  const c=card(),html=c.shadowRoot.innerHTML;
  assert.equal((html.match(/data-house-icon="heartbeat"/g)||[]).length,2);
  assert.equal((html.match(/class="house-halo"/g)||[]).length,2);
  assert.equal((html.match(/class="node-power house-power"/g)||[]).length,2);
  assert.match(html,/house-disc-desktop/);
  assert.match(html,/house-disc-mobile/);
  assert.match(html,/smart-house-icon\{pointer-events:none/);
  assert.match(html,/rgba\(41,189,248,\.83\)/);
  assert.doesNotMatch(html,/class="node-icon"/);
  assert.doesNotMatch(html,/Bilanz-Schätzwert/);
});
test("house icon does not alter live power calculation or other flow statuses",()=>{
  const c=card();c.hass=hass("900","2.5");
  assert.equal(numberOfWatts(c,"house"),4500);
  assert.equal(numberOfWatts(c,"pv"),7000);
  assert.equal(c.shadowRoot._gridWave.get("true")[0].dataset.state,"export");
  assert.equal(state(c,"necharge"),"active");
  assert.equal(state(c,"delta"),"active");
  assert.equal(c.shadowRoot._soc.get("marstek_soc")[0].textContent,"SoC 80 %");
});

function blueBars(c) {
  return Array.from({length:6},(_,i)=>c.shadowRoot._pvBars.get(String(i))?.[0].dataset.on==="true")
    .filter(Boolean).length;
}
test("six full-height PV signal bars and utilisation percentage in both diagrams",()=>{
  const c=card(),html=c.shadowRoot.innerHTML;
  assert.equal((html.match(/class="pv-signal-bar"/g)||[]).length,12);
  assert.equal((html.match(/data-pv-pct="true"/g)||[]).length,2);
  assert.doesNotMatch(html,/opacity="\$\{\.3\+i\*\.14\}"/);
  assert.match(html,/\.pv-signal-bar\[data-on='true'\]/);
  assert.match(html,/\.pv-signal-bar\{fill:#b5c5d2/);
  const h=hass();h.states["sensor.pv"].state="3717";
  c.hass=h;
  assert.equal(blueBars(c),3);
  assert.equal(c.shadowRoot._pvPct.get("true")[0].textContent,"44 %");
  assert.equal(c.shadowRoot._pvPct.get("true")[1].textContent,"44 %");
  for(let i=0;i<6;i++)
    assert.equal(c.shadowRoot._pvBars.get(String(i))[1].dataset.on,i<3?"true":"false");
});
test("PV bars scale from zero through full scale, clamp over 100 percent",()=>{
  const c=card(),h=hass();h.states["sensor.pv"].state="0";c.hass=h;
  assert.equal(blueBars(c),0);
  assert.equal(c.shadowRoot._pvPct.get("true")[0].textContent,"0 %");
  h.states["sensor.pv"].state="1400";c.hass=h;
  assert.equal(blueBars(c),1);
  h.states["sensor.pv"].state="2800";c.hass=h;
  assert.equal(blueBars(c),2);
  h.states["sensor.pv"].state="4200";c.hass=h;
  assert.equal(blueBars(c),3);
  h.states["sensor.pv"].state="8400";c.hass=h;
  assert.equal(blueBars(c),6);
  assert.equal(c.shadowRoot._pvPct.get("true")[0].textContent,"100 %");
  h.states["sensor.pv"].state="20000";c.hass=h;
  assert.equal(blueBars(c),6);
  assert.equal(c.shadowRoot._pvPct.get("true")[0].textContent,"100 %");
});
test("PV full scale follows the persisted slider and does not affect house balance",()=>{
  const c=card(),h=hass();h.states["sensor.pv"].state="8400";
  h.states["number.marstek_pv_manager_pv_anzeige_maximum"].state="14000";
  c.hass=h;
  assert.equal(blueBars(c),4);
  assert.equal(c.shadowRoot._pvPct.get("true")[0].textContent,"60 %");
  assert.equal(numberOfWatts(c,"pv"),8400); // locale grouping may be a narrow no-break space
  const houseWatts=numberOfWatts(c,"house");
  h.states["number.marstek_pv_manager_pv_anzeige_maximum"].state="8000";
  c.hass=h;
  assert.equal(blueBars(c),6);
  assert.equal(c.shadowRoot._pvPct.get("true")[0].textContent,"100 %");
  assert.equal(numberOfWatts(c,"house"),houseWatts);
});
test("PV bars use safe default when the new entity is missing; invalid PV displays unknown",()=>{
  const c=card(),h=hass();h.states["sensor.pv"].state="4200";
  delete h.states["number.marstek_pv_manager_pv_anzeige_maximum"];
  c.hass=h;
  assert.equal(blueBars(c),3);  // 8400 W fallback
  h.states["sensor.pv"].state="unavailable";c.hass=h;
  assert.equal(blueBars(c),0);
  assert.equal(c.shadowRoot._pvPct.get("true")[0].textContent,"– %");
  assert.equal(c.shadowRoot._notes.get("pv")[0].textContent,"Nicht verfügbar");
});
