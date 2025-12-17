let DEFAULT_LOCK_DATES = {};
const CONFERENCE_ORDER = ['AFC', 'NFC'];
const DIVISION_ORDER = ['East', 'North', 'South', 'West'];
const STAT_DIVISION_ORDER = ['North', 'East', 'South', 'West'];
let AVAILABLE_SEASONS = [];
let SEASON_METADATA = [];
const PREDICTION_SEASON_KEY = 'nflp_prediction_season';
const CO_PLAYER_STORAGE_KEY = 'nflp_co_players';
const ACTIVE_PREDICTOR_KEY = 'nflp_active_predictor';
const LINEUP_SOURCE_KEY = 'nflp_lineup_source';
let predictionSeason = localStorage.getItem(PREDICTION_SEASON_KEY) || '';
let teamLogos = {};

let teams = [];
let cachedUsers = [];
let seasonTipParticipants = [];

function buildTeamNameLookup(list) {
  return list.reduce((acc, team) => {
    acc[normalizeTeamKey(team.name)] = team.name;
    return acc;
  }, {});
}

function splitTeamName(teamName) {
  const parts = teamName.split(' ');
  if (parts.length === 1) return { city: teamName, alias: '' };
  const alias = parts.pop();
  return { city: parts.join(' '), alias };
}

function normalizeTeamKey(label = '') {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9 ]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

let teamNameLookup = buildTeamNameLookup(teams);

function ensureValidSeasonSelection() {
  const availableValues = AVAILABLE_SEASONS.map(season => season.value);
  if (!availableValues.includes(predictionSeason) && availableValues.length) {
    predictionSeason = availableValues[0];
    localStorage.setItem(PREDICTION_SEASON_KEY, predictionSeason);
  }
}

function applyMetadata({ seasons = [], teams: teamList = [] } = {}) {
  if (Array.isArray(seasons) && seasons.length) {
    SEASON_METADATA = seasons.map(item => ({
      season: item.season,
      label: item.label || `Saison ${item.season}`,
      lock_date: item.lock_date,
      completed: Boolean(item.completed),
    }));

    AVAILABLE_SEASONS = SEASON_METADATA.map(item => ({
      value: item.season,
      label: item.label || `Saison ${item.season}`,
    }));

    DEFAULT_LOCK_DATES = SEASON_METADATA.reduce((acc, season) => {
      if (season.lock_date) {
        acc[season.season] = season.lock_date;
      }
      return acc;
    }, { ...DEFAULT_LOCK_DATES });
  }

  if (Array.isArray(teamList) && teamList.length) {
    teams = teamList.map(team => ({
      name: team.name,
      conference: team.conference,
      division: team.division,
      league: team.league || 'NFL',
      logo: team.logo_url,
    }));

    teamLogos = teams.reduce((acc, team) => {
      if (team.logo) acc[team.name] = team.logo;
      return acc;
    }, {});
  }

  teamNameLookup = buildTeamNameLookup(teams);
  ensureValidSeasonSelection();
}

async function loadMetadata() {
  try {
    const data = await apiClient.metadata();
    applyMetadata(data);
  } catch (err) {
    console.warn('Metadaten konnten nicht geladen werden, benutze Defaults.', err);
    applyMetadata();
  }
}

const API_BASE_URL = '/api.php';
const API_ENABLED = true;

function ensureApiAvailable() {
  return true; // API ist immer erreichbar
}

const apiClient = {
  async request(path, options = {}) {
	ensureApiAvailable();
    const response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    });

    let data = {};
    try {
      data = await response.json();
    } catch (err) {
      // ignore
    }

    if (!response.ok) {
      const error = new Error(data.error || 'Unbekannter Fehler.');
      error.response = data;
      throw error;
    }
    return data;
  },
  register(payload) {
    return this.request('/auth/register', { method: 'POST', body: JSON.stringify(payload) });
  },
  login(payload) {
    return this.request('/auth/login', { method: 'POST', body: JSON.stringify(payload) });
  },
  logout() {
    return this.request('/auth/logout', { method: 'POST' });
  },
  me() {
    return this.request('/auth/me');
  },
  updateProfile(payload) {
    return this.request('/auth/profile', { method: 'PUT', body: JSON.stringify(payload) });
  },
  metadata() {
    return this.request('/metadata');
  },
  updateLockDate(season, lockDate) {
    return this.request(`/metadata/seasons/${encodeURIComponent(season)}/lock-date`, {
      method: 'PUT',
      body: JSON.stringify({ lock_date: lockDate }),
    });
  },
  createSeason(payload) {
    return this.request('/metadata/seasons', { method: 'POST', body: JSON.stringify(payload) });
  },
  updateSeason(season, payload) {
    return this.request(`/metadata/seasons/${encodeURIComponent(season)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
  listTips() {
    return this.request('/tips');
  },
  saveTip(payload) {
    return this.request('/tips', { method: 'POST', body: JSON.stringify(payload) });
  },
  listSeasonTips(season) {
    const query = season ? `?season=${encodeURIComponent(season)}` : '';
    return this.request(`/tips${query}`);
  },
  listUsers(season) {
    const query = season ? `?season=${encodeURIComponent(season)}` : '';
    return this.request(`/users${query}`);
  },
  updateUserRole(userId, role) {
    return this.request(`/users/${userId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    });
  },
  saveLineupSource(payload) {
    return this.request('/lineup/source', { method: 'POST', body: JSON.stringify(payload) });
  },
  getLineupSource() {
    return this.request('/lineup/source');
  },
  getLineupRoster(roster) {
    const query = roster ? `?roster=${encodeURIComponent(roster)}` : '';
    return this.request(`/lineup/roster${query}`);
  },
  getLineupRecommendations(roster) {
    const query = roster ? `?roster=${encodeURIComponent(roster)}` : '';
    return this.request(`/lineup/recommendations${query}`);
  },
};

const auth = {
  currentUserEmail: '',
  profiles: {},
  async init() {
    if (!API_ENABLED) return;
	try {
      const { user } = await apiClient.me();
      this.mergeUser(user);
      await this.syncTips();
    } catch (err) {
      this.currentUserEmail = '';
    }
  },
  mergeUser(user, tips = []) {
    if (!user?.email) return;
    const existing = this.profiles[user.email] || { predictionsBySeason: {} };
    const predictionsBySeason = { ...(existing.predictionsBySeason || {}) };
    tips.forEach(tip => {
      if (tip.payload) {
        predictionsBySeason[tip.season] = tip.payload;
      }
    });

    if (!predictionsBySeason[predictionSeason]) {
      predictionsBySeason[predictionSeason] = defaultPredictions();
    }

    const roleValue = user.user_group ?? user.role ?? existing.role ?? 'user';
    const normalizedRole = typeof roleValue === 'string' ? roleValue.trim().toLowerCase() : 'user';

    this.profiles[user.email] = {
      ...existing,
      ...user,
      favorite: user.favorite_team ?? existing.favorite ?? user.favorite ?? '',
      role: normalizedRole,
      predictionsBySeason,
    };
    this.currentUserEmail = user.email;
  },
  mergeUsersWithTips(users = [], season = predictionSeason) {
    if (!Array.isArray(users)) return;
    const activeEmail = this.currentUserEmail;
    users.forEach(user => {
      if (!user?.email) return;
      const tipPayload = user.tip_payload || null;
      const tipEntries = tipPayload ? [{ season, payload: tipPayload }] : [];
      this.mergeUser(user, tipEntries);
    });
    if (activeEmail) {
      this.currentUserEmail = activeEmail;
    }
  },
  get users() {
    return Object.values(this.profiles);
  },
  get currentUser() {
    return this.currentUserEmail;
  },
  getUser(email) {
    if (!this.profiles[email]) return null;
    const profile = this.profiles[email];
    return {
      ...profile,
      predictionsBySeason: profile.predictionsBySeason || { [predictionSeason]: defaultPredictions() },
    };
  },
  async register({ name, email, password, passwordConfirmation }) {
    ensureApiAvailable();
    const { user } = await apiClient.register({
      name,
      email,
      password,
      password_confirmation: passwordConfirmation,
    });
    this.mergeUser(user);
    await this.syncTips();
    return user;
  },
  async login(email, password) {
    ensureApiAvailable();
	const { user } = await apiClient.login({ email, password });
    this.mergeUser(user);
    await this.syncTips();
    return user;
  },
  async logout() {
    if (!API_ENABLED) return;
	await apiClient.logout().catch(() => {});
    this.currentUserEmail = '';
    this.profiles = {};
  },
  async updateProfile(email, payload) {
    if (!this.profiles[email]) return;
    ensureApiAvailable();
	const { user } = await apiClient.updateProfile(payload);
    this.mergeUser(user);
  },
  async syncTips() {
    if (!API_ENABLED) return;
	if (!this.currentUserEmail) return;
    try {
      const { tips } = await apiClient.listTips();
      const predictionsBySeason = tips.reduce((acc, tip) => {
        if (tip.payload) {
          acc[tip.season] = tip.payload;
        }
        return acc;
      }, {});

      const current = this.profiles[this.currentUserEmail] || { email: this.currentUserEmail };
      this.profiles[this.currentUserEmail] = {
        ...current,
        predictionsBySeason: { ...(current.predictionsBySeason || {}), ...predictionsBySeason },
      };

      const merged = this.profiles[this.currentUserEmail].predictionsBySeason || {};
      if (!merged[predictionSeason]) {
        merged[predictionSeason] = defaultPredictions();
        this.profiles[this.currentUserEmail].predictionsBySeason = merged;
      }
    } catch (err) {
      console.warn('Tipps konnten nicht synchronisiert werden.', err);
    }
  },
  async updatePredictions(email, predictions, season = predictionSeason) {
    const user = this.profiles[email];
    if (!user) return;
    this.profiles[email] = {
      ...user,
      predictionsBySeason: { ...(user.predictionsBySeason || {}), [season]: predictions },
    };
    ensureApiAvailable();
	await apiClient.saveTip({ season, payload: predictions });
  },
};

