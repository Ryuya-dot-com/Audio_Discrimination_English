const config = {
  startingStep: 51,
  maxTrials: 75,
  numSteps: 101,
  targetReversals: 7,
  interStimulusDelay: 500, // ms
  postSequenceDelay: 500,  // ms before showing buttons
  postResponseDelay: 1000, // ms before next trial
  stepSizes: [10, 5, 2, 1, 1, 1, 1, 1]
};

const practiceConfig = {
  trials: 5,
  baseStep: 1,
  differentStep: 100
};

const DISPLAY_LABEL = 'Listening Task 1';

const elements = {
  setup: document.getElementById('setup'),
  instructions: document.getElementById('instructions'),
  trial: document.getElementById('trial'),
  complete: document.getElementById('complete'),
  toInstructions: document.getElementById('toInstructions'),
  startPractice: document.getElementById('startPractice'),
  startTest: document.getElementById('startTest'),
  downloadCsv: document.getElementById('downloadCsv'),
  choose1: document.getElementById('choose1'),
  choose3: document.getElementById('choose3'),
  playbackStatus: document.getElementById('playbackStatus'),
  thresholdText: document.getElementById('thresholdText'),
  practiceStatus: document.getElementById('practiceStatus'),
  sessionTag: document.getElementById('sessionTag'),
  trialHeading: document.getElementById('trialHeading'),
  trialPrompt: document.getElementById('trialPrompt'),
  feedback: document.getElementById('feedback'),
  subjectId: document.getElementById('subjectId')
};

let subjectId = '';
let stimOrder = [];
let responseWindowStart = null;
let trialState = {};
const results = [];
let warmupPromise = null;
let awaitingTestStart = false;

const audioPool = initAudioPool(config.numSteps);
const baseAudioA = createAudio('Stimuli/1.flac');
const baseAudioB = createAudio('Stimuli/1.flac');

const state = {
  currentStep: config.startingStep,
  currentTrial: 0,
  numReversals: 0,
  lastCorrect: -1,
  numCorrect: 0,
  reversalsSum: 0
};

const practiceState = {
  currentTrial: 0,
  order: [],
  completed: false
};

