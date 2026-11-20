import {
  DEFAULT_START_TIME, THEME_KEY, HUD_INTERVAL, MAX_SCHEDULE_ROWS,
  fmtClock, periodName, formatEta,
} from './config.js';

const ALLOWED_SPEEDS = [1, 2, 4, 8];

function readSharedState(config, hasRealSchedule) {
  const params = new URLSearchParams(window.location.search);
  const timeParam = params.get('time');
  const speedParam = params.get('speed');
  const rawTime = timeParam === null || timeParam.trim() === '' ? NaN : Number(timeParam);
  const rawSpeed = speedParam === null || speedParam.trim() === '' ? NaN : Number(speedParam);
  const theme = params.get('theme');
  const requestedMode = params.get('mode');
  const scenario = params.get('scenario');
  return {
    time: Number.isFinite(rawTime) && rawTime >= 0 && rawTime <= 172800 ? rawTime : config.simulation.startTime,
    speed: ALLOWED_SPEEDS.includes(rawSpeed) ? rawSpeed : config.simulation.defaultSpeed,
    theme: ['light', 'dark'].includes(theme) ? theme : null,
    mode: requestedMode === 'real' && hasRealSchedule ? 'real' : 'illustrative',
    scenario: Object.hasOwn(config.scenarios, scenario) ? scenario : 'normal',
  };
}

