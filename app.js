/* app.js */

(function () {
  /* -------------------------
     Constants & Storage Keys
     ------------------------- */
  const META_KEY = 'bsv:meta';
  const PROFILE_KEY_PREFIX = 'bsv:profile:';
  const CATALOG_KEY = 'bsv:catalog';
  const EXPANDED_CARDS_KEY = 'bsv:expanded_cards';

  /* -------------------------
     Expanded State Persistence
     ------------------------- */
  function getExpandedCardIds() {
    try {
      const raw = localStorage.getItem(EXPANDED_CARDS_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch (e) {
      return new Set();
    }
  }

  function saveExpandedCardIds(set) {
    try {
      localStorage.setItem(EXPANDED_CARDS_KEY, JSON.stringify(Array.from(set)));
    } catch (e) { /* ignore */ }
  }

  function setCardExpanded(cardId, isExpanded) {
    const set = getExpandedCardIds();
    if (isExpanded) {
      set.add(cardId);
    } else {
      set.delete(cardId);
    }
    saveExpandedCardIds(set);
  }

  /* -------------------------
     Small utilities
     ------------------------- */
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const nowISO = () => new Date().toISOString();
  const idGen = (prefix = 'id') => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

  /* -------------------------
     Storage & Meta (profiles list)
     ------------------------- */
  function loadMeta() {
    try {
      const raw = localStorage.getItem(META_KEY);
      return raw ? JSON.parse(raw) : initMeta();
    } catch (e) {
      return initMeta();
    }
  }

  function saveMeta(meta) {
    meta.updatedAt = nowISO();
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  }

  function initMeta() {
    const adminId = idGen('p');
    const meta = {
      version: 1,
      profiles: [{ id: adminId, name: 'Admin', createdAt: nowISO(), updatedAt: nowISO() }],
      activeProfileId: adminId,
      createdAt: nowISO(),
      updatedAt: nowISO()
    };
    saveMeta(meta);

    const profile = {
      version: 1, id: adminId, name: 'Admin',
      createdAt: nowISO(), updatedAt: nowISO(),
      musicals: [], songs: []
    };
    saveProfile(profile);

    initCatalog();
    return meta;
  }

  function profileKey(id) { return PROFILE_KEY_PREFIX + id; }

  function loadProfile(id) {
    try {
      const raw = localStorage.getItem(profileKey(id));
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function saveProfile(profile) {
    profile.updatedAt = nowISO();
    localStorage.setItem(profileKey(profile.id), JSON.stringify(profile));
    const meta = loadMeta();
    const p = meta.profiles.find(x => x.id === profile.id);
    if (p) p.updatedAt = profile.updatedAt;
    saveMeta(meta);
  }

  function listProfiles() { return loadMeta().profiles.slice(); }

  function createProfile(name) {
    const meta = loadMeta();
    const id = idGen('p');
    const profile = {
      version: 1, id, name: name || `Profile ${meta.profiles.length + 1}`,
      createdAt: nowISO(), updatedAt: nowISO(),
      musicals: [], songs: []
    };
    meta.profiles.push({ id: profile.id, name: profile.name, createdAt: profile.createdAt, updatedAt: profile.updatedAt });
    meta.activeProfileId = profile.id;
    saveProfile(profile);
    saveMeta(meta);
    return profile;
  }

  function deleteProfile(id) {
    const meta = loadMeta();
    meta.profiles = meta.profiles.filter(p => p.id !== id);
    if (meta.activeProfileId === id) meta.activeProfileId = meta.profiles.length ? meta.profiles[0].id : null;
    saveMeta(meta);
    localStorage.removeItem(profileKey(id));
  }

  function setActiveProfile(id) {
    const meta = loadMeta();
    meta.activeProfileId = id;
    saveMeta(meta);
  }

  function getActiveProfile() {
    const meta = loadMeta();
    if (!meta.activeProfileId) return null;
    return loadProfile(meta.activeProfileId);
  }

  /* -------------------------
     Catalog (shared musicals + songs)
     ------------------------- */
  function initCatalog() {
    try {
      const raw = localStorage.getItem(CATALOG_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    const catalog = { version: 1, musicals: [], songs: [], createdAt: nowISO(), updatedAt: nowISO() };
    saveCatalog(catalog);
    return catalog;
  }

  function loadCatalog() {
    try {
      const raw = localStorage.getItem(CATALOG_KEY);
      return raw ? JSON.parse(raw) : initCatalog();
    } catch (e) { return initCatalog(); }
  }

  function saveCatalog(catalog) {
    catalog.updatedAt = nowISO();
    localStorage.setItem(CATALOG_KEY, JSON.stringify(catalog));
  }

  function addCatalogMusical(musical = {}, songs = []) {
    const catalog = loadCatalog();
    let mid = musical.id || idGen('m');
    if (catalog.musicals.find(m => m.id === mid)) mid = idGen('m');

    const m = {
      id: mid,
      name: musical.name,
      color: musical.color || '#999999',
      createdAt: musical.createdAt || nowISO(),
      updatedAt: nowISO()
    };
    catalog.musicals.push(m);

    (songs || []).forEach(s => {
      let sid = s.id || idGen('s');
      if (catalog.songs.find(x => x.id === sid)) sid = idGen('s');
      const song = {
        id: sid,
        title: s.title,
        musicalId: mid,
        tier: (s.tier === undefined ? null : Math.max(1, Math.min(5, Number(s.tier) || 3))),
        createdAt: s.createdAt || nowISO(),
        updatedAt: nowISO()
      };
      catalog.songs.push(song);
    });

    saveCatalog(catalog);
    return m;
  }

  function deleteCatalogMusical(catalogMusicalId) {
    const catalog = loadCatalog();
    catalog.musicals = catalog.musicals.filter(m => m.id !== catalogMusicalId);
    catalog.songs = catalog.songs.filter(s => s.musicalId !== catalogMusicalId);
    saveCatalog(catalog);
  }

  /* -------------------------
     Profile-level operations
     ------------------------- */
  function addMusical(profile, { name, color } = {}) {
    const m = { id: idGen('m'), name: name || 'New Musical', color: color || '#999999', createdAt: nowISO(), updatedAt: nowISO() };
    profile.musicals.push(m);
    saveProfile(profile);
    return m;
  }

  function deleteMusicalAndSongs(profile, musicalId) {
    profile.songs = profile.songs.filter(s => s.musicalId !== musicalId);
    profile.musicals = profile.musicals.filter(m => m.id !== musicalId);
    setCardExpanded(musicalId, false);
    saveProfile(profile);
  }

  function addSong(profile, { title, musicalId, tier } = {}) {
    const s = {
      id: idGen('s'),
      title: title || 'New Song',
      musicalId: musicalId || null,
      tier: (tier === undefined ? null : Math.max(1, Math.min(5, Number(tier) || 3))),
      createdAt: nowISO(),
      updatedAt: nowISO()
    };
    profile.songs.push(s);
    saveProfile(profile);
    return s;
  }

  function addCatalogMusicalToProfile(profile, catalogMusicalId) {
    const catalog = loadCatalog();
    const cm = catalog.musicals.find(m => m.id === catalogMusicalId);
    if (!cm) throw new Error('Catalog musical not found');

    const newMid = idGen('m');
    const newMusical = { id: newMid, name: cm.name, color: cm.color, createdAt: nowISO(), updatedAt: nowISO() };
    profile.musicals.push(newMusical);

    const csongs = catalog.songs.filter(s => s.musicalId === cm.id);
    csongs.forEach(s => {
      const newSid = idGen('s');
      const ns = { id: newSid, title: s.title, musicalId: newMid, tier: s.tier || null, createdAt: nowISO(), updatedAt: nowISO() };
      profile.songs.push(ns);
    });

    saveProfile(profile);
    return newMusical;
  }

  function addImportedMusicalToProfile(profile, musicalObj, songsArr) {
    if (!musicalObj || (!musicalObj.name && !musicalObj.title)) throw new Error('Invalid musical object');
    const name = musicalObj.name || musicalObj.title || 'Imported Musical';
    const color = musicalObj.color || '#999999';
    const newMid = idGen('m');
    const newMusical = { id: newMid, name, color, createdAt: nowISO(), updatedAt: nowISO() };
    profile.musicals.push(newMusical);

    (songsArr || []).forEach(s => {
      const newSid = idGen('s');
      const ns = {
        id: newSid,
        title: s.title || s.name || 'Song',
        musicalId: newMid,
        tier: (s.tier === undefined ? null : Math.max(1, Math.min(5, Number(s.tier) || 3))),
        createdAt: s.createdAt || nowISO(),
        updatedAt: s.updatedAt || nowISO()
      };
      profile.songs.push(ns);
    });

    saveProfile(profile);
    return newMusical;
  }

  /* -------------------------
     D3 violin rendering
     ------------------------- */
  function loadD3And(fn) {
    if (window.d3) return fn();
    const s = document.createElement('script');
    s.src = 'https://d3js.org/d3.v7.min.js';
    s.onload = fn;
    s.onerror = fn;
    document.head.appendChild(s);
  }

  function kernelEpanechnikov(k) {
    return function (v) {
      v = v / k;
      return Math.abs(v) <= 1 ? 0.75 * (1 - v * v) / k : 0;
    };
  }

  function kernelDensityEstimator(kernel, X) {
    return function (V) {
      return X.map(function (x) {
        return [x, d3.mean(V, function (v) { return kernel(x - v); }) || 0];
      });
    };
  }

  function buildDensity(values) {
    const yMin = 0.4, yMax = 5.6;
    const samplePoints = d3.range(yMin, yMax + 1e-9, (yMax - yMin) / 60);
    const kde = kernelDensityEstimator(kernelEpanechnikov(0.35), samplePoints);
    return kde(values);
  }

  function renderViolin(container, values, options = {}) {
    const width = options.width || (container.clientWidth || 300);
    const height = options.height || (container.clientHeight || 220);
    container.innerHTML = '';
    const svg = d3.select(container).append('svg').attr('width', width).attr('height', height);
    
    const margin = { top: 20, right: 10, bottom: 20, left: 10 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    
    const yScale = d3.scaleLinear().domain([0.4, 5.6]).range([innerH, 0]);

    // Unique gradient ID per container render
    const gradientId = 'violin-gradient-' + Math.random().toString(36).slice(2, 9);
    
    // Define the 5-color vertical gradient
    const defs = svg.append('defs');
    const linearGradient = defs.append('linearGradient')
      .attr('id', gradientId)
      .attr('x1', '0%').attr('y1', '100%') // 1 (Red) at bottom
      .attr('x2', '0%').attr('y2', '0%');   // 5 (Dark Green) at top

    linearGradient.selectAll('stop')
      .data([
        { offset: '0%', color: '#d9534f' },   // 1: Red
        { offset: '25%', color: '#f0ad4e' },  // 2: Yellow
        { offset: '50%', color: '#adba2d' },  // 3: Yellowish Green
        { offset: '75%', color: '#5cb85c' },  // 4: Light Green
        { offset: '100%', color: '#1f7a36' }  // 5: Dark Green
      ])
      .enter().append('stop')
      .attr('offset', d => d.offset)
      .attr('stop-color', d => d.color);

    const validVals = values.filter(v => v !== null && v !== undefined && !isNaN(v)).map(Number);
    
    if (validVals.length > 0) {
      const density = buildDensity(validVals);
      const maxDensity = d3.max(density, d => d[1]) || 1;
      const xScaleDensity = d3.scaleLinear().domain([-maxDensity, maxDensity]).range([0, innerW]);

      const area = d3.area()
        .curve(d3.curveCatmullRom)
        .x0(d => xScaleDensity(-d[1]))
        .x1(d => xScaleDensity(d[1]))
        .y(d => yScale(d[0]));

      g.append('path')
        .datum(density)
        .attr('d', area)
        .attr('fill', `url(#${gradientId})`)
        .attr('stroke', '#222')
        .attr('stroke-width', 1)
        .attr('opacity', 0.85);

      if (options.dotData && options.dotData.length) {
        const densArr = density;
        function densityAt(y) {
          for (let i = 0; i < densArr.length - 1; i++) {
            const a = densArr[i][0], b = densArr[i + 1][0];
            if (y >= a && y <= b) {
              const fa = densArr[i][1], fb = densArr[i + 1][1];
              const t = (y - a) / (b - a);
              return fa + (fb - fa) * t;
            }
          }
          const nearest = densArr.reduce((acc, d) => Math.abs(d[0] - y) < Math.abs(acc[0] - y) ? d : acc, densArr[0]);
          return nearest ? nearest[1] : 0;
        }

        const maxJig = innerW * 0.45;
        const maxDens = d3.max(density, d => d[1]) || 1;
        const dots = g.selectAll('.dot').data(options.dotData, d => d.id);
        const enter = dots.enter().append('circle').attr('r', 5).attr('stroke', '#ffffff').attr('stroke-width', 1.5).attr('opacity', 0.95);
        enter.attr('cx', d => {
          const dens = densityAt(d.y) || 0.001;
          const maxX = maxDens ? (dens / maxDens) * maxJig : 1;
          const r = (Math.random() * 2 - 1) * maxX;
          return xScaleDensity(r);
        }).attr('cy', d => yScale(d.y)).attr('fill', d => d.color || '#333').append('title').text(d => d.title);
      }
    } else {
      g.append('line')
        .attr('x1', innerW / 2)
        .attr('x2', innerW / 2)
        .attr('y1', 0)
        .attr('y2', innerH)
        .attr('stroke', '#d6d0c2')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4 4');
    }

    const tiers = [1, 2, 3, 4, 5];
    g.selectAll('.tier-line').data(tiers).enter()
      .append('line')
      .attr('x1', 0).attr('x2', innerW)
      .attr('y1', d => yScale(d)).attr('y2', d => yScale(d))
      .attr('stroke', 'rgba(0,0,0,0.1)');

    g.selectAll('.tier-label').data(tiers).enter()
      .append('text').attr('x', 4).attr('y', d => yScale(d) - 6).text(d => d)
      .attr('font-size', 11).attr('fill', '#444').attr('font-weight', '600');
  }


  /* -------------------------
     DOM elements
     ------------------------- */
  const profileSelect = qs('#profile-select');
  const btnNewProfile = qs('#btn-new-profile');
  const btnDeleteProfile = qs('#btn-delete-profile');
  const btnClearAll = qs('#btn-clear-all');
  const btnAddMusical = qs('#btn-add-musical');
  const modal = qs('#modal');
  const modalForm = qs('#modal-form');
  const modalClose = qs('#modal-close');
  const overviewEl = qs('#overview-violin');
  const musicalsListEl = qs('#musicals-list');

  const musicalJsonArea = qs('#musical-json');
  const musicalNameInput = qs('#musical-name');
  const musicalColorInput = qs('#musical-color');
  const catalogEmptyMsg = qs('#catalog-empty-msg');
  const modalSaveBtn = qs('#modal-save');
  const catalogListEl = qs('#catalog-list');

  /* -------------------------
     UI rendering
     ------------------------- */
  function populateCatalogList() {
    if (!catalogListEl) return;
    catalogListEl.innerHTML = '';
    const catalog = loadCatalog();
    if (!catalog || !catalog.musicals.length) {
      catalogListEl.innerHTML = '<div class="catalog-empty">No catalog items</div>';
      return;
    }

    const admin = isAdminActive();

    catalog.musicals.forEach(m => {
      const item = document.createElement('div');
      item.className = 'catalog-item';
      item.tabIndex = 0;
      const dot = document.createElement('div'); dot.className = 'catalog-dot'; dot.style.background = m.color || '#999';
      const label = document.createElement('div'); label.textContent = m.name;
      item.appendChild(dot); item.appendChild(label);
      item.dataset.mid = m.id;

      if (admin) {
        // Render Delete button in catalog items when viewing as Admin
        const btnDelete = document.createElement('button');
        btnDelete.className = 'catalog-item-delete';
        btnDelete.textContent = 'Delete';
        btnDelete.addEventListener('click', (e) => {
          e.stopPropagation(); // Prevents clicking the list item itself
          if (!confirm(`Delete "${m.name}" from the global catalog?`)) return;
          deleteCatalogMusical(m.id);
          populateCatalogList();
        });
        item.appendChild(btnDelete);
      } else {
        // Normal profile action: clicking adds catalog item to profile
        item.addEventListener('click', () => {
          try {
            const profile = getActiveProfile();
            if (!profile) return alert('No active profile');
            addCatalogMusicalToProfile(profile, m.id);
            closeModal();
            renderAll();
          } catch (err) {
            alert('Failed to add catalog musical: ' + (err.message || err));
          }
        });
        item.addEventListener('keypress', (e) => { if (e.key === 'Enter' || e.key === ' ') item.click(); });
      }

      catalogListEl.appendChild(item);
    });
  }

  function makeDotData(profile, songs) {
    return (songs || []).filter(s => s.tier !== null && s.tier !== undefined).map(s => {
      const m = profile.musicals.find(x => x.id === s.musicalId) || { color: '#999', name: 'Unknown' };
      return { id: s.id, title: `${s.title} — ${m.name}`, y: s.tier, color: m.color };
    });
  }

  function renderOverview(profile) {
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

  function renderMusicalCards(profile) {
    musicalsListEl.innerHTML = '';
    const expandedSet = getExpandedCardIds();

    (profile.musicals || []).forEach(m => {
      const card = document.createElement('div'); 
      card.className = 'card';
      
      const isExpanded = expandedSet.has(m.id);
      if (isExpanded) {
        card.classList.add('expanded');
      }

      const songsForM = (profile.songs || []).filter(s => s.musicalId === m.id);

      // --- Calculate Statistics ---
      const validScores = songsForM
        .map(s => s.tier)
        .filter(t => t !== null && t !== undefined && !isNaN(t))
        .map(Number)
        .sort((a, b) => a - b);

      let avgStr = 'N/A';
      let medianStr = 'N/A';

      if (validScores.length > 0) {
        const sum = validScores.reduce((acc, val) => acc + val, 0);
        avgStr = (sum / validScores.length).toFixed(1);

        const mid = Math.floor(validScores.length / 2);
        if (validScores.length % 2 === 0) {
          medianStr = ((validScores[mid - 1] + validScores[mid]) / 2).toFixed(1);
        } else {
          medianStr = validScores[mid].toFixed(1);
        }
      }

      const header = document.createElement('div'); header.className = 'card-header';
      const dot = document.createElement('div'); dot.className = 'color-dot'; dot.style.background = m.color;
      
      const title = document.createElement('div'); 
      title.innerHTML = `
        <strong>${m.name}</strong>
        <div style="font-size:0.8rem; color:#666; margin-top:2px;">
          Avg: ${avgStr} | Median: ${medianStr}
        </div>
      `;

      const actions = document.createElement('div'); actions.style.marginLeft = 'auto';
      const btnView = document.createElement('button'); btnView.className = 'small-btn'; 
      btnView.textContent = isExpanded ? 'Collapse' : 'Expand';
      
      const btnDelete = document.createElement('button'); btnDelete.className = 'small-btn'; btnDelete.textContent = 'Delete';
      
      btnView.addEventListener('click', () => {
        const currentlyExpanded = card.classList.contains('expanded');
        const nextExpandedState = !currentlyExpanded;
        
        card.classList.toggle('expanded', nextExpandedState);
        setCardExpanded(m.id, nextExpandedState);
        btnView.textContent = nextExpandedState ? 'Collapse' : 'Expand';
      });

      btnDelete.addEventListener('click', () => {
        if (!confirm(`Delete musical "${m.name}" and its songs?`)) return;
        deleteMusicalAndSongs(profile, m.id);
        renderAll();
      });

      actions.appendChild(btnView); actions.appendChild(btnDelete);
      header.appendChild(dot); header.appendChild(title); header.appendChild(actions);
      card.appendChild(header);

      const violinWrap = document.createElement('div'); violinWrap.className = 'violin';
      card.appendChild(violinWrap);

      const songList = document.createElement('div'); songList.className = 'song-list';
      if (!songsForM.length) {
        const p = document.createElement('p'); p.style.color = '#777'; p.textContent = 'No songs yet'; songList.appendChild(p);
      } else {
        songsForM.forEach(s => {
          const row = document.createElement('div'); row.className = 'song-row';
          const left = document.createElement('div'); left.textContent = s.title;
          const right = document.createElement('div');
          const tier = document.createElement('select');
          const emptyOpt = document.createElement('option'); emptyOpt.value = ''; emptyOpt.textContent = '-'; tier.appendChild(emptyOpt);
          [1, 2, 3, 4, 5].forEach(t => {
            const o = document.createElement('option'); o.value = t; o.textContent = t;
            if (s.tier === t) o.selected = true;
            tier.appendChild(o);
          });
          if (s.tier === null || s.tier === undefined) tier.value = '';
          tier.addEventListener('change', (e) => {
            const val = e.target.value;
            s.tier = val === '' ? null : Number(val);
            saveProfile(profile);
            renderAll();
          });
          right.appendChild(tier);
          row.appendChild(left); row.appendChild(right);
          songList.appendChild(row);
        });
      }
      card.appendChild(songList);

      const vals = songsForM.map(s => s.tier);
      loadD3And(() => {
        renderViolin(violinWrap, vals, { 
          height: 220, 
          fill: 'rgba(255,255,255,0.96)', 
          stroke: '#e0dbcc', 
          dotData: makeDotData(profile, songsForM) 
        });
      });

      musicalsListEl.appendChild(card);
    });
  }

  /* -------------------------
     Modal behavior
     ------------------------- */
  function isAdminActive() {
    const p = getActiveProfile();
    return p && p.name === 'Admin';
  }

  function openModal() {
    modal.classList.remove('hidden');
    const admin = isAdminActive();

    populateCatalogList();

    const modalTitle = qs('#modal-title') || qs('#modal h3') || qs('.modal-title');
    const adminSection = qs('#admin-section');

    if (admin) {
      if (adminSection) adminSection.style.display = 'block';
      if (catalogEmptyMsg) catalogEmptyMsg.style.display = 'none';
      if (modalTitle) modalTitle.textContent = 'Manage Catalog';
    } else {
      if (adminSection) adminSection.style.display = 'none';
      if (modalTitle) modalTitle.textContent = 'Select a Musical';

      const catalog = loadCatalog();
      if (!catalog || !catalog.musicals.length) {
        catalogEmptyMsg.style.display = 'block';
      } else {
        catalogEmptyMsg.style.display = 'none';
      }
    }

    if (musicalJsonArea) musicalJsonArea.value = '';
    if (musicalNameInput) musicalNameInput.value = '';
    if (musicalColorInput) musicalColorInput.value = '#ff7043';
  }

  function closeModal() {
    modal.classList.add('hidden');
    modalForm.reset();
    if (musicalJsonArea) musicalJsonArea.value = '';
  }

  /* -------------------------
     Admin functions
     ------------------------- */
  function clearAllData() {
    if (!isAdminActive()) return alert('Only Admin can clear data.');
    if (!confirm('Delete ALL profiles and catalog data from this browser? This cannot be undone.')) return;
    Object.keys(localStorage).forEach(k => {
      if (k === META_KEY || k === CATALOG_KEY || k.startsWith(PROFILE_KEY_PREFIX) || k === EXPANDED_CARDS_KEY) {
        localStorage.removeItem(k);
      }
    });
    initMeta();
    initCatalog();
    refreshProfileSelect();
    renderAll();
    alert('All data cleared. Admin recreated.');
  }

  /* -------------------------
     Event wiring
     ------------------------- */
  if (btnNewProfile) btnNewProfile.addEventListener('click', () => {
    const name = prompt('New profile name:', 'New Profile'); if (!name) return;
    createProfile(name); refreshProfileSelect(); renderAll();
  });

  if (btnDeleteProfile) btnDeleteProfile.addEventListener('click', () => {
    const meta = loadMeta();
    if (!meta.activeProfileId) return alert('No profile');
    if (!confirm('Delete current profile? This will remove its data locally.')) return;
    deleteProfile(meta.activeProfileId); refreshProfileSelect(); renderAll();
  });

  if (btnClearAll) btnClearAll.addEventListener('click', clearAllData);
  if (profileSelect) profileSelect.addEventListener('change', (e) => { setActiveProfile(e.target.value); renderAll(); });
  if (btnAddMusical) btnAddMusical.addEventListener('click', () => openModal());
  if (modalClose) modalClose.addEventListener('click', closeModal);

  if (modalForm) modalForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const profile = getActiveProfile(); if (!profile) return alert('No active profile');
    const admin = isAdminActive();

    if (admin) {
      const jsonTxt = musicalJsonArea ? musicalJsonArea.value.trim() : '';
      if (jsonTxt) {
        try {
          const parsed = JSON.parse(jsonTxt);
          const musicalObj = parsed.musical || parsed || { name: parsed.name || parsed.title };
          const songsArr = parsed.songs || [];
          addCatalogMusical(musicalObj, songsArr);
          alert('Added musical to catalog.');
        } catch (err) {
          alert('Invalid musical JSON: ' + (err.message || err));
          return;
        }
      } else {
        const name = musicalNameInput ? musicalNameInput.value.trim() : '';
        const color = musicalColorInput ? musicalColorInput.value : '#999999';
        if (!name) return alert('Name required');
        addCatalogMusical({ name, color }, []);
        alert('Added musical to catalog.');
      }
    } else {
      alert('Choose a musical from the list to add it to your profile.');
    }

    closeModal();
    renderAll();
  });

  window.addEventListener('storage', (e) => {
    if (!e.key) return;
    if (e.key === META_KEY || e.key.startsWith(PROFILE_KEY_PREFIX) || e.key === CATALOG_KEY || e.key === null) {
      refreshProfileSelect();
      renderAll();
    }
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').catch(() => { /* ignore */ });
  }

  /* -------------------------
     Initialization
     ------------------------- */
  function refreshProfileSelect() {
    const meta = loadMeta();
    if (!profileSelect) return;
    profileSelect.innerHTML = '';
    meta.profiles.forEach(p => {
      const opt = document.createElement('option'); opt.value = p.id; opt.textContent = p.name;
      if (meta.activeProfileId === p.id) opt.selected = true;
      profileSelect.appendChild(opt);
    });
    updateAdminUI();
  }

  function updateAdminUI() {
    const admin = isAdminActive();
    if (btnClearAll) btnClearAll.style.display = admin ? 'inline-block' : 'none';
    if (!modal.classList.contains('hidden')) openModal();
  }

  function ensureAdminProfile() {
    const meta = loadMeta();
    if (meta.profiles.find(p => p.name === 'Admin')) return;
    const adminId = idGen('p');
    const admin = { version: 1, id: adminId, name: 'Admin', createdAt: nowISO(), updatedAt: nowISO(), musicals: [], songs: [] };
    saveProfile(admin);
    meta.profiles.push({ id: admin.id, name: admin.name, createdAt: admin.createdAt, updatedAt: admin.updatedAt });
    saveMeta(meta);
  }

  function renderAll() {
    const profile = getActiveProfile();
    if (!profile) { if (musicalsListEl) musicalsListEl.innerHTML = '<p>No profile selected</p>'; if (overviewEl) overviewEl.innerHTML = ''; return; }
    renderOverview(profile);
    renderMusicalCards(profile);
    updateAdminUI();
  }

  // boot
  initCatalog();
  ensureAdminProfile();
  refreshProfileSelect();
  renderAll();

  // public debug API
  window.bsv = {
    loadMeta, saveMeta, listProfiles, createProfile, deleteProfile, setActiveProfile,
    getActiveProfile, saveProfile,
    loadCatalog, saveCatalog, addCatalogMusical, deleteCatalogMusical,
    addCatalogMusicalToProfile, addImportedMusicalToProfile,
    renderAll
  };

})();
