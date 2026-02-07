import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const TEAMS_DIR = path.join(CLAUDE_DIR, 'teams');
const TASKS_DIR = path.join(CLAUDE_DIR, 'tasks');

// Ensure directories exist
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// GET /api/teams - List all teams
router.get('/', authenticateToken, async (req, res) => {
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
router.get('/:teamName', authenticateToken, async (req, res) => {
  try {
    const { teamName } = req.params;
    const safeName = teamName.replace(/[^a-zA-Z0-9_-]/g, '');
    const configPath = path.join(TEAMS_DIR, safeName, 'config.json');

    if (!fs.existsSync(configPath)) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const configData = await fs.promises.readFile(configPath, 'utf8');
    const config = JSON.parse(configData);

    // Also read task files
    const tasksDir = path.join(TASKS_DIR, safeName);
    const tasks = [];
    if (fs.existsSync(tasksDir)) {
      const taskFiles = await fs.promises.readdir(tasksDir);
      for (const file of taskFiles) {
        if (file.endsWith('.json') && file !== '.lock') {
          try {
            const taskData = await fs.promises.readFile(path.join(tasksDir, file), 'utf8');
            tasks.push(JSON.parse(taskData));
          } catch {
            // Skip invalid task files
          }
        }
      }
    }

    // Read inbox files for agent status
    const inboxDir = path.join(TEAMS_DIR, safeName, 'inboxes');
    const inboxes = {};
    if (fs.existsSync(inboxDir)) {
      const inboxFiles = await fs.promises.readdir(inboxDir);
      for (const file of inboxFiles) {
        if (file.endsWith('.json')) {
          try {
            const inboxData = await fs.promises.readFile(path.join(inboxDir, file), 'utf8');
            const agentName = file.replace('.json', '');
            inboxes[agentName] = JSON.parse(inboxData);
          } catch {
            // Skip invalid inbox files
          }
        }
      }
    }

    res.json({ ...config, tasks, inboxes });
  } catch (error) {
    console.error('Error getting team:', error);
    res.status(500).json({ error: 'Failed to get team details' });
  }
});

// POST /api/teams - Create a new team
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, description, agents } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Team name is required' });
    }

    const safeName = name.trim().replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
    const teamDir = path.join(TEAMS_DIR, safeName);

    if (fs.existsSync(teamDir)) {
      return res.status(409).json({ error: 'Team already exists' });
    }

    ensureDir(teamDir);
    ensureDir(path.join(teamDir, 'inboxes'));
    ensureDir(path.join(TASKS_DIR, safeName));

    const config = {
      name: safeName,
      description: description || '',
      createdAt: Date.now(),
      leadAgentId: `team-lead@${safeName}`,
      leadSessionId: '',
      members: [
        {
          agentId: `team-lead@${safeName}`,
          name: 'team-lead',
          agentType: 'team-lead',
          model: 'claude-opus-4-6',
          joinedAt: Date.now(),
          tmuxPaneId: '',
          cwd: '',
          subscriptions: []
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
          agentType: agent.agentType || 'general-purpose',
          model: agent.model || 'sonnet',
          prompt: agent.prompt || '',
          color: colors[index % colors.length],
          planModeRequired: false,
          joinedAt: Date.now(),
          tmuxPaneId: '',
          cwd: agent.cwd || '',
          subscriptions: [],
          taskFile: agent.taskFile || ''
        });
      });
    }

    await fs.promises.writeFile(
      path.join(teamDir, 'config.json'),
      JSON.stringify(config, null, 2),
      'utf8'
    );

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
router.put('/:teamName', authenticateToken, async (req, res) => {
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

    await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
    res.json({ success: true, team: config });
  } catch (error) {
    console.error('Error updating team:', error);
    res.status(500).json({ error: 'Failed to update team' });
  }
});

