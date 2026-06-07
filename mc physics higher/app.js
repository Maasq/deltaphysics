const STORAGE_PREFIX = APP_CONFIG.dbName + "_"; 
const allBadges = [
    { id: 'novice', icon: '👶', name: 'Novice', desc: '1st Correct Answer', type: 'total', threshold: 1 },
    { id: 'bronze', icon: '🥉', name: 'Bronze', desc: '10 Total Correct', type: 'total', threshold: 10 },
    { id: 'silver', icon: '🥈', name: 'Silver', desc: '50 Total Correct', type: 'total', threshold: 50 },
    { id: 'gold', icon: '🥇', name: 'Gold', desc: '100 Total Correct', type: 'total', threshold: 100 },
    { id: 'warmup', icon: '⏱️', name: 'Warm Up', desc: 'Attempt 5 Questions (~10 mins)', type: 'count', threshold: 5 },
    { id: 'hour1', icon: '⌛', name: 'Focused', desc: 'Attempt 30 Questions (~1 hour)', type: 'count', threshold: 30 },
    { id: 'hour5', icon: '🏋️', name: 'Marathon', desc: 'Attempt 150 Questions (~5 hours)', type: 'count', threshold: 150 },
    { id: 'streak3', icon: '🔥', name: 'Heating Up', desc: 'Streak of 3', type: 'streak', threshold: 3 },
    { id: 'streak10', icon: '🚀', name: 'Unstoppable', desc: 'Streak of 10', type: 'streak', threshold: 10 },
    { id: 'smartypants', icon: '⚡', name: 'Sharp', desc: '10 Correct on 1st Try', type: 'first', threshold: 10 },
    { id: 'nightowl', icon: '🦉', name: 'Night Owl', desc: 'Revise after 10pm', type: 'misc' },
    { id: 'earlybird', icon: '🌅', name: 'Early Bird', desc: 'Revise before 8am', type: 'misc' },
    { id: 'jack', icon: '🃏', name: 'Jack of All', desc: 'Attempt one from every Unit', type: 'misc' },
    { id: 'paper1', icon: '📜', name: 'Paper Completed', desc: 'Finish 1 Full Year', type: 'paper', threshold: 1 },
    { id: 'paper5', icon: '📚', name: 'Scholar', desc: 'Finish 5 Full Years', type: 'paper', threshold: 5 }
];
const db = new Dexie(APP_CONFIG.dbName);
db.version(2).stores({ attempts: '++id, questionId, unit, isCorrect, isFirstAttempt, timestamp' });
const focusDb = new Dexie(APP_CONFIG.focusDbName);
focusDb.version(1).stores({ items: 'questionId, dateAdded' });
let allQuestions = [], activeQuestions = [], currentIndex = 0;
let sessionScore = 0, sessionAttempts = 0, currentStreak = 0;
let state = { units: ["All"], topics: ["All"], years: ["All"] };
let questionMap = {};
let customTopicOrder = [];
let isReviewMode = false;
let heatmapMode = 'questions'; 
let toastQueue = [];
let isToasting = false;
let examState = {
    active: false,
    timer: null,
    totalSeconds: 0,
    qSecondsLimit: 0,
    currentQStart: 0,
    reviewSource: null
};
let challengeState = {
    active: false,
    lifelines: { decay: true, rebound: true, discharge: true },
    reboundActive: false
};
document.addEventListener('DOMContentLoaded', function() {
    document.title = `${APP_CONFIG.header} Revision`;
    const h1 = document.querySelector('.header-title');
    const h2 = document.querySelector('.header-subtitle');
    if(h1) h1.textContent = APP_CONFIG.header;
    if(h2) h2.textContent = APP_CONFIG.subtitle;
    updateThemeColors();
    const watermark = document.getElementById('about-watermark');
    if (watermark && typeof LOGO_SVG !== 'undefined') {
        watermark.innerHTML = LOGO_SVG;
    }
    setTimeout(() => {
        const splash = document.getElementById('splash-overlay');
        if (splash) { 
            splash.style.opacity = '0'; 
            setTimeout(() => splash.remove(), 500); 
        }
    }, 1000);
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.filter-group')) document.querySelectorAll('.ms-content').forEach(el => el.classList.remove('show'));
    });
    if(!localStorage.getItem(STORAGE_PREFIX + 'maxStreak')) localStorage.setItem(STORAGE_PREFIX + 'maxStreak', 0);
    APP_CONFIG.taxonomyOrder.forEach(unit => {
        if(APP_CONFIG.taxonomy[unit]) {
            customTopicOrder.push(...APP_CONFIG.taxonomy[unit]);
        }
    });
    Papa.parse("questions.csv", {
        download: true, header: true, skipEmptyLines: true,
        complete: (results) => {
            if(results.data && results.data.length > 0) processData(results.data);
            else document.getElementById('manual-loader').style.display = 'block';
        },
        error: () => { document.getElementById('manual-loader').style.display = 'block'; }
    });
    initDrawing(document.getElementById('overlay-canvas'));
    initDrawing(document.getElementById('scrap-canvas'));
    window.addEventListener('resize', resizeCanvases);
    initResources();
    const logoContainer = document.getElementById('header-logo-container');
    if (logoContainer && typeof LOGO_SVG !== 'undefined') {
        logoContainer.innerHTML = LOGO_SVG;
    }
    const fabBtn = document.querySelector('.fab-main-btn');
    if (fabBtn && typeof LOGO_SVG !== 'undefined') {
        fabBtn.innerHTML = LOGO_SVG;
    }
});
document.getElementById('csv-uploader').addEventListener('change', function(e) {
    Papa.parse(e.target.files[0], {
        header: true, skipEmptyLines: true,
        complete: function(results) {
            document.getElementById('manual-loader').style.display = 'none';
            processData(results.data);
        }
    });
});
function processData(data) {
    allQuestions = data;
    data.forEach(q => { questionMap[q.id] = q; });
    initDashboard();
    updateFocusButtons();
}
function initDashboard() {
    const btnMain = document.getElementById('btn-split-main');
    const btnTrig = document.getElementById('btn-split-trigger');
    if(btnMain) btnMain.disabled = false;
    if(btnTrig) btnTrig.disabled = false;
    const units = [...APP_CONFIG.taxonomyOrder]; 
    setupMultiSelect('unit', units, 'units');
    const years = [...new Set(allQuestions.map(q => q.year).filter(y => y))]; 
    setupMultiSelect('year', years, 'years');
    updateTopicOptions(); 
    updateCountPreview();
    checkReviewAvailability();
}
function setupMultiSelect(type, items, stateKey) { 
    const btn = document.getElementById(`btn-${type}`);
    const list = document.getElementById(`list-${type}`);
    list.innerHTML = '';
    addCheckbox(list, "All", `All ${type.charAt(0).toUpperCase() + type.slice(1)}s`, true, (checked) => {
        if (checked) {
            state[stateKey] = ["All"];
            list.querySelectorAll('input:not([value="All"])').forEach(el => el.checked = false);
        } else { state[stateKey] = []; }
        updateButtonText(btn, state[stateKey], type);
        if(type === 'unit') updateTopicOptions();
        updateCountPreview();
    });
    items.forEach(item => {
        const count = allQuestions.filter(q => q[type] === item).length;
        const labelHTML = `${item} <span class="count-label">(${count})</span>`;
        addCheckbox(list, item, labelHTML, false, (checked) => {
            if (checked) {
                state[stateKey] = state[stateKey].filter(x => x !== "All");
                state[stateKey].push(item);
                list.querySelector('input[value="All"]').checked = false;
            } else {
                state[stateKey] = state[stateKey].filter(x => x !== item);
                if (state[stateKey].length === 0) { state[stateKey] = ["All"]; list.querySelector('input[value="All"]').checked = true; }
            }
            updateButtonText(btn, state[stateKey], type);
            if(type === 'unit') updateTopicOptions();
            updateCountPreview();
        });
    });
    btn.onclick = (e) => {
        document.querySelectorAll('.ms-content').forEach(el => { if(el !== list) el.classList.remove('show'); });
        list.classList.toggle('show');
        e.stopPropagation();
    };
}
function addCheckbox(container, value, labelText, isChecked, callback) {
    const div = document.createElement('div'); div.className = 'ms-item';
    div.onclick = (e) => { const cb = div.querySelector('input'); if (e.target !== cb) { cb.checked = !cb.checked; callback(cb.checked); } };
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = value; checkbox.checked = isChecked;
    checkbox.onclick = (e) => { e.stopPropagation(); callback(e.target.checked); };
    const span = document.createElement('span'); span.innerHTML = labelText;
    div.appendChild(checkbox); div.appendChild(span); container.appendChild(div);
}
function updateButtonText(btn, selected, type) {
    if (selected.includes("All")) btn.textContent = `All ${type.charAt(0).toUpperCase() + type.slice(1)}s`;
    else if (selected.length === 0) btn.textContent = "Select...";
    else if (selected.length === 1) btn.textContent = selected[0];
    else btn.textContent = `${selected.length} Selected`;
}
function updateTopicOptions() {
    let availableTopics = [];
    const isAllUnits = state.units.includes("All");
    APP_CONFIG.taxonomyOrder.forEach(u => {
        if (isAllUnits || state.units.includes(u)) { 
            if (APP_CONFIG.taxonomy[u]) availableTopics.push(...APP_CONFIG.taxonomy[u]); 
        }
    });
    if (!isAllUnits) {
            state.units.forEach(u => {
                if (!APP_CONFIG.taxonomy[u]) { availableTopics.push(...new Set(allQuestions.filter(q => q.unit === u).map(q => q.topic))); }
            });
    }
    availableTopics = [...new Set(availableTopics)];
    setupMultiSelect('topic', availableTopics, 'topics');
}
function getFilteredQuestions() {
    return allQuestions.filter(q => {
        return (state.units.includes("All") || state.units.includes(q.unit)) &&
               (state.topics.includes("All") || state.topics.includes(q.topic)) &&
               (state.years.includes("All") || state.years.includes(q.year));
    });
}
function updateCountPreview() {
    const pool = getFilteredQuestions();
    const total = pool.length;
    let text = `${total} questions available`;
    const limitActive = document.getElementById('chk-limit') && document.getElementById('chk-limit').checked;
    if (limitActive) {
        const limit = parseInt(document.getElementById('sel-limit-count').value);
        if (total > limit) {
            text = `${limit} questions selected (randomly sampled from the ${total} questions that match your criteria)`;
        } else {
            text = `${total} questions selected (Maximum number of questions that match your criteria)`;
        }
    }
    document.getElementById('q-count-preview').textContent = text;
    const amarkCount = pool.filter(q => q['a mark'] === "1").length;
    const amarkDesc = document.getElementById('desc-amark');
    const amarkOpt = document.getElementById('opt-amark');
    if (amarkDesc && amarkOpt) {
        amarkDesc.textContent = `Test yourself against the "A" grade questions! (${amarkCount})`;
        if (amarkCount === 0) {
            amarkOpt.classList.add('disabled');
            amarkOpt.style.opacity = "0.5";
            amarkOpt.style.pointerEvents = "none";
        } else {
            amarkOpt.classList.remove('disabled');
            amarkOpt.style.opacity = "1";
            amarkOpt.style.pointerEvents = "auto";
        }
    }
}
function toggleLimitOptions() {
    const isChecked = document.getElementById('chk-limit').checked;
    document.getElementById('limit-options').style.display = isChecked ? 'block' : 'none';
    updateCountPreview();
}
function toggleExamOptions() {
    const isChecked = document.getElementById('chk-exam-mode').checked;
    document.getElementById('exam-options').style.display = isChecked ? 'flex' : 'none';
    if(isChecked) {
        const saved = localStorage.getItem('examTimePref') || "1.8";
        const radios = document.getElementsByName('exam-time');
        radios.forEach(r => { if(r.value === saved) r.checked = true; });
    }
}
function saveExamPref() {
    const radios = document.getElementsByName('exam-time');
    radios.forEach(r => { if(r.checked) localStorage.setItem('examTimePref', r.value); });
}
let currentMode = 'practice';
function toggleModeDropdown(e) {
    e.stopPropagation();
    const dd = document.getElementById('mode-dropdown');
    const isOpen = dd.style.display === 'block';
    closeAllDropdowns();
    if (!isOpen) {
        dd.style.display = 'block';
        checkReviewAvailability();
    }
}
function selectMode(mode) {
    if (mode === 'review') {
        const isDisabled = document.getElementById('opt-review').classList.contains('disabled');
        if (isDisabled) return;
    }
    if (mode === 'amark') {
        const isDisabled = document.getElementById('opt-amark').classList.contains('disabled');
        if (isDisabled) return;
    }
    currentMode = mode;
    const btn = document.getElementById('btn-split-main');
    if (mode === 'practice') btn.textContent = "Start Practice";
    if (mode === 'review') btn.textContent = "Start Review";
    if (mode === 'amark') btn.textContent = "Start 'A' Mark";
    if (mode === 'challenge') btn.textContent = "Start Challenge";
    document.querySelectorAll('.mode-option').forEach(el => el.classList.remove('selected'));
    closeAllDropdowns();
}
function handleMainClick() {
    if (currentMode === 'practice') startQuiz();
    else if (currentMode === 'review') startReviewQuiz();
    else if (currentMode === 'amark') startAMarkQuiz();
    else if (currentMode === 'challenge') startChallengeQuiz();
}
async function checkReviewAvailability() {
    const allAttempts = await db.attempts.toArray();
    const latestStatus = {};
    allAttempts.forEach(a => {
        if (!latestStatus[a.questionId] || new Date(a.timestamp) > new Date(latestStatus[a.questionId].timestamp)) {
            latestStatus[a.questionId] = a;
        }
    });
    const errorIds = Object.values(latestStatus).filter(a => !a.isCorrect).map(a => a.questionId);
    const opt = document.getElementById('opt-review');
    const desc = document.getElementById('desc-review');
    if (errorIds.length > 0) {
        opt.classList.remove('disabled');
        desc.textContent = `Fix your ${errorIds.length} outstanding errors.`;
        localStorage.setItem(STORAGE_PREFIX + 'reviewQueue', JSON.stringify(errorIds));
    } else {
        opt.classList.add('disabled');
        desc.textContent = "Great job! No active errors to fix.";
        localStorage.removeItem(STORAGE_PREFIX + 'reviewQueue');
    }
}
function closeAllDropdowns() {
    const dd = document.getElementById('mode-dropdown');
    if(dd) dd.style.display = 'none';
}
window.addEventListener('click', () => { closeAllDropdowns(); });
function startQuiz() {
    let pool = getFilteredQuestions();
    if (pool.length === 0) { alert("No questions match these filters!"); return; }
    const limitActive = document.getElementById('chk-limit').checked;
    if (limitActive) {
        const limit = parseInt(document.getElementById('sel-limit-count').value);
        if (pool.length > limit) {
            let indices = Array.from({length: pool.length}, (_, i) => i);
            indices.sort(() => Math.random() - 0.5);
            let selectedIndices = indices.slice(0, limit);
            if (document.getElementById('chk-shuffle').checked) {
                activeQuestions = selectedIndices.map(i => pool[i]);
            } else {
                selectedIndices.sort((a, b) => a - b);
                activeQuestions = selectedIndices.map(i => pool[i]);
            }
        } else {
            activeQuestions = pool;
            if (document.getElementById('chk-shuffle').checked) activeQuestions.sort(() => Math.random() - 0.5);
        }
    } else {
        activeQuestions = pool;
        if (document.getElementById('chk-shuffle').checked) activeQuestions.sort(() => Math.random() - 0.5);
    }
    currentIndex = 0; sessionScore = 0; sessionAttempts = 0; currentStreak = 0;
    document.getElementById('hud-box-score').style.display = 'flex';
    document.getElementById('lifeline-container').style.display = 'none';
    challengeState.active = false; 
    examState.active = document.getElementById('chk-exam-mode').checked;
    if (examState.active) {
        const radios = document.getElementsByName('exam-time');
        let minsPerQ = 1.8;
        radios.forEach(r => { if(r.checked) minsPerQ = parseFloat(r.value); });
        examState.qSecondsLimit = minsPerQ * 60;
        examState.totalSeconds = Math.ceil(activeQuestions.length * minsPerQ * 60);
        document.getElementById('hud-standard').style.display = 'none';
        document.getElementById('hud-timer').style.display = 'block';
        document.getElementById('hud-timer').className = 'hud-box timer-box';
        clearInterval(examState.timer);
        examState.timer = setInterval(updateExamTimer, 1000);
        isReviewMode = false;
    } else {
        document.getElementById('hud-standard').style.display = 'flex';
        document.getElementById('hud-timer').style.display = 'none';
        examState.active = false;
        isReviewMode = false;
    }
    switchView('view-quiz'); 
    loadQuestion();
    resizeCanvases();
}
function startReviewQuiz() {
    const storedIds = JSON.parse(localStorage.getItem(STORAGE_PREFIX + 'reviewQueue') || "[]");
    if (storedIds.length === 0) { alert("No errors to review!"); return; }
    activeQuestions = storedIds.map(id => questionMap[id]).filter(q => q);
    activeQuestions.sort(() => Math.random() - 0.5); 
    currentIndex = 0; sessionScore = 0; sessionAttempts = 0; currentStreak = 0;
    document.getElementById('hud-box-score').style.display = 'flex';
    document.getElementById('lifeline-container').style.display = 'none';
    challengeState.active = false;
    examState.active = false;
    document.getElementById('hud-standard').style.display = 'flex';
    document.getElementById('hud-timer').style.display = 'none';
    isReviewMode = false; 
    switchView('view-quiz'); 
    loadQuestion();
    resizeCanvases();
}
function startAMarkQuiz() {
    let pool = getFilteredQuestions();
    pool = pool.filter(q => q['a mark'] === "1");
    if (pool.length === 0) { alert("No 'A' Mark questions match these filters!"); return; }
    const limitActive = document.getElementById('chk-limit').checked;
    if (limitActive) {
        const limit = parseInt(document.getElementById('sel-limit-count').value);
        if (pool.length > limit) {
            let indices = Array.from({length: pool.length}, (_, i) => i);
            indices.sort(() => Math.random() - 0.5);
            let selectedIndices = indices.slice(0, limit);
            if (document.getElementById('chk-shuffle').checked) {
                activeQuestions = selectedIndices.map(i => pool[i]);
            } else {
                selectedIndices.sort((a, b) => a - b);
                activeQuestions = selectedIndices.map(i => pool[i]);
            }
        } else {
            activeQuestions = pool;
            if (document.getElementById('chk-shuffle').checked) activeQuestions.sort(() => Math.random() - 0.5);
        }
    } else {
        activeQuestions = pool;
        if (document.getElementById('chk-shuffle').checked) activeQuestions.sort(() => Math.random() - 0.5);
    }
    currentIndex = 0; sessionScore = 0; sessionAttempts = 0; currentStreak = 0;
    document.getElementById('hud-box-score').style.display = 'flex';
    document.getElementById('lifeline-container').style.display = 'none';
    challengeState.active = false; 
    examState.active = document.getElementById('chk-exam-mode').checked;
    if (examState.active) {
        const radios = document.getElementsByName('exam-time');
        let minsPerQ = 1.8;
        radios.forEach(r => { if(r.checked) minsPerQ = parseFloat(r.value); });
        examState.qSecondsLimit = minsPerQ * 60;
        examState.totalSeconds = Math.ceil(activeQuestions.length * minsPerQ * 60);
        document.getElementById('hud-standard').style.display = 'none';
        document.getElementById('hud-timer').style.display = 'block';
        document.getElementById('hud-timer').className = 'hud-box timer-box';
        clearInterval(examState.timer);
        examState.timer = setInterval(updateExamTimer, 1000);
        isReviewMode = false;
    } else {
        document.getElementById('hud-standard').style.display = 'flex';
        document.getElementById('hud-timer').style.display = 'none';
        examState.active = false;
        isReviewMode = false;
    }
    switchView('view-quiz'); 
    loadQuestion();
    resizeCanvases();
}
function startChallengeQuiz() {
    let pool = getFilteredQuestions();
    if (pool.length === 0) { alert("No questions match these filters!"); return; }
    pool.sort(() => Math.random() - 0.5);
    activeQuestions = pool;
    challengeState.active = true;
    challengeState.lifelines = { decay: true, rebound: true, discharge: true };
    challengeState.reboundActive = false;
    currentIndex = 0; sessionScore = 0; currentStreak = 0;
    examState.active = false;
    isReviewMode = false;
    document.getElementById('hud-standard').style.display = 'flex';
    document.getElementById('hud-timer').style.display = 'none';
    const scoreBox = document.getElementById('hud-box-score');
    if(scoreBox) scoreBox.style.display = 'none';
    document.getElementById('hud-streak').textContent = "0";
    document.getElementById('lifeline-container').style.display = 'flex';
    updateLifelineUI();
    switchView('view-quiz'); 
    loadQuestion();
    resizeCanvases();
}
function loadQuestion() {
    if (currentIndex >= activeQuestions.length) return finishQuiz();
    clearCanvas('current'); 
    const card = document.querySelector('#view-quiz .card');
    if(card) card.classList.remove('card-warning');
    examState.currentQStart = Date.now();
    const q = activeQuestions[currentIndex];
    document.getElementById('q-progress').textContent = `${currentIndex + 1} / ${activeQuestions.length}`;
    let metaText = `${q.year} • ${q.unit}`;
    if (q['a mark'] === "1") {
        metaText += ' • "A" question';
    }
    document.getElementById('q-meta').textContent = metaText;
    if(!examState.active) {
        document.getElementById('hud-score').textContent = `${sessionScore}/${sessionAttempts}`;
        document.getElementById('hud-streak').textContent = currentStreak;
    }
    const qTextEl = document.getElementById('q-text');
    let processedText = formatQuestionText(q.question_text);
    if (q.question_image) {
        const images = q.question_image.split('|');
        images.forEach(img => {
            if (img.trim()) {
                const imgTag = `<img src="images/${img.trim()}" class="question-img">`;
                if (processedText.includes('{{IMAGE}}')) {
                    processedText = processedText.replace('{{IMAGE}}', imgTag);
                } else {
                    processedText += imgTag;
                }
            }
        });
    } else { 
        document.getElementById('q-image-area').innerHTML = ''; 
    }
    qTextEl.innerHTML = processedText;
    renderMathInElement(qTextEl);
    const optsArea = document.getElementById('options-area');
    optsArea.innerHTML = ''; optsArea.className = ''; 
    document.getElementById('feedback').textContent = '';
    const nextBtn = document.getElementById('next-btn');
    const focusBtn = document.getElementById('btn-focus-action');
    if (isReviewMode) {
        if (examState.reviewSource === 'exam') {
                nextBtn.textContent = "Return to Results ↩";
                nextBtn.onclick = () => switchView('view-summary');
        } else {
                nextBtn.textContent = "Return to Focus List ↩";
                nextBtn.onclick = viewFocusList;
        }
        nextBtn.disabled = false;
        nextBtn.style.flex = "1";
        nextBtn.style.width = "100%";
        focusBtn.style.display = "none";
    } else {
        nextBtn.textContent = "Next Question";
        nextBtn.onclick = nextQuestion;
        nextBtn.disabled = true; 
        nextBtn.style.flex = "8.5";
        nextBtn.style.width = "85%";
        focusBtn.style.display = "flex";
        focusBtn.style.flex = "1.5";
        focusBtn.style.width = "15%";
        focusBtn.onclick = addToFocusList;
    }
    if (q.table_headers) {
        const headers = q.table_headers.split('|');
        const container = document.createElement('div'); container.className = 'combined-table-container';
        const headerRow = document.createElement('div'); headerRow.className = 'table-header-row';
        headerRow.style.gridTemplateColumns = `50px repeat(${headers.length}, 1fr)`;
        const emptyCell = document.createElement('div'); emptyCell.className = 'header-empty-cell'; headerRow.appendChild(emptyCell);
        headers.forEach(h => { const c = document.createElement('div'); c.className = 'header-content-cell'; c.textContent = h.trim(); headerRow.appendChild(c); });
        renderMathInElement(headerRow);
        container.appendChild(headerRow);
        ['option_a', 'option_b', 'option_c', 'option_d', 'option_e'].forEach((optKey, idx) => {
            const val = q[optKey]; if (!val) return;
            const row = document.createElement('div'); row.className = 'table-row-item';
            row.style.gridTemplateColumns = `50px repeat(${headers.length}, 1fr)`;
            const letCell = document.createElement('div'); letCell.className = 'table-letter-cell'; letCell.textContent = String.fromCharCode(65 + idx); row.appendChild(letCell);
            val.split('|').forEach(c => { 
                const d = document.createElement('div'); 
                d.className = 'table-data-cell'; 
                const cellText = c.trim();
                if (cellText.startsWith('[IMG]')) {
                    const imgSrc = cellText.replace('[IMG]', '');
                    d.innerHTML = `<img src="images/${imgSrc}" class="option-img" style="width: 100%; height: auto;">`;
                } else {
                    d.textContent = cellText; 
                }
                row.appendChild(d); 
            });
            renderMathInElement(row);
            row.onclick = () => checkAnswer(q, optKey, row, true);
            container.appendChild(row);
        });
        optsArea.appendChild(container);
    } else {
        optsArea.className = 'options-grid';
        ['option_a', 'option_b', 'option_c', 'option_d', 'option_e'].forEach((optKey, idx) => {
            const val = q[optKey]; if (!val) return;
            const btn = document.createElement('div'); btn.className = 'option-btn';
            btn.innerHTML = val.startsWith('[IMG]') 
                ? `<span style="font-weight:bold; margin-right:15px; color:var(--brand-primary);">${String.fromCharCode(65 + idx)}</span><img src="images/${val.replace('[IMG]', '')}" class="option-img">`
                : `<span style="font-weight:bold; margin-right:15px; color:var(--brand-primary);">${String.fromCharCode(65 + idx)}</span><span>${val}</span>`;
            renderMathInElement(btn);
            btn.onclick = () => checkAnswer(q, optKey, btn, false);
            optsArea.appendChild(btn);
        });
    }
}
async function checkAnswer(q, selectedKey, btn, isTable) {
    if (navigator.vibrate) navigator.vibrate(10);
    const selector = isTable ? '.table-row-item' : '.option-btn';
    const correctKey = "option_" + q.correct_answer.toLowerCase();
    const isCorrect = (selectedKey === correctKey);
    const card = document.querySelector('#view-quiz .card');
    if(card) card.classList.remove('card-warning');
    sessionAttempts++;
    if (!challengeState.active) {
        const attempts = await db.attempts.where('questionId').equals(q.id).toArray();
        await db.attempts.add({ questionId: q.id, unit: q.unit, isCorrect: isCorrect, isFirstAttempt: attempts.length===0, timestamp: new Date() });
    }
    if (examState.active) {
        if(isCorrect) sessionScore++; 
        btn.classList.add('recorded');
        document.getElementById('feedback').textContent = "Answer Recorded"; 
        document.getElementById('feedback').style.color = "var(--black)";
        document.querySelectorAll(selector).forEach(b => b.style.pointerEvents = 'none');
        setTimeout(() => nextQuestion(), 800);
        return;
    }
    if (challengeState.active) {
        if (isCorrect) {
            currentStreak++; 
            btn.classList.add('correct', 'pop');
            document.getElementById('feedback').textContent = "Correct!"; 
            document.getElementById('feedback').style.color = "var(--success-green)";
            document.querySelectorAll(selector).forEach(b => b.style.pointerEvents = 'none');
            document.getElementById('hud-streak').textContent = currentStreak;
            document.getElementById('next-btn').disabled = false;
        } 
        else {
            if (challengeState.reboundActive) {
                btn.classList.add('wrong', 'shake');
                document.getElementById('feedback').textContent = "Rebound Used!";
                document.getElementById('feedback').style.color = "var(--amber)";
                showToast("🛡️ Rebound Saved You!");
                challengeState.reboundActive = false;
                updateLifelineUI();
                btn.style.opacity = "0.5";
                btn.style.pointerEvents = "none";
                return;
            }
            btn.classList.add('wrong', 'shake');
            document.getElementById('feedback').textContent = "GAME OVER";
            document.getElementById('feedback').style.color = "var(--claret)";
            const keys = ['option_a', 'option_b', 'option_c', 'option_d', 'option_e'];
            const idx = keys.indexOf(correctKey);
            const all = document.querySelectorAll(selector);
            if(idx !== -1 && all[idx]) all[idx].classList.add('correct');
            document.querySelectorAll(selector).forEach(b => b.style.pointerEvents = 'none');
            const best = parseInt(localStorage.getItem(STORAGE_PREFIX + 'challengeRecord') || 0);
            if (currentStreak > best) {
                localStorage.setItem(STORAGE_PREFIX + 'challengeRecord', currentStreak);
                setTimeout(() => { confetti({ particleCount: 200, spread: 100, origin: { y: 0.6 } }); }, 500);
            }
            setTimeout(() => { openStats(); }, 2000);
        }
        return;
    }
    document.querySelectorAll(selector).forEach(b => b.style.pointerEvents = 'none');
    if (isCorrect) { 
        sessionScore++; currentStreak++; btn.classList.add('correct', 'pop'); 
        document.getElementById('feedback').textContent = "Correct!"; 
        document.getElementById('feedback').style.color = "var(--success-green)"; 
        checkAchievements(); 
    } else { 
        currentStreak = 0; btn.classList.add('wrong', 'shake'); 
        document.getElementById('feedback').textContent = "Incorrect"; 
        document.getElementById('feedback').style.color = "var(--claret)";
        const keys = ['option_a', 'option_b', 'option_c', 'option_d', 'option_e'];
        const idx = keys.indexOf(correctKey);
        const all = document.querySelectorAll(selector);
        if(idx !== -1 && all[idx]) all[idx].classList.add('correct');
    }
    document.getElementById('hud-score').textContent = `${sessionScore}/${sessionAttempts}`;
    document.getElementById('hud-streak').textContent = currentStreak;
    if (!isReviewMode) {
        document.getElementById('next-btn').disabled = false;
    }
}
function nextQuestion() { currentIndex++; loadQuestion(); }
async function finishQuiz() {
    clearInterval(examState.timer);
    switchView('view-summary');
    const pc = activeQuestions.length > 0 ? Math.round((sessionScore / activeQuestions.length) * 100) : 0;
    document.getElementById('final-score').textContent = `${pc}%`;
    document.getElementById('final-stats').textContent = `Session Score: ${sessionScore} / ${activeQuestions.length}`;
    if(!examState.active && pc === 100 && activeQuestions.length >= 5) {
            confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
    }
    const reviewSection = document.getElementById('exam-review-section');
    if (examState.active) {
        reviewSection.style.display = 'block';
        renderReviewGrid();
    } else {
        reviewSection.style.display = 'none';
    }
    checkReviewAvailability();
}
async function renderReviewGrid() {
    const container = document.getElementById('review-grid');
    container.innerHTML = '';
    const allAttempts = await db.attempts.orderBy('timestamp').reverse().limit(activeQuestions.length).toArray();
    activeQuestions.forEach((q, index) => {
        const btn = document.createElement('div');
        const attempt = allAttempts.find(a => a.questionId === q.id);
        const isCorrect = attempt ? attempt.isCorrect : false;
        btn.className = `review-item ${isCorrect ? 'correct' : 'wrong'}`;
        btn.textContent = index + 1;
        btn.onclick = () => {
            currentIndex = index;
            isReviewMode = true;
            examState.reviewSource = 'exam';
            switchView('view-quiz');
            loadQuestion();
        };
        container.appendChild(btn);
    });
}
function useLifeline(type) {
    if (!challengeState.active) return;
    if (!challengeState.lifelines[type]) return;
    if (type === 'decay') {
        const q = activeQuestions[currentIndex];
        const correctKey = "option_" + q.correct_answer.toLowerCase();
        const allOpts = ['option_a', 'option_b', 'option_c', 'option_d', 'option_e'];
        const wrongKeys = allOpts.filter(k => k !== correctKey && q[k]);
        wrongKeys.sort(() => Math.random() - 0.5);
        const toRemove = wrongKeys.slice(0, 2);
        const buttons = document.querySelectorAll('.option-btn, .table-row-item');
        allOpts.forEach((key, idx) => {
            if (toRemove.includes(key) && buttons[idx]) {
                buttons[idx].style.opacity = "0.1";
                buttons[idx].style.pointerEvents = "none";
            }
        });
        challengeState.lifelines.decay = false;
    }
    if (type === 'rebound') {
        if (challengeState.reboundActive) return;
        challengeState.reboundActive = true;
        challengeState.lifelines.rebound = false;
        showToast("Shield Active! Next mistake forgiven.");
    }
    if (type === 'discharge') {
        challengeState.lifelines.discharge = false;
        updateLifelineUI();
        setTimeout(() => { nextQuestion(); }, 200);
    }
    updateLifelineUI();
}
function updateLifelineUI() {
    const states = challengeState.lifelines;
    const btnDecay = document.getElementById('btn-life-decay');
    btnDecay.className = `lifeline-btn ${!states.decay ? 'used' : ''}`;
    const btnRebound = document.getElementById('btn-life-rebound');
    if (challengeState.reboundActive) {
        btnRebound.className = 'lifeline-btn active';
    } else {
        btnRebound.className = `lifeline-btn ${!states.rebound ? 'used' : ''}`;
    }
    const btnDischarge = document.getElementById('btn-life-discharge');
    btnDischarge.className = `lifeline-btn ${!states.discharge ? 'used' : ''}`;
}
async function resetStats() {
    if(!confirm("Are you sure? This will delete all your history and badges.")) return;
    await db.attempts.clear(); 
    for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key.startsWith(STORAGE_PREFIX)) {
            localStorage.removeItem(key);
        }
    }
    location.reload();
}
async function exportProgress() {
    try {
        const attempts = await db.attempts.toArray();
        const focusItems = await focusDb.items.toArray();
        const localData = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith(STORAGE_PREFIX) || key === 'theme' || key === 'examTimePref') {
                localData[key] = localStorage.getItem(key);
            }
        }
        const backup = {
            version: document.querySelector('meta[name="version"]').content,
            date: new Date().toISOString(),
            attempts: attempts,
            focusItems: focusItems,
            localData: localData
        };
        const dataStr = JSON.stringify(backup, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${APP_CONFIG.subject}_${APP_CONFIG.level}_Backup.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast("Backup saved to device!");
    } catch (e) {
        alert("Export failed: " + e.message);
    }
}
function importProgress(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.attempts || !data.localData) throw new Error("Invalid backup file structure.");
            if (!confirm(`Restore backup from ${data.date.split('T')[0]}? \n\n⚠️ THIS WILL OVERWRITE YOUR CURRENT PROGRESS.`)) {
                input.value = ''; 
                return;
            }
            await db.attempts.clear();
            await focusDb.items.clear();
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const key = localStorage.key(i);
                if (key.startsWith(STORAGE_PREFIX)) {
                    localStorage.removeItem(key);
                }
            }
            if (data.attempts.length > 0) await db.attempts.bulkAdd(data.attempts);
            if (data.focusItems && data.focusItems.length > 0) await focusDb.items.bulkAdd(data.focusItems);
            Object.keys(data.localData).forEach(key => {
                localStorage.setItem(key, data.localData[key]);
            });
            alert("Progress restored successfully! App will reload.");
            location.reload();
        } catch (err) {
            alert("Error importing file: " + err.message);
            input.value = '';
        }
    };
    reader.readAsText(file);
}
async function openStats() {
    document.getElementById('stats-modal').style.display = 'flex';
    const allAttempts = await db.attempts.toArray();
    const totalCorrect = allAttempts.filter(a => a.isCorrect).length;
    const firstCorrect = allAttempts.filter(a => a.isFirstAttempt && a.isCorrect).length;
    const maxStreak = parseInt(localStorage.getItem(STORAGE_PREFIX + 'maxStreak') || 0);
    const challengeRecord = parseInt(localStorage.getItem(STORAGE_PREFIX + 'challengeRecord') || 0);
    document.getElementById('stat-total').textContent = totalCorrect;
    document.getElementById('stat-first').textContent = firstCorrect;
    document.getElementById('stat-streak').textContent = maxStreak;
    const recEl = document.getElementById('stat-challenge-record');
    if(recEl) recEl.textContent = challengeRecord;
    renderBadges(allAttempts, totalCorrect, firstCorrect, maxStreak);
}
function closeStats(e) { if(e.target.id === 'stats-modal') document.getElementById('stats-modal').style.display = 'none'; }
async function checkAchievements() {
    const savedMax = parseInt(localStorage.getItem(STORAGE_PREFIX + 'maxStreak') || 0);
    if (currentStreak > savedMax) localStorage.setItem(STORAGE_PREFIX + 'maxStreak', currentStreak);
    const allAttempts = await db.attempts.toArray();
    const totalCorrect = allAttempts.filter(a => a.isCorrect).length;
    const firstCorrect = allAttempts.filter(a => a.isFirstAttempt && a.isCorrect).length;
    const totalAttempts = allAttempts.length;
    const streak = Math.max(currentStreak, savedMax);
    const attemptedQIDs = [...new Set(allAttempts.map(a => a.questionId))];
    const unitsHit = new Set();
    const qByYear = {};
    attemptedQIDs.forEach(qid => { const q = questionMap[qid]; if(q) { unitsHit.add(q.unit); if(!qByYear[q.year]) qByYear[q.year] = 0; qByYear[q.year]++; } });
    let papersDone = 0;
    const allYears = [...new Set(allQuestions.map(q => q.year))];
    allYears.forEach(y => { const totalForYear = allQuestions.filter(q => q.year === y).length; if (qByYear[y] && qByYear[y] >= totalForYear) papersDone++; });
    const now = new Date(); const hour = now.getHours();
    allBadges.forEach(b => {
        const key = STORAGE_PREFIX + 'badge_unlocked_' + b.id;
        if (localStorage.getItem(key)) return; 
        let unlocked = false;
        if (b.type === 'total' && totalCorrect >= b.threshold) unlocked = true;
        if (b.type === 'first' && firstCorrect >= b.threshold) unlocked = true;
        if (b.type === 'streak' && streak >= b.threshold) unlocked = true;
        if (b.type === 'count' && totalAttempts >= b.threshold) unlocked = true;
        if (b.type === 'paper' && papersDone >= b.threshold) unlocked = true;
        if (b.id === 'nightowl' && (hour >= 22 || hour < 4)) unlocked = true;
        if (b.id === 'earlybird' && (hour >= 5 && hour < 8)) unlocked = true;
        if (b.id === 'jack' && unitsHit.size >= APP_CONFIG.taxonomyOrder.length) unlocked = true; 
        if (unlocked) { 
            localStorage.setItem(key, 'true'); 
            confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } }); 
            showToast(`🏆 Unlocked: ${b.name}`);
        }
    });
}
function renderBadges(allAttempts, total, first, streak) {
    const container = document.getElementById('badge-container'); container.innerHTML = '';
    allBadges.forEach(b => {
        const isUnlocked = localStorage.getItem(STORAGE_PREFIX + 'badge_unlocked_' + b.id);
        const div = document.createElement('div');
        div.className = `badge-item ${isUnlocked ? 'unlocked' : ''}`;
        div.innerHTML = `<span class=\"badge-icon\">${b.icon}</span><span class=\"badge-name\">${b.name}</span>`;
        div.title = b.desc;
        container.appendChild(div);
    });
}
async function addToFocusList() {
    if (!activeQuestions[currentIndex]) return;
    const q = activeQuestions[currentIndex];
    const existing = await focusDb.items.get(q.id);
    if (existing) {
        showToast("Already in Focus List");
    } else {
        await focusDb.items.put({ questionId: q.id, dateAdded: new Date() });
        let qNum = q.number;
        if (!qNum && q.id && q.id.includes('-')) {
            qNum = q.id.split('-')[1];
        }
        if(!qNum) qNum = '?';
        showToast(`Question ${qNum} from ${q.year} added to Focus List`);
        updateFocusButtons();
        setTimeout(() => { nextQuestion(); }, 700);
    }
}
function showToast(message) {
    if (isToasting) {
        toastQueue.push(message);
        return;
    }
    const toast = document.getElementById('toast-container');
    toast.textContent = message;
    toast.classList.remove('toast-active');
    void toast.offsetWidth; 
    toast.classList.add('toast-active');
    isToasting = true;
    setTimeout(() => {
        isToasting = false;
        if (toastQueue.length > 0) {
            showToast(toastQueue.shift());
        }
    }, 2500); 
}
let currentFocusItems = [];
async function viewFocusList() {
    const items = await focusDb.items.toArray();
    currentFocusItems = items.map(item => {
        const qDetails = questionMap[item.questionId];
        const safeDate = (item.dateAdded instanceof Date) 
            ? item.dateAdded 
            : new Date(item.dateAdded);
        if (!qDetails) {
            return { ...item, dateAdded: safeDate }; 
        }
        let qNum = qDetails.number;
        if (!qNum && qDetails.id && qDetails.id.includes('-')) {
            qNum = qDetails.id.split('-')[1];
        }
        return { 
            ...item, 
            ...qDetails, 
            extractedNum: qNum,
            dateAdded: safeDate 
        }; 
    });
    currentFocusItems.sort((a, b) => a.dateAdded - b.dateAdded);
    document.getElementById('focus-sort').value = 'date';
    renderFocusList();
    switchView('view-focus-list');
}
function renderFocusList() {
    const container = document.getElementById('focus-list-body');
    container.innerHTML = '';
    if (currentFocusItems.length === 0) {
        container.innerHTML = '<div style="padding:20px; text-align:center;">List is empty.</div>';
        return;
    }
    currentFocusItems.forEach(item => {
        const dateStr = item.dateAdded.toLocaleDateString('en-GB', {
            day: '2-digit', month: '2-digit', year: '2-digit'
        });
        const div = document.createElement('div');
        div.className = 'focus-item-row';
        div.innerHTML = `
            <div class="focus-cell" style="text-align: center;">${item.year}</div>
            <div class="focus-cell" style="text-align: center;">${item.extractedNum || item.number || '-'}</div>
            <div class="focus-cell">${item.topic}</div>
            <div class="focus-cell" style="text-align: center; font-size:0.8em; color:#666;">${dateStr}</div>
            <div class="focus-bin" onclick="deleteFocusItem(event, '${item.questionId}')" style="text-align: center;">
                <img src="icons/clear.webp" style="width:20px; height:20px;">
            </div>
        `;
        div.onclick = (e) => {
            if(e.target.closest('.focus-bin')) return; 
            startFocusSingle(item.questionId);
        };
        container.appendChild(div);
    });
}
function sortFocusList() {
    const criteria = document.getElementById('focus-sort').value;
    currentFocusItems.sort((a, b) => {
        if (criteria === 'date') return a.dateAdded - b.dateAdded;
        if (criteria === 'year') {
            if (a.year !== b.year) return a.year - b.year;
            return (parseInt(a.extractedNum)||0) - (parseInt(b.extractedNum)||0);
        }
        if (criteria === 'topic') {
            if (a.topic !== b.topic) {
                const idxA = customTopicOrder.indexOf(a.topic);
                const idxB = customTopicOrder.indexOf(b.topic);
                return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
            }
            if (a.year !== b.year) return a.year - b.year;
            return (parseInt(a.extractedNum)||0) - (parseInt(b.extractedNum)||0);
        }
        if (criteria === 'unit') {
            if (a.unit !== b.unit) {
                const idxA = APP_CONFIG.taxonomyOrder.indexOf(a.unit);
                const idxB = APP_CONFIG.taxonomyOrder.indexOf(b.unit);
                return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
            }
            if (a.topic !== b.topic) {
                const idxA = customTopicOrder.indexOf(a.topic);
                const idxB = customTopicOrder.indexOf(b.topic);
                return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
            }
            if (a.year !== b.year) return a.year - b.year;
            return (parseInt(a.extractedNum)||0) - (parseInt(b.extractedNum)||0);
        }
        return 0;
    });
    renderFocusList();
}
async function deleteFocusItem(e, id) {
    e.stopPropagation();
    await focusDb.items.delete(id);
    currentFocusItems = currentFocusItems.filter(i => i.questionId !== id);
    renderFocusList();
    updateFocusButtons();
}
async function clearFocusList() {
    if(!confirm("Delete ALL items in Focus List?")) return;
    await focusDb.items.clear();
    currentFocusItems = [];
    renderFocusList();
    updateFocusButtons();
}
function copyFocusList() {
    if(currentFocusItems.length === 0) return alert("List is empty");
    let text = "My Physics Focus List:\n\n";
    currentFocusItems.forEach(i => {
        text += `• ${i.year} Q${i.extractedNum || i.number || '?'} (${i.topic}) - Added ${i.dateAdded.toLocaleDateString()}\n`;
    });
    navigator.clipboard.writeText(text).then(() => { showToast("Copied to clipboard"); });
}
async function attemptFocusList() {
    const items = await focusDb.items.toArray();
    if (items.length === 0) return; 
    activeQuestions = items.map(i => questionMap[i.questionId]).filter(q => q);
    if (activeQuestions.length === 0) return alert("Error loading questions. Check data source.");
    if (document.getElementById('chk-shuffle').checked) activeQuestions.sort(() => Math.random() - 0.5);
    currentIndex = 0; sessionScore = 0; sessionAttempts = 0; currentStreak = 0; isReviewMode = false;
    switchView('view-quiz'); loadQuestion(); resizeCanvases();
}
function startFocusSingle(id) {
    const q = questionMap[id];
    if(!q) return alert("Question data error");
    activeQuestions = [q]; currentIndex = 0; sessionScore = 0; sessionAttempts = 0; isReviewMode = true; 
    switchView('view-quiz'); loadQuestion();
}
async function updateFocusButtons() {
    const count = await focusDb.items.count();
    const btnView = document.getElementById('btn-view-focus');
    const btnAttempt = document.getElementById('btn-attempt-focus');
    if (btnView) btnView.disabled = (count === 0);
    if (btnAttempt) btnAttempt.disabled = (count === 0);
}
function updateExamTimer() {
    examState.totalSeconds--;
    const m = Math.floor(examState.totalSeconds / 60);
    const s = examState.totalSeconds % 60;
    const display = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
    document.getElementById('timer-val').textContent = display;
    const timerBox = document.getElementById('hud-timer');
    if (examState.totalSeconds <= 20) {
        timerBox.classList.add('timer-warning-critical'); 
    } else if (examState.totalSeconds <= 60) {
        timerBox.classList.add('timer-warning-low'); 
    }
    const timeSpentOnQ = (Date.now() - examState.currentQStart) / 1000;
    const card = document.querySelector('#view-quiz .card');
    if (timeSpentOnQ > examState.qSecondsLimit) {
        card.classList.add('card-warning'); 
    }
    if (examState.totalSeconds <= 0) {
        clearInterval(examState.timer);
        finishQuiz();
    }
}
function switchView(viewId) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active-view'));
    document.getElementById(viewId).classList.add('active-view');
}
function exitToDashboard() { 
    switchView('view-dashboard'); 
    updateCountPreview(); 
    updateFocusButtons(); 
}
function formatQuestionText(raw) {
    if (!raw) return "";
    let html = raw;
    html = html.replace(/\[c\](.*?)\[\/c\]/gs, '<div class="center-text">$1</div>');
    html = html.replace(/\[s\](.*?)\[\/s\]/gs, (match, content) => {
        const lines = content.split(/<br\s*\/?>|\n/gi).filter(line => line.trim() !== "");
        let gridHtml = '<div class="stmt-container">';
        lines.forEach(line => {
            const parts = line.trim().match(/^([IVX]+)\s+(.*)/);
            if (parts) { gridHtml += `<div class="stmt-row"><div class="stmt-num">${parts[1]}</div><div class="stmt-text">${parts[2]}</div></div>`; } 
            else { gridHtml += `<div class="stmt-row"><div class="stmt-text">${line}</div></div>`; }
        });
        gridHtml += '</div>';
        return gridHtml;
    });
    html = html.replace(/\[t\](.*?)\[\/t\]/gs, (match, content) => {
        const lines = content.trim().split(/\r?\n|<br\s*\/?>/i).filter(l => l.trim());
        if (lines.length === 0) return "";
        let tableHtml = '<table class="preview-table">';
        const headers = lines[0].split('|');
        tableHtml += '<thead><tr>';
        headers.forEach(h => tableHtml += `<th>${h.trim()}</th>`);
        tableHtml += '</tr></thead><tbody>';
        for (let i = 1; i < lines.length; i++) {
            const cells = lines[i].split('|');
            tableHtml += '<tr>';
            cells.forEach(c => tableHtml += `<td>${c.trim()}</td>`);
            tableHtml += '</tr>';
        }
        tableHtml += '</tbody></table>';
        return tableHtml;
    });
    return html;
}
function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const newTheme = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
    updateThemeColors();
    if(typeof resizeCanvases === 'function') resizeCanvases();
}
function updateThemeIcon(theme) {
    const icon = document.getElementById('theme-icon');
    if (icon) {
        icon.src = theme === 'dark' ? 'icons/lightmode.webp' : 'icons/darkmode.webp';
    }
}
async function openHeatmap() {
    document.getElementById('heatmap-modal').style.display = 'flex';
    document.getElementById('fab-menu').classList.remove('open');
    await setHeatmapMode('questions');
}
function renderHeatmap(attempts) {
    const container = document.getElementById('heatmap-content');
    container.innerHTML = '';
    const stats = {}; 
    if (heatmapMode === 'questions') {
        const uniqueQs = {}; 
        attempts.forEach(a => {
            if (!uniqueQs[a.questionId]) uniqueQs[a.questionId] = { isSolved: false, unit: a.unit, topic: null };
            if (a.isCorrect) uniqueQs[a.questionId].isSolved = true;
            const qData = questionMap[a.questionId];
            if (qData) uniqueQs[a.questionId].topic = qData.topic;
        });
        Object.values(uniqueQs).forEach(item => {
            if (!item.topic) return;
            if (!stats[item.topic]) stats[item.topic] = { correct: 0, total: 0 };
            stats[item.topic].total++;
            if (item.isSolved) stats[item.topic].correct++;
        });
    } else if (heatmapMode === 'recent') {
        const latestAttempts = {};
        attempts.forEach(a => {
            if (!latestAttempts[a.questionId] || new Date(a.timestamp) > new Date(latestAttempts[a.questionId].timestamp)) {
                latestAttempts[a.questionId] = a;
            }
        });
        Object.values(latestAttempts).forEach(a => {
            const q = questionMap[a.questionId];
            if (!q) return;
            if (!stats[q.topic]) stats[q.topic] = { correct: 0, total: 0 };
            stats[q.topic].total++;
            if (a.isCorrect) stats[q.topic].correct++;
        });
    } else {
        attempts.forEach(a => {
            const q = questionMap[a.questionId];
            if (!q) return; 
            if (!stats[q.topic]) stats[q.topic] = { correct: 0, total: 0 };
            stats[q.topic].total++;
            if (a.isCorrect) stats[q.topic].correct++;
        });
    }
    const activeUnits = APP_CONFIG.taxonomyOrder.filter(u => APP_CONFIG.taxonomy[u]);
    if (activeUnits.length === 0) {
        container.innerHTML = '<p class="center-text">No data available yet.</p>';
        return;
    }
    activeUnits.forEach(unit => {
        const topics = APP_CONFIG.taxonomy[unit];
        if (!topics) return;
        const unitHeader = document.createElement('div');
        unitHeader.className = 'heatmap-unit-label';
        unitHeader.textContent = unit;
        container.appendChild(unitHeader);
        const grid = document.createElement('div');
        grid.className = 'heatmap-grid';
        topics.forEach(topic => {
            const s = stats[topic] || { correct: 0, total: 0 };
            const div = document.createElement('div');
            let cssClass = 'hm-none';
            let scoreText = 'No attempts';
            if (s.total > 0) {
                const pc = (s.correct / s.total) * 100;
                scoreText = `${Math.round(pc)}% (${s.correct}/${s.total})`;
                if (pc >= 80) cssClass = 'hm-80';
                else if (pc >= 70) cssClass = 'hm-70';
                else if (pc >= 60) cssClass = 'hm-60';
                else if (pc >= 50) cssClass = 'hm-50';
                else if (pc >= 40) cssClass = 'hm-40';
                else cssClass = 'hm-fail';
            }
            div.className = `heatmap-item ${cssClass}`;
            div.innerHTML = `<span class="hm-topic">${topic}</span><span class="hm-score">${scoreText}</span>`;
            grid.appendChild(div);
        });
        container.appendChild(grid);
    });
}
function openAbout() {
    const modal = document.getElementById('about-modal');
    const titleEl = document.getElementById('about-app-title');
    const metaEl = document.getElementById('about-meta-content');
    document.getElementById('fab-menu').classList.remove('open');
    const title = document.title; 
    const version = document.querySelector('meta[name="version"]').content;
    const dateRaw = document.querySelector('meta[name="date"]').content;
    const author = document.querySelector('meta[name="author"]').content;
    const dateObj = new Date(dateRaw);
    const dateStr = dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    if(titleEl) titleEl.textContent = title;
    if(metaEl) {
        metaEl.innerHTML = `
            <strong>Version:</strong> ${version} &bull; 
            <strong>Date:</strong> ${dateStr}<br>
            <strong>Author:</strong> ${author}
        `;
    }
    modal.style.display = 'flex';
}
function toggleFab() { document.getElementById('fab-menu').classList.toggle('open'); }
function openData() { document.getElementById('data-modal').style.display = 'flex'; document.getElementById('fab-menu').classList.remove('open'); }
function openEquations() { document.getElementById('equation-modal').style.display = 'flex'; document.getElementById('fab-menu').classList.remove('open'); }
function closeModal(event, modalId) { if (event.target.id === modalId) document.getElementById(modalId).style.display = 'none'; }
document.addEventListener('click', function(event) {
    const fab = document.getElementById('fab-menu');
    if (fab.classList.contains('open') && !fab.contains(event.target)) fab.classList.remove('open');
});
let isPadOpen = false; let isAnnotating = false;
let drawState = { color: 'black', width: 2, alpha: 1.0, composite: 'source-over' };
let isDrawing = false; let lastX = 0, lastY = 0; let activeCanvas = null;
function toggleNotepad() {
    const drawer = document.getElementById('notepad-drawer');
    const quizView = document.getElementById('view-quiz');
    if (isPadOpen) { drawer.classList.remove('open'); quizView.classList.remove('shrunk'); if(isAnnotating) toggleAnnotate(); isPadOpen = false; } 
    else { drawer.classList.add('open'); quizView.classList.add('shrunk'); isPadOpen = true; }
}
function toggleAnnotate() {
    const btn = document.getElementById('btn-annotate');
    const quizView = document.getElementById('view-quiz');
    isAnnotating = !isAnnotating;
    if (isAnnotating) { btn.classList.add('active'); quizView.classList.add('frozen', 'annotating'); } 
    else { btn.classList.remove('active'); quizView.classList.remove('frozen', 'annotating'); }
}
function setTool(tool) {
    document.querySelectorAll('.tool-icon-btn').forEach(b => b.classList.remove('active'));
    if(tool === 'annotate' || tool === 'clear' || tool === 'close') return;
    const clicked = [...document.querySelectorAll('.tool-icon-btn')].find(b => b.onclick.toString().includes(`'${tool}'`));
    if(clicked) clicked.classList.add('active');
    if (tool === 'eraser') { drawState.composite = 'destination-out'; drawState.width = 30; drawState.alpha = 1.0; } 
    else if (tool === 'highlight') { drawState.composite = 'source-over'; drawState.color = 'yellow'; drawState.width = 40; drawState.alpha = 0.05; } 
    else { drawState.composite = 'source-over'; drawState.color = tool; drawState.width = 2; drawState.alpha = 1.0; }
}
function clearCanvas(target) {
    if (target === 'current') {
        const overlay = document.getElementById('overlay-canvas'); 
        const scrap = document.getElementById('scrap-canvas');
        if (overlay) { const ctx = overlay.getContext('2d'); ctx.clearRect(0, 0, overlay.width, overlay.height); ctx.beginPath(); }
        if (scrap) { const ctx = scrap.getContext('2d'); ctx.clearRect(0, 0, scrap.width, scrap.height); ctx.beginPath(); }
    } else if (target === 'overlay') { 
        const overlay = document.getElementById('overlay-canvas'); 
        if (overlay) overlay.getContext('2d').clearRect(0, 0, overlay.width, overlay.height);
    }
}
function initDrawing(canvas) { const events = ['mousedown', 'mousemove', 'mouseup', 'mouseout', 'touchstart', 'touchmove', 'touchend']; events.forEach(ev => canvas.addEventListener(ev, handleDrawEvent, { passive: false })); }
function resizeCanvases() {
    const overlay = document.getElementById('overlay-canvas');
    if (overlay) { overlay.width = window.innerWidth; overlay.height = window.innerHeight; }
    const scrap = document.getElementById('scrap-canvas'); 
    const scrapContainer = document.querySelector('.notepad-canvas-container');
    if(scrap && scrapContainer) { scrap.width = scrapContainer.clientWidth; scrap.height = scrapContainer.clientHeight; }
}
function getCoords(e, canvas) {
    const rect = canvas.getBoundingClientRect(); let clientX, clientY;
    if(e.touches && e.touches.length > 0) { clientX = e.touches[0].clientX; clientY = e.touches[0].clientY; } 
    else { clientX = e.clientX; clientY = e.clientY; }
    return { x: clientX - rect.left, y: clientY - rect.top };
}
function handleDrawEvent(e) {
    const canvas = e.target;
    if (canvas.id === 'overlay-canvas' && !isAnnotating) return;
    const ctx = canvas.getContext('2d'); const coords = getCoords(e, canvas);
    if (e.type === 'mousedown' || e.type === 'touchstart') {
        e.preventDefault(); isDrawing = true; activeCanvas = canvas; lastX = coords.x; lastY = coords.y;
        ctx.beginPath(); ctx.fillStyle = drawState.composite === 'destination-out' ? 'rgba(0,0,0,1)' : drawState.color;
        ctx.globalAlpha = drawState.alpha; ctx.globalCompositeOperation = drawState.composite;
        ctx.arc(lastX, lastY, drawState.width/2, 0, Math.PI*2); ctx.fill();
    } else if (e.type === 'mousemove' || e.type === 'touchmove') {
        if (!isDrawing || activeCanvas !== canvas) return; e.preventDefault();
        ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(coords.x, coords.y);
        ctx.strokeStyle = drawState.color; ctx.lineWidth = drawState.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.globalAlpha = drawState.alpha; ctx.globalCompositeOperation = drawState.composite;
        ctx.stroke(); lastX = coords.x; lastY = coords.y;
    } else if (e.type === 'mouseup' || e.type === 'mouseout' || e.type === 'touchend') { isDrawing = false; activeCanvas = null; }
}
async function setHeatmapMode(mode) {
    heatmapMode = mode;
    document.querySelectorAll('.hm-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`btn-hm-${mode}`).classList.add('active');
    const allAttempts = await db.attempts.toArray();
    renderHeatmap(allAttempts);
}
let activeResource = {
    type: 'image', 
    content: null, 
    currentIndex: 0,
    title: ''
};
function initResources() {
    if (!APP_CONFIG.resources) return;
    const container = document.getElementById('fab-items-container');
    const createBtn = (icon, title, onClick) => {
        const btn = document.createElement('button');
        btn.className = 'fab-action-btn';
        btn.title = title;
        btn.onclick = onClick;
        btn.innerHTML = `<img src="icons/${icon}" style="width: 48px; height: 48px; vertical-align: middle;">`;
        return btn;
    };
    const refNode = container.children[2]; 
    if (APP_CONFIG.resources.dataSheet && APP_CONFIG.resources.dataSheet.enabled) {
        const r = APP_CONFIG.resources.dataSheet;
        const btn = createBtn('data.webp', 'Data Sheet', () => openResource(r, 'Data Sheet'));
        container.insertBefore(btn, refNode);
    }
    if (APP_CONFIG.resources.equationSheet && APP_CONFIG.resources.equationSheet.enabled) {
        const r = APP_CONFIG.resources.equationSheet;
        const btn = createBtn('equation.webp', 'Relationships', () => openResource(r, 'Relationships'));
        container.insertBefore(btn, refNode);
    }
}
function openResource(resourceConfig, defaultTitle) {
    document.getElementById('fab-menu').classList.remove('open');
    activeResource.type = resourceConfig.type;
    activeResource.content = resourceConfig.content;
    activeResource.currentIndex = 0;
    activeResource.title = defaultTitle;
    const modal = document.getElementById('resource-modal');
    const titleEl = document.getElementById('res-title');
    const imgEl = document.getElementById('res-image');
    const controls = document.getElementById('res-controls');
    document.querySelector('.zoom-container').scrollTop = 0;
    document.querySelector('.zoom-container').scrollLeft = 0;
    if (activeResource.type === 'booklet' && Array.isArray(activeResource.content)) {
        controls.style.display = 'flex';
        updateResourceView();
    } else {
        controls.style.display = 'none';
        titleEl.textContent = activeResource.title;
        imgEl.src = activeResource.content;
    }
    modal.style.display = 'flex';
}
function updateResourceView() {
    const imgEl = document.getElementById('res-image');
    const titleEl = document.getElementById('res-title');
    const countEl = document.getElementById('res-counter');
    const btnPrev = document.getElementById('btn-res-prev');
    const btnNext = document.getElementById('btn-res-next');
    imgEl.src = activeResource.content[activeResource.currentIndex];
    titleEl.textContent = `${activeResource.title}`;
    countEl.textContent = `${activeResource.currentIndex + 1} / ${activeResource.content.length}`;
    btnPrev.disabled = (activeResource.currentIndex === 0);
    btnNext.disabled = (activeResource.currentIndex === activeResource.content.length - 1);
}
function changeResourcePage(dir) {
    const newIndex = activeResource.currentIndex + dir;
    if (newIndex >= 0 && newIndex < activeResource.content.length) {
        activeResource.currentIndex = newIndex;
        updateResourceView();
    }
}
function hexToHSL(H) {
    let r = 0, g = 0, b = 0;
    if (H.length == 4) {
        r = "0x" + H[1] + H[1]; g = "0x" + H[2] + H[2]; b = "0x" + H[3] + H[3];
    } else if (H.length == 7) {
        r = "0x" + H[1] + H[2]; g = "0x" + H[3] + H[4]; b = "0x" + H[5] + H[6];
    }
    r /= 255; g /= 255; b /= 255;
    let cmin = Math.min(r,g,b), cmax = Math.max(r,g,b), delta = cmax - cmin;
    let h = 0, s = 0, l = 0;
    if (delta == 0) h = 0;
    else if (cmax == r) h = ((g - b) / delta) % 6;
    else if (cmax == g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
    l = (cmax + cmin) / 2;
    s = delta == 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
    s = +(s * 100).toFixed(1);
    l = +(l * 100).toFixed(1);
    return { h, s, l };
}
function updateThemeColors() {
    if (!APP_CONFIG.colors) return;
    const root = document.documentElement;
    const isDark = root.getAttribute('data-theme') === 'dark';
    const baseHex = APP_CONFIG.colors.primary;
    const base = hexToHSL(baseHex); 
    if (!isDark) {
        root.style.setProperty('--brand-primary', APP_CONFIG.colors.primary);
        root.style.setProperty('--brand-accent', APP_CONFIG.colors.accent);
        root.style.setProperty('--primary-dark', `hsl(${base.h}, ${base.s}%, 20%)`);
        const lightS = base.s * 0.6; 
        const lightL = Math.min(85, base.l + 19); 
        root.style.setProperty('--primary-light', `hsl(${base.h + 4}, ${lightS}%, ${lightL}%)`);
        const accentL = Math.min(90, base.l + 20);
        root.style.setProperty('--primary-accent', `hsl(${base.h + 5}, 100%, ${accentL}%)`);
        root.style.setProperty('--bg-error', '#F1D4D4');
    } else {
        const dmH = base.h;
        const dmS = Math.max(0, base.s - 40); 
        const dmL = Math.min(100, base.l + 10);
        root.style.setProperty('--brand-primary', `hsl(${dmH}, ${dmS}%, ${dmL}%)`);
        root.style.setProperty('--brand-accent', APP_CONFIG.colors.accent); 
        root.style.setProperty('--primary-dark', `hsl(${dmH}, ${dmS}%, ${dmL - 10}%)`);
        root.style.setProperty('--primary-light', `hsl(${dmH}, ${dmS}%, ${dmL + 10}%)`);
        root.style.setProperty('--primary-accent', `hsl(${dmH + 5}, 90%, ${dmL + 10}%)`);
        root.style.setProperty('--bg-error', '#4a2c2c'); 
    }
}
document.addEventListener('keydown', (e) => {
    const quizView = document.getElementById('view-quiz');
    if (!quizView || !quizView.classList.contains('active-view')) return;
    if (e.key === 'ArrowRight') {
        if (currentIndex < activeQuestions.length - 1) {
            currentIndex++;
            loadQuestion();
        } else {
        }
    }
    if (e.key === 'ArrowLeft') {
        if (currentIndex > 0) {
            currentIndex--;
            loadQuestion();
        }
    }
});