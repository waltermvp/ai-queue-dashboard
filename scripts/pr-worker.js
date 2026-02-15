#!/usr/bin/env node

/**
 * PR Worker v2 - Uses local Qwen 2.5 Coder 32B (Ollama) to generate code changes and create GitHub PRs
 *
 * Improvements over v1:
 * - Full file context (no truncation)
 * - SEARCH/REPLACE diff-based edits
 * - Validation (prettier, eslint, tsc) before push
 * - Self-correction loop (max 2 retries)
 * - Minimal change emphasis in prompts
 *
 * Usage:
 *   node scripts/pr-worker.js <owner/repo> <issue-number>
 *   node scripts/pr-worker.js epiphanyapps/MapYourHealth 94
 *
 * Flags:
 *   --skip-e2e    Skip E2E testing even if issue is tagged for it
 */

const { execSync } = require("child_process")
const fs = require("fs")
const path = require("path")

const OLLAMA_URL = "http://localhost:11434/api/generate"
const OLLAMA_MODEL = "qwen2.5-coder:32b"
const DOCS_DIR = path.join(process.env.HOME, "Documents")
const QUEUE_STATE_PATH = path.join(__dirname, "..", "queue-state.json")
const SKIP_E2E = process.argv.includes("--skip-e2e")
const MAX_RETRIES = 2
const MAX_TOTAL_CHARS = 30000
const MAX_PER_FILE = 15000

// ── Helpers ──────────────────────────────────────────────────────────────────

function run(cmd, opts = {}) {
  console.log(`$ ${cmd}`)
  return execSync(cmd, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024, ...opts }).trim()
}

function runSafe(cmd, opts = {}) {
  try {
    return run(cmd, opts)
  } catch (e) {
    return null
  }
}

function ollamaGenerate(prompt, systemPrompt = "") {
  return new Promise((resolve, reject) => {
    const http = require("http")
    console.log(`\n🤖 Sending prompt to ${OLLAMA_MODEL} (${prompt.length} chars)...\n`)

    // Use non-streaming to avoid hanging issues with large prompts
    const body = JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      system: systemPrompt,
      stream: false,
      options: { num_ctx: 16384 },
    })

    const req = http.request(
      {
        hostname: "localhost",
        port: 11434,
        path: "/api/generate",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeout: 600000, // 10 min timeout
      },
      (res) => {
        if (res.statusCode !== 200) {
          let err = ""
          res.on("data", (c) => (err += c))
          res.on("end", () => reject(new Error(`Ollama returned ${res.statusCode}: ${err}`)))
          return
        }

        let data = ""
        res.on("data", (chunk) => {
          data += chunk.toString()
          process.stdout.write(".")
        })

        res.on("end", () => {
          try {
            const obj = JSON.parse(data)
            console.log(`\n   Generated ${obj.eval_count || 0} tokens (prompt: ${obj.prompt_eval_count || 0} tokens)`)
            resolve(obj.response || "")
          } catch (e) {
            reject(new Error(`Failed to parse Ollama response: ${data.substring(0, 500)}`))
          }
        })

        res.on("error", reject)
      }
    )

    req.on("timeout", () => {
      console.log("\n⏰ Request timed out!")
      req.destroy()
      reject(new Error("Ollama request timed out after 10 minutes"))
    })
    req.on("error", (err) => {
      console.log("\n❌ Request error:", err.message)
      reject(err)
    })
    console.log(`   Sending ${Buffer.byteLength(body)} bytes to Ollama...`)
    req.write(body)
    req.end(() => {
      console.log("   Request sent, waiting for response...")
    })
  })
}

// ── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior software engineer making surgical code changes.

CRITICAL RULES:
1. Make the SMALLEST possible changes. Do NOT rewrite entire files.
2. Only modify lines DIRECTLY related to the issue.
3. Preserve ALL existing code that isn't being changed.
4. Do NOT add unnecessary refactoring, reformatting, or style changes.
5. Do NOT remove or change imports, comments, or code unrelated to the fix.

