// app.js - profiles + storage + catalog + UI + D3 violin rendering + service-worker registration
(function(){
  // --- Utilities ---
  const META_KEY = 'bsv:meta';
  const PROFILE_KEY_PREFIX = 'bsv:profile:'; // full key = PROFILE_KEY_PREFIX + profileId
  const CATALOG_KEY = 'bsv:catalog';

  function idGen(prefix='id'){ return prefix + '-' + Math.random().toString(36).slice(2,9); }
  const qs = (s, r=document) => r.querySelector(s);
  const qsa = (s, r=document) => Array.from(r.querySelectorAll(s));
  const nowISO = () => new Date().toISOString();

  // --- Storage / Meta / Profile API ---
  function loadMeta(){
    try {
      const raw = localStorage.getItem(META_KEY);
      if(!raw) return initMeta();
      return JSON.parse(raw);
    } catch(e){ return initMeta(); }
  }
  function saveMeta(meta){
    meta.updatedAt = nowISO();
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  }
  function initMeta(){
    // Create a single default profile if none exists
    const profileId = idGen('p');
    const meta = {
      version: 1,
      profiles: [{ id: profileId, name: 'Default', createdAt: nowISO(), updatedAt: nowISO() }],
      activeProfileId: profileId,
      createdAt: nowISO(),
      updatedAt: nowISO()
    };
    saveMeta(meta);
    // create empty profile
    const defaultProfile = {
      version: 1,
      id: profileId,
      name: 'Default',
      createdAt: nowISO(),
      updatedAt: nowISO(),
      musicals: [],
      songs: []
    };
    saveProfile(defaultProfile);
    // ensure catalog exists
    initCatalog();
    // ensure admin profile exists (but don't switch to it)
    ensureAdminProfile();
    return meta;
  }

  function profileKey(id){ return PROFILE_KEY_PREFIX + id; }

  function loadProfile(id){
    try {
      const raw = localStorage.getItem(profileKey(id));
      if(!raw) return null;
      return JSON.parse(raw);
    } catch(e){ return null; }
  }
  function saveProfile(profile){
    profile.updatedAt = nowISO();
    localStorage.setItem(profileKey(profile.id), JSON.stringify(profile));
    // also update meta profile entry updatedAt
    const meta = loadMeta();
    const p = meta.profiles.find(x => x.id === profile.id);
    if(p) p.updatedAt = profile.updatedAt;
    saveMeta(meta);
  }

  function listProfiles(){
    const meta = loadMeta();
    return meta.profiles.slice();
  }
  function createProfile(name){
    const meta = loadMeta();
    const id = idGen('p');
    const profile = {
      version: 1,
      id,
      name: name || `Profile ${meta.profiles.length+1}`,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      musicals: [],
      songs: []
    };
    meta.profiles.push({ id: profile.id, name: profile.name, createdAt: profile.createdAt, updatedAt: profile.updatedAt });
    meta.activeProfileId = profile.id;
    saveProfile(profile);
    saveMeta(meta);
    return profile;
  }
  function deleteProfile(id){
    const meta = loadMeta();
    meta.profiles = meta.profiles.filter(p => p.id !== id);
    if(meta.activeProfileId === id) meta.activeProfileId = meta.profiles.length ? meta.profiles[0].id : null;
    saveMeta(meta);
    localStorage.removeItem(profileKey(id));
  }
  function setActiveProfile(id){
    const meta = loadMeta();
    meta.activeProfileId = id;
    saveMeta(meta);
  }
  function getActiveProfile(){
    const meta = loadMeta();
    if(!meta.activeProfileId) return null;
    return loadProfile(meta.activeProfileId);
  }

  // --- Catalog (shared musicals + songs) ---
  function initCatalog(){
    try {
      const raw = localStorage.getItem(CATALOG_KEY);
      if(raw) return JSON.parse(raw);
    } catch(e){}
    const catalog = { version: 1, musicals: [], songs: [], createdAt: nowISO(), updatedAt: nowISO() };
    saveCatalog(catalog);
    return catalog;
  }
  function loadCatalog(){
    try {
      const raw = localStorage.getItem(CATALOG_KEY);
      if(!raw) return initCatalog();
      return JSON.parse(raw);
    } catch(e){ return initCatalog(); }
  }
  function saveCatalog(catalog){
    catalog.updatedAt = nowISO();
    localStorage.setItem(CATALOG_KEY, JSON.stringify(catalog));
  }
  // Add a musical and its songs to the catalog (ids may be regenerated on collision)
  function addCatalogMusical(musical, songs){
    const catalog = loadCatalog();
    // ensure unique musical id
    let mid = musical.id || idGen('m');
    if(catalog.musicals.find(m => m.id === mid)) mid = idGen('m');
    const m = {
      id: mid,
      name: musical.name,
      color: musical.color || '#999999',
      createdAt: musical.createdAt || nowISO(),
      updatedAt: nowISO()
    };
    catalog.musicals.push(m);
    // add songs: ensure ids and set musicalId to mid
    songs = songs || [];
    songs.forEach(s => {
      let sid = s.id || idGen('s');
      if(catalog.songs.find(x => x.id === sid)) sid = idGen('s');
      const song = {
        id: sid,
        title: s.title,
        musicalId: mid,
        tier: Math.max(1,Math.min(5, Number(s.tier)||3)),
        createdAt: s.createdAt || nowISO(),
        updatedAt: nowISO()
      };
      catalog.songs.push(song);
    });
    saveCatalog(catalog);
    return m;
  }

  // Import a musical JSON string into catalog
  // Accepts:
  // { type: "musical", musical: {...}, songs: [...] }
  // or { musical: {...}, songs: [...] }
  function importMusicalJson(jsonStr){
    try {
      const parsed = JSON.parse(jsonStr);
      const musical = parsed.musical || parsed;
      const songs = parsed.songs || parsed.songs || [];
      if(!musical || !musical.name) throw new Error('No musical found in import');
      return addCatalogMusical(musical, songs);
    } catch(e){
      throw e;
    }
  }

  // --- App logic for musicals & songs (operate on active profile) ---
  function addMusical(profile, {name, color}){
    const m = { id: idGen('m'), name: name || 'New Musical', color: color || '#999999', createdAt: nowISO(), updatedAt: nowISO() };
    profile.musicals.push(m);
    saveProfile(profile);
    return m;
  }
  function editMusical(profile, id, updates){
    const m = profile.musicals.find(x => x.id === id); if(!m) return null;
    Object.assign(m, updates); m.updatedAt = nowISO(); saveProfile(profile); return m;
  }
  function deleteMusicalAndSongs(profile, id){
    profile.songs = profile.songs.filter(s => s.musicalId !== id);
    profile.musicals = profile.musicals.filter(m => m.id !== id);
    saveProfile(profile);
  }
  function addSong(profile, {title, musicalId, tier}){
    const s = { id: idGen('s'), title: title || 'New Song', musicalId: musicalId || null, tier: Math.max(1,Math.min(5, Number(tier)||3)), createdAt: nowISO(), updatedAt: nowISO() };
    profile.songs.push(s); saveProfile(profile); return s;
  }
  function editSong(profile, id, updates){
    const s = profile.songs.find(x => x.id === id); if(!s) return null;
    Object.assign(s, updates); s.updatedAt = nowISO(); saveProfile(profile); return s;
  }
  function deleteSong(profile, id){
    profile.songs = profile.songs.filter(x => x.id !== id); saveProfile(profile);
  }

  // Clone a catalog musical (and its songs) into a profile (generates new ids)
  function addCatalogMusicalToProfile(profile, catalogMusicalId){
    const catalog = loadCatalog();
    const cm = catalog.musicals.find(m => m.id === catalogMusicalId);
    if(!cm) throw new Error('Catalog musical not found');
    // clone musical
    const newMid = idGen('m');
    const newMusical = { id: newMid, name: cm.name, color: cm.color, createdAt: nowISO(), updatedAt: nowISO() };
    profile.musicals.push(newMusical);
    // clone songs belonging to cm
    const csongs = catalog.songs.filter(s => s.musicalId === cm.id);
    csongs.forEach(s => {
      const newSid = idGen('s');
      const ns = { id: newSid, title: s.title, musicalId: newMid, tier: s.tier || 3, createdAt: nowISO(), updatedAt: nowISO() };
      profile.songs.push(ns);
    });
    saveProfile(profile);
    return newMusical;
  }

  // --- Export/import helpers (profile-level) - export kept for backups only ---
  function exportProfile(profile){
    const name = (profile && profile.name) ? profile.name.replace(/\s+/g,'_') : 'profile';
    const blob = new Blob([JSON.stringify(profile, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `broadway-profile-${name}-${(new Date()).toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // --- DOM wiring & rendering ---
  // Elements
  const profileSelect = qs('#profile-select');
  const btnNewProfile = qs('#btn-new-profile');
  const btnDeleteProfile = qs('#btn-delete-profile');
  const btnAddMusical = qs('#btn-add-musical');
  const btnAddSong = qs('#btn-add-song');
  const btnExport = qs('#btn-export');
  const btnImport = qs('#btn-import');
  const importFileInput = qs('#import-file');
  const modal = qs('#modal');
  const modalType = qs('#modal-type');
  const musicalFields = qs('#musical-fields');
  const songFields = qs('#song-fields');
  // we'll add a catalog select in musicalFields
  let catalogSelect = null;
  const songMusicalSelect = qs('#song-musical');
  const modalForm = qs('#modal-form');
  const modalTitle = qs('#modal-title');
  const modalClose = qs('#modal-close');
  const overviewEl = qs('#overview-violin');
  const musicalsListEl = qs('#musicals-list');

  // Modal helpers
  function openModal(type){
    modal.classList.remove('hidden');
    modalType.value = type;
    onModalTypeChange();
    modalTitle.textContent = type === 'musical' ? 'Add Musical' : 'Add Song';
    if(type === 'song') populateSongMusicals();
    if(type === 'musical') populateCatalogSelect();
  }
  function closeModal(){ modal.classList.add('hidden'); modalForm.reset(); }

  function onModalTypeChange(){
    const val = modalType.value;
    musicalFields.classList.toggle('hidden', val !== 'musical');
    songFields.classList.toggle('hidden', val !== 'song');
  }

  // Profile UI functions
  function refreshProfileSelect(){
    const meta = loadMeta();
    profileSelect.innerHTML = '';
    meta.profiles.forEach(p => {
      const opt = document.createElement('option'); opt.value = p.id; opt.textContent = p.name;
      if(meta.activeProfileId === p.id) opt.selected = true;
      profileSelect.appendChild(opt);
    });
  }

  // Render everything for active profile
  function renderAll(){
    const profile = getActiveProfile();
    if(!profile){
      musicalsListEl.innerHTML = '<p>No profile selected</p>';
      overviewEl.innerHTML = '';
      return;
    }
    renderOverview(profile);
    renderMusicalCards(profile);
  }

  // --- Violin rendering using D3 (dynamically loaded) ---
  function loadD3And(fn){
    if(window.d3) return fn();
    const s = document.createElement('script');
    s.src = 'https://d3js.org/d3.v7.min.js';
    s.onload = fn;
    s.onerror = fn; // continue even if CDN blocked (app will fail gracefully)
    document.head.appendChild(s);
  }

  function buildDensity(values){
    const yMin = 1, yMax = 5;
    const samplePoints = d3.range(yMin, yMax + 1e-9, (yMax - yMin)/60);
    const kde = kernelDensityEstimator(kernelEpanechnikov(0.35), samplePoints);
    return kde(values);
  }
  function kernelDensityEstimator(kernel, X) {
    return function(V) {
      return X.map(function(x) {
        return [x, d3.mean(V, function(v){ return kernel(x - v); }) || 0];
      });
    };
  }
  function kernelEpanechnikov(k) {
    return function(v){
      v = v / k;
      return Math.abs(v) <= 1 ? 0.75 * (1 - v*v) / k : 0;
    };
  }

  function renderViolin(container, values, options = {}){
    const width = options.width || (container.clientWidth || 560);
    const height = options.height || (container.clientHeight || 260);
    container.innerHTML = '';
    const svg = d3.select(container).append('svg').attr('width', width).attr('height', height);
    const margin = {top:10,right:10,bottom:10,left:10};
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    const yScale = d3.scaleLinear().domain([1,5]).range([innerH,0]);
    const density = buildDensity(values.map(Number));
    const maxDensity = d3.max(density, d => d[1]) || 1;
    const xScale = d3.scaleLinear().domain([-maxDensity, maxDensity]).range([0, innerW]);

    const area = d3.area()
      .curve(d3.curveCatmullRom)
      .x0(d => xScale(-d[1]))
      .x1(d => xScale(d[1]))
      .y(d => yScale(d[0]));

    g.append('path')
      .datum(density)
      .attr('d', area)
      .attr('fill', options.fill || 'rgba(255,255,255,0.95)')
      .attr('stroke', options.stroke || '#c9c4b8')
      .attr('stroke-width', 1.2);

    // tier gridlines
    const tiers = [1,2,3,4,5];
    g.selectAll('.tier-line').data(tiers).enter()
      .append('line')
      .attr('x1',0).attr('x2',innerW)
      .attr('y1',d=>yScale(d)).attr('y2',d=>yScale(d))
      .attr('stroke','rgba(0,0,0,0.04)');

    // density helper
    const densArr = density;
    function densityAt(y){
      for(let i=0;i<densArr.length-1;i++){
        const a = densArr[i][0], b = densArr[i+1][0];
        if(y >= a && y <= b){
          const fa = densArr[i][1], fb = densArr[i+1][1];
          const t = (y - a) / (b - a);
          return fa + (fb - fa) * t;
        }
      }
      // fallback nearest
      const nearest = densArr.reduce((acc,d)=> Math.abs(d[0]-y) < Math.abs(acc[0]-y) ? d : acc, densArr[0]);
      return nearest ? nearest[1] : 0;
    }

    // dots
    if(options.dotData && options.dotData.length){
      const maxJig = innerW * 0.45;
      const maxDens = d3.max(density, d => d[1]) || 1;
      const dots = g.selectAll('.dot').data(options.dotData, d => d.id);
      const enter = dots.enter().append('circle').attr('r', 5).attr('stroke', '#2222').attr('opacity', 0.95);
      enter.attr('cx', d => {
        const dens = densityAt(d.y) || 0.001;
        const maxX = maxDens ? (dens / maxDens) * maxJig : 1;
        const r = (Math.random()*2 - 1) * maxX;
        return xScale(r);
      }).attr('cy', d => yScale(d.y)).attr('fill', d => d.color || '#999').append('title').text(d => d.title);
    }

    // small tier labels
    g.selectAll('.tier-label').data(tiers).enter()
      .append('text').attr('x',4).attr('y',d=>yScale(d)-6).text(d=>d).attr('font-size',11).attr('fill','#777');
  }

  function makeDotData(profile, songs){
    return songs.map(s => {
      const m = profile.musicals.find(x => x.id === s.musicalId) || {color:'#999', name:'Unknown'};
      return { id: s.id, title: `${s.title} — ${m.name}`, y: s.tier, color: m.color };
    });
  }

  function renderOverview(profile){
    const vals = profile.songs.map(s => s.tier);
    loadD3And(() => {
      renderViolin(overviewEl, vals, {
        width: overviewEl.clientWidth || 900,
        height: 260,
        fill: 'rgba(247,243,236,0.95)',
        stroke: '#d6d0c2',
        dotData: makeDotData(profile, profile.songs)
      });
    });
  }

  function renderMusicalCards(profile){
    musicalsListEl.innerHTML = '';
    profile.musicals.forEach(m => {
      const card = document.createElement('div'); card.className = 'card';
      const header = document.createElement('div'); header.className = 'card-header';
      const dot = document.createElement('div'); dot.className = 'color-dot'; dot.style.background = m.color;
      const title = document.createElement('div'); title.innerHTML = `<strong>${m.name}</strong>`;
      const actions = document.createElement('div'); actions.style.marginLeft='auto';
      const btnView = document.createElement('button'); btnView.className = 'small-btn'; btnView.textContent = 'Expand';
      const btnDelete = document.createElement('button'); btnDelete.className = 'small-btn'; btnDelete.textContent = 'Delete';
      btnView.addEventListener('click', ()=> card.classList.toggle('expanded'));
      btnDelete.addEventListener('click', ()=> {
        if(!confirm(`Delete musical "${m.name}" and its songs?`)) return;
        deleteMusicalAndSongs(profile, m.id);
        renderAll();
      });
      actions.appendChild(btnView); actions.appendChild(btnDelete);
      header.appendChild(dot); header.appendChild(title); header.appendChild(actions);
      card.appendChild(header);

      const violinWrap = document.createElement('div'); violinWrap.className = 'violin';
      card.appendChild(violinWrap);

      const songList = document.createElement('div'); songList.className = 'song-list';
      const songsForM = profile.songs.filter(s => s.musicalId === m.id);
      if(songsForM.length === 0){
        const p = document.createElement('p'); p.style.color = '#777'; p.textContent = 'No songs yet';
        songList.appendChild(p);
      } else {
        songsForM.forEach(s => {
          const row = document.createElement('div'); row.className = 'song-row';
          const left = document.createElement('div'); left.textContent = s.title;
          const right = document.createElement('div');
          const tier = document.createElement('select');
          [1,2,3,4,5].forEach(t => {
            const o = document.createElement('option'); o.value = t; o.textContent = t;
            if(t === s.tier) o.selected = true;
            tier.appendChild(o);
          });
          tier.addEventListener('change', (e) => {
            s.tier = Number(e.target.value); saveProfile(profile); renderAll();
          });
          const del = document.createElement('button'); del.className = 'small-btn'; del.textContent = 'Delete';
          del.addEventListener('click', ()=> {
            if(!confirm('Delete song?')) return;
            deleteSong(profile, s.id); renderAll();
          });
          right.appendChild(tier); right.appendChild(del);
          row.appendChild(left); row.appendChild(right);
          songList.appendChild(row);
        });
      }
      card.appendChild(songList);

      // attach violin
      const vals = songsForM.map(s => s.tier);
      loadD3And(() => {
        renderViolin(violinWrap, vals, {
          height: 140,
          fill: 'rgba(255,255,255,0.96)',
          stroke: '#e0dbcc',
          dotData: makeDotData(profile, songsForM)
        });
      });

      musicalsListEl.appendChild(card);
    });
  }

  // --- UI helpers (catalog select, song musicals) ---
  function populateSongMusicals(){
    const profile = getActiveProfile();
    songMusicalSelect.innerHTML = '';
    if(!profile) return;
    profile.musicals.forEach(m => {
      const opt = document.createElement('option'); opt.value = m.id; opt.textContent = m.name;
      songMusicalSelect.appendChild(opt);
    });
    if(profile.musicals.length === 0){
      const opt = document.createElement('option'); opt.value = ''; opt.textContent = '— no musicals —';
      songMusicalSelect.appendChild(opt);
    }
  }

  function populateCatalogSelect(){
    if(!catalogSelect){
      // create and insert a catalog select into musicalFields
      const wrap = document.createElement('div');
      wrap.style.marginTop = '6px';
      wrap.innerHTML = `<label>Or choose from catalog: <select id="catalog-select"></select></label>`;
      musicalFields.appendChild(wrap);
      catalogSelect = qs('#catalog-select');
    }
    catalogSelect.innerHTML = '';
    const catalog = loadCatalog();
    if(!catalog || !catalog.musicals.length){
      const opt = document.createElement('option'); opt.value = ''; opt.textContent = '— no catalog items —';
      catalogSelect.appendChild(opt);
      return;
    }
    const emptyOpt = document.createElement('option'); emptyOpt.value = ''; emptyOpt.textContent = '— create new musical —';
    catalogSelect.appendChild(emptyOpt);
    catalog.musicals.forEach(m => {
      const opt = document.createElement('option'); opt.value = m.id; opt.textContent = m.name;
      catalogSelect.appendChild(opt);
    });
  }

  // --- Wiring events ---
  btnNewProfile.addEventListener('click', () => {
    const name = prompt('New profile name:','New Profile');
    if(!name) return;
    createProfile(name);
    refreshProfileSelect();
    renderAll();
  });

  btnDeleteProfile.addEventListener('click', () => {
    const meta = loadMeta();
    if(!meta.activeProfileId) return alert('No profile');
    if(!confirm('Delete current profile? This will remove its data locally.')) return;
    deleteProfile(meta.activeProfileId);
    refreshProfileSelect();
    renderAll();
  });

  profileSelect.addEventListener('change', (e) => {
    setActiveProfile(e.target.value);
    renderAll();
  });

  btnAddMusical.addEventListener('click', () => openModal('musical'));
  btnAddSong.addEventListener('click', () => openModal('song'));
  modalClose.addEventListener('click', closeModal);
  modalType.addEventListener('change', onModalTypeChange);
  modalForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const profile = getActiveProfile();
    if(!profile) return alert('No active profile');
    if(modalType.value === 'musical'){
      // if catalog selected, clone it into profile
      const chosenCatalogId = catalogSelect ? catalogSelect.value : '';
      if(chosenCatalogId){
        try {
          addCatalogMusicalToProfile(profile, chosenCatalogId);
        } catch(err){
          alert('Failed to add catalog musical: ' + (err.message || err));
        }
      } else {
        const name = qs('#musical-name').value.trim();
        const color = qs('#musical-color').value;
        if(!name) return alert('Name required');
        addMusical(profile, {name, color});
      }
    } else {
      const title = qs('#song-title').value.trim();
      const mid = qs('#song-musical').value;
      const tier = Number(qs('#song-tier').value);
      if(!title) return alert('Song title required');
      addSong(profile, {title, musicalId: mid, tier});
    }
    closeModal();
    renderAll();
  });

  // Import / Export wiring
  btnExport.addEventListener('click', () => {
    const profile = getActiveProfile();
    if(!profile) return alert('No profile to export');
    exportProfile(profile);
  });

  btnImport.addEventListener('click', () => importFileInput.click());

  importFileInput.addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if(!f) return;
    try {
      const txt = await f.text();
      const parsed = JSON.parse(txt);
      // detect musical import (has musical + songs or type: musical)
      const isMusical = parsed.type === 'musical' || parsed.musical || (parsed.name && parsed.songs);
      const active = getActiveProfile();
      if(isMusical){
        // require Admin profile to add to catalog
        if(!active || active.name !== 'Admin'){
          alert('To import a single musical into the shared catalog, switch to the "Admin" profile and try again.');
        } else {
          importMusicalJson(txt);
          alert('Imported musical into catalog.');
        }
      } else if(parsed && parsed.id && parsed.name && (parsed.musicals || parsed.songs)){
        // fallback: full profile import - create a new profile (keeps backwards compatibility)
        // if id collides, generate a new id
        const meta = loadMeta();
        if(meta.profiles.find(p => p.id === parsed.id)) parsed.id = idGen('p');
        parsed.createdAt = parsed.createdAt || nowISO();
        parsed.updatedAt = nowISO();
        saveProfile(parsed);
        meta.profiles.push({ id: parsed.id, name: parsed.name, createdAt: parsed.createdAt, updatedAt: parsed.updatedAt });
        meta.activeProfileId = parsed.id;
        saveMeta(meta);
        alert('Imported full profile as new profile: ' + parsed.name);
      } else {
        alert('Unrecognized import format. Expecting either a musical JSON (type: "musical" with "musical" + "songs") or a full profile JSON.');
      }
      refreshProfileSelect();
      renderAll();
    } catch(err){
      alert('Import failed: ' + (err.message || err));
    } finally {
      importFileInput.value = '';
    }
  });

  // storage event: update UI when other tab changes data
  window.addEventListener('storage', (e) => {
    if(!e.key) return;
    if(e.key === META_KEY || e.key.startsWith(PROFILE_KEY_PREFIX) || e.key === CATALOG_KEY || e.key === null){
      refreshProfileSelect();
      renderAll();
    }
  });

  // register service worker (best-effort)
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('/service-worker.js')
      .then(() => console.log('Service Worker registered'))
      .catch(err => console.warn('Service Worker registration failed', err));
  }

  // init UI helpers
  function ensureAdminProfile(){
    const meta = loadMeta();
    if(meta.profiles.find(p => p.name === 'Admin')) return;
    // create admin profile but don't activate it (we'll leave current active untouched)
    const adminId = idGen('p');
    const admin = {
      version: 1,
      id: adminId,
      name: 'Admin',
      createdAt: nowISO(),
      updatedAt: nowISO(),
      musicals: [],
      songs: []
    };
    saveProfile(admin);
    meta.profiles.push({ id: admin.id, name: admin.name, createdAt: admin.createdAt, updatedAt: admin.updatedAt });
    saveMeta(meta);
  }

  // init UI
  initCatalog();
  refreshProfileSelect();
  renderAll();

  // expose for debugging
  window.bsv = {
    loadMeta, saveMeta, listProfiles, createProfile, deleteProfile,
    getActiveProfile, saveProfile, addMusical, addSong, editSong, deleteSong, renderAll,
    // catalog APIs
    loadCatalog, saveCatalog, addCatalogMusical, addCatalogMusicalToProfile, importMusicalJson
  };

})();
