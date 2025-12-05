const TASKS = [
  {
    id: 'duration',
    label: 'Duration discrimination',
    displayLabel: 'Listening Task 3',
    folder: 'duration_discrimination',
    csvName: 'duration_discrimination',
    displayDetail: 'Listening Task 3: One of the three sounds is different. Choose the sound you think is odd.',
    thresholdLabel: 'Estimated threshold (reversal mean)'
  },
  {
    id: 'formant',
    label: 'Formant discrimination',
    displayLabel: 'Listening Task 2',
    folder: 'formant_discrimination',
    csvName: 'formant_discrimination',
    displayDetail: 'Listening Task 2: One of the three sounds is different. Choose the sound you think is odd.',
    thresholdLabel: 'Estimated threshold (reversal mean)'
  },
  {
    id: 'pitch',
    label: 'Pitch discrimination',
    displayLabel: 'Listening Task 1',
    folder: 'pitch_discrimination',
    csvName: 'pitch_discrimination',
    displayDetail: 'Listening Task 1: One of the three sounds is different. Choose the sound you think is odd.',
    thresholdLabel: 'Estimated threshold (reversal mean)'
  },
  {
    id: 'risetime',
    label: 'Rise time discrimination',
    displayLabel: 'Listening Task 4',
    folder: 'risetime_discrimination',
    csvName: 'risetime_discrimination',
    displayDetail: 'Listening Task 4: One of the three sounds is different. Choose the sound you think is odd.',
    thresholdLabel: 'Estimated threshold (reversal mean)'
  }
];

const config = {
  startingStep: 51,
  maxTrials: 75,
  numSteps: 101,
  targetReversals: 7,
  interStimulusDelay: 500,
  postSequenceDelay: 500,
  postResponseDelay: 1000,
  stepSizes: [10, 5, 2, 1, 1, 1, 1, 1]
};

const practiceConfig = {
  trials: 5,
  baseStep: 1,
  differentStep: 100
};

const elements = {
  setup: document.getElementById('setup'),
  overview: document.getElementById('overview'),
  instructions: document.getElementById('instructions'),
  trial: document.getElementById('trial'),
  taskComplete: document.getElementById('taskComplete'),
  complete: document.getElementById('complete'),
  subjectId: document.getElementById('subjectId'),
  decideOrder: document.getElementById('decideOrder'),
  orderList: document.getElementById('orderList'),
  beginBattery: document.getElementById('beginBattery'),
  taskTag: document.getElementById('taskTag'),
  taskTitle: document.getElementById('taskTitle'),
  taskDetail: document.getElementById('taskDetail'),
  startPractice: document.getElementById('startPractice'),
  startTest: document.getElementById('startTest'),
  practiceStatus: document.getElementById('practiceStatus'),
  sessionTag: document.getElementById('sessionTag'),
  trialHeading: document.getElementById('trialHeading'),
  trialPrompt: document.getElementById('trialPrompt'),
  playbackStatus: document.getElementById('playbackStatus'),
  choose1: document.getElementById('choose1'),
  choose3: document.getElementById('choose3'),
  feedback: document.getElementById('feedback'),
  taskProgress: document.getElementById('taskProgress'),
  completeTitle: document.getElementById('completeTitle'),
  thresholdText: document.getElementById('thresholdText'),
  taskCompleteHint: document.getElementById('taskCompleteHint'),
  nextTaskButton: document.getElementById('nextTaskButton'),
  summaryList: document.getElementById('summaryList'),
  downloadCsv: document.getElementById('downloadCsv')
};

const AVAILABLE_STEPS = {
  // Leave empty when all 1..numSteps are present. Populate per task only if some steps are missing and you need a limited list.
};

let subjectId = '';
let taskOrder = [];
let currentTaskIndex = 0;
let currentTask = null;
let availableSteps = [];
let stimOrder = [];
let responseWindowStart = null;
let trialState = {};
let audioPool = [];
let baseAudioA = null;
let baseAudioB = null;
let warmupPromise = null;
let state = createState();
let practiceState = createPracticeState();
let awaitingTestStart = false;
const currentResults = [];
const allResults = [];
const taskSummaries = [];

function createState() {
  return {
    currentStep: config.startingStep,
    currentTrial: 0,
    numReversals: 0,
    lastCorrect: -1,
    numCorrect: 0,
    reversalsSum: 0
  };
}

function createPracticeState() {
  return {
    currentTrial: 0,
    order: [],
    completed: false
  };
}

