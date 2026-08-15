// app.js - profiles + storage + UI + D3 violin rendering + service-worker registration
(function(){
  // --- Utilities ---
  const META_KEY = 'bsv:meta';
  const PROFILE_KEY_PREFIX = 'bsv:profile:'; // full key = PROFILE_KEY_PREFIX + profileId

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

  // Export/import helpers (profile-level)
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
  function importProfileJson(jsonStr){
    try {
      const parsed = JSON.parse(jsonStr);
      // basic validation
      if(!parsed || !parsed.id || !parsed.name) throw new Error('Invalid profile');
      const meta = loadMeta();
      // avoid id collision: if exists, generate new id
      if(meta.profiles.find(p => p.id === parsed.id)){
        parsed.id = idGen('p');
      }
      parsed.createdAt = parsed.createdAt || nowISO();
      parsed.updatedAt = nowISO();
      saveProfile(parsed);
      meta.profiles.push({ id: parsed.id, name: parsed.name, createdAt: parsed.createdAt, updatedAt: parsed.updatedAt });
      meta.activeProfileId = parsed.id;
      saveMeta(meta);
      return parsed;
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
  const songMusicalSelect = qs('#song-musical');
  const modalForm = qs('#modal-form');
  const modalTitle = qs('#modal-title');
  const modalClose = qs('#modal-close');
  const overviewEl = qs('#overview-violin');
  const musicalsList
