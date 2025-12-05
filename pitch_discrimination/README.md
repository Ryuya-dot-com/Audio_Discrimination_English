# Listening Task 1 (Pitch Discrimination) — Single Task

This is the stand‑alone pitch discrimination task. The participant UI shows the dummy label “Listening Task 1”; this README documents the actual task and parameters for researchers.

## Flow
- Practice: 5 trials using stimuli 1 and 100, with correctness feedback.
- After practice: start the main run via Space or the “Start main run” button (practice button disabled).
- Main run: up to 75 trials or 7 reversals; no feedback, no progress indicator.
- Threshold: reversal mean shown on screen; CSV downloads automatically.

## Required file layout
```
pitch_discrimination/
  ├ Stimuli/1.flac ... Stimuli/101.flac
  ├ index.html
  └ pitch_discrimination.js
```

## How to run
1. Open `index.html` in a browser.
2. Enter participant ID, go to instructions, then start practice.
3. After 5 practice trials, press Space or the button to start the main run.
4. A CSV downloads automatically when finished (filename: `<ID>_pitch_discrimination.csv`).

## CSV columns
- `subject_id`, `trial`, `stimulus_step`, `odd_position`, `correct_answer`, `response`, `correct`, `rt_ms`
- `num_reversals_after`, `step_before`, `step_after`, `step_size_used`, `mean_reversal_so_far`

## Parameters
- Main run: max 75 trials / stop at 7 reversals
- Practice: 5 trials (stim 1 vs 100), manual start of main run (Space/button)
- ISI: 500 ms / post-sequence: 500 ms / post-response: 1000 ms
- Step sizes: [10, 5, 2, 1, 1, 1, 1, 1] (staircase)
