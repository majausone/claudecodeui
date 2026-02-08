import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';

const router = express.Router();

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const TEAMS_DIR = path.join(CLAUDE_DIR, 'teams');
const TASKS_DIR = path.join(CLAUDE_DIR, 'tasks');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Get the team folder path (all task files live here)
function getTeamFolder(teamName) {
  return path.join(TEAMS_DIR, teamName);
}

// Generate preprompt for a given member based on team config
function generatePreprompt(config, member) {
  const teamName = config.name;
  const teamFolder = getTeamFolder(teamName).replace(/\\/g, '/');
  const isLead = member.agentType === 'team-lead';
  const otherMembers = config.members.filter(m => m.name !== member.name);

  let preprompt = `You are "${member.name}" in team "${teamName}".`;

  if (config.description) {
    preprompt += ` Team description: ${config.description}.`;
  }

  if (isLead) {
    const agents = otherMembers.filter(m => m.agentType !== 'team-lead');
    if (agents.length > 0) {
      preprompt += `\nYou are the team leader. Your agents are: ${agents.map(a => `"${a.name}" (model: ${a.model})`).join(', ')}.`;
    } else {
      preprompt += `\nYou are the team leader. No agents have been added yet.`;
    }

    if (agents.length > 0) {
      preprompt += `\n\n## How to delegate work to your agents`;
      preprompt += `\nUse the Task tool with the agent's name as subagent_type:`;
      for (const a of agents) {
        preprompt += `\n- Task(subagent_type="${a.name}", prompt="your task here")`;
      }
      preprompt += `\nTo run multiple agents in parallel, call multiple Task tools in a single message. You will wait for all of them to complete, then summarize results to the user.`;
    }

    preprompt += `\n\nIMPORTANT - Human Tasks (source of truth):`;
    preprompt += `\nRead the file "${teamFolder}/human-tasks.md" at the start of every conversation and periodically while working. This file contains the tasks assigned to you by the human. It is your SOURCE OF TRUTH. You must NEVER edit or write to this file. Only the human can modify it. Always check this file to make sure you haven't drifted from the original objectives.`;

    preprompt += `\n\nYour task file: "${teamFolder}/${member.name}.md"`;
    preprompt += `\nRead this file every time you are spoken to. Use it to track your progress, notes, and internal task breakdown. If it contains leftover content from a previous session that is unrelated to current work, clean it up.`;
  } else {
    const lead = config.members.find(m => m.agentType === 'team-lead');
    if (lead) {
      preprompt += ` Your team leader is "${lead.name}".`;
    }
    const peers = otherMembers.filter(m => m.agentType !== 'team-lead');
    if (peers.length > 0) {
      preprompt += ` Your fellow agents: ${peers.map(a => `"${a.name}"`).join(', ')}.`;
    }

    preprompt += `\n\nYour task file: "${teamFolder}/${member.name}.md"`;
    preprompt += `\nRead this file every time you are spoken to. Use it to track your progress, notes, and task status. If it contains leftover content from a previous session that is unrelated to current work, clean it up. Update it as you work.`;
  }

  return preprompt;
}

// Regenerate preprompts for all members and save config
async function regeneratePreprompts(config, configPath) {
  for (const member of config.members) {
    member.preprompt = generatePreprompt(config, member);
  }
  await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
}

// Create task files for all members in the team folder
async function createTaskFiles(teamName, members) {
  const teamFolder = getTeamFolder(teamName);
  ensureDir(teamFolder);

  // Create human-tasks.md
  const humanTasksPath = path.join(teamFolder, 'human-tasks.md');
  if (!fs.existsSync(humanTasksPath)) {
    await fs.promises.writeFile(humanTasksPath, `# Human Tasks - ${teamName}\n\nWrite your tasks and objectives here. The team leader will read this as the source of truth.\n`, 'utf8');
  }

  // Create .md for each member
  for (const member of members) {
    const memberTaskPath = path.join(teamFolder, `${member.name}.md`);
    if (!fs.existsSync(memberTaskPath)) {
      await fs.promises.writeFile(memberTaskPath, `# Tasks - ${member.name}\n\n`, 'utf8');
    }
    member.taskFile = memberTaskPath.replace(/\\/g, '/');
  }
}

