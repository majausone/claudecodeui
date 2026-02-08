import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { Users, Bot, X } from 'lucide-react';
import { api } from '../utils/api';

function AgentSelector({ selectedAgent, onSelectAgent }) {
  const [isOpen, setIsOpen] = useState(false);
  const [teams, setTeams] = useState([]);
  const buttonRef = useRef(null);
  const dropdownRef = useRef(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  const fetchTeams = useCallback(async () => {
    try {
      const res = await api.teams.list();
      const data = await res.json();
      setTeams(data.teams || []);
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    fetchTeams();
    const interval = setInterval(fetchTeams, 10000);
    return () => clearInterval(interval);
  }, [fetchTeams]);

  // Position dropdown above the button
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.top - 8, // 8px gap above button
        left: rect.left
      });
    }
  }, [isOpen]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (
        buttonRef.current && !buttonRef.current.contains(e.target) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Get all team-leads from all teams
  const teamLeads = teams.flatMap(team =>
    (team.members || [])
      .filter(m => m.agentType === 'team-lead')
      .map(m => ({ ...m, teamName: team.name, teamDescription: team.description }))
  );

  if (teamLeads.length === 0) return null;

  return (
    <>
      <div className="relative" ref={buttonRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`p-2 rounded-lg transition-colors ${
            selectedAgent
              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 hover:bg-blue-200 dark:hover:bg-blue-900/50'
              : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500'
          }`}
          title={selectedAgent ? `Talking to: ${selectedAgent.teamName} team lead` : 'Select a team agent'}
        >
          <Users className="w-5 h-5" />
        </button>

        {/* Selected agent indicator */}
        {selectedAgent && (
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full border-2 border-white dark:border-gray-800" />
        )}
      </div>

      {/* Portal dropdown - rendered outside overflow-hidden containers */}
      {isOpen && ReactDOM.createPortal(
        <div
          ref={dropdownRef}
          className="fixed w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl overflow-hidden"
          style={{
            top: dropdownPos.top,
            left: dropdownPos.left,
            transform: 'translateY(-100%)',
            zIndex: 99999
          }}
        >
          <div className="p-2 border-b border-gray-100 dark:border-gray-700">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Team Leads</span>
          </div>

          {/* Option to deselect */}
          {selectedAgent && (
            <button
              onClick={() => { onSelectAgent(null); setIsOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-500 transition-colors"
            >
              <X className="w-4 h-4" />
              <span>No agent (direct chat)</span>
            </button>
          )}

          {teamLeads.map((lead) => (
            <button
              key={`${lead.teamName}-${lead.name}`}
              onClick={() => { onSelectAgent(lead); setIsOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                selectedAgent?.teamName === lead.teamName
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                  : 'text-gray-700 dark:text-gray-300'
              }`}
            >
              <Bot className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <div className="flex-1 text-left min-w-0">
                <div className="font-medium truncate">{lead.teamName}</div>
                {lead.teamDescription && (
                  <div className="text-xs text-gray-400 truncate">{lead.teamDescription}</div>
                )}
              </div>
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

export default AgentSelector;