const elements = {
  loginForm: document.getElementById('loginForm'),
  registerForm: document.getElementById('registerForm'),
  loginStatus: document.getElementById('loginStatus'),
  registerStatus: document.getElementById('registerStatus'),
  showRegister: document.getElementById('showRegister'),
  showLogin: document.getElementById('showLogin'),
  welcomeArea: document.getElementById('welcomeArea'),
  welcomeName: document.getElementById('welcomeName'),
  welcomeEmail: document.getElementById('welcomeEmail'),
  logoutBtn: document.getElementById('logoutBtn'),
  tabs: document.getElementById('tabs'),
  welcomeHero: document.getElementById('welcomeHero'),
  tabButtons: document.querySelectorAll('.tab-link'),
  tabPanes: document.querySelectorAll('.tab-pane'),
  profileForm: document.getElementById('profileForm'),
  profileName: document.getElementById('profileName'),
  profileEmail: document.getElementById('profileEmail'),
  profileFavorite: document.getElementById('profileFavorite'),
  profileStatus: document.getElementById('profileStatus'),
  lockInfo: document.getElementById('lockInfo'),
  predictionsContent: document.getElementById('predictionsContent'),
  seasonPicker: document.getElementById('seasonPicker'),
  savePredictions: document.getElementById('savePredictions'),
  predictionStatus: document.getElementById('predictionStatus'),
  startNow: document.getElementById('startNow'),
  authArea: document.getElementById('authArea'),
  coPlayerSelect: document.getElementById('coPlayerSelect'),
  addCoPlayer: document.getElementById('addCoPlayer'),
  editCoPlayer: document.getElementById('editCoPlayer'),
  deleteCoPlayer: document.getElementById('deleteCoPlayer'),
  statsContent: document.getElementById('statsContent'),
  refreshStats: document.getElementById('refreshStats'),
  lineupForm: document.getElementById('lineupForm'),
  lineupRosterInput: document.getElementById('lineupRosterInput'),
  lineupRemember: document.getElementById('lineupRemember'),
  lineupLoadOnce: document.getElementById('lineupLoadOnce'),
  lineupStatus: document.getElementById('lineupStatus'),
  lineupSavedInfo: document.getElementById('lineupSavedInfo'),
  lineupStarters: document.getElementById('lineupStarters'),
  lineupBench: document.getElementById('lineupBench'),
  lineupRefresh: document.getElementById('lineupRefresh'),
  overviewContent: document.getElementById('overviewContent'),
  overviewStatus: document.getElementById('overviewStatus'),
  exportCsv: document.getElementById('exportCsv'),
  exportPdf: document.getElementById('exportPdf'),
  lockSeasonSelect: document.getElementById('lockSeasonSelect'),
  lockDateInput: document.getElementById('lockDateInput'),
  lockDateStatus: document.getElementById('lockDateStatus'),
  saveLockDate: document.getElementById('saveLockDate'),
  membersContent: document.getElementById('membersContent'),
  membersStatus: document.getElementById('membersStatus'),
  adminTab: document.getElementById('adminTab'),
  adminTabLink: document.getElementById('adminTabLink'),
  seasonForm: document.getElementById('seasonForm'),
  seasonValue: document.getElementById('seasonValue'),
  seasonLabel: document.getElementById('seasonLabel'),
  seasonLockDate: document.getElementById('seasonLockDate'),
  seasonCompleted: document.getElementById('seasonCompleted'),
  seasonFormStatus: document.getElementById('seasonFormStatus'),
  adminSeasonList: document.getElementById('adminSeasonList'),
  adminStatus: document.getElementById('adminStatus'),
  roleForm: document.getElementById('roleForm'),
  roleUserSelect: document.getElementById('roleUserSelect'),
  roleValueSelect: document.getElementById('roleValueSelect'),
  roleStatus: document.getElementById('roleStatus'),
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getFallbackSeason() {
  return predictionSeason || AVAILABLE_SEASONS[0]?.value || String(new Date().getFullYear());
}

function getLockDates() {
  return { ...DEFAULT_LOCK_DATES };
}

function saveLockDates(lockDates) {
  DEFAULT_LOCK_DATES = { ...lockDates };
}

function getLockDateForSeason(season = predictionSeason) {
  const lockDates = getLockDates();
  const fallbackSeason = getFallbackSeason();
  const value = lockDates[season] || lockDates[fallbackSeason] || null;
  return new Date(value || Date.now());
}

function formatLockDateForInput(date) {
  const pad = num => String(num).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function defaultPredictions() {
  const divisionCounts = {};
  return teams.reduce((acc, team) => {
    const divisionKey = `${team.conference}-${team.division}`;
    const nextRank = ((divisionCounts[divisionKey] || 0) % 4) + 1;
    divisionCounts[divisionKey] = nextRank;
    acc[team.name] = { divisionRank: nextRank, wins: 0, losses: 0 };
    return acc;
  }, {});
}

function sortByName(list) {
  return [...list].sort((a, b) => {
    const nameA = (a?.name || a?.email || '').toLowerCase();
    const nameB = (b?.name || b?.email || '').toLowerCase();
    return nameA.localeCompare(nameB, 'de');
  });
}

function getUserRole(user) {
  const value = user?.role || user?.user_group || 'user';
  return typeof value === 'string' ? value.trim().toLowerCase() : 'user';
}

function sortUsersByRole(users = []) {
  const roleRank = role => (role === 'admin' ? 0 : 1);
  return [...users].sort((a, b) => {
    const roleA = getUserRole(a);
    const roleB = getUserRole(b);
    const rankDiff = roleRank(roleA) - roleRank(roleB);
    if (rankDiff !== 0) return rankDiff;
    const nameA = (a?.name || a?.email || '').toLowerCase();
    const nameB = (b?.name || b?.email || '').toLowerCase();
    return nameA.localeCompare(nameB, 'de');
  });
}

function readCoPlayers() {
  return JSON.parse(localStorage.getItem(CO_PLAYER_STORAGE_KEY) || '[]');
}

function saveCoPlayers(list) {
  localStorage.setItem(CO_PLAYER_STORAGE_KEY, JSON.stringify(list));
}

function getActivePredictor() {
  const fallback = { type: 'user', id: auth.currentUser || '' };
  try {
    return JSON.parse(localStorage.getItem(ACTIVE_PREDICTOR_KEY)) || fallback;
  } catch (err) {
    console.error('Aktiver Mitspieler konnte nicht geladen werden.', err);
    return fallback;
  }
}

function setActivePredictor({ type = 'user', id = '' }) {
  const normalized = { type: type === 'co' ? 'co' : 'user', id: id || '' };
  localStorage.setItem(ACTIVE_PREDICTOR_KEY, JSON.stringify(normalized));
  return normalized;
}

function migratePredictions(user, season = predictionSeason) {
  if (!user) return defaultPredictions();
  const fallbackSeason = getFallbackSeason();
  const predictionsBySeason = {
    ...(user.predictionsBySeason || {}),
  };

  if (!Object.keys(predictionsBySeason).length) {
    predictionsBySeason[fallbackSeason] = user.predictions || defaultPredictions();
  }

  if (!predictionsBySeason[season]) {
    predictionsBySeason[season] = defaultPredictions();
  }

  if (auth.profiles[user.email]) {
    auth.profiles[user.email] = {
      ...auth.profiles[user.email],
      predictionsBySeason,
    };
  }
  return predictionsBySeason[season];
}

function migrateCoPlayerPredictions(player, season = predictionSeason) {
  if (!player) return defaultPredictions();

  const fallbackSeason = getFallbackSeason();
  const predictionsBySeason = { ...(player.predictionsBySeason || {}) };
  if (!Object.keys(predictionsBySeason).length && player.predictions) {
    predictionsBySeason[fallbackSeason] = player.predictions;
  }

  if (!predictionsBySeason[season]) {
    predictionsBySeason[season] = defaultPredictions();
  }

  const coPlayers = readCoPlayers();
  const updated = coPlayers.map(p => (p.id === player.id ? { ...p, predictionsBySeason } : p));
  saveCoPlayers(updated);

  return predictionsBySeason[season];
}

function buildParticipantsFromCachedUsers(users = [], season = predictionSeason) {
  return users
    .filter(user => user?.has_tip || user?.tip_payload)
    .map(user => ({
      id: user.id,
      email: user.email || '',
      name: user.name || user.email || 'Unbekannt',
      favorite: user.favorite_team || '',
      user_group: (user.user_group || 'user').toLowerCase(),
      has_tip: Boolean(user.has_tip),
      predictionsBySeason: {
        [season]: user.tip_payload || defaultPredictions(),
      },
    }));
}

function normalizePrediction(prediction = {}) {
  return {
    divisionRank: clamp(Number(prediction.divisionRank) || 1, 1, 4),
    wins: clamp(Number(prediction.wins) || 0, 0, 17),
    losses: clamp(Number(prediction.losses) || 0, 0, 17),
  };
}

function findTeamByLabel(label = '') {
  const key = normalizeTeamKey(label);
  return teamNameLookup[key] || null;
}

function sortTeams() {
  return [...teams].sort((a, b) => {
    if (a.league !== b.league) return a.league.localeCompare(b.league);
    if (a.conference !== b.conference) {
      return CONFERENCE_ORDER.indexOf(a.conference) - CONFERENCE_ORDER.indexOf(b.conference);
    }
    if (a.division !== b.division) {
      return DIVISION_ORDER.indexOf(a.division) - DIVISION_ORDER.indexOf(b.division);
    }
    return a.name.localeCompare(b.name);
  });
}

function getTeamLogo(teamName) {
  return teamLogos[teamName] || '';
}

function renderTeamLabel(name) {
  const wrapper = document.createElement('div');
  wrapper.className = 'team-label';

  const logo = document.createElement('img');
  logo.className = 'team-logo';
  logo.src = getTeamLogo(name);
  logo.alt = `${name} Logo`;
  logo.loading = 'lazy';

  const text = document.createElement('span');
  text.textContent = name;

  wrapper.appendChild(logo);
  wrapper.appendChild(text);
  return wrapper;
}

function populateTeamSelect() {
  if (!elements.profileFavorite) return;
  elements.profileFavorite.innerHTML = '';
  teams.forEach(team => {
    const option = document.createElement('option');
    option.value = team.name;
    option.textContent = `${team.name} (${team.conference} ${team.division})`;
    elements.profileFavorite.appendChild(option);
  });
}

function populateSeasonPicker() {
  if (!elements.seasonPicker) return;
  elements.seasonPicker.innerHTML = '';
  AVAILABLE_SEASONS.forEach(season => {
    const option = document.createElement('option');
    option.value = season.value;
    option.textContent = season.label;
    elements.seasonPicker.appendChild(option);
  });
  elements.seasonPicker.value = predictionSeason;
}

function populateLockSeasonSelect() {
  if (!elements.lockSeasonSelect) return;
  elements.lockSeasonSelect.innerHTML = '';
  AVAILABLE_SEASONS.forEach(season => {
    const option = document.createElement('option');
    option.value = season.value;
    option.textContent = season.label;
    elements.lockSeasonSelect.appendChild(option);
  });
  elements.lockSeasonSelect.value = predictionSeason;
  updateLockDateForm();
}

function refreshCoPlayerSelect() {
  if (!elements.coPlayerSelect) return;
  const active = getActivePredictor();

  const options = [];

  if (auth.currentUser) {
    const currentUser = auth.getUser(auth.currentUser);
    const baseName = currentUser ? currentUser.name || currentUser.email : 'Eigenes Profil';
    options.push({
      value: `user:${auth.currentUser}`,
      label: currentUser ? `Du (${baseName})` : 'Eigenes Profil',
      sortKey: (baseName || '').toLowerCase(),
    });
  }

  sortByName(readCoPlayers()).forEach(player => {
    options.push({
      value: `co:${player.id}`,
      label: player.name || 'Mitspieler',
      sortKey: (player.name || '').toLowerCase(),
    });
  });

  elements.coPlayerSelect.innerHTML = '';

  options
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey, 'de'))
    .forEach(entry => {
      const option = document.createElement('option');
      option.value = entry.value;
      option.textContent = entry.label;
      elements.coPlayerSelect.appendChild(option);
    });

  const preferredValue = `${active.type}:${active.id}`;
  const hasPreferred = Array.from(elements.coPlayerSelect.options).some(opt => opt.value === preferredValue);
  elements.coPlayerSelect.value = hasPreferred
    ? preferredValue
    : elements.coPlayerSelect.options[0]?.value || '';
}

