import React, { createContext, useContext, useState, useEffect } from 'react';

const AIContext = createContext(null);

export function AIProvider({ children }) {
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem('repairshop:ai_messages');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [inputDraft, setInputDraft] = useState(() => {
    return localStorage.getItem('repairshop:ai_draft') || '';
  });

  const [diagnosisSymptoms, setDiagnosisSymptoms] = useState('');

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem('repairshop:ai_messages', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem('repairshop:ai_draft', inputDraft);
  }, [inputDraft]);

  const clearHistory = () => {
    setMessages([]);
    localStorage.removeItem('repairshop:ai_messages');
  };

  return (
    <AIContext.Provider value={{ 
      messages, setMessages, 
      inputDraft, setInputDraft,
      diagnosisSymptoms, setDiagnosisSymptoms,
      clearHistory
    }}>
      {children}
    </AIContext.Provider>
  );
}

export const useAI = () => useContext(AIContext);