export function createUI({ config, engine, renderer, realScheduleAvailable }) {
  const sim = engine.sim;
  const $ = (id) => document.getElementById(id);
  const dom = {
    clock: $('clock'),
    period: $('period'),
    clockState: $('clockState'),
    dwelling: $('stDwelling'),
    waiting: $('stWaiting'),
    boarded: $('stBoarded'),
    departed: $('stDeparted'),
    service: $('serviceStatus'),
    headways: $('headways'),
    trains: $('trainsInService'),
    paxInStation: $('paxInStation'),
    boardCount: $('boardCount'),
    schedule: $('schedule'),
    feed: $('feed'),
    pause: $('pauseBtn'),
    themeBtn: $('themeBtn'),
    speedButtons: document.querySelectorAll('[data-speed]'),
    jumpButtons: document.querySelectorAll('[data-jump]'),
    modeSelect: $('scheduleMode'),
    scenarioSelect: $('scenarioSelect'),
    scenarioDescription: $('scenarioDescription'),
    dataNote: $('dataNote'),
    summary: $('stationSummary'),
    summaryMode: $('summaryMode'),
    resetBtn: $('resetBtn'),
    replayBtn: $('replayBtn'),
    shareBtn: $('shareBtn'),
    shareStatus: $('shareStatus'),
  };

  const sharedState = readSharedState(config, realScheduleAvailable);
  let currentTheme = sharedState.theme;
  let lastSummary = '';
  let lastSummaryAnnouncement = 0;
  let lastFrame = performance.now();
  let hudTimer = 0;
  let reducedMotionPreference = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  let manualMotionOptIn = false;

  function systemTheme() {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    currentTheme = theme;
    renderer.setTheme(theme);
    document.documentElement.dataset.theme = theme;
    const dark = theme === 'dark';
    dom.themeBtn.textContent = dark ? 'Light mode' : 'Dark mode';
    dom.themeBtn.setAttribute('aria-pressed', String(dark));
  }

  function initTheme() {
    let preferred = currentTheme;
    if (!preferred) {
      try {
        const stored = localStorage.getItem(THEME_KEY);
        if (stored === 'light' || stored === 'dark') preferred = stored;
      } catch {
        // Storage can be disabled. System preference remains the fallback.
      }
    }
    applyTheme(preferred || systemTheme());
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
      if (!new URLSearchParams(window.location.search).has('theme')) {
        try {
          if (!localStorage.getItem(THEME_KEY)) applyTheme(systemTheme());
        } catch {
          applyTheme(systemTheme());
        }
      }
    });
  }

  function updateShareUrl() {
    const url = new URL(window.location.href);
    url.searchParams.set('time', String(Math.floor(sim.time)));
    url.searchParams.set('speed', String(sim.speed));
    url.searchParams.set('theme', currentTheme || systemTheme());
    url.searchParams.set('mode', sim.mode);
    url.searchParams.set('scenario', sim.scenario);
    window.history.replaceState({}, '', url);
    return url.toString();
  }

  async function shareState() {
    const shareUrl = updateShareUrl();
    try {
      await navigator.clipboard.writeText(shareUrl);
      dom.shareStatus.textContent = 'Simulation link copied.';
    } catch {
      dom.shareStatus.textContent = 'Clipboard access is unavailable. Copy the URL from your address bar.';
    }
  }

  function el(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }

  function renderLog() {
    dom.feed.replaceChildren(...sim.events.map((event) => {
      const item = el('div', 'event');
      const heading = el('b');
      heading.append(el('span', 'ts', event.time), document.createTextNode(event.title));
      item.append(heading, el('span', null, event.detail));
      return item;
    }));
  }

  function renderSchedule() {
    const rows = engine.upcoming(() => true, MAX_SCHEDULE_ROWS);
    dom.schedule.replaceChildren(...rows.map((row) => {
      const eta = formatEta(row, sim.time);
      const line = row.svc.line;
      const item = el('div', eta === 'Now' ? 'row now' : 'row');
      item.append(el('div', 'rtime', eta));

      const main = el('div');
      main.append(el('div', 'dest', engine.destinationOf(row.svc)));
      const details = [line.label, line.system === 'bart' ? 'BART' : 'Muni', engine.directionOf(row.svc), row.status];
      if (row.delay > 8) details.push(`${Math.round(row.delay)} s late`);
      if (sim.mode === 'real') details.push('GTFS static');
      main.append(el('div', 'meta', details.join(', ')));
      item.append(main);

      const badge = el('div', `badge ${line.system === 'bart' ? 'badge-bart' : 'badge-muni'}`, line.short || line.label);
      badge.style.setProperty('--line-color', line.color);
      badge.style.color = line.ink;
      item.append(badge);
      return item;
    }));
    dom.boardCount.textContent = `${rows.length} upcoming · ${sim.mode === 'real' ? 'GTFS static' : 'illustrative'}`;
    if (!rows.length) dom.schedule.append(el('p', 'empty-state', 'No more departures are available in this service window.'));
  }

  function updateStationSummary(force = false) {
    const passengerCounts = engine.getPassengerCounts();
    const activeBart = sim.trains.filter((train) => train.isBart).length;
    const activeMuni = sim.trains.filter((train) => !train.isBart).length;
    const waitingTotal = passengerCounts.waitingBart + passengerCounts.waitingMuni;
    const next = engine.upcoming(() => true, 1)[0];
    const nextText = next
      ? `Next: ${next.svc.line.label} to ${engine.destinationOf(next.svc)} in ${formatEta(next, sim.time)}.`
      : 'No further departures in the loaded service window.';
    const modeText = sim.mode === 'real'
      ? `Real schedule, GTFS static for ${engine.scheduleMetadata()?.serviceDate || 'the imported service date'}.`
      : 'Illustrative schedule. Departures and demand are synthetic.';
    const summary = `${fmtClock(sim.time).slice(0, 5)}, ${periodName(sim.time, config.simulation)}. ${activeBart} BART and ${activeMuni} Muni trains active. ${waitingTotal} passengers waiting (${passengerCounts.waitingBart} BART, ${passengerCounts.waitingMuni} Muni), ${passengerCounts.walking} moving through the station. ${nextText} ${modeText}`;
    const now = performance.now();
    if (summary !== lastSummary && (force || !lastSummary || now - lastSummaryAnnouncement >= 5000)) {
      dom.summary.textContent = summary;
      lastSummary = summary;
      lastSummaryAnnouncement = now;
    }
  }

  function updateHud() {
    dom.clock.textContent = fmtClock(sim.time);
    dom.period.textContent = periodName(sim.time, config.simulation);
    const modeLabel = sim.mode === 'real' ? 'Real schedule' : 'Illustrative';
    const motionNote = reducedMotionPreference && !manualMotionOptIn ? ' · reduced motion' : '';
    dom.clockState.textContent = `${sim.paused ? 'Paused' : 'Running'} at ${sim.speed}× · ${modeLabel}${motionNote}`;

    dom.dwelling.textContent = sim.trains.filter((train) => train.state === 'dwell').length;
    dom.waiting.textContent = sim.passengers.filter((passenger) => passenger.state === 'waiting').length;
    dom.boarded.textContent = sim.stats.boarded;
    dom.departed.textContent = sim.stats.departed;

    const delayed = sim.mode === 'illustrative' && sim.trains.some((train) => train.delay > 10 && train.state !== 'depart');
    dom.service.textContent = sim.mode === 'real' ? 'Static timetable' : delayed ? 'Minor delay, recovering' : 'Illustrative service';
    dom.service.className = delayed ? 'warn' : 'ok';
    const bartHeadway = engine.fastestHeadway('bart');
    const muniHeadway = engine.fastestHeadway('muni');
    const formatHeadway = (value) => value == null ? '—' : `${Math.round(value / 60)} min`;
    dom.headways.textContent = `BART ${formatHeadway(bartHeadway)}, Muni ${formatHeadway(muniHeadway)}`;
    dom.trains.textContent = sim.trains.length;
    dom.paxInStation.textContent = sim.passengers.length;

    const selectedScenario = config.scenarios[sim.scenario];
    dom.scenarioDescription.textContent = selectedScenario.description;
    const metadata = engine.scheduleMetadata();
    const feedAgencies = (metadata?.sources || []).map((source) => source.agency).filter(Boolean).join(' + ');
    dom.dataNote.textContent = sim.mode === 'real'
      ? `Static GTFS schedule · ${metadata?.serviceDate || 'service date unknown'} · ${feedAgencies || 'BART and SFMTA'}. Train movement, dwell and passenger flow are simulated; this is not real-time tracking.`
      : `Illustrative mode · departures, passenger demand, dwell times and delays are synthetic.${realScheduleAvailable ? '' : ' Import BART and SFMTA GTFS feeds to enable Real schedule mode.'}`;
    dom.summaryMode.textContent = modeLabel;

    renderSchedule();
    renderLog();
    updateStationSummary();
  }

  function setSpeed(speed) {
    if (!ALLOWED_SPEEDS.includes(speed)) return;
    sim.speed = speed;
    dom.speedButtons.forEach((button) => {
      const selected = Number(button.dataset.speed) === speed;
      button.classList.toggle('on', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    updateShareUrl();
    updateHud();
  }

  function setPaused(paused) {
    sim.paused = paused;
    if (!paused && reducedMotionPreference) {
      manualMotionOptIn = true;
      renderer.setReducedMotion(false);
    }
    dom.pause.textContent = paused ? 'Resume' : 'Pause';
    dom.pause.classList.toggle('active', paused);
    updateHud();
  }

  function jumpTo(time) {
    engine.resetSimulation(time);
    engine.logEvent('Simulation time changed', `Jumped to ${fmtClock(time)}, service times recalculated`);
    dom.jumpButtons.forEach((button) => button.classList.toggle('on', Number(button.dataset.jump) === Math.floor(time)));
    updateShareUrl();
    updateHud();
  }

  function selectMode(mode) {
    if (!engine.setMode(mode)) {
      dom.modeSelect.value = 'illustrative';
      return;
    }
    engine.logEvent(mode === 'real' ? 'GTFS schedule loaded' : 'Illustrative mode selected', mode === 'real'
      ? `Loaded static schedule for ${engine.scheduleMetadata()?.serviceDate || 'the imported service date'}`
      : 'Using synthetic demo timetable and passenger flows');
    updateShareUrl();
    updateHud();
  }

  function selectScenario(id) {
    if (!engine.setScenario(id)) return;
    engine.logEvent('Disruption scenario changed', config.scenarios[id].label);
    updateShareUrl();
    updateHud();
  }

  function resetAll() {
    engine.setMode('illustrative');
    engine.setScenario('normal');
    engine.resetSimulation(config.simulation.startTime);
    setSpeed(config.simulation.defaultSpeed);
    setPaused(reducedMotionPreference);
    dom.modeSelect.value = 'illustrative';
    dom.scenarioSelect.value = 'normal';
    manualMotionOptIn = false;
    renderer.setReducedMotion(reducedMotionPreference);
    dom.jumpButtons.forEach((button) => button.classList.toggle('on', Number(button.dataset.jump) === config.simulation.startTime));
    engine.logEvent('Simulation reset', 'Restored the default time, speed and normal illustrative scenario');
    updateShareUrl();
    updateHud();
  }

  function replay() {
    engine.resetSimulation(config.simulation.startTime);
    setPaused(false);
    engine.logEvent('Replay started', `Restarted ${sim.mode === 'real' ? 'the GTFS static' : 'the illustrative'} scenario at ${fmtClock(sim.time)}`);
    updateShareUrl();
    updateHud();
  }

  function bindControls() {
    dom.pause.addEventListener('click', () => setPaused(!sim.paused));
    dom.themeBtn.addEventListener('click', () => {
      const next = currentTheme === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try { localStorage.setItem(THEME_KEY, next); } catch { /* URL still preserves the selection. */ }
      updateShareUrl();
    });
    dom.speedButtons.forEach((button) => button.addEventListener('click', () => setSpeed(Number(button.dataset.speed))));
    dom.jumpButtons.forEach((button) => button.addEventListener('click', () => jumpTo(Number(button.dataset.jump))));
    dom.modeSelect.addEventListener('change', () => selectMode(dom.modeSelect.value));
    dom.scenarioSelect.addEventListener('change', () => selectScenario(dom.scenarioSelect.value));
    dom.resetBtn.addEventListener('click', resetAll);
    dom.replayBtn.addEventListener('click', replay);
    dom.shareBtn.addEventListener('click', shareState);

    window.addEventListener('keydown', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select')) return;
      if (event.code === 'Space') {
        if (target?.closest('button')) return;
        event.preventDefault();
        setPaused(!sim.paused);
      } else if (ALLOWED_SPEEDS.map(String).includes(event.key)) {
        setSpeed(Number(event.key));
      }
    });
  }

  function frame(now) {
    const realDelta = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    if (!sim.paused) {
      const delta = realDelta * sim.speed;
      sim.time += delta;
      engine.step(delta);
    }
    renderer.draw(now);
    hudTimer += realDelta;
    if (hudTimer >= HUD_INTERVAL) {
      hudTimer = 0;
      updateHud();
    }
    requestAnimationFrame(frame);
  }

  function init() {
    engine.setScenario(sharedState.scenario);
    engine.setMode(sharedState.mode);
    engine.resetSimulation(sharedState.time);
    sim.speed = sharedState.speed;
    sim.paused = reducedMotionPreference;
    dom.modeSelect.value = sim.mode;
    dom.scenarioSelect.value = sim.scenario;
    dom.modeSelect.querySelector('option[value="real"]').disabled = !realScheduleAvailable;
    renderer.setReducedMotion(reducedMotionPreference);
    initTheme();
    bindControls();
    const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    motionQuery?.addEventListener?.('change', (event) => {
      reducedMotionPreference = event.matches;
      if (event.matches) {
        manualMotionOptIn = false;
        renderer.setReducedMotion(true);
        setPaused(true);
      } else {
        renderer.setReducedMotion(false);
      }
    });
    setSpeed(sharedState.speed);
    setPaused(reducedMotionPreference);
    renderer.resizeCanvas();
    if ('ResizeObserver' in window) new ResizeObserver(renderer.resizeCanvas).observe($('stage'));
    else window.addEventListener('resize', renderer.resizeCanvas);
    dom.jumpButtons.forEach((button) => button.classList.toggle('on', Number(button.dataset.jump) === Math.floor(sharedState.time)));
    updateHud();
    requestAnimationFrame(frame);
  }

  init();
  return { updateHud, updateShareUrl };
}
