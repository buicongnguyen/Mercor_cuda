(function () {
  "use strict";

  const STORAGE_KEY = "mercor.cuda.mock.v1";
  const STATE_VERSION = 1;
  const DURATION_MINUTES = 90;
  const DURATION_MS = DURATION_MINUTES * 60 * 1000;
  const AUTOSAVE_DELAY_MS = 250;

  const TASKS = [
    {
      id: "t1",
      title: "Task 1 · Profiler triage",
      points: 12,
      remediationHref: "gpu-kernel-skills.html#prof",
      remediationLabel: "Review the profiler decision guide",
      reference:
        "The leading hypothesis is inefficient, scattered warp access: 15.2 L1/TEX sectors per request is 3.8 times the ideal 4 sectors for 32 active lanes loading one aligned FP32 value each, while long-scoreboard stalls are consistent with waiting on those accesses. The 81% L2 hit rate says where requests are served, not how much of every fetched sector is useful; 61% occupancy is already plausible latency-hiding capacity, not an objective. Inspect the indexed source line and test a coalesced/reordered index or data layout on identical inputs. Compare runtime, sectors per request, requested versus transferred bytes, and correctness. A contiguous-index microbenchmark that leaves sector count and time unchanged would falsify this hypothesis and redirect the investigation.",
      criteria: [
        { id: "t1-evidence", points: 3, label: "Identifies the most defensible limiting resource from the supplied evidence." },
        { id: "t1-context", points: 3, label: "Explains metric context and avoids treating one headline metric as proof." },
        { id: "t1-experiment", points: 3, label: "Proposes a controlled, falsifiable next experiment or profiler check." },
        { id: "t1-decision", points: 3, label: "Connects the expected result to a concrete optimization decision." }
      ]
    },
    {
      id: "t2",
      title: "Task 2 · Reduction review",
      points: 18,
      remediationHref: "coding-practice.html#q11",
      remediationLabel: "Repeat the CUDA debugging drill",
      criticalCap: 8,
      capReason: "unsafe synchronization, incomplete coverage, or another unresolved correctness fault",
      reference:
        "Repair correctness before tuning. Every thread in a block must encounter each block-wide barrier on the same control-flow path. Predicate out-of-range loads instead of returning before a later __syncthreads(). Accumulate all assigned elements with a bounds-safe or grid-stride loop, reduce within the block with a sound primitive or shared-memory tree, then combine block results with a valid second stage or appropriate atomic. Use an index width that cannot overflow for the allowed input range and test N = 0/1, nonmultiples of the block size, and inputs spanning multiple blocks.",
      criteria: [
        { id: "t2-faults", points: 6, critical: true, label: "Finds the correctness faults that can cause a wrong result, race, or deadlock." },
        { id: "t2-repair", points: 5, label: "Provides a coherent block and grid-level reduction repair." },
        { id: "t2-coverage", points: 4, critical: true, label: "Handles arbitrary lengths, tails, and launch-boundary cases safely." },
        { id: "t2-sequence", points: 3, label: "Separates correctness validation from later performance tuning." }
      ]
    },
    {
      id: "t3",
      title: "Task 3 · Ragged stable softmax",
      points: 32,
      remediationHref: "coding-practice.html#q9",
      remediationLabel: "Review the block-wide softmax pattern",
      criticalCap: 16,
      capReason: "numerical stability, block-wide reduction safety, or tail coverage is missing",
      reference:
        "Assign one 256-thread block to each row. For an empty row, take a block-uniform path that writes zero across the full stride. Otherwise, each thread walks valid columns c = threadIdx.x; c < length; c += blockDim.x, reduces a row maximum m with uniform block synchronization, then reduces expf(x[c] - m). After the sum is available, write expf(x[c] - m) / sum for valid columns and zero for c in [length, stride). Initialize inactive reduction lanes with -infinity or zero as appropriate; never let only a subset of threads encounter a block barrier. Launch rows blocks, treat rows == 0 as a host no-op, check the launch, and validate every requested ragged width against the double-precision oracle and row-sum tolerance.",
      criteria: [
        { id: "t3-stability", points: 8, critical: true, label: "Uses max subtraction, a correct exponential sum, and correct softmax normalization." },
        { id: "t3-reductions", points: 7, critical: true, label: "Implements safe, block-wide max and sum reductions with uniform barriers." },
        { id: "t3-tails", points: 5, critical: true, label: "Handles empty and ragged lengths safely and writes every padding element to zero." },
        { id: "t3-mapping", points: 5, label: "Uses exactly one 256-thread block per row and covers every required output." },
        { id: "t3-memory", points: 4, label: "Uses a coalesced traversal and avoids unnecessary global traffic." },
        { id: "t3-validation", points: 3, label: "Names meaningful numerical and boundary tests with an appropriate tolerance." }
      ]
    },
    {
      id: "t4",
      title: "Task 4 · Fusion regression",
      points: 14,
      remediationHref: "gpu-kernel-skills.html#opt",
      remediationLabel: "Review the optimization and fusion playbook",
      reference:
        "The fused kernel saved a launch and intermediate traffic, but those savings do not guarantee a faster result. If register demand crossed an allocation boundary, reduced active warps, or caused local-memory spills, the longer dependency chain can dominate. Compare per-kernel and end-to-end time, registers per thread, local-memory transactions, achieved occupancy, eligible warps, and memory traffic on identical workloads. Then test a smaller fusion boundary or reduce live ranges; keep fusion only if the end-to-end measurement improves. Occupancy is supporting evidence, not the objective.",
      criteria: [
        { id: "t4-evidence", points: 4, label: "Uses the before/after measurements to explain the regression." },
        { id: "t4-cause", points: 4, label: "Connects register pressure, spills, or dependency length to execution cost." },
        { id: "t4-experiment", points: 3, label: "Suggests a controlled partial-fusion or live-range experiment." },
        { id: "t4-objective", points: 3, label: "Optimizes end-to-end time rather than occupancy or fusion in isolation." }
      ]
    },
    {
      id: "t5",
      title: "Task 5 · Streams and timing repair",
      points: 14,
      remediationHref: "coding-practice.html#q12",
      remediationLabel: "Repeat the stream-pipeline problem",
      criticalCap: 7,
      capReason: "buffer lifetime, cross-stream ordering, or timing coverage remains unsafe",
      reference:
        "Pinned host memory and device buffers must remain valid until every asynchronous operation that uses them has completed. Record an event after each producer, make the consumer or reuse stream wait on the relevant event, and do not recycle a slot until its completion event has fired. For elapsed time across multiple streams, record the start before work is released, join each worker into a timing stream with events, then record and synchronize the stop event after those waits. A stop event recorded in one worker stream does not automatically include independent work in another stream.",
      criteria: [
        { id: "t5-lifetime", points: 4, critical: true, label: "Keeps host and device storage alive until all asynchronous users finish." },
        { id: "t5-ordering", points: 4, critical: true, label: "Repairs producer/consumer and reuse dependencies with explicit ordering." },
        { id: "t5-timing", points: 4, critical: true, label: "Times the complete multi-stream interval with an explicit event join." },
        { id: "t5-sequence", points: 2, label: "Presents an API sequence or timeline that can be implemented unambiguously." }
      ]
    },
    {
      id: "t6",
      title: "Task 6 · Benchmark defense",
      points: 10,
      remediationHref: "gpu-kernel-skills.html#prof",
      remediationLabel: "Review measurement and profiler guidance",
      criticalCap: 5,
      capReason: "the benchmark lacks a credible correctness gate",
      reference:
        "Reject the current 4.1× claim in a concise memo of at most 200 words. Gate every performance result on correctness against an independent oracle across normal, tiny, tail, and adversarial cases. Separate warm-up from measurement, use CUDA events around GPU work, synchronize deliberately, repeat enough times to report a robust statistic and dispersion, and state whether transfers and allocation are included. Fix or report clocks, power mode, device, software versions, shapes, dtypes, launch configuration, and competing work. Compare against a relevant library baseline and decide using end-to-end value across the target architectures, not a single favorable kernel number.",
      criteria: [
        { id: "t6-correctness", points: 3, critical: true, label: "Defines an independent correctness oracle and boundary/adversarial cases." },
        { id: "t6-timing", points: 2, label: "Uses warm-ups, repeated event timing, synchronization, and robust statistics." },
        { id: "t6-controls", points: 2, label: "Controls or reports transfer scope, environment, shapes, and configuration." },
        { id: "t6-decision", points: 2, label: "Defines a production decision rule with a relevant baseline and portability scope." },
        { id: "t6-instructions", points: 1, label: "Follows the instruction to keep the decision memo at or below 200 words." }
      ]
    }
  ];

  let elements;
  let state;
  let storageAvailable = false;
  let autosaveTimer = null;
  let countdownTimer = null;
  const taskScoreElements = new Map();

  function init() {
    elements = collectElements();
    if (!elements) return;

    assertRubricTotals();
    storageAvailable = probeStorage();
    state = loadState();
    bindEvents();
    restoreCandidateControls();

    if (isExpiredAttempt()) {
      finalizeSubmission("expired", false);
      return;
    }

    renderAll();
  }

  function collectElements() {
    const ids = [
      "setup-panel",
      "start-attempt",
      "assessment-shell",
      "candidate-form",
      "timer-value",
      "progress-value",
      "review-value",
      "save-value",
      "storage-warning",
      "review-submit",
      "submit-panel",
      "submit-summary",
      "cancel-submit",
      "submit-final",
      "candidate-view",
      "evaluator-view",
      "evaluator-tasks",
      "score-value",
      "score-band",
      "cap-summary",
      "export-attempt",
      "retake-attempt",
      "reset-panel",
      "cancel-reset",
      "confirm-reset",
      "attempt-summary",
      "word-count-t6"
    ];
    const result = {};
    const missing = [];

    ids.forEach((id) => {
      const element = document.getElementById(id);
      result[toCamelCase(id)] = element;
      if (!element) missing.push(`#${id}`);
    });

    result.modeInputs = Array.from(document.querySelectorAll('input[name="practice-mode"]'));
    result.tasks = Array.from(document.querySelectorAll(".mock-task[data-task-id]"));
    result.reviewSubmitBottom = document.getElementById("review-submit-bottom");

    if (missing.length || !result.modeInputs.length || result.tasks.length !== TASKS.length) {
      console.error(
        "Mock assessment could not start. Missing or unexpected page hooks:",
        missing.concat(result.modeInputs.length ? [] : ['input[name="practice-mode"]'], result.tasks.length === TASKS.length ? [] : ["six .mock-task elements"])
      );
      return null;
    }

    return result;
  }

  function toCamelCase(value) {
    return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  function assertRubricTotals() {
    TASKS.forEach((task) => {
      const total = task.criteria.reduce((sum, criterion) => sum + criterion.points, 0);
      if (total !== task.points) {
        throw new Error(`${task.id} rubric totals ${total}, expected ${task.points}.`);
      }
    });
    const assessmentTotal = TASKS.reduce((sum, task) => sum + task.points, 0);
    if (assessmentTotal !== 100) {
      throw new Error(`Assessment rubric totals ${assessmentTotal}, expected 100.`);
    }
  }

  function createFreshState() {
    return {
      version: STATE_VERSION,
      attemptId: makeAttemptId(),
      status: "setup",
      mode: null,
      durationMinutes: DURATION_MINUTES,
      startedAt: null,
      deadlineAt: null,
      submittedAt: null,
      submittedReason: null,
      answers: {},
      review: {},
      rubric: {},
      evaluatorNotes: {},
      updatedAt: Date.now()
    };
  }

  function makeAttemptId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
    return `attempt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function probeStorage() {
    try {
      const probeKey = `${STORAGE_KEY}.probe`;
      localStorage.setItem(probeKey, "1");
      localStorage.removeItem(probeKey);
      return true;
    } catch (error) {
      showStorageWarning("Local storage is unavailable. This attempt will survive only while this page stays open; export it before leaving.");
      return false;
    }
  }

  function loadState() {
    if (!storageAvailable) return createFreshState();

    try {
      const serialized = localStorage.getItem(STORAGE_KEY);
      if (!serialized) return createFreshState();
      return sanitizeState(JSON.parse(serialized));
    } catch (error) {
      showStorageWarning("The saved attempt could not be read. A fresh in-page attempt has been created; starting it will replace the invalid save.");
      return createFreshState();
    }
  }

  function sanitizeState(saved) {
    if (!saved || saved.version !== STATE_VERSION || typeof saved !== "object") {
      throw new Error("Unsupported saved-state version.");
    }

    const fresh = createFreshState();
    const validTaskIds = new Set(TASKS.map((task) => task.id));
    const validCriterionIds = new Set(TASKS.flatMap((task) => task.criteria.map((criterion) => criterion.id)));
    const status = ["setup", "active", "submitted"].includes(saved.status) ? saved.status : "setup";
    const mode = ["timed", "untimed"].includes(saved.mode) ? saved.mode : null;

    fresh.attemptId = typeof saved.attemptId === "string" && saved.attemptId ? saved.attemptId : fresh.attemptId;
    fresh.status = status === "setup" || mode ? status : "setup";
    fresh.mode = fresh.status === "setup" ? null : mode;
    fresh.startedAt = finiteTimestamp(saved.startedAt);
    fresh.deadlineAt = fresh.mode === "timed" ? finiteTimestamp(saved.deadlineAt) || (fresh.startedAt ? fresh.startedAt + DURATION_MS : null) : null;
    fresh.submittedAt = fresh.status === "submitted" ? finiteTimestamp(saved.submittedAt) || finiteTimestamp(saved.updatedAt) || Date.now() : null;
    fresh.submittedReason = fresh.status === "submitted" && ["manual", "expired"].includes(saved.submittedReason) ? saved.submittedReason : null;
    fresh.updatedAt = finiteTimestamp(saved.updatedAt) || Date.now();

    if (saved.answers && typeof saved.answers === "object") {
      Object.entries(saved.answers).forEach(([key, value]) => {
        if (typeof key === "string" && typeof value === "string") fresh.answers[key] = value;
      });
    }
    if (saved.review && typeof saved.review === "object") {
      Object.entries(saved.review).forEach(([key, value]) => {
        if (validTaskIds.has(key) && typeof value === "boolean") fresh.review[key] = value;
      });
    }
    if (saved.rubric && typeof saved.rubric === "object") {
      Object.entries(saved.rubric).forEach(([key, value]) => {
        if (validCriterionIds.has(key) && typeof value === "boolean") fresh.rubric[key] = value;
      });
    }
    if (saved.evaluatorNotes && typeof saved.evaluatorNotes === "object") {
      Object.entries(saved.evaluatorNotes).forEach(([key, value]) => {
        if (validTaskIds.has(key) && typeof value === "string") fresh.evaluatorNotes[key] = value;
      });
    }

    return fresh;
  }

  function finiteTimestamp(value) {
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function bindEvents() {
    elements.startAttempt.addEventListener("click", startAttempt);
    elements.candidateForm.addEventListener("submit", (event) => event.preventDefault());
    elements.candidateForm.addEventListener("input", handleCandidateInput);
    elements.candidateForm.addEventListener("change", handleCandidateChange);
    elements.reviewSubmit.addEventListener("click", openSubmitReview);
    if (elements.reviewSubmitBottom) elements.reviewSubmitBottom.addEventListener("click", openSubmitReview);
    elements.cancelSubmit.addEventListener("click", closeSubmitReview);
    elements.submitFinal.addEventListener("click", () => finalizeSubmission("manual", true));
    elements.evaluatorTasks.addEventListener("change", handleEvaluatorChange);
    elements.evaluatorTasks.addEventListener("input", handleEvaluatorInput);
    elements.exportAttempt.addEventListener("click", exportAttempt);
    elements.retakeAttempt.addEventListener("click", openResetReview);
    elements.cancelReset.addEventListener("click", closeResetReview);
    elements.confirmReset.addEventListener("click", resetAttempt);

    window.addEventListener("beforeunload", flushAutosave);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushAutosave();
    });
  }

  function startAttempt() {
    if (state.status !== "setup") return;

    const selected = elements.modeInputs.find((input) => input.checked);
    const mode = selected && selected.value === "untimed" ? "untimed" : "timed";
    const now = Date.now();

    state.status = "active";
    state.mode = mode;
    state.startedAt = now;
    state.deadlineAt = mode === "timed" ? now + DURATION_MS : null;
    state.submittedAt = null;
    state.submittedReason = null;
    persistNow();
    renderAll();

    const firstAnswer = elements.candidateForm.querySelector("[data-answer]");
    if (firstAnswer) firstAnswer.focus();
  }

  function handleCandidateInput(event) {
    const input = event.target.closest("[data-answer]");
    if (!input || state.status !== "active") return;

    state.answers[getAnswerKey(input)] = input.value;
    refreshCandidateStatus();
    if (!elements.submitPanel.hidden) updateSubmitSummary();
    scheduleAutosave();
  }

  function handleCandidateChange(event) {
    const checkbox = event.target.closest("[data-review]");
    if (!checkbox || state.status !== "active") return;

    const taskId = getTaskId(checkbox);
    if (!taskId) return;
    state.review[taskId] = checkbox.checked;
    refreshCandidateStatus();
    if (!elements.submitPanel.hidden) updateSubmitSummary();
    scheduleAutosave();
  }

  function getAnswerKey(input) {
    const explicitKey = (input.dataset.answer || "").trim();
    return explicitKey || input.name || input.id || getTaskId(input);
  }

  function getTaskId(element) {
    const task = element.closest(".mock-task[data-task-id]");
    return task ? task.dataset.taskId : "";
  }

  function restoreCandidateControls() {
    elements.candidateForm.querySelectorAll("[data-answer]").forEach((input) => {
      const key = getAnswerKey(input);
      input.value = typeof state.answers[key] === "string" ? state.answers[key] : "";
    });
    elements.candidateForm.querySelectorAll("[data-review]").forEach((checkbox) => {
      checkbox.checked = Boolean(state.review[getTaskId(checkbox)]);
    });
  }

  function syncCandidateStateFromControls() {
    elements.candidateForm.querySelectorAll("[data-answer]").forEach((input) => {
      state.answers[getAnswerKey(input)] = input.value;
    });
    elements.candidateForm.querySelectorAll("[data-review]").forEach((checkbox) => {
      state.review[getTaskId(checkbox)] = checkbox.checked;
    });
  }

  function renderAll() {
    const isSetup = state.status === "setup";
    const isActive = state.status === "active";
    const isSubmitted = state.status === "submitted";

    elements.setupPanel.hidden = !isSetup;
    elements.assessmentShell.hidden = isSetup;
    elements.candidateView.hidden = !isActive;
    elements.evaluatorView.hidden = !isSubmitted;
    elements.submitPanel.hidden = true;
    elements.resetPanel.hidden = true;
    elements.reviewSubmit.disabled = !isActive;
    if (elements.reviewSubmitBottom) elements.reviewSubmitBottom.disabled = !isActive;
    elements.saveValue.textContent = storageAvailable ? (isSetup ? "Ready" : "Saved locally") : "Stored in this tab only";
    setCandidateLocked(!isActive);
    refreshCandidateStatus();
    renderAttemptSummary();

    if (isActive) {
      startCountdown();
    } else {
      stopCountdown();
      renderTimer();
    }

    if (isSubmitted) {
      renderEvaluator();
    } else {
      elements.evaluatorTasks.replaceChildren();
      taskScoreElements.clear();
    }
  }

  function setCandidateLocked(locked) {
    elements.candidateForm.querySelectorAll("input, textarea, select, button").forEach((control) => {
      control.disabled = locked;
    });
  }

  function refreshCandidateStatus() {
    const answered = getAnsweredTaskIds();
    const reviewed = TASKS.filter((task) => Boolean(state.review[task.id])).length;
    elements.progressValue.textContent = `${answered.size} / ${TASKS.length} answered`;
    elements.reviewValue.textContent = `${reviewed} marked for review`;
    const memo = typeof state.answers.t6 === "string" ? state.answers.t6 : "";
    const wordCount = memo.trim() ? memo.trim().split(/\s+/u).length : 0;
    elements.wordCountT6.textContent = `${wordCount} / 200 words`;
    elements.wordCountT6.classList.toggle("word-limit-over", wordCount > 200);
  }

  function getAnsweredTaskIds() {
    const answered = new Set();
    elements.tasks.forEach((taskElement) => {
      const hasAnswer = Array.from(taskElement.querySelectorAll("[data-answer]")).some((input) => {
        const saved = state.answers[getAnswerKey(input)];
        return typeof saved === "string" && saved.trim().length > 0;
      });
      if (hasAnswer) answered.add(taskElement.dataset.taskId);
    });
    return answered;
  }

  function openSubmitReview() {
    if (state.status !== "active") return;
    syncCandidateStateFromControls();
    updateSubmitSummary();
    elements.submitPanel.hidden = false;
    elements.submitFinal.focus();
  }

  function updateSubmitSummary() {
    const answered = getAnsweredTaskIds().size;
    const blank = TASKS.length - answered;
    const reviewed = TASKS.filter((task) => Boolean(state.review[task.id])).length;
    const blankText = blank === 1 ? "1 response is blank" : `${blank} responses are blank`;
    const reviewText = reviewed === 1 ? "1 task is marked for review" : `${reviewed} tasks are marked for review`;
    elements.submitSummary.textContent = `You answered ${answered} of ${TASKS.length} tasks; ${blankText}, and ${reviewText}. Final submission locks candidate answers for this attempt.`;
  }

  function closeSubmitReview() {
    elements.submitPanel.hidden = true;
    elements.reviewSubmit.focus();
  }

  function finalizeSubmission(reason, moveFocus) {
    if (state.status !== "active") return;
    syncCandidateStateFromControls();
    stopCountdown();
    state.status = "submitted";
    state.submittedAt = Date.now();
    state.submittedReason = reason === "expired" ? "expired" : "manual";
    persistNow();
    renderAll();

    if (moveFocus || reason === "expired") {
      elements.evaluatorView.setAttribute("tabindex", "-1");
      elements.evaluatorView.focus();
    }
  }

  function isExpiredAttempt() {
    return state.status === "active" && state.mode === "timed" && Number.isFinite(state.deadlineAt) && Date.now() >= state.deadlineAt;
  }

  function startCountdown() {
    stopCountdown();
    renderTimer();
    if (state.mode !== "timed") return;
    countdownTimer = window.setInterval(() => {
      if (isExpiredAttempt()) {
        finalizeSubmission("expired", false);
      } else {
        renderTimer();
      }
    }, 1000);
  }

  function stopCountdown() {
    if (countdownTimer !== null) {
      window.clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  function renderTimer() {
    elements.timerValue.classList.remove("is-warning", "is-expired");
    elements.timerValue.removeAttribute("datetime");

    if (state.status === "setup") {
      elements.timerValue.textContent = "Not started";
      return;
    }
    if (state.status === "submitted") {
      elements.timerValue.textContent = state.submittedReason === "expired" ? "Time elapsed" : "Submitted";
      if (state.submittedReason === "expired") elements.timerValue.classList.add("is-expired");
      return;
    }
    if (state.mode === "untimed") {
      elements.timerValue.textContent = "Untimed";
      return;
    }

    const remainingMs = Math.max(0, state.deadlineAt - Date.now());
    const remainingSeconds = Math.ceil(remainingMs / 1000);
    const hours = Math.floor(remainingSeconds / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);
    const seconds = remainingSeconds % 60;
    elements.timerValue.textContent = [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
    elements.timerValue.setAttribute("datetime", `PT${remainingSeconds}S`);
    elements.timerValue.classList.toggle("is-warning", remainingSeconds <= 10 * 60);
  }

  function renderAttemptSummary() {
    if (state.status === "setup") {
      elements.attemptSummary.textContent = "No practice attempt is active.";
      return;
    }

    const modeLabel = state.mode === "timed" ? `${DURATION_MINUTES}-minute pressure practice` : "untimed practice";
    const started = formatDateTime(state.startedAt);
    if (state.status === "active") {
      elements.attemptSummary.textContent = `${modeLabel}; started ${started}. Answers are autosaved when local storage is available.`;
      return;
    }

    const reason = state.submittedReason === "expired" ? "automatically submitted when time elapsed" : "submitted by the candidate";
    elements.attemptSummary.textContent = `${modeLabel}; started ${started}; ${reason} ${formatDateTime(state.submittedAt)}. This is an unofficial practice result.`;
  }

  function formatDateTime(timestamp) {
    if (!Number.isFinite(timestamp)) return "at an unknown time";
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp));
  }

  function renderEvaluator() {
    elements.evaluatorTasks.replaceChildren();
    taskScoreElements.clear();

    TASKS.forEach((task) => {
      const card = document.createElement("article");
      card.className = "evaluator-task";
      card.dataset.evaluatorTask = task.id;

      const heading = document.createElement("h3");
      heading.textContent = `${task.title} (${task.points} points)`;
      card.appendChild(heading);

      const responseSection = document.createElement("section");
      responseSection.className = "evaluator-response";
      const responseHeading = document.createElement("h4");
      responseHeading.textContent = "Submitted response";
      const response = document.createElement("pre");
      response.className = "answer-review candidate-response";
      response.textContent = getTaskAnswer(task.id) || "(No response submitted.)";
      responseSection.append(responseHeading, response);
      card.appendChild(responseSection);

      const reference = document.createElement("details");
      reference.className = "reference-answer";
      const referenceSummary = document.createElement("summary");
      referenceSummary.textContent = "Open reference reasoning";
      const referenceText = document.createElement("p");
      referenceText.textContent = task.reference;
      reference.append(referenceSummary, referenceText);
      card.appendChild(reference);

      const rubric = document.createElement("fieldset");
      rubric.className = "evaluator-rubric";
      const legend = document.createElement("legend");
      legend.textContent = "Awarded evidence";
      rubric.appendChild(legend);

      const rubricList = document.createElement("ul");
      rubricList.className = "rubric-list";

      task.criteria.forEach((criterion) => {
        const item = document.createElement("li");
        const label = document.createElement("label");
        label.className = "rubric-item";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.id = `rubric-${criterion.id}`;
        checkbox.dataset.rubricCriterion = criterion.id;
        checkbox.checked = state.rubric[criterion.id] === true;
        const wording = document.createElement("span");
        wording.textContent = criterion.label;
        const points = document.createElement("strong");
        points.textContent = `${criterion.points} pt${criterion.points === 1 ? "" : "s"}`;
        label.append(checkbox, wording, points);
        if (criterion.critical) {
          const critical = document.createElement("em");
          critical.className = "critical-criterion";
          critical.textContent = "critical";
          label.appendChild(critical);
        }
        item.appendChild(label);
        rubricList.appendChild(item);
      });
      rubric.appendChild(rubricList);
      card.appendChild(rubric);

      const taskScore = document.createElement("p");
      taskScore.className = "task-score";
      taskScore.setAttribute("aria-live", "polite");
      taskScoreElements.set(task.id, taskScore);
      card.appendChild(taskScore);

      const noteLabel = document.createElement("label");
      noteLabel.className = "task-label";
      noteLabel.setAttribute("for", `note-${task.id}`);
      const noteHeading = document.createElement("span");
      noteHeading.textContent = "Evaluator notes";
      const note = document.createElement("textarea");
      note.className = "evaluator-note";
      note.id = `note-${task.id}`;
      note.dataset.evaluatorNote = task.id;
      note.rows = 3;
      note.maxLength = 4000;
      note.placeholder = "Record the evidence behind the score and the next drill to practice.";
      note.value = state.evaluatorNotes[task.id] || "";
      noteLabel.append(noteHeading, note);
      card.appendChild(noteLabel);

      const remediation = document.createElement("p");
      remediation.className = "remediation-link";
      const remediationAnchor = document.createElement("a");
      remediationAnchor.href = task.remediationHref;
      remediationAnchor.textContent = task.remediationLabel;
      remediation.append("Next practice: ", remediationAnchor);
      card.appendChild(remediation);

      elements.evaluatorTasks.appendChild(card);
    });

    updateScoreDisplay();
  }

  function getTaskAnswer(taskId) {
    const taskElement = elements.tasks.find((task) => task.dataset.taskId === taskId);
    if (!taskElement) return "";
    return Array.from(taskElement.querySelectorAll("[data-answer]"))
      .map((input) => state.answers[getAnswerKey(input)] || "")
      .filter((answer) => answer.trim())
      .join("\n\n");
  }

  function handleEvaluatorChange(event) {
    const checkbox = event.target.closest("[data-rubric-criterion]");
    if (!checkbox || state.status !== "submitted") return;
    state.rubric[checkbox.dataset.rubricCriterion] = checkbox.checked;
    updateScoreDisplay();
    scheduleAutosave();
  }

  function handleEvaluatorInput(event) {
    const note = event.target.closest("[data-evaluator-note]");
    if (!note || state.status !== "submitted") return;
    state.evaluatorNotes[note.dataset.evaluatorNote] = note.value;
    scheduleAutosave();
  }

  function calculateScore() {
    const tasks = TASKS.map((task) => {
      const raw = task.criteria.reduce((sum, criterion) => sum + (state.rubric[criterion.id] === true ? criterion.points : 0), 0);
      const touched = task.criteria.some((criterion) => Object.prototype.hasOwnProperty.call(state.rubric, criterion.id));
      const missingCritical = task.criteria.filter((criterion) => criterion.critical && state.rubric[criterion.id] !== true);
      const capApplied = touched && missingCritical.length > 0 && Number.isFinite(task.criticalCap);
      const awarded = capApplied ? Math.min(raw, task.criticalCap) : raw;
      return {
        id: task.id,
        title: task.title,
        points: task.points,
        raw,
        awarded,
        touched,
        capApplied,
        cap: task.criticalCap || null,
        capReason: task.capReason || null,
        missingCritical: missingCritical.map((criterion) => criterion.id)
      };
    });

    return {
      total: tasks.reduce((sum, task) => sum + task.awarded, 0),
      maximum: 100,
      touched: tasks.some((task) => task.touched),
      tasks
    };
  }

  function updateScoreDisplay() {
    const score = calculateScore();
    elements.scoreValue.textContent = `${score.total} / ${score.maximum}`;
    elements.scoreBand.textContent = getUnofficialBand(score);
    const activeCaps = score.tasks.filter((result) => result.capApplied);
    elements.capSummary.textContent = activeCaps.length === 0
      ? "No active critical caps"
      : `${activeCaps.length} active critical cap${activeCaps.length === 1 ? "" : "s"}`;

    score.tasks.forEach((result) => {
      const taskScore = taskScoreElements.get(result.id);
      if (taskScore) {
        taskScore.classList.toggle("critical-cap", result.capApplied);
        taskScore.textContent = result.capApplied
          ? `Awarded ${result.awarded}/${result.points}. Critical cap ${result.cap}/${result.points} is active because ${result.capReason}.`
          : `Awarded ${result.awarded}/${result.points}.`;
      }
    });
  }

  function getUnofficialBand(score) {
    if (!score.touched) return "Unofficial practice band: not scored yet.";
    const hasCriticalCap = score.tasks.some((task) => task.capApplied);
    if (score.total >= 90 && !hasCriticalCap) return "Unofficial practice band: assessment-ready performance.";
    if (score.total >= 75) return "Unofficial practice band: strong, with targeted gaps to close.";
    if (score.total >= 60) return "Unofficial practice band: developing; repeat the weakest task families.";
    return "Unofficial practice band: foundation-building; revisit correctness and measurement first.";
  }

  function scheduleAutosave() {
    state.updatedAt = Date.now();
    if (!storageAvailable) {
      elements.saveValue.textContent = "Stored in this tab only";
      return;
    }

    elements.saveValue.textContent = "Saving…";
    if (autosaveTimer !== null) window.clearTimeout(autosaveTimer);
    autosaveTimer = window.setTimeout(() => {
      autosaveTimer = null;
      persistNow();
    }, AUTOSAVE_DELAY_MS);
  }

  function flushAutosave() {
    if (autosaveTimer !== null) {
      window.clearTimeout(autosaveTimer);
      autosaveTimer = null;
      persistNow();
    }
  }

  function persistNow() {
    state.updatedAt = Date.now();
    if (!storageAvailable) {
      elements.saveValue.textContent = "Stored in this tab only";
      return false;
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      elements.saveValue.textContent = "Saved locally";
      return true;
    } catch (error) {
      storageAvailable = false;
      elements.saveValue.textContent = "Stored in this tab only";
      showStorageWarning("Autosave stopped because local storage is unavailable. Export this attempt before leaving the page.");
      return false;
    }
  }

  function showStorageWarning(message) {
    const warning = document.getElementById("storage-warning");
    if (!warning) return;
    warning.hidden = false;
    warning.textContent = message;
  }

  function exportAttempt() {
    if (state.status !== "submitted") return;
    flushAutosave();
    const score = calculateScore();
    const exportData = {
      schemaVersion: STATE_VERSION,
      exportedAt: new Date().toISOString(),
      disclaimer: "Unofficial Mercor-focused CUDA practice simulation. Original training material; not an official assessment or pass prediction.",
      attempt: {
        id: state.attemptId,
        mode: state.mode,
        durationMinutes: state.mode === "timed" ? DURATION_MINUTES : null,
        startedAt: toIso(state.startedAt),
        submittedAt: toIso(state.submittedAt),
        submittedReason: state.submittedReason,
        answers: { ...state.answers },
        markedForReview: { ...state.review }
      },
      evaluation: {
        rubric: { ...state.rubric },
        notes: { ...state.evaluatorNotes },
        score
      }
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const shortId = state.attemptId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 16) || "attempt";
    link.href = url;
    link.download = `mercor-cuda-mock-${shortId}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function toIso(timestamp) {
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
  }

  function openResetReview() {
    elements.resetPanel.hidden = false;
    elements.confirmReset.focus();
  }

  function closeResetReview() {
    elements.resetPanel.hidden = true;
    elements.retakeAttempt.focus();
  }

  function resetAttempt() {
    stopCountdown();
    if (autosaveTimer !== null) {
      window.clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }
    if (storageAvailable) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (error) {
        storageAvailable = false;
        showStorageWarning("The saved attempt could not be removed from local storage, but a fresh in-page attempt has been started.");
      }
    }

    state = createFreshState();
    elements.candidateForm.reset();
    elements.modeInputs.forEach((input) => {
      input.checked = input.value === "timed";
    });
    restoreCandidateControls();
    renderAll();
    elements.startAttempt.focus();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
