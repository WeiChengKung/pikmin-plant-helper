(() => {
  const COLORS = ["white", "yellow", "red", "blue"];
  const GIST_FILE = "pikmin-data.json";
  const LS_KEY = "pikmin-tracker-v1";

  const defaultPlanner = () => ({
    avgFP: 30,
    pDuration: 15,
    flowerTarget: 15000,
    nectar: { white: 209, yellow: 258, red: 143, blue: 173 },
    petal: { white: 550, yellow: 550, red: 550, blue: 550 },
    realTime: { white: null, yellow: null, red: null, blue: null },
    resultEndP: { white: null, yellow: null, red: null, blue: null },
  });

  const P_DURATION_OPTIONS = [30, 20, 15, 12, 10];

  function pDurationFromPikmin(pikminNum) {
    const n = num(pikminNum);
    if (n === null || n < 1) return null;
    if (n <= 9) return 30;
    if (n <= 19) return 20;
    if (n <= 29) return 15;
    if (n <= 39) return 12;
    return 10; // 40+
  }

  function nearestPDurationOption(v) {
    const n = num(v);
    if (n === null) return 15;
    if (P_DURATION_OPTIONS.includes(n)) return n;
    return P_DURATION_OPTIONS.reduce((best, opt) =>
      Math.abs(opt - n) < Math.abs(best - n) ? opt : best
    );
  }

  const defaultSession = () => ({
    date: new Date().toISOString().slice(0, 10),
    pikminNum: 39,
    flower: 15011,
    timeSpent: 89,
    petalSpent: null,
  });

  let state = {
    sessions: [defaultSession()],
    planner: defaultPlanner(),
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function num(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function n0(v) {
    const n = num(v);
    return n === null ? 0 : n;
  }

  function fmt(v, digits = 2) {
    if (v === null || v === undefined || Number.isNaN(v)) return "";
    if (Number.isInteger(v)) return String(v);
    return Number(v.toFixed(digits)).toString();
  }

  function setStatus(text, stateName = "idle") {
    const el = $("#syncStatus");
    el.textContent = text;
    el.dataset.state = stateName;
  }

  function getSettings() {
    return {
      gistId: localStorage.getItem("pikmin-gist-id") || "",
      token: localStorage.getItem("pikmin-gist-token") || "",
      flowerTarget: num(localStorage.getItem("pikmin-flower-target")) || 15000,
    };
  }

  function saveSettingsToLS() {
    localStorage.setItem("pikmin-gist-id", $("#gistId").value.trim());
    const token = $("#gistToken").value.trim();
    if (token) localStorage.setItem("pikmin-gist-token", token);
    localStorage.setItem("pikmin-flower-target", $("#flowerTarget").value || "15000");
    state.planner.flowerTarget = num($("#flowerTarget").value) || 15000;
    recalc();
    persistLocal();
    setStatus("Settings saved", "ok");
  }

  function loadSettingsUI() {
    const s = getSettings();
    $("#gistId").value = s.gistId;
    $("#gistToken").value = s.token;
    $("#flowerTarget").value = s.flowerTarget;
    state.planner.flowerTarget = s.flowerTarget;
  }

  function persistLocal() {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (data?.sessions && data?.planner) {
        state = {
          sessions: data.sessions,
          planner: { ...defaultPlanner(), ...data.planner },
        };
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  }

  function exportPayload() {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      sessions: state.sessions,
      planner: state.planner,
    };
  }

  function importPayload(data) {
    if (!data || typeof data !== "object") throw new Error("Invalid data");
    if (!Array.isArray(data.sessions)) throw new Error("Missing sessions");
    if (!data.planner || typeof data.planner !== "object") throw new Error("Missing planner");
    state = {
      sessions: data.sessions,
      planner: { ...defaultPlanner(), ...data.planner },
    };
    if (state.planner.flowerTarget) {
      localStorage.setItem("pikmin-flower-target", String(state.planner.flowerTarget));
      $("#flowerTarget").value = state.planner.flowerTarget;
    }
  }

  /* —— Excel-equivalent formulas —— */
  function computePlanner(p) {
    const avgFP = n0(p.avgFP);
    const pDuration = n0(p.pDuration);
    const target = n0(p.flowerTarget) || 15000;

    const eqP = {};
    COLORS.forEach((c) => {
      eqP[c] = n0(p.petal[c]) + n0(p.nectar[c]) * 2;
    });
    const eqMin = Math.min(...COLORS.map((c) => eqP[c]));

    const minusMin = {};
    COLORS.forEach((c) => {
      minusMin[c] = eqP[c] - eqMin;
    });

    const estF = {};
    COLORS.forEach((c) => {
      estF[c] = minusMin[c] * avgFP;
    });
    const estFSum = COLORS.reduce((s, c) => s + estF[c], 0);

    const remain = target - estFSum;
    const avgRemain = {};
    COLORS.forEach((c) => {
      if (remain > 0) avgRemain[c] = remain / 4;
      else if (minusMin[c] === 0) avgRemain[c] = 0;
      else avgRemain[c] = remain / 3;
    });

    // total F = est + avg remain; clamp negatives to 0 and
    // rescale other colors so Σ total F still equals the flower target.
    const totalF = {};
    COLORS.forEach((c) => {
      totalF[c] = Math.max(0, estF[c] + avgRemain[c]);
    });
    let totalFSum = COLORS.reduce((s, c) => s + totalF[c], 0);
    if (totalFSum > 0 && Math.abs(totalFSum - target) > 1e-9) {
      const scale = target / totalFSum;
      COLORS.forEach((c) => {
        totalF[c] *= scale;
      });
      totalFSum = target;
    } else if (totalFSum === 0 && target > 0) {
      COLORS.forEach((c) => {
        totalF[c] = target / COLORS.length;
      });
      totalFSum = target;
    }
    COLORS.forEach((c) => {
      totalF[c] = Math.round(totalF[c]);
    });
    totalFSum = COLORS.reduce((s, c) => s + totalF[c], 0);

    const fAcc = {};
    fAcc.white = totalF.white;
    fAcc.yellow = fAcc.white + totalF.yellow;
    fAcc.red = fAcc.yellow + totalF.red;
    fAcc.blue = fAcc.red + totalF.blue;

    const expectP = {};
    COLORS.forEach((c) => {
      expectP[c] = avgFP === 0 ? 0 : Math.round(totalF[c] / avgFP);
    });
    const expectPSum = COLORS.reduce((s, c) => s + expectP[c], 0);

    const expectTime = {};
    COLORS.forEach((c) => {
      expectTime[c] = (expectP[c] / 60) * pDuration;
    });
    const expectTimeSum = COLORS.reduce((s, c) => s + expectTime[c], 0);

    const expectEndP = {};
    COLORS.forEach((c) => {
      expectEndP[c] = n0(p.petal[c]) - expectP[c];
    });

    const resultEndP = {};
    COLORS.forEach((c) => {
      resultEndP[c] = num(p.resultEndP[c]);
    });
    const resultEndPSum = COLORS.reduce((s, c) => s + n0(resultEndP[c]), 0);

    const resultPSpent = {};
    COLORS.forEach((c) => {
      resultPSpent[c] = n0(p.petal[c]) - n0(resultEndP[c]);
    });
    const resultPSpentSum = COLORS.reduce((s, c) => s + resultPSpent[c], 0);

    const delta = {};
    COLORS.forEach((c) => {
      delta[c] = n0(resultEndP[c]) - expectEndP[c];
    });

    const endEqP = {};
    COLORS.forEach((c) => {
      endEqP[c] = n0(p.nectar[c]) * 2 + n0(resultEndP[c]);
    });

    return {
      eqP,
      eqMin,
      minusMin,
      estF,
      estFSum,
      remain,
      avgRemain,
      totalF,
      totalFSum,
      fAcc,
      expectP,
      expectPSum,
      expectTime,
      expectTimeSum,
      expectEndP,
      resultPSpent,
      resultPSpentSum,
      resultEndPSum,
      delta,
      endEqP,
    };
  }

  function setOut(key, value) {
    const el = document.querySelector(`[data-out="${key}"]`);
    if (el) el.textContent = fmt(value);
  }

  function syncScalarInputsFromDom() {
    const avgEl = $("#avgFP");
    const durEl = $("#pDuration");
    if (avgEl) state.planner.avgFP = num(avgEl.value);
    if (durEl) state.planner.pDuration = num(durEl.value);
  }

  function recalc() {
    syncScalarInputsFromDom();
    const r = computePlanner(state.planner);
    COLORS.forEach((c) => {
      setOut(`eqP.${c}`, r.eqP[c]);
      setOut(`minusMin.${c}`, r.minusMin[c]);
      setOut(`estF.${c}`, r.estF[c]);
      setOut(`avgRemain.${c}`, r.avgRemain[c]);
      setOut(`totalF.${c}`, r.totalF[c]);
      setOut(`fAcc.${c}`, r.fAcc[c]);
      setOut(`expectTime.${c}`, r.expectTime[c]);
      setOut(`expectP.${c}`, r.expectP[c]);
      setOut(`expectEndP.${c}`, r.expectEndP[c]);
      setOut(`resultPSpent.${c}`, r.resultPSpent[c]);
      setOut(`delta.${c}`, r.delta[c]);
      setOut(`endEqP.${c}`, r.endEqP[c]);
    });
    setOut("estF.sum", r.estFSum);
    setOut("avgRemain.remain", r.remain);
    setOut("totalF.sum", r.totalFSum);
    setOut("expectTime.sum", r.expectTimeSum);
    setOut("expectP.sum", r.expectPSum);
    setOut("resultPSpent.sum", r.resultPSpentSum);
    setOut("resultEndP.sum", r.resultEndPSum);
    setOut(
      "realTime.sum",
      COLORS.reduce((s, c) => s + n0(state.planner.realTime?.[c]), 0)
    );

    // session derived columns
    $$("#sessionBody tr").forEach((tr, i) => {
      const s = state.sessions[i];
      if (!s) return;
      const flowerPerMin =
        num(s.flower) !== null && num(s.timeSpent) && n0(s.timeSpent) !== 0
          ? n0(s.flower) / n0(s.timeSpent)
          : null;
      const pDur = pDurationFromPikmin(s.pikminNum);
      const flowerPerPetal =
        flowerPerMin !== null && pDur ? flowerPerMin / (60 / pDur) : null;
      const avgEl = tr.querySelector('[data-field="average"]');
      const durEl = tr.querySelector('[data-field="pDuration"]');
      const fpEl = tr.querySelector('[data-field="flowerPerPetal"]');
      if (avgEl) avgEl.textContent = fmt(flowerPerMin);
      if (durEl) durEl.textContent = pDur === null ? "" : String(pDur);
      if (fpEl) fpEl.textContent = fmt(flowerPerPetal);
    });
  }

  function renderSessions() {
    const body = $("#sessionBody");
    body.innerHTML = "";
    state.sessions.forEach((s, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <th>${i + 1}</th>
        <td><input data-field="date" type="date" value="${s.date || ""}" /></td>
        <td><input data-field="pikminNum" class="input-green" type="number" step="1" min="1" value="${s.pikminNum ?? ""}" /></td>
        <td><input data-field="flower" class="input-green" type="number" step="any" value="${s.flower ?? ""}" /></td>
        <td><input data-field="timeSpent" class="input-green" type="number" step="any" value="${s.timeSpent ?? ""}" /></td>
        <td class="calc" data-field="average"></td>
        <td class="calc" data-field="pDuration"></td>
        <td class="calc" data-field="flowerPerPetal"></td>
        <td><input data-field="petalSpent" class="input-green" type="number" step="any" value="${s.petalSpent ?? ""}" /></td>
        <td><button type="button" class="btn btn-icon" data-del="${i}" title="Delete row">×</button></td>
      `;
      body.appendChild(tr);
    });

    body.querySelectorAll("input").forEach((input) => {
      input.addEventListener("input", () => {
        const tr = input.closest("tr");
        const idx = [...body.children].indexOf(tr);
        const field = input.dataset.field;
        let val = input.value;
        if (field !== "date") val = val === "" ? null : Number(val);
        state.sessions[idx][field] = val;
        persistLocal();
        recalc();
      });
    });

    body.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.del);
        if (state.sessions.length <= 1) {
          state.sessions[0] = defaultSession();
        } else {
          state.sessions.splice(idx, 1);
        }
        persistLocal();
        renderSessions();
        recalc();
      });
    });
  }

  function fillPlannerInputs() {
    $("#avgFP").value = state.planner.avgFP ?? "";
    const dur = nearestPDurationOption(state.planner.pDuration);
    state.planner.pDuration = dur;
    $("#pDuration").value = String(dur);
    $$("[data-k]").forEach((input) => {
      const [group, color] = input.dataset.k.split(".");
      const v = state.planner[group]?.[color];
      input.value = v === null || v === undefined ? "" : v;
    });
  }

  function bindPlannerInputs() {
    const onScalarEdit = () => {
      syncScalarInputsFromDom();
      persistLocal();
      recalc();
    };

    ["input", "change", "keyup"].forEach((evt) => {
      $("#avgFP")?.addEventListener(evt, onScalarEdit);
      $("#pDuration")?.addEventListener(evt, onScalarEdit);
    });

    $$("[data-k]").forEach((input) => {
      input.addEventListener("input", () => {
        const [group, color] = input.dataset.k.split(".");
        if (!state.planner[group]) state.planner[group] = {};
        state.planner[group][color] = num(input.value);
        persistLocal();
        recalc();
      });
    });
  }

  async function loadGist() {
    const { gistId, token } = getSettings();
    if (!gistId) {
      setStatus("Set Gist ID in Settings", "error");
      return;
    }
    setStatus("Loading…", "busy");
    $("#btnLoad").disabled = true;
    try {
      const headers = { Accept: "application/vnd.github+json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`https://api.github.com/gists/${gistId}`, { headers });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const gist = await res.json();
      const file = gist.files?.[GIST_FILE] || Object.values(gist.files || {})[0];
      if (!file?.content && !file?.raw_url) throw new Error(`Missing ${GIST_FILE}`);
      let content = file.content;
      if (file.truncated || !content) {
        const raw = await fetch(file.raw_url);
        content = await raw.text();
      }
      importPayload(JSON.parse(content));
      persistLocal();
      renderSessions();
      fillPlannerInputs();
      recalc();
      setStatus(`Loaded · ${new Date().toLocaleTimeString()}`, "ok");
    } catch (err) {
      console.error(err);
      setStatus(`Load failed: ${err.message}`, "error");
    } finally {
      $("#btnLoad").disabled = false;
    }
  }

  async function saveGist() {
    const { gistId, token } = getSettings();
    if (!gistId) {
      setStatus("Set Gist ID in Settings", "error");
      return;
    }
    if (!token) {
      setStatus("Token required to save", "error");
      return;
    }
    setStatus("Saving…", "busy");
    $("#btnSave").disabled = true;
    try {
      const body = {
        files: {
          [GIST_FILE]: {
            content: JSON.stringify(exportPayload(), null, 2),
          },
        },
      };
      const res = await fetch(`https://api.github.com/gists/${gistId}`, {
        method: "PATCH",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`${res.status} ${t.slice(0, 120)}`);
      }
      persistLocal();
      setStatus(`Saved · ${new Date().toLocaleTimeString()}`, "ok");
    } catch (err) {
      console.error(err);
      setStatus(`Save failed: ${err.message}`, "error");
    } finally {
      $("#btnSave").disabled = false;
    }
  }

  function init() {
    loadSettingsUI();
    const hasLocal = loadLocal();
    if (!hasLocal) {
      state = { sessions: [defaultSession()], planner: defaultPlanner() };
      state.planner.flowerTarget = getSettings().flowerTarget;
    }
    renderSessions();
    fillPlannerInputs();
    bindPlannerInputs();
    recalc();

    $("#btnAddSession").addEventListener("click", () => {
      state.sessions.push(defaultSession());
      persistLocal();
      renderSessions();
      recalc();
    });

    $("#btnSettings").addEventListener("click", () => {
      const panel = $("#settingsPanel");
      const open = panel.hidden;
      panel.hidden = !open;
      $("#btnSettings").setAttribute("aria-expanded", String(open));
    });

    $("#btnSaveSettings").addEventListener("click", saveSettingsToLS);
    $("#btnClearToken").addEventListener("click", () => {
      localStorage.removeItem("pikmin-gist-token");
      $("#gistToken").value = "";
      setStatus("Token cleared", "idle");
    });
    $("#btnLoad").addEventListener("click", loadGist);
    $("#btnSave").addEventListener("click", saveGist);

    const { gistId } = getSettings();
    if (gistId) setStatus("Ready · Gist linked", "ok");
    else setStatus("Local only · open Settings", "idle");
  }

  init();
})();