function initAudioPool(numSteps) {
  const pool = [null];
  for (let i = 1; i <= numSteps; i++) {
    pool.push(createAudio(`Stimuli/${i}.flac`));
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

function warmUpAudio() {
  const stepsToWarm = new Set([1, config.startingStep, practiceConfig.baseStep, practiceConfig.differentStep]);
  const targets = new Set([baseAudioA, baseAudioB]);
  stepsToWarm.forEach(step => {
    const audio = audioPool[step];
    if (audio) targets.add(audio);
  });
  return Promise.all(Array.from(targets).map(a => waitForAudioReady(a).catch(() => {})));
}

function showSection(section) {
  [elements.setup, elements.instructions, elements.trial, elements.complete].forEach(el => el.classList.remove('active'));
  elements[section].classList.add('active');
}

function setSessionUi(mode) {
  if (mode === 'practice') {
    elements.sessionTag.textContent = `${DISPLAY_LABEL} | Practice`;
    elements.trialHeading.textContent = `${DISPLAY_LABEL} - Practice`;
    elements.trialPrompt.textContent = 'The different sound is obvious. Choose 1 or 3.';
  } else {
    elements.sessionTag.textContent = `${DISPLAY_LABEL} | Main`;
    elements.trialHeading.textContent = `${DISPLAY_LABEL} - Main`;
    elements.trialPrompt.textContent = 'Which sound is different? (1 or 3)';
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

function resetPracticeProgress() {
  practiceState.currentTrial = 0;
  practiceState.order = [];
  practiceState.completed = false;
  elements.startTest.disabled = true;
  elements.startTest.textContent = 'Start main run after practice (Space also works)';
  elements.startPractice.disabled = true;
  elements.startPractice.textContent = 'Start practice';
  elements.practiceStatus.textContent = 'Complete 5 practice trials, then start the main run via Space or the button.';
  awaitingTestStart = false;
  warmupPromise = warmUpAudio();
  warmupPromise.finally(() => {
    elements.startPractice.disabled = false;
    if (!practiceState.completed) {
      elements.practiceStatus.textContent = 'Complete 5 practice trials, then start the main run via Space or the button.';
    }
  });
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
  if (!audio) return true;
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

async function startExperiment() {
  if (!practiceState.completed) {
    elements.practiceStatus.textContent = 'Please finish practice before starting the main run.';
    return;
  }
  if (!awaitingTestStart) return;
  if (warmupPromise) {
    await warmupPromise;
  }
  awaitingTestStart = false;
  elements.startTest.disabled = true;
  elements.startTest.textContent = 'Preparing main run...';
  elements.practiceStatus.textContent = 'Preparing main run...';
  state.currentStep = config.startingStep;
  state.currentTrial = 0;
  state.numReversals = 0;
  state.lastCorrect = -1;
  state.numCorrect = 0;
  state.reversalsSum = 0;
  results.length = 0;
  stimOrder = buildStimOrder();
  setSessionUi('test');
  clearFeedback();
  showSection('trial');
  runTrial();
}

function startPractice() {
  practiceState.currentTrial = 0;
  practiceState.order = buildPracticeOrder(practiceConfig.trials);
  practiceState.completed = false;
  elements.startTest.disabled = true;
  awaitingTestStart = false;
  elements.practiceStatus.textContent = `Practice ${practiceConfig.trials} trials total. After playback, choose 1 or 3.`;
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
  elements.playbackStatus.textContent = `Practice ${trialIndex + 1}/${practiceConfig.trials}: Playing audio...`;

  const differentAudio = audioPool[practiceConfig.differentStep];
  const first = oddIsThird ? baseAudioA : differentAudio;
  const second = baseAudioB;
  const third = oddIsThird ? differentAudio : baseAudioB;
  trialState = { correctAnswer, trialStep: practiceConfig.differentStep, oddPosition: oddIsThird ? 3 : 1, mode: 'practice' };

  const hadError = await playSequence(first, second, third);
  if (hadError) {
    elements.playbackStatus.textContent = 'Audio load error. Check files/network and reload.';
    return;
  }
  responseWindowStart = performance.now();
  elements.playbackStatus.textContent = `Practice ${trialIndex + 1}/${practiceConfig.trials}: Choose 1 or 3.`;
  toggleResponseButtons(true);
}

function nextTrial() {
  if (state.currentTrial === config.maxTrials || state.numReversals === config.targetReversals) {
    return conclude();
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
  elements.playbackStatus.textContent = 'Playing audio...';

  const stepAudio = audioPool[trialStep];
  const first = oddIsThird ? baseAudioA : stepAudio;
  const second = oddIsThird ? baseAudioB : baseAudioA;
  const third = oddIsThird ? stepAudio : baseAudioB;
  trialState = { correctAnswer, trialStep, oddPosition: oddIsThird ? 3 : 1, mode: 'test' };

  const hadError = await playSequence(first, second, third);
  if (hadError) {
    elements.playbackStatus.textContent = 'Audio load error. Check files/network and reload.';
    return;
  }
  responseWindowStart = performance.now();
  elements.playbackStatus.textContent = 'Choose 1 or 3.';
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
      elements.practiceStatus.textContent = 'Practice complete. Press Space or use the button to start the main run.';
      elements.startTest.disabled = false;
      elements.startTest.textContent = 'Start main run (Space also works)';
      elements.startPractice.disabled = true;
      elements.startPractice.textContent = 'Practice completed';
      setTimeout(() => {
        elements.playbackStatus.textContent = 'Press Space or use the button to start the main run.';
        clearFeedback();
        showSection('instructions');
      }, config.postResponseDelay);
    } else {
      setTimeout(runPracticeTrial, config.postResponseDelay);
    }
    return;
  }

  elements.playbackStatus.textContent = 'Preparing next trial...';
  clearFeedback();
  const prevStep = state.currentStep;

  const stepSizeUsed = applyStaircase(wasCorrect);
  const meanReversal = state.numReversals > 1 ? state.reversalsSum / (state.numReversals - 1) : '';

  results.push({
    subject_id: subjectId,
    trial: state.currentTrial + 1,
    stimulus_step: prevStep,
    odd_position: trialState.oddPosition,
    correct_answer: trialState.correctAnswer,
    response: choice,
    correct: wasCorrect ? 1 : 0,
    rt_ms: rtMs,
    num_reversals_after: state.numReversals,
    step_before: prevStep,
    step_after: state.currentStep,
    step_size_used: stepSizeUsed,
    mean_reversal_so_far: meanReversal
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
  return stepSizeUsed;
}

function conclude() {
  const threshold = state.numReversals > 1 ? state.reversalsSum / (state.numReversals - 1) : null;
  elements.thresholdText.textContent = threshold !== null
    ? `Estimated threshold (reversal mean): ${threshold.toFixed(2)}`
    : 'Threshold could not be computed (insufficient reversals).';
  downloadCsv();
  showSection('complete');
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
  const header = ['subject_id', 'trial', 'stimulus_step', 'odd_position', 'correct_answer', 'response', 'correct', 'rt_ms', 'num_reversals_after', 'step_before', 'step_after', 'step_size_used', 'mean_reversal_so_far'];
  const lines = [header.join(',')];
  results.forEach(row => {
    const line = header.map(key => csvEscape(row[key])).join(',');
    lines.push(line);
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const filenameId = subjectId ? subjectId : 'subject';
  a.download = `${filenameId}_pitch_discrimination.csv`;
  a.click();
}

elements.toInstructions.addEventListener('click', () => {
  const value = elements.subjectId.value.trim();
  if (!value) {
    elements.subjectId.focus();
    return;
  }
  subjectId = value;
  resetPracticeProgress();
  showSection('instructions');
});

elements.startPractice.addEventListener('click', () => {
  responseWindowStart = null;
  startPractice();
});

elements.startTest.addEventListener('click', () => {
  if (!practiceState.completed) {
    elements.practiceStatus.textContent = 'Please finish practice before starting the main run.';
    return;
  }
  startExperiment();
});

elements.choose1.addEventListener('click', () => handleResponse('1'));
elements.choose3.addEventListener('click', () => handleResponse('3'));
elements.downloadCsv.addEventListener('click', downloadCsv);

resetPracticeProgress();

document.addEventListener('keydown', event => {
  if (event.code === 'Space' && awaitingTestStart) {
    event.preventDefault();
    startExperiment();
  }
});
