import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Users, Plus, Trash2, Edit3, Check, ChevronDown, FileText, UserPlus, Bot, AlertTriangle, ClipboardList, FolderOpen } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { api } from '../utils/api';

// Build a tree structure from the flat members array
function buildAgentTree(members) {
  if (!members || members.length === 0) return [];
  const rootLead = members.find(m => !m.leader);
  if (!rootLead) {
    // Backward compat: if no member has leader=null, treat team-lead as root
    const fallback = members.find(m => m.agentType === 'team-lead');
    if (fallback) return [buildNode(members, fallback)];
    return [];
  }
  return [buildNode(members, rootLead)];
}

function buildNode(members, agent) {
  const children = members.filter(m => m.leader === agent.name);
  return { ...agent, children: children.map(c => buildNode(members, c)) };
}

// Get depth of an agent in the hierarchy
function getAgentDepth(members, agent) {
  let depth = 0, current = agent;
  while (current && current.leader) {
    depth++;
    current = members.find(m => m.name === current.leader);
  }
  return depth;
}

// Depth-based icon color: gold (root), silver (depth 1), bronze (depth 2+)
function getDepthColor(depth) {
  if (depth === 0) return 'text-yellow-500';
  if (depth === 1) return 'text-gray-400';
  return 'text-amber-700';
}

// Role label based on tree position
function getRoleLabel(agent) {
  if (!agent.leader) return 'Lead';
  if (agent.children && agent.children.length > 0) return 'Supervisor';
  return 'Worker';
}

function AgentTreeNode({ node, depth, selectedAgent, onSelect, onDelete }) {
  const isRoot = !node.leader;
  const role = getRoleLabel(node);
  return (
    <>
      <div
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        className={`group flex items-center gap-2 py-2 pr-3 hover:bg-accent cursor-pointer transition-colors ${selectedAgent?.name === node.name ? 'bg-accent' : ''}`}
        onClick={() => onSelect(node)}
      >
        <Bot className={`w-4 h-4 flex-shrink-0 ${getDepthColor(depth)}`} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground truncate">{node.name}</div>
          <div className="text-xs text-muted-foreground">{role} &middot; {node.model}</div>
        </div>
        {!isRoot && (
          <button onClick={(e) => { e.stopPropagation(); onDelete(node.name); }} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-all">
            <Trash2 className="w-3 h-3 text-red-500" />
          </button>
        )}
      </div>
      {node.children && node.children.map(child => (
        <AgentTreeNode
          key={child.name}
          node={child}
          depth={depth + 1}
          selectedAgent={selectedAgent}
          onSelect={onSelect}
          onDelete={onDelete}
        />
      ))}
    </>
  );
}

