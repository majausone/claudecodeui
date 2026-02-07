import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Users, Plus, Trash2, Edit3, Check, ChevronDown, ChevronRight, Play, Square, Clock, FileText, Send, UserPlus, Bot, AlertTriangle } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { api } from '../utils/api';

function TeamsPanel({ isOpen, onClose }) {
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [activeTab, setActiveTab] = useState('teams'); // 'teams', 'agents', 'tasks'
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
  const [newAgentType, setNewAgentType] = useState('general-purpose');
  const [newAgentPrompt, setNewAgentPrompt] = useState('');
  const [newAgentTaskFile, setNewAgentTaskFile] = useState('');

  // Edit agent
  const [editingAgent, setEditingAgent] = useState(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [editModel, setEditModel] = useState('');
  const [editTaskFile, setEditTaskFile] = useState('');

  // Agent tasks
  const [agentTaskContent, setAgentTaskContent] = useState('');
  const [tasksDirty, setTasksDirty] = useState(false);

  const fetchTeams = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.teams.list();
      const data = await res.json();
      setTeams(data.teams || []);
    } catch (err) {
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
    } catch (err) {
      setError('Failed to load team details');
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchTeams();
    }
  }, [isOpen, fetchTeams]);

  // Auto-refresh teams every 5 seconds when panel is open
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
        description: newTeamDesc.trim()
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
    } catch (err) {
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
    } catch (err) {
      setError('Failed to delete team');
    }
  };

  const handleSelectTeam = async (team) => {
    setSelectedAgent(null);
    setActiveTab('agents');
    await fetchTeamDetails(team.name);
  };

  const handleCreateAgent = async () => {
    if (!newAgentName.trim() || !selectedTeam) return;
    try {
      setError('');
      const res = await api.teams.addAgent(selectedTeam.name, {
        name: newAgentName.trim(),
        model: newAgentModel,
        agentType: newAgentType,
        prompt: newAgentPrompt,
        taskFile: newAgentTaskFile
      });
      const data = await res.json();
      if (data.success) {
        setShowCreateAgent(false);
        setNewAgentName('');
        setNewAgentPrompt('');
        setNewAgentTaskFile('');
        fetchTeamDetails(selectedTeam.name);
      } else {
        setError(data.error || 'Failed to create agent');
      }
    } catch (err) {
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
    } catch (err) {
      setError('Failed to delete agent');
    }
  };

  const handleEditAgent = (agent) => {
    setEditingAgent(agent.name);
    setEditPrompt(agent.prompt || '');
    setEditModel(agent.model || 'sonnet');
    setEditTaskFile(agent.taskFile || '');
  };

  const handleSaveAgent = async () => {
    if (!selectedTeam || !editingAgent) return;
    try {
      await api.teams.updateAgent(selectedTeam.name, editingAgent, {
        prompt: editPrompt,
        model: editModel,
        taskFile: editTaskFile
      });
      setEditingAgent(null);
      fetchTeamDetails(selectedTeam.name);
    } catch (err) {
      setError('Failed to update agent');
    }
  };

  const handleSelectAgent = async (agent) => {
    setSelectedAgent(agent);
    setActiveTab('tasks');
    // Load task file content
    if (agent.taskFile) {
      try {
        const res = await api.teams.getAgentTasks(selectedTeam.name, agent.name);
        const data = await res.json();
        setAgentTaskContent(data.content || '');
        setTasksDirty(false);
      } catch {
        setAgentTaskContent('');
      }
    } else {
      setAgentTaskContent('');
    }
  };

  const handleSaveAgentTasks = async () => {
    if (!selectedTeam || !selectedAgent) return;
    try {
      await api.teams.updateAgentTasks(selectedTeam.name, selectedAgent.name, {
        content: agentTaskContent,
        taskFile: selectedAgent.taskFile
      });
      setTasksDirty(false);
    } catch (err) {
      setError('Failed to save tasks');
    }
  };

  const getAgentStatusColor = (agent) => {
    if (agent.agentType === 'team-lead') return 'text-amber-500';
    return 'text-gray-400';
  };

  const getAgentStatusLabel = (agent) => {
    if (agent.agentType === 'team-lead') return 'Lead';
    return 'Agent';
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop fixed inset-0 flex items-center justify-center z-[9999] md:p-4 bg-background/95">
      <div className="bg-background border border-border md:rounded-lg shadow-xl w-full md:max-w-5xl h-full md:h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 md:p-6 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
            <h2 className="text-lg md:text-xl font-semibold text-foreground">
              Teams
            </h2>
            {selectedTeam && (
              <span className="text-sm text-muted-foreground">
                / {selectedTeam.name}
                {selectedAgent && ` / ${selectedAgent.name}`}
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground touch-manipulation"
          >
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
          {/* Left panel - Team list or Agent list */}
          <div className="w-64 border-r border-border flex flex-col flex-shrink-0">
            {!selectedTeam ? (
              // Team list view
              <div className="flex-1 flex flex-col">
                <div className="p-3 border-b border-border flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">Teams</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCreateTeam(true)}
                    className="h-7 w-7 p-0"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>

                {showCreateTeam && (
                  <div className="p-3 border-b border-border space-y-2">
                    <Input
                      placeholder="Team name"
                      value={newTeamName}
                      onChange={(e) => setNewTeamName(e.target.value)}
                      className="h-8 text-sm"
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && handleCreateTeam()}
                    />
                    <Input
                      placeholder="Description (optional)"
                      value={newTeamDesc}
                      onChange={(e) => setNewTeamDesc(e.target.value)}
                      className="h-8 text-sm"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" className="h-7 text-xs flex-1" onClick={handleCreateTeam}>
                        Create
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowCreateTeam(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto">
                  {loading && teams.length === 0 && (
                    <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
                  )}
                  {!loading && teams.length === 0 && (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      No teams yet. Create one to get started.
                    </div>
                  )}
                  {teams.map((team) => (
                    <div
                      key={team.name}
                      className="group flex items-center gap-2 px-3 py-2 hover:bg-accent cursor-pointer transition-colors"
                      onClick={() => handleSelectTeam(team)}
                    >
                      <Users className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">{team.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {team.memberCount} member{team.memberCount !== 1 ? 's' : ''}
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteTeam(team.name); }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-all"
                      >
                        <Trash2 className="w-3 h-3 text-red-500" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              // Agent list view (inside a team)
              <div className="flex-1 flex flex-col">
                <div className="p-3 border-b border-border">
                  <button
                    onClick={() => { setSelectedTeam(null); setSelectedAgent(null); setActiveTab('teams'); }}
                    className="text-xs text-blue-500 hover:text-blue-700 mb-1 flex items-center gap-1"
                  >
                    <ChevronDown className="w-3 h-3 rotate-90" /> Back to teams
                  </button>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">Agents</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowCreateAgent(true)}
                      className="h-7 w-7 p-0"
                    >
                      <UserPlus className="w-4 h-4" />
                    </Button>
                  </div>
                  {selectedTeam.description && (
                    <p className="text-xs text-muted-foreground mt-1">{selectedTeam.description}</p>
                  )}
                </div>

                {showCreateAgent && (
                  <div className="p-3 border-b border-border space-y-2">
                    <Input
                      placeholder="Agent name"
                      value={newAgentName}
                      onChange={(e) => setNewAgentName(e.target.value)}
                      className="h-8 text-sm"
                      autoFocus
                    />
                    <select
                      value={newAgentModel}
                      onChange={(e) => setNewAgentModel(e.target.value)}
                      className="w-full h-8 text-sm rounded-md border border-input bg-background px-2"
                    >
                      <option value="opus">Opus 4.6</option>
                      <option value="sonnet">Sonnet 4.5</option>
                      <option value="haiku">Haiku 4.5</option>
                    </select>
                    <select
                      value={newAgentType}
                      onChange={(e) => setNewAgentType(e.target.value)}
                      className="w-full h-8 text-sm rounded-md border border-input bg-background px-2"
                    >
                      <option value="general-purpose">General Purpose</option>
                      <option value="Bash">Bash Specialist</option>
                      <option value="Explore">Explorer</option>
                      <option value="Plan">Planner</option>
                    </select>
                    <textarea
                      placeholder="Agent prompt / instructions"
                      value={newAgentPrompt}
                      onChange={(e) => setNewAgentPrompt(e.target.value)}
                      className="w-full text-sm rounded-md border border-input bg-background px-2 py-1 min-h-[60px] resize-y"
                    />
                    <Input
                      placeholder="Task file path (optional)"
                      value={newAgentTaskFile}
                      onChange={(e) => setNewAgentTaskFile(e.target.value)}
                      className="h-8 text-sm"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" className="h-7 text-xs flex-1" onClick={handleCreateAgent}>
                        Add Agent
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowCreateAgent(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto">
                  {(selectedTeam.members || []).map((agent) => (
                    <div
                      key={agent.name}
                      className={`group flex items-center gap-2 px-3 py-2 hover:bg-accent cursor-pointer transition-colors ${
                        selectedAgent?.name === agent.name ? 'bg-accent' : ''
                      }`}
                      onClick={() => handleSelectAgent(agent)}
                    >
                      <Bot className={`w-4 h-4 flex-shrink-0 ${getAgentStatusColor(agent)}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">{agent.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {getAgentStatusLabel(agent)} · {agent.model || 'sonnet'}
                        </div>
                      </div>
                      {agent.name !== 'team-lead' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteAgent(agent.name); }}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-all"
                        >
                          <Trash2 className="w-3 h-3 text-red-500" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right panel - Agent details / Tasks */}
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
                          {selectedAgent.agentType} · {selectedAgent.model}
                        </p>
                      </div>
                    </div>
                    {selectedAgent.name !== 'team-lead' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => editingAgent === selectedAgent.name ? handleSaveAgent() : handleEditAgent(selectedAgent)}
                        className="h-8"
                      >
                        {editingAgent === selectedAgent.name ? (
                          <><Check className="w-4 h-4 mr-1" /> Save</>
                        ) : (
                          <><Edit3 className="w-4 h-4 mr-1" /> Edit</>
                        )}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Tabs */}
                <div className="border-b border-border flex-shrink-0">
                  <div className="flex px-4">
                    <button
                      onClick={() => setActiveTab('agents')}
                      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === 'agents'
                          ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                          : 'border-transparent text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Config
                    </button>
                    <button
                      onClick={() => { setActiveTab('tasks'); handleSelectAgent(selectedAgent); }}
                      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === 'tasks'
                          ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                          : 'border-transparent text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <FileText className="w-3 h-3 inline mr-1" />
                      Tasks
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4">
                  {activeTab === 'agents' && (
                    <div className="space-y-4">
                      {/* Prompt */}
                      <div>
                        <label className="text-sm font-medium text-foreground block mb-1">Prompt / Instructions</label>
                        {editingAgent === selectedAgent.name ? (
                          <textarea
                            value={editPrompt}
                            onChange={(e) => setEditPrompt(e.target.value)}
                            className="w-full text-sm rounded-md border border-input bg-background px-3 py-2 min-h-[150px] resize-y"
                          />
                        ) : (
                          <div className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3 min-h-[60px] whitespace-pre-wrap">
                            {selectedAgent.prompt || '(no prompt configured)'}
                          </div>
                        )}
                      </div>

                      {/* Model */}
                      <div>
                        <label className="text-sm font-medium text-foreground block mb-1">Model</label>
                        {editingAgent === selectedAgent.name ? (
                          <select
                            value={editModel}
                            onChange={(e) => setEditModel(e.target.value)}
                            className="w-full h-9 text-sm rounded-md border border-input bg-background px-2"
                          >
                            <option value="opus">Opus 4.6</option>
                            <option value="sonnet">Sonnet 4.5</option>
                            <option value="haiku">Haiku 4.5</option>
                          </select>
                        ) : (
                          <div className="text-sm text-muted-foreground">{selectedAgent.model}</div>
                        )}
                      </div>

                      {/* Task File */}
                      <div>
                        <label className="text-sm font-medium text-foreground block mb-1">Task File Path</label>
                        {editingAgent === selectedAgent.name ? (
                          <Input
                            value={editTaskFile}
                            onChange={(e) => setEditTaskFile(e.target.value)}
                            placeholder="/path/to/tasks.md"
                            className="h-9 text-sm"
                          />
                        ) : (
                          <div className="text-sm text-muted-foreground">
                            {selectedAgent.taskFile || '(none)'}
                          </div>
                        )}
                      </div>

                      {/* Agent Info */}
                      <div className="pt-4 border-t border-border">
                        <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                          <div>
                            <span className="font-medium">Type:</span> {selectedAgent.agentType}
                          </div>
                          <div>
                            <span className="font-medium">Color:</span> {selectedAgent.color}
                          </div>
                          <div>
                            <span className="font-medium">Joined:</span> {new Date(selectedAgent.joinedAt).toLocaleDateString()}
                          </div>
                          <div>
                            <span className="font-medium">ID:</span> {selectedAgent.agentId}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'tasks' && (
                    <div className="flex flex-col h-full">
                      {selectedAgent.taskFile ? (
                        <>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-muted-foreground truncate">
                              {selectedAgent.taskFile}
                            </span>
                            <Button
                              size="sm"
                              className="h-7 text-xs"
                              onClick={handleSaveAgentTasks}
                              disabled={!tasksDirty}
                            >
                              Save
                            </Button>
                          </div>
                          <textarea
                            value={agentTaskContent}
                            onChange={(e) => { setAgentTaskContent(e.target.value); setTasksDirty(true); }}
                            className="w-full flex-1 text-sm rounded-md border border-input bg-background px-3 py-2 min-h-[300px] resize-y font-mono"
                            placeholder="Write tasks for this agent..."
                          />
                        </>
                      ) : (
                        <div className="text-center text-sm text-muted-foreground py-8">
                          <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                          <p>No task file configured for this agent.</p>
                          <p className="text-xs mt-1">Edit the agent config to set a task file path.</p>
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
