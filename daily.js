// Recordatorio diario: barra bajo la cabecera con los siete días de la semana.
// No se puede cerrar hasta que se marca el día de hoy; una vez marcado se puede cerrar
// y vuelve a aparecer cuando empieza el día siguiente (a las 6:00).
// Se activa y se escribe el texto en Configuración (appSettings.dailyOn / appSettings.dailyText).
(function () {
  const CHECKS_KEY = 'zenban_daily_checks';   // { 'AAAA-MM-DD': true }
  const DISMISS_KEY = 'zenban_daily_dismissed'; // clave del día en que se cerró la barra
  const DAY_START_HOUR = 6;
  const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  const bar = document.getElementById('dailyBar');
  if (!bar) return;
  const textEl = document.getElementById('dailyText');
  const daysEl = document.getElementById('dailyDays');
  const closeBtn = document.getElementById('dailyCloseBtn');

  function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)); } catch { /* sin almacenamiento */ }
  }
  function dayKey(d) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  // "Hoy" para el recordatorio: antes de las 6:00 todavía cuenta como el día anterior
  function reminderToday() {
    const d = new Date(Date.now() - DAY_START_HOUR * 3600 * 1000);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function weekDays() {
    const today = reminderToday();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    return [...Array(7)].map((_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }

  function placeBar() {
    const header = document.querySelector('.app-header');
    const bottom = header ? header.getBoundingClientRect().bottom : 64;
    bar.style.top = `${Math.round(bottom + 8)}px`;
  }

  function render() {
    const enabled = !!appSettings.dailyOn && !!(appSettings.dailyText || '').trim();
    const reopenBtn = document.getElementById('ctxDaily');
    if (reopenBtn) reopenBtn.hidden = true;
    if (!enabled) { bar.hidden = true; return; }

    const checks = readJson(CHECKS_KEY, {});
    const today = reminderToday();
    const todayKey = dayKey(today);
    const doneToday = !!checks[todayKey];

    if (doneToday && localStorage.getItem(DISMISS_KEY) === todayKey) {
      bar.hidden = true;
      if (reopenBtn) reopenBtn.hidden = false; // se puede volver a abrir desde la barra del lienzo
      return;
    }

    bar.hidden = false;
    bar.classList.toggle('is-done', doneToday);
    closeBtn.hidden = !doneToday; // solo se puede cerrar con el día de hoy cumplido
    textEl.textContent = appSettings.dailyText.trim();

    daysEl.innerHTML = '';
    weekDays().forEach((d, i) => {
      const key = dayKey(d);
      const isToday = key === todayKey;
      const future = d > today;
      const on = !!checks[key];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'daily-day' + (isToday ? ' is-today' : '') + (future ? ' is-future' : '') + (on ? ' is-checked' : '');
      btn.disabled = future;
      btn.setAttribute('role', 'checkbox');
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
      btn.setAttribute('aria-label', `${DAY_NAMES[i]} ${d.getDate()}`);
      btn.innerHTML =
        `<span class="daily-day-name">${DAY_NAMES[i]}</span>` +
        `<span class="daily-day-date">${d.getDate()}/${d.getMonth() + 1}</span>` +
        `<span class="daily-box">${on ? '✓' : ''}</span>`;
      btn.addEventListener('click', () => {
        const all = readJson(CHECKS_KEY, {});
        if (all[key]) delete all[key]; else all[key] = true;
        write(CHECKS_KEY, all);
        if (isToday && !all[key]) localStorage.removeItem(DISMISS_KEY);
        render();
      });
      daysEl.appendChild(btn);
    });
    placeBar();
  }

  closeBtn.addEventListener('click', () => {
    write(DISMISS_KEY, dayKey(reminderToday()));
    render();
  });

  const reopen = document.getElementById('ctxDaily');
  if (reopen) reopen.addEventListener('click', () => { localStorage.removeItem(DISMISS_KEY); render(); });

  window.addEventListener('resize', placeBar);
  // Al pasar de las 5:59 a las 6:00 la barra reaparece sola
  setInterval(render, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

  window.refreshDailyReminder = render;
  render();
})();