function showAuth(mode) {
  elements.loginForm.classList.toggle('hidden', mode !== 'login');
  elements.registerForm.classList.toggle('hidden', mode !== 'register');
}

function setStatus(element, message, type = '') {
  if (!element) return;
  element.textContent = message || '';
  element.className = `status ${type}`.trim();
}

function updateAdminVisibility(user) {
  const admin = isAdmin(user);
  const adminLink = elements.adminTabLink;
  if (adminLink) {
    adminLink.classList.toggle('hidden', !admin);
    adminLink.setAttribute('aria-hidden', (!admin).toString());
  }

  if (elements.adminTab) {
    elements.adminTab.classList.toggle('hidden', !admin);
  }

  if (!admin && elements.adminTab?.classList.contains('active')) {
    switchTab('profileTab');
  }
}

function updateAuthUI() {
  const current = auth.currentUser;
  const loggedIn = Boolean(current);
  const disabledMessage =
    'Registrierung und Login sind im Demo-Modus deaktiviert. Bitte lokal mit laufender API testen.';
  const authDisabled = !API_ENABLED;

  setStatus(elements.loginStatus, authDisabled ? disabledMessage : '');
  setStatus(elements.registerStatus, authDisabled ? disabledMessage : '');
  elements.loginForm?.querySelectorAll('input, button').forEach(el => (el.disabled = authDisabled));
  elements.registerForm?.querySelectorAll('input, button').forEach(el => (el.disabled = authDisabled));
  elements.authArea?.classList.toggle('auth-area--logged-in', loggedIn);
  elements.welcomeArea.classList.toggle('hidden', !loggedIn);
  elements.tabs.classList.toggle('hidden', !loggedIn);
  elements.welcomeHero.classList.toggle('hidden', loggedIn);
  if (loggedIn) {
    showAuth('');
    const user = auth.getUser(current);
    elements.welcomeName.textContent = user?.name || '';
    elements.welcomeEmail.textContent = user?.email || '';
    elements.profileName.value = user?.name || '';
    elements.profileEmail.value = user?.email || '';
    elements.profileFavorite.value = user?.favorite || '';
    updateAdminVisibility(user);
    if (elements.seasonPicker) {
      elements.seasonPicker.value = predictionSeason;
    }
    if (elements.lockSeasonSelect) {
      elements.lockSeasonSelect.value = predictionSeason;
      updateLockDateForm();
    }
    applyLockDatePermission(user);
    setActivePredictor({ type: 'user', id: current });
    refreshCoPlayerSelect();
    loadPredictionsForActive();
    loadMembers();
    renderAdminSeasons();
  } else {
    showAuth('login');
    applyLockDatePermission(null);
    refreshCoPlayerSelect();
    updateAdminVisibility(null);
    updateOverviewAccess();
  }
}

function switchTab(targetId) {
  const targetButton = Array.from(elements.tabButtons).find(btn => btn.dataset.tab === targetId);
  if (targetButton?.disabled) return;
  elements.tabButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === targetId));
  elements.tabPanes.forEach(pane => pane.classList.toggle('active', pane.id === targetId));
  if (targetId === 'membersTab') {
    loadMembers();
  }
}

function getActivePredictionOwner() {
  const active = getActivePredictor();
  if (active.type === 'co') {
    const player = readCoPlayers().find(p => p.id === active.id);
    return {
      type: 'co',
      name: player?.name || 'Mitspieler',
      predictions: migrateCoPlayerPredictions(player, predictionSeason),
      identifier: player?.id,
    };
  }

  const user = auth.getUser(auth.currentUser);
  return {
    type: 'user',
    name: user?.name || user?.email || 'Eigenes Profil',
    predictions: migratePredictions(user, predictionSeason),
    identifier: user?.email,
  };
}

function handlePredictorChange(event) {
  const value = event.target.value || '';
  const [type, id] = value.split(':');
  setActivePredictor({ type: type === 'co' ? 'co' : 'user', id });
  loadPredictionsForActive();
}

function handleAddCoPlayer() {
  const name = prompt('Wie heißt der Mitspieler?');
  if (!name) return;
  const coPlayers = readCoPlayers();
  const newPlayer = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `co-${Date.now()}`,
    name: name.trim(),
    predictionsBySeason: { [predictionSeason]: defaultPredictions() },
  };
  saveCoPlayers([...coPlayers, newPlayer]);
  setActivePredictor({ type: 'co', id: newPlayer.id });
  refreshCoPlayerSelect();
  loadPredictionsForActive();
  elements.predictionStatus.textContent = `${newPlayer.name} wurde angelegt. Du bearbeitest jetzt seine Tipps.`;
}

function handleEditCoPlayer() {
  if (!elements.coPlayerSelect) return;
  const [type, id] = (elements.coPlayerSelect.value || '').split(':');
  if (type !== 'co') {
    elements.predictionStatus.textContent = 'Bitte zuerst einen Mitspieler auswählen.';
    elements.predictionStatus.className = 'status error';
    return;
  }

  const coPlayers = readCoPlayers();
  const player = coPlayers.find(p => p.id === id);
  if (!player) return;

  const newName = prompt('Neuer Name für den Mitspieler:', player.name || '');
  if (!newName) return;

  const trimmedName = newName.trim();
  if (!trimmedName) return;

  const updated = coPlayers.map(p => (p.id === id ? { ...p, name: trimmedName } : p));
  saveCoPlayers(updated);

  const active = getActivePredictor();
  if (active.type === 'co' && active.id === id) {
    setActivePredictor({ type: 'co', id });
  }

  refreshCoPlayerSelect();
  loadPredictionsForActive();
  elements.predictionStatus.textContent = `${trimmedName} wurde umbenannt.`;
  elements.predictionStatus.className = 'status success';
}

function handleDeleteCoPlayer() {
  if (!elements.coPlayerSelect) return;
  const [type, id] = (elements.coPlayerSelect.value || '').split(':');
  if (type !== 'co') {
    elements.predictionStatus.textContent = 'Bitte zuerst einen Mitspieler auswählen.';
    elements.predictionStatus.className = 'status error';
    return;
  }

  const coPlayers = readCoPlayers();
  const player = coPlayers.find(p => p.id === id);
  if (!player) return;

  const confirmed = confirm(`Mitspieler "${player.name}" wirklich löschen?`);
  if (!confirmed) return;

  const remaining = coPlayers.filter(p => p.id !== id);
  saveCoPlayers(remaining);

  const fallback = remaining[0]
    ? { type: 'co', id: remaining[0].id }
    : { type: 'user', id: auth.currentUser || '' };

  if (getActivePredictor().id === id) {
    setActivePredictor(fallback);
  }

  refreshCoPlayerSelect();
  loadPredictionsForActive();
  elements.predictionStatus.textContent = `${player.name} wurde gelöscht.`;
  elements.predictionStatus.className = 'status success';
}

function loadPredictionsForActive() {
  const owner = getActivePredictionOwner();
  renderPredictions(owner.predictions);
  elements.predictionStatus.textContent = `Tipps für ${owner.name}`;
  updateLockInfo();
}

function renderPredictions(predictions) {
  elements.predictionsContent.innerHTML = '';
  const lockExpired = isLocked();
  const container = document.createElement('div');
  container.className = 'stats-columns prediction-columns';

  CONFERENCE_ORDER.forEach(conf => {
    const column = document.createElement('div');
    column.className = 'stats-column';
    column.innerHTML = `<h3>${conf}</h3>`;

    STAT_DIVISION_ORDER.forEach(div => {
      const division = document.createElement('div');
      division.className = 'stats-division stats-division--editable';
      division.innerHTML = `<div class="stats-division__title">${div}</div>`;

      const list = document.createElement('div');
      list.className = 'stats-division__list prediction-list';

      const divisionTeams = teams
        .filter(team => team.conference === conf && team.division === div)
        .map(team => ({ team, prediction: normalizePrediction(predictions[team.name]) }))
        .sort((a, b) => a.prediction.divisionRank - b.prediction.divisionRank);

      divisionTeams.forEach(({ team, prediction }) => {
        const row = document.createElement('div');
        row.className = 'stat-row prediction-row';
        row.dataset.team = team.name;
        row.dataset.divisionKey = `${team.conference}-${team.division}`;

        const teamArea = document.createElement('div');
        teamArea.className = 'stat-row__team prediction-team';

        const rankInput = document.createElement('input');
        rankInput.type = 'number';
        rankInput.min = '1';
        rankInput.max = '4';
        rankInput.value = prediction.divisionRank;
        rankInput.dataset.team = team.name;
        rankInput.dataset.field = 'divisionRank';
        rankInput.disabled = lockExpired;
        rankInput.addEventListener('input', handlePredictionChange);

        const logo = document.createElement('img');
        logo.src = getTeamLogo(team.name);
        logo.alt = `${team.name} Logo`;
        logo.className = 'team-logo';
        logo.loading = 'lazy';

        const teamName = document.createElement('span');
        teamName.className = 'team-name team-name--stacked';
        const { city, alias } = splitTeamName(team.name);
        teamName.innerHTML = `<span class="team-name__city">${city}</span><span class="team-name__alias">${alias}</span>`;

        teamArea.appendChild(rankInput);
        teamArea.appendChild(logo);
        teamArea.appendChild(teamName);

        const meta = document.createElement('div');
        meta.className = 'stat-row__record prediction-record';

        const winsInput = document.createElement('input');
        winsInput.type = 'number';
        winsInput.min = '0';
        winsInput.max = '17';
        winsInput.value = prediction.wins;
        winsInput.dataset.team = team.name;
        winsInput.dataset.field = 'wins';
        winsInput.disabled = lockExpired;
        winsInput.addEventListener('input', handlePredictionChange);

        const separator = document.createElement('span');
        separator.textContent = '–';
        separator.className = 'record-separator';

        const lossesInput = document.createElement('input');
        lossesInput.type = 'number';
        lossesInput.min = '0';
        lossesInput.max = '17';
        lossesInput.value = prediction.losses;
        lossesInput.dataset.team = team.name;
        lossesInput.dataset.field = 'losses';
        lossesInput.disabled = lockExpired;
        lossesInput.addEventListener('input', handlePredictionChange);

        meta.appendChild(winsInput);
        meta.appendChild(separator);
        meta.appendChild(lossesInput);

        row.appendChild(teamArea);
        row.appendChild(meta);
        list.appendChild(row);
      });

      division.appendChild(list);
      column.appendChild(division);
    });

    container.appendChild(column);
  });

  elements.predictionsContent.appendChild(container);
  highlightConflicts(predictions);
  updateSaveState();
}