function TeamsPanel({ isOpen, onClose }) {
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [activeTab, setActiveTab] = useState('config');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Create team form
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDesc, setNewTeamDesc] = useState('');

  // Create agent form
  const [showCreateAgent, setShowCreateAgent] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentModel, setNewAgentModel] = useState('sonnet');
  const [newAgentPrompt, setNewAgentPrompt] = useState('');
  const [newAgentLeader, setNewAgentLeader] = useState('');

  // Edit agent
  const [editingAgent, setEditingAgent] = useState(null);
  const [editName, setEditName] = useState('');
  const [editPrompt, setEditPrompt] = useState('');
  const [editPreprompt, setEditPreprompt] = useState('');
  const [editModel, setEditModel] = useState('');
  const [editLeader, setEditLeader] = useState('');

  // Task editing
  const [agentTaskContent, setAgentTaskContent] = useState('');
  const [tasksDirty, setTasksDirty] = useState(false);

  // Human tasks editing
  const [humanTaskContent, setHumanTaskContent] = useState('');
  const [humanTaskPath, setHumanTaskPath] = useState('');
  const [humanTaskDirty, setHumanTaskDirty] = useState(false);

  const fetchTeams = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.teams.list();
      const data = await res.json();
      setTeams(data.teams || []);
    } catch {
      setError('Failed to load teams');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTeamDetails = useCallback(async (teamName) => {
    try {
      const res = await api.teams.get(teamName);
      const data = await res.json();
      setSelectedTeam(data);
      return data;
    } catch {
      setError('Failed to load team details');
      return null;
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchTeams();
    }
  }, [isOpen, fetchTeams]);

  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      fetchTeams();
      if (selectedTeam?.name) {
        fetchTeamDetails(selectedTeam.name);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [isOpen, selectedTeam?.name, fetchTeams, fetchTeamDetails]);

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return;
    try {
      setError('');
      const res = await api.teams.create({
        name: newTeamName.trim(),
        description: newTeamDesc.trim(),
      });
      const data = await res.json();
      if (data.success) {
        setShowCreateTeam(false);
        setNewTeamName('');
        setNewTeamDesc('');
        fetchTeams();
      } else {
        setError(data.error || 'Failed to create team');
      }
    } catch {
      setError('Failed to create team');
    }
  };

  const handleDeleteTeam = async (teamName) => {
    if (!confirm(`Delete team "${teamName}"? This cannot be undone.`)) return;
    try {
      const res = await api.teams.delete(teamName);
      const data = await res.json();
      if (data.success) {
        if (selectedTeam?.name === teamName) {
          setSelectedTeam(null);
          setSelectedAgent(null);
        }
        fetchTeams();
      }
    } catch {
      setError('Failed to delete team');
    }
  };

  const handleSelectTeam = async (team) => {
    setSelectedAgent(null);
    setActiveTab('config');
    await fetchTeamDetails(team.name);
  };

  const handleCreateAgent = async () => {
    if (!newAgentName.trim() || !selectedTeam) return;
    try {
      setError('');
      const res = await api.teams.addAgent(selectedTeam.name, {
        name: newAgentName.trim(),
        model: newAgentModel,
        prompt: newAgentPrompt,
        leader: newAgentLeader || undefined
      });
      const data = await res.json();
      if (data.success) {
        setShowCreateAgent(false);
        setNewAgentName('');
        setNewAgentPrompt('');
        setNewAgentLeader('');
        fetchTeamDetails(selectedTeam.name);
      } else {
        setError(data.error || 'Failed to create agent');
      }
    } catch {
      setError('Failed to create agent');
    }
  };

  const handleDeleteAgent = async (agentName) => {
    if (!selectedTeam || agentName === 'team-lead') return;
    if (!confirm(`Delete agent "${agentName}"?`)) return;
    try {
      const res = await api.teams.deleteAgent(selectedTeam.name, agentName);
      const data = await res.json();
      if (data.success) {
        if (selectedAgent?.name === agentName) {
          setSelectedAgent(null);
        }
        fetchTeamDetails(selectedTeam.name);
      }
    } catch {
      setError('Failed to delete agent');
    }
  };

  const handleEditAgent = (agent) => {
    setEditingAgent(agent.name);
    setEditName(agent.name);
    setEditPrompt(agent.prompt || '');
    setEditPreprompt(agent.preprompt || '');
    setEditModel(agent.model || 'sonnet');
    setEditLeader(agent.leader || '');
  };

  const handleSaveAgent = async () => {
    if (!selectedTeam || !editingAgent) return;
    try {
      const updateData = {
        prompt: editPrompt,
        model: editModel,
        preprompt: editPreprompt,
        leader: editLeader || null
      };
      if (editName !== editingAgent) {
        updateData.newName = editName;
      }
      const res = await api.teams.updateAgent(selectedTeam.name, editingAgent, updateData);
      const data = await res.json();
      if (data.success) {
        setEditingAgent(null);
        const teamData = await fetchTeamDetails(selectedTeam.name);
        // Update selectedAgent reference
        if (teamData && data.agent) {
          const updated = teamData.members.find(m => m.name === data.agent.name);
          if (updated) setSelectedAgent(updated);
        }
      } else {
        setError(data.error || 'Failed to update agent');
      }
    } catch {
      setError('Failed to update agent');
    }
  };

  const handleCancelEdit = () => {
    setEditingAgent(null);
  };

  const handleSelectAgent = async (agent) => {
    setSelectedAgent(agent);
    setActiveTab('config');
    setEditingAgent(null);
    setTasksDirty(false);
    setHumanTaskDirty(false);
  };

  const loadAgentTasks = async (agent) => {
    if (!selectedTeam || !agent) return;
    try {
      const res = await api.teams.getAgentTasks(selectedTeam.name, agent.name);
      const data = await res.json();
      setAgentTaskContent(data.content || '');
      setTasksDirty(false);
    } catch {
      setAgentTaskContent('');
    }
  };

  const loadHumanTasks = async () => {
    if (!selectedTeam) return;
    try {
      const res = await api.teams.getHumanTasks(selectedTeam.name);
      const data = await res.json();
      setHumanTaskContent(data.content || '');
      setHumanTaskPath(data.filePath || '');
      setHumanTaskDirty(false);
    } catch {
      setHumanTaskContent('');
    }
  };

  const handleSaveAgentTasks = async () => {
    if (!selectedTeam || !selectedAgent) return;
    try {
      await api.teams.updateAgentTasks(selectedTeam.name, selectedAgent.name, {
        content: agentTaskContent
      });
      setTasksDirty(false);
    } catch {
      setError('Failed to save tasks');
    }
  };

  const handleSaveHumanTasks = async () => {
    if (!selectedTeam) return;
    try {
      await api.teams.updateHumanTasks(selectedTeam.name, {
        content: humanTaskContent
      });
      setHumanTaskDirty(false);
    } catch {
      setError('Failed to save human tasks');
    }
  };

  const handleOpenFolder = async () => {
    if (!selectedTeam) return;
    try {
      await api.teams.openFolder(selectedTeam.name);
    } catch {
      setError('Failed to open folder');
    }
  };

  const handleTabChange = async (tab) => {
    setActiveTab(tab);
    if (tab === 'tasks' && selectedAgent) {
      await loadAgentTasks(selectedAgent);
    } else if (tab === 'human-tasks') {
      await loadHumanTasks();
    }
  };

  // Build tree from members for display
  const agentTree = useMemo(() => {
    if (!selectedTeam?.members) return [];
    return buildAgentTree(selectedTeam.members);
  }, [selectedTeam?.members]);

  if (!isOpen) return null;

  const isLead = selectedAgent && !selectedAgent.leader;

  return (
    <div className="modal-backdrop fixed inset-0 flex items-center justify-center z-[9999] md:p-4 bg-background/95">
      <div className="bg-background border border-border md:rounded-lg shadow-xl w-full md:max-w-5xl h-full md:h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 md:p-6 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
            <h2 className="text-lg md:text-xl font-semibold text-foreground">Teams</h2>
            {selectedTeam && (
              <span className="text-sm text-muted-foreground">
                / {selectedTeam.name}
                {selectedAgent && ` / ${selectedAgent.name}`}
              </span>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-4 mt-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
            <button onClick={() => setError('')} className="ml-auto text-red-500 hover:text-red-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex-1 flex overflow-hidden">
          {/* Left panel */}
          <div className="w-64 border-r border-border flex flex-col flex-shrink-0">
            {!selectedTeam ? (
              /* Team list */
              <div className="flex-1 flex flex-col">
                <div className="p-3 border-b border-border flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">Teams</span>
                  <Button variant="ghost" size="sm" onClick={() => setShowCreateTeam(true)} className="h-7 w-7 p-0">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>

                {showCreateTeam && (
                  <div className="p-3 border-b border-border space-y-2">
                    <Input placeholder="Team name" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} className="h-8 text-sm" autoFocus onKeyDown={(e) => e.key === 'Enter' && handleCreateTeam()} />
                    <Input placeholder="Description (optional)" value={newTeamDesc} onChange={(e) => setNewTeamDesc(e.target.value)} className="h-8 text-sm" />
                    <div className="flex gap-2">
                      <Button size="sm" className="h-7 text-xs flex-1" onClick={handleCreateTeam}>Create</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowCreateTeam(false)}>Cancel</Button>
                    </div>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto">
                  {loading && teams.length === 0 && (
                    <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
                  )}
                  {!loading && teams.length === 0 && (
                    <div className="p-4 text-center text-sm text-muted-foreground">No teams yet. Create one to get started.</div>
                  )}
                  {teams.map((team) => (
                    <div key={team.name} className="group flex items-center gap-2 px-3 py-2 hover:bg-accent cursor-pointer transition-colors" onClick={() => handleSelectTeam(team)}>
                      <Users className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">{team.name}</div>
                        <div className="text-xs text-muted-foreground">{team.memberCount} member{team.memberCount !== 1 ? 's' : ''}</div>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteTeam(team.name); }} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-all">
                        <Trash2 className="w-3 h-3 text-red-500" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* Agent list */
              <div className="flex-1 flex flex-col">
                <div className="p-3 border-b border-border">
                  <button onClick={() => { setSelectedTeam(null); setSelectedAgent(null); }} className="text-xs text-blue-500 hover:text-blue-700 mb-1 flex items-center gap-1">
                    <ChevronDown className="w-3 h-3 rotate-90" /> Back to teams
                  </button>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">Agents</span>
                    <Button variant="ghost" size="sm" onClick={() => setShowCreateAgent(true)} className="h-7 w-7 p-0">
                      <UserPlus className="w-4 h-4" />
                    </Button>
                  </div>
                  {selectedTeam.description && <p className="text-xs text-muted-foreground mt-1">{selectedTeam.description}</p>}
                </div>

                {showCreateAgent && (
                  <div className="p-3 border-b border-border space-y-2">
                    <Input placeholder="Agent name" value={newAgentName} onChange={(e) => setNewAgentName(e.target.value)} className="h-8 text-sm" autoFocus />
                    <select value={newAgentLeader} onChange={(e) => setNewAgentLeader(e.target.value)} className="w-full h-8 text-sm rounded-md border border-input bg-background px-2">
                      <option value="">Reports to: (default root lead)</option>
                      {(selectedTeam.members || []).map(m => (
                        <option key={m.name} value={m.name}>Reports to: {m.name}</option>
                      ))}
                    </select>
                    <select value={newAgentModel} onChange={(e) => setNewAgentModel(e.target.value)} className="w-full h-8 text-sm rounded-md border border-input bg-background px-2">
                      <option value="opus">Opus 4.6</option>
                      <option value="sonnet">Sonnet 4.5</option>
                      <option value="haiku">Haiku 4.5</option>
                    </select>
                    <textarea placeholder="Agent prompt (optional)" value={newAgentPrompt} onChange={(e) => setNewAgentPrompt(e.target.value)} className="w-full text-sm rounded-md border border-input bg-background px-2 py-1 min-h-[60px] resize-y" />
                    <div className="flex gap-2">
                      <Button size="sm" className="h-7 text-xs flex-1" onClick={handleCreateAgent}>Add Agent</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowCreateAgent(false)}>Cancel</Button>
                    </div>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto">
                  {agentTree.map(node => (
                    <AgentTreeNode
                      key={node.name}
                      node={node}
                      depth={0}
                      selectedAgent={selectedAgent}
                      onSelect={handleSelectAgent}
                      onDelete={handleDeleteAgent}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right panel */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {!selectedTeam && (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Select a team to manage its agents</p>
                </div>
              </div>
            )}

            {selectedTeam && !selectedAgent && (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Bot className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Select an agent to view details and tasks</p>
                </div>
              </div>
            )}

            {selectedTeam && selectedAgent && (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Agent header */}
                <div className="p-4 border-b border-border flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        selectedAgent.color === 'blue' ? 'bg-blue-100 dark:bg-blue-900/30' :
                        selectedAgent.color === 'green' ? 'bg-green-100 dark:bg-green-900/30' :
                        selectedAgent.color === 'yellow' ? 'bg-yellow-100 dark:bg-yellow-900/30' :
                        selectedAgent.color === 'red' ? 'bg-red-100 dark:bg-red-900/30' :
                        'bg-gray-100 dark:bg-gray-800'
                      }`}>
                        <Bot className={`w-4 h-4 ${
                          selectedAgent.color === 'blue' ? 'text-blue-600' :
                          selectedAgent.color === 'green' ? 'text-green-600' :
                          selectedAgent.color === 'yellow' ? 'text-yellow-600' :
                          selectedAgent.color === 'red' ? 'text-red-600' :
                          'text-gray-600'
                        }`} />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">{selectedAgent.name}</h3>
                        <p className="text-xs text-muted-foreground">
                          {selectedAgent.model} &middot; {selectedAgent.leader ? `reports to ${selectedAgent.leader}` : 'reports to human'}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {editingAgent === selectedAgent.name ? (
                        <>
                          <Button variant="ghost" size="sm" onClick={handleCancelEdit} className="h-8">
                            <X className="w-4 h-4 mr-1" /> Cancel
                          </Button>
                          <Button size="sm" onClick={handleSaveAgent} className="h-8">
                            <Check className="w-4 h-4 mr-1" /> Save
                          </Button>
                        </>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => handleEditAgent(selectedAgent)} className="h-8">
                          <Edit3 className="w-4 h-4 mr-1" /> Edit
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Tabs */}
                <div className="border-b border-border flex-shrink-0">
                  <div className="flex px-4">
                    <button onClick={() => handleTabChange('config')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'config' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                      Config
                    </button>
                    {isLead && (
                      <button onClick={() => handleTabChange('human-tasks')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1 ${activeTab === 'human-tasks' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                        <ClipboardList className="w-3 h-3" /> Human Tasks
                      </button>
                    )}
                    <button onClick={() => handleTabChange('tasks')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1 ${activeTab === 'tasks' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                      <FileText className="w-3 h-3" /> Tasks
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4">
                  {/* CONFIG TAB */}
                  {activeTab === 'config' && (
                    <div className="space-y-4">
                      {/* Name */}
                      <div>
                        <label className="text-sm font-medium text-foreground block mb-1">Name</label>
                        {editingAgent === selectedAgent.name ? (
                          <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-9 text-sm" />
                        ) : (
                          <div className="text-sm text-muted-foreground">{selectedAgent.name}</div>
                        )}
                      </div>

                      {/* Model */}
                      <div>
                        <label className="text-sm font-medium text-foreground block mb-1">Model</label>
                        {editingAgent === selectedAgent.name ? (
                          <select value={editModel} onChange={(e) => setEditModel(e.target.value)} className="w-full h-9 text-sm rounded-md border border-input bg-background px-2">
                            <option value="opus">Opus 4.6</option>
                            <option value="sonnet">Sonnet 4.5</option>
                            <option value="haiku">Haiku 4.5</option>
                          </select>
                        ) : (
                          <div className="text-sm text-muted-foreground">{selectedAgent.model}</div>
                        )}
                      </div>

                      {/* Leader (hierarchy) */}
                      <div>
                        <label className="text-sm font-medium text-foreground block mb-1">Reports to</label>
                        {editingAgent === selectedAgent.name ? (
                          <select value={editLeader} onChange={(e) => setEditLeader(e.target.value)} className="w-full h-9 text-sm rounded-md border border-input bg-background px-2" disabled={!selectedAgent.leader}>
                            <option value="">Human (root leader)</option>
                            {(selectedTeam.members || []).filter(m => m.name !== selectedAgent.name).map(m => (
                              <option key={m.name} value={m.name}>{m.name}</option>
                            ))}
                          </select>
                        ) : (
                          <div className="text-sm text-muted-foreground">{selectedAgent.leader || 'Human (root leader)'}</div>
                        )}
                      </div>

                      {/* Pre-prompt (auto-generated) */}
                      <div>
                        <label className="text-sm font-medium text-foreground block mb-1">
                          Pre-prompt <span className="text-xs text-muted-foreground font-normal">(auto-generated, editable)</span>
                        </label>
                        {editingAgent === selectedAgent.name ? (
                          <textarea value={editPreprompt} onChange={(e) => setEditPreprompt(e.target.value)} className="w-full text-sm rounded-md border border-input bg-background px-3 py-2 min-h-[120px] resize-y font-mono" />
                        ) : (
                          <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3 min-h-[60px] whitespace-pre-wrap font-mono">
                            {selectedAgent.preprompt || '(no preprompt)'}
                          </div>
                        )}
                      </div>

                      {/* Prompt */}
                      <div>
                        <label className="text-sm font-medium text-foreground block mb-1">Prompt</label>
                        {editingAgent === selectedAgent.name ? (
                          <textarea value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} className="w-full text-sm rounded-md border border-input bg-background px-3 py-2 min-h-[100px] resize-y" placeholder="Custom instructions for this agent..." />
                        ) : (
                          <div className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3 min-h-[40px] whitespace-pre-wrap">
                            {selectedAgent.prompt || '(no custom prompt)'}
                          </div>
                        )}
                      </div>

                      {/* Task file path */}
                      <div>
                        <label className="text-sm font-medium text-foreground block mb-1">Task File</label>
                        <div className="text-xs text-muted-foreground font-mono">{selectedAgent.taskFile || '(auto-created in ~/.claude/teams/)'}</div>
                      </div>

                      {/* Agent info */}
                      <div className="pt-4 border-t border-border">
                        <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                          <div><span className="font-medium">Color:</span> {selectedAgent.color}</div>
                          <div><span className="font-medium">Joined:</span> {new Date(selectedAgent.joinedAt).toLocaleDateString()}</div>
                          <div><span className="font-medium">ID:</span> {selectedAgent.agentId}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* HUMAN TASKS TAB (only for team-lead) */}
                  {activeTab === 'human-tasks' && isLead && (
                    <div className="flex flex-col h-full">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="text-xs text-muted-foreground truncate block">{humanTaskPath || 'human-tasks.md'}</span>
                          <span className="text-xs text-amber-600 dark:text-amber-400">Source of truth — only the human can edit this</span>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleOpenFolder}>
                            <FolderOpen className="w-3 h-3 mr-1" /> Open Folder
                          </Button>
                          <Button size="sm" className="h-7 text-xs" onClick={handleSaveHumanTasks} disabled={!humanTaskDirty}>
                            Save
                          </Button>
                        </div>
                      </div>
                      <textarea
                        value={humanTaskContent}
                        onChange={(e) => { setHumanTaskContent(e.target.value); setHumanTaskDirty(true); }}
                        className="w-full flex-1 text-sm rounded-md border border-input bg-background px-3 py-2 min-h-[300px] resize-y font-mono"
                        placeholder="Write your tasks and objectives here. The team leader will read this as the source of truth..."
                      />
                    </div>
                  )}

                  {/* TASKS TAB */}
                  {activeTab === 'tasks' && (
                    <div className="flex flex-col h-full">
                      {selectedAgent.taskFile ? (
                        <>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-muted-foreground truncate">{selectedAgent.taskFile}</span>
                            <div className="flex gap-2">
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleOpenFolder}>
                                <FolderOpen className="w-3 h-3 mr-1" /> Open Folder
                              </Button>
                              <Button size="sm" className="h-7 text-xs" onClick={handleSaveAgentTasks} disabled={!tasksDirty}>
                                Save
                              </Button>
                            </div>
                          </div>
                          <textarea
                            value={agentTaskContent}
                            onChange={(e) => { setAgentTaskContent(e.target.value); setTasksDirty(true); }}
                            className="w-full flex-1 text-sm rounded-md border border-input bg-background px-3 py-2 min-h-[300px] resize-y font-mono"
                            placeholder="Agent task notes..."
                          />
                        </>
                      ) : (
                        <div className="text-center text-sm text-muted-foreground py-8">
                          <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                          <p>No task file configured.</p>
                          <p className="text-xs mt-1">Set a project path on the team to auto-create task files.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default TeamsPanel;
