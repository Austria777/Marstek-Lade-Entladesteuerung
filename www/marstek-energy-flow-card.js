/* Marstek Energy Flow Card 0.5.5 — frontend-only energy visualization; never writes to devices. */
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
    return `<g class="node node-${key}" transform="translate(${x} ${y})">
      <rect class="node-surface" width="${w}" height="${h}" rx="18"/>
      <circle class="icon-disk" cx="27" cy="25" r="16"/>
      <text class="node-icon" x="27" y="31" text-anchor="middle">${icon[key]}</text>
      <text class="node-label" x="50" y="29">${label}</text>
      <text class="node-power" data-value="${key}" x="${center}" y="${h-31}" text-anchor="middle">– W</text>
      <text class="node-note" data-note="${key}" x="${center}" y="${h-12}" text-anchor="middle">Keine Messwerte</text>
    </g>`;
  }
  function evNode(key,label,x,y,w,h,image) {
    const cx=w/2, compact=w<200;
    const imageWidth=compact?143:169, imageHeight=compact?80:82;
    const imageX=(w-imageWidth)/2, imageY=compact?24:20;
    return `<g class="node node-ev node-${key}" data-ev="${key}" data-state="idle"
          transform="translate(${x} ${y})">
      <rect class="node-surface" width="${w}" height="${h}" rx="18"/>
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
      marstek:[194,153,168,98],solax:[104,440,162,98],
      necharge:[5,612,174,142],delta:[191,612,174,142]
    }:{
      pv:[340,15,180,96],grid:[25,177,190,104],house:[336,175,188,112],
      marstek:[645,177,190,104],solax:[340,350,180,102],
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
    :host{display:block;min-width:0}
    ha-card{display:block;overflow:hidden;padding:20px 22px 10px;background:var(--ha-card-background,var(--card-background-color,#151c2d));color:var(--primary-text-color,#f0f4fb);border-radius:24px;box-shadow:var(--ha-card-box-shadow,0 8px 24px rgba(0,0,0,.08));}
    .header{display:flex;align-items:start;justify-content:space-between;gap:10px;flex-wrap:wrap}
    .eyebrow{font-size:11px;letter-spacing:.15em;text-transform:uppercase;font-weight:800;color:#21a786;margin-bottom:5px}
    .heading{font-weight:760;font-size:21px;line-height:1.2}
    .live{display:flex;align-items:center;gap:7px;border-radius:24px;background:rgba(39,184,139,.12);padding:6px 11px;color:#12ad85;font-size:12px;font-weight:750;white-space:nowrap}
    .live:before{content:'';width:7px;height:7px;background:currentColor;border-radius:50%;box-shadow:0 0 0 4px rgba(39,184,139,.14)}
    .live[data-online='false']{background:rgba(230,154,55,.1);color:#db9a47}
    .diagram{width:100%;max-width:980px;display:block;margin:8px auto -4px;overflow:visible}
    .diagram.mobile{display:none}
    .node-surface{fill:var(--secondary-background-color,rgba(150,160,180,.08));stroke:var(--divider-color,rgba(170,185,205,.24));stroke-width:1.4}
    .node-house .node-surface{stroke:rgba(29,181,143,.58);stroke-width:2;fill:rgba(29,181,143,.075)}
    .node-label{font-family:inherit;fill:var(--secondary-text-color,#a5b0c3);font-size:13px;font-weight:700}
    .node-power{font-family:inherit;fill:var(--primary-text-color,#f0f4fb);font-size:25px;font-weight:780}
    .node-note{font-family:inherit;fill:var(--secondary-text-color,#a5b0c3);font-size:11px}
    .node-icon{font-family:inherit;fill:currentColor;font-size:22px;font-weight:700}
    .icon-disk{fill:currentColor;opacity:.11}
    .node-pv{color:#e6ab38}.node-grid{color:#6e9ef2}.node-house{color:#24bd92}.node-marstek{color:#c18bff}.node-solax{color:#45a9db}
    .node-ev{color:#20aaa2;transition:opacity .3s ease,filter .3s ease}
    .node-ev[data-state='idle']{opacity:.34;filter:grayscale(1)}
    .node-ev[data-state='missing']{opacity:.28;filter:grayscale(1)}
    .node-ev[data-state='active'] .node-surface{stroke:rgba(30,186,158,.9);fill:rgba(30,186,158,.065);stroke-width:2}
    .ev-label{font-family:inherit;fill:var(--primary-text-color,#f0f4fb);font-size:14px;font-weight:750}
    .ev-power{font-size:21px}
    .vehicle-image{pointer-events:none}
    .wire[data-flow='necharge'],.wire[data-flow='delta']{color:#25bca7}

    .wire{color:#60bfa7}.wire[data-flow='pv']{color:#e6ab38}.wire[data-flow='grid']{color:#6e9ef2}.wire[data-flow='marstek']{color:#bb8cff}.wire[data-flow='solax']{color:#45a9db}
    .track,.pulse{fill:none;stroke-linecap:round;stroke-width:4}.track{stroke:currentColor;opacity:.16}.pulse{stroke:currentColor;stroke-dasharray:4 13;animation:energy-dash 1.05s linear infinite;opacity:.9}
    .wire[data-direction='off'] .pulse{opacity:0;animation:none}.wire[data-direction='reverse'] .pulse{animation-direction:reverse}
    @keyframes energy-dash{to{stroke-dashoffset:-34}}
    .footer{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:0 0 8px;color:var(--secondary-text-color,#a5b0c3);font-size:11px}
    .soc-row{display:flex;gap:13px;align-items:center;flex-wrap:wrap}
    .soc{display:flex;gap:6px;align-items:center;font-size:12px}.soc b{color:var(--primary-text-color,#f0f4fb);font-variant-numeric:tabular-nums}
    .soc .spot{width:8px;height:8px;border-radius:50%;background:#bb8cff}.soc.solax .spot{background:#45a9db}
    @media (max-width:620px){ha-card{padding:16px 12px 10px;border-radius:18px}.heading{font-size:19px}.diagram.desktop{display:none}.diagram.mobile{display:block;max-width:420px;margin:10px auto 0}.node-power{font-size:23px}.node-label{font-size:12px}.node-note{font-size:10px}.ev-power{font-size:20px}.ev-label{font-size:12px}.footer{font-size:10px}}
    @media (prefers-reduced-motion:reduce){.pulse{animation:none!important;stroke-dasharray:none;opacity:.52}}
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
        ${diagram(false)}${diagram(true)}
        <div class="footer"><div class="soc-row"><span class="soc"><span class="spot"></span> Marstek <b data-soc="marstek_soc">–</b></span>
        <span class="soc solax"><span class="spot"></span> SolaX <b data-soc="solax_soc">–</b></span></div>
        <span>Hausverbrauch ≈ berechnet (inkl. Wallboxen) · Leitungen = Leistungsrichtungen</span></div>
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
        const el=this.shadowRoot.querySelector(`[data-soc="${k}"]`);
        if(el)el.textContent=d[k]===null?'–':`${format(d[k])} %`;
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
  window.customCards.push({type:'marstek-energy-flow-card',name:'Marstek Energiefluss',description:'Animierter Live-Energiefluss für PV, Netz, Haus, SolaX, Marstek, NeCharge und Delta-Wallbox'});
})();