function calculateTeamPoints(teamName, prediction) {
  if (!standingsSnapshot) return null;
  const actualStats = standingsSnapshot.teamStats[teamName];
  const actualRank = standingsSnapshot.divisionRanks[teamName];
  if (!actualStats || !actualRank) return null;

  let points = 0;
  if (prediction.divisionRank === actualRank) points += 1;
  if (prediction.wins === actualStats.wins && prediction.losses === actualStats.losses) points += 2;
  return points;
}

function calculateDivisionBonus(divisionEntries) {
  if (!standingsSnapshot) return 0;

  const allStandingsCorrect = divisionEntries.every(entry => {
    const rank = standingsSnapshot.divisionRanks[entry.team.name];
    return rank === entry.prediction.divisionRank;
  });

  if (!allStandingsCorrect) return 0;

  const allRecordsCorrect = divisionEntries.every(entry => {
    const stats = standingsSnapshot.teamStats[entry.team.name];
    return stats && entry.prediction.wins === stats.wins && entry.prediction.losses === stats.losses;
  });

  let bonus = 3;
  if (allRecordsCorrect) bonus += 5;
  return bonus;
}

function calculateUserTotalPoints(predictions) {
  if (!standingsSnapshot) return null;
  let total = 0;
  const divisionBuckets = {};

  teams.forEach(team => {
    const prediction = normalizePrediction(predictions?.[team.name]);
    const teamPoints = calculateTeamPoints(team.name, prediction);
    if (typeof teamPoints === 'number') total += teamPoints;

    const key = `${team.conference}-${team.division}`;
    divisionBuckets[key] = divisionBuckets[key] || [];
    divisionBuckets[key].push({ team, prediction });
  });

  Object.values(divisionBuckets).forEach(entries => {
    total += calculateDivisionBonus(entries);
  });

  return total;
}

function handlePredictionChange(event) {
  const owner = getActivePredictionOwner();
  if (!owner) return;
  const team = event.target.dataset.team;
  const field = event.target.dataset.field;
  const rawValue = parseInt(event.target.value, 10);
  const predictions = owner.predictions;
  const prediction = normalizePrediction(predictions[team]);

  if (field === 'divisionRank') {
    prediction.divisionRank = clamp(rawValue || 1, 1, 4);
  } else if (field === 'wins') {
    prediction.wins = clamp(rawValue || 0, 0, 17);
  } else if (field === 'losses') {
    prediction.losses = clamp(rawValue || 0, 0, 17);
  }

  predictions[team] = prediction;
  event.target.value = prediction[field];
  highlightConflicts(predictions);
  if (owner.type === 'co') {
    const updated = readCoPlayers().map(player => {
      if (player.id !== owner.identifier) return player;
      const predictionsBySeason = { ...(player.predictionsBySeason || {}), [predictionSeason]: predictions };
      return { ...player, predictionsBySeason };
    });
    saveCoPlayers(updated);
  } else if (owner.identifier) {
    auth.updatePredictions(owner.identifier, predictions, predictionSeason);
  }
  updateSaveState('Änderungen werden automatisch zwischengespeichert.');
}

function highlightConflicts(predictions) {
  const divisionCounts = {};

  teams.forEach(team => {
    const prediction = normalizePrediction(predictions[team.name]);
    const divisionKey = `${team.conference}-${team.division}`;
    divisionCounts[divisionKey] = divisionCounts[divisionKey] || {};
    divisionCounts[divisionKey][prediction.divisionRank] =
      (divisionCounts[divisionKey][prediction.divisionRank] || 0) + 1;
  });

  elements.predictionsContent.querySelectorAll('input[data-field="divisionRank"]').forEach(input => {
    const team = teams.find(t => t.name === input.dataset.team);
    const divisionKey = `${team.conference}-${team.division}`;
    const isConflict = divisionCounts[divisionKey][Number(input.value)] > 1;
    input.classList.toggle('conflict', isConflict);
  });
}

function updateSaveState(message = '') {
  const locked = isLocked();
  elements.savePredictions.disabled = locked;
  if (message) {
    elements.predictionStatus.textContent = message;
  }
}

function updateLockInfo() {
  const lockDate = getLockDateForSeason(predictionSeason);
  const locked = isLocked();
  const readable = lockDate.toLocaleString('de-DE', { dateStyle: 'long', timeStyle: 'short' });
  elements.lockInfo.textContent = locked
    ? `Tipps sind seit ${readable} gesperrt.`
    : `Tipps können bis ${readable} bearbeitet werden.`;
  elements.savePredictions.disabled = locked;
  elements.predictionsContent.querySelectorAll('input').forEach(input => {
    input.disabled = locked;
  });
  updateOverviewAccess();
}

function isAdmin(user) {
  return getUserRole(user) === 'admin';
}

function renderRoleBadge(role) {
  const span = document.createElement('span');
  span.className = 'role-badge';
  span.textContent = role === 'admin' ? 'Admin' : 'User';
  return span;
}

function renderMembersTable(users = [], season = predictionSeason) {
  if (!elements.membersContent) return;

  if (!users.length) {
    elements.membersContent.innerHTML = '<p class="empty">Keine Mitglieder gefunden.</p>';
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'members-grid';

  const sortedUsers = sortUsersByRole(users);

  sortedUsers.forEach(user => {
    const card = document.createElement('article');
    card.className = 'member-card';

    const header = document.createElement('div');
    header.className = 'member-card__header';

    const identity = document.createElement('div');
    identity.className = 'member-card__identity';

    const avatar = document.createElement('span');
    avatar.className = 'members-avatar';
    avatar.textContent = (user.name || user.email || '?').charAt(0).toUpperCase();

    const meta = document.createElement('div');
    meta.className = 'members-meta';

    const nameStrong = document.createElement('strong');
    nameStrong.textContent = user.name || user.email || 'Unbekannt';
    const emailSmall = document.createElement('div');
    emailSmall.className = 'hint';
    emailSmall.textContent = user.email || '';

    meta.appendChild(nameStrong);
    if (user.email) meta.appendChild(emailSmall);

    identity.appendChild(avatar);
    identity.appendChild(meta);

    const tipsBadge = document.createElement('span');
    tipsBadge.className = `status-chip ${user.has_tip ? 'status-chip--success' : 'status-chip--pending'}`;
    tipsBadge.innerHTML = `
      <span class="status-chip__icon">${user.has_tip ? '✔' : '–'}</span>
      ${user.has_tip ? `Tipps ${season}` : 'Offen'}
    `;
    tipsBadge.setAttribute('aria-label', user.has_tip ? 'Tipps vorhanden' : 'Keine Tipps');

    header.appendChild(identity);
    header.appendChild(tipsBadge);

    const roleWrapper = document.createElement('div');
    roleWrapper.className = 'member-card__role';
    const role = getUserRole(user);
    const roleLabel = document.createElement('span');
    roleLabel.className = 'hint';
    roleLabel.textContent = 'Rolle';

    const roleBadge = renderRoleBadge(role);
    roleWrapper.appendChild(roleLabel);
    roleWrapper.appendChild(roleBadge);

    card.appendChild(header);
    card.appendChild(roleWrapper);
    grid.appendChild(card);
  });

  elements.membersContent.innerHTML = '';
  elements.membersContent.appendChild(grid);
}

function syncSelectedRoleOption() {
  if (!elements.roleUserSelect || !elements.roleValueSelect) return;
  const selectedId = Number(elements.roleUserSelect.value);
  const selectedUser = cachedUsers.find(user => user.id === selectedId);
  elements.roleValueSelect.value = getUserRole(selectedUser);
}

function renderRoleManagement(users = []) {
  if (!elements.roleUserSelect || !elements.roleValueSelect) return;
  cachedUsers = Array.isArray(users) ? users : [];
  const admin = isAdmin(auth.getUser(auth.currentUser));

  elements.roleForm?.classList.toggle('hidden', !admin);

  if (!admin) {
    elements.roleUserSelect.innerHTML = '';
    setStatus(elements.roleStatus, 'Keine Berechtigung: Nur Admins dürfen Rollen ändern.', 'error');
    return;
  }

  const hasUsers = cachedUsers.length > 0;
  if (!hasUsers) {
    elements.roleUserSelect.innerHTML = '';
    setStatus(elements.roleStatus, 'Keine Benutzer verfügbar.', '');
    return;
  }

  const sortedUsers = sortUsersByRole(cachedUsers);
  const currentUser = auth.getUser(auth.currentUser);
  elements.roleUserSelect.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Benutzer auswählen';
  elements.roleUserSelect.appendChild(placeholder);

  sortedUsers.forEach(user => {
    const option = document.createElement('option');
    option.value = user.id;
    const role = getUserRole(user);
    option.textContent = `${user.name || user.email || 'Unbekannt'} (${role === 'admin' ? 'Admin' : 'User'})`;
    option.disabled = currentUser?.email === user.email;
    elements.roleUserSelect.appendChild(option);
  });

  const firstEnabled = Array.from(elements.roleUserSelect.options).find(option => !option.disabled && option.value);
  elements.roleUserSelect.value = firstEnabled?.value || '';
  syncSelectedRoleOption();
  setStatus(elements.roleStatus, '', '');
}

async function loadMembers() {
  if (!elements.membersContent || !auth.currentUser) return;
  setStatus(elements.membersStatus, 'Mitglieder werden geladen …', '');
  try {
    const { users } = await apiClient.listUsers(predictionSeason);
    cachedUsers = Array.isArray(users) ? users : [];
    auth.mergeUsersWithTips(cachedUsers, predictionSeason);
    renderMembersTable(cachedUsers, predictionSeason);
    renderRoleManagement(cachedUsers);
    renderPredictionsOverview();
    setStatus(elements.membersStatus, '', '');
  } catch (err) {
    cachedUsers = [];
    renderMembersTable([]);
    renderRoleManagement([]);
    setStatus(elements.membersStatus, err.message || 'Mitglieder konnten nicht geladen werden.', 'error');
  }
}

async function loadSeasonTips() {
  try {
    const { tips } = await apiClient.listSeasonTips(predictionSeason);
    seasonTipParticipants = (tips || []).map(tip => ({
      id: tip.user_id,
      email: tip.user_email || '',
      name: tip.user_name || tip.user_email || 'Unbekannt',
      favorite: tip.favorite_team || '',
      user_group: (tip.user_group || 'user').toLowerCase(),
      has_tip: true,
      predictionsBySeason: {
        [tip.season]: tip.payload || defaultPredictions(),
      },
    }));
  } catch (err) {
    console.warn('Saison-Tipps konnten nicht geladen werden.', err);
    seasonTipParticipants = [];
  }

  renderPredictionsOverview();
}

async function handleRoleFormSubmit(event) {
  event.preventDefault();
  if (!elements.roleForm || !elements.roleUserSelect || !elements.roleValueSelect) return;

  const currentUser = auth.getUser(auth.currentUser);
  if (!isAdmin(currentUser)) {
    setStatus(elements.roleStatus, 'Keine Berechtigung: Nur Admins dürfen Rollen ändern.', 'error');
    return;
  }

  const userId = Number(elements.roleUserSelect.value);
  const newRole = elements.roleValueSelect.value;

  if (!userId) {
    setStatus(elements.roleStatus, 'Bitte einen Benutzer auswählen.', 'error');
    return;
  }

  const controls = elements.roleForm.querySelectorAll('button, select');
  controls.forEach(control => (control.disabled = true));
  setStatus(elements.roleStatus, 'Rolle wird aktualisiert …', '');

  try {
    await apiClient.updateUserRole(userId, newRole);
    setStatus(elements.roleStatus, 'Rolle gespeichert.', 'success');
    await loadMembers();
  } catch (err) {
    setStatus(elements.roleStatus, err.message || 'Rolle konnte nicht gespeichert werden.', 'error');
  } finally {
    controls.forEach(control => (control.disabled = false));
  }
}

function applyLockDatePermission(user) {
  const admin = isAdmin(user);
  if (elements.lockSeasonSelect) {
    elements.lockSeasonSelect.disabled = !admin;
  }
  if (elements.lockDateInput) {
    elements.lockDateInput.disabled = !admin;
  }
  if (elements.saveLockDate) {
    elements.saveLockDate.disabled = !admin;
  }

  if (elements.lockDateStatus) {
    if (!admin) {
      elements.lockDateStatus.textContent = 'Nur Admins können den Stichtag bearbeiten.';
      elements.lockDateStatus.className = 'status hint';
    } else {
      elements.lockDateStatus.textContent = '';
      elements.lockDateStatus.className = 'status';
    }
  }
}

function updateLockDateForm() {
  if (!elements.lockSeasonSelect || !elements.lockDateInput) return;
  const season = elements.lockSeasonSelect.value || predictionSeason;
  const lockDate = getLockDateForSeason(season);
  elements.lockDateInput.value = formatLockDateForInput(lockDate);
  if (elements.lockDateStatus) elements.lockDateStatus.textContent = '';
}

async function handleLockDateSave() {
  if (!elements.lockSeasonSelect || !elements.lockDateInput) return;
  const user = auth.getUser(auth.currentUser);
  if (!isAdmin(user)) {
    elements.lockDateStatus.textContent = 'Keine Berechtigung: Nur Admins dürfen den Stichtag setzen.';
    elements.lockDateStatus.className = 'status error';
    return;
  }
  const season = elements.lockSeasonSelect.value;
  const rawValue = elements.lockDateInput.value;
  if (!rawValue) {
    elements.lockDateStatus.textContent = 'Bitte ein gültiges Datum wählen.';
    elements.lockDateStatus.className = 'status error';
    return;
  }

  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) {
    elements.lockDateStatus.textContent = 'Bitte ein gültiges Datum wählen.';
    elements.lockDateStatus.className = 'status error';
    return;
  }

  const iso = parsed.toISOString();

  try {
    await apiClient.updateLockDate(season, iso);
    const lockDates = getLockDates();
    lockDates[season] = iso;
    saveLockDates(lockDates);
    elements.lockDateStatus.textContent = 'Stichtag gespeichert.';
    elements.lockDateStatus.className = 'status success';
    await refreshSeasonData();
  } catch (err) {
    elements.lockDateStatus.textContent = err.message || 'Stichtag konnte nicht gespeichert werden.';
    elements.lockDateStatus.className = 'status error';
    return;
  }

  if (season === predictionSeason) {
    updateLockInfo();
    const current = auth.getUser(auth.currentUser);
    if (current) renderPredictions(migratePredictions(current, predictionSeason));
  }
}

