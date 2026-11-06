"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

const classes=new Map();
const telemetryStorage=new Map();
let periodicRefresh=null;
global.window={
  customCards:[],
  localStorage:{
    getItem(key){return telemetryStorage.get(key)??null;},
    setItem(key,value){telemetryStorage.set(key,String(value));}
  },
  setInterval(fn){periodicRefresh=fn;return 1;},
  clearInterval(){periodicRefresh=null;}
};
test.beforeEach(()=>{telemetryStorage.clear();periodicRefresh=null;});
global.customElements={
  get(name){return classes.get(name);},
  define(name,value){classes.set(name,value);}
};
class StubElement {
  attachShadow(){
    const values=new Map(),notes=new Map(),flows=new Map(),vehicles=new Map(),soc=new Map(),socBars=new Map(),gridWave=new Map(),pvBars=new Map(),pvPct=new Map(),evSoc=new Map(),evRange=new Map(),single=new Map();
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
        const m=selector.match(/^\[data-(value|note|flow|ev|soc|soc-bar|grid-wave|pv-bar|pv-pct|ev-soc|ev-range)="([^"]+)"\]$/);
        if(!m)return [];
        const source={value:values,note:notes,flow:flows,ev:vehicles,soc,"soc-bar":socBars,"grid-wave":gridWave,"pv-bar":pvBars,"pv-pct":pvPct,"ev-soc":evSoc,"ev-range":evRange}[m[1]];
        return items(source,m[2]);
      },
      _values:values,_notes:notes,_flows:flows,_vehicles:vehicles,_soc:soc,_socBars:socBars,_gridWave:gridWave,_pvBars:pvBars,_pvPct:pvPct,_evSoc:evSoc,_evRange:evRange
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
    necharge_soc:"sensor.model3_soc",
    necharge_range:"sensor.model3_range",
    delta:"sensor.delta",
    delta_soc:"sensor.modely_soc",
    delta_range:"sensor.modely_range"
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
    "sensor.model3_soc":make("97","%"),
    "sensor.model3_range":make("382.4","km"),
    "sensor.delta":make(delta,deltaUnit),
    "sensor.modely_soc":make("78","%"),
    "sensor.modely_range":make("418","km")
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
  assert.match(c.shadowRoot.innerHTML,/\.node-ev\[data-state='idle'\] > :not\(\.ev-soc\):not\(\.ev-range\)\{opacity:\.69/);
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


test("Model 3 SoC is displayed beside charging power in both responsive NeCharge tiles",()=>{
  const c=card(),html=c.shadowRoot.innerHTML;
  assert.equal((html.match(/data-ev-soc="necharge"/g)||[]).length,2);
  assert.equal((html.match(/class="node-power ev-soc"/g)||[]).length,4);
  assert.equal((html.match(/data-ev-soc="delta"/g)||[]).length,2);
  assert.match(html,/\.ev-soc\{font-size:18px;font-weight:800/);
  assert.match(html,/\.ev-soc\{font-size:15px\}/);
  const h=hass("1200","0");
  c.hass=h;
  assert.equal(c.shadowRoot._evSoc.get("necharge")[0].textContent,"SoC 97 %");
  assert.equal(c.shadowRoot._evSoc.get("necharge")[1].textContent,"SoC 97 %");
  assert.equal(numberOfWatts(c,"necharge"),1200);
  assert.equal(state(c,"necharge"),"active");
});
test("Model 3 SoC updates live, including 0 and 100 percent",()=>{
  const c=card(),h=hass("0","0");
  h.states["sensor.model3_soc"].state="42.6";c.hass=h;
  assert.equal(c.shadowRoot._evSoc.get("necharge")[0].textContent,"SoC 43 %");
  h.states["sensor.model3_soc"].state="0";c.hass=h;
  assert.equal(c.shadowRoot._evSoc.get("necharge")[0].textContent,"SoC 0 %");
  h.states["sensor.model3_soc"].state="100";c.hass=h;
  assert.equal(c.shadowRoot._evSoc.get("necharge")[0].textContent,"SoC 100 %");
  assert.equal(state(c,"necharge"),"idle");
  assert.equal(text(c,"necharge"),"0 W");
});
test("Model 3 missing/invalid SoC shows dash and never changes charging logic",()=>{
  const c=card(),h=hass("1300","1.5");
  h.states["sensor.model3_soc"].state="unavailable";c.hass=h;
  assert.equal(c.shadowRoot._evSoc.get("necharge")[0].textContent,"SoC –");
  assert.equal(c.shadowRoot._evSoc.get("necharge")[1].textContent,"SoC –");
  assert.equal(numberOfWatts(c,"necharge"),1300);
  assert.equal(state(c,"necharge"),"active");
  assert.equal(direction(c,"necharge"),"forward");
  const houseW=numberOfWatts(c,"house");
  h.states["sensor.model3_soc"].state="105";c.hass=h;
  assert.equal(c.shadowRoot._evSoc.get("necharge")[0].textContent,"SoC –");
  assert.equal(numberOfWatts(c,"house"),houseW);
});
test("dashboard default model3 battery sensor does not require additional backend integration",()=>{
  const c=new Card();c.setConfig({title:"Test",entities:{
    pv:["sensor.pv"],grid:"sensor.grid",marstek:"sensor.marstek",
    solax:"sensor.solax",marstek_soc:"sensor.marstek_soc",
    solax_soc:"sensor.solax_soc",necharge:"sensor.necharge",delta:"sensor.delta"
  }});
  const h=hass("150","0");
  h.states["sensor.tesla_model_3_highland_usable_battery"]={
    state:"83",attributes:{unit_of_measurement:"%"}
  };
  c.hass=h;
  assert.equal(c.shadowRoot._evSoc.get("necharge")[0].textContent,"SoC 83 %");
});

test("Model 3 live range is visible under SoC with km on desktop and mobile",()=>{
  const c=card(),markup=c.shadowRoot.innerHTML,h=hass("1500","0");
  assert.equal((markup.match(/data-ev-range="necharge"/g)||[]).length,2);
  assert.equal((markup.match(/class="node-power ev-range"/g)||[]).length,4);
  assert.equal((markup.match(/data-ev-range="delta"/g)||[]).length,2);
  assert.match(markup,/\.ev-range\{font-size:16px;font-weight:750/);
  assert.match(markup,/\.ev-range\{font-size:14px\}/);
  c.hass=h;
  assert.equal(c.shadowRoot._evRange.get("necharge")[0].textContent,"382 km");
  assert.equal(c.shadowRoot._evRange.get("necharge")[1].textContent,"382 km");
  assert.equal(c.shadowRoot._evSoc.get("necharge")[0].textContent,"SoC 97 %");
  assert.equal(numberOfWatts(c,"necharge"),1500);
  assert.equal(state(c,"necharge"),"active");
  assert.equal(direction(c,"necharge"),"forward");
});
test("Model 3 range refreshes independently of power and SoC",()=>{
  const c=card(),h=hass("0","0");
  h.states["sensor.model3_range"].state="434.6";
  c.hass=h;
  assert.equal(c.shadowRoot._evRange.get("necharge")[0].textContent,"435 km");
  h.states["sensor.model3_range"].state="0";
  c.hass=h;
  assert.equal(c.shadowRoot._evRange.get("necharge")[0].textContent,"0 km");
  assert.equal(c.shadowRoot._evSoc.get("necharge")[1].textContent,"SoC 97 %");
  assert.equal(state(c,"necharge"),"idle");
});
test("Unknown, unavailable and invalid Model 3 range show dash without affecting power",()=>{
  const c=card(),h=hass("1300","0");
  const originalHouse=Number(String(h.states["sensor.pv"].state));
  for(const value of ["unknown","unavailable","-1","not-a-number"]) {
    h.states["sensor.model3_range"].state=value;
    c.hass=h;
    assert.equal(c.shadowRoot._evRange.get("necharge")[0].textContent,"– km");
    assert.equal(c.shadowRoot._evRange.get("necharge")[1].textContent,"– km");
    assert.equal(numberOfWatts(c,"necharge"),1300);
    assert.equal(c.shadowRoot._evSoc.get("necharge")[0].textContent,"SoC 97 %");
    assert.equal(state(c,"necharge"),"active");
  }
  assert.equal(Number(h.states["sensor.pv"].state),originalHouse);
});
test("new Model 3 range entity defaults to supplied sensor without dashboard edits",()=>{
  const c=new Card();c.setConfig({title:"Test",entities:{
    pv:["sensor.pv"],grid:"sensor.grid",marstek:"sensor.marstek",
    solax:"sensor.solax",marstek_soc:"sensor.marstek_soc",
    solax_soc:"sensor.solax_soc",necharge:"sensor.necharge",delta:"sensor.delta"
  }});
  const h=hass("0","0");
  h.states["sensor.tesla_model_3_highland_range"]={
    state:"406.1",attributes:{unit_of_measurement:"km"}
  };
  c.hass=h;
  assert.equal(c.shadowRoot._evRange.get("necharge")[0].textContent,"406 km");
});

test("Tesla Model Y delta tile shows live SoC and estimated range on desktop and iPhone",()=>{
  const c=card(),html=c.shadowRoot.innerHTML,h=hass("0","6.6");
  assert.equal((html.match(/data-ev-soc="delta"/g)||[]).length,2);
  assert.equal((html.match(/data-ev-range="delta"/g)||[]).length,2);
  assert.equal((html.match(/class="node-power ev-soc"/g)||[]).length,4);
  assert.equal((html.match(/class="node-power ev-range"/g)||[]).length,4);
  c.hass=h;
  for(const v of c.shadowRoot._evSoc.get("delta"))assert.equal(v.textContent,"SoC 78 %");
  for(const v of c.shadowRoot._evRange.get("delta"))assert.equal(v.textContent,"418 km");
  assert.equal(numberOfWatts(c,"delta"),6600);
  assert.equal(state(c,"delta"),"active");
  assert.equal(direction(c,"delta"),"forward");
  assert.equal(c.shadowRoot._evSoc.get("necharge")[0].textContent,"SoC 97 %");
  assert.equal(c.shadowRoot._evRange.get("necharge")[0].textContent,"382 km");
});
test("Model Y telemetry changes while charging power and Model 3 remain unchanged",()=>{
  const c=card(),h=hass("0","0");
  h.states["sensor.modely_soc"].state="52.7";
  h.states["sensor.modely_range"].state="265.5";c.hass=h;
  assert.equal(c.shadowRoot._evSoc.get("delta")[0].textContent,"SoC 53 %");
  assert.equal(c.shadowRoot._evRange.get("delta")[1].textContent,"266 km");
  h.states["sensor.modely_soc"].state="0";
  h.states["sensor.modely_range"].state="0";c.hass=h;
  assert.equal(c.shadowRoot._evSoc.get("delta")[0].textContent,"SoC 0 %");
  assert.equal(c.shadowRoot._evRange.get("delta")[0].textContent,"0 km");
  assert.equal(c.shadowRoot._evSoc.get("necharge")[0].textContent,"SoC 97 %");
  assert.equal(state(c,"delta"),"idle");
  assert.equal(text(c,"delta"),"0 W");
});
test("Missing/invalid Model Y data is independent of its power and Model 3 status",()=>{
  const c=card(),h=hass("1500","2.1");
  h.states["sensor.modely_soc"].state="unavailable";
  h.states["sensor.modely_range"].state="unknown";
  c.hass=h;
  for(const v of c.shadowRoot._evSoc.get("delta"))assert.equal(v.textContent,"SoC –");
  for(const v of c.shadowRoot._evRange.get("delta"))assert.equal(v.textContent,"– km");
  assert.equal(numberOfWatts(c,"delta"),2100);
  assert.equal(state(c,"delta"),"active");
  assert.equal(direction(c,"delta"),"forward");
  assert.equal(c.shadowRoot._evSoc.get("necharge")[0].textContent,"SoC 97 %");
  h.states["sensor.modely_soc"].state="101";
  h.states["sensor.modely_range"].state="-20";c.hass=h;
  assert.equal(c.shadowRoot._evSoc.get("delta")[0].textContent,"SoC –");
  assert.equal(c.shadowRoot._evRange.get("delta")[0].textContent,"– km");
});
test("Tesla Model Y sensors default to supplied IDs without changing existing dashboards",()=>{
  const c=new Card();c.setConfig({title:"Test",entities:{
    pv:["sensor.pv"],grid:"sensor.grid",marstek:"sensor.marstek",
    solax:"sensor.solax",marstek_soc:"sensor.marstek_soc",
    solax_soc:"sensor.solax_soc",necharge:"sensor.necharge",delta:"sensor.delta"
  }});
  const h=hass("0","0");
  h.states["sensor.tesla_model_y_usable_battery"]={state:"90",attributes:{unit_of_measurement:"%"}};
  h.states["sensor.tesla_model_y_range"]={state:"512.6",attributes:{unit_of_measurement:"km"}};
  c.hass=h;
  assert.equal(c.shadowRoot._evSoc.get("delta")[0].textContent,"SoC 90 %");
  assert.equal(c.shadowRoot._evRange.get("delta")[0].textContent,"513 km");
});


function markTeslaFresh(h,at=new Date().toISOString()){
  for(const id of ["sensor.model3_soc","sensor.model3_range","sensor.modely_soc","sensor.modely_range"])
    h.states[id].last_reported=at;
}
test("Fresh SoC and range are BLUE for both Tesla cars even while not charging",()=>{
  const c=card(),h=hass("0","0");
  markTeslaFresh(h,new Date(Date.now()-10000).toISOString());
  c.hass=h;
  for(const key of ["necharge","delta"]){
    assert.equal(state(c,key),"idle");
    for(const el of [...c.shadowRoot._evSoc.get(key),...c.shadowRoot._evRange.get(key)])
      assert.equal(el.dataset.fresh,"true");
  }
  assert.equal(c.shadowRoot._evSoc.get("necharge")[0].textContent,"SoC 97 %");
  assert.equal(c.shadowRoot._evRange.get("delta")[0].textContent,"418 km");
  assert.match(c.shadowRoot.innerHTML,/data-fresh='true'.*fill:#087ddd/);
  assert.match(c.shadowRoot.innerHTML,/data-state='idle'\] > :not\(\.ev-soc\):not\(\.ev-range\)/);
  assert.doesNotMatch(c.shadowRoot.innerHTML,/\.node-ev\[data-state='idle'\]\{opacity:/);
});
test("Unknown or unavailable Tesla sensors immediately turn GREY and retain previous values",()=>{
  const c=card(),h=hass("1200","2.5");markTeslaFresh(h);c.hass=h;
  h.states["sensor.model3_soc"].state="unknown";
  h.states["sensor.model3_range"].state="unavailable";
  h.states["sensor.modely_soc"].state="unavailable";
  h.states["sensor.modely_range"].state="unknown";
  c.hass=h;
  assert.equal(c.shadowRoot._evSoc.get("necharge")[0].textContent,"SoC 97 %");
  assert.equal(c.shadowRoot._evRange.get("necharge")[0].textContent,"382 km");
  assert.equal(c.shadowRoot._evSoc.get("delta")[0].textContent,"SoC 78 %");
  assert.equal(c.shadowRoot._evRange.get("delta")[0].textContent,"418 km");
  for(const key of ["necharge","delta"]){
    for(const el of [...c.shadowRoot._evSoc.get(key),...c.shadowRoot._evRange.get(key)]){
      assert.equal(el.dataset.fresh,"false");
    }
    assert.equal(state(c,key),"active");
  }
  assert.equal(numberOfWatts(c,"necharge"),1200);
  assert.equal(numberOfWatts(c,"delta"),2500);
});
test("SoC and km become GREY after thirty minutes without a new sensor report",()=>{
  const c=card(),h=hass("0","0");
  markTeslaFresh(h,new Date(Date.now()-31*60*1000).toISOString());
  c.hass=h;
  for(const key of ["necharge","delta"]){
    assert.equal(c.shadowRoot._evSoc.get(key)[0].dataset.fresh,"false");
    assert.equal(c.shadowRoot._evRange.get(key)[0].dataset.fresh,"false");
  }
  assert.equal(c.shadowRoot._evSoc.get("necharge")[0].textContent,"SoC 97 %");
  assert.equal(c.shadowRoot._evRange.get("delta")[0].textContent,"418 km");
  // Re-reporting an unchanged valid value is still fresh.
  h.states["sensor.modely_soc"].last_reported=new Date().toISOString();
  c.hass=h;
  assert.equal(c.shadowRoot._evSoc.get("delta")[0].dataset.fresh,"true");
  assert.equal(c.shadowRoot._evRange.get("delta")[0].dataset.fresh,"false");
});
test("Optional vehicle awake statuses freeze each Tesla immediately, independently",()=>{
  const c=card(),h=hass("0","0");
  c.setConfig({title:"Energiefluss",entities:{
    pv:["sensor.pv"],grid:"sensor.grid",marstek:"sensor.marstek",
    solax:"sensor.solax",marstek_soc:"sensor.marstek_soc",solax_soc:"sensor.solax_soc",
    necharge:"sensor.necharge",necharge_soc:"sensor.model3_soc",necharge_range:"sensor.model3_range",
    necharge_awake:"binary_sensor.model3_awake",delta:"sensor.delta",
    delta_soc:"sensor.modely_soc",delta_range:"sensor.modely_range",
    delta_awake:"sensor.modely_state"
  }});
  h.states["binary_sensor.model3_awake"]={state:"on",attributes:{}};
  h.states["sensor.modely_state"]={state:"online",attributes:{}};
  markTeslaFresh(h);c.hass=h;
  assert.equal(c.shadowRoot._evSoc.get("necharge")[0].dataset.fresh,"true");
  assert.equal(c.shadowRoot._evSoc.get("delta")[0].dataset.fresh,"true");
  // Sensor may still have a numeric value and receive updates when Tesla sleeps:
  // the last value seen while awake remains frozen, and turns grey immediately.
  h.states["binary_sensor.model3_awake"].state="off";
  h.states["sensor.modely_state"].state="asleep";
  h.states["sensor.model3_soc"].state="52";
  h.states["sensor.model3_range"].state="277";
  h.states["sensor.modely_soc"].state="66";
  h.states["sensor.modely_range"].state="350";
  markTeslaFresh(h);c.hass=h;
  for(const key of ["necharge","delta"]){
    assert.equal(c.shadowRoot._evSoc.get(key)[0].dataset.fresh,"false");
    assert.equal(c.shadowRoot._evRange.get(key)[0].dataset.fresh,"false");
  }
  assert.equal(c.shadowRoot._evSoc.get("necharge")[0].textContent,"SoC 97 %");
  assert.equal(c.shadowRoot._evRange.get("necharge")[0].textContent,"382 km");
  assert.equal(c.shadowRoot._evSoc.get("delta")[0].textContent,"SoC 78 %");
  assert.equal(c.shadowRoot._evRange.get("delta")[0].textContent,"418 km");
  h.states["binary_sensor.model3_awake"].state="on";
  h.states["sensor.modely_state"].state="online";c.hass=h;
  assert.equal(c.shadowRoot._evSoc.get("necharge")[0].textContent,"SoC 52 %");
  assert.equal(c.shadowRoot._evRange.get("delta")[0].textContent,"350 km");
  assert.equal(c.shadowRoot._evSoc.get("delta")[0].dataset.fresh,"true");
});
test("Last valid SoC and km are restored in GREY after new card instance or reload",()=>{
  const h=hass("0","0");markTeslaFresh(h);
  const c=card();c.hass=h;
  assert.ok(telemetryStorage.size>=4);
  for(const id of ["sensor.model3_soc","sensor.model3_range","sensor.modely_soc","sensor.modely_range"])
    h.states[id].state="unavailable";
  const reloaded=card();reloaded.hass=h;
  assert.equal(reloaded.shadowRoot._evSoc.get("necharge")[0].textContent,"SoC 97 %");
  assert.equal(reloaded.shadowRoot._evRange.get("necharge")[0].textContent,"382 km");
  assert.equal(reloaded.shadowRoot._evSoc.get("delta")[0].textContent,"SoC 78 %");
  assert.equal(reloaded.shadowRoot._evRange.get("delta")[0].textContent,"418 km");
  assert.equal(reloaded.shadowRoot._evSoc.get("delta")[0].dataset.fresh,"false");
});
test("Periodic redraw makes expired timestamps gray without further HA events",()=>{
  const c=card(),h=hass("0","0");markTeslaFresh(h);
  c.hass=h;c.connectedCallback();
  assert.equal(typeof periodicRefresh,"function");
  periodicRefresh();
  assert.equal(c.shadowRoot._evSoc.get("necharge")[0].dataset.fresh,"true");
  // Simulate advancing thirty-one minutes without updating last_reported.
  const before=Date.now;
  Date.now=()=>before()+31*60*1000;
  try{periodicRefresh();}finally{Date.now=before;}
  assert.equal(c.shadowRoot._evSoc.get("necharge")[0].dataset.fresh,"false");
  assert.equal(c.shadowRoot._evRange.get("delta")[0].dataset.fresh,"false");
  c.disconnectedCallback();
  assert.equal(periodicRefresh,null);
});
test("Without any previously observed valid Tesla value, show grey dash",()=>{
  const h=hass("0","0");
  for(const id of ["sensor.model3_soc","sensor.model3_range","sensor.modely_soc","sensor.modely_range"])
    h.states[id].state="unavailable";
  const c=card();c.hass=h;
  for(const key of ["necharge","delta"]){
    assert.equal(c.shadowRoot._evSoc.get(key)[0].textContent,"SoC –");
    assert.equal(c.shadowRoot._evRange.get(key)[0].textContent,"– km");
    assert.equal(c.shadowRoot._evSoc.get(key)[0].dataset.fresh,"false");
  }
});
