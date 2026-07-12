import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillsPath = path.join(root, "docs", "gpu-kernel-skills.html");
const codingPath = path.join(root, "docs", "coding-practice.html");
const indexPath = path.join(root, "docs", "index.html");
const mockPath = path.join(root, "docs", "mock-assessment.html");
const mockScriptPath = path.join(root, "docs", "mock-assessment.js");

const skillsHtml = fs.readFileSync(skillsPath, "utf8");
const codingHtml = fs.readFileSync(codingPath, "utf8");
const indexHtml = fs.readFileSync(indexPath, "utf8");
const mockHtml = fs.readFileSync(mockPath, "utf8");
const mockScript = fs.readFileSync(mockScriptPath, "utf8");
const errors = [];

function check(condition, message) {
  if (!condition) errors.push(message);
}

function plainText(html) {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:#\d+|#x[\da-f]+|[a-z][a-z0-9]+);/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeQuestion(value) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:amp|lt|gt|quot|#39);/gi, " ")
    .replace(/[^\p{L}\p{N}+#]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function parseHttpsUrl(value, where) {
  if (typeof value !== "string" || !value || value !== value.trim() || /\s/.test(value)) {
    errors.push(`${where} must be a non-empty, trimmed HTTPS URL without whitespace.`);
    return null;
  }

  try {
    const url = new URL(value);
    check(url.protocol === "https:", `${where} must use HTTPS.`);
    check(Boolean(url.hostname), `${where} must include a hostname.`);
    check(!url.username && !url.password, `${where} must not contain credentials.`);
    return url.protocol === "https:" && url.hostname ? url.href : null;
  } catch {
    errors.push(`${where} is not a valid absolute URL: ${JSON.stringify(value)}.`);
    return null;
  }
}

function validateCountClaims(html, file, pattern, actual, minimumClaims, label) {
  const matches = [...html.matchAll(pattern)];
  check(matches.length >= minimumClaims, `${file} must contain at least ${minimumClaims} numeric ${label} count claim(s); found ${matches.length}.`);
  for (const match of matches) {
    check(Number(match[1]) === actual, `${file} has stale ${label} count ${match[1]}; actual count is ${actual}.`);
  }
}

const dataMatch = skillsHtml.match(/const quizData = ([\s\S]*?);\s*\n\s*const state =/);
check(dataMatch, "Could not locate the inline quizData object.");

let quizData = {};
if (dataMatch) {
  try {
    quizData = vm.runInNewContext(`(${dataMatch[1]})`, Object.create(null), { timeout: 1000 });
  } catch (error) {
    errors.push(`quizData is not valid JavaScript: ${error.message}`);
  }
}

const expectedSections = ["arch", "mem", "prof", "opt", "cpp", "port", "case"];
const dataSections = Object.keys(quizData);
const mountedSections = [...skillsHtml.matchAll(/<div class="quiz" data-section="([^"]+)"><\/div>/g)].map(match => match[1]);
check(JSON.stringify(dataSections) === JSON.stringify(expectedSections), `quizData sections must be ${expectedSections.join(", ")}; found ${dataSections.join(", ")}.`);
check(JSON.stringify(mountedSections) === JSON.stringify(expectedSections), `Quiz mounts must be ${expectedSections.join(", ")}; found ${mountedSections.join(", ")}.`);

const allowedTypes = new Set(["single", "blank", "multi", "order"]);
const allowedQuestionKeys = new Set(["type", "q", "pre", "options", "steps", "explain", "sources"]);
const seenQuestions = new Set();
const questionCatalog = [];
let quizCount = 0;

for (const [section, questions] of Object.entries(quizData)) {
  check(Array.isArray(questions) && questions.length > 0, `${section} must contain at least one question.`);
  if (!Array.isArray(questions)) continue;
  let sourcedCount = 0;

  questions.forEach((question, index) => {
    quizCount += 1;
    const where = `${section}[${index}]`;
    if (!question || typeof question !== "object" || Array.isArray(question)) {
      errors.push(`${where} must be a question object.`);
      return;
    }

    const unknownKeys = Object.keys(question).filter(key => !allowedQuestionKeys.has(key));
    check(!unknownKeys.length, `${where} has unknown field(s): ${unknownKeys.join(", ")}.`);
    const type = question.type ?? "single";
    check(allowedTypes.has(type), `${where} has unsupported type ${JSON.stringify(type)}.`);
    check(typeof question.q === "string" && question.q.trim(), `${where} needs a non-empty q string.`);
    check(typeof question.explain === "string" && question.explain.trim(), `${where} needs a non-empty explain string.`);
    if (typeof question.q === "string" && question.q.trim()) {
      const normalized = normalizeQuestion(question.q);
      check(!seenQuestions.has(normalized), `${where} duplicates another question after normalization: ${question.q}`);
      seenQuestions.add(normalized);
      questionCatalog.push({ where, text: question.q, normalized });
    }

    if (type === "order") {
      check(Array.isArray(question.steps) && question.steps.length >= 2, `${where} needs at least two ordered steps.`);
      if (Array.isArray(question.steps)) {
        check(new Set(question.steps).size === question.steps.length, `${where} has duplicate ordering steps.`);
      }
    } else {
      check(Array.isArray(question.options) && question.options.length >= 2, `${where} needs at least two options.`);
      if (Array.isArray(question.options)) {
        const labels = question.options.map(option => option?.[0]);
        const correct = question.options.filter(option => option?.[1] === true).length;
        const incorrect = question.options.filter(option => option?.[1] === false).length;
        check(question.options.every(option => Array.isArray(option) && option.length === 2 && typeof option[0] === "string" && typeof option[1] === "boolean"), `${where} options must be [string, boolean] pairs.`);
        check(new Set(labels).size === labels.length, `${where} has duplicate option labels.`);
        check(type === "multi" ? correct >= 2 : correct === 1, `${where} has ${correct} correct options; ${type} requires ${type === "multi" ? "at least two" : "exactly one"}.`);
        check(incorrect >= 1, `${where} needs at least one incorrect option.`);
      }
    }

    if (question.sources !== undefined) {
      check(Array.isArray(question.sources) && question.sources.length > 0, `${where} sources must be a non-empty array.`);
      if (Array.isArray(question.sources)) {
        if (question.sources.length) sourcedCount += 1;
        const sourceUrls = new Set();
        for (let sourceIndex = 0; sourceIndex < question.sources.length; sourceIndex += 1) {
          const source = question.sources[sourceIndex];
          const sourceWhere = `${where}.sources[${sourceIndex}]`;
          if (!source || typeof source !== "object" || Array.isArray(source)) {
            errors.push(`${sourceWhere} must be a { label, url } object.`);
            continue;
          }

          const keys = Object.keys(source);
          check(keys.length === 2 && keys.includes("label") && keys.includes("url"), `${sourceWhere} must contain exactly label and url.`);
          check(typeof source.label === "string" && source.label === source.label.trim() && source.label.length >= 4, `${sourceWhere}.label must be a meaningful trimmed string.`);
          const canonicalUrl = parseHttpsUrl(source.url, `${sourceWhere}.url`);
          if (canonicalUrl) {
            check(!sourceUrls.has(canonicalUrl), `${sourceWhere} duplicates another source URL.`);
            sourceUrls.add(canonicalUrl);
          }
        }
      }
    }
  });
  check(sourcedCount >= 2, `${section} needs at least two questions with primary or authoritative sources; found ${sourcedCount}.`);
}

const stopWords = new Set("a an and are as at be by can does for from how in into is it of on or that the this to what when which why with you your".split(" "));

function wordSet(text) {
  return new Set(normalizeQuestion(text).split(" ").filter(word => word.length > 1 && !stopWords.has(word)));
}

function jaccard(left, right) {
  let overlap = 0;
  for (const word of left) if (right.has(word)) overlap += 1;
  return overlap / (left.size + right.size - overlap);
}

for (let i = 0; i < questionCatalog.length; i += 1) {
  for (let j = i + 1; j < questionCatalog.length; j += 1) {
    const left = wordSet(questionCatalog[i].text);
    const right = wordSet(questionCatalog[j].text);
    if (Math.min(left.size, right.size) < 8) continue;
    const similarity = jaccard(left, right);
    check(similarity < 0.72, `${questionCatalog[i].where} and ${questionCatalog[j].where} look near-duplicate (${similarity.toFixed(2)} token similarity).`);
  }
}

const codingProblems = [...codingHtml.matchAll(/<article class="prob" id="q(\d+)">([\s\S]*?)<\/article>/g)];
const problemOpenCount = [...codingHtml.matchAll(/<article\b[^>]*class=(["'])[^"']*\bprob\b[^"']*\1[^>]*>/gi)].length;
check(problemOpenCount === codingProblems.length, `Found ${problemOpenCount} .prob article openings but parsed only ${codingProblems.length}; check malformed IDs, attributes, or closing tags.`);
check(codingHtml.includes('<p class="accept"><strong>Interview contract:</strong>'), "Coding page needs the global Interview contract.");

const productionStart = codingHtml.indexOf('<section id="production"');
const resourcesStart = codingHtml.indexOf('<section id="resources"');

codingProblems.forEach((match, index) => {
  const number = Number(match[1]);
  const body = match[2];
  const heading = body.match(/<div class="prob-head">\s*<h3>\s*(\d+)\./);
  const tests = body.match(/<p class="tests">\s*<strong>Tests:<\/strong>([\s\S]*?)<\/p>/);
  const prompt = body.match(/<p class="tests">[\s\S]*?<\/p>\s*<p>([\s\S]*?)<\/p>/);
  const acceptance = body.match(/<p class="accept">\s*<strong>Acceptance tests:<\/strong>([\s\S]*?)<\/p>/);
  const solution = body.match(/<details class="sol">([\s\S]*?)<\/details>/);

  check(number === index + 1, `Coding problem IDs must be sequential; expected q${index + 1}, found q${number}.`);
  check(Number(heading?.[1]) === number, `Coding q${number} heading number must match its ID.`);
  check(tests && plainText(tests[1]).length >= 30, `Coding q${number} needs a substantive Tests paragraph.`);
  check(prompt && plainText(prompt[1]).length >= 100, `Coding q${number} needs a substantive task/constraint prompt.`);

  const acceptanceText = acceptance ? plainText(acceptance[1]) : "";
  check(acceptanceText.length >= 80, `Coding q${number} needs substantive Acceptance tests.`);
  check((acceptanceText.match(/;/g) ?? []).length >= 2, `Coding q${number} Acceptance tests need multiple explicit cases.`);
  check(/\b(?:compare|exact|reference|require|sanitizer|canar\w*|finite|sum|error|unchanged)\b/i.test(acceptanceText), `Coding q${number} Acceptance tests need a correctness oracle.`);
  check(/\b(?:empty|tiny|tail|zero|none|all)\b|\b[01]\b|[{}]/i.test(acceptanceText), `Coding q${number} Acceptance tests need an edge-shape case.`);

  check(solution, `Coding q${number} needs a collapsible solution.`);
  if (solution) {
    check(/<summary>[\s\S]+?<\/summary>/.test(solution[1]), `Coding q${number} solution needs a non-empty summary.`);
    check(/<div class="sol-body">[\s\S]+?<\/div>/.test(solution[1]), `Coding q${number} solution needs a sol-body.`);
    check(/<pre class="code">[\s\S]+?<\/pre>/.test(solution[1]), `Coding q${number} solution needs a code block.`);
    check((solution[1].match(/<li>/g) ?? []).length >= 2, `Coding q${number} solution needs at least two discussion points.`);
  }

  const isProduction = match.index > productionStart && match.index < resourcesStart;
  if (isProduction) {
    check(/<strong>Reference:<\/strong>\s*<a\b[^>]*href=["']https:\/\//i.test(body), `Production coding q${number} needs an HTTPS reference.`);
  }
});

const mockTasks = [...mockHtml.matchAll(/<article class="mock-task" id="task-(\d+)" data-task-id="(t\d+)" data-points="(\d+)" data-minutes="(\d+)">([\s\S]*?)<\/article>/g)];
check(mockTasks.length === 6, `Mock assessment must contain exactly 6 tasks; found ${mockTasks.length}.`);
let mockPointTotal = 0;
let mockMinuteTotal = 0;

mockTasks.forEach((match, index) => {
  const taskNumber = Number(match[1]);
  const taskId = match[2];
  const points = Number(match[3]);
  const minutes = Number(match[4]);
  const body = match[5];
  mockPointTotal += points;
  mockMinuteTotal += minutes;

  check(taskNumber === index + 1, `Mock task order must be sequential; expected task-${index + 1}, found task-${taskNumber}.`);
  check(taskId === `t${taskNumber}`, `Mock task-${taskNumber} must use data-task-id="t${taskNumber}".`);
  check(/<div class="prompt-block">[\s\S]+?<\/div>/.test(body), `Mock ${taskId} needs a prompt block.`);
  check(/<div class="acceptance">[\s\S]*?<strong>(?:Deliverable|Acceptance criteria)/.test(body), `Mock ${taskId} needs explicit deliverable or acceptance criteria.`);
  check(new RegExp(`<textarea[^>]+data-answer="${taskId}"`).test(body), `Mock ${taskId} needs a matching candidate answer control.`);
  check(new RegExp(`<input[^>]+data-review="${taskId}"`).test(body), `Mock ${taskId} needs a matching review flag.`);
  check(/<a class="remediation-link" href="(?:gpu-kernel-skills|coding-practice)\.html#[^"]+">/.test(body), `Mock ${taskId} needs a local remediation link.`);
  check(points > 0 && minutes > 0, `Mock ${taskId} points and minutes must be positive.`);
});

check(mockPointTotal === 100, `Mock assessment points must total 100; found ${mockPointTotal}.`);
check(mockMinuteTotal === 90, `Mock assessment suggested minutes must total 90; found ${mockMinuteTotal}.`);
check(mockHtml.includes("It is not an official, copied, or verified Mercor assessment format."), "Mock assessment needs the prominent unofficial-format disclaimer.");
check(mockHtml.includes("training target, not a claimed Mercor time limit"), "Mock assessment must distinguish its practice timer from an official limit.");
check(mockHtml.includes("L1/TEX sectors / request") && mockHtml.includes("Ideal is 4 for 32 active lanes"), "Mock profiler task must use the aligned FP32 sectors-per-request baseline.");
check(/id="assessment-shell"[^>]*hidden/.test(mockHtml), "Mock candidate shell must be hidden before an attempt starts.");
check(/id="evaluator-view"[^>]*hidden/.test(mockHtml), "Mock evaluator content must be hidden before submission.");
check(/role="status" aria-live="polite"/.test(mockHtml), "Mock assessment needs an accessible live attempt-status region.");
check(mockHtml.includes('<script src="./mock-assessment.js"></script>'), "Mock assessment must load its local application script.");
check(fs.existsSync(mockScriptPath), "Mock assessment application script is missing.");

const mockRubricMatch = mockScript.match(/const TASKS = ([\s\S]*?);\s*\n\s*let elements;/);
check(mockRubricMatch, "Could not locate the mock assessment TASKS rubric data.");
let mockRubrics = [];
if (mockRubricMatch) {
  try {
    mockRubrics = vm.runInNewContext(`(${mockRubricMatch[1]})`, Object.create(null), { timeout: 1000 });
  } catch (error) {
    errors.push(`Mock assessment TASKS data is not valid JavaScript: ${error.message}`);
  }
}

check(Array.isArray(mockRubrics) && mockRubrics.length === 6, `Mock evaluator must define 6 task rubrics; found ${mockRubrics.length}.`);
const rubricCriterionIds = new Set();
let rubricPointTotal = 0;
mockRubrics.forEach((rubric, index) => {
  const where = `Mock rubric t${index + 1}`;
  const htmlTask = mockTasks[index];
  check(rubric.id === `t${index + 1}`, `${where} has unexpected id ${JSON.stringify(rubric.id)}.`);
  check(rubric.points === Number(htmlTask?.[3]), `${where} points must match the candidate task.`);
  check(typeof rubric.reference === "string" && rubric.reference.trim().length >= 220, `${where} needs substantive reference reasoning.`);
  check(typeof rubric.remediationHref === "string" && /^(?:gpu-kernel-skills|coding-practice)\.html#/.test(rubric.remediationHref), `${where} needs a local remediation target.`);
  check(typeof rubric.remediationLabel === "string" && rubric.remediationLabel.trim().length >= 12, `${where} needs a meaningful remediation label.`);
  check(Array.isArray(rubric.criteria) && rubric.criteria.length >= 4, `${where} needs at least four point-by-point criteria.`);

  let taskRubricPoints = 0;
  for (const criterion of rubric.criteria ?? []) {
    check(typeof criterion.id === "string" && criterion.id.startsWith(`${rubric.id}-`), `${where} has an invalid criterion id.`);
    check(!rubricCriterionIds.has(criterion.id), `${where} duplicates criterion id ${criterion.id}.`);
    rubricCriterionIds.add(criterion.id);
    check(Number.isInteger(criterion.points) && criterion.points > 0, `${where} criterion ${criterion.id} needs positive integer points.`);
    check(typeof criterion.label === "string" && criterion.label.trim().length >= 25, `${where} criterion ${criterion.id} needs a substantive label.`);
    taskRubricPoints += criterion.points;
  }
  check(taskRubricPoints === rubric.points, `${where} criteria total ${taskRubricPoints}; expected ${rubric.points}.`);
  rubricPointTotal += rubric.points ?? 0;
});
check(rubricPointTotal === 100, `Mock evaluator rubrics must total 100 points; found ${rubricPointTotal}.`);

const criticalCaps = new Map(mockRubrics.filter(rubric => Number.isFinite(rubric.criticalCap)).map(rubric => [rubric.id, rubric.criticalCap]));
for (const rubric of mockRubrics) {
  if (rubric.criticalCap === undefined) continue;
  check(Number.isInteger(rubric.criticalCap) && rubric.criticalCap >= 0 && rubric.criticalCap <= rubric.points, `${rubric.id} critical cap must be an integer from 0 through ${rubric.points}.`);
  check(rubric.criteria.some(criterion => criterion.critical === true), `${rubric.id} has a critical cap but no critical rubric criterion.`);
}
for (const taskId of ["t2", "t3", "t5", "t6"]) {
  check(criticalCaps.has(taskId), `${taskId} must define its intended correctness cap.`);
}
check((criticalCaps.get("t2") ?? Infinity) < 9, "Reduction safety failure must cap task 2 below half credit.");
check((criticalCaps.get("t3") ?? Infinity) <= 16, "Missing softmax stability or safety must cap task 3 at half credit.");
check((criticalCaps.get("t5") ?? Infinity) <= 7, "Unsafe stream ordering must cap task 5 at half credit.");
check((criticalCaps.get("t6") ?? Infinity) <= 5, "Missing benchmark correctness must cap task 6 at half credit.");
check(mockScript.includes('const STORAGE_KEY = "mercor.cuda.mock.v1"'), "Mock application needs a stable versioned storage key.");
check(mockScript.includes("Date.now() >= state.deadlineAt"), "Mock application must compare wall-clock time with its persisted deadline.");
check(mockScript.includes('finalizeSubmission("expired"'), "Mock application must submit expired timed attempts.");
check(mockScript.includes("response.textContent ="), "Mock evaluator must render candidate responses with textContent.");
check(!/response\.innerHTML\s*=/.test(mockScript), "Mock evaluator must not inject candidate responses with innerHTML.");
check(mockScript.includes("new Blob("), "Mock application must support JSON export.");
check(mockScript.includes("localStorage.removeItem(STORAGE_KEY)"), "Mock application retake must clear saved attempt state.");
check(mockScript.includes('wordCount > 200'), "Mock application must surface decision memos over the 200-word contract.");

const htmlDocuments = [
  { name: "index.html", filePath: indexPath, html: indexHtml },
  { name: "gpu-kernel-skills.html", filePath: skillsPath, html: skillsHtml },
  { name: "coding-practice.html", filePath: codingPath, html: codingHtml },
  { name: "mock-assessment.html", filePath: mockPath, html: mockHtml }
];
const idsByPath = new Map();
let studyFigureCount = 0;

for (const document of htmlDocuments) {
  const ids = [...document.html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  check(new Set(ids).size === ids.length, `${document.name} contains duplicate id attributes.`);
  idsByPath.set(document.filePath, new Set(ids));

  for (const figureMatch of document.html.matchAll(/<figure\b([^>]*)>([\s\S]*?)<\/figure>/gi)) {
    const attributes = figureMatch[1];
    const body = figureMatch[2];
    if (!/\bclass="[^"]*\bstudy-figure\b[^"]*"/.test(attributes)) continue;
    studyFigureCount += 1;
    const labelledBy = attributes.match(/\baria-labelledby="([^"]+)"/)?.[1];
    const captionId = body.match(/<figcaption\b[^>]*\bid="([^"]+)"[^>]*>/i)?.[1];
    check(Boolean(labelledBy), `${document.name} study figure ${studyFigureCount} needs aria-labelledby.`);
    check(Boolean(captionId), `${document.name} study figure ${studyFigureCount} needs an identified figcaption.`);
    check(labelledBy === captionId, `${document.name} study figure ${studyFigureCount} aria-labelledby must reference its figcaption.`);
    check(/\bclass="[^"]*\bsr-only\b[^"]*"/.test(body), `${document.name} study figure ${studyFigureCount} needs a screen-reader summary.`);
  }

  for (const anchorMatch of document.html.matchAll(/<a\b[^>]*>/g)) {
    const tag = anchorMatch[0];
    if (!/\btarget="_blank"/.test(tag)) continue;
    check(/\brel="[^"]*\bnoopener\b[^"]*"/.test(tag), `${document.name} has a target=_blank link without rel=noopener: ${tag}`);
  }

  for (const reference of document.html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const value = reference[1];
    if (/^https?:\/\//.test(value)) {
      try {
        const parsed = new URL(value);
        check(Boolean(parsed.hostname), `${document.name} has a malformed external URL: ${value}`);
      } catch {
        errors.push(`${document.name} has a malformed external URL: ${value}`);
      }
      continue;
    }
    if (/^[a-z]+:/i.test(value)) continue;

    const [relativeFile, fragment] = value.split("#", 2);
    const targetPath = relativeFile ? path.resolve(path.dirname(document.filePath), relativeFile.split("?", 1)[0]) : document.filePath;
    check(fs.existsSync(targetPath), `${document.name} references a missing local file: ${value}`);
    if (!fragment || !fs.existsSync(targetPath)) continue;
    if (!idsByPath.has(targetPath)) {
      const targetHtml = fs.readFileSync(targetPath, "utf8");
      idsByPath.set(targetPath, new Set([...targetHtml.matchAll(/\bid="([^"]+)"/g)].map(match => match[1])));
    }
    check(idsByPath.get(targetPath).has(decodeURIComponent(fragment)), `${document.name} references a missing anchor: ${value}`);
  }
}

const requiredReasoningFigures = [
  [codingHtml, "answer-flow-caption"],
  [codingHtml, "sync-decision-caption"],
  [codingHtml, "collective-sequence-caption"],
  [codingHtml, "reduction-dataflow-caption"],
  [codingHtml, "matmul-state-caption"],
  [codingHtml, "kernel-review-caption"],
  [codingHtml, "csr-dataflow-caption"],
  [skillsHtml, "fusion-causal-caption"],
  [skillsHtml, "pipeline-state-caption"],
  [skillsHtml, "graph-lifecycle-caption"]
];
for (const [html, captionId] of requiredReasoningFigures) {
  check(html.includes(`id="${captionId}"`), `Required reasoning figure ${captionId} is missing.`);
}
check(codingHtml.indexOf('id="reasoning"') > 0 && codingHtml.indexOf('id="reasoning"') < codingHtml.indexOf('id="q1"'), "The visible reasoning atlas must appear before the coding problems.");
check(studyFigureCount >= 21, `Expected at least 21 responsive study figures after the reasoning update, found ${studyFigureCount}.`);

check(quizCount >= 116, `Quiz bank unexpectedly shrank below its 116-question baseline; found ${quizCount}.`);
check(codingProblems.length >= 16, `Coding bank unexpectedly shrank below its 16-problem baseline; found ${codingProblems.length}.`);
validateCountClaims(indexHtml, "docs/index.html", /\b(\d+)\s+(?:practice\s+)?questions\b/gi, quizCount, 2, "quiz");
validateCountClaims(codingHtml, "docs/coding-practice.html", /\b(\d+)\s+(?:practice\s+)?questions\b/gi, quizCount, 1, "quiz");
validateCountClaims(indexHtml, "docs/index.html", /\b(\d+)\s+(?:kernel-writing\s+problems|kernels\s+with\s+solutions)\b/gi, codingProblems.length, 1, "coding-problem");
validateCountClaims(codingHtml, "docs/coding-practice.html", /\b(\d+)\s+(?:kernel-writing\s+problems|kernels\s+with\s+solutions)\b/gi, codingProblems.length, 2, "coding-problem");

if (errors.length) {
  console.error(`Content validation failed with ${errors.length} error(s):`);
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Validated ${quizCount} quiz questions across ${dataSections.length} sections, ${codingProblems.length} coding problems, ${mockTasks.length} mock-assessment tasks, and ${studyFigureCount} responsive study figures.`);