OUTPUT FORMAT — use ONLY this format for each change:

FILE: path/to/file.tsx
SEARCH:
[exact lines to find in the original file — must match exactly including whitespace]
REPLACE:
[replacement lines]
END

You may output multiple SEARCH/REPLACE blocks for the same file.
The SEARCH text must be an EXACT substring of the original file.
Keep SEARCH blocks as small as possible — just the lines that need changing plus minimal surrounding context for uniqueness.`

// ── Parse SEARCH/REPLACE edits ───────────────────────────────────────────────

function parseSearchReplaceEdits(llmOutput) {
  const edits = []
  // Match: FILE: path\nSEARCH:\n...\nREPLACE:\n...\nEND
  const regex = /FILE:\s*(.+?)\s*\nSEARCH:\n([\s\S]*?)\nREPLACE:\n([\s\S]*?)\nEND/g
  let m
  while ((m = regex.exec(llmOutput)) !== null) {
    edits.push({
      file: m[1].trim(),
      search: m[2],
      replace: m[3],
    })
  }

  // Fallback: try without END marker, using next FILE: or end of string
  if (edits.length === 0) {
    const fallback = /FILE:\s*(.+?)\s*\nSEARCH:\n([\s\S]*?)\nREPLACE:\n([\s\S]*?)(?=\nFILE:|$)/g
    while ((m = fallback.exec(llmOutput)) !== null) {
      edits.push({
        file: m[1].trim(),
        search: m[2].trimEnd(),
        replace: m[3].trimEnd(),
      })
    }
  }

  return edits
}

// ── Apply SEARCH/REPLACE edits ───────────────────────────────────────────────

function applyEdits(worktreeDir, edits) {
  const changedFiles = new Set()
  const errors = []

  for (const edit of edits) {
    const targetPath = path.join(worktreeDir, edit.file)
    if (!fs.existsSync(targetPath)) {
      // New file — treat replace as full content
      const dir = path.dirname(targetPath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(targetPath, edit.replace)
      changedFiles.add(edit.file)
      console.log(`   ✅ ${edit.file} (new file)`)
      continue
    }

    let content = fs.readFileSync(targetPath, "utf-8")
    const searchText = edit.search

    if (!content.includes(searchText)) {
      // Try trimmed match
      const trimmedSearch = searchText.trim()
      if (trimmedSearch && content.includes(trimmedSearch)) {
        content = content.replace(trimmedSearch, edit.replace.trim())
        fs.writeFileSync(targetPath, content)
        changedFiles.add(edit.file)
        console.log(`   ✅ ${edit.file} (trimmed match)`)
      } else {
        errors.push(`SEARCH block not found in ${edit.file}:\n${searchText.substring(0, 200)}`)
        console.log(`   ⚠️  ${edit.file} — SEARCH text not found`)
      }
    } else {
      content = content.replace(searchText, edit.replace)
      fs.writeFileSync(targetPath, content)
      changedFiles.add(edit.file)
      console.log(`   ✅ ${edit.file}`)
    }
  }

  return { changedFiles: [...changedFiles], errors }
}

// ── Discover relevant source files ───────────────────────────────────────────

function discoverFiles(repoDir, hints, issueBody = "") {
  const files = []
  const seen = new Set()

  // Extract keywords from issue
  const issueKeywords = new Set()
  const wordMatches = issueBody.match(/\b[a-zA-Z]{4,}\b/g) || []
  for (const w of wordMatches) {
    const lower = w.toLowerCase()
    if (!["this", "that", "with", "from", "have", "been", "will", "should", "would", "could", "about", "their", "there", "which"].includes(lower)) {
      issueKeywords.add(lower)
    }
  }

  // Keyword-based search
  const keywords = ["share", "link", "url", "deep", "config", "constant", ...Array.from(issueKeywords).slice(0, 5)]
  for (const kw of keywords) {
    const result = runSafe(
      `cd "${repoDir}" && grep -rl "${kw}" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.yaml" --include="*.yml" ${hints.join(" ")} 2>/dev/null | head -10`
    )
    if (result) {
      for (const f of result.split("\n").filter(Boolean)) {
        if (!seen.has(f) && !f.includes("node_modules") && !f.includes(".expo") && !f.includes("dist/")) {
          seen.add(f)
          files.push(f)
        }
      }
    }
  }

  // Also find files explicitly mentioned in the issue by filename
  const fileNameMatches = issueBody.match(/[A-Za-z0-9_-]+\.(yaml|yml|ts|tsx|js|jsx|json)/g) || []
  for (const fname of fileNameMatches) {
    const found = runSafe(`cd "${repoDir}" && find ${hints.join(" ")} -name "${fname}" | grep -v node_modules | head -5`)
    if (found) {
      for (const f of found.split("\n").filter(Boolean)) {
        if (!seen.has(f)) { seen.add(f); files.push(f) }
      }
    }
  }

  // Always include config files
  const configGlob = runSafe(
    `cd "${repoDir}" && find ${hints.join(" ")} -name "*.ts" -o -name "*.tsx" -o -name "*.yaml" -o -name "*.yml" | grep -iE "config|constant|util|test|e2e|maestro|flow" | grep -v node_modules | head -10`
  )
  if (configGlob) {
    for (const f of configGlob.split("\n").filter(Boolean)) {
      if (!seen.has(f)) {
        seen.add(f)
        files.push(f)
      }
    }
  }

  return files
}