function getAvailableSteps(taskId) {
  const custom = AVAILABLE_STEPS[taskId];
  if (custom && Array.isArray(custom) && custom.length) return custom.slice();
  return Array.from({ length: config.numSteps }, (_, i) => i + 1);
}

function clampStepToAvailable(step) {
  if (availableSteps.includes(step)) return step;
  let best = availableSteps[0];
  let bestDiff = Math.abs(step - best);
  for (let i = 1; i < availableSteps.length; i++) {
    const cand = availableSteps[i];
    const diff = Math.abs(step - cand);
    if (diff < bestDiff) {
      best = cand;
      bestDiff = diff;
    }
    if (diff === 0) break;
  }
  return best;
}

function getAudioForStep(step) {
  const actualStep = clampStepToAvailable(step);
  let audio = audioPool[actualStep];
  let substituted = step !== actualStep;
  if (!audio) {
    // As a last resort, fall back to base so playback is never silent
    audio = baseAudioA;
    substituted = true;
  }
  if (substituted && audio && typeof console !== 'undefined') {
    console.warn(`Stimulus step ${step} was substituted with ${actualStep} (task: ${currentTask ? currentTask.id : 'unknown'})`);
  }
  return { audio, step: actualStep, substituted, requestedStep: step };
}

function initAudioPool(task) {
  const pool = [null];
  for (let i = 1; i <= config.numSteps; i++) {
    if (availableSteps.includes(i)) {
      pool.push(createAudio(`./${task.folder}/Stimuli/${i}.flac`));
    } else {
      pool.push(null);
    }
  }
  return pool;
}

function createAudio(src) {
  const audio = new Audio(src);
  audio.preload = 'auto';
  audio.load();
  return audio;
}

function resetAudio(audio) {
  audio.pause();
  audio.currentTime = 0;
}

function waitForAudioReady(audio) {
  // Ready when we have future data (3) and a usable duration
  const hasData = () => audio.readyState >= 3 && Number.isFinite(audio.duration) && audio.duration > 0;
  if (hasData()) return Promise.resolve();

  return new Promise(resolve => {
    let timer = null;
    const cleanup = () => {
      if (timer !== null) clearTimeout(timer);
      audio.removeEventListener('canplaythrough', cleanup);
      audio.removeEventListener('loadeddata', cleanup);
      audio.removeEventListener('error', cleanup);
      resolve();
    };
    timer = setTimeout(cleanup, 5000);
    audio.addEventListener('canplaythrough', cleanup, { once: true });
    audio.addEventListener('loadeddata', cleanup, { once: true });
    audio.addEventListener('error', cleanup, { once: true });
    try {
      audio.load();
    } catch (e) {
      cleanup();
    }
  });
}

function warmUpTaskAudio() {
  const stepsToWarm = new Set([1, config.startingStep, practiceConfig.baseStep, practiceConfig.differentStep]);
  const targets = new Set([baseAudioA, baseAudioB]);
  stepsToWarm.forEach(step => {
    const { audio } = getAudioForStep(step);
    if (audio) targets.add(audio);
  });
  return Promise.all(Array.from(targets).map(a => waitForAudioReady(a).catch(() => {})));
}

function showSection(section) {
  [elements.setup, elements.overview, elements.instructions, elements.trial, elements.taskComplete, elements.complete]
    .forEach(el => el.classList.remove('active'));
  elements[section].classList.add('active');
}

function seededRandom(seedStr) {
  let seed = 0;
  const normalized = seedStr.trim().toLowerCase();
  for (let i = 0; i < normalized.length; i++) {
    seed = (seed * 31 + normalized.charCodeAt(i) + i) >>> 0;
  }
  if (seed === 0) seed = 1234567;
  return () => {
    // xorshift32
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) % 0x100000000) / 0x100000000;
  };
}

