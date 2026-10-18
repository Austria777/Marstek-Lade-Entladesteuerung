/* Marstek Energy Flow Card 0.5.7 — sharp house + sample-inspired battery UI; display only. */
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
  // Simple PV, grid and house nodes, all values are updated from HA sensors.
  function node(key,label,x,y,w,h) {
    const cx=w/2;
    return `<g class="node node-${key}" transform="translate(${x} ${y})">
      <rect class="node-surface" width="${w}" height="${h}" rx="19"/>
      <circle class="icon-disk" cx="27" cy="25" r="17"/>
      <text class="node-icon" x="27" y="31" text-anchor="middle">${icon[key]}</text>
      <text class="node-label" x="50" y="29">${label}</text>
      <text class="node-power" data-value="${key}" x="${cx}" y="${h-31}"
        text-anchor="middle">– W</text>
      <text class="node-note" data-note="${key}" x="${cx}" y="${h-12}"
        text-anchor="middle">Keine Messwerte</text>
    </g>`;
  }

  // Battery hardware silhouettes follow the user-approved layout:
  // illustration on the left, measured W and status on the right,
  // and live SoC bar + percentage across the bottom.
  // As inline SVGs these work without installing any extra device images.
  function deviceArtwork(key) {
    if(key==='marstek') {
      return `<g class="battery-art battery-art-marstek">
        <rect x="6" y="6" width="48" height="78" rx="3"
          fill="#9fc5e4" opacity=".32"/>
        <path d="M7 11 L47 8 L53 13 L53 78 L46 83 L7 81 Z"
          fill="#33465f" stroke="#9ec8f3" stroke-width="1.4"/>
        <path d="M47 8 L53 13 L53 78 L46 83Z" fill="#0a2039"/>
        <path d="M10 13 L44 11 L44 79 L10 77 Z" fill="url(#device-m-dark)"/>
        <path d="M47 13 L47 78" stroke="#1ea6ff" stroke-width="2.6"/>
        <rect x="49" y="29" width="3" height="12" rx="1" fill="#081c32"/>
        <text x="27" y="70" font-size="5.5" fill="#dfedfa" letter-spacing="1.2"
              text-anchor="middle" font-family="sans-serif">MARSTEK</text>
        <ellipse cx="30" cy="85" rx="26" ry="3" fill="#3b638b" opacity=".24"/>
      </g>`;
    }
    return `<g class="battery-art battery-art-solax">
      <path d="M9 9 L48 7 L54 13 L54 80 L47 84 L9 82Z"
        fill="#dbe4ee" stroke="#8fa4bc" stroke-width="1.3"/>
      <path d="M48 8 L54 13 L54 80 L48 84Z" fill="#24384f"/>
      <path d="M12 12 L46 11 L46 80 L12 79Z" fill="url(#device-s-light)"/>
      <path d="M14 14 L42 13" stroke="#fff" stroke-width="1.5" opacity=".9"/>
      <rect x="50" y="28" width="3" height="12" rx="1" fill="#0d2435"/>
      <text x="29" y="35" font-size="8" fill="#39465a"
            font-weight="bold" text-anchor="middle" font-family="sans-serif">SolaX</text>
      <ellipse cx="30" cy="85" rx="26" ry="3" fill="#3b638b" opacity=".19"/>
    </g>`;
  }
  function batteryNode(key,label,x,y,w,h){
    const compact=w<190;
    const deviceW=compact?49:58;
    const deviceX=compact?8:11;
    const textX=compact?63:76;
    const headSize=compact?10.5:12.2;
    const powerSize=compact?21:24;
    const barWidth=w-102;
    return `<g class="node node-${key} node-battery" transform="translate(${x} ${y})">
      <rect class="node-surface" width="${w}" height="${h}" rx="20"/>
      <g transform="translate(${deviceX} 11) scale(${deviceW/60})">
        ${deviceArtwork(key)}
      </g>
      <text class="battery-heading" x="${textX}" y="27"
        font-size="${headSize}">${label}</text>
      <text class="node-power battery-power" data-value="${key}"
        x="${textX}" y="60" font-size="${powerSize}" text-anchor="start">– W</text>
      <text class="node-note battery-status" data-note="${key}"
        x="${textX}" y="79" text-anchor="start">Keine Messwerte</text>
      <rect class="soc-track" x="14" y="${h-24}" width="${barWidth}" height="10" rx="5"/>
      <rect class="soc-fill" data-soc-bar="${key}_soc"
        data-full-width="${barWidth}" x="14" y="${h-24}" width="0" height="10" rx="5"/>
      <text class="soc-label" data-soc="${key}_soc" x="${w-10}" y="${h-15}"
        text-anchor="end">SoC –</text>
    </g>`;
  }

  function evNode(key,label,x,y,w,h,image){
    const compact=w<200, cx=w/2;
    const imgWidth=compact?89:122;
    const textX=compact?101:139;
    return `<g class="node node-ev node-${key}" data-ev="${key}" data-state="idle"
        transform="translate(${x} ${y})">
      <rect class="node-surface" width="${w}" height="${h}" rx="19"/>
      <text class="ev-label" x="12" y="22">${label}</text>
      <image class="vehicle-image" href="/local/${image}"
         x="7" y="39" width="${imgWidth}" height="${h-51}"
         preserveAspectRatio="xMidYMid meet"/>
      <text class="node-power ev-power" data-value="${key}"
        x="${textX}" y="${h-47}" text-anchor="start">– W</text>
      <text class="node-note ev-status" data-note="${key}"
        x="${textX}" y="${h-27}" text-anchor="start">Keine Messwerte</text>
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
      marstek:[191,153,174,120],solax:[98,440,174,130],
      necharge:[5,612,174,142],delta:[191,612,174,142]
    }:{
      pv:[340,15,180,96],grid:[25,177,190,104],house:[336,175,188,112],
      marstek:[626,177,226,128],solax:[326,350,208,130],
      necharge:[45,488,238,124],delta:[577,488,238,124]
    };
    const paths=mobile?{
      pv:'M185 102 L185 292',grid:'M92 251 L146 292',
      marstek:'M278 251 L224 292',solax:'M185 440 L185 397',
      necharge:'M105 388 L72 417 L72 588 L92 588 L92 612',
      delta:'M265 388 L298 417 L298 588 L278 588 L278 612'
    }:{
      pv:'M430 111 L430 175',grid:'M215 229 L336 229',
      marstek:'M626 229 L524 229',solax:'M430 350 L430 287',
      necharge:'M352 287 L352 313 L164 313 L164 488',
      delta:'M508 287 L508 313 L696 313 L696 488'
    };
    return `<svg class="diagram ${mobile?'mobile':'desktop'}" viewBox="${size}"
                 role="img" aria-label="Energiefluss mit PV, Netz, Haus, zwei Batterien und zwei Fahrzeugen">
      <defs>
        <linearGradient id="device-m-dark" x1="0" x2="1">
          <stop stop-color="#8496b8"/><stop offset=".44" stop-color="#455b77"/>
          <stop offset="1" stop-color="#20364c"/>
        </linearGradient>
        <linearGradient id="device-s-light" x1="0" x2=".94" y1="0" y2="1">
          <stop stop-color="#fff"/><stop offset=".72" stop-color="#ecf2fa"/>
          <stop offset="1" stop-color="#afc0d4"/>
        </linearGradient>
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
      ${batteryNode('marstek','Marstek Battery',...shapes.marstek)}
      ${batteryNode('solax','SolaX Battery',...shapes.solax)}
      ${evNode('necharge','NeCharge · Model 3',...shapes.necharge,'tesla-model3-highland-stealth-grey.webp')}
      ${evNode('delta','Delta · Model Y',...shapes.delta,'tesla-modely-juniper-stealth-grey.webp')}
    </svg>`;
  }
  // Sharp background scene contains only the building; never static widgets, cars or watts.
  function houseScene(){
    const windows=Array.from({length:9},(_,i)=>`<path d="M${255+i*99} 391 V644" stroke="#244763" stroke-width="8"/>`).join('');
    const solar=Array.from({length:13},(_,i)=>`<path d="M${208+i*27} ${335-i*8} L${245+i*25} ${357-i*7}"
      stroke="#83c8fa" stroke-width="2" opacity=".64"/>`).join('');
    const leaves=Array.from({length:18},(_,i)=>{
      const x=i<9?25+i*17:1220+(i-9)*17;
      const y=365-(i%5)*20;
      return `<ellipse cx="${x}" cy="${y}" rx="49" ry="65" fill="#4b7c7b" opacity=".55"/>`;
    }).join('');
    return `<svg class="house-scene" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 920"
        preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="scene-sky" x2="0" y2="1">
          <stop stop-color="#8bbbe5"/><stop offset=".52" stop-color="#e6f5ff"/>
          <stop offset="1" stop-color="#5a96b7"/>
        </linearGradient>
        <linearGradient id="scene-pool" x2="0" y2="1">
          <stop stop-color="#a4d7f0"/><stop offset=".65" stop-color="#549abd"/>
          <stop offset="1" stop-color="#215878"/>
        </linearGradient>
        <linearGradient id="scene-panels" x2="0" y2="1">
          <stop stop-color="#2a83ca"/><stop offset=".5" stop-color="#0c4388"/>
          <stop offset="1" stop-color="#061e53"/>
        </linearGradient>
        <linearGradient id="scene-windows" x2="0" y2="1">
          <stop stop-color="#4182af"/><stop offset=".32" stop-color="#5b829f"/>
          <stop offset=".64" stop-color="#efc496"/><stop offset="1" stop-color="#eda45d"/>
        </linearGradient>
      </defs>
      <rect width="1440" height="920" fill="url(#scene-sky)"/>
      <path d="M0 414 Q220 343 424 393 Q660 330 894 395 Q1185 345 1440 410
        L1440 680 L0 680Z" fill="#779aa4" opacity=".62"/>
      <path d="M0 475 Q330 425 545 458 Q892 399 1440 471
        L1440 700 L0 700Z" fill="#517980" opacity=".54"/>
      ${leaves}
      <rect x="196" y="359" width="1051" height="345" fill="#dae5e6" stroke="#fff" stroke-width="5"/>
      <rect x="233" y="385" width="978" height="294" fill="#193b56"/>
      <rect x="245" y="393" width="953" height="270" fill="url(#scene-windows)"/>
      <path d="M216 520 H1208" stroke="#0f314d" stroke-width="14"/>
      ${windows}
      <path d="M143 363 L700 175 L1323 369 L1219 396 L699 248 L220 395Z"
        fill="#183b63" stroke="#e0f1ff" stroke-width="7"/>
      <path d="M202 341 L700 202 L1214 355 L1196 378 L699 256 L235 370Z"
        fill="url(#scene-panels)" stroke="#77c0fc" stroke-width="3"/>
      ${solar}
      <path d="M698 202 L699 256 L1196 378" stroke="#79bafa" stroke-width="4"
        fill="none" opacity=".76"/>
      <path d="M177 694 H1250 L1316 753 H115Z" fill="#bdcfd6"/>
      <path d="M0 763 H1440 V920 H0Z" fill="url(#scene-pool)"/>
      <path d="M0 769 Q400 749 765 773 Q1110 750 1440 765"
        fill="none" stroke="#e7f8ff" stroke-width="7" opacity=".78"/>
      <path d="M102 809 Q390 788 613 815 T1140 811" fill="none"
        stroke="#c7f4fd" stroke-width="2" opacity=".35"/>
      <path d="M103 864 Q466 846 654 865 T1302 865" fill="none"
        stroke="#b1e6fc" stroke-width="2" opacity=".25"/>
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
    .house-scene{position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none}
    .stage::after{content:'';position:absolute;z-index:0;inset:0;
      background:linear-gradient(180deg,rgba(240,249,255,.11),rgba(239,248,255,.15) 55%,rgba(236,247,255,.21));
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
    .node-battery .node-surface{fill:rgba(235,247,255,.96)}
    .battery-heading{font-family:inherit;font-weight:800;fill:#15365c}
    .battery-status{font-size:11px}
    .battery-art{pointer-events:none}
    .node-battery .battery-power{fill:#102c52}

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
    .ev-status{font-size:11px}
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
      .ev-power{font-size:19px}
      .battery-status{font-size:10px}
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
        <div class="stage">${houseScene()}${diagram(false)}${diagram(true)}</div>
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
        // Each responsive battery node stores its own precise track width.
        for(const el of this.shadowRoot.querySelectorAll(`[data-soc="${k}"]`))
          el.textContent=soc===null?'SoC –':`SoC ${format(soc)} %`;
        for(const bar of this.shadowRoot.querySelectorAll(`[data-soc-bar="${k}"]`))
          bar.setAttribute('width',String(soc===null?0:
            Math.max(0,Math.min(100,soc))*Number(bar.getAttribute('data-full-width'))/100));
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
  window.customCards.push({type:'marstek-energy-flow-card',name:'Marstek Energiefluss',description:'Premium-Glass-Live-Energiefluss mit realistisch gestalteten Batteriekarten und scharfem Haus'});
})();