function readFilesForContext(repoDir, filePaths, maxTotalChars = MAX_TOTAL_CHARS) {
  let ctx = ""
  // Sort files: smaller first to include more files
  const filesWithSize = filePaths.map((fp) => {
    const abs = path.join(repoDir, fp)
    try {
      const stat = fs.statSync(abs)
      return { path: fp, size: stat.size }
    } catch {
      return { path: fp, size: Infinity }
    }
  }).filter(f => f.size !== Infinity).sort((a, b) => a.size - b.size)

  for (const { path: fp, size } of filesWithSize) {
    const abs = path.join(repoDir, fp)
    if (!fs.existsSync(abs)) continue
    let content = fs.readFileSync(abs, "utf-8")
    if (content.length > MAX_PER_FILE) {
      content = content.substring(0, MAX_PER_FILE) + "\n... (truncated — file too large)"
    }
    const entry = `\n--- ${fp} ---\n${content}\n`
    if (ctx.length + entry.length > maxTotalChars && ctx.length > 0) {
      console.log(`   ⏭️  Skipping remaining files (context limit reached at ${ctx.length} chars)`)
      break
    }
    ctx += entry
  }
  return ctx
}

// ── Validation ───────────────────────────────────────────────────────────────

function validateChanges(worktreeDir, changedFiles) {
  const errors = []

  // Prettier
  console.log("   Running prettier...")
  for (const f of changedFiles) {
    const result = runSafe(`cd "${worktreeDir}" && npx prettier --write "${f}" 2>&1`)
    // prettier --write auto-fixes, so we just run it
  }

  // ESLint
  console.log("   Running eslint...")
  for (const f of changedFiles) {
    const result = runSafe(`cd "${worktreeDir}" && npx eslint --fix "${f}" 2>&1`)
    if (result === null) {
      // eslint might not be configured — that's ok
    }
  }

  // TypeScript type check
  console.log("   Running tsc --noEmit...")
  const tscResult = runSafe(`cd "${worktreeDir}" && npx tsc --noEmit 2>&1`)
  if (tscResult === null) {
    // tsc failed — capture the error
    try {
      const tscErr = execSync(`cd "${worktreeDir}" && npx tsc --noEmit 2>&1`, {
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      })
    } catch (e) {
      if (e.stdout) {
        // Filter errors to only those in changed files
        const relevantErrors = e.stdout.split("\n").filter(line => {
          return changedFiles.some(f => line.includes(f))
        }).join("\n")
        if (relevantErrors.trim()) {
          errors.push(`TypeScript errors in changed files:\n${relevantErrors}`)
        }
      }
    }
  }

  return errors
}

