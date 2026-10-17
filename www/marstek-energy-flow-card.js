/* Marstek Energy Flow Card 0.4.1 — frontend only; does not control equipment. */
(() => {
  'use strict';
  const DEFAULT = Object.freeze({
    pv: ['sensor.pv_leistung_gesamt'],
    grid: 'sensor.solax_m_measured_power',
    marstek: 'sensor.marstek_venus_modbus_ac_leistung',
    solax: 'sensor.solax_m_battery_power_charge',
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
  // SolaX +charge/-discharge. Never silently replace missing data with zero.
  function calculate(hass, entities) {
    const parts = entities.pv.map(id => numeric(hass,id));
    const pv = parts.every(v => v !== null) ? Math.max(0, parts.reduce((a,b) => a+b,0)) : null;
    const grid = numeric(hass,entities.grid);
    const marstek = numeric(hass,entities.marstek);
    const solax = numeric(hass,entities.solax);
    const house = [pv,grid,marstek,solax].every(v=>v !== null)
      ? Math.max(0,pv + marstek - solax - grid) : null;
    return {
      pv,grid,marstek,solax,house,
      solax_soc: numeric(hass,entities.solax_soc),
      marstek_soc: numeric(hass,entities.marstek_soc)
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
  function link(key,d) {
    return `<g class="wire" data-flow="${key}" data-direction="off">
       <path class="track" d="${d}"/>
       <path class="pulse" d="${d}"/>
    </g>`;
  }
  function diagram(mobile=false) {
    const size = mobile ? '0 0 370 610':'0 0 720 458';
    const shapes= mobile ? {
      pv:[105,18,160,92],grid:[9,181,162,92],house:[98,325,174,103],marstek:[198,181,162,92],solax:[105,494,160,92]
    }:{pv:[275,15,170,96],grid:[14,178,185,106],house:[267,177,186,110],marstek:[521,178,185,106],solax:[275,350,170,96]};
    const paths = mobile ? {
      pv:'M185 110 L185 325',grid:'M90 273 L151 325',marstek:'M279 273 L219 325',solax:'M185 494 L185 428'
    }:{pv:'M360 111 L360 177',grid:'M199 231 L267 231',marstek:'M521 231 L453 231',solax:'M360 350 L360 287'};
    return `<svg class="diagram ${mobile?'mobile':'desktop'}" viewBox="${size}" aria-hidden="true">
      <defs>
        <radialGradient id="glow-${mobile?'m':'d'}"><stop stop-color="#28e1b3" stop-opacity=".14"/><stop offset="1" stop-color="#28e1b3" stop-opacity="0"/></radialGradient>
      </defs>
      <circle cx="${mobile?185:360}" cy="${mobile?375:232}" r="${mobile?158:190}" fill="url(#glow-${mobile?'m':'d'})"/>
      ${Object.entries(paths).map(([k,p])=>link(k,p)).join('')}
      ${node('pv','PV gesamt',...shapes.pv)}
      ${node('grid','Stromnetz',...shapes.grid)}
      ${node('house','Haus ≈',...shapes.house)}
      ${node('marstek','Marstek',...shapes.marstek)}
      ${node('solax','SolaX',...shapes.solax)}
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
    .diagram{width:100%;max-width:920px;display:block;margin:8px auto -4px;overflow:visible}
    .diagram.mobile{display:none}
    .node-surface{fill:var(--secondary-background-color,rgba(150,160,180,.08));stroke:var(--divider-color,rgba(170,185,205,.24));stroke-width:1.4}
    .node-house .node-surface{stroke:rgba(29,181,143,.58);stroke-width:2;fill:rgba(29,181,143,.075)}
    .node-label{font-family:inherit;fill:var(--secondary-text-color,#a5b0c3);font-size:13px;font-weight:700}
    .node-power{font-family:inherit;fill:var(--primary-text-color,#f0f4fb);font-size:25px;font-weight:780}
    .node-note{font-family:inherit;fill:var(--secondary-text-color,#a5b0c3);font-size:11px}
    .node-icon{font-family:inherit;fill:currentColor;font-size:22px;font-weight:700}
    .icon-disk{fill:currentColor;opacity:.11}
    .node-pv{color:#e6ab38}.node-grid{color:#6e9ef2}.node-house{color:#24bd92}.node-marstek{color:#c18bff}.node-solax{color:#45a9db}
    .wire{color:#60bfa7}.wire[data-flow='pv']{color:#e6ab38}.wire[data-flow='grid']{color:#6e9ef2}.wire[data-flow='marstek']{color:#bb8cff}.wire[data-flow='solax']{color:#45a9db}
    .track,.pulse{fill:none;stroke-linecap:round;stroke-width:4}.track{stroke:currentColor;opacity:.16}.pulse{stroke:currentColor;stroke-dasharray:4 13;animation:energy-dash 1.05s linear infinite;opacity:.9}
    .wire[data-direction='off'] .pulse{opacity:0;animation:none}.wire[data-direction='reverse'] .pulse{animation-direction:reverse}
    @keyframes energy-dash{to{stroke-dashoffset:-34}}
    .footer{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:0 0 8px;color:var(--secondary-text-color,#a5b0c3);font-size:11px}
    .soc-row{display:flex;gap:13px;align-items:center;flex-wrap:wrap}
    .soc{display:flex;gap:6px;align-items:center;font-size:12px}.soc b{color:var(--primary-text-color,#f0f4fb);font-variant-numeric:tabular-nums}
    .soc .spot{width:8px;height:8px;border-radius:50%;background:#bb8cff}.soc.solax .spot{background:#45a9db}
    @media (max-width:620px){ha-card{padding:16px 12px 10px;border-radius:18px}.heading{font-size:19px}.diagram.desktop{display:none}.diagram.mobile{display:block;max-width:420px;margin:10px auto 0}.node-power{font-size:23px}.node-label{font-size:12px}.node-note{font-size:10px}.footer{font-size:10px}}
    @media (prefers-reduced-motion:reduce){.pulse{animation:none!important;stroke-dasharray:none;opacity:.52}}
  `;
  class MarstekEnergyFlowCard extends HTMLElement {
    constructor(){ super();this.attachShadow({mode:'open'});this._hass=null;this._conf=null; }
    setConfig(config){
      if (!config || !config.entities) throw new Error('entities benötigt: pv[], grid, marstek, solax, solax_soc, marstek_soc');
      const e={...DEFAULT,...config.entities};
      if (!Array.isArray(e.pv) || !e.pv.length) throw new Error('entities.pv muss eine Sensor-Liste sein');
      for (const k of ['grid','marstek','solax','marstek_soc','solax_soc'])
        if (typeof e[k]!=='string' || !e[k]) throw new Error('entities.'+k+' fehlt');
      this._conf={title:config.title || 'Live-Energiefluss',entities:e};
      this.shadowRoot.innerHTML=`<style>${styles}</style><ha-card>
        <div class="header"><div><div class="eyebrow">MARSTEK · ENERGY STUDIO</div><div class="heading">${esc(this._conf.title)}</div></div>
        <div class="live" data-online="false">LIVE · keine Daten</div></div>
        ${diagram(false)}${diagram(true)}
        <div class="footer"><div class="soc-row"><span class="soc"><span class="spot"></span> Marstek <b data-soc="marstek_soc">–</b></span>
        <span class="soc solax"><span class="spot"></span> SolaX <b data-soc="solax_soc">–</b></span></div>
        <span>Hausverbrauch ≈ berechnet · Leitungen = Leistungsrichtungen</span></div>
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
        house: d.house===null?'Nicht berechenbar':'Bilanz-Schätzwert'
      };
      for(const k of ['pv','grid','marstek','solax','house']){
        for(const el of this.shadowRoot.querySelectorAll(`[data-value="${k}"]`)){
          el.textContent=(d[k]===null?'–':format(d[k]))+' W';
        }
        for(const el of this.shadowRoot.querySelectorAll(`[data-note="${k}"]`))el.textContent=status[k];
      }
      for(const k of ['solax_soc','marstek_soc']) {
        const el=this.shadowRoot.querySelector(`[data-soc="${k}"]`);
        if(el)el.textContent=d[k]===null?'–':`${format(d[k])} %`;
      }
      const direction = {
        pv:d.pv===null||d.pv<=5?'off':'forward',
        grid:d.grid===null||Math.abs(d.grid)<=5?'off':d.grid<0?'forward':'reverse',
        marstek:d.marstek===null||Math.abs(d.marstek)<=5?'off':d.marstek>0?'forward':'reverse',
        solax:d.solax===null||Math.abs(d.solax)<=5?'off':d.solax<0?'forward':'reverse'
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
  window.customCards.push({type:'marstek-energy-flow-card',name:'Marstek Energiefluss',description:'Animierter Live-Energiefluss für PV, Netz, Haus, SolaX und Marstek'});
})();