// GET /api/teams - List all teams
router.get('/', async (req, res) => {
  try {
    ensureDir(TEAMS_DIR);
    const entries = await fs.promises.readdir(TEAMS_DIR, { withFileTypes: true });
    const teams = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const configPath = path.join(TEAMS_DIR, entry.name, 'config.json');
        try {
          const configData = await fs.promises.readFile(configPath, 'utf8');
          const config = JSON.parse(configData);
          teams.push({
            name: config.name || entry.name,
            description: config.description || '',
            createdAt: config.createdAt,
            leadAgentId: config.leadAgentId,
            members: config.members || [],
            memberCount: (config.members || []).length
          });
        } catch {
          // Skip teams with invalid/missing config
        }
      }
    }

    res.json({ teams });
  } catch (error) {
    console.error('Error listing teams:', error);
    res.status(500).json({ error: 'Failed to list teams' });
  }
});

// GET /api/teams/:teamName - Get team details
router.get('/:teamName', async (req, res) => {
  try {
    const { teamName } = req.params;
    const safeName = teamName.replace(/[^a-zA-Z0-9_-]/g, '');
    const configPath = path.join(TEAMS_DIR, safeName, 'config.json');

    if (!fs.existsSync(configPath)) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const configData = await fs.promises.readFile(configPath, 'utf8');
    const config = JSON.parse(configData);

    // Read inbox files
    const inboxDir = path.join(TEAMS_DIR, safeName, 'inboxes');
    const inboxes = {};
    if (fs.existsSync(inboxDir)) {
      const inboxFiles = await fs.promises.readdir(inboxDir);
      for (const file of inboxFiles) {
        if (file.endsWith('.json')) {
          try {
            const inboxData = await fs.promises.readFile(path.join(inboxDir, file), 'utf8');
            inboxes[file.replace('.json', '')] = JSON.parse(inboxData);
          } catch { /* skip */ }
        }
      }
    }

    // Add folder path for the frontend
    config.folderPath = getTeamFolder(safeName).replace(/\\/g, '/');

    res.json({ ...config, inboxes });
  } catch (error) {
    console.error('Error getting team:', error);
    res.status(500).json({ error: 'Failed to get team details' });
  }
});

// POST /api/teams - Create a new team
router.post('/', async (req, res) => {
  try {
    const { name, description, agents } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Team name is required' });
    }

    const safeName = name.trim().replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
    const teamDir = path.join(TEAMS_DIR, safeName);

    if (fs.existsSync(path.join(teamDir, 'config.json'))) {
      return res.status(409).json({ error: 'Team already exists' });
    }

    ensureDir(teamDir);
    ensureDir(path.join(teamDir, 'inboxes'));
    ensureDir(path.join(TASKS_DIR, safeName));

    const config = {
      name: safeName,
      description: description || '',
      createdAt: Date.now(),
      leadAgentId: `${safeName}-lead@${safeName}`,
      leadSessionId: '',
      members: [
        {
          agentId: `${safeName}-lead@${safeName}`,
          name: `${safeName}-lead`,
          agentType: 'team-lead',
          model: 'claude-opus-4-6',
          prompt: '',
          preprompt: '',
          joinedAt: Date.now(),
          tmuxPaneId: '',
          cwd: '',
          subscriptions: [],
          taskFile: ''
        }
      ]
    };

    // Add agents if provided
    if (agents && Array.isArray(agents)) {
      const colors = ['blue', 'green', 'yellow', 'red', 'purple', 'orange'];
      agents.forEach((agent, index) => {
        config.members.push({
          agentId: `${agent.name}@${safeName}`,
          name: agent.name,
          agentType: 'agent',
          model: agent.model || 'sonnet',
          prompt: agent.prompt || '',
          preprompt: '',
          color: colors[index % colors.length],
          planModeRequired: false,
          joinedAt: Date.now(),
          tmuxPaneId: '',
          cwd: '',
          subscriptions: [],
          taskFile: ''
        });
      });
    }

    // Create task files in team folder
    await createTaskFiles(safeName, config.members);

    // Generate preprompts
    const configPath = path.join(teamDir, 'config.json');
    await regeneratePreprompts(config, configPath);

    // Create inbox files
    for (const member of config.members) {
      await fs.promises.writeFile(
        path.join(teamDir, 'inboxes', `${member.name}.json`),
        '[]',
        'utf8'
      );
    }

    res.json({ success: true, team: config });
  } catch (error) {
    console.error('Error creating team:', error);
    res.status(500).json({ error: 'Failed to create team' });
  }
});

