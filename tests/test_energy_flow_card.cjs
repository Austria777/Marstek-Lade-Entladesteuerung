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
    const values=new Map(),notes=new Map(),flows=new Map(),vehicles=new Map(),single=new Map();
    const items=(map,k)=>{
      if(!map.has(k)) map.set(k,[{textContent:"",dataset:{}},{textContent:"",dataset:{}}]);
      return map.get(k);
    };
    this.shadowRoot={
      innerHTML:"",
      querySelector(selector) {
        if(!single.has(selector))single.set(selector,{dataset:{},textContent:""});
        return single.get(selector);
      },
      querySelectorAll(selector) {
        const m=selector.match(/^\[data-(value|note|flow|ev)="([^"]+)"\]$/);
        if(!m)return [];
        const source={value:values,note:notes,flow:flows,ev:vehicles}[m[1]];
        return items(source,m[2]);
      },
      _values:values,_notes:notes,_flows:flows,_vehicles:vehicles
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
