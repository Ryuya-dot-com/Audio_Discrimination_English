# Audio Discrimination Battery (Integrated)

Integrated version for running four discrimination tasks back-to-back on one page. To avoid revealing details to participants, the UI shows dummy labels (Listening Task 1–4) while the CSV preserves the actual task names. Task order is deterministically shuffled based on the participant ID.

## Dummy code mapping (for researchers)
- Listening Task 1: Pitch discrimination
- Listening Task 2: Formant discrimination
- Listening Task 3: Duration discrimination
- Listening Task 4: Rise time discrimination
- The mappings and stimulus settings are not shown to participants.

## Required files and placement
- Place this folder `audio_discrimination` alongside each task folder at the same level. Example:  
  ```
  .../Discrimination/
    ├ audio_discrimination/
    ├ duration_discrimination/
    ├ formant_discrimination/
    ├ pitch_discrimination/
    └ risetime_discrimination/
  ```
- Use each task's `Stimuli/1.flac` through `Stimuli/101.flac` as-is. Do not rename files or change paths.

## How to use
1. Open `audio_discrimination/index.html` in a browser (local or GitHub Pages both work).
2. Enter the participant ID and click "Set order and continue" to fix the order for this run.  
   - The same ID yields the same order; a different ID produces a new order.
3. Follow the on-screen flow: run Practice (5 trials using stimuli 1 and 100 with feedback), then start the main task with Space or the button (main task has no feedback/progress display).
4. After all four tasks finish, click "Download results" to obtain the CSV of all trials.

## Data output
- File name: `<participant-id>_audio_discrimination.csv`
- Key columns:  
  - `subject_id` / `task_id` / `task_label` / `task_order`  
  - `trial`, `stimulus_step`, `odd_position`, `correct_answer`, `response`, `correct`, `rt_ms`  
  - `num_reversals_after`, `step_before`, `step_after`, `step_size_used`, `mean_reversal_so_far`, `threshold_estimate`
- When a task ends, its threshold (mean of reversals) is shown on-screen and added to the summary.
  - The CSV `task_label` keeps the actual task name (e.g., Pitch discrimination) while the UI shows only the dummy label.

## Parameter highlights
- Main trials: up to 75 trials or stop after 7 reversals
- Practice trials: 5 trials using stimuli 1 and 100 (Space/button to start main after practice)
- Feedback: shown only during practice
- Progress indicator: shown only during practice
- Timing: inter-stimulus 500 ms / post-sequence 500 ms / post-response 1000 ms

## Notes
- Changing folder names or stimulus paths will break playback. Deploy without altering the structure.
- Results live in browser memory; closing the page clears them. Download the CSV when you finish.