// PUT /api/teams/:teamName - Update team config
router.put('/:teamName', async (req, res) => {
  try {
    const { teamName } = req.params;
    const safeName = teamName.replace(/[^a-zA-Z0-9_-]/g, '');
    const configPath = path.join(TEAMS_DIR, safeName, 'config.json');

    if (!fs.existsSync(configPath)) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const configData = await fs.promises.readFile(configPath, 'utf8');
    const config = JSON.parse(configData);

    const { description } = req.body;
    if (description !== undefined) {
      config.description = description;
    }

    await regeneratePreprompts(config, configPath);
    res.json({ success: true, team: config });
  } catch (error) {
    console.error('Error updating team:', error);
    res.status(500).json({ error: 'Failed to update team' });
  }
});

// DELETE /api/teams/:teamName - Delete a team
router.delete('/:teamName', async (req, res) => {
  try {
    const { teamName } = req.params;
    const safeName = teamName.replace(/[^a-zA-Z0-9_-]/g, '');
    const teamDir = path.join(TEAMS_DIR, safeName);
    const tasksDir = path.join(TASKS_DIR, safeName);

    if (!fs.existsSync(teamDir)) {
      return res.status(404).json({ error: 'Team not found' });
    }

    await fs.promises.rm(teamDir, { recursive: true, force: true });
    if (fs.existsSync(tasksDir)) {
      await fs.promises.rm(tasksDir, { recursive: true, force: true });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting team:', error);
    res.status(500).json({ error: 'Failed to delete team' });
  }
});

// POST /api/teams/:teamName/agents - Add agent to team
router.post('/:teamName/agents', async (req, res) => {
  try {
    const { teamName } = req.params;
    const safeName = teamName.replace(/[^a-zA-Z0-9_-]/g, '');
    const configPath = path.join(TEAMS_DIR, safeName, 'config.json');

    if (!fs.existsSync(configPath)) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const { name: agentName, model, prompt } = req.body;

    if (!agentName || !agentName.trim()) {
      return res.status(400).json({ error: 'Agent name is required' });
    }

    const configData = await fs.promises.readFile(configPath, 'utf8');
    const config = JSON.parse(configData);

    const safeAgentName = agentName.trim().replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();

    if (config.members.find(m => m.name === safeAgentName)) {
      return res.status(409).json({ error: 'Agent with this name already exists' });
    }

    const colors = ['blue', 'green', 'yellow', 'red', 'purple', 'orange'];
    const colorIndex = config.members.length % colors.length;

    const newAgent = {
      agentId: `${safeAgentName}@${safeName}`,
      name: safeAgentName,
      agentType: 'agent',
      model: model || 'sonnet',
      prompt: prompt || '',
      preprompt: '',
      color: colors[colorIndex],
      planModeRequired: false,
      joinedAt: Date.now(),
      tmuxPaneId: '',
      cwd: '',
      subscriptions: [],
      taskFile: ''
    };

    config.members.push(newAgent);

    // Create task file
    const taskFilePath = path.join(getTeamFolder(safeName), `${safeAgentName}.md`);
    if (!fs.existsSync(taskFilePath)) {
      await fs.promises.writeFile(taskFilePath, `# Tasks - ${safeAgentName}\n\n`, 'utf8');
    }
    newAgent.taskFile = taskFilePath.replace(/\\/g, '/');

    // Regenerate preprompts for ALL members
    await regeneratePreprompts(config, configPath);

    // Create inbox
    const inboxPath = path.join(TEAMS_DIR, safeName, 'inboxes', `${safeAgentName}.json`);
    ensureDir(path.join(TEAMS_DIR, safeName, 'inboxes'));
    await fs.promises.writeFile(inboxPath, '[]', 'utf8');

    res.json({ success: true, agent: newAgent });
  } catch (error) {
    console.error('Error adding agent:', error);
    res.status(500).json({ error: 'Failed to add agent' });
  }
});

// PUT /api/teams/:teamName/agents/:agentName - Update agent config
router.put('/:teamName/agents/:agentName', async (req, res) => {
  try {
    const { teamName, agentName } = req.params;
    const safeName = teamName.replace(/[^a-zA-Z0-9_-]/g, '');
    const configPath = path.join(TEAMS_DIR, safeName, 'config.json');

    if (!fs.existsSync(configPath)) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const configData = await fs.promises.readFile(configPath, 'utf8');
    const config = JSON.parse(configData);

    const agentIndex = config.members.findIndex(m => m.name === agentName);
    if (agentIndex === -1) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const { prompt, model, preprompt, newName } = req.body;
    if (prompt !== undefined) config.members[agentIndex].prompt = prompt;
    if (model !== undefined) config.members[agentIndex].model = model;
    if (preprompt !== undefined) config.members[agentIndex].preprompt = preprompt;

    // Handle rename
    if (newName && newName !== agentName) {
      const safeNewName = newName.trim().replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
      if (config.members.find((m, i) => i !== agentIndex && m.name === safeNewName)) {
        return res.status(409).json({ error: 'Agent with this name already exists' });
      }

      const oldName = config.members[agentIndex].name;
      config.members[agentIndex].name = safeNewName;
      config.members[agentIndex].agentId = `${safeNewName}@${safeName}`;

      // Rename inbox file
      const oldInbox = path.join(TEAMS_DIR, safeName, 'inboxes', `${oldName}.json`);
      const newInbox = path.join(TEAMS_DIR, safeName, 'inboxes', `${safeNewName}.json`);
      if (fs.existsSync(oldInbox)) {
        await fs.promises.rename(oldInbox, newInbox);
      }

      // Rename task file
      const teamFolder = getTeamFolder(safeName);
      const oldTask = path.join(teamFolder, `${oldName}.md`);
      const newTask = path.join(teamFolder, `${safeNewName}.md`);
      if (fs.existsSync(oldTask)) {
        await fs.promises.rename(oldTask, newTask);
      }
      config.members[agentIndex].taskFile = newTask.replace(/\\/g, '/');
    }

    // Regenerate preprompts for ALL members
    await regeneratePreprompts(config, configPath);
    res.json({ success: true, agent: config.members[agentIndex] });
  } catch (error) {
    console.error('Error updating agent:', error);
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

// DELETE /api/teams/:teamName/agents/:agentName - Remove agent from team
router.delete('/:teamName/agents/:agentName', async (req, res) => {
  try {
    const { teamName, agentName } = req.params;
    const safeName = teamName.replace(/[^a-zA-Z0-9_-]/g, '');
    const configPath = path.join(TEAMS_DIR, safeName, 'config.json');

    if (!fs.existsSync(configPath)) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const configData = await fs.promises.readFile(configPath, 'utf8');
    const config = JSON.parse(configData);

    const targetAgent = config.members.find(m => m.name === agentName);
    if (targetAgent && targetAgent.agentType === 'team-lead') {
      return res.status(400).json({ error: 'Cannot delete the team lead' });
    }

    config.members = config.members.filter(m => m.name !== agentName);

    // Remove inbox
    const inboxPath = path.join(TEAMS_DIR, safeName, 'inboxes', `${agentName}.json`);
    if (fs.existsSync(inboxPath)) {
      await fs.promises.unlink(inboxPath);
    }

    // Remove task file
    const taskPath = path.join(getTeamFolder(safeName), `${agentName}.md`);
    if (fs.existsSync(taskPath)) {
      await fs.promises.unlink(taskPath);
    }

    await regeneratePreprompts(config, configPath);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting agent:', error);
    res.status(500).json({ error: 'Failed to delete agent' });
  }
});

// GET /api/teams/:teamName/agents/:agentName/tasks - Get agent's task file
router.get('/:teamName/agents/:agentName/tasks', async (req, res) => {
  try {
    const { teamName, agentName } = req.params;
    const safeName = teamName.replace(/[^a-zA-Z0-9_-]/g, '');
    const configPath = path.join(TEAMS_DIR, safeName, 'config.json');

    if (!fs.existsSync(configPath)) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const configData = await fs.promises.readFile(configPath, 'utf8');
    const config = JSON.parse(configData);
    const agent = config.members.find(m => m.name === agentName);

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const taskFile = agent.taskFile || path.join(getTeamFolder(safeName), `${agentName}.md`).replace(/\\/g, '/');
    try {
      const content = await fs.promises.readFile(taskFile, 'utf8');
      res.json({ content, taskFile });
    } catch {
      res.json({ content: '', taskFile });
    }
  } catch (error) {
    console.error('Error getting agent tasks:', error);
    res.status(500).json({ error: 'Failed to get agent tasks' });
  }
});

// PUT /api/teams/:teamName/agents/:agentName/tasks - Update agent's task file
router.put('/:teamName/agents/:agentName/tasks', async (req, res) => {
  try {
    const { teamName, agentName } = req.params;
    const safeName = teamName.replace(/[^a-zA-Z0-9_-]/g, '');
    const configPath = path.join(TEAMS_DIR, safeName, 'config.json');

    if (!fs.existsSync(configPath)) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const configData = await fs.promises.readFile(configPath, 'utf8');
    const config = JSON.parse(configData);
    const agent = config.members.find(m => m.name === agentName);

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const { content } = req.body;
    const filePath = agent.taskFile || path.join(getTeamFolder(safeName), `${agentName}.md`);
    ensureDir(path.dirname(filePath));
    await fs.promises.writeFile(filePath, content || '', 'utf8');
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating agent tasks:', error);
    res.status(500).json({ error: 'Failed to update agent tasks' });
  }
});

// GET /api/teams/:teamName/human-tasks - Get human-tasks.md
router.get('/:teamName/human-tasks', async (req, res) => {
  try {
    const { teamName } = req.params;
    const safeName = teamName.replace(/[^a-zA-Z0-9_-]/g, '');
    const filePath = path.join(getTeamFolder(safeName), 'human-tasks.md');

    try {
      const content = await fs.promises.readFile(filePath, 'utf8');
      res.json({ content, filePath: filePath.replace(/\\/g, '/') });
    } catch {
      res.json({ content: '', filePath: filePath.replace(/\\/g, '/') });
    }
  } catch (error) {
    console.error('Error getting human tasks:', error);
    res.status(500).json({ error: 'Failed to get human tasks' });
  }
});

// PUT /api/teams/:teamName/human-tasks - Update human-tasks.md
router.put('/:teamName/human-tasks', async (req, res) => {
  try {
    const { teamName } = req.params;
    const safeName = teamName.replace(/[^a-zA-Z0-9_-]/g, '');
    const filePath = path.join(getTeamFolder(safeName), 'human-tasks.md');

    const { content } = req.body;
    ensureDir(path.dirname(filePath));
    await fs.promises.writeFile(filePath, content || '', 'utf8');
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating human tasks:', error);
    res.status(500).json({ error: 'Failed to update human tasks' });
  }
});

// POST /api/teams/:teamName/open-folder - Open team folder in file explorer
router.post('/:teamName/open-folder', async (req, res) => {
  try {
    const { teamName } = req.params;
    const safeName = teamName.replace(/[^a-zA-Z0-9_-]/g, '');
    const teamFolder = getTeamFolder(safeName);

    if (!fs.existsSync(teamFolder)) {
      return res.status(404).json({ error: 'Team folder not found' });
    }

    // Open folder based on platform
    const platform = process.platform;
    let cmd;
    if (platform === 'win32') {
      cmd = `explorer "${teamFolder}"`;
    } else if (platform === 'darwin') {
      cmd = `open "${teamFolder}"`;
    } else {
      cmd = `xdg-open "${teamFolder}"`;
    }

    exec(cmd, (err) => {
      if (err) {
        console.error('Error opening folder:', err);
        return res.status(500).json({ error: 'Failed to open folder' });
      }
      res.json({ success: true, path: teamFolder.replace(/\\/g, '/') });
    });
  } catch (error) {
    console.error('Error opening folder:', error);
    res.status(500).json({ error: 'Failed to open folder' });
  }
});

export default router;