async function refreshSeasonData() {
  await loadMetadata();
  populateSeasonPicker();
  populateLockSeasonSelect();
  updateLockInfo();
  renderAdminSeasons();
  updateOverviewAccess();
}

function renderAdminSeasons() {
  if (!elements.adminSeasonList) return;

  if (!SEASON_METADATA.length) {
    elements.adminSeasonList.innerHTML = '<p class="hint">Keine Saisons vorhanden.</p>';
    return;
  }

  const list = document.createElement('div');
  list.className = 'admin-season-cards';

  SEASON_METADATA.forEach(season => {
    const card = document.createElement('article');
    card.className = 'admin-season-card';

    const header = document.createElement('div');
    header.className = 'admin-season-card__header';

    const title = document.createElement('div');
    title.className = 'admin-season-card__title';
    const name = document.createElement('strong');
    name.textContent = season.label || `Saison ${season.season}`;
    const id = document.createElement('span');
    id.className = 'hint';
    id.textContent = `ID: ${season.season}`;
    title.appendChild(name);
    title.appendChild(id);

    const status = document.createElement('span');
    status.className = `badge ${season.completed ? 'badge--success' : 'badge--info'}`;
    status.textContent = season.completed ? 'Abgeschlossen' : 'Aktiv';

    header.appendChild(title);
    header.appendChild(status);

    const body = document.createElement('div');
    body.className = 'admin-season-card__body';
    const lockInfo = document.createElement('div');
    lockInfo.className = 'admin-season-card__meta';
    const date = season.lock_date ? new Date(season.lock_date) : null;
    lockInfo.textContent = date
      ? `Stichtag: ${date.toLocaleString('de-DE', { dateStyle: 'long', timeStyle: 'short' })}`
      : 'Kein Stichtag gesetzt';

    const actions = document.createElement('div');
    actions.className = 'admin-season-card__actions';
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'secondary';
    toggleBtn.textContent = season.completed ? 'Als aktiv markieren' : 'Als abgeschlossen markieren';
    toggleBtn.addEventListener('click', () => handleSeasonCompletionToggle(season.season, !season.completed, toggleBtn));

    actions.appendChild(toggleBtn);

    body.appendChild(lockInfo);
    body.appendChild(actions);

    card.appendChild(header);
    card.appendChild(body);
    list.appendChild(card);
  });

  elements.adminSeasonList.innerHTML = '';
  elements.adminSeasonList.appendChild(list);
}

