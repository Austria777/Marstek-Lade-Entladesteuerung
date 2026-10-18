/* Marstek Energy Flow Card 0.5.6 — Premium Smart Energy; display only, never controls equipment. */
(() => {
  'use strict';
  const DEFAULT = Object.freeze({
    pv: ['sensor.pv_leistung_gesamt'],
    grid: 'sensor.solax_m_measured_power',
    marstek: 'sensor.marstek_venus_modbus_ac_leistung',
    solax: 'sensor.solax_m_battery_power_charge',
    necharge: 'sensor.necharge_ladeleistung',
    delta: 'sensor.evcc_delta_ac_smart_wallbox_charge_power',
    solax_soc: 'sensor.solax_m_battery_capacity_2',
    marstek_soc: 'sensor.marstek_venus_modbus_soc_batterie'
  });
  function numeric(hass, id) {
    const raw = hass?.states?.[id]?.state;
    if (raw === undefined || raw === 'unknown' || raw === 'unavailable' || raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  // Source convention: grid +export/-import, Marstek +discharge/-charge,
  // SolaX +charge/-discharge. EV loads are parts of the estimated house demand,
  // NOT extra terms in the house balance. Never double-count them.
  function watts(hass, id, defaultUnit='W') {
    const n=numeric(hass,id);
    if(n===null) return null;
    const unit=String(hass?.states?.[id]?.attributes?.unit_of_measurement || defaultUnit)
      .replace(/\s/g,'').toLowerCase();
    const factor=unit==='mw'?1000000:unit==='kw'?1000:1;
    return Math.max(0,n*factor);
  }
  function calculate(hass, entities) {
    const parts=entities.pv.map(id => numeric(hass,id));
    const pv=parts.every(v=>v!==null) ? Math.max(0,parts.reduce((a,b)=>a+b,0)) : null;
    const grid=numeric(hass,entities.grid);
    const marstek=numeric(hass,entities.marstek);
    const solax=numeric(hass,entities.solax);
    const house=[pv,grid,marstek,solax].every(v=>v!==null)
      ? Math.max(0,pv+marstek-solax-grid) : null;
    return {
      pv,grid,marstek,solax,house,
      necharge:watts(hass,entities.necharge,'W'),
      delta:watts(hass,entities.delta,'kW'),
      solax_soc:numeric(hass,entities.solax_soc),
      marstek_soc:numeric(hass,entities.marstek_soc)
    };
  }
  const format = (v) => v === null ? '–' : Math.round(Math.abs(v)).toLocaleString('de-AT');
  const esc = (x) => String(x).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = {
    pv: '☀', grid:'↟',house:'⌂',marstek:'▰',solax:'▰'
  };
  function node(key,label,x,y,w,h) {
    const center=w/2;
    const battery=key==='marstek'||key==='solax';
    const powerY=battery?h-59:h-31;
    const noteY=battery?h-41:h-12;
    const progress=battery?`
      <rect class="soc-track" x="16" y="${h-25}" width="${w-100}" height="10" rx="5"/>
      <rect class="soc-fill" data-soc-bar="${key}_soc" x="16" y="${h-25}" width="0" height="10" rx="5"/>
      <text class="soc-label" data-soc="${key}_soc" x="${w-12}" y="${h-16}"
        text-anchor="end">SoC –</text>`:'';
    return `<g class="node node-${key}" transform="translate(${x} ${y})">
      <rect class="node-surface" width="${w}" height="${h}" rx="20"/>
      <circle class="icon-disk" cx="27" cy="25" r="17"/>
      <text class="node-icon" x="27" y="31" text-anchor="middle">${icon[key]}</text>
      <text class="node-label" x="50" y="29">${label}</text>
      <text class="node-power" data-value="${key}" x="${center}" y="${powerY}"
        text-anchor="middle">– W</text>
      <text class="node-note" data-note="${key}" x="${center}" y="${noteY}"
        text-anchor="middle">Keine Messwerte</text>
      ${progress}
    </g>`;
  }
  function evNode(key,label,x,y,w,h,image) {
    const cx=w/2, compact=w<200;
    const imageWidth=compact?143:169, imageHeight=compact?80:82;
    const imageX=(w-imageWidth)/2, imageY=compact?24:20;
    return `<g class="node node-ev node-${key}" data-ev="${key}" data-state="idle"
          transform="translate(${x} ${y})">
      <rect class="node-surface" width="${w}" height="${h}" rx="20"/>
      <text class="ev-label" x="${cx}" y="18" text-anchor="middle">${label}</text>
      <image class="vehicle-image" href="/local/${image}" x="${imageX}" y="${imageY}"
             width="${imageWidth}" height="${imageHeight}" preserveAspectRatio="xMidYMid meet"/>
      <text class="node-power ev-power" data-value="${key}" x="${cx}" y="${h-22}" text-anchor="middle">– W</text>
      <text class="node-note" data-note="${key}" x="${cx}" y="${h-7}" text-anchor="middle">Keine Messwerte</text>
    </g>`;
  }
  function link(key,d) {
    return `<g class="wire" data-flow="${key}" data-direction="off">
       <path class="track" d="${d}"/>
       <path class="pulse" d="${d}"/>
    </g>`;
  }
  function diagram(mobile=false) {
    const size=mobile?'0 0 370 768':'0 0 860 625';
    const shapes=mobile?{
      pv:[104,12,162,90],grid:[8,153,168,98],house:[98,292,174,105],
      marstek:[194,153,168,120],solax:[104,440,162,130],
      necharge:[5,612,174,142],delta:[191,612,174,142]
    }:{
      pv:[340,15,180,96],grid:[25,177,190,104],house:[336,175,188,112],
      marstek:[645,177,190,128],solax:[340,350,180,130],
      necharge:[45,488,238,124],delta:[577,488,238,124]
    };
    const paths=mobile?{
      pv:'M185 102 L185 292',grid:'M92 251 L146 292',
      marstek:'M278 251 L224 292',solax:'M185 440 L185 397',
      necharge:'M105 388 L72 417 L72 588 L92 588 L92 612',
      delta:'M265 388 L298 417 L298 588 L278 588 L278 612'
    }:{
      pv:'M430 111 L430 175',grid:'M215 229 L336 229',
      marstek:'M645 229 L524 229',solax:'M430 350 L430 287',
      necharge:'M352 287 L352 313 L164 313 L164 488',
      delta:'M508 287 L508 313 L696 313 L696 488'
    };
    return `<svg class="diagram ${mobile?'mobile':'desktop'}" viewBox="${size}"
                 role="img" aria-label="Energiefluss mit PV, Netz, Haus, zwei Batterien und zwei Fahrzeugen">
      <defs>
        <radialGradient id="glow-${mobile?'m':'d'}">
          <stop stop-color="#28e1b3" stop-opacity=".14"/>
          <stop offset="1" stop-color="#28e1b3" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <circle cx="${mobile?185:430}" cy="${mobile?343:231}" r="${mobile?164:194}"
              fill="url(#glow-${mobile?'m':'d'})"/>
      ${Object.entries(paths).map(([k,p])=>link(k,p)).join('')}
      ${node('pv','PV gesamt',...shapes.pv)}
      ${node('grid','Stromnetz',...shapes.grid)}
      ${node('house','Haus ≈',...shapes.house)}
      ${node('marstek','Marstek Battery',...shapes.marstek)}
      ${node('solax','SolaX Battery',...shapes.solax)}
      ${evNode('necharge','NeCharge · Model 3',...shapes.necharge,'tesla-model3-highland-stealth-grey.webp')}
      ${evNode('delta','Delta · Model Y',...shapes.delta,'tesla-modely-juniper-stealth-grey.webp')}
    </svg>`;
  }
  const styles=`
    :host{display:block;min-width:0;color:#132e50}
    ha-card{display:block;overflow:hidden;padding:19px 20px 10px;
      background:linear-gradient(120deg,#eef8ff 0%,#fafdff 45%,#deefff 100%);
      border-radius:24px;border:1px solid rgba(180,214,243,.86);
      box-shadow:0 12px 38px rgba(20,78,137,.14);color:#142e51}
    .header{display:flex;align-items:start;justify-content:space-between;gap:10px;
      flex-wrap:wrap;position:relative;z-index:2}
    .eyebrow{font-size:10px;letter-spacing:.19em;text-transform:uppercase;
      font-weight:800;color:#227bc4;margin-bottom:5px}
    .heading{font-weight:790;font-size:23px;line-height:1.25;color:#122f51}
    .live{display:flex;align-items:center;gap:7px;border:1px solid rgba(83,207,164,.54);
      border-radius:24px;background:rgba(232,255,248,.86);
      padding:7px 12px;color:#139773;font-size:12px;font-weight:750;white-space:nowrap}
    .live:before{content:'';width:7px;height:7px;background:currentColor;
      border-radius:50%;box-shadow:0 0 0 4px rgba(39,184,139,.14)}
    .live[data-online='false']{background:rgba(255,242,222,.94);color:#b67c26}
    .stage{position:relative;isolation:isolate;overflow:hidden;border-radius:20px;
      margin-top:12px;
      background:radial-gradient(ellipse at 50% 46%,#e8f9ff 0%,#d7ecff 80%,#e8f6ff 100%)}
    .stage::before{content:'';position:absolute;z-index:0;inset:-6px;
      background:url("/local/marstek-energy-premium-background.webp?v=056") center/cover no-repeat;
      opacity:.87;pointer-events:none}
    .stage::after{content:'';position:absolute;z-index:0;inset:0;
      background:linear-gradient(180deg,rgba(240,249,255,.34),rgba(242,250,255,.16) 45%,rgba(235,247,255,.43));
      pointer-events:none}
    .diagram{width:100%;max-width:980px;display:block;margin:0 auto;
      position:relative;z-index:1;overflow:visible}
    .diagram.mobile{display:none}
    .node{filter:drop-shadow(0 4px 8px rgba(42,90,141,.12))}
    .node-surface{fill:rgba(239,248,255,.92);stroke:rgba(255,255,255,.98);
      stroke-width:2.2}
    .node-house .node-surface{fill:rgba(227,251,255,.94);stroke:#3dc8f5;
      stroke-width:2.5}
    .node-label{font-family:inherit;fill:#264564;font-size:13px;font-weight:750}
    .node-power{font-family:inherit;fill:#072951;font-size:25px;font-weight:800}
    .node-note{font-family:inherit;fill:#43617f;font-size:11px;font-weight:640}
    .node-icon{font-family:inherit;fill:currentColor;font-size:22px;font-weight:750}
    .icon-disk{fill:currentColor;opacity:.14}
    .node-pv{color:#e4a11c}.node-grid{color:#168ee2}.node-house{color:#08acd3}
    .node-marstek{color:#5465d4}.node-solax{color:#0989c7}
    .soc-track{fill:rgba(125,161,192,.28)}
    .soc-fill{fill:#3b8ce9;transition:width .4s ease}
    .node-solax .soc-fill{fill:#10b990}
    .soc-label{font-family:inherit;fill:#254d72;font-size:11px;font-weight:780}
    .node-ev{color:#08a5c6;transition:opacity .3s ease,filter .3s ease}
    .node-ev[data-state='idle']{opacity:.69;filter:grayscale(.44)}
    .node-ev[data-state='missing']{opacity:.38;filter:grayscale(1)}
    .node-ev[data-state='active']{opacity:1;filter:drop-shadow(0 3px 9px rgba(26,187,220,.26))}
    .node-ev[data-state='active'] .node-surface{stroke:#49cdec;stroke-width:2.5}
    .ev-label{font-family:inherit;fill:#183957;font-size:14px;font-weight:800}
    .ev-power{font-size:21px}
    .vehicle-image{pointer-events:none}
    .wire{color:#119af3}
    .wire[data-flow='pv']{color:#e9ac2b}
    .wire[data-flow='grid']{color:#09b996}
    .wire[data-flow='marstek']{color:#279efa}
    .wire[data-flow='solax']{color:#259ee9}
    .wire[data-flow='necharge'],.wire[data-flow='delta']{color:#11b5e6}
    .track,.pulse{fill:none;stroke-linecap:round;stroke-width:4}
    .track{stroke:currentColor;opacity:.26}
    .pulse{stroke:currentColor;stroke-width:4.5;
      stroke-dasharray:7 13;animation:energy-dash .95s linear infinite;
      opacity:1;filter:drop-shadow(0 0 4px currentColor)}
    .wire[data-direction='off'] .pulse{opacity:0;animation:none}
    .wire[data-direction='reverse'] .pulse{animation-direction:reverse}
    @keyframes energy-dash{to{stroke-dashoffset:-40}}
    .footer{display:flex;justify-content:end;align-items:center;gap:10px;
      flex-wrap:wrap;padding:9px 2px 2px;color:#56758e;font-size:11px}
    @media(max-width:620px){
      ha-card{padding:15px 11px 9px;border-radius:18px}
      .heading{font-size:20px}
      .diagram.desktop{display:none}
      .diagram.mobile{display:block;max-width:420px}
      .node-power{font-size:23px}
      .node-label{font-size:12px}
      .node-note{font-size:10px}
      .soc-label{font-size:10px}
      .ev-label{font-size:12px}
      .ev-power{font-size:20px}
      .footer{font-size:10px}
    }
    @media(prefers-reduced-motion:reduce){
      .pulse{animation:none!important;stroke-dasharray:none;opacity:.50}
      .wire[data-direction='off'] .pulse{opacity:0}
      .soc-fill{transition:none}
    }
  `;
  class MarstekEnergyFlowCard extends HTMLElement {
    constructor(){ super();this.attachShadow({mode:'open'});this._hass=null;this._conf=null; }
    setConfig(config){
      if (!config || !config.entities) throw new Error('entities benötigt: pv[], grid, marstek, solax, solax_soc, marstek_soc');
      const e={...DEFAULT,...config.entities};
      if (!Array.isArray(e.pv) || !e.pv.length) throw new Error('entities.pv muss eine Sensor-Liste sein');
      for (const k of ['grid','marstek','solax','marstek_soc','solax_soc','necharge','delta'])
        if (typeof e[k]!=='string' || !e[k]) throw new Error('entities.'+k+' fehlt');
      this._conf={title:config.title || 'Live-Energiefluss',entities:e};
      this.shadowRoot.innerHTML=`<style>${styles}</style><ha-card>
        <div class="header"><div><div class="eyebrow">MARSTEK · ENERGY STUDIO</div><div class="heading">${esc(this._conf.title)}</div></div>
        <div class="live" data-online="false">LIVE · keine Daten</div></div>
        <div class="stage">${diagram(false)}${diagram(true)}</div>
        <div class="footer">Hausverbrauch ≈ berechnet (inkl. Wallboxen) · Leitungen = Leistungsrichtungen</div>
        </ha-card>`;
      if (this._hass) this._update();
    }
    set hass(hass){this._hass=hass;if(this._conf)this._update();}
    _update(){
      const d=calculate(this._hass,this._conf.entities);
      const any=['pv','grid','marstek','solax'].some(k=>d[k]!==null);
      const live=this.shadowRoot.querySelector('.live');live.dataset.online=String(any);
      live.textContent=any?'LIVE · Messwerte':'LIVE · keine Daten';
      const status = {
        pv: d.pv===null?'Nicht verfügbar':'Erzeugung',
        grid: d.grid===null?'Nicht verfügbar':d.grid>5?'Einspeisung':d.grid < -5?'Netzbezug':'Ausgeglichen',
        marstek: d.marstek===null?'Nicht verfügbar':d.marstek>5?'Entladen':d.marstek < -5?'Laden':'Bereit',
        solax: d.solax===null?'Nicht verfügbar':d.solax>5?'Laden':d.solax < -5?'Entladen':'Bereit',
        house: d.house===null?'Nicht berechenbar':'Bilanz-Schätzwert',
        necharge:d.necharge===null?'Nicht verfügbar':d.necharge>5?'Laden':'Bereit',
        delta:d.delta===null?'Nicht verfügbar':d.delta>5?'Laden':'Bereit'
      };
      for(const k of ['pv','grid','marstek','solax','house','necharge','delta']){
        for(const el of this.shadowRoot.querySelectorAll(`[data-value="${k}"]`)){
          el.textContent=(d[k]===null?'–':format(d[k]))+' W';
        }
        for(const el of this.shadowRoot.querySelectorAll(`[data-note="${k}"]`))el.textContent=status[k];
      }
      for(const key of ['necharge','delta'])
        for(const node of this.shadowRoot.querySelectorAll(`[data-ev="${key}"]`))
          node.dataset.state=d[key]===null?'missing':d[key]>5?'active':'idle';
      for(const k of ['solax_soc','marstek_soc']) {
        const soc=d[k],base=k==='marstek_soc'?'marstek':'solax';
        const trackWidth=(base==='marstek'?190:180)-100;
        for(const el of this.shadowRoot.querySelectorAll(`[data-soc="${k}"]`))
          el.textContent=soc===null?'SoC –':`SoC ${format(soc)} %`;
        for(const bar of this.shadowRoot.querySelectorAll(`[data-soc-bar="${k}"]`))
          bar.setAttribute('width',String(soc===null?0:Math.max(0,Math.min(100,soc))*trackWidth/100));
      }
      const direction = {
        pv:d.pv===null||d.pv<=5?'off':'forward',
        grid:d.grid===null||Math.abs(d.grid)<=5?'off':d.grid<0?'forward':'reverse',
        marstek:d.marstek===null||Math.abs(d.marstek)<=5?'off':d.marstek>0?'forward':'reverse',
        solax:d.solax===null||Math.abs(d.solax)<=5?'off':d.solax<0?'forward':'reverse',
        necharge:d.necharge===null||d.necharge<=5?'off':'forward',
        delta:d.delta===null||d.delta<=5?'off':'forward'
      };
      for(const k of Object.keys(direction))
        for(const el of this.shadowRoot.querySelectorAll(`[data-flow="${k}"]`))
          el.dataset.direction=direction[k];
    }
    getCardSize(){return 7;}
    getGridOptions(){return {columns:'full',rows:'auto'};}
    static getStubConfig(){return {type:'custom:marstek-energy-flow-card',entities:DEFAULT};}
  }
  if(!customElements.get('marstek-energy-flow-card'))customElements.define('marstek-energy-flow-card',MarstekEnergyFlowCard);
  window.customCards=window.customCards||[];
  window.customCards.push({type:'marstek-energy-flow-card',name:'Marstek Energiefluss',description:'Premium-Glass-Energiefluss mit SoC in Batteriekarten, Teslas und Live-Sensoren'});
})();