function seededShuffle(array, seedStr) {
  const rand = seededRandom(seedStr || 'default');
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function renderOrderList() {
  elements.orderList.innerHTML = '';
  taskOrder.forEach((task, index) => {
    const li = document.createElement('li');
    li.textContent = task.displayLabel;
    elements.orderList.appendChild(li);
  });
}

function resetPracticeProgress() {
  practiceState = createPracticeState();
  elements.startTest.disabled = true;
  elements.startTest.textContent = 'Start main task after practice (Spacebar starts too)';
  elements.practiceStatus.textContent = 'Finish 5 practice trials, then start the main task with Space or the button below.';
  elements.startPractice.disabled = false;
  elements.startPractice.textContent = 'Start practice';
  awaitingTestStart = false;
}

function resetTaskState() {
  state = createState();
  if (availableSteps.length) {
    state.currentStep = clampStepToAvailable(state.currentStep);
  }
  currentResults.length = 0;
  stimOrder = [];
  trialState = {};
  responseWindowStart = null;
}

function prepareTask(task) {
  currentTask = task;
  availableSteps = getAvailableSteps(task.id);
  resetTaskState();
  resetPracticeProgress();
  audioPool = initAudioPool(task);
  baseAudioA = createAudio(`./${task.folder}/Stimuli/1.flac`);
  baseAudioB = createAudio(`./${task.folder}/Stimuli/1.flac`);
  elements.startPractice.disabled = true;
  elements.practiceStatus.textContent = 'Loading audio...';
  warmupPromise = warmUpTaskAudio();
  warmupPromise.finally(() => {
    elements.startPractice.disabled = false;
    if (!practiceState.completed) {
      elements.practiceStatus.textContent = 'Finish 5 practice trials, then start the main task with Space or the button below.';
    }
  });
  elements.taskTag.textContent = `Task ${currentTaskIndex + 1}/${taskOrder.length} | Instructions`;
  elements.taskTitle.textContent = task.displayLabel;
  elements.taskDetail.textContent = task.displayDetail;
  elements.feedback.textContent = '';
  elements.feedback.classList.remove('correct', 'incorrect');
  showSection('instructions');
}

function setSessionUi(mode) {
  const prefix = `Task ${currentTaskIndex + 1}/${taskOrder.length}`;
  if (mode === 'practice') {
    elements.sessionTag.textContent = `${prefix} | Practice`;
    elements.trialHeading.textContent = `${currentTask.displayLabel} - Practice`;
    elements.trialPrompt.textContent = 'One sound is clearly different. Choose 1 or 3.';
    elements.taskProgress.style.display = 'inline-flex';
    elements.taskProgress.textContent = `${prefix} | Practice ${practiceState.currentTrial + 1}/${practiceConfig.trials}`;
  } else {
    elements.sessionTag.textContent = `${prefix} | Test`;
    elements.trialHeading.textContent = `${currentTask.displayLabel} - Test`;
    elements.trialPrompt.textContent = 'Which sound is different? (1 or 3)';
    elements.taskProgress.style.display = 'none';
    elements.taskProgress.textContent = '';
  }
  elements.playbackStatus.textContent = 'Playing audio...';
}

function clearFeedback() {
  elements.feedback.textContent = '';
  elements.feedback.classList.remove('correct', 'incorrect');
}

function setFeedback(message, wasCorrect) {
  elements.feedback.textContent = message;
  elements.feedback.classList.remove('correct', 'incorrect');
  elements.feedback.classList.add(wasCorrect ? 'correct' : 'incorrect');
}

function shuffle(array) {
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildStimOrder() {
  const arr = [];
  for (let i = 0; i < Math.floor(config.maxTrials / 2); i++) arr.push(0);
  for (let i = Math.floor(config.maxTrials / 2); i < config.maxTrials; i++) arr.push(1);
  return shuffle(arr);
}

function buildPracticeOrder(numTrials) {
  const arr = [];
  for (let i = 0; i < numTrials; i++) {
    arr.push(Math.random() < 0.5 ? 0 : 1);
  }
  return arr;
}

function toggleResponseButtons(enabled) {
  elements.choose1.disabled = !enabled;
  elements.choose3.disabled = !enabled;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function playAndWait(audio) {
  if (!audio) return true; // treat missing audio as error
  await waitForAudioReady(audio);
  resetAudio(audio);
  return new Promise(resolve => {
    let done = false;
    let hadError = false;
    const finish = () => {
      if (done) return;
      done = true;
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      resolve(hadError);
    };
    const onEnded = () => finish();
    const onError = () => {
      hadError = true;
      finish();
    };
    audio.addEventListener('ended', onEnded, { once: true });
    audio.addEventListener('error', onError, { once: true });
    const fallbackMs = Number.isFinite(audio.duration) && audio.duration > 0
      ? Math.round(audio.duration * 1000) + 200
      : 4000;
    setTimeout(finish, fallbackMs);
    audio.play().catch(() => {
      hadError = true;
      finish();
    });
  });
}

async function playSequence(first, second, third) {
  const e1 = await playAndWait(first);
  await wait(config.interStimulusDelay);
  const e2 = await playAndWait(second);
  await wait(config.interStimulusDelay);
  const e3 = await playAndWait(third);
  const hadError = e1 || e2 || e3;
  await wait(config.postSequenceDelay);
  return hadError;
}

function startPractice() {
  if (warmupPromise) {
    elements.practiceStatus.textContent = 'Loading audio...';
  }
  practiceState.currentTrial = 0;
  practiceState.order = buildPracticeOrder(practiceConfig.trials);
  practiceState.completed = false;
  elements.startTest.disabled = true;
  elements.practiceStatus.textContent = `Practice in progress (${practiceConfig.trials} total). After playback, choose 1 or 3.`;
  setSessionUi('practice');
  clearFeedback();
  showSection('trial');
  runPracticeTrial();
}

async function runPracticeTrial() {
  clearFeedback();
  if (warmupPromise) {
    await warmupPromise;
  }
  const trialIndex = practiceState.currentTrial;
  const oddIsThird = practiceState.order[trialIndex] === 0;
  const correctAnswer = oddIsThird ? '3' : '1';

  toggleResponseButtons(false);
  setSessionUi('practice');
  elements.playbackStatus.textContent = `Practice ${trialIndex + 1}/${practiceConfig.trials}: Playing audio...`;

  const { audio: differentAudio, step: playedPracticeStep, substituted: practiceSub } = getAudioForStep(practiceConfig.differentStep);
  const first = oddIsThird ? baseAudioA : differentAudio;
  const second = oddIsThird ? baseAudioB : baseAudioA;
  const third = oddIsThird ? differentAudio : baseAudioB;
  trialState = {
    correctAnswer,
    requestedStep: practiceConfig.differentStep,
    trialStep: playedPracticeStep,
    substituted: practiceSub,
    oddPosition: oddIsThird ? 3 : 1,
    mode: 'practice'
  };

  const hadError = await playSequence(first, second, third);
  if (hadError) {
    elements.playbackStatus.textContent = 'Audio could not be loaded. Check the network and file placement, then reload the page.';
    return;
  }
  responseWindowStart = performance.now();
  elements.playbackStatus.textContent = `Practice ${trialIndex + 1}/${practiceConfig.trials}: Choose 1 or 3.`;
  toggleResponseButtons(true);
}

async function startExperiment() {
  if (!practiceState.completed) {
    elements.practiceStatus.textContent = `Complete all ${practiceConfig.trials} practice trials before starting the main task.`;
    return;
  }
  if (!awaitingTestStart) return;
  if (warmupPromise) {
    await warmupPromise;
  }
  awaitingTestStart = false;
  elements.startTest.disabled = true;
  elements.startTest.textContent = 'Preparing the main task...';
  elements.practiceStatus.textContent = 'Preparing the main task...';
  resetTaskState();
  stimOrder = buildStimOrder();
  setSessionUi('test');
  clearFeedback();
  showSection('trial');
  runTrial();
}

function nextTrial() {
  if (state.currentTrial === config.maxTrials || state.numReversals === config.targetReversals) {
    return concludeTask();
  }
  runTrial();
}

async function runTrial() {
  const trialIndex = state.currentTrial;
  const oddIsThird = stimOrder[trialIndex] === 0;
  const correctAnswer = oddIsThird ? '3' : '1';
  const trialStep = state.currentStep;

  clearFeedback();
  toggleResponseButtons(false);
  setSessionUi('test');
  elements.playbackStatus.textContent = 'Playing audio...';

  const { audio: stepAudio, step: playedStep, substituted: testSub } = getAudioForStep(trialStep);
  const first = oddIsThird ? baseAudioA : stepAudio;
  const second = oddIsThird ? baseAudioB : baseAudioA;
  const third = oddIsThird ? stepAudio : baseAudioB;
  trialState = {
    correctAnswer,
    requestedStep: trialStep,
    trialStep: playedStep,
    substituted: testSub,
    oddPosition: oddIsThird ? 3 : 1,
    mode: 'test'
  };

  const hadError = await playSequence(first, second, third);
  if (hadError) {
    elements.playbackStatus.textContent = 'Audio could not be loaded. Check the network and file placement, then reload the page.';
    return;
  }
  responseWindowStart = performance.now();
  elements.playbackStatus.textContent = 'Select 1 or 3.';
  toggleResponseButtons(true);
}

function handleResponse(choice) {
  if (!responseWindowStart) return;
  const rtMs = Math.round(performance.now() - responseWindowStart);
  toggleResponseButtons(false);

  const wasCorrect = choice === trialState.correctAnswer;
  if (trialState.mode === 'practice') {
    responseWindowStart = null;
    const practiceMessage = wasCorrect
      ? 'Correct! Moving to the next practice trial.'
      : `Incorrect. The correct answer was ${trialState.correctAnswer}.`;
    elements.playbackStatus.textContent = practiceMessage;
    setFeedback(practiceMessage, wasCorrect);
    practiceState.currentTrial += 1;
    if (practiceState.currentTrial >= practiceConfig.trials) {
      practiceState.completed = true;
      awaitingTestStart = true;
      elements.practiceStatus.textContent = 'Practice is complete. Start the main task with Space or the button below.';
      elements.startTest.disabled = false;
      elements.startTest.textContent = 'Start main task (Spacebar enabled)';
      elements.startPractice.disabled = true;
      elements.startPractice.textContent = 'Practice completed';
      setTimeout(() => {
        elements.playbackStatus.textContent = 'Press Space or use the button below to start the main task.';
        clearFeedback();
        showSection('instructions');
      }, config.postResponseDelay);
    } else {
      setTimeout(runPracticeTrial, config.postResponseDelay);
    }
    return;
  }

  elements.playbackStatus.textContent = 'Preparing the next trial...';
  clearFeedback();
  const requestedStep = trialState.requestedStep != null ? trialState.requestedStep : state.currentStep;
  const playedStep = trialState.trialStep;

  const stepSizeUsed = applyStaircase(wasCorrect);
  const meanReversal = state.numReversals > 1 ? state.reversalsSum / (state.numReversals - 1) : '';

  currentResults.push({
    subject_id: subjectId,
    task_id: currentTask.id,
    task_label: currentTask.label,
    task_order: currentTaskIndex + 1,
    trial: state.currentTrial + 1,
    stimulus_step: playedStep,
    stimulus_requested_step: requestedStep,
    odd_position: trialState.oddPosition,
    correct_answer: trialState.correctAnswer,
    response: choice,
    correct: wasCorrect ? 1 : 0,
    rt_ms: rtMs,
    num_reversals_after: state.numReversals,
    step_before: requestedStep,
    step_after: state.currentStep,
    step_size_used: stepSizeUsed,
    mean_reversal_so_far: meanReversal,
    threshold_estimate: ''
  });

  state.currentTrial += 1;
  responseWindowStart = null;
  setTimeout(nextTrial, config.postResponseDelay);
}

function applyStaircase(wasCorrect) {
  let stepSizeUsed = config.stepSizes[Math.min(state.numReversals, config.stepSizes.length - 1)];
  const prevLastCorrect = state.lastCorrect;
  const prevNumCorrect = state.numCorrect;

  if (state.numReversals === 0) {
    if (prevLastCorrect > -1) {
      if ((prevLastCorrect === 1 && !wasCorrect) || (prevLastCorrect === 0 && wasCorrect)) {
        state.numReversals += 1;
        if (state.numReversals > 1) {
          state.reversalsSum += state.currentStep;
        }
      }
    }
    stepSizeUsed = config.stepSizes[Math.min(state.numReversals, config.stepSizes.length - 1)];
    if (wasCorrect) {
      state.currentStep -= stepSizeUsed;
    } else {
      state.currentStep += stepSizeUsed;
    }
    state.lastCorrect = wasCorrect ? 1 : 0;
  } else {
    if (prevLastCorrect > -1) {
      if (prevLastCorrect === 1 && !wasCorrect) {
        state.numReversals += 1;
        if (state.numReversals > 1) {
          state.reversalsSum += state.currentStep;
        }
      }
      if (prevLastCorrect === 0 && wasCorrect && prevNumCorrect === 1) {
        state.numReversals += 1;
        if (state.numReversals > 1) {
          state.reversalsSum += state.currentStep;
        }
      }
    }
    stepSizeUsed = config.stepSizes[Math.min(state.numReversals, config.stepSizes.length - 1)];
    if (wasCorrect && prevNumCorrect === 1) {
      state.currentStep -= stepSizeUsed;
    }
    if (!wasCorrect) {
      state.currentStep += stepSizeUsed;
    }
    if (!wasCorrect) {
      state.lastCorrect = 0;
    } else if (prevNumCorrect === 1) {
      state.lastCorrect = 1;
    }
    if (wasCorrect) {
      state.numCorrect += 1;
      if (state.numCorrect === 2) {
        state.numCorrect = 0;
      }
    } else {
      state.numCorrect = 0;
    }
  }

  if (state.currentStep < 2) state.currentStep = 2;
  if (state.currentStep > config.numSteps) state.currentStep = config.numSteps;
  state.currentStep = clampStepToAvailable(state.currentStep);
  return stepSizeUsed;
}

function concludeTask() {
  const threshold = state.numReversals > 1 ? state.reversalsSum / (state.numReversals - 1) : null;
  currentResults.forEach(row => {
    row.threshold_estimate = threshold !== null ? threshold.toFixed(2) : '';
  });
  allResults.push(...currentResults);
  taskSummaries.push({
    task: currentTask,
    order: currentTaskIndex + 1,
    threshold
  });

  elements.completeTitle.textContent = `${currentTask.displayLabel} completed`;
  elements.thresholdText.textContent = threshold !== null
    ? `${currentTask.thresholdLabel}: ${threshold.toFixed(2)}`
    : `${currentTask.thresholdLabel}: Not enough reversals yet to compute.`;

  const isLastTask = currentTaskIndex === taskOrder.length - 1;
  const nextTask = taskOrder[currentTaskIndex + 1];
  elements.taskCompleteHint.textContent = isLastTask
    ? 'All tasks are finished. Review your results.'
    : `Next: "${nextTask.displayLabel}". Continue when you are ready.`;
  elements.nextTaskButton.textContent = isLastTask ? 'View results' : 'Next task';
  elements.nextTaskButton.onclick = () => {
    if (isLastTask) {
      renderSummary();
      showSection('complete');
    } else {
      currentTaskIndex += 1;
      prepareTask(nextTask);
    }
  };

  showSection('taskComplete');
}

function csvEscape(value) {
  if (value === undefined || value === null) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function downloadCsv() {
  const header = [
    'subject_id',
    'task_id',
    'task_label',
    'task_order',
    'trial',
    'stimulus_step',
    'stimulus_requested_step',
    'odd_position',
    'correct_answer',
    'response',
    'correct',
    'rt_ms',
    'num_reversals_after',
    'step_before',
    'step_after',
    'step_size_used',
    'mean_reversal_so_far',
    'threshold_estimate'
  ];
  const lines = [header.join(',')];
  allResults.forEach(row => {
    const line = header.map(key => csvEscape(row[key])).join(',');
    lines.push(line);
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const filenameId = subjectId ? subjectId : 'subject';
  a.download = `${filenameId}_audio_discrimination.csv`;
  a.click();
}

function renderSummary() {
  elements.summaryList.innerHTML = '';
  taskSummaries.sort((a, b) => a.order - b.order).forEach(summary => {
    const div = document.createElement('div');
    div.className = 'summary-item';
    const thresholdText = summary.threshold !== null
      ? `${summary.task.thresholdLabel}: ${summary.threshold.toFixed(2)}`
      : `${summary.task.thresholdLabel}: Could not be calculated`;
    div.innerHTML = `
      <div class="pill">Task ${summary.order}</div>
      <div><strong>${summary.task.displayLabel}</strong></div>
      <div class="status">${thresholdText}</div>
    `;
    elements.summaryList.appendChild(div);
  });
}

elements.decideOrder.addEventListener('click', () => {
  const value = elements.subjectId.value.trim();
  if (!value) {
    elements.subjectId.focus();
    return;
  }
  subjectId = value;
  taskOrder = seededShuffle(TASKS, subjectId);
  currentTaskIndex = 0;
  renderOrderList();
  showSection('overview');
});

elements.beginBattery.addEventListener('click', () => {
  if (!subjectId) {
    elements.subjectId.focus();
    return;
  }
  prepareTask(taskOrder[0]);
});

elements.startPractice.addEventListener('click', () => {
  responseWindowStart = null;
  startPractice();
});

elements.startTest.addEventListener('click', () => {
  startExperiment();
});

elements.choose1.addEventListener('click', () => handleResponse('1'));
elements.choose3.addEventListener('click', () => handleResponse('3'));
elements.downloadCsv.addEventListener('click', downloadCsv);

document.addEventListener('keydown', event => {
  if (event.code === 'Space' && awaitingTestStart) {
    event.preventDefault();
    startExperiment();
  }
});