async function handleSeasonCompletionToggle(season, completed, button) {
  const user = auth.getUser(auth.currentUser);
  if (!isAdmin(user)) {
    setStatus(elements.adminStatus, 'Nur Admins können den Saisonstatus ändern.', 'error');
    return;
  }

  if (button) button.disabled = true;
  setStatus(elements.adminStatus, completed ? 'Saison wird abgeschlossen …' : 'Saison wird geöffnet …', '');

  try {
    await apiClient.updateSeason(season, { completed });
    setStatus(elements.adminStatus, 'Saisonstatus aktualisiert.', 'success');
    await refreshSeasonData();
  } catch (err) {
    setStatus(elements.adminStatus, err.message || 'Saisonstatus konnte nicht geändert werden.', 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

async function handleSeasonCreate(event) {
  event.preventDefault();
  const user = auth.getUser(auth.currentUser);
  if (!isAdmin(user)) {
    setStatus(elements.seasonFormStatus, 'Nur Admins können neue Saisons anlegen.', 'error');
    return;
  }

  const season = elements.seasonValue?.value.trim();
  const label = elements.seasonLabel?.value.trim();
  const lockDateRaw = elements.seasonLockDate?.value || '';
  const completed = elements.seasonCompleted?.checked || false;

  if (!season || !label) {
    setStatus(elements.seasonFormStatus, 'Saison und Anzeigename sind erforderlich.', 'error');
    return;
  }

  const payload = { season, label, completed };
  if (lockDateRaw) {
    const parsed = new Date(lockDateRaw);
    if (Number.isNaN(parsed.getTime())) {
      setStatus(elements.seasonFormStatus, 'Bitte gib ein gültiges Datum ein.', 'error');
      return;
    }
    payload.lock_date = parsed.toISOString();
  }

  setStatus(elements.seasonFormStatus, 'Saison wird gespeichert …', '');

  try {
    await apiClient.createSeason(payload);
    setStatus(elements.seasonFormStatus, 'Saison gespeichert.', 'success');
    elements.seasonForm?.reset();
    await refreshSeasonData();
  } catch (err) {
    setStatus(elements.seasonFormStatus, err.message || 'Saison konnte nicht gespeichert werden.', 'error');
  }
}

async function handleSeasonChange(event) {
  predictionSeason = event.target.value;
  localStorage.setItem(PREDICTION_SEASON_KEY, predictionSeason);

  loadPredictionsForActive();
  updateSaveState();
  if (elements.lockSeasonSelect) {
    elements.lockSeasonSelect.value = predictionSeason;
    updateLockDateForm();
  }
  updateLockInfo();
  loadStats(predictionSeason);
  loadMembers();
  await loadSeasonTips();
}

function isLocked() {
  const lockDate = getLockDateForSeason(predictionSeason);
  return new Date() > lockDate;
}

async function savePredictions() {
  const owner = getActivePredictionOwner();
  if (!owner) return;
  const predictions = {};
  const divisionCounts = {};
  let hasConflict = false;
  let invalidRecord = false;

  elements.predictionsContent.querySelectorAll('.prediction-row').forEach(row => {
    const team = row.dataset.team;
    const divisionKey = row.dataset.divisionKey;
    const divisionRank = Number(row.querySelector('input[data-field="divisionRank"]').value);
    const wins = Number(row.querySelector('input[data-field="wins"]').value);
    const losses = Number(row.querySelector('input[data-field="losses"]').value);

    predictions[team] = normalizePrediction({ divisionRank, wins, losses });

    divisionCounts[divisionKey] = divisionCounts[divisionKey] || {};
    divisionCounts[divisionKey][predictions[team].divisionRank] =
      (divisionCounts[divisionKey][predictions[team].divisionRank] || 0) + 1;

    if (predictions[team].wins + predictions[team].losses > 17) {
      invalidRecord = true;
    }
  });

  Object.values(divisionCounts).forEach(counts => {
    Object.values(counts).forEach(count => {
      if (count > 1) hasConflict = true;
    });
  });

  highlightConflicts(predictions);

  if (hasConflict) {
    elements.predictionStatus.textContent = 'Bitte vergebe jede Divisionsplatzierung nur einmal pro Division.';
    elements.predictionStatus.className = 'status error';
    return;
  }

  if (invalidRecord) {
    elements.predictionStatus.textContent = 'Die Bilanz darf maximal 17 Spiele umfassen.';
    elements.predictionStatus.className = 'status error';
    return;
  }

  try {
    if (owner.type === 'co') {
      const updated = readCoPlayers().map(player => {
        if (player.id !== owner.identifier) return player;
        const predictionsBySeason = { ...(player.predictionsBySeason || {}), [predictionSeason]: predictions };
        return { ...player, predictionsBySeason };
      });
      saveCoPlayers(updated);
      elements.predictionStatus.textContent = 'Tipps des Mitspielers gespeichert!';
    } else {
      await auth.updatePredictions(owner.identifier, predictions, predictionSeason);
      elements.predictionStatus.textContent = 'Tipps gespeichert!';
    }
    elements.predictionStatus.className = 'status success';
  } catch (err) {
    elements.predictionStatus.textContent = err.message || 'Speichern nicht möglich.';
    elements.predictionStatus.className = 'status error';
  }
}

async function handleProfileSubmit(event) {
  event.preventDefault();
  const current = auth.getUser(auth.currentUser);
  if (!current) return;
  const payload = {
    name: elements.profileName.value.trim(),
    favorite_team: elements.profileFavorite.value,
  };
  try {
    await auth.updateProfile(current.email, payload);
    elements.welcomeName.textContent = payload.name || current.name;
    elements.profileStatus.textContent = 'Profil gespeichert';
    elements.profileStatus.className = 'status success';
  } catch (err) {
    elements.profileStatus.textContent = err.message || 'Profil konnte nicht aktualisiert werden.';
    elements.profileStatus.className = 'status error';
  }
}

async function handleRegister(event) {
  event.preventDefault();
  setStatus(elements.registerStatus, 'Registrierung läuft…', '');
  try {
    const password = document.getElementById('registerPassword').value;
    const passwordConfirmation = document.getElementById('registerPasswordConfirm').value;

    if (password !== passwordConfirmation) {
      setStatus(elements.registerStatus, 'Passwörter stimmen nicht überein.', 'error');
      return;
    }

    await auth.register({
      name: document.getElementById('registerName').value.trim(),
      email: document.getElementById('registerEmail').value.trim().toLowerCase(),
      password,
      passwordConfirmation,
    });
    showAuth('');
    setStatus(elements.registerStatus, 'Registrierung erfolgreich!', 'success');
    updateAuthUI();
  } catch (err) {
    setStatus(elements.registerStatus, err.message || 'Registrierung fehlgeschlagen.', 'error');
  }
}

async function handleLogin(event) {
  event.preventDefault();
  setStatus(elements.loginStatus, 'Anmeldung läuft…', '');
  try {
    await auth.login(
      document.getElementById('loginEmail').value.trim().toLowerCase(),
      document.getElementById('loginPassword').value
    );
    showAuth('');
    setStatus(elements.loginStatus, 'Erfolgreich angemeldet!', 'success');
    updateAuthUI();
  } catch (err) {
    setStatus(elements.loginStatus, err.message || 'Anmeldung fehlgeschlagen.', 'error');
  }
}

let standingsSnapshot = null;

function buildStandingsSnapshot(teamStats) {
  const divisions = {};
  const divisionRanks = {};
  const mergedStats = {};

  teams.forEach(team => {
    divisions[team.conference] = divisions[team.conference] || {};
    divisions[team.conference][team.division] = divisions[team.conference][team.division] || [];

    const fallback = { wins: 0, losses: 0, pct: -1, note: '', logo: getTeamLogo(team.name) };
    const stats = { ...fallback, ...(teamStats[team.name] || {}) };
    mergedStats[team.name] = stats;

    divisions[team.conference][team.division].push({ team, stats });
  });

  Object.values(divisions).forEach(conf => {
    Object.values(conf).forEach(list => {
      list.sort((a, b) => {
        if (a.stats.pct !== b.stats.pct) return b.stats.pct - a.stats.pct;
        return b.stats.wins - a.stats.wins;
      });
      list.forEach((entry, idx) => {
        divisionRanks[entry.team.name] = idx + 1;
      });
    });
  });

  return { teamStats: mergedStats, divisions, divisionRanks };
}

function extractEspnStandings(data) {
  if (!data || !data.children) return null;

  const entries = data.children
    .filter(item => item.standings && item.standings.entries)
    .flatMap(item => item.standings.entries);

  const teamStats = entries.reduce((acc, entry) => {
    const teamName = entry.team?.displayName;
    if (!teamName) return acc;
    const wins = entry.stats?.find(s => s.name === 'wins')?.value;
    const losses = entry.stats?.find(s => s.name === 'losses')?.value;
    const pct = entry.stats?.find(s => s.name === 'winPercent')?.value;
    acc[teamName] = {
      wins: typeof wins === 'number' ? wins : 0,
      losses: typeof losses === 'number' ? losses : 0,
      pct: typeof pct === 'number' ? pct : -1,
      note: entry.standings?.note || '',
      logo: entry.team?.logos?.[0]?.href || getTeamLogo(teamName),
    };
    return acc;
  }, {});

  return buildStandingsSnapshot(teamStats);
}

function extractNflStandings(data) {
  const records = data?.teamRecords || data?.league?.teamRecords || data?.records;
  if (!Array.isArray(records)) return null;

  const teamStats = records.reduce((acc, record) => {
    const teamInfo = record.team || record.club || record;
    const teamLabel =
      teamInfo?.fullName ||
      teamInfo?.name ||
      teamInfo?.teamName ||
      teamInfo?.displayName ||
      `${teamInfo?.city || ''} ${teamInfo?.nickName || ''}`.trim();
    const teamName = findTeamByLabel(teamLabel);
    if (!teamName) return acc;

    const wins =
      record.overallWins ??
      record.wins ??
      record.record?.wins ??
      record.overall?.wins ??
      record.overallRecord?.wins;
    const losses =
      record.overallLosses ??
      record.losses ??
      record.record?.losses ??
      record.overall?.losses ??
      record.overallRecord?.losses;
    const pct =
      record.overallWinPct ??
      record.pct ??
      record.winPct ??
      record.overall?.percentage ??
      record.overallRecord?.percentage ??
      (typeof wins === 'number' && typeof losses === 'number' && wins + losses > 0
        ? wins / (wins + losses)
        : -1);

    acc[teamName] = {
      wins: typeof wins === 'number' ? wins : 0,
      losses: typeof losses === 'number' ? losses : 0,
      pct: typeof pct === 'number' ? pct : -1,
      note: record.note || record.clinched || '',
      logo: getTeamLogo(teamName),
    };
    return acc;
  }, {});

  if (!Object.keys(teamStats).length) return null;
  return buildStandingsSnapshot(teamStats);
}

function extractStandings(data) {
  const parsers = [extractNflStandings, extractEspnStandings];
  for (const parser of parsers) {
    const snapshot = parser(data);
    if (snapshot) return snapshot;
  }
  return null;
}

function renderStats(data) {
  const snapshot = extractStandings(data);
  standingsSnapshot = snapshot;

  if (!snapshot) {
    elements.statsContent.textContent = 'Keine Daten verfügbar.';
    return;
  }

  const container = document.createElement('div');
  container.className = 'stats-columns';

  CONFERENCE_ORDER.forEach(conf => {
    const column = document.createElement('div');
    column.className = 'stats-column';
    const heading = document.createElement('h3');
    heading.textContent = conf;
    column.appendChild(heading);

    STAT_DIVISION_ORDER.forEach(div => {
      const divisionTeams = snapshot.divisions[conf]?.[div] || [];

      const division = document.createElement('div');
      division.className = 'stats-division';
      division.innerHTML = `<div class="stats-division__title">${div}</div>`;

      const list = document.createElement('div');
      list.className = 'stats-division__list';

      divisionTeams.forEach((entry, idx) => {
        const { city, alias } = splitTeamName(entry.team.name);
        const recordLabel = `${entry.stats.wins}-${entry.stats.losses}`;
        const pointsLabel =
          entry.stats.pct >= 0 ? (entry.stats.pct * 100).toFixed(1) : '–';
        const row = document.createElement('div');
        row.className = 'stat-row';
        row.innerHTML = `
          <div class="stat-row__team">
            <span class="stat-rank">${idx + 1}.</span>
            <img src="${entry.stats.logo}" alt="${entry.team.name} Logo" class="team-logo" loading="lazy" />
            <div class="stat-row__name">
              <span class="team-name team-name--stacked">
                ${city ? `<span class="team-name__city">${city}</span>` : ''}
                <span class="team-name__alias">${alias || entry.team.name}</span>
              </span>
              ${entry.stats.note ? `<span class="stat-meta">${entry.stats.note}</span>` : ''}
            </div>
          </div>
          <div class="stat-row__metrics">
            <div class="stat-row__record" aria-label="Bilanz">${recordLabel}</div>
            <div class="stat-row__points" aria-label="Punkte">${pointsLabel}%</div>
          </div>
        `;
        list.appendChild(row);
      });

      division.appendChild(list);
      column.appendChild(division);
    });

    container.appendChild(column);
  });

  elements.statsContent.innerHTML = '';
  elements.statsContent.appendChild(container);
}

async function loadStats(season = predictionSeason) {
  elements.statsContent.textContent = `Lade Daten für Saison ${season}…`;
  try {
    const nflResponse = await fetch(
      'https://static.www.nfl.com/liveupdate/scorestrip/standings.json',
      { cache: 'no-cache' }
    );
    if (nflResponse.ok) {
      const data = await nflResponse.json();
      renderStats(data);
      renderPredictionsOverview();
      return;
    }
  } catch (err) {
    console.warn('NFL Standings konnten nicht geladen werden, fallback zu ESPN.', err);
  }

  try {
    const espnResponse = await fetch(
      `https://site.api.espn.com/apis/v2/sports/football/nfl/standings?season=${season}`
    );
    if (!espnResponse.ok) throw new Error('Fehler beim Abrufen.');
    const data = await espnResponse.json();
    renderStats(data);
    renderPredictionsOverview();
  } catch (err) {
    elements.statsContent.textContent = 'Aktualisierung nicht möglich. Prüfe deine Verbindung.';
    console.error(err);
  }
}


function readStoredLineupSource() {
  try {
    return localStorage.getItem(LINEUP_SOURCE_KEY) || '';
  } catch (err) {
    return '';
  }
}

function persistLineupSource(value) {
  try {
    localStorage.setItem(LINEUP_SOURCE_KEY, value || '');
  } catch (err) {
    // ignore
  }
}

function setLineupStatus(message, type = 'info') {
  if (!elements.lineupStatus) return;
  elements.lineupStatus.textContent = message;
  elements.lineupStatus.dataset.type = type;
}

function renderLineupTable(container, players, emptyText) {
  if (!container) return;
  container.innerHTML = '';

  if (!players || !players.length) {
    container.textContent = emptyText;
    return;
  }

  const body = document.createElement('div');
  body.className = 'lineup-table__body';

  players.forEach(player => {
    const row = document.createElement('div');
    row.className = 'lineup-row';

    const slot = document.createElement('div');
    slot.className = 'lineup-row__slot';
    slot.textContent = player.slot || player.position || '–';

    const name = document.createElement('div');
    name.className = 'lineup-row__name';
    const nameLabel = document.createElement('div');
    nameLabel.className = 'lineup-row__primary';
    nameLabel.textContent = player.name || 'Unbekannt';
    const meta = document.createElement('div');
    meta.className = 'lineup-row__meta';
    meta.textContent = [player.team, player.position].filter(Boolean).join(' • ');
    name.appendChild(nameLabel);
    name.appendChild(meta);

    const score = document.createElement('div');
    score.className = 'lineup-row__score';
    const hasAverageScore = typeof player.average_score === 'number';
    const hasEvalScore = typeof player.score === 'number';
    const evalScore = hasEvalScore ? `${player.score.toFixed(1)} pts` : '–';
    const primaryScore = hasAverageScore ? `${player.average_score.toFixed(2)} pts` : evalScore;
    score.textContent = primaryScore;

    if (hasAverageScore && hasEvalScore) {
      const average = document.createElement('div');
      average.className = 'lineup-row__projection';
      average.textContent = `Ø (Score + Sleeper): ${player.average_score.toFixed(2)} pts`;
      score.appendChild(average);

      const internal = document.createElement('div');
      internal.className = 'lineup-row__projection';
      internal.textContent = `Interner Score: ${evalScore}`;
      score.appendChild(internal);
    }

    if (typeof player.projection_score === 'number') {
      const projection = document.createElement('div');
      projection.className = 'lineup-row__projection';
      const percentile =
        typeof player.projection_percentile === 'number'
          ? ` (${player.projection_percentile.toFixed(0)}. Perzentil)`
          : '';
      projection.textContent = `Sleeper-Projektion: ${player.projection_score.toFixed(2)} pts${percentile}`;
      score.appendChild(projection);
    }

    const reasons = document.createElement('ul');
    reasons.className = 'lineup-row__reasons';
    (player.reasons || []).forEach(reason => {
      const li = document.createElement('li');
      li.textContent = reason;
      reasons.appendChild(li);
    });

    row.appendChild(slot);
    row.appendChild(name);
    row.appendChild(score);
    row.appendChild(reasons);
    body.appendChild(row);
  });

  container.appendChild(body);
}

async function syncLineupSource() {
  if (!elements.lineupRosterInput) return;
  let stored = null;
  const cached = readStoredLineupSource();
  if (cached) {
    elements.lineupRosterInput.value = cached;
  }

  try {
    stored = await apiClient.getLineupSource();
    if (stored.roster_id) {
      const info = stored.league_id
        ? `Gespeichertes Roster: ${stored.roster_id} (Liga ${stored.league_id})`
        : `Gespeichertes Roster: ${stored.roster_id}`;
      elements.lineupSavedInfo.textContent = info;
    } else {
      elements.lineupSavedInfo.textContent = 'Noch kein Roster gespeichert.';
    }
  } catch (err) {
    elements.lineupSavedInfo.textContent = 'Roster kann erst nach Anmeldung gespeichert werden.';
  }

  return stored;
}

function renderLineupResults(data) {
  if (!data) return;
  renderLineupTable(elements.lineupStarters, data.starters, 'Keine Empfehlung vorhanden.');
  renderLineupTable(elements.lineupBench, data.bench, 'Keine Ersatzbank gefunden.');
}

async function loadLineupRecommendations(rosterOverride = '') {
  if (!elements.lineupRosterInput) return;
  setLineupStatus('Lade Lineup-Empfehlungen…');
  const payload = rosterOverride || elements.lineupRosterInput.value.trim();

  try {
    const data = await apiClient.getLineupRecommendations(payload || undefined);
    renderLineupResults(data);
    setLineupStatus('Empfehlungen aktualisiert.', 'success');
    if (payload) {
      persistLineupSource(payload);
    }
  } catch (err) {
    setLineupStatus(err.message || 'Lineup konnte nicht geladen werden.', 'error');
  }
}

async function handleLineupSubmit(event) {
  event.preventDefault();
  if (!elements.lineupRosterInput) return;
  const value = elements.lineupRosterInput.value.trim();
  if (!value) {
    setLineupStatus('Bitte Roster-URL oder ID eintragen.', 'error');
    return;
  }

  setLineupStatus('Speichere Roster und lade Empfehlungen…');
  const remember = elements.lineupRemember ? Boolean(elements.lineupRemember.checked) : true;
  try {
    await apiClient.saveLineupSource({ roster: value, remember });
    persistLineupSource(value);
    await loadLineupRecommendations(value);
  } catch (err) {
    setLineupStatus(err.message || 'Roster konnte nicht gespeichert werden.', 'error');
  }
}

async function handleLineupLoadOnce() {
  if (!elements.lineupRosterInput) return;
  const value = elements.lineupRosterInput.value.trim();
  if (!value) {
    await loadLineupRecommendations('');
    return;
  }

  await loadLineupRecommendations(value);
}

async function refreshLineup() {
  await loadLineupRecommendations('');
}


function getParticipantPredictions(participant) {
  if (participant?.email) {
    return migratePredictions(participant, predictionSeason);
  }
  return migrateCoPlayerPredictions(participant, predictionSeason);
}

function listParticipants() {
  const tipParticipants = seasonTipParticipants.length
    ? seasonTipParticipants
    : buildParticipantsFromCachedUsers(cachedUsers, predictionSeason);
  // Lokale Mitspieler ergänzen, damit sie ebenfalls im Scoreboard erscheinen.
  const coPlayers = readCoPlayers();

  return sortByName([...tipParticipants, ...coPlayers]);
}

function hasMeaningfulPredictions(predictions) {

  if (!predictions) return false;

  const baseline = defaultPredictions();

  return Object.entries(predictions).some(([team, entry]) => {
    const normalized = normalizePrediction(entry);
    const defaultEntry = normalizePrediction(baseline[team]);

    if (
      normalized.divisionRank !== defaultEntry.divisionRank ||
      normalized.wins !== defaultEntry.wins ||
      normalized.losses !== defaultEntry.losses
    ) {
      return true;
    }
    return false;
  });
}


function getOverviewParticipants() {
  return listParticipants().filter(player => {
    const predictions = getParticipantPredictions(player);

    if (player.has_tip) return true;

    return hasMeaningfulPredictions(predictions);
  });
}

function updateOverviewExportButtons(locked, participants) {
  const hasParticipants = (participants || []).length > 0;

  if (elements.exportCsv) {
    elements.exportCsv.disabled = !locked || !hasParticipants;
    elements.exportCsv.title = !locked
      ? 'Export nach Erreichen des Stichtags verfügbar'
      : hasParticipants
        ? ''
        : 'Keine Tipps zum Exportieren vorhanden';
  }

  if (elements.exportPdf) {
    elements.exportPdf.disabled = !locked || !hasParticipants;
    elements.exportPdf.title = !locked
      ? 'Export nach Erreichen des Stichtags verfügbar'
      : hasParticipants
        ? 'Öffnet eine druckbare PDF-Ansicht des Scoreboards'
        : 'Keine Tipps zum Exportieren vorhanden';
  }
}

function renderPredictionsOverview() {
  const locked = isLocked();
  elements.overviewContent.innerHTML = '';

  const participants = getOverviewParticipants();
  updateOverviewExportButtons(locked, participants);
  const standingsAvailable = Boolean(standingsSnapshot);

  if (!locked) {
    elements.overviewContent.textContent = 'Die Übersicht wird nach dem Stichtag freigeschaltet.';
    return;
  }

  if (!participants.length) {
    elements.overviewContent.textContent = 'Noch keine Benutzer vorhanden.';
    return;
  }

  const scoreboard = buildOverviewScoreboard(participants);
  if (scoreboard) {
    elements.overviewContent.appendChild(scoreboard);
    return;
  }

  elements.overviewContent.textContent = 'Aktuelle Standings fehlen für den Scoreboard-Vergleich.';
}

function escapeCsvValue(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  return /[";\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function buildOverviewCsvRows(participants) {
  const headers = ['Team', ...participants.map(player => player.name || 'Unbekannt')];
  const rows = [headers];

  const orderedTeams = sortTeams();

  orderedTeams.forEach(team => {
    const baseRow = [team.name];

    participants.forEach(player => {
      const predictions = getParticipantPredictions(player);
      const rawPrediction = predictions?.[team.name];
      if (
        rawPrediction &&
        !Number.isNaN(Number(rawPrediction.divisionRank)) &&
        !Number.isNaN(Number(rawPrediction.wins)) &&
        !Number.isNaN(Number(rawPrediction.losses))
      ) {
        const normalized = normalizePrediction(rawPrediction);
        baseRow.push(`${normalized.divisionRank} (${normalized.wins}-${normalized.losses})`);
      } else {
        baseRow.push('');
      }
    });

    rows.push(baseRow);
  });

  return rows;
}

function handleOverviewExport() {
  const locked = isLocked();
  const participants = getOverviewParticipants();
  updateOverviewExportButtons(locked, participants);

  if (!locked) {
    elements.overviewStatus.textContent = 'Export steht erst nach dem Stichtag zur Verfügung.';
    return;
  }

  if (!participants.length) {
    elements.overviewStatus.textContent = 'Keine Tipps vorhanden, die exportiert werden können.';
    return;
  }

  const rows = buildOverviewCsvRows(participants);
  if (!rows.length) {
    elements.overviewStatus.textContent = 'Keine Daten für den Export gefunden.';
    return;
  }

  const csv = rows.map(row => row.map(escapeCsvValue).join(';')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `nfl-predictions-${predictionSeason}.csv`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  elements.overviewStatus.textContent = 'CSV-Export erstellt.';
}

async function handleOverviewPdfExport() {
  const locked = isLocked();
  const participants = getOverviewParticipants();
  updateOverviewExportButtons(locked, participants);

  if (!locked) {
    elements.overviewStatus.textContent = 'Export steht erst nach dem Stichtag zur Verfügung.';
    return;
  }

  if (!participants.length) {
    elements.overviewStatus.textContent = 'Keine Tipps vorhanden, die exportiert werden können.';
    return;
  }

  const scoreboard = elements.overviewContent.querySelector('.overview-scoreboard');
  if (!scoreboard) {
    elements.overviewStatus.textContent = 'Scoreboard fehlt für den Export.';
    return;
  }

  elements.overviewStatus.textContent = 'Druckbare Scoreboard-Ansicht wird vorbereitet…';

  const originalWidth = scoreboard.style.width;
  scoreboard.classList.add('overview-scoreboard--export');
  scoreboard.style.width = `${scoreboard.scrollWidth}px`;

  try {
    const canvas = await html2canvas(scoreboard, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#f7f9fc',
      windowWidth: scoreboard.scrollWidth,
      windowHeight: scoreboard.scrollHeight,
    });

    const imageData = canvas.toDataURL('image/png');
    const exportWindow = window.open('', '_blank');

    if (!exportWindow) {
      elements.overviewStatus.textContent = 'Popup blockiert. Erlaube Popups für den PDF-Export.';
      return;
    }

    exportWindow.document.write(`
      <html>
        <head>
          <title>NFL Predictions – Scoreboard Export</title>
          <style>
            body { margin: 0; padding: 16px; background: #f7f9fc; display: flex; justify-content: center; }
            img { max-width: 100%; height: auto; box-shadow: 0 8px 24px rgba(0,0,0,0.12); }
          </style>
        </head>
        <body>
          <img src="${imageData}" alt="NFL Predictions Scoreboard" />
        </body>
      </html>
    `);
    exportWindow.document.close();
    exportWindow.focus();

    const triggerPrint = () => {
      exportWindow.print();
      elements.overviewStatus.textContent = 'Druckbare Ansicht geöffnet. "Als PDF speichern" im Druckdialog wählen.';
    };

    if (exportWindow.document.readyState === 'complete') {
      triggerPrint();
    } else {
      exportWindow.onload = triggerPrint;
    }
  } catch (err) {
    console.error(err);
    elements.overviewStatus.textContent = 'PDF-Export fehlgeschlagen.';
  } finally {
    scoreboard.style.width = originalWidth;
    scoreboard.classList.remove('overview-scoreboard--export');
  }
}

function buildOverviewScoreboard(participants, options = {}) {
  if (!standingsSnapshot) return null;

  const { title = 'Scoreboard', subtitle = '', hint = '' } = options;

  const wrapper = document.createElement('div');
  wrapper.className = 'overview-scoreboard scoreboard-matrix';

  const header = document.createElement('div');
  header.className = 'overview-scoreboard__header';
  header.innerHTML = `
    <div>
      <h3 style="margin: 0;">${title}</h3>
      ${subtitle ? `<p class="stat-meta" style="margin: 4px 0 0;">${subtitle}</p>` : ''}
    </div>
    ${hint ? `<div class="hint">${hint}</div>` : ''}
  `;

  const columnTemplate = `minmax(190px, 1.1fr) repeat(${participants.length}, minmax(150px, 1fr))`;

  const columnGap = 10;
  const minWidth = 190 + participants.length * 150 + participants.length * columnGap;

  wrapper.style.setProperty('--scoreboard-columns', columnTemplate);
  wrapper.style.setProperty('--scoreboard-min-width', `${minWidth}px`);

  wrapper.appendChild(header);

  const headerRow = document.createElement('div');
  headerRow.className = 'scoreboard__header-row scoreboard__header-row--global scoreboard-row';

  const standingsHeader = document.createElement('div');
  standingsHeader.className = 'scoreboard__cell scoreboard__cell--header';
  standingsHeader.innerHTML = '<div class="scoreboard__player-name">Standings</div>';
  headerRow.appendChild(standingsHeader);

  participants.forEach(player => {
    const totalPoints = calculateUserTotalPoints(getParticipantPredictions(player));
    const cell = document.createElement('div');
    cell.className = 'scoreboard__cell scoreboard__cell--header';
    cell.innerHTML = `
      <div class="scoreboard__player-name">${player.name}</div>
      <div class="scoreboard__player-points">${
        typeof totalPoints === 'number' ? `${totalPoints} Punkte` : '–'
      }</div>
    `;
    headerRow.appendChild(cell);
  });

  const headerWrapper = document.createElement('div');
  headerWrapper.className = 'scoreboard scoreboard--with-ribbon scoreboard--header';

  const ribbonPlaceholder = document.createElement('div');
  ribbonPlaceholder.className = 'division-ribbon division-ribbon--placeholder';
  ribbonPlaceholder.setAttribute('aria-hidden', 'true');
  headerWrapper.appendChild(ribbonPlaceholder);

  headerWrapper.appendChild(headerRow);
  wrapper.appendChild(headerWrapper);

  const grid = document.createElement('div');
  grid.className = 'scoreboard-grid scoreboard-grid--matrix';

  CONFERENCE_ORDER.forEach(conf => {
    STAT_DIVISION_ORDER.forEach(div => {
      const divisionStandings = standingsSnapshot?.divisions?.[conf]?.[div] || [];
      const scoreboard = document.createElement('div');
      scoreboard.className = 'scoreboard scoreboard--with-ribbon';

      const ribbon = document.createElement('div');
      ribbon.className = `division-ribbon division-ribbon--${conf.toLowerCase()}`;
      ribbon.innerHTML = `
        <span class="division-ribbon__conf">${conf}</span>
        <span class="division-ribbon__div">${div}</span>
      `;
      scoreboard.appendChild(ribbon);

      const scoreboardContent = document.createElement('div');
      scoreboardContent.className = 'scoreboard__content';

      const divisionTeams = teams.filter(team => team.conference === conf && team.division === div);

      const userDivisionPredictions = participants.map(user => {
        const predictions = getParticipantPredictions(user);
        return {
          user,
          entries: divisionTeams
            .map(team => ({ team, prediction: normalizePrediction(predictions?.[team.name]) }))
            .sort((a, b) => a.prediction.divisionRank - b.prediction.divisionRank),
        };
      });

      const maxRows = Math.max(divisionStandings.length, divisionTeams.length);

      const bonusRow = document.createElement('div');
      bonusRow.className = 'scoreboard__row scoreboard__bonus-row';

      const infoCell = document.createElement('div');
      infoCell.className = 'scoreboard__cell scoreboard__cell--info';
      infoCell.innerHTML = `
        <div class="scoreboard__bonus-label">Bonus</div>
        <div class="scoreboard__bonus-hint">Perfekte Division = +3 · Perfekt mit Record = +5</div>
      `;
      bonusRow.appendChild(infoCell);

      userDivisionPredictions.forEach(({ entries }) => {
        const bonus = calculateDivisionBonus(entries);
        const cell = document.createElement('div');
        cell.className = 'scoreboard__cell scoreboard__cell--bonus bonus-compact';
        const bonusCaption =
          bonus >= 8 ? 'Standings + Record' : bonus >= 3 ? 'Standings perfekt' : 'Noch offen';
        cell.innerHTML = `
          <div class="bonus-chip ${bonus ? 'bonus-chip--active' : ''}">
            ${bonus ? `⭐️ +${bonus}` : '–'}
          </div>
          <div class="bonus-chip__caption">${bonusCaption}</div>
        `;
        bonusRow.appendChild(cell);
      });

      scoreboardContent.appendChild(bonusRow);

      for (let i = 0; i < maxRows; i++) {
        const row = document.createElement('div');
        row.className = 'scoreboard__row scoreboard__row--matrix';

        const actualEntry = divisionStandings[i];
        const actualCell = document.createElement('div');
        actualCell.className = 'scoreboard__cell scoreboard__cell--actual cell-standings';

        if (actualEntry) {
          const { alias } = splitTeamName(actualEntry.team.name);
          const displayName = alias || actualEntry.team.name;
          actualCell.innerHTML = `
            <div class="scoreboard__team-row scoreboard__team-row--actual">
              <span class="scoreboard__rank">${i + 1}.</span>
              <img src="${actualEntry.stats.logo}" alt="${actualEntry.team.name} Logo" class="team-logo" loading="lazy" />
              <span class="team-name team-name--alias">${displayName}</span>
              <span class="scoreboard__record">${actualEntry.stats.wins}-${actualEntry.stats.losses}</span>
            </div>
          `;
        } else {
          actualCell.textContent = '–';
        }
        row.appendChild(actualCell);

        userDivisionPredictions.forEach(({ entries }) => {
          const predicted = entries[i];
          const cell = document.createElement('div');
          cell.className = 'scoreboard__cell scoreboard__cell--prediction prediction-compact';

          if (predicted) {
            const teamPoints = calculateTeamPoints(predicted.team.name, predicted.prediction);
            const pointsLabel =
              typeof teamPoints === 'number' ? `${teamPoints} Punkt${teamPoints === 1 ? '' : 'e'}` : '–';

            cell.innerHTML = `
              <div class="scoreboard__team-row scoreboard__team-row--predicted">
                <img src="${getTeamLogo(predicted.team.name)}" alt="${predicted.team.name} Logo" class="team-logo" loading="lazy" />
                <span class="scoreboard__record">${predicted.prediction.wins}-${predicted.prediction.losses}</span>
                <span class="team-points">${pointsLabel}</span>
              </div>
            `;
          } else {
            cell.textContent = '–';
          }

          row.appendChild(cell);
        });

        scoreboardContent.appendChild(row);
      }

      scoreboard.appendChild(scoreboardContent);
      grid.appendChild(scoreboard);
    });
  });

  wrapper.appendChild(grid);

  return wrapper;
}

function updateOverviewAccess() {
  const locked = isLocked();
  const overviewBtn = Array.from(elements.tabButtons).find(btn => btn.dataset.tab === 'overviewTab');
  if (overviewBtn) {
    overviewBtn.disabled = !locked;
    overviewBtn.dataset.disabled = (!locked).toString();
    overviewBtn.classList.toggle('tab-link--disabled', !locked);
    if (!locked && overviewBtn.classList.contains('active')) {
      switchTab('profileTab');
    }
  }

  elements.overviewStatus.textContent = locked
    ? 'Stichtag erreicht – alle Tipps werden angezeigt.'
    : 'Die Übersicht wird am Stichtag automatisch freigeschaltet.';

  renderPredictionsOverview();
}

function setupEvents() {
  elements.showRegister.addEventListener('click', () => showAuth('register'));
  elements.showLogin.addEventListener('click', () => showAuth('login'));
  elements.startNow.addEventListener('click', () => showAuth('register'));
  elements.registerForm.addEventListener('submit', handleRegister);
  elements.loginForm.addEventListener('submit', handleLogin);
  elements.logoutBtn.addEventListener('click', async () => {
    await auth.logout();
    setActivePredictor({ type: 'user', id: '' });
    updateAuthUI();
    showAuth('login');
  });
  elements.profileForm.addEventListener('submit', handleProfileSubmit);
  elements.savePredictions.addEventListener('click', savePredictions);
  elements.lockSeasonSelect?.addEventListener('change', updateLockDateForm);
  elements.saveLockDate?.addEventListener('click', handleLockDateSave);
  elements.coPlayerSelect?.addEventListener('change', handlePredictorChange);
  elements.addCoPlayer?.addEventListener('click', handleAddCoPlayer);
  elements.editCoPlayer?.addEventListener('click', handleEditCoPlayer);
  elements.deleteCoPlayer?.addEventListener('click', handleDeleteCoPlayer);
  elements.tabButtons.forEach(btn =>
    btn.addEventListener('click', event => {
      event.preventDefault();
      const isDisabled = btn.disabled || btn.classList.contains('tab-link--disabled') || btn.dataset.disabled === 'true';
      if (isDisabled) return;
      switchTab(btn.dataset.tab);
    })
  );
  elements.refreshStats.addEventListener('click', loadStats);
  elements.lineupForm?.addEventListener('submit', handleLineupSubmit);
  elements.lineupLoadOnce?.addEventListener('click', handleLineupLoadOnce);
  elements.lineupRefresh?.addEventListener('click', refreshLineup);
  elements.seasonPicker?.addEventListener('change', handleSeasonChange);
  elements.exportCsv?.addEventListener('click', handleOverviewExport);
  elements.exportPdf?.addEventListener('click', handleOverviewPdfExport);
  elements.seasonForm?.addEventListener('submit', handleSeasonCreate);
  elements.roleUserSelect?.addEventListener('change', syncSelectedRoleOption);
  elements.roleForm?.addEventListener('submit', handleRoleFormSubmit);
}

async function init() {
  await loadMetadata();
  populateTeamSelect();
  populateSeasonPicker();
  populateLockSeasonSelect();
  renderAdminSeasons();
  showAuth('login');
  setupEvents();
  const storedLineup = await syncLineupSource();
  await auth.init();
  if (auth.currentUser) {
    updateAuthUI();
  }
  updateOverviewAccess();
  loadStats();
  await loadSeasonTips();
  if (storedLineup?.roster_id || readStoredLineupSource()) {
    refreshLineup();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  init();
});