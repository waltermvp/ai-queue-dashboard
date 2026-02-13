# 🤖 AI Issue Queue Dashboard

A modern web interface for monitoring and controlling your AI-powered GitHub issue processing system.

## ✨ Features

### 📊 **Real-Time Monitoring**
- **Queue Status:** See queued, processing, completed, and failed issues
- **Live Updates:** Automatic refresh every 30 seconds
- **Processing Progress:** Track current AI analysis in real-time
- **Historical Data:** View completed solutions and failed attempts

### 🎛️ **Queue Controls**
- **Load Issues:** Fetch latest GitHub issues from your repos
- **Process One:** Manually trigger processing of next issue
- **Cleanup:** Clear completed items from queue
- **Retry Failed:** Requeue failed issues for retry

### 📝 **Issue Management**
- **Priority Queue:** Critical bugs processed first
- **Issue Details:** Title, repo, GitHub links
- **Processing Time:** Track how long each issue takes
- **Solution Links:** Direct access to AI-generated solutions

### 🔍 **Visual Status**
- **Color-coded cards:** Easy status identification
- **Progress indicators:** Spinning loaders for active processing
- **Badge system:** Clear issue categorization
- **Responsive design:** Works on desktop and mobile

## 🚀 Quick Start

### Launch the UI:
```bash
# From the workspace directory
bash launch-ai-queue-ui.sh
```

### Access the dashboard:
Open your browser to: **http://localhost:3001**

## 📱 Interface Overview

### **Status Cards (Top Row)**
- 🕒 **Queued:** Number of issues waiting to be processed
- ⚙️ **Processing:** Currently active AI processing (0 or 1)
- ✅ **Completed:** Successfully processed issues
- ❌ **Failed:** Issues that failed processing

### **Queue Controls**
- **➕ Load Issues:** Fetches latest GitHub issues assigned to you
- **▶️ Process One:** Starts AI processing of next queued issue
- **🔄 Cleanup:** Removes completed items from display

### **Current Processing Panel**
- Shows which issue is currently being analyzed
- Processing start time and duration
- Real-time progress indicator

### **Issue Lists**
- **📋 Pending Issues:** Queue order with priority badges
- **✅ Completed Issues:** Successful AI solutions with links
- **❌ Failed Issues:** Errors with retry options

## 🔧 Technical Details

### **Built With:**
- **Next.js 14:** React framework with App Router
- **TypeScript:** Type-safe development
- **Tailwind CSS:** Modern, responsive styling
- **Lucide Icons:** Beautiful, consistent iconography

### **API Integration:**
- **Queue State:** Reads from `queue-state.json`
- **Action Control:** Executes bash scripts via API
- **Real-time Updates:** Automatic polling for changes

### **File Structure:**
```
ai-queue-ui/
├── app/
│   ├── api/
│   │   ├── queue-state/route.ts    # Queue data API
│   │   └── queue-action/route.ts   # Control actions API
│   ├── globals.css                 # Tailwind styles
│   ├── layout.tsx                  # App layout
│   └── page.tsx                    # Main dashboard
├── package.json                    # Dependencies
├── tailwind.config.js              # Styling config
└── tsconfig.json                   # TypeScript config
```

## 🌐 URL Structure

- **Dashboard:** `http://localhost:3001/`
- **API Endpoints:**
  - `GET /api/queue-state` - Current queue status
  - `POST /api/queue-action` - Execute control actions

## 🔄 Integration with AI System

### **Data Flow:**
1. **GitHub Issues** → **Obsidian Notes** → **AI Queue**
2. **AI Processing** → **Generated Solutions** → **Obsidian Archive**
3. **UI Dashboard** → **Real-time Monitoring** → **User Controls**

### **Connected Systems:**
- **Obsidian CLI:** Issue and solution management
- **AI Queue Processor:** Core processing logic
- **GitHub API:** Issue synchronization
- **WhatsApp Notifications:** Morning summaries

## 📊 Usage Patterns

### **Daily Workflow:**
1. **Morning:** Check overnight processing results
2. **Throughout day:** Monitor queue status
3. **Manual processing:** Trigger specific issue analysis
4. **Evening:** Load new issues before overnight run

### **Queue Management:**
- **Load Issues:** When new GitHub issues are created
- **Process One:** For urgent issue analysis
- **Cleanup:** To reduce UI clutter after review

## 🔒 Security Notes

- **Local Access:** UI runs locally on your machine
- **No External Connections:** All data stays on your Mac
- **File System Access:** Reads/writes queue state files
- **Script Execution:** Runs bash commands with your permissions

## 🐛 Troubleshooting

### **UI Won't Load:**
```bash
# Check if Node.js is installed
node --version

# Check port availability
lsof -i :3001

# Restart with fresh install
rm -rf ai-queue-ui/node_modules
bash launch-ai-queue-ui.sh
```

### **No Queue Data:**
- Ensure AI queue system is initialized
- Check if `queue-state.json` exists
- Run `bash obsidian-toolkit.sh ai-populate` first

### **Actions Not Working:**
- Verify bash scripts are executable
- Check file permissions in workspace
- Ensure Obsidian CLI is configured

## 🚀 Future Enhancements

- **WebSocket Support:** Real-time updates without polling
- **Solution Previews:** Inline AI output viewing
- **Progress Bars:** Detailed processing progress
- **Issue Filtering:** Search and filter capabilities
- **Mobile Optimization:** Touch-friendly controls
- **Dark Mode:** Theme switching

## 📞 Quick Help

### **Start UI:**
```bash
bash launch-ai-queue-ui.sh
```

### **Check Queue Status:**
```bash
bash obsidian-toolkit.sh ai-queue
```

### **Load New Issues:**
```bash
bash obsidian-toolkit.sh ai-populate
```

---

**🎯 Perfect for monitoring your AI-powered issue processing while you focus on other work!**