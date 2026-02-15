# AI Queue — Issue Type Routing

## How It Works

The queue worker automatically routes issues to different AI workflows based on **GitHub issue labels**.

### Label → Type Mapping

| Label     | Type      | Prompt File       |
|-----------|-----------|-------------------|
| `e2e`     | e2e       | `prompts/e2e.md`  |
| `content` | content   | `prompts/content.md` |
| *(other)* | coding    | `prompts/coding.md`  |

The worker checks `item.labels` (an array of label strings). First match wins. If no recognized label is found, it defaults to **coding**.

### Workflows

#### 🔧 Coding (default)
Analyzes the GitHub issue, identifies root cause, generates a code fix following React Native coding standards, creates a branch (`issue-{number}`), and opens a PR assigned to `waltermvp`. Also loads `react-native-coding-standards.md` for lint/CI compliance.

#### 🧪 E2E Testing
Builds a **release APK** (not dev!), installs on test devices, and runs Maestro test suites on Android (Moto E13) and iOS (iPhone 11). Outputs test results with pass/fail report. Also loads `react-native-coding-standards.md` for any code changes needed.

#### ✍️ Content
Generates marketing copy, social media posts, app store descriptions, changelogs, or documentation. No code execution — pure text generation with brand voice guidance.

### Adding a New Type

1. Create `prompts/{type}.md` with the system prompt
2. Add the label string to `detectIssueType()` in `scripts/queue-worker.js`
3. Update this README