// DELETE /api/teams/:teamName - Delete a team
router.delete('/:teamName', authenticateToken, async (req, res) => {
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
router.post('/:teamName/agents', authenticateToken, async (req, res) => {
  try {
    const { teamName } = req.params;
    const safeName = teamName.replace(/[^a-zA-Z0-9_-]/g, '');
    const configPath = path.join(TEAMS_DIR, safeName, 'config.json');

    if (!fs.existsSync(configPath)) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const { name: agentName, agentType, model, prompt, cwd, taskFile } = req.body;

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
      agentType: agentType || 'general-purpose',
      model: model || 'sonnet',
      prompt: prompt || '',
      color: colors[colorIndex],
      planModeRequired: false,
      joinedAt: Date.now(),
      tmuxPaneId: '',
      cwd: cwd || '',
      subscriptions: [],
      taskFile: taskFile || ''
    };

    config.members.push(newAgent);

    await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');

    // Create inbox for agent
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
router.put('/:teamName/agents/:agentName', authenticateToken, async (req, res) => {
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

    const { prompt, model, agentType, cwd, taskFile } = req.body;
    if (prompt !== undefined) config.members[agentIndex].prompt = prompt;
    if (model !== undefined) config.members[agentIndex].model = model;
    if (agentType !== undefined) config.members[agentIndex].agentType = agentType;
    if (cwd !== undefined) config.members[agentIndex].cwd = cwd;
    if (taskFile !== undefined) config.members[agentIndex].taskFile = taskFile;

    await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
    res.json({ success: true, agent: config.members[agentIndex] });
  } catch (error) {
    console.error('Error updating agent:', error);
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

// DELETE /api/teams/:teamName/agents/:agentName - Remove agent from team
router.delete('/:teamName/agents/:agentName', authenticateToken, async (req, res) => {
  try {
    const { teamName, agentName } = req.params;
    const safeName = teamName.replace(/[^a-zA-Z0-9_-]/g, '');
    const configPath = path.join(TEAMS_DIR, safeName, 'config.json');

    if (!fs.existsSync(configPath)) {
      return res.status(404).json({ error: 'Team not found' });
    }

    if (agentName === 'team-lead') {
      return res.status(400).json({ error: 'Cannot delete the team lead' });
    }

    const configData = await fs.promises.readFile(configPath, 'utf8');
    const config = JSON.parse(configData);

    config.members = config.members.filter(m => m.name !== agentName);

    await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');

    // Remove inbox
    const inboxPath = path.join(TEAMS_DIR, safeName, 'inboxes', `${agentName}.json`);
    if (fs.existsSync(inboxPath)) {
      await fs.promises.unlink(inboxPath);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting agent:', error);
    res.status(500).json({ error: 'Failed to delete agent' });
  }
});

// GET /api/teams/:teamName/agents/:agentName/tasks - Get agent's task file content
router.get('/:teamName/agents/:agentName/tasks', authenticateToken, async (req, res) => {
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

    if (!agent.taskFile) {
      return res.json({ content: '', taskFile: '' });
    }

    try {
      const content = await fs.promises.readFile(agent.taskFile, 'utf8');
      res.json({ content, taskFile: agent.taskFile });
    } catch {
      res.json({ content: '', taskFile: agent.taskFile, error: 'File not found' });
    }
  } catch (error) {
    console.error('Error getting agent tasks:', error);
    res.status(500).json({ error: 'Failed to get agent tasks' });
  }
});

// PUT /api/teams/:teamName/agents/:agentName/tasks - Update agent's task file
router.put('/:teamName/agents/:agentName/tasks', authenticateToken, async (req, res) => {
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

    const { content, taskFile } = req.body;

    // If taskFile path changed, update config
    if (taskFile && taskFile !== agent.taskFile) {
      agent.taskFile = taskFile;
      await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
    }

    const filePath = taskFile || agent.taskFile;
    if (!filePath) {
      return res.status(400).json({ error: 'No task file path configured' });
    }

    // Ensure parent directory exists
    const dir = path.dirname(filePath);
    ensureDir(dir);

    await fs.promises.writeFile(filePath, content || '', 'utf8');
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating agent tasks:', error);
    res.status(500).json({ error: 'Failed to update agent tasks' });
  }
});

export default router;