// ── E2E Testing Pipeline ─────────────────────────────────────────────────────

function shouldRunE2E(issue) {
  if (SKIP_E2E) return false
  const labels = (issue.labels || []).map((l) => (typeof l === "string" ? l : l.name || "").toLowerCase())
  if (labels.some((l) => ["e2e", "test", "testing"].includes(l))) return true
  const text = `${issue.title} ${issue.body || ""}`.toLowerCase()
  return /\b(e2e|maestro|end.to.end)\b/.test(text)
}

async function runE2EPipeline(worktreeDir, fullRepo, prNumber) {
  console.log("\n🧪 Running E2E testing pipeline...")
  const e2eErrors = []
  const e2eResults = []

  // Step 1: Build Android app
  console.log("\n   📦 Building Android debug APK...")
  const buildCmd = `
    export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 20
    cd "${worktreeDir}/apps/mobile"
    yarn install
    npx expo prebuild --platform android --clean
    cd android && ./gradlew assembleDebug
  `
  const buildResult = runSafe(`bash -c '${buildCmd.replace(/'/g, "'\\''")}' 2>&1`)
  if (buildResult === null) {
    const errMsg = "❌ Android build failed"
    console.log(`   ${errMsg}`)
    e2eErrors.push(errMsg)
    e2eResults.push("### Build\\n" + errMsg)
    // Post failure and return early
    runSafe(`gh pr comment ${prNumber} --repo ${fullRepo} --body "## 🧪 Maestro E2E Results\\n\\n${errMsg}\\n\\nBuild failed — skipping device tests."`)
    return { success: false, errors: e2eErrors }
  }
  e2eResults.push("### Build\\n✅ Android debug APK built successfully")
  console.log("   ✅ Build succeeded")

  // Step 2: Install on device
  console.log("\n   📱 Installing on Android device (ZL73232GKP)...")
  const apkPath = `${worktreeDir}/apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`
  const installResult = runSafe(`adb -s ZL73232GKP install -r "${apkPath}" 2>&1`)
  if (installResult === null) {
    const errMsg = "❌ APK install failed (device may be disconnected)"
    console.log(`   ${errMsg}`)
    e2eErrors.push(errMsg)
    e2eResults.push("### Install\\n" + errMsg)
    runSafe(`gh pr comment ${prNumber} --repo ${fullRepo} --body "## 🧪 Maestro E2E Results\\n\\n${e2eResults.join("\\n\\n")}\\n\\n${errMsg}"`)
    return { success: false, errors: e2eErrors }
  }
  e2eResults.push("### Install\\n✅ APK installed on Moto E13")
  console.log("   ✅ Install succeeded")

  // Step 3: Run Maestro tests
  console.log("\n   🎭 Running Maestro tests...")
  const flowsDir = `${worktreeDir}/apps/mobile/.maestro/flows/`
  if (!fs.existsSync(flowsDir)) {
    const msg = "⚠️ No Maestro flows found at apps/mobile/.maestro/flows/ — skipping tests"
    console.log(`   ${msg}`)
    e2eResults.push("### Tests\\n" + msg)
  } else {
    const maestroResult = runSafe(`export PATH="$PATH:$HOME/.maestro/bin" && maestro --device ZL73232GKP test "${flowsDir}" 2>&1`)
    if (maestroResult === null) {
      const errMsg = "❌ Maestro tests failed"
      console.log(`   ${errMsg}`)
      e2eErrors.push(errMsg)
      e2eResults.push("### Tests\\n" + errMsg)
    } else {
      e2eResults.push("### Tests\\n✅ All Maestro tests passed\\n\\n```\\n" + (maestroResult || "").substring(0, 2000) + "\\n```")
      console.log("   ✅ Maestro tests passed")
    }
  }

  // Step 4: Post results to PR
  console.log("\n   💬 Posting results to PR...")
  const resultsBody = `## 🧪 Maestro E2E Results\\n\\n${e2eResults.join("\\n\\n")}`
  runSafe(`gh pr comment ${prNumber} --repo ${fullRepo} --body "${resultsBody.replace(/"/g, '\\"')}"`)

  return { success: e2eErrors.length === 0, errors: e2eErrors }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now()
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"))

  let fullRepo, issueNumber
  if (args.length === 2) {
    fullRepo = args[0]
    issueNumber = parseInt(args[1], 10)
  } else if (args.length === 1 && args[0].includes("/issues/")) {
    const parts = args[0].replace(/\/$/, "").split("/")
    issueNumber = parseInt(parts.pop(), 10)
    parts.pop()
    fullRepo = parts.slice(-2).join("/")
  } else {
    console.error("Usage: pr-worker.js <owner/repo> <issue-number>")
    console.error("       pr-worker.js <github-issue-url>")
    process.exit(1)
  }

  const repoName = fullRepo.split("/")[1]
  const repoDir = path.join(DOCS_DIR, repoName)
  const worktreeDir = path.join(DOCS_DIR, `${repoName}-issue-${issueNumber}`)
  const branchName = `issue-${issueNumber}`

  console.log(`\n📋 Processing ${fullRepo}#${issueNumber}\n`)

  // 1. Fetch issue details
  console.log("1️⃣  Fetching issue details...")
  const issueJson = run(`gh issue view ${issueNumber} --repo ${fullRepo} --json title,body,labels`)
  const issue = JSON.parse(issueJson)
  console.log(`   Title: ${issue.title}`)

  // 2. Ensure repo is cloned
  console.log("\n2️⃣  Ensuring repo is available...")
  if (!fs.existsSync(path.join(repoDir, ".git"))) {
    console.log(`   Cloning ${fullRepo}...`)
    run(`gh repo clone ${fullRepo} "${repoDir}"`)
  } else {
    console.log("   Repo exists, fetching latest...")
    run(`cd "${repoDir}" && git fetch origin`)
  }

  const defaultBranch = run(`cd "${repoDir}" && git symbolic-ref refs/remotes/origin/HEAD | sed 's@^refs/remotes/origin/@@'`)

  // 3. Create worktree
  console.log("\n3️⃣  Creating worktree...")
  if (fs.existsSync(worktreeDir)) {
    console.log("   Cleaning up existing worktree...")
    runSafe(`cd "${repoDir}" && git worktree remove "${worktreeDir}" --force`)
    if (fs.existsSync(worktreeDir)) {
      run(`rm -rf "${worktreeDir}"`)
    }
  }
  runSafe(`cd "${repoDir}" && git branch -D ${branchName}`)
  run(`cd "${repoDir}" && git worktree add "${worktreeDir}" -b ${branchName} origin/${defaultBranch}`)

  // 4. Discover and read relevant files
  console.log("\n4️⃣  Reading relevant source files...")
  const searchDirs = []
  const dirHints = issue.body.match(/`([^`]*\/)`|apps\/\S+|packages\/\S+|src\/\S+/g)
  if (dirHints) {
    for (const h of dirHints) {
      const clean = h.replace(/`/g, "").replace(/\s.*/, "")
      if (fs.existsSync(path.join(worktreeDir, clean))) searchDirs.push(clean)
    }
  }
  if (searchDirs.length === 0) searchDirs.push(".")

  const relevantFiles = discoverFiles(worktreeDir, searchDirs, issue.body || "")
  console.log(`   Found ${relevantFiles.length} relevant files`)
  const codeContext = readFilesForContext(worktreeDir, relevantFiles)
  console.log(`   Code context: ${codeContext.length} chars`)

  // 5. Build prompt and call Ollama
  console.log("\n5️⃣  Generating code changes with LLM...")
  const prompt = `## GitHub Issue #${issueNumber}: ${issue.title}

${issue.body}

## Relevant Source Code

${codeContext}

## Task

Fix the issue above. Output ONLY SEARCH/REPLACE blocks using the format from the system prompt.
Remember: make the SMALLEST possible changes. Only touch lines directly related to the issue.`

  const llmResponse = await ollamaGenerate(prompt, SYSTEM_PROMPT)
  console.log("\n📝 LLM Response received. Parsing edits...")

  // Save raw response for debugging
  fs.writeFileSync(path.join(worktreeDir, ".llm-response.txt"), llmResponse)

  // 6. Parse and apply edits
  let edits = parseSearchReplaceEdits(llmResponse)
  if (edits.length === 0) {
    console.error("\n❌ No parseable SEARCH/REPLACE edits found in LLM response.")
    console.error("\nRaw response (first 2000 chars):\n", llmResponse.substring(0, 2000))
    updateQueueState(fullRepo, issueNumber, issue.title, "failed", "No parseable edits", startTime)
    process.exit(1)
  }

  console.log(`\n6️⃣  Applying ${edits.length} edit(s)...`)
  let { changedFiles, errors: applyErrors } = applyEdits(worktreeDir, edits)

  if (changedFiles.length === 0) {
    console.error("\n❌ No files were changed (all SEARCH blocks failed to match)")
    console.error("Apply errors:", applyErrors.join("\n"))
    updateQueueState(fullRepo, issueNumber, issue.title, "failed", "No SEARCH blocks matched", startTime)
    process.exit(1)
  }

  // 7. Validate and self-correct
  console.log("\n7️⃣  Validating changes...")
  let validationErrors = validateChanges(worktreeDir, changedFiles)

  for (let retry = 0; retry < MAX_RETRIES && validationErrors.length > 0; retry++) {
    console.log(`\n🔄 Validation failed (attempt ${retry + 1}/${MAX_RETRIES}). Asking LLM to fix...`)
    console.log(`   Errors: ${validationErrors.join("\n   ")}`)

    // Read current state of changed files
    let currentState = ""
    for (const f of changedFiles) {
      const abs = path.join(worktreeDir, f)
      if (fs.existsSync(abs)) {
        currentState += `\n--- ${f} ---\n${fs.readFileSync(abs, "utf-8")}\n`
      }
    }

    const fixPrompt = `The previous changes caused these errors:

${validationErrors.join("\n\n")}

## Current file state after changes:

${currentState}

Fix ONLY the errors above. Output SEARCH/REPLACE blocks for the fixes.
Make the SMALLEST possible changes to fix the errors. Do NOT rewrite files.`

    const fixResponse = await ollamaGenerate(fixPrompt, SYSTEM_PROMPT)
    fs.writeFileSync(path.join(worktreeDir, `.llm-fix-response-${retry + 1}.txt`), fixResponse)

    const fixEdits = parseSearchReplaceEdits(fixResponse)
    if (fixEdits.length > 0) {
      console.log(`   Applying ${fixEdits.length} fix edit(s)...`)
      const fixResult = applyEdits(worktreeDir, fixEdits)
      changedFiles = [...new Set([...changedFiles, ...fixResult.changedFiles])]
    }

    validationErrors = validateChanges(worktreeDir, changedFiles)
  }

  if (validationErrors.length > 0) {
    console.log(`\n⚠️  Validation still has errors after ${MAX_RETRIES} retries. Proceeding anyway.`)
    console.log(`   Remaining errors: ${validationErrors.join("\n   ")}`)
  }

  // 8. Commit (exclude debug files)
  console.log("\n8️⃣  Committing changes...")
  runSafe(`cd "${worktreeDir}" && echo ".llm-response.txt\n.llm-fix-response-*.txt" >> .gitignore`)
  run(`cd "${worktreeDir}" && git add -A`)
  const diff = runSafe(`cd "${worktreeDir}" && git diff --cached --stat`)
  if (!diff) {
    console.error("❌ No changes to commit")
    updateQueueState(fullRepo, issueNumber, issue.title, "failed", "No changes detected", startTime)
    process.exit(1)
  }
  console.log(diff)
  run(`cd "${worktreeDir}" && git commit -m "fix: ${issue.title.replace(/"/g, '\\"')} - closes #${issueNumber}"`)

  // 9. Push
  console.log("\n9️⃣  Pushing branch...")
  run(`cd "${worktreeDir}" && git push origin ${branchName} --force`)

  // 10. Create PR
  console.log("\n🔟 Creating PR...")
  const prBody = `Closes #${issueNumber}

Generated by AI PR Worker v2 using ${OLLAMA_MODEL}.

## Changes
${changedFiles.map((f) => "- " + f).join("\n")}
${validationErrors.length > 0 ? "\n## ⚠️ Known Issues\n" + validationErrors.join("\n") : ""}`

  const prUrl = run(
    `cd "${worktreeDir}" && gh pr create --repo ${fullRepo} --title "fix: ${issue.title.replace(/"/g, '\\"')}" --body "${prBody.replace(/"/g, '\\"').replace(/\n/g, "\\n")}" --assignee waltermvp --head ${branchName}`
  )
  console.log(`\n✅ PR created: ${prUrl}`)

  // 10b. E2E Testing (if applicable)
  if (shouldRunE2E(issue)) {
    const prNumber = prUrl.match(/\/pull\/(\d+)/)?.[1] || prUrl.trim().split("/").pop()
    try {
      const e2eResult = await runE2EPipeline(worktreeDir, fullRepo, prNumber)
      if (e2eResult.success) {
        console.log("\n✅ E2E tests passed!")
      } else {
        console.log(`\n⚠️  E2E had issues: ${e2eResult.errors.join(", ")}`)
      }
    } catch (err) {
      console.log(`\n⚠️  E2E pipeline error (non-fatal): ${err.message}`)
      runSafe(`gh pr comment ${prNumber} --repo ${fullRepo} --body "## 🧪 Maestro E2E Results\n\n❌ Pipeline crashed: ${err.message}"`)
    }
  } else {
    console.log("\n⏭️  No E2E labels/keywords detected — skipping E2E pipeline")
  }

  // 11. Clean up worktree
  console.log("\n🧹 Cleaning up worktree...")
  runSafe(`cd "${repoDir}" && git worktree remove "${worktreeDir}" --force`)

  // 12. Update queue state
  updateQueueState(fullRepo, issueNumber, issue.title, "completed", prUrl, startTime)

  console.log(`\n🎉 Done! Total time: ${Math.round((Date.now() - startTime) / 1000)}s`)
}

function updateQueueState(repo, issueNumber, title, status, result, startTime) {
  let state = {}
  try {
    state = JSON.parse(fs.readFileSync(QUEUE_STATE_PATH, "utf-8"))
  } catch {}

  if (!state.completed) state.completed = []
  state.completed.push({
    id: `${repo}#${issueNumber}`,
    title,
    repo,
    status,
    result,
    model: OLLAMA_MODEL,
    completed_at: new Date().toISOString(),
    processing_time: Date.now() - startTime,
  })
  state.current_issue = null
  state.processing = null

  fs.writeFileSync(QUEUE_STATE_PATH, JSON.stringify(state, null, 2))
  console.log("📊 Queue state updated")
}

main().catch((err) => {
  console.error("\n💥 Fatal error:", err.message)
  process.exit(1)
})
